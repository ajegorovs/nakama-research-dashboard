-- Research Dashboard, generation 1.
-- Two tables only: what a project is, and what objectively happened to it.
-- Interpretive state (milestone claims, summaries) rides on projects.summary and is
-- meant to be human-approved; there is deliberately no blockers/review table yet.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX activities_by_project ON activities (project_id, occurred_at DESC);
