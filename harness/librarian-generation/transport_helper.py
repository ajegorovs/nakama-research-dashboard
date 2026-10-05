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
    return content


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
    content = _decode_completion(envelope)
    raw = content.encode("utf-8")
    return {
        "completionBase64": base64.b64encode(raw).decode("ascii"),
        "completionBytes": len(raw),
        "completionSha256": hashlib.sha256(raw).hexdigest(),
        "httpStatus": status,
        "modelReported": str(request.get("model", MODEL)),
        "responseBytes": len(envelope),
        "seed": request.get("seed"),
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
