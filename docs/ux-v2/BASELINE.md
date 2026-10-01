# Baseline — the state v2 starts from

Measured, not remembered. Everything here is reproducible with the commands in `README.md`
§ "Run the acceptance pass".

## Commit and tag

| | |
|---|---|
| Tag | `pre-ux-v2` → `9b48f99` (the PR #1 merge commit) |
| `main` | `9b48f99` |
| v2 branch | `ux-v2` |
| Model | migrations `001-research`, `002-coordination-model`, `003-drop-legacy`; topics → development axes → activities/annotations, repositories and people as links |
| Action surface | 8 actions, **5 of them agent tools**: `get_overview`, `get_topic`, `search_dashboard`, `reconcile_topic`, `record_activity` |
| UI | one page, **four** views (Topics · People · Repositories · Progress) over one `get_overview` payload, per-view local selection, no router |

## The pass, at the baseline

The harness's own summary line, both datasets, both viewports. "Skip" is a state the dataset does not
contain, printed with its reason — never a pass.

| Dataset | Viewport | Result | Transcript |
|---|---|---|---|
| `docs/corpus/` (real, public) | 1440×900 | **all checks passed; 7 skipped** (42 pass · 0 fail) | `docs/corpus/verify-read.txt` |
| `docs/corpus/` | 1280×800 | **all checks passed; 7 skipped** | `docs/corpus/verify-read-1280x800.txt` |
| `docs/layout-fixtures/` (synthetic) | 1440×900 | **all checks passed; 0 skipped** (49 pass) | `docs/layout-fixtures/verify-fixture-read-1440x900.txt` |
| `docs/layout-fixtures/` | 1280×800 | **all checks passed; 0 skipped** | `docs/layout-fixtures/verify-fixture-read-1280x800.txt` |

The seven skips are named in `docs/corpus/README.md` § "What this corpus cannot exercise" — the blocked
state, the hidden-axis case, the evidence-free claim, the person spanning topics, the unattributable
person. They are the states the synthetic dataset exists to cover.

`bun run check` at the baseline: **82 pass · 0 fail · 472 expect()** across `src/store.test.ts`,
`src/actions.test.ts`, `src/migration.test.ts`.

## Screenshots

Two sets are kept, deliberately:

| Set | What it is | Where |
|---|---|---|
| Pre-layout-rework | What the layout review of 2026-10-01 was written against | `docs/screenshots/`, `docs/layout-fixtures/screenshots/` |
| Post-layout-rework (PR #1) | The state v2 builds on | `docs/layout-pr/after-*/`, with its transcripts in `docs/layout-pr/verify-*.txt` |

Measured density from PR #1, for comparison after the redesign: corpus topic detail **4374 px** at
1440 px width (down from 4496), fixture detail 2529 px (from 2648) — i.e. the axis compression saved
~120 px and the remaining height is the per-axis claims and the activity log, which is what U7 targets.

**Deviation, recorded on purpose:** the plan expected PR #1's captures to be promoted into the canonical
`docs/screenshots/` and `docs/layout-pr/` to disappear. They are kept as they are, because promoting now
would destroy the pre-rework set that the review was written against and v2 re-captures everything at
U11 anyway. The promotion happens at U11, against the finished v2 UI.

## Datasets

| | corpus | fixture |
|---|---|---|
| What | a real, public repository's development record | 7 layout-critical states a real repository lacks |
| Size | 1 topic · 3 axes · 694 activities · 1 person · 1 repository | 2 topics · 6 axes |
| Seeded by | replaying `docs/corpus/transcript/actions.jsonl` (695 calls, ~75 s) through the action surface | `harness/apply-layout-fixture.mjs` |
| Canonical? | **yes** — the fixture never mixes into it | no — synthetic by construction |

## What the pass could not do at the baseline

Worth knowing before the redesign is judged: the page harness needed a live instance with a dashboard
web dev server (a plugin page only exists inside the host UI), and until this chunk the harness itself
lived outside the repository, wired to one host's paths and credentials file. That is what U0 fixes —
see `STATUS.md` for the current state of that.
