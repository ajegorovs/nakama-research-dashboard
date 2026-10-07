/**
 * The agent/model turn driver — present but **default blocked**.
 *
 * This preparation builds and validates everything up to the first model turn and stops there. The
 * reviewer's rule is explicit: the agent/model run function must default blocked and must not be executed
 * here. So `runAgentTurn` refuses before any I/O unless it is handed an explicit, verified authorization;
 * no such authorization exists in this envelope, so the gate is shut.
 *
 * The payload builders are pure and offline-testable; only `runAgentTurn` would ever touch the network,
 * and it cannot, by default.
 */
import { createClient } from "./client.mjs";
import { validateTrace } from "./trace.mjs";

export class InferenceBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = "InferenceBlockedError";
  }
}

/** The hard switch for this preparation: inference is not authorized. */
export const INFERENCE_AUTHORIZED = false;

/**
 * Fail-closed interlock. Returns normally only when a caller supplies an explicit authorization whose
 * `executionAuthorized` is exactly `true` **and** whose pinned revision matches. In this preparation no
 * authorization is ever supplied, so it always throws.
 */
export function assertInferenceAuthorized(context = {}) {
  if (INFERENCE_AUTHORIZED !== true) {
    throw new InferenceBlockedError(
      "inference is blocked in this preparation: the agent/model turn driver may not run before the " +
        "provider/model and bounded run protocol are separately approved"
    );
  }
  if (context.executionAuthorized !== true) {
    throw new InferenceBlockedError("no execution authorization supplied");
  }
  return true;
}

/** Pure: the request body for one turn. Offline-testable; performs no call. */
export function buildMessageRequest(message) {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new InferenceBlockedError("a non-empty message is required");
  }
  return { message };
}

/**
 * Run one agent turn. Refuses by default; when it eventually runs it would post one message and read the
 * ordered tool-call trace back from the platform DB. Never reached in this preparation.
 */
export async function runAgentTurn({ base, email, password, pluginId, sessionId, message, executionAuthorized, fetchImpl }) {
  assertInferenceAuthorized({ executionAuthorized });
  const client = createClient({ base, email, password, pluginId, fetchImpl });
  await client.login();
  const request = buildMessageRequest(message);
  const response = await client.post(`/v1/sessions/${sessionId}/messages`, request);
  return { reply: response.body?.reply ?? null, status: response.status };
}

/** Convenience: validate a captured trace for a case, re-exported so a runner need not import two modules. */
export { validateTrace };

// ---------------------------------------------------------------------------------------------------
// The owning driver's turn port.
//
// `runAgentTurn` above is the narrow scaffold the preparation slice needed. The owning driver needs a
// turn port it can inject, bind to an authorization and arm a host-control policy around. This port is
// **default blocked** in exactly the same way: `assertInferenceAuthorized` runs first, `INFERENCE_AUTHORIZED`
// is still false, and no authorization record in this envelope grants execution — so a default port can
// never post a message. The offline driver tests inject a *real adapter seam* (a local, in-process turn
// writer) to exercise the sequence end-to-end; nothing here contacts a provider.
// ---------------------------------------------------------------------------------------------------

export const TURN_ERROR_CODES = Object.freeze({
  emptyPrompt: "turn_prompt_empty",
  caseNotAuthorized: "turn_case_not_authorized",
  allowlistMissing: "turn_allowlist_missing",
});

/**
 * Pure: the exact request descriptor for one authorized turn. Refuses an empty prompt. `sessionId` and the
 * bound `model`/`provider` are carried so the driver records what it asked for; the body is still just
 * `{ message }` — the host derives everything else.
 */
export function buildAuthorizedTurnRequest({ prompt, sessionId, model = null, provider = null } = {}) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new InferenceBlockedError(TURN_ERROR_CODES.emptyPrompt);
  }
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new InferenceBlockedError("a sessionId is required to address a turn");
  }
  return { sessionId, body: { message: prompt }, model, provider };
}

/**
 * Pure: assert the case is authorized to turn and that a non-empty effective allowlist is bound for it.
 * Fails closed; the driver calls this before it arms a policy or touches the store.
 */
export function assertTurnAuthorized({ authorization, caseId } = {}) {
  if (!authorization || !Array.isArray(authorization.cases) || !authorization.cases.includes(caseId)) {
    return { ok: false, code: TURN_ERROR_CODES.caseNotAuthorized, message: `case ${caseId} is not in the authorization's case set` };
  }
  const allow = authorization.effectiveAllowedCalls?.[caseId];
  if (!Array.isArray(allow) || allow.length === 0) {
    return { ok: false, code: TURN_ERROR_CODES.allowlistMissing, message: `no effective allowlist bound for case ${caseId}` };
  }
  return { ok: true, code: null, message: "" };
}

/**
 * Build the **default** turn port. It is the real transport seam in shape, but blocked: it always throws
 * `InferenceBlockedError` (via `assertInferenceAuthorized`) before any I/O. The driver accepts an injected
 * port, so an offline test can substitute a local adapter without weakening this default.
 */
export function createAuthorizedTurnPort({ client, sessionId, model, provider } = {}) {
  return async function turnPort({ prompt, signal } = {}) {
    assertInferenceAuthorized({ executionAuthorized: false });
    // Unreachable in this envelope: the interlock throws first. Kept faithful to the real shape so the
    // port is a real seam rather than a stub that returns undefined.
    const request = buildAuthorizedTurnRequest({ prompt, sessionId, model, provider });
    return client.post(`/v1/sessions/${request.sessionId}/messages`, request.body, { signal });
  };
}

/** Convenience: the whole default (blocked) turn, for a caller that wants one call rather than a port. */
export async function runDriverTurn({ prompt, sessionId, model, provider, client } = {}) {
  const port = createAuthorizedTurnPort({ client, sessionId, model, provider });
  return port({ prompt });
}
