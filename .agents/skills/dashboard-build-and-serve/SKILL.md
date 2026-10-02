---
name: dashboard-build-and-serve
description: Take a source change to a served Nakama instance, verified.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [nakama, build, deploy, vendor, instances, digest]
    category: software-development
    related_skills: [acceptance-pass, public-records-hygiene, keyboard-focus-pass, nakama-plugin-development]
---

# Dashboard build and serve

How a change in `src/` reaches a running instance, and how to *prove* it did. The failure this skill exists to
prevent is the expensive one: a reinstall that reports success and a new version while the instance keeps
serving the previous bundle, so the next acceptance run measures bytes that do not contain the fix.

## When to Use

- You changed `src/ui.tsx`, `src/actions.ts`, the manifest or a migration and want it served.
- A record is about to be taken, and you need to know which build will be measured.
- You are about to run `harness/reinstall-plugin.mjs`, `harness/update-plugin.mjs` or the guard.

Do not use for: reading a record (that is `acceptance-pass`), or editing docs only (no serve step needed).

## Prerequisites

- **Bun**, and a Nakama checkout to vendor into.
- The instance's env file, path taken from the estate tree (this repo does not carry it). Credentials are
  referenced by key name only: `NAKAMA_SEED_ADMIN_EMAIL` / `NAKAMA_SEED_ADMIN_PASSWORD`. Never write a value into
  a file, a transcript or a commit message.
- An exported `PATH` that still contains `bun` (`$HOME/.bun/bin`).

## Procedure

1. **Gate the tree.** `bun run check` — typecheck + build + unit tests. Completion: three greens. A build that
   compiles is not a build whose types were verified: run `bun run typecheck:host` too when the host's types are
   in play.
2. **Vendor.** `./vendor/vendor-into-nakama.sh <nakama checkout>`. Completion: the script reports the files it
   placed, and the built output in the checkout now contains your change (grep for a token you added).
3. **Reinstall, with the instance's own parameter set.** Pass the URL explicitly; the corpus env file carries no
   `NAKAMA_URL`, so a default inherits the caller's shell:

   ```bash
   env NAKAMA_URL=http://127.0.0.1:4399 \
       NAKAMA_EMAIL="$NAKAMA_SEED_ADMIN_EMAIL" NAKAMA_PASSWORD="$NAKAMA_SEED_ADMIN_PASSWORD" \
       bun harness/reinstall-plugin.mjs --env-file <instance env file>
   ```

   Completion: it prints an old → new `0.2.0+dev.<digest>` and a revision. **That print is not evidence** — it
   is the API's reply, not the bytes the browser receives.
4. **Verify with the guard.** `bun harness/served-build-guard.mjs` (with `NAKAMA_DASHBOARD` set for the
   instance; the corpus dashboard binds the tailnet address, the fixture's binds loopback). Completion: it
   reports the served `ui/app.js` sha256 and the release, and that both match this build. If it still reports the
   previous release, restart that instance's web and API units and re-check — do not conclude the change failed
   to apply, and do not record anything until the guard is green.
5. **Record the identity** you will quote: release `0.2.0+dev.<digest>`, the instance revision, and `ui/app.js`'s
   sha256 (`sha256sum ui/app.js`).

## Quick Reference

| Task | Command |
| --- | --- |
| typecheck + build + tests | `bun run check` |
| host types | `bun run typecheck:host` |
| vendor into a checkout | `./vendor/vendor-into-nakama.sh <checkout>` |
| mint a release / rebind | `bun harness/reinstall-plugin.mjs --env-file <env>` |
| migrations only | `bun harness/update-plugin.mjs --env-file <env>` |
| first install | `bun harness/install-plugin.mjs` |
| which bytes are served | `bun harness/served-build-guard.mjs` |

## Pitfalls

1. **The caller's shell decides which instance you hit.** A session that earlier sourced the *fixture* env file
   leaves `NAKAMA_URL` exported; the corpus reinstall then goes to the fixture, reports a new version, and the
   corpus keeps serving the old bundle. Always pass the URL in the same `env` invocation as the credentials.
2. **`set -a` + a sourced compose env file reframes everything it defines.** If one of them is `PATH`, `bun`
   disappears mid-command, and a pipeline (`bun … | tail -3`) hides it because the pipeline exits with `tail`'s
   status. Gates can silently skip, and a chained commit/tag still runs. Restore `PATH`, re-run the gates, then
   confirm the commit/tag actually landed.
3. **Never infer the served bytes from the reinstall output.** Only the guard speaks for what the browser
   receives.
4. **Build identity is the digest folder**, not the vendored tree — and the per-instance revision moves even when
   the bytes do not, so quote both rather than treating the revision as the build.
5. **`ui/app.js` and `actions/` are committed build output.** Rebuild, do not hand-edit; and commit the rebuilt
   output with the source change, or the repo's served bytes and its source disagree.
6. **A migration the manifest does not declare is never run.** Add it to `nakama.plugin.json` in the same commit.
7. **The instances are shared with other work.** Reinstalling is safe; wiping a data root is not — that needs the
   destructive script's explicit data root and organisation, and it is never part of this loop.
8. **A `delete`-mode store makes every action 500 under contention.** The store's constructor switches
   `journal_mode = WAL` on *every* open (each action is a fresh child process), and that switch needs an exclusive
   lock. While the host server holds the file, the switch fails **immediately** — the observed errno is
   `SQLITE_BUSY_RECOVERY`, in tens of milliseconds, because SQLite does **not** route the journal-mode switch
   through `busy_timeout` (measured: arming the timeout first changes nothing). The action dies, the API answers
   500, and the page shows "An unexpected server error occurred." Check the mode read-only
   (`PRAGMA journal_mode` — expect `wal`); if it is `delete`, ensure nothing is writing and let one ordinary open
   perform the switch, or set it out-of-band, then confirm. A `delete`-mode copy restored over a live store (or a
   data root built by a root-run restore — these are `root:root 777`) reintroduces it, which is why the fix worth
   having is that a failed mode switch must not be fatal, not a reordered pragma.

## Verification

- `bun run check` green, and `typecheck:host` green when host types changed.
- The guard reports OK, naming the release and the sha256 that match your fresh build.
- `git status` shows the rebuilt output staged with the source change.
