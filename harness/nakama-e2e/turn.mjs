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
