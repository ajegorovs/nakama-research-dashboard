/**
 * Live-HTTP owning-driver adapters — the real transport seams behind the driver's injected ports.
 *
 * The driver itself performs no I/O: `createHostSession` and `automationApi` are injected ports
 * (`driver.mjs`). The offline tests in `driver.test.mjs` inject an in-process guard-backed port. This
 * module is the **other** adapter: the live amended host's own HTTP surface, so a real run (once the
 * authorization and provider/model presentation are separately approved) binds the driver to the exact
 * served routes rather than to a stand-in.
 *
 * Every route, method, status and response shape below is taken from the pinned host checkout
 * (`apps/server/src/http/routes/*.ts`, `org-middleware.ts`, `shared.ts`), not invented:
 *
 *   POST /v1/auth/login                 → 200 + `nakama_session` / `nakama_csrf` cookies
 *   GET  /v1/auth/orgs                  → 200 `{ orgs: [{ id, name }] }`
 *   GET  /v1/auth/me                    → 200 `{ id }`
 *   POST /v1/sessions                   → 201 `{ sessionId }`   body `{ channel, profileId?, model?, evaluation? }`
 *   POST /v1/sessions/:id/messages      → 200 `{ reply, usage?, contextUsage? }`, or `text/event-stream`
 *                                          (`tool_start` / `tool_end` / `chunk` / `usage` / `done` / `error`) when
 *                                          `Accept: text/event-stream`
 *   POST /v1/workers/automation/:action → 200 `{ ok: true }`   action ∈ { start, stop }
 *   POST /v1/automations                → 201 `{ automation }`
 *   POST /v1/automations/:id/run        → 200 `{ run }`          body `{ evaluation? }`
 *
 * The explicit scoped identity is the browser session cookie + `x-csrf-token` + the org header
 * `x-org-id` (`ORG_ID_HEADER`, `org-middleware.ts:10`); the session route requires the evaluation
 * `scope.orgId` to equal that active org (`sessions.ts:622`) and refuses a non-org-admin (`requireOrgAdmin`).
 *
 * DISPATCH GUARD. These are **offline-only transport primitives** unless they are handed a live grant.
 * Every live constructor (`createHttpHostSession`, `createHttpSessionFactory`,
 * `createHttpAutomationSessionFactory`, `createHttpAutomationApi`) refuses without a grant minted by
 * `live-grant.mjs` `mintLiveGrant`, which **itself** runs `authorizeExecution` and
 * `assertInferenceAuthorized` — both gates — before registering one (called by the owning entrypoint
 * `live.mjs` `createAuthorizedLiveDriver`). Composing the exported low-level `createDriver` with these
 * factories therefore fails closed (`http_adapter_live_grant_required`) before any login, session
 * create/bind, turn or provider call, and importing `mintLiveGrant` cannot mint authority either: the gates
 * are inside the mint. There is no ungated production grant factory; the adapter unit tests mint through an
 * isolated copied source sandbox (`live-test-sandbox.mjs`).
 *
 * Safety properties, matching `client.mjs`: **no retry** (a failed turn has an unknown applied outcome, so
 * it is surfaced, never replayed) and a **turn-scoped timeout that aborts** (the policy's `turnDeadlineMs`).
 *
 * WIRE EVALUATION RESULT — the gap this adapter previously marked `null` is closed on the host. The
 * amended host now carries its actual in-process `EvaluationTurnResult` (`terminalReason`,
 * `modelGenerations`, `toolExecutions`, `forbidden`, `historyValid`) on the opt-in responses:
 * `SendMessageResponse.evaluation`, the SSE `done`/`error` event's `evaluation`, and
 * `RunAutomationResponse.evaluation` — each present **only** when a policy is bound, so an unbound
 * response is byte-identical to the pinned host. This adapter **consumes that result strictly**:
 * `parseWireEvaluation` refuses a missing or malformed result with a hard error rather than inferring a
 * completion, so the driver can never record a successful evaluation from an absent counter. The client
 * deadline is a backstop, not a substitute for the host-driven turn deadline: it fires at the policy
 * deadline plus `CLIENT_DEADLINE_GRACE_MS` so the host's own terminal result is observed first, and a
 * client abort is reported as an explicit local terminal with `null` counters (never `completed`).
 */
import { isLoopbackBase } from "../client.mjs";
import { LIVE_GRANT_REFUSAL, isLiveGrant } from "./live-grant.mjs";

export class HttpAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HttpAdapterError";
    this.code = code;
  }
}

export const HTTP_ADAPTER_CODES = Object.freeze({
  loopback: "http_adapter_non_loopback_base",
  fetchImpl: "http_adapter_fetch_missing",
  authRequired: "http_adapter_auth_required",
  loginFailed: "http_adapter_login_failed",
  orgMismatch: "http_adapter_org_mismatch",
  bindRefused: "http_adapter_bind_refused",
  notBound: "http_adapter_not_bound",
  sessionAbsent: "http_adapter_session_absent",
  automationIdMissing: "http_adapter_automation_id_missing",
  turnRefused: "http_adapter_turn_refused",
  transportUnknown: "http_adapter_transport_unknown",
  sendFailed: "http_adapter_send_failed",
  evaluationAbsent: "http_adapter_evaluation_absent",
  evaluationMalformed: "http_adapter_evaluation_malformed",
  liveGrantRequired: "http_adapter_live_grant_required",
});

/**
 * The dispatch guard: a live transport is only built with a grant minted by the gated owning entrypoint
 * (`live.mjs` `createAuthorizedLiveDriver`) after `authorizeExecution` and `assertInferenceAuthorized`
 * both passed. Without it the raw transport is **offline-only** and is not a live dispatch route, so an
 * accidental `createDriver` + HTTP-factory composition fails closed before any login or session call.
 */
function requireLiveGrant(liveGrant, who) {
  if (!isLiveGrant(liveGrant)) {
    throw new HttpAdapterError(
      HTTP_ADAPTER_CODES.liveGrantRequired,
      `${who}: a live grant minted by createAuthorizedLiveDriver is required (${LIVE_GRANT_REFUSAL}); the raw transport is offline-only and is not a live dispatch route`
    );
  }
}

/**
 * The exact terminal reasons the amended host may put on the wire. The driver authorizes against these;
 * an unknown value is a malformed result, never coerced to `completed`.
 */
export const WIRE_EVALUATION_TERMINAL_REASONS = Object.freeze([
  "completed",
  "model-generation-budget-exhausted",
  "tool-call-budget-exhausted",
  "forbidden-tool",
  "turn-deadline-exceeded",
  "provider-error",
  "tool-error",
  "cancelled",
]);

const WIRE_TERMINAL_REASON_SET = new Set(WIRE_EVALUATION_TERMINAL_REASONS);

/** Grace added to the host-driven turn deadline so the host's own terminal result is observed first. */
export const CLIENT_DEADLINE_GRACE_MS = 2000;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse and strictly validate the `EvaluationTurnResult` the host now carries on an opt-in response
 * (`SendMessageResponse.evaluation`, the SSE `done`/`error` `evaluation`, or `RunAutomationResponse.evaluation`).
 *
 * Fail closed: a bound policy must yield the host's actual result. A missing or malformed result is a hard
 * `HttpAdapterError`, **never** a fabricated completion — the driver must not infer compliance from an
 * absent counter or reason.
 */
export function parseWireEvaluation(raw, context) {
  if (raw === undefined || raw === null) {
    throw new HttpAdapterError(
      HTTP_ADAPTER_CODES.evaluationAbsent,
      `${context}: the host returned no evaluation result for a bound policy (refusing to infer one)`
    );
  }
  if (!isPlainObject(raw)) {
    throw new HttpAdapterError(HTTP_ADAPTER_CODES.evaluationMalformed, `${context}: evaluation result is not an object`);
  }
  const { caseToken, endedAt, forbidden, historyValid, modelGenerations, startedAt, terminalReason, toolExecutions } = raw;
  const bad =
    typeof caseToken !== "string" ||
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    typeof endedAt !== "number" ||
    !Number.isFinite(endedAt) ||
    typeof historyValid !== "boolean" ||
    !Number.isInteger(modelGenerations) ||
    modelGenerations < 0 ||
    !Number.isInteger(toolExecutions) ||
    toolExecutions < 0 ||
    !WIRE_TERMINAL_REASON_SET.has(terminalReason);
  if (bad) {
    throw new HttpAdapterError(
      HTTP_ADAPTER_CODES.evaluationMalformed,
      `${context}: evaluation result is malformed (terminalReason=${String(terminalReason)}, modelGenerations=${String(modelGenerations)}, toolExecutions=${String(toolExecutions)})`
    );
  }
  let normalizedForbidden = null;
  if (forbidden !== null && forbidden !== undefined) {
    if (
      !isPlainObject(forbidden) ||
      typeof forbidden.arguments !== "string" ||
      typeof forbidden.at !== "number" ||
      typeof forbidden.policyReason !== "string" ||
      typeof forbidden.reason !== "string" ||
      typeof forbidden.tool !== "string"
    ) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.evaluationMalformed, `${context}: forbidden record is malformed`);
    }
    normalizedForbidden = {
      arguments: forbidden.arguments,
      at: forbidden.at,
      policyReason: forbidden.policyReason,
      reason: forbidden.reason,
      tool: forbidden.tool,
    };
  }
  return {
    caseToken,
    endedAt,
    forbidden: normalizedForbidden,
    historyValid,
    modelGenerations,
    startedAt,
    terminalReason,
    toolExecutions,
  };
}

/** The exact routes this module speaks. Kept as data so a reviewer can diff it against the host. */
export const HOST_HTTP_CONTRACT = Object.freeze({
  login: Object.freeze({ method: "POST", path: "/v1/auth/login", status: 200 }),
  orgs: Object.freeze({ method: "GET", path: "/v1/auth/orgs", status: 200 }),
  me: Object.freeze({ method: "GET", path: "/v1/auth/me", status: 200 }),
  createSession: Object.freeze({ method: "POST", path: "/v1/sessions", status: 201 }),
  sendMessage: Object.freeze({ method: "POST", path: "/v1/sessions/{sessionId}/messages", status: 200 }),
  workerAction: Object.freeze({ method: "POST", path: "/v1/workers/automation/{action}", status: 200 }),
  createAutomation: Object.freeze({ method: "POST", path: "/v1/automations", status: 201 }),
  runAutomation: Object.freeze({ method: "POST", path: "/v1/automations/{automationId}/run", status: 200 }),
  orgHeader: "x-org-id",
  csrfHeader: "x-csrf-token",
});

/** Parse one `data:` record of an SSE stream (a `:` line is a keepalive comment). Never throws. */
function parseSseRecord(raw) {
  const events = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(":")) continue;
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "") continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      events.push({ type: "unparseable", raw: payload.slice(0, 300) });
    }
  }
  return events;
}

/** Read a `text/event-stream` response to completion, invoking `onEvent` for each parsed event. */
async function readSse(response, onEvent) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    for (const record of text.split("\n\n")) {
      for (const event of parseSseRecord(record)) onEvent(event);
    }
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const record = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const event of parseSseRecord(record)) onEvent(event);
    }
  }
  if (buffer.trim() !== "") {
    for (const event of parseSseRecord(buffer)) onEvent(event);
  }
}

/** Absorb Set-Cookie headers into a jar (mirrors `client.mjs`). */
function absorbCookies(jar, response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const split = pair.indexOf("=");
    if (split > 0) jar.set(pair.slice(0, split).trim(), pair.slice(split + 1));
  }
}

/**
 * The explicit scoped auth identity: a real login against the host, resolved to a named org.
 *
 * `expectedOrgId` is mandatory and the account must be a member of it (an ambient "first org" is never
 * accepted as write authority). Each call is made once — no retry. `headers()` returns the cookie,
 * `x-csrf-token` and `x-org-id` the session routes check.
 */
export function createHttpAuth({
  fetchImpl = globalThis.fetch,
  base,
  email,
  password,
  expectedOrgId,
  expectedOrgName = null,
  allowNonLoopback = false,
} = {}) {
  if (typeof fetchImpl !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.fetchImpl, "fetchImpl must be a function");
  if (!base) throw new HttpAdapterError(HTTP_ADAPTER_CODES.loopback, "base URL is required");
  if (!allowNonLoopback && !isLoopbackBase(base)) {
    throw new HttpAdapterError(HTTP_ADAPTER_CODES.loopback, `base "${base}" is not loopback; refusing a non-loopback target`);
  }
  if (typeof expectedOrgId !== "string" || expectedOrgId.trim() === "") {
    throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, "an explicit expectedOrgId is required");
  }
  const root = base.replace(/\/+$/, "");
  const jar = new Map();
  let orgId = null;
  let actorId = null;
  let loggedIn = false;

  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  async function request(path, { body, method = "GET", headers = {}, signal = null } = {}) {
    return fetchImpl(root + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(jar.size === 0 ? {} : { cookie: cookieHeader() }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  async function login() {
    const response = await request("/v1/auth/login", { body: { email, password }, method: "POST" });
    absorbCookies(jar, response);
    if (response.status !== 200) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.loginFailed, `login failed (HTTP ${response.status})`);
    }
    if (!jar.get("nakama_csrf")) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.loginFailed, "no nakama_csrf cookie after login");
    }
    const orgsResponse = await request("/v1/auth/orgs");
    absorbCookies(jar, orgsResponse);
    const orgs = orgsResponse.status === 200 ? (await orgsResponse.json())?.orgs : null;
    if (!Array.isArray(orgs)) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.loginFailed, "could not read the account's organizations (/v1/auth/orgs)");
    }
    const match = orgs.find((org) => org?.id === expectedOrgId);
    if (!match) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.orgMismatch, `expected org ${expectedOrgId} is not among this account's organizations`);
    }
    if (expectedOrgName && match.name !== expectedOrgName) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.orgMismatch, `org ${expectedOrgId} is named "${match.name}", not "${expectedOrgName}"`);
    }
    const meResponse = await request("/v1/auth/me");
    absorbCookies(jar, meResponse);
    actorId = meResponse.status === 200 ? (await meResponse.json())?.id ?? null : null;
    if (!actorId) {
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.loginFailed, "could not read the acting user id (/v1/auth/me)");
    }
    orgId = expectedOrgId;
    loggedIn = true;
    return { orgId, actorId };
  }

  function headers() {
    if (!loggedIn) throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, "not logged in: call login() before acting");
    const csrf = jar.get("nakama_csrf");
    if (!csrf) throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, "no csrf token in the session jar");
    return { cookie: cookieHeader(), "x-csrf-token": csrf, "x-org-id": orgId };
  }

  return {
    login,
    headers,
    request,
    get orgId() { return orgId; },
    get actorId() { return actorId; },
    get loggedIn() { return loggedIn; },
    get base() { return root; },
  };
}

/**
 * Parse one host SSE turn into the observed trace the driver can record alongside the DB read.
 * `onEvent`-driven so `sendStream` can forward chunks live. Returns the materialized observation.
 */
function collectStreamEvents(onEvent) {
  const toolCalls = [];
  let reply = null;
  let usage = null;
  let model = null;
  let terminal = null;
  let error = null;
  let evaluation = null;
  return {
    observe(event) {
      if (!event || typeof event !== "object") return;
      if (event.type === "tool_start") {
        toolCalls.push({ arguments: event.input ?? null, id: event.toolCallId ?? null, name: event.tool ?? null });
      } else if (event.type === "tool_end") {
        const call = toolCalls.find((c) => c.id !== null && c.id === event.toolCallId);
        if (call) call.result = event.result;
        else toolCalls.push({ arguments: null, id: event.toolCallId ?? null, name: event.tool ?? null, result: event.result });
      } else if (event.type === "chunk") {
        // `onChunk` forwards deltas; the terminal `done` event carries the full reply.
      } else if (event.type === "usage") {
        usage = event.usage ?? usage;
      } else if (event.type === "done") {
        reply = typeof event.reply === "string" ? event.reply : reply;
        if (event.usage) usage = event.usage;
        if (typeof event.contextUsage?.model === "string") model = event.contextUsage.model;
        if (event.evaluation !== undefined) evaluation = event.evaluation;
        terminal = "completed";
      } else if (event.type === "error") {
        error = event.error ?? "stream error";
        if (event.evaluation !== undefined) evaluation = event.evaluation;
        terminal = "provider-error";
      }
      if (!model && Array.isArray(usage?.calls)) {
        const withId = usage.calls.find((c) => typeof c?.modelId === "string" && c.modelId.length > 0);
        if (withId) model = withId.modelId;
      }
      onEvent?.(event);
    },
    result() {
      return {
        error,
        evaluation,
        model,
        reply,
        terminal: terminal ?? "unknown",
        toolCalls,
        toolExecutions: toolCalls.filter((c) => "result" in c).length,
        usage,
      };
    },
  };
}

/** Run a fetch under an optional turn deadline; classify a timeout vs an external cancel. */
async function fetchWithDeadline(fetchImpl, url, init, { deadlineMs, signal }) {
  const timer = deadlineMs && deadlineMs > 0 ? AbortSignal.timeout(deadlineMs) : null;
  const combined = signal && timer ? AbortSignal.any([signal, timer]) : signal ?? timer ?? undefined;
  let timedOut = false;
  if (timer) {
    // AbortSignal.timeout rejects with a TimeoutError-named DOMException; record the fact locally so a
    // race cannot mislabel a cancel as a timeout (mirrors `shared.ts`'s `timedOut` flag).
    timer.addEventListener?.("abort", () => { timedOut = true; }, { once: true });
  }
  try {
    const response = await fetchImpl(url, { ...init, ...(combined ? { signal: combined } : {}) });
    return { response, timedOut };
  } catch (error) {
    return { error, timedOut: timedOut || error?.name === "TimeoutError" };
  }
}

/**
 * One live HTTP host session for a single case — the driver's `createHostSession({ caseId, sessionId })`
 * return value. Implements the real `AgentChatSession` evaluation-control surface
 * (`HOST_SESSION_REQUIRED_METHODS`) so `assertHostSession` admits it and `isDefaultInert` proves it inert
 * before the driver binds the case policy.
 *
 * The policy is bound **at session creation** (`POST /v1/sessions` with `evaluation`) — single-shot, as the
 * host requires. `send`/`sendStream` then address `POST /v1/sessions/{id}/messages`. In `automationRun`
 * mode the same surface is the `POST /v1/automations/{id}/run` route instead (N-7).
 */
export function createHttpHostSession({
  fetchImpl,
  auth,
  channel = "web",
  model = null,
  caseId = null,
  sessionId = null,
  turnDeadlineMs = null,
  automationRun = false,
  useStream = true,
  liveGrant = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.fetchImpl, "fetchImpl must be a function");
  requireLiveGrant(liveGrant, "createHttpHostSession");
  if (!auth || typeof auth.headers !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, "an explicit auth identity is required");

  let policy = null;
  let createdSessionId = null;
  let lastResult = null;
  const observations = [];

  /**
   * Fold the host's **wire** `EvaluationTurnResult` into the adapter's observation, strictly. A missing or
   * malformed result throws (fail closed) — the adapter never invents a counter or a completion.
   */
  function wireEvaluationResult(wire, { httpStatus, modelEvidence, error, context }) {
    const parsed = parseWireEvaluation(wire, context);
    return {
      ...parsed,
      observedVia: "http",
      httpStatus: httpStatus ?? null,
      modelEvidence: modelEvidence ?? null,
      error: error ?? null,
    };
  }

  /**
   * A terminal the **client**, not the host, produced (a local transport backstop). No wire counters exist,
   * so every host field stays explicitly `null` and the reason is the explicit abort — never `completed`.
   */
  function clientTerminalResult({ startedAt, reason, error }) {
    return {
      caseToken: policy?.conversationToken ?? null,
      endedAt: Date.now(),
      forbidden: null,
      historyValid: null,
      modelGenerations: null,
      startedAt,
      terminalReason: reason,
      toolExecutions: null,
      observedVia: "http-client-terminal",
      httpStatus: null,
      modelEvidence: null,
      error: error ?? null,
    };
  }

  async function postJson(path, body, signal) {
    const { response, error, timedOut } = await fetchWithDeadline(fetchImpl, auth.base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth.headers() },
      body: JSON.stringify(body),
    }, { deadlineMs: null, signal });
    if (error) {
      if (timedOut) throw new HttpAdapterError(HTTP_ADAPTER_CODES.transportUnknown, `timeout on POST ${path}`);
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.transportUnknown, `network error on POST ${path}: the outcome is UNKNOWN and is not retried (${error?.message ?? error})`);
    }
    return { response, timedOut };
  }

  return {
    bindEvaluationPolicy(next) {
      if (policy) throw new Error("An evaluation policy is already bound to this session.");
      policy = next;
      // For an automation run there is no session-creation step: the run route is addressed directly by
      // the automation id the binding scopes.
      if (automationRun) createdSessionId = next?.scope?.automationId ?? null;
    },
    getEvaluationToken() {
      return policy ? policy.conversationToken : null;
    },
    getEvaluationResult() {
      return lastResult;
    },
    async send(input = {}) {
      return runTurn(input, null);
    },
    async sendStream(input, handlers) {
      return runTurn(input, handlers);
    },
    /** The host-assigned session id once the session has been created (the driver reads its DB trace by it). */
    get sessionId() {
      return createdSessionId;
    },
    /** Observed HTTP turn evidence, for the caller's record (never a substitute for the DB trace). */
    get observations() {
      return [...observations];
    },
  };

  async function runTurn(input, handlers) {
    if (!policy) throw new HttpAdapterError(HTTP_ADAPTER_CODES.notBound, "send called before an evaluation policy was bound");
    const startedAt = Date.now();
    const effectiveDeadline = turnDeadlineMs ?? policy.limits?.turnDeadlineMs ?? null;

    // N-7: the automation run route carries the policy directly; there is no session to create.
    if (automationRun) {
      const automationId = policy.scope?.automationId ?? null;
      if (!automationId) {
        throw new HttpAdapterError(HTTP_ADAPTER_CODES.automationIdMissing, "an automation run requires scope.automationId (the automation id)");
      }
      const { response, timedOut } = await postJson(`/v1/automations/${encodeURIComponent(automationId)}/run`, { evaluation: policy }, input?.signal);
      if (timedOut) {
        lastResult = clientTerminalResult({ startedAt, reason: "turn-deadline-exceeded", error: "client automation deadline exceeded" });
        return "Stopped because the evaluation turn deadline was exceeded.";
      }
      const body = await response.json().catch(() => ({}));
      if (response.status < 200 || response.status >= 300) {
        // A route-level refusal (validation / skip) is not a turn; carry the
        // host's result only if it actually returned one.
        lastResult = body?.evaluation
          ? wireEvaluationResult(body.evaluation, { httpStatus: response.status, error: body?.error ?? `HTTP ${response.status}`, context: "automation run" })
          : null;
        throw new HttpAdapterError(HTTP_ADAPTER_CODES.turnRefused, `automation run refused (HTTP ${response.status}): ${body?.error ?? ""}`);
      }
      // A 2xx run executed a real turn under the bound policy: the host's actual
      // result is required on the wire. Missing/malformed fails closed.
      lastResult = wireEvaluationResult(body?.evaluation, { httpStatus: response.status, context: "automation run" });
      const reply = body?.run?.output ?? body?.run?.reply ?? "";
      observations.push({ kind: "automation", run: body?.run ?? null, evaluation: lastResult });
      return reply;
    }

    // Direct: create + bind once (POST /v1/sessions with `evaluation`), then one turn.
    if (createdSessionId === null) {
      const { response } = await postJson("/v1/sessions", {
        channel,
        profileId: policy.scope?.profileId,
        ...(model ? { model } : {}),
        evaluation: policy,
      }, input?.signal);
      const body = await response.json().catch(() => ({}));
      if (response.status < 200 || response.status >= 300 || typeof body?.sessionId !== "string") {
        lastResult = buildEvaluationResult({ terminalReason: "provider-error", httpStatus: response.status, startedAt, endedAt: Date.now(), executedTools: null, error: body?.error ?? `HTTP ${response.status}` });
        throw new HttpAdapterError(HTTP_ADAPTER_CODES.bindRefused, `could not create/bind an evaluation session (HTTP ${response.status}): ${body?.error ?? ""}`);
      }
      createdSessionId = body.sessionId;
    }

    const path = `/v1/sessions/${encodeURIComponent(createdSessionId)}/messages`;
    const collector = collectStreamEvents((event) => handlers?.onChunk?.(event?.delta ?? ""));
    const wantStream = useStream || Boolean(handlers);

    // The host owns the turn deadline. The client timeout fires only after it, as a backstop, so the host's
    // own terminal result (deadline / forbidden / budget / provider-error) is observed on the wire first.
    const clientDeadline = effectiveDeadline ? effectiveDeadline + CLIENT_DEADLINE_GRACE_MS : null;

    const { response, error, timedOut } = await fetchWithDeadline(
      fetchImpl,
      auth.base + path,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(wantStream ? { accept: "text/event-stream" } : {}),
          ...auth.headers(),
        },
        body: JSON.stringify({ message: input?.message ?? "" }),
      },
      { deadlineMs: clientDeadline, signal: input?.signal }
    );

    if (error) {
      if (timedOut || error?.name === "TimeoutError") {
        lastResult = clientTerminalResult({ startedAt, reason: "turn-deadline-exceeded", error: "client turn deadline backstop exceeded" });
        return "Stopped because the evaluation turn deadline was exceeded.";
      }
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.transportUnknown, `network error on the turn: the outcome is UNKNOWN and is not retried (${error?.message ?? error})`);
    }

    if (wantStream) {
      await readSse(response, (event) => collector.observe(event));
      const observed = collector.result();
      observations.push({ kind: "turn", observed });
      if (response.status < 200 || response.status >= 300) {
        lastResult = observed.evaluation
          ? wireEvaluationResult(observed.evaluation, { httpStatus: response.status, modelEvidence: observed.model, error: observed.error, context: "streamed turn" })
          : null;
        throw new HttpAdapterError(HTTP_ADAPTER_CODES.turnRefused, `turn refused (HTTP ${response.status}): ${observed.error ?? ""}`);
      }
      // The stream carried the host's actual result. Absent/malformed fails closed.
      lastResult = wireEvaluationResult(observed.evaluation, { httpStatus: response.status, modelEvidence: observed.model, error: observed.error, context: "streamed turn" });
      return observed.reply ?? "";
    }

    const body = await response.json().catch(() => ({}));
    if (response.status < 200 || response.status >= 300) {
      lastResult = body?.evaluation
        ? wireEvaluationResult(body.evaluation, { httpStatus: response.status, error: body?.error ?? `HTTP ${response.status}`, context: "turn" })
        : null;
      throw new HttpAdapterError(HTTP_ADAPTER_CODES.turnRefused, `turn refused (HTTP ${response.status}): ${body?.error ?? ""}`);
    }
    lastResult = wireEvaluationResult(body?.evaluation, {
      httpStatus: response.status,
      modelEvidence: Array.isArray(body?.usage?.calls) ? body.usage.calls.find((c) => typeof c?.modelId === "string")?.modelId ?? null : null,
      context: "turn",
    });
    observations.push({ kind: "turn", observed: { reply: body?.reply ?? "", usage: body?.usage ?? null, toolCalls: null } });
    return body?.reply ?? "";
  }
}

/**
 * The driver's `createHostSession` port, backed by the live HTTP routes. `({ caseId, sessionId })` builds a
 * fresh session for one case; binding is single-shot, so one session per case matches the host contract.
 */
export function createHttpSessionFactory(options = {}) {
  requireLiveGrant(options.liveGrant, "createHttpSessionFactory");
  return function createHostSession({ caseId = null, sessionId = null } = {}) {
    return createHttpHostSession({ ...options, caseId, sessionId });
  };
}

/** The N-7 variant: the same surface, addressed through the automation run route. */
export function createHttpAutomationSessionFactory(options = {}) {
  requireLiveGrant(options.liveGrant, "createHttpAutomationSessionFactory");
  return function createAutomationSession({ caseId = null, sessionId = null } = {}) {
    return createHttpHostSession({ ...options, automationRun: true, caseId, sessionId });
  };
}

/**
 * The live HTTP `automationApi` seam for `runOwnedAutomation` (N-7): start/stop the owned automation
 * worker, create exactly one definition, and run it once — each a real host route, each with no retry.
 * Returns `{ ok, ... }` rather than throwing where `runOwnedAutomation` expects a refusal object.
 */
export function createHttpAutomationApi({ fetchImpl = globalThis.fetch, auth, definitionBody = null, liveGrant = null } = {}) {
  if (typeof fetchImpl !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.fetchImpl, "fetchImpl must be a function");
  requireLiveGrant(liveGrant, "createHttpAutomationApi");
  if (!auth || typeof auth.headers !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, "an explicit auth identity is required");

  async function call(path, { body, method = "POST" } = {}) {
    let response;
    try {
      response = await fetchImpl(auth.base + path, {
        method,
        headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...auth.headers() },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      return { ok: false, detail: `network error on ${method} ${path}: not retried (${error?.message ?? error})` };
    }
    const parsed = await response.json().catch(() => ({}));
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, status: response.status, detail: parsed?.error ?? `HTTP ${response.status}`, body: parsed };
    }
    return { ok: true, status: response.status, body: parsed };
  }

  return {
    async startWorker() {
      return call("/v1/workers/automation/start");
    },
    async stopWorker() {
      return call("/v1/workers/automation/stop");
    },
    async createDefinition(definition) {
      const result = await call("/v1/automations", { body: { ...(definitionBody ?? {}), ...definition } });
      if (!result.ok) return result;
      const id = result.body?.automation?.id ?? result.body?.id ?? null;
      if (typeof id !== "string") return { ok: false, detail: "automation create returned no id" };
      return { ok: true, id, body: result.body };
    },
    async runOnce(automationId) {
      return call(`/v1/automations/${encodeURIComponent(automationId)}/run`, { body: {} });
    },
  };
}

/**
 * The live profile read/write seam for the N-7 **scoped automation eligibility** window
 * (`automation-eligibility.mjs` `withTemporaryAutomationEnabled`). It reads the one profile's read-only
 * surface and current `automationsEnabled`, and writes ONLY that one boolean — via the supported
 * `PUT /v1/profiles/:id` route (`apps/server/src/http/routes/profiles.ts`, whose mutable-field list includes
 * `automationsEnabled`). No other field is ever sent, so read-only tool policy cannot be touched.
 *
 * `read` canonicalizes the wire tool names (`plugin_research_dashboard__get_topic` → `get_topic`) so they
 * compare against the harness's own `FIXTURE_PROFILES` short names — the same canonicalization
 * `containment.mjs` applies. Requires a minted live grant (dispatch guard), like every live transport.
 */
export function createHttpProfileEligibilityApi({ fetchImpl = globalThis.fetch, auth, liveGrant = null } = {}) {
  if (typeof fetchImpl !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.fetchImpl, "fetchImpl must be a function");
  requireLiveGrant(liveGrant, "createHttpProfileEligibilityApi");
  if (!auth || typeof auth.headers !== "function") throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, "an explicit auth identity is required");
  const canonical = (name) => String(name).replace(/^(?:plugin_)?research_dashboard__/, "");

  return {
    async read(profileId) {
      let profileResponse;
      let toolsResponse;
      try {
        profileResponse = await fetchImpl(auth.base + `/v1/profiles/${encodeURIComponent(profileId)}`, { method: "GET", headers: { ...auth.headers() } });
        toolsResponse = await fetchImpl(auth.base + `/v1/profiles/${encodeURIComponent(profileId)}/tools`, { method: "GET", headers: { ...auth.headers() } });
      } catch (error) {
        return { ok: false, detail: `eligibility profile read not retried (${error?.message ?? error})` };
      }
      const profileBody = await profileResponse.json().catch(() => ({}));
      if (profileResponse.status < 200 || profileResponse.status >= 300) {
        return { ok: false, status: profileResponse.status, detail: profileBody?.error ?? `HTTP ${profileResponse.status}` };
      }
      const row = profileBody.profile ?? profileBody;
      const toolsBody = await toolsResponse.json().catch(() => ({}));
      return {
        ok: true,
        profileId,
        tools: (toolsBody.tools ?? []).map((tool) => canonical(tool?.name)).filter((name) => name.length > 0),
        skills: (row.skills ?? []).map((skill) => skill?.name).filter((name) => typeof name === "string"),
        automationsEnabled: row.automationsEnabled === true,
      };
    },
    async write(profileId, patch) {
      const keys = Object.keys(patch ?? {});
      if (keys.length !== 1 || keys[0] !== "automationsEnabled" || typeof patch.automationsEnabled !== "boolean") {
        throw new HttpAdapterError(HTTP_ADAPTER_CODES.authRequired, `eligibility write may set only automationsEnabled (got ${keys.join(",")})`);
      }
      let response;
      try {
        response = await fetchImpl(auth.base + `/v1/profiles/${encodeURIComponent(profileId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json", ...auth.headers() },
          body: JSON.stringify({ automationsEnabled: patch.automationsEnabled }),
        });
      } catch (error) {
        return { ok: false, detail: `eligibility write not retried (${error?.message ?? error})` };
      }
      if (response.status < 200 || response.status >= 300) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, status: response.status, detail: body?.error ?? `HTTP ${response.status}` };
      }
      return { ok: true, status: response.status };
    },
  };
}
