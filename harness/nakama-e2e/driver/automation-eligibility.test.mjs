/**
 * Offline tests for the scoped automation-profile eligibility helper (`automation-eligibility.mjs`), and
 * the **regression** that reproduces the `automationsEnabled` containment conflict.
 *
 * The conflict, reproduced here purely: the host refuses to create an N-7 automation definition unless the
 * profile has `automationsEnabled` **true** (`automation-service.ts` `assertProfileAutomationEnabled`), while
 * the driver's containment gate requires the profile **desired-off** — so the direct `readonly3` profile can
 * never satisfy both. The dedicated N-7 profile is the supported resolution.
 *
 *   bun test harness/nakama-e2e/driver/automation-eligibility.test.mjs
 */
import { describe, expect, test } from "bun:test";

import { CONTAINMENT_ERROR_CODES, assertContainmentExact } from "./containment.mjs";
import { FIXTURE_PROFILES } from "./profiles.mjs";
import {
  ELIGIBILITY_ERROR_CODES,
  N7_DEDICATED_PROFILE,
  PERFORMS_GLOBAL_WORKER_RECOVERY,
  READONLY_TOOL_POLICY_TOUCHED,
  SCHEDULES_AUTOMATIC_JOBS,
  assertEligibilityWrite,
  buildEligibilityPlan,
  withTemporaryAutomationEnabled,
} from "./automation-eligibility.mjs";

const READONLY_EXACT = {
  profileId: FIXTURE_PROFILES.readonly3.id,
  tools: [...FIXTURE_PROFILES.readonly3.tools],
  skills: [],
};

describe("scoped eligibility: the plan never weakens read-only policy, schedules or recovers workers", () => {
  test("invariant flags are all false", () => {
    expect(READONLY_TOOL_POLICY_TOUCHED).toBe(false);
    expect(SCHEDULES_AUTOMATIC_JOBS).toBe(false);
    expect(PERFORMS_GLOBAL_WORKER_RECOVERY).toBe(false);
  });

  test("the dedicated N-7 profile keeps the read-only surface and is manual-only", () => {
    const plan = buildEligibilityPlan({ mode: "dedicated-profile" });
    expect(plan.ok).toBe(true);
    expect(plan.createsProfile.automationsEnabled).toBe(true);
    expect([...plan.createsProfile.tools].sort()).toEqual([...FIXTURE_PROFILES.readonly3.tools].sort());
    expect(plan.createsProfile.skill).toBeNull();
    expect(plan.createsProfile.trigger).toBe("manual");
    expect(plan.readOnlyToolPolicyTouched).toBe(false);
    expect(plan.schedulesAutomaticJobs).toBe(false);
    expect(N7_DEDICATED_PROFILE.id).not.toBe(FIXTURE_PROFILES.readonly3.id);
  });

  test("the temporary-flag plan touches only automationsEnabled", () => {
    const plan = buildEligibilityPlan({ mode: "temporary-flag" });
    expect(plan.ok).toBe(true);
    expect(plan.mutates).toEqual(["automationsEnabled"]);
    expect(plan.restores).toEqual(["automationsEnabled"]);
  });

  test("an unknown mode is refused", () => {
    expect(buildEligibilityPlan({ mode: "nope" }).code).toBe(ELIGIBILITY_ERROR_CODES.unknownMode);
  });
});

describe("scoped eligibility: a write may only set automationsEnabled", () => {
  test("a boolean automationsEnabled write is allowed", () => {
    expect(assertEligibilityWrite({ automationsEnabled: true }).ok).toBe(true);
  });
  test("a scheduling field is refused (schedulesJobs)", () => {
    expect(assertEligibilityWrite({ automationsEnabled: true, trigger: "cron" }).code).toBe(ELIGIBILITY_ERROR_CODES.schedulesJobs);
  });
  test("a worker/global field is refused (globalWorkerRecovery)", () => {
    expect(assertEligibilityWrite({ automationsEnabled: true, workerDesired: true }).code).toBe(ELIGIBILITY_ERROR_CODES.globalWorkerRecovery);
  });
  test("a read-only policy field is refused (readOnlyPolicyTouched)", () => {
    expect(assertEligibilityWrite({ tools: [] }).code).toBe(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched);
    expect(assertEligibilityWrite({ automationsEnabled: "yes" }).code).toBe(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched);
  });
});

describe("REGRESSION: the automationsEnabled containment conflict", () => {
  test("the driver's containment gate refuses a profile that is enabled (why readonly3 cannot host N-7)", () => {
    const enabled = assertContainmentExact({ observed: { ...READONLY_EXACT, automationsEnabled: true }, profileKey: "readonly3" });
    expect(enabled.ok).toBe(false);
    expect(enabled.code).toBe(CONTAINMENT_ERROR_CODES.automationsEnabled);
  });

  test("the same profile desired-off passes containment (the admitted N-1…N-6 state)", () => {
    const disabled = assertContainmentExact({ observed: { ...READONLY_EXACT, automationsEnabled: false }, profileKey: "readonly3" });
    expect(disabled.ok).toBe(true);
  });

  test("the two required states are contradictory on ONE profile — hence the dedicated N-7 profile", () => {
    // install needs enabled=true; containment needs desired-off (false) — the conflict, stated as code.
    const installNeedsEnabled = true;
    const containmentNeedsDisabled = false;
    expect(installNeedsEnabled).not.toBe(containmentNeedsDisabled);
    // The resolution: a *separate* profile carries enabled=true, so the direct profile stays desired-off.
    expect(N7_DEDICATED_PROFILE.automationsEnabled).toBe(true);
    expect(N7_DEDICATED_PROFILE.id).not.toBe(FIXTURE_PROFILES.readonly3.id);
  });
});

describe("withTemporaryAutomationEnabled: exact finally-restore", () => {
  function makePorts({ startEnabled = false, failRestore = false, tools = [...FIXTURE_PROFILES.readonly3.tools] } = {}) {
    const state = { automationsEnabled: startEnabled };
    const writes = [];
    const read = async () => ({ tools: [...tools], skills: [], automationsEnabled: state.automationsEnabled });
    const write = async (_pid, patch) => {
      writes.push({ ...patch });
      if (failRestore && patch.automationsEnabled === false) return; // silently fail to persist the restore
      state.automationsEnabled = patch.automationsEnabled;
    };
    return { state, writes, read, write };
  }

  test("enables for the window and restores the exact prior value in finally", async () => {
    const ports = makePorts();
    let ranWhileEnabled = null;
    const result = await withTemporaryAutomationEnabled({
      profileId: FIXTURE_PROFILES.readonly3.id,
      ...ports,
      run: async () => {
        ranWhileEnabled = ports.state.automationsEnabled;
        return "done";
      },
    });
    expect(result.ok).toBe(true);
    expect(result.ran).toBe("done");
    expect(ranWhileEnabled).toBe(true);
    expect(ports.state.automationsEnabled).toBe(false);
    expect(ports.writes).toEqual([{ automationsEnabled: true }, { automationsEnabled: false }]);
  });

  test("restores even when the run throws", async () => {
    const ports = makePorts();
    const result = await withTemporaryAutomationEnabled({
      profileId: FIXTURE_PROFILES.readonly3.id,
      ...ports,
      run: async () => {
        throw new Error("boom");
      },
    });
    expect(result.ok).toBe(true);
    expect(result.runError).toBe("boom");
    expect(ports.state.automationsEnabled).toBe(false);
  });

  test("refuses to start from an already-enabled profile (no masking)", async () => {
    const ports = makePorts({ startEnabled: true });
    const result = await withTemporaryAutomationEnabled({ profileId: "p", ...ports, run: async () => "x" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ELIGIBILITY_ERROR_CODES.notStartingDisabled);
    expect(ports.writes).toEqual([]);
  });

  test("refuses when the read-only tool set has drifted", async () => {
    const ports = makePorts({ tools: [...FIXTURE_PROFILES.readonly3.tools, "reconcile_topic"] });
    const result = await withTemporaryAutomationEnabled({ profileId: "p", ...ports, run: async () => "x" });
    expect(result.code).toBe(ELIGIBILITY_ERROR_CODES.readOnlyPolicyTouched);
  });

  test("throws a restoreFailed error if the flag cannot be restored", async () => {
    const ports = makePorts({ failRestore: true });
    await expect(
      withTemporaryAutomationEnabled({ profileId: "p", ...ports, run: async () => "x" })
    ).rejects.toThrow(/eligibility_restore_failed/);
  });
});
