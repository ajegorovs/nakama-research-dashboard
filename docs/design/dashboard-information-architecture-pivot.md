# Dashboard information-architecture pivot — working spec

## Current agreement and scope

This section is the single current specification for the standalone prototype. Owner-agreed
presentation choices are distinguished from data/model questions below. They are not production
implementation, fixture-write, deployment, restart or publication authorization.

**Status:** prototype direction accepted through the visible-task/pagination iteration; data contracts
are not yet settled. This consolidation is documentary only, not a new runtime acceptance result.
Everything under **Historical design and source analysis** is retained background. Its old future-tense
instructions, status labels and source observations do not override this section or establish current
live behavior. Existing `docs/ux-v2/DECISIONS.md` and acceptance records remain unchanged.

### Work sequence and constraints

1. Ground the prototype and its semantics.
2. Map the layout and interactions to required data and verified existing support.
3. Decide how each datum is obtained, synthesized, stored and retrieved.
4. Specify the smallest production changes and acceptance checks.
5. Implement and deploy only under the corresponding authorizations.

- Subagents may perform well-scoped work once given a quality brief grounded in this spec/plan.
  The parent owns integrated decisions and verifies their findings; speculative excursions remain deferred.
- Nakama currently runs agents on the host. That is not the intended future execution pattern.
  Host Git/gh availability, credentials and clone paths are not portable product requirements.
- The librarian must be able to investigate nonconforming repositories, including PR discussions,
  diffs and history. Web scraping is a viable baseline; specialized tools are additional capabilities.
  Templates may help later but are not prerequisites. Interpretation requires agency; deterministic
  mechanics govern identities, validation, persistence and retrieval rather than guaranteeing identical
  interpretations.
- Avoid overengineering. Reuse the current coordination tools and data model where they suffice.
- No agent runs now. Later use a small, question-driven integration exercise through the existing
  session transport, not an intelligence benchmark or another general E2E framework.

### Views and navigation

| View | Selector | Selected content and purpose |
|---|---|---|
| **Projects** (landing) | Projects | Project description, optional checkpoints, participants and concise workstream cards; orientation rather than full work detail |
| **Progress** | Workstreams grouped under simple muted project headings | Full workstream context, scoped plan, supporting repositories, activity and visible task cards |
| **People** | Person identity | Optional biography/profile, involvement grouped by project using shared workstream cards, related repositories and only attributable activity |
| **Repositories** | Owner separate from repository name | Description, default branch, external destination and current work grouped by project using shared workstream cards |

- Overview is retired. Keep aggregate Projects/Workstreams/Open tasks/Blocked tasks/Repositories/People
  counts in a collapsed **Dashboard summary** above Projects. Old Overview routes fall back to Projects.
- Display **Project → Workstream → Task**; do not silently migrate the topic/axis/problem schema.
- Projects summarize; Progress preserves the full substantive reading.
- All four side selectors use the same pane width (380px at the measured desktop viewports).
  Progress no longer uses the narrower variant, horizontal project-label rules, guides or dark group boxes.
- Workstream card titles navigate to the exact Progress entry. Do not add duplicate Open workstream or
  Review blocker buttons. Keep a lower-right Return to project action in full workstream context.
- People and Repositories project groups show a short project description and right-aligned Open project
  action immediately beneath the group heading. This action is not an obsolete Overview card footer.

### Shared presentation

- Keep description surfaces white; use shared bold muted disclosure headings, arrows, dividers and
  right-aligned status badges. Entity and section disclosures remain; task selection/unfolding is removed.
- Preserve pre-dark selector styling. The dark inversion and subsequent #f5f5f5 experiment were rejected
  for this prototype. Final palette harmonization belongs to the original product; the segmented page
  switch is the preferred newer control styling, not a command to recolor every surface now.
- Project/workstream selectors use status dots, compact count tags and relative recorded recency with
  exact-date tooltips. No status contours, Has plan pill or duplicate Blocker reported warning.
- Retain **No plan** as a reminder; plans themselves remain optional.
- Known blocked-task count pills are red; typography/padding/height match sibling pills. Never infer
  blocked children from a parent blocker.
- Participants have an explicit quiet inline label beneath a divider. Project-header repository rows
  remain omitted; references have their own scoped placement.
- Prototype provenance belongs in the overlay and documentation, not repeated copy badges on cards.

### Tasks, descriptions and scoped plans

- Task cards show a concise title, status and full description without clicking a selector row.
  Use **Tasks (N)**, not the parent title repeated in the section heading. No one-open-task behavior.
- Omit repeated task status and workstream context from the body. Keep optional scoped plan, supporting
  repository references and activity beneath the description.
- Project checkpoints, workstream strategy and task implementation plans are different optional scopes.
  Place each beside its description, with an independently collapsible bold plan heading and divider.
- Existing workstream plan summaries, step order and states must survive the production port.
- Separate short task titles, project checkpoints and task plans are currently editorial examples where
  unsupported by the source. No automatic checkpoint links, inherited plans or progress rollups are implied.
- Current live problems have open/resolved states; the prototype's diagnostics blocked task is explicit
  editorial data, not an implemented live-state extension or an inference from the workstream blocker.

### Repository links, involvement and attribution

- Supporting repositories are explicit many-to-many links at workstream and task scope. A repository may
  serve multiple projects; tasks do not automatically inherit parent repositories or activity.
- Repository name opens the exact dashboard entry. Separate **GitHub ↗** opens its actual external URL
  in a new tab; keep a thin vertical separator within each pair and dots between pairs, permitting wrapping.
- Repository external navigation belongs at the description footer's lower right; default branch is
  separate metadata, not an assertion of freshness or a pinned revision.
- Related repositories in People do not imply maintainership. Project involvement does not establish
  personal authorship of workstream events. Missing biography or attribution stays explicit.
- Activity links require an actual source URL or explicit entity association. Do not fabricate PR links
  or borrow repository-wide events to fill an empty workstream/task feed.

### Activity and pagination

- Activity is a record of updates, not a plan, completed-work inference or performance score.
  Place it after description → scoped plan → supporting repositories, in an independent disclosure.
- Use per-list **Previous / numbered pages / Next** with the shared segmented-switch treatment.
  Prototype page size is five. Hide page buttons when the available list fits on one page; show the
  actual displayed range and available count. Direct task navigation opens its containing task page.
- Numbered pagination replaces the 3/5/10/20/50 latest-entry limit switch and growing scroll-list approach.
  Activity uses newest-first source records. Task ordering is a separate open decision.
- The prototype currently slices supplied local data and retains a bounded keyboard-focusable activity
  scroll body. Production must retrieve scoped pages and report availability/completeness honestly.
  Whether ordinary activity scrolling can be removed is open; do not treat the current scroll cap as a
  settled product requirement.
- No dashboard-wide time filter or chart. Charts and cross-project event processing remain deferred.
- Illustrative reports live in `editorial.json`, labelled **Example report**. They do not change frozen
  event counts, recency or factual completion claims. Preserve `data.json` unchanged.

## Remaining grounding and data questions

These are requirements to investigate, not silent decisions or an implementation backlog already approved.

| ID | Question / next evidence needed |
|---|---|
| G1 | Task meaning: does ordinary planned work belong in an expanded problem model or another representation? Current problems mean work in the way; do not assume a label rename resolves this. |
| G2 | Task order: time, explicit plan order, state or another simple rule? Activity stays chronological; settle task order independently. |
| G3 | Pagination: five is the prototype trial size. Define stable tie-breaking, totals versus loaded availability, scope, arrival of new events and the minimum backend read contract. |
| G4 | Activity height: use pagination to avoid scrolling hundreds of entries; decide whether a page needs a scroll cap at all. User has not yet reviewed a populated multi-page example. |
| D1 | Which concise titles, summaries and full descriptions are already stored/exposed, which are editorial-only, and which require distinct fields? |
| D2 | Which explicit states should tasks support and who may assert them? Keep blocked counts and state changes evidence-aware, not parent-derived. |
| D3 | How to store optional scoped plans/checkpoints with minimal changes? Determine whether prose/ordered steps suffice before considering graphs or automatic rollups. |
| D4 | Which repository/person associations, biography/profile fields and source-author identities are supported by existing contracts? Never infer roles or attribution to fill missing fields. |
| D5 | Define each count and recency fact independently of page size; distinguish recorded snapshot events from complete history and total workstreams from active workstreams. |
| D6 | Preserve actual plan summary/step states and settle the stored-versus-rendered numbering convention; no fixture rebasing or production fix is authorized here. |
| A1 | For each required datum: identify direct source, user input or librarian synthesis; then its write tool, validation, authorship/conflict rules, read projection and missing-data behavior. |
| A2 | Review coordinator guidance for permitted independent synthesis. Host access and an unrestricted profile are not a finished librarian contract. |
| A3 | Specify future execution/tool/credential boundaries without assuming the current host deployment. Do not turn this into an infrastructure redesign now. |

**Grounded data review:** [Dashboard data and maintenance contract](dashboard-data-and-maintenance-contract.md)
now maps requirements to existing storage/read/write support, corrects audit interpretations, and proposes
a minimal acquisition/update workflow. Owner selected general actionable tasks with open/blocked/resolved states, simple ordered plans at
project/workstream/task scope, and separate short/full text with librarian synthesis respecting authored
text. Detailed compatibility and read/write contracts are the next design work. Retrieval experiments are allowed only when scoped to a
named unresolved requirement; no repository excursion or Nakama inference run is active now.

## Historical prototype iteration notes (superseded)

The following verbatim notes preserve earlier alternatives. They are NOT current instructions.
Overview retention, growing-entry switches, one-open-task rows and ruled project headings were superseded
by the current agreement above.

### Overview navigation and selector inversion
Overview project titles are the sole project-navigation action; remove duplicate Open project buttons and footer rows. Participants have an explicit quiet inline label. Revert selector colours to the pre-dark prototype scheme; final colour harmonization is deferred to the original product; retain distinct status dots and blocked/reminder tags. Task unfolding rows are not part of this side-selector change.

### Overview retirement and pagination trial
Retire Overview; Projects is the landing tab and retains counts in a collapsed Dashboard summary. Progress uses the same selector width as sibling views, simple project headings without rules, and always-visible task title/body cards instead of inline unfolding. Trial five entries per page with Previous/numbered pages/Next using the segmented-switch treatment; activity uses the same pagination and a bounded scroll body. Direct task navigation opens its containing page. This supersedes the activity entry-limit switch and one-open-task interaction described below. Page size is currently fixed at five; backend pagination remains a production follow-up, not simulated completeness.

### Overview purpose — reopened
Owner questions whether Overview adds value beyond duplicated Projects/People navigation. Preserve the useful aggregate numbers while deciding whether to retire Overview or give it a genuine cross-project health/attention role. No tab removal or inferred overall-state metric is authorized by this discussion.

### Overview remapping
Retain the metrics → projects → recent activity layout; use Project/Workstream/Task vocabulary and shared cards/disclosures/link styling. Project cards show short description, status, workstream/open-task/explicit-blocked counts, latest actual project event, participants and project navigation. Blocked counts include the explicitly authored prototype state, not a live assertion. Recent recorded activity is newest-first with the shared local limit switch and scroll body, actual source links and exact workstream/project navigation. No chart, fabricated events, repository-wide inference or global time filter. Broader palette harmonization is deferred; owner prefers the newer segmented-switch styling as a future direction.

### Activity limit interaction
Use a one-click segmented switch showing 3 / 5 / 10 / 20 / 50, not a dropdown. Selected value has a bright surface and stronger text; others are subdued. Buttons expose aria-pressed and retain keyboard operation. Default remains 5; the available-count and independent scroll body are unchanged.

### Activity entry limits — implementation follow-through
Repositories Current work now shares the People project-description/right-aligned navigation row. Prototype populated Recent activity widgets have a local 3/5/10/20/50 selector (default 5), available-entry count and keyboard-focusable bounded scroll body. This currently limits the supplied snapshot/examples only, not backend retrieval. Production port MUST apply the same shared control to every populated activity/history widget, with scope-correct retrieval/pagination and truncation disclosure; empty-state placeholders need no ineffective selector. Charts remain deferred.

### People grouping and local activity controls
People project groups place short project description and right-aligned Open project navigation immediately beneath the project heading; remove the old group-bottom action. Separate inline repository link pairs with a dot; column/stacked presentation remains an option for larger lists. Future activity/history widgets use independent entry-limit controls (3, 5, 10, 20, 50) and bounded scrollable bodies, not a dashboard-wide time filter. Proposed default is 5; entry limit is not a time window, complete-history claim or chart total. Larger results require correct scoped retrieval/pagination and explicit truncation/loading states; filters by source/type/repository are later product work, not implemented by this layout iteration. Preserve accessible controls, keyboard scrolling and readable content without nested excessive scroll areas.

### People remapping and activity deferral
Defer activity charts and multi-project event processing until real product usage/data clarify their semantics. Retain existing lists; no chart or invented attribution is added. People uses the shared selector/detail split, collapsible person header, project-grouped compact workstream cards, lower-right project navigation and repository internal/external link pairs. Related repositories are derived from linked workstreams, not asserted maintainership. Missing biography and personal attribution remain honest empty states; workstream events are not person events.

### Repositories detail refinement
Keep owner and repository name separate in the selector; add recorded repository recency at its upper right. Repository description uses the shared collapsible title styling. External GitHub navigation belongs in the lower-right footer opposite default branch. Trial grouping Current work by project, with individual workstream cards beneath each project label; do not group workstreams by themselves or imply repository ownership by one project.

### Entity hierarchy and content
- Display **Project → Workstream → Task**; frozen export keys and live schema remain unchanged.
- Projects provide orientation and short workstream summaries; Progress supplies full descriptions.
- Tasks have a concise title distinct from their full description. Current short titles are authored
  overlays; separate title/description fields are a later live-model requirement.
- Task state can be explicitly supplied by users or composed by a librarian. Current live data has
  open/resolved states; the diagnostics blocked state is a prototype-only example, never inferred
  from a workstream blocker. No live state extension is implemented.

### Description, checkpoints and plans
- Keep description surfaces white, with consistent bold muted collapse labels, matching arrows,
  title/status alignment, supporting labels and thin dividers.
- Project prose may be followed by intermediate checkpoints. Workstreams advance project checkpoints
  with scoped plans; individual tasks may have their own implementation/investigation plans.
- Plans are optional data, but **No plan** is a useful reminder to supply one. Do not render **Has plan**.
- Place plans beside their entity description, not in a detached panel below the task list.
  Plan labels are bold and preceded by a horizontal divider; plans collapse independently.
- Prototype project checkpoints and the diagnostics task plan are authored overlays, not reported
  completion. Existing workstream steps remain workstream-owned. Automatic checkpoint linkage and
  parent/child progress rollups are not implemented.
- Task details unfold directly below the clicked row; at most one task is unfolded at a time.
  Clicking it again collapses it. Use **Tasks (N)**, without repeating the workstream title.
- Task bodies omit repeated status and workstream-context fields. Repository references now have
  their own supporting-reference row rather than the earlier redundant metadata table.

### Selectors and Projects cards
- Project/workstream selectors show status through a coloured dot before the name, not status pills
  or coloured contours. Current selection remains distinguishable independently from status.
- Counts are compact tags. Known blocked-task counts are red; all adjacent pills share typography,
  padding and height. Never infer blocked-task counts from a workstream-level blocker.
- Relative recency sits at the upper right. Use entity-associated recorded events only; absent
  events mean **No recorded activity**. Frozen-prototype dates use the latest snapshot event as
  their reference, explained alongside the exact date in the tooltip.
- Progress project names interrupt a thin horizontal rule spanning the selector width. Workstreams
  remain unindented: no vertical guide, darker group background or enclosing group box.
- Projects workstream cards show title, short summary, status/open-task/known-blocked-task tags and
  one latest recorded event. Their titles link to Progress; separate Open workstream/Review blocker
  buttons and the orange Blocker reported banner are removed.
- Participants remain a quiet inline row beneath a divider. Project-header supporting repositories
  remain removed for now; do not reintroduce them through unrelated layout changes.
- Remove per-entry prototype-copy badges from the visual UI. Preserve provenance in editorial.json,
  the prototype documentation and this spec rather than cluttering content cards.

### Repository associations and navigation
- A workstream may use multiple supporting repositories. A repository may support multiple
  workstreams across different projects: this is a many-to-many association, not project ownership.
- Tasks may also reference multiple repositories, although many tasks will use just one. Associations
  are explicit; tasks do not automatically inherit all parent repositories or activity.
- Use **Supporting repositories**, not Supporting code: repositories can contain data, calibration
  material and procedures as well as code. Multiple names may wrap in the compact reference row.
- Default name click should open the **exact entry in Repositories**. A separate accessible **↗**
  control labelled **GitHub ↗** opens the actual external URL in a new tab, separated from the
  internal name link by a thin vertical rule and spacing. Keep each pair visually associated;
  internal names have a “View repository in dashboard” tooltip. Do not merely switch tabs without identifying
  the intended repository. Tooltips/accessible labels identify the external destination.
- **Prototype implementation:** repository names now route to the exact selected repository in a
  selector/detail view; separate accessible external icons open real GitHub URLs. Repository details
  show purpose, branch, associated workstreams and projects. Repository-scoped activity remains an
  honest empty state where the frozen export supplies no explicit repository association; activity
  navigation beyond existing source URLs remains deferred.

### Activity and supporting-reference placement
- Keep the current placement draft: full description → scoped plan → compact supporting-repository
  row → independently collapsible Recent activity, inside the workstream or expanded task card.
- Activity is a record of updates, not a plan or inferred completion. Preserve exact scope and real
  source URLs. Do not substitute repository-wide events for missing workstream/task events.
- Diagnostics illustrative reports live only in editorial.json and carry a quiet **Example report**
  label. No invented PR URLs, attribution or live progress claims. They do not affect recorded-event
  counts or selector recency; data.json remains unchanged.
- Activity may link to a related **Repositories** entry when an explicit association exists, and/or
  to its external source when available. With neither, keep plain text; never guess a destination.
- Owner is satisfied with the current supporting-reference and activity listing layouts as the basis
  for the next iteration. Next establish the Repositories destination, then add viable activity
  navigation. People follows; neither tab redesign is completed by this spec update.


## Historical design and source analysis

The remainder preserves the original analysis and its status as recorded then. Source paths, branch
identities, verification labels and governance wording below are historical, not a fresh audit.
Current prototype decisions and open questions above take precedence.

**Status: working design document. NOT ratified. No standing decision has been taken.**

This document starts a new spec for the dashboard's information-architecture pivot. It **collects** the
owner's stated intent, **separates** it from proposals and from open questions, and **verifies** every
claim against the source currently checked out. It is a working surface for the owner to react to — it is
**not** a product decision, not an acceptance record, and not a substitute for
[`docs/ux-v2/DECISIONS.md`](../ux-v2/DECISIONS.md).

- **Prototype scope only.** The standalone HTML trial is authorized for iteration. No production
  implementation is selected or authorized by this document; porting remains a separate decision.
- **No source change is made by this document.** A source change still travels
  `bun run check → vendor → reinstall → served-build guard` ([`AGENTS.md`](../../AGENTS.md) *Build → vendor
  → serve*); any fixture/dataset deploy is a **separate** act with its own authorization.
- **Old specs are preserved unedited.** Nothing under `docs/ux-v2/` (including `DECISIONS.md`) is edited
  until a decision here is **ratified**. The inventory of specs this pivot reads is in
  [Appendix A](#appendix-a--old-spec-inventory-preserved-not-rewritten).
- **No commit and no push.** This file is written into the working tree only.
- **An interactive prototype trial exists.** On the branch `prototype/dashboard-ui-rework` (annotated tag
  `dashboard-ui-rework-checkpoint-<date>`) a self-contained prototype carries the entity-page
  clarifications in [§7](#7-prototype-trial--entity-page-clarifications-not-ratified). It is a **trial to
  react to — not an approved design, not a candidate implementation, and not a source change**.

## Provenance of the two inputs

The rewrite is based on the owner's design brief plus **two read-only inputs** produced in this working
tree:

1. **[`.hermes/scratch/ux-diagnosis/RESEARCH.md`](../../.hermes/scratch/ux-diagnosis/RESEARCH.md)** — a
   static source read (file:line anchors, no live instance).
2. **[`.hermes/scratch/ux-diagnosis/reviewer/report.md`](../../.hermes/scratch/ux-diagnosis/reviewer/report.md)**
   — a read-only served-baseline capture + DOM measurement (served build
   `0.2.0+dev.a5f76a608db2`, revision `17`, asset sha256 `f6e6b8f3…`).

Where the two inputs disagree, or where either has drifted from the source as it stands, the correction is
stated in [§1](#1-source-verified-current-state--corrections). This document did **not** query a live
instance; served facts are quoted from input 2 and its manifest.

**Checkout under verification:** branch `docs/retained-metadata-plan-amendment`, tip `31e3d944`; the
publicated source of truth `origin/main` is `a21fc1ba` (the merge of PR #7). `git diff HEAD origin/main --
src/` is empty, so the analysis reads the same source bytes as `origin/main`.

## Status legend

| Tag | Meaning |
|---|---|
| **AGREED** | The owner stated this as intent. It records *what the owner wants*, **not** implementation approval and not a decision to build. |
| **PROPOSED** | A concrete candidate raised but **not chosen**; the owner may accept, change or drop it. |
| **OPEN** | A question that is **not ratified**; the doc states it rather than resolving it by silence. |
| **VERIFIED** | A fact re-checked against the source in this pass. |
| **STALE** | A claim in an input that the source has moved past. |

---

## 1. Source-verified current state + corrections

Each row is a fact re-checked against the current tree. Where an input said otherwise, the correction is
named.

### 1.1 Navigation is FIVE peer tabs (corrects the "four views" reading) — VERIFIED

`VIEW_OPTIONS` (`src/ui.tsx:572-578`) is exactly five equal peer tabs, in this order: **Overview, Topics,
People, Repositories, Progress**. Overview is the default landing (`src/ui.tsx:3557`). The harness names
the same five (`harness/verify-page.mjs:5490`).

- **Correction:** `RESEARCH.md` §3 calls `RepositoriesView` "one of the four navigable views". That is the
  `ENTITY_VIEW` map (`src/ui.tsx:604-610`), which has four *entity destinations* — it is not the toolbar's
  tab set. The toolbar offers **five** peers.
- **This conflict is historical, not a live choice.** `DECISIONS.md` §13 (`:306-315`) explicitly
  **supersedes** §3 and §5's earlier "four navigable views / `Research overview` is the shell" ruling and
  restores the five equal tabs. `docs/ux-v2/README.md:16-20` still carries the retired four-view prose and
  is stale against §13.
- **Current choice = five equal peers.** This is not re-litigated and the owner is not asked to re-decide
  it. Where a later section refers to a single tab, "peer" is meant.

### 1.2 Repository metadata descriptions are populated (historical F07/F09 superseded) — VERIFIED, with a caveat

The *historical* finding **F07** ("Repository factual descriptions are absent"; `findings.md:37`) and
**F09** ("Repository identity fields are skeletal"; `findings.md:40`) described `url/description/
defaultBranch: ''` on all repositories (`2026-10-09-retained-amendment-execution-report.md:1079`).

- **Correction (STALE):** those descriptions are now **populated**. The retained-amendment execution set
  each repository's `url` / `description` / `defaultBranch` from the **pinned README** byte-for-byte
  (`2026-10-09-retained-amendment-execution-report.md:104,126,128`; acceptance record
  `2026-10-09-retained-amendment-acceptance-record.md:35`) and **merged in PR #7 (`a21fc1ba`)**.
  `RESEARCH.md` §3, which quotes `findings.md:98-99` ("Weak/absent repository description"), is therefore
  **stale** — it described the pre-PR-7 fixture.
- **Topic descriptions / summaries remain optional and blank by design** (F07b, F16): this is honest, not a
  defect.
- **Caveat (boundary):** this document did **not** re-measure a live instance. The claim rests on the
  committed execution/acceptance records and on the model (`Topic`/`Repository` carry the fields,
  `src/store.ts:101-120`).

### 1.3 Plan-step numbering — stored `1..4` rendered **as stored** — RESOLVED (owner, 2026-10-10)

- Store model: `position` is a nullable non-negative integer; `optionalPosition` accepts `0` or any
  positive int (`src/store.ts:653-664`); schema `plan_steps.position INTEGER`
  (`migrations/004-ux-v2-model.sql:139`).
- **Owner ruling (current agreement, 2026-10-10):** a step's number renders the **stored** `position`
  directly — `${step.position}.` in `ScopedPlan` — never rebased. A positive value renders as itself
  (`1..4` → `1., 2., 3., 4.`), a stored `0` renders `0.`, and a `null` position renders **no number**.
  This settles the earlier 0-based reading: the historical Q3 alternative (`${position + 1}`) is
  **superseded** and is **not** a current mandate — it is preserved only as a superseded note.
- **No data rebasing:** the correction is display-only; no stored `position` is rewritten.
- The public research fixture's diagnostics plan is authored at positions **1, 2, 3, 4**
  (`docs/plans/public-research-retained-fixture-amendment-design.md` §7.3 E / F12). Under the ruling it
  renders `1., 2., 3., 4.` — the reviewed defect **R1** (`dashboard-production-port-review-findings.md`)
  observed the pre-fix `2., 3., 4., 5.` on the served dataset, now corrected in `src/ui.tsx`.
- **Regression:** `harness/reviewer-corrections/regression.mjs` asserts the rendered numbers equal the
  stored positions for `1..4`, `0`, and `null` at 1280×800 and 1440×900.

### 1.4 Progress "Current problem" / "Open problems on this axis" — VERIFIED

- Card heading `Current problem` (`src/ui.tsx:4558`, unconditional in both index modes).
- Picker heading `Open problems on this axis` (`src/ui.tsx:4778`); a row click calls
  **`setSelectedProblemId(problem.id)` only** (`src/ui.tsx:4786`) — no `call()`, no write.
- Selection is **local React state** (`selectedProblemId`/`selectedAxisId`/`indexMode`,
  `src/ui.tsx:4125-4136`); `openEntity` sets `entityTarget`+`setView` and writes nothing
  (`src/ui.tsx:4951-4960`).
- **`activeProblem` / `selectProblem` / `active_problem` do not exist** anywhere in `src/`, `migrations/`,
  docs or harness (exhaustive grep = 0).
- This matches `DECISIONS.md` §13 (`:327-330`): the top-left is the **current selected Problem**, not a
  duplicate inventory; selection is a **view state** and needs no model field.

### 1.5 Repository identity — `url` carried in the model, never rendered — VERIFIED

- Model: `Repository.url` (`src/store.ts:115`), UI mirror (`src/ui.tsx:172`), DDL
  `repositories.url TEXT NOT NULL DEFAULT ''` (`migrations/002-coordination-model.sql:41-46`).
- **Not rendered:** there is **no `<a href>`** in the Repositories view (index or panel). The served
  capture confirms **0 anchors** in both (reviewer report `:33-35`); every affordance is a `<button>` /
  `EntityTag` chip. Navigation is `onClick`-only.
- Detail header identity = combined `fullName` + last-activity box + `description · default branch …`
  (`src/ui.tsx:3886-3934`); the index row = `fullName` + supports-line + recency
  (`src/ui.tsx:3868-3875`).

### 1.6 Header duplicate definition — the Repositories detail header restates its own "Supports" rail — VERIFIED

The **current** duplication the owner flagged lives in the Repositories **detail** panel:

- The **header** renders the repository's **topic `EntityTag`s** plus a quiet "N development axes" count
  (`src/ui.tsx:3898-3925`).
- The **rail** below renders a **`Supports`** section listing **the same topics again** with their
  relationship (`src/ui.tsx:4026-4047`).

So the same topic set is defined twice on one panel: once as header relationship tags, once as the
`Supports` list. The owner's instruction ([§2, T3](#topics)) is to **remove the header relationship tags**
as redundant and **keep the rail's `Supports` + the state badges**. This is a *composition* reading of the
current render, not a code change made here.

### 1.7 Activity source completeness — no chart bucket, no completeness metadata — VERIFIED

`getOverview` (`src/store.ts:2792-2897`) answers the Overview tab with:

| Field | What it is | Bound |
|---|---|---|
| `timeline` | `recentProgress(...)` — activity **grouped per axis**, newest-first | `DEFAULT_TIMELINE_AXIS_LIMIT = 10` axes (`src/store.ts:526`, called `:2889`) |
| `recentActivity` | flat newest-first list | `limit: 25` (`src/store.ts:2876-2879`) |
| `topics[].activityCount` | per-topic count **in the selected window** | server number, not a list length |
| `repositories` rollup | `lastActivityAt`, `recentActivity[]` (capped) | `MAX_ROLLUP_LIMIT = 50` (`src/store.ts:522`) |

There is **no daily-bucket projection**, no per-day series, and **no completeness metadata** on any
bucket. The timeline is a **capped grouped list**, not a binned series.

- **Consequence for the proposed activity plot:** an Overview "daily bars" chart cannot be drawn from the
  current payload without either a **new bucketed projection** or **client-side binning of a capped list**
  (which would print a wrong denominator). The owner's instruction — *investigate the exact limit; store
  completeness metadata; do not claim a client bucket is accurate when the source is capped* — maps
  exactly onto this gap. The chart is **PROPOSED**, source approach **OPEN** ([§3, §4](#3-proposals-proposed-not-ratified)).

### 1.8 "Description" vs "summary" (Topics) — two stored fields, not a derived duplicate — VERIFIED

The topic model carries **both** `description` (`src/store.ts:104`) and `summary` (`src/store.ts:106`) as
stored strings. The Topics detail renders them as **two distinct claims**:

- **description** — value labelled `description`; fallback `No description recorded.`
  (`src/ui.tsx:5465-5478`).
- **summary** — value labelled `approved summary — a human interpretation, not an agent one`; fallback
  `no approved summary` (`src/ui.tsx:5479-5488`).

The Topics **index row** shows only `topic.description` (`src/ui.tsx:3600-3603`).

- **So there is no invented/derived field presenting as "description".** `description` and `summary` are
  two separate **stored** fields; `summary` is explicitly a **human-approved** claim (cf. F07b/F16).
- A topic's **axis "reading"** is a different, **derived** thing (a presentational slot, `DECISIONS.md`
  §14.3), not the topic description.
- **The definitions to hand the parent (owner asked to be told):**
  - `topic.description` — stored editorial text; optional, may be blank by design (F07b).
  - `topic.summary` — stored, **human-approved** interpretation; optional, blank by design (F16).
  - axis "reading" / `currentState` — derived, per-axis, clamped until its fold opens (`DECISIONS.md`
    §17; U12).
- Whether the Topics RHS should show description, summary, or both is **OPEN** ([§4, Q5](#4-open-architecture-questions-not-ratified)).

---

## 2. Owner-stated intent (AGREED)

These are the owner's own words, itemised by tab. **AGREED = recorded intent only** — not a build
authorization, and not a standing decision. Each item cites the current render it lands on.

### Overview

| # | Owner intent | Current anchor | Note |
|---|---|---|---|
| O1 | Each topic shows its **short description**. | `src/ui.tsx:3600-3603` (already rendered) | already true; keep |
| O2 | **Add an activity plot** — "planned U06", daily bars over 7/14/30. | not implemented | → **PROPOSED** ([§3, PR-A](#3-proposals-proposed-not-ratified)) |
| O3 | **Retire the Overview "Repository activity" column** — "pending confirm, strong proposal"; do **NOT** retire the Repositories tab's own activity. | column at `src/ui.tsx:3680-3764` | → **PROPOSED** ([§3, PR-B](#3-proposals-proposed-not-ratified)) |
| O4 | Overview stays a peer tab with the window control that belongs to it alone. | `src/ui.tsx:3555-3568`; `DECISIONS.md` §13 | already true |

### Topics

| # | Owner intent | Current anchor | Note |
|---|---|---|---|
| T1 | Left selector keeps **name · current axis · last active** — "okay". | index rows (`src/ui.tsx` topics index) | already true |
| T2 | RHS keeps **name** and **description/summary**. | `src/ui.tsx:5461,5465-5489` | definitions in [§1.8](#18-description-vs-summary-topics--two-stored-fields-not-a-derived-duplicate); choice **OPEN** |
| T3 | **Remove header relationship tags** (redundant with the bottom repo block); **keep badges/statuses**. | see [§1.6](#16-header-duplicate-definition--the-repositories-detail-header-restates-its-own-supports-rail) | AGREED |
| T4 | **People dedicated, navigable section.** | topic detail people lane | AGREED |
| T5 | Topics = **big directions**; People = **active brief work**; Repositories = **recent activity / hot issue**. | — | AGREED (framing) |
| T6 | Links: render a **PR/source URL when it exists**; **never fabricate**; **no "evidence/history summary full"**. | `Activity.sourceUrl` (`src/store.ts:165`); Evidence currently renders `sourceUrl` as plain text (`src/ui.tsx:4869`) | AGREED |

### Progress

| # | Owner intent | Current anchor | Note |
|---|---|---|---|
| P1 | **Correction is the primary Progress control**; **no deletion ability.** | correction form `src/ui.tsx:2562-2704`; **no delete action exists** — the toolset is `get_overview`/`get_topic`/`get_progress`/`search_dashboard`/`reconcile_topic`/`record_activity` (`src/actions.ts:7-8`) | AGREED |
| P2 | **Header duplicate tags removed.** | mirrors [§1.6](#16-header-duplicate-definition--the-repositories-detail-header-restates-its-own-supports-rail) for the Progress/Topics headers | AGREED |
| P3 | Involvement **by topic**; title text; an **"Open Topic"** button; **bottom axis/problem brief text + status**; **explicit links**; a **"go to Progress"**; selection **preserves full details**. | `src/ui.tsx:4106-4210` (ProgressView) | AGREED |

### Repositories

| # | Owner intent | Current anchor | Note |
|---|---|---|---|
| R1 | **Browser retained.** | `src/ui.tsx:3783-4086` | AGREED |
| R2 | RHS = **"Current Work (n)"** with **titles as text** + a **direct work navigation button**; **no self-repo tag** in the work lane; sidebar keeps **Recent activity / Supports / relationship People**. | `src/ui.tsx:3941-4079` | AGREED |
| R3 | **Repository description separate; branch separate.** | `src/ui.tsx:3928-3933` | already separate today |
| R4 | Selectors **compact and meaningful**; **no duplicated counts**. | `src/ui.tsx:3868-3875` | AGREED |
| R5 | **Repository GitHub link** — the `url` is in the model but not rendered; render it. | `src/store.ts:115`; not rendered ([§1.5](#15-repository-identity--url-carried-in-the-model-never-rendered)) | → **PROPOSED** ([§3, PR-F](#3-proposals-proposed-not-ratified)) |

### People

| # | Owner intent | Current anchor | Note |
|---|---|---|---|
| PE1 | Selector = **name**; optionally a **future "team group"** — **not implemented**; the only grouping metadata today is the **account mapping** (detail, not picker). | `Person` carries `nakamaUserId`/`githubLogin` (`src/store.ts:122-128`) | → **PROPOSED/OPEN** |
| PE2 | RHS = **name**, **person "bio"**, **roles?** — **existing fields only**; a **new "maintainership" distinction**; a **work↔repo association is not proof of maintainer**; label unspecified; **requires explicit roles**. | `Person` has **no** bio and **no** person-level role field; a role exists only on a topic↔person link (`topic_people.role`, `src/store.ts:2925`) | → **OPEN** ([§4, Q6](#4-open-architecture-questions-not-ratified)) |

### Cross-cutting architecture (owner-stated principles)

- **Progressive abstraction** — compact upward: `problem/evidence/activity → axis interpretation → topic
  summary → overview signal` (`contract/information-architecture.md` §10), not duplication.
- **Back navigation** and **deep links** are first-class; navigation changes the view and writes nothing.
- **Semantics** preserved: a status badge never routes; a tag routes *and selects* (`DECISIONS.md`,
  `contract/component-contract.md`).
- **Accessible text buttons** and **counts**; no **cumulative evidence computed on the frontend**.
- **Privacy / public-record hygiene** unchanged (`DECISIONS.md` §11).
- **Current baseline preserved:** U12's clamp-release-on-fold (`DECISIONS.md` §17) stays; replacing the
  fold is a **future** proposal, not part of this pivot.

---

## 3. Proposals (PROPOSED, not ratified)

| # | Proposal | Depends on / blocks |
|---|---|---|
| **PR-A** | **Overview activity plot** — daily bars over 7/14/30 days ("planned U06"). | Needs a **new bucketed projection** and **completeness metadata** ([§1.7](#17-activity-source-completeness--no-chart-bucket-no-completeness-metadata)); source approach **OPEN** ([§4, Q4](#4-open-architecture-questions-not-ratified)). |
| **PR-B** | **Retire the Overview "Repository activity" column** — owner calls it a **strong proposal, pending confirmation**. Does **not** touch the Repositories tab's own activity (that stays). | Confirm with owner; composition change only. |
| **PR-C** | **Progress tree** — `topic → axis → problem` hierarchy as the canonical Progress browse. | **Not chosen**; the owner has **not answered the parent questions** ([§4, Q1-Q2](#4-open-architecture-questions-not-ratified)). |
| **PR-D** | **People maintainership distinction** — a first-class, explicitly-role-backed label; a work↔repo association must **not** be read as maintainership. | Requires **explicit roles**; label **unspecified**; model has no person-level role field today. |
| **PR-E** | **Fold-replacement** — replacing the axis fold with another read affordance. | **Future proposal.** The current U12 fold behavior (`DECISIONS.md` §17) is preserved and is **not** changed here. |
| **PR-F** | **Render the repository `url` as a safe link** in the Repositories header. | Field already exists ([§1.5](#15-repository-identity--url-carried-in-the-model-never-rendered)); public host stays verbatim, identity-shaped hosts stay redacted (`DECISIONS.md` §11). |

---

## 4. OPEN architecture questions (not ratified)

Stated, not resolved. None of these is answered by this document.

- **Q1 — Axis semantics.** Is an *Axis* a **major workstream / challenge** (loose, may exist without a
  formal problem), or a **strict major problem**? The schema supports a **plan without an open problem**
  (a plan hangs under an axis; `ProgressAxisRow.plan`, `src/store.ts:1502-1527`). **OPEN.**
- **Q2 — Progress tree shape.** Is the axis the frame with problems as content (U4's original reading), or
  is the "current problem" the top-left subject (`DECISIONS.md` §13)? Both records remain "accepted" and
  were never cross-referenced. Resolution pattern per this repo: a **dated erratum** naming which record
  supersedes which — **not** a quiet rename (`RESEARCH.md` §5). **OPEN.**
- **Q3 — Step-numbering convention. RESOLVED (owner, 2026-10-10).** Render the **stored** `position`
  directly (`${position}.`) — no rebasing; a positive value renders as itself, a stored `0` renders `0.`,
  and a `null` renders no number. The historical 0-based `position + 1` reading is **superseded** (not a
  current mandate). No live record is rebased; the change is display-only
  ([§1.3](#13-plan-step-numbering--stored-14-rendered-as-stored--resolved-owner-2026-10-10)).
- **Q4 — Activity-chart source.** New bucketed projection vs client binning; completeness metadata; the
  **exact** capped-timeline limit (`DEFAULT_TIMELINE_AXIS_LIMIT = 10` axes, `src/store.ts:526`). **OPEN.**
- **Q5 — Topics RHS description/summary.** Show `description`, `summary`, or both? Definitions are in
  [§1.8](#18-description-vs-summary-topics--two-stored-fields-not-a-derived-duplicate). **OPEN.**
- **Q6 — People grouping / roles / teams.** Team grouping is **not implemented**; maintainership requires
  **explicit roles**; the model carries no person-level role field today. **OPEN.**
- **Q7 — Repository search.** "Search candidate, front/local" — not implemented; keep it simple, no options
  to over-engineer. **OPEN.**
- **Q8 — Axis-count policy.** Should a displayed axis count be **total** or **nonterminal only**
  (`state ∈ {active, blocked}`, the working recommendation), and does the selector use one policy while a
  "current axes" label uses another? The owner's "worth counting only *active* axes" intent needs an exact
  definition of *active*; the prototype shows the **total** until ruled. **OPEN** ([§7.6](#76-counts-shown--axes-and-activity-open)).
- **Q9 — Activity count & window.** Is the per-topic `activityCount` **rollup** complete for the capture,
  and what **time window** does it cover (it disagrees with the snapshot event list — rollup `3 + 4 = 7` vs
  `8` snapshot events)? Should a future **active-activity** filter (distinct from axis state) exist? Until
  ruled, the prototype labels the frozen snapshot reading **"events in snapshot"**. **OPEN** ([§7.6](#76-counts-shown--axes-and-activity-open)).

---

## 5. Focused decision log

Two primary semantics plus the chart source. These are **placeholders**; they do **not** block writing.

| # | Decision (to be taken) | Primary semantics | State |
|---|---|---|---|
| **D-1** | **Progress = browse** (index→detail; selection costs no query) **+ correction** — where the correction control sits as the primary act. | Progress | placeholder |
| **D-2** | **Overview repository-activity column retired; Repositories' own activity kept.** | Overview / Repositories | placeholder (owner: strong proposal, pending confirm) |
| **D-3** | **Chart source approach** (new projection vs client binning; completeness metadata). | Overview chart | placeholder |

---

## 6. Scope & governance

- **Design only.** No preview, no candidate implementation, no build/vendor/reinstall. The "31-gate"
  workflow of earlier units does **not** apply; a **simple acceptance** is intended for a later stage and is
  **not** defined by this document.
- **Governance note.** `docs/design/` is a **new** location. Per [`AGENTS.md`](../../AGENTS.md) *Records and
  docs*: a **standing decision** belongs in `docs/ux-v2/DECISIONS.md`; a unit's doc in `docs/ux-v2/<unit>.md`;
  an acceptance record in `docs/reviews/`. **This file is none of those** — it is a working pivot spec, and
  it must not be mistaken for a decision record.
- **`DECISIONS.md` is not edited** until the owner ratifies a decision here. Old specs are preserved.
- **No commit, no push** — the owner did not ask for either for this design pass.

---

## 7. Prototype trial — entity-page clarifications (NOT ratified)

The owner's latest discussion is recorded here and carried into the interactive prototype trial on
`prototype/dashboard-ui-rework`. **AGREED = recorded intent only; PROPOSED/OPEN unchanged; nothing here
is ratified, and the prototype is not an approved design.** The prototype reads only a frozen,
alias-only export and performs no write.

### 7.1 Topics — research directions (AGREED framing)

- A **Topic is a meaningful research direction** (the owner's examples — *Experimental research*,
  *Numerical model validation*, *ROM examples* — are illustrations, **not** additions to the actual
  dataset; the frozen export keeps the two stored topics unchanged).
- Topics browse **Topic → Axis → Problem**; the selector row keeps the **short title**, **purpose**,
  **status**, a **blocker brief**, and **people**, and carries an **explicit "Open axis" navigation
  control** (the row is not itself a link — navigation is deliberate, per §2 cross-cutting principles).
- Where the source stores no purpose (`description`/`summary` blank by design, [§1.8](#18-description-vs-summary-topics--two-stored-fields-not-a-derived-duplicate)), the prototype shows an **honest missing state**
  ("No description recorded in the source.") — it does **not** invent one.

### 7.2 Progress — the axis frame (AGREED)

- **Selected axis** shows its **FULL purpose and current reading** — *not summarised, not folded*. The
  axis is a **frame, not a folder**: its full context stays visible beside the problem index.
- **Problem index**: the open problems attached to the selected axis. A **Problem is a concrete
  objective**; an **active axis should carry a problem** (a plan may exist without one — Q1 stays OPEN).
- **Selected problem** shows its **FULL statement** (clamped in the index, with a **"Show full
  statement"** control — never an invented short title or agent rewrite), its **status**, the axis
  **blocker**, and its **work context**.
- **The plan is the axis's.** The prototype renders it as the **shared axis plan**, explicitly labelled
  *"shared by this axis, not owned by any single problem"*; it **never infers problem-specific plan
  ownership**.
- **No active-problem persistence.** Selection is **view state** ([§1.4](#14-progress-current-problem--open-problems-on-this-axis--verified)); the
  prototype keeps it in local state + the URL hash and writes nothing.
- **Stored step positions are shown as stored** — human `1..4`, matching the source; not rebased
  ([§1.3](#13-plan-step-numbering--stored-14-rendered-as-stored--resolved-owner-2026-10-10), Q3 resolved).

### 7.3 Entity semantics — what the prototype must not do

- It **does not invent data**: no fabricated fields, no manufactured "short summaries", no semantic
  rewrites of source text (title/excerpt only, factual).
- It **does not resolve** the OPEN questions in [§4](#4-open-architecture-questions-not-ratified) (axis
  semantics, tree shape, description-vs-summary — all remain **OPEN**; step numbering is resolved above).
- It is a **trial** — if many files, it is archived as a read-only, auth-free zip with semantic aliases
  and no private ids or paths, under public-record hygiene.

### 7.4 Topics selector — one real control, not a row of nested buttons (AGREED)

The owner's current focus is the Topics **selector** (left column). Its requirements, carried into the
prototype:

- **The whole row is a single real `<button>`.** There is **no nested "Select" control**, **no per-row
  "Open axis →" button**, and **no in-row person or repo tags**. A click anywhere on the row (including the
  name) selects that direction — the row *is* the control.
- **Keyboard:** the row is reachable by `Tab` and activated by `Enter` / `Space` (native button behaviour),
  and its **selected** state is exposed via **`aria-pressed`** with a clear accessible name.
- **Content:** name, status, the topic's **short description**, the **axis count**, and the **activity
  count** only. A per-row **blocker brief** and any **problem count** are dropped for now ("optional
  problems, pending"; the problem-count field is excluded this round).
- **Navigating to Progress** stays a deliberate act through the axis blocks' **"Open axis in Progress →"**
  control on the RHS (the row no longer navigates), per §2's "the row is not itself a link" principle.

### 7.5 Topic descriptions — author-drafted prototype copy, in a separate overlay (draft, NOT source-approved)

Both stored topics have a **blank `description`** (and blank `summary`), so the prototype renders copy from
a **separate, author-drafted overlay** (`prototypes/dashboard-ui-rework/editorial.json`) instead of the
missing-state placeholder. This overlay is **prototype editorial text**:

- It is **draft, not source-approved**; it is **not written to any instance**; it is **not part of the
  frozen export** (`data.json`'s bytes and sha256 are unchanged); and it **asserts no fact the source does
  not already carry** — each entry is **grounded in that topic's own recorded axes**.
- It is a **separate overlay UI concern**: every place the copy appears carries a small per-card badge
  ("prototype copy · not source-approved"). There is **no page-wide warning** and **no missing-state
  placeholder** where copy exists.

**Exact copy (verbatim, draft):**

- `topic-2` — **Experimental research** (grounded in `axis-3`, `axis-4`, `axis-5`, `axis-6`):
  - **short:** *Experimental methods, measurement acquisition and data analysis.*
  - **long (in-depth):** *Develop experimental methods and the tools needed to acquire, process and
    interpret measurements. Current work covers experimental-device control and acquisition,
    measurement-data processing, and validation of optical and UDV workflows.*
- `topic-1` — **Research infrastructure / team management** (grounded in `axis-1`, `axis-2`; optional,
  clearly proposed editorial, no owner-approved new facts):
  - **short:** *Tools and coordination for research work.*
  - **long (in-depth):** *Tools and coordination for research work. Current work covers the research
    dashboard and focused retrieval, and agent consultation and automation evidence.*

**Short vs long:** the **short** description is reused by the selector row and the Overview list; the
**long** description is shown only on the **selected topic** detail (plain reading — the short form is not
repeated above it).

**The stored `summary` field is not an "approved summary".** The source keeps `topic.summary` as a stored,
optional string (`src/store.ts:106`; §1.8). An earlier prototype cut rendered it under the label *"approved
summary"*, implying an approval the prototype has no basis to claim; that label is **removed from the
prototype's visible UI**. The field stays in the export **unrenamed and unrendered** until its purpose is
defined (still OPEN — [§4, Q5](#4-open-architecture-questions-not-ratified)).

### 7.6 Counts shown — axes and activity (OPEN)

- **Axis count.** The selector shows the topic's **total** axis count (`N axes`). The owner's "worth
  counting only *active* axes" intent needs an explicit definition of *active* — the working
  recommendation is **nonterminal** (`state ∈ {active, blocked}`), but that is a **human choice** and is
  **not silently made**: the prototype shows the **total** until the owner rules. A separate "current
  axes" label is deferred with the same decision. **OPEN** ([§4, Q8](#4-open-architecture-questions-not-ratified)).
- **Activity count.** The export carries both a per-topic `activityCount` **rollup** (the source's own
  window; a server number, not a list length — §1.7) and a flat `activity` event list. The prototype
  labels the count **"recorded activities"** only when the rollup totals **match** the snapshot list;
  otherwise it shows the count of the frozen snapshot events, labelled **"events in snapshot"**. Here the
  rollup totals **7** (`3 + 4`) against **8** snapshot events, so the snapshot reading is used. The
  **exact time window**, whether the rollup is *complete*, and whether a future **active-activity** filter
  should exist are all **OPEN** ([§4, Q9](#4-open-architecture-questions-not-ratified)). Nothing is called
  "active", and no event is manufactured.

## Appendix A — Old-spec inventory (preserved, not rewritten)

Read and referenced by this pivot; **none edited**:

- `docs/ux-v2/contract/information-architecture.md` — the IA semantics (Topic/Axis/Problem/Repository/
  Person/Plan/Activity/Evidence; §10 abstraction flow; §11 confidence semantics).
- `docs/ux-v2/contract/interaction-spec.md`, `component-contract.md`, `acceptance-checklist.md`,
  `contract/prototypes/*.html` — the frozen contract (A1: historical omission is fact, not a defect).
- `docs/ux-v2/DECISIONS.md` — §3, §5, §7 (navigation, superseded by §13), §10 (C5), §11 (public hygiene),
  §12 (focus 3:1), §13 (five tabs / recency), §14.3 (one Axis grammar), §15 (People metadata), §17 (U12
  fold clamp).
- `docs/ux-v2/U4-progress.md` (original Axes/Problems hierarchy), `U6-topics.md`, `C1..C5`,
  `H1-focus-visibility.md`, `V1-visual-coherence.md`, `U12-fulltext-clamp-release.md`,
  `STATUS.md`, `README.md`.
- `docs/layout-rework-brief.md` — **historical** pre-pivot acceptance brief (kept as before/after reference).
- `docs/plans/research-fixture-methodology.md`, `public-research-*` design docs — the field dispositions
  (required / optional / unavailable) and the F07/F09/F12 findings.

## Appendix B — Reference anchors (re-verified in this pass)

| # | Claim | Anchor |
|---|---|---|
| 1 | Five peer tabs | `src/ui.tsx:572-578` |
| 2 | Four *entity destinations* (not tabs) | `src/ui.tsx:604-610` |
| 3 | Step number renders `position + 1` | `src/ui.tsx:4743` |
| 4 | `position` nullable non-negative int | `src/store.ts:653-664`; `migrations/004:139` |
| 5 | Card heading `Current problem` | `src/ui.tsx:4558` |
| 6 | Picker heading + click selects only | `src/ui.tsx:4778,4786` |
| 7 | Selection is local state; no write | `src/ui.tsx:4125-4136`; `:4951-4960` |
| 8 | `activeProblem`/`selectProblem` absent | exhaustive grep = 0 |
| 9 | Repository `url` in model, unrendered | `src/store.ts:115`; `src/ui.tsx:172,3783-4086` |
| 10 | Repositories header tags ↔ `Supports` duplicate | `src/ui.tsx:3898-3925` vs `:4026-4047` |
| 11 | `getOverview` timeline capped, no bucket | `src/store.ts:2792-2897,2889`; limit `:526` |
| 12 | Topic `description` **and** `summary` (stored) | `src/store.ts:101-110`; rendered `src/ui.tsx:5465-5489` |
| 13 | Person model has no bio/role field | `src/store.ts:122-128`; role only on link `:2925` |
| 14 | No delete action in toolset | `src/actions.ts:7-8` |
| 15 | F07/F09 populated, merged PR #7 `a21fc1ba` | execution report `:104,126,128`; acceptance record `:35` |
| 16 | Served baseline (step `2..5`, 0 anchors) | `.hermes/scratch/ux-diagnosis/reviewer/report.md:33-48` |
