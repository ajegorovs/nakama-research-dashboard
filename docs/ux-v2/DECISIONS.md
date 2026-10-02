# Decisions after the contract — post-contract clarifications

The contract in `docs/ux-v2/contract/` is **frozen and published verbatim**; nothing here edits it. This file
carries the decisions taken *after* it that a reader needs in order to read it correctly. Each entry says what
was decided, what it supersedes, and where the work lands.

## 1. Topics editing controls — the checklist's wording is the intended final behavior (2026-10-02)

> **Post-contract clarification — Topics editing controls.** The later UX review supersedes earlier language
> that retained broad `Add Topic` / `Edit Fields` controls. **Topics is primarily a read/navigation surface:**
> structural changes normally go through the librarian, and narrow note/correction/steering affordances are
> acceptable. The acceptance-checklist wording — *"Broad Add Topic / Edit Fields controls are absent"* —
> **represents the final intended behavior**, so it stands as written.

- **Superseded by this decision:** the `layout-rework-brief.md` toolbar list (which counts `Add topic` among the
  grouped controls) and any interaction-spec language that reads as requiring a broad edit entry point on
  Topics.
- **Not superseded:** the principle behind the read/edit boundary — **one control per piece of state**, never a
  second way into the same state (D1). What U6 removed is the *edit* half: `Read topic` is now the card's only
  control and reading its only mode. The principle stays; the `Edit fields` control does not.
- **Where the work lands:** **U6 (Topics refinement)**. The merged build is a usable UX-v2 baseline; removing
  the broad controls is polish, not a reason to reopen the merge. Raised in the U11 contract audit §10.
- **Executed in U6** (2026-10-02): the broad `Add topic` and `Edit fields` controls are removed, along with the
  edit mode and its topic-field/activity editor. What remains on the page is `Read topic` (the card's one
  disclosure), the inline topic note and the axis correction. Read pass re-recorded from that build — corpus
  **84 · 0 · 22**, fixture **107 · 0 · 0**; see [`U6-topics.md`](U6-topics.md).

## 2. Deployment status is stated, not implied (2026-10-02)

There is **no always-on deployed dashboard service** today. The project is merged, installable and
reproducible from a clone; "production deployed" would be inaccurate. This restates D6 (dev instance only until
v2 is proven; the Docker deployment is out of scope) and is kept explicit in `services/nakama/HANDOFF-UX-V2.md`
and the estate's service README so no reader infers a live service from the acceptance records.

## 3. The Overview destination — four navigable views, and "Research overview" is the shell (2026-10-02)

> **Post-contract clarification — Overview destination.** The final UX-v2 implementation has **four navigable
> views: Topics, People, Repositories, Progress**. "Research overview" is the dashboard **shell/title**, not a
> separate destination. Earlier prototype/spec language describing Overview as an independent tab is
> **superseded**.

- **Superseded by this decision:** the "Overview becomes a view of its own" entry in `docs/ux-v2/README.md`,
  and the U5 label wherever it reads as an unfinished standalone Overview view (the estate plan, the handoff,
  `STATUS.md`).
- **Not superseded:** what the shell actually does. The page title, the counts line under it and the
  recency-first default surface stay as they are — described as **dashboard-shell / default landing behavior**,
  not as a fifth tab.
- **What the implementation says:** `VIEW_OPTIONS` in `src/ui.tsx` lists four views, and the page renders
  `<h2 class="rd-page-title">Research overview</h2>` above whichever one is active. The read pass's view checks
  address exactly those four.
- **Where the work lands:** documentation, plus one consequence for the pass — the density checks name the four
  views that exist. An earlier measurement named a fifth and reported the default surface's numbers under it
  (a click with no control to click fails quietly); the instrument was corrected, not the page.

## 4. The prototypes are the target for page composition (2026-10-02)

The fidelity review (`fidelity/REVIEW.md`) found the built pages do not reproduce the approved prototypes'
composition for Topics, People or Overview (Repositories matches; Progress is grouped differently). Asked
which composition is the target, the owner decided: **the prototypes are.** Index + detail for Topics and
People, and the Overview aggregation, are **real layout work, not polish**, scoped in `COMPOSITION.md`
(units C1–C5) before any of it is executed. The acceptance checks measured semantics, projections, structure
and density — never page composition — and the earlier reports should not have implied otherwise.

## 5. The Overview composition lands as default-landing/shell behavior (2026-10-02)

> **Post-contract clarification — the Overview composition.** The prototype `overview.html` specifies a
> two-column `Topic activity` / `Repository activity` composition. It is to be built as the dashboard's
> **default landing / shell behavior** — the composition, without a fifth navigation item. Four navigable
> views remain (Topics, People, Repositories, Progress), consistent with §3; this entry does not reopen it.

- **Superseded by this decision:** nothing. It is the composition half of the §3 resolution, whose own wording
  already allows Overview-specific behavior "described as dashboard-shell / default landing behavior".
- **Where the work lands:** unit **C3** in `COMPOSITION.md`.

## 6. Always-visible detail replaces the `Read topic` disclosure (2026-10-02)

The prototypes put the detail on screen beside the index, so the `Read topic` disclosure loses its role.
Accepted consequence, decided by the owner:

> **Post-contract clarification — the detail disclosure.** With index + detail, the detail is always present.
> **U6's substance is unchanged** — read-first, one card control, no broad editor plumbing, narrow
> note/correction affordances — and the checks that name `Read topic` become **coverage moves** onto the
> always-present detail, not deletions.

- **Superseded by this decision:** nothing in §1; the control inventory changes, the ruling does not.
- **Where the work lands:** units **C1** and **C2**, plus the named checks in the pass.

## 7. Two headings: the shell title stays, each view names itself (2026-10-02)

The prototypes title each page by its view ("Topics", "People", …); the app shows one shell title on every
view. Decided: **keep "Research overview" as the shell title and give each view its own heading.** This
contradicts neither §3 nor the prototypes — the shell keeps its title, the page states which view it is.

- **Where the work lands:** units **C1**, **C2**, **C4**, **C5**.

## 8. Composition phase — the reviewer's rulings on the intake (2026-10-02)

The reviewer returned the refactor strategy for the composition phase; the verified intake is
`docs/reviews/2026-10-02-composition-intake.md` and the strategy verbatim is
`docs/reviews/2026-10-02-composition-strategy.md`. **D1 is the ruling that unblocks C1**; the rest are the
conditions each unit must respect. Each entry says what was ruled, what it supersedes, and where the work lands.

### 8.1 D1 — the prototype **markup** is the source of truth (approved)

> **Ruling — charter correction.** Where `COMPOSITION.md` or `REVIEW.md` mis-described the prototypes, the
> markup governs. Correct the active charter with a **dated erratum**, preserving the old statement as
> historical rather than silently rewriting the record.

- **Corrections this covers (each verified against the markup, not against our prose):** People is **already**
  index + detail (`rd-split` + `rd-index` + `PersonPanel`, `src/ui.tsx:2313/2315/2336`) — the "single column of
  full-width person cards / no index pane" statement in `fidelity/REVIEW.md` §People is false;
  `.bottom-grid` is **two** columns carrying `Plan / work package` + `Open problems` (`progress.html:368–370`,
  `:735`, `:776`), and the three-card band is `.support-grid` (`:474–476`) — the `repeat(3, …)` attribution in
  `COMPOSITION.md` §1 and `REVIEW.md` §Progress is wrong; and Progress's `Activity` is the **top-grid's** second
  cell (`:694`, inside `.top-grid` at `:668`), not a full-height right rail, so `Open problems` is not a
  right-column card either.
- **Superseded by this decision:** the three statements above, and any plan wording that reads off them.
- **Where the work lands:** the errata in `COMPOSITION.md` and `fidelity/REVIEW.md`; units **C1/C2/C4/C5**.

### 8.2 D2 — C2 re-scoped: grammar, not construction (accepted)

C2 is **not** "build index/detail for People"; it is **bring the existing index/detail into prototype
grammar** — richer index rows, the detail's **inner** split, and the activity/About/related-repo side rail.
- **Where the work lands:** unit **C2** in `COMPOSITION.md`; it is substantially smaller than first scoped.

### 8.3 D3 — Progress follows the actual prototype structure (approved)

`top-grid = Problem | Activity`, `bottom-grid = Plan | Open problems`, then
`support-grid = Repository threads | Evidence | Human steering`. The previous C4 wording (plan/threads/
evidence/steering in one "bottom band", `Open problems` as a right-column card) is recorded as an **erratum**.

### 8.4 D4 — no faked window count, no projection extension (approved)

Do **not** derive the Overview repository activity count from the capped `recentActivity` list
(`DEFAULT_ROLLUP_ACTIVITY_LIMIT = 5`, `src/store.ts:384`), and do not extend projections during this
composition phase. **Omit the line for now** and docket a later projection enhancement if the exact prototype
field is still wanted. Printing a capped list's length as a window count would restate rows — the defect this
phase exists to remove.

### 8.5 D5 — repository→people may be derived in-view, conditionally (approved with a condition)

Deriving the repository detail's `People` block in-view is acceptable **only when `peopleTruncated === false`**.
If the source set is truncated, either **label the result explicitly as partial** or **omit the block**. A
bounded subset is never presented as complete.

### 8.6 The C2 role line (ruled)

Omit the single person-level role line — no factual person-level role exists. `Person.notes` **may** populate
`About`. Do **not** synthesize a bio or role from the per-topic-link roles.

### 8.7 D8/D9 — container-relative geometry, and two assertions that can now discriminate

Geometry checks are **container-relative**: the Nakama host consumes ~296 px (measured: a 1280×800 viewport
leaves a 984 px container; 1440×900 leaves 1144 px), so the standalone prototypes' breakpoints are not directly
portable — at the review width the prototype would collapse to one column itself.
- For Topics/People/Repositories: left-before-right, **aligned tops**, detail wider than index, index
  **~20–27 % of the usable width**, both panes **beginning** in the first viewport. **Do not** require both
  panes to fit fully vertically.
- For Progress: **aligned tops** and a **materially dominant** Problem column — `>= 1.25×` the Activity rail is
  the agreed lower bound; the prototype's own ~2:1 is not forced. The previous "Problem left of Activity /
  Activity narrower" pair is too weak: **both already pass on the current build** (measured: problem 363 px vs
  activity ≈290 px at 1280), so they do not catch the defect they exist for.

### 8.8 D10 — the disclosure assertion retires; the routes move (approved)

The old assertion ("the topic card offers one disclosure control, not two", `harness/verify-page.mjs:569`)
**retires because its subject no longer exists**, and is replaced by an explicit **absence** assertion. The
three navigation/setup sites (`:593`, `:656`, `:3437`) reroute to the persistent selected detail. This is a
**coverage move, not silent deletion**.

### 8.9 `expandedId` (ruled)

The existing `expandedId` may become/serve as the selected-topic state — it already receives a topic tag click
(`src/ui.tsx:3555–3558`). **No new state plumbing for naming purity.**

### 8.10 C1 may start, with one warning (ruled)

C1 is **unblocked** and starts alone. Build a small `index | detail` geometry primitive **if useful**, but let
Topics establish the real grammar first: **the montage is seen before that grammar propagates into People.**
The C1 visual gate stands — at a glance, prototype and running Topics must show the same page anatomy: compact
topic rail left, one persistent topic detail right, Current Work dominating the main detail lane, Recent
Activity / Notes / Related Repositories in the side lane. Content may differ; anatomy may not.

### 8.11 Privacy and hygiene (ruled)

Fix the public host-identity leak **before pushing new review artifacts**: parameterize the montage caption,
regenerate the montages, scrub the tracked text files. Because the repository is already public, removing it
from current `main` does not erase history but prevents continued propagation; a Git-history rewrite is a
**separate operational decision** (cache/collaborator implications) and is not taken casually. The estate
acceptance table's unlabelled U6 figures are corrected to the current U9 record. The review service is made
persistent (**as a review/dev service, explicitly not a production deployment**) before per-view sign-off
begins, since the URL is the human review surface for this phase.

## 9. The C3 acceptance — how those records are to be read (2026-10-02)

C3 (the Overview aggregation as the default landing) was accepted with its write gate closed. Three things about
reading its records are decisions in their own right; the review trail is
[`../reviews/2026-10-02-c3-acceptance-record.md`](../reviews/2026-10-02-c3-acceptance-record.md).

- **`3f60da9`'s commit message is superseded, and no history is rewritten.** It says the corpus write item is
  open, while the green corpus write transcript was committed beside it in that same commit. Published history
  stays as it is — no force-push, no amended historical commit — and the correction lives in the docs and in the
  acceptance record.
- **Instance-state claims are measured, not assumed.** "Corpus: 1 topic / 3 axes / 694 activities" stood in a
  handoff while the instance was actually **empty**: a wipe aimed at the fixture had hit the dev data root, and
  the baseline survived only in an older database generation. State an instance's counts only from a measurement
  taken when writing them, and check which generation is live (`org_plugins.database_generation`) rather than
  trusting a per-file count.
- **A dataset identity is not "everything that is not the fixture".** The acceptance gate distinguishes corpus,
  fixture and the write pass's own `ui-check <digits>` residue — the exact shape, not the prefix — and **an empty
  store refuses for either dataset**: zero data is never evidence of a clean corpus. The classifier is
  `harness/dataset-identity.mjs`, asserted by `bun run harness:identity`.
- **A destructive wipe names its target.** The estate's `wipe-plugin-rows.py` has no default
  `--data-root`/`--org` any more, after that default emptied the wrong instance.
