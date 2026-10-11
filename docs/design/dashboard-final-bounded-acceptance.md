# Dashboard — final bounded acceptance (coverage ledger + finite gate)

> **Status:** FINITE, CLOSED-FOR-REVIEW — an *evidence-and-coverage* artifact, **not** a production
> verdict and **not** a reviewer acceptance. Written to be read from a clone; labels only, no live
> endpoints, no credentials, no machine identity.
>
> **Scope:** already-authorized operator harness + disposable **public synthetic** writes on an owned
> throwaway instance. No product feature, no person-notes injection, no named deployment target, no live
> `:4399` / protected-org / retained-fixture / shared-host deploy / restart / commit / push / merge.

> **Correction (2026-10-11).** The reviewer accepted this evidence inventory and requested changes to the
> **coverage classification**: §5's blanket "19 mandatory" is superseded by **§11**, which reconciles the 19
> `current-relevant-missing` rows against the current four-tab contract (product build `ui/app.js`
> `8de8954c…`). *Verdict (verbatim): "ACCEPT THE EVIDENCE INVENTORY; REQUEST CHANGES TO THE COVERAGE
> CLASSIFICATION."* Read §11 for the corrected counts; §1–§10 are the historical record and are not rewritten.

> **Addendum (2026-10-11) — final focused served validation.** *Reviewer verdict (verbatim):* **"FINAL
> FOCUSED SERVED VALIDATION ACCEPTED."** The verdict closes requirements **#17** (an axis carries an
> evidence line, in words), **#18** (an axis with no evidence says so and shows no confirmed claim) and
> **#24** (a per-axis history expands inside its own axis — accepted as the Progress **Recent activity**
> re-point) on the measured final served build:
>
> - measured `ui/app.js` sha256 **`8ce68fbeec3351ed17eca7ec1eaf07a244d4134a7d76c9a6536f3100b40c81ae`**
>   (repo build == served asset; served-build guard OK),
> - revision **44**, release **`0.2.0+dev.e8f73b913af5`**,
> - **48 ordinary invocations + 1 mutation-sensitivity check = 49 in total** — the ordinary invocations are
>   the duplicated served probes (**12 + 12 + 12 + 6 + 6 = 48**), and the single mutation-sensitivity check is
>   the `notice-non-nav --mutant` DOM-mutant negative control. One mutation control, **not thirteen negative
>   controls** (the earlier *"49 ordinary + 1 negative"* wording implied 50 and is corrected here: the total
>   is **49**, not 50).
>
> Evidence base: the existing isolated-served receipt `evidence/final-served/receipt.md` in the
> `evidence-history-final-served-review-2026-10-11` packet (owns workspace, API `4402` · web `4452`, target
> org named explicitly — never `orgs[0]`; live `:4399` untouched). This addendum is **documentary**: it
> re-states the recorded verdict and the measured identity, it does not re-run or re-measure anything.
>
> **What this verdict does NOT close.** Requirements **#11 / #60 / #61** remain **not closed** by this
> verdict — their older proof keeps its qualifiers (the retained repository page-race; person-notes retained,
> not injected; the **#60** non-navigation control is a **DOM (navigational-link) mutant** — an injected `<a>`
> whose click switches the view — **not** a *text* mutant; the still-deferred future control is a
> **text-only** mutant of the **#17** evidence line). **The historical 62-item coverage
> ledger and its archives are immutable and are not rewritten**; prior claims stand as recorded. No
> production acceptance is offered.

This document is the **authoritative, finite** checklist that closes the coverage question for the
current canonical served run: it names **every one of the 62 current SKIPs** explicitly, classifies each
as **retired / replaced / duplicate / current-relevant-missing**, marks each **mandatory vs optional**,
and cites the **contract** it derives from and the **exact `verify-page.mjs` line** that emits it — so
"all covered" is never asserted without the subject-by-subject ledger underneath it.

## 1. What this is — and what it is not

- It **is** the subject-by-subject disposition of the current SKIP set, plus two focused diagnoses
  (the bare-repository empty state; the repository page-race guard control).
- It is **not** "69 checks are green" restated as "the product is done". 19 SKIPs are
  **current-relevant-missing** (a current-build check whose subject the dataset lacks) and 28 are
  pivot retirements kept only for lineage.
- It is **not** a production acceptance and offers **no reviewer verdict**.

## 2. Build identity (measured, not asserted)

| Artifact | sha256 |
|---|---|
| `ui/app.js` (product build) | `8de8954c10ee23c974a3525566f1b2243a9736a7dd2bd5a1168cc3117583fcd0` |
| `actions/actions.js` | `bd4139a44b8b8e8d30114134657560e618f37fec96de7b85e64b250793be25f7` |
| `src/ui.tsx` | `f4a883348f4f0fc7c25f0233e8c8899d74968408a3b62756b8890c195291bd38` |
| `harness/verify-page.mjs` (instrument) | `a12f9ccc60d7ec22306d809a3e8e66ed57b1abe4bf4dcac5eeeb207642f1038c` |
| repo HEAD | `26604dcd2debbd78d0994e6e2606fbd0d5ac6294` |
| `git describe` | `dashboard-ui-rework-checkpoint-20261009-2-g26604dc` |

The operator harness `harness/**` is **modified in the working tree** (uncommitted, operator tooling);
**no `src/` product source and no build changed** — `ui/app.js` is byte-identical to the accepted prior
archive's product build.

## 3. Totals (measured)

| Run | PASS | FAIL | SKIP | width |
|---|---|---|---|---|
| current canonical served (**1440×900**) | **128** | **0** | **62** | 1440×900 |
| current canonical served (**1280×800**) | **128** | **0** | **62** | 1280×800 |
| predecessor (retained transcript `riskcov/after2-*.txt`) | 111 | 0 | 72 | both |

The **62 SKIP set is byte-identical at both widths** (verified: the two per-check dictionaries differ in
only 7 geometry checks' *pass detail*, never in SKIP membership).

**Log of record.** The 128/0/62 run's per-check result is retained as
`.hermes/scratch/riskcov/next-risk-batch-results.json` (`full1440` / `full1280`: 190 checks each,
128 PASS + 62 SKIP). **Honest limitation:** the raw stdout transcript of that specific run was **not**
captured to a `.txt` (O5 runs `verify-page.mjs` with inherited stdio); the predecessor 111/0/72
transcripts are retained. The parsed JSON is the retained log, not a re-typed summary.

## 4. The 62 current SKIPs — authoritative coverage ledger

Disposition key: **retired** = the pivot removed the surface and no current check asserts it (lineage
only). **replaced** = the surface moved and a current-build check now asserts the substance and PASSes.
**duplicate** = the substance is asserted inside another check / on an equivalent surface.
**current-relevant-missing** = the check reads a **current** hook but the dataset lacks the subject (a
bounded, seedable gap; the instrument is not stale). Coverage: **mandatory** = a standing contract a
served acceptance must exercise; **optional** = retired lineage.

The class judgments are the harness's own reason-text classifier plus reviewer-style judgment
(**classifier judgment, not machine truth**); the *test path* (the emitting line) and the *contract* are
recorded per row so each disposition is checkable.

| # | check | disposition | coverage | test path (emitter) | contract | reason / note |
|---|---|---|---|---|---|---|
| 01 | the landing shows both aggregation columns | **retired** | optional | `verify-page.mjs:669` | docs/design/dashboard-information-architecture-pivot.md | the Overview landing columns are retired (the pivot); Projects is a peer tab, not a landing |
| 02 | every repository in the payload appears on the landing exactly once, in the payload's own order | **replaced** | covered | `verify-page.mjs:673` | docs/design/dashboard-information-architecture-pivot.md | the Overview landing repository column is retired; the repository set is asserted in the Repositories view |
| 03 | the repository cards state the omitted window count instead of printing a capped list length (D4) | **replaced** | covered | `verify-page.mjs:677` | docs/ux-v2/C5-repositories.md | the Overview landing repository cards are retired; the Repositories view carries this row instead |
| 04 | each topic card's activity line is the payload's own count for that topic, with no event title | **replaced** | covered | `verify-page.mjs:681` | docs/ux-v2/DECISIONS.md | the Overview landing topic cards are retired; the Projects index carries per-project counts instead |
| 05 | the two columns sit side by side with the topic column wider, both beginning in the first viewport | **retired** | optional | `verify-page.mjs:685` | docs/ux-v2/DECISIONS.md | the Overview landing's two-column geometry is retired by the pivot |
| 06 | the blocked axis shows its blocker text | **duplicate** | covered | `verify-page.mjs:986` | docs/ux-v2/C4-progress.md | the Projects detail is the compact workstream card (data-rd-work-card) and does not restate the blocker; the blocker's prose is asserted on the Progre |
| 07 | the window control re-issues get_overview with the new window only | **retired** | optional | `verify-page.mjs:1014` | docs/design/dashboard-information-architecture-pivot.md | the 7/14/30/All window control is retired (the pivot); every view reads all time (activitySinceDays: 0) |
| 08 | the page still renders after the window change | **retired** | optional | `verify-page.mjs:1027` | docs/ux-v2/DECISIONS.md | the window control is retired, so there is no window change to render after |
| 09 | inside the detail, Current Work is left of the side rail and materially wider | **current-relevant-missing** | mandatory | `verify-page.mjs:1376` | docs/ux-v2/C4-progress.md | the detail has no current-work lane or no side rail (main true, rail false) |
| 10 | the rail's primary and second sections begin in the first viewport, and every later section is reached by ordinary page scrolling | **current-relevant-missing** | mandatory | `verify-page.mjs:1455` | docs/ux-v2/C4-progress.md | the rail renders 0 side card(s), so there is no second section to require |
| 11 | completed/abandoned work is folded, closed initially, and opens on demand | **current-relevant-missing** | mandatory | `verify-page.mjs:1484` | docs/ux-v2/DECISIONS.md | no completed or abandoned axis in this dataset (states: ["blocked","active"]) |
| 12 | `Open topic` lands in the Topics tab with that topic selected | **replaced** | covered | `verify-page.mjs:1656` | docs/ux-v2/contract/interaction-spec.md | the Overview landing card actions are retired (the pivot); entity navigation is covered by the tag contract (C7h) |
| 13 | returning to the Overview tab carries the window with it | **retired** | optional | `verify-page.mjs:1660` | docs/design/dashboard-information-architecture-pivot.md | the Overview tab and its 7/14/30/All window control are retired (the pivot); every view reads all time |
| 14 | `Expand activity` lands in the Repositories view with that repository selected | **replaced** | covered | `verify-page.mjs:1664` | docs/ux-v2/contract/interaction-spec.md | the Overview landing card actions are retired (the pivot); repository navigation is covered by the tag contract (C7h) |
| 15 | a plain view choice after two card actions lands on the entity asked for last, not a superseded one | **replaced** | covered | `verify-page.mjs:1668` | docs/ux-v2/DECISIONS.md | the Overview landing card actions are retired, so a superseded target from them has no subject; the Projects index selects the asked-for project |
| 16 | each axis shows full metadata with its own state and per-claim confidence | **replaced** | covered | `verify-page.mjs:1838` | docs/ux-v2/C4-progress.md | the Projects detail renders the compact workstream card; the full metadata/confidence reading is the Progress view |
| 17 | every axis carries an evidence line, in words | **replaced** | covered | `verify-page.mjs:1842` | docs/ux-v2/C4-progress.md | the compact workstream card carries no evidence line; evidence is read in the Progress view |
| 18 | an axis with no evidence says so and shows no confirmed claim | **current-relevant-missing** | mandatory | `verify-page.mjs:1874` | docs/ux-v2/C4-progress.md | all 5 axes in this dataset carry evidence, so nothing here shows the bare state |
| 19 | an axis that states no progress carries no confidence for it | **duplicate** | covered | `verify-page.mjs:1878` | docs/ux-v2/C4-progress.md | all 5 axes in this dataset carry evidence, so nothing here shows the bare state |
| 20 | each axis reads in the scan line, the reading and one reference line | **replaced** | covered | `verify-page.mjs:1904` | docs/ux-v2/C4-progress.md | not ten equal-weight lines — the Projects detail renders the compact workstream card; the full reading surface is the Progress view |
| 21 | the material the reading does not need sits behind one disclosure per axis, not in the reading surface | **retired** | optional | `verify-page.mjs:1908` | docs/ux-v2/C4-progress.md | the per-axis disclosure (data-rd-axis-more) was retired with the compact card; nothing is hidden in Projects |
| 22 | the compressed axis row still carries the payload's own reading and detail | **replaced** | covered | `verify-page.mjs:1912` | docs/ux-v2/C4-progress.md | the compact card carries no reading/description slot; the full reading is read in the Progress view |
| 23 | the axis's fuller detail is one click away, and the disclosure grows to hold it | **retired** | optional | `verify-page.mjs:1916` | docs/ux-v2/C4-progress.md | the per-axis one-click disclosure was retired with the compact card |
| 24 | a per-axis history expands inside its own axis | **replaced** | covered | `verify-page.mjs:1920` | docs/ux-v2/C4-progress.md | the per-axis history disclosure was retired; a workstream's history is the Progress activity list |
| 25 | the axis's notes are kept out of its history list | **retired** | optional | `verify-page.mjs:1924` | docs/ux-v2/C4-progress.md | the per-axis notes list was retired with the compact card (a project's notes are its own Notes card) |
| 26 | C4: the Problems subject states when too | **replaced** | covered | `verify-page.mjs:2527` | docs/ux-v2/C4-progress.md | a row's recency is the payload's own — the Progress index has no separate Problems subject (the pivot made Progress one workstream composition) |
| 27 | C4: the subject switch stays client-side, and leaves the index back where it started | **retired** | optional | `verify-page.mjs:2531` | docs/ux-v2/C4-progress.md | the Axes/Problems subject switch was retired; there is no subview to switch |
| 28 | the axis index opens on the projection's first row, and the detail columns follow it | **retired** | optional | `verify-page.mjs:2806` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 29 | the Problem column shows the projection's first open problem, under the projection's own count | **retired** | optional | `verify-page.mjs:2831` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 30 | the Activity feed is the projection's bucket for the selected axis, newest first, capped and stating the remainder | **retired** | optional | `verify-page.mjs:2873` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 31 | selecting another axis moves the Problem and Activity columns to that axis | **retired** | optional | `verify-page.mjs:2892` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 32 | the plan renders in row 2, below the Problem and the Activity, from the projection | **retired** | optional | `verify-page.mjs:3004` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 33 | the problem's step and the step's problem are marked, both ways | **current-relevant-missing** | mandatory | `verify-page.mjs:3040` | docs/ux-v2/C4-progress.md | no axis in this dataset has a plan and a problem naming one of its steps |
| 34 | an axis with no plan renders no plan section at all | **retired** | optional | `verify-page.mjs:3298` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 35 | the inventory lists every open problem of the axis, in the projection's order | **retired** | optional | `verify-page.mjs:3382` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 36 | a closed-out problem is not listed in the inventory | **current-relevant-missing** | mandatory | `verify-page.mjs:3607` | docs/ux-v2/C4-progress.md | this dataset has no resolved problem on the axis (13 problem(s), all open) — the fixture's axis carries one, so that run discriminates |
| 37 | the axis still renders: its title is readable and the card column follows the selection | **retired** | optional | `verify-page.mjs:3640` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 38 | the repository threads are the problem's own relations, in the projection's order, with nothing marked primary | **current-relevant-missing** | mandatory | `verify-page.mjs:3743` | docs/ux-v2/C5-repositories.md | this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 problem row(s) in the payload) — the fi |
| 39 | evidence is the projection's records with their provenance: source type, reference, summary and date | **current-relevant-missing** | mandatory | `verify-page.mjs:3764` | docs/ux-v2/C4-progress.md | this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 problem row(s) in the payload) — the fi |
| 40 | human steering is exactly the projection's claims, under the scope each was aimed at | **current-relevant-missing** | mandatory | `verify-page.mjs:3784` | docs/ux-v2/C4-progress.md | this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 problem row(s) in the payload) — the fi |
| 41 | an axis-scoped claim stays the axis context | **current-relevant-missing** | mandatory | `verify-page.mjs:3791` | docs/ux-v2/C4-progress.md | it is not copied under the problem — this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 pr |
| 42 | an ordinary note on the same problem is context, not steering | **current-relevant-missing** | mandatory | `verify-page.mjs:3796` | docs/ux-v2/C4-progress.md | this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 problem row(s) in the payload) — the fi |
| 43 | each repository tag lands in the Repositories view with that repository selected | **current-relevant-missing** | mandatory | `verify-page.mjs:3898` | docs/ux-v2/contract/interaction-spec.md | this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 problem row(s) in the payload) — the fi |
| 44 | and the tag wrote nothing: the repository set is the same after navigating | **current-relevant-missing** | mandatory | `verify-page.mjs:3911` | docs/ux-v2/contract/interaction-spec.md | this dataset carries no problem with more than one repository, so the step-5 sections have no subject here (16 problem row(s) in the payload) — the fi |
| 45 | the sparse problem is one the inventory can select | **current-relevant-missing** | mandatory | `verify-page.mjs:3817` | docs/ux-v2/C4-progress.md | this dataset carries no problem with nothing behind it (no repositories, no evidence, no steering), so the negative cases have no subject — the fixtur |
| 46 | a problem with no repositories, no evidence and no steering renders no shell for any of them | **current-relevant-missing** | mandatory | `verify-page.mjs:3850` | docs/ux-v2/C5-repositories.md | this dataset carries no problem with nothing behind it (no repositories, no evidence, no steering), so the negative cases have no subject — the fixtur |
| 47 | and the steering section follows the data: it is absent unless the axis itself carries a claim | **current-relevant-missing** | mandatory | `verify-page.mjs:3855` | docs/ux-v2/C4-progress.md | this dataset carries no problem with nothing behind it (no repositories, no evidence, no steering), so the negative cases have no subject — the fixtur |
| 48 | the Progress index offers both subjects, and opens on Axes (U4 step 6) | **retired** | optional | `verify-page.mjs:4043` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 49 | the Problems index lists the projection's problems, in the server's order, with each row's own state, axis, topic and recency | **retired** | optional | `verify-page.mjs:4074` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 50 | picking a problem shows it in the same reading surface, with the axis columns following its parent | **retired** | optional | `verify-page.mjs:4100` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 51 | the repository threads, evidence and steering sections render from that same problem object | **retired** | optional | `verify-page.mjs:4119` | docs/ux-v2/C5-repositories.md | the subject of this assertion was retired by the four-tab pivot |
| 52 | switching back to Axes marks the parent axis of the problem that was on screen | **retired** | optional | `verify-page.mjs:4137` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 53 | the reading surface names its topic and its axis as tags, with the projection's own ids and labels | **retired** | optional | `verify-page.mjs:4419` | docs/ux-v2/contract/interaction-spec.md | the subject of this assertion was retired by the four-tab pivot |
| 54 | a problem tag lands in Progress/Problems with that problem selected | **current-relevant-missing** | mandatory | `verify-page.mjs:4654` | docs/ux-v2/contract/interaction-spec.md | no event in this dataset's window is evidence for a problem, so no feed row renders a problem tag |
| 55 | C4: everything right of the index sits inside ONE detail pane, and the index is left of it | **retired** | optional | `verify-page.mjs:5091` | docs/ux-v2/C4-progress.md | the subject of this assertion was retired by the four-tab pivot |
| 56 | C4: the pane is the selected axis | **retired** | optional | `verify-page.mjs:5102` | docs/ux-v2/C4-progress.md | its header names it, above both the Problem and the Activity — the subject of this assertion was retired by the four-tab pivot |
| 57 | C4: the Problem is the main lane | **retired** | optional | `verify-page.mjs:5113` | docs/ux-v2/C4-progress.md | left of the Activity and at least 1.25× its width — the subject of this assertion was retired by the four-tab pivot |
| 58 | C4: Plan and Open problems share row 2, as two columns of one group | **retired** | optional | `verify-page.mjs:5124` | docs/ux-v2/C4-progress.md | this subject renders no plan — the row collapses to what exists |
| 59 | C4: the support band is container-responsive | **retired** | optional | `verify-page.mjs:5208` | docs/ux-v2/C4-progress.md | three columns at ≥720px, two at 480–719px, one below, in Repository threads → Evidence → Human steering order — this subject renders no support band |
| 60 | an exceptional state says which one it is, and never navigates | **current-relevant-missing** | mandatory | `verify-page.mjs:6083` | docs/ux-v2/contract/interaction-spec.md | this dataset renders no exceptional-state subject (no bare repository), 0 notice(s) seen: none |
| 61 | a repository with nothing current says so, instead of filing stopped work under the lane's heading | **current-relevant-missing** | mandatory | `verify-page.mjs:6597` | docs/ux-v2/C5-repositories.md | this dataset has no repository with neither a topic link nor a current axis |
| 62 | paging the rail's window is composition only | **duplicate** | covered | `verify-page.mjs:6784` | docs/ux-v2/C4-progress.md | no write action fires — the no-write property is asserted inside the paging check above (the page request is a list_activity read) |

## 5. Disposition summary

| disposition | count | of which | reading |
|---|---|---|---|
| retired | 28 | all optional | pivot removals, lineage only |
| replaced | 12 | all covered | substance asserted on a current surface, PASS |
| duplicate | 3 | all covered | substance asserted inside another check |
| current-relevant-missing | 19 | all mandatory | current hook, subject absent from the seed — **seedable** |

Coverage: **15 covered** (replaced+duplicate), **28 optional** (retired),
**19 mandatory-missing**. Nothing is filed as "absent by default"; the 19
missing subjects are each reachable by a bounded seed change through the **public** write path (see §6
for the one previously thought unreachable).

> **Superseded (2026-10-11):** the "19 mandatory-missing" reading above is corrected in **§11**. Source
> review shows only **3** of the 19 are genuine, seedable current gaps; **11** are pivot-retired surfaces
> (optional, lineage only), **4** are covered by a passing current-surface re-point, and **1** (no-evidence)
> has no exact equivalent. Corrected totals: **39 retired / 14 replaced / 3 duplicate / 3 mandatory /
> 3 migrated-open**. §5 is left as the historical record.

## 6. Focused diagnosis A — the "bare repository" empty state IS reachable via the public write path

The residual note from the prior batch read: *"no repository with **neither** a topic link **nor** a
current axis … whether the public input/UI can even express a topic-link-less repository is
unconfirmed; not fabricated."*

**Finding (source-grounded, not a new run): reachable, without any DB injection.**

- The empty check is `harness/verify-page.mjs:6592`:
  `quietRepository = c5Repositories.find(e => c5Current(e).length === 0 && (e.topics ?? []).length === 0)`
  (line 6592-6607) — i.e. a rollup entry with **no current axis** and **no topic link**; it then asserts
  the index row's second line equals `c5SupportsLine(quiet)`.
- `c5SupportsLine` (verify-page.mjs:6409) and its product twin `supportsLine` (`src/ui.tsx:3308-3319`)
  both render **`no project names it · no current workstream`** for exactly that shape, on the row's own
  handle `data-rd-repository-line` (`src/ui.tsx:3900`).
- A repository row with no topic link and no axis link is created by the **public** `record_activity`
  path: `src/actions.ts:433-437` passes `repositoryFullName` to `store.addActivity`, and
  `src/store.ts:4218-4221` calls `upsertRepository({fullName})` — which `INSERT`s into `repositories`
  (store.ts:6973-6985) **without** touching `topic_repositories` or `axis_repositories`.
- The rollup that feeds the view lists **every** repository row: `SELECT * FROM repositories ORDER BY
  full_name` (store.ts:3777-3779) — so a bare row appears with `topics: []` and `axes: []`.

**Reconciliation with `reconcile_topic`.** `reconcile_topic.repositories[]` **always** writes a
`topic_repositories` link (the "reconcile creates a topic link always" case), so seeding *that* way can
never produce the bare row. `record_activity.repositoryFullName` is the public action that can. The
`record_activity` input still requires a **topic** (`requireTopic`, actions.ts:421), but the *repository*
it registers carries no topic link of its own — the link lives on `topic_repositories`, not on the
activity.

**Disposition:** this SKIP (**#61**, and the sibling **#60** exceptional-state check) is
`current-relevant-missing / mandatory` and **closable** by adding one bounded seed repository that is
registered only through `record_activity.repositoryFullName` (never linked to a topic). **No DB
injection is required and none is performed.** A served confirmation run is required to move it
SKIP→PASS; none is claimed here.

**On the instrument ("over-strict?" question).** The predicate deliberately requires `noTopic AND
noAxis` — the *truly bare* case. The dataset already contains a **topic-linked, no-current** repository
(`synthetics/secondary-repo` → "supports 1 project · no current workstream"), which the predicate
excludes. Relaxing the predicate to also cover that case is a **reviewer call**, not required to close
the gap; the accepted contract supports the stricter bare case directly, so the instrument is left as-is.

## 7. Focused diagnosis B — repository page-race guard control (disposition: **reviewer**, not causal proof)

The open residual: under the targeted **guard-only mutant**, the person page-race (`PR [people]`) has
been observed **red** while the repository page-race (`PR [repositories]`) stayed green; a reliable
**repository** counter-fail was not produced.

- **Mechanism at source.** Both rails use the *same* component — `PagedActivityFeed`
  (`src/ui.tsx:2646-2752`) — with the *same* guard `if (active && !ctx.signal.aborted)` (ui.tsx:2700),
  and each is **keyed** on its entity (`key={entry.person.id}` ui.tsx:3549; `key={selected.repository.id}`
  ui.tsx:4054). A **scope** change remounts the feed (the cleanup alone sets `active=false`); a **page**
  change inside one entity does **not** remount, so the generation guard is the only thing that stops a
  superseded page response committing. This is exactly the causal claim in
  `harness/canonical-served/served-render-races.guard-mutant.mjs:9-15`.
- **The harness oracle** (`served-render-races.mjs:487-531`) parks the offset-5 request, commits offset-0,
  then releases the real offset-5 bytes and polls a bounded 6 s window for the stale rows to commit — it
  asserts the **feed's own rows/page**, not a name, so it *can* go red.
- **Measured prior trace** (retained, `riskcov/canonical-risk-coverage-result.md` §1.2): under the
  guard-only mutant the stale offset-5 response **did commit** (~123-127 ms, both scopes, both widths,
  actual server bytes via `route.continue()`), while the **product** build never committed across a 6 s
  poll. That is a real counter-fail for the *person* scope; the *repository* scope's green runs are a
  harness post-release-timing artifact (the read can resolve before the stale commit lands).
- **What was NOT done:** a **deterministic repository** counter-fail was not produced within the bounded
  attempts. Per the finite mandate, this is **not** chased further; **no unrelated generation counter is
  removed to force a red**, and no second guard is claimed.

**Disposition:** *qualification for the reviewer*. The shared generation guard is the identified
candidate mechanism for **both** scopes (same component, same guard); an **independent repository-only
guard is NOT demonstrated**, and the repository counter-fail remains **UNRESOLVED*** (not proven
red, not proven protected). Classified **not causal proof**; reviewer judgment required.

## 8. Required reviewer / user decisions (genuine scope boundaries only)

1. **Person-notes (Grant C): retained gap vs a separate offline-fixture injection.** The public write
   path `reconcile_topic.people[]` has **no `notes` field**, so the non-empty person-notes branch is
   **not exercisable through supported input** and the product note file cannot be rewritten by a public
   writer. Decision needed: **accept the gap**, or grant a **separate, explicitly-scoped offline fixture
   injection**. Do **not** grow the public API to reach it. Target is **not named or guessed**.
2. **Intended deployment target (Grant D): explicit URL, or the expected release hash.** No target
   URL/org/release and no expected served-build hash was supplied; none was guessed and **no
   reinstallation is implied**. Decision needed before any served-install claim: the explicit target, or
   the release/build identity a reviewer should expect to be served.

*A third, optional input:* whether to **relax the bare-repository instrument** (§6) to also cover the
topic-linked-no-current repository, or to close it with the bare seed only.

## 9. Boundaries (stated, not implied)

- **No new execution in this pass.** No instance was started or written in preparing this document; the
  two focused diagnoses are **source-grounded** and cite **retained prior measurements**. No new run is
  claimed, so no `harness:*` exit is claimed for this pass.
- **403 font:** classified **measured-non-blocking** (captured with its initiator path and classified
  `harmless-host` by `resource-capture`; the tested UI renders with it blocked) — **not** categorically
  harmless, and no host fix taken.
- **Skip classes are instrument judgment, not machine truth.** They are the harness's reason-text
  classifier plus reviewer-style judgment, quoted as such.
- **Preserved, not rewritten.** Historical archives and transcripts are immutable; this document adds a
  record, it does not amend the past.

## 10. Provenance (paths; `.hermes/` is git-ignored)

- Coverage ledger (machine form): `.hermes/scratch/final-bounded-acceptance-ledger.json` (62 rows).
- Run log of record: `.hermes/scratch/riskcov/next-risk-batch-results.json`; narrative:
  `.hermes/scratch/canonical-next-risk-batch.md`.
- Prior measured race trace: `.hermes/scratch/canonical-risk-coverage-result.md` §1.
- Private handoff: `.hermes/scratch/final-bounded-acceptance-handoff.md`.

## 11. Correction (2026-10-11) — coverage classification reconciled to the four-tab contract

> **Reviewer verdict (verbatim):** *"ACCEPT THE EVIDENCE INVENTORY; REQUEST CHANGES TO THE
> COVERAGE CLASSIFICATION."* The evidence inventory (the 62-row ledger, the build identity, the two
> focused diagnoses, the retained archives) was **accepted**; the **coverage classification** was sent
> back. This section is the additive, dated correction. §1–§10 above are the historical record and are
> not rewritten; where §5's counts disagree with this section, this section governs.

### 11.1 What the reviewer found

§5 filed all **19** `current-relevant-missing` rows as **mandatory** — "a current-build check whose
subject the dataset lacks … **seedable**". Source review against the *current* product build
(`ui/app.js` sha256 `8de8954c10ee23c974a3525566f1b2243a9736a7dd2bd5a1168cc3117583fcd0`, `actions/actions.js`
`bd4139a44b8b8e8d30114134657560e618f37fec96de7b85e64b250793be25f7`) and the *current* instrument
(`harness/verify-page.mjs` sha256 `a12f9ccc60d7ec22306d809a3e8e66ed57b1abe4bf4dcac5eeeb207642f1038c`) shows
that premise holds for **only 3** of the 19. The other 16 read surfaces the four-tab pivot **retired** —
their hooks are **absent from the built bundle**, so seeding the dataset can never turn them green — or
surfaces that **moved** to a current hook. The classification conflated "the dataset lacks the subject"
with "the surface no longer exists".

Two hook facts, checked directly against the built bundle (`grep` on `ui/app.js`, 0 = absent):

| hook | in `ui/app.js` | meaning |
|---|---|---|
| `data-rd-problem-choice` | 0 | RETIRED surface |
| `data-rd-evidence` | 0 | RETIRED surface |
| `data-rd-steering*` | 0 | RETIRED surface |
| `data-rd-support` | 0 | RETIRED surface |
| `data-rd-plan-step-shown` | 0 | RETIRED surface |
| `data-rd-progress-subview` / `data-rd-progress-index-mode` | 0 | RETIRED surface |
| `data-rd-axis-more` | 0 | RETIRED surface |
| the string `evidence on record` | 0 | RETIRED surface |
| `data-rd-folded-axes` | 1 | current surface |
| `data-rd-current-work` | 1 | current surface |
| `data-rd-repository-line` | 1 | current surface |
| `data-rd-axis-blocker` | 1 | current surface |
| `data-rd-task-card` / `data-rd-task-state` | 1 | current surface |
| `data-rd-context-panel` / `data-rd-axis-reading` | 1 | current surface |

### 11.2 The 19 formerly-mandatory rows, reconciled

**Corrected class key:** *genuine current gap* = current hook, dataset lacks the subject (seedable,
mandatory). *migrated — needing replacement* = the requirement moved to a current surface (covered by a
passing current-surface check, or still open where no exact equivalent exists). *explicit retired* = the
pivot removed the surface; a standing decision records it (optional, lineage only).

| # | check | stableId | hook state | corrected class | standing decision |
|---|---|---|---|---|---|
| 09 | inside the detail, Current Work is left of the side rail and materially wider | `ck_ea9d1714277d` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.10 + §9 (C1 gate anatomy 'Current Work dominating the main detail lane' superseded by §9 five-tab navigation); docs/design/dashboard-information-architecture-pivot.md |
| 10 | the rail's primary and second sections begin in the first viewport, and every  | `ck_3b585123dec8` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.10 + §9; docs/design/dashboard-information-architecture-pivot.md |
| 11 | completed/abandoned work is folded, closed initially, and opens on demand | `ck_5afb40736453` | current hook present | genuine current gap (mandatory) | docs/ux-v2/C4-progress.md |
| 18 | an axis with no evidence says so and shows no confirmed claim | `ck_f11e65b3a7d6` | retired (hook absent) | migrated — needing replacement | docs/ux-v2/C4-progress.md |
| 33 | the problem's step and the step's problem are marked, both ways | `ck_da6f71974a96` | retired (hook absent) | explicit retired (optional) | docs/design/dashboard-information-architecture-pivot.md (plan§3.1); docs/ux-v2/DECISIONS.md §8.3 |
| 36 | a closed-out problem is not listed in the inventory | `ck_81e006ee20d5` | retired (hook absent) | explicit retired (optional) | docs/design/dashboard-information-architecture-pivot.md; docs/ux-v2/DECISIONS.md §8.3 |
| 38 | the repository threads are the problem's own relations, in the projection's or | `ck_c42b16d7402f` | retired (hook absent) | migrated — needing replacement | docs/design/dashboard-information-architecture-pivot.md (plan §3.1 P39) |
| 39 | evidence is the projection's records with their provenance: source type, refer | `ck_527c203372b4` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.3 (bottom-band erratum) |
| 40 | human steering is exactly the projection's claims, under the scope each was ai | `ck_8b88d8cf0f02` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.3 |
| 41 | an axis-scoped claim stays the axis context | `ck_f2b28994204c` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.3 |
| 42 | an ordinary note on the same problem is context, not steering | `ck_ffbe3128e859` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.3 |
| 43 | each repository tag lands in the Repositories view with that repository select | `ck_22117d6d145c` | current hook present | migrated — needing replacement | docs/ux-v2/contract/interaction-spec.md (EntityTag) |
| 44 | and the tag wrote nothing: the repository set is the same after navigating | `ck_1f4f07287380` | current hook present | migrated — needing replacement | docs/ux-v2/contract/interaction-spec.md (EntityTag no-write) |
| 45 | the sparse problem is one the inventory can select | `ck_8f1d99d7b38b` | retired (hook absent) | explicit retired (optional) | docs/design/dashboard-information-architecture-pivot.md; docs/ux-v2/DECISIONS.md §8.3 |
| 46 | a problem with no repositories, no evidence and no steering renders no shell f | `ck_6267c5111464` | retired (hook absent) | migrated — needing replacement | docs/design/dashboard-information-architecture-pivot.md (plan P18/P30) |
| 47 | and the steering section follows the data: it is absent unless the axis itself | `ck_a4352c956b41` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/DECISIONS.md §8.3 |
| 54 | a problem tag lands in Progress/Problems with that problem selected | `ck_ae7e185d6f69` | retired (hook absent) | explicit retired (optional) | docs/ux-v2/contract/interaction-spec.md; docs/design/dashboard-information-architecture-pivot.md |
| 60 | an exceptional state says which one it is, and never navigates | `ck_746c9828793f` | retired (hook absent) | genuine current gap (mandatory) | docs/ux-v2/contract/interaction-spec.md; docs/ux-v2/C5-repositories.md |
| 61 | a repository with nothing current says so, instead of filing stopped work unde | `ck_7103cdef2d96` | current hook present | genuine current gap (mandatory) | docs/ux-v2/C5-repositories.md |

**Reconciliation counts (the arithmetic):**

- of the 19: **11 → explicit retired**, **4 → migrated (covered by a passing re-point)**, **1 → migrated (open, no exact equivalent)**, **3 → genuine current gap** (11+4+1+3 = 19).
- the 4 migrated-covered are #38, #43, #44, #46 (traces in §11.4); the 1 migrated-open is #18 (the only current re-point asserts *no-progress* — "No current reading recorded." — which is a **different requirement** from *no-evidence*; the no-evidence text is absent from the build, so no exact equivalent exists).
- the 3 genuine current gaps are #11 (a completed/abandoned axis — `data-rd-folded-axes` present), #60 and #61 (a bare / no-current repository — `data-rd-repository-line` present, reachable through the public `record_activity.repositoryFullName` path; §6).

### 11.3 Corrected totals

| disposition | original (§5) | corrected | note |
|---|---|---|---|
| retired | 28 | **39** | +11 from the 19 (pivot-retired surfaces) |
| replaced | 12 | **14** | +4 re-points from the 19; −2 with no exact equivalent |
| duplicate | 3 | **3** | unchanged |
| current-relevant-missing (mandatory) | 19 | **3** | #11, #60, #61 are the seedable ones |
| migrated-open (not covered) | 0 | **3** | #17, #24, #18 — moved, no exact equivalent |
| **total** | **62** | **62** | |

Coverage: **17 covered** (14 replaced + 3 duplicate), **39 optional** (retired), **3 mandatory**, **3 not-covered**. 28 + 15 + 19 = 62 and 39 + 17 + 3 + 3 = 62.

### 11.4 The 15 traces (the ledger's 12 *replaced* + 3 *duplicate*)

Each row below is proved from the **retained** per-check result JSON (`.hermes/scratch/riskcov/next-risk-batch-results.json`, 190 checks per viewport, 128 PASS + 62 SKIP) — the `result locator` gives the check's own `status`/`detail` at **both** viewports (1440×900 and 1280×800). `semanticEquivalence` is the reviewer-required judgment: *exact* = the current check asserts the same substance; *partial* = narrower than the retired form; *none* = no equivalent → **reclassify migrated-open**.

| # | check | stableId | coversWith (passing check) | `verify-page.mjs` | 1440×900 | 1280×800 | equiv |
|---|---|---|---|---|---|---|---|
| 02 | every repository in the payload appears on the landi | `ck_965521575e4f` | the repositories index lists the projection's repositories, in | 6542 | PASS | PASS | exact |
| 03 | the repository cards state the omitted window count  | `ck_020e91eddc74` | every repository row's second line is the rollup's own numbers | 6583 | PASS | PASS | exact |
| 04 | each topic card's activity line is the payload's own | `ck_6fa84e6af5e9` | the selected index row states its current-axis count, and the  | 920 | PASS | PASS | partial |
| 12 | `Open topic` lands in the Topics tab with that topic | `ck_4a70a069843e` | a topic tag lands in Topics with that topic selected, and the  | 4509 | PASS | PASS | exact |
| 14 | `Expand activity` lands in the Repositories view wit | `ck_93635b357a7f` | a repository tag in the Activity column lands in Repositories  | 4630 | PASS | PASS | exact |
| 15 | a plain view choice after two card actions lands on  | `ck_9f8c5077781c` | an axis tag lands in Progress/Axes with that axis selected, wh | 4701 | PASS | PASS | partial |
| 16 | each axis shows full metadata with its own state and | `ck_4fdb4be49eed` | every rendered state carries its claim, and one that is not co | 4806 | PASS | PASS | exact |
| 17 | every axis carries an evidence line, in words | `ck_3ffdf0f4af2c` | *(none — no exact equivalent)* | — | — | — | none |
| 20 | each axis reads in the scan line, the reading and on | `ck_823000e9bf2c` | each row carries its own state, repositories, step link and re | 3409 | PASS | PASS | partial |
| 22 | the compressed axis row still carries the payload's  | `ck_a54e642e76e8` | each row carries its own state, repositories, step link and re | 3409 | PASS | PASS | partial |
| 24 | a per-axis history expands inside its own axis | `ck_1d75cb544823` | *(none — no exact equivalent)* | — | — | — | none |
| 26 | C4: the Problems subject states when too | `ck_a3d9529ea4e0` | C4: every Progress index row states when it was last active, a | 2518 | PASS | PASS | exact |
| 06 | the blocked axis shows its blocker text | `ck_311438f67589` | a blocked workstream renders its own stored blocker text on th | 3249 | PASS | PASS | exact |
| 19 | an axis that states no progress carries no confidenc | `ck_8704c558bd4f` | an axis that states no progress carries no confidence for it ( | 3276 | PASS | PASS | exact |
| 62 | paging the rail's window is composition only | `ck_79729c741cb1` | the rail's remainder is one control away, and showing it chang | None | PASS | PASS | exact |

Two of the twelve ledger-*replaced* rows (#17 "every axis carries an evidence line, in words"; #24 "a per-axis history expands inside its own axis") resolve to **none**: the evidence line and the per-axis history disclosure are both retired, and no current check asserts the same substance. They are **reclassified migrated-open**, not covered. The remaining ten *replaced* and all three *duplicate* rows are substantiated (6 exact + 4 partial replaced, 3 exact duplicate).

### 11.5 The 4 migrated-covered re-points (from the 19)

| # | check | coversWith (passing re-point) | `verify-page.mjs` | 1440×900 | 1280×800 | equiv |
|---|---|---|---|---|---|---|
| 38 | the repository threads are the problem's own relatio | the repository threads are the task card's own relations, in the | 3505 | PASS | PASS | partial |
| 43 | each repository tag lands in the Repositories view w | each task-card repository tag lands in the Repositories view wit | 3580 | PASS | PASS | exact |
| 44 | and the tag wrote nothing: the repository set is the | and the task-card repository-tag traversal wrote nothing — every | 3590 | PASS | PASS | exact |
| 46 | a problem with no repositories, no evidence and no s | a task with no repositories renders no repository shell (current | 3523 | PASS | PASS | partial |

#43 and #44 are **exact** (the EntityTag navigation and its no-write property, re-pointed to the task-card tags — the re-point is strictly stronger). #38 and #46 are **partial**: #38 covers the relation set+order but does not re-assert the retired "nothing marked primary" clause; #46 covers the *repository* shell only (the evidence/steering shells are retired with those sections).

### 11.6 Instrument correspondence (`archive ↔ run ↔ instrument`)

The `harness/verify-page.mjs` cited above is the current working-tree instrument (`a12f9ccc60d7ec22306d809a3e8e66ed57b1abe4bf4dcac5eeeb207642f1038c`). The retained per-check result JSON's **emitted titles** were checked against it: **170/190 titles are verbatim literals in the current source**; the other **20** are the source title **truncated at the first ` — `** (e.g. result key *"each row carries its own state, repositories, step link and recency"* vs source *"… — compact context, nothing re-derived"*). That is a **parser artifact of the `<title> — <detail>` transcript format**, not instrument-content drift: every one of the 20 is an exact prefix of its source literal, cut at ` — `. The retained run is therefore labelled **consistent-with** the current instrument, and is **not** claimed to be a byte-identical measurement of it; the raw stdout transcript of the 128/0/62 run was **not** captured (§3).

## 12. Trace correction (2026-10-11) — five documentary trace corrections

> **Reviewer verdict (verbatim):** *"SUBSTANTIVE RECONCILIATION ACCEPTED — TRACE CORRECTIONS REQUIRED."*
> The **substantive reconciliation** in §11 (the 19-row classification, the corrected totals, the
> migrated-covered re-points) is **accepted**; the **traces** (§11.4/§11.5) were sent back for five
> targeted corrections. This section is the **additive, dated** correction. §1–§11 above are the
> **historical record** and are **not rewritten**; where §11.2/§11.4 disagree with this section, this
> section governs. Five corrections only — no new execution, no source/harness change, no fixture mutation.

### 12.1 The five corrections

| # | target | §11 said | §12 correction |
|---|---|---|---|
| C1 | **#62** `replacementCheck` | traced to *"the rail's remainder is one control away, and showing it changes only what is shown"* (`verify-page.mjs:1222`) | EXACT **"the rail's remainder is one page away, and paging changes only what is shown"** (`verify-page.mjs:6792`) — the **Repositories** pager (`[data-rd-repository-panel] .rd-pager`), not the Topics/Projects rail pager |
| C2 | **#3, #16, #26** `semanticEquivalence` | exact | **partial** — each is narrower than the retired claim |
| C3 | **#60** hook state | table row read *"retired (hook absent)"* | **current-present**: the `[data-rd-notice]` hook is in the built bundle; class unchanged (**genuine current gap**) |
| C4 | **#11** future test | a bare mandatory gap | **dischargeable by TWO current assertions** (`verify-page.mjs:1491`, `:1505`); the original SKIP title need not become a PASS |
| C5 | **#60** structure | — | limitation recorded: **no direct keyboard/click non-navigation probe**; a future test covering **both** (kind + non-navigation interaction) is **requested, not implemented** |

### 12.2 C1 — #62 re-pointed to the Repositories pager (EXACT)

The ledger's *duplicate* row **#62** ("paging the rail's window is composition only") is a duplicate of
the **current Repositories pager** check, not of the Topics/Projects rail pager. The correct current
check is:

> **"the rail's remainder is one page away, and paging changes only what is shown"** —
> `harness/verify-page.mjs:6792`, inside the `[data-rd-repository-panel]` pager block.

It asserts the composition-only property directly (`railAll.total === railBefore.total` and
`c5Writes() === writesBeforeExpand` — no write fires), so it is the true duplicate. Retained result:
**PASS at both viewports** — `1440×900` *"page 1 first row \"2026-10-12T00:00:00.000Z\" → page 2 first row
\"2026-10-08T00:00:00.000Z\" (total 13); non-read action calls 0 → 0"*; `1280×800` identical.
`replacementStableId = ck_d35a176fbdb8` (sha256 of the title, truncated to 12 hex). The old
`:1222` title (the Topics-detail rail) is **not** used.

### 12.3 C2 — #3 / #16 / #26 narrowed to *partial*

§11.4 read these three as **exact**. On the reviewer's reading each current check asserts **less** than
the retired claim, so equivalence is **partial**:

- **#3** ("the repository cards state the omitted window count…") — the current row asserts **count
  consistency only** (the stated count is the payload's own); the retired *omitted-window count* clause
  is not re-asserted.
- **#16** ("each axis shows full metadata with its own state and per-claim confidence") — the C8 rule
  asserts the **badge's state/confidence only**, not the **full axis-metadata field set** nor **all
  claims**.
- **#26** ("C4: the Problems subject states when too") — the current row asserts the **workstream
  recency only**; the retired separate **Problems-entity subject** does not exist.

### 12.4 C3 + C5 — #60 is a current hook, and its one untested half

§11.2's table listed #60 with hook state *"retired (hook absent)"*, which is wrong: **the hook is
current-present**. `harness/verify-page.mjs:6060-6097` reads the `[data-rd-notice]` hook (present in the
built bundle) and asserts a notice's `data-rd-notice` **kind** is one of `{empty, filtered, truncated}`
and that `tags > 0` fails — i.e. **a notice carries no entity tags**. The row stays a **genuine current
gap** (the dataset carries no bare repository, so the surface never fires).

**Limitation (C5):** the *"never navigates"* clause is asserted **structurally** (a notice is not an
anchor/action); there is **no direct keyboard/click non-navigation probe**. A future test covering
**both** halves — kind recognition **and** a real non-navigation interaction — is **requested, not
implemented**.

### 12.5 C4 — #11 dischargeable by two current assertions

#11 ("completed/abandoned work is folded, closed initially, and opens on demand") stays a **genuine
current gap** (`data-rd-folded-axes` present; the dataset carries no completed/abandoned axis). The
umbrella SKIP title (`verify-page.mjs:1484`) **need not itself become a PASS**: the requirement is
discharged by the **TWO** concrete current assertions that run when such an axis exists —

| stableId | title | `verify-page.mjs` |
|---|---|---|
| `ck_c801e1bcc453` | completed/abandoned work is folded, and the fold is closed initially | 1491 |
| `ck_d24e83216d24` | the completed/abandoned fold opens on demand | 1505 |

Same retained key; the original SKIP title is not required to turn green.

### 12.6 Totals — unchanged

The corrections are **trace-level**: **no** totals move. Dispositions **39 retired / 14 replaced /
3 duplicate / 3 current-relevant-missing / 3 migrated-open** (Σ 62); coverage **17 covered / 39 optional
/ 3 mandatory / 3 not-covered**. The only count that changes is the **equivalence** split within the
traces: **exact 8 / partial 9 / none 3** (was 11 / 6 / 3). This public section is **additive**; the
private trace-corrected ledger variant is `.hermes/scratch/coverage-trace-corrected-ledger.json`.

## 13. Next bounded served validation — the six open requirements (2026-10-11)

> **Nature of this section.** This is a **brief, date-stamped pointer** to a bounded, local, isolated-served
> validation of the six requirements left open by §11/§12: **#11, #17, #18, #24, #60, #61**. It **claims only
> what was measured** on an owned throwaway served instance and is **not a reviewer verdict**. The reviewer's
> decision on the coverage contract + trace corrections is a separate record
> (`docs/reviews/2026-10-11-coverage-contract-and-trace-closeout-record.md`, verdict verbatim
> *"COVERAGE CONTRACT AND TRACE CORRECTIONS ACCEPTED — DOCUMENTARY CLOSEOUT COMPLETE."*). §1–§12 above are the
> historical record and are **not rewritten**; this section is additive.

**Served setup (labels only).** A fresh, isolated throwaway instance (own workspace with an independent
`cp -a --reflink=auto` host copy — distinct inodes, own config/SQLite, own mode-600 env; loopback, ports
4401/4451; org selected **explicitly**, never `orgs[0]`). Product bytes unchanged (`ui/app.js`
`8de8954c…`, `actions/actions.js` `bd4139a4…`); the served guard reported the same `8de8954c…` asset.

**Public synthetic cases (write path only).** A **terminal axis** (`state=completed`) beside the active
workstreams, and a **bare repository** registered **only** through `record_activity.repositoryFullName`
(server readback: topics 0 · axes 0 — no topic/axis link; no DB injection). Dataset readback: topics 2 ·
axes 7 · repositories 3 · people 2 · activities 17.

**Result per requirement (claimed only as verified):**

| ID | requirement | status | basis |
|---|---|---|---|
| **#11** | completed/abandoned work is folded, closed initially, opens on demand | **DISCHARGED** | the two current assertions (the §12-C4 discharge) run and PASS at both widths; a third sibling fold check FAILs on a **stale hook** (instrument, not product — the fix is small and named). |
| **#17** | every axis carries an evidence line, in words | **OPEN — product absence** | no evidence-line render exists (the string is absent from the build); the current equivalent is the state/confidence **badge only**. Needs a product/spec decision; no API invented. |
| **#18** | an axis with no evidence says so and shows no confirmed claim | **OPEN — product absence** | the **no-evidence** representation is absent and confirmed **distinct** from the **no-progress** one (`No current reading recorded.`). Needs a product/spec decision. |
| **#24** | a per-axis history expands inside its own axis | **OPEN — migrated, unresolved** | the per-axis disclosure is retired; the substance renders on the Progress activity list, but no current check re-points this assertion. Needs a spec decision or a re-point. |
| **#60** | an exceptional state says which one it is, and never navigates | **VERIFIED** | canonical check PASS both widths; a new served probe proves non-navigation behaviourally (no link/button descendant, not focusable, click + Enter leave URL/view/selection/reads/writes unchanged), with a **DOM-mutant negative control** that goes red. |
| **#61** | a repository with nothing current says so | **VERIFIED** | canonical check PASS both widths (`no project names it · no current workstream`). |

**Gates (actual exits).** `bun run check` exit 0 (368/0, `ui/app.js` byte-unchanged); the new
`harness/skip-reason.test.mjs` exit 0 (4/0); `typecheck:host` exit 0 (0 diagnostics); `harness:records` exit 0.
The focus pass is 66/0 positive and 18/**12** negative-control at both widths.

**Operator fix (in scope).** The **inverted SKIP-reason ternary** for the retired step-5 problem surface was
corrected (factored into `harness/skip-reason.mjs`, both condition paths executable). Runtime-confirmed: that
family now reports the *pivot-retired* reason instead of the *dataset-lack* reason. Two further instrument
findings are **reported, not fixed** (a `null`-axis overview-timeline bucket that aborts the canonical reader;
the stale fold-text hook above).

**Boundaries.** Not production acceptance; no reviewer verdict here. Person-notes not injected (optional,
retained); repository page-race left as previously qualified (not chased; no new requirement control, no
symmetry proof); deploy identity deferred. Fresh private artifacts: `.hermes/scratch/six-requirements-served-validation.{md,json}`.


