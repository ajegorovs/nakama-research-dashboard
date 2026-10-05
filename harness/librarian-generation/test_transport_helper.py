#!/usr/bin/env python3
"""Guard tests for the transport helper — local mocked HTTP, no real network, no generation.

Run with the interpreter of the installed ``hermes`` executable::

    "$(dirname "$(realpath "$(command -v hermes)")")/python3" \
        -m unittest harness.librarian-generation.test_transport_helper -v

Every endpoint here is a loopback mock reached **only** through the explicit ``allow_loopback=True``
self-test option. The tests exercise the guards themselves: redirects refused, decompressed size cap,
finite timeout, secret-safe errors, pinned-runtime verification, the fail-closed generation gate, the
sanitized capability output, and the authorized generate path (mocked POST, loopback only). No model is
invoked and no provider is contacted.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import transport_helper as th  # noqa: E402


class _MockHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - mirrors BaseHTTPRequestHandler.log_message
        return

    def _send(self, code: int, body: bytes = b"", headers: dict | None = None) -> None:
        self.send_response(code)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/zen/go/v1/models", "/models"):
            body = json.dumps({"data": [{"id": "model-a"}, {"id": th.MODEL}]}).encode()
            self._send(200, body, {"Content-Type": "application/json"})
        elif self.path == "/redirect":
            self._send(302, b"", {"Location": "https://example.invalid/evil"})
        elif self.path == "/big":
            self._send(200, b"x" * (th.RESPONSE_BYTES_MAX + 1024))
        elif self.path == "/slow":
            time.sleep(3)
            self._send(200, b"{}")
        else:
            self._send(404, b"{}")

    def do_POST(self):
        if self.path in ("/zen/go/v1/chat/completions", "/chat/completions"):
            completion = '{\n  "outcome": "insufficient_evidence"\n}\n'
            body = json.dumps(
                {"choices": [{"message": {"content": completion}}], "model": th.MODEL}
            ).encode()
            self._send(200, body, {"Content-Type": "application/json"})
        else:
            self._send(404, b"{}")


class MockServer:
    def __enter__(self):
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _MockHandler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_exc):
        self.httpd.shutdown()
        self.httpd.server_close()

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}"


def _manifest() -> dict:
    with open(th.MANIFEST_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _valid_record(token: str = "tok") -> dict:
    manifest = _manifest()
    return {
        "authorized": True,
        "artifacts": {
            key: manifest["artifacts"][key]["digest"] for key in ("corpus", "rubric", "promptTemplate")
        },
        "capabilityDispositions": {
            "promptTokenCounting": "unavailable_byte_cap_only",
            "seedControl": "unverified_owner_accepted",
        },
        "captureBasename": "librarian-semantic-eval-offline",
        "implementationRevision": th._current_revision(),
        "manifestDigest": th._sha256_file(th.MANIFEST_PATH),
        "model": th.MODEL,
        "scope": {"calls": th.AUTHORIZED_CALL_SCOPE, "endpoint": th.BASE_URL, "model": th.MODEL},
        "thirdPartyEgress": {
            "approved": True,
            # Bound to the frozen corpus artifact digest, never an arbitrary 64-hex value.
            "artifactDigest": manifest["artifacts"]["corpus"]["digest"],
            "baseUrl": th.BASE_URL,
            "calls": th.AUTHORIZED_CALL_SCOPE,
            "model": th.MODEL,
            "origin": th.ORIGIN,
            "syntheticOnly": True,
        },
        "token": token,
    }


class GuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = MockServer().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.server.__exit__()

    def test_redirect_is_refused(self):
        with self.assertRaises(th.TransportError) as ctx:
            th.guarded_get(f"{self.server.base}/redirect", {}, allow_loopback=True)
        self.assertEqual(ctx.exception.code, "redirect_refused")

    def test_response_size_cap_is_enforced_on_decompressed_bytes(self):
        with self.assertRaises(th.TransportError) as ctx:
            th.guarded_get(f"{self.server.base}/big", {}, max_bytes=th.RESPONSE_BYTES_MAX, allow_loopback=True)
        self.assertEqual(ctx.exception.code, "response_too_large")

    def test_timeout_is_finite_and_maps_to_a_fixed_code(self):
        with self.assertRaises(th.TransportError) as ctx:
            th.guarded_get(f"{self.server.base}/slow", {}, timeout=0.3, allow_loopback=True)
        self.assertIn(ctx.exception.code, {"transport_timeout", "transport_error"})

    def test_small_response_succeeds(self):
        status, body = th.guarded_get(f"{self.server.base}/zen/go/v1/models", {}, allow_loopback=True)
        self.assertEqual(status, 200)
        self.assertIn(b"model-a", body)

    def test_endpoint_allowlist_rejects_non_pinned_non_loopback(self):
        with self.assertRaises(th.TransportError) as ctx:
            th.assert_url_allowlisted("https://evil.example.com/zen/go/v1/chat/completions")
        self.assertEqual(ctx.exception.code, "endpoint_not_allowlisted")

    def test_loopback_is_refused_by_default_and_only_allowed_under_self_test(self):
        # Production callers (no allow_loopback) cannot reach a loopback endpoint...
        with self.assertRaises(th.TransportError) as ctx:
            th.assert_url_allowlisted(f"{self.server.base}/zen/go/v1/models")
        self.assertEqual(ctx.exception.code, "endpoint_not_allowlisted")
        # ...and the GET guard refuses it too, without the explicit self-test option.
        with self.assertRaises(th.TransportError) as ctx2:
            th.guarded_get(f"{self.server.base}/zen/go/v1/models", {})
        self.assertEqual(ctx2.exception.code, "endpoint_not_allowlisted")
        # ...but the explicit self-test option admits loopback only.
        th.assert_url_allowlisted(f"{self.server.base}/zen/go/v1/models", allow_loopback=True)

    def test_error_codes_are_secret_free(self):
        try:
            th.guarded_get(
                f"{self.server.base}/slow",
                {"Authorization": "Bearer SUPER-SECRET-KEY"},
                timeout=0.3,
                allow_loopback=True,
            )
        except th.TransportError as exc:
            self.assertNotIn("SUPER-SECRET-KEY", str(exc))
            self.assertNotIn("127.0.0.1", str(exc))
            self.assertEqual(exc.code, exc.code.split(" ")[0])


class RuntimeAndOutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = MockServer().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.server.__exit__()

    def test_resolver_mismatch_is_refused_so_a_default_cannot_redirect(self):
        def bad_resolver(**_kwargs):
            return {"provider": "openrouter", "base_url": "https://openrouter.ai/api/v1", "api_key": "k"}

        with self.assertRaises(th.TransportError) as ctx:
            th.resolve_pinned_runtime(resolver=bad_resolver)
        self.assertEqual(ctx.exception.code, "runtime_mismatch")

    def test_missing_credential_is_refused(self):
        def no_key(**_kwargs):
            return {"provider": th.PROVIDER, "base_url": th.BASE_URL, "api_key": ""}

        with self.assertRaises(th.TransportError) as ctx:
            th.resolve_pinned_runtime(resolver=no_key)
        self.assertEqual(ctx.exception.code, "credential_missing")

    def test_pinned_runtime_resolves_and_key_is_never_echoed(self):
        runtime = th.resolve_pinned_runtime()
        self.assertEqual(runtime["provider"], th.PROVIDER)
        self.assertEqual(runtime["base_url"], th.BASE_URL)
        report = th.preflight(runtime, do_models=False)
        text = json.dumps(report, sort_keys=True)
        self.assertNotIn(runtime["api_key"], text)
        self.assertNotIn("Authorization", text)
        self.assertFalse(report["generationAuthorized"])

    def test_capability_models_output_is_sanitized(self):
        runtime = {"api_key": "SECRET-VALUE", "api_mode": "chat_completions", "base_url": th.BASE_URL, "provider": th.PROVIDER}
        result = th.capability_models(runtime, base_url=self.server.base, allow_loopback=True)
        text = json.dumps(result, sort_keys=True)
        self.assertNotIn("SECRET-VALUE", text)
        self.assertIn("model-a", result["modelIdsListed"])
        self.assertIn(th.MODEL, result["modelIdsListed"])
        # Only model ids and support flags — no provider envelope, no account data.
        self.assertNotIn("openrouter", text.lower())
        self.assertTrue(result["modelObservedInList"])

    def test_generation_refuses_without_authorization(self):
        rc = th.main(["--mode", "generate"])
        self.assertEqual(rc, 3)

    def test_build_headers_carries_the_affinity_header(self):
        headers = th.build_headers("k")
        self.assertEqual(headers["x-opencode-session"], th.RUN_AFFINITY)
        self.assertNotIn("k", json.dumps({k: v for k, v in headers.items() if k != "Authorization"}))

    def test_self_test_runtime_injection_is_refused_without_the_flag(self):
        rc = th.main(["--mode", "preflight", "--self-test-runtime", json.dumps({"provider": "x"})])
        self.assertEqual(rc, 2)


class GenerationGateTests(unittest.TestCase):
    def test_absent_everything_refuses(self):
        ok, reason = th.generation_authorized(None, env={})
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_flag_absent")

    def test_flag_without_token_refuses(self):
        ok, reason = th.generation_authorized(None, env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1"})
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_token_absent")

    def test_flag_and_token_without_record_refuses(self):
        ok, reason = th.generation_authorized(
            None, env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"}
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_record_absent")

    def test_token_mismatch_refuses(self):
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(_valid_record("other"), handle)
            path = handle.name
        try:
            ok, reason = th.generation_authorized(
                path, env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"}
            )
            self.assertFalse(ok)
            self.assertEqual(reason, "authorization_token_mismatch")
        finally:
            os.unlink(path)

    def test_manifest_digest_mismatch_refuses(self):
        import tempfile

        record = _valid_record()
        record["manifestDigest"] = "0" * 64
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(record, handle)
            path = handle.name
        try:
            ok, reason = th.generation_authorized(
                path, env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"}
            )
            self.assertFalse(ok)
            self.assertEqual(reason, "authorization_manifest_mismatch")
        finally:
            os.unlink(path)

    def test_fully_matching_record_authorizes(self):
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(_valid_record("tok"), handle)
            path = handle.name
        try:
            ok, reason = th.generation_authorized(
                path, env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"}
            )
            self.assertTrue(ok)
            self.assertEqual(reason, "authorized")
        finally:
            os.unlink(path)

    def _authorized_with(self, mutate) -> str:
        import tempfile

        record = _valid_record("tok")
        mutate(record)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(record, handle)
            return handle.name

    def _run_gate(self, path) -> tuple[bool, str]:
        try:
            return th.generation_authorized(
                path, env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"}
            )
        finally:
            os.unlink(path)

    def test_missing_capability_disposition_refuses(self):
        path = self._authorized_with(lambda r: r.pop("capabilityDispositions"))
        ok, reason = self._run_gate(path)
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_dispositions_absent")

    def test_partial_capability_disposition_refuses(self):
        path = self._authorized_with(lambda r: r.__setitem__("capabilityDispositions", {"seedControl": "unverified_owner_accepted"}))
        ok, reason = self._run_gate(path)
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_dispositions_absent")

    def test_verified_claim_without_proof_refuses(self):
        path = self._authorized_with(
            lambda r: r.__setitem__("capabilityDispositions", {"seedControl": {"status": "verified"}, "promptTokenCounting": "unavailable_byte_cap_only"})
        )
        ok, reason = self._run_gate(path)
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_disposition_unverifiable")

    def test_missing_or_bad_third_party_egress_refuses(self):
        cases = [
            (lambda r: r.pop("thirdPartyEgress"), "authorization_third_party_egress_absent"),
            (lambda r: r["thirdPartyEgress"].__setitem__("approved", False), "authorization_third_party_egress_not_approved"),
            (lambda r: r["thirdPartyEgress"].__setitem__("syntheticOnly", False), "authorization_third_party_egress_not_synthetic_only"),
            (lambda r: r["thirdPartyEgress"].__setitem__("baseUrl", "https://evil.example.com"), "authorization_third_party_egress_mismatch"),
            (lambda r: r["thirdPartyEgress"].__setitem__("calls", 33), "authorization_third_party_egress_mismatch"),
            (lambda r: r["thirdPartyEgress"].__setitem__("artifactDigest", "nothex"), "authorization_third_party_egress_artifact_digest_invalid"),
            (lambda r: r["thirdPartyEgress"].__setitem__("artifactDigest", "a" * 64), "authorization_third_party_egress_mismatch"),
            (lambda r: r["thirdPartyEgress"].__setitem__("token", "secret"), "authorization_third_party_egress_credential_field_present"),
        ]
        for mutate, expected in cases:
            path = self._authorized_with(mutate)
            ok, reason = self._run_gate(path)
            self.assertFalse(ok, msg=expected)
            self.assertEqual(reason, expected)

    def test_unresolvable_revision_fails_closed(self):
        from unittest import mock

        path = self._authorized_with(lambda r: None)
        with mock.patch.object(th, "_current_revision", return_value=None):
            ok, reason = self._run_gate(path)
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_revision_unavailable")

    def test_revision_mismatch_refuses(self):
        path = self._authorized_with(lambda r: r.__setitem__("implementationRevision", "deadbeef"))
        ok, reason = self._run_gate(path)
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_revision_mismatch")

    # ---- Verified capability proof binding (fail-closed) ------------------------------------------

    def _proof_dir_with(self, mutate_proof=None, mutate_disposition=None):
        import tempfile

        proof_dir = tempfile.mkdtemp(prefix="librarian-proof-")
        evidence_path = "seed-evidence.json"
        with open(os.path.join(proof_dir, evidence_path), "w", encoding="utf-8") as handle:
            json.dump({"capability": "seedControl", "note": "synthetic"}, handle)
        manifest = _manifest()
        proof = {
            "schema": th.CAPABILITY_PROOF_SCHEMA,
            "capability": "seedControl",
            "status": "verified",
            "provider": manifest["identity"]["provider"],
            "endpoint": manifest["identity"]["baseUrl"],
            "model": manifest["identity"]["model"],
            "timestamp": "2026-10-05T00:00:00.000Z",
            "evidencePath": evidence_path,
            "evidenceSha256": th._sha256_file(os.path.join(proof_dir, evidence_path)),
        }
        if mutate_proof:
            mutate_proof(proof, proof_dir)
        proof_path = "seed-proof.json"
        with open(os.path.join(proof_dir, proof_path), "w", encoding="utf-8") as handle:
            json.dump(proof, handle)
        disposition = {
            "status": "verified",
            "artifactDigest": manifest["artifacts"]["corpus"]["digest"],
            "proofDigest": th._sha256_file(os.path.join(proof_dir, proof_path)),
            "proofPath": proof_path,
        }
        if mutate_disposition:
            mutate_disposition(disposition)
        return proof_dir, disposition

    def _gate_with_proof(self, disposition, proof_dir):
        import tempfile

        record = _valid_record("tok")
        record["capabilityDispositions"] = {
            "promptTokenCounting": "unavailable_byte_cap_only",
            "seedControl": disposition,
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(record, handle)
            path = handle.name
        try:
            return th.generation_authorized(
                path,
                env={"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"},
                proof_dir=proof_dir,
            )
        finally:
            os.unlink(path)

    def _run_proof(self, mutate_proof=None, mutate_disposition=None):
        import shutil

        proof_dir, disposition = self._proof_dir_with(mutate_proof, mutate_disposition)
        try:
            return self._gate_with_proof(disposition, proof_dir)
        finally:
            shutil.rmtree(proof_dir, ignore_errors=True)

    def test_verified_claim_refuses_without_a_genuine_proof(self):
        _, disposition = self._proof_dir_with()
        # The default proof directory holds no proof: the verified route refuses rather than trusting sha.
        ok, reason = self._gate_with_proof(disposition, th.DEFAULT_PROOF_DIR)
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_missing")

    def test_proof_path_traversal_is_refused(self):
        ok, reason = self._run_proof(mutate_disposition=lambda d: d.__setitem__("proofPath", "../../etc/passwd"))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_path_refused")

    def test_absolute_proof_path_is_refused(self):
        ok, reason = self._run_proof(mutate_disposition=lambda d: d.__setitem__("proofPath", "/etc/passwd"))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_path_refused")

    def test_symlinked_proof_file_is_refused(self):
        import shutil

        proof_dir, disposition = self._proof_dir_with()
        try:
            outside = os.path.join(proof_dir, "..", "outside-proof.json")
            with open(outside, "w", encoding="utf-8") as handle:
                json.dump({"note": "outside"}, handle)
            os.symlink(outside, os.path.join(proof_dir, "link.json"))
            disposition["proofPath"] = "link.json"
            ok, reason = self._gate_with_proof(disposition, proof_dir)
            self.assertFalse(ok)
            self.assertEqual(reason, "authorization_capability_proof_path_refused")
        finally:
            shutil.rmtree(proof_dir, ignore_errors=True)

    def test_proof_bound_to_a_different_model_is_refused(self):
        ok, reason = self._run_proof(mutate_proof=lambda p, _d: p.__setitem__("model", "some-other-model"))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_mismatch")

    def test_proof_bound_to_a_different_endpoint_is_refused(self):
        ok, reason = self._run_proof(mutate_proof=lambda p, _d: p.__setitem__("endpoint", "https://evil.example.com"))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_mismatch")

    def test_proof_for_a_different_capability_is_refused(self):
        ok, reason = self._run_proof(mutate_proof=lambda p, _d: p.__setitem__("capability", "promptTokenCounting"))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_mismatch")

    def test_malformed_proof_is_refused(self):
        ok, reason = self._run_proof(mutate_proof=lambda p, _d: p.__setitem__("schema", "not-a-proof"))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_malformed")

    def test_proof_digest_mismatch_is_refused(self):
        ok, reason = self._run_proof(mutate_disposition=lambda d: d.__setitem__("proofDigest", "c" * 64))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_digest_mismatch")

    def test_unbound_artifact_digest_is_refused(self):
        ok, reason = self._run_proof(mutate_disposition=lambda d: d.__setitem__("artifactDigest", "b" * 64))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_mismatch")

    def test_evidence_sha_mismatch_is_refused(self):
        ok, reason = self._run_proof(mutate_proof=lambda p, _d: p.__setitem__("evidenceSha256", "0" * 64))
        self.assertFalse(ok)
        self.assertEqual(reason, "authorization_capability_proof_evidence_mismatch")

    def test_genuine_proof_authorizes(self):
        ok, reason = self._run_proof()
        self.assertTrue(ok)
        self.assertEqual(reason, "authorized")


class GeneratePathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = MockServer().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.server.__exit__()

    def test_run_generate_returns_lossless_capture_and_no_secret(self):
        runtime = {"api_key": "SECRET-VALUE", "api_mode": "chat_completions", "base_url": th.BASE_URL, "provider": th.PROVIDER}
        capture = th.run_generate(
            runtime,
            {"model": th.MODEL, "seed": 101, "system": "sys", "user": "usr"},
            base_url=self.server.base,
            allow_loopback=True,
        )
        raw = th.base64.b64decode(capture["completionBase64"])
        self.assertEqual(capture["completionSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(capture["completionBytes"], len(raw))
        self.assertIn(b"insufficient_evidence", raw)
        text = json.dumps(capture, sort_keys=True)
        self.assertNotIn("SECRET-VALUE", text)
        # No provider envelope, headers or account metadata are echoed.
        self.assertNotIn("choices", text)
        self.assertNotIn("Authorization", text)

    def test_decode_envelope_returns_content_and_classifies_the_reported_model(self):
        body = json.dumps({"choices": [{"message": {"content": "c"}}], "model": "reported-x"}).encode()
        content, identity = th._decode_envelope(body)
        self.assertEqual(content, "c")
        self.assertEqual(identity["status"], "present")
        self.assertEqual(identity["reported"], "reported-x")
        # Absent model -> absent (reported as `unknown` by the caller).
        content, identity = th._decode_envelope(json.dumps({"choices": [{"message": {"content": "c"}}]}).encode())
        self.assertIsNone(identity["reported"])
        self.assertEqual(identity["status"], "absent")
        # A present-but-unusable model is classified `invalid`, NOT raised: the content is still extracted.
        content, identity = th._decode_envelope(
            json.dumps({"choices": [{"message": {"content": "c"}}], "model": 123}).encode()
        )
        self.assertEqual(content, "c")
        self.assertEqual(identity["status"], "invalid")
        self.assertEqual(identity["error"], "model_identity_invalid")

    def test_decode_envelope_missing_content_is_still_a_failure(self):
        body = json.dumps({"choices": [{"message": {"role": "assistant"}}], "model": th.MODEL}).encode()
        with self.assertRaises(th.TransportError) as ctx:
            th._decode_envelope(body)
        self.assertEqual(ctx.exception.code, "completion_missing")

    def test_run_generate_preserves_content_losslessly_even_with_an_invalid_model_field(self):
        precious = "PRECIOUS-\"'\\n\\u0000-COMPLETION \u2603"
        unusable = "mod\x01el-" + "x" * 400  # over-long and control-characters: unusable

        def post(_url, _headers, _payload, **_kwargs):
            body = {"choices": [{"message": {"content": precious}}], "model": unusable}
            return 200, json.dumps(body).encode()

        runtime = {"api_key": "k", "api_mode": "chat_completions", "base_url": th.BASE_URL, "provider": th.PROVIDER}
        capture = th.run_generate(runtime, {"model": th.MODEL, "system": "s", "user": "u"}, post=post)
        # Fail-closed classification, but the completion bytes are preserved raw and lossless.
        self.assertFalse(capture["success"])
        self.assertEqual(capture["modelIdentity"], "invalid")
        self.assertEqual(capture["modelReported"], "unknown")
        self.assertEqual(capture["modelIdentityError"], "model_identity_invalid")
        raw = th.base64.b64decode(capture["completionBase64"])
        self.assertEqual(raw, precious.encode("utf-8"))
        self.assertEqual(capture["completionSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(capture["completionBytes"], len(raw))
        # No provider metadata, and the unusable id, are ever echoed.
        text = json.dumps(capture, sort_keys=True)
        self.assertNotIn("mod\x01el", text)
        self.assertNotIn("choices", text)
        self.assertNotIn("Authorization", text)

    def test_run_generate_reports_matched_mismatched_and_unknown_identity(self):
        runtime = {"api_key": "k", "api_mode": "chat_completions", "base_url": th.BASE_URL, "provider": th.PROVIDER}

        def post_with(model_value):
            def _post(_url, _headers, _payload, **_kwargs):
                body = {"choices": [{"message": {"content": "hi"}}]}
                if model_value is not None:
                    body["model"] = model_value
                return 200, json.dumps(body).encode()

            return _post

        matched = th.run_generate(runtime, {"model": th.MODEL, "system": "s", "user": "u"}, post=post_with(th.MODEL))
        self.assertEqual(matched["modelIdentity"], "match")
        self.assertEqual(matched["modelReported"], th.MODEL)
        self.assertEqual(matched["modelRequested"], th.MODEL)

        mismatched = th.run_generate(runtime, {"model": th.MODEL, "system": "s", "user": "u"}, post=post_with("some-other-model"))
        self.assertEqual(mismatched["modelIdentity"], "mismatch")
        self.assertEqual(mismatched["modelReported"], "some-other-model")

        unknown = th.run_generate(runtime, {"model": th.MODEL, "system": "s", "user": "u"}, post=post_with(None))
        self.assertEqual(unknown["modelIdentity"], "unknown")
        self.assertEqual(unknown["modelReported"], "unknown")

    def test_run_generate_refuses_allowlist_by_default(self):
        runtime = {"api_key": "k", "api_mode": "chat_completions", "base_url": th.BASE_URL, "provider": th.PROVIDER}
        with self.assertRaises(th.TransportError) as ctx:
            th.run_generate(runtime, {"model": th.MODEL, "system": "s", "user": "u"}, base_url=self.server.base)
        self.assertEqual(ctx.exception.code, "endpoint_not_allowlisted")

    def test_generate_mode_authorized_reaches_run_generate(self):
        # A fully matching record + env opens the gate and drives one mocked POST. This is a loopback
        # self-test only: no provider is contacted.
        import tempfile
        from unittest import mock

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(_valid_record("tok"), handle)
            path = handle.name
        try:
            injected = json.dumps({"provider": th.PROVIDER, "base_url": th.BASE_URL, "api_key": "k", "api_mode": "chat_completions"})
            request = json.dumps({"model": th.MODEL, "seed": 101, "system": "sys", "user": "usr"})
            out = io.StringIO()
            with mock.patch.dict(
                os.environ,
                {"LIBRARIAN_SEMANTIC_RUN_AUTHORIZED": "1", "LIBRARIAN_SEMANTIC_RUN_TOKEN": "tok"},
            ), mock.patch.object(sys, "stdin", io.StringIO(request)), mock.patch.object(sys, "stdout", out):
                rc = th.main([
                    "--mode", "generate",
                    "--run-authorization", path,
                    "--self-test",
                    "--self-test-runtime", injected,
                    "--self-test-endpoint", self.server.base,
                ])
            self.assertEqual(rc, 0)
            capture = json.loads(out.getvalue())
            self.assertEqual(capture["completionSha256"], hashlib.sha256(
                th.base64.b64decode(capture["completionBase64"])
            ).hexdigest())
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
