-- Migration 004 — the UX-v2 model.
--
-- A semantic migration, not a schema tidy-up. What it does, and what it deliberately does not:
--
--   * `usable` joins the axis state vocabulary. Seven states, and they are the union of two vocabularies
--     that were already in play: this implementation's six (001/002) and the UX contract's six
--     (contract/information-architecture.md:41, which lists `usable` and not `draft`). No existing row
--     changes meaning: the map is the identity, and nothing is mapped *onto* `usable`. That state starts
--     with zero rows and is reached only through an explicit transition, recorded in `state_log`.
--   * `state_log` is append-only history for axes and problems. Existing axes get exactly one bootstrap
--     row marking the state they held when history began: `origin='migration'`, `from_state NULL`,
--     `observed_at NULL`, `recorded_at` = when the ledger learned it. That is provenance, not an observed
--     event, and it is not user or repository activity.
--   * Problems are first-class children of an axis. A problem is meaningful with no repository, no PR and
--     no artifact: the axis link is the only required one, and repositories are evidence, not parentage.
--   * Plans and plan steps arrive as new tables and stay optional. Nothing is backfilled: a database with
--     zero plans is a valid v2 database, and no axis or problem requires a plan.
--   * `annotations` gains the claim kinds that carry interpretation and steering, plus a nullable
--     confidence — confidence describes a claim, never an entity's existence, and is NULL when there is no
--     claim. Nothing is overwritten: a later automated note is a new row, so human text survives it.
--
-- Failure model — the one 002 documents, plus the case it does not:
--   * The host applies each migration file with `db.exec()`, and writes its ledger row only after the file
--     has run. There is no transaction wrapping the ledger write.
--   * This file therefore opens its own transaction (`BEGIN IMMEDIATE`) and either commits whole or
--     leaves the database untouched.
--   * 002's uncovered case: a crash *after* this file commits but *before* the host records it. The host
--     then re-runs the whole file on the next boot — so every statement here is written to be re-runnable:
--     `IF NOT EXISTS` on creation, a dropped scratch table before each rebuild, and guarded inserts. A
--     second execution converges on the same state instead of failing on "table already exists".
--     Bound worth knowing: a re-run resets the rebuilt tables' new columns to their defaults, so a re-run
--     after post-004 writes is not a repair tool. The supported recovery path is a file restore
--     (docs/ux-v2/U1-migration.md §5.3). The host re-runs this file only across a crash, when this
--     process was the single writer and had written nothing else.
--
-- Why the rebuilds, and why the pragma below is load-bearing:
--   * SQLite cannot ALTER a CHECK constraint, and `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS`, so
--     it cannot be made re-runnable. Three tables are therefore rebuilt: `development_axes` (the state
--     CHECK), `annotations` (the one-canonical-target CHECK), and `activities` (the `problem_id` link).
--   * A rebuild drops a parent table. Verified under the host's own engine (bun:sqlite 3.53.2): with
--     foreign key enforcement ON, `DROP TABLE development_axes` performs an implicit DELETE and its
--     ON DELETE CASCADE clauses wipe every child row — all activities, all annotations, all axis links —
--     silently. With enforcement OFF the child rows survive. bun:sqlite defaults to OFF and the host never
--     sets the pragma, so this line is a no-op today; it is written anyway because it is the single thing
--     standing between a crash-free migration and mass deletion if that default ever changes.
--   * The pragma is per-connection and a no-op inside a transaction, so it is set before BEGIN, exactly as
--     002 does.

PRAGMA foreign_keys = OFF;

-- Required for the rebuilds, and verified rather than assumed: renaming `*_new` into place makes SQLite
-- re-parse the whole schema, and any surviving object that mentions the just-dropped name makes that parse
-- fail ("no such table: main.development_axes"). That happens on the *second* execution — the state-log
-- triggers exist by then and reference `development_axes` — which is exactly the re-run case this file has
-- to survive. legacy_alter_table=ON keeps RENAME a plain name change: no schema-wide re-parse, and no
-- rewriting of other objects' references, which is what a drop-and-rename rebuild wants. Probed on
-- bun:sqlite with a trigger referencing the rebuilt table: OFF fails on both runs, ON succeeds on both.
PRAGMA legacy_alter_table = ON;

BEGIN IMMEDIATE;

--------------------------------------------------------------------------------------------------------
-- 1. development_axes — the seven-state enum.
--    Every column is copied by name, in order; only the `state` CHECK differs.
--------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS development_axes_new;

CREATE TABLE development_axes_new (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',

  kind TEXT NOT NULL DEFAULT 'feature'
    CHECK (kind IN ('feature', 'experiment', 'test', 'investigation', 'maintenance')),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'draft', 'blocked', 'parked', 'usable', 'completed', 'abandoned')),

  branch TEXT NOT NULL DEFAULT '',
  pr_number INTEGER,
  pr_url TEXT NOT NULL DEFAULT '',

  current_state TEXT NOT NULL DEFAULT '',
  blocker TEXT NOT NULL DEFAULT '',

  state_confidence TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (state_confidence IN ('confirmed', 'inferred', 'uncertain')),
  current_state_confidence TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (current_state_confidence IN ('confirmed', 'inferred', 'uncertain')),
  blocker_confidence TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (blocker_confidence IN ('confirmed', 'inferred', 'uncertain')),

  version INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reviewed_at TEXT
);

INSERT INTO development_axes_new
  (id, topic_id, title, description, kind, state, branch, pr_number, pr_url, current_state, blocker,
   state_confidence, current_state_confidence, blocker_confidence, version, created_at, updated_at,
   last_reviewed_at)
SELECT
   id, topic_id, title, description, kind, state, branch, pr_number, pr_url, current_state, blocker,
   state_confidence, current_state_confidence, blocker_confidence, version, created_at, updated_at,
   last_reviewed_at
FROM development_axes;

DROP TABLE development_axes;
ALTER TABLE development_axes_new RENAME TO development_axes;

CREATE INDEX IF NOT EXISTS axes_by_topic ON development_axes (topic_id, updated_at DESC);

--------------------------------------------------------------------------------------------------------
-- 2. plans and plan steps — optional execution structure beneath an axis.
--    "ordered or unordered" is one nullable `position`: NULL means the plan has no ordering, and no
--    ordering is synthesized where the plan has none.
--------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE,

  summary TEXT NOT NULL,

  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id TEXT NOT NULL DEFAULT '',

  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS plans_by_axis ON plans (axis_id, created_at DESC);

CREATE TABLE IF NOT EXISTS plan_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  position INTEGER,

  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'active', 'done', 'blocked')),

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS plan_steps_by_plan ON plan_steps (plan_id, position);

--------------------------------------------------------------------------------------------------------
-- 3. problems — first-class children of an axis.
--    The lifecycle is deliberately small: `open | resolved`. Reopening is `resolved -> open`, recorded as
--    another state-log row, so the prior resolution stays in history rather than being overwritten.
--    Being blocked, parked or otherwise encumbered is a property of the work around a problem — the
--    parent axis state, a plan step, an activity or an annotation — not of the problem's own lifecycle.
--    A problem's author is recorded (`author_type`), so an owner-authored problem is distinguishable from
--    a librarian-inferred one. Nothing here requires a repository, a PR or an artifact.
--------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE,

  statement TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'resolved')),
  state_confidence TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (state_confidence IN ('confirmed', 'inferred', 'uncertain')),

  plan_step_id TEXT REFERENCES plan_steps (id) ON DELETE SET NULL,

  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id TEXT NOT NULL DEFAULT '',

  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS problems_by_axis ON problems (axis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS problems_by_state ON problems (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS problem_repositories (
  problem_id    TEXT NOT NULL REFERENCES problems (id)     ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, repository_id)
);

CREATE INDEX IF NOT EXISTS problem_repositories_by_repository
  ON problem_repositories (repository_id);

CREATE TABLE IF NOT EXISTS problem_people (
  problem_id TEXT NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES people (id)   ON DELETE CASCADE,
  PRIMARY KEY (problem_id, person_id)
);

CREATE INDEX IF NOT EXISTS problem_people_by_person ON problem_people (person_id);

--------------------------------------------------------------------------------------------------------
-- 4. state_log — append-only history for axes AND problems.
--    One table, because two would mean duplicated DDL, duplicated triggers and two places to keep honest.
--    The parent columns are therefore nullable, with an XOR CHECK: exactly one of axis_id / problem_id is
--    set. Axis and problem ids are different namespaces, so bootstrap uniqueness is enforced by two
--    separate partial unique indexes rather than by any COALESCE over the pair.
--
--    Axis and problem have different legal vocabularies, so the state columns are validated *conditionally
--    on the target type* rather than being watered down to arbitrary text. `from_state` stays nullable:
--    NULL is the bootstrap row, meaning "this was the state when history began".
--------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS state_log (
  id TEXT PRIMARY KEY,

  axis_id    TEXT REFERENCES development_axes (id) ON DELETE CASCADE,
  problem_id TEXT REFERENCES problems (id)         ON DELETE CASCADE,

  from_state TEXT,
  to_state   TEXT NOT NULL,

  -- 'migration' is reserved for rows this file writes. Everything else says who caused the transition.
  origin   TEXT NOT NULL CHECK (origin IN ('migration', 'human', 'agent')),
  actor_id TEXT NOT NULL DEFAULT '',

  -- When the state was observed (may be unknown, hence nullable) vs when the ledger learned it.
  observed_at TEXT,
  recorded_at TEXT NOT NULL,

  CHECK ((axis_id IS NOT NULL) <> (problem_id IS NOT NULL)),

  CHECK (CASE WHEN axis_id IS NOT NULL
              THEN to_state IN ('active', 'draft', 'blocked', 'parked', 'usable', 'completed', 'abandoned')
              ELSE to_state IN ('open', 'resolved') END),

  CHECK (from_state IS NULL OR CASE WHEN axis_id IS NOT NULL
              THEN from_state IN ('active', 'draft', 'blocked', 'parked', 'usable', 'completed', 'abandoned')
              ELSE from_state IN ('open', 'resolved') END)
);

CREATE INDEX IF NOT EXISTS state_log_by_axis    ON state_log (axis_id, recorded_at);
CREATE INDEX IF NOT EXISTS state_log_by_problem ON state_log (problem_id, recorded_at);

-- One bootstrap row per axis, one per problem — stated as two rules, in their own namespaces.
CREATE UNIQUE INDEX IF NOT EXISTS state_log_bootstrap_axis
  ON state_log (axis_id) WHERE origin = 'migration' AND axis_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS state_log_bootstrap_problem
  ON state_log (problem_id) WHERE origin = 'migration' AND problem_id IS NOT NULL;

-- Append-only, enforced rather than intended. A corrective migration has to drop these explicitly, which
-- is the point: state corrections are new records, not edits to history.
CREATE TRIGGER IF NOT EXISTS state_log_no_update
BEFORE UPDATE ON state_log
BEGIN
  SELECT RAISE(ABORT, 'state_log is append-only: state history is corrected by appending a record, never by updating one');
END;

-- The DELETE guard carries a WHEN clause, and it is load-bearing. A plain `BEFORE DELETE ... RAISE(ABORT)`
-- also fires for the deletes a foreign-key cascade performs — so it does not just protect history, it makes
-- deleting an axis or a problem impossible: `deleteAxis` (src/store.ts) would throw for every axis the
-- moment that axis has a bootstrap row. Verified on bun:sqlite: the plain trigger rejects the direct
-- delete AND the cascade; the guarded one rejects only the direct delete.
--
-- The rule the WHEN clause states: history may not be erased while its subject exists. When the subject
-- itself is deleted, its history goes with it, and that is the only way a row leaves this table.
CREATE TRIGGER IF NOT EXISTS state_log_no_delete
BEFORE DELETE ON state_log
WHEN EXISTS (SELECT 1 FROM development_axes WHERE id = OLD.axis_id)
  OR EXISTS (SELECT 1 FROM problems WHERE id = OLD.problem_id)
BEGIN
  SELECT RAISE(ABORT, 'state_log is append-only: state history is corrected by appending a record, never by deleting one');
END;

--------------------------------------------------------------------------------------------------------
-- 5. Bootstrap: one provenance row per existing axis.
--    The row id is derived from the axis id rather than random, so the bootstrap is deterministic and a
--    reviewer can predict exactly which rows appear. Deterministic in every field except `recorded_at`,
--    which is by definition when this ran. The insert is guarded on top of the two unique indexes.
--------------------------------------------------------------------------------------------------------
INSERT INTO state_log
  (id, axis_id, problem_id, from_state, to_state, origin, actor_id, observed_at, recorded_at)
SELECT
  'mig004:' || a.id, a.id, NULL, NULL, a.state, 'migration', '', NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM development_axes AS a
WHERE NOT EXISTS (
  SELECT 1 FROM state_log AS l WHERE l.axis_id = a.id AND l.origin = 'migration'
);

--------------------------------------------------------------------------------------------------------
-- 6. annotations — interpretation and steering live here, as claims, not as columns on the entities.
--    `kind='note'` keeps the historical shape (a note may legitimately sit on both a topic and an axis:
--    5 of the 7 rows in the pre-004 corpus database do). For the new claim kinds the one-canonical-target
--    rule is enforced, because a steering or interpretation claim that points at two entities at once is
--    ambiguous the moment one of them changes.
--
--    No dedicated `current_interpretation` column, and no steering column: an interpretation is the row
--    it was written as, so a later automated reading cannot overwrite a human's.
--------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS annotations_new;

CREATE TABLE annotations_new (
  id TEXT PRIMARY KEY,

  topic_id   TEXT REFERENCES topics (id)           ON DELETE CASCADE,
  axis_id    TEXT REFERENCES development_axes (id) ON DELETE CASCADE,
  problem_id TEXT REFERENCES problems (id)         ON DELETE CASCADE,

  text TEXT NOT NULL,

  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'interpretation', 'steering')),

  -- NULL when there is no claim to qualify.
  confidence TEXT CHECK (confidence IN ('confirmed', 'inferred', 'uncertain')),

  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL,

  CHECK (kind = 'note'
         OR (topic_id IS NOT NULL) + (axis_id IS NOT NULL) + (problem_id IS NOT NULL) = 1)
);

INSERT INTO annotations_new
  (id, topic_id, axis_id, problem_id, text, kind, confidence, author_type, author_id, created_at)
SELECT
   id, topic_id, axis_id, NULL, text, 'note', NULL, author_type, author_id, created_at
FROM annotations;

DROP TABLE annotations;
ALTER TABLE annotations_new RENAME TO annotations;

CREATE INDEX IF NOT EXISTS annotations_by_axis    ON annotations (axis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS annotations_by_problem ON annotations (problem_id, created_at DESC);

--------------------------------------------------------------------------------------------------------
-- 7. activities — the problem link.
--    A durable relationship, not a derived presentation value: it is what makes "a problem's latest
--    activity" and "the evidence under a problem" answerable. `SET NULL` on delete, so removing a problem
--    unlinks its activity rather than destroying the record of what happened.
--------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS activities_new;

CREATE TABLE activities_new (
  id TEXT PRIMARY KEY,

  topic_id TEXT REFERENCES topics (id) ON DELETE CASCADE,
  axis_id TEXT REFERENCES development_axes (id) ON DELETE CASCADE,
  problem_id TEXT REFERENCES problems (id) ON DELETE SET NULL,
  repository_id TEXT REFERENCES repositories (id) ON DELETE SET NULL,

  summary TEXT NOT NULL,

  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN (
      'manual', 'github_pr', 'github_commit', 'github_issue', 'repo_document',
      'group_chat', 'experiment', 'agent_review'
    )),
  source_ref TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',

  actor_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (actor_type IN ('human', 'agent', 'system', 'unknown')),
  actor_id TEXT NOT NULL DEFAULT '',

  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

INSERT INTO activities_new
  (id, topic_id, axis_id, problem_id, repository_id, summary, source_type, source_ref, source_url,
   actor_type, actor_id, occurred_at, recorded_at)
SELECT
   id, topic_id, axis_id, NULL, repository_id, summary, source_type, source_ref, source_url,
   actor_type, actor_id, occurred_at, recorded_at
FROM activities;

DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;

CREATE INDEX IF NOT EXISTS activities_by_topic    ON activities (topic_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activities_by_axis     ON activities (axis_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activities_by_problem  ON activities (problem_id, occurred_at DESC);

COMMIT;
