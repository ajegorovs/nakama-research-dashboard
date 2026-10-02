# C4 — Progress: converging an existing view onto the C1/C2 grammar

Charter opened 2026-10-02, after C2 was accepted. Reviewer's ruling: **C2 accepted; C4 unblocked** —
*"C4 Progress next, then C3 default-landing Overview, then C5 Repositories convergence. C4 is the better
next step because it is another existing view whose content is already present but grouped incorrectly. It
should now reuse the C1/C2 grammar."*

## The charter, as given

- axis/problem index on the left;
- selected detail on the right;
- `Problem | Activity` as the top grid;
- `Plan | Open problems` beneath;
- `Repository threads | Evidence | Human steering` as the three-card support band;
- Axes/Problems toggle above the index;
- **retain the activity cap**;
- **no new semantics/projections**.

Plus the two carry-overs that decided C1 and C2: assert **relative structure and dominance**, not prototype
pixel widths; and watch that the detail does not turn into an all-axes / all-activity dump — C4 should inherit
the *hierarchy*, not just the column layout.

## Verified surface — the structural elements already exist

Read against `src/ui.tsx` (`ProgressView`, line 2990) and `src/store.ts` at `ee79a4d`:

| element in the charter | where it is today |
|---|---|
| Axes/Problems toggle above the index | `data-rd-progress-subview` / `-subview-option`, `ui.tsx:3273–3289` |
| index on the left | `data-rd-progress-index`, `ui.tsx:3308–3390` — both subjects: Problems list `3317–3347`, Axes list `3349–3376+` |
| selected detail on the right | one `.rd-split.rd-progress-top` (`ui.tsx:3292`) carrying index + detail boxes |
| `Problem` (top-left of detail) | `data-rd-progress-problem*`, `ui.tsx:3407–3460`, incl. `data-rd-progress-recency` `3440` |
| `Activity` (top-right) | `data-rd-progress-feed*`, `ui.tsx:3502–3564` |
| `Plan` beneath | `data-rd-progress-plan*`, `ui.tsx:3595–3607` |
| `Open problems` beneath | `data-rd-progress-problems*`, `ui.tsx:3654–3655` |
| the three-card support band | `-repositories` `3695`, `-evidence` `3721`, `-steering` `3752` |
| the activity cap, retained | `data-rd-progress-feed-shown` / `-more` / `-note`, `ui.tsx:3521–3522`, `3563–3564` |

CSS for the same boxes is already in place (`.rd-progress-top` `ui.tsx:919`, `-problem` `922`, `-activity`
`928`, `-plan` `958`, `-problems` `986`, band `1001–1003`).

**So C4 is convergence, not construction.** Everything the charter names has been built — the U4 slice did it
— and the work is to make the view read as *one* composition in the C1/C2 hierarchy, then prove it against the
payload.

## Intake findings

**F1 — the index already speaks the C1/C2 grammar, in both subjects.** An axis row renders identity
(`rd-strong` title) → context (state badge · topic · counted problems · `stale`) → **recency**
(`last activity ${describeAge(row.recencyAt)}`), `ui.tsx:3370–3376`; a problem row renders its state badge and
statement followed by its own context line (`data-rd-problem-index-context`, `ui.tsx:3334–3343`). That is the
same three-part row C1 and C2 converged on, so the parity check is cheap and the risk here is low.

**F2 — the view carries a second, parallel reading below the composition.** Under the composition there is a
window-wide **filtered feed**: three `FilterSelect`s (topic / person / repository, `ui.tsx:3790–3840`) plus a
state filter, a summary line (`data-rd-progress-summary`, `3842–3849`), and then per-topic cards
(`data-rd-progress-topic`, `3864`) each carrying axis rails (`data-rd-progress-axis`, `3879`) and event buckets
(`data-rd-progress-events` / `-event`, `3912–3915`). **This is the "grouped incorrectly" surface**: the same
window's activity is presented twice — capped and axis-scoped inside the `Activity` box, then unbounded and
topic-bucketed below it. The decision C4 has to make is what happens to it: absorb it, or keep it as an
explicit window-wide audit with its own honest count and no implied completeness. Either way the count stays
visible; nothing may be silently dropped to make the page look tidy.

**F3 — the cap is real and it is honest.** `data-rd-progress-feed-shown` vs `data-rd-progress-feed-more` and a
note element (`ui.tsx:3521–3522`, `3563–3564`) mean the bounded feed already states its remainder. The charter
says retain this; the check should assert it rather than assume it.

**F4 — nothing in the charter needs a new projection.** `ProgressAxisRow` already carries `activityInWindow`,
`problems`, `openProblems`, `stale` and `recencyAt` (`store.ts:1264–1271`), and `ProgressActivity` is grouped,
windowed, ordered and counted **server-side** (`store.ts:4140–4183`). "No new semantics" is achievable as
stated: every box the charter names reads a field that already exists.

**F5 — the store, not the view, decides membership.** The feed's count and the index row's `activityInWindow`
come from the same predicate (`store.ts:1370–1374`), which is the property the existing checks pin. Any C4
change must keep that pinned rather than re-deriving a count in the view.

## Increment plan

1. **Index-row parity check** — every row, both subjects, carries identity → context → recency, and its
   recency is the payload's own `recencyAt` (the C2 pattern, applied to Progress).
2. **F2's decision, executed** — absorb or bound the parallel feed, with the count preserved and its
   remainder stated; record which was chosen and why.
3. **Geometry assertions, relative not pixel** — index left of detail and aligned tops; `Problem` beside
   `Activity` on one row; `Plan` beside `Open problems` beneath them; the three-card band beneath that; the
   detail materially wider than the index — at both 1440×900 and 1280×800.
4. **Concisions and honesty** — the activity cap stated, the open-problems list bounded, and a check that the
   default Progress reading is not an all-axes/all-activity dump (the reviewer's explicit warning).
5. **Records on one build** — both instances refreshed onto the same build, the five records re-taken, and a
   fresh Progress montage, before C3 begins.

## What C4 must not do

- No new semantics, projections or client-side aggregation; every number is the projection's.
- Nothing may be reconstructed from the V1 topic payload.
- Selection stays a mark, not a filter: the index is a projection renderer, not a second model
  (`ui.tsx:3305–3306`).

## Increment 1 — the index states *when*, in both subjects (landed, verified)

**What changed.** Both index rows now carry the raw value their context line already phrased:
`data-rd-index-recency` on an axis row and `data-rd-problem-index-recency` on a problem row (`src/ui.tsx`). The
phrasing existed in both subjects already — an axis row ends `… · last activity <age>` (`ui.tsx:3375–3376`) and
a problem row's context ends the same way through `problemContext` (`ui.tsx:3177`) — so nothing was invented.
What was missing was a machine-readable copy of the value behind the phrase, which is exactly the technique C2
used for the person index (`data-rd-person-recency`): it lets a check compare the phrase's *source* with the
projection instead of trusting the phrase.

**What is checked, and against what.** Three checks in `harness/verify-page.mjs`, each comparing the DOM with
the **live `get_progress`** answer for the window on screen:

1. every axis index row states a context, and its recency attribute equals the projection's own `recencyAt`;
2. the same for the **Problems** subject — read by clicking the switch, so both subjects are covered rather
   than assumed (the lesson from C2's About branch);
3. the switch stays client-side and leaves the index back where it started.

The Problems branch is **data-conditional**: where the projection holds no problem, that check skips with its
reason rather than passing on an empty list. The fixture holds three problems, so the branch actually runs
there.

**Result.** Fixture, revision 54 / `0.2.0+dev.b75a8363a6dc`, served asset sha256
`3bf4e57b2cd7092dd2d9299a131bf35f2f8f76e7d60b7c2979fb90253b7da4e3`: **1440×900 all passed · 0 skipped**,
**1280×800 all passed · 1 skipped** (the first-screen rail skip). The three new checks pass in both subjects at
both viewports — 7 axis rows and 3 problem rows, every recency matching the projection.

**One transient, recorded rather than smoothed over.** The first 1440×900 run failed two C1-era Topics checks:
the topic detail stayed on "Loading this topic" past its 20s wait, so two of that topic's own axes read as
missing. The log carried no `database is locked` and no HTTP 500, so this is the known dev-instance degradation
surfacing as a stalled *read* rather than a reported error, and the re-run after it passed both viewports.

**What the re-run is and is not** (reviewer, 2026-10-02): re-running is an *investigative* step, never part of
acceptance. "Rerun once before believing a failure" is not institutionalized here and must not become
acceptance logic — it can hide real flakes. If the stall recurs, it gets recorded as an infrastructure/runtime
flake with its own timing and request evidence (when it happened, which action stalled, for how long, what the
instance was doing), and the second green run is not by itself proof that the first red one was benign.

**Still open in C4:** F2 (the parallel window-wide feed below the composition — absorb it or bound it), the
geometry assertions, the concision and honesty checks, and the one-build record set plus a fresh Progress
montage.

## Increment 2 — F2: the duplicate feed is retired (landed, verified)

**The ruling (reviewer, 2026-10-02):** keep the window/count information; keep any controls still necessary for
the selected composition; retire the duplicate topic-bucketed event feed from the default page; preserve its
total so nothing disappears silently; and **do not** invent a new "audit" mode as part of C4. A window-wide
audit, if it is ever wanted, is a separate product surface — never a second competing reading underneath
Progress.

**What was removed** (`src/ui.tsx`, `ProgressView`): the four-filter bar (topic / person / repository / axis
state), the topic-bucketed feed itself — every topic card, its axis rails and their event lists, with their
"older here" trailers — and the feed's own empty card. Their state went with them: `topicFilter`,
`personFilter`, `repositoryFilter`, `stateFilter`, the `groups` derivation and the `filtered` flag are gone
rather than left dead, and the view keeps `timeline` only for the count.

**What was kept, and where it comes from.** One muted line: *"Last N days · X events recorded across Y topics
in this window — the reading above is the selected axis"*, still marked `data-rd-progress-summary`. Its numbers
are the payload's, not a recount: `load()` issues `get_overview` (whose `timeline` carries this total) and
`get_progress` (the index and its detail) with **one** `activitySinceDays`, so the surviving count is scoped to
exactly the window the composition reads. The toolbar's window control is the only control the composition
needs, and it stays.

**The five checks that prove the duplicate is gone rather than moved** (`harness/verify-page.mjs`), all
against the live payload:

1. every axis index row still states its context, and its recency is the projection's own — unchanged,
   re-verified in both subjects;
2. **the retired surface is absent**: 0 topic cards, 0 rails, 0 event lists, 0 event rows, 0 filter bars,
   0 of the retired empty cards — asserted positively, so the markers' absence is a check rather than an
   omission from the pass;
3. **exactly one activity reading** remains (the composition's scoped `Activity` box, or its honest empty
   state) — one reading, not two;
4. **the surviving count line equals the payload's own window total**, compared against a live `get_overview`
   for the window on screen (and it must say "in this window" and name the selected subject, so a reader can
   tell what it is counting);
5. **the composition's order holds** — top row → Plan / Open problems → the three-card support band, measured
   as positions on the page; the plan's clause is conditional because an axis with no plan renders nothing,
   and the first-screen check for the Progress glance already exists and still passes.

**Two checks retired with the controls they read** — one that a repository filter kept only the axes naming
that repository, one that a person filter matching nothing attributable said so. They are replaced above, not
silently dropped, and the pass states that in place.

**Result (fixture, both viewports, all checks).** The retirement is visible in the check's own evidence:
`{"empty":0,"eventLists":0,"eventRows":0,"filters":0,"rails":0,"topicCards":0,"feeds":1}` with the surviving
line reading *"Last 7 days · 8 events recorded across 2 topics in this window"* — matching the payload. The
feed's own screenshot now shows the composition alone. `bun run check`: 126 tests, 0 failures.

**Small tidiness left knowingly:** `FilterSelect` is now defined in `ui.tsx` with no caller (its only use was
the retired bar), and the `.rd-timeline-axis` styles are unused. Neither is visible; removing them is a
separate tidy-up rather than part of a composition change, and the file already carries one such dead constant
pair from an earlier pass.

## Increment 2a — what the corpus caught (both causes were mine, not the page's)

Taking the record set on the corpus failed three checks across the three passes, and **both causes were in the
checks I had just written**, not in the page:

1. **The order check required sections the subject legitimately does not have.** It demanded the Open problems
   section unconditionally; the corpus holds no problem at all, so that section correctly renders nothing and
   the check went red on correct behaviour (`{"plan":null,"problems":null,"band":1137}`). Fixed: the order is
   asserted over the sections that *do* render, with the top row still always required, and the detail naming
   which sections were present. Same class of mistake as the About branch in C2, caught the same way — by
   running it on a dataset whose subject is absent.
2. **The count check compared a moving window twice.** It read the page's 7-day total (computed at page load)
   and compared it against a fresh `get_overview` for "last 7 days" fetched minutes later: 143 against 142. An
   event sitting on the boundary can legitimately leave the window in between, so the check as written was a
   standing flake — it would have gone red at random for the rest of the project's life, which is exactly the
   kind of thing the reviewer warned against institutionalizing. Fixed: parity is taken at **All time**, which
   has no boundary to move, the window control is restored afterwards, and the check confirms the page really
   did move to All time so the comparison cannot pass by reading a stale DOM.

Both fixes are **harness-only** — no product change — so the build under test is unchanged and the montage
taken in the same run remains that build's artifact.

**One thing about the record trail.** A read pass is a *verdict*: exit 1 replaces the record, so the failing
runs briefly stood in `docs/corpus/verify-*.txt`. The re-taken records replace them, and this section is why
they failed — the trail is the record plus this note, not a silent overwrite. The fixture never failed: it
carries the problems and the plan the corpus lacks, which is why the two mistakes only appeared on the corpus.

**Cause 3, and the one that took the longest to see — a race in the check itself.** The count check clicked
"All time" and waited for the *request*, then read the summary. But `load()` awaits `get_overview`, sets the
overview, then awaits `get_progress` and sets the index: at the moment of the read the summary's **label** had
already changed to "All time" (it renders from React state) while the **timeline** behind it was still the
previous window's payload — so the line said 8 events on a fixture holding 9, and 142 against 143 on the
corpus. The evidence that settled it was the fixture's own store: 9 activities, unchanged, while the line said
8 — a fresh request and the page disagreed about the *same* query, which can only be the page not having
applied the response yet. Fixed with the pass's own documented readiness rule (`settleUntil`, `ui.tsx`-side
marker `data-rd-progress-index-window`) rather than a sleep, and the same wait now covers the window being put
back. With the fix the line reads **9 events on the fixture** (its store holds 9) and **694 on the corpus** (its
store holds 694) — parity by construction, not by luck.

Worth stating plainly: **all three failures were in the checks, none in the page.** The page behaved correctly
throughout; what the corpus exercised was my verification, and it found three different ways a check can be
wrong — an unstated precondition (a section the subject lacks), a premise that cannot hold (a moving window
compared twice), and a missing readiness wait.
