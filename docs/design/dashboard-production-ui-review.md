# Dashboard production UI port — external review brief

**Status: review handoff — not an acceptance record.** This brief asks an external human reviewer for an
explicit verdict and states what the evidence does and does not cover. It records **no verdict of its own**.

> **Update 2026-10-10 — verdict received: CHANGES REQUIRED.** The external review returned *changes required*
> with findings R1–R4 (+ S1). All five are implemented in `src/ui.tsx` / `src/store.ts`, with a bounded browser
> regression (`harness/reviewer-corrections/`) and a snapshot-boundary store test. A **revised, separately
> versioned** review packet accompanies the corrections. The verdict is kept verbatim, and the correction
> status is tracked, in
> [`docs/reviews/2026-10-10-dashboard-production-port-review.md`](../reviews/2026-10-10-dashboard-production-port-review.md).
> **Sequencing:** the revised packet is to be **re-reviewed before any canonical served acceptance**; the
> canonical served harness (four-tab `harness/verify-page.mjs`) and a full focus matrix remain **outstanding**
> and are not run automatically here. The served release is still rev 41 — the corrected code is a local
> bundle only.

The port renders the accepted information-architecture rework — **Projects · Progress · People · Repositories**
— into the shipped plugin. Read it together with
[`dashboard-production-ui-port.md`](dashboard-production-ui-port.md) (the requirement→component→test checklist and
the measured served checkpoint), [`dashboard-information-architecture-pivot.md`](dashboard-information-architecture-pivot.md)
(the authoritative current agreement), [`dashboard-data-and-maintenance-contract.md`](dashboard-data-and-maintenance-contract.md)
and [`dashboard-minimal-implementation-design.md`](dashboard-minimal-implementation-design.md).

## What is under review

The production port of the accepted prototype, as shipped: `src/ui.tsx` and `src/store.ts` (rendering + scoped
reads), the read actions in `src/actions.ts`, migration `006-task-plan-text.sql`, and the generated bundles
`ui/app.js` and `actions/actions.js`. Review is against the **rendered product** at 1280×800 and 1440×900, with
the source and tests available for the code-level claims.

## Requested decision

Return **one** explicit verdict:

- **accepted** — the port may proceed to the served acceptance phase (the canonical read pass on an isolated
  instance), or
- **changes required** — listing, per item, the dataset/view it was seen at and the smallest change that resolves
  it.

Preview approval (where given) is not final acceptance; the canonical served read pass has not been run, so a
verdict here is a judgement over the evidence in this packet, not over a served transcript.

## Scope and boundaries

- **In scope:** the four views; their navigation and back/history; scoped plans (project / workstream / task);
  backend pagination and honest ranges; honest empty states; participants and supporting-repository rows; the two
  local CSS corrections recorded below.
- **Untouched by this packet:** `prototypes/dashboard-ui-rework/**` and its frozen `data.json`; the committed
  canonical acceptance records; the estate; the harness's committed gate set.
- **Packaging only:** no source was changed to build this packet, and nothing was committed, pushed, tagged,
  merged, deployed or restarted. No live instance was driven for the packet. All private evidence was derived from
  earlier read-only served measurements and from local-preview fixtures — no raw logs, credentials, private IDs,
  machine paths or identity-shaped endpoints are reproduced in the textual files here.
- **Screenshots are real page captures.** They are captures of the plugin's own UI, which renders no browser
  chrome and therefore no address bar. Real served captures contain the target dataset's **research content**,
  including participant names that are inherent parts of the stored product data; that is project content, not
  machine identity, and it is **not** altered or redacted in an image. No screenshot was regenerated for this
  packet.

## Evidence matrix

| Evidence class | Label | What it establishes | Bundle / dataset |
|---|---|---|---|
| Real served, current | **SERVED rev 41** | The live target org's Progress view with the corrected scoped-plan rows; byte-verified served asset == local build | `0.2.0+dev.a9393d4c4443` (rev 41) on the served target org |
| Real served, prior | **SERVED rev 33** | The four views' rendered product (Projects, People, Repositories shown here) and the pre-fix Progress plan rows, taken before the two later CSS corrections | `0.2.0+dev.1c1215321cd3` (rev 33) on the served target org |
| Local synthetic | **LOCAL SYNTHETIC** | Render paths the served dataset lacks: task-owned plan, person note, long full text, and independent backend pagination at offsets 0/5/10/15 | local preview, `synthetic-closure` fixture |
| Local pre-fix | **LOCAL PRE-FIX** | The two CSS defects reproduced and corrected in an isolated preview (before/after) | local preview; bundles predate one or both later corrections |

### Build identity (the builds these captures measured)

| Build | Release / revision | `ui/app.js` sha256 (bytes) |
|---|---|---|
| Current served + current local bundle | `0.2.0+dev.a9393d4c4443` / rev 41 | `f941e189c1185d8952b2c60c8ff56966f17ed5345721623468aca2850a389314` (151975) |
| Prior served (sibling captures) | `0.2.0+dev.1c1215321cd3` / rev 33 | `13bbc000d036a685f5f2f4c446df269360efa6fa50f61e9331ef50a158b84f7b` (150948) |

`actions/actions.js` sha256 `fc8dfed4643deccdc76d7160f5329d53b1fd0a8cf07d49731aebe4205f34bf03` and
`nakama.plugin.json` sha256 `1b56809404342a944df83c4cee7b724b962d1ef04fddb4bc1c4c7e6984eceed3` are identical across
both releases. Migration set `001–006` is unchanged and the served database generation did not move across either
refresh. The only persistent change measured on the served target was its **release binding** (rev 25→33→41);
full-row snapshots of the target and of the two protected stores were byte-identical before and after.

## Screenshot provenance

Every capture is labelled by **class / release / dataset / viewport**. Full per-file provenance is in the packet's
evidence manifest; in summary:

- **SERVED rev 33** — Projects, People and Repositories at 1280×800 and 1440×900, plus the pre-fix Progress
  workstream plan. These are the *unaffected siblings* of the scoped-plan CSS fix: they were not regenerated at
  rev 41.
- **SERVED rev 41** — the Progress view replaced with the corrected plan rows (1280×800 and 1440×900), the
  whole-context frame, and the corrected below-the-fold plan.
- **LOCAL SYNTHETIC** — project plan, task-owned plan, long full text, person note and pager views from the
  labelled local fixture; these are **not** the served build.
- **LOCAL PRE-FIX** — before/after plan-step rows and before/after side-rail overflow from isolated preview runs.

The two CSS corrections the port carries are **local** (preview-verified, not part of a served run in this
packet's scope):
1. a scoped **scoped-plan step row** rule (`.rd-plan-step` …) keeping a step number on its title's first line; and
2. a **side-rail `min-width: 0`** chain letting a long rail tag truncate on its own ellipsis instead of pushing the
   detail grid past the viewport.
Both are additive and scoped; both have a negative-control regression assertion in the private evidence.

## Known coverage gaps (carried to the review — stated, not implied)

1. **No canonical served transcript.** The served read pass (`harness/verify-page.mjs` under `read-pass.sh`) is
   still Overview-coupled and has not been adapted to the four-tab contract, so the served captures are a bounded
   read-only checkpoint, not the canonical acceptance record. The harness rewrite is parked, not done.
2. **Keyboard focus sampled, not the full matrix.** The served drive settled **12** real-`Tab` samples across
   controls, not the full H1 focus-class matrix.
3. **Person-note and task-owned-plan paths have no real-data coverage** on the served dataset; they are exercised
   only by the labelled local synthetic fixture.
4. **People/Repositories activity placement.** People and Repositories render `Recent activity` in a right-hand
   rail; Projects renders it in a foot disclosure. The current agreement does not fix a placement for
   person/repository activity, so this is an **open owner decision — a recommendation retained, not ratified**; no
   source change was made for it.

## Offline inspection route

1. Read this brief and `dashboard-production-ui-port.md`.
2. Open `images/` — start with `served-rev41/` (current served), then `served-rev33/` (the four views), then the
   `synthetic-local/` and `local-*` classes for the coverage gaps.
3. Trace any rendered claim to the checklist row and to the test that asserts it (`source/src/*.test.ts`).
4. Check the bundles and manifest in `source/` against the identity table above.
