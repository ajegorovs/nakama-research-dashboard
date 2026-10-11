# reviewer-corrections — bounded browser regression for the production-port review findings

A deterministic browser harness that proves the four required corrections (R1–R4) and the secondary
snapshot qualification (S1) of the independent production-port review
(`docs/reviews/2026-10-10-dashboard-production-port-review.md`). It is **local preview** evidence, not a
served acceptance record, and it makes **no** research write.

## What it asserts

| Finding | Assertion |
|---|---|
| R1 | A scoped plan's rendered number equals its **stored** `position`: `1..4` → `1.,2.,3.,4.`, a stored `0` → `0.`, a `null` → no number. Checked on the Workstream plan and a Task plan. |
| R2 | Under mixed states (open + blocked + resolved) the **Project card** open-task count equals the **Progress rail** open count, and blocked is counted separately. |
| R3 | The person/repository activity feed is **identity-safe**: on a scope change the offset and page reset, so A(12)@offset 10 → B(2)@offset 0 → back to A@offset 0. |
| R4 | Scoped reads commit only for the **newest** request: A-slow/B-fast keeps B; offset-5-slow/offset-10-fast keeps offset 10; a stale **failure** does not raise an error over the newer read. |

Both viewports (1280×800 and 1440×900) are exercised for R1/R2; R3/R4 run at 1280×800. Captures are written
to `shots/` and a machine-readable result to `result.json`.

## Running it

Needs Bun, `playwright-core` (`bun install`) and a Chromium — and the **local preview**, which mounts the
plugin bundle through the host's own runtime and therefore needs a Nakama checkout (the host's packages are
not published). No served instance, no database, no credentials.

```bash
bun install
bun harness/reviewer-corrections/build-fixture.mjs                     # derive the fixture from the corpus fixture
bun harness/preview/run.mjs --dataset corpus --no-fixtures \
  --fixtures harness/reviewer-corrections/fixtures-corrections.json --keep   # start the preview (port 3010)
PREVIEW_URL=http://127.0.0.1:3010/preview.html bun run harness:corrections  # run the assertions
```

The derived fixture (`build-fixture.mjs`) injects only the labelled synthetic edge states each finding needs
— a plan with stored positions `1,2,3,4,0,null`; one axis with open/blocked/resolved tasks and three task
pages; a second person with a mapped account and a 12- / 2-event `list_activity` array — and leaves the
corpus rows otherwise intact. It writes `fixtures-corrections.json`, which is **generated, never committed**.

## Before / after (red → green)

The same script runs against the pre-fix and post-fix bundle. `defix.mjs` re-introduces each defect in
`src/ui.tsx` (saving a byte-exact copy first) so the "before" run can be reproduced:

```bash
bun harness/reviewer-corrections/defix.mjs before   # re-introduce the four defects
bun run build                                        # build the pre-fix bundle
PREVIEW_URL=http://127.0.0.1:3010/preview.html bun run harness:corrections   # expect FAILs
bun harness/reviewer-corrections/defix.mjs after     # restore the fixed source, byte-exact
bun run build                                        # build the fixed bundle
PREVIEW_URL=http://127.0.0.1:3010/preview.html bun run harness:corrections   # expect all PASS
```

The pre-fix run fails R1 (numbers off by one), R2 (open count includes blocked), R3 (scope switch retains
offset 10) and R4 (all three races) — the reviewer's defects, reproduced. The post-fix run passes all checks.

## The preview seam

The preview host (`harness/preview/preview-main.tsx`) exposes two **opt-in** hooks the harness uses to force
response order — both unset in a normal preview, so ordinary previews are unaffected:

- `window.__previewDelay = (action, bag) => ms` — delay a matched call;
- `window.__previewFail = (action, bag) => message` — reject a matched call after any delay.

They live at the responder seam for the same reason `__previewCalls` does: the served host has no such hook.

## S1 (store, not browser)

S1 is a store-level snapshot-boundary fix, covered by `src/store-taskpage-snapshot.test.ts` in `bun test src`
— not by this browser harness.
