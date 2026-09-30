-- Research Dashboard, generation 2 — the coordination model.
--
-- Topics are the organizational unit; development axes carry the concurrent work; repositories,
-- people, branches and activity are evidence attached to them. Generation 1 (projects/activities) is
-- renamed to *_v1, copied across and left readable; migration 003 drops it once V2 has been proven.
--
-- Notes for whoever reads this next:
--
--   * The host applies a migration with `db.exec(sql)` on a connection that sets no pragmas — foreign
--     keys are OFF — and with **no surrounding transaction**, recording the checksum only after the
--     exec returns. So this file wraps itself in BEGIN/COMMIT: a failure part-way through leaves the
--     database untouched instead of half-migrated (which would be unrecoverable, since a re-run would
--     hit "table topics already exists").
--   * CHECK constraints are enforced regardless of the pragma, which is exactly why the copy below
--     maps generation-1 values explicitly: gen 1 allows status 'done' and gen 2 calls that 'completed'.
--   * Do not edit an applied migration. The host stores a checksum per migration id and refuses to
--     install a release whose already-applied migrations changed ("checksum_mismatch").

BEGIN IMMEDIATE;

-- 1. Move generation 1 aside. SQLite rewrites referencing clauses on rename, so activities_v1 keeps
--    pointing at projects_v1.
ALTER TABLE projects RENAME TO projects_v1;
ALTER TABLE activities RENAME TO activities_v1;

-- 2. Generation 2 schema.
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  summary TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX topics_name_unique ON topics (name COLLATE NOCASE);

CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  default_branch TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX repositories_full_name_unique
  ON repositories (full_name COLLATE NOCASE);

CREATE TABLE topic_repositories (
  topic_id TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'supporting'
    CHECK (relationship IN ('primary', 'supporting')),
  PRIMARY KEY (topic_id, repository_id)
);

-- At most one primary repository per topic; any number of supporting ones.
CREATE UNIQUE INDEX topic_repositories_one_primary
  ON topic_repositories (topic_id) WHERE relationship = 'primary';

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  nakama_user_id TEXT,
  github_login TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A Nakama account, a GitHub account and a person are three different things: both mappings are
-- optional, and each is unique when present.
CREATE UNIQUE INDEX people_nakama_user
  ON people (nakama_user_id) WHERE nakama_user_id IS NOT NULL;

CREATE UNIQUE INDEX people_github_login
  ON people (github_login COLLATE NOCASE) WHERE github_login IS NOT NULL;

CREATE TABLE topic_people (
  topic_id TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (topic_id, person_id)
);

CREATE TABLE development_axes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',

  kind TEXT NOT NULL DEFAULT 'feature'
    CHECK (kind IN ('feature', 'experiment', 'test', 'investigation', 'maintenance')),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'draft', 'blocked', 'parked', 'completed', 'abandoned')),

  branch TEXT NOT NULL DEFAULT '',
  pr_number INTEGER,
  pr_url TEXT NOT NULL DEFAULT '',

  current_state TEXT NOT NULL DEFAULT '',
  blocker TEXT NOT NULL DEFAULT '',

  -- Per-claim provenance: "the state is confirmed" and "this progress note is inferred" are different
  -- statements, so they are different columns. People assignment carries no confidence — anomalies
  -- there are corrected explicitly.
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

-- No repository_id here: an axis may touch several repositories, so the link lives in
-- axis_repositories (see the plan, D2).
CREATE INDEX axes_by_topic ON development_axes (topic_id, updated_at DESC);

CREATE TABLE axis_repositories (
  axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'supporting'
    CHECK (relationship IN ('primary', 'supporting')),
  PRIMARY KEY (axis_id, repository_id)
);

CREATE UNIQUE INDEX axis_repositories_one_primary
  ON axis_repositories (axis_id) WHERE relationship = 'primary';

CREATE TABLE axis_people (
  axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (axis_id, person_id)
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,

  topic_id TEXT REFERENCES topics (id) ON DELETE CASCADE,
  axis_id TEXT REFERENCES development_axes (id) ON DELETE CASCADE,
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

CREATE INDEX activities_by_topic ON activities (topic_id, occurred_at DESC);
CREATE INDEX activities_by_axis ON activities (axis_id, occurred_at DESC);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,

  topic_id TEXT REFERENCES topics (id) ON DELETE CASCADE,
  axis_id TEXT REFERENCES development_axes (id) ON DELETE CASCADE,

  text TEXT NOT NULL,

  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL
);

CREATE INDEX annotations_by_axis ON annotations (axis_id, created_at DESC);

-- 3. Copy generation 1 across, mapping the two vocabularies that changed. status 'done' becomes
--    'completed'; the source types 'commit'/'document' become 'github_commit'/'repo_document';
--    anything else unrecognised from gen 1 (a free-string value could be recorded before the manifest
--    declared an enum) degrades to 'manual' rather than aborting the migration.
INSERT INTO topics (id, name, description, status, summary, version, created_at, updated_at)
SELECT
  id,
  name,
  description,
  CASE status
    WHEN 'done' THEN 'completed'
    WHEN 'active' THEN 'active'
    WHEN 'paused' THEN 'paused'
    ELSE 'active'
  END,
  summary,
  1,
  created_at,
  updated_at
FROM projects_v1;

-- Gen 1 recorded no actor and no recorded_at: backfill honestly rather than inventing attribution.
INSERT INTO activities (
  id, topic_id, axis_id, repository_id, summary,
  source_type, source_ref, source_url,
  actor_type, actor_id, occurred_at, recorded_at
)
SELECT
  id,
  project_id,
  NULL,
  NULL,
  summary,
  CASE source_type
    WHEN 'commit' THEN 'github_commit'
    WHEN 'document' THEN 'repo_document'
    WHEN 'manual' THEN 'manual'
    WHEN 'github_pr' THEN 'github_pr'
    WHEN 'github_issue' THEN 'github_issue'
    WHEN 'experiment' THEN 'experiment'
    ELSE 'manual'
  END,
  source_ref,
  '',
  'unknown',
  '',
  occurred_at,
  occurred_at
FROM activities_v1;

COMMIT;
