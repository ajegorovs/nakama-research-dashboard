-- Migration 006 — task plan text: an optional polymorphic plan owner, a task short title, and a
-- widened task state vocabulary.
--
-- Owner-approved semantics this file lands: tasks are general actionable work (states open/blocked/resolved,
-- preserving ids and history); plans are optional ordered plans at project / workstream / task scope; a
-- task title is concise text distinct from the full statement. Everything else here is a mechanical
-- selection (see docs/design/dashboard-minimal-implementation-design.md).
--
-- ---------------------------------------------------------------------------------------------
-- REPLAY SAFETY — the whole design of this file (source-grounded, verified on bun:sqlite 3.53.2)
-- ---------------------------------------------------------------------------------------------
-- The host applies each migration file with `db.exec()` and writes its ledger row only AFTER the file has
-- run; no transaction wraps the ledger write (the same bound 004 documents). Across a crash after the file
-- commits but before the ledger row is written, the host re-runs the whole file.
--
-- Measured on bun:sqlite 3.53.2 — the engine 004 was verified on and the one harness/*.mjs use — a
-- `Database.exec(script)` propagates an error ONLY from the FINAL statement of the script: an error in any
-- earlier statement is swallowed and execution continues to COMMIT. So a migration whose safety rests on a
-- constraint abort is unsound here: the abort is never surfaced. A design that copies a NEW user-data column
-- in-place is worse still, because a reset to '' raises nothing at all.
--
-- The rule that follows: a replay-safe migration on this applier is TOTAL — no statement may fail, ever.
-- This file therefore keeps every NEW user-data field (the task title, the plan owner) OUT of the rebuilt
-- tables, in side tables the rebuilds never touch, and rebuilds only to change a CHECK vocabulary while
-- copying the IDENTICAL column set. A change to a plan's ownership therefore never rewrites a copied row:
-- a second execution converges on the same rows, schema and foreign-key clauses (probe §D) and preserves
-- post-migration writes (probe §E). No "refusal boundary" is claimed, because on this applier the refusal
-- was a mirage — it silently destroyed data.
--
-- Read with: .hermes/scratch/migration-006-safety-resolution.md, migrations/004-ux-v2-model.sql.

PRAGMA foreign_keys = OFF;
-- Load-bearing, exactly as in 004: renaming `*_new` into place makes SQLite re-parse the whole schema, and
-- any surviving trigger that mentions a just-dropped table makes that parse fail on the SECOND execution.
-- legacy_alter_table=ON keeps RENAME a plain name change (no re-parse, no reference rewriting).
PRAGMA legacy_alter_table = ON;

BEGIN IMMEDIATE;

--------------------------------------------------------------------------------------------------------
-- 1. plans — the body is rebuilt to RETIRE the NOT-NULL `axis_id`. Ownership moves to `plan_owners`
--    (§2 below). The copy takes only the columns common to both shapes, so it is a pure identity on
--    every run; the retired `axis_id` is captured first into a retained staging table.
--
--    `CREATE TABLE IF NOT EXISTS x AS SELECT <retired-col> FROM plans` short-circuits on replay (verified
--    on bun:sqlite), so on the second run this statement neither re-reads the retired column nor errors.
--------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans_legacy_owner AS
  SELECT id AS plan_id, axis_id FROM plans;

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

--------------------------------------------------------------------------------------------------------
-- 2. plan_owners — the polymorphic optional owner, OUTSIDE the rebuilt body. Exactly one of
--    topic_id / axis_id / problem_id is set (the same XOR shape state_log uses). Deleting the owner row
--    cascades the plans body through `plan_owners_retire_plan`, restoring the design's §9 semantic
--    (deleting a topic/axis/task removes the plans it owns) now that ownership is a side table.
--
--    Seeding is guarded (a no-op on replay) and FILTERED to plans and axes that still exist: the retained
--    `plans_legacy_owner` keeps a row for a legacy plan even after that plan (or its axis) is deleted, and
--    an unguarded insert would resurrect a deleted owner as a dangling row. The `EXISTS` guards make a
--    replay after a deletion leave `plan_owners` exactly as it was.
--------------------------------------------------------------------------------------------------------
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

CREATE TRIGGER IF NOT EXISTS plan_owners_retire_plan
AFTER DELETE ON plan_owners
WHEN EXISTS (SELECT 1 FROM plans WHERE id = OLD.plan_id)
BEGIN
  DELETE FROM plans WHERE id = OLD.plan_id;
END;

CREATE INDEX IF NOT EXISTS plan_owners_by_axis    ON plan_owners (axis_id, plan_id);
CREATE INDEX IF NOT EXISTS plan_owners_by_topic   ON plan_owners (topic_id, plan_id);
CREATE INDEX IF NOT EXISTS plan_owners_by_problem ON plan_owners (problem_id, plan_id);

--------------------------------------------------------------------------------------------------------
-- 3. problems — widen the task state vocabulary only. IDENTICAL column set pre/post (no title column
--    here), so the copy is lossless on every run; the task title lives in `problem_titles` (§4).
--    Children survive the rebuild with foreign_keys OFF: problem_repositories, problem_people,
--    annotations(problem_id), activities(problem_id), external_object_mappings.problem_id.
--------------------------------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------------------------------
-- 4. problem_titles — the task short text, OUTSIDE every rebuilt table. Absence of a row reads as ''.
--    Created once; the rebuilds never touch it, so a title survives a replay.
--------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problem_titles (
  problem_id TEXT PRIMARY KEY REFERENCES problems (id) ON DELETE CASCADE,
  title TEXT NOT NULL
);

--------------------------------------------------------------------------------------------------------
-- 5. state_log — widen the problem branch of both conditional CHECKs to include 'blocked'. The column
--    set is identical, so the copy is lossless; the two indexes, two bootstrap partial-unique indexes and
--    two append-only triggers are recreated verbatim from 004. The `WHEN` clause on state_log_no_delete is
--    load-bearing: a plain BEFORE DELETE would also fire on FK cascades and make deleting any axis or
--    problem impossible.
--------------------------------------------------------------------------------------------------------
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
              THEN to_state IN ('active', 'draft', 'blocked', 'parked', 'usable', 'completed', 'abandoned')
              ELSE to_state IN ('open', 'blocked', 'resolved') END),

  CHECK (from_state IS NULL OR CASE WHEN axis_id IS NOT NULL
              THEN from_state IN ('active', 'draft', 'blocked', 'parked', 'usable', 'completed', 'abandoned')
              ELSE from_state IN ('open', 'blocked', 'resolved') END)
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
  ON state_log (axis_id) WHERE origin = 'migration' AND axis_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS state_log_bootstrap_problem
  ON state_log (problem_id) WHERE origin = 'migration' AND problem_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS state_log_no_update
BEFORE UPDATE ON state_log
BEGIN
  SELECT RAISE(ABORT, 'state_log is append-only: state history is corrected by appending a record, never by updating one');
END;

CREATE TRIGGER IF NOT EXISTS state_log_no_delete
BEFORE DELETE ON state_log
WHEN EXISTS (SELECT 1 FROM development_axes WHERE id = OLD.axis_id)
  OR EXISTS (SELECT 1 FROM problems WHERE id = OLD.problem_id)
BEGIN
  SELECT RAISE(ABORT, 'state_log is append-only: state history is corrected by appending a record, never by deleting one');
END;

COMMIT;
