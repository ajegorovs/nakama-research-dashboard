/**
 * The authorized case table N-1…N-7.
 *
 * This is the harness's own, offline statement of which case is a smoke, which run against the read-only
 * profile, which runs against the five-tool profile and which is the manual-automation wrapper. The exact
 * **prompt text** is deliberately not here: the host-amendment ruling requires the prompt be bound by the
 * authorization record and sent exactly, so the prompt comes from the authorization (and the case's
 * `promptKey` names which authorized prompt this case consumes). Nothing here performs I/O.
 *
 * Tiers, from `NAKAMA-E2E-PREPARATION.md` and `NAKAMA-E2E-HOST-AMENDMENT.md`:
 *   - `readonly`  — the three read tools plus the research-coordinator skill;
 *   - `writers`   — all five writer/reader tools **visible**, but an attempted writer dispatch is denied
 *                   pre-dispatch and terminally fails the case/sequence (N-6);
 *   - `automation`— N-7, a separately attributable manual wrapper, downstream of direct success.
 */

/** The three dashboard read tools assigned to the read-only profile. */
export const READONLY_DASHBOARD_TOOLS = Object.freeze(["get_overview", "get_topic", "search_dashboard"]);

/** The two dashboard writer tools visible in the five-tool profile. An attempted dispatch is denied. */
export const WRITER_TOOLS = Object.freeze(["reconcile_topic", "record_activity"]);

/** The host's deferred-discovery tool. It is a real execution and must be allowlisted for a consultation. */
export const DISCOVERY_TOOL = "find_tools";

/**
 * The only tool names an evaluation policy may allowlist (the host mirrors this
 * as `EVALUATION_PERMITTED_TOOL_NAMES`): the five dashboard actions plus the
 * discovery tool. Writers are in this universe but excluded per-case (N-6/N-7),
 * so an attempted writer dispatch is denied.
 */
export const PERMITTED_POLICY_TOOL_NAMES = Object.freeze([
  DISCOVERY_TOOL,
  ...READONLY_DASHBOARD_TOOLS,
  ...WRITER_TOOLS,
]);

/**
 * The per-case **dispatchable** allowlist. Every direct case needs discovery
 * (`find_tools`) before any dashboard tool is reachable, so it is always
 * included; writers are never dispatchable in any authorized case.
 */
export const CASE_DISPATCH_ALLOWLIST = Object.freeze([DISCOVERY_TOOL, ...READONLY_DASHBOARD_TOOLS]);

/**
 * The dashboard read tools whose **successful dispatch** every case must contain. Reviewer corrections,
 * item 3: consultation is required for **all** N-1…N-7, and `find_tools` alone is not sufficient — every
 * case must contain at least one successfully dispatched dashboard **read** call. N-1's structural pass
 * therefore requires a valid discovery/read/final-answer trace, N-6 cannot vacuously pass without reading,
 * and N-7's automation must actually consult the dashboard.
 */
export const READ_TOOLS = Object.freeze([...READONLY_DASHBOARD_TOOLS]);

/**
 * Per-case specification.
 *
 * `requireConsultation` — the case's answer must rest on a plugin read, so an absent/empty trace fails it.
 * `requireRead` — the trace must contain at least one **successfully dispatched dashboard read**; a
 *   `find_tools`-only (readless) trace, or a read that failed, fails the case.
 * `semanticScored` — N-1 is a **smoke**: it establishes the actual live trace shape *before* any semantic
 *   scoring, so its result is structural, not a semantic verdict; N-7 is a separately classified
 *   automation-wrapper result, not a new semantic score.
 * `downstreamOf` — the case may run only after the named group succeeded (N-7 after the direct cases).
 * `denyWriters` — writer tools are visible but any dispatch attempt is a terminal failure (N-6).
 */
export const CASE_SPECS = Object.freeze({
  "N-1": Object.freeze({ id: "N-1", phase: "smoke", tier: "readonly", promptKey: "N-1", requireConsultation: true, requireRead: true, semanticScored: false, denyWriters: false, downstreamOf: null }),
  "N-2": Object.freeze({ id: "N-2", phase: "direct", tier: "readonly", promptKey: "N-2", requireConsultation: true, requireRead: true, semanticScored: true, denyWriters: false, downstreamOf: null }),
  "N-3": Object.freeze({ id: "N-3", phase: "direct", tier: "readonly", promptKey: "N-3", requireConsultation: true, requireRead: true, semanticScored: true, denyWriters: false, downstreamOf: null }),
  "N-4": Object.freeze({ id: "N-4", phase: "direct", tier: "readonly", promptKey: "N-4", requireConsultation: true, requireRead: true, semanticScored: true, denyWriters: false, downstreamOf: null }),
  "N-5": Object.freeze({ id: "N-5", phase: "direct", tier: "readonly", promptKey: "N-5", requireConsultation: true, requireRead: true, semanticScored: true, denyWriters: false, downstreamOf: null }),
  "N-6": Object.freeze({ id: "N-6", phase: "direct", tier: "writers", promptKey: "N-6", requireConsultation: true, requireRead: true, semanticScored: true, denyWriters: true, downstreamOf: null }),
  "N-7": Object.freeze({ id: "N-7", phase: "automation", tier: "automation", promptKey: "N-7", requireConsultation: true, requireRead: true, semanticScored: false, denyWriters: true, downstreamOf: "direct" }),
});

export const CASE_IDS = Object.freeze(Object.keys(CASE_SPECS));

/** The direct cases in required order: N-1 smoke first, then N-2…N-6. */
export const DIRECT_CASE_ORDER = Object.freeze(["N-1", "N-2", "N-3", "N-4", "N-5", "N-6"]);

/** The single downstream automation case. */
export const AUTOMATION_CASE = "N-7";

/**
 * The tools a case's policy may make **dispatchable**, given its tier. Writers are visible in the
 * five-tool profile but must never be dispatchable, so every case (including N-6/N-7) gets the
 * read-only dashboard tools plus the discovery tool. Visibility is a profile property, not this one.
 */
export function toolsForCase(caseId) {
  const spec = CASE_SPECS[caseId];
  if (!spec) throw new Error(`unknown case: ${caseId}`);
  return [...CASE_DISPATCH_ALLOWLIST];
}
