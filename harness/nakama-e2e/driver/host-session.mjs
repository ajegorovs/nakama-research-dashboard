/**
 * The **real** host evaluation contract the owning driver binds against, plus an offline host-session seam
 * built on the pinned host's own guard engine.
 *
 * The host-amendment ruling (`NAKAMA-E2E-HOST-AMENDMENT.md`) fixes the supported binding as the in-process
 * agent session (`bindEvaluationPolicy` / `getEvaluationResult` / `getEvaluationToken` / `send` /
 * `sendStream`) or the automation caller argument — there is **no** `assertDefaultInert`/`armPolicy`/
 * `preDispatchBatch` API. This module encodes the contract with the host's actual method names so the driver
 * cannot drift onto a fabricated interface:
 *
 *   - `HOST_SESSION_REQUIRED_METHODS` is the exact surface the driver requires; `assertHostSession` is
 *     fail-closed if any method is missing, so the driver refuses rather than running against an unamended
 *     host.
 *   - `isDefaultInert(session)` is the driver's inertness proof: an unbound host session returns `null` from
 *     both `getEvaluationResult()` and `getEvaluationToken()`.
 *   - `dispatchLogFromResult(result)` maps the host's `EvaluationTurnResult.forbidden` record onto the
 *     driver's dispatch log, so a forbidden attempt is observed exactly as the host records it.
 *   - `createScriptedHostSession(...)` is a **reference host session** for the driver's offline tests. Its
 *     policy decisions are delegated to the **pinned host's own** `createEvaluationTurnGuard` (injected by
 *     the test from the host checkout), so the tests exercise the real guard semantics — not a parallel
 *     re-implementation. The surrounding turn loop is a local stand-in for the host's `send`; the end-to-end
 *     agent assembly (send/sendStream/automation with an injected provider) is verified in the host repo.
 */
import { createHash } from "node:crypto";

/** The real `AgentChatSession` evaluation-control surface the driver binds against. */
export const HOST_SESSION_REQUIRED_METHODS = Object.freeze([
  "bindEvaluationPolicy",
  "getEvaluationResult",
  "getEvaluationToken",
  "send",
  "sendStream",
]);

/** Fixed reason codes for missing/ill-formed host sessions. */
export const HOST_SESSION_CODES = Object.freeze({
  absent: "host_session_absent",
  illFormed: "host_session_illformed",
  notInert: "host_policy_not_inert",
  bindRefused: "host_bind_refused",
});

/**
 * Validate a supplied host session. Returns `{ ok, code, failures }`; fail-closed when absent or missing a
 * required method, so the driver refuses rather than running against an unamended host.
 */
export function assertHostSession(session) {
  if (session === null || session === undefined) {
    return { ok: false, code: HOST_SESSION_CODES.absent, failures: ["no host session supplied"] };
  }
  if (typeof session !== "object") {
    return { ok: false, code: HOST_SESSION_CODES.illFormed, failures: ["host session is not an object"] };
  }
  const failures = [];
  for (const method of HOST_SESSION_REQUIRED_METHODS) {
    if (typeof session[method] !== "function") failures.push(`host session is missing ${method}()`);
  }
  return { ok: failures.length === 0, code: failures.length ? HOST_SESSION_CODES.illFormed : null, failures };
}

/** True when an unbound host session reports no token and no last result. */
export function isDefaultInert(session) {
  return session.getEvaluationToken() === null && session.getEvaluationResult() === null;
}

/**
 * Derive the driver's dispatch log from a host `EvaluationTurnResult`. The host records exactly one
 * forbidden attempt per stopped turn (the first non-allowlisted name); a denied call therefore appears once,
 * not dispatched.
 */
export function dispatchLogFromResult(result) {
  const forbidden = result?.forbidden ?? null;
  if (!forbidden) return [];
  return [
    {
      arguments: forbidden.arguments,
      dispatched: false,
      name: forbidden.tool,
      policyReason: forbidden.policyReason,
      reason: forbidden.reason,
    },
  ];
}

/** Local sha256(`eval-<hex24>`) — byte-identical to the host's `deriveConversationToken`. */
export function localDeriveConversationToken(seed) {
  if (typeof seed !== "string" || seed.trim().length === 0) throw new Error("a non-empty pseudonymous seed is required");
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  return `eval-${digest}`;
}

/**
 * Build an `EvaluationPolicyBinding` for one case. `deriveToken` should be the host's
 * `deriveConversationToken`; it defaults to the byte-identical local sha256 form (a test binds the two).
 */
export function buildEvaluationBinding({
  caseId,
  scope,
  allowedTools,
  limits,
  deriveToken = localDeriveConversationToken,
}) {
  if (typeof caseId !== "string" || caseId.length === 0) throw new Error("buildEvaluationBinding: caseId is required");
  return {
    allowedTools: [...allowedTools],
    conversationToken: deriveToken(caseId),
    limits: { ...limits },
    scope: {
      orgId: scope.orgId,
      profileId: scope.profileId,
      ...(scope.automationId ? { automationId: scope.automationId } : {}),
    },
  };
}

/**
 * A reference host session for the driver's offline tests.
 *
 * `createGuard` is the pinned host's real `createEvaluationTurnGuard`. `script` is an ordered list of
 * generations: `{ toolCalls, content }`, or `{ hang: true }` to stall until the turn deadline fires. The
 * session implements the real contract methods and delegates every policy decision to the injected guard:
 * the model-generation budget is checked before each generation, and every tool batch is admitted through
 * `admitToolBatch` (forbidden-first, whole-batch-or-none, discovery counted).
 */
export function createScriptedHostSession({ policy = null, script, createGuard } = {}) {
  if (typeof createGuard !== "function") {
    throw new Error("createScriptedHostSession: createGuard (the host guard factory) is required");
  }
  if (!Array.isArray(script)) throw new Error("createScriptedHostSession: script must be an array");
  let guard = null;
  let policyBound = false;
  let lastResult = null;
  let controller = null;
  let timer = null;

  function armDeadline() {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(new Error("Evaluation turn deadline exceeded.")), guard.limits.turnDeadlineMs);
  }
  function disposeDeadline() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  const session = {
    bindEvaluationPolicy(next) {
      if (policyBound) throw new Error("An evaluation policy is already bound to this session.");
      guard = createGuard(next);
      policyBound = true;
    },
    getEvaluationResult() {
      return lastResult;
    },
    getEvaluationToken() {
      return policyBound ? guard.conversationToken : null;
    },
    async send({ message, signal } = {}) {
      if (!policyBound) throw new Error("send called before an evaluation policy was bound");
      lastResult = null;
      armDeadline();
      let reason = "completed";
      try {
        for (let index = 0; index < script.length; index += 1) {
          if (controller.signal.aborted) {
            reason = "turn-deadline-exceeded";
            break;
          }
          if (!guard.canStartModelGeneration()) {
            reason = "model-generation-budget-exhausted";
            break;
          }
          const generation = script[index];
          const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
          if (generation.hang) {
            await new Promise((_resolve, reject) => {
              combined.addEventListener("abort", () => reject(combined.reason ?? new Error("aborted")), { once: true });
            });
          }
          guard.recordModelGeneration();
          const toolCalls = generation.toolCalls ?? [];
          if (toolCalls.length === 0) {
            return generation.content ?? "";
          }
          const admission = guard.admitToolBatch(
            toolCalls.map((call) => ({ arguments: call.arguments, name: call.name }))
          );
          if (!admission.ok) {
            reason = admission.reason;
            break;
          }
        }
      } catch {
        reason = controller.signal.aborted ? "turn-deadline-exceeded" : "cancelled";
      } finally {
        disposeDeadline();
        lastResult = guard.result(reason, true);
      }
      if (reason === "turn-deadline-exceeded") return "Stopped because the evaluation turn deadline was exceeded.";
      if (reason === "forbidden-tool") return "Stopped because a forbidden tool call was attempted.";
      if (reason === "tool-call-budget-exhausted") return "Stopped because this turn's tool-call budget was exhausted.";
      if (reason === "model-generation-budget-exhausted") return "Stopped because this turn reached its model-generation budget.";
      if (reason === "cancelled") return "Stopped: cancelled.";
      return script.at(-1)?.content ?? "";
    },
    async sendStream(input, handlers) {
      const reply = await session.send(input);
      handlers?.onChunk?.(reply);
      return reply;
    },
  };
  return session;
}

/** A reference session before any policy is bound; the driver proves it inert before arming. */
export function createUnboundScriptedSession({ createGuard, script } = {}) {
  return createScriptedHostSession({ policy: null, script, createGuard });
}
