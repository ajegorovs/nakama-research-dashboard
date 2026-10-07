/**
 * The **two actual evaluation profiles** and the per-case profile binding.
 *
 * Reviewer requirement (corrections, item 1): the experiment deliberately uses two effective profiles and
 * a single `profile.id` is insufficient (it could invalidate N-6). The authorization must carry both
 * profile identities **and** a case → profile binding, and the driver must create each session with that
 * case's authorized profile and verify containment against the **same** profile immediately before the
 * case.
 *
 * The immutable ids are the ones read back from the existing fixture admission artifact
 * `Repos/nakama-e2e-fixture-workspace/evidence/profile-assignment.json` (no credentials, no live write):
 *
 *   - `fixture-readonly-3tool` — `get_overview`, `get_topic`, `search_dashboard` + `research-coordinator`
 *   - `fixture-full-5tool`     — the three reads plus `reconcile_topic`, `record_activity` + the same skill
 *
 * The case → profile binding is the reviewer's: N-1…N-5 → the three-tool read-only profile; N-6 → the
 * five-tool profile (so `reconcile_topic`/`record_activity` are genuinely **visible** while the host
 * evaluation policy still denies their **dispatch**); N-7 → the three-tool read-only profile.
 */
import { READONLY_DASHBOARD_TOOLS, WRITER_TOOLS } from "./cases.mjs";

// CHANGED EXPERIMENTAL CONDITION (skill-loading vs evaluation-dispatch fix):
// The pinned host skill composer emits an UNCONDITIONAL `read_file` loading directive for every
// discovered skill (`compose.ts` catalog line + matched-prompt `location` line); `include-body-on-match`
// controls only the body/`loading` line and cannot suppress it. Since the evaluation allowlist is a
// positive NAME list that must exclude `read_file` (read-only rule), any assigned skill produces a
// contradictory prompt. The fixture therefore delivers the research-coordinator's FULL guidance through
// each profile's `systemPrompt` ("normal host context") and NO LONGER assigns the skill to the profiles.
// Expected containment therefore carries no assigned skill; the tool set, model, worker state and the
// plugin store are unchanged, and `read_file` stays blocked.
export const CONTAINMENT_SKILL = null;

/** The two live fixture profiles, by stable key. */
export const FIXTURE_PROFILES = Object.freeze({
  readonly3: Object.freeze({
    key: "readonly3",
    id: "fixture-readonly-3tool",
    tools: Object.freeze([...READONLY_DASHBOARD_TOOLS]),
    skill: CONTAINMENT_SKILL,
  }),
  full5: Object.freeze({
    key: "full5",
    id: "fixture-full-5tool",
    tools: Object.freeze([...READONLY_DASHBOARD_TOOLS, ...WRITER_TOOLS]),
    skill: CONTAINMENT_SKILL,
  }),
});

export const PROFILE_KEYS = Object.freeze(Object.keys(FIXTURE_PROFILES));

/** The per-case profile binding (the reviewer's disposition). */
export const CASE_PROFILE = Object.freeze({
  "N-1": "readonly3",
  "N-2": "readonly3",
  "N-3": "readonly3",
  "N-4": "readonly3",
  "N-5": "readonly3",
  "N-6": "full5",
  "N-7": "readonly3",
});

/** The profile key for a case; throws for an unknown case. */
export function profileKeyForCase(caseId) {
  const key = CASE_PROFILE[caseId];
  if (!key) throw new Error(`no profile binding for case ${caseId}`);
  return key;
}

/** The profile identity for a case. */
export function profileForCase(caseId) {
  return FIXTURE_PROFILES[profileKeyForCase(caseId)];
}
