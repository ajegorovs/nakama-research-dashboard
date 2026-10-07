# U11 — merge readiness

**Date:** 2026-10-02 · **Chunk:** U11 (reviewer-directed: *estate wiring, exact-build verification, final clean
acceptance, documentation reconciliation, merge-plan execution*) · **Branch:** `ux-v2` · **Default branch:**
`main`

This chunk adds **no product code**. It answers one question — *does the evidence point at the exact commit we
are about to merge?* — and then performs the merge.

## 1. Estate wiring: what "deployed" means for this plugin

Checked first, because the answer is not the obvious one.

| Thing | What it is | Does it serve this plugin? |
|---|---|---|
| `nakama` container, `100.x:4310` | the **vendor's** Nakama test instance (`ghcr.io/ahmadrosid/nakama:latest`), deployed 2026-09-25 to read its design; data root `/mnt/<estate>/data/nakama` | **No.** Its data root has `agent/ orgs/ sqlite/ runtime/ config.ini` and **no plugin records at all** — the research dashboard was never installed there |
| `/mnt/<estate>/data/nakama-dev` | the dev instance's data root; `plugins/research-dashboard/` holds releases from 2026-09-30/10-01 (`0.1.0+dev.*`) | It *would*, but **no dev instance is running** right now; the releases present are pre-v2 builds |
| `/mnt/<estate>/repos/nakama/packages/plugins/research-dashboard/` | the **vendored artifact** in the Nakama checkout — the source of the bundled "official-style" plugin the server loads | **Yes** — this is what a dev instance loads, and what the isolated acceptance instances install from |
| isolated instances `:4500` (corpus) / `:4400` (fixture) | the two acceptance instances, own data roots, own web dev servers | **Yes** — these produced every record in this repo |

So the honest statement is: **there is no always-on estate service serving this plugin.** The served copies are
the vendored artifact plus the acceptance instances; the estate's always-on Nakama is the vendor's instance and
never carried it. Any claim of the form "the deployed instance runs build X" has to name which of those four it
means — this section exists so that no future reader has to guess.

## 2. Exact-build identity

The plugin's release digest is computed over the manifest's folders (`actions`, `migrations`, `ui`, `skills`) —
never `src/` or `harness/` — so those are the files that decide what is served.

| Check | Result |
|---|---|
| every file in the four digest folders, candidate build vs vendored checkout | **byte-identical** — `actions` 1 file, `migrations` 4, `ui` 1, `skills` 1, **0 differing** |
| `ui/app.js` (candidate build = vendored) | `sha256 7f97ce64c530ab80128f…` |
| `actions/actions.js` (candidate = vendored) | `sha256 4e5a8be3b91b40d5ff…` |
| `nakama.plugin.json` (candidate = vendored) | `sha256 f3e483117037b9b889…` |
| served `ui/app.js`, both instances, web route | `c80ada07b81f13e6164a` — **identical on corpus and fixture** |
| served `ui/app.js`, both instances, Nakama route | `ca730ec7fc2b7edb7277` — **identical on corpus and fixture** |
| served-bundle identifiers, both instances | `version 0.2.0 · revision 4 · lifecycleState enabled` (read through `install-plugin.mjs`, whose already-installed path only reports state) |
| vendoring is idempotent | a second `vendor-into-nakama.sh` run leaves the tree hash unchanged (`8753d4215306bddd`) |
| nothing stale in the vendored tree | files present *only* in the vendored copy: **none**. The vendor step drops the tooling (`harness/*.mjs`, `bun.lock`, `tsconfig.json`, `types/host.d.ts`); it rewrites `package.json` into the plugin package manifest on purpose (`@nakama/plugin-research-dashboard` + the `files` allowlist) |

Two facts worth stating plainly:

- **A fresh install publishes the packaged version (`0.2.0`), not a `+dev.<digest>` release.** The bytes are the
  tree's bytes — which is why the digest-folder identity above is the claim that matters — but a pass run
  against a *fresh install* quotes `version 0.2.0, revision 4`, while a `reinstall` after a rebuild mints the
  `+dev.<digest>` release. `harness/reinstall-plugin.mjs` is the tool for the second case, and it refuses to
  silently measure the previous release when the vendored bytes are unchanged.
- The served bytes are **not** byte-identical to the source file: each serving route wraps the asset
  (web route, Nakama route). What matters, and what is verified, is that **the two datasets' instances serve the
  same bytes as each other** on each route, and that the source of those bytes is byte-identical to the
  candidate build.

## 3. The merge diff, inspected

`git diff --stat origin/main..ux-v2` = **88 files, +23237 −510**. Inspected by class, not skimmed:

| Top dir | Files | Notes |
|---|---|---|
| `docs/` | 62 | the contract verbatim, `ux-v2/` chunk docs, `reviews/`, the two dataset records, re-captured screenshots |
| `harness/` | 10 | the pass, the replayer, the applier, the installers, the host typecheck |
| `src/` | 6 | `store.ts`, `ui.tsx`, `actions.ts` + three test files |
| build/config | 6 | `ui/app.js`, `actions/actions.js`, `nakama.plugin.json`, `package.json`, `tsconfig.json`, `bun.lock` |
| other | 4 | `migrations/004`, `skills/research-coordinator/SKILL.md`, `types/host.d.ts`, `README.md` |

- **No unrelated files**: no `.env*`, no `node_modules`, no logs/tmp, no absolute home paths anywhere in the
  tree (`grep` for one finds nothing), and the repo's `.gitignore` covers the three generated classes.
- **No stale generated artifact**: after `bun run check` (which builds) the worktree is **clean** — the
  committed `ui/app.js` and `actions/actions.js` are exactly what the merged sources produce.
- The two dataset records are regenerated by the final pass (§4) and the screenshots re-published by the same
  run, so every generated artifact in the diff corresponds to the candidate build.

## 4. Final acceptance from the exact candidate

Both datasets were **re-seeded from scratch** first (the corpus by replaying its own 695-call transcript — the
run hit the documented `429` backoff once and finished 695/695 in 66.1 s — and the fixture by one application of
`apply-layout-fixture.mjs`), so the records come from a freshly seeded store, not from a long-lived one.

| Dataset | Viewports | Record |
|---|---|---|
| corpus | 1440×900, 1280×800 | **84 pass · 0 fail · 22 skip** |
| fixture | 1440×900, 1280×800 | **107 pass · 0 fail · 0 skip** |

## 5. Clean-clone reproduction (the reviewer's U0-lesson check)

*Not because the local evidence was weak, but because a green local tree can still be measuring the wrong
thing.* A fresh clone of the candidate was used to reproduce the whole chain, with the clone's own scripts:

| Step | Result |
|---|---|
| `git clone --branch ux-v2` → `<commit>` | `aa1c27e96d12`, worktree clean |
| `bun install --frozen-lockfile` | 10 packages |
| `bun run check` | **126 pass · 0 fail · 764 expect()** |
| `vendor/vendor-into-nakama.sh` from the clone | vendored tree unchanged (`8753d4215306bddd`) — the clone's build *is* the served build |
| fresh corpus instance → install (clone's installer) → seed (clone's replay) → pass ×2 viewports | **84 · 0 · 22**, exit 0 both |
| fresh fixture instance → install → seed (clone's applier) → pass ×2 viewports | **107 · 0 · 0**, exit 0 both |
| served bytes, clone-seeded instances | identical to §2 (`c80ada07b81f13e6164a` / `ca730ec7fc2b7edb7277`) |

**The verdict sequences are identical to the committed records**, not merely the totals:

| | reproduction | committed record |
|---|---|---|
| corpus (both viewports) | `56d284c3d9` | `56d284c3d9` |
| fixture (both viewports) | `49e7652baa` | `49e7652baa` |

(sequence = the ordered `PASS/FAIL/SKIP` description list; md5, first 10 hex.)

What *does* differ between a reproduction and the committed record — enumerated rather than hand-waved, because
"the same checks passed" is not the same claim as "the transcripts are identical":

- **ids** — a fresh store mints new UUIDs, so every id in a detail line differs;
- **the screenshot path** — the reproduction wrote into the clone's own `docs/` tree;
- **which axis is listed first** in a few detail lines — the axes projection is
  `ORDER BY updated_at DESC, title ASC` (`src/store.ts:1584`), i.e. it follows each axis's **last-touched
  write time**, a per-store fact rather than a fixture constant. Two seeds of the same transcript can rotate
  tied rows; the pass asserts *the projection's own order* (read live), which is why both orders pass. This
  run's single rate-limit backoff (a 24 s retry) is a plausible source of differing write timing — stated as
  the likely mechanism, not a proven one;
- **`Recent: N events`** — the known time-relative count (§4 of `docs/corpus/README.md`, README's transcript
  section).

**The reproduction also found its own recipe incomplete**, which is the kind of finding it exists for: a fresh
store has no user, and the install step failed `HTTP 401` until the instance was started with the env file's
`NAKAMA_SEED_ADMIN_*` values exported (the same mechanism first boot uses). The README's clean-instance recipe
now carries that line.

## 6. Merge path — executed

**Merged 2026-10-02.** Evidence committed first (`63e1d4c` on `ux-v2`), annotated tag `ux-v2-complete` placed at
the candidate, then `git checkout main && git merge --ff-only ux-v2` → `Updating 9b48f99..63e1d4c
Fast-forward` (90 files), pushed with the tag, and verified on the remote: the two branch refs both resolve to
`63e1d4c4fbc188451f556fba012089e5a09dc9a4`. Rollback remains one command (`git reset --hard pre-ux-v2`, or
`git push origin pre-ux-v2:main`).


- **`main` is the merge base**: `main` = `9b48f99` (PR #1), `ux-v2` is **42 commits ahead, 0 behind** → the merge
  is a **fast-forward**, so the merge commit *is* the candidate commit and no merge-only diff can appear.
- **Reference point**: the annotated tag `pre-ux-v2` already exists and dereferences to `9b48f99` (the pre-pivot
  commit) — the "before" side is tagged on both the local and the remote.
- **Plan, in order:**
  1. the evidence bundle (this file + the records + the diff inspection) committed on `ux-v2`;
  2. annotated tag `ux-v2-complete` at the candidate commit;
  3. `git checkout main && git merge --ff-only ux-v2 && git push origin main` (+ push the tag);
  4. verify `git ls-remote origin main` equals the candidate commit.
- **Rollback**: `git reset --hard pre-ux-v2` locally, or push the tag back over `main`
  (`git push origin pre-ux-v2:main`) — safe because the merge introduces no commit of its own.

## 7. Checks run for this chunk

| Check | Result |
|---|---|
| `bun run check` (typecheck · bundle · tests) | 126 pass · 0 fail · 764 expect() |
| `bun run typecheck:host` (the harness's host contract) | clean |
| `python3 scripts/doc-hygiene-check.py` (the estate tree) | 136 files, 0 violations |
| isolated acceptance, corpus | 84 · 0 · 22 (both viewports) |
| isolated acceptance, fixture | 107 · 0 · 0 (both viewports) |
| clean-clone reproduction | identical verdict sequences (§5) |

## 8. Deliberately not done

- **The 22 corpus skips stay.** Each carries its reason; there is no value in manufacturing coverage, and the
  corpus is valuable because it remains an honest public dataset rather than a second synthetic fixture.
- **`Recent: N events` stays time-relative.** A stable clock or window anchor is a projection design change,
  not merge hardening; the acceptance logic does not read the drift as a failure.
- **The pre-pivot screenshot set is kept** alongside the re-captured one, as U11's plan asked.
- **U5/U6/U8/U9 are not "pending"** — their core views shipped in U4 and what remains is refinement; the STATUS
  rows say exactly that.
