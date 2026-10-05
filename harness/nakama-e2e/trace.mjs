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

const PLUGIN_PREFIX = /^(?:plugin_)?research_dashboard__/;

/** Map a materialized tool name to the plugin action key (normalizes the `research_dashboard__` prefix). */
export function normalizeToolName(name) {
  if (typeof name !== "string" || name.length === 0) return null;
  return name.replace(PLUGIN_PREFIX, "").replace(/^plugin_[a-z0-9_]+__/, "");
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
