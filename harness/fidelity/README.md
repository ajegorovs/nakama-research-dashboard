# Fidelity tooling

Three read-only instruments for the question *"does the running UI reproduce the approved prototypes?"*.
They produced `docs/ux-v2/fidelity/` (evidence) and the verdict in `REVIEW.md`.

| script | what it answers |
|---|---|
| `capture-current.mjs` | **Capture the running UI for the montage, or refuse.** Proves the capture before writing it: the page URL answers as a page, the plugin asset the browser fetched answers 200 and is hashed (this is where the served revision/version come from), and each view carries the durable markers the acceptance pass reads. Fails closed — exit 3 with the target untouched — and resolves the shared credential helper itself. |
| `served-build.mjs` | **Which build is this URL serving?** Logs in on the dashboard origin, opens the plugin page, and reports structural markers that distinguish builds (page title class, removed controls, Activity-cap attributes, tag count, card count). Point it at any origin: the persistent review UI, an acceptance instance, or a deployed one. |
| `render-prototypes.mjs` | Renders the approved prototypes (`docs/ux-v2/contract/prototypes/*.html`) at a given viewport, viewport-clipped and full-page, so the comparison uses the same browser and the same width as the app captures. |
| `montage.mjs` | Builds labelled side-by-side montages — prototype above, running UI below, with the served build string in the caption — for each view, including the prototype's `overview.html` against the app's default landing. `--current-label` / `--current-note` override the bottom caption, which is how the preview montage names itself without a served URL. |

The browser is resolved by `harness/chromium.mjs`: `$CHROMIUM_EXECUTABLE`, else the Playwright cache (whatever
revision is present — the directory name is not assumed), else a system chromium. Nothing downloads and no
user path is hardcoded.

## Running them

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /mnt/otrais/repos/nakama-research-dashboard

# 1. capture the running UI (refuses rather than writing a capture it cannot prove), 2. render the
#    prototypes at the same viewport, 3. build the montages. Credentials come from --env-file; the
#    capture resolves harness/env-file.mjs itself.
bun harness/fidelity/capture-current.mjs \
  --env-file /mnt/otrais/services/compose/nakama/.env \
  --url http://<box>.<tailnet>.ts.net:3003 --viewport 1440x900 \
  --out docs/ux-v2/fidelity/current-1440x900
bun harness/fidelity/render-prototypes.mjs --dir docs/ux-v2/contract/prototypes \
  --out docs/ux-v2/fidelity/prototype-1440x900 --viewport 1440x900
bun harness/fidelity/montage.mjs --fidelity docs/ux-v2/fidelity \
  --out docs/ux-v2/fidelity/side-by-side --build "<version the capture printed>"

# which build is that URL serving (markers, not assumptions)
bun harness/fidelity/served-build.mjs \
  --env-file /mnt/otrais/services/compose/nakama/.env \
  --url http://<box>.<tailnet>.ts.net:3003 --viewport 1440x900
```

**Before trusting any app screenshot**, refresh what the review instance serves —
`bun harness/install-plugin.mjs --reinstall` — because plugins are installed into the instance's config dir
and are *not* read from the checkout (see the estate `services/nakama/README.md`, "Refreshing what the review
UI serves"). A screenshot of a stale build is a screenshot of nothing.

The marker list in `served-build.mjs` is deliberately structural rather than cosmetic: it names things a build
gained or lost (a control that was removed, a page title class that was added, an Activity cap attribute), so
"which build is this" has an answer that does not depend on the reader's memory of a screenshot.

## Without an instance: the preview montage

When there is no served instance to capture (or you are iterating on `src/ui.tsx`), the same prototype renderer
and montage build a comparison against the local **preview** instead:

```bash
bun run preview:fidelity                                  # build, serve, capture, montage → docs/ux-v2/fidelity/preview/<dataset>/
bun run preview:fidelity -- --dataset fixture --no-rebuild
```

`harness/preview/capture.mjs` does the capture (same five views, same 1440x900 clip, same scratch-then-move
discipline as `capture-current.mjs`, but no login and no instance), and `montage.mjs` is invoked with
`--current-label "PREVIEW (host runtime, no instance)"` and a caption note carrying `ui/app.js`'s sha256. The
artifact is **not** a served-UI capture and its caption says so; take the served record with `capture-current.mjs`.
