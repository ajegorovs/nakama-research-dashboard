# Contributor instructions

## Scope and current product

This public repository is the Nakama research-dashboard plugin, not the service estate or an
ingestion pipeline. The product is four views: Projects, Progress, People, Repositories.
Display Project → Workstream → Task; storage remains topic/axis/problem. Rework/hardening is
closed; UI restyling is separate. Development acceptance is not production readiness.

Read `README.md`, `docs/design/` and `docs/DEVELOPMENT.md`. `docs/ux-v2/DECISIONS.md` is the
current policy summary, not a chronological work queue. Historical specs, handoffs and review
correspondence are retired to Git history; `docs/README.md` pins the recovery baseline.

## Source and output

- `src/ui.tsx`: components, stylesheet and composition.
- `src/actions.ts`, `src/store.ts`: action boundary and persistence/read models.
- `nakama.plugin.json`, `migrations/`: host contract. Every migration must be declared.
- `ui/app.js`, `actions/actions.js`: committed generated installation outputs; never hand-edit.
- `skills/`: shipped coordinator guidance. `.agents/skills/`: contributor procedures, not shipped.
- `harness/`: preview, install and verification tools; optional campaigns are not product prerequisites.
- `prototypes/dashboard-ui-rework/`: separate frozen-data trial, not the served product contract.

Use Bun only, pinned by `bun.lock`: `bun install`, then `bun run check`. Run
`bun run typecheck:host` against the compatible host as well; compilation alone is not type
verification. `bun run harness:records` checks public hygiene. See the development guide for
preview and served loops. Do not commit/push/merge, mutate fixtures, deploy or restart without
the corresponding owner instruction. Preserve unrelated dirty work and research data.

## Build and served identity

A served change travels check → vendor → reinstall → guard. Target the checkout the running
instance actually uses. Treat API URL, browser web origin, env file and organization as one
explicit parameter set; inherited environment values can silently redirect a helper.
Name the org and profile explicitly. Never select `orgs[0]` on a multi-org account.
Capability assignment and remote writes require exact-target readback.

The served-build guard measures the asset the browser fetches, not vendored bytes or the
reinstall's own output. If old bytes remain, a separately authorized restart may be needed;
re-check before recording. Identity comprises digest release folder, instance revision and raw
asset SHA. Hash bytes, not decoded string length. Revisions are instance-local.

Do not blindly source compose environment files: a defined PATH can erase the toolchain.
Do not pipe a gate into a command that hides its exit status. Back up SQLite with WAL-safe
methods before an authorized update. Do not reseed retained research as an install shortcut.

## Evidence discipline

Measure instance-state claims freshly; distinguish source/design, preview and served results.
Report dataset, viewport and measured build. Independent agent summaries are not evidence.
Never hide SQLite lock failures with sleeps to manufacture green results; record the lost run.

The acceptance procedure governs verdict exits (0/1 replace the record; aborted/refused 2/3 do
not), dataset classification, superseded transcript recovery and write-pass re-seeding. Existing
screenshots/transcripts measure their own builds. Do not claim complete or production coverage
from bounded development checks. Match verification scope to the actual change.

## Public-record hygiene

Public artifacts carry labels, not live personal or machine identities. Loopback URLs remain;
identity-shaped hosts become `http://<box>.<tailnet>.ts.net` with scheme/port/path retained.
Redact non-loopback literal addresses, private `.ts.net`, `.local`, `.internal`, `.lan` hosts
and `os.hostname()`; `.home` is not treated as private. Public hosts remain unchanged.
Credential values never belong in source, transcripts or commit messages; refer to key names.

Fix redaction at the emitter using `harness/redact.mjs`, not only in recorded files.
`bun run harness:records` asserts behavior and scans the public tree. Published history is not
rewritten to repair a leak; any such rewrite requires a separate explicit decision.

## Keyboard and visual verification

Every control has one shared indicator achieving settled contrast ≥3:1 against its surface.
Measure real Tab presses, not programmatic focus. Wait on the focused element's animations,
not blanket sleeps; transition colors can produce misleading intermediate readings.
Assert control-class coverage, report unreached instances, and require a CSS-removal negative
control to go red. Overflow containers enter the Tab order only while overflowing. Judge
reachability against the intended host scroller, not merely window bounds.

## Minimal documentation and retention

Keep current specs, data/API semantics, developer instructions and essential dataset provenance.
Carry unique applicable requirements forward before retiring an old document. Do not accumulate
handoffs, correspondence, authorization envelopes, campaign reports or per-unit diaries on the tip.
Recover history using the baseline in `docs/README.md`; do not recreate an archive directory.
Important limitations belong in the current contract or developer guide.

Keep source, tests, migrations, installation bundles, used datasets and current prototype inputs.
Screenshots are temporarily retained for upcoming UI work. Frozen HTML prototypes and
`prototypes/dashboard-ui-rework/data.json` must not be overwritten during documentary cleanup.
Generated montages, wrappers, write-pass shots and iteration packs are ignored, not committed.
A seemingly historical JSON/template may be a test input; trace its consumer before deletion.

No force-push of main; no moving, deleting or force-pushing tags. Commits, when authorized, are
imperative and evidence-bearing. New baselines get new annotated tag names.

## Contributor procedures and scratch

Read the relevant `.agents/skills/` procedure before served changes, acceptance, focus or hygiene
work. Update lessons there rather than forking the generic global plugin-development skill.
Project-local skills shadow same-named global skills; avoid collisions. This repo authors its
own procedures and needs no vendored-skill lock file. Hermes project trust is a one-time
operator setup from the repo root (`hermes skills trust "$(git rev-parse --show-toplevel)"`).

Scratch belongs in `.hermes/scratch/`, never directly under `.hermes/`; the directory is ignored.
Docs must be interpretable from a clone, without the author's machine. Estate compose files,
credentials, service docs and agendas stay outside this repo and are not published with it.
