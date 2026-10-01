# U10 corpus coverage — the provenance rule, two derived seeds, and one finding

> **Ruled on (reviewer, 2026-10-02): option (a)** — remove `?? axesModeProblems[0]` in Axes mode; no central
> Problem card when an axis has zero open problems; resolved Problems stay reachable in the Problems subview;
> **do not** alter the corpus seeds or reduce the remaining truthful skips. Fixed and re-measured: corpus
> **84 · 0 · 22**, fixture **107 · 0 · 0** (both viewports), release `0.2.0+dev.5a98360ab6cc`.

**Date:** 2026-10-02 · **Chunk:** U10 (fixtures and harness robustness) · **Runner:** harness/read-pass.sh

## What was asked

Approved: proceed with the minimal corpus coverage pass under the hierarchy — (1) prefer corpus-derived
facts already in the replay material; (2) else an explicitly owner-authored row, labelled in the corpus
documentation; (3) else leave the check skipped, keeping the reason. "Do not optimize for `0 skips`."

## What was done

**§4a — every event's repository, derived (rung 1).** All 694 events come from one public repository's
history and their own `sourceUrl` names it; `record_activity` has always accepted `repositoryFullName` and
the replay never passed it. The replayer now derives it (`694 event(s) take their repository from their own
sourceUrl`). No new row, no invented field.

**§4b — three problems, derived from the corpus's own unmerged pull requests (rung 1 + one labelled
inference).** #70 and #68 are OPEN in the PR's own status; #48 is closed-unmerged, read as `resolved` by
**explicit inference** (`stateConfidence: inferred`) — the corpus's own documented habit for axis states.
Statement = the PR's own subject line, axis = the axis this corpus already assigned that PR, repository =
the PR's own. Merged PRs are finished work and were not seeded. The three events are re-recorded through
`reconcile_topic`'s `activities[]` (the only path with `problemId`), so each event remains ONE row:
`derived 3 problem(s) from this corpus's own unmerged pull requests, and 3 event(s) now name theirs.`

## Evidence

| dataset | before this pass | after §4a | after §4b |
|---|---|---|---|
| corpus (both viewports) | 73 · 0 · 33 | 74 · 0 · 32 | **83 · 1 · 22** |
| fixture (both viewports) | 107 · 0 · 0 | unchanged | unchanged |

§4a flipped exactly one check (the Activity-column repository tag) with no other change. §4b made ten more
skips execute — and one of them fails.

## The finding (needs a ruling)

`selecting another axis moves the Problem and Activity columns to that axis` fails on an axis with a
**resolved** problem and no open one: the column says `data-rd-progress-problem-open="0"`, its heading reads
`Open problems (0)`, and it renders a problem card anyway. `src/ui.tsx` Axes mode:
`axesModeProblems.filter((row) => row.state === "open")[0] ?? axesModeProblems[0] ?? null` — the `all[0]`
fallback arrived with the accepted step-6 inversion and was unexercisable until a dataset had a
resolved-problem-only axis. The accepted rule is "the projection's first **open** problem, under the
projection's own count", so the check encodes the rule; the page deviates. **Left unfixed** — the page is
product design, this pass is data/harness work.

- (a) drop the `?? axesModeProblems[0]` fallback → restores the rule, the record goes green;
- (b) keep the fallback → the check must expect a resolved problem for a resolved-only axis, and the heading
  must stop saying `Open problems`.

## What stays skipped

22 skips, 13 causes, all **rung 3** (left with reasons): one repository (7), no bare problem (3), no plan
(3), all axes carry evidence (2), no blocked axis (2), topic leads with all 3 axes (1), one topic (1), no
resolved problem *on the active axis* (1), every person mapped (1), no exceptional-state subject (1). Each
would require the corpus to state something it does not; none was seeded. Table in `U10-harness.md` §4.

## Also fixed during this pass

`set -euo pipefail` in `read-pass.sh` aborted before the new scratch-copy step when the runner exited 1
(a pass WITH FAILURES), so a **red run left the previous green transcript in place**. A failing verdict is a
verdict and must be recorded: the runner pipeline now runs under `set +e`. Caught by the record's mtime not
moving while the run printed `1 FAILED`.

## State

Page untouched (`src/ui.tsx` and the served build are U4's, `ui/app.js`
`aa3a478c39ca045d7e96`); fixtures and their record unaffected.
