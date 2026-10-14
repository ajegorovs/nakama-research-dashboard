# Preview — see the real page without an instance

> **Current scope (2026-10-11).** The interactive preview mounts the four-view product. For an
> instance-free record, `four-view-capture.mjs` (screenshots plus a report) and `four-view-measure.mjs`
> (geometry) capture and measure it directly — see [Capture boundary](#capture-boundary). The older
> `capture.mjs` and the `harness/fidelity/` helpers retain legacy five-tab/Overview assumptions: they are
> not adapted to the four-view product, and their montages are not current verification. Historical
> measurements near the end of this guide belong to their recorded builds.

`src/ui.tsx` is a host-injected React module: it is handed React, the component library, a stylesheet sink
and a data channel by the dashboard, and it cannot render without them. The only place it *was* renderable
was a served instance, and the plugin asset is served from the org's installed **release snapshot** — not
from the checkout tree — so every visual tweak cost `build → vendor → reinstall → guard → reload`, with a
~10 s asset lag on the end. That loop is the right loop for a *record*; it is a bad loop for looking at
type sizes.

This is the fast loop. It mounts the same built bundle (`ui/app.js`) through the host's own activation path
(`apps/web/src/lib/plugin-runtime.ts`), against the host's own components (`@nakama/ui`) and the host's own
stylesheet (the dashboard's `index.css`, so the same Tailwind build and the same design tokens), and answers
the page's action calls from a real dataset's own call transcript. No server, no database, no instance, no
credentials.

```bash
bun run preview                    # corpus dataset, http://127.0.0.1:3010/preview.html
bun run preview:fixture            # the synthetic layout fixture
bun harness/preview/run.mjs --dataset scale --port 3012   # the oversized deterministic dataset
bun harness/preview/run.mjs --checkout /path/to/nakama --port 3011 --rebuild --watch
```

Then edit `src/ui.tsx`; with `--watch` (or `bun run build:watch` in another shell) the bundle rebuilds on save
and the browser reloads itself — Vite watches `ui/app.js`, so there is no copy step. Without `--watch`, run
`bun run build` by hand.

## Capture boundary

The interactive preview mounts Projects, Progress, People and Repositories. Two instance-free instruments
cover that four-view product, both reading the page's own `data-rd-*` markers and clicking the page's own
controls, so neither knows an id, name or payload in advance:

```bash
bun harness/preview/run.mjs --dataset fixture --port 3011        # one dataset at a time
bun harness/preview/four-view-capture.mjs --dataset fixture \
  --url http://127.0.0.1:3011/preview.html --out .hermes/scratch/ui-baseline/fixture
bun harness/preview/four-view-measure.mjs http://127.0.0.1:3011/preview.html
```

`four-view-capture.mjs` writes all four views at 1440×900 and 1280×800, plus tall same-width detail frames
for the selected entity — the host wrapper is `h-screen` around an inner `overflow-auto` scroller, so
`page.screenshot({fullPage: true})` returns exactly one viewport and height is the only way to reach the
rest of a detail stack. It also writes Progress's activity-pager second page, a blocked workstream, a
workstream with nothing behind it, and a `capture-report.json` carrying the commit, the `ui/app.js` sha256,
the dataset, each shot's selection and a horizontal-overflow probe.

Two policies make it trustworthy: a state the dataset cannot reach is **recorded as unreachable with its
reason** — never fabricated, and not fatal — while a *structural* failure (the page did not mount, a tab
did not become active, a view container or the selected detail is missing) exits **3** as REFUSED, because a
photograph taken under a wrong label is worse than no photograph.

`four-view-measure.mjs` answers what a screenshot only *shows*: which element owns a clip and by how many
pixels, what caps a scroll container, whether a list rail is uniform or one row's state badge grows it,
whether the last row is sliced through, and how the two Progress pagers present themselves side by side. It
exits **2** on a fault.

Shots default to the git-ignored `.hermes/scratch/` — they are working shots — and generated captures are
not committed (AGENTS.md); the committed packs belong to the served pass. Chromium is resolved by
`harness/chromium.mjs`; no download is required.

Legacy `capture.mjs` and the `harness/fidelity/` helpers cannot run against this build (`capture.mjs` waits
on `[data-rd-landing]`, which is no longer rendered). Do not use their montages or success claims as current
verification.

## Generated files in the checkout, and cleanup

Running the preview writes **six** files into the checkout's `apps/web/` (`preview.html`, `preview-main.tsx`,
`preview.css`, `preview-fixtures.json`, `preview-plugin.ts`, `preview.vite.config.ts`). `run.mjs` tracks what
it writes in `.preview-generated.json` and, by default, removes exactly what it created when it exits (SIGINT
and SIGTERM included). Two safety rules:

- a file that **existed and differs** from what the preview would write is treated as yours: it is backed up
  and **restored**, never deleted;
- a file identical to what the preview writes is reclaimed as the harness's own leftover (this is how the
  files older preview runs left behind get cleaned up).

`--keep` leaves everything in place for inspection; a stale manifest from a crashed run is recovered on the
next start. The manifest and any `.preview-bak` files are removed on cleanup too.

### The identity endpoint (`--run-token`), and why it is not a file

When a caller passes `--run-token` (the full-text-clamp check does, so it can prove the responder on a reused
port is *its own* child), the generated `preview.vite.config.ts` captures that token — plus the boot bundle's
sha256 and byte length — **once, at config load** (that server's startup), and serves it from an in-memory
`configureServer` middleware at `/preview-identity.json`. Nothing is written to disk, the endpoint reads no
file when a request arrives, and it is served before Vite's own static middleware with `Cache-Control:
no-store`. A server therefore keeps **its own** identity even after a newer run rewrites the shared generated
files on the same webroot, so a stale or foreign responder is refused rather than measured — the property a
filesystem-served token cannot have. Absent `--run-token`, no identity endpoint is registered.

## Prerequisite

A **Nakama checkout** (`v0.4.31` is the version this plugin targets) — the host's packages are not
published, so the preview runs inside one, borrowing its React 19, `@nakama/ui`, Tailwind v4 and tokens.

```bash
git clone --depth 1 --branch v0.4.31 https://github.com/ahmadrosid/nakama.git ~/Repos/nakama
cd ~/Repos/nakama && bun install
```

Default checkout is `$NAKAMA_CHECKOUT` or `~/Repos/nakama`; `run.mjs` says which names it looked for and
exits 2 if it cannot find Vite there.

## The three datasets

Fixtures are **built, not written**: `make-fixtures.mjs` creates a database, applies the shipped migrations,
replays a dataset's own action transcript through the **real action layer** (`src/actions.ts`), then asks
that layer for the read payloads. A hand-written fixture JSON would drift from what the server answers, and
then the preview would lie about the one thing it exists to show.

Two of a dataset's states no single write can express, because a problem is named by an id the store mints:
the corpus's unmerged pull requests, the fixture's Fixture E, and the scale dataset's problem links. Each is
applied in a second pass that reads the ids back from the projection — and none is restated here.
`corpus-derivation.mjs` slices the derivation out of `harness/replay-corpus.mjs`, `fixture-e-calls.mjs`
slices `applyFixtureE` (and its constants) out of `harness/apply-layout-fixture.mjs`, and
`scale-fixture-calls.mjs` declares the oversized dataset and its own id-resolving pass. A preview that
invented its own problems would drift from the corpus the moment either changed.

| dataset | source | what it exercises |
| --- | --- | --- |
| `corpus` (default) | `docs/corpus/transcript/actions.jsonl` — the corpus's own 695-call record | the real, public corpus: what the page looks like on data nobody chose; its **three problems** derived from its own unmerged pull requests (two open, one closed-without-merging read as resolved) |
| `fixture` | the `FIXTURE` array in `harness/apply-layout-fixture.mjs` plus its `applyFixtureE`, read out of that file | the edge states: a blocked axis with a blocker sentence, an inferred state, an axis with nothing behind it, a person with no mapped account, a crowded card — and **Fixture E**: a problem on a plan step on two repositories with a person, an event, an evidence record and a steering note; a problem with none of those; a closed-out problem |
| `scale` | `harness/preview/scale-fixture-calls.mjs` — a deterministic generator, replayed through the same action layer | **oversize**: 14 topics and 62 axes and 65 problems (past the store's rollup cap of 50), labels long enough to wrap, activity piled on one axis and absent on most (the 7/14/30/all windows disagree), and empty subjects — a topic with no axes, an evidence-free axis, a repository no topic claims, a person with no mapped account, a problem with no support. A separate dataset, never merged with `fixture` |

`harness/preview/layout-fixture-calls.mjs --check` prints what it read from that file, so a change there
that breaks the read shows up as a smaller dataset instead of a silently empty one; `fixture-e-calls.mjs`
prints the Fixture E constants and function it read; `scale-fixture-calls.mjs --check` prints the oversized
dataset's declared shape. To assert the payloads themselves, run `bun harness/preview/test-fixtures.mjs`
(corpus + fixture) and `bun harness/preview/test-scale-fixture.mjs` (scale) — each builds its dataset with
the same `make-fixtures.mjs` the preview uses and checks the payloads carry the subjects they exist for.

All four windows the page offers (7 / 14 / 30 / all time) are built for real. The window is **Overview's**
only query-level control — the other four tabs read all time — and a preview where clicking "30 days" errors
is lying about the control.

## Boundaries

- **It is a preview, not the served page.** This mounts the same bundle through a different entry. Judge
  composition, density and styling here; take the record with the acceptance pass (`harness/read-pass.sh`),
  which measures what the instance actually serves.
- **Writes are refused, not simulated.** `reconcile_topic`, `record_activity` and `add_annotation` answer
  with the plugin's own error path. A preview that pretended a write landed would be lying about the one
  thing a read-only instrument cannot check — use `harness:write` for the write composition.
- **Light theme only** (the committed screenshots are light). `ctx.theme` is passed as `light`.
- **Fixture E is replayed locally** (see `fixture-e-calls.mjs`): it needs store-generated ids resolved
  between two calls, and the local action layer mints them, so the preview runs the fixture's own
  `applyFixtureE` against `src/actions.ts` and the fixture dataset shows its problem rows too. Only the
  *transport* differs from `harness/apply-layout-fixture.mjs` — the write itself is that file's.
- **`harness/` is outside the typechecked program** (`tsconfig.json` includes `src` and `types`), so nothing
  here can break `bun run check` — and nothing here is typechecked either.
- **`fixtures.json` is generated and git-ignored** (the corpus one is ~845 KB).
