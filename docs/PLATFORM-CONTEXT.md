# Platform context — how this plugin fits, and what state it is in

Written for a reviewer who has the plugin but not the platform. Everything here was observed on a
self-hosted Nakama instance (upstream `ahmadrosid/nakama`, **v0.4.31**, Bun/TypeScript monorepo) on
2026-09-30 unless marked otherwise.

**Read alongside:** `OPEN-QUESTIONS.md` (the decisions you are being asked to weigh in on) and the
`README.md` (how to build and load the plugin).

---

## 1. What exists today

| Piece | State |
|---|---|
| The plugin | one dashboard page + five actions over two tables (`projects`, `activities`) + one bundled skill. Org-scoped. Works. |
| Where it runs | a **development instance** run from source on loopback (`127.0.0.1:4399`, own data root). The containerized deployment runs the stock upstream image and does **not** contain the plugin. |
| Agent side | the five actions are assigned to a profile as tools and are callable from chat; a scheduled automation has been observed driving them end to end. |
| Provider | an OpenAI-compatible endpoint (public API), tool-calling verified directly against the endpoint. |
| Data | one SQLite database per organization: `<data-root>/orgs/<org>/plugins/research-dashboard/db/<generation>.sqlite` |

## 2. The platform model (what "multi-user" means here)

| Actor | Scope | Capabilities (per upstream docs) |
|---|---|---|
| Platform admin | whole deployment | create/remove orgs, shared system resources, **all provider credentials and installation-wide defaults** |
| Org admin | one org | invite members, manage roles |
| Org member | one org | chat with profiles, use the workspace |
| Org viewer | one org | read chat history only — "no org memory, agent invoke, or mutations" |

Installation-wide vs org-scoped, per the upstream docs: provider credentials/endpoints/defaults,
web search, error tracking and bridge settings are **platform-admin-only and shared by every org**.
Profiles, sessions, org memory and Telegram/WhatsApp bridge settings are per-org.

Provisioning reality: org admins manage *people*; creating/cloning profiles and most tool/MCP/skill
provisioning is still a **platform-admin** job. An org admin can export/import a single profile pack.

**Verified in code (this matters for read-only access):**
`POST /v1/plugins/:id/actions/:key` and `GET /v1/plugins/ui/:orgId/:id/*` both call
`requireNotViewerFromContext` (`apps/server/src/http/routes/plugins.ts:625,652`). So a **viewer cannot
load the dashboard page at all** — "read-only participant" is not a supported posture for a plugin
surface today. Read access requires role = member, and the plugin itself decides what members may do.

## 3. How a plugin plugs in

- **Install path.** Third-party plugins install only from the public npm registry at an exact version;
  local paths, Git URLs, private registries and uploaded archives are rejected (the registry host is
  pinned in `plugin-service.ts`). An unpublished plugin therefore has to be **bundled**: a package at
  `<server>/packages/plugins/<id>` plus one line in the `OFFICIAL_PLUGINS` allowlist. `vendor/` in this
  repo performs exactly that.
- **Per-organization.** Install and enable are per org; each org gets its own plugin database
  *generation* and its own data directory. Nothing is shared between orgs by the plugin layer.
- **What plugin code receives** (`PluginExecutionContext`): `orgId`, `pluginId`, `pluginVersion`,
  `databasePath`, `dataDir`, `invocationId`, `actor: { id, role }`, and — for tool calls —
  `profileId`, `sessionId`, `workspaceRoot`.
- **How an action runs:** the host spawns a **child process per invocation** running
  `plugin-runner.js <built-entry>`, hands it a `{input, context}` envelope on stdin, routes
  `context.host(...)` requests back over IPC, and reads one JSON result from stdout
  (`apps/server/src/services/plugin-runner.js`). Children start with `--no-install`; dependencies must
  be bundled at build time. Consequence: one process spawn per action call, and no shared in-process
  state between calls.
- **Host operations** available to plugin code (`context.host`, sequential): `profiles`; `tools` /
  `execute_tool` with an `agentId`; `summarize` with an `agentId`, a prompt and a bag of data.
  Viewers are rejected, cross-org profiles are rejected, `summarize` has **no tools** (it is a single
  completion, not an agent turn), and Super Bot requires a platform admin.

## 4. UI contract (relevant to any layout rework)

The page is a **React module the host imports into its own React instance** (`apply(ctx)`,
`inject: ["slots", "host", ...]`). The pre-release `entryHtml`/iframe contract is gone. Available:

- exactly **one `page`** per plugin, plus optional per-action **chat tool renderers**
  (`ctx.slots.register("tool:<actionKey>", Component)`);
- `ctx.ui` — the host's component library (button, card, dialog, dropdown-menu, select, input,
  input-group, textarea, expandable-textarea, form-field, switch, spinner, popover, tooltip, toaster,
  code-block, command, calendar, matrix);
- `ctx.styles(...)` — arbitrary CSS, scoped by the host under `[data-plugin-id="<id>"]`;
- `ctx.theme`, `ctx.orgId`, `ctx.pluginId`, `ctx.signal`, `ctx.effect(setup)`;
- a `renderHeaderActions(children)` prop to place controls in the host's top navigation bar.

Not available: restyling the host shell, adding a sidebar entry (**in v0.4.31 plugin pages appear only
in the command palette** — `Ctrl/Cmd+K` → "Plugins" — despite docs describing a sidebar group), more
than one page, renderers for native or other plugins' tools, or a sandbox (these are trusted modules).
It is React inside the host's tree: internal tabs, routing, charts and any component library you bundle
are yours to choose. `docs/screenshots/` shows the page as it renders today (on load, with a project
selected, and the command-palette route that is the only way members reach it).

## 5. The agent layer

- A **profile** carries the soul/system prompt, tools, skills and model. Plugin actions become tools
  named `plugin_<id>__<key>` — note the id's hyphen becomes an **underscore**
  (`plugin_research_dashboard__list_projects`).
- Assigned plugin tools are **not** in the model's initial tool list: they contribute a compact name
  catalog to `find_tools`; a search returns up to five definitions, loaded on the next model call.
  Large action surfaces cost turns.
- **Automations are the platform's scheduler** — name + prompt + bound profile + one trigger
  (`manual` | 5-field cron + timezone | `runAt`). A run is a **full agent turn with the profile's
  tools**. Run history, optional delivery to Telegram/Discord/WhatsApp/email. Verified: an
  every-minute automation fired unattended and wrote through this plugin. Latency caveat: the worker
  polls for schedule changes every 5 minutes by default, and its startup heartbeat reports
  `scheduledJobs: 0` regardless.

## 6. Updates

- Every release is immutable. Reinstalling after new bytes mints a `+dev.<digest>` version for that org
  and keeps existing data. The organization's *selected* release is what serves requests, so
  "repo updated" and "instance updated" are independent states.
- Migrations are declared in the manifest and tracked in `_nakama_plugin_migrations`; only unapplied
  ones run, and **downgrades are refused**. Schema changes must be additive and forward-only.
- For a bundled plugin the served bytes come from the server tree, so shipping an update to a
  deployment means rebuilding the image and then reinstalling per org.

## 7. Deployment shape today

One container runs API + dashboard + workers (`ghcr.io/ahmadrosid/nakama`), restart policy
`unless-stopped`, published only on the host's tailnet address (login required), data root on a host
**bind mount** (`/mnt/otrais/data/nakama:/nakama/data`), no Docker socket, no privileged mode, no
named volumes. Because it is a bind mount, `down && up -d` preserves everything; only deleting that
directory loses state. Provider keys are stored **plaintext** in `<data-root>/config.ini`.

The dev instance used for this work runs from source instead (loopback only, separate data root,
port 4399) because the bundled-plugin path needs the server running from the checked-out tree.

## 8. Known issues, risks and unknowns

| # | Item | Evidence | Impact |
|---|---|---|---|
| 1 | Plugin pages are **not in the sidebar** in v0.4.31 | `AppSidebar` renders only `SIDEBAR_PAGE_IDS`; navigation is the command palette | discoverability |
| 2 | **Viewers cannot open the plugin page** (`requireNotViewerFromContext`) | route code, both action and UI endpoints | no read-only audience; needs member role |
| 3 | The plugin performs **no role checks of its own** | `src/` never reads `context.actor` | any member can mutate; role-aware behaviour would have to be added |
| 4 | Plugin DB opened with **no WAL / busy_timeout, no explicit transactions** | `store.ts` (`new Database(path)`) | concurrent writes from parallel action child processes could hit `SQLITE_BUSY`; unquantified |
| 5 | **One child process per action call** | `plugin-runner.js` | per-call latency floor; bulk ingestion would spawn many processes |
| 6 | A thrown error from plugin code reaches callers as a **generic 500** | only `NakamaApiError`/`PluginHostError` survive | hence the `{ok:false,error}` result contract |
| 7 | **No documented way for a plugin to receive an inbound HTTP request** | `context.host` ops are a fixed allowlist; docs show no inbound route | push-style integration (webhooks) is unproven — pull via automations works |
| 8 | Schedule changes take up to the **worker poll interval (5 min)**; startup heartbeat says `scheduledJobs: 0` | worker code + observed heartbeat | confusing during setup |
| 9 | **Global default provider cannot be switched** via API/UI | a new provider is default only if first; else edit `config.ini` | operational wart for multi-provider setups |
| 10 | Committed build output can go **stale** vs `src/` | `actions/`, `ui/` are committed | reviewer may read correct source while the server runs old code; `bun run check` + clean `git status` detects it |
| 11 | The plugin exists in **four places** (repo, in-tree dev copy, the org's selected release, the org's materialized skill row) | measured during this work | drift risk; see `OPEN-QUESTIONS.md` §5 |

**Not verified / not tested** (do not treat as working): inbound HTTP or webhook surface for plugins;
behaviour with many concurrent users; any per-user data model (none exists — the plugin stores
org-shared rows, though `actor.id` is available); migration behaviour on a *downgrade* path beyond the
host's refusal; plugin workers as an alternative runtime for this plugin; anything about running this
on a platform version other than v0.4.31.
