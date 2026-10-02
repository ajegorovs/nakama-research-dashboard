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
missing. The immediate re-run passed at both viewports, and the second run is what the records hold. The log
carried no `database is locked` and no HTTP 500, so this is the known dev-instance degradation surfacing as a
stalled *read* rather than a reported error. Worth knowing: a stalled read looks exactly like a composition
regression when it lands on a check, so a fixture failure needs a re-run before it is believed.

**Still open in C4:** F2 (the parallel window-wide feed below the composition — absorb it or bound it), the
geometry assertions, the concision and honesty checks, and the one-build record set plus a fresh Progress
montage.
