// @bun
// src/store.ts
import { Database } from "bun:sqlite";
var PROJECT_STATUSES = ["active", "paused", "done"];
var DEFAULT_ACTIVITY_LIMIT = 25;
var MAX_ACTIVITY_LIMIT = 100;

class ResearchStoreError extends Error {
}
function isProjectStatus(value) {
  return typeof value === "string" && PROJECT_STATUSES.includes(value);
}
function nowIso() {
  return new Date().toISOString();
}
function toProject(row) {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    status: isProjectStatus(row.status) ? row.status : "active",
    summary: row.summary,
    updatedAt: row.updated_at
  };
}
function toActivity(row) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    projectId: row.project_id,
    sourceRef: row.source_ref,
    sourceType: row.source_type,
    summary: row.summary
  };
}

class ResearchStore {
  db;
  constructor(databasePath) {
    this.db = new Database(databasePath);
  }
  close() {
    this.db.close();
  }
  listProjects(status) {
    const sql = "SELECT * FROM projects WHERE (? IS NULL OR status = ?) ORDER BY updated_at DESC";
    const rows = this.db.query(sql).all(status ?? null, status ?? null);
    return rows.map(toProject);
  }
  getProject(id) {
    const row = this.db.query("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? toProject(row) : null;
  }
  createProject(input) {
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO projects (id, name, description, status, summary, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?)").run(id, input.name, input.description ?? "", input.status ?? "active", timestamp, timestamp);
    const created = this.getProject(id);
    if (!created) {
      throw new ResearchStoreError("Project could not be created.");
    }
    return created;
  }
  updateProject(id, patch) {
    const existing = this.getProject(id);
    if (!existing) {
      throw new ResearchStoreError("Project not found.");
    }
    const next = {
      description: patch.description ?? existing.description,
      name: patch.name ?? existing.name,
      status: patch.status ?? existing.status,
      summary: patch.summary ?? existing.summary
    };
    this.db.query("UPDATE projects SET name = ?, description = ?, status = ?, summary = ?, updated_at = ? WHERE id = ?").run(next.name, next.description, next.status, next.summary, nowIso(), id);
    const updated = this.getProject(id);
    if (!updated) {
      throw new ResearchStoreError("Project not found.");
    }
    return updated;
  }
  listActivity(projectId, limit = DEFAULT_ACTIVITY_LIMIT) {
    const rows = this.db.query("SELECT * FROM activities WHERE (? IS NULL OR project_id = ?) ORDER BY occurred_at DESC, rowid DESC LIMIT ?").all(projectId ?? null, projectId ?? null, limit);
    return rows.map(toActivity);
  }
  addActivity(input) {
    if (!this.getProject(input.projectId)) {
      throw new ResearchStoreError("Project not found.");
    }
    const id = crypto.randomUUID();
    const happenedAt = input.occurredAt ?? nowIso();
    this.db.query("INSERT INTO activities (id, project_id, source_type, source_ref, summary, occurred_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.projectId, input.sourceType ?? "manual", input.sourceRef ?? "", input.summary, happenedAt);
    this.db.query("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), input.projectId);
    const row = this.db.query("SELECT * FROM activities WHERE id = ?").get(id);
    if (!row) {
      throw new ResearchStoreError("Activity could not be recorded.");
    }
    return toActivity(row);
  }
}

// src/actions.ts
class BusinessRuleError extends Error {
}
function required(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BusinessRuleError(`${field} is required.`);
  }
  return value.trim();
}
function optionalStatus(value) {
  if (value === undefined) {
    return;
  }
  if (!isProjectStatus(value)) {
    throw new BusinessRuleError("status must be one of: active, paused, done.");
  }
  return value;
}
function activityLimit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_ACTIVITY_LIMIT);
}
async function run(input, context) {
  if (!context.databasePath) {
    throw new Error("Research dashboard database is unavailable.");
  }
  const store = new ResearchStore(context.databasePath);
  try {
    return await dispatch(input, context, store);
  } catch (error) {
    if (error instanceof BusinessRuleError || error instanceof ResearchStoreError) {
      return { error: error.message, ok: false };
    }
    throw error;
  } finally {
    store.close();
  }
}
async function dispatch(input, context, store) {
  switch (context.actionKey) {
    case "list_projects": {
      const status = optionalStatus(input.status);
      return { ok: true, projects: store.listProjects(status) };
    }
    case "create_project": {
      const project = store.createProject({
        description: input.description ?? "",
        name: required(input.name, "name"),
        status: optionalStatus(input.status)
      });
      return { ok: true, project };
    }
    case "update_project": {
      const projectId = required(input.projectId, "projectId");
      const project = store.updateProject(projectId, {
        description: input.description,
        name: input.name,
        status: optionalStatus(input.status),
        summary: input.summary
      });
      return { ok: true, project };
    }
    case "list_activity": {
      const projectId = input.projectId ? required(input.projectId, "projectId") : undefined;
      return {
        activity: store.listActivity(projectId, activityLimit(input.limit)),
        ok: true
      };
    }
    case "add_activity": {
      const projectId = required(input.projectId, "projectId");
      const activity = store.addActivity({
        occurredAt: input.occurredAt,
        projectId,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        summary: required(input.summary, "summary")
      });
      return { activity, ok: true, project: store.getProject(projectId) };
    }
    default:
      throw new Error(`Unsupported action: ${context.actionKey}`);
  }
}
export {
  run
};
