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

// ---------------------------------------------------------------------------------------------------
// The owning driver's N-7 manual-automation wrapper.
//
// The ruling: start only the owned worker after direct/instrumentation success, invoke exactly one
// approved manual definition/run, collect evidence and stop the owned worker again. And explicitly:
// **do not treat an unverified `readOnly` property as a boundary.** So `runOwnedAutomation` never branches
// on `definition.readOnly` for safety; the boundary is the host-control pre-dispatch allowlist plus the
// driver's post-turn no-write proof. `readOnly` remains as declared intent in the definition only.
//
// This is still inference: it is blocked by default in this envelope because the turn itself is
// (`INFERENCE_AUTHORIZED` is false), and because a real run needs the amended-host contract. The wrapper
// itself is offline-testable with injected worker/run seams.
// ---------------------------------------------------------------------------------------------------

/** The wrapper does not treat `readOnly` as a security property; this documents the decision in code. */
export const READONLY_IS_NOT_A_BOUNDARY = true;

export const AUTOMATION_ERROR_CODES = Object.freeze({
  downstream: "automation_not_downstream_validated",
  apiIncomplete: "automation_api_incomplete",
  definitionNotManual: "automation_definition_not_manual",
  platformWriteRefused: "automation_platform_write_refused",
  workerStart: "automation_worker_start_failed",
  install: "automation_definition_install_failed",
  run: "automation_run_failed",
  workerStop: "automation_worker_stop_failed",
});

function requireApi(api) {
  for (const method of ["startWorker", "stopWorker", "createDefinition", "runOnce"]) {
    if (typeof api?.[method] !== "function") return `api is missing ${method}()`;
  }
  return null;
}

/**
 * Run the single approved N-7 manual automation under an owned worker lifecycle.
 *
 * `api` is the injected worker/automation seam: `{ startWorker, stopWorker, createDefinition, runOnce }`.
 * The worker is started once, exactly one definition is created and run once, and the worker is stopped in
 * a `finally` **whatever happens** — including a hung or failing run — so owned side effects are always
 * released. A failure returns `{ ok: false, code }` rather than throwing, so the caller can record it
 * without discarding earlier direct-case evidence.
 */
export async function runOwnedAutomation({
  api,
  definition,
  directValidated = false,
  allowPlatformWrite = false,
  hostControl = null,
  run = null,
  log = () => {},
} = {}) {
  if (directValidated !== true) {
    throw new AutomationBlockedError(
      AUTOMATION_ERROR_CODES.downstream +
        ": N-7 is downstream of direct validation; run the direct agent-turn cases successfully first"
    );
  }
  const apiError = requireApi(api);
  if (apiError) {
    return { ok: false, code: AUTOMATION_ERROR_CODES.apiIncomplete, detail: apiError, started: false, stopped: false };
  }
  if (!definition || definition.trigger !== "manual") {
    return { ok: false, code: AUTOMATION_ERROR_CODES.definitionNotManual, detail: "only a manual-trigger definition may run", started: false, stopped: false };
  }
  if (allowPlatformWrite !== true) {
    return { ok: false, code: AUTOMATION_ERROR_CODES.platformWriteRefused, detail: "creating a definition is a platform write", started: false, stopped: false };
  }

  let started = false;
  let stopped = false;
  const evidence = { definition: { ...definition }, run: null };
  let outcome;
  try {
    const start = await api.startWorker();
    if (start && start.ok === false) {
      outcome = { ok: false, code: AUTOMATION_ERROR_CODES.workerStart, detail: start.detail ?? "start refused" };
    } else {
      started = true;
      log("automation: owned worker started");

      const created = await api.createDefinition(definition);
      if (created && created.ok === false) {
        outcome = { ok: false, code: AUTOMATION_ERROR_CODES.install, detail: created.detail ?? "install refused" };
      } else {
        evidence.automationId = created?.id ?? null;

        // Exactly one run. `run` is the injected run seam (defaults to the api's runOnce); the host-control
        // policy and turn deadline are armed by the caller around this call in a live run.
        const runner = run ?? ((id) => api.runOnce(id));
        const result = await runner(evidence.automationId);
        evidence.run = result;
        if (result && result.ok === false) {
          outcome = { ok: false, code: AUTOMATION_ERROR_CODES.run, detail: result.detail ?? "run refused" };
        } else {
          outcome = { ok: true, code: null };
        }
      }
    }
  } catch (error) {
    outcome = { ok: false, code: AUTOMATION_ERROR_CODES.run, detail: error?.message ?? String(error) };
  } finally {
    // The owned worker is always stopped, even if the run threw or hung-then-aborted.
    try {
      await api.stopWorker();
      stopped = true;
      log("automation: owned worker stopped");
    } catch (error) {
      stopped = false;
      // If the run began and the worker could not be stopped, that is itself a failure worth surfacing.
      if (outcome.ok) outcome = { ok: false, code: AUTOMATION_ERROR_CODES.workerStop, detail: error?.message ?? String(error) };
      log(`automation: owned worker stop failed: ${error?.message ?? error}`);
    }
  }
  return { ...outcome, started, stopped, evidence };
}
