# Research dashboard — Nakama plugin

A dashboard page plus agent tools over **shared project + activity state** for a self-hosted Nakama
instance. One page (project list + detail), five actions, one skill, org-scoped SQLite storage.

This repository is the **source of truth** for the plugin. The Nakama server tree is not vendored
here: `vendor/` holds the recipe that puts the plugin into a checkout, because Nakama's bundled
("official") loader only sees plugins that live inside the server's own tree.

> **Reviewing this?** Start with `docs/PLATFORM-CONTEXT.md` (how the plugin fits into Nakama's
> platform model, the constraints that shape any rework, current state, known issues, and an explicit
> *not-verified* list) and `docs/OPEN-QUESTIONS.md` (the five areas we want your judgement on: UI
> layout, extra functionality, multi-user, service delivery, updates). This README covers build,
> layout, loading it into Nakama, and a per-file review table.
>
> The repository is **private**: request collaborator access rather than expecting an anonymous clone.
> Everything needed to build is in here — `bun run check` is the whole build and test story.

## Current look

The page as it renders today (a seeded demo dataset, not real group data):

| ![page on load](docs/screenshots/dashboard.png) | ![project selected](docs/screenshots/dashboard-detail.png) | ![command palette route](docs/screenshots/navigation.png) |
|---|---|---|
| `dashboard.png` — the page on load: project list, empty detail pane | `dashboard-detail.png` — a project selected: status control, description, approved summary, activity feed, record-activity form | `navigation.png` — how a member reaches it: command palette → Plugins → Research (no sidebar entry in v0.4.31) |

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
src/store.ts            bun:sqlite data access (projects, activities)
src/actions.ts          one entry for every action; dispatch on context.actionKey
src/ui.tsx              the single plugin page (list + detail)
src/store.test.ts       store tests (temp-file SQLite, no host)
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
`plugin_research_dashboard__list_projects`, not `plugin_research-dashboard__…` as the upstream docs
imply from `plugin_<id>__<key>`. Quote the underscore form in skills and prompts.

## Scope

Deliberately thin: two tables (`projects`, `activities`), five actions, one page. Blockers, people,
review items and GitHub event ingestion are **not** implemented. `projects.summary` is the only place
an interpretation lives, and it is meant to be human-approved.
