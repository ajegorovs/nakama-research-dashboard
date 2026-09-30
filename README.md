# Research dashboard — Nakama plugin

A dashboard page plus agent tools over **shared coordination state** — topics, development axes and
the evidence attached to them — for a self-hosted Nakama instance. One page (the overview, with the
editing surface underneath it), eight actions of which **five are agent tools**, one skill,
org-scoped SQLite storage.

This repository is the **source of truth** for the plugin. The Nakama server tree is not vendored
here: `vendor/` holds the recipe that puts the plugin into a checkout, because Nakama's bundled
("official") loader only sees plugins that live inside the server's own tree.

> **Reviewing this?** Start with `docs/PLATFORM-CONTEXT.md` (how the plugin fits into Nakama's
> platform model, the constraints that shape any rework, current state, known issues, and an explicit
> *not-verified* list) and `docs/OPEN-QUESTIONS.md` (the five areas we want your judgement on: UI
> layout, extra functionality, multi-user, service delivery, updates). This README covers build,
> layout, loading it into Nakama, and a per-file review table.
>
> Everything needed to build is in here: `bun run check` is the whole build and test story — no
> network access, private registry or credentials required.
>
> **The V2 rework this review triggered is planned in [`docs/V2-PLAN.md`](docs/V2-PLAN.md)** — chunked
> work packages with acceptance tests, the platform facts that changed three points of the proposal,
> and the open decisions. **Progress: C0–C5 are done** — migration 002 applied and verified on a live
> instance, the store rewritten around the new model (rollback, version-conflict and cross-process
> contention tests), the action surface rebuilt as **five exposed agent tools** over one atomic write
> path, the **overview** now the default screen (one card per topic, axes grouped under it in
> attention order, an activity window that is a query parameter), and the **topic detail** now carrying
> the depth: every axis with its full metadata and per-claim confidence, its own history and notes
> expanding inside it, an evidence line in words beside each inferred claim, and the correction form
> that refuses a stale write in place instead of overwriting it (`bun run check` → 68 pass).
> What the agent side actually does is checked against the
> platform, not the manifest: `GET /v1/tools` lists exactly the five tool rows, and a live three-turn
> run used all five (`find_tools` → `get_overview`; `find_tools` → `search_dashboard` ∥ `get_topic` →
> `reconcile_topic`; `find_tools` → `get_topic` → `search_dashboard` → `record_activity`) with both
> writes landing and attributed. Note the discovery cost is **per turn**, not per surface: plugin tools
> are loaded by `find_tools` for one user request at a time, and one search returns the whole
> five-tool group. The review itself is kept verbatim at
> [`docs/reviews/2026-09-30-v2-structural-redesign.md`](docs/reviews/2026-09-30-v2-structural-redesign.md).
>
> **Answered 2026-09-30** — the delta review is closed:
> [`docs/reviews/2026-09-30-v2-plan-answer.md`](docs/reviews/2026-09-30-v2-plan-answer.md). Five
> decisions landed (three confidence columns; `axis_repositories` replacing the single repo FK; topic
> states `active/paused/completed/archived`; five exposed tools instead of eight; copy the V1 data), and
> one of our claims was corrected — the platform *does* validate `inputSchema` at runtime. The last
> open item (real topic names in a public repo) was resolved the same day: every example — docs, test
> fixtures and the screenshots — now uses neutral data.
>
> **Answered again after C3** — the two questions the C3 handoff left open
> ([`docs/reviews/2026-09-30-c4-c8-answers.md`](docs/reviews/2026-09-30-c4-c8-answers.md)): a manual
> status change carries an **optional** note (D8, C8's work), and the overview presents **axes grouped
> under topics** with `blocked → active → draft → parked → completed → abandoned` ordering (D9, which
> shaped C4). Neither needed a schema change. D8's note landed early, in C5: a manual status change
> takes an optional rationale, and that note is itself the evidence a `confirmed` claim can rest on.

## Current look

The page as it renders today (a seeded demo dataset, not real group data):

| ![overview on load](docs/screenshots/dashboard.png) | ![a topic card expanded](docs/screenshots/dashboard-detail.png) | ![command palette route](docs/screenshots/navigation.png) |
|---|---|---|
| `dashboard.png` — the overview: one card per topic, axes grouped under it in attention order (blocked first), people, state counts, repo/branch/PR line, blocker and a recent-activity summary. The window control is the only query-level control. | `dashboard-detail.png` — a topic expanded: the whole detail in one `get_topic` call — description and approved summary, counts, corrections/notes kept apart from the activity log, and every axis with its full metadata, per-claim confidence, evidence line and its own history and notes behind `History (n)` | `navigation.png` — how a member reaches it: command palette → Plugins → Research (no sidebar entry in v0.4.31) |

## Why not published to npm

Third-party Nakama plugins install **only** from the public npm registry at an exact version — local
paths, Git URLs, private registries and archive uploads are rejected (`plugin-service.ts` pins the
registry host and checks the tarball URL). The supported way to run an unpublished plugin is the
*bundled* path: a package under `<server>/packages/plugins/<id>` plus an entry in the
`OFFICIAL_PLUGINS` allowlist. That is what `vendor/` does, and it is also the shape a custom image
would ship.

## Build and test on any machine

Needs only [Bun](https://bun.sh). No checkout of Nakama, no dependencies: every `@nakama/*` and
`react` import in `src/` is **type-only**, so nothing is resolved at build time.

```bash
bun run check      # build (actions/actions.js, ui/app.js) + store tests
bun run build      # build only
bun test src       # tests only — the store is testable without a host
```

`actions/` and `ui/` are **committed on purpose**: the manifest points at them and a reviewer should be
able to read what the server actually executes. To confirm they match `src/`, run `bun run build` and
check that `git status` is clean — a non-empty diff means the committed bundles are stale.

## Layout

```
nakama.plugin.json      manifest: actions, skill, migration, UI entry, schemas
migrations/             SQL applied to the organization's plugin database generation
src/store.ts            bun:sqlite data access (topics, axes, repositories, people, activities, annotations)
src/actions.ts          the action surface: five agent tools + page/admin actions, no transaction logic
src/ui.tsx              the single plugin page: the overview (C4) with the editing surface underneath
src/store.test.ts       store tests (migrations applied, no host)
src/actions.test.ts     action + manifest tests (result shapes, provenance, schema allowlist)
skills/research-coordinator/SKILL.md   what the agent is told about this plugin
actions/, ui/           build output — never edited by hand
vendor/                 allowlist.patch + vendor-into-nakama.sh + in-tree package.json
```

## Loading it into Nakama

```bash
git clone <nakama-checkout> && cd nakama
/path/to/this/repo/vendor/vendor-into-nakama.sh "$PWD"
bun install
bun run apps/server/src/index.ts        # or build an image with the plugin in place
```

The script copies the plugin to `packages/plugins/research-dashboard`, swaps in the in-tree
`package.json` (which keeps the `workspace:*` devDependencies of a workspace member), and applies
`vendor/allowlist.patch` — a one-line addition to `OFFICIAL_PLUGINS`, verified to apply cleanly to a
pristine upstream checkout. It is idempotent: re-running it will not duplicate the allowlist entry.

On a running instance (platform admin + org admin):

1. `GET /v1/plugins/official` — `research-dashboard` should be listed.
2. `POST /v1/plugins/official/research-dashboard/install`
3. `POST /v1/plugins/research-dashboard/enable` — creates the organization data store.
4. Open it from the dashboard's command palette (`Ctrl/Cmd+K` → "Plugins"). In the build this was
   developed against, plugin pages are **not** in the sidebar.
5. After a rebuild: `POST /v1/plugins/official/research-dashboard/reinstall`, which snapshots the new
   bytes as an immutable `+dev.<digest>` release for that organization only, keeping its data.

## What a reviewer should look at

| File | Question |
|---|---|
| `src/actions.ts` | Does every action validate its input, and does a caller-fixable failure come back as `{ok:false,error}` rather than a thrown error? |
| `src/store.ts` | Are all queries scoped to the organization's database handle, and are identifiers parameterised? |
| `nakama.plugin.json` | Are the action schemas tight enough to reject junk (enums, lengths, required fields)? |
| `skills/research-coordinator/SKILL.md` | Does it draw the line between recorded facts and interpretations? |
| `migrations/001-research.sql` | Additive and idempotent? Migrations are forward-only — the host refuses downgrades. |

## Result contract

Actions return `{ok: true, ...}`, or `{ok: false, error}` when the caller can fix the input (unknown
project, empty field). Nothing user-fixable is thrown: an error thrown from plugin code reaches the
caller as `{"error":"An unexpected server error occurred."}`, and schema violations are rejected
earlier by the host as `{"error":"invalid_input"}` (HTTP 400).

## Tool naming

Agent tool names replace the hyphen in the plugin id with an underscore —
`plugin_research_dashboard__get_overview`, not `plugin_research-dashboard__…` as the upstream docs
imply from `plugin_<id>__<key>`. Quote the underscore form in skills and prompts.

## Scope

Deliberately thin: the coordination tables (`topics`, `development_axes`, repositories, people, link
tables, `activities`, `annotations`), five agent tools over one atomic write path, one page. The
page's V2 overview (C4) and its editing surface are in; provenance marking in the UI (C8), topic
detail (C5), people/repository views (C6), the optimistic-concurrency round-trip (C7) and
GitHub/repository automation (C11) are **not** — see `docs/V2-PLAN.md`. `topics.summary` is the only
place an interpretation lives, and it is meant to be human-approved.
