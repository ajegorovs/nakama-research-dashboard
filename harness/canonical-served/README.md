# canonical-served — an isolated served acceptance run, prepared

This directory holds the **prepared, admission-gated runner** for the canonical served acceptance
pass (`harness/verify-page.mjs`) against a **throwaway isolated Nakama instance** — the one the local
preview cannot stand in for.

## Why the preview is not this (and this is not the preview)

`harness/preview/run.mjs` mounts the plugin bundle through the host's own runtime against committed
payloads in a Vite dev server. It renders the plugin's real code and the host's real primitives, and it
is enough for the reader/focus/corrections harnesses — but it is **not** a served page:

- there is **no instance**: no `/v1/auth/login`, no session cookie, no `nakama_csrf`, no `/v1/plugins`
  route, no org, no active-org selection;
- there is **no live `get_overview` / `get_topic` / `list_activity` / `get_progress`**: the preview
  answers from a committed fixture through its own responder seam (`window.__previewCalls`), so a
  harness that reads the real action responses cannot be satisfied by it;
- the preview bundle is the **checkout's** `ui/app.js`, not an installed release snapshot.

`harness/verify-page.mjs` is the **canonical** pass: it logs in, navigates
`<dashboard>/plugins/<plugin>`, drives the real page against real action responses and asserts the
page equals the projection. **It needs a served instance.** A local preview run is *not* canonical
acceptance and must never be reported as one.

## What this runner does — and its admission boundaries

The runner provisions a **second, self-contained instance** that shares nothing with the running estate
except the host **source tree**: its own workspace, its own `NAKAMA_CONFIG_DIR` (fresh SQLite), its own
loopback port, its own generated (never printed) credentials. It never reads, writes or restarts the
live estate's instance, its protected orgs, or its store.

Each step is a **named, independently-authorized operation**. The runner performs **nothing** unless its
id is named in `--allow`. Running `--plan` (the default) prints this table and exits — it starts nothing.

| id | Operation | Touches | Cost | Authorization boundary |
|---|---|---|---|---|
| **O1** | **provision** — create the isolated workspace, mode-600 env file (locally-generated random creds, never printed), fresh config dir; refuse if the port is taken | new dirs outside the repo only | mkdir + `urandom` | none (no network, no process) |
| **O2** | **start** — launch the host server (`apps/server/src/index.ts`) under `env -i`, own port/DB, `PM2_HOME` fresh so no worker fires | a new Bun process + a new SQLite store | one server process | **boundary: starts a new instance** — needs the owner's explicit go-ahead |
| **O3** | **install** — `harness/install-plugin.mjs --env-file <new env>` (install + enable the vendored plugin) | the new instance only | install/postback | ≤ O2 |
| **O4** | **seed** — write the labelled synthetic cases (own plan / blocked task / person / repo, multi-page) through the product's own write path (`reconcile_topic`, `record_activity`) | the new instance's own org only | one write per node | **boundary: domain write** (to the throwaway instance only) — never to a retained/live target |
| **O5** | **verify** — run `harness/verify-page.mjs` with the new instance's env | read-only against the new instance + a browser | one browser pass | ≤ O4 |
| **O6** | **stop** — kill the recorded pid only (never `pkill -f`) | the new instance | — | none |

**Never authorized by this runner, under any flag:** reinstall/restart on the live estate
(`127.0.0.1:4399`); any write to the protected orgs (Layout Demo, Nakama E2E Fixture); reseeding an
existing target; commit / push / reseed / merge; production deployment. Those are separate, explicitly
scoped operations and are **out of scope** here.

## Credentials and identity

- Credentials are **generated locally** by O1 and written mode-600 to the isolated env file **outside the
  public repo**. They are never printed, never in a command line, never in a transcript. Reports
  reference the **key names** only (`NAKAMA_EMAIL` / `NAKAMA_PASSWORD`, the `nakama_csrf` cookie).
- The target organization is selected **explicitly** (`x-org-id`, or `POST /v1/auth/active-org` for the
  browser recipe); `orgs[0]` is never used.
- Every seeded node carries the literal **`[synthetics]`** label so the dataset is self-identifying and
  cannot be mistaken for real research.

## Running it (once, and only once, the boundaries are authorized)

```bash
# 1. Print the plan and the admission boundaries — starts nothing.
bun harness/canonical-served/run.mjs --plan

# 2. Provision only (files outside the repo; no process, no network).
bun harness/canonical-served/run.mjs --allow O1

# 3. Start the isolated instance (EXPLICIT owner go-ahead required for O2+).
bun harness/canonical-served/run.mjs --allow O1,O2,O3

# 4. Seed the labelled synthetic cases, then run the canonical pass.
bun harness/canonical-served/run.mjs --allow O1,O2,O3,O4,O5

# 5. Always stop what you started.
bun harness/canonical-served/run.mjs --allow O6
```

Environment overrides: `--workspace <dir>` (default `$HOME/Repos/nakama-e2e-fixture-workspace-isolated`),
`--port <n>` (default `4401`), `--host-src <dir>` (default
`$HOME/Repos/nakama-e2e-fixture-workspace/sources/nakama-host-clean`).

## Known gaps (unsupported assertions for a synthetic served run)

- `harness/verify-page.mjs`'s dataset-identity verdict only recognizes `NAKAMA_EXPECT_DATASET=corpus|fixture`
  (`harness/verify-page.mjs` §419). The synthetic served dataset has **no committed identity** to check
  against, so that verdict is **not** available for this run; the run is labelled `[synthetics]` instead.
- The `[synthetics]` fixture must carry the **four-tab shapes** the adapted `verify-page.mjs` reads
  (Dashboard summary stats, the Projects index rail, one plan with stored positions, a blocked task, a
  person with an account mapping and a multi-page activity list, a repository with scoped events). A run
  against a dataset that lacks any of these reports the corresponding check as a real FAIL, not a skip.
