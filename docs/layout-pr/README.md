# Layout rework — first increment

Branch `layout/rework`. Steps 1 and 2 of [`docs/layout-rework-brief.md`](../layout-rework-brief.md) —
the two structural ones.

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

## Measured

Same read pass (43 checks before, 47 now — the four new ones are the two mode invariants, the
read/edit round-trip and the toolbar grouping), against both datasets at both viewports:

| dataset | 1440×900 | 1280×800 |
|---|---|---|
| `docs/corpus/` | all checks passed, 7 skipped | all checks passed, 7 skipped |
| `docs/layout-fixtures/` | all checks passed, **0 skipped** | all checks passed, **0 skipped** |

`bun run check`: **82 pass · 0 fail · 472 expect()**. The corpus detail capture is now read mode —
1144×4496, against 1144×4828 with the editor open at the same width.

Layout is otherwise untouched, on purpose: the detail is still ~4.5k px tall and still stacks four
equal-weight small-text lines per axis.

## What this increment does not do

Steps 3–7: axis compression, the duplicated count strip in cards, one grammar across People /
Repositories / Progress, then the polish pass. The detail's height and the axis-row stack are the
numbers to move for step 3; `dashboard.png` in each directory is the density reference for both viewports.

## Files

`after-1440x900/`, `after-1280x800/`, `after-fixture-1440x900/`, `after-fixture-1280x800/` — the six
views each, plus `verify-*.txt`, the harness transcript for each run.
