# Preview — see the real page without an instance

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

To capture the preview and build a montage against the approved prototypes, in one command:

```bash
bun run preview:fidelity                          # build, serve, capture, montage (corpus)
bun run preview:fidelity -- --dataset fixture     # the fixture dataset
bun run preview:fidelity -- --dataset scale       # the oversized dataset
bun run preview:fidelity -- --no-rebuild --full   # skip the build; also write full-page PNGs
```

The capture route works against any of the three datasets: point it at a running preview with
`bun harness/preview/capture.mjs --url http://127.0.0.1:3012/preview.html --out <dir>`, which writes the
five-view screenshots wherever `--out` says — useful for the scale dataset without landing new artifacts in
the committed `docs/ux-v2/fidelity/preview/` tree.

Artifacts land in `docs/ux-v2/fidelity/preview/<dataset>/` in the same `prototype-1440x900/ · current-1440x900/ ·
side-by-side/` shape the committed fixture pack uses, so the corpus and fixture previews sit beside each
other. The montage step is handed these freshly rendered prototypes with `--prototype-dir`, so the pack does
not carry its own copy of them; the `side-by-side/` output and the per-pack prototype renders are git-ignored
generated artifacts (only the canonical `docs/ux-v2/fidelity/prototype-1440x900/` and `current-1440x900/` are
tracked). To capture against an already-running preview on another port:
`bun run preview:capture -- --url http://127.0.0.1:3011/preview.html`.

The capture does not photograph each view's default row — it *selects a representative*: the repository
whose detail draws the most work, then the Progress axis whose index row carries the most open problems and,
within it, the problem with the most support (repository threads, evidence, steering, the plan step it sits
on). That is an **instrument step, not the app's behaviour**: the page still opens every view on the
projection's own first row, and `bun harness/preview/capture.mjs --no-select` photographs exactly that
default. Selection exists because the first row is not always the composition worth comparing — the
fixture's Repositories view opens on `fixture/0-bare-repository`, which no topic and no axis names, and the
corpus's Progress view opens on a completed axis with no open problem. The capture prints what it selected
and, where the dataset carries a populated subject, refuses to write unless that populated detail is what
ended up on screen.

The page is **five peer tabs** — Overview, Topics, People, Repositories, Progress — with Overview the
default, and the capture clicks each tab's own control and refuses unless the page reports that same tab
active (`aria-pressed="true"`). Overview is the only tab whose data is scoped by a window; its selector
lives in its own heading, so the capture also checks that Overview renders a single pressed window option
inside `[data-rd-view-heading="overview"]` and that a non-Overview tab carries none.

The browser is resolved by `harness/chromium.mjs` (env `CHROMIUM_EXECUTABLE` → the Playwright cache, whatever
revision is present → a system chromium), so nothing downloads and no user path is hardcoded.

## Generated files in the checkout, and cleanup

Running the preview writes **six** files into the checkout's `apps/web/` (`preview.html`, `preview-main.tsx`,
`preview.css`, `preview-fixtures.json`, `preview-plugin.ts`, `preview.vite.config.ts`) — plus a seventh,
`preview-identity.json`, only when a caller passes `--run-token` (the full-text-clamp check does, so it can
prove the responder on a reused port is its own child). `run.mjs` tracks what
it writes in `.preview-generated.json` and, by default, removes exactly what it created when it exits (SIGINT
and SIGTERM included). Two safety rules:

- a file that **existed and differs** from what the preview would write is treated as yours: it is backed up
  and **restored**, never deleted;
- a file identical to what the preview writes is reclaimed as the harness's own leftover (this is how the
  files older preview runs left behind get cleaned up).

`--keep` leaves everything in place for inspection; a stale manifest from a crashed run is recovered on the
next start. The manifest and any `.preview-bak` files are removed on cleanup too.

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

## What was measured when this was built

On 2026-10-03, on a bare clone, with the checkout above at `v0.4.31`:

- `bun run check` green (126 pass / 0 fail), and `ui/app.js` rebuilt **byte-identical** to the committed one
  — so the preview renders exactly the bundle the repo commits.
- `corpus` → `1 topic · 3 axes · 1 person · 1 repository`, topic `UDV Echo Process`; the committed corpus
  transcript records the same fixture identity (`axes:3, people:1, repositories:1`), and its
  `windowEvents: 30` is the *capped* timeline (3 axes × the 10-per-axis limit) against the landing's
  uncapped `422 events`.
- `fixture` → `2 topics · 7 axes · 2 people · 3 repositories`, one blocked. The committed fixture transcript's
  `axes: 6` is its **first topic's** axis count (6 + 1 = 7), so the two agree. Its `FIXTURE` array declares
  **2** repositories (`layout-fixture-calls.mjs --check` prints that declared count); the third,
  `fixture/0-bare-repository`, is named only by an activity in the transcript, so the store derives it and the
  page shows 3. Declared and rendered are different numbers for the same dataset, and both are correct.
- The page opens on **Overview**, the default peer tab. The capture finds all five tabs
  (`data-rd-view-option`); each clicked tab reported itself active (`aria-pressed="true"`); Overview shows
  the landing aggregation in both columns and its window selector (7 / 14 / 30 / all time, 14 days pressed)
  inside its own heading (`[data-rd-view-heading="overview"]`); and the other four tabs read all time and
  render no window selector. No tab renders an "archived" toggle — it was removed. This supersedes the
  earlier "default landing, no view pressed" measurement: Overview is a selected tab, not an unselected
  shell landing.
- **Progress is populated on both datasets** (measured on the same 2026-10-03 checkout): `corpus` → 3
  problems, 2 open / 1 resolved, each on its own repository and event, derived from its own unmerged pull
  requests; `fixture` → Fixture E's 3 problems (one on a plan step on two repositories with a person, two
  events and a steering note; one with no step, no repository and no artifact; one closed out) above two
  plans. `bun harness/preview/test-fixtures.mjs` asserts this for every window and passes.
- **The capture selects a representative row per view, not the default** (same checkout): for `corpus` it
  photographs `ajegorovs/udv-echo-process` and the `Signal analysis` axis carrying its two open problems
  (the default is the completed `Acquisition` axis, with no open problem); for `fixture` it photographs
  `fixture/crowded-card` (the default is the bare repository) and Fixture E's problem on `Fixture step 2`,
  with repository threads, evidence and steering on screen. `--no-select` still produces the defaults, which
  is what keeps the selection an instrument and not a change to the page.

## Preview vs prototype, one command

`harness/preview/fidelity.mjs` (one command: `bun run preview:fidelity`) starts the preview, screenshots it
across all five views at 1440x900 via `capture.mjs`, renders the approved prototypes at the same viewport with
the existing `harness/fidelity/render-prototypes.mjs`, and builds the labelled montages with
`harness/fidelity/montage.mjs`. The montage caption says **PREVIEW (host runtime, no instance)** and carries
`ui/app.js`'s sha256 — never a served URL — so the artifact cannot be mistaken for a served-UI capture.

Boundaries, restated for the montage: it compares *composition and styling*, not the served page; it is only
as current as `ui/app.js` at capture time (the printed sha256 is the record); and it does not exercise writes
or the light/dark theme switch. The datasets' derived problem/plan rows (Fixture E, and the corpus's own
unmerged-PR problems — see above) are present in the payloads the capture mounts.
