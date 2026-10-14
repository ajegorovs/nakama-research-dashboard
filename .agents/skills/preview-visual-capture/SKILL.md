---
name: preview-visual-capture
description: Capture and measure the dashboard's four views from the preview, without an instance.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [preview, screenshots, visual-baseline, four-view, measurement]
    category: software-development
    related_skills: [dashboard-build-and-serve, public-records-hygiene]
---

# Preview visual capture

How to produce a **four-view visual record** of the plugin's UI without a running Nakama instance, and how
to state findings from it as measurements rather than impressions. The instruments are
`harness/preview/four-view-capture.mjs` and `harness/preview/four-view-measure.mjs`, both documented in
`harness/preview/README.md` under "Capture boundary".

## When to Use

- Asked for screenshots / a visual baseline of Projects, Progress, People or Repositories.
- Reviewing a layout, density, wrapping or hierarchy change before it is served.
- Any claim of the form "X is clipped", "the rail hides rows", "the pager is missing" — measure it first.

## Procedure

1. **Serve one dataset at a time.** `bun harness/preview/run.mjs --dataset <fixture|scale|corpus> --port <N>`.
   There is a single shared `harness/preview/fixtures.json`, so two previews cannot run concurrently: run
   them sequentially, and never start the second before the first has exited. Poll the URL for HTTP 200
   before capturing (the first Vite boot is slow; a capture against a half-ready server photographs an
   empty page).
2. **Capture.** `bun harness/preview/four-view-capture.mjs --dataset <name> --url http://127.0.0.1:<N>/preview.html --out .hermes/scratch/ui-baseline/<name>`.
   It writes the four views at 1440×900 and 1280×800, tall same-width detail frames, the Progress extras
   (activity pager page 2, blocked, empty), and `capture-report.json`.
3. **Measure.** `bun harness/preview/four-view-measure.mjs http://127.0.0.1:<N>/preview.html` while the same
   preview is still up. This is what turns "looks clipped" into "this element, this many pixels, this cap".
4. **Read the report, not just the images.** `capture-report.json` carries each shot's `selection` and an
   overflow probe; `unreachable` lists every state the dataset could not reach *with its reason*. Quote the
   reason when reporting a boundary — never invent the state to fill the gap.
5. **Shut down cleanly and verify.** Kill the `bun harness/preview/run.mjs` PID (see pitfalls), confirm the
   port is free and no `run.mjs`/Vite process survives, then confirm the checkout's `git status` matches the
   baseline recorded before the run (the preview writes six files into the checkout's `apps/web/`; a clean
   exit removes them, a killed one may not).

## Pitfalls

1. **Kill the child, not the wrapper.** The process holding the preview is `bun harness/preview/run.mjs`;
   SIGTERM to the shell that launched it does nothing and Vite keeps serving — a subsequent "clean" run then
   measures the *old* build. Never `pkill -f harness/preview/run.mjs`: the pattern matches the killing shell
   itself.
2. **`fullPage: true` is inert here.** The host wrapper is `flex h-screen` around an inner `overflow-auto`
   scroller, so the document is exactly one viewport tall and a full-page shot returns one viewport. Reach the
   rest of a detail stack with a taller frame at the *same width*; wrapping is a function of width only, so a
   tall frame is faithful and a full-page one is not.
3. **Wait on the loaded detail, not the selection.** The selection attribute flips on click, before the read
   returns: waiting on it photographs an empty pane. Wait on the marker keyed by the selected subject's own
   value (e.g. `[data-rd-detail="<topic>"]`, `[data-rd-context-panel="<axis>"]`,
   `[data-rd-person-panel]`, `[data-rd-repository-panel]`).
4. **A view's selection is component-local state that resets when its tab unmounts.** A second pass over the
   views re-opens each tab at its default first row, so a tall frame shot afterwards carries the default row's
   content under the representative's name. Shoot each tall frame immediately after choosing the subject, and
   record the marker value actually photographed.
5. **The Progress index carries no activity count.** `data-rd-index-activity` no longer exists (the retired
   attribute the legacy harness read). "Which workstream has the most activity" can only be answered by
   loading candidates and reading their own `data-rd-progress-activity-total` — click the rows, as a reader
   would, rather than trusting an attribute that is not there.
6. **A capped index is a finding, not a bug to work around.** The rollup cap (`MAX_ROLLUP_LIMIT`) means a
   large dataset draws fewer rows than it holds. Record the rendered count and whether the page discloses the
   truncation; do not silently raise the cap or filter the dataset to hide it.
7. **An intentional ellipsis is not overflow.** Classify an overflowing element by its computed
   `text-overflow`/`white-space` before reporting it; a designed single-line clamp is reported separately.
8. **Keep routine shots in scratch.** `--out` defaults under the git-ignored `.hermes/scratch/`.
   Only under explicit owner instruction, curate a small labelled illustrative gallery for the README;
   retain its frozen public-safe fixture, actual viewport/selection and source/bundle/image hashes.
   Keep campaign packs and operational logs out of the public gallery. Illustrative preview images do
   not become served acceptance records merely by being included in the repository.
9. **A preview capture is not a served record.** Light theme, writes refused, a different mount entry. It
   supports composition, density and styling judgements; it is not production readiness, and it does not
   replace `harness/read-pass.sh`.
10. **Capture opened disclosures too.** Initial frames can hide long-name min-content expansion. Open affiliation/history disclosures, measure lane and rail rectangles plus horizontal overflow, and inspect the expanded image. Keep selection fixed between before/after shots; detail-text-length scoring can select a different person after a composition change.
11. **Use the focus instrument's preview mode for local checks.** `bun harness/focus-matrix.mjs --preview --url http://127.0.0.1:3011/preview.html --viewport 1280x800` measures real Tab focus without a served guard or login. Repeat both viewports/datasets and run `--negative-control`; label results preview-only, not served acceptance.
12. **The prototype is reference, not spec.** Compare content and behaviour against
    `docs/design/dashboard-information-architecture-pivot.md` and the frozen HTML prototype without treating
    prototype styling as mandatory.
13. **Freeze the payload for comparisons.** Generate caller-owned scratch fixtures through real actions,
    then reuse the same file with `--no-fixtures --fixtures <path>` for both builds. Record subject IDs and
    bundle hashes; regenerated IDs or newly selected subjects are not an exact before/after pair.
14. **Prove supplemental page totals against scoped reads.** A topic-wide history cap can under-report the
    axis's real total. Before using a scratch pagination supplement, compare its task/event IDs and order
    against every real scoped backend page within the supported read limits. Never clone response rows to
    manufacture coverage; declare absent populated plans or destinations as untested.
15. **Photograph the secondary content, not just its open flag.** Open a native disclosure through its
    summary, scroll the actual host port to its body/pager, and capture at the requested viewport. A top-of-
    page screenshot after clicking page two does not show page-two history below the fold.

## Verification

- `capture-report.json` exists, names the commit, the `ui/app.js` sha256, the dataset and each shot's
  selection; the PNG count matches the shot list.
- Every Progress state is either photographed or listed in `unreachable` with a reason that names why the
  dataset cannot reach it.
- The preview was stopped by PID, and the checkout's `git status` equals the pre-run baseline.
