# Layout rework — acceptance brief

What to change and what must not change. The corpus and the fixture are the two datasets
(`docs/corpus/README.md`, `docs/layout-fixtures/README.md`); this file is the contract for the rework
itself. Where a requirement came from a review note, it says so.

## Status

| Step | State |
|---|---|
| 1. Separate read and edit modes | **done** — `Read topic` / `Edit fields` / `Done editing`; three harness checks (`docs/layout-pr/`) |
| 2. Group controls in the toolbar | **done** — three divided groups, one harness check |
| 3. Compress axis presentation to one primary row | **done** — state claim · title on one row with the kind receding, one subordinate line beneath; applied to lead rows *and* detail blocks. Corpus detail 4496 → 4374 px, fixture 2648 → 2529 px |
| 4. Reduce counts that restate rows | not started — and it is where the remaining detail height lives, not step 3 |
| 5. One grammar for People / Repositories / Progress | not started |
| 6. Both datasets at both viewports after each change | continuous — all four combinations pass after 1–3 |
| 7. Polish: borders, muted text, whitespace, emphasis, state colours | not started |

Between steps 2 and 3 a review found the card had **two disclosure controls** — the axis expander and
`Read topic` — driving one piece of state. Fixed: the expander is gone, hidden work is stated passively
(`3 of 5 axes shown · 2 more`), and two checks now pin it (one disclosure control; hidden work stated,
not offered).

## What you are working from

Two datasets, deliberately different jobs:

- **`docs/corpus/`** — a real public repository's history, seeded through the plugin's action surface.
  This is the realism and density reference. 36 checks pass, 7 are skipped.
- **`docs/layout-fixtures/`** — a small synthetic dataset that supplies the seven states above. 43
  checks pass, none skipped.

Neither is optional. Judging density only on the fixture is unrepresentative; judging correctness only
on the corpus misses the states with no subject there.

## Non-negotiables

1. **Reading and editing are different modes.** Opening a topic to read it must not imply entering edit
   mode. Today they are the same screen: with three axes the card hides none, so `Edit fields` is the
   only way into a topic, and the read view *is* the editor (`dashboard-detail.png`, 1148×4828 at
   1440 px). (Review note, 2026-10-01.)
2. **Toolbar controls form groups.** Not one strip of ten controls; the view switch, the window, the
   archived toggle, `Refresh` and `Add topic` should read as distinct clusters.
3. **An axis is scannable from one compact row or rail.** Secondary metadata — provenance, confidence,
   paths, people — is visually subordinate to the axis title and its state, not a fourth stacked line
   of equal weight.
4. **Overview privileges attention and change.** "What needs attention / what changed" outranks
   provenance detail on the first screen.
5. **Nothing disappears.** No functionality or provenance semantics may be lost — secondary material may
   move behind disclosure. Hiding a fact from the default view is allowed; deleting it is not.
6. **People, Repositories and Progress share one visual grammar.** They should read as three views of
   one thing, not three mini-apps.

## Measured starting point

Useful as a before/after baseline, all reproducible from the two datasets:

- the toolbar row carries **10 controls** side by side;
- each axis block stacks **four small-text lines** (title, path · branch, current state, blocker) at
  equal weight;
- axis rows use roughly the **left half** of a full-width card, leaving the right half empty at both
  1440 px and 1280 px;
- the topic card's state strip (`1 blocked  1 active  1 draft …`) restates what the axis rows below
  already say;
- the detail view is the editor, so the densest screenshot in the pack is also the one that cannot show
  read mode.

## Definition of done

- The page harness passes on **both** datasets, at **both** viewports:
  `docs/corpus/` → 36 · 0 · 7 and `docs/layout-fixtures/` → 43 · 0 · 0, at 1440×900 **and** 1280×800.
- Reading a topic is possible without entering edit mode.
- `bun run check` stays green (store logic is not expected to change).
- Screenshots in the pack are re-captured from the same two datasets, so the "after" images are
  comparable with the "before" ones.

## Non-goals

- **No mobile/responsive requirement.** 1280×800 is the narrow end; there is no phone target.
- **Do not touch the data.** No hand-typed demo rows, no edits to `docs/corpus/` or the fixture to make
  a layout look better. If a layout genuinely cannot hold a state, say so — that is a finding, not a
  fixture bug.
- **Do not weaken the checks to pass.** Add checks if the rework introduces new invariants; deleting or
  relaxing one needs a reason in the PR.
