/**
 * Exact, fail-closed **containment verification** for the owning Nakama E2E driver.
 *
 * Reviewer requirement (corrections, "Containment after restart"): supported-API skill containment is
 * demonstrably **not restart-persistent** (every boot re-adds the bundled skills), so before **each** case
 * the driver must fail closed if containment is anything other than the **expected exact state** — the
 * case's authorized profile id, exactly its assigned plugin tools, exactly the one assigned skill, and the
 * owned automation worker's desired-off state. It must **never** automatically "repair and continue".
 *
 * This module owns the expected exact state (derived from the admitted `profile-assignment.json` readback
 * plus the persisted worker desired-off state) and the strict comparator. Drift is a terminal refusal; the
 * driver latches and stops, and re-applying containment is a separate, explicitly authorized act.
 */
import { FIXTURE_PROFILES } from "./profiles.mjs";

/** The owned automation worker must be desired-off throughout N-1…N-6 (and only raised inside the N-7 wrapper). */
export const EXPECTED_AUTOMATIONS_ENABLED = false;

/** Fixed containment codes. */
export const CONTAINMENT_ERROR_CODES = Object.freeze({
  missing: "containment_missing",
  profileMismatch: "containment_profile_mismatch",
  toolsUnexpected: "containment_tools_unexpected",
  toolsMissing: "containment_tools_missing",
  skillMismatch: "containment_skill_mismatch",
  automationsEnabled: "containment_automations_enabled",
  malformed: "containment_malformed",
});

function sortedUnique(names) {
  return [...new Set(names)].sort();
}

/**
 * The expected exact containment for a profile key: its id, exactly its tools, exactly its skill.
 * Returns `null` for an unknown key (fail closed by the caller).
 */
export function expectedContainment(profileKey) {
  const profile = FIXTURE_PROFILES[profileKey];
  if (!profile) return null;
  return {
    profileId: profile.id,
    tools: sortedUnique(profile.tools),
    skills: profile.skill ? [profile.skill] : [],
  };
}

/** Map a tool name to its plugin action key (only the experiment's own namespace canonicalizes). */
function canonicalTool(name) {
  if (typeof name !== "string" || name.length === 0) return null;
  return name.replace(/^(?:plugin_)?research_dashboard__/, "");
}

/**
 * Compare an observed containment readback against the exact expected state for a case's profile.
 *
 * `observed` is what the injected `checkContainment` port returned: `{ profileId, tools, skills,
 * automationsEnabled? }`. Returns `{ ok, code, failures }`. Fail-closed: a non-object, a missing/wrong
 * profile id, any extra or missing plugin tool, an extra or missing skill, or an enabled automation worker
 * refuses. `automationsEnabled` is only checked when the observation carries it (the wrapper legitimately
 * starts the worker inside N-7's `finally`-released lifecycle, so the driver checks N-7 before the start).
 */
export function assertContainmentExact({ observed, profileKey } = {}) {
  const expected = expectedContainment(profileKey);
  if (!expected) {
    return { ok: false, code: CONTAINMENT_ERROR_CODES.profileMismatch, failures: [`no expected containment for profile key ${profileKey}`] };
  }
  if (!observed || typeof observed !== "object") {
    return { ok: false, code: CONTAINMENT_ERROR_CODES.missing, failures: ["containment readback is absent"] };
  }
  const failures = [];
  let code = CONTAINMENT_ERROR_CODES.malformed;
  if (observed.profileId !== expected.profileId) {
    failures.push(`profile id ${observed.profileId ?? "(none)"} != expected ${expected.profileId}`);
    if (code === CONTAINMENT_ERROR_CODES.malformed) code = CONTAINMENT_ERROR_CODES.profileMismatch;
  }
  if (!Array.isArray(observed.tools)) {
    failures.push("containment readback carries no tools list");
  } else {
    const actual = sortedUnique(observed.tools.map(canonicalTool).filter((n) => n !== null));
    const extra = actual.filter((t) => !expected.tools.includes(t));
    const missing = expected.tools.filter((t) => !actual.includes(t));
    if (extra.length) {
      failures.push(`unexpected tools present: ${extra.join(", ")}`);
      if (code === CONTAINMENT_ERROR_CODES.malformed) code = CONTAINMENT_ERROR_CODES.toolsUnexpected;
    }
    if (missing.length) {
      failures.push(`assigned tools missing: ${missing.join(", ")}`);
      if (code === CONTAINMENT_ERROR_CODES.malformed) code = CONTAINMENT_ERROR_CODES.toolsMissing;
    }
  }
  if (!Array.isArray(observed.skills)) {
    failures.push("containment readback carries no skills list");
  } else {
    const actual = sortedUnique(observed.skills);
    const expectedSkills = sortedUnique(expected.skills);
    if (actual.length !== expectedSkills.length || actual.some((s) => !expectedSkills.includes(s))) {
      failures.push(`skills ${actual.join(", ")} != expected ${expectedSkills.join(", ")}`);
      if (code === CONTAINMENT_ERROR_CODES.malformed) code = CONTAINMENT_ERROR_CODES.skillMismatch;
    }
  }
  if (observed.automationsEnabled === true && EXPECTED_AUTOMATIONS_ENABLED === false) {
    failures.push("the owned automation worker is enabled when it must be desired-off");
    if (code === CONTAINMENT_ERROR_CODES.malformed) code = CONTAINMENT_ERROR_CODES.automationsEnabled;
  }
  return { ok: failures.length === 0, code: failures.length ? code : null, failures };
}
