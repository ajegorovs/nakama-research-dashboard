/**
 * Validate the **actual** tool-call trace of an agent turn from the platform database.
 *
 * The public messages endpoint returns only `{role, content}`, so an assertion built on it silently
 * passes (workflow-audit §3 gap 5, recovered README §5). The truth source is
 * `session_messages.payload -> toolCalls[]` on the assistant rows, ordered by `seq`.
 *
 * A read-only case that "requires consultation" — an answer that must rest on a plugin read — fails when
 * the trace is absent, empty or malformed, because a missing trace is indistinguishable from "the tool
 * was never called" and must not be scored as a pass. Never retries on its own.
 */
import { Database } from "bun:sqlite";
import { WRITE_ACTIONS } from "./limits.mjs";
import { READ_TOOLS } from "./driver/cases.mjs";
import { STOP_REASONS } from "./driver/stop-latch.mjs";

// The *only* namespaces that canonicalize to a bare action key. A foreign plugin's action
// (`plugin_<other>__get_overview`) is deliberately left verbatim so it can never collide with a
// permitted action of the experiment's own plugin; it then fails the positive allowlist.
const PLUGIN_PREFIX = /^(?:plugin_)?research_dashboard__/;

/** Map a materialized tool name to the plugin action key (normalizes only the `research_dashboard__` namespace). */
export function normalizeToolName(name) {
  if (typeof name !== "string" || name.length === 0) return null;
  return name.replace(PLUGIN_PREFIX, "");
}

export function isWriteToolCall(name) {
  const key = normalizeToolName(name);
  return key !== null && WRITE_ACTIONS.includes(key);
}

/**
 * Parse ordered `session_messages` rows into tool calls. Rows are `[{ seq, payload }]`, `payload` a JSON
 * string (or an already-parsed object). Returns `{ ok, calls, reason }`; a non-JSON or non-object payload
 * fails closed with `reason = "malformed_trace"`.
 */
export function parseToolCalls(rows) {
  if (!Array.isArray(rows)) return { ok: false, calls: [], reason: "malformed_trace" };
  const ordered = [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const calls = [];
  for (const row of ordered) {
    let payload = row?.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { return { ok: false, calls: [], reason: "malformed_trace" }; }
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, calls: [], reason: "malformed_trace" };
    }
    for (const call of payload.toolCalls ?? []) {
      if (call === null || typeof call !== "object") return { ok: false, calls: [], reason: "malformed_trace" };
      calls.push({ args: call.arguments ?? call.args ?? null, name: call.name ?? null });
    }
  }
  return { ok: true, calls, reason: "ok" };
}

/**
 * Validate a trace for a case. `requireConsultation` is true for cases whose answer must rest on a plugin
 * read; then an absent/empty trace is a failure, never a pass.
 */
export function validateTrace({ rows, requireConsultation = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: !requireConsultation, calls: [], writeCalls: [], reason: "absent_trace" };
  }
  const parsed = parseToolCalls(rows);
  if (!parsed.ok) return { ...parsed, writeCalls: [] };
  if (requireConsultation && parsed.calls.length === 0) {
    return { ok: false, calls: [], writeCalls: [], reason: "empty_trace" };
  }
  const writeCalls = parsed.calls.filter((c) => isWriteToolCall(c.name));
  return { ok: true, calls: parsed.calls, writeCalls, reason: "ok" };
}

/** A read-only case passes the no-write half iff no write tool call appears in the trace. */
export function assertNoWriteCall(trace) {
  if (trace.writeCalls.length > 0) {
    return { ok: false, failures: [`write tool called: ${trace.writeCalls.map((c) => c.name).join(", ")}`] };
  }
  return { ok: true, failures: [] };
}

/**
 * Read `session_messages` for one session from a platform SQLite file (read-only). This is the only place
 * the harness opens the platform DB; it is exercised offline against a scratch copy in the tests.
 * Returns rows `[{ seq, payload }]` for `extractToolCalls`.
 */
export function readSessionMessages(platformDbPath, sessionId) {
  const db = new Database(platformDbPath, { readonly: true });
  try {
    return db
      .query("SELECT seq, payload FROM session_messages WHERE session_id = ? ORDER BY seq")
      .all(sessionId);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// Full per-turn trace materialization for the owning driver.
//
// `validateTrace` above answers a narrow no-write question. The owning driver additionally needs the
// **full ordered** evidence the host-amendment ruling requires for every measured turn: the exact
// arguments of every call, the final answer, and the model/usage evidence — all from the same
// `session_messages.payload -> toolCalls[]` truth source. Anything malformed fails closed.
// ---------------------------------------------------------------------------------------------------

/**
 * Materialize the full ordered turn trace. Rows are `[{ seq, payload }]`; `payload` a JSON string or an
 * already-parsed object (as `readSessionMessages` returns). Returns:
 *
 *   `{ ok, reason, rows, calls, callsWithArgs, answer, usage, model, provider }`
 *
 * `calls` is `[{ name, args, id }]` in the store's `seq` order across every assistant row;
 * `callsWithArgs` is the same list (the ruling names "ordered trace/arguments" separately, so the driver
 * records arguments explicitly). `answer` is the last assistant `content`. A missing, empty, non-JSON,
 * non-object or malformed payload yields `ok: false` with `reason = "malformed_trace"` — never a partial
 * pass. `usage`/`model`/`provider` are surfaced when present and left `null` (not invented) otherwise; the
 * classifier decides whether their absence is terminal.
 */
export function parseTurnTrace(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "absent_trace", rows: [], calls: [], callsWithArgs: [], failedCalls: [], answer: null, usage: null, model: null, provider: null };
  }
  const ordered = [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const calls = [];
  const assistant = [];
  let usage = null;
  let model = null;
  let provider = null;
  let sawAssistant = false;
  for (const row of ordered) {
    let payload = row?.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return { ok: false, reason: "malformed_trace", rows: ordered, calls: [], callsWithArgs: [], failedCalls: [], answer: null, usage: null, model: null, provider: null };
      }
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, reason: "malformed_trace", rows: ordered, calls: [], callsWithArgs: [], failedCalls: [], answer: null, usage: null, model: null, provider: null };
    }
    const role = payload.role ?? null;
    if (role === "assistant") {
      sawAssistant = true;
      if (typeof payload.content === "string") assistant.push(payload.content);
      if (payload.usage && typeof payload.usage === "object") usage = payload.usage;
      if (typeof payload.model === "string") model = payload.model;
      if (typeof payload.modelId === "string" && model === null) model = payload.modelId;
      // The amended host persists the serving model as `usage.modelId` (the bare wire model id) — the
      // assistant `ChatMessage` carries no top-level `model`. Surface it so the driver's bound-model check
      // compares the model the host actually reports (this is the sole model evidence the real host writes).
      if (model === null && payload.usage && typeof payload.usage === "object" && typeof payload.usage.modelId === "string") model = payload.usage.modelId;
      if (typeof payload.provider === "string") provider = payload.provider;
      const failedNames = new Set(
        [
          ...(Array.isArray(payload.failedToolCalls) ? payload.failedToolCalls : []),
          ...(Array.isArray(payload.toolResults) ? payload.toolResults.filter((r) => r && r.error).map((r) => r.name ?? r.tool) : []),
        ].filter((n) => typeof n === "string")
      );
      for (const call of payload.toolCalls ?? []) {
        if (call === null || typeof call !== "object") {
          return { ok: false, reason: "malformed_trace", rows: ordered, calls: [], callsWithArgs: [], failedCalls: [], answer: null, usage: null, model: null, provider: null };
        }
        const name = call.name ?? null;
        const failed = call.error !== undefined && call.error !== null && call.error !== false ? true : failedNames.has(name);
        calls.push({ args: call.arguments ?? call.args ?? null, failed, id: call.id ?? null, name });
      }
    }
  }
  if (!sawAssistant) {
    return { ok: false, reason: "empty_trace", rows: ordered, calls: [], callsWithArgs: [], failedCalls: [], answer: null, usage: null, model: null, provider: null };
  }
  return {
    ok: true,
    reason: "ok",
    rows: ordered,
    calls,
    callsWithArgs: calls.map((c) => ({ name: c.name, arguments: c.args })),
    failedCalls: calls.filter((c) => c.failed).map((c) => c.name),
    answer: assistant.length ? assistant[assistant.length - 1] : null,
    usage,
    model,
    provider,
  };
}

/**
 * Classify a materialized turn as a terminal pass/fail for the driver's atomic experiment. Returns
 * `{ ok, terminal, codes, failures }`. Fail-closed and ordered so the **strongest** terminal cause is
 * reported first; any failure is terminal (there are no retries).
 *
 * Inputs:
 *   - `trace`            — `parseTurnTrace` output;
 *   - `allowedCalls`     — the case's effective pre-dispatch allowlist; a call not on it is forbidden;
 *   - `dispatchLog`      — host-control attempts (`{ name, reason, dispatched }`); a denied entry is a
 *                          terminal forbidden attempt (N-6's writer denial is `writer_dispatch_denied`);
 *   - `requireConsultation` — an absent/empty trace then fails (never a pass);
 *   - `requireRead`      — the turn must contain at least one **successfully dispatched dashboard read**;
 *                          a `find_tools`-only trace is `readless_trace` and a read whose call failed is
 *                          `failed_read` (both terminal). `find_tools` alone is never sufficient consultation.
 *   - `expectedModel` / `expectedProvider` — bound identities; a mismatch (or missing evidence) is terminal;
 *   - `abortReason`      — a host turn-deadline abort (`timeout`/`cancelled`);
 *   - `budgetExceeded`   — a budget tracker refusal.
 */
export function classifyTurnTrace({
  trace,
  allowedCalls = null,
  dispatchLog = [],
  requireConsultation = false,
  requireRead = false,
  expectedModel = null,
  expectedProvider = null,
  abortReason = null,
  budgetExceeded = false,
} = {}) {
  const failures = [];
  const push = (code, message) => failures.push({ code, message });
  const allowed = allowedCalls === null ? null : new Set(allowedCalls);

  if (budgetExceeded) push(STOP_REASONS.budgetExceeded, "a budget counter refused the turn");
  if (abortReason) {
    push(abortReason === "cancelled" ? STOP_REASONS.cancelled : STOP_REASONS.timeout, `turn aborted: ${abortReason}`);
  }

  // A denied pre-dispatch attempt is terminal even if the traced rows look otherwise well-formed.
  for (const attempt of dispatchLog) {
    if (attempt?.dispatched === false) {
      const isWriter = attempt.name && WRITE_ACTIONS.includes(normalizeToolName(attempt.name));
      push(
        isWriter ? STOP_REASONS.writerDispatchDenied : STOP_REASONS.forbiddenToolCall,
        `pre-dispatch denied ${attempt.name ?? "(unknown)"} (${attempt.reason ?? "denied"})`
      );
    }
  }

  if (!trace || trace.ok !== true) {
    const reason = trace?.reason === "absent_trace" ? STOP_REASONS.missingTrace : STOP_REASONS.malformedTrace;
    push(reason, `trace not usable (${trace?.reason ?? "missing"})`);
    return { ok: false, terminal: true, codes: failures.map((f) => f.code), failures };
  }

  for (const call of trace.calls) {
    // The model calls a plugin tool under its namespaced name
    // (`plugin_<id>__<action>`); the allowlist is written against the canonical
    // action key, so compare the normalized identity.
    const canonical = typeof call.name === "string" ? normalizeToolName(call.name) : null;
    if (allowed && (canonical === null || !allowed.has(canonical))) {
      push(STOP_REASONS.forbiddenToolCall, `tool call not allowlisted: ${call.name ?? "(missing name)"}`);
    }
  }

  if (requireConsultation && trace.calls.length === 0) {
    push(STOP_REASONS.emptyTrace, "a consultation case produced no tool call");
  }

  // Reviewer corrections, item 3: every case must contain at least one **successfully dispatched dashboard
  // read**. `find_tools` (discovery) alone is a readless trace; a read whose call failed is a failed read.
  if (requireRead) {
    const readCalls = trace.calls.filter((call) => READ_TOOLS.includes(normalizeToolName(call.name)));
    if (readCalls.length === 0) {
      push(STOP_REASONS.readlessTrace, "the turn made no dashboard read call (find_tools alone is not consultation)");
    } else if (!readCalls.some((call) => call.failed !== true)) {
      push(STOP_REASONS.failedRead, "the turn's dashboard read call(s) all failed");
    }
  }

  if (expectedModel) {
    if (typeof trace.model !== "string" || trace.model.length === 0) {
      push(STOP_REASONS.modelEvidenceMissing, "the turn carried no model identity evidence");
    } else if (trace.model !== expectedModel) {
      push(STOP_REASONS.modelMismatch, `reported model ${trace.model} != bound ${expectedModel}`);
    }
  }
  if (expectedProvider) {
    if (typeof trace.provider !== "string" || trace.provider.length === 0) {
      push(STOP_REASONS.providerMismatch, "the turn carried no provider identity evidence");
    } else if (trace.provider !== expectedProvider) {
      push(STOP_REASONS.providerMismatch, `reported provider ${trace.provider} != bound ${expectedProvider}`);
    }
  }
  if (!trace.usage || typeof trace.usage !== "object") {
    push(STOP_REASONS.usageEvidenceMissing, "the turn carried no usage evidence");
  }

  return { ok: failures.length === 0, terminal: failures.length > 0, codes: failures.map((f) => f.code), failures };
}
