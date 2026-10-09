# Dashboard information-architecture pivot — working spec

**Status: working design document. NOT ratified. No standing decision has been taken.**

This document starts a new spec for the dashboard's information-architecture pivot. It **collects** the
owner's stated intent, **separates** it from proposals and from open questions, and **verifies** every
claim against the source currently checked out. It is a working surface for the owner to react to — it is
**not** a product decision, not an acceptance record, and not a substitute for
[`docs/ux-v2/DECISIONS.md`](../ux-v2/DECISIONS.md).

- **Design only.** No candidate implementation is selected. Preview and implementation are later,
  separately agreed stages; this document does not authorize either.
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

### 1.3 Plan-step numbering — stored `1..4`, rendered `2..5` — VERIFIED

- Store model: `position` is a nullable non-negative integer; `optionalPosition` accepts `0` or any
  positive int (`src/store.ts:653-664`); schema `plan_steps.position INTEGER`
  (`migrations/004-ux-v2-model.sql:139`).
- UI renders **`${step.position + 1}.`** (`src/ui.tsx:4743` — re-opened and confirmed in this pass).
- The public research fixture's diagnostics plan is authored at positions **1, 2, 3, 4**
  (`docs/plans/public-research-retained-fixture-amendment-design.md` §7.3 E / F12).
- **Result:** the diagnostics plan renders **2., 3., 4., 5.** while the stored/raw attribute reads
  `1, 2, 3, 4`. Independently confirmed by the served capture (reviewer report `:44-48`: raw
  `data-rd-plan-step-position` = `1,2,3,4`; rendered `2.,3.,4.,5.`; **no step renders `1.`**).
- **This is a fact, not a ruling.** The convention question is **OPEN** ([§4, Q3](#4-open-architecture-questions-not-ratified)): do not silently rebase a live record to `0`, and do not "fix" the formula in code, before the owner rules.

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
- **Q3 — Step-numbering convention.** Is the stored convention 0-based (keep `${position + 1}`) or
  1-based human (render `${position}`)? The UI shows human **1..N**; stored `1..4` renders `2..5`
  ([§1.3](#13-plan-step-numbering--stored-14-rendered-25)). **Do not** silently rebase a live record to
  `0`, and **do not** "fix" it in code, before the owner rules. **OPEN.**
- **Q4 — Activity-chart source.** New bucketed projection vs client binning; completeness metadata; the
  **exact** capped-timeline limit (`DEFAULT_TIMELINE_AXIS_LIMIT = 10` axes, `src/store.ts:526`). **OPEN.**
- **Q5 — Topics RHS description/summary.** Show `description`, `summary`, or both? Definitions are in
  [§1.8](#18-description-vs-summary-topics--two-stored-fields-not-a-derived-duplicate). **OPEN.**
- **Q6 — People grouping / roles / teams.** Team grouping is **not implemented**; maintainership requires
  **explicit roles**; the model carries no person-level role field today. **OPEN.**
- **Q7 — Repository search.** "Search candidate, front/local" — not implemented; keep it simple, no options
  to over-engineer. **OPEN.**

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
- **Stored step positions are shown as stored** — human `1..4`, matching the source; the prototype does
  **not** rebase a live record ([§1.3](#13-plan-step-numbering--stored-14-rendered-25), Q3 stays OPEN).

### 7.3 Entity semantics — what the prototype must not do

- It **does not invent data**: no fabricated fields, no manufactured "short summaries", no semantic
  rewrites of source text (title/excerpt only, factual).
- It **does not resolve** the OPEN questions in [§4](#4-open-architecture-questions-not-ratified) (axis
  semantics, tree shape, step numbering, description-vs-summary — all remain **OPEN**).
- It is a **trial** — if many files, it is archived as a read-only, auth-free zip with semantic aliases
  and no private ids or paths, under public-record hygiene.

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
