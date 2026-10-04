# V1 — the visual-coherence pass

**Unit:** V1. Its own acceptance record, separate from UX-v2 composition acceptance (which closed at
`ux-v2-composition-complete`). Nothing here revises C1–C5.

**Status:** **Checkpoint 1 passed; V1-B landed in the preview.** V1-A is landed for `A3` (index grammar), `A4`
(one index width, restated as the shared row grammar), `A5` (surfaces), `A6` (hierarchy), `A7` (plan
header/rows), `A8` (problem rows), plus `A1`'s Progress half. `A1`'s Topics half has since been **adopted in
the preview** — the private header copy is gone and the pane renders the shared `DetailHeader` (§*A1 Topics*
below) — but a preview render is a visual instrument, so it is **not accepted**; the served-instance pass is
what closes it. `A2`'s remainder has since landed in the preview too — one shared `ActivityFooter` and the one
`EventDate` format (§*A2* below), likewise a preview render and likewise **not accepted**. Checkpoint 1's
verdict (verbatim in §*Checkpoint 1*) approved A1/A2 and handed the four remaining visible issues to V1-B;
**V1-B B1–B4 are now landed in the preview** (§*V1-B* below) and the ten checkpoint-2 montages regenerated.
**Checkpoint 2 passed** — the reviewer's verdict (verbatim in §*Checkpoint 2*) authorizes Phase 4
**verification only**, with no visual corrections required first. **B5 — the Overview window control — has
since landed in the preview *after* checkpoint 2** (§*V1-B* and §*V1-B/B5* below), on reviewer-authorized
B5 scope; it is another preview render and likewise **not accepted**. The served-instance pass (Phase 4) has
**run** — its findings went to the reviewer, whose ruling (`DECISIONS.md` §14.10) revised the rail and
support-band geometry rules and named the fixture-1280 focus clip a real defect. The ruled corrections are made
and the corrected served gates are **green** (§*Phase 4 (ruled)*); **V1 is not accepted here** — the parent
verifies and the final reviewer decides. **The reviewer has since decided: V1 is accepted, subject only to
publication hygiene, and is now closed (2026-10-04).** The final acceptance record is
[`docs/reviews/2026-10-04-v1-acceptance-record.md`](../reviews/2026-10-04-v1-acceptance-record.md); its one
condition — two generated fixture transcript lines' trailing whitespace — is corrected at the emitter and the two
affected canonical fixture read records regenerated (§*V1 acceptance* below). Tier B cleanup is the next,
separately-reviewed step and is **not** started here.

**Measured build:** `ui/app.js` sha256 `e8e2353871a455c3…` — the digest of the build served to the preview
harness (`harness/preview/`, host runtime, no instance) as of `bb15eec`. The digest is quoted rather than a
short hash because a hash inside its own commit is self-referential and moves on every amend. **A preview
render is a visual instrument, not evidence**; the served-instance pass is what closes V1. The `A1` Topics
adoption below builds to a newer, still-uncommitted `ui/app.js` (`fa26f3e346027901…`); its before/after
figures quote both digests, and neither is a served-instance measurement. The `A2` remainder below builds to a
still-newer, still-uncommitted `ui/app.js`, sha256 `fd9ccf76f9497bc4…` (`src/ui.tsx` `ee9d54868cf9e840…`); its
figures are that build's, and it is a preview build too. The `V1-B` section below builds to
`ui/app.js` sha256 `ff9174f1b6914176…` (`src/ui.tsx` `3169d1578e045331…`) — the digest the ten
checkpoint-2 montage captions carry — and its figures are that build's, another preview build. **B5, post
checkpoint 2**, builds to `ui/app.js` sha256 `33890db1b6aea951…` (`src/ui.tsx` `3b9837cda7d314d4…`); reverting
only the B5 CSS reproduces `ff9174f1b6914176…` byte for byte, so its *before* figures are exactly
checkpoint 2's build and its *after* figures are the B5 build — both preview builds, neither a served-instance
measurement.

> **Resuming this pass?** Read this document and the code slice it names — not the older acceptance records.
> See § *Resuming this pass* at the end for the read scope and the resume order.

## What this pass is

The composition phase made the product *structure* coherent. Reading all ten montages at once (corpus +
crowded fixture × five views) showed that the **visual system** was not: index rows, detail headers,
axis/work rows, activity feeds, recency and section headings had each been built once per tab, and the same
conceptual element therefore had several spellings. V1 is that pass: repair the spacing system, extract the
one primitive the drift actually needs, then work the rows with montages in hand.

## Before measurements

| What | Measured before | After |
|---|---|---|
| `--rd-gap` computed value | `""` (declared `var(--rd-gap)` — a self-reference) | `8px` |
| rules reading it | 11, all dropping | 11, all applying |
| `.rd-view-title` vs shell `.rd-page-title` | 14px vs **16px** — the brand outranked the view | 23px vs 16px |
| Axis representations | 4 (`AxisItem`, `AxisScanItem`, `PersonAxisRow`, `AxisDetailCard`) disagreeing on class vocabulary (`.rd-axis-secondary` vs `.rd-axis-reading`) | 4 adopters, one grammar |
| People's section label | `CURRENT INVOLVEMENT` over a list containing completed axes | `INVOLVEMENT`, terminal axes last |
| index rail / dominance (protected) | 240px, problem/activity 1.67× | **unchanged** |

The dead token was masked rather than obvious: sites carrying a literal value
(`.rd-current-work > .rd-axes { gap: 18px }`) hid it, which is why the page read as *dense* instead of
*broken*. That is the whole reason the first fix is this one.

## What changed

1. **The spacing token is real again** (`--rd-gap` = 8px). 8px is the *repaired intended* value, not a tuned
   one: contexts wanting a tighter or looser step take `gap-tight`/`gap-block` after the montages are read,
   rather than being hand-adjusted on top of a repair.
2. **The view's name is the page-level type step** (`--rd-title-view`, 23px), with the hint on its own line at
   the metadata step. No second token for the entity title — that is the host's own `--rd-title`, and a token
   nothing reads is the bloat this pass exists to remove.
3. **`AxisRow`/`AxisHead`** — the one genuine extraction. `head · reading · blocker · references · disclosure`, presentational props, no projection type, no per-caller
conditional, every `data-rd-*` hook the caller's. The reading is a **slot, not a field**: `AxisScan` carries no current state, so "no blocker
   recorded" stays the caller's truthful sentence rather than prose the primitive invents.
4. **People's section is `Involvement`**, axes stably partitioned non-terminal-first, each keeping its state
   badge. One section, no `Current | Completed` sub-navigation.

Verified by attribute set rather than by eye — **192 `data-rd-*` names before, 192 after, none lost, none
invented** (`harness/verify-page.mjs` reads them, and some are the only way a check can tell which projection
is on screen).

## The attribute gate — and what it does and does not mean

The refactor's gate was **"rendered attribute inventory before = rendered attribute inventory after"**
(192 → 192). A sweep of the harness afterwards found 12 names it selects that the source no longer renders.
**That is not automatically drift** — the first pass over it labelled them "stale", which is wrong and is
corrected here so nobody acts on it:

| Category | Meaning | Action |
|---|---|---|
| **positive selector** | the element must exist; absence is a failure | the hook must be rendered |
| **negative selector** | the element must **not** exist; its absence *is* the assertion | **leave it unrendered** |
| **rendered unasserted hook** | DOM/CSS/debug contract, no executable coverage yet | keep it; not disposable |

Traced to the `check(…)` that consumes each read:

- **Negative selectors (9) — leave exactly as they are:** `data-rd-progress-empty`, `-events`, `-event`,
  `-filters`, `-axis`, `-topic`, `data-rd-progress-summary`, `data-rd-detail-counts`, `data-rd-edit-open`,
  `data-rd-topic-editor`. Each is consumed by an assertion of the form `=== 0` — *"C4: the retired window-wide
  feed is gone — not moved, and with nothing of it left behind"*, *"the topic detail offers no broad edit
  control (D7: Topics is read-first)"*, *"N count strip(s) in the detail"*. **Re-adding any of these
  attributes would fail the acceptance pass.**
- **Still-valid indirect contract — leave:** `data-rd-topic-card` is half of `served-build.mjs`'s
  `[data-rd-topic-card], .rd-topic-card` build fingerprint, and the class half is live on the landing cards
  (`src/ui.tsx:3355,3459`). Half a live selector is not a cleanup.
- **Genuinely dead — fixed:** `data-rd-topic` in `focus-matrix.mjs`, below.

The corollary is why 192 → 192 is the stronger gate: the **41 unasserted hooks** are still CSS, screenshot,
debug and future-coverage contracts, and absence from the harness does not make them disposable.

### The one confirmed leftover, fixed (`28e73c2`, harness-only)

`focus-matrix.mjs` labelled a control class by `data-rd-topic` — unrendered since the card was retired —
instead of the live `data-rd-index-topic` on the Topics index buttons. It could never match, so the Topics
rail was the **only** index rail whose rows fell through to the class fallback and were reported in the H1
focus record as a bare `button.rd-index-item`. The committed corpus record shows `index-row-person` ×27 and
`index-row-repository` ×27 — and `topic-row` ×0. Measured on the corpus preview, with the hook chain read out
of the harness itself: the retired hook matched **0** instances, the live one matches **4**, and unlabelled
`rd-index-item` instances fall **6 → 2**. No UI source change; a label cannot affect what the pass measures.

**Stated boundaries of that fix:**

- **The focus pass has not been re-run** — including `--negative-control`. It needs a served instance, and
  this machine has neither an instance nor the estate's env file. It is on the Phase-4 list and rides that
  run.
- The **2 remaining** unlabelled `rd-index-item` instances are the Progress rail's (`data-rd-index-axis` is
  not in this chain). That rail was never in the chain, so labelling it is a new decision rather than a
  repair — left alone deliberately.
- The **41 unasserted hooks were not touched.**

## Boundaries

- **The frozen contract is untouched** (`docs/ux-v2/contract/`, byte-unchanged). Its omission of `AxisRow` is
  historical fact, and the rule lands in `DECISIONS.md` §14.3 instead.
- **The preview is a visual instrument, not evidence.** These montages are renders against the host runtime
  with no instance; the served-instance acceptance pass (§Phase 4) is what closes V1.
- **Rehearsed and rejected:** moving the Progress index pill beside its title (DECISIONS §14.5). Rendered,
  measured, reverted — see that entry for why.
- **Host-owned controls** (the plugin's toolbar chrome) are outside this pass, as in H1.

## Reproducing the montages

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run preview:fidelity                          # corpus
bun run preview:fidelity -- --dataset fixture      # crowded fixture
# → docs/ux-v2/fidelity/preview/<dataset>/side-by-side/<view>.png
```

Generated output: `docs/ux-v2/fidelity/preview/` is **not tracked** (policy set 2026-10-03, AGENTS.md §*What is
tracked*) — a montage is rebuilt from the source, never committed.

## Phase 3 — what landed, and what each item measured

| Item | What it was | Measured |
|---|---|---|
| **A7** | the plan header rendered as the run-together `PLAN · 2 STEPS1 of 2 done` — two spans in a 4px cluster | one row: label left, `1 of 2 done` right, same baseline |
| **A4** | the rail was `flex: 0 1 15rem; min-width: 12rem`, with a Progress-local `16rem` override on top | one basis, non-shrinking: index **240px in every view at 1440 and at 1280**; protected invariants held (dominance **1.67× / 1.66×**); no wrap |
| **A5** | Progress was the page's only detail pane with no card around it — one 1px left rule instead | computes the reference Card's surface **exactly** (1px, 14px radius, white, same shadow); content sits at **left+25 / top+25**, identical to the reference head |
| **A6** | two rules set the rail headline; the survivor left the event headline **heavier than the axis's own reading claim** | one rule; the claim now outranks the event reporting it |
| **A8** | only `[aria-pressed="true"]` had a surface, so a selected row read as the only row that existed | base = the outline the row already reserved, selection = the fill: **2 of 3 rows transparent, 1 of 3 filled**, border on all three |
| **A1** (Progress) | the pane's title element carried the state badge *inside* it | **`verify-page.mjs:4818` `detailTitle === selectedRowTitle`: false → true** — see below |
| **A1** (Topics) | the pane drew its own header — `.rd-detail-head` wrapping a hand-rolled `.rd-row[data-rd-detail-header]` — a second header implementation beside the shared `DetailHeader` | the pane now renders the shared `DetailHeader`; **geometry and type unchanged to the pixel** (header/title-row/context/claims boxes identical at 1440×900 and 1280×800, corpus and fixture), both hooks preserved — §*A1 Topics* below |
| **A4 restated** | a title and a right-aligned recency shared line 1 of a fixed-240px rail | title takes the whole line, recency joins the metadata line. DECISIONS §14.6 carries the before/after row heights and the honest **partial win** read |
| **A2** (date) | four event surfaces could each spell a recorded event's date | already one implementation — `EventDate`, ISO `YYYY-MM-DD` (the attribute keeps the full timestamp); verified identical across Topics, People, Repositories and Progress on both datasets. **No source change was needed** — §*A2* below |
| **A2** (footer) | four hand-rolled remainder blocks (person, repository and topic rails; the Progress feed), each restating the same sentence and control under its own `data-rd-*` names | one `ActivityFooter`; `5 of 25 shown, newest first` / `Show all 25` at corpus Topics, `5 of 50` at corpus Progress, `5 of 8` at fixture Topics; and **omitted entirely when the whole set fits** — corpus Repositories (5 of 5) and fixture Progress (4 of 4) render no footer, so `5 of 5 shown` cannot appear — §*A2* below |

Three self-corrections the render made, all kept in the record: **A8**'s first attempt gave the base the same
`--muted` fill the selection used, so all three rows computed `oklch(0.97 0 0)` and selection kept only its
border — a change that was technically consistent and visually worse, caught by measuring rather than looking.
**A6**'s "Problem statement +1 weight" was taken as the *relationship* the item names, not as a literal fifth
weight step, because the statement already sits at this scale's top. **A4 restated** is recorded as a partial
win: two rails carry one more line, and the ruling was to accept that over guaranteeing an extra line
everywhere.

### A1 Topics — the private header adopted the shared one (preview-measured, not accepted)

The plan found **two header implementations**: the shared `DetailHeader` (People, Repositories, Progress) and
Topics' private copy. The adoption was gated on classifying the private header's own DOM nesting **first**, so
the change is mechanical rather than interpretive. Captured from the rendered preview, corpus and fixture at
both viewports:

| Child of the Topics detail header | Rendered as | Class | Hook it bears |
|---|---|---|---|
| wrapper | `.rd-detail-head` (grid, `gap: --rd-gap-row` = 2px) | header-owned geometry | — |
| title row | `.rd-row` (the **inner** row) | header-owned | `data-rd-detail-header` (read position-agnostically, `verify-page.mjs:5508`) |
| title | `<CardTitle>{topic.name}</CardTitle>` (18px/600) | header-owned title | — |
| status | `<span class="rd-muted">{status}</span>` (12px) | header-owned badge slot | — |
| context | `.rd-cluster.rd-tags` → `EntityTag` buttons | header-owned context; the tagged entities are navigable body content | `data-rd-detail-context` (`verify:707`, asserted), `data-rd-entity-*`, `data-rd-tag-*` |
| claims | `.rd-detail-claims` → description claim, then approved-summary claim | **detail-body-owned content parked inside the header block** | `data-rd-description-field` (unasserted), `data-rd-claim="description"` / `"summary"` (`verify:693,856`) |
| conflict banner, `.rd-detail-grid`, … | siblings of the header | detail-body-owned, outside the header | unchanged |

**Adoption.** `title` carries the topic name, `badge` the status, the navigation tags move into `context`, and
the description → approved-summary block stays the pane's own `children`. The shared component supplies
geometry and the title/badge structure only; Topics is **not** reshaped into another pane's slot order, and
the `description` → approved-summary order is preserved.

**Hook comparison.** Both load-bearing hooks survive, and the Topics header's rendered hook **names** are
unchanged (before = after): `data-rd-detail-header`, `data-rd-detail-context`, `data-rd-description-field`,
`data-rd-claim`×2, `data-rd-entity-id`, `data-rd-entity-tag`, `data-rd-tag-label`, `data-rd-tag-compact`.
`data-rd-detail-header` moves from the inner title row to the outer `.rd-detail-head` (the shared component's
placement, as the other three panes already render it) — the reader collects it position-agnostically and
never asserts the collected value, so the move is invisible to the pass. The other hook the plan names,
`[data-rd-progress-detail] .rd-detail-head` (`:4786`), is Progress's and is untouched. A source-level sweep
confirms the page's distinct `data-rd-*` name set is **192 → 192, identical**.

**Measured (preview, host runtime, no instance).** At both viewports and both datasets the header's own box,
its title row, the context tag line and the claims block are **identical before and after**: corpus 1440 —
header 1102×166, title row 18px tall, context 22px, claims 122px; corpus 1280 — header 942×186, claims 142px;
fixture 1440 — header 1102×106; fixture 1280 — header 942×106. Title step 18px/600 and badge step 12px are
unchanged. The only structural differences are the intended ones: the outer `.rd-detail-head` now carries
`data-rd-detail-header`; the inner title row gains `.rd-detail-title-row` and drops the attribute; and the
child order is preserved (`title+badge` → `context` → `claims`).

**Boundaries.** Preview only — not a served-instance measurement, and the acceptance pass has not run against
it. One grader-visible detail is recorded rather than left implicit: the grammar reader's `headers[]` entry for
Topics now collects the **outer** head, so its `title` slice would span the children's text; that field is
collected and never asserted, so no check moves. The `[data-rd-detail-header]` count per view is unchanged
(one per pane).

### A2 — one event-date format, one activity footer (preview-measured, not accepted)

The plan scoped A2 as the `ActivityFeed` unification; what remained open, per §*Open in Phase 3*, was the date,
the footer, and the footer's omission. Two facts came out of tracing the code before editing anything:

- **The event date is already one implementation.** `EventDate` renders `at.slice(0, 10)` — ISO `YYYY-MM-DD` —
  with the full timestamp on `data-rd-event-date` for the harness to compare against the projection. It is the
  only renderer inside `[data-rd-activity-event]`, and all four activity surfaces go through the one
  `ActivityLine`, so there is no second spelling to fold in. **No source change was made for the date** — it was
  verified and left alone. (The remaining `occurredAt.slice(0, 10)` sites — a person's `History` rows, the axis
  `Evidence` line, steering claims — are not the activity feed and were out of the remainder's scope.)
- **The footer was four copies of the same block.** The person rail, the repository rail, the Progress feed and
  the topic rail each rendered `<div data-rd-*-more><span data-rd-*-note>…</span><Button…></div>` with the same
  sentence and control, differing only in their `data-rd-*` names and in the expansion state that fed them.

**Adoption.** They now render one presentational `ActivityFooter`; the caller passes its own `moreAttr` /
`noteAttr`, so every hook is preserved. The component is also where the **omission rule** lives: it renders
nothing when nothing is held back and the list is not expanded, so the four call sites no longer each hand-roll
`hidden > 0 || expanded` — a `5 of 5 shown` sentence is unreachable by construction rather than by four
agreeing conditionals.

**Measured (preview, host runtime, no instance; corpus + crowded fixture, 1440×900 and 1280×800 — identical at
both viewports).**

| Surface | rendered footer | expansion |
|---|---|---|
| corpus Topics rail | `5 of 25 shown, newest first` · `Show all 25` (`data-rd-topic-activity-more="20"`) | → `all 25 shown, newest first` · `Show fewer` (`more="0"`); collapse restores `20` |
| corpus Progress feed | `5 of 50 shown, newest first` · `Show all 50` (`data-rd-progress-feed-more="45"`) | → `all 50 shown, newest first` · `Show fewer` (`more="0"`); collapse restores `45` |
| corpus Repositories rail | **no footer** (`data-rd-repository-activity` = 5, `-shown` = 5 — the rollup's 5 equals the lead) | — |
| corpus People rail | **no footer** — no attributable activity; the empty state stands | — |
| fixture Topics rail | `5 of 8 shown, newest first` · `Show all 8` (`more="3"`) | → `all 8 shown, newest first`; collapse restores `3` |
| fixture Progress feed | **no footer** (`data-rd-progress-feed` = 4, `-shown` = 4 — the whole bucket fits the lead) | — |
| fixture Repositories rail | **no footer on any of the 3 rows** (`total`/`shown` = 1/1, 5/5, 1/1) | — |

Event dates observed on the same renders: corpus `2026-09-28`, `2026-09-26`; fixture `2026-10-01`,
`2026-09-30` — every one matching `^\d{4}-\d{2}-\d{2}$`, the format `harness/verify-page.mjs:4874` relies on to
tell a date line from a source line.

**Hook comparison.** The footer's eight marker names are unchanged and each is still borne by the element the
harness reads it from: `data-rd-{person,repository,topic}-activity-more` / `-note` and
`data-rd-progress-feed-more` / `-note`. The page's distinct `data-rd-*` name set is a source-level sweep
**192 → 192, identical** — the four call sites now set those names through `ActivityFooter`'s attribute props,
and the attributes they render are the same ones as before.

**Boundaries.**

- **Preview only** — a visual instrument, not a served-instance measurement; the acceptance pass has not run
  against it, and the served-instance pass is what closes V1.
- **The date item is a verified invariant, not a change.** The plan's A2 also names the two CSS override
  families (`.rd-side-card .rd-activity …` / `.rd-progress-activity .rd-feed …`) and the event-headline level;
  those are already one rule in the tree (the `src/ui.tsx` "V1/A2+A6" rule) and were outside the *remainder*
  the Open list named, so this edit did not re-open them.
- **No semantic change to activity scope:** the Overview window vs the other views' all-time read, the totals
  the lists report (`data-rd-*-activity` / `data-rd-progress-feed`), and Show all's bucket-only window are all
  untouched — the footer quotes the projection's own bucket, never an all-time total restated from a cap.

## V1-B — the polish pass (preview-measured, not accepted)

Checkpoint 1's verdict (verbatim above) handed the remaining visible issues to V1-B. Four were planned and
executed as **bounded polish** — no new architecture, no projection or activity-scope change, and no reopening
of A1/A2/A6. Measured on the preview (host runtime, no instance; corpus + crowded fixture at 1440×900 and
1280×800), build `ui/app.js` `ff9174f1b6914176…`:

| Item | What was wrong | What changed | Measured (before → after) |
|---|---|---|---|
| **B1** support band | three columns of one grid, 12px apart with a 4px eyebrow gap; Human steering rendered identically to Evidence | a real column gutter, a larger top step above the group, a wider eyebrow-to-content step; Human steering gets a subtle tint and hugs its own content | column gutters **12px → 28px** and band `padding-top` **10px → 14px** at both viewports and both datasets; fixture steering fill **transparent → `oklch(0.97 0 0)`**, section height **271 → 229** (it no longer stretches to the group's full height), the other two columns stay plain. Corpus' band carries two columns (no steering claim), so the tint is exercised on the fixture only |
| **B2** Repository header chips | the header repeated every Axis as a pill, then `+2 more`, directly above a `Current work` lane naming the same axes (absorbed as V1-B B2) | the header keeps its supporting **Topic** pills and states the axis **count** as quiet metadata; the axis names live only in the lane | fixture header context **6 nodes / 5 `data-rd-entity-tag` → 2 nodes / 1 tag** (`Layout fixture — crowded card` · `6 development axes`), corpus **4 → 2 nodes, 4 → 1 tag**; header box height **92px → 66px** (fixture). **Access preserved** — each Axis is still a navigable tag in the lane: 11 axis tags remain in the crowded panel |
| **B3** rail section spacing | flat rails separated by 12px with no card boundaries; the spacing could not replace the missing edges (absorbed as V1-B B3) | the `.rd-side-stack` step becomes a real one, from a token (`--rd-gap-rail`, 24px), not a restored box | stack gap **12px → 24px**; measured inter-section gaps **[12,12] → [24,24]** in Topics, People and Repositories, both datasets, both viewports |
| **B4** Overview card anatomy | the state counts and the blocked statement were concatenated into one serialized line; the Last event was a heavy gray inset; the card action sat left-aligned (absorbed as V1-B B4) | counts become a compact metadata line and the blocked Axis its own line; the event band becomes a divider over whitespace; both columns' actions move to the card's right edge | fixture current-work **1 text node → 2 lines** (a `rd-meta` count line + a `blocked on …` line, 4px apart; `blockedAsOwnLine` **0 → 1**); event band **`oklch(0.97 0 0)` fill / 6px radius / 8px 10px padding / h 77 → transparent / 1px top rule / 0 radius / h 70**; action row `justify: space-between` (button 15px from the left) → `flex-end` (button 15px from the **right**), in **both** columns (corpus and fixture) |
| **B5** Overview window control *(post checkpoint 2 — §*B5* below)* | the 7d/14d/30d/All options were four separate `variant="outline"` buttons in a wrapping `.rd-cluster` — four peer controls competing with the view heading — and the *selected* option read as a receding gray fill while the *unselected* ones were white-with-a-border | one rounded segmented track (`.rd-window`): the options are integrated into it (no per-option border or fill) and the pressed option is lifted on a light face — converged on the existing `.rd-progress-switch` grammar rather than a third spelling | both datasets, 1440 and 1280: control **287.8×28 → 279.8×36**; track **bg transparent → `oklch(0.97 0 0)`, radius 0 → 9px, 1px edge, padding 3px, gap 8px → 0, wrap → nowrap**; option **1px border → 0, radius 8 → 6px, opacity 1 → 0.72**; selected **gray `oklch(0.97)` → white `oklch(1)` + `rgba(0,0,0,.14) 0 1px 3px` shadow**; heading box unchanged (**56.5px**); exactly **1** pressed option in every state |

**Boundaries and findings.**

- **Preview only — not accepted.** These are renders against the host runtime with no instance; the
  served-instance pass (Phase 4) is what closes V1. The ten checkpoint-2 montages were regenerated
  (`bun run preview:fidelity` corpus, then `-- --dataset fixture`) and their captions carry the build sha
  above; the preview pack stays generated/untracked (policy set 2026-10-03).
- **The Progress lower support band is genuinely not fully exposed at the top scroll** — inspected in this
  pass, not fixed. Measured band top versus viewport at the page's own scroll position: corpus 1440 **876 of
  900** (≈24px visible), corpus 1280 **812 of 800** (below the fold), fixture 1440 **912 of 900** (below the
  fold), fixture 1280 **638 of 800** (partially visible). The montage clips the top of the page, so it cannot
  show this band; element screenshots of the band at both datasets are the artefact for that (scratch, not
  committed). B1 is polish and deliberately did **not** move the band up the page — that is composition, out
  of scope here — so the finding is recorded rather than fixed.
- **People metadata density** and **long Repository-name wrapping** — the two further verdict issues — are the
  already-recorded follow-ups in DECISIONS §14.6; **not touched** (non-blocking), and no new scope was opened
  for them.
- **No architecture, projection or activity-scope change.** The current-work split re-uses the payload's own
  `axisCounts` and the blocked-axes read; the header count reads the rollup's own `axes.length`; the event
  band, rail gap and support-band treatment are styling only.
- **The attribute inventory is unchanged: 192 `data-rd-*` names before, 192 after** — no name added or removed
  (a source-level sweep against `HEAD`; B2 removes axis-tag *instances* from one header, not the names).
- **The two protected invariants are unmoved** (re-measured, not assumed): the index rail is **240px in every
  view at both 1440×900 and 1280×800**, and the Progress Problem/Activity dominance is **1.67× (674/404 at 1440,
  574/344 at 1280)** — the ≥1.25× bound holds. Neither B1's band gutters nor B2's header content touches the
  index basis or the top-row grid.
- **Gates, green:** `bun run check` (126 pass / 0 fail / 764 `expect()`); `bun run typecheck:host` against the
  `~/Repos/nakama` checkout (0 diagnostics in this repo, 155 host-only); `bun run harness:records` (169 text
  files scanned, all checks passed).
- **Marker checks (a scratch guard, not evidence):** the D4 omission marker is on every repository card (3/3);
  no repository card prints a window count; every topic activity line still reads the payload's own count;
  both landing columns render; `Open topic` / `Expand activity` remain; an Axis tag is still reachable in the
  repository panel (the lane); the header context keeps its Topic tag and drops the axis names; the Progress
  reading surface still names its topic and axis tags.

### B5 — the Overview window control (post checkpoint 2; preview-measured, not accepted)

Checkpoint 2's verdict authorized Phase 4 *verification* and named no visual corrections. B5 was raised and
authorized **after** it, as its own bounded item — one control, no new semantics, no projection or
activity-scope change, and Overview-only scope preserved (the window is Overview's alone, DECISIONS §13).

**What was wrong.** The selector rendered as four separate outline buttons (`<Button variant="outline"
size="sm">`) inside a wrapping `.rd-cluster`. At a glance it read as four peer controls competing with the
"Overview" heading; and the two states were inverted from the prototype's intent — the *unselected* options
were white-with-a-border while the *selected* one was a muted gray fill, so the current choice receded instead
of being raised (`contract/prototypes/overview.html` `.window` draws one track with the pressed option lifted).

**What changed (CSS only; `WindowControl`'s JSX is untouched).** `.rd-window` became one rounded segmented
track and its options were integrated into it, converging on the same joined-switch grammar as the existing
`.rd-progress-switch` rather than adding a third segmented spelling — the drift V1 exists to remove.

| Property | Before (`ff9174f1b6914176…`) | After (`33890db1b6aea951…`) |
|---|---|---|
| track display / wrap / gap | `flex` / `wrap` / 8px | `inline-flex` / `nowrap` / 0 |
| track bg / radius / border / padding | transparent / 0 / none / 0 | `oklch(0.97 0 0)` / 9px / 1px `oklch(0.922 0 0)` / 3px |
| option border / radius / bg / opacity | 1px / 8px / white `oklch(1)` / 1 | 0 / 6px / transparent / 0.72 |
| selected option | gray fill `oklch(0.97 0 0)`, no shadow | white `oklch(1 0 0)` + `rgba(0,0,0,.14) 0 1px 3px` |
| control box | 287.8 × 28 | 279.8 × 36 |

Identical at 1440×900 and 1280×800 and on both datasets (the control is dataset-independent). The heading box
is unchanged (**56.5px** at both viewports), so the taller track does not grow the heading row.

**Hooks preserved exactly.** The JSX is byte-unchanged: the four `<Button>`s, their `data-rd-window` value
(`7` / `14` / `30` / `0`), `aria-pressed`, the `role="group"` + `aria-label="Activity window"`, the `disabled`
wiring and the `.rd-window` class all stay. The selector is still the only one, still inside
`[data-rd-view-heading="overview"]`; every captured state reports exactly **1** pressed option (`pressed=1`),
and the page's distinct `data-rd-*` name set is **192 → 192** (no JSX touched).

**Reproduce / inspect (generated, git-ignored).** Captured with a scratch instrument against the running
preview (`harness/preview/run.mjs`), corpus then fixture sequentially, 1440×900 and 1280×800, in every window
state. Artifacts: `docs/ux-v2/fidelity/preview/<dataset>/window/overview-{7d,14d,30d,All}-<viewport>.png`
(after) and `…-before.png` (checkpoint-2 bytes), element close-ups `overview-head-*`, and
`measurements.json` / `measurements-before.json` carrying the computed styles, boxes and the build sha.

**Boundaries.** Preview only — a visual instrument, not a served-instance measurement. No projection,
activity-scope or contract change; the `.rd-progress-switch` grammar is shared, not duplicated. The two
recorded follow-ups (People metadata density, long Repository-name wrapping, DECISIONS §14.6) are not touched.

**Phase 4 hold.** The B5 change is visual-only and does **not** itself open Phase 4; the reviewer-authorized
served-instance verification remains **on hold** until the owner lifts it, and nothing above is offered as
V1 acceptance.

### B5 — reviewer closure, and the primary/fallback route (2026-10-03)

**B5 is visually closed by the reviewer.** The post-checkpoint-2 B5 render (the Overview window control
converged onto the `.rd-progress-switch` grammar) was reviewed and **visually closed**, and the reviewer
required **no additional checkpoint** for it. This is a visual closure only: B5 remains a preview render, so
it changes nothing about the four Phase-4 gates above and does **not** itself lift the Phase-4 hold.

**Primary route, and the one authorized fallback.** The historical services estate stays the **primary**
route to the served-instance pass. A fresh, locally built corpus/fixture estate is authorized **only as a
fallback**, and only when the historical host is unavailable or cannot be promptly recovered through
existing normal remote access — never as a first choice, and never as a silent replacement. A bounded
discovery attempt against the historical host was made and is recorded as *not promptly recoverable*
(procedure, not identity, kept: the estate path and its four units were absent on the local host, no mount
was configured for it, and the reachable remote peers did not expose the tree; no private key, password or
credential material was read, printed or written). Per that ruling the fallback is now the operative route
for the setup that follows.

**Explicit new-instance labeling (required).** Any instance the fallback builds is a **new instance**, not
the historical estate. Every record, transcript, env file, data root and screenshot it produces must say so
plainly: a fresh corpus/fixture estate's acceptance numbers are *new-instance* measurements and are never
labelled as the estate's. The estate's historical records stay exactly as they were taken, and no new
measurement may be presented as reproducing them.

## Carried into Phase 4 — an explicit reconciliation, not a footnote

The A1 Progress fix turned `verify-page.mjs:4818`'s strict equality from false to true **in the preview**. A
preview render is a visual instrument, not evidence, so this does **not** close the finding — it is carried into
the served-instance pass as a named reconciliation:

- **The served corpus pass is green on that check** → the accepted record's path differed from what the preview
  exposed. Record *what* differed.
- **It fails on the same equality** → the historical accepted record was inconsistent with the current
  executable check. Record that inconsistency.
- **Either way the discrepancy is recorded, not smoothed over.** A green result does not retroactively make the
  pre-change measurement wrong, and a red one does not make the fix wrong. The strict title equality is a
  correctness signal, not a styling preference.

Also pending on that run, unchanged: the **focus pass and its `--negative-control`** (see above) — no run on
this machine could exercise it.

## Checkpoint 1 — the reviewer's verdict (verbatim, 2026-10-03)

The Phase-2 checkpoint montages (corpus + crowded fixture × five views) were taken to the reviewer. The
verdict, recorded verbatim and **not reopened**:

> Proceed to V1-B. No corrections are required before the polish pass. A1 preserves the Topics hierarchy and
> brings Progress onto the shared detail-header grammar; A2 now gives the activity surfaces a coherent
> date/footer treatment without making Activity compete with the primary work/problem reading. The remaining
> visible issues—Repository header chip saturation, flat rail-section spacing, Overview card anatomy, Progress
> support-band polish, People metadata density, and long Repository-name wrapping—are non-blocking and belong
> to V1-B or the already-recorded follow-ups. Static preview montages do not close interaction, focus,
> expansion, event-count, or served-runtime acceptance; those remain Phase 4.

The verdict approves the checkpoint and hands the six named visible issues to V1-B (the first four) and to the
already-recorded follow-ups (People metadata density, DECISIONS §14.6; long Repository-name wrapping, DECISIONS
§14.6). **A1, A2 and A6 are not reopened.** The checkpoint verdict's boundary is itself a decision: a preview
montage is a visual instrument only, so interaction, focus, expansion, event-count and served-runtime
acceptance all remain Phase 4.

## Checkpoint 2 — the reviewer's verdict (verbatim, 2026-10-03)

The V1-B polish montages (corpus + crowded fixture × five views, build `ui/app.js` `ff9174f1b6914176…`) were
taken to the reviewer. The verdict, recorded verbatim and **not reopened**:

> Proceed to Phase 4. No visual corrections are required before served-instance verification. V1-B resolves the
> planned polish issues: the Progress support band now has clearer separation without elevating Human steering
> above supporting context; Repository headers retain useful Topic context while leaving Axis detail to Current
> Work; right-rail sections are better separated without restoring heavy boxes; and Overview cards read as
> edited summaries rather than serialized state. The remaining People metadata density and long Repository-name
> wrapping are non-blocking follow-ups. This approval authorizes verification only; V1 acceptance remains
> contingent on the served-build guard, corpus and fixture acceptance passes, focus pass and negative control,
> and the explicit Progress title-equality reconciliation.

The verdict closes the checkpoint and **authorizes Phase 4 verification only — it is not V1 acceptance.** The
four V1-B items (B1–B4) are accepted as landed polish; the two remaining verdict items (People metadata
density, long Repository-name wrapping) stay the recorded non-blocking follow-ups of
`DECISIONS.md` §14.6/§14.8, unreopened. Acceptance still depends on the four named gates — the served-build
guard, the corpus and fixture acceptance passes, the focus pass with its negative control — **and** the
Progress title-equality reconciliation (§*Carried into Phase 4*), which is run and recorded whichever way it
lands: green names what differed, red names the inconsistency, and neither result is smoothed.

## Open in Phase 3

- **A1, Topics half** — **adopted in the preview** (§*A1 Topics* above), on the ruled DOM-nesting
  classification. What remains is the served-instance acceptance, and that rides the Phase-4 run alongside the
  Progress-half reconciliation.
- **A2 remainder** — **done in the preview** (§*A2* above): the one event-date format is `EventDate` (already
  shared; verified, unchanged), the four remainder blocks are one `ActivityFooter`, and the footer is omitted
  when the complete result set fits rather than printing a meaningless `5 of 5 shown`; no semantic change to
  activity scope. Preview only — the served-instance pass closes it.
- **V1-B B1–B4** — **done in the preview** (§*V1-B* above): the Progress support band (gutters, top step,
  steering tint), the Repository header's chip saturation (topics kept, axis names moved to the lane), the
  flat-rail section spacing (24px step), and the Overview card anatomy (counts split from the blocker, the
  event band de-boxed, one right-aligned footer geometry). Preview only — the served-instance pass closes it.
  The **Progress lower support band's fold position** and the two recorded density follow-ups (People metadata,
  long Repository-name wrapping) stay out of scope and are recorded in §*V1-B*'s boundaries.
- **V1-B B5 — the Overview window control** — **done in the preview, post checkpoint 2** (§*B5* above): the
  four options became one rounded segmented track with the pressed option raised, on the shared
  `.rd-progress-switch` grammar. CSS only, JSX and hooks unchanged, Overview-only scope preserved. Preview
  only — and the served-instance Phase-4 pass that would close it is **on hold** (below).

## Resuming this pass

**Read this document and the code slice the open items name — not the older records.** This document is written
to be the entry point: the landed items with the measurement that closed each, the three self-corrections the
render forced, what is open, and what waits for the served instance. Reading the composition phase's records
first adds noise rather than context; they are reachable by `git show <tag>:<path>` when a specific historical
claim needs checking, rather than read in sequence.

Resume order: **~~A1 Topics~~ done in the preview** (the DOM-nesting classification is in §*A1 Topics*, so the
adoption stays mechanical) → **~~A2 remainder~~ done in the preview** (§*A2*: the date is the shared
`EventDate`, the footer is one `ActivityFooter`, and it omits itself when the set fits — no semantic change to
activity scope) → **~~V1-B B1–B4~~ done in the preview** (§*V1-B*: the support band, the header chips, the rail
spacing, the Overview card anatomy — polish, not architecture) → **the checkpoint-2 review** → **~~V1-B B5~~ done
in the preview, post checkpoint 2** (§*B5*: the Overview window control onto one segmented track) → the single
served-instance Phase-4 loop, with the title-equality reconciliation checked explicitly and whichever way it
lands recorded rather than explained away. **Phase 4 is on hold** until the owner lifts it.

**Resume order, updated 2026-10-04: the pass is closed.** Phase 4 ran (and was re-run under the ruling), the
reviewer accepted V1 subject only to publication hygiene, and that condition is corrected —
**V1 is accepted and closed** (§*V1 acceptance*; verbatim verdict in
[`docs/reviews/2026-10-04-v1-acceptance-record.md`](../reviews/2026-10-04-v1-acceptance-record.md)). The two
non-blocking follow-ups (People metadata density, long Repository-name wrapping) ride the **Tier B cleanup**,
which is the next step and is not started without its own spec review.

## Phase 4 verification — fresh local estate (2026-10-03)

Phase 4 was exercised against a **fresh local estate** built for this run (the historical estate is absent on
this host: no mount, no units). This is **not V1 acceptance** — it is the served-instance run the four named
gates require, and it is recorded whichever way it landed.

**Instance identity (new local revisions, not continuity).** Nakama checkout **v0.4.31**
(`c33b36d`); the plugin confirmed on upstream 0.4.35 in `STATUS.md`, a delta left unreconciled on purpose.
Served release **`0.2.0+dev.c43ca875edae`**, served `ui/app.js` sha256
**`33890db1b6aea9517094fc465efc244d8ed0adc1e2dd167ec6837ded45db857b`**; corpus instance revision **28**,
fixture **12**. Loopback: corpus API `127.0.0.1:4399` / web `127.0.0.1:3003`; fixture API `127.0.0.1:4400` /
web `127.0.0.1:3005`. Seeds are the committed replay (695 calls) and the committed layout-fixture applier —
no fabricated data. Config, data roots and credentials are in the estate outside this public repo.

**Gates measured.**

| Gate | Result |
|---|---|
| `bun run check` (typecheck + build + unit) | **green** — 126 pass / 0 fail / 764 expect |
| `typecheck:host` against the real 0.4.31 host types | **green** — 0 diagnostics in this repo |
| served-build guard, both instances | **green** — served sha equals this build |
| focus · corpus 1440×900 | **60 · 0 · 0** |
| focus · fixture 1440×900 | **60 · 0 · 0** |
| focus · corpus 1280×800 | **64 · 0 · 0** |
| focus · fixture 1280×800 | **59 · 1 · 0** — `button.rd-index-item indicator survives its clippers (progress)` clipped by the host scroll container |
| focus · corpus 1440×900 `--negative-control` | **behaved** — 10 checks failed once indication was removed |
| read pass · corpus 1440×900 | **verdict** — 151 pass / 1 fail / 28 skip |
| read pass · corpus 1280×800 | **verdict, green** — 151 pass / 0 fail / 29 skip |
| read pass · fixture 1440×900 | **verdict, green** — 180 pass / 0 fail / 2 skip |
| read pass · fixture 1280×800 | **verdict** — 178 pass / 1 fail / 3 skip |

*Read passes re-taken 2026-10-03 after the harness readiness/disclosure repair (below); scratch transcripts at
`.hermes/scratch/phase4-repro/final-*.txt`.* The two remaining failures are **layout-composition claims, not
readiness** — corpus 1440×900 `the rail's three cards all begin in the first screen` (card tops **451 / 737 /
965** of 900: the third rail card begins below the fold) and fixture 1280×800 `C4: … the support band, as three
columns of one group` (band 634 px; the three cards render **2 columns**, the third wrapping to y1324). Both are
V1-B spacing consequences on the served build, left for the owner to decide (product vs rule); the harness was
not weakened to hide them. The **Progress pane-title reconciliation** (`C4: the pane is the selected axis — its
header names it`, the `detailTitle === selectedRowTitle` equality) is **green on every run**: corpus header
`Signal analysis — \`analysis/\`, SA1–SA5, sparse` equals its selected index row, fixture
`Fixture: active axis (with evidence)` likewise. The served pass is therefore green on that equality — the
discrepancy to record is that the equality now holds across **both** datasets, not only the preview render.

**Diagnosis of the read-pass result — an instrument/build incompatibility, not a clean product verdict.**

- The fixture read records do not abort; the corpus pair do, deterministically, at the **per-axis `History`
  control**. That control lives inside a closed `<details data-rd-axis-more>` disclosure, and the check clicks
  it without opening its ancestor (`harness/verify-page.mjs:2131`); the disclosure-opening helper
  (`:2100–2106`) leaves it closed and the function that would expand it, `expandAxisDisclosure`, has **no call
  site**. A control inside a closed `<details>` is not in the accessibility tree, so Playwright waits 30 s and
  the run aborts. This reproduces against the **committed HEAD bundle** (`e8e235…`) as well as this build, so it
  is not introduced by V1-B.
- The red fixture records cascade from reading the **Topics index before it renders**: entering Topics
  triggers its data, which lands ~1.5 s later (measured; action latency itself is ~40 ms, so the gap is
  client-side), while the pass reads immediately after the view container appears
  (`harness/verify-page.mjs:638–654`). "the topic index rendered — 0 index rows" and the checks downstream of
  it (detail pane, index row counts, `Open topic`, `Expand activity`) fail for that reason, not from the page
  being wrong — a direct probe of the same page shows `data-rd-topic-index` `0 → 1` and a populated detail
  once settled.
- The committed corpus and fixture read records predate the current harness (`harness/verify-page.mjs` last
  changed at `7b79cba`, 2026-10-03 13:05; `docs/corpus/verify-read.txt` last committed at `5e45818`,
  00:26), so they were not produced by the check set the local estate runs. Re-taking them needs the harness
  to open the axis disclosure before clicking its controls and to wait on the index rows — the harness change
  is described under *Phase-4 harness repair* below. No build byte was changed, and no check was masked or
  weakened: the disclosure/readiness waits are instrument prerequisites, and the failing checks still report.

**Phase-4 harness repair (verified on the fresh local estate).** The two read-pass defects recorded above were
repaired in `harness/verify-page.mjs` — harness only; no `src/` or `ui/` byte was changed:

- the per-axis `History` control is now reached through `expandAxisDisclosure(card)`, which opens the closed
  `details[data-rd-axis-more]` before the click (the write pass's `Correct` button the same way);
- the Topics / landing / repositories reads now wait on the page's **own** readiness markers
  (`waitForTopicsReady`, `waitForLandingReady`, `waitForRepositoriesReady` — `page.waitForFunction`, no blanket
  sleeps) after a view change or a window-change refetch;
- the Progress row grammar and the repository second line were reconciled to V1/A3–A4 (bare age; `counts · age`).

Verified outcome: corpus 1280×800 and fixture 1440×900 **green to a verdict**; corpus 1440×900 and fixture
1280×800 **one layout failure each** (above). Identity unchanged: release `0.2.0+dev.c43ca875edae`, served
`ui/app.js` sha256 `33890db1b6aea9517094fc465efc244d8ed0adc1e2dd167ec6837ded45db857b`, corpus revision **28**,
fixture revision **12**, guards green on both.

**What this closes and does not.** The guard, the focus pass at all four dataset×viewport combinations (with its
one recorded fixture-1280 clipping finding), the negative control, and the read passes on all four
dataset×viewport combinations now **run to verdicts**. The three remaining failures — the corpus 1440×900 rail
first-screen rule, the fixture 1280×800 support-band three-column rule, and the fixture-1280 focus clip — are
**composition/positional findings left open for the owner**: they are not readiness artifacts, and no check was
relaxed, no assertion weakened and no green fabricated to hide them. Phase 4 is not itself V1 acceptance; the
open decisions are whether the two layout rules are product fixes or rule revisions, and the focus clip. The
estate, its revisions and these findings are recorded in the local estate README (outside this
repo) with start/stop and cleanup instructions.

## Phase-4 ruling — two rules revised, one defect to fix (verbatim, 2026-10-03)

The three open findings above went back to the reviewer. The ruling, recorded verbatim and **not reopened**:

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

The two geometry findings are therefore **accepted rule revisions**, and their assertions in
`harness/verify-page.mjs` are replaced with the ruled conditions rather than carrying the old first-screen /
three-column claims. Finding 3 is a **real focus defect** — the shared 2 px indicator stays exactly as it is
and the only change is minimal scroll clearance so a settled real-Tab focus is not clipped by the host
scrollport. The corrected served run, its measurements and the rule-decision→assertion→measurement chain are
recorded in §*Phase 4 (ruled)* below. **V1 is not accepted here**; the parent verifies and the final reviewer
decides.

## Phase 4 (ruled) — the corrected served run (2026-10-03/04)

The ruled corrections were made and the served gates re-run. This is the Phase-4 run the ruling asked for; it is
**not V1 acceptance** — the parent verifies and the final reviewer decides.

**Instance identity.** Nakama checkout **v0.4.31** (`c33b36dd2d3320fe8c6d05cb6138a7adcd270e7e`). Served release
**`0.2.0+dev.0b33a02cf9d5`**, served `ui/app.js` sha256
**`558649341bda816d7cddc3f395e33fc54569530d1029b93c2dead71c0793c450`** (same hash vendored into the checkout);
plugin source `src/ui.tsx` sha256 `e46927166909953073c5c2e63831674ec00f878eddadfd0f2ab4284bdb8e2cbd`; corpus
instance revision **36**, fixture **20** (they move independently — quote the pair). Loopback: corpus API
`127.0.0.1:4399` / web `127.0.0.1:3003`, fixture API `127.0.0.1:4400` / web `127.0.0.1:3005`. Seeds unchanged
(committed replay + layout fixture; nothing wiped or reseeded). The guard names the exact served hash on both
instances.

**Gates (all green except where a skip is honest).**

| Gate | Result |
|---|---|
| `bun run check` (typecheck + build + unit) | **green** — 126 pass / 0 fail / 764 expect |
| `typecheck:host` against the real 0.4.31 host types | **green** — 0 diagnostics in this repo (155 host-only, not counted) |
| `harness:records` (public-records hygiene) | **green** — 182 text files scanned, no live endpoint |
| `harness:identity` | **green** — 82 checks |
| served-build guard, corpus | **OK**, sha `558649…`, revision 36 |
| served-build guard, fixture | **OK**, sha `558649…`, revision 20 |
| focus · corpus 1440×900 | **60 · 0 · 0** |
| focus · corpus 1280×800 | **64 · 0 · 0** |
| focus · fixture 1440×900 | **60 · 0 · 0** |
| focus · fixture 1280×800 | **60 · 0 · 0** — the former clip is gone |
| focus · corpus 1440×900 `--negative-control` | **behaved** — 10 checks failed once indication was removed |
| read pass · corpus 1440×900 | **green** — 153 pass / 0 fail / 27 skip |
| read pass · corpus 1280×800 | **green** — 153 pass / 0 fail / 27 skip |
| read pass · fixture 1440×900 | **green** — 180 pass / 0 fail / 2 skip |
| read pass · fixture 1280×800 | **green** — 180 pass / 0 fail / 2 skip |

**Rule decision → assertion → measurement.** Each ruled condition is now a discriminating assertion in
`harness/verify-page.mjs`, and the measurement below is what the served page returned.

- **Finding 1 — the rail (rule revised).** Old assertion: every rail section begins in the first screen.
  Replacement: the **primary and second** sections must begin in the first viewport; every **later** section must
  be reached by ordinary page scrolling — the last section's bottom within the viewport after the real page
  scroller is scrolled, no section overlap, each section ≥120 px wide, and ≤1 nested ancestor scroller (the
  intended port). Measured: corpus 1440 tops **451 / 737 / 965** (third below the fold), last bottom **859 of
  900** after a full page scroll; corpus 1280 **471 / 785 / 1013**, **759 of 800**; fixture 1440 **371 / 657 /
  857**, **584 of 900**; fixture 1280 **371 / 657 / 881**, **320 of 800**. No overlap; one scrolling ancestor
  in every case.
- **Finding 2 — the support band (rule revised).** Old assertion: three cards in one row at every width.
  Replacement: read the band's **own container width** and require the ruled layout — **three columns at
  ≥720 px**, two at 480–719 px, one below 480 px — with Repository threads → Evidence → Human steering order,
  no row/column overlap, every card ≥200 px wide, and the band reachable by ordinary page scrolling with ≤1
  nested scroller. Measured: corpus 1440 band **794 px, 2 cards → 2 columns**; corpus 1280 band **634 px, 2
  cards → 2 columns**; fixture 1440 band **794 px, 3 cards → 3 columns**; fixture 1280 band **634 px, 3 cards →
  2 columns, third wrapping below** — **the measured 634 px case the ruling calls acceptable**. The rule is
  exercised in both directions by the four runs (794→3, 634→2).
- **Finding 3 — the focus clip (real defect, fixed).** The assertion is unchanged (`indicator survives its
  clippers`, pad = `2 + 2 + 1 = 5 px`). Fix: `scroll-margin-block: 6px` on the controls the plugin draws — the
  browser's own focus scroll now frames the element's margin box, leaving the 4 px-painted outline room on every
  side, with **no layout effect**. Measured, real Tab at fixture 1280×800: before → FAIL `button.rd-index-item
  indicator survives its clippers (progress)` cut by the host scrollport; after → **PASS, not clipped**, with the
  indicator still `outline 2px rgb(180, 83, 9)` and its contrast `4.61:1` **unchanged**. All four focus passes
  green; the negative control still forces 10 failures.

**Component switch points vs the ruled thresholds (measured, corrected 2026-10-04).** Sweeping the fixture's
problem-bound three-card band (scratch instrument) gives the real switch points. The first pass moved the band's
auto-fit basis from `13rem` to `13.83rem` (≈221.3 px) so the three-column switch landed at the band's own width of
720 px; the **two-column** switch, however, fell at **~471 px** — under the ruled 480 floor, where the rule the
harness asserts requires **one** column, so a 3-card band at 471–479 px rendered two columns against a rule that
expected one. The earlier reading here — "this is not a violation, the ruling permits one column below 480" —
was **wrong**: the ruling *permits* one column below 480 *and* the harness asserts it, so the 471 px switch was a
real mismatch, not a permitted tolerance, and no single equal-gutter auto-fit basis can put both switches exactly
at 720 and 480 (720 = 3·M + 2·g and 480 = 2·M + g would need g = 0). The band is now written **explicitly** with
container queries on the pane (`container-type: inline-size`; the pane's content box is the band's own width)
instead of an auto-fit basis: one column below 480 px; two from 480 px; three from 720 px — each capped at the
band's own card count, so a two-card band stays two columns and a subject short of material still collapses
(conditional sections natural). **Measured on the served fixture (3-card band), band width set directly on the
container (scratch instrument):** 470 → 1 column, 475 → 1, 479 → 1, **480 → 2**, 634 → 2, **719 → 2**, **720 → 3**,
794 → 3 — exact at both ruled thresholds, Repository threads → Evidence → Human steering order preserved, no
row/column overlap, min card width 221 px at 720 (≥200), nothing clipped (full table in §*Post-audit correction*).

**Progress title-equality reconciliation (run and recorded).** The equality
`detailTitle === selectedRowTitle` (the `C4: the pane is the selected axis` check) is **green on all four served
runs**: corpus header/row both `Signal analysis — \`analysis/\`, SA1–SA5, sparse`; fixture both `Fixture: active
axis (with evidence)`. The historical observation is **not rewritten**: the pre-change preview record's
discrepancy stays where it was written; what changed is that the served run now reproduces the equality on
**both** datasets, so the reconciliation records that the equality holds on the served build rather than
smoothing the earlier measurement away.

**Expansion and navigation cases (green).** `Open topic` lands in Topics with the named topic selected;
`Expand activity` lands in Repositories with the named repository selected; the axis disclosure opens and grows
to hold its detail; the completed/abandoned fold is closed initially and opens on demand; tag traversal writes
nothing. All PASS in the four read transcripts.

**Skipped, each with its reason (honest gaps).** corpus 27 skips (no problem/plan/bare-repository subject in the
corpus for those negative cases) and fixture 2 skips (each read transcript lists each reason). Nothing is counted
as a pass for want of a subject.

**Records and archiving.** The four read and five focus transcripts are the canonical records at their existing
paths, re-taken on this build. The superseded committed records were archived named for the instance revision
each was **taken at** — `*.revision-527.txt` (corpus) and `*.revision-133.txt` (fixture), **not** the tip
revision of this run (52/36). **Correction (2026-10-04).** Only the **focus** record headers carry the instance
revision (`0.2.0+dev.e507fa4ebc4a, revision 527` / `…, revision 133`); the **read** record headers carry only the
dashboard and a timestamp and name no revision — so the 527/133 names come from the sibling focus records'
revisions, not from every archived file's own header as first written. Those nine `*.revision-*.txt` copies were
also verified byte-identical (sha256) to the same paths at the `ux-v2-composition-complete` tag, which already
preserves them; per the policy ("preserved by tag, not by the tip", `AGENTS.md`) they were **moved out of the
working tree** to the local estate's backup — not deleted and not added to the tip. Recovery is by tag:
`git show <tag>:<path>`. No build byte, projection, activity scope or frozen contract changed; the source changes
are the focus scroll clearance, the band's explicit container-query rule, and the harness's intended-scroller
bound, all recorded above and in `DECISIONS.md` §14.10.

**Preserved processes.** The handed-over preview on `127.0.0.1:3010` was **not** restarted (no `pkill`); it is a
Vite dev server that serves `ui/app.js` from disk, so a rebuild is picked up without a restart. The corpus web
(`:3003`), fixture web (`:3005`), corpus API (`:4399`) and fixture API (`:4400`) were reused, not restarted —
none required it (the plugin is served by the web dev server and the guards stayed green after the reinstall).
No process was killed by pattern.

**Residual findings (open, reported not smoothed).**

1. **The band's two-column switch — corrected 2026-10-04, now closed.** It sat at **~471 px** under the auto-fit
   basis — below the ruled 480 floor and therefore **a real mismatch** with the rule the harness asserts (below
   480 → one column), not a permitted tolerance as this record first called it. Closed by replacing the auto-fit
   basis with explicit container queries on the pane: the switch is now exact at **480** (479 → 1 column,
   480 → 2) and the three-column switch exact at **720** (719 → 2, 720 → 3). No residual remains on this rule.
2. **The corpus dataset cannot exercise the band's three-column branch** (its richest axis carries two support
   sections), so corpus runs only ever measure 794 px → 2 columns. The three-column branch is measured on the
   fixture 1440 run (794 px → 3 columns) — the four runs together discriminate both branches, but no single
   dataset shows 634→2 *and* 794→3.

## Post-audit correction — explicit band rule, exact 720/480 (2026-10-04)

An independent audit found the band's residual claim above to be false and the rule to be genuinely broken: the
auto-fit basis put the **two-column switch at ~471 px**, so a 3-card band at 471–479 px rendered two columns where
the harness rule the record itself wrote requires **one below 480**. The reviewer's 720/480 thresholds are
**strict and were not weakened**. The fix is minimal and CSS-only.

**Source change.** `src/ui.tsx`: `.rd-progress-detail` becomes the size-query container (`container-type:
inline-size`; the pane's content box equals the band's own width, which is what "available" means and what the
harness reads); `.rd-progress-band` drops the `repeat(auto-fit, minmax(13.83rem, 1fr))` basis for an explicit
one-column default plus two `@container` rules — `min-width: 480px` → two columns when the band has ≥2 sections,
`min-width: 720px` → three when it has ≥3 — each capped at the band's own card count (conditional sections
natural: a two-card band stays two columns). Gutter 28px unchanged; no content invented; no clipping. The harness
`harness/verify-page.mjs` also **tightened** its reachability bound (no weakening): the band/rail "reachable by
ordinary page scrolling" check now bounds by the **intended host scroller's client bottom** when the host
constrains the page to an inner port (the nearest scrolling ancestor), not merely by `window.innerHeight` — a
window-only bound would accept content the port still clips. The host exposes no stable selector for that port, so
it is identified structurally and the record names the element it found (e.g. `div.min-h-0`); full selector-based
identification is not attempted and is reported as unneeded complexity.

**Instance identity.** Release **`0.2.0+dev.30e1f1190226`**; served `ui/app.js` sha256
**`3b63f1fb2a3f7f1222280fb5ab53243651566b72ca9718e59149445f43219bac`** (vendored identical into the checkout);
plugin source `src/ui.tsx` vendored from the checkout; corpus instance revision **52**, fixture **36**. Loopback as
before (`:4399/:3003`, `:4400/:3005`; preview `:3010` preserved, not restarted). The guard named the exact served
hash on both instances.

**Gates (all green; nothing counted as a pass for want of a subject).**

| Gate | Result |
|---|---|
| `bun run check` (typecheck + build + unit) | green — 126 pass / 0 fail / 764 expect |
| `typecheck:host` against the real 0.4.31 host types | green — 0 diagnostics in this repo (155 host-only, not counted) |
| `harness:records` (public-records hygiene) | green — 173 text files scanned, no live endpoint |
| `harness:identity` | green — 82 checks |
| served-build guard, corpus | OK, sha `3b63f1fb…`, revision 52 |
| served-build guard, fixture | OK, sha `3b63f1fb…`, revision 36 |
| read · corpus 1440×900 | green — 153 pass / 0 fail / 27 skip |
| read · corpus 1280×800 | green — 153 pass / 0 fail / 27 skip |
| read · fixture 1440×900 | green — 180 pass / 0 fail / 2 skip (band 794px, 3 cards → 3 columns) |
| read · fixture 1280×800 | green — 180 pass / 0 fail / 2 skip (band 634px, 3 cards → 2 columns) |
| focus · corpus 1440×900 | 60 · 0 · 0 |
| focus · corpus 1280×800 | 64 · 0 · 0 |
| focus · fixture 1440×900 | 60 · 0 · 0 |
| focus · fixture 1280×800 | 60 · 0 · 0 |
| focus · corpus 1440×900 `--negative-control` | behaved — 10 checks failed once indication was removed |

**Boundary evidence (served fixture, 3-card band, band width set directly on the container; scratch instrument).**
The harness's own rule is `c ≥ 720 → min(n,3)`, `480 ≤ c < 720 → min(n,2)`, `c < 480 → 1`.

| band width | first row | expected | result |
|---|---|---|---|
| 470 px | 1 column | 1 | PASS |
| 475 px | 1 column | 1 | PASS |
| 479 px | 1 column | 1 | PASS |
| **480 px** | 2 columns | 2 | PASS |
| 719 px | 2 columns | 2 | PASS |
| **720 px** | 3 columns | 3 | PASS |

Order Repository threads → Evidence → Human steering held at every width; no row/column overlap; min card width
226 px at 480 and 221 px at 720 (≥200); nothing clipped. Exact at both ruled thresholds — the 471 px mismatch is
gone.

**Records and processes.** The four read and five focus transcripts were re-taken on this build and are the
canonical records at their existing paths. The handed-over preview on `127.0.0.1:3010` and the four estate units
were reused, not restarted (the preview is a Vite dev server serving `ui/app.js` from disk, so a rebuild is picked
up without a restart); no process was killed by pattern. V1 is **not accepted here** — the parent verifies and the
final reviewer decides.

## V1 acceptance — closed by the reviewer (2026-10-04)

The parent took the corrected Phase-4 run to the reviewer, whose verdict accepted V1 **subject only to
publication hygiene**: two generated fixture transcript lines carried trailing whitespace, to be corrected **at
the emitter** with the affected canonical record(s) regenerated, and no product or visual change. The verdict is
recorded **verbatim** in
[`docs/reviews/2026-10-04-v1-acceptance-record.md`](../reviews/2026-10-04-v1-acceptance-record.md), which is now
V1's final acceptance record.

**The condition is closed, and it was a harness-only fix.** A `PASS`/`FAIL`/`SKIP` line is emitted from one place
— `console.log` inside `check()`/`skip()` in `harness/verify-page.mjs` — and several checks build their `detail`
from rendered text via `text.slice(0, N)`, so a cut landing on a space left a trailing blank. The emitter now
trims trailing spaces/tabs (`emitLine`); no description, condition, detail value or verdict can move. The two
fixture read records were re-taken against the **unchanged** served build (release `0.2.0+dev.30e1f1190226`, sha
`3b63f1fb…`, fixture revision 36) — **fixture 1440×900 and 1280×800 both 180 pass / 0 fail / 2 skip** — and the
pre/post check descriptions and verdicts are identical with whitespace normalized (the only raw detail diffs are
the trailing-space trim and two time-relative ages, `2 days ago → 3 days ago`). An executable assertion was added
to the existing `harness:records` suite (`harness/test-redact.mjs`) that the canonical read records carry no
trailing whitespace; it was red on the pre-fix records and is green after. `ui/app.js` and the served sha are
unchanged; `git diff --check`, `harness:records`, `harness:identity`, `typecheck` and the unit suite are green.

**Status: V1 is accepted and closed.** The reviewer's ruling is the acceptance; the publication condition is
clean. No further product or visual change is required for V1. The one explicitly deferred boundary: the write-pass
records (`verify-fixture-write.txt`, `verify-fixture-read-post-write-1440x900.txt`, `corpus/verify-write.txt`)
still carry that detail's trailing space from runs taken before the fix — they are regenerated only by a write pass,
which mutates the fixture, and are not hand-edited.

**Pending follow-ups (non-blocking, per the verdict — not reopened):** People metadata density and long
Repository-name wrapping (`DECISIONS.md` §14.6/§14.8), to be carried by the Tier B cleanup effort. **Tier B is not
started here**; it takes its own spec review before any work begins.
