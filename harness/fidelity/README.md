# Fidelity tooling

Three read-only instruments for the question *"does the running UI reproduce the approved prototypes?"*.
They produced `docs/ux-v2/fidelity/` (evidence) and the verdict in `REVIEW.md`.

| script | what it answers |
|---|---|
| `served-build.mjs` | **Which build is this URL serving?** Logs in on the dashboard origin, opens the plugin page, and reports structural markers that distinguish builds (page title class, removed controls, Activity-cap attributes, tag count, card count). Point it at any origin: the persistent review UI, an acceptance instance, or a deployed one. |
| `render-prototypes.mjs` | Renders the approved prototypes (`docs/ux-v2/contract/prototypes/*.html`) at a given viewport, viewport-clipped and full-page, so the comparison uses the same browser and the same width as the app captures. |
| `montage.mjs` | Builds labelled side-by-side montages — prototype above, running UI below, with the served build string in the caption — for each view, including the prototype's `overview.html` against the app's default landing. |

## Running them

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /mnt/otrais/repos/nakama-research-dashboard
export PROBE_ENV_HELPER=$PWD/harness/env-file.mjs          # credential loading, shared with the read pass

# 1. what is being served (markers, not assumptions)
bun harness/fidelity/served-build.mjs \
  --env-file /mnt/otrais/services/compose/nakama/.env \
  --url http://<box>.<tailnet>.ts.net:3003 --viewport 1440x900

# 2. render the prototypes at the same viewport, 3. build the montages
bun harness/fidelity/render-prototypes.mjs --dir docs/ux-v2/contract/prototypes \
  --out docs/ux-v2/fidelity/prototype-1440x900 --viewport 1440x900
bun harness/fidelity/montage.mjs --fidelity docs/ux-v2/fidelity \
  --out docs/ux-v2/fidelity/side-by-side
```

**Before trusting any app screenshot**, refresh what the review instance serves —
`bun harness/install-plugin.mjs --reinstall` — because plugins are installed into the instance's config dir
and are *not* read from the checkout (see the estate `services/nakama/README.md`, "Refreshing what the review
UI serves"). A screenshot of a stale build is a screenshot of nothing.

The marker list in `served-build.mjs` is deliberately structural rather than cosmetic: it names things a build
gained or lost (a control that was removed, a page title class that was added, an Activity cap attribute), so
"which build is this" has an answer that does not depend on the reader's memory of a screenshot.
