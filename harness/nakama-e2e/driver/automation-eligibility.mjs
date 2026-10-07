/**
 * Scoped automation-profile eligibility for the single N-7 manual wrapper — **offline plan + guarded
 * temporary enable**.
 *
 * ## The conflict this module resolves (diagnosed offline, source-grounded)
 *
 * The host refuses `POST /v1/automations` (create) when the target profile has `automationsEnabled`
 * disabled:
 *   - `apps/server/src/services/automation-service.ts` `createAutomation()` calls
 *     `assertProfileAutomationEnabled(profileId)`, which throws `NakamaApiError("Automations are disabled
 *     for this profile.", 403)` when `profile.automationsEnabled === false` (the same message is produced
 *     by `automation-runner.ts` on the run path);
 *   - the fixture profiles are admitted with `automationsEnabled: false`, and the driver's containment
 *     gate (`containment.mjs`, `EXPECTED_AUTOMATIONS_ENABLED = false`) **requires** them desired-off, so
 *     the N-7 definition install is refused under the admitted containment.
 *
 * So N-7 needs a profile whose `automationsEnabled` is `true` **for the install+run window only**, while
 * N-1…N-6 keep the desired-off state. This module makes that eligibility explicit and scoped. It does
 * **not** weaken read-only tool policy, does not schedule automatic jobs, and does not perform global
 * worker recovery.
 *
 * ## Two supported options
 *
 *   - `dedicated-profile` (preferred): a separate N-7-only profile with the **same three read-only tools**,
 *     **no assigned skill**, the same bound model, and `automationsEnabled: true`. N-1…N-6 keep the
 *     desired-off profiles, so no runtime flag flip is needed and there is no containment race.
 *   - `temporary-flag`: flip the one profile's flag to `true` exactly for the window and restore the
 *     **exact prior value** in a `finally`. Provided for completeness; it must be applied at the point of
 *     the N-7 install (after the driver's pre-N-7 containment read) and is inherently more fragile.
 *
 * Neither option grants inference. Both are inert without an authorization + a minted live grant.
 */
import { FIXTURE_PROFILES } from "./profiles.mjs";

export const ELIGIBILITY_ERROR_CODES = Object.freeze({
  unknownMode: "eligibility_unknown_mode",
  portMissing: "eligibility_port_missing",
  readOnlyPolicyTouched: "eligibility_readonly_policy_touched",
  schedulesJobs: "eligibility_schedules_jobs",
  globalWorkerRecovery: "eligibility_global_worker_recovery",
  notStartingDisabled: "eligibility_profile_not_starting_disabled",
  restoreFailed: "eligibility_restore_failed",
});

/**
 * Hard invariants of any eligibility change. These are exported so a regression test can assert the
 * module never claims the opposite, and so a reviewer can grep the boundary.
 */
export const READONLY_TOOL_POLICY_TOUCHED = false;
export const SCHEDULES_AUTOMATIC_JOBS = false;
export const PERFORMS_GLOBAL_WORKER_RECOVERY = false;

/**
 * The dedicated N-7 profile descriptor (preferred option): identical read-only surface to `readonly3` —
 * the same three dashboard read tools, **no** assigned skill (`CONTAINMENT_SKILL` is null) — plus
 * `automationsEnabled: true`. Declared only; this module never creates it.
 */
export const N7_DEDICATED_PROFILE = Object.freeze({
  key: "n7Automation",
  id: "fixture-n7-automation",
  tools: Object.freeze([...FIXTURE_PROFILES.readonly3.tools]),
  skill: FIXTURE_PROFILES.readonly3.skill, // null — read-only policy unchanged
  automationsEnabled: true,
  trigger: "manual", // never a schedule
});

/** The only field an eligibility change may touch. */
const ELIGIBILITY_MUTABLE_FIELD = "automationsEnabled";

function ok(extra = {}) {
  return { ok: true, code: null, failures: [], ...extra };
}
function refuse(code, failures) {
  return { ok: false, code, failures: Array.isArray(failures) ? failures : [failures] };
}

/**
 * Build the (pure) eligibility plan. `mode` is `"dedicated-profile"` or `"temporary-flag"`.
 * Returns a description with the invariants attached; performs no I/O.
 */
export function buildEligibilityPlan({ mode = "dedicated-profile", sourceProfileId = FIXTURE_PROFILES.readonly3.id } = {}) {
  if (mode === "dedicated-profile") {
    return {
      ok: true,
      mode,
      createsProfile: { ...N7_DEDICATED_PROFILE, tools: [...N7_DEDICATED_PROFILE.tools] },
      mutates: [],
      restores: [],
      readOnlyToolPolicyTouched: READONLY_TOOL_POLICY_TOUCHED,
      schedulesAutomaticJobs: SCHEDULES_AUTOMATIC_JOBS,
      globalWorkerRecovery: PERFORMS_GLOBAL_WORKER_RECOVERY,
    };
  }
  if (mode === "temporary-flag") {
    if (typeof sourceProfileId !== "string" || sourceProfileId.length === 0) {
      return refuse(ELIGIBILITY_ERROR_CODES.unknownMode, "temporary-flag requires a sourceProfileId");
    }
    return {
      ok: true,
      mode,
      profileId: sourceProfileId,
      createsProfile: null,
      mutates: [ELIGIBILITY_MUTABLE_FIELD],
      restores: [ELIGIBILITY_MUTABLE_FIELD],
      readOnlyToolPolicyTouched: READONLY_TOOL_POLICY_TOUCHED,
      schedulesAutomaticJobs: SCHEDULES_AUTOMATIC_JOBS,
      globalWorkerRecovery: PERFORMS_GLOBAL_WORKER_RECOVERY,
    };
  }
  return refuse(ELIGIBILITY_ERROR_CODES.unknownMode, `unknown eligibility mode: ${mode}`);
}

/**
 * Assert a proposed profile write touches **only** `automationsEnabled` and never schedules a job or
 * touches a global worker flag. Fail closed on any other key.
 */
export function assertEligibilityWrite(write = {}) {
  const keys = Object.keys(write ?? {});
  const extra = keys.filter((k) => k !== ELIGIBILITY_MUTABLE_FIELD);
  if (extra.length) {
    if (extra.includes("trigger")) return refuse(ELIGIBILITY_ERROR_CODES.schedulesJobs, `write would set scheduling fields: ${extra.join(", ")}`);
    if (extra.some((k) => /worker|global|recover|desired/i.test(k))) {
      return refuse(ELIGIBILITY_ERROR_CODES.globalWorkerRecovery, `write would touch worker/global state: ${extra.join(", ")}`);
    }
    return refuse(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched, `write would touch read-only profile policy: ${extra.join(", ")}`);
  }
  if (typeof write[ELIGIBILITY_MUTABLE_FIELD] !== "boolean") {
    return refuse(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched, "automationsEnabled must be an explicit boolean");
  }
  return ok();
}

/**
 * The guarded **temporary-flag** helper. Reads the exact prior state, requires it to start disabled (so a
 * masking pre-enable cannot hide a failure), writes **only** `automationsEnabled: true`, runs `run()`, and
 * in a `finally` restores the **exact** prior value and re-reads to prove the restore. Any restore
 * mismatch throws `eligibility_restore_failed` — the window is never left enabled.
 *
 * Injected ports (no I/O here): `read(profileId) -> { tools, skills, automationsEnabled }`,
 * `write(profileId, { automationsEnabled })`. `requiredTools`/`skill` guard the read-only policy.
 */
export async function withTemporaryAutomationEnabled({
  profileId,
  read,
  write,
  run,
  requiredTools = [...FIXTURE_PROFILES.readonly3.tools],
  skill = FIXTURE_PROFILES.readonly3.skill,
  log = () => {},
} = {}) {
  if (typeof read !== "function" || typeof write !== "function" || typeof run !== "function") {
    return refuse(ELIGIBILITY_ERROR_CODES.portMissing, "read, write and run ports are required");
  }
  const before = await read(profileId);
  if (!before || typeof before !== "object") {
    return refuse(ELIGIBILITY_ERROR_CODES.portMissing, "eligibility read returned nothing");
  }
  const beforeTools = [...(before.tools ?? [])].sort().join(",");
  const wantTools = [...requiredTools].sort().join(",");
  if (beforeTools !== wantTools) {
    return refuse(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched, `read-only tool set drifted before enable: ${beforeTools}`);
  }
  const beforeSkills = [...(before.skills ?? [])].sort().join(",");
  const wantSkills = (skill ? [skill] : []).sort().join(",");
  if (beforeSkills !== wantSkills) {
    return refuse(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched, `read-only skill set drifted before enable: ${beforeSkills}`);
  }
  const prior = before.automationsEnabled === true;
  if (prior) {
    return refuse(ELIGIBILITY_ERROR_CODES.notStartingDisabled, "profile automationsEnabled was already true; nothing to scope");
  }
  const enable = { [ELIGIBILITY_MUTABLE_FIELD]: true };
  const illegal = assertEligibilityWrite(enable);
  if (!illegal.ok) return illegal;

  let ran = null;
  let runError = null;
  try {
    await write(profileId, enable);
    log("eligibility: automationsEnabled=true for the N-7 window");
    ran = await run();
  } catch (error) {
    runError = error?.message ?? String(error);
  } finally {
    try {
      await write(profileId, { [ELIGIBILITY_MUTABLE_FIELD]: prior });
      const after = await read(profileId);
      if (after?.automationsEnabled !== prior) {
        throw new Error(`restore read back ${after?.automationsEnabled}, expected ${prior}`);
      }
      log(`eligibility: automationsEnabled restored to ${prior}`);
    } catch (error) {
      throw Object.assign(new Error(`${ELIGIBILITY_ERROR_CODES.restoreFailed}: ${error?.message ?? error}`), {
        code: ELIGIBILITY_ERROR_CODES.restoreFailed,
      });
    }
  }
  return ok({ ran, runError, priorRestored: true });
}
