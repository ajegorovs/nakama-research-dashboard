/**
 * Manual-automation preparation for N-7 — definition building is pure; running is default blocked.
 *
 * N-7 (the wrapper case) is **downstream of direct validation**: its run function additionally requires
 * that the direct agent-turn cases already passed, and it is inference, so it is blocked in this
 * preparation like the direct turn driver. Creating the definition is a platform write and is likewise
 * gated behind an explicit `allowPlatformWrite` flag (false by default), so preparation cannot mutate a
 * fixture by accident.
 */
import { InferenceBlockedError, assertInferenceAuthorized } from "./turn.mjs";

export class AutomationBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = "AutomationBlockedError";
  }
}

/** Pure: the definition of a manual-trigger, read-only automation for one fixed prompt. */
export function buildAutomationDefinition({ name, prompt, profileId }) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new AutomationBlockedError("automation name is required");
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new AutomationBlockedError("automation prompt is required");
  }
  if (typeof profileId !== "string" || profileId.length === 0) {
    throw new AutomationBlockedError("automation profileId is required");
  }
  return { name, prompt, profileId, trigger: "manual", readOnly: true };
}

/**
 * Install (create) the automation definition. Refuses unless `allowPlatformWrite === true`; there is no
 * such grant in this preparation, so this throws before any call.
 */
export async function installAutomation({ client, definition, allowPlatformWrite = false }) {
  if (allowPlatformWrite !== true) {
    throw new AutomationBlockedError("automation creation is a platform write; not allowed during preparation");
  }
  return client.post("/v1/automations", definition);
}

/**
 * Run one manual automation. Requires BOTH direct-validation success and an inference authorization; both
 * default false, so this throws before any I/O. `directValidated` encodes "N-7 runs only after the direct
 * turn cases passed".
 */
export async function runAutomation({ client, automationId, directValidated = false, executionAuthorized }) {
  if (directValidated !== true) {
    throw new AutomationBlockedError(
      "N-7 is downstream of direct validation: run the direct agent-turn cases successfully first"
    );
  }
  assertInferenceAuthorized({ executionAuthorized });
  return client.post(`/v1/automations/${automationId}/run`, {});
}

export { InferenceBlockedError };
