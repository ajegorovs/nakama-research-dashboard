# V2 plan — coordination model (topics → development axes → evidence)

**Status:** in progress — **C0–C8 are done and verified** (decisions, migration 002, store v2, the action
surface, the overview, the topic detail, the people/repositories views, the progress view, the provenance
pass); **C9a (skill audit, only if needed) and C10 (retire the legacy tables) are next**. See the status
line at the end of each chunk.
**Input:** [`reviews/2026-09-30-v2-structural-redesign.md`](reviews/2026-09-30-v2-structural-redesign.md)
(external review of V1, kept verbatim; §16 lists its suggested sequence).
**Written:** 2026-09-30, checked against Nakama v0.4.31 and this repo at `8688a08`.
**Working assumption:** everything happens on the throwaway dev instance
(`services/nakama/scripts/run-dev-instance.sh`, `127.0.0.1:4399`). The Docker deployment and the
in-tree copy on the Nakama clone's `research-dashboard` branch are **not** touched until V2 is proven.

## 0. How to resume

1. Read §2. Three findings there change the review's plan, and one of them (`F1`) means migration 002
   as written in the review **would fail**. `F7` was corrected after review — the note under it says
   what was wrong and why.
2. §7 decisions are **resolved** (reviewer, 2026-09-30 — answers kept verbatim in
   [`reviews/2026-09-30-v2-plan-answer.md`](reviews/2026-09-30-v2-plan-answer.md)): D1 → three
   confidence columns; D2 → `axis_repositories`, the single repo FK dropped; D3 →
   `active/paused/completed/archived`; D4 → **five** exposed tools, not eight; D5 → copy the V1 data.
   **D6** is resolved too (real topic names are genericised throughout, screenshots included).
3. Work §6 in order. Each chunk is self-contained: deliverable, files, acceptance test, evidence
   command, dependencies. Do not start a chunk whose dependencies are unmet — most of the risk here
   is in the seams between chunks, not inside them. **C1–C8 are done; C9a (skill audit, only if needed)
   and C10 (retire the legacy tables) are next.**
   The gen-1 surface is gone — `src/actions.ts` is the v2 surface, `src/ui.tsx` renders the overview
   on top of it, and the shipped `research-coordinator` skill documents its five tools.
4. Reinstall on the dev instance to exercise migrations end-to-end (`plugin-smoke.sh`).
   `scratch/reinstall-002.sh` shows the shape of that call: the body needs
   `{"expectedRevision": <number>}` — the plugin detail's `revision` field is an integer, and a string
   is rejected with HTTP 400.
5. Before the first Reinstall of a chunk that changes migrations, copy the active generation file in
   `<data-root>/orgs/<org>/plugins/research-dashboard/db/` — and note that a Reinstall mints a *new*
   generation file (copy-on-write from current data), keeping the old one, so a rollback is "copy the
   retained file back over the active generation path" (see C1).

## 1. The model to lock

> **Topics are the organizational unit; development axes represent concurrent work; repositories,
> people, branches, PRs and activity are evidence/context attached to them.**

This is the one decision worth treating as settled, and it is what the rest of the plan assumes. It
survives any later change in *evidence sources* (GitHub polling, group chat, repo documents) because
those are all inputs to axes, not new hierarchy levels.

Repositories are demoted deliberately: a repo supports many topics, a topic spans many repos, and the
join table carries that without duplicating work per topic.

## 2. Checked against the code first

Everything in the review that could be verified, verified — with the evidence.

| Review claim | Verdict | Evidence (Nakama v0.4.31 / this repo \(8688a08\)) |
|---|---|---|
| V1 is `projects + activities` | ✅ | `migrations/001-research.sql` — 25 lines, 2 tables, one index |
| `ResearchStore` must be changed to set WAL + busy timeout | ✅ **and it is worse than that: no pragmas at all** | `src/store.ts:99` — `new Database(databasePath)` and nothing else: no `journal_mode`, no `busy_timeout`, no `foreign_keys`. Writes are single statements; `addActivity` writes `activities` **and** `projects.updated_at` as two statements with no transaction (`src/store.ts:205-222`) |
| Plugin tools are discovered through `find_tools`, so a large action surface is expensive | ✅ **and sharper: at most 5 tools load per call** | `packages/agent/src/tool-loop.ts:159` `.slice(0, 5)`; a repeated broad query loads the next batch and returns `remaining`. The description of `find_tools` embeds the catalog of **every** exposed action key (`tool-loop.ts:74`). All plugin tools are deferred under the plugin id (`apps/server/src/services/tool-resolver.ts:204`) |
| `exposeAsTool: false` allows UI-only actions | ✅ | `PluginActionContribution.exposeAsTool?: boolean` (`packages/core/src/plugins.ts:72`) |
| Actor identity is available for provenance | ✅ | `PluginExecutionContext.actor: { id, role }` (`packages/core/src/plugins.ts:128-135`) — the Nakama user id, exactly what `people.nakama_user_id` needs |
| Add `002`, never modify `001` | ✅ | migrations are declared per id in the manifest (`nakama.plugin.json` `database.migrations`), applied once, tracked in `_nakama_plugin_migrations`; downgrades refused |
| SQLite is fine below ten trusted users; Postgres is unnecessary | ✅ | per-org single file at `<data-root>/orgs/<org>/plugins/research-dashboard/db/<hash>.sqlite` |

### 2.1 Findings that change the plan

**F1 — `CREATE TABLE activities` collides with the table that already exists.** The review's §2
creates `activities`, and its §15 migrates the *existing* `activities` into it. On a real install,
002 fails with `table activities already exists` (`001-research.sql:16`).
→ 002 renames the V1 pair to `projects_v1` / `activities_v1` **first**, then creates the new schema,
then copies. `ALTER TABLE … RENAME TO` is plain SQLite, and the copy becomes a straight
`INSERT … SELECT`. The `_v1` tables stay readable-but-unused (as §15 intends) and are dropped by a
later migration (C10) once V2 is proven.

**F2 — V1 activity source values do not match the V2 vocabulary.** V1 (`nakama.plugin.json`, enforced
by the enum): `manual, github_pr, github_issue, commit, experiment, document`. V2:
`github_pr, github_commit, github_issue, repo_document, group_chat, experiment, manual, agent_review`.
The copy needs an explicit map (`commit`→`github_commit`, `document`→`repo_document`) or the new table
inherits both spellings forever.

**F3 — `recorded_at` has no V1 source.** V2 declares `recorded_at NOT NULL`; V1 only records
`occurred_at`. Backfill `recorded_at = occurred_at` and be explicit in the migration comment that the
distinction only becomes real for rows written from V2 onward.

**F4 — each action call is a fresh child process, and host calls inside it are sequential.**
`apps/server/src/services/plugin-runner.js` (73 lines) spawns one process per action and hands it a
`{input, context}` envelope over stdin/IPC; `custom-tool-subprocess.ts:118` rejects a second
concurrent host call ("Host calls must be sequential."). Consequences: the DB is opened per call, so
pragmas must be set on **every** open (this is what makes the review's §8 correct); a
`reconcile_topic` transaction is the right shape for multi-row work; and any future GitHub fan-out
cannot be parallelised inside one action.

**F5 — a viewer cannot open the dashboard at all.** `requireNotViewerFromContext` guards both the page
route and the action endpoint. So the read-only audience implied by §7 does not exist on this
platform: everyone who can see the dashboard can write to it. Role-based read-only is a platform
change, not a plugin change — record it, don't design around it.

**F6 — the page knows no identity; the actions do.** The UI module receives `ui`, `styles`, `theme`,
`signal`, `effect` — no current-user field — while every action gets `context.actor.id`. Identity must
therefore always arrive through the action layer, which is also the only trustworthy route: the host
strips spoofed context keys out of `input` before the plugin sees them.

**F7 — `inputSchema` *is* enforced at runtime, on both entry paths.** *(Corrected 2026-09-30: an earlier
draft of this plan claimed the opposite — `PluginActionContribution.inputSchema: unknown` is only the
TypeScript type — because the search behind that claim was truncated with `head`. The reviewer caught
it; the production call sites are below.)* The host validates the declared schema in
`apps/server/src/services/plugin-service.ts:616-619` (`stripSpoofedInput` → `validatePluginJsonInstance`
→ `PluginHostError("invalid_input")` → HTTP 400 at `apps/server/src/http/routes/plugins.ts:740`) **and**
on the agent-tool path, which passes the same schema as the tool's `parameters`
(`apps/server/src/services/tool-resolver.ts:206-216`).

What that buys us (recursive — `packages/core/src/plugins.ts:334-434`): `type`, `enum`,
`minLength`/`maxLength`, `minimum`/`maximum`/`exclusive*`, `minItems`/`maxItems`, `required` presence,
nested `properties` and `items` (so a deep `reconcile_topic` payload is shape-checked), and
`additionalProperties: false` rejecting unknown keys (line 419).

What it does **not** buy us: anything outside the 14-key allowlist (`ALLOWED_SCHEMA_KEYS`,
`plugins.ts:24-38` — no `oneOf`/`anyOf`/`$ref`/`pattern`/`format`/`default`; an unsupported keyword
makes the **manifest** invalid rather than being silently ignored), and semantics — cross-field
coherence, whether a referenced id exists, "a blocked axis needs blocker text", "a confirmed claim needs
evidence". Those stay hand-written in `src/actions.ts`, and the two failure shapes must stay
distinguishable: **schema violation → HTTP 400 host rejection**, **business rule → `{ok:false,error}`
result**. Our harness already asserts both (`services/nakama/scripts/plugin-smoke.sh:78-81`, green
2026-09-30).

## 3. Where I would push back on the review's schema

Three small things, in priority order.

**P1 — one `confidence` per axis is too coarse for what §5 asks for.** §5 attaches "inferred" to a
*claim* ("Ready for live validation", evidence: PR #45 + a document + the latest commit), but the
schema stores a single `confidence` on the axis, so `state`, `current_state`, `blocker` and `people`
all share one value. Options:

| | Shape | Cost | Trade |
|---|---|---|---|
| a | one `confidence` per axis | none | as reviewed; can't say "state is confirmed, current_state is inferred" |
| b | `state_confidence` + `current_state_confidence` + `blocker_confidence` | 2 extra columns | covers the actual claims, still simple |
| c | `axis_claims(id, axis_id, kind, text, confidence, evidence_ref, asserted_at)` with the axis keeping a denormalised current view | a table + writes | the only option that preserves *what was claimed when* |

**Recommendation: (b) now, (c) only if the librarian starts revising claims often.** (c) is the
honest model but it doubles the write path for a feature nobody has asked for yet.

**Resolved (reviewer, 2026-09-30): (b) — three columns, no `axis_claims` yet.** People assignment
carries no confidence: it is corrected explicitly instead.

**P2 — `development_axes.repository_id` contradicts the model's own premise.** The whole point of §1
is that work spans repositories, but an axis can name exactly one repo. An axis touching a model repo
and a data repo has nowhere to go. → Add `axis_repositories(axis_id, repository_id, relationship)`,
the same five-line shape as `topic_repositories`, and drop `repository_id` from the axis (or keep it
as the "primary" repo for display). Recommendation: add the join table; keep `repository_id` as the
display default.

**Resolved (reviewer, 2026-09-30): add `axis_repositories` and drop `development_axes.repository_id`
entirely** — a duplicated display default would need synchronising. The join row carries
`relationship`, with exactly one row optionally marked `primary`, and the UI takes the primary
repository from there.

**P3 — `topics.status` has no vocabulary.** The review declares `DEFAULT 'active'` and stops. V1 uses
`active|paused|done`; axes get `active|draft|blocked|parked|completed|abandoned`. Two overlapping
vocabularies on one screen is how drift starts.
→ Topics: `active | paused | completed | archived`. A topic is not "blocked" — its axes are. Declare
the list once (manifest enum + store constant) and have the UI switch on the same constant.

**Resolved (reviewer, 2026-09-30): exactly those four, and topic lifecycle deliberately does not reuse
the axis vocabulary.** The `CHECK` constraints stay in the DDL — but as defence in depth for writes that
never pass through the action layer (migrations, future code, direct DB access), now that `F7` shows the
action layer is a real barrier rather than the only one.

## 4. Vocabulary (as reviewed — locked unless §7 says otherwise)

```
axis kind:   feature | experiment | test | investigation | maintenance
axis state:  active | draft | blocked | parked | completed | abandoned
topic state: active | paused | completed | archived          (P3)
confidence:  confirmed | inferred | uncertain
activity source: manual | github_pr | github_commit | github_issue | repo_document
                 | group_chat | experiment | agent_review
```

## 5. Scope, honestly

**What V2 is:** a rewrite of the data model, the store, the entire action surface, the whole UI, and
the librarian skill. Not a refactor of V1 — V1's two tables are copied across and then abandoned.

**What carries over unchanged:** the vendor path (no fork, one-line allowlist patch), the
single-page UI contract, the per-org SQLite file, the structured `{ok:true}` / `{ok:false,error}`
result convention, the fresh-child-process action model, the harness scripts.

**Breaking changes to plan for:**

- **Action keys all change** → every tool name the agent knows (`plugin_research_dashboard__<key>`)
  changes. The skill (C9) must ship in the same release as the manifest (C3); shipped apart, the
  agent holds instructions for tools that no longer exist. There is a test for this in C9.
- **`find_tools` loads 5 tools per call** (F-table above). The review's list is 8 tools → the first
  search cannot load them all. Either accept two discovery round-trips, or consolidate to ≤5 and
  fold `register_person` / `register_repository` into `reconcile_topic`'s payload (D4).
- **The old page disappears as the default screen.** The review keeps it "underneath" (§16.5); its
  useful parts (per-entity editing forms) become the editing surface of the new detail views.

**Rough size:** 6–8 focused sessions, or an equivalent parallel effort — the chunks are cut so they
can be handed to different workers, but C1→C3 are a chain and C4→C6 share the UI shell.

**Test surface today:** one file, `src/store.test.ts` (4 tests) + the shell harness
(`services/nakama/scripts/plugin-smoke.sh`, `verify-plugin-page.mjs`). Every chunk below adds tests;
the migration and action chunks add the two that don't exist at all today.

## 6. Chunks

Traceability to the review's §16 sequence is in the last column.

### C0 — Decisions (no code) · needs a human · blocks C1, C3

Deliverable: answers to D1–D5 in §7, recorded in this file (edit §7, don't leave it tribal).
Acceptance: §7 has no open question that C1/C3 depends on.

### C1 — Migration `002-coordination-model.sql` + migration tests · D1–D3 resolved · review step 1

Deliverable: `migrations/002-coordination-model.sql`, a manifest entry, `src/migration.test.ts`.
Must contain: rename `projects`→`projects_v1`, `activities`→`activities_v1` (F1); the new schema —
**three confidence columns on the axes** (`state_confidence`, `current_state_confidence`,
`blocker_confidence`), **`axis_repositories` with `relationship` (one row optionally `primary`) and no
`repository_id` on the axis**, topic status **`active|paused|completed|archived`**, and `CHECK`
constraints mirroring every enum; the V1→V2 copy with the source-type map (F2) and
`recorded_at = occurred_at` (F3); indexes.

Acceptance (all automated):
- Build a V1 database by applying 001, insert 2 projects + ≥3 activities covering every legacy
  `source_type`, apply 002, then assert: `topics` has the 2 rows with the same ids and values; the new
  `activities` has the 3 rows with mapped source types, `axis_id IS NULL`, `recorded_at = occurred_at`;
  `projects_v1` / `activities_v1` still hold the originals; `PRAGMA foreign_key_check` returns nothing.
- 002 is applied by the platform on the dev instance (Reinstall) and appears once in
  `_nakama_plugin_migrations`.

Risk: **this is the only irreversible step** — it runs on existing data, and the platform refuses
downgrades. Test it on a database built from 001 first, and take a **file-level copy of the live DB
before the first Reinstall on the deployment** — a restore is the only rollback that exists.

**Status: ✅ done (2026-09-30).** `migrations/002-coordination-model.sql`, its manifest entry and
`src/migration.test.ts` are in the repo; `bun test src` is 11 pass / 0 fail (7 migration + 4 store).

Met on the platform path, not just in the harness — Reinstall on the dev instance moved it from
`0.1.0+dev.684004193d4f` to `0.1.0+dev.d2a2bd18a2fe` and the live database came out as intended:
ledger `001-research, 002-coordination-model`; 11 new tables alongside `projects_v1`/`activities_v1`
(4 projects, 3 activities, still readable); `topics` holding the 4 seeded topics with **`Reconstruction
Study` mapped `done` → `completed`** — the row that would have aborted an unmapped copy, since `CHECK`
fires even with `foreign_keys` off; 3 copied activities, `axis_id NULL`, `recorded_at = occurred_at`,
source types mapped (`commit` → `github_commit`, `experiment`, `github_pr`); `PRAGMA foreign_key_check`
empty; both partial unique indexes present.

Three things the run taught us that the plan did not know:

1. **The applier is not transactional.** `applyPluginMigrations` does a bare `db.exec(sql)` per file,
   on a connection that sets no pragmas, and records the checksum only afterwards — a failure part-way
   through would leave the database half-migrated with no ledger entry, and the retry would die on
   "table topics already exists". 002 therefore wraps itself in `BEGIN IMMEDIATE` / `COMMIT`.
   `migration.test.ts` asserts the atomicity with a deliberately broken copy of the file.
2. **A Reinstall mints a new database generation file** (`g<random hex>` — not derived from content)
   and VACUUM-copies the current data into it before applying migrations, keeping the previous
   generation on disk. So: the automatic rollback is that retained file, and reverting the *manifest*
   does **not** return an instance to an older generation (it mints a fresh one seeded from current
   data). Rollback = copy the retained file back over the active generation path.
3. **Gen-1 code cannot run against the migrated schema** — it queries `projects`, which is now
   `projects_v1` (`list_projects` → HTTP 500). That is expected and is exactly what C2 fixes.

Resting state between C1 and C2: the dev instance's active generation file was put back to its pre-002
bytes (`g518302c79db84d34afc791c1191d48f9.sqlite` → the current generation path; the migrated copy is
kept alongside as `.v2-migrated.bak`), so the instance keeps serving the gen-1 dashboard until the C2
store rewrite lands. The next Reinstall re-applies 002 (the manifest still declares it; the ledger is
what makes that idempotent).

Evidence: `bun test src` → **11 pass / 0 fail**; `bash scratch/reinstall-002.sh` + a direct read of the
org's plugin database; `plugin-smoke.sh` to re-run after the C2 Reinstall.

### C2 — Store v2: pragmas, transactions, optimistic version · depends on C1 · review steps 2, 9 (part)

Deliverable: `src/store.ts` rewritten around the new entities (topics, repositories, people,
development_axes, link tables, activities, annotations).

Must contain: the three pragmas on **every** open (`foreign_keys=ON`, `journal_mode=WAL`,
`busy_timeout=5000` — F4); explicit transactions for multi-row operations; `version` carried on
topics and axes with an `expectedVersion` check that returns `{ok:false, error:"conflict: …"}`;
`updated_at` maintained in one place.

Acceptance:
- Pragma assertions: `journal_mode` is `wal`, `foreign_keys` is `1`, `busy_timeout` is `5000`.
- Cascade behaviour works with FKs on (deleting a topic removes its axes and their links).
- Rollback test: a `reconcile` that fails mid-way leaves **zero** rows changed.
- Conflict test: update with a stale `expectedVersion` returns the structured conflict and writes nothing.
- Concurrency test: two store instances on one file, interleaved writes, no `SQLITE_BUSY` surfaced.

Evidence: `bun test`; the concurrency test is the one that would have caught V1's missing pragmas.
Risk: low, but the pragma choice interacts with how the platform opens the DB for **migrations** — if
FK enforcement is on during 002, insert order matters (parents first). Either way the test must pass.

**Status: ✅ done (2026-09-30).** `src/store.ts` is rewritten around the gen-2 entities, with the
transaction boundary as a property of the API rather than a thing callers remember:
**every public writer is atomic on its own, `atomic()` is the only place `BEGIN`/`COMMIT` appears, and
it is reentrant** so composite operations join the transaction already in flight. `reconcileTopic` is
the composite that C3/C9a need — topic fields, axes, repository/person links, activities and
annotations, plus the version check, in **one** transaction, so the librarian calls it once and relies
on all-or-nothing.

Pragmas are set in the constructor, i.e. on every open (`foreign_keys=ON`, `journal_mode=WAL`,
`busy_timeout=5000`), and `store.pragmas()` exposes the effective values so a test asserts them
instead of trusting the calls. `updated_at` is maintained in one private `touch()` and the version bump
lives in the same UPDATE as the field change, so a conflict cannot half-apply.

Two design points worth keeping:

- **The evidence rule has one escape hatch and one ordering consequence.** A claim marked `confirmed`
  must be backed by a branch, PR, activity or annotation — otherwise the honest label is `inferred`.
  `reconcileTopic` therefore checks the rule **after** applying the call's writes, so an activity that
  arrives in the same call can back the claim; a fresh axis is allowed its default claims (it has to
  exist before anything can back it) while an explicit `confirmed` on creation is held to the rule.
- **A stale `expectedVersion` is `ResearchStoreConflictError`, message prefixed `conflict: `**, so the
  action layer can keep `{ok:false,error}` while the caller can still tell a conflict from a typo.

Acceptance, all met (`bun test src` → **33 pass / 0 fail**; `bun run check` green):

| Check | Evidence |
|---|---|
| Pragmas on every open | `store.pragmas()` = `{foreignKeys: 1, journalMode: "wal", busyTimeout: 5000}`, asserted again after reopening the same file |
| Cascade with FKs on | deleting a topic removes its axes, both link tables, its activities and annotations; repositories/people survive as shared infrastructure |
| Rollback | a `reconcileTopic` that trips a rule **after** patching the topic and creating an axis changes nothing: version, `summary`, `updated_at` and every table count are unchanged |
| Conflict | stale `expectedVersion` → `conflict: topic "…" is at version 2, not 1`, and neither the row nor a sibling write moves |
| Concurrency | two store instances interleaved (20 writes, no `SQLITE_BUSY`); plus a **separate process** holds `BEGIN IMMEDIATE` for 400 ms and the store's write waits it out and succeeds |
| Migration-backed | every test builds its database by applying 001 **and** 002, so the store is checked against the shipped schema |

The concurrency test had to use a separate **process**, not an in-process timer: `bun:sqlite` is
synchronous, so a timer could never fire while our own write blocks on the lock. That is also why
`busy_timeout` matters in the field — the platform runs each action in its own child process.

On the risk noted above: the migration applier opens the file with **no pragmas at all**, so
`foreign_keys` is OFF while 002 runs and the copy's insert order is free (verified in C1). The pragmas
only govern the plugin's own connections.

Also in this chunk, and **deliberately confined to it**: `src/actions.ts` is the gen-1 surface
re-pointed at the gen-2 store — same five keys and result shapes, `project` ⇄ `topic`, and the status
vocabulary mapped at that boundary (`done` ⇄ `completed`) because the manifest still enforces gen 1's
enum. It exists so `bun run check` and the dev instance stay green across the migration; C3 deletes it.
The one behavioural difference: rule violations now read `Topic not found.` (the store's vocabulary),
and the smoke harness asserts that.

### C3 — Action surface v2 (+ provenance, + actors) · depends on C2 · D4 resolved (five tools) · ships with C9 · review steps 3, 4

Deliverable: `nakama.plugin.json` actions rewritten; `src/actions.ts` rewritten; `src/actions.test.ts`.

Must contain: **five exposed tools** — `get_overview`, `get_topic`, `search_dashboard`,
`reconcile_topic`, `record_activity` (D4) — with `exposeAsTool: false` for everything else:
`add_annotation` and the CRUD used by the UI, with `register_person`/`register_repository` kept as
non-agent UI/admin actions (or folded into `reconcile_topic`'s payload). A **fully nested
`reconcile_topic` schema** is declared so the host enforces shape in depth (F7) — hand-written code in
`src/actions.ts` then covers only semantics; `context.actor.id` recorded on annotations/activities and
used to link the acting user to a `people` row when one exists (F6 — never trust identity from
`input`); `activitySinceDays` on `get_overview` (default 14) as a query parameter, not stored state.

Acceptance:
- Action tests: every action returns `{ok:true,…}` on valid input; **schema/shape violations are host
  rejections (HTTP 400)** while **business rules** (unknown id, `blocked` without blocker text,
  `confirmed` without an evidence ref) return `{ok:false,error}`. The two failure shapes must stay
  distinguishable, and `plugin-smoke.sh` keeps asserting both sides (F7).
- The declared `reconcile_topic` schema survives the host's subset check (`ALLOWED_SCHEMA_KEYS`); a
  keyword outside that allowlist makes the **manifest** fail to install, so a Reinstall on the dev
  instance belongs to this chunk's acceptance.
- Exactly **five** actions carry `exposeAsTool: true`, asserted by a test — a sixth tool would silently
  cost the agent a second `find_tools` round-trip.
- `reconcile_topic` is atomic (inherits C2's rollback test at the action level) and is the **only**
  write path the librarian needs for a topic update.
- Actor attribution: an action invoked by a known Nakama user records that user; an unknown one
  records `actor_type` without inventing a person row.

Evidence: `bun test src/actions.test.ts` + `plugin-smoke.sh` + one recorded agent run showing how many
`find_tools` calls it takes to load the surface (D4's data point).
Risk: **breaking change** — do not merge this without C9 in the same release.

**Status: ✅ done (2026-09-30), C9a included (the shipped skill now documents the v2 surface).**
`nakama.plugin.json` declares **eight** actions — the five exposed tools plus three the page needs —
with a fully nested `reconcile_topic` schema; `src/actions.ts` is the thin surface over the gen-2 store
(no transaction logic, actor from `context.actor`, semantic rules as `{ok:false,error}`); and
`src/actions.test.ts` covers the manifest contract, every action's result shape, both failure shapes and
provenance. The C2 gen-1 bridge is deleted, and `src/ui.tsx` speaks the v2 surface so the page keeps
working — the UI's create/update goes through the *same* `reconcile_topic` write path as the agent,
since `exposeAsTool` is a tool-registry flag, not access control. Two store reads (`getOverview`,
`searchDashboard`) landed here rather than as a preliminary refactor, per the review.

Against the acceptance:

- **Five exposed tools, verified against the running platform** rather than the manifest: `GET /v1/tools`
  lists exactly `plugin_research_dashboard__{get_overview,get_topic,search_dashboard,reconcile_topic,
  record_activity}` and nothing else from this plugin. The plugin-detail payload does *not* project
  `exposeAsTool`, so the smoke harness asks the registry — that check is now in `plugin-smoke.sh`.
- **Both failure shapes stay distinguishable**, asserted over HTTP: nested schema violations (bad enum
  inside `axes[]`, wrong type in a nested item, unknown key) are HTTP 400 before the action runs;
  unknown ids, blank fields, `blocked` without blocker text and a cross-topic axis come back as
  `{ok:false,error}`; a stale `expectedVersion` keeps its `conflict: ` prefix.
- **The nested schema survives the host's allowlist**: a Reinstall is the real check, and it passes
  (`0.2.0+dev.937ea2fe21cf`). `src/actions.test.ts` replicates `ALLOWED_SCHEMA_KEYS`, so a stray
  keyword fails in `bun test` instead of at install.
- **Atomic at the action level too**: a reconcile whose second axis breaks a rule leaves the topic's
  `summary` untouched and creates no axes.
- **Attribution**: activities and annotations record `context.actor.id`, with `profileId` deciding
  `agent` vs `human`; a spoofed `actor` in the input is ignored even if it survives the host; and the
  acting user is linked to the topic they wrote to *when the dashboard already knows them as a person* —
  a link, never a new person row.
- `activitySinceDays` on `get_overview` defaults to 14 and is a query parameter, not stored state;
  `search_dashboard` reports which field matched each hit.

Evidence: `bun run check` → **57 pass / 0 fail**; `plugin-smoke.sh` → **21/21**, idempotent (one fixed
topic name is reconciled each run); Reinstall → `0.2.0+dev.937ea2fe21cf` with the rewritten skill
re-materialized from the release directory. Agent run (session `l8cdxlUkdGU7L94t2yNg4`, three turns):

| Turn | Asked | Calls, in order |
|---|---|---|
| 1 | "what is going on right now, and what is blocked?" | `find_tools` → `get_overview` |
| 2 | "the group decided at the standup to pause Filtering Comparison — record it" | `find_tools` → `search_dashboard` ∥ `get_topic` → `reconcile_topic` |
| 3 | "PR #88 was merged on Acquisition Automation — record that" | `find_tools` → `get_topic` → `search_dashboard` → `record_activity` |

All five tools used; both writes landed and are attributed (`group_chat` / `group standup 2026-09-30`,
and `github_pr` / `PR #88`, `actor_type = agent`). **D4's answer**: the discovery cost is per *turn*,
not per surface — plugin tools are loaded for one user request at a time, so each turn pays one
`find_tools` call, and one search returns the whole five-tool group (`remaining: 0`). The surface size
therefore costs the model's attention, not extra round-trips. A useful side observation, not a
benchmark: the first run (before the rewritten skill was vendored, so the agent read the *gen-1* skill
body and followed it) needed five `reconcile_topic` calls and a `skill_manage` for the same class of
task that the clean run did in one — the skill body is part of the surface, not documentation.

Two corrections found while testing, both fixed rather than papered over:

1. The "a `confirmed` claim needs evidence" rule was firing for *any* axis carrying the default `state`,
   which made a fresh `{title}` axis impossible to create. A claim is now a **non-empty value** (or a
   `state` the caller actually mentioned); the rule still refuses a real claim with nothing behind it,
   asserted from both sides in the store tests. Consequence for C8: a status change made by hand on the
   page needs its evidence too, so the page should record the person's own note alongside it.
2. `record_activity` used to register a named repository in a second store call before writing the
   activity. `addActivity` now takes `repositoryFullName` and registers it inside its own transaction,
   so no action sequences two writes.

### C4 — Overview UI (the 10-second view) · depends on C3 · review steps 5, 14

Deliverable: new default screen in `src/ui.tsx`: topics with their axes (kind · state), repo/branch/PR
line, current state, blockers called out, per-topic activity count and last-activity age, and the
window control (14d default; 7d/30d/all as parameters).

Acceptance: renders from one `get_overview` call; the window control changes only the query; a topic
with a blocked axis is visually distinct; no personal identifiers beyond display names the group
itself entered.
Evidence: `verify-plugin-page.mjs --write` + screenshots in `docs/screenshots/`.

**Status: ✅ done (2026-09-30).** The default screen is the overview; the generation-1 list/detail pane
survives underneath it as each card's expanded editor, which is where C5 and C8 deepen it.

The reviewer answered the two open C8 questions before this chunk started
([verbatim](reviews/2026-09-30-c4-c8-answers.md)), and both changed it:

- **D8 — a manual status change carries an optional note.** Not required for every human edit, but the
  UI must make a short rationale easy to attach, because the librarian reads annotations and should not
  have to re-infer `blocked`. **C8 implements it** — this chunk keeps the existing status control
  unchanged, deliberately, so C8 owns the write-side shape (the store's evidence rule is untouched).
- **D9 — the overview groups axes under topics, never one flat list.** The scan order is topic name →
  people → state counts (active/blocked/draft/parked) → the 2–4 most relevant axes → a recent-activity
  summary → expand for all axes and history; axes order `blocked → active → draft → parked →
  completed → abandoned`, most recently updated within each group. Implemented in `getOverview`'s
  `topics` rollup and the page; **no schema change was needed**, as the reviewer expected.

What landed:

- `getOverview` returns a `topics` rollup — per topic: its `people`, `repositories`, `axisCounts`, its
  axes **in attention order** with the repositories each touches, `activityCount` for the window and
  `lastActivityAt` — built from a handful of grouped queries rather than a read per topic, because the
  front page is one call by contract. `activitySinceDays` now accepts `0` as "all time", and
  `includeArchived` keeps retired topics off the page until asked for.
- `src/ui.tsx` renders it: header (title, window control, archived toggle, refresh, new-topic form,
  count line), one card per topic in the D9 scan order, `data-rd-blocked` plus a red left border on a
  topic carrying a blocker, and the expanded editor. The window control is the only thing that
  re-queries.
- Acceptance, all met (`bun run check` → **61 pass / 0 fail**; `plugin-smoke.sh` → **24/24**;
  Reinstall → `0.2.0+dev.6e578ac51756`):

| Check | Evidence |
|---|---|
| One `get_overview` call | The harness counts the action requests: exactly one `get_overview` (`{"activitySinceDays":14}`) on mount, and no `list_topics`/`list_activity` on first paint |
| The window changes only the query | Clicking "7 days" produces exactly one further call with input `{"activitySinceDays":7}` and nothing else in the body |
| Blocked is visually distinct | The card parses `data-rd-blocked="true"` and computes `border-left-width: 3px`; the non-blocked card is `false`/0 |
| Axes grouped, not flat | Each card's text contains its own axis titles and none of another topic's |
| Expand shows everything | "All 4 axes" yields 4 axis rows and removes the "N more axes hidden" hint |
| Neutral data only | Seed, fixtures and screenshots use `Signal Processing` / `Acquisition Automation` / `Researcher A`-style placeholders |

Two findings, both fixed rather than papered over:

1. **`reconcile_topic` minted a new person row per call.** `upsertPerson` matched only on
   `nakama_user_id`/`github_login`, so the librarian's natural form — `people: [{displayName: "…"}]` —
   created a fresh `people` row on every reconcile (the demo database had **11 rows for 5 names**, and
   the topic card rendered "Researcher A, Researcher A, Researcher A"). Invisible until this chunk put
   the people line on the front page. `resolvePersonForLink` now reuses an **unambiguous** exact-name
   match for the link path; `registerPerson` (the identity primitive) still treats a name as a
   non-identity, and an ambiguous name is refused rather than guessed at or multiplied. Tests cover all
   three behaviours.
2. **The demo seed silently swallowed a refused write.** `Noise study` carried a non-empty
   `currentState` while only its `stateConfidence` was `inferred`, so the evidence rule refused the
   whole atomic reconcile and the seed's `curl … > /dev/null` hid it. The seed now fails loudly on
   `{ok:false}` — which is how the duplicate-person bug above surfaced too.

Also worth keeping: `page.screenshot({fullPage: true})` **does not capture the plugin page**. The host
scrolls it inside its own container, so a document-level shot shows whichever slice is scrolled into
view and silently drops the header — the first C4 screenshot was missing the window control entirely.
`verify-plugin-page.mjs` captures the plugin root element instead.

### C5 — Topic detail (axes + per-axis history) · depends on C4 · review steps 5, 6, 10 · **done 2026-09-30**

Deliverable: the expanded topic card *is* the detail — description, status, approved summary, people and
linked repositories; one block per axis with its full metadata (state, kind, branch, PR, current state,
blocker, per-claim confidence, people, repositories); each axis's history and notes expanding inside that
axis; topic-level recent activity; annotations/corrections kept visually apart from activity; and the
correction form that lets a manager fix agent inference in place.

Acceptance (all four are harness/store assertions, not reading):

| Check | Evidence |
|---|---|
| One call per topic | Opening a card issues exactly one `get_topic`; the C4 assertions (no `list_topics`) still hold on first paint |
| Per-axis depth, unmerged | Each axis renders its own `History (n)` with only its own events, its own notes, and an evidence line in words |
| Notes stay out of activity | An axis note never appears in that axis's history list; topic-level notes are listed separately (the harness checks the exact strings) |
| Confidence on a claim only | An axis with no evidence renders `no evidence on record — a 'confirmed' claim is impossible here`, and shows **no** badge for a progress claim it never made |
| Stale correction is refused, in place | With a second writer bumping the axis, the save is refused with the banner *inside that axis* ("This development axis changed since you opened it.") and the person's note intact — nothing written |
| Reload re-reads, then lands | `Reload this topic` re-reads the axis and carries the rationale across while the claim fields are re-read; saving again lands it, and the note under the axis becomes the evidence for `confirmed` |
| Atomic on refusal | Store test: a stale correction carrying a note writes neither the axis mutation nor the note |

Evidence: 68 store/action tests pass; `plugin-smoke.sh` 28/28 (idempotent across runs, 4 checks are new
here); the page harness is 28 read checks and 38 with `--write`; screenshots
`docs/screenshots/dashboard.png` (overview) and `docs/screenshots/dashboard-detail.png` (one topic's
detail, captured with the host's scroll container unclipped so the whole card is in frame).

Three findings, all fixed rather than papered over:

1. **A confidence with no claim behind it.** `toAxis` filled `current_state_confidence` from the column
   default, so an axis nobody had said anything about rendered **`confirmed`** — in the page and in
   `get_topic`'s payload for agents alike. Confidence describes a *claim*, not the mere existence of an
   axis: with no claim the read model now returns `null` and nothing is rendered. The columns stay
   `NOT NULL`, so the write path reads them straight. **Later librarian work must preserve this**: an
   axis that states nothing is not a confirmed axis.
2. **`Close` stopped collapsing the card.** After the detail moved into the expanded card, closing the
   fields left the card expanded — and a topic with fewer axes than the lead count has no "show fewer
   axes" control, so there was no way back to a collapsed card at all.
3. **A recorded activity refreshed the wrong list.** `record_activity` re-read `list_activity` into a
   state variable the C5 detail no longer renders, so the event you just recorded did not appear. The
   detail is now the thing that is re-read (and the now-dead call went with it).

Also: the harness had been looking for a `data-rd-conflict` attribute the page never emitted, which made
a working conflict banner read as missing — worth knowing when an assertion "fails" on a feature that
looks right. And the C4 count-line regex was `repositories?`, which matches "repositorie(s)" but not the
singular "1 repository" `countLabel` produces.

### C6 — People and Repositories views · depends on C5 · review steps 7, 11, 12 · **done 2026-09-30**

Deliverable: the other two views of the same page (the platform allows exactly one page slot, so they are
views inside it, switched in the header: **Topics · People · Repositories**). People is person-first — a
compact index on the left ("3 active · 1 blocked · 2 axes · 2 topics"), the selected person's work on the
right. Repositories is the same shape, repository-first.

The review settled the open layout question (**person-first** — the dashboard answers "what is each person
working on", not "which topics contain this name") and set the rules this chunk follows: factual
involvement only, **no workload scoring, percentages, utilization or ranking**; read-only first; and the
acceptance test that a person on several topics/axes is **one row** with their involvement grouped
underneath.

| Check | Evidence |
|---|---|
| One person is one row, grouped | Store test: a person on two topics and two axes yields one entry whose `topics[].axes` carry only *their* axes; the harness reads the rendered index and finds exactly one row named `Researcher A`, with two involvement blocks |
| Every person the header counts is listed once | Harness: the index length equals the header's "N people", with no duplicated name |
| Attribution is narrow, and says when it cannot attribute | Store test: an event belongs only to the person whose account wrote it; an unmapped actor's event belongs to nobody; a person without an account reports `attributable: false`, a null `lastActivityAt` and the panel says *"That is a missing link, not an absence of work"* instead of an empty log |
| Repository-first, three questions | Store test + harness: the topics it **supports** (declared link, `primary` first), the axes **naming it** in attention order with branch/PR/blocker, and the activity recorded against it **or against one of its axes** |
| No new tool, no new schema | `get_overview` carries both rollups (the actions test asserts the grouped shapes in the same response); the manifest still declares C3's five tools, only `get_overview`'s description changed; migration 002 is still the newest |
| The window composes, absolutes stay absolute | Store test: `activitySinceDays` windows the event list while "last activity"/"last reviewed" stay absolute — a person quiet for a month is not shown as never having recorded anything |
| Truncation is reported, never silent | `people`/`repositories` cap at `MAX_ROLLUP_LIMIT` with `peopleTruncated`/`repositoriesTruncated` flags (store test) |
| Archived work stays hidden | Rollups obey the same `includeArchived` rule as the topic list |

Payload cost: the rollups carry a lean axis projection (`AxisScan` — no description, no confidence
metadata) instead of a second copy of `AxisOverview`, so the one call that now serves three views does not
double in size.

Evidence: 72 store/action tests pass (4 new C6 store tests, the actions test extended); `plugin-smoke.sh`
31/31 (3 new); the page harness is 34 read checks and 46 with `--write` (6 new); screenshots
`docs/screenshots/dashboard-people.png` and `docs/screenshots/dashboard-repositories.png`; installed
release `0.2.0+dev.8dfb2b80838e`.

One real bug, found by *looking at the rendered page* rather than at the tests:

1. **An event recorded against an axis never reached its codebase.** The repository activity path looked
   the axis→repository relation up the wrong way round, so only events that filled in a repository
   explicitly (rare) showed up. The demo panel said "last activity today" and "Nothing recorded in the
   7 days" at once — the tell. Fixed, with the axis-only case now a store test. The general lesson: the
   read models were asserted on the shape I *seeded*, and the seeded shape was the easy one.

Also a data finding: the demo seed linked people only at topic level, so the first People view showed
topics with no axes under them. The seed now links people to the axes they work on (a fixture fix — the
axis-level link path already worked, as the smoke fixture proves).

### C7 — Progress view (the time perspective) · depends on C6 · review steps 8, 9 · **done 2026-09-30**

Resequenced by the review (2026-09-30): the structural views came first (topic-first, person-first,
repository-first), so the missing perspective is **time** — *what changed in the last one to two weeks
across several concurrent development axes?* Concurrency hardening moves after this, as C7b.

Deliverable: a fourth view, **Progress**, read-only, built from the same `get_overview` call — the
window's events grouped **topic → axis → event**, newest topic first, with the axis's state, kind,
repository, branch and PR on the axis line, each event showing its date, source and attribution. Filters:
the header's 7/14/30/all window plus topic, person, repository and axis state. Grouped by default, never
one flat firehose.

The review's acceptance criterion, adopted verbatim: seed this primarily with the **common case where
topic/repository context is implied through the axis**, not with rows that redundantly carry direct
foreign keys — the shape the C6 defect hid behind.

| Check | Evidence |
|---|---|
| Grouped topic → axis, newest topic first | Store test asserts the grouping, the axis order inside a topic and the group order; the harness reads the rendered rails |
| Context implied through the axis | Store test + harness: an event inserted with **only** an `axisId` (no `topicId`, no `repositoryId`) lands under the right topic, under its own axis, and is filterable by the repository that axis names |
| Topic-level events are kept, not dropped | Store test: an event naming the topic and no axis gets its own last-ordered group; an event naming neither is not shown (there is no honest place for it) |
| Attribution uses the one map | Store test: the event carries the person resolved through `people.nakama_user_id`; an unmapped actor's event renders with `person: null` (shown, not mis-attributed) |
| The window windows; history is not rewritten | Store test: 14 days drops a month-old event from the timeline while the axis detail still returns all three |
| Filters compose without a re-query | Harness: repository filter keeps only the axes naming it and the summary says `(filtered)`; a person filter matching nothing attributable says so and shows no unrelated events |
| Read-only, no new tool, no schema | `get_overview` gained `timeline`; the manifest's five tools and migration 002 are unchanged |

Truncation is reported per axis (`eventCount` vs the returned `events`, default 10) so a busy axis says
how many older events the topic detail still holds.

Evidence: **`bun run check` → 74 pass / 0 fail / 441 `expect()` calls**; **`plugin-smoke.sh` → 33/33**
(2 new); the page harness → **39/39 read** (5 new); Reinstall → `0.2.0+dev.38177d13a026`; screenshot
`docs/screenshots/dashboard-progress.png`. The demo seed now dates its events across the window, which is
what makes the view legible.

### C7b — Optimistic concurrency end-to-end + multi-user test · depends on C5 · **deferred into C8**

Deliverable: version round-trip in the UI (send `expectedVersion`, handle `conflict` without losing
the user's text), plus a two-session test: A opens an axis at v7, B saves → v8, A saves → conflict,
A's retry succeeds against v8.

Acceptance: the test above is automated (two store sessions against one file is enough; a
browser-level test only if it stays cheap); no silent last-write-wins anywhere. The refusal half is
already built and verified (C5's per-axis and topic-level conflict banners, the atomic refusal test); what
remains is the automated two-session round-trip, which fits the C8 editing pass.

### C8 — Provenance in the UI · depends on C3, C4 · **done 2026-09-30**

Deliverable: inferred/uncertain claims are visibly marked wherever they appear (overview, axis card),
with their evidence reference; annotations are visually distinct from machine state.

Acceptance: an axis with `confidence: inferred` cannot be mistaken for confirmed state in any view;
`confirmed` requires a human or an explicit evidence source, and the store rejects a `confirmed` claim
that carries no evidence ref.

**Scope guard (reviewer, 2026-09-30):** provenance stays bounded — the three confidence fields, plus
activities, annotations, and actor/source metadata on the changes that matter. Do not turn every field
into a provenance system in V2 (D7).

**Resequenced and scoped by the review (2026-09-30):** three things, nothing broader — (1) an
inferred/uncertain state impossible to mistake for confirmed **everywhere** it appears, (2) one vocabulary
for what backs a claim, (3) the automated two-session concurrency round-trip. No schema, no tools, no
styling pass.

| Check | Evidence |
|---|---|
| No bare state anywhere | One `StateBadge` renders every state in every view (overview card, topic detail, People/Repositories snippets, Progress), always carrying `data-rd-state-confidence`; a state that is not `confirmed` says so where it is read — harness: **6/6 rendered states carry their claim, 2 of them not confirmed, 0 of those unqualified**, sample `["PARKED · INFERRED","BLOCKED · INFERRED"]` |
| One vocabulary for the evidence | The reported forms (`PR #88`, `agent review`, `manual note`, `document`, `commit`, `group chat`) come from one helper, distinct from the menu's Title-Case offers; a ref that already names its source is not said twice. Harness: every Progress event line matches the reported vocabulary |
| "No evidence on record", in those words | The evidence line's empty case is a sentence, not a gap; harness asserts it on the fixture axis that has nothing behind it (`… state INFERRED no evidence on record`) |
| Two-session round-trip, automated | New store test with **two store instances over one file**: A reads v_n → B writes v_n+1 → A's save refused with the `conflict:` prefix → nothing written (state, description and the rationale note all unchanged) → A re-reads → retry lands → B sees it. Harness write pass proves the same through the UI: scoped banner (`This development axis changed since you opened it.`), note kept in the field, `Reload this topic`, retry lands with the note atomic |

`AxisScan` gained `stateConfidence` (a rolled-up axis was showing a state without its claim); nothing else
in the payload changed. Evidence: **`bun run check` → 75 pass / 0 fail / 449 `expect()` calls**;
**`plugin-smoke.sh` → all checks passed**; harness **41 read / 54 write**, console clean; Reinstall →
`0.2.0+dev.63e47e9afc4f`; screenshots `dashboard-progress.png` (the `BLOCKED · INFERRED` badge),
`dashboard-detail.png`.

**Correction to the C7 handoff.** It reported `plugin-smoke.sh` as 33/33. That was wrong: the smoke's new
C7 grouping check was failing (the jq used `all(.[]; …)` and returned nothing), so the honest state at C7
was 32 passing with 1 failure. The check is fixed (no `all/2`; it now asserts the least axes-with-events
per group) and the smoke passes as a whole — but the C7 evidence block above overstated, and the count
should have been read off the suite's own summary line, not off a `grep -c '^PASS'` I ran myself.

**After C8 (reviewer, 2026-09-30):** **C9a** (skill audit/cleanup) only if needed — the skill was largely
rewritten during C3/C5 — then **C10** (retire the legacy tables) once the V2 instance has been exercised
enough.

### C9 — Librarian skill rewrite · ships with C3 · review step 8 (split, see below)

Deliverable: `skills/research-coordinator/SKILL.md` rewritten for reconciliation: read dashboard state
**and human annotations first**, reconcile axes rather than re-creating them, mark inferences as
inferred, never silently override an annotation (explain the conflict instead).

**Split:** the review's §13 protocol steps 2–3 ("inspect repositories, branches, PRs, commits,
issues") assume evidence access the plugin does not have — that is exactly the deferred GitHub work
(C11). So: **C9a** = tool surface, annotation-reading, reconciliation from conversation + whatever the
bound profile can already read; **C9b** = evidence-driven reconciliation, blocked on C11's
capability. C9a must not promise C9b's behaviour in its wording.

Acceptance: a test asserting every `plugin_research_dashboard__*` name mentioned in the skill exists
in the manifest (V1's real drift failure mode: a reinstall refreshed the skill, but nothing checked it
matched the tools); plus one recorded agent run that reconciles a topic and marks an inferred claim.

### C10 — Retire V1 · depends on C4, C5, C6 (V2 proven in use)

Deliverable: migration `003-drop-legacy.sql` dropping `projects_v1` / `activities_v1`, and removal of
the remaining `project*` code paths from the store and actions.

Acceptance: no code reference to the legacy tables; `PRAGMA integrity_check` clean; the dev instance
still renders with the legacy tables gone.

### C11 — GitHub / repository review automation · **deferred, after C10** · review step 10

Out of scope for this plan by explicit decision: it is the last step of the review's own sequence, and
the V2 coordination dashboard is useful without it. Recorded here only so it is not lost. Blockers it
will hit: host calls are sequential inside an action (F4), and credentials/scope for repo reading are
a platform-admin concern, not a plugin one.

| Chunk | Review §16 step |
|---|---|
| C1 | 1 |
| C2 | 2, 9 |
| C3 | 3, 4 |
| C4 | 5, 14 |
| C5 | 5, 6, 10 |
| C6 | 7, 11, 12 |
| C7 | 8, 9 |
| C8 | 5 |
| C9 (a/b) | 8 |
| C10 | §15 |
| C11 | 10 (deferred) |

## 7. Open decisions

| # | Decision | Resolution (2026-09-30) |
|---|---|---|
| **D1** | Confidence granularity (P1) | ✅ **(b) three columns** — `state_confidence`, `current_state_confidence`, `blocker_confidence`; no `axis_claims` yet; people assignment carries no confidence |
| **D2** | Axis ↔ repository cardinality (P2) | ✅ **add `axis_repositories`, drop the axis's `repository_id`**; `relationship` on the join row, exactly one optionally `primary`; the UI reads the primary from there |
| **D3** | Topic status vocabulary (P3) | ✅ **`active` / `paused` / `completed` / `archived`** — deliberately not the axis states; `CHECK` constraints as defence in depth behind the host's schema validation (F7) |
| **D4** | Exposed tool count | ✅ **five now**: `get_overview`, `get_topic`, `search_dashboard`, `reconcile_topic`, `record_activity`. Registration becomes non-exposed UI/admin actions, optionally folded into `reconcile_topic` |
| **D5** | Legacy V1 data | ✅ **(a) copy it** — the rename/copy strategy of F1, `commit`→`github_commit`, `document`→`repo_document`, `recorded_at = occurred_at` |
| **D6** | Real topic names in the public repo | ✅ **(b) genericise** (reviewer, 2026-09-30): neutral examples only — `Signal Processing`, `Acquisition Automation`, `Topic Alpha`. Applied to the review document, the test fixture **and** the screenshots (dev DB re-seeded neutral, images re-captured), not just the plan |
| **D7** | Provenance breadth | ✅ **bounded** — three confidence fields + activities + annotations + actor/source metadata on changes that matter; no per-field provenance in V2 |
| **D8** | Evidence for a manual status change (C8) | ✅ **optional note, easy to attach** (reviewer, 2026-09-30): the page records the person's own rationale alongside the change — a short note like "waiting intentionally for October hardware slot" is what the librarian reads instead of re-inferring `blocked`. Not required for every human edit. **Implemented in C8**, so C4 deliberately left the write shape alone |
| **D9** | Overview information architecture (C4) | ✅ **axes grouped under topics, never one flat list** (reviewer, 2026-09-30): topic name → people → counts (active/blocked/draft/parked) → 2–4 most relevant axes → recent-activity summary → expand for all axes/history; within a topic `blocked → active → draft → parked → completed → abandoned`, then most recently updated. **Implemented in C4**; no schema change |

**Answered 2026-09-30.** The reviewer's answers are kept verbatim in
[`reviews/2026-09-30-v2-plan-answer.md`](reviews/2026-09-30-v2-plan-answer.md) and folded into the table
above. Two changed the plan materially: the **`inputSchema` correction (F7)** — the platform does
validate, so `CHECK` constraints are defence in depth rather than the only barrier, and the two failure
shapes are now an acceptance criterion — and the **five-tool contract (D4)**, which removed three
`find_tools` round-trips from every librarian session.

**Answered again 2026-09-30, after C3** — the two C8 questions, kept verbatim in
[`reviews/2026-09-30-c4-c8-answers.md`](reviews/2026-09-30-c4-c8-answers.md) and recorded as **D8**
(a manual status change carries an optional note) and **D9** (the overview groups axes under topics).
Neither needed a schema change; D9 shaped C4 and D8 is C8's write-side work.

## 8. Non-goals

- PostgreSQL, or any move off per-org SQLite (F-table; the review rejects it too).
- Per-person dashboards — one shared org dashboard with filters (§7).
- An approval queue — annotations are the correction mechanism (§6).
- Role-based read-only access — not available at platform level (F5).
- GitHub/repo automation — C11, deferred.
- Multi-org aggregation — the plugin DB is per-org by construction.

## 9. Verification habits for this rework

- **Every chunk ends with a green `bun run check` and a clean `git status --porcelain`** — the
  committed bundle is part of the artifact, and a dirty tree means the bundle no longer matches `src/`.
- **Migrations are tested against a V1 database built from 001**, not against an empty file — the
  only interesting failures are on data that already exists.
- **Skill ↔ manifest names are asserted by test** (C9) — this is the one drift class that makes the
  agent silently useless.
- **The dev instance is the only target** until V2 is proven; the Docker deployment keeps running V1.
- After each chunk: one screenshot or one recorded agent run in `docs/`, so the next session can see
  the state instead of reconstructing it.

## Appendix — current state V2 replaces

| File | Size | V2 fate |
|---|---|---|
| `migrations/001-research.sql` | 25 lines | untouched (schema renamed by 002) |
| `src/store.ts` | 231 lines | rewritten (C2) |
| `src/actions.ts` | 138 lines | rewritten (C3 — the gen-1 bridge that kept C2 green is gone) |
| `src/ui.tsx` | 606 lines | rewritten (C4–C6, C8) |
| `src/store.test.ts` | 4 tests | kept, extended |
| `nakama.plugin.json` | 181 lines | actions + migrations rewritten, UI block unchanged |
| `skills/research-coordinator/SKILL.md` | 19 lines | rewritten (C9a), extended (C9b) |
| vendor path, harness scripts | — | unchanged |
