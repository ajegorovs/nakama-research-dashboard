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
