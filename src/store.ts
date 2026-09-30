/**
 * Data access for the research dashboard.
 *
 * The database is the organization-scoped generation Nakama selects for this plugin
 * (`context.databasePath`). Nothing here resolves its own paths or reads user input
 * as a storage location.
 */
import { Database } from "bun:sqlite";

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: string;
  projectId: string;
  sourceType: string;
  sourceRef: string;
  summary: string;
  occurredAt: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  summary: string;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  project_id: string;
  source_type: string;
  source_ref: string;
  summary: string;
  occurred_at: string;
};

export const DEFAULT_ACTIVITY_LIMIT = 25;
export const MAX_ACTIVITY_LIMIT = 100;

/**
 * A rule the caller can fix by sending different input (unknown project, empty field).
 * The action layer turns these into a structured `{ ok: false, error }` result, because
 * a thrown error from plugin code reaches the caller as a generic server error.
 */
export class ResearchStoreError extends Error {}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function toProject(row: ProjectRow): Project {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    status: isProjectStatus(row.status) ? row.status : "active",
    summary: row.summary,
    updatedAt: row.updated_at,
  };
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    projectId: row.project_id,
    sourceRef: row.source_ref,
    sourceType: row.source_type,
    summary: row.summary,
  };
}

export class ResearchStore {
  private readonly db: Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
  }

  close(): void {
    this.db.close();
  }

  listProjects(status?: string): Project[] {
    const sql =
      "SELECT * FROM projects WHERE (? IS NULL OR status = ?) ORDER BY updated_at DESC";
    const rows = this.db
      .query(sql)
      .all(status ?? null, status ?? null) as ProjectRow[];
    return rows.map(toProject);
  }

  getProject(id: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | null;
    return row ? toProject(row) : null;
  }

  createProject(input: {
    name: string;
    description?: string;
    status?: ProjectStatus;
  }): Project {
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO projects (id, name, description, status, summary, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?)"
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        input.status ?? "active",
        timestamp,
        timestamp
      );
    const created = this.getProject(id);
    if (!created) {
      throw new ResearchStoreError("Project could not be created.");
    }
    return created;
  }

  updateProject(
    id: string,
    patch: {
      name?: string;
      description?: string;
      status?: ProjectStatus;
      summary?: string;
    }
  ): Project {
    const existing = this.getProject(id);
    if (!existing) {
      throw new ResearchStoreError("Project not found.");
    }
    const next = {
      description: patch.description ?? existing.description,
      name: patch.name ?? existing.name,
      status: patch.status ?? existing.status,
      summary: patch.summary ?? existing.summary,
    };
    this.db
      .query(
        "UPDATE projects SET name = ?, description = ?, status = ?, summary = ?, updated_at = ? WHERE id = ?"
      )
      .run(
        next.name,
        next.description,
        next.status,
        next.summary,
        nowIso(),
        id
      );
    const updated = this.getProject(id);
    if (!updated) {
      throw new ResearchStoreError("Project not found.");
    }
    return updated;
  }

  listActivity(projectId?: string, limit = DEFAULT_ACTIVITY_LIMIT): Activity[] {
    const rows = this.db
      .query(
        "SELECT * FROM activities WHERE (? IS NULL OR project_id = ?) ORDER BY occurred_at DESC, rowid DESC LIMIT ?"
      )
      .all(projectId ?? null, projectId ?? null, limit) as ActivityRow[];
    return rows.map(toActivity);
  }

  addActivity(input: {
    projectId: string;
    summary: string;
    sourceType?: string;
    sourceRef?: string;
    occurredAt?: string;
  }): Activity {
    if (!this.getProject(input.projectId)) {
      throw new ResearchStoreError("Project not found.");
    }
    const id = crypto.randomUUID();
    const happenedAt = input.occurredAt ?? nowIso();
    this.db
      .query(
        "INSERT INTO activities (id, project_id, source_type, source_ref, summary, occurred_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.projectId,
        input.sourceType ?? "manual",
        input.sourceRef ?? "",
        input.summary,
        happenedAt
      );
    // Keep project ordering meaningful without inventing activity.
    this.db
      .query("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(nowIso(), input.projectId);
    const row = this.db
      .query("SELECT * FROM activities WHERE id = ?")
      .get(id) as ActivityRow | null;
    if (!row) {
      throw new ResearchStoreError("Activity could not be recorded.");
    }
    return toActivity(row);
  }
}
