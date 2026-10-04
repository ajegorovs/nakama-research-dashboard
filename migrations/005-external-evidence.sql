--------------------------------------------------------------------------------------------------------
-- 005-external-evidence — server-owned provenance and replay identity for externally observed evidence.
--
-- This migration adds the *ingest* half the model was missing: a durable link from an ordinary Activity row
-- back to the immutable external fact it records, plus the server-owned enrollment that decides where such a
-- fact may land. It is deliberately additive: no existing table is rebuilt, no historical Activity row is
-- touched, and nothing without an external key is ever deduped or rewritten (proposal §5, amendment 1).
--
-- Why the identity is server-owned
--   The worker never gets to assert an identity the server trusts. `canonical_event_key` is derived by the
--   server from the structured envelope (provider host + immutable repository id + object identity + event
--   kind); the worker's `payload_digest` is independently recomputed. The unique index below is what makes
--   replay safe: same key + same digest returns the existing receipt with zero inserts; same key + different
--   digest is an identity conflict, never an overwrite.
--
-- Why org_id is in the key
--   This store is per-organization today, but the amendment requires per-org uniqueness spelled out rather
--   than inherited from the file layout. `org_id` is carried on the receipt and the enrollment and is part of
--   every uniqueness constraint, so a future shared generation cannot silently collapse two orgs' facts.
--
-- Why enrollment is a table, not a caller field
--   Target selection is server-owned mapping authority. A caller names a repository identity and (optionally)
--   an object; it never names a Topic, an Axis or an arbitrary Problem. `external_object_mappings` holds the
--   only approved object→Problem mapping; without a row an envelope's `problemId` is refused, not honoured.
--
-- Why the GitHub author is on the receipt
--   The authenticated collector is a service principal and is not the person who wrote the commit. The
--   upstream author is retained as separate provenance and is never minted into `people` (no Person creation
--   on this path).
--
-- The tables are created IF NOT EXISTS and the migration runs inside one transaction, matching 004's
-- convention. It is declared in `nakama.plugin.json`; a migration the manifest does not list never runs.
--------------------------------------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS external_enrollments (
  id TEXT PRIMARY KEY,

  -- The organization this enrollment belongs to. Per-org uniqueness is explicit (see the index below).
  org_id TEXT NOT NULL,

  provider TEXT NOT NULL DEFAULT 'github',
  provider_host TEXT NOT NULL,
  -- Immutable provider-side identity. `full_name` is mutable display metadata and is *not* the key.
  repository_id TEXT NOT NULL,
  repository_node_id TEXT NOT NULL DEFAULT '',
  repository_full_name TEXT NOT NULL DEFAULT '',
  -- Server-owned approved default branch. Commit observation proofs and merged-PR base branches are checked
  -- against this, never against a caller-supplied branch name.
  default_branch TEXT NOT NULL DEFAULT '',

  -- The fixed target. Topic is derivable from the axis; it is stored so enroll/ingest can be checked against
  -- one another and a re-point cannot silently disagree with itself.
  topic_id TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE,

  mapping_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- One active enrollment per (org, provider host, immutable repository id). A revoked row stays for history.
CREATE UNIQUE INDEX IF NOT EXISTS external_enrollments_identity
  ON external_enrollments (org_id, provider_host, repository_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS external_enrollments_axis
  ON external_enrollments (axis_id);

-- The only approved explicit object→Problem mapping. Absence of a row means "no problem", never a guess.
-- `org_id` is carried here too (F2): the mapping row's organization must equal its enrollment's, and the
-- store checks that at write time, so a future shared generation cannot resolve a mapping across orgs.
CREATE TABLE IF NOT EXISTS external_object_mappings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL REFERENCES external_enrollments (id) ON DELETE CASCADE,
  object_kind TEXT NOT NULL
    CHECK (object_kind IN ('pr', 'commit', 'issue')),
  object_id TEXT NOT NULL,
  problem_id TEXT NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  mapping_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS external_object_mappings_identity
  ON external_object_mappings (org_id, enrollment_id, object_kind, object_id);

-- Dedicated provenance/receipt row, one per canonical external event, linked to the Activity it created.
CREATE TABLE IF NOT EXISTS external_evidence_receipts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  activity_id TEXT NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  enrollment_id TEXT REFERENCES external_enrollments (id) ON DELETE SET NULL,

  provider TEXT NOT NULL,
  provider_host TEXT NOT NULL,
  repository_id TEXT NOT NULL,

  event_kind TEXT NOT NULL
    CHECK (event_kind IN ('pr.merged', 'commit.observed')),
  object_kind TEXT NOT NULL
    CHECK (object_kind IN ('pr', 'commit')),
  object_id TEXT NOT NULL,
  object_number INTEGER,

  -- Server-derived canonical event identity, and the independently checked payload digest.
  canonical_event_key TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  metadata_digest TEXT NOT NULL DEFAULT '',

  -- Upstream author: separate provenance, never a dashboard Person.
  author_id TEXT NOT NULL DEFAULT '',
  author_node_id TEXT NOT NULL DEFAULT '',
  author_login TEXT NOT NULL DEFAULT '',

  source_url TEXT NOT NULL DEFAULT '',
  mapping_version INTEGER NOT NULL DEFAULT 1,

  -- The resolved attribution captured at insert time: the axis and Problem ('' = none) this fact landed on.
  -- Replay compares against these, so a re-pointed enrollment or a newly approved mapping is a conflict, not
  -- a silent relabel of history.
  axis_id TEXT NOT NULL DEFAULT '',
  problem_id TEXT NOT NULL DEFAULT '',

  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

-- The replay guarantee. Same (org, host, repo, canonical event) may exist exactly once; a second insert with
-- the same key but a different digest can never land, which is what turns a race into a conflict, not a
-- duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS external_evidence_receipts_identity
  ON external_evidence_receipts (org_id, provider_host, repository_id, canonical_event_key);

CREATE INDEX IF NOT EXISTS external_evidence_receipts_activity
  ON external_evidence_receipts (activity_id);

COMMIT;
