# Layout rework — first increment

Branch `layout/rework`. Steps **1–3** of [`docs/layout-rework-brief.md`](../layout-rework-brief.md), plus
the disclosure fix the review asked for between steps 2 and 3.

`docs/screenshots/` still holds the **before** set, deliberately: it is what the review was written
against, and a before/after pair is only useful if both halves stay. On acceptance the new captures are
promoted into `docs/screenshots/` and `docs/layout-fixtures/screenshots/`, and this directory goes away.

## What changed

1. **Reading and editing are separate modes.** `Read topic` opens a card in read mode — the detail
   renders with no form. `Edit fields` is the only thing that brings the form in. `Done editing` returns
   to reading with the card still open; `Close` collapses it. Previously `Edit fields` was the only way
   into a topic at all, so the read view *was* the editor, and closing the form collapsed the card.
   The card carries `data-rd-mode` (`collapsed` · `read` · `edit`) so the mode is a fact the page states
   rather than something a check infers from a screenshot.
2. **The toolbar groups its ten controls** into three divided clusters: what you are looking at (the view
   switch), the window you are looking at it through (window buttons + archived), and the actions
   (`Refresh`). The divider is the change; a flat row of ten peers is what it was.
3. **One disclosure control per card.** The `All n axes` / `Show fewer axes` button is gone: it drove the
   same state as `Read topic` / `Close`, so a card offered two ways to do one thing. Hidden work is now
   stated rather than offered — `3 of 5 axes shown · 2 more` (`data-rd-hidden-axes`) — and `Read topic` is
   the single topic-level disclosure control. A collapsed card's buttons are exactly `Read topic` and
   `Edit fields`.
4. **Axis compression.** An axis is one primary row plus one subordinate line, instead of four stacked
   lines of equal weight:

   ```
   ACTIVE · inferred   Docs & agent skills                 maintenance
                       repo · branch · PR #69 · the SA5 slice is published
   Blocker: …            ← the exception: own line, immediately visible
   ```

   Applied to the collapsed card's lead rows *and* the detail's axis blocks — the detail is where the
   four-line stack cost the most height.

## Measured

| | pre-rework | now |
|---|---|---|
| corpus detail @1440, read mode | 4496 px | **4374 px** |
| fixture detail @1440 | 2648 px | **2529 px** |
| corpus detail, editor open (1440) | 4828 px | n/a — read mode is a separate screen now |

| dataset | 1440×900 | 1280×800 |
|---|---|---|
| `docs/corpus/` | 42 pass · 0 fail · 7 skip | 42 pass · 0 fail · 7 skip |
| `docs/layout-fixtures/` | **49 pass · 0 fail · 0 skip** | **49 pass · 0 fail · 0 skip** |

Read pass 43 → 49 checks across the increment. `bun run check`: **82 pass · 0 fail · 472 expect()**.

**Honest note on the height.** Axis compression saves ~120 px per dataset. The rows are two levels instead
of four, but the detail's height is dominated by the per-axis claims (description, summary, current state,
evidence) and the activity log — not by the axis heads. That bulk is step 4's target (claims and counts
that restate what is already on screen), not step 3's.

## What this increment does not do

Steps 4–7: the count strip that restates the rows below it, one grammar across People / Repositories /
Progress, then the polish pass. `dashboard.png` in each directory is the density reference at both
viewports.

## Files

`after-1440x900/`, `after-1280x800/`, `after-fixture-1440x900/`, `after-fixture-1280x800/` — the six
views each, plus `verify-*.txt`, the harness transcript for each run.
