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

## Where the instances live — discover before concluding anything is missing

The instances are **not** part of this repository, and they are not necessarily on the machine you are running on.
They are a separate services estate, historically a mount outside every checkout, supervised by four units:

| Unit | Role | Port |
| --- | --- | --- |
| `nakama-dev-instance.service` | corpus API | `4399` |
| `nakama-review-web.service` | corpus review web (Vite) | `3003` |
| `nakama-fixture-instance.service` | fixture API | `4400` |
| `nakama-fixture-web.service` | fixture review web (Vite) | `3005` |

The estate's historical locations — **verify each against the current host before use**:

- services tree: `/mnt/otrais/services` (env files under `compose/nakama/`, corpus `.env`, fixture `.env.fixture`)
- data roots: `/mnt/otrais/data/nakama-dev` (corpus) and `/mnt/otrais/data/nakama-fixture` (fixture)
- vendor target: the Nakama checkout the estate's units run from (`NAKAMA_CHECKOUT`, historically `/mnt/otrais/repos/nakama`)

Every path and unit name above is **historical**. The estate is local-only by design (it carries no remote), so it
can live on a different machine than the one running this task — and the login name, mount path and even the units
can differ from host to host. A search that looked only under the current `$HOME` or inside this repo therefore
proves nothing. Establish which case holds before you touch anything:

1. **Mount unavailable.** The estate path is configured (a `.mount`/automount unit, an `/etc/fstab` entry) but its
   backing device or share is not attached, so the path is empty or absent. The configuration exists; only the
   mount is down. Fix the mount — do not rebuild.
2. **Configured here but stopped.** The units exist and point at an on-disk estate, but nothing is listening.
   Nothing is missing; start/restart the units — do not rebuild.
3. **Absent on this host.** No unit, no mount configuration, no estate tree, no backing device. Only then is the
   estate missing *here* — and even then it may still exist on the host the work was originally done on, so report
   "absent on this host", never "the infrastructure does not exist".

Probe all three: `ls` the estate root and its `compose/`, `data/` and `repos/` children; `systemctl --user
list-unit-files` **and** `systemctl list-unit-files` for the four units; `findmnt` and `/etc/fstab` for a mount;
and `ss -ltnp` for the four ports. **A port with nothing listening only says a service is stopped — never that its
configuration is gone.** Until discovery is complete, do not start, restart, seed, wipe, vendor or reinstall
anything; if the estate is genuinely absent here, reconstructing a fresh instance needs explicit authorization.

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
       bun harness/reinstall-plugin.mjs --env-file <instance env file> --org-id <org id>
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
9. **`src/ui.tsx` holds the whole stylesheet in a template literal: a backtick inside a CSS comment ends the
   CSS.** Writing a value as `` `flex: 0 1 15rem` `` in a comment inside that block closes the string, and the
   break surfaces as `tsc` errors pointing at the *CSS* line (`An identifier or keyword cannot immediately
   follow a numeric literal`) — nowhere near the comment that caused it. Quote values with plain words or
   single quotes in that block; never backticks. Related: the patch tool's LSP read of the same region reports
   TypeScript errors for perfectly valid CSS, because it parses the text as code. `bun run typecheck` is the
   authority — it is the only thing that has caught the real breakage, and only it can clear the false one.
10. **`pkill -f <pattern>` kills the shell that runs it, when the pattern appears in its own command line.** The
   preview server is stopped with `pkill -f harness/preview/run.mjs`, and the command doing the stopping
   *contains that string*, so the shell matches itself and dies with SIGTERM — quietly enough that the rest of
   the chain (captures, guards, the commit) never runs, while the process list looks clean and the log looks
   unchanged. Use a bracketed pattern that cannot match its own text (`pkill -f "[h]arness/preview/run.mjs"`),
   or kill by port/PID, and check `git log`/`git status` after any command that both kills and commits.
11. **Remote discovery: an SSH config alias and a tailnet peer listing do not by themselves locate the
   estate.** When case 3 ("absent on this host") holds and you look for the estate on another machine, probe
   read-only and non-destructively — `ssh -o BatchMode=yes -o ConnectTimeout=5 <target> exit`, with no
   host-key bypass — and treat each candidate's answer as a separate layer. Two traps seen in practice: the
   only alias in `~/.ssh/config` pointed at a **non-Linux** host (a Windows box with no WSL and no mapped
   drives, so a `/mnt/...` estate cannot live there), and the tailnet peer that *did* authenticate used a
   **nonstandard login name**, not the local one, so "Permission denied" on the obvious username proves
   nothing. Enumerate a small set of plausible users and platforms, stop as soon as the estate path and its
   units are confirmed present *and* running, and record the outcome as procedure — never host names, tailnet
   addresses or usernames in a public record, and never read a private key or print a secret to get there.

## Verification

- `bun run check` green, and `typecheck:host` green when host types changed.
- The guard reports OK, naming the release and the sha256 that match your fresh build.
- `git status` shows the rebuilt output staged with the source change.

## Fresh local estate — the fallback when the estate is absent on this host

Only when discovery finds **case 3** (no mount, no units, no estate tree) *and* the work is authorized to
rebuild locally. This runs the API from a checkout with `NAKAMA_CONFIG_DIR` + `DATABASE_URL` pointed at a
per-instance root **outside the public repo**, and the review web from the checkout's `apps/web`. Keep the
live credentials in that instance's env file (mode 600) — never in this repo, a transcript or a commit.

```bash
# API (one instance per dataset; separate config dir AND database file)
NAKAMA_HOST=127.0.0.1 NAKAMA_PORT=4399 \
NAKAMA_CONFIG_DIR=<estate>/corpus/config DATABASE_URL=file:<estate>/corpus/data/nakama.sqlite \
NAKAMA_SEED_ADMIN_EMAIL=… NAKAMA_SEED_ADMIN_NAME=Admin NAKAMA_SEED_ADMIN_PASSWORD=… \
  bun run apps/server/src/index.ts
# web (its own shell, pointed at that API; NAKAMA_SERVER_URL selects the /v1 proxy target)
cd apps/web && NAKAMA_SERVER_URL=http://127.0.0.1:4399 bun run vite --host 127.0.0.1 --port 3003
```

`DATABASE_URL=file:<abs path>` resolves to that path (the adapter accepts `file:` + absolute). The seed runs
once, when the database has no human user — a `NAKAMA_SEED_ADMIN_*` set on one boot and missing on the next is
fine, but a *partial* set throws.

### Pitfalls specific to the local fallback

12. **Start the two API instances sequentially.** Two Nakama servers started in the same second share one
    `~/.pm2`; the later one blocked before `listen` with no log line while the first took the port. Start one,
    wait for its port to answer, then start the other.
13. **Never `pkill -f <pattern>` when the pattern is in your own command line.** Stopping a dev server with
    `pkill -f 'preview.vite.config'` kills the calling shell *and* the target (both matched) — pitfall 10's
    trap is not preview-only. Kill by pid file, or a bracketed pattern (`[h]arness/...`).
14. **The served-build guard resolves Chromium from the old `chrome-linux/` layout** while the browser cache
    carries `chromium-<rev>/chrome-linux64/`. A symlink `chrome-linux -> chrome-linux64` under the cached
    revision (and the headless-shell equivalent) makes it work with no code change — `harness/chromium.mjs`
    already handles `chrome-linux64`; the guard's private resolver predates it.
15. **The guard needs `NAKAMA_DASHBOARD`, not the API port.** Its default is the API URL, which answers a page
    route with "Authentication required"; set `NAKAMA_DASHBOARD` to the web origin (the env file does).
    And `NAKAMA_BUILD_FILE` is process-wide: if a diagnostic exported it, `unset` it or later guards compare
    against the wrong file.
16. **Vendor into the checkout the units actually run from.** Vendoring is additive (a plugin tree plus a
    one-line allowlist patch) and leaves another process's `apps/web` generated files alone — but record the
    checkout's `git status` before and after so the change is visible and reversible.
17. **Any text edit inside the bundle changes the served sha256 — finish every `src/` edit before you reinstall
    and before you take records.** The stylesheet and its comments are bundled into `ui/app.js`, so a *comment-only*
    change (even an attribution fix) mints a new digest, and the release, guard and every record move with it.
    Sequence: all `src/` edits → `bun run build` → vendor → reinstall → guard → take the records. A record batch
    started before the last `src/` edit measured a superseded build and must be re-taken, not kept — an in-flight
    batch is not saved by the launcher's exit code (a killed batch reports 143, not green).
