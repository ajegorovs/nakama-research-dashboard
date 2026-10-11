# Dashboard minimal implementation design

Status: **source-grounded design; the migration and the full data/tool/read contract below are implemented and
tested locally.** The migration (`migrations/006-task-plan-text.sql`), its manifest declaration, the
store/tool contract, the read-projection additions (§5) and the page reads of §6 (`ScopedPage`,
`activityPage`/`problemPage`, the optional `offset`/`pageSize` inputs and their schemas) all exist in the
working tree with their acceptance tests. No deployment, live write or restart is part of this step. Every
schema, type and projection claim below was re-read against the working tree at the anchors given. It is
written to be read from a clone and carries no personal or machine identity (loopback addresses only; no
endpoints, hosts, credentials or account ids).

Read with `docs/design/dashboard-data-and-maintenance-contract.md` and
`docs/design/dashboard-information-architecture-pivot.md`.

**Vocabulary (unchanged):** project = `topics`, workstream = `development_axes`, task = `problems`,
scoped plan = `plans` + `plan_steps`.

**Authority.** The owner approved three product semantics — task meaning/states, simple plan ownership, and
short/full text with protected human authorship. Everything else below is either a mechanical default this
design selects (marked **[E]**, engineering selection) or is left as a real blocker (§14). Live writes,
profile changes, inference, deployment and restarts remain outside this step.

**Frozen / off-limits.** `prototypes/dashboard-ui-rework/` (including `data.json`), `docs/` spec/plan,
`src/`, `migrations/`, `nakama.plugin.json` are **not edited** by this design; all deltas are proposals.

---

## 1. Owner-approved semantics vs engineering selections

| Item | Kind | Decision |
|---|---|---|
| Tasks = general actionable work; states `open`/`blocked`/`resolved`; revise blocker-only meaning; preserve IDs/history | **Owner approved** | Adopted |
| Plans = optional simple ordered plans at project / workstream / task scope; no graphs or rollups | **Owner approved** | Adopted |
| Text: project `summary` = concise orientation, `description` = full purpose; task `title` = concise and independently authored; librarian may synthesize within human-authored bounds | **Owner approved** | Adopted |
| Page size **5**; offset-based numbered pages | **[E]** | Selected (contract §"Pagination" left the number open) |
| Task order `created_at ASC, id ASC`; activity order `occurred_at DESC, id DESC` | **[E]** | Selected |
| Page envelope `{ items, offset, limit, total, hasMore }`, `total` = same-predicate count in the same read snapshot | **[E]** | Selected |
| Refresh-on-write page policy (no page pinning / no `snapshotAt`) | **[E]** | Selected |
| `Plan.owner` as a discriminated union (rather than three loose nullable fields) | **[E]** | Selected |
| No new `problems.blocker` column (a blocked reason is its body/notes) | **[E]** | Selected (engineering choice: the owner approved the blocked *state*, not how its reason is stored; the contract classifies the blocked-count gap as D/M, `dashboard-data-and-maintenance-contract.md:26`) |
| `record_activity.problemId` wired | **[E]** | Selected (repairs the advertised tool contract; the contract flags it as a write-contract gap W, `dashboard-data-and-maintenance-contract.md:41`, not an owner approval) |
| Workstream card exposes enduring axis `description` | **[E]** | Selected |

---

## 2. Schema changes — migration `006-task-plan-text.sql`

**Conventions copied from `004-ux-v2-model.sql` (verified, not invented):** `PRAGMA foreign_keys = OFF`
and `PRAGMA legacy_alter_table = ON` before `BEGIN IMMEDIATE` (`004:49-60`); a `DROP TABLE IF EXISTS *_new`
before each rebuild; explicit column lists; `IF NOT EXISTS` indexes and triggers; the whole file inside one
transaction. The file **must be declared in `nakama.plugin.json` → `database.migrations`** or the host never
runs it (`nakama.plugin.json:930-953`).

### 2.1 `plans` — the body is rebuilt to retire `axis_id`; ownership moves to `plan_owners`

> **Revision (verified):** the first draft put the three owner columns *inside* the rebuilt `plans` body and
> the task `title` *inside* the rebuilt `problems` body. That shape is **unsound on the host's applier** and
> is replaced here. The resolution and its executable proof are `.hermes/scratch/migration-006-safety-resolution.md`
> and `.hermes/scratch/probes/migration-006-replay-probe.mjs` (38/38), reproduced in `src/migration-006.test.ts`.

The load-bearing fact, measured on `bun:sqlite` 3.53.2 (the engine 004 was verified on and the one
`harness/*.mjs` use): `Database.exec(script)` propagates an error **only from the final statement** of a
script. An error in any earlier statement is swallowed and execution continues to `COMMIT`. So a migration
that rests safety on a CHECK abort is unsound here — the abort is never surfaced, the guarded
`INSERT … SELECT` is silently skipped, and `COMMIT` lands an **empty table with orphaned children**. A
design that instead copies a new column in-place is worse: a reset to `''` raises nothing at all.

**The rule that follows: a replay-safe migration on this applier is total — no statement may fail, ever.**
Every NEW user-data field therefore stays OUT of the rebuilt tables, in side tables the rebuilds never
touch; a rebuild changes a CHECK vocabulary only and copies the **identical column set**, so its copy is a
pure identity on every run.

```
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;
BEGIN IMMEDIATE;

-- Capture the retired owner first, into a retained stage. `CREATE TABLE IF NOT EXISTS … AS SELECT` is a
-- no-op when the stage already exists (verified), so on replay it neither re-reads the retired column nor
-- errors.
CREATE TABLE IF NOT EXISTS plans_legacy_owner AS
  SELECT id AS plan_id, axis_id FROM plans;

-- The body is rebuilt to the columns common to both shapes; ownership is not here.
DROP TABLE IF EXISTS plans_new;
CREATE TABLE plans_new (
  id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO plans_new (id, summary, author_type, author_id, version, created_at, updated_at)
SELECT id, summary, author_type, author_id, version, created_at, updated_at FROM plans;
DROP TABLE plans;
ALTER TABLE plans_new RENAME TO plans;

-- The polymorphic owner, OUTSIDE the rebuilt body. Exactly one of the three is set (the same XOR shape
-- state_log uses). Seeding is guarded (no-op on replay) AND filtered to plans and axes that still exist —
-- the retained stage keeps a row for a deleted legacy plan, and an unguarded insert would resurrect it as
-- a dangling owner (see §12.1 item 8).
CREATE TABLE IF NOT EXISTS plan_owners (
  plan_id    TEXT PRIMARY KEY REFERENCES plans (id)            ON DELETE CASCADE,
  topic_id   TEXT REFERENCES topics (id)                       ON DELETE CASCADE,
  axis_id    TEXT REFERENCES development_axes (id)             ON DELETE CASCADE,
  problem_id TEXT REFERENCES problems (id)                     ON DELETE CASCADE,
  CHECK ((topic_id IS NOT NULL) + (axis_id IS NOT NULL) + (problem_id IS NOT NULL) = 1)
);
INSERT INTO plan_owners (plan_id, topic_id, axis_id, problem_id)
SELECT s.plan_id, NULL, s.axis_id, NULL FROM plans_legacy_owner s
WHERE NOT EXISTS (SELECT 1 FROM plan_owners o WHERE o.plan_id = s.plan_id)
  AND EXISTS (SELECT 1 FROM plans p WHERE p.id = s.plan_id)
  AND (s.axis_id IS NULL OR EXISTS (SELECT 1 FROM development_axes a WHERE a.id = s.axis_id));

-- Restores the design's §9 delete semantic (deleting a topic/axis/task removes the plans it owns) now that
-- ownership is a side table: the FK cascades the owner row, and this trigger retires the ownerless body.
CREATE TRIGGER IF NOT EXISTS plan_owners_retire_plan
AFTER DELETE ON plan_owners
WHEN EXISTS (SELECT 1 FROM plans WHERE id = OLD.plan_id)
BEGIN DELETE FROM plans WHERE id = OLD.plan_id; END;

CREATE INDEX IF NOT EXISTS plan_owners_by_axis    ON plan_owners (axis_id, plan_id);
CREATE INDEX IF NOT EXISTS plan_owners_by_topic   ON plan_owners (topic_id, plan_id);
CREATE INDEX IF NOT EXISTS plan_owners_by_problem ON plan_owners (problem_id, plan_id);
```

- **First-run preservation.** Every pre-006 plan had `axis_id NOT NULL`; the stage captures it, the body is
  copied unchanged, and the guarded seed writes one `plan_owners` row per plan. Plan ids are unchanged, so
  `plan_steps.plan_id` links survive (`DROP TABLE plans` does not cascade while FKs are OFF — `004:40-45`).
- The XOR CHECK is the same shape as `state_log`'s parent XOR (`004:230`) and `annotations`' one-canonical-
  target rule (`004:322-323`) — not a new convention.
- `plans_legacy_owner` is **retained by design**: it is the replay-safe seed source. On replay the
  `IF NOT EXISTS` short-circuits, so it is never re-read and never errors; a future cleanup that removes it
  must first make the seed idempotent by other means.
- `plan_steps` is **unchanged**.

### 2.2 `problems` — widened state vocabulary only; the title lives in `problem_titles`

> **Revision (verified):** the first draft added a `title` column *inside* the rebuilt `problems` body and
> copied the literal `''` into it. That silently **erases a human's title on a replay** (no error — probe
> §A), so the column is not in the body. The rebuild now changes the state CHECK only and copies the
> identical column set; the title is a side table.

```
DROP TABLE IF EXISTS problems_new;
CREATE TABLE problems_new (
  id TEXT PRIMARY KEY,
  axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'blocked', 'resolved')),
  state_confidence TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (state_confidence IN ('confirmed', 'inferred', 'uncertain')),
  plan_step_id TEXT REFERENCES plan_steps (id) ON DELETE SET NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO problems_new
  (id, axis_id, statement, state, state_confidence, plan_step_id,
   author_type, author_id, version, created_at, updated_at)
SELECT id, axis_id, statement, state, state_confidence, plan_step_id,
       author_type, author_id, version, created_at, updated_at
FROM problems;
DROP TABLE problems;
ALTER TABLE problems_new RENAME TO problems;
CREATE INDEX IF NOT EXISTS problems_by_axis  ON problems (axis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS problems_by_state ON problems (state, updated_at DESC);

-- The task short text, OUTSIDE every rebuilt table. Absence of a row reads as ''. Created once; the
-- rebuilds never touch it, so a title survives a replay.
CREATE TABLE IF NOT EXISTS problem_titles (
  problem_id TEXT PRIMARY KEY REFERENCES problems (id) ON DELETE CASCADE,
  title TEXT NOT NULL
);
```

- **Existing-row fallback.** A migrated task has no `problem_titles` row, so its `title` reads as `''`.
  Renderers must **not** synthesize a title from `statement` (the pivot forbids an invented short title —
  `dashboard-information-architecture-pivot.md` §"Text semantics"). No title ⇒ the body is shown as content
  and the title slot stays empty.
- Children survive the rebuild (FKs OFF): `problem_repositories`, `problem_people`, `annotations(problem_id)`,
  `activities(problem_id)` and `external_object_mappings.problem_id` (`004:185-198,300-324,346-370`;
  `005:75-86`). No `open`/`resolved` row is re-meant.

### 2.3 `state_log` — widen the problem branch of both conditional CHECKs

`state_log` validates states conditionally on the target type (`004:232-238`). Adding `blocked` to the
problem branch requires rebuilding the table (SQLite cannot ALTER a CHECK). Its two indexes, two bootstrap
partial-unique indexes and two append-only triggers are recreated verbatim.

```
DROP TABLE IF EXISTS state_log_new;
CREATE TABLE state_log_new (
  id TEXT PRIMARY KEY,
  axis_id    TEXT REFERENCES development_axes (id) ON DELETE CASCADE,
  problem_id TEXT REFERENCES problems (id)         ON DELETE CASCADE,
  from_state TEXT,
  to_state   TEXT NOT NULL,
  origin   TEXT NOT NULL CHECK (origin IN ('migration', 'human', 'agent')),
  actor_id TEXT NOT NULL DEFAULT '',
  observed_at TEXT,
  recorded_at TEXT NOT NULL,
  CHECK ((axis_id IS NOT NULL) <> (problem_id IS NOT NULL)),
  CHECK (CASE WHEN axis_id IS NOT NULL
              THEN to_state IN ('active','draft','blocked','parked','usable','completed','abandoned')
              ELSE to_state IN ('open','blocked','resolved') END),
  CHECK (from_state IS NULL OR CASE WHEN axis_id IS NOT NULL
              THEN from_state IN ('active','draft','blocked','parked','usable','completed','abandoned')
              ELSE from_state IN ('open','blocked','resolved') END)
);
INSERT INTO state_log_new
  (id, axis_id, problem_id, from_state, to_state, origin, actor_id, observed_at, recorded_at)
SELECT id, axis_id, problem_id, from_state, to_state, origin, actor_id, observed_at, recorded_at
FROM state_log;
DROP TABLE state_log;
ALTER TABLE state_log_new RENAME TO state_log;
CREATE INDEX IF NOT EXISTS state_log_by_axis    ON state_log (axis_id, recorded_at);
CREATE INDEX IF NOT EXISTS state_log_by_problem ON state_log (problem_id, recorded_at);
CREATE UNIQUE INDEX IF NOT EXISTS state_log_bootstrap_axis
  ON state_log (axis_id)    WHERE origin = 'migration' AND axis_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS state_log_bootstrap_problem
  ON state_log (problem_id) WHERE origin = 'migration' AND problem_id IS NOT NULL;
-- recreate state_log_no_update and state_log_no_delete verbatim from 004:252-272,
-- including the load-bearing WHEN clause on state_log_no_delete that references development_axes and problems
COMMIT;
```

- The `WHEN` clause on `state_log_no_delete` is load-bearing (`004:258-272`): a plain `BEFORE DELETE` would
  also fire on FK cascades and make deleting any axis or problem impossible. Reproduced unchanged.
- Widening the **task** vocabulary does **not** touch the **axis** vocabulary (`004:77-78`), which already
  contains `blocked`. A blocked task and a blocked workstream stay separate facts (contract line 26).

### 2.4 Explicitly not added

No `problems.blocker` column (a blocked reason is steering/notes/activity — §8). No checkpoint-graph table,
no rollup table, no person role/bio column, no new event marker, no `topics` author columns (see §8.3).

### 2.5 Migration execution and replay contract — **resolved: convergence, not refusal**

The host applies each migration file with `db.exec()` and writes its ledger row (`_nakama_plugin_migrations`)
only **after** the file has run; no transaction wraps the ledger write (`004:22-26`; the ledger name is the
one the harness reads at `harness/test-004.mjs:391,416`). A pending migration makes the host build a **new
database generation** — a fresh copy of the current one with the migrations applied — leaving the previous
generation as the rollback artifact (`harness/update-plugin.mjs:7-10,157-159`).

006 carries the same crash-window bound 004 documents, **and by construction it is stronger**: every
statement in the file is total (no statement can fail), so a second execution always converges rather than
aborting.

- **Crash-window replay.** The host re-runs the whole file across a crash *after* it commits but *before*
  the ledger row is written. Because the file is total, the second run is **byte-identical**: same rows,
  same schema, same FK clauses, `integrity_check ok`. This is *convergence*, not a refusal (test §12.1 item 6).
- **Replay after arbitrary post-migration writes also converges and preserves everything** — task titles,
  the `blocked` state, appended `state_log` rows, and topic-/task-/axis-scoped plans with their owners and
  steps (test §12.1 item 7). There is no silent reset and no data-destroying path: the file never has a
  statement that can fail, so the applier's error-swallowing is irrelevant.
- **No "refusal boundary" is claimed.** The earlier draft's distinction between "converges" vs "refuses"
  dissolves: on this applier the refusal was a mirage (it silently destroyed `plans` and orphaned
  `plan_steps`), and the safe design simply converges. Stated plainly so later silence is not read as a
  weaker guarantee.
- **Order is for readability only** (references are by name): `plans`/`plan_owners` → `problems`/`problem_titles`
  → `state_log`. `legacy_alter_table = ON` keeps the `*_new` RENAME a plain name change so the surviving
  triggers that mention the just-dropped tables do not force a failing schema re-parse on a second
  execution (`004:51-57`). No dynamic or generated SQL is used anywhere.

---

## 3. Store types and serializers

### 3.1 `Plan` owner

```
export type PlanOwner =
  | { scope: "topic";   topicId: string }
  | { scope: "axis";    axisId: string }
  | { scope: "problem"; problemId: string };

export type Plan = {
  id: string;
  owner: PlanOwner;
  /** Legacy axis owner, retained for axis-plan readers: `owner.axisId` on an axis plan, null otherwise. */
  axisId: string | null;
  summary: string;
  authorType: Author;
  authorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
```

- `PlanRow`: the three owner columns (`topic_id`/`axis_id`/`problem_id`, nullable) come from the
  `plan_owners` join, not from the `plans` body (migration 006, §2.1); `PLAN_SELECT` is the one query shape
  every plan read uses.
- `toPlan(row)`: derives `owner` from whichever owner column is non-null (exactly one by the CHECK), and
  sets the legacy `axisId` to that column for an axis plan and to `null` otherwise, so every existing
  axis-plan reader keeps its field. A row with no owner is a schema violation, not a case to paper over.
- `ProblemRow` gains `title: string | null` (from `problem_titles` via `LEFT JOIN`); `toProblem` maps
  `title: row.title ?? ""`. `PROBLEM_SELECT` is the one query shape every problem read uses.
- `Problem` gains `title: string`; `ProblemState` and `PROBLEM_STATES` widen to
  `["open", "blocked", "resolved"]` (`store.ts:65,92`).

### 3.2 Serializer / consumer inventory (all touched sites)

| Site | Anchor | Change |
|---|---|---|
| `Plan` type | `store.ts:351-360` | add `owner: PlanOwner`; **retain** legacy `axisId: string \| null` |
| `PlanRow` | `store.ts:484-493` | three nullable owner columns from the `plan_owners` join |
| `toPlan` | `store.ts:917-928` | derive `owner`; set legacy `axisId` (axis id, else null) |
| `Problem` / `ProblemRow` / `toProblem` | `store.ts:336-348,470-482,901-915` | add `title` (from `problem_titles` join) |
| `listPlans(axisId)` | `store.ts:4628-4636` | **keep as-is** (existing public axis wrapper); add `listPlansFor(owner)` beside it |
| `getPlan` / `getPlanStep` | `store.ts:4638-4650` | unchanged shape; `getPlan` result carries `owner` |
| `planForAxis` | `store.ts:4677-4683` | keep; add `planForTopic`, `planForProblem`, and one `planFor(owner)` |
| `createPlan` / `updatePlan` | `store.ts:4974-5047` | owner-aware create; owner immutable on update |
| `reconcileTopic` plan loop | `store.ts:5882-5927` | owner resolution + step containment |
| `progressAxes` plan filter | `store.ts:5404,5423` | `plans.filter(p => p.axis_id === scan.id)` — still correct (axis plans only) |
| `assertPlanStepBelongsToAxis` | `store.ts:6537-6554` | → `assertPlanStepBelongsToProblem` (§9) |
| `AxisDetail.plan` | `store.ts:1261` | shape `{ plan: Plan; steps }` unchanged; `Plan.owner` appears inside |
| `ProgressAxisRow.plan` | `store.ts:1510-1515`, built `5446-5454` | local `{id,steps,stepsDone,summary}` unchanged |
| `TopicDetail` | `store.ts:1284-1302` | **add `plan` (project plan)** — currently omitted |
| `ProblemDetail` | `store.ts:1269-1281` | add `title` (inherited) and optional `plan` |
| `ProgressProblemRow` | `store.ts:1536-1560` | add `title` and optional `plan` |
| UI mirror types | `src/ui.tsx:239-362` | `axisId` retained so no plan consumer breaks; add the new read fields (topic `plan`, problem `title`/optional `plan`, axis-scan `description`) as optional mirror fields |

The in-repo UI/prototype/agent-facing projections read `{id, summary, steps, stepsDone}` only, and a grep of
`src/ui.tsx`, `prototypes/dashboard-ui-rework/app.js` and `src/*.test.ts` finds no *current* consumer of
`Plan.axisId` (the `.axisId` hits are all axis ids on problems/events/conflicts, never a plan). That is not,
however, a licence to **remove** the field: `Plan` is the store's public output type and `listPlans(axisId)`
is a public reader an out-of-repo axis-plan caller can use. Dropping `axisId` — or renaming it to `owner` —
is an output-contract **break**, not an additive change. This design therefore **adds** `owner`, **keeps**
`axisId` (null off an axis plan) and **keeps** `listPlans(axisId)`; adding `owner` is additive, the rename
would not have been.

---

## 4. Tool / action changes (input-additive; outputs add fields, remove none)

The host validates shape before dispatch (`actions.ts:14-18`) against the declared `inputSchema`; every new
input field below is optional, so existing callers keep working. Output changes **add** fields and remove or
rename none — in particular `Plan.axisId` is retained (§3), and a read that returned `Activity[]` still
returns that array beside any new page field (§6) — so a caller's existing shape is unchanged.

### 4.1 `reconcile_topic` — plan owner containment and step containment

`problems[]`:
- add `title` (string, `maxLength 300`, mirroring plan-step title at `nakama.plugin.json:574-578`).
- accept `state: "blocked"` on create (enum widened at `:501-503`); an update that carries `state` is still
  refused (`store.ts:5932-5938`) so state changes stay recorded transitions.

`plans[]` — owner is explicit and validated **before any write**:
- New owner fields beside the existing `axisId`/`axisTitle` (`nakama.plugin.json:547-556`): `topicId`
  (string) and `problemId` (string). Exactly one owner must resolve; the DB CHECK is the backstop.
- Owner resolution against the resolved topic `T`:
  - `topicId` → must equal `T.id`, else **refuse** (cross-topic).
  - `axisId`/`axisTitle` → `resolveAxisId(T.id, …)`, which already refuses an axis of another topic
    (`store.ts:6717-6742`).
  - `problemId` → the problem must exist and its axis's topic must be `T.id`, else **refuse** (cross-topic).
- An owner that resolves to a different topic, or no/ambiguous owner, is refused before the first write, so a
  failed plan never leaves a half-applied reconcile.
- `updatePlan` stays **owner-immutable**. When `planId` is present the owner **must be re-sent** (the
  reconciler resolves exactly one named owner on **every** plan write, create or update — the echoed owner
  is not optional); it is validated to equal the stored plan's owner and to be within `T`, and a mismatch or
  an absent owner is refused. The writer itself never changes an owner (`store.ts:5006-5047` gains only the
  echoed-owner check, not an owner column in its UPDATE).
- **Steps must belong to their plan.** For `steps[].stepId` the store must verify the step's `plan_id` equals
  the plan being written (which is itself validated to `T`); otherwise **refuse** ("step does not belong to
  this plan"). Today `updatePlanStep` (`store.ts:5906-5921`) is called by id with no such check — a cross-plan
  / cross-topic laundering hole this closes.

`transitions[]`: unchanged shape; `subject:"problem"` + `toState:"blocked"` now validates because
`PROBLEM_STATES` includes it.

### 4.2 `record_activity` — wire the advertised `problemId`

`nakama.plugin.json:652` already advertises "Naming a `problemId` records the event as evidence for that
problem", but the `inputSchema` (`:653-714`) has no `problemId` and `additionalProperties: false`, and the
dispatch (`actions.ts:361-387`) never passes one — so today the advertised field is rejected by the host.

- Add `problemId` (string, `maxLength 100`) to the `inputSchema`.
- Dispatch: resolve the problem against the resolved topic and axis **before** writing, and pass
  `problemId: optionalText(input.problemId, "problemId", 100)` into `store.addActivity`.
- **Membership is only partially enforced today — the pairing check must be added.** The exact current checks
  on this path are:
  - `addActivity` (`store.ts:3833-3858`): the named problem must exist; the topic must exist if named; the
    axis must exist if named or derived; and **`axis.topicId === topicId`** (axis belongs to the topic).
  - `insertActivity` (`store.ts:6597-6610`): when a `problemId` is given **and** the axis or topic is absent,
    it derives `axis_id`/`topic_id` from the problem's row.
  - There is **no** check that a supplied `axisId` equals the problem's own axis. So a `problemId` from
    another topic with **no** `axisId` is refused (its derived axis fails the topic check), but a
    `problemId` from another topic **together with** this topic's `axisId` — or a problem on a different axis
    of the same topic with another `axisId` — is accepted today and stored with a mismatched
    `problem_id`/`axis_id`.
  - **Implemented in `insertActivity`, not `addActivity`.** The pairing guard — a named problem's own axis
    must equal the axis the row is recorded against, and its topic must equal the row's topic — lives on the
    one insertion path every activity row goes through (`store.ts:7264`), so `addActivity`,
    `reconcileTopic` (which calls `insertActivity` directly) and the external-evidence collector are all
    covered. Placed in `addActivity` alone it was bypassable: `reconcile_topic` could store a
    `problem_id`/`axis_id` (or `topic_id`/`axis_id`) pair that disagreed. When no axis is supplied the axis
    is derived from the problem and the topic check above applies. A mismatch is refused with `invalid-input`
    (test §12.2 "Task-scoped activity via `record_activity`", and the reconcile-path pairing test beside it).

### 4.3 Constants

`PROBLEM_STATES = ["open","resolved"]` → `["open","blocked","resolved"]` (`store.ts:65`); `ProblemState`
follows (`store.ts:92`). `AXIS_STATES` unchanged.

---

## 5. Read / projection changes

| Read | Change | Anchor |
|---|---|---|
| `getTopicDetail` | add `plan` (the **project** plan) to `TopicDetail`; attach per-problem `title` and optional task `plan` | `store.ts:1284-1302,2610-2618` |
| `getAxisWorkstream` | per-problem task `plan`; axis plan already present; `coverage` unchanged | `store.ts:2710-2719` |
| `getOverview` | add `problemsByState: Record<ProblemState, number>` — one grouped query mirroring `axesByState`, so Open/Blocked counts come from stored state, not the current page | `store.ts:2816-2827,2792-2897` |
| `searchDashboard` | add a `problems[]` group matching `statement` **and** `title`; extend `truncated` | `store.ts:3489-3611` |
| `ProgressAxisRow` | add `description` (enduring axis purpose) so the card no longer reuses the mutable `current_state` reading as its "short purpose" | `store.ts:1502-1527`; card built `5421-5465` |
| `ProgressProblemRow` | add `title`, optional task `plan` | `store.ts:1536-1560,5550-5580` |

A task's `plan` projection is **the task's own plan or none** — never an inherited workstream plan (contract
line 81). All projections stay read-only and derive nothing a client must recompute.

**Affected schemas and mirror types.** Every item above changes a read *output*, not a host-validated input,
so none of them alters a `nakama.plugin.json` `inputSchema`. The mirror types in `src/ui.tsx` that name these
rows must gain the new fields to use them (`TopicDetail` gains `plan`; the Progress problem mirror gains
`title` and optional `plan`; the axis-scan mirror gains `description`) — optional on the mirror where the
view does not yet read them, so `tsc` stays green. The problem `title` is also a **write** input (§4.1), and
*that* does change the `reconcile_topic` `problems[]` `inputSchema`.

---

## 6. Pagination and ordering — new page reads; existing array reads kept

**Page size 5**, offset-based numbered pages, exposed as **new page-shaped reads**. The existing
array-return reads are **not** converted to a page.

- **The envelope:** `ScopedPage<T> = { items: T[]; offset: number; limit: number; total: number; hasMore: boolean }`.
- **New store methods return the page; the existing ones are untouched.** Add
  `activityPage(scope, { offset, limit }): ScopedPage<Activity>` and
  `problemPage(axisId, { offset, limit }): ScopedPage<Problem>` (or owner-scoped forms), each running
  `items` and `total` inside **one** `snapshot()` (`store.ts:2221-2241`), exactly as
  `getAxisWorkstream.coverage` already counts (`store.ts:2733-2775`). Keep `listActivity` returning
  `Activity[]` (`store.ts:2320-2352`), keep `getTopicDetail.activity`, `AxisDetail.history` and
  `getOverview.recentActivity` as arrays, and keep the `list_activity` action's `activity` array
  (`actions.ts:502-511`).
- **Dispatch through the reads the production UI already calls.** Expose the page from the **existing**
  actions (`get_topic`, `get_progress`, `list_activity`, `src/ui.tsx:5066,5070,5098,5246`) by adding an
  optional `offset`/`pageSize` input that yields a **new sibling field** — e.g. `get_progress` returns
  `activityPage`/`problemPage` beside `axes`/`problems`; `get_topic` (the agent read tool) returns
  `activityPage` beside `activity`; `list_activity` returns `activityPage` beside `activity`. **No new
  action key is added**, every new input is optional, and the old fields keep their arrays. The new
  `offset`/`pageSize` properties must be declared in those actions' `inputSchema`
  (`nakama.plugin.json:12-120,736-798`) — the host validates input against the schema before dispatch, so a
  field the schema omits never reaches the store.
- **`total` uses the same predicate and the same read snapshot as `items`.** A page and its total can never
  describe two different scopes.
- **The `id` tie-break is a SQL sort term, not exposed metadata.**
  - Activity: `ORDER BY occurred_at DESC, id DESC` — replaces `occurred_at DESC, rowid DESC`
    (`store.ts:2338`); `rowid` is database-local and must not be the portable contract key.
  - Tasks: `ORDER BY created_at ASC, id ASC` (already what `listProblems` uses, `store.ts:4590`).
- **Stability only for an unchanged dataset.** Concurrent inserts shift offsets; the UI re-fetches on write
  and shows the requested range. Offset plus a timestamp sort does **not** give concurrent stability
  (contract line 118) and no such claim is made. A `snapshotAt` upper bound is a later option, not part of
  the minimum.
- **Mirror types.** The new page fields need matching declarations in `src/ui.tsx`; the existing array
  fields keep theirs. No new generic paging framework.

---

## 7. Text authorship semantics — precise

### 7.1 Tasks: `title` and `statement` share one row, and authorship is row-level

`problems` has a **single** `author_type`/`author_id` pair (`004:174-175`), so a task's title and statement
cannot carry independent authorship. The rule below is provably non-laundering:

1. Compute `statementChanged` and `titleChanged` against the **stored** row, plus the unchanged-echo identity.
2. If either text field changes and the stored row is `human`-authored while the incoming caller is an
   agent, **refuse** with `human-authored`. The agent may not change *any* text on a row that holds human
   words — not the field it targeted, and not the other field. This is the guard the current code applies to
   `statement` only (`store.ts:4806-4824`); it must apply to the pair.
3. If no text field changes (both are echoes or absent) → authorship is left **exactly as stored**, so an
   agent's link/confidence/plan-step update cannot launder a human's text by repeating it back
   (`store.ts:4818-4823`).
4. If a text change is permitted (the row was `agent`-authored, or the caller is human) → set
   `author_type`/`author_id` to the incoming author for the whole row.

Consequence, stated plainly: an agent cannot add a `title` to a human-authored task that has none — the
person adds it. That is a boundary, not an oversight: with one author column per row, distinguishing an
"add" from a "replace" would require per-field authorship, which is a schema change with its own review.
Because any human write makes the row `human`, human text always implies a `human` row, and rule 2 therefore
covers both fields — an agent can never re-attribute human words to itself.

### 7.2 Topics: `summary`/`description` are **not** mechanically guarded — stated, not implied

`applyTopicPatch` (`store.ts:6105-6155`) writes `name`/`description`/`status`/`summary` with **no authorship
check**, and `topics` has **no** `author_type`/`author_id` columns (`002:27-38`; `TopicRow`
`store.ts:391-400`). The shipped rule that a topic `summary` is human-only exists **only** as instruction
text (`skills/research-coordinator/SKILL.md:107`), not as an enforced boundary.

Therefore:
- For **tasks** the human-authored bound is mechanically enforced by the existing guard (extended per §7.1).
- For **topics** there is **no mechanical authorship guard at all** — `topics` has no author columns and
  `applyTopicPatch` checks none. The owner-approved direction *permits* the librarian to draft and maintain
  topic `summary`/`description` from sources while respecting human words
  (`dashboard-data-and-maintenance-contract.md:146-149`), so guidance (§11) must **allow** source-grounded
  synthesis, not forbid it. Because the store enforces nothing here, the honest statement is that the bound
  is instruction-level only: it is written as a rule to follow, not as a guard. This design claims no
  protection the code does not provide, and adds none. Adding row-level authorship to `topics` is a schema
  change with its own review and is **not** part of 006.

### 7.3 Plans

`plans` already carries `author_type`/`author_id`, and `updatePlan` already guards the summary with
`assertTextIsReplaceable` (`store.ts:5019-5043`). No change.

---

## 8. `plan_step_id` semantics under polymorphic owners

`problems.plan_step_id` may reference a step iff the step's plan is owned by:
- the **same problem** (`plan.problem_id === problem.id`) — the task's own plan, or
- the **same axis** (`plan.axis_id === problem.axis_id`) — the existing same-axis workstream link.

A step owned by a topic, by another problem, or by another axis is **refused**. The current guard
`assertPlanStepBelongsToAxis` (`store.ts:6537-6554`) already enforces the same-axis case; it is generalized to
`assertPlanStepBelongsToProblem(planStepId, problem)` covering both allowed owners, and is called from both
`createProblem` (`store.ts:4725-4727`) and `updateProblem` (`store.ts:4831-4837`). Existing same-axis links
are preserved unchanged.

**Ordering consequence (plans-before-problems).** `reconcileTopic` processes `plans[]` before `problems[]`
(`store.ts:5881-5927`), so a task-owned plan must name an **existing** task id. A task and its plan cannot be
created in one reconcile: create the task first (read its id back), then a second reconcile creates/attaches
the plan. This is the intended boundary; no new aliases or dependency graph are introduced.

---

## 9. Delete, cascade, and version-touch inventory

- **Cascade graph.** `plans.topic_id`/`axis_id`/`problem_id` are `ON DELETE CASCADE`; `plan_steps.plan_id`
  is `ON DELETE CASCADE`; `problems.plan_step_id` is `ON DELETE SET NULL`. Deleting a topic/axis/problem
  therefore removes the plans it owns and their steps through FKs (`deleteTopic` `store.ts:3651-3661`,
  `deleteAxis` `3705-3715`). This introduces a path `problems → plans → plan_steps → problems`, which SQLite
  permits; a cascade test (§12.3) proves deletion completes and `PRAGMA foreign_key_check` is clean, and that
  the append-only `state_log_no_delete` `WHEN` guard (`004:266-272`) still permits the cascade while refusing
  a direct `DELETE FROM state_log`.
- **No `deletePlan` exists** today and none is added; a plan leaves with its owner.
- **`touch`** currently accepts only `"topics" | "development_axes"` (`store.ts:6698-6705`).
  `createPlan`/`updatePlan` touch the axis (`store.ts:5001`). Extend the plan writers to touch the owner's
  containing row with the **existing** union: topic-owned → touch `topics`; axis-owned → touch that axis;
  problem-owned → touch the problem's axis. No new table joins `touch`, and `problems.updated_at` is not
  repurposed.
- **Version.** `updatePlan` already calls `assertVersion("plan", …)` (`store.ts:5019`); owner immutability
  means an owner-echo mismatch is refused, not a version bump.

---

## 10. Rebuild-cost and index/trigger accounting (accurate)

006 rebuilds three tables and, per rebuild, drops and recreates their indexes; it recreates the state-log
triggers it dropped with the table.

- `plans`: **no `plans_by_*` indexes** — the owner columns are gone from the body. Ownership indexes move to
  `plan_owners`: `plan_owners_by_axis`, `plan_owners_by_topic`, `plan_owners_by_problem` (prefixed by
  `plan_id`). `plans_legacy_owner` is a small retained staging table (PK index only).
- `problems`: indexes `problems_by_axis`, `problems_by_state` (from 004, recreated). **No new index and no
  new column** — the title lives in `problem_titles` (PK index only).
- `state_log`: indexes `state_log_by_axis`, `state_log_by_problem` (from 004) + the two bootstrap partial
  unique indexes, and triggers `state_log_no_update`, `state_log_no_delete` (both from 004), all recreated.
- No other table is touched; no row is re-meant (the only additive store is the new `plan_owners` owner rows
  and the `problem_titles` side table).

---

## 11. Instruction changes — applied in the shipped skill

The instruction changes are **applied**, not draft. `skills/research-coordinator/SKILL.md` (working tree) now
carries the owner-approved **librarian synthesis within human-authored bounds**
(`dashboard-data-and-maintenance-contract.md:146-149`) — it no longer describes problems as blocker-only work,
and it no longer restricts a topic `summary` to human-stated interpretation. What the skill now says:

1. **Problem → task** (`:8`, `:73`): "**problems** (tasks) are the general actionable work inside it — each
   `open`, `blocked` or `resolved` … **A problem is a real record, not a status note** — and a task is general
   actionable work." (The blocked-workstream-not-a-blocked-task split is stated at `:65-67`/`:73`.)
2. **Text** (`:87-97`, `:125-128`): "A topic's `summary` is a concise orientation and its `description` is the
   full purpose; a task's `statement` is the full text and its `title` is a concise label distinct from it.
   You **may draft and maintain** a topic's `summary`/`description` and a task's `title` from sources you
   actually read — but read the record first (`get_topic`), send it back with `expectedVersion`, and
   **preserve any known human edit**: never overwrite words a person wrote or corrected; propose the change
   instead." This grants the approved synthesis and states the read-before-write / `expectedVersion` /
   preserve-human-edits discipline.
3. **Plans** (`:80-86`): "A plan is optional and belongs to one owner … exactly one of a project, a workstream
   or a task; keep it a simple ordered step list — no rollups. A task's plan is created after the task
   exists."

**Enforcement honesty.** For **tasks** the store enforces the human-authored bound (§7.1) and the skill keeps
saying so (`:92-94`). For **topics** there is no mechanical guard (§7.2) — the store will let an agent
overwrite a topic's `summary` — so the skill's "never overwrite" line is **instruction, not enforcement**, and
is labelled as such (`:96-97`, `:125-128`); the design must not imply a guard that does not exist.

These are guidance edits only; the task-text and plan-ownership points describe no new mechanism.

---

## 12. Executable acceptance tests

Tests run under `bun test src`. The store suites build a database from the shipped migrations
(`store-ux-v2.test.ts:24-46`); their `MIGRATIONS` arrays stop at `004` and must include `005`/`006` for the
new suites, or a new suite lists them itself. Gate afterwards: `bun run check` (typecheck + build +
`bun test src`) and `bun run typecheck:host` where the host checkout is available. Public-record hygiene
guard `bun run harness:records` if any test output is committed.

### 12.1 `src/migration-006.test.ts` — first-run preservation + replay boundary

Setup: apply `001–005`, seed a topic/axis, one `open` problem with a bootstrap and one `resolved`
transition, and one axis-scoped plan + steps (pre-006 shape). Apply `006`. Assert:

1. **Preservation.** The problem's `id`, `statement`, `author_type`, `author_id`, `created_at` are
   byte-identical; its `state_log` rows are unchanged; `title === ''` on the migrated row.
2. **Widened vocabulary.** A `blocked` value inserts into `problems` and `state_log`.
3. **Old plans survive.** The pre-006 axis plan keeps its id, its `axis_id`, and its steps; `topic_id` and
   `problem_id` are NULL.
4. **XOR enforced.** An INSERT with zero owners and one with two owners each raise (the §2.1 CHECK).
5. **Cascade after rebuild.** Deleting the axis succeeds (the rebuilt `state_log_no_delete` `WHEN` guard
   permits the cascade) while a direct `DELETE FROM state_log` is refused.
6. **Crash-window replay converges.** Applying the whole `006` file a second time does not throw and leaves
   the tables, schema and FK clauses byte-identical — `integrity_check ok`.
7. **Replay after a write converges and preserves.** After a human title (in `problem_titles`), a `blocked`
   state, an appended transition, a **topic-owned** plan and a **task-owned** plan with a step, applying
   `006` again does not throw, does not skip a statement, resets nothing, and leaves every one of those rows
   in place with `PRAGMA foreign_key_check` clean. This replaces the earlier draft's "is refused" item: on
   this applier the refusal was a mirage (§2.5).
8. **Replay after deleting a legacy axis plan does not resurrect it.** With a stage row retained for the
   deleted plan, replaying `006` leaves `plan_owners` without that plan and `PRAGMA foreign_key_check` clean
   — the filtered seed (§2.1) does not re-create a dangling owner for a plan (or an axis) that is gone.
9. **Negative controls.** The design's rejected in-place shapes are kept as regression tests: the applier
   swallows a non-final statement's error and still commits; an in-place rebuilt `title` column is silently
   reset by a replay. Both assert the failure the side-table design avoids, so no future edit reintroduces it.

### 12.2 `src/store-task-plan-text.test.ts` — writers + reads (migrations 001–006)

- **Task states.** Create `{statement, state:"blocked"}` → stored `blocked`. Transition `blocked→resolved`
  and `resolved→open`; two appended `state_log` rows with correct `from_state`/`to_state`/`origin`; a repeat
  of a state raises `kind:"no-op"` (`store.ts:4895-4900`).
- **Task title + mixed-text authorship (negative).** On a **human-authored** task with a title: an agent
  changing the title alone is refused `human-authored`; an agent changing the statement alone is refused;
  an agent echoing both while changing links succeeds and leaves `author_type === "human"`. On an
  **agent-authored** task, a human changing the title flips the row to `human`, after which an agent can no
  longer change the statement. Nothing is written on any refusal.
- **No derived title.** A problem created without a title reads back `title === ""`; no code path copies
  `statement` into `title`.
- **Plan ownership (XOR) + owner dispatch.** A topic plan, an axis plan and a task plan each read back with
  the right `owner.scope` and id. A plan with no owner, or two owners, is refused. Steps order by `position`
  then `created_at, id` (`store.ts:4685-4694`); an unordered plan keeps insertion order.
- **Cross-topic refusal (negative).** A reconcile on topic A naming topic B's axis, or topic B's problem, is
  refused **before any write** (no plan, and no other payload field, lands).
- **Step laundering (negative).** A reconcile whose `steps[].stepId` belongs to a plan of another topic (or
  another axis/task) is refused; the target step is unchanged.
- **`plan_step_id` containment.** A problem may point at a step of its own task plan or of a same-axis plan;
  a step of a topic plan, another axis, or another problem is refused. An existing same-axis link still works.
- **Task-scoped activity via `record_activity`.** With `problemId` added to the input schema, an activity
  lands with that `problemId`; a `problemId` from another topic is refused; a `problemId` whose axis differs
  from a supplied `axisId` (same topic or cross-topic) is refused by the pairing guard (§4.2), which lives in
  `insertActivity`; `progressProblems[].activityCount` reflects a landed activity (`store.ts:5558`).
- **Reconcile-path activity pairing (guard bypass closed).** A `reconcile_topic` activity naming an axis and
  a problem on another axis of the same topic is refused with `invalid-input` and writes nothing; a reconcile
  activity naming a cross-topic problem with no axis is refused and writes nothing; a well-formed same-axis
  reconcile activity still lands. In `src/store-review-findings.test.ts`.
- **Project plan through `get_topic`.** `getTopicDetail(...).plan` returns the project plan; an axis-only
  topic returns `null` (the previously omitted field).
- **Overview counts.** `getOverview(...).problemsByState` equals a hand-counted split and does not change
  with `limit`.
- **Search.** `searchDashboard({query})` finds a problem by `statement` and by `title`, and sets `truncated`
  at the boundary.

### 12.3 Pagination, ordering, and stability

- Seed 12 activities in one axis. `page(offset=0,limit=5)`, `(5,5)`, `(10,5)` return disjoint sets covering
  all 12; each reports `total===12`; `hasMore` true/true/false; ordering is `(occurred_at DESC, id DESC)` and
  identical across repeated calls; `offset=99` ⇒ `items:[]`, `hasMore:false`, `total:12`.
- Same for the task page with order `created_at ASC, id ASC`.
- **Same scope for items and count.** A page scoped to topic A never returns topic B's rows, and its `total`
  uses the same scope predicate as its `items` (mirrors `getAxisWorkstream.coverage`).
- **SQL tie-break.** Two activities sharing `occurred_at` order by `id`, asserted from the returned order
  rather than from any exposed metadata.
- **Page siblings share the view's scope.** `get_progress`'s `activityPage`/`problemPage` carry the same
  archived-topic rule (`includeArchived`) and the same effective activity window as the `activity`/`problems`
  arrays beside them: with an active and an archived topic they exclude the archived task/event and agree on
  the count; `includeArchived:true` surfaces both; an event outside the window is in neither, and
  `activitySinceDays:0` widens both. In `src/store-review-findings.test.ts`.
- **Deterministic latest-plan selection.** `progressAxes` picks an axis's plan by an explicit
  `created_at, id` max (the order `planForAxis`/`listPlans` uses), not `.at(-1)` over an unordered read: under
  a forced `created_at` tie the greater id wins and the axis card agrees with `planForAxis`. In
  `src/store-review-findings.test.ts`.
- **Delete cascade.** Deleting a problem removes its task plan and steps, nulls any `plan_step_id` that
  pointed at those steps, and leaves `PRAGMA foreign_key_check` clean.

### 12.4 Legacy axis UI compile

- `bun run typecheck` and `bun run typecheck:host` both pass: `Plan` gains `owner` and **keeps** `axisId`
  (§3), so no axis-plan reader or mirror breaks.
- A test reads an axis plan back and asserts `owner.scope === "axis"`, that the legacy `axisId` equals the
  axis id, and that `summary`, `steps`, `stepsDone` are unchanged — the axis-card contract the page renders.

### 12.5 Implemented vs remaining (honest status)

**Implemented and tested locally in this step:** `migrations/006-task-plan-text.sql`
(declared in `nakama.plugin.json`), the store/tool contract of §3–§9 (`Plan.owner` + retained `axisId`,
`Problem.title`, widened `PROBLEM_STATES`, `plan_owners`/`problem_titles` plumbing, the task-text authorship
pair guard, owner-immutable plan writes, `assertPlanStepBelongsToProblem`, reconcile owner resolution and
step containment, the `record_activity.problemId` pairing guard), the manifest schema additions, the shipped
coordinator skill of §11, **the read projections of §5** (`getOverview.problemsByState`; the project `plan`
on `TopicDetail` and each task's own `title`/`plan` on the detail and `getAxisWorkstream` projections;
`title`/own-`plan` on `ProgressProblemRow`; the enduring `description` on `ProgressAxisRow`;
`searchDashboard`'s `problems[]` group matching `statement` and `title` with an extended `truncated`), **and
the page reads of §6** (`ScopedPage<T>`, `activityPage(scope, { offset, limit })` ordered
`occurred_at DESC, id DESC` and `problemPage(scope, { offset, limit })` ordered `created_at ASC, id ASC`,
each counting `items` and `total` under one predicate in one `snapshot()`; the optional `offset`/`pageSize`
inputs and their `offset`/`pageSize` schema properties on `get_topic`, `get_progress` and `list_activity`,
yielding an `activityPage`/`problemPage` sibling only when paging is requested), and the test suites
`src/migration-006.test.ts`, `src/store-task-plan-text.test.ts` + `src/store-read-pagination.test.ts`.

**Additive, not a break.** Existing array reads (`listActivity`, `getTopicDetail.activity`,
`getAxisWorkstream.axis.history`, `getOverview.recentActivity`, the `list_activity` action's `activity`) and
their shapes are unchanged; the `*Page` sibling appears only when `offset`/`pageSize` is sent. The `paging`
covers the scopes the four views need — project (`topicId`), workstream (`axisId`), task (`problemId`),
person (`personActorId` — the public filter key; the store's internal scope stays `actorId`) and repository (`repositoryId`) — but the manifest declares `offset`/`pageSize` only on
the routes that expose a page, so no inaccessible page is promised in a schema.

**Migration boundary (breaking, stated not worked around).** Renaming the public key from `actorId` to
`personActorId` is a **public-API change with no shim**: the host strips a top-level `actorId` before the
plugin sees it, so an old caller is silently unscoped rather than refused. The filter is a read filter over
already-authorised data, **not access control**, and authentication is unchanged (identity comes from the
session, never input). See the README's *Upgrading: the `list_activity` person filter is now
`personActorId`* for the upgrade note and the totals check.

**Not part of this step:** a UI port of the new fields (the `src/ui.tsx` mirrors gain the fields as optional
so `tsc` stays green), and any concurrent-insert page stability (offset paging is explicitly not stable
under inserts; the page states that rather than claiming it).

---

## 13. Non-goals

No checkpoint graph, no automatic progress rollup, no generic paging framework, no new write tool, no person
bio/role column, no `topics` author columns, no `problems.blocker` column, no collector change, no repository
template, no revival of the old E2E campaign. No restart or live write.

---

## 14. Unresolved real blockers

Only genuine open items are listed; all other mechanics above are resolved as stated.

1. **Replay after writes — resolved by construction.** 006 no longer needs an in-file repair path: the design
   is total (§2.5), so a replay after writes converges and preserves. Residual limit, labelled: all applier
   behaviour was measured on `bun:sqlite` 3.53.2 (the engine 004 was verified on and the one `harness/*.mjs`
   use); the real Nakama host binding was not exercised here. The safe design is unaffected if that host
   surfaces mid-script errors, because it has no failing statement — which is the point.
2. **Topic text has no mechanical guard.** The approved librarian may draft/maintain topic
   `summary`/`description` (§11), but `topics` has no author columns and `applyTopicPatch` checks none, so
   nothing stops an agent overwriting a human's topic words. Making the bound mechanical needs `topics`
   author columns — a schema change with its own review. Not in scope here; flagged so silence is not read
   as coverage or as a guard that does not exist.

---

## 15. Source anchors (all re-read this pass)

`src/store.ts` (constants 65; types 101-389, 470-503; serializers 901-957; `listActivity` 2320-2352;
`getTopicDetail` 2579-2656; `getAxisWorkstream` 2673-2780; `getOverview` 2792-2897; `searchDashboard`
3489-3611; `createTopic`/`updateTopic`/`deleteTopic` 3615-3661; `createAxis`/`deleteAxis` 3663-3715;
`addActivity` 3817-3887; `listProblems`/`listPlans`/`getPlan` 4586-4650; `planForAxis` 4677-4694;
`createProblem` 4701-4773; `updateProblem` 4779-4862; `transitionProblem` 4872-4918; `createPlan`/`updatePlan`
4974-5047; `updatePlanStep` 5086-5125; `progressAxes` 5390-5477; `progressProblems` 5484-5588;
`reconcileTopic` 5672-6047; `applyTopicPatch` 6105-6155; `insertStateLogEntry` ~6459;
`assertTextIsReplaceable` 6518-6534; `assertPlanStepBelongsToAxis` 6537-6554; `insertActivity` 6575-6642;
`touch` 6698-6705; `resolveAxisId` 6717-6742; `snapshot`/`atomic` 2191-2241) ·
`src/actions.ts` (validation contract 13-22; refusal kinds 196-214; `reconcile_topic` 350-359;
`record_activity` 361-387) · `nakama.plugin.json` (reconcile schema 474-644; `record_activity` 646-715;
migrations list 930-953) · `migrations/004-ux-v2-model.sql` (49-60, 121-151, 162-183, 213-272, 300-385) ·
`migrations/005-external-evidence.sql` (75-137) · `harness/test-004.mjs` (66, 388-418; ledger 391,416) ·
`harness/update-plugin.mjs` (7-10, 44-59, 157-159) · `src/store-ux-v2.test.ts` (24-46) ·
`src/ui.tsx` (239-362; action calls 5066,5070,5098,5246) · `skills/research-coordinator/SKILL.md`
(52,60-64,68-73,74,77,107) · `docs/design/dashboard-data-and-maintenance-contract.md` (15-153;
owner-approved direction 131-149) · `docs/design/dashboard-information-architecture-pivot.md` (§1.8
"Description vs summary"; §7.5 topic copy/`summary` label).

**Compliance:** design only; no edit to frozen data/prototype/source/spec/plan; no secrets/env/network/
inference/profile/live write/restart/git action. Public-record safe: loopback only, no personal or machine
identity.
