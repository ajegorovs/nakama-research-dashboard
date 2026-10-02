# Composition phase — scope

**Decision this scope serves (owner, 2026-10-02):** *the prototypes are the target.* Index + detail for
Topics and People, and the Overview aggregation, are **real layout work, not polish**, and are to be scoped
before anything else is executed.

**Why this exists:** the UX-v2 acceptance checks measured semantics, projections, structure, density and
accessibility. They never measured **page composition**. `docs/ux-v2/fidelity/REVIEW.md` (with side-by-side
montages) shows the consequence: after fixing a stale review UI, the current build reproduces the prototypes'
composition for **Repositories** only, partially for **Progress**, and not at all for **Topics**, **People**
or the prototype's **Overview**.

## 1. The target specification, read off the prototypes' markup

All four index views share one shell: a page heading, a hint line, and a two-column `.layout` split.

| prototype | index column | detail inner split | notes |
|---|---|---|---|
| `topics.html` | `320px` \| `1fr` | `minmax(0,1.3fr)` \| `minmax(280px,.7fr)` | index rows: title · "N current axes" · recency (`[STALE]` when quiet) · `Add topic` at the foot |
| `people.html` | `310px` \| `1fr` | `minmax(0,1.15fr)` \| `minmax(280px,.85fr)` | index rows: name · `@handle` · "N topics · M current axes" · recency |
| `repositories.html` | `330px` \| `1fr` | `minmax(0,1.15fr)` \| `minmax(280px,.85fr)` | index rows: full name · "supports N topic · M current axes" · recency (`[STALE]`) |
| `progress.html` | `320px` \| `1fr` | `minmax(0,1.35fr)` \| `minmax(320px,.65fr)` | `Axes`/`Problems` toggle **above the index**; detail split is (problem + plan + `bottom-grid`) \| (activity + open problems); `.bottom-grid` = `repeat(3, minmax(0,1fr))` → `Repository threads` / `Evidence` / `Human steering` |
| `overview.html` | — | `minmax(0,1.15fr)` \| `minmax(0,.85fr)` | no index column: `Topic activity` \| `Repository activity`, range control + `Refresh` at the top, per-card `Open topic →` / `Expand activity →`, reference chips at the foot |

Row-internal grammars the prototypes share: `72–78px 1fr` (a badge/state cell beside content) and
`auto 1fr auto` (a row with right-aligned meta). Detail headers are `title · description · chip row` with
recency top-right; recency appears as per-row text, never as a count strip.

> **Erratum (2026-10-02, D1).** The Progress row above said the detail split is
> `(problem + plan + .bottom-grid) | (activity + open problems)` and that `.bottom-grid` is
> `repeat(3, minmax(0,1fr))` → `Repository threads` / `Evidence` / `Human steering`. **Both halves are wrong**,
> verified against the markup: `.bottom-grid` is **two** columns (`progress.html:368–370`) holding
> `Plan / work package` (`:735`) and `Open problems` (`:776`); the three-card band is the separate
> **`.support-grid`** (`:474–476`, `repeat(3, minmax(0,1fr))`) holding Repository threads (`:822`) /
> Evidence (`:841`) / Human steering (`:861`); and `Activity` is the **top-grid's second cell** (`:694`, inside
> `.top-grid` at `:668`, whose columns are `progress.html:273`), not a full-height right column — so
> `Open problems` is not a right-column card. The corrected structure is
> `top-grid = Problem | Activity` → `bottom-grid = Plan | Open problems` → `support-grid = the three cards`,
> all inside the detail panel right of the index. The old statement is kept above as the historical record.

## 2. Gap per view (evidence in `fidelity/REVIEW.md`)

- **Topics** — app is a single column of full-width cards; each card carries a **count-chip strip**
  (`1 blocked · 1 active · 1 draft …`, the brief's "counts that restate rows"), then state-prefixed axis
  lines, a one-line `Recent: N events` and a `Read topic` button. No index, no detail pane, no per-card
  activity/notes column.
- **People** — same shape; `@handle` + a count line + `TOPICS THEY ARE ON` / `ACTIVITY ATTRIBUTED TO THEM`
  stacked. No index, no role line, no `About`, no `Related repositories` (if present at all, below the fold).
  > **Erratum (2026-10-02, D1).** "No index" is **false**. People has rendered index + detail since C6:
  > `PeopleView` renders `rd-split` + `ul.rd-index` + `PersonPanel` (`src/ui.tsx:2313/2315/2336`), and the
  > capture `fidelity/current-1440x900/people.png` shows the index beside the panel (measured: index 240 px
  > left of a 684 px detail at 1280×800, tops aligned). What the view genuinely lacks is the detail's **inner**
  > split, an index **recency** column, and the `About` / `Related repositories` blocks. C2 is therefore
  > **grammar work, not construction** (§3 C2). The rest of this bullet stands: no person-level role line.
- **Repositories** — **composition already matches** (index + detail with `SUPPORTS` / `CURRENT WORK` /
  `RECENT ACTIVITY`). Difference is density and row typography, not structure.
- **Progress** — all content present, grouped differently: three equal columns (index | `Open problems` |
  `Activity`), with plan, repository threads, evidence and steering stacked below rather than in the
  prototype's problem band and `.bottom-grid`.
- **Overview** — not implemented anywhere; the landing view is the Topics card list.

## 3. Work units

Order chosen so the shared grammar is defined once and reused: **C1 → C2 → C4 → C3 → C5.**

### C1 — Topics: index + detail (largest, sets the grammar)
Build `.layout` (index | detail) for Topics. Index rows per §1 (no tags in index rows — the standing
`DECISIONS.md` rule; the prototypes comply). Detail = existing components regrouped: `CURRENT WORK` rows
(state badge · axis title · summary · right-aligned ref chips) with `Completed work` folded, plus a right
column carrying the activity list and `Notes`. Selection: which topic the detail shows, defaulting to the
first index row, and preserved across the existing range control.
*Deliverables:* composition in `src/ui.tsx` through the U9 tokens (not the prototypes' CSS); a selection
projection or local state as the existing data model allows; harness checks for the new structure;
`docs/ux-v2/C1-topics-layout.md`; fresh montage from the review URL.

### C2 — People: the same grammar
Cheap once C1 exists: same `.layout`, index rows as above, detail = identity + role line + `CURRENT
INVOLVEMENT` blocks + right column (`Recent activity`, `About`, `Related repositories`).

### C4 — Progress: regroup into the prototype's composition
Move the plan / repository threads / evidence / human steering into the detail band beside the problem
statement (`.bottom-grid` for the three cards), keep the activity feed as the detail's right column, and turn
`Open problems` into a card in that right column rather than a middle column. The `Axes`/`Problems` toggle
stays, positioned above the index as the prototype shows. The prototype specifies the **Axes** detail only —
the `Problems` subview keeps its own shape adapted to the same grammar, and that adaptation is to be
recorded rather than invented silently.

> **Erratum (2026-10-02, D3).** The paragraph above describes a band the prototype does not have. Read off the
> markup, C4 is: `top-grid = Problem | Activity` (`progress.html:668`, columns `:273`) →
> `bottom-grid = Plan / work package | Open problems` (`:733`, two columns `:368–370`) →
> `support-grid = Repository threads | Evidence | Human steering` (`:819`, three columns `:474–476`), all
> inside the detail panel. So the three cards go in **`.support-grid`**, not `.bottom-grid`; `Open problems`
> sits beside the **Plan** (not in a right column); and `Activity` shares the **top row** with the Problem
> rather than spanning the detail's height. The toggle-above-index and Problems-subview requirements above
> stand unchanged. Approved by the reviewer as **D3**.

### C3 — Overview: the aggregation, as the dashboard's default landing
**Accepted (reviewer, 2026-10-02) — the record and the rulings are in `C3-overview.md`.** Build the prototype's
two-column `Topic activity` / `Repository activity` composition with its per-card actions and reference chips.
**Collision to resolve first — see §4.1.**

### C5 — Repositories convergence — **accepted (reviewer, 2026-10-02)**
The reviewer narrowed C5 on 2026-10-02 to a **final fidelity/convergence pass, not another structural
redesign**: retain the index/detail macro-layout; improve index-row grammar and recency/context; make the
repository's current supported work the dominant detail lane; bound Recent activity; keep Topics / Axes /
People contextual and subordinate; invent nothing the rollup does not carry; preserve repository tag
navigation and preselection; take a populated fixture montage. Built, verified on both datasets at both
viewports, and accepted — verdicts verbatim, the two absence rulings and the heading ruling in
[`../reviews/2026-10-02-c5-acceptance-record.md`](../reviews/2026-10-02-c5-acceptance-record.md); the unit doc is
[`C5-repositories.md`](C5-repositories.md). **Composition C1–C5 is complete**; the next phase is the
composition-phase merge-readiness pass ([`MR-composition-merge-readiness.md`](MR-composition-merge-readiness.md)).

## 4. Collisions — resolved (owner, 2026-10-02, recorded in `DECISIONS.md` §5–§7). C1 is unblocked.

1. **Overview composition** → build the two-column aggregation as the dashboard's **default landing / shell
   behaviour**, no fifth nav item; four navigable views stay (C3).
2. **Always-visible detail** → accepted: the detail is always present, U6's substance (read-first, one card
   control, no broad editor plumbing, narrow note/correction) is unchanged, and the checks naming `Read topic`
   become coverage moves onto the always-present detail (C1/C2).
3. **Headings** → keep the shell title "Research overview" and give each view its own heading (C1/C2/C4/C5).

### The original statement of the collisions, for the record

1. **Overview as a destination vs the four-view clarification.** The prototypes have five pages; the
   accepted clarification has four navigable views with "Research overview" as the shell. Proposed
   reconciliation: implement the Overview **composition** as the dashboard's **default landing / shell**
   behaviour — the fifth page's content without a fifth nav item — which is exactly what the clarification
   already allows ("Overview-specific behaviours … described as dashboard-shell / default landing
   behaviour"). Needs the reviewer's yes before C3.
2. **Always-visible detail vs the U6 read-first ruling.** With index + detail, the detail is on screen
   without a `Read topic` control, so that control's role changes. U6's substance (read-first, one card
   control, no broad editor plumbing, narrow note/correction paths) can survive intact, but the control
   inventory changes and the checks that name `Read topic` become coverage *moves* (the U6 lesson), not
   deletions. Needs confirmation that this is the intended consequence of the layout decision.
3. **Per-view headings vs the shell title.** The prototypes title each page by its view ("Topics",
   "People", …). The app shows one shell title, "Research overview", on every view. Proposed: keep the shell
   title and give each view its own heading inside the page, so neither the clarification nor the prototype
   is contradicted. Needs a nod.

## 5. Verification plan (per unit, same shape every time)

- expectations measured first where a number is claimed (the U9 habit);
- harness checks added for the new structure — index present, selection changes the detail, detail sections
  in the prototype's order, folding still works, tag rules intact;
- the checks expected to need rework are the ones whose subject moves: `overview renders as the default
  screen`, the `Read topic` control checks (×4), the U9 structural checks (`one surface per level`,
  `Progress glance inside the first screen`, Activity cap), and the D7 read-first checks;
- read passes re-taken on **separate isolated instances per dataset**, both viewports — records will change
  from corpus `88 · 0 · 23` / fixture `112 · 0 · 0`, and the new numbers are recorded honestly, not
  reconciled to the old ones;
- a fresh montage (prototype | running review UI) from the review URL at 1440×900 for each unit, so the same
  comparison that started this phase is repeatable;
- the review UI refreshed with `harness/install-plugin.mjs --reinstall` before any screenshot is trusted.

## 6. Non-goals

- H1 keyboard-focus visibility stays parked (its failing check and findings are in the working tree, not
  committed); it runs against the final composition, not an intermediate one.
- No new semantics, actions, projections or write paths — composition only. U9's tokens (one type scale, one
  spacing scale, one surface per level, one quietness, exceptional colour reserved) are the vocabulary the
  composition is built in; the prototypes' own CSS is reference, not source.
- The host application's chrome (Nakama's sidebar) is not ours to rebuild; the prototype's nav bar is
  represented by the existing view buttons.
