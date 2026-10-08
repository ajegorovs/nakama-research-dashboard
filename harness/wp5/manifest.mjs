/**
 * wp5/manifest.mjs — the APPROVED baseline manifest, as executable data.
 *
 * This module is the WP5 checker's *approved input contract*. Every value below is transcribed from the
 * accepted designs — it is **permitted testdata**, not the retained fixture and not a live readback:
 *
 *   - `docs/plans/public-research-baseline-seed-design.md` (WP3) §2, §3.3, §3.4, §8, §9;
 *   - `docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md` (the approved packet) §5;
 *   - `docs/plans/public-research-retained-fixture-amendment-design.md` (WP4) §11 (amendment invariants);
 *   - `docs/reviews/public-research-fixture-findings.md` (the ledger) §A–§K.
 *
 * **Nothing here is executed against the retained fixture.** The WP5 runner seeds an *isolated,
 * in-memory* store from this manifest to exercise the checks; the retained fixture is only ever read
 * (and this harness does not read it at all — see `run.mjs`).
 *
 * **Unresolved parameter gates carry NO defaults.** The six axis→repository roles, the F08 wording/
 * confidence, the optional blocker restoration, the evidence strategy and the target are all
 * `resolved: false`; a gate that is not explicitly approved yields a BLOCKED outcome, never a silent
 * default (see `checks.mjs`). No role is chosen here.
 */

/** The approved public source pins (public, kept verbatim). */
export const PINS = {
  udv: { repo: "ajegorovs/udv-echo-process", sha: "841964d41f8dc73e55d78303e79ed4098c00d700", date: "2026-09-28" },
  grablink: { repo: "ajegorovs/Grablink-Full-sequence-acquisition", sha: "e6f83b2f5a45a961044b107f2628b046d41c3ab2", date: "2026-09-24" },
  dashboard: { repo: "ajegorovs/nakama-research-dashboard", sha: "95ec34e5d24240c7ac92c384cff5d5658ebb8761", date: "2026-10-07" },
};

/**
 * Repository public metadata — the *normalized* pinned-README opening paragraph (soft wraps collapsed,
 * emphasis markers stripped), the public URL, and the as-of-read GitHub `default_branch` (WP3 §2.1/§3.3).
 * `description` is a byte-equal contract: words preserved, nothing added/removed/reordered.
 */
export const REPOSITORIES = [
  {
    fullName: "ajegorovs/udv-echo-process",
    url: "https://github.com/ajegorovs/udv-echo-process",
    defaultBranch: "master",
    description:
      "Multi-sensor Ultrasonic Doppler Velocimetry (UDV) processing for rotating machinery analysis. Supports echo (amplitude) and velocity measurements from single-sensor continuous recordings and multi-sensor rolling (round-robin) arrays, in both raw time-series and statistical-summary formats.",
  },
  {
    fullName: "ajegorovs/Grablink-Full-sequence-acquisition",
    url: "https://github.com/ajegorovs/Grablink-Full-sequence-acquisition",
    defaultBranch: "master",
    description:
      "Windows MFC application for capturing high-frame-rate 8-bit monochrome image sequences from an Euresys Grablink/MultiCam capture card.",
  },
  {
    fullName: "ajegorovs/nakama-research-dashboard",
    url: "https://github.com/ajegorovs/nakama-research-dashboard",
    defaultBranch: "main",
    description:
      "A dashboard page plus agent tools over shared coordination state — topics, development axes and the evidence attached to them — for a self-hosted Nakama instance. One page (the overview, with the editing surface underneath it), eight actions of which five are agent tools, one skill, org-scoped SQLite storage.",
  },
];

/** The one approved person (no role, no account mapping → `attributable=false`). */
export const PERSON = { displayName: "Aleksandrs Jegorovs", githubLogin: "ajegorovs", role: "" };

export const TOPIC_NAMES = [
  "Experimental research",
  "Research infrastructure / team management",
];

/**
 * The six axes, in the packet's order, each with its mandated explicit confidence. `currentState: null`
 * means the field is deliberately absent (axis 4, F08) — never invented.
 */
export const AXES = [
  {
    n: 1,
    topic: "Experimental research",
    title: "UDV acquisition automation",
    kind: "experiment",
    state: "usable",
    stateConfidence: "inferred",
    currentState:
      "Automated UDV acquisition can mutate and verify the tested emissions/profile boundary and persist evidence-backed BDD/job records. Live commissioning passed for E20/E64 transitions; subsequent bring-up documentation records the two independent storage-directory surfaces.",
    currentStateConfidence: "inferred",
    blocker: null,
    blockerConfidence: null,
    repo: "ajegorovs/udv-echo-process",
    personLinked: true,
  },
  {
    n: 2,
    topic: "Experimental research",
    title: "UDV sparse-analysis validation",
    kind: "test",
    state: "usable",
    stateConfidence: "inferred",
    currentState:
      "Cross-sitting sparse-analysis publication is reproducible and independently verified for the frozen SA5 comparison set. The published result deliberately stops short of recurrence, interpolation, cross-grid mapping or population inference.",
    currentStateConfidence: "inferred",
    blocker: null,
    blockerConfidence: null,
    repo: "ajegorovs/udv-echo-process",
    personLinked: true,
  },
  {
    n: 3,
    topic: "Experimental research",
    title: "High-rate optical acquisition",
    kind: "feature",
    state: "usable",
    stateConfidence: "inferred",
    currentState:
      "The RAM-buffered capture and asynchronous-save architecture is operational and has passed hardware-free and several connected-camera validations. Clean-machine MultiCam SDK setup is documented and configurable through one build property.",
    currentStateConfidence: "inferred",
    blocker: null,
    blockerConfidence: null,
    repo: "ajegorovs/Grablink-Full-sequence-acquisition",
    personLinked: true,
  },
  {
    n: 4,
    topic: "Experimental research",
    title: "Grablink diagnostics and sustained-rate validation",
    kind: "investigation",
    state: "active",
    stateConfidence: "inferred",
    // F08: deliberately absent — the field is optional and no wording is approved. Do NOT invent text.
    currentState: null,
    currentStateConfidence: null,
    blocker:
      "Connected-camera sustained-rate and full-buffer validation remain required; dropped-frame behavior at 300–350 FPS is not yet fully instrumented.",
    // The packet's proposal; in the baseline seed it is backed same-transaction by the AGENDA event.
    blockerConfidence: "confirmed",
    repo: "ajegorovs/Grablink-Full-sequence-acquisition",
    personLinked: true,
  },
  {
    n: 5,
    topic: "Research infrastructure / team management",
    title: "Research dashboard and focused retrieval",
    kind: "feature",
    state: "usable",
    stateConfidence: "inferred",
    currentState:
      "The dashboard product and scoped `get_topic` retrieval are published and accepted for the tested scope. A follow-up pagination edge case was corrected without reopening the historical live acceptance.",
    currentStateConfidence: "inferred",
    blocker: null,
    blockerConfidence: null,
    repo: "ajegorovs/nakama-research-dashboard",
    personLinked: true,
  },
  {
    n: 6,
    topic: "Research infrastructure / team management",
    title: "Agent consultation and automation evidence",
    kind: "test",
    state: "usable",
    stateConfidence: "inferred",
    currentState:
      "Direct dashboard consultation is demonstrated, but the accepted stage remains qualified: normal assigned-skill loading was not exercised end-to-end, and N-7 automation lacks a retained tool trace.",
    currentStateConfidence: "inferred",
    blocker: null,
    blockerConfidence: null,
    repo: "ajegorovs/nakama-research-dashboard",
    personLinked: true,
  },
];

/**
 * The concrete 8-event source manifest (WP3 §3.4). Placement mapping per axis is 2/1/1/1/3/0; the
 * AGENDA document event is placed on axis 4 (the axis whose blocker it backs), not axis 3.
 */
export const ACTIVITIES = [
  { axis: 1, sourceType: "github_pr", sourceRef: "PR #44", sourceUrl: "https://github.com/ajegorovs/udv-echo-process/pull/44", occurredAt: "2026-09-28T15:15:05Z", summary: "UDV acquisition automation: PR #44 merged." },
  { axis: 1, sourceType: "github_pr", sourceRef: "PR #69", sourceUrl: "https://github.com/ajegorovs/udv-echo-process/pull/69", occurredAt: "2026-09-28T15:22:46Z", summary: "UDV acquisition automation: PR #69 merged." },
  { axis: 2, sourceType: "github_pr", sourceRef: "PR #67", sourceUrl: "https://github.com/ajegorovs/udv-echo-process/pull/67", occurredAt: "2026-09-28T13:44:37Z", summary: "UDV sparse-analysis validation: PR #67 merged." },
  { axis: 3, sourceType: "github_pr", sourceRef: "PR #1", sourceUrl: "https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/pull/1", occurredAt: "2026-09-24T09:16:43Z", summary: "High-rate optical acquisition: PR #1 merged." },
  { axis: 4, sourceType: "repo_document", sourceRef: "docs/AGENDA.md", sourceUrl: "https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/blob/e6f83b2f5a45a961044b107f2628b046d41c3ab2/docs/AGENDA.md", occurredAt: "2026-09-24", summary: "Grablink diagnostics: agenda document recorded." },
  { axis: 5, sourceType: "github_commit", sourceRef: "95ec34e", sourceUrl: "https://github.com/ajegorovs/nakama-research-dashboard/commit/95ec34e5d24240c7ac92c384cff5d5658ebb8761", occurredAt: "2026-10-07T11:32:37Z", summary: "Research dashboard: commit 95ec34e." },
  { axis: 5, sourceType: "github_commit", sourceRef: "da7996b", sourceUrl: "https://github.com/ajegorovs/nakama-research-dashboard/commit/da7996b6143f918ca590a79649aba831151b4dca", occurredAt: "2026-10-07T11:32:37Z", summary: "Research dashboard: commit da7996b." },
  { axis: 5, sourceType: "github_commit", sourceRef: "5a62749", sourceUrl: "https://github.com/ajegorovs/nakama-research-dashboard/commit/5a6274918c92d8c6a539349d3549dde045c3985f", occurredAt: "2026-10-07T11:09:37Z", summary: "Research dashboard: commit 5a62749." },
];

/** Placement counts per axis: 2/1/1/1/3/0 — eight unique events. */
export const ACTIVITY_MAPPING = [2, 1, 1, 1, 3, 0];

/** Axis-4 plan (WP3 §8 / WP4 §7.3): summary verbatim, four steps with explicit positions 1..4. */
export const PLAN = {
  axis: 4,
  summary: "Complete camera-connected validation and production diagnostics for sustained high-rate acquisition.",
  steps: [
    { title: "Wire CaptureStats into the callback and save path.", position: 1 },
    { title: "Measure callback duration, effective FPS, save duration and disk throughput.", position: 2 },
    { title: "Read relevant driver/drop counters and surface diagnostics.", position: 3 },
    { title: "Run sustained 300–350 FPS and full-buffer-to-disk validation.", position: 4 },
  ],
};

/** The three open problems (1 on axis 4, 2 on axis 6), each with its approved repository set. */
export const PROBLEMS = [
  {
    axis: 4,
    statement:
      "Sustained 300–350 FPS operation has measured dropped frames, while driver TimeCode/OverrunCount and production CaptureStats instrumentation are not yet available to explain them.",
    state: "open",
    stateConfidence: "confirmed",
    repositoryFullNames: ["ajegorovs/Grablink-Full-sequence-acquisition"],
  },
  {
    axis: 6,
    statement:
      "Normal assigned `research-coordinator` skill loading has not yet been demonstrated end-to-end; the accepted consultation fixture used profile system-prompt guidance instead.",
    state: "open",
    stateConfidence: "confirmed",
    repositoryFullNames: ["ajegorovs/nakama-research-dashboard"],
  },
  {
    axis: 6,
    statement:
      "N-7 automation completes, but its ephemeral session does not retain the tool trace required to prove dashboard consultation.",
    state: "open",
    stateConfidence: "confirmed",
    repositoryFullNames: ["ajegorovs/nakama-research-dashboard"],
  },
];

/** Topic→repository links (approved): infra→Dashboard primary; experimental→UDV primary, →Grablink supporting. */
export const TOPIC_REPO_LINKS = [
  { topic: "Research infrastructure / team management", fullName: "ajegorovs/nakama-research-dashboard", relationship: "primary" },
  { topic: "Experimental research", fullName: "ajegorovs/udv-echo-process", relationship: "primary" },
  { topic: "Experimental research", fullName: "ajegorovs/Grablink-Full-sequence-acquisition", relationship: "supporting" },
];

/** Approved baseline counts (WP3 §8) — verified programmatically, never from memory. */
export const BASELINE_COUNTS = {
  topics: 2,
  axes: 6,
  people: 1,
  repositories: 3,
  planSteps: 4,
  problems: 3,
  activities: 8,
  topicRepoLinks: 3,
  topicPersonLinks: 2,
  axisPersonLinks: 6,
  problemRepoLinks: 3,
  // All six axis→repository roles are UNRESOLVED, so the baseline seed writes ZERO axis→repo links
  // rather than defaulting any of them to `supporting` (WP3 §8/§9 D-A).
  axisRepoLinksWritten: 0,
};

/**
 * The unresolved parameter gates. A gate is only ever satisfied by an explicit approval that names its
 * own value; there is **no default here and none chosen**. Until a gate is resolved the dependent
 * checks report BLOCKED, and a BLOCKED run is not green (see `checks.mjs`/`run.mjs`).
 */
export function unresolvedGates() {
  const pending = (id, title, blockedChecks, detail) => ({
    id,
    title,
    resolved: false,
    approvedBy: null,
    value: null,
    blockedChecks,
    detail,
  });
  return [
    pending("G01", "Axis→repository roles (all six axes)", ["explicit-roles"], "WP3 §9 D-A / WP4 §12 item 1: `axis_repositories.relationship` accepts only primary|supporting; omitting it silently stores the refused `supporting`, so all six links are withheld. No role is chosen here."),
    pending("G02", "F08 axis-4 `currentState` wording + confidence", ["f08-currentstate"], "WP4 §8/§12 item 3: the source is sufficient but population and exact wording are a human editorial decision. Optional field; left absent rather than invented."),
    pending("G03", "Optional blocker restoration (axis-4 `inferred`→`confirmed`)", ["blocker-restore"], "WP4 §8/§12 item 3: the retained `inferred` is ratified; restoring `confirmed` is proposed, NOT approved, and would need axis-4 evidence by transaction end. No default upgrade/downgrade is applied."),
    pending("G04", "F03/F04/F14a evidence strategy (move / duplicate / reassociate)", ["evidence-strategy"], "WP4 §9.1/§12 item 2/4: in-place re-point is impossible, duplication is discouraged+non-idempotent, 'leave' is always available. No automatic choice is made."),
    pending("G05", "Proposed target decision only (owner write authorization is WP-G's, not this gate)", ["target"], "Methodology §6 gate 1: this gate records a **proposed target organization decision only**. It carries **no owner write authorization** and binds **no live target** — that authorization is WP-G's to grant, and **WP-G is not entered** by this harness. Until a proposal exists no run writes anything; this harness never writes the retained fixture."),
  ];
}

/** Map a gate id to its unresolved entry (or undefined when a caller supplies a synthetic resolution). */
export function gateById(gates, id) {
  return (gates ?? []).find((g) => g.id === id);
}

/**
 * The label every synthetic gate resolution must carry. A resolved gate supplied for this harness is a
 * **test-only synthetic** value: it exists so the fully-PASS path is reachable and so the checks can be
 * shown to be able to go red. It is **not** an owner decision, **not** an approval, and **not** a target
 * binding. The runner treats a decisions payload without this label as a refusal, so a "test-only
 * parameter" can never be mistaken for a real, approved target.
 */
export const TEST_ONLY_LABEL = "TEST-ONLY SYNTHETIC — not an owner decision, not an approval, no target";

/**
 * Synthetic axis→repository roles for the test-only fully-PASS path. Every value is a **test-only
 * synthetic** placeholder, never an approved role: the product cannot store "undecided", so a synthetic
 * decision must name *some* enum value to make the amendment view verifiable at all. It must never be
 * read as a G01 decision (G01 stays an approval item; see the ledger).
 */
export const TEST_ONLY_ROLES = Object.fromEntries(AXES.map((a) => [a.title, "supporting"]));

/** Synthetic F08 wording + confidence for the test-only fully-PASS path (never an approved wording). */
export const TEST_ONLY_F08 = {
  currentState:
    "Test-only synthetic diagnostics state — not an approved wording; the field stays optional and unapproved.",
  confidence: "inferred",
};

/**
 * The test-only decisions payload. `testOnly: true` is mandatory and enforced by the runner: supplying it
 * resolves every gate with a **synthetic** value so the full contract runs, but it records no approval,
 * binds no target and authorizes no write.
 */
export function testOnlyDecisions() {
  const valueById = {
    G01: TEST_ONLY_ROLES,
    G02: TEST_ONLY_F08,
    G03: "skip", // keep the ratified retained `inferred`; restoring `confirmed` is the separate optional decision
    G04: "leave", // the only strategy exercisable without an authorized execution
    G05: { proposedTarget: "test-only-synthetic-proposed-target" },
  };
  return {
    testOnly: true,
    label: TEST_ONLY_LABEL,
    gates: unresolvedGates().map((g) => ({
      ...g,
      resolved: true,
      approvedBy: null,
      testOnly: true,
      value: valueById[g.id],
    })),
  };
}
