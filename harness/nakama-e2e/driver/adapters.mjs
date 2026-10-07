/**
 * Real, in-process adapter seams for the driving tests.
 *
 * The host-amendment ruling's tests must exercise the driver against a **real adapter seam**, not a
 * no-op fake. This module uses a genuine SQLite `session_messages` table and the driver's real
 * `readSessionMessages` reader, and the turn seam is the host **evaluation session** contract
 * (`bindEvaluationPolicy` / `getEvaluationResult` / `getEvaluationToken` / `send` / `sendStream`) whose
 * policy decisions run through the **pinned host's own** `createEvaluationTurnGuard` (injected as
 * `createGuard`) — see `host-session.mjs`. Nothing here contacts a provider or a model.
 */
import { Database } from "bun:sqlite";
import { readSessionMessages } from "../trace.mjs";
import { createScriptedHostSession } from "./host-session.mjs";

/** A real SQLite session store shaped exactly like the platform's `session_messages` table. */
export function createSessionStore(dbPath) {
  const db = new Database(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS session_messages (session_id TEXT, seq INTEGER, payload TEXT)");
  let seq = 0;
  return {
    append(sessionId, payload) {
      seq += 1;
      db.query("INSERT INTO session_messages VALUES (?, ?, ?)").run(sessionId, seq, JSON.stringify(payload));
      return seq;
    },
    count() {
      return db.query("SELECT COUNT(*) AS n FROM session_messages").get().n;
    },
    close() {
      db.close();
    },
    path: dbPath,
  };
}

/**
 * The driver's real trace reader over a scratch platform DB: `readSessionMessages` scoped to the addressed
 * session, exactly as a live per-case read would be.
 */
export function createTraceReader(dbPath) {
  return ({ sessionId }) => readSessionMessages(dbPath, sessionId);
}

/** Map a case plan (`{ calls, answer, hang }`) onto the host-session script (an ordered generation list). */
function scriptFromPlan(plan) {
  if (plan?.hang) return [{ hang: true }];
  const calls = plan?.calls ?? [];
  if (calls.length === 0) return [{ content: plan?.answer ?? "" }];
  // gen 1 carries the tool calls; gen 2 writes the answer from the (admitted) result.
  return [{ content: "", toolCalls: calls }, { content: plan?.answer ?? "" }];
}

/**
 * A host evaluation session standing in for the amended host's send seam, backed by the pinned host guard.
 *
 * `createGuard` is the real `createEvaluationTurnGuard` (see `host-evaluation-core.mjs`). `plan({ prompt,
 * caseId })` returns `{ calls, answer, hang }`. The port:
 *   1. binds the case policy once (single-shot, like the host);
 *   2. runs the plan through the guard — a denied batch launches nothing and writes no trace (the denial is
 *      observed through `getEvaluationResult().forbidden`);
 *   3. `hang: true` stalls until the policy turn deadline aborts the turn;
 *   4. on a completed turn, writes one assistant row carrying the ordered tool calls, answer, usage, model
 *      and provider — the exact trace the driver reads back.
 */
export function createHostSessionPort({
  store,
  caseId = null,
  sessionId = "fixture-session",
  model = "deepseek-v4.1-flash",
  provider = "opencode-go",
  usage = { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  plan = () => ({ calls: [], answer: "(no plan)" }),
  createGuard,
} = {}) {
  if (typeof createGuard !== "function") throw new Error("createHostSessionPort: createGuard (host guard factory) is required");
  let policy = null;
  let lastInner = null;

  const session = {
    bindEvaluationPolicy(next) {
      if (policy) throw new Error("An evaluation policy is already bound to this session.");
      policy = next;
    },
    getEvaluationResult() {
      return lastInner ? lastInner.getEvaluationResult() : null;
    },
    getEvaluationToken() {
      return policy ? policy.conversationToken : null;
    },
    async send(input = {}) {
      if (!policy) throw new Error("send called before an evaluation policy was bound");
      const script = scriptFromPlan(plan({ caseId, prompt: input.message }));
      const inner = createScriptedHostSession({ createGuard, policy, script });
      inner.bindEvaluationPolicy(policy);
      const reply = await inner.send({ message: input.message, signal: input.signal });
      lastInner = inner;
      const result = inner.getEvaluationResult();
      const hung = script.some((generation) => generation.hang);
      if (!hung && result?.terminalReason === "completed") {
        const failRead = plan({ caseId, prompt: input.message })?.failRead === true;
        const toolCalls = script.flatMap((generation) => generation.toolCalls ?? []).map((call) => (failRead ? { ...call, error: "read failed (injected)" } : call));
        store.append(sessionId, {
          content: reply,
          model,
          provider,
          role: "assistant",
          toolCalls,
          usage,
        });
      }
      return reply;
    },
    async sendStream(input, handlers) {
      const reply = await session.send(input);
      handlers?.onChunk?.(reply);
      return reply;
    },
    /** The id the platform DB rows for this session are stored under (the driver reads the trace by it). */
    get sessionId() {
      return sessionId;
    },
  };
  return session;
}
