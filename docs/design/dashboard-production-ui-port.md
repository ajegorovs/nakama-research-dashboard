# Dashboard production UI port — checklist

> **Reading status (2026-10-11):** Historical implementation checklist for the completed port, not an outstanding work order. Subsequent hardening and bounded acceptance are summarized in [the stage closeout](../reviews/2026-10-11-dashboard-rework-stage-closeout.md). Unticked or pending entries below are preserved as authored, not new release blockers.

Status: **working port checklist, not an acceptance record and not a decision.** It grounds the production
UI port strictly in the accepted spec/prototype, mapping each current-agreement requirement to the existing
component or read API that satisfies it, plus the test that proves it. No new features are authorized by this
document. Read with:

- [`dashboard-information-architecture-pivot.md`](dashboard-information-architecture-pivot.md) — the
  **authoritative current agreement**. Its *Historical prototype iteration notes* section is explicitly
  superseded; nothing there is an instruction.
- [`dashboard-data-and-maintenance-contract.md`](dashboard-data-and-maintenance-contract.md) — the grounded
  data/maintenance contract.
- [`dashboard-minimal-implementation-design.md`](dashboard-minimal-implementation-design.md) — the implemented
  migration/store/read contract (§3–§6).
- `prototypes/dashboard-ui-rework/` — the frozen, read-only trial (never mutated by the port).

**Vocabulary:** project = `topics`, workstream = `development_axes`, task = `problems`, scoped plan =
`plans` + `plan_steps`. The internal view value for Projects stays `"topics"` (as the prototype's
`index.html` does: `<button data-view="topics">Projects</button>`), so the entity-navigation contract
(`ENTITY_VIEW.topic === "topics"`) is unchanged.

## Ground rules for the port

1. **No new features.** Only what the accepted spec states. Open questions (G1–G4, D1–D6, A1–A3, Q1–Q9)
   stay open; the port renders honest empty states rather than resolving them.
2. **Use existing source components/style tokens/focus rule.** One `:focus-visible` rule from the token
   block; existing `rd-*` classes and host components (`Button`, `Card`, `Textarea`, `Input`).
3. **No new libraries/framework/config options/charts/scheduling/graphs/repo templates.**
4. **Editorial copy is NOT production data** (see the table at the end). It is never auto-imported.
5. **Protect dirty work and the frozen prototype.** `prototypes/**` and `data.json` are read-only here.

## Requirement → existing component / read API → test

| # | Spec requirement (current agreement) | Existing component / read API | Test / gate |
|---|---|---|---|
| S1 | Four tabs: **Projects (landing), Progress, People, Repositories** (the accepted order); Overview retired; old Overview routes fall back to Projects | `VIEW_OPTIONS` (`src/ui.tsx:647-652`); `ResearchPage` default `view` | `bun run typecheck`; preview tab render (`harness/verify-page.mjs` tab assertions must be adapted to four tabs) |
| S2 | Aggregate counts (Projects/Workstreams/Open tasks/Blocked tasks/Repositories/People) in a **collapsed Dashboard summary** above Projects | `getOverview` → `counts`, `problemsByState` (`src/store.ts:1355-1371`); new `DashboardSummary` in `ResearchPage` topics branch | `src/store-task-plan-text.test.ts` ("Overview counts … does not change with `limit`"); preview |
| S3 | Blocked-task count from **explicit stored state**, never inferred from a workstream blocker | `getOverview.problemsByState.blocked` (grouped query over `problems`) | `src/store-task-plan-text.test.ts`; `src/store-review-findings.test.ts` |
| S4 | Display **Project → Workstream → Task**; do not migrate topic/axis/problem schema | `TopicOverview`, `AxisScan`/`AxisDetail`, `ProgressProblemRow` (`src/ui.tsx:99-370`) | `bun run typecheck`; store suites |
| S5 | Four side selectors **same pane width (380px at desktop)** | `.rd-split` / index width tokens in the `ui.tsx` stylesheet | preview at 1280×800 and 1440×900 (rail width) |
| S6 | Workstream card title navigates to the **exact Progress entry**; no duplicate Open/Review buttons; lower-right **Return to project** in full workstream context | `openEntity("axis", id)` (`ENTITY_VIEW.axis === "progress"`); `ProgressView` context footer | preview; `harness/verify-page.mjs` navigation checks (adapt) |
| S7 | People/Repositories project groups: short project description + right-aligned **Open project** under the heading | `PeopleView` (`src/ui.tsx:3376`), `RepositoriesView` (`:3791`) | preview |
| S8 | Shared bold muted disclosure headings, arrows, dividers, right-aligned status badges; **task selection/unfolding removed** | `DetailHeader` (`:2238`), `Notice` (`:2467`), `StateBadge` (`:2491`) | preview; focus pass `harness/focus-pass.sh` |
| S9 | Selectors: status dots, compact count tags, **relative recency with exact-date tooltips**; no status contours, no `Has plan` pill, no duplicate Blocker warning | `RecencyLabel` (`:2220`), `countLabel` (`:1703`) | preview |
| S10 | Retain **No plan** reminder; plans optional | `ProgressAxisRow.plan` null → "No plan" | `src/store-task-plan-text.test.ts`; preview |
| S11 | Blocked-task count pills red; typography matches sibling pills | `rd-count`/badge classes | preview |
| S12 | Participants quiet inline label beneath a divider; project-header repo rows omitted | topic detail participants row | preview |
| S13 | Task cards: concise title, status, **full description** without clicking; heading **Tasks (N)**; no one-open-task | `ProgressProblemRow.title` + `statement` (`src/store.ts:1536-1560`) | `src/store-task-plan-text.test.ts` ("No derived title"); preview |
| S14 | Project checkpoints / workstream strategy / task plans: **separate optional scopes**, each beside its description, independent collapse | `Plan.owner` union (topic/axis/problem), `TopicDetail.plan`, `AxisDetail.plan`, task `plan` (`src/store.ts:1284-1302`) | `src/store-task-plan-text.test.ts` ("Plan ownership (XOR) + owner dispatch"); preview |
| S15 | Supporting repositories: explicit many-to-many; **tasks do not inherit** parent repositories/activity | `problem_repositories` / axis links; projections carry own links | `src/store-review-findings.test.ts`; preview |
| S16 | Repository name opens the **exact dashboard entry**; separate **GitHub ↗** external link (new tab), thin vertical separator; external nav at description footer lower-right; default branch separate metadata | `Repository.url` (`src/store.ts:115`); `EntityTag` internal + external anchor | preview; `harness/records` (public-host verbatim) |
| S17 | People related repos do **not** imply maintainership; missing bio/attribution explicit; activity links require a real source URL or explicit association — **no fabricated PR links** | `PersonRollup.attributable` (`src/store.ts:1415-1431`), `Activity.sourceUrl` | `src/ui-attribution.test.ts`; preview |
| S18 | Activity **after** description → scoped plan → supporting repos, independent disclosure; records of updates, not completion | `ActivityLine` (`:2293`), `ActivityFooter` (`:2400`), `ActivityList` (`:2965`) | preview |
| S19 | Per-list **Previous / numbered pages / Next** (segmented-switch); page size **5**; hide page buttons when the list fits one page; show **actual range and available count**; direct task nav opens its containing page | **NEW** `ScopedPage<T>` page reads: `activityPage`/`problemPage` (`src/store.ts`), optional `offset`/`pageSize` on `get_progress`/`get_topic`/`list_activity` | `src/store-read-pagination.test.ts` (offsets 0/5/10, `total`, `hasMore`, out-of-range); preview (5/5/2 boundary) |
| S20 | Production **retrieves scoped pages** and reports availability honestly (not simulated completeness) | page envelope `{ items, offset, limit, total, hasMore }`; `total` under the same predicate/snapshot as `items` | `src/store-review-findings.test.ts` ("Same scope for items and count") |
| S21 | No dashboard-wide time filter or chart | (removed with Overview); no chart code added | `bun run typecheck` |
| S22 | Preserve **entity navigation/back/history** (selection is view state; writes nothing) | `openEntity` + `entityTarget.seq` (`:4954-4968`); `ENTITY_VIEW` (`:612`) | `harness/verify-page.mjs` navigation checks (adapt to four tabs) |
| S23 | "No plan" reminder; plans are **not inherited or rolled up** (project/workstream/task optional) | plan ownership is explicit; no rollup code | `src/store-task-plan-text.test.ts`; `dashboard-minimal-implementation-design.md §13` non-goals |
| S24 | Empty stored fields render **honest empty states**; no editorial copy auto-import | `No summary recorded.` / `No description recorded.` at `src/ui.tsx:5163,5171` (the retired `no approved summary` label is gone) | preview |
| S25 | Preserve full texts and the **enduring axis purpose vs the current reading** | `ProgressAxisRow.description` (enduring) vs `currentState` (reading) (`src/store.ts:5421-5465`) | `src/store-task-plan-text.test.ts`; preview |

## Legacy test assumptions genuinely superseded by the new spec

These are adapted **explicitly** (documented), not weakened:

| Assumption | Where | Superseded by | Adaptation |
|---|---|---|---|
| Five peer tabs incl. `overview` | `harness/verify-page.mjs` (`[data-rd-view-option="overview"]`, `data-rd-view-heading="overview"`) | S1 (four tabs, Overview retired) | Update the pass's tab list/`pressedViews` to the four tabs; a "Overview → Projects fallback" check replaces the Overview-landing check. **Not run here** (no served instance); flagged for the acceptance phase. |
| Overview window selector controls the landing scope | `WindowControl`, `LandingView` | S1/S2 | Overview retired → all views read all time (`activitySinceDays: 0`). |
| Landing = two activity columns | `LandingView` | Projects landing = selector/detail + collapsed summary | Replaced in the port. |

No unit test under `src/` asserts the five-tab shape; the unit suites assert **store** behaviour and the
`activityActorIndication` decision, so they are unaffected by the tab restructure.

## Editorial-only copy — NOT production data

Everything below is author-drafted prototype copy from `prototypes/dashboard-ui-rework/editorial.json`. It is
**draft, not source-approved, and never auto-imported** into the port. Where the accepted spec says a short
title, checkpoint or plan is editorial-only, the production UI renders the **honest empty state** until the
data contract (D1/D3) supplies it. `data.json` is unchanged.

| Editorial datum | Source | Production behaviour |
|---|---|---|
| Topic `short`/`long` descriptions | `editorial.json.topics[topic-N].short/long` | Not imported. Render `topic.description` or `No description recorded.` |
| Project checkpoints (topic plans) | `editorial.json.topics[topic-N].plan` | Not imported. Render the stored project plan if any, else `No plan`. |
| Workstream short summaries | `editorial.json.axes[axis-N].short` | Not imported. Render the enduring `description` (S25), else honest empty state. |
| Task titles | `editorial.json.tasks[problem-N].title` | Not imported. Render `problem.title` (stored, may be `""`) with `statement` as the body (S13). |
| Task `blocked` state for `problem-3` | `editorial.json.tasks[problem-3].state` | Not imported. Task state comes from stored `state` (S3). |
| Task plan for `problem-3` | `editorial.json.tasks[problem-3].plan` | Not imported. Render the task's **own** stored plan or none (S14/S23). |
| Illustrative activity reports | `editorial.json.axes[axis-N].activity`, `tasks[problem-N].activity` | Not imported. Activity shows real source records only; empty means empty (S17/S18). |

`editorial.json`'s own `label`/`basis`/`activityNotice` say the same: illustrative, not real events, no
invented source links.

## Implementation state (port checklist, updated as slices land)

The port is large; this section records what has landed and what remains. It is a working state, not an
acceptance record — the record is the read pass (`harness/read-pass.sh`) on a served instance, which has
**not** been run for this pass.

- **Landed — IA shell:** four tabs (Overview retired, `Topics`→`Projects` label); Projects is the landing;
  collapsed **Dashboard summary** with the six aggregates from `getOverview` (`problemsByState` for
  Open/Blocked, no inference); all views read all time. Entity navigation/back/history preserved unchanged.
- **Landed — Progress consumes backend scoped pages (S19/S20):** the task list renders the store's enriched
  `problemPage` (each card's **own** plan, repositories and people from the same scoped snapshot), and the
  activity feed renders the backend `activityPage` — no client slice of the axis's full arrays stands in for
  a page. Each list has its own **Previous / numbered pages / Next** pager (page size 5, hidden when the list
  fits one page, `from–to of total available`), wired to the scoped read with **independent** task and
  activity offsets. Direct task navigation requests the containing page at that offset (not a re-slice).
- **Landed — task `problemPage` enrichment:** the scoped workstream read carries the tasks' own plans, plan
  step titles, repositories and people in the one axis-scoped snapshot (minimal additive enrichment; the
  page is the five rows, never the full axis list).
- **Landed — Projects uses the compact shared `WorkstreamCard` (S6):** the project's workstreams render as
  compact shared cards whose title navigates to the exact Progress entry; the rich expanded workstream
  (`AxisDetailCard`) is no longer duplicated there. Correction stays an available write: it lives in the
  Progress detail's own **Correct** control (its existing detail destination) — no user control was removed.
- **Landed — selector contrast + inline status dots:** project-group headings, **Purpose** and **Current
  reading** labels use the muted *foreground* token (they were on the near-white muted *background* token);
  the selector-row status dot sits on the same line as its title for every state (active/blocked/draft),
  matching the active entries.
- **Landed — Projects detail rebuilt on the accepted composition:** the split is a shared **LEFT
  `--rd-index-basis` (380px) selector / RIGHT detail** row, with the view's naming heading moved **above** the
  split so the rail is never pushed onto a row of its own. The detail is a **native `<details>`** whose
  `<summary>` carries the project **title and status** (with the shared caret); the body then reads a concise
  **Summary** and the full **Description** (each with an honest empty state — the old "approved summary — a
  human interpretation, not an agent one" label is retired, since the field is no longer human-only), explicit
  **Participants** and **Supporting repositories** rows, the optional **project plan** from `get_topic.plan`
  (**topic-owned — not inherited** by any workstream or task), the compact shared **WorkstreamCard**s in one
  full-width lane, and an **independent, collapsible, backend-paged Activity section** below (five rows per
  page scoped to the project via `get_topic` `offset`/`pageSize`, `from–to of total available`). The existing
  notes / correction / record-activity controls are kept — as a **secondary disclosure at the foot of the
  detail**, not removed and no longer dominating the panel.
- **Landed — workstream cards read through state + counts, no status contour:** the orange/red blocked
  outline and the per-card blocker banner are retired; a blocked workstream reads like an active one — title
  navigating into **Progress**, the real open/blocked task counts, and the latest recorded axis event per spec
  — while the blocker's full prose stays in the **Progress** context. "Blocked" is carried by the state badge
  alone, not a coloured contour.
- **Landed — People and Repositories share the disclosure and page the backend:** both detail panels are native
  `<details>` disclosures with the same caret summary the Projects detail uses (the shared collapsed header),
  and each rail's activity is a **backend page** — `list_activity` with `offset`/`pageSize` (the action gained
  `personActorId` and `repositoryId` scopes, matching the store's `activityPage`/`listActivity`) — replacing the old
  local slice + "Show all N" window. Visible entity wording reads **project / workstream / task** (the stale
  public "axes / topics / problems" strings are retired).
- **Remaining (staged):** the `harness/verify-page.mjs` tab adaptation (four tabs, no `overview`) for the
  served acceptance phase; and the read pass itself on an isolated served instance, which is the only
  record of acceptance. Local browser checks and screenshots exist under the scratch dir but are **not** an
  acceptance record. (This pass additionally captured all four views at 1280 and 1440 against the preview
  fixture and proved the paged reads request real backend offsets 0/5/10 — the topic, workstream, person and
  repository scopes — but that is a preview-harness proof, not the served read pass.)

### Independently re-verified coverage (preview harness, resume pass)

Re-run against the isolated preview (host runtime, no instance), **not** an acceptance record. Verified:
four tabs in accepted order with Projects the pressed landing; the collapsed Dashboard summary (six
aggregates, `problemsByState`-sourced); Projects detail as a native disclosure with honest Summary/
Description claims, participants, supporting-repository pairs, compact workstream cards and an
**independent foot Activity disclosure** (not a parallel column); People involvement grouped by project
with shared workstream cards whose ids equal the Progress axis ids, and the honest unattributed state for
an unmapped person; Repositories current-work workstream cards and the internal-name + separate external
`GitHub ↗` link (real href on the corpus dataset); Progress purpose-vs-reading, a workstream-owned plan,
task cards with **no inherited plan**, `Correct`/`Return to project`, and backend-paged Tasks/Activity;
disclosure collapse; and the Projects/Progress Activity pagers requesting real backend offsets.

**Residuals (dataset gaps, not product defects).** The synthetic `fixture` dataset leaves repository
`url`/`defaultBranch` blank and carries no long topic/axis description text, so it cannot exercise the
external-link or full-description renders (the `corpus` dataset does: real
`https://github.com/ajegorovs/udv-echo-process`, `master`, and a full topic description). The fixture also
ships no task-owned plan and no person note, so those two render paths are not exercised locally. The
Repositories view's default selection is the deliberately bare `fixture/0-bare-repository`, which is why a
default-selection capture shows zero workstreams; the populated repositories render their cards. People and
Repositories place `Recent activity` in a right-hand rail (parallel column) while Projects uses a foot
disclosure — see the receipt's spec-determination note; no source change was made for it.

**`harness/verify-page.mjs` is a broad, not narrow, adaptation.** It is served-instance oriented and
Overview-coupled throughout (Overview tab clicks, the Overview-landing assertion, the retired window
control, the top-bar counts line, the five-tab density list, and the `Topics` tab label now `Projects`), so
a partial four-tab edit would leave it broken mid-file. Flagged for the acceptance phase rather than
half-ported here.

## Served checkpoint (measured) and outstanding reviewer status

> Appended for the external review handoff. It records **what was measured** and **what is still open**. It is
> **not** an acceptance record and **not** a decision; the canonical served read pass (`harness/read-pass.sh` on an
> isolated instance) has still **not** been run. See
> [`dashboard-production-ui-review.md`](dashboard-production-ui-review.md) for the review brief.

Measured on an isolated served target (release-binding only — no research write; full-row snapshots for the target
and the two protected stores were byte-identical before and after; **no restart** was needed):

| Metric | Value |
|---|---|
| Served release (current) | `0.2.0+dev.a9393d4c4443`, revision 41 |
| `ui/app.js` sha256 / bytes | `f941e189c1185d8952b2c60c8ff56966f17ed5345721623468aca2850a389314` / 151975 |
| `actions/actions.js` sha256 | `fc8dfed4643deccdc76d7160f5329d53b1fd0a8cf07d49731aebe4205f34bf03` |
| `nakama.plugin.json` sha256 | `1b56809404342a944df83c4cee7b724b962d1ef04fddb4bc1c4c7e6984eceed3` |
| Prior served release (sibling captures) | `0.2.0+dev.1c1215321cd3`, revision 33; `ui/app.js` `13bbc000d036a685f5f2f4c446df269360efa6fa50f61e9331ef50a158b84f7b` / 150948 |
| Migration set / DB generation | `001–006` unchanged; generation unchanged across both refreshes |
| Gates | `bun run check` exit 0 (365 pass / 0 fail); `typecheck:host` 0 diagnostics; `harness:records` green |
| Protected bindings | unchanged (both protected orgs' version/revision/generation and full rows byte-identical) |

Two measured served passes produced the review captures:

1. **rev 33** (`0.2.0+dev.1c1215321cd3`) — four views at 1280×800 and 1440×900. This bundle predates the two later
   CSS corrections, so its captures are the *unaffected siblings* of the scoped-plan fix.
2. **rev 41** (`0.2.0+dev.a9393d4c4443`) — the Progress view refreshed after the scoped-plan step-row fix; the
   captured plan shows no orphaned step numbers at 1280 or 1440.

Two **local** (preview) CSS corrections landed after the rev-33 captures, both additive and scoped — a
scoped-plan step-row rule (`.rd-plan-step`) and a side-rail `min-width: 0` chain. Their evidence is **local preview
only**; neither is part of a served run in this packet's scope.

> **Reviewer verdict received: CHANGES REQUIRED.** Recorded verbatim in
> [`docs/reviews/2026-10-10-dashboard-production-port-review.md`](../reviews/2026-10-10-dashboard-production-port-review.md),
> which also carries the correction status. The findings' own corrections R1–R4 (+ S1) are implemented;
> re-review is requested **before** any canonical served acceptance.

**Correction status (2026-10-10).** Findings R1–R4 and S1 are addressed in `src/ui.tsx` / `src/store.ts`
with a bounded browser regression (`harness/reviewer-corrections/`). Measured closed:

- **R1** — stored positions render as stored (`1., 2., 3., 4.`, `0.`, and none for `null`); no rebasing.
- **R2** — the Project card's open-task count is `state === "open"`, equal to the Progress rail's open count
  under mixed states (open + blocked + resolved); blocked is counted separately.
- **R3** — the person/repository activity feed resets its offset and page on a scope change (identity-safe),
  so switching from page 3 of one entity to another starts at offset 0 and back again at 0.
- **R4** — scoped reads commit only for the newest request: A-slow/B-fast keeps B; offset-5-slow/offset-10-fast
  keeps offset 10; a stale failure does not raise an error over the newer read; stale scoped pages are cleared
  on selection.
- **S1** — `taskPage`'s per-row enrichment now runs inside one reentrant `snapshot`, with a snapshot-boundary
  regression (`src/store-taskpage-snapshot.test.ts`).

Evidence, before/after counts and captures are in the local receipt
(`.hermes/scratch/reviewer-corrections-local.md`) and the revised review packet. **Not** closed here:

- the served **canonical pass** (`harness/verify-page.mjs`) remains Overview-coupled and is **not** adapted to
  four tabs — the canonical served transcript is **outstanding** (the parked harness rewrite); a full focus
  matrix on the served instance is likewise **outstanding**;
- the served keyboard-focus sampling still reached **12 samples**, not the full H1 focus matrix;
- the **person-note** and **task-owned plan** render paths still have no real-data coverage on the served
  dataset (exercised only by a labelled local synthetic fixture);
- the **People/Repositories activity right-rail placement** (vs the Projects foot disclosure) remains an open
  owner decision — a recommendation retained, **not ratified**; no source change was made for it.

The **current served release remains rev 41 (`0.2.0+dev.a9393d4c4443`)** — the corrected changes are a **new
local bundle only**, not deployed, reinstalled or restarted on any served instance.

