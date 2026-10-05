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
            body = json.dumps({"choices": [{"message": {"content": completion}}]}).encode()
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
        "captureBasename": "librarian-semantic-eval-offline",
        "implementationRevision": "deadbeef",
        "manifestDigest": th._sha256_file(th.MANIFEST_PATH),
        "model": th.MODEL,
        "scope": {"calls": th.AUTHORIZED_CALL_SCOPE, "endpoint": th.BASE_URL, "model": th.MODEL},
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
