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

## 10. C5 — the Repositories convergence, and what it refuses to invent (2026-10-02)

C5 was scoped by the reviewer as the **final fidelity/convergence pass on the Repositories view** — the
macro-layout the view already had, brought to the prototype's grammar. The unit's doc is
[`C5-repositories.md`](C5-repositories.md); these are the rulings a later reader needs, so the absences below
are read as decisions rather than as omissions.

- **The detail is C1's grid, not a layout of its own.** `Current work` is the lane and Recent activity /
  Supports / People are the rail beside it, on the shared `rd-detail-grid` — so the dominance rule (the lane at
  least **1.25× the rail**, beside it and not stacked under it) and the stacking behaviour below 1000px are
  inherited rather than restated per view.
- **One predicate decides what work has stopped.** `isTerminalAxis` serves both the topic lane and the
  repository lane; the topic lane was moved onto it in the same pass. Two copies of "what counts as stopped" is
  how two views come to disagree about one word.
- **The fold discloses a split; it does not hide work.** Terminal axes move under one summary that states its
  own count, and the payload's axis total stays on the page in both states (`data-rd-repository-axes`).
- **A heading states the payload's order, not the prototype's copy.** The Repositories hint reads
  `Alphabetical by name · factual context, never scored`, because the rollup is ordered by name. This is C3's
  ruling 3 applied to the fifth view: where the mock's static label and the projection disagree, the label
  describes the projection.
- **Nothing the rollup does not carry is invented.** No repository-level `Notes` card — notes belong to topics,
  so the card is omitted and the omission is marked `data-rd-repository-notes-omitted="true"` — and no `Stale`
  tag of the view's own invention: the store's `stale` rule is the overview's recency rule on its own cards,
  and a second definition of one word inside one product is worse than an absent tag. The row states the age
  and `no current axis` instead.
- **People is derived, never fabricated, and collapses when empty.** The repository rollup carries no people;
  the card is built from the people rollup's axes and states it when that projection is truncated.
- **Judging an empty pane is not judging the composition.** The topic-detail block now waits for the surface it
  reads, and every control is asserted before it is clicked: a click on a control that is not rendered does not
  fail a check, it aborts the pass on a 30s locator timeout — and an aborted run is a lost record rather than a
  verdict. The first corpus 1440×900 attempt for this unit was lost exactly that way, on a
  `500 SQLiteError: database is locked` from the dev instance (22:41:23, requestId `aa21cc5e`) that left
  `get_topic`'s pane empty while the checks read it.

## 11. A public artifact carries labels, never live endpoints (2026-10-02)

The acceptance records, the montages and the fidelity captions are committed to a **public** repository, and the
instance addresses are not public information. The rule is recorded here because it was learned the hard way: the
first version of the merge-readiness doc argued that the tailnet address in the record headers was "governed
elsewhere" and left it in place, and the reviewer caught it as a privacy regression against the earlier scrub.

- **Any endpoint a harness writes into a committed artifact is redacted** through `harness/redact.mjs`. Loopback
  stays verbatim (no identity, and it is the useful diagnostic later); everything identifying — any literal
  address, a `.ts.net` / `.local` / `.internal` / `.lan` name — **not** `.home`, which would collide with
  ordinary code such as `process.env.HOME` and `landing.home` — or this machine's own hostname — becomes
  `<box>.<tailnet>.ts.net` with the port and path kept; a **public** host (a GitHub remote, an upstream doc link)
  is untouched, because over-redacting would damage the evidence a record carries.
- **One definition, both kinds of caller** — `read-pass.sh` through `harness/redact-url.mjs`, `verify-page.mjs`
  through the import. A rule with a bash copy and a JS copy is two rules that will drift.
- **The guard is part of the suite**: `bun run harness:records` (`harness/test-redact.mjs`) asserts the rule's
  cases and scans every committed text artifact under `docs/` for what the rule would redact. A record carrying a
  live endpoint fails the check that has to pass before the next handoff.
- **The real endpoint stays in the estate** — compose env files and runtime config, which are git-local by design
  and are not the public artifact.
- **History is not rewritten to satisfy this rule.** The scrub applies to the tree and the diff; where a leak
  exists in already-published history it is *reported* with its commit count, and the decision to rewrite is
  explicit — never implicit, never a force-push.

## 12. Keyboard focus: one indicator, and the 3:1 minimum as the standard (2026-10-02, H1)

Focus visibility is a property of the **shared primitives**, so it is fixed and measured there, once per class,
rather than per instance or per view.

- **The standard is the visible outcome, not a token.** A class is measured by comparing its own focused render
  with its own unfocused render, and the indicator that render actually paints is judged against the WCAG 2.1
  non-text ratio of **3:1** against the surface it is drawn on — the number behind "not effectively invisible",
  not a colour the plugin picked. The style sheet's own tokens are an implementation detail; the record quotes
  the measured ratio.
- **The theme's hue at full strength, in one rule.** The host paints its ring at 50 % alpha (`ring-ring/50`);
  the plugin asks for the same hue at full alpha, 2px wide, offset clear of the control's own edge, from a single
  rule scoped to the plugin root. One rule covers tags, index rows, disclosures, folds, rails and toolbar
  controls — a per-component set of rules is how these drift apart.
- **Measure the settled render.** Tailwind's `transition-colors` includes `outline-color`, so a computed style
  read immediately after focus can be a mid-transition value: one control measured 2.04:1 mid-transition and
  4.61:1 once its own animations had finished. Wait on the element's animations (a frame after they end) —
  never a blanket delay, which this project forbids for state reads.
- **A skip must name itself.** Whether a scroll container is in the tab order depends on whether it currently
  overflows, and the topics pane re-renders while a walk passes through it, so instance-level control counts are
  *reported* per view with the page's own reason per unreached element, while **class coverage is asserted** —
  every class the page exposes is reached and measured at least once.
- **The measure must be able to fail.** The focus pass ships a negative control (`--negative-control`) that
  injects CSS removing every focus indication and requires the per-class checks to fail; a suite that cannot see a
  removed indicator proves nothing by passing.
- **Which instance is measured is decided by the pass, not by the caller's shell.** The corpus env file carries no
  `NAKAMA_URL`, so an inherited value silently redirected a "corpus" reinstall to the fixture — reported success,
  new version, previous bytes still served. The wrapper resolves the URL from `--dataset`/`--url` and exports it
  explicitly, and the served-build guard runs as a precondition that REFUSES (exit 3) rather than recording.

## 13. Prototype navigation and view-specific recency (2026-10-03)

The owner restored the approved prototypes' five equal-style top-level entries: **Overview, Topics, People,
Repositories, Progress**. Overview is the brief recency/status summary; Topics expands one project's latest
changes and current axes; the other views expose different facets of the same information, with Progress the
most detailed. Navigation changes the view and does not mutate data.

- **Supersedes §3 and §5's four-tab/default-landing navigation ruling.** Overview is now a normal peer tab,
  selected on entry. The shell brand/title is not the special fifth route home. The five-tab prototype markup
  and `contract/interaction-spec.md` §1 are again authoritative for navigation. §7's two-heading rule is
  superseded where it depended on a persistent `Research overview` heading: each view has its own heading,
  while the top bar carries a dashboard brand.
- **Time scope belongs to Overview alone**, beside its heading as in `contract/prototypes/overview.html`.
  Its 7/14/30-day and All choices answer whether a project moved recently or has been quiet; changing that
  choice does not alter the data shown by the other four views.
- **Other views show all-time, recency-first recent activity**, with a provisional visible lead of **five
  events** so the last change and a few predecessors fit the page. An existing Show all affordance retains
  access to older entries; this is a display limit, not a claim that only five events exist. Entity indices
  are not silently truncated to five subjects. The owner will revisit the lead size later.
- **Progress remains a state dashboard, not another activity-log page.** Its selected Axis/Problem, optional
  Plan, open-problem inventory, Repository threads, Evidence and Human steering keep the accepted C4 hierarchy.
  One selected-axis Activity rail is supporting chronology: newest five initially, the authoritative all-time
  event total labelled separately from the returned bucket, with Show all limited to that bucket. Retire the
  old window-wide footer now that Progress has no time window. The top-left is the **current selected Problem**,
  not a duplicate open-problems inventory; its statement/status/factual context are prominent, while the
  inventory stays below. The projection has no distinct explanatory/current-reading field, so none is
  fabricated to mimic the prototype's sample prose.
- **Remove the archived toggle** and show current items only. Refresh remains a secondary action. The
  read-only preview and the served-instance acceptance pass must distinguish these scopes; old screenshots
  and transcripts remain historical evidence, not silently rewritten records.

---

## 14. V1 — the visual-coherence pass (2026-10-03)

Reading all ten montages together (corpus + crowded fixture × five views) showed the product structure
coherent but the **visual system** not: elements meaning the same thing had evolved separately in each tab.
V1 is that pass — its own unit, its own acceptance record, nothing here revising C1–C5.

### 14.1 `--rd-gap` was dead, and that was the layout defect (repaired)

`--rd-gap` was declared as `var(--rd-gap)` — a self-reference, so it computed to the empty string and the
eleven `gap: var(--rd-gap)` rules that read it dropped. Sites with a literal value locally masked it
(`.rd-current-work > .rd-axes { gap: 18px }`), which is why the page read as "dense" rather than "broken".
Measured: computed `""` → `8px`. **8px is the repaired intended token, not a final tuning value** — contexts
wanting a tighter or looser step take `gap-tight`/`gap-block` after the montages are read, rather than being
hand-tuned on top of the repair. The two protected invariants (Problem/Activity dominance 1.67×, index 240px)
are unmoved by it.

### 14.2 The view's name is the page-level type step

The token block topped out at the host's 16px card title, so the 16px shell brand outranked the 14px view
title and every page read as a subsection of the title bar. `--rd-title-view` (23px) is now the largest
page-level step and the view's hint sits on its own line, at the metadata step. No second token was added for
the entity title: that is the host's own `--rd-title`, and a token nothing reads is the bloat this pass exists
to remove.

### 14.3 One visual Axis grammar, multiple truthful data sources (ruled, A3)

One Axis appeared as four different objects: a head with no reading (Topics' fallback row), a row whose head
was a plain `.rd-row` (Repositories), a row with a reading and a fold (People), and a card with head, reading,
references and fold (Topics' detail). `AxisRow`/`AxisHead` now carry one shared shape — `head · reading ·
blocker · references · disclosure` — with a **presentational** props interface: no projection type, no
per-caller conditional inside it, every `data-rd-*` hook passed through by the caller. The reading is a **slot,
not a field**: `AxisScan` carries no current state, so "no blocker recorded" stays the caller's own truthful
sentence rather than prose the component invents.

Adopted by all four surfaces (`AxisItem`, `AxisScanItem`, `PersonAxisRow`, and `AxisDetailCard`'s head), and
verified by attribute set rather than by eye: **192 `data-rd-*` names before, 192 after, none lost, none
invented** — the harness reads them, and for some checks they are the only way to tell which projection is on
screen. The frozen `contract/` is untouched (A1); its omission of this primitive is historical fact, not a
defect to patch.

### 14.4 People's section is `Involvement`, terminal axes last (ruled, Q2)

`CURRENT INVOLVEMENT` was false the moment completed work sat under it, and People was the one view rendering
terminal axes inline while Topics and Repositories fold them out. The section is renamed **Involvement** and
the axes are stably partitioned — non-terminal first, terminal last, each keeping its own state badge — so the
projection's own order survives inside each group. One section, no `Current | Completed` sub-navigation.

### 14.5 Rehearsed and rejected: the Progress index pill

Moving the Progress index row's state pill up beside its title was built, measured and reverted. At 240px a
full-size axis title cannot share a line with a pill — "PARKED · INFERRED" alone is ~90px — so the pill takes
line 1 alone and the row grows to three lines, in the one rail the montage review already flags as "rows much
taller". The other three index rails carry no pill in the index at all, so there is no established pattern for
it to converge on. Deferred to the row-by-row pass, with its montage in hand.

### 14.6 The index row gives its title the full width (ruled, 2026-10-03)

A rail row put the title and a right-aligned recency on one line. At the fixed 240px basis that made the age
compete with the title for the same horizontal space, so a title wrapped whenever the age took the end of its
line — and the rail's width can no longer be widened to compensate without breaching the index/detail balance
(§14.2). The row grammar is therefore: **the title takes the row's whole first line, and the recency moves down
to the line that already carries the row's quiet facts.** One grammar for Topics, People, Repositories and
Progress — not a Topics-only fix.

Measured (corpus, 1440; row height / title lines; before → after): topics 88→64, 2L→1L — the case the item was
raised for; people 64→84, 1L→1L — nothing to unwrap, the cost is the longer metadata line; repositories
88→108, 2L→2L — the full-width name still overflows by ~10px; progress 130→64..130.

**Recorded as a partial win, not a clean one.** Folding the recency into the context line lengthens that line
at 240px, so two rails carry one more line and one of them gains nothing. The alternative — the recency on its
own line — was considered and not taken: it costs every rail a line and turns Topics' two-line win back into
three. The measured numbers, not the shape of the change, are the thing to rule on.

The rail's own rows stay identifiable by hook (`data-rd-index-axis` counted 3 in both runs). The extra
`.rd-index-item` elements the after-run counted are the pane's open-problems rows, which carry
`data-rd-problem-choice` and reuse the row class; they are not index rows and no index row was duplicated.

**Follow-ups from the ruling, recorded as localized density work — not blockers.** *People*: the secondary
metadata line is denser than it needs to be now that the recency sits on it; shortening or simplifying that line
is the fix, and the shared grammar is not at fault. *Repositories*: the repository name itself still overflows
the 240px line by ~10px, so the constraint is the name's length, not where the recency sits — the rail is **not**
widened for that case, because the index/detail balance (§14.2) is the stronger rule; a different break rule or
ellipsis are the options if the final montages show it reading badly.

### 14.7 The People recency slot keeps its exceptional state (ruled, 2026-10-03)

"One recency grammar everywhere" is withdrawn as too broad. There are two cases and they are different facts:
where there is attributable activity the row shows ordinary recency in the shared grammar; where there is none
it states the attribution fact (`nothing attributed yet`, `no account mapped`) instead. Writing an age, or a
blank, into that slot would report "no recent activity" — a different and false claim — and
`data-rd-person-recency` already carries `none` / `unattributable` so a check can compare the row against the
payload it came from. The visual pass may quiet or reposition the exceptional state; it may not remove or
reinterpret it, and the payload and harness contracts are unchanged.

### 14.8 V1-B polish — four bounded rules (2026-10-03)

Checkpoint 1's verdict named four remaining visible issues for V1-B; each is now a rule, with the before/after
measurements in [`V1-visual-coherence.md`](V1-visual-coherence.md) §*V1-B*.

- **A Repository's detail header names its topics, never its axes.** The header used to repeat every Axis as a
  pill (then `+N more`) directly above a `Current work` lane that names the same axes — the "pill soup" of
  V1-B B2. The rule: the header carries the navigable **Topic** pills and states the axis **count** as
  quiet metadata; work detail belongs to the lane, where each Axis title is itself a navigable tag. Access is
  not reduced — the lane's tags are the route, and this makes the Repository header read like the Topic and
  Person headers rather than like a second copy of the lane.
- **A flat rail separates its sections with the rail step, not with boxes.** `.rd-side-stack` takes
  `--rd-gap-rail` (24px) instead of the 12px block gap. The reviewer's own range was about 20–24px, and the
  intent is explicit: make the no-card rail style work, do not restore heavy card boundaries.
- **The Progress support band keeps three columns but carries real gutters, and Human steering is tinted.**
  Column gutter 28px (from 12px) and a larger top step; Human steering takes a subtle `--muted` fill and
  `align-self: start` so the tint hugs its content rather than becoming a full-height block. Steering is a
  person's constraint, a different kind of fact from Evidence, so it is not left identical to the column beside
  it. **The band's fold position is not part of this rule** — the band still sits at/below the fold at the top
  scroll on both datasets (measured in the V1 doc); moving it up is composition, not polish, and was not taken.
- **The Overview card splits its state line from its blocker, and its event block is a divider.** The state
  counts are one compact metadata line and the blocked Axis (`blocked on …`) is its own line — never
  concatenated. The `Last event` block is a hairline over whitespace, not a gray inset (V1-B B4). Both
  landing columns carry the same footer geometry, with the action at the card's right edge (the prototype's
  `card-footer` placement) rather than left under the tags.

None of the four changes a projection, an activity scope or the frozen contract; the `data-rd-*` name inventory
is unchanged (192 → 192). The two further verdict items — **People metadata density** and **long Repository-name
wrapping** — remain the recorded follow-ups of §14.6 and were not reopened.

### 14.9 Overview's window control is one segmented track, and Phase 4 is on hold (2026-10-03, V1-B B5)

Checkpoint 2's verdict authorized Phase 4 *verification* and named no visual corrections. V1-B's fifth item,
**B5**, was raised and reviewer-authorized **after** that verdict: **Overview's 7d / 14d / 30d / All selector is
one rounded segmented track**, the options integrated into it and the pressed one lifted on a light face — the
shape `contract/prototypes/overview.html` draws, and the same joined-switch grammar the app's own
`.rd-progress-switch` already uses (a second segmented spelling is exactly the drift V1 exists to remove).

- **It is styling only, and the hooks are untouched.** `WindowControl`'s JSX is byte-unchanged, so the four
  buttons, their `data-rd-window` value, `aria-pressed`, the `role="group"` + `aria-label`, the `disabled`
  wiring and the `.rd-window` class — everything the harness reads — are preserved exactly; no projection,
  activity-scope or contract change; and the window stays **Overview's alone** (§13).
- **Where the work lands:** the `.rd-window` rules in `src/ui.tsx` and the preview montage pack; measured and
  read in [`V1-visual-coherence.md`](V1-visual-coherence.md) §*B5*. **Preview only — not accepted**: a preview
  render is a visual instrument, not evidence.
- **Phase 4 is on hold.** The served-instance verification (the served-build guard, the corpus and fixture
  acceptance passes, the focus pass with its negative control, and the Progress title-equality reconciliation)
  does **not** start on this change; it waits until the owner explicitly lifts the hold. B5 being visual-only
  does not itself open Phase 4, and none of the preview figures are offered as V1 acceptance.

### 14.10 Phase-4 ruling — two geometry rules revised, one focus defect to fix (2026-10-03)

The Phase-4 served run left three open findings (two layout-composition claims and one focus clip; recorded in
[`V1-visual-coherence.md`](V1-visual-coherence.md) §*Phase 4 verification*). The reviewer's ruling, recorded
verbatim and **not reopened**:

> Phase-4 ruling: Findings 1 and 2 are accepted geometry-rule revisions, not visual regressions. Rail sections
> are no longer required all to begin within the first viewport; the primary and second sections must remain
> initially discoverable, while later sections may continue below the fold provided ordinary page scrolling
> reaches them without clipping, overlap, or unintended nested scrolling. The Progress support band is
> container-responsive: three columns are required when at least 720 px is available; at 480–719 px, two
> columns with the third wrapping below is permitted; below 480 px, one column is permitted, with Repository
> threads → Evidence → Human steering order preserved. The measured 634 px fixture case is therefore
> acceptable. Finding 3 is a real focus defect: preserve the shared focus indicator and add minimal scroll
> clearance so settled real-Tab focus is fully visible and not clipped by the host scrollport, then rerun the
> focus pass and negative control. V1 remains unaccepted until that defect is corrected and the final served
> gates are green.

**What the ruling revises and what it keeps.** Findings 1 (rail first-screen rule) and 2 (support-band
three-column rule) are **rule revisions, not regressions**: the assertions are replaced with the ruled
conditions (primary+second discoverable; later sections reachable by ordinary page scrolling with no clipping,
overlap or unintended nested scrolling; the band's column count keyed to its own container width at 720/480
with the Repository threads → Evidence → Human steering order preserved). Finding 3 is a **real defect**: the
shared 2 px focus indicator is unchanged and the fix is minimal scroll clearance only. V1 is **not accepted**
by this ruling — acceptance waits on the corrected defect and the final green served gates; the parent
verifies and the final reviewer decides.

### 14.10 addendum — the band rule made exact (2026-10-04)

An independent audit found the auto-fit implementation did not meet the ruled 480 floor: the two-column switch sat
at **~471 px**, so a 3-card band at 471–479 px rendered **two** columns where the ruling requires **one** below 480.
The 720/480 thresholds are **strict and are not weakened**. The band is now written explicitly with container
queries on the pane (`container-type: inline-size`, the pane's content box being the band's own width) — one column
below 480 px, two from 480 px (when the band has ≥2 sections), three from 720 px (when it has ≥3), each capped at
the band's own card count so conditional sections stay natural — measured **exact** at 479→1/480→2 and 719→2/720→3
on the served fixture (3-card band, width set directly on the container). The reachability clause is also tightened,
not relaxed: "reached by ordinary page scrolling" is now bounded by the **intended host scroller's client bottom**
when the host constrains the page to an inner port, not merely by the window (a window-only bound would accept
content the port still clips). Source: `src/ui.tsx` and `harness/verify-page.mjs`; measured in
[`V1-visual-coherence.md`](V1-visual-coherence.md) §*Post-audit correction*.

### 15. People index metadata boundary and outcome-based review (2026-10-04)

The reviewer authorized the post-V1 People readability outcome: preserve every factual count, baseline ordinary
and exceptional recency wording, the shared row grammar, 240px rail, hooks, navigation and focus behavior.
Because the People recency child is block-level, the index renders **no inter-block separator** between its
involvement text and recency. Separators within the factual counts remain. This is People-index-local: no
shared metadata CSS, detail-panel wording or Repository behavior changes.

The source implementation is **accepted and closed without conditions** by the final reviewer ruling in
[`people-index readability acceptance record`](../reviews/2026-10-04-people-index-readability-acceptance-record.md).
Commit, publication and merge remain owner-authorized. Served measurements
on corpus and fixture at 1440×900 and 1280×800 show Fixture Alpha 102→84px with its separator-only line 1→0;
other sampled People rows stay 84px, with no dangling factual separator, horizontal overflow or row-height
increase. The measured build is `0.2.0+dev.7c8fdc999f49`, bundle sha256
`714e55a7f9181bffc0e7ef144c1cfa18fe8c1fcbf3cde10136b030b8fa86179b`, corpus revision 60 / fixture revision 44.
The absent `nothing attributed yet` state has projection-level unit coverage, not rendered dataset coverage.

Repository wrapping remains unchanged by the reviewer's ruling: the historical approximately 10px overflow
was **not reproduced** on the fresh samples, not universally disproved. A single-line name is not a requirement;
no ellipsis, rail widening, forced break or synthetic safety net is authorized by this package. V1 and Tier B
B1/B2 remain closed; B3/B4 and further cleanup remain deferred.

**Standing workflow (reviewer ruling, verbatim):**

> Agree on outcome + invariants once. Within those boundaries, the orchestrator owns investigation, failed hypotheses, implementation and technical verification. Routine progress reports are informational. Reviewer approval is required for consequential product decisions, protected-boundary changes, material scope expansion and final package acceptance—not for each reversible implementation step. Owner-only operational actions remain separately gated.

Use milestone-based review and lightweight session-end reporting. Visual polish is maintenance, not a new
roadmap: further product work should improve operational usefulness and be separately scoped. This ruling does
not authorize an evidence-ingestion pipeline inside this plugin repository, publication, merge, service restart
or `AGENTS.md` edits. Contributor procedure: `.agents/skills/acceptance-pass/SKILL.md`.

---

## 16. `get_topic` scopes to one workstream on a stable axis id (2026-10-07)

The direct-use finding: a topic-wide `get_topic` returns **every** axis's notes, so a caller that cares about
one workstream has no way to ask for just it, and a problem's own notes were not exposed at all. The chosen
boundary is the smallest that answers both, and keeps every existing caller working:

- **`get_topic` gains an optional `axisId`** (stable id). Absent, the return is the topic-wide detail,
  **byte-shape unchanged** — no new top-level key, and problem objects still carry no `notes`. `axisTitle`
  is deliberately not accepted: the scoped read names a stable id.
- **Present, the read is a workstream**: `{ok, generatedAt, topic, axisId, axis, coverage}`. `axis` is that
  axis in full — state and confidence, evidence, its own history and notes, its plan, and its problems each
  with their own problem-scoped `notes`. Sibling axes are never built, so a note filed under another axis
  cannot leak into the answer, and a problem-scoped note is not duplicated into the axis's note list.
- **Coverage is explicit per collection**: `coverage.<evidence|history|notes|problemNotes>` is
  `{limit, limitScope, returned, total, truncated, absent}`. `limitScope` names what `limit` bounds
  (`collection` for `history`/`notes`, so `returned <= limit`; `per-source` for `evidence`, where
  `EVIDENCE_ITEM_LIMIT` caps each source and `returned` may exceed `limit`; `per-problem` for
  `problemNotes`, where `notesLimit` caps each problem and `returned` is a sum that may exceed `limit`),
  so a caller never infers `returned <= limit` from `limit` alone. `absent` (the collection is empty)
  and `truncated` (`total > returned`: rows exist beyond what was returned) are separate facts, so a
  missing row is never read as an omitted one. The `notes` total excludes problem-scoped notes (counted
  under `problemNotes`), so each collection agrees with itself.
- **Scoped option applicability**: with `axisId`, only `historyLimit` and `notesLimit` apply.
  `includeAnnotations`, `activityLimit` and `activitySinceDays` are topic-wide-branch options and are
  **ignored** under `axisId` (accepted by the schema, no effect) — documented rather than silently
  implied supported.
- **Validation ownership**: the action boundary resolves the axis and refuses an unknown id (`Axis not
  found.`) or one belonging to another topic (`Axis does not belong to this topic.`), both `invalid-input`;
  `ResearchStore.getAxisWorkstream` repeats the check as a public seam.
- **Boundary**: the topic-wide shape is preserved for compatibility, so an unscoped read still routes a
  problem-scoped note that carried a topic link into the topic-level `notes`; the scoped read is where problem
  notes are surfaced. The frozen N-4 E2E case asserts an unscoped `get_topic` never returns the
  problem-scoped steering note — still true — but the scoped read now does return it under its problem, so
  N-4's "hidden coverage limitation" reads differently under `axisId` and needs its own ruling before any
  evaluation re-run.

Landed in `src/store.ts`, `src/actions.ts`, `nakama.plugin.json`, the shipped `skills/research-coordinator`,
the E2E `API-LIMITS.md`/`limits.mjs`, with action tests. `coverage.limit` is made unambiguous by the added
`limitScope` field (`collection` / `per-source` / `per-problem`) so a caller never assumes `returned <= limit`;
the topic-wide contract keeps `limit` unchanged. Served on the isolated fixture at
`0.2.0+dev.64a201410338` (`actions/actions.js` sha256 `25900ac1…`, store generation unchanged); Layout Demo
left on `0.2.0+dev.164ccaafbca4` (rev 20, untouched).

## 17. The axis's own fold is the read affordance for its full `currentState` (2026-10-09)

The finding (**U03**): the diagnostics axis-4 `currentState` is DOM-present and text-exact but stays
**2-line clamped even with the axis fold open** — the only in-place route to the full string was the *edit*
form. The bounded design (`.hermes/scratch/full-text-access-design.md`, Option A vs B) was previewed
transiently (`.hermes/scratch/preview-clamp/`, DOM-only injected CSS) and the owner **visually accepted the
preview**. The owner then authorized implementation and its regression test — **not** deploy/reinstall/restart
or any fixture write.

**Decision: Option A.** Opening the axis's **own native `<details class="rd-axis-more">`** fold releases the
reading's clamp, **in place**. One CSS rule, keyed on the fold's own native `[open]` state and scoped to the
row that owns the fold:

```css
[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value,
[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value {
  -webkit-line-clamp: unset; display: block; overflow: visible;
}
```

The base clamp (`src/ui.tsx`, `.rd-axis-reading .rd-claim-value`) is unchanged; the rule adds **no JSX, no
React state, no `data-rd-*` hook, no new DOM node, no new control and no new fact** (`textContent` is
identical before and after — the clamp is visual). A **collapsed** card is unchanged: the rule is a
non-match while `[open]` is absent, so its *computed* collapsed behavior is identical (no screenshot
byte-equality is claimed).

- **Boundaries (stated):** only **fold-owning rows** unclamp — the Topics axis detail card (**where U03
  lives**) and the People axis rows. Rows with **no fold** — the Repositories `AxisScanItem` scan rows and the
  transient pre-detail `AxisItem` fallback — **stay clamped**. The fold's meaning widens from *provenance* to
  *provenance + the full reading*; that widening is the decision. `:has()` requires a modern Chromium (≥105).
- **Executable assertion (a rule needs one):** `harness/full-text-clamp/check.mjs`, run with
  `bun run harness:fulltext`. It serves the **built** `ui/app.js` through the plugin's own host runtime on a
  fresh loopback port (`harness/preview/run.mjs` — no instance, no credentials, no service restart) and
  measures at **1440×900** and **1280×800**: collapsed clamped + text-exact (411), the new rule inert when
  collapsed, the fold summary reachable by a **real Tab** press at ≥**3:1** settled focus, **Enter and Space**
  toggling the native fold, expanded **fully readable with no ellipsis and no horizontal overflow**, a short
  state a visual **no-op**, a **fold-less** row that does **not** match the rule, and a **negative control**
  that re-clamps while open and **must go red**. It asserts the rule is present in the built bundle
  byte-for-byte and **refuses** to measure a build without it. It allocates a **fresh ephemeral port**
  each run and proves the responder is its own child (a per-run token plus the built bundle's sha256 and
  **byte** length, cross-checked), so a stale or foreign responder is **refused** rather than measured and
  a child that exits before readiness **aborts immediately**; the generated fixture is rebuilt on every
  self-served run, and the reported build size is the file's byte length (`155420 B`), not its UTF-16
  code-unit count (`155239`). The red/green guards are exercised by
  `harness/full-text-clamp/integrity.test.mjs` (`bun run harness:fulltext:test`, 6 cases).
- **Where the work lands:** `src/ui.tsx` (the rule) and the rebuilt committed `ui/app.js`; the check under
  `harness/full-text-clamp/`; the implementation-preview record in
  [`U12-fulltext-clamp-release.md`](U12-fulltext-clamp-release.md).
- **Not done, by instruction:** **no deploy, no vendor, no reinstall, no restart, no fixture write, no served
  run.** This is an **implementation preview against the built bundle**, not served-build acceptance; the
  served acceptance remains a separate decision (which names the org explicitly — `--org-id`/`--org-name`, a
  backend that does not rebind `orgs[0]`).
