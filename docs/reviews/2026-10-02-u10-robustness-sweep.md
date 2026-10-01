# U10 robustness sweep — positional subjects, mixed instances, flakiness

**Date:** 2026-10-02 · **Chunk:** U10 · **Files:** `harness/verify-page.mjs` (only)

Reviewer's target: *"the remaining U10 robustness list rather than further product changes — especially any
outstanding positional-subject assumptions, mixed-instance assumptions, or latent harness flakiness."*
**No product change came out of this pass.**

## Procedure (repeatable)

| grep | hits | finding |
|---|---|---|
| `\[0\]` | 42 on 33 lines | all classified: the projection's own order is the product rule; the sites that once assumed "whatever renders first" already select by property (two comments say *"not `axes[0]`"*) |
| `\[0\]\.` (unguarded dereference) | **1** | inside `if (closedOut.length > 0)` — the crash class from §1 is exhausted |
| `Layout fixture\|ajegorovs\|UDV\|fixture/` | 3 | only the identity guard's own lines — no check hardcodes a dataset's names, counts or ids |
| `.every(` / `.some(` | all | each audited for a companion count/length assertion; **one lacked it** (below) |

## Changes

1. **Non-vacuity** — the axis-state check `unrendered.length === 0` would have passed on a payload with no axes
   at all; it is now `CORPUS.axes.length > 0 && unrendered.length === 0`.
2. **Condition waits instead of fixed sleeps** — a new `settleUntil(predicate, arg, capMs)` helper
   (`waitForFunction` + one-frame settle, `.catch()` so a never-true condition fails as the check's own failure,
   not a runner timeout). Converted the four sleeps that gated a *state* read: post-`Read topic` axis rows,
   `Edit fields` editor appears, `Done editing` editor gone, post-window-change render. 49 sleeps remain after
   interactions where the checks read their own subjects.

## Evidence

Three consecutive runs per dataset, on separate instances:

| | run 0 | run 1 | run 2 | verdict sequence |
|---|---|---|---|---|
| corpus | 84 · 0 · 22 | 84 · 0 · 22 | 84 · 0 · 22 | md5 `56d284c3` ×3 |
| fixture | 107 · 0 · 0 | 107 · 0 · 0 | 107 · 0 · 0 | md5 `49e7652b` ×3 |

Full-transcript diffs between runs: the `# generated:` timestamp line only. Post-change re-runs: **identical
records** (same counts, same details).

## Open detail (not chased)

`Recent: N events` on the topic card is the projection's `entry.activityCount` over a wall-clock window
(`activitySinceDays`, default 14). It stepped **587 → 586** once (between two runs 2.7 min apart) and has held
at 586 since; recomputing a 14-day window over the transcript's `occurredAt` values gives 563 at both anchors,
so the step is real and its arithmetic is unexplained — stated as such rather than given an invented cause.
Consequence: **a corpus record taken on a different day may differ by a small count in that one line.** Byte-
stability across days would need a seeded clock or a stable window anchor — a projection decision.
