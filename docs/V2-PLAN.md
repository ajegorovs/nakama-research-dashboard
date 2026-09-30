# V2 plan — coordination model (topics → development axes → evidence)

**Status:** proposal, **not started**. Nothing in here has been implemented.
**Input:** [`reviews/2026-09-30-v2-structural-redesign.md`](reviews/2026-09-30-v2-structural-redesign.md)
(external review of V1, kept verbatim; §16 lists its suggested sequence).
**Written:** 2026-09-30, checked against Nakama v0.4.31 and this repo at `8688a08`.
**Working assumption:** everything happens on the throwaway dev instance
(`services/nakama/scripts/run-dev-instance.sh`, `127.0.0.1:4399`). The Docker deployment and the
in-tree copy on the Nakama clone's `research-dashboard` branch are **not** touched until V2 is proven.

## 0. How to resume

1. Read §2. Three findings there change the review's plan, and one of them (`F1`) means migration 002
   as written in the review **would fail**.
2. Answer §7 (open decisions). **C1 cannot start without D1–D3**; C3 can't start without D4.
3. Work §6 in order. Each chunk is self-contained: deliverable, files, acceptance test, evidence
   command, dependencies. Do not start a chunk whose dependencies are unmet — most of the risk here
   is in the seams between chunks, not inside them.
4. Reinstall on the dev instance to exercise migrations end-to-end (`plugin-smoke.sh`).

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

**F7 — `inputSchema` is not validated by the platform.** `PluginActionContribution.inputSchema:
unknown`; it is passed to the model as documentation. A nested `reconcile_topic` payload therefore
needs hand-written validation in `src/actions.ts` (the existing pattern) **and a test** — otherwise a
malformed nested payload reaches the store.

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

**P2 — `development_axes.repository_id` contradicts the model's own premise.** The whole point of §1
is that work spans repositories, but an axis can name exactly one repo. An axis touching a model repo
and a data repo has nowhere to go. → Add `axis_repositories(axis_id, repository_id, relationship)`,
the same five-line shape as `topic_repositories`, and drop `repository_id` from the axis (or keep it
as the "primary" repo for display). Recommendation: add the join table; keep `repository_id` as the
display default.

**P3 — `topics.status` has no vocabulary.** The review declares `DEFAULT 'active'` and stops. V1 uses
`active|paused|done`; axes get `active|draft|blocked|parked|completed|abandoned`. Two overlapping
vocabularies on one screen is how drift starts.
→ Topics: `active | paused | completed | archived`. A topic is not "blocked" — its axes are. Declare
the list once (manifest enum + store constant) and have the UI switch on the same constant.

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

### C1 — Migration `002-coordination-model.sql` + migration tests · depends on D1, D2, D3 · review step 1

Deliverable: `migrations/002-coordination-model.sql`, a manifest entry, `src/migration.test.ts`.
Must contain: rename `projects`→`projects_v1`, `activities`→`activities_v1` (F1); the new schema with
`confidence` columns per D1, `axis_repositories` per D2, topic states per D3; the V1→V2 copy with the
source-type map (F2) and `recorded_at = occurred_at` (F3); indexes.

Acceptance (all automated):
- Build a V1 database by applying 001, insert 2 projects + ≥3 activities covering every legacy
  `source_type`, apply 002, then assert: `topics` has the 2 rows with the same ids and values; the new
  `activities` has the 3 rows with mapped source types, `axis_id IS NULL`, `recorded_at = occurred_at`;
  `projects_v1` / `activities_v1` still hold the originals; `PRAGMA foreign_key_check` returns nothing.
- 002 is applied by the platform on the dev instance (Reinstall) and appears once in
  `_nakama_plugin_migrations`.

Evidence: `bun test src/migration.test.ts`; `services/nakama/scripts/plugin-smoke.sh` after a Reinstall.
Risk: **this is the only irreversible step** — it runs on existing data, and the platform refuses
downgrades. Test it on a database built from 001 first, and take a **file-level copy of the live DB
before the first Reinstall on the deployment** — a restore is the only rollback that exists.

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

### C3 — Action surface v2 (+ provenance, + actors) · depends on C2, D4 · ships with C9 · review steps 3, 4

Deliverable: `nakama.plugin.json` actions rewritten; `src/actions.ts` rewritten; `src/actions.test.ts`.

Must contain: the semantic toolset (`get_overview`, `get_topic`, `search_dashboard`,
`reconcile_topic`, `record_activity`, `add_annotation`, `register_repository`, `register_person`) with
`exposeAsTool` per D4; UI-only CRUD actions with `exposeAsTool: false`; hand-written validation for
the nested `reconcile_topic` payload (F7); `context.actor.id` recorded on annotations/activities and
used to link the acting user to a `people` row when one exists (F6 — never trust identity from
`input`); `activitySinceDays` on `get_overview` (default 14) as a query parameter, not stored state.

Acceptance:
- Action tests: every action returns `{ok:true,…}` on valid input; malformed nested payload, unknown
  id, and bad enum each return `{ok:false,error}` rather than throwing.
- `reconcile_topic` is atomic (inherits C2's rollback test at the action level) and is the **only**
  write path the librarian needs for a topic update.
- Actor attribution: an action invoked by a known Nakama user records that user; an unknown one
  records `actor_type` without inventing a person row.

Evidence: `bun test src/actions.test.ts` + `plugin-smoke.sh` + one recorded agent run showing how many
`find_tools` calls it takes to load the surface (D4's data point).
Risk: **breaking change** — do not merge this without C9 in the same release.

### C4 — Overview UI (the 10-second view) · depends on C3 · review steps 5, 14

Deliverable: new default screen in `src/ui.tsx`: topics with their axes (kind · state), repo/branch/PR
line, current state, blockers called out, per-topic activity count and last-activity age, and the
window control (14d default; 7d/30d/all as parameters).

Acceptance: renders from one `get_overview` call; the window control changes only the query; a topic
with a blocked axis is visually distinct; no personal identifiers beyond display names the group
itself entered.
Evidence: `verify-plugin-page.mjs --write` + screenshots in `docs/screenshots/`.

### C5 — Topic detail (axes + per-axis history) · depends on C4 · review steps 5, 6, 10

Deliverable: topic view with description, people, repositories, and one card per axis (state, kind,
branch, PR, current state, blocker, confidence, people) whose history expands **inside the card** —
never one merged log for the whole topic.

Acceptance: activity is shown per axis with its source type/ref; editing an axis sends
`expectedVersion` and surfaces a conflict (C7 wires the full flow); annotations render next to the
axis they belong to.

### C6 — People and Repositories views · depends on C5 · review steps 7, 11, 12

Deliverable: two internal views of the same page (the platform allows exactly one page slot, so these
are tabs/routes inside it). People: what this person is working on now + recent activity. Repositories:
which topics the repo supports, which axes/branches it carries, recent activity.

Acceptance: the people list answers "what is X working on" in one query; a repo serving two topics
shows both; people/repo filters compose with the C4 window.

### C7 — Optimistic concurrency end-to-end + multi-user test · depends on C5 · review steps 8, 9

Deliverable: version round-trip in the UI (send `expectedVersion`, handle `conflict` without losing
the user's text), plus a two-session test: A opens an axis at v7, B saves → v8, A saves → conflict,
A's retry succeeds against v8.

Acceptance: the test above is automated (two store sessions against one file is enough; a
browser-level test only if it stays cheap); no silent last-write-wins anywhere.

### C8 — Provenance in the UI · depends on C3, C4

Deliverable: inferred/uncertain claims are visibly marked wherever they appear (overview, axis card),
with their evidence reference; annotations are visually distinct from machine state.

Acceptance: an axis with `confidence: inferred` cannot be mistaken for confirmed state in any view;
`confirmed` requires a human or an explicit evidence source, and the store rejects a `confirmed` claim
that carries no evidence ref.

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

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Confidence granularity (P1) | (a) one per axis · (b) three columns · (c) `axis_claims` table | **(b)**; (c) only if claims get revised often |
| **D2** | Axis ↔ repository cardinality (P2) | (a) one repo per axis · (b) add `axis_repositories`, keep `repository_id` as display default | **(b)** |
| **D3** | Topic status vocabulary (P3) | (a) undefined as reviewed · (b) `active/paused/completed/archived` · (c) reuse the axis states | **(b)** |
| **D4** | Exposed tool count | (a) 8 as reviewed (two `find_tools` loads) · (b) consolidate to ≤5 (fold `register_person`/`register_repository` into `reconcile_topic`) | **(a)** first and measure the agent run; only consolidate if discovery friction shows |
| **D5** | Legacy V1 data | (a) copy it (C1 as written) · (b) skip the copy, start clean (the dev data is seeded demo data) | **(a)** — the copy costs one test and keeps the option of migrating a real instance later |
| **D6** | This plan is in the public repo and names the group's topics | (a) keep · (b) genericise topic names to `Topic A/B` | your call — placeholders are already applied to people and private repo owners |

**Frame sent to the reviewer:** [`reviews/2026-09-30-v2-plan-review-request.md`](reviews/2026-09-30-v2-plan-review-request.md)
— the six delta questions only (D1, D2, D3, the 002 mechanism, the C9 split, D4), each with the exact
SQL of the recommended option, plus an explicit "don't re-read the model" note. Their answers land here.

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
| `src/actions.ts` | 138 lines | rewritten (C3) |
| `src/ui.tsx` | 606 lines | rewritten (C4–C6, C8) |
| `src/store.test.ts` | 4 tests | kept, extended |
| `nakama.plugin.json` | 181 lines | actions + migrations rewritten, UI block unchanged |
| `skills/research-coordinator/SKILL.md` | 19 lines | rewritten (C9a), extended (C9b) |
| vendor path, harness scripts | — | unchanged |
