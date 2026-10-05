#!/usr/bin/env python3
"""Hermes-backed, credential-isolated transport helper for the librarian semantic evaluation.

Run with the interpreter that belongs to the installed ``hermes`` executable (the workspace venv). The
helper resolves the owner-selected backend through Hermes's **own** runtime provider resolver —
``hermes_cli.runtime_provider.resolve_runtime_provider(requested="opencode-go", target_model=...)`` — so
the credential and endpoint come from the active profile's configured source (``OPENCODE_GO_API_KEY``),
never from a value this file invents, copies or exports.

Design constraints (owner-approved amendment, D-013):

* **Credential isolation.** The API key lives only in this process's memory, inside request headers. It is
  never printed, logged, written to a file, exported into the environment, or returned in output. Errors
  are fixed machine codes that carry no URL, body, header, request id or credential.
* **Pinned endpoint.** The provider/base URL/model returned by the resolver are verified against the
  pinned identity before any request; a resolver that falls back to a default (e.g. OpenRouter) is
  refused rather than silently used.
* **Transport guards.** Redirects are refused (3xx is a hard failure); a finite wall timeout applies; the
  request and the **decompressed** response are byte-capped; there is no retry and no fallback host.
* **Accidental-generation safety.** ``generate`` refuses unless an explicit run authorization is present
  (an env flag *and* a token). No generation is authorized now.
* **Non-generation only here.** ``capability-models`` performs the one permitted authenticated GET
  (``https://opencode.ai/zen/go/v1/models``) and sanctions nothing else: no chats, no completions, no
  tokenize, no usage/account read.
* **Self-test isolation.** Local mock endpoints are reachable only under ``--self-test`` and only on
  loopback. At runtime the helper cannot be pointed at arbitrary network input.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from typing import Any, Callable, Optional

# ---- Pinned identity (from harness/librarian-generation/run-manifest.json §identity) ------------------

PROVIDER = "opencode-go"
ORIGIN = "https://opencode.ai"
BASE_URL = "https://opencode.ai/zen/go/v1"
CHAT_PATH = "/zen/go/v1/chat/completions"
CHAT_SUFFIX = "/chat/completions"
MODELS_ORIGIN_PATH = "/zen/go/v1/models"
MODELS_SUFFIX = "/models"
MODEL = "deepseek-v4.1-flash"
MANIFEST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run-manifest.json")
AUTHORIZED_CALL_SCOPE = 34

# Transport budgets (owner-approved, D-012).
TIMEOUT_SECONDS = 120
REQUEST_BYTES_MAX = 262144
RESPONSE_BYTES_MAX = 65536
COMPLETION_TOKENS_MAX = 1000
MAX_MODELS_LISTED = 200

# A deterministic, non-personal, synthetic run-affinity value. opencode-go requires
# ``x-opencode-session`` on every request (MissingSessionID without it); the value only has to be opaque
# and stable, so no real session/account identifier is used.
RUN_AFFINITY = "librarian-semantic-eval-" + hashlib.sha256(
    b"librarian-semantic-eval/run-affinity/v1"
).hexdigest()[:24]


class TransportError(Exception):
    """A fixed-code transport failure. The code is stable and secret-safe."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


def _safe_code(error: BaseException) -> str:
    """Map any exception to a fixed, secret-free code — never a URL, body, header or request id."""
    if isinstance(error, TransportError):
        return error.code
    name = type(error).__name__
    if name in {"ConnectError", "ConnectTimeout", "ReadTimeout", "WriteTimeout", "PoolTimeout", "TimeoutException"}:
        return "transport_timeout" if "Timeout" in name else "transport_connect_error"
    return "transport_error"


# ---- Runtime resolution (source resolver only; credential never echoed) -------------------------------


def resolve_pinned_runtime(
    model: str = MODEL,
    resolver: Optional[Callable[..., dict]] = None,
) -> dict:
    """Resolve the runtime through Hermes and verify it against the pinned identity.

    Returns a dict with ``provider``, ``base_url``, ``api_mode``, ``source`` and the in-memory ``api_key``.
    Raises ``TransportError('runtime_mismatch')`` (or ``'credential_missing'``) if the resolved runtime
    does not match the pinned provider/endpoint — so a resolver default can never redirect the request.
    """
    if resolver is None:
        try:
            from hermes_cli.runtime_provider import resolve_runtime_provider as resolver  # type: ignore
        except Exception as exc:  # pragma: no cover - environment dependent
            raise TransportError("resolver_import_failed") from exc
    try:
        runtime = resolver(requested=PROVIDER, target_model=model)
    except Exception as exc:
        raise TransportError("resolver_failed") from exc

    if not isinstance(runtime, dict):
        raise TransportError("runtime_mismatch")
    provider = str(runtime.get("provider") or "")
    base_url = str(runtime.get("base_url") or "").rstrip("/")
    api_key = str(runtime.get("api_key") or "").strip()
    if provider != PROVIDER or base_url != BASE_URL:
        # Refuse a resolver default (e.g. OpenRouter) rather than let it redirect the request.
        raise TransportError("runtime_mismatch")
    if not api_key:
        raise TransportError("credential_missing")
    return {
        "api_key": api_key,
        "api_mode": str(runtime.get("api_mode") or ""),
        "base_url": base_url,
        "provider": provider,
        "source": str(runtime.get("source") or ""),
    }


def build_headers(api_key: str) -> dict:
    """Request headers. The credential is placed here and nowhere else."""
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "x-opencode-session": RUN_AFFINITY,
    }


# ---- Guarded HTTP ------------------------------------------------------------------------------------


def guarded_get(url: str, headers: dict, *, timeout: float = TIMEOUT_SECONDS,
                max_bytes: int = RESPONSE_BYTES_MAX, allow_loopback: bool = False) -> tuple[int, bytes]:
    """GET with redirects refused, a finite timeout, a decompressed byte cap and no retry.

    ``allow_loopback`` is **only** ever set by the explicit ``--self-test`` path; in production the
    endpoint allowlist admits only the pinned provider endpoints, so a loopback URL is refused.
    """
    assert_url_allowlisted(url, allow_loopback=allow_loopback)
    try:
        import httpx
    except Exception as exc:  # pragma: no cover
        raise TransportError("httpclient_unavailable") from exc
    try:
        with httpx.Client(follow_redirects=False, timeout=timeout) as client:
            with client.stream("GET", url, headers=headers) as response:
                if 300 <= response.status_code < 400:
                    raise TransportError("redirect_refused")
                if response.status_code >= 400:
                    raise TransportError(f"http_status_{response.status_code}")
                total = 0
                chunks: list[bytes] = []
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise TransportError("response_too_large")
                    chunks.append(chunk)
                return response.status_code, b"".join(chunks)
    except TransportError:
        raise
    except BaseException as exc:  # noqa: BLE001 - mapped to a fixed code below
        raise TransportError(_safe_code(exc)) from None


def guarded_post_json(url: str, headers: dict, payload: bytes, *, timeout: float = TIMEOUT_SECONDS,
                      max_bytes: int = RESPONSE_BYTES_MAX, allow_loopback: bool = False) -> tuple[int, bytes]:
    """POST JSON with the same guards. Reachable only from the authorized ``generate`` path."""
    assert_url_allowlisted(url, allow_loopback=allow_loopback)
    if len(payload) > REQUEST_BYTES_MAX:
        raise TransportError("request_too_large")
    try:
        import httpx
    except Exception as exc:  # pragma: no cover
        raise TransportError("httpclient_unavailable") from exc
    try:
        with httpx.Client(follow_redirects=False, timeout=timeout) as client:
            with client.stream("POST", url, headers=headers, content=payload) as response:
                if 300 <= response.status_code < 400:
                    raise TransportError("redirect_refused")
                if response.status_code >= 400:
                    raise TransportError(f"http_status_{response.status_code}")
                total = 0
                chunks: list[bytes] = []
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise TransportError("response_too_large")
                    chunks.append(chunk)
                return response.status_code, b"".join(chunks)
    except TransportError:
        raise
    except BaseException as exc:  # noqa: BLE001
        raise TransportError(_safe_code(exc)) from None


def assert_url_allowlisted(url: str, *, allow_loopback: bool = False) -> None:
    """Only the pinned endpoints are reachable in production; loopback only under explicit self-test.

    Loopback is **refused by default**: a caller must pass ``allow_loopback=True`` (which only the
    explicit ``--self-test`` path does), so runtime input can never point the helper at an arbitrary
    local or remote host.
    """
    allowed = {
        f"{BASE_URL}/chat/completions",
        f"{BASE_URL}/models",
        f"{ORIGIN}{CHAT_PATH}",
        f"{ORIGIN}{MODELS_ORIGIN_PATH}",
    }
    if url in allowed:
        return
    if allow_loopback and _is_loopback(url):
        return
    raise TransportError("endpoint_not_allowlisted")


def _is_loopback(url: str) -> bool:
    from urllib.parse import urlparse

    host = (urlparse(url).hostname or "").lower()
    return host in {"127.0.0.1", "localhost", "::1"}


def _decode_completion(envelope: bytes) -> str:
    """Extract the completion content from an OpenAI-compatible chat_completions response.

    Only the content string is extracted; the provider envelope is not retained. Decoding JSON is the
    transport's job here; the caller UTF-8 encodes the returned string exactly as extracted.
    """
    content, _identity = _decode_envelope(envelope)
    return content


_HEX64 = re.compile(r"\A[0-9a-f]{64}\Z")
# A model id is a bounded, single-token public identifier; anything longer, or carrying control
# characters/newlines, is not a usable identity. A present-but-unusable id is **classified**, never
# raised after the completion has already been extracted: the completion is the evidence and is kept.
_MODEL_ID_MAX = 256
# A capability proof artifact is a small, non-secret JSON document; a larger file is refused unread.
PROOF_FILE_MAX_BYTES = 65536
CAPABILITY_PROOF_SCHEMA = "librarian-capability-proof-v1"
DEFAULT_PROOF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capability-proofs")

# The plain (unverified) dispositions an owner may record for each capability, mirroring the JS gate.
UNVERIFIED_CAPABILITY_DISPOSITIONS: dict[str, list[str]] = {
    "promptTokenCounting": ["unavailable_byte_cap_only"],
    "seedControl": ["unverified_owner_accepted"],
}
OPTIONAL_CAPABILITY_DISPOSITIONS: dict[str, list[str]] = {
    "modelIdentity": ["owner_accepted_unknown"],
}
FORBIDDEN_EGRESS_FIELDS = (
    "apiKey",
    "authorization",
    "credential",
    "credentialValue",
    "headers",
    "org",
    "orgId",
    "requestId",
    "token",
    "user",
    "userId",
)


def _classify_model_id(raw: Any) -> dict:
    """Classify a provider ``model`` field without ever raising after the completion is extracted.

    Returns ``{"status", "reported", "error"}``:

    - ``absent``  — no usable id (missing/empty); ``reported`` is ``None`` (the caller records `unknown`);
    - ``present`` — a bounded single-token id; ``reported`` is the sanitized value;
    - ``invalid`` — a present-but-unusable id (non-string, over-long or control characters); ``reported``
      is ``None`` and ``error`` is the fixed code ``model_identity_invalid``.

    The invalid case is classified, **not raised**: the extracted completion is the evidence and must be
    preserved even when the identity field is unusable. The unusable value itself is never echoed.
    """
    if raw is None:
        return {"error": None, "reported": None, "status": "absent"}
    if not isinstance(raw, str):
        return {"error": "model_identity_invalid", "reported": None, "status": "invalid"}
    value = raw.strip()
    if not value:
        return {"error": None, "reported": None, "status": "absent"}
    if len(value) > _MODEL_ID_MAX or any(ord(ch) < 0x20 for ch in value):
        return {"error": "model_identity_invalid", "reported": None, "status": "invalid"}
    return {"error": None, "reported": value, "status": "present"}


def _decode_envelope(envelope: bytes) -> tuple[str, dict]:
    """Extract ``(completion_content, identity)`` from a chat_completions response.

    The **content** is always extracted first; a present-but-unusable ``model`` field does not raise —
    it is returned as an ``invalid`` identity alongside the preserved content (see
    :func:`_classify_model_id`). Only a genuinely absent/unreadable completion raises. The provider
    envelope is never retained.
    """
    try:
        data = json.loads(envelope.decode("utf-8"))
    except Exception as exc:
        raise TransportError("envelope_not_json") from exc
    try:
        content = data["choices"][0]["message"]["content"]
    except Exception as exc:
        raise TransportError("completion_missing") from exc
    if not isinstance(content, str):
        raise TransportError("completion_not_text")
    raw_model = data.get("model") if isinstance(data, dict) else None
    return content, _classify_model_id(raw_model)


def _current_revision(repo: Optional[str] = None) -> Optional[str]:
    """The repository HEAD, or ``None`` when it cannot be resolved.

    Production never accepts a caller-supplied revision: it is resolved from the harness's own repository
    root. ``repo`` exists only so a test can point the resolution at a hostile/absent location.
    """
    if repo is None:
        repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(MANIFEST_PATH))))
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=True
        )
    except Exception:
        return None
    return out.stdout.strip() or None


def resolve_proof_path(proof_dir: str, rel: Any) -> tuple[Optional[str], Optional[str]]:
    """Resolve one proof artifact path under the dedicated proof directory, refusing escape attempts.

    A record is untrusted input: an absolute path, a ``..`` traversal, a symlink, a non-file or an
    over-large file is refused **before** it is read, so a malicious record can never point the gate at
    an arbitrary (credential) file. Returns ``(path, None)`` or ``(None, reason_code)``.
    """
    if not isinstance(rel, str) or not rel.strip():
        return None, "authorization_capability_proof_missing"
    if os.path.isabs(rel) or rel.startswith("~"):
        return None, "authorization_capability_proof_path_refused"
    normalized = os.path.normpath(rel)
    if normalized.startswith("..") or os.path.isabs(normalized):
        return None, "authorization_capability_proof_path_refused"
    try:
        real_base = os.path.realpath(proof_dir)
    except Exception:
        return None, "authorization_capability_proof_missing"
    full = os.path.join(real_base, normalized)
    if os.path.islink(full):
        return None, "authorization_capability_proof_path_refused"
    if not os.path.isfile(full):
        return None, "authorization_capability_proof_missing"
    try:
        if os.path.getsize(full) > PROOF_FILE_MAX_BYTES:
            return None, "authorization_capability_proof_path_refused"
        real = os.path.realpath(full)
    except Exception:
        return None, "authorization_capability_proof_missing"
    if not real.startswith(real_base + os.sep):
        return None, "authorization_capability_proof_path_refused"
    return real, None


def check_capability_proof(value: dict, capability: str, manifest: dict,
                           proof_dir: str = DEFAULT_PROOF_DIR) -> Optional[str]:
    """Mechanically validate one ``verified`` capability claim against its bound proof artifact.

    A ``verified`` claim is not prose and not a bare sha: it must name a bounded, non-secret JSON proof
    under the proof directory whose own bytes hash to the recorded ``proofDigest``, whose capability/
    provider/endpoint/model match the pinned identity, whose status is ``verified``, and whose recorded
    ``artifactDigest`` equals the **frozen corpus** artifact digest; it must also name an evidence file
    (inside the proof directory) whose bytes hash to the recorded ``evidenceSha256``. This is an operator
    interlock, not a cryptographic owner signature: it detects inconsistency and unbound/forged digests,
    and assumes nothing — no proof exists today, so every ``verified`` route refuses.
    """
    path, err = resolve_proof_path(proof_dir, value.get("proofPath"))
    if err:
        return err
    if _sha256_file(path) != value.get("proofDigest"):
        return "authorization_capability_proof_digest_mismatch"
    try:
        with open(path, "r", encoding="utf-8") as handle:
            proof = json.load(handle)
    except Exception:
        return "authorization_capability_proof_malformed"
    if not isinstance(proof, dict):
        return "authorization_capability_proof_malformed"
    if proof.get("schema") != CAPABILITY_PROOF_SCHEMA:
        return "authorization_capability_proof_malformed"
    if proof.get("status") != "verified":
        return "authorization_capability_proof_mismatch"
    if proof.get("capability") != capability:
        return "authorization_capability_proof_mismatch"
    identity = manifest.get("identity", {})
    if (
        proof.get("provider") != identity.get("provider")
        or proof.get("endpoint") != identity.get("baseUrl")
        or proof.get("model") != identity.get("model")
    ):
        return "authorization_capability_proof_mismatch"
    if not isinstance(proof.get("timestamp"), str) or not proof["timestamp"].strip():
        return "authorization_capability_proof_malformed"
    evidence_sha = proof.get("evidenceSha256")
    if not isinstance(evidence_sha, str) or not _HEX64.match(evidence_sha):
        return "authorization_capability_proof_malformed"
    corpus_digest = ((manifest.get("artifacts") or {}).get("corpus") or {}).get("digest")
    if value.get("artifactDigest") != corpus_digest:
        return "authorization_capability_proof_mismatch"
    evidence_path, evidence_err = resolve_proof_path(proof_dir, proof.get("evidencePath"))
    if evidence_err:
        return "authorization_capability_proof_evidence_mismatch"
    if _sha256_file(evidence_path) != evidence_sha:
        return "authorization_capability_proof_evidence_mismatch"
    return None


def _check_disposition(value: Any, allowed: list[str], capability: str, manifest: dict,
                       proof_dir: str) -> Optional[str]:
    if isinstance(value, str):
        return None if value in allowed else "authorization_capability_disposition_invalid"
    if isinstance(value, dict):
        if value.get("status") != "verified":
            return "authorization_capability_disposition_invalid"
        for key in ("proofDigest", "artifactDigest"):
            digest = value.get(key)
            if not isinstance(digest, str) or not _HEX64.match(digest):
                return "authorization_capability_disposition_unverifiable"
        if not isinstance(value.get("proofPath"), str) or not value["proofPath"].strip():
            return "authorization_capability_disposition_unverifiable"
        return check_capability_proof(value, capability, manifest, proof_dir)
    return "authorization_capability_disposition_invalid"


def check_capability_dispositions(dispositions: Any, manifest: dict,
                                  proof_dir: str = DEFAULT_PROOF_DIR) -> Optional[str]:
    if not isinstance(dispositions, dict):
        return "authorization_capability_dispositions_absent"
    for name, allowed in UNVERIFIED_CAPABILITY_DISPOSITIONS.items():
        if name not in dispositions:
            return "authorization_capability_dispositions_absent"
        reason = _check_disposition(dispositions[name], allowed, name, manifest, proof_dir)
        if reason:
            return reason
    for name, allowed in OPTIONAL_CAPABILITY_DISPOSITIONS.items():
        if name in dispositions:
            reason = _check_disposition(dispositions[name], allowed, name, manifest, proof_dir)
            if reason:
                return reason
    return None


def check_third_party_egress(egress: Any, manifest: dict) -> Optional[str]:
    if not isinstance(egress, dict):
        return "authorization_third_party_egress_absent"
    for field in FORBIDDEN_EGRESS_FIELDS:
        if field in egress:
            return "authorization_third_party_egress_credential_field_present"
    identity = manifest.get("identity", {})
    if egress.get("approved") is not True:
        return "authorization_third_party_egress_not_approved"
    if egress.get("syntheticOnly") is not True:
        return "authorization_third_party_egress_not_synthetic_only"
    if (
        egress.get("origin") != identity.get("origin")
        or egress.get("baseUrl") != identity.get("baseUrl")
        or egress.get("model") != identity.get("model")
    ):
        return "authorization_third_party_egress_mismatch"
    if egress.get("calls") != AUTHORIZED_CALL_SCOPE:
        return "authorization_third_party_egress_mismatch"
    digest = egress.get("artifactDigest")
    if not isinstance(digest, str) or not _HEX64.match(digest):
        return "authorization_third_party_egress_artifact_digest_invalid"
    # The egress artifact digest must bind to the frozen corpus artifact — never an arbitrary 64-hex value.
    corpus_digest = ((manifest.get("artifacts") or {}).get("corpus") or {}).get("digest")
    if digest != corpus_digest:
        return "authorization_third_party_egress_mismatch"
    return None


# ---- Capability checks (non-generation) --------------------------------------------------------------


def capability_models(runtime: dict, get: Callable[..., tuple[int, bytes]] = guarded_get,
                      *, base_url: str = BASE_URL, allow_loopback: bool = False) -> dict:
    """The one permitted authenticated GET: list model ids. No usage/account/chat data is read.

    Output is sanitized to model ids and support flags. Provider HTTP envelopes never leave this function.
    """
    headers = build_headers(runtime["api_key"])
    status, body = get(f"{base_url}{MODELS_SUFFIX}", headers, allow_loopback=allow_loopback)
    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception as exc:
        raise TransportError("models_not_json") from exc
    ids: list[str] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, list):
        for entry in data:
            if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                ids.append(entry["id"])
    ids = sorted(set(ids))
    return {
        "endpoint": {"origin": ORIGIN, "path": MODELS_ORIGIN_PATH},
        "httpStatus": status,
        "modelIdsListed": ids[:MAX_MODELS_LISTED],
        "modelIdsListedCount": len(ids),
        "modelRequested": MODEL,
        # A model absent from this list is NOT proof it is missing; only presence is observed.
        "modelObservedInList": MODEL in ids,
        "responseBytes": len(body),
    }


def preflight(
    runtime: dict,
    *,
    do_models: bool,
    get: Callable[..., tuple[int, bytes]] = guarded_get,
    base_url: str = BASE_URL,
    allow_loopback: bool = False,
) -> dict:
    """Non-generation preflight: report the verified runtime shape and, optionally, the model list."""
    report: dict[str, Any] = {
        "apiMode": runtime["api_mode"],
        "baseUrl": runtime["base_url"],
        "capabilities": {
            "backendVersion": "unknown",
            "modelArtifactHash": "unknown",
            "seedControl": "unverified",
            "tokenCounting": "unverified",
        },
        "credentialSource": runtime.get("source", ""),
        "generationAuthorized": False,
        "model": MODEL,
        "provider": runtime["provider"],
    }
    if do_models:
        report["models"] = capability_models(runtime, get, base_url=base_url, allow_loopback=allow_loopback)
    return report


# ---- Generate path (reachable only under an explicit run authorization) -------------------------------


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def generation_authorized(
    record_path: Optional[str],
    *,
    manifest_path: str = MANIFEST_PATH,
    model: str = MODEL,
    env: Optional[dict] = None,
    proof_dir: str = DEFAULT_PROOF_DIR,
) -> tuple[bool, str]:
    """Decide whether generation is authorized, fail-closed. Returns ``(ok, reason_code)``.

    Authorization needs **all** of: the explicit env flag, a non-empty env token, an external
    authorization **record** file (never an in-place edit of the frozen manifest) whose token matches,
    and whose scope pins the model, the pinned endpoint, the 34-call budget, the manifest digest and the
    corpus/rubric/template digests, plus a capture basename. Absent any, generation is refused.
    """
    environ = os.environ if env is None else env
    if environ.get("LIBRARIAN_SEMANTIC_RUN_AUTHORIZED") != "1":
        return False, "authorization_flag_absent"
    token = environ.get("LIBRARIAN_SEMANTIC_RUN_TOKEN") or ""
    if not token:
        return False, "authorization_token_absent"
    if not record_path or not os.path.isfile(record_path):
        return False, "authorization_record_absent"
    try:
        with open(record_path, "r", encoding="utf-8") as handle:
            record = json.load(handle)
    except Exception:
        return False, "authorization_record_unreadable"
    if not isinstance(record, dict) or record.get("authorized") is not True:
        return False, "authorization_record_not_authorized"
    if record.get("token") != token:
        return False, "authorization_token_mismatch"
    if record.get("model") != model:
        return False, "authorization_model_mismatch"
    scope = record.get("scope") if isinstance(record.get("scope"), dict) else {}
    if scope.get("endpoint") != BASE_URL or scope.get("model") != model:
        return False, "authorization_scope_mismatch"
    if scope.get("calls") != AUTHORIZED_CALL_SCOPE:
        return False, "authorization_scope_mismatch"
    if not record.get("captureBasename"):
        return False, "authorization_capture_basename_absent"
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
    except Exception:
        return False, "authorization_manifest_unreadable"
    if record.get("manifestDigest") != _sha256_file(manifest_path):
        return False, "authorization_manifest_mismatch"
    artifacts = record.get("artifacts") if isinstance(record.get("artifacts"), dict) else {}
    manifest_artifacts = manifest.get("artifacts", {})
    for key in ("corpus", "rubric", "promptTemplate"):
        expected = (manifest_artifacts.get(key) or {}).get("digest")
        if not expected or artifacts.get(key) != expected:
            return False, "authorization_artifact_mismatch"
    # The explicit owner disposition of the unverified capabilities (mandatory).
    capability_reason = check_capability_dispositions(record.get("capabilityDispositions"), manifest, proof_dir)
    if capability_reason:
        return False, capability_reason
    # The explicit owner approval of synthetic-only third-party egress (mandatory).
    egress_reason = check_third_party_egress(record.get("thirdPartyEgress"), manifest)
    if egress_reason:
        return False, egress_reason
    # Revision: fail closed when it cannot be determined — never skip the check, and never trust a
    # caller-supplied revision. The record's revision must match the resolved repository HEAD.
    reported = record.get("implementationRevision")
    if not isinstance(reported, str) or not reported.strip():
        return False, "authorization_revision_unavailable"
    head = _current_revision()
    if not head:
        return False, "authorization_revision_unavailable"
    if reported != head:
        return False, "authorization_revision_mismatch"
    return True, "authorized"


def run_generate(
    runtime: dict,
    request: dict,
    *,
    post: Callable[..., tuple[int, bytes]] = guarded_post_json,
    base_url: str = BASE_URL,
    allow_loopback: bool = False,
) -> dict:
    """Authorized generation: POST one chat-completions request and return the lossless completion.

    The provider envelope is transient: it is consumed here to extract the completion and is **never**
    returned. Only the extracted completion (base64 + sha256, over the exact UTF-8 bytes), the reported
    model id and minimal non-secret transport facts leave this function — no header, credential, account
    id or provider metadata. Reached only from ``--mode generate`` **after** the gate passes.
    """
    if not isinstance(request, dict) or not isinstance(request.get("system"), str) or not isinstance(request.get("user"), str):
        raise TransportError("request_malformed")
    body: dict[str, Any] = {
        "max_tokens": int(request.get("max_tokens", COMPLETION_TOKENS_MAX)),
        "messages": [
            {"content": request["system"], "role": "system"},
            {"content": request["user"], "role": "user"},
        ],
        "model": str(request.get("model", MODEL)),
        "temperature": request.get("temperature", 0),
        "top_p": request.get("top_p", 1),
    }
    if request.get("seed") is not None:
        body["seed"] = request["seed"]
    payload = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    status, envelope = post(
        f"{base_url}{CHAT_SUFFIX}", build_headers(runtime["api_key"]), payload, allow_loopback=allow_loopback
    )
    content, identity = _decode_envelope(envelope)
    requested = str(request.get("model", MODEL))
    if identity["status"] == "invalid":
        # A present-but-unusable model field: the completion bytes are still preserved losslessly, but the
        # identity is classified `invalid` with a fixed error code, success is false, and the caller keeps
        # the entry non-green and delivers no candidate. The unusable value is never echoed.
        model_identity = "invalid"
        model_reported = "unknown"
        model_identity_error = identity["error"]
        success = False
    else:
        model_identity_error = None
        success = True
        if identity["status"] == "absent":
            model_identity = "unknown"
            model_reported = "unknown"
        else:
            model_reported = identity["reported"]
            model_identity = "match" if model_reported == requested else "mismatch"
    raw = content.encode("utf-8")
    return {
        "completionBase64": base64.b64encode(raw).decode("ascii"),
        "completionBytes": len(raw),
        "completionSha256": hashlib.sha256(raw).hexdigest(),
        "httpStatus": status,
        # The reported identity is decoded from the provider response, never copied from the request.
        "modelIdentity": model_identity,
        "modelIdentityError": model_identity_error,
        "modelReported": model_reported,
        "modelRequested": requested,
        "responseBytes": len(envelope),
        "seed": request.get("seed"),
        "success": success,
    }


# ---- CLI ---------------------------------------------------------------------------------------------


def _self_test_runtime(raw: Optional[str]) -> Optional[Callable[..., dict]]:
    if not raw:
        return None
    injected = json.loads(raw)

    def _resolver(**_kwargs: Any) -> dict:
        return injected

    return _resolver


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Librarian semantic-eval transport helper (non-generation only).")
    parser.add_argument("--mode", choices=["preflight", "capability-models", "generate"], default="preflight")
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--run-authorization", default=None,
                        help="path to an external authorization record (required for generate)")
    parser.add_argument("--self-test", action="store_true", help="enable loopback-only self-test overrides")
    parser.add_argument("--self-test-endpoint", default=None)
    parser.add_argument("--self-test-runtime", default=None, help="inject a resolver result (self-test only)")
    args = parser.parse_args(argv)

    if (args.self_test_endpoint or args.self_test_runtime) and not args.self_test:
        print(json.dumps({"error": "self_test_flag_required"}), file=sys.stderr)
        return 2

    if args.mode == "generate":
        ok, reason = generation_authorized(args.run_authorization, model=args.model)
        if not ok:
            # Fail-closed: the gate stays shut without an explicit, matching external authorization.
            print(json.dumps({"error": "generation_not_authorized", "reason": reason}), file=sys.stderr)
            return 3

    endpoint_override = None
    if args.self_test and args.self_test_endpoint:
        if not _is_loopback(args.self_test_endpoint):
            print(json.dumps({"error": "self_test_endpoint_not_loopback"}), file=sys.stderr)
            return 2
        endpoint_override = args.self_test_endpoint.rstrip("/")

    try:
        runtime = resolve_pinned_runtime(args.model, resolver=_self_test_runtime(args.self_test_runtime))
        base = endpoint_override or BASE_URL
        allow_loopback = bool(endpoint_override)
        if args.mode in {"preflight", "capability-models"}:
            report = preflight(runtime, do_models=(args.mode == "capability-models"), base_url=base,
                               allow_loopback=allow_loopback)
            print(json.dumps(report, indent=2, sort_keys=True))
            return 0
        if args.mode == "generate":
            # Reachable only after the gate above. The request arrives on stdin as JSON; the lossless
            # completion capture is written to stdout. Never reached in the current envelope.
            try:
                request = json.loads(sys.stdin.read() or "{}")
            except Exception:
                print(json.dumps({"error": "request_not_json"}), file=sys.stderr)
                return 2
            capture = run_generate(runtime, request, base_url=base, allow_loopback=allow_loopback)
            print(json.dumps(capture, indent=2, sort_keys=True))
            return 0
    except TransportError as exc:
        print(json.dumps({"error": exc.code}), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
