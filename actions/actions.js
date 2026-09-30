// @bun
// src/store.ts
import { Database } from "bun:sqlite";
var TOPIC_STATUSES = [
  "active",
  "paused",
  "completed",
  "archived"
];
var AXIS_KINDS = [
  "feature",
  "experiment",
  "test",
  "investigation",
  "maintenance"
];
var AXIS_STATES = [
  "active",
  "draft",
  "blocked",
  "parked",
  "completed",
  "abandoned"
];
var CONFIDENCES = ["confirmed", "inferred", "uncertain"];
var SOURCE_TYPES = [
  "manual",
  "github_pr",
  "github_commit",
  "github_issue",
  "repo_document",
  "group_chat",
  "experiment",
  "agent_review"
];
var ACTOR_TYPES = ["human", "agent", "system", "unknown"];
var RELATIONSHIPS = ["primary", "supporting"];
var DEFAULT_ACTIVITY_LIMIT = 25;
var MAX_ACTIVITY_LIMIT = 100;
var DEFAULT_ANNOTATION_LIMIT = 25;
var MAX_ANNOTATION_LIMIT = 100;
var EVIDENCE_ITEM_LIMIT = 5;
var DEFAULT_AXIS_HISTORY_LIMIT = 25;
var MAX_AXIS_HISTORY_LIMIT = 100;
var BUSY_TIMEOUT_MS = 5000;

class ResearchStoreError extends Error {
}

class ResearchStoreConflictError extends ResearchStoreError {
}
function nowIso() {
  return new Date().toISOString();
}
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
function required(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ResearchStoreError(`${field} is required.`);
  }
  return value.trim();
}
function oneOf(value, allowed, field) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ResearchStoreError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}
function optionalOneOf(value, allowed, field) {
  return value === undefined || value === null ? undefined : oneOf(value, allowed, field);
}
function text(value) {
  return typeof value === "string" ? value : "";
}
function clampLimit(value, fallback, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), max);
}
function isTopicStatus(value) {
  return typeof value === "string" && TOPIC_STATUSES.includes(value);
}
function toTopic(row) {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    status: isTopicStatus(row.status) ? row.status : "active",
    summary: row.summary,
    updatedAt: row.updated_at,
    version: row.version
  };
}
function toRepository(row) {
  return {
    createdAt: row.created_at,
    defaultBranch: row.default_branch,
    description: row.description,
    fullName: row.full_name,
    id: row.id,
    updatedAt: row.updated_at,
    url: row.url
  };
}
function toPerson(row) {
  return {
    displayName: row.display_name,
    githubLogin: row.github_login,
    id: row.id,
    nakamaUserId: row.nakama_user_id,
    notes: row.notes
  };
}
function toAxis(row) {
  return {
    blocker: row.blocker,
    blockerConfidence: row.blocker ? row.blocker_confidence ?? "confirmed" : null,
    branch: row.branch,
    createdAt: row.created_at,
    currentState: row.current_state,
    currentStateConfidence: row.current_state ? row.current_state_confidence ?? "confirmed" : null,
    description: row.description,
    id: row.id,
    kind: row.kind ?? "feature",
    lastReviewedAt: row.last_reviewed_at,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    state: row.state ?? "active",
    stateConfidence: row.state_confidence ?? "confirmed",
    title: row.title,
    topicId: row.topic_id,
    updatedAt: row.updated_at,
    version: row.version
  };
}
function toActivity(row) {
  return {
    actorId: row.actor_id,
    actorType: row.actor_type ?? "unknown",
    axisId: row.axis_id,
    id: row.id,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    repositoryId: row.repository_id,
    sourceRef: row.source_ref,
    sourceType: row.source_type ?? "manual",
    sourceUrl: row.source_url,
    summary: row.summary,
    topicId: row.topic_id
  };
}
function toAnnotation(row) {
  return {
    authorId: row.author_id,
    authorType: row.author_type === "agent" ? "agent" : "human",
    axisId: row.axis_id,
    createdAt: row.created_at,
    id: row.id,
    text: row.text,
    topicId: row.topic_id
  };
}
var SOURCE_EVIDENCE_LABELS = {
  agent_review: "agent review",
  experiment: "experiment",
  github_commit: "commit",
  github_issue: "issue",
  github_pr: "PR",
  group_chat: "group chat",
  manual: "manual record",
  repo_document: "repo document"
};
function evidenceLabel(sourceType, sourceRef) {
  const base = SOURCE_EVIDENCE_LABELS[sourceType];
  const ref = sourceRef.trim();
  if (!ref) {
    return base;
  }
  return ref.toLowerCase().includes(base.toLowerCase()) ? ref : `${base} ${ref}`;
}
var AXIS_STATE_ATTENTION = {
  abandoned: 5,
  active: 1,
  blocked: 0,
  completed: 4,
  draft: 2,
  parked: 3
};
var TOPIC_STATUS_ATTENTION = {
  active: 0,
  archived: 3,
  completed: 2,
  paused: 1
};
function compareAxesForAttention(a, b) {
  const byState = AXIS_STATE_ATTENTION[a.state] - AXIS_STATE_ATTENTION[b.state];
  if (byState !== 0) {
    return byState;
  }
  const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
  return byUpdated === 0 ? a.title.localeCompare(b.title) : byUpdated;
}
function compareTopicsForAttention(a, b) {
  const byStatus = TOPIC_STATUS_ATTENTION[a.topic.status] - TOPIC_STATUS_ATTENTION[b.topic.status];
  if (byStatus !== 0) {
    return byStatus;
  }
  const byBlocked = Number(b.axisCounts.blocked > 0) - Number(a.axisCounts.blocked > 0);
  if (byBlocked !== 0) {
    return byBlocked;
  }
  const byUpdated = b.topic.updatedAt.localeCompare(a.topic.updatedAt);
  return byUpdated === 0 ? a.topic.name.localeCompare(b.topic.name) : byUpdated;
}
var NO_CLAIMS = new Set;
function assertedClaims(input) {
  return new Set(input.state === undefined ? [] : ["state"]);
}

class ResearchStore {
  db;
  depth = 0;
  constructor(databasePath) {
    this.db = new Database(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  }
  close() {
    this.db.close();
  }
  pragmas() {
    const value = (name) => {
      const row = this.db.query(`PRAGMA ${name}`).get();
      return row ? Object.values(row)[0] : undefined;
    };
    return {
      busyTimeout: Number(value("busy_timeout")),
      foreignKeys: Number(value("foreign_keys")),
      journalMode: String(value("journal_mode"))
    };
  }
  atomic(fn) {
    if (this.depth > 0) {
      return fn();
    }
    this.db.exec("BEGIN IMMEDIATE");
    this.depth += 1;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      this.depth -= 1;
    }
  }
  snapshot(fn) {
    if (this.depth > 0) {
      return fn();
    }
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  }
  listTopics(status) {
    const rows = this.db.query("SELECT * FROM topics WHERE (? IS NULL OR status = ?) ORDER BY updated_at DESC, name ASC").all(status ?? null, status ?? null);
    return rows.map(toTopic);
  }
  getTopic(id) {
    const row = this.db.query("SELECT * FROM topics WHERE id = ?").get(id);
    return row ? toTopic(row) : null;
  }
  getTopicByName(name) {
    const row = this.db.query("SELECT * FROM topics WHERE name = ? COLLATE NOCASE").get(name);
    return row ? toTopic(row) : null;
  }
  listAxes(topicId) {
    const rows = this.db.query("SELECT * FROM development_axes WHERE topic_id = ? ORDER BY updated_at DESC, title ASC").all(topicId);
    return rows.map(toAxis);
  }
  getAxis(id) {
    const row = this.db.query("SELECT * FROM development_axes WHERE id = ?").get(id);
    return row ? toAxis(row) : null;
  }
  listRepositories() {
    const rows = this.db.query("SELECT * FROM repositories ORDER BY full_name COLLATE NOCASE ASC").all();
    return rows.map(toRepository);
  }
  getRepositoryByFullName(fullName) {
    const row = this.db.query("SELECT * FROM repositories WHERE full_name = ? COLLATE NOCASE").get(fullName);
    return row ? toRepository(row) : null;
  }
  listPeople() {
    const rows = this.db.query("SELECT * FROM people ORDER BY display_name COLLATE NOCASE ASC").all();
    return rows.map(toPerson);
  }
  getPerson(id) {
    const row = this.db.query("SELECT * FROM people WHERE id = ?").get(id);
    return row ? toPerson(row) : null;
  }
  getPersonByNakamaUser(nakamaUserId) {
    const row = this.db.query("SELECT * FROM people WHERE nakama_user_id = ?").get(nakamaUserId);
    return row ? toPerson(row) : null;
  }
  listActivity(options) {
    const limit = clampLimit(options?.limit, DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT);
    const since = options?.sinceDays ? isoDaysAgo(options.sinceDays) : null;
    const rows = this.db.query(`SELECT * FROM activities
         WHERE (? IS NULL OR topic_id = ?)
           AND (? IS NULL OR axis_id = ?)
           AND (? IS NULL OR occurred_at >= ?)
         ORDER BY occurred_at DESC, rowid DESC
         LIMIT ?`).all(options?.topicId ?? null, options?.topicId ?? null, options?.axisId ?? null, options?.axisId ?? null, since, since, limit);
    return rows.map(toActivity);
  }
  listAnnotations(options) {
    const limit = clampLimit(options?.limit, DEFAULT_ANNOTATION_LIMIT, MAX_ANNOTATION_LIMIT);
    const rows = this.db.query(`SELECT * FROM annotations
         WHERE (? IS NULL OR topic_id = ?)
           AND (? IS NULL OR axis_id = ?)
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`).all(options?.topicId ?? null, options?.topicId ?? null, options?.axisId ?? null, options?.axisId ?? null, limit);
    return rows.map(toAnnotation);
  }
  listTopicRepositories(topicId) {
    const rows = this.db.query(`SELECT r.*, l.relationship AS relationship
         FROM topic_repositories l JOIN repositories r ON r.id = l.repository_id
         WHERE l.topic_id = ?
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`).all(topicId);
    return rows.map((row) => ({
      ...toRepository(row),
      relationship: row.relationship
    }));
  }
  listAxisRepositories(axisId) {
    const rows = this.db.query(`SELECT r.*, l.relationship AS relationship
         FROM axis_repositories l JOIN repositories r ON r.id = l.repository_id
         WHERE l.axis_id = ?
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`).all(axisId);
    return rows.map((row) => ({
      ...toRepository(row),
      relationship: row.relationship
    }));
  }
  listAxisPeople(axisId) {
    const rows = this.db.query(`SELECT p.*, l.role AS role
         FROM axis_people l JOIN people p ON p.id = l.person_id
         WHERE l.axis_id = ?
         ORDER BY p.display_name COLLATE NOCASE ASC`).all(axisId);
    return rows.map((row) => ({ ...toPerson(row), role: row.role }));
  }
  listTopicPeople(topicId) {
    const rows = this.db.query(`SELECT p.*, l.role AS role
         FROM topic_people l JOIN people p ON p.id = l.person_id
         WHERE l.topic_id = ?
         ORDER BY p.display_name COLLATE NOCASE ASC`).all(topicId);
    return rows.map((row) => ({ ...toPerson(row), role: row.role }));
  }
  listTopicNotes(topicId, limit) {
    const rows = this.db.query(`SELECT * FROM annotations
         WHERE topic_id = ? AND axis_id IS NULL
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`).all(topicId, clampLimit(limit, DEFAULT_ANNOTATION_LIMIT, MAX_ANNOTATION_LIMIT));
    return rows.map(toAnnotation);
  }
  axisEvidence(axis) {
    const items = [];
    const branch = axis.branch.trim();
    if (branch) {
      items.push({
        at: "",
        by: "",
        kind: "branch",
        label: branch,
        sourceRef: "",
        sourceType: null,
        sourceUrl: ""
      });
    }
    if (axis.prNumber !== null || axis.prUrl.trim()) {
      items.push({
        at: "",
        by: "",
        kind: "pull_request",
        label: axis.prNumber ? `PR #${axis.prNumber}` : "PR",
        sourceRef: "",
        sourceType: null,
        sourceUrl: axis.prUrl.trim()
      });
    }
    const activities = this.db.query(`SELECT * FROM activities WHERE axis_id = ?
         ORDER BY occurred_at DESC, rowid DESC LIMIT ?`).all(axis.id, EVIDENCE_ITEM_LIMIT);
    for (const row of activities) {
      const activity = toActivity(row);
      items.push({
        at: activity.occurredAt,
        by: activity.actorType,
        kind: "activity",
        label: evidenceLabel(activity.sourceType, activity.sourceRef),
        sourceRef: activity.sourceRef,
        sourceType: activity.sourceType,
        sourceUrl: activity.sourceUrl
      });
    }
    const notes = this.db.query(`SELECT * FROM annotations WHERE axis_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(axis.id, EVIDENCE_ITEM_LIMIT);
    for (const row of notes) {
      const note = toAnnotation(row);
      items.push({
        at: note.createdAt,
        by: note.authorType,
        kind: "annotation",
        label: "note",
        sourceRef: "",
        sourceType: null,
        sourceUrl: ""
      });
    }
    return items;
  }
  getTopicDetail(topicId, options) {
    return this.snapshot(() => {
      const topic = this.getTopic(required(topicId, "topicId"));
      if (!topic) {
        throw new ResearchStoreError("Topic not found.");
      }
      const historyLimit = clampLimit(options?.historyLimit, DEFAULT_AXIS_HISTORY_LIMIT, MAX_AXIS_HISTORY_LIMIT);
      const notesLimit = clampLimit(options?.notesLimit, DEFAULT_ANNOTATION_LIMIT, MAX_ANNOTATION_LIMIT);
      const axes = this.listAxes(topic.id).map((axis) => ({
        ...axis,
        evidence: this.axisEvidence(axis),
        history: this.listActivity({ axisId: axis.id, limit: historyLimit }),
        notes: this.listAnnotations({ axisId: axis.id, limit: notesLimit }),
        people: this.listAxisPeople(axis.id),
        repositories: this.listAxisRepositories(axis.id)
      }));
      const axisCounts = Object.fromEntries(AXIS_STATES.map((state) => [
        state,
        axes.filter((axis) => axis.state === state).length
      ]));
      const activity = this.listActivity({
        limit: clampLimit(options?.activityLimit, DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT),
        sinceDays: options?.activitySinceDays,
        topicId: topic.id
      });
      const notes = this.listTopicNotes(topic.id, notesLimit);
      return {
        activity,
        axes,
        axisCounts,
        counts: {
          activities: activity.length,
          axes: axes.length,
          axesWithoutEvidence: axes.filter((axis) => axis.evidence.length === 0).length,
          notes: notes.length
        },
        generatedAt: nowIso(),
        notes,
        people: this.listTopicPeople(topic.id),
        repositories: this.listTopicRepositories(topic.id),
        topic
      };
    });
  }
  getOverview(options) {
    return this.snapshot(() => {
      const activitySinceDays = options?.activitySinceDays ?? 14;
      const includeArchived = options?.includeArchived ?? false;
      const limit = clampLimit(options?.limit, 10, 50);
      const since = activitySinceDays > 0 ? isoDaysAgo(activitySinceDays) : null;
      const topicsByStatus = Object.fromEntries(TOPIC_STATUSES.map((status) => [status, 0]));
      for (const row of this.db.query("SELECT status, count(*) AS n FROM topics GROUP BY status").all()) {
        if (isTopicStatus(row.status)) {
          topicsByStatus[row.status] = row.n;
        }
      }
      const axesByState = Object.fromEntries(AXIS_STATES.map((state) => [state, 0]));
      for (const row of this.db.query("SELECT state, count(*) AS n FROM development_axes GROUP BY state").all()) {
        if (AXIS_STATES.includes(row.state)) {
          axesByState[row.state] = row.n;
        }
      }
      const counts = this.db.query(`SELECT (SELECT count(*) FROM topics) AS topics,
                  (SELECT count(*) FROM development_axes) AS axes,
                  (SELECT count(*) FROM repositories) AS repositories,
                  (SELECT count(*) FROM people) AS people`).get();
      const blocked = this.db.query(`SELECT a.*, t.name AS topic_name
           FROM development_axes a JOIN topics t ON t.id = a.topic_id
           WHERE a.state = 'blocked'
           ORDER BY a.updated_at DESC`).all();
      return {
        activitySinceDays,
        axesByState,
        blocked: blocked.map((row) => ({
          axisId: row.id,
          blocker: row.blocker,
          blockerConfidence: row.blocker_confidence ?? "uncertain",
          state: row.state ?? "active",
          title: row.title,
          topicId: row.topic_id,
          topicName: row.topic_name,
          updatedAt: row.updated_at
        })),
        counts: { ...counts, topicsByStatus },
        generatedAt: nowIso(),
        recentActivity: this.listActivity({
          limit: 25,
          sinceDays: activitySinceDays > 0 ? activitySinceDays : undefined
        }),
        recentTopics: this.db.query("SELECT * FROM topics ORDER BY updated_at DESC, name ASC LIMIT ?").all(limit).map(toTopic),
        topics: this.topicOverviews(includeArchived, since)
      };
    });
  }
  topicOverviews(includeArchived, since) {
    const axesByTopic = new Map;
    const repositoriesByAxis = new Map;
    for (const row of this.db.query(`SELECT l.axis_id AS axis_id, r.*, l.relationship AS relationship
         FROM axis_repositories l JOIN repositories r ON r.id = l.repository_id
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`).all()) {
      const linked = repositoriesByAxis.get(row.axis_id) ?? [];
      linked.push({
        ...toRepository(row),
        relationship: row.relationship
      });
      repositoriesByAxis.set(row.axis_id, linked);
    }
    for (const row of this.db.query("SELECT * FROM development_axes").all()) {
      const axis = toAxis(row);
      const grouped = axesByTopic.get(axis.topicId) ?? [];
      grouped.push({
        ...axis,
        repositories: repositoriesByAxis.get(axis.id) ?? []
      });
      axesByTopic.set(axis.topicId, grouped);
    }
    const peopleByTopic = new Map;
    for (const row of this.db.query(`SELECT l.topic_id AS topic_id, p.*, l.role AS role
         FROM topic_people l JOIN people p ON p.id = l.person_id
         ORDER BY p.display_name COLLATE NOCASE ASC`).all()) {
      const linked = peopleByTopic.get(row.topic_id) ?? [];
      linked.push({ ...toPerson(row), role: row.role });
      peopleByTopic.set(row.topic_id, linked);
    }
    const repositoriesByTopic = new Map;
    for (const row of this.db.query(`SELECT l.topic_id AS topic_id, r.*, l.relationship AS relationship
         FROM topic_repositories l JOIN repositories r ON r.id = l.repository_id
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`).all()) {
      const linked = repositoriesByTopic.get(row.topic_id) ?? [];
      linked.push({
        ...toRepository(row),
        relationship: row.relationship
      });
      repositoriesByTopic.set(row.topic_id, linked);
    }
    const activityByTopic = new Map;
    for (const row of this.db.query(`SELECT topic_id,
                sum(CASE WHEN ? IS NULL OR occurred_at >= ? THEN 1 ELSE 0 END) AS n,
                max(occurred_at) AS last
         FROM activities WHERE topic_id IS NOT NULL
         GROUP BY topic_id`).all(since, since)) {
      activityByTopic.set(row.topic_id, { last: row.last, n: row.n });
    }
    return this.listTopics().filter((topic) => includeArchived || topic.status !== "archived").map((topic) => {
      const axes = (axesByTopic.get(topic.id) ?? []).sort(compareAxesForAttention);
      const axisCounts = Object.fromEntries(AXIS_STATES.map((state) => [state, 0]));
      for (const axis of axes) {
        axisCounts[axis.state] += 1;
      }
      const activity = activityByTopic.get(topic.id);
      return {
        activityCount: activity?.n ?? 0,
        axes,
        axisCounts,
        lastActivityAt: activity?.last ?? null,
        people: peopleByTopic.get(topic.id) ?? [],
        repositories: repositoriesByTopic.get(topic.id) ?? [],
        topic
      };
    }).sort(compareTopicsForAttention);
  }
  searchDashboard(options) {
    const query = required(options.query, "query");
    const limit = clampLimit(options.limit, 10, 50);
    const includeArchived = options.includeArchived ?? false;
    const needle = query.toLowerCase();
    const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    return this.snapshot(() => {
      const archivedFilter = includeArchived ? "" : "AND t.status <> 'archived'";
      const topicRows = this.db.query(`SELECT t.* FROM topics t
           WHERE (t.name LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\')
             ${archivedFilter}
           ORDER BY t.updated_at DESC
           LIMIT ?`).all(pattern, pattern, pattern, limit + 1);
      const axisRows = this.db.query(`SELECT a.*, t.name AS topic_name FROM development_axes a JOIN topics t ON t.id = a.topic_id
           WHERE (a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\'
                  OR a.current_state LIKE ? ESCAPE '\\' OR a.blocker LIKE ? ESCAPE '\\'
                  OR a.branch LIKE ? ESCAPE '\\')
             ${archivedFilter}
           ORDER BY a.updated_at DESC
           LIMIT ?`).all(pattern, pattern, pattern, pattern, pattern, limit + 1);
      const activityRows = this.db.query(`SELECT x.*, t.name AS topic_name FROM activities x LEFT JOIN topics t ON t.id = x.topic_id
           WHERE (x.summary LIKE ? ESCAPE '\\' OR x.source_ref LIKE ? ESCAPE '\\')
           ORDER BY x.occurred_at DESC, x.rowid DESC
           LIMIT ?`).all(pattern, pattern, limit + 1);
      const annotationRows = this.db.query(`SELECT n.*, t.name AS topic_name FROM annotations n LEFT JOIN topics t ON t.id = n.topic_id
           WHERE n.text LIKE ? ESCAPE '\\'
           ORDER BY n.created_at DESC, n.rowid DESC
           LIMIT ?`).all(pattern, limit + 1);
      const fields = (row, names) => names.filter((name) => String(row[name] ?? "").toLowerCase().includes(needle));
      const topics = topicRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row, [
          "name",
          "description",
          "summary"
        ]),
        record: toTopic(row)
      }));
      const axes = axisRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row, [
          "title",
          "description",
          "current_state",
          "blocker",
          "branch"
        ]),
        record: toAxis(row),
        topicName: row.topic_name
      }));
      const activities = activityRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row, [
          "summary",
          "source_ref"
        ]),
        record: toActivity(row),
        topicName: row.topic_name
      }));
      const annotations = annotationRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row, [
          "text"
        ]),
        record: toAnnotation(row),
        topicName: row.topic_name
      }));
      return {
        activities,
        annotations,
        axes,
        includeArchived,
        limit,
        query,
        topics,
        truncated: topicRows.length > limit || axisRows.length > limit || activityRows.length > limit || annotationRows.length > limit
      };
    });
  }
  createTopic(input) {
    return this.atomic(() => {
      const name = required(input.name, "name");
      if (this.getTopicByName(name)) {
        throw new ResearchStoreError(`A topic named "${name}" already exists.`);
      }
      return this.insertTopic({
        description: text(input.description),
        name,
        status: input.status ?? "active",
        summary: text(input.summary)
      });
    });
  }
  updateTopic(id, patch, options) {
    return this.atomic(() => this.applyTopicPatch(required(id, "topicId"), patch, options));
  }
  deleteTopic(id) {
    this.atomic(() => {
      const topicId = required(id, "topicId");
      const result = this.db.query("DELETE FROM topics WHERE id = ?").run(topicId);
      if (Number(result.changes) === 0) {
        throw new ResearchStoreError("Topic not found.");
      }
    });
  }
  createAxis(input) {
    return this.atomic(() => {
      const topicId = required(input.topicId, "topicId");
      if (!this.getTopic(topicId)) {
        throw new ResearchStoreError("Topic not found.");
      }
      const axis = this.insertAxis(topicId, input);
      this.assertClaimsAreBacked(axis, assertedClaims(input));
      return axis;
    });
  }
  updateAxis(id, patch, options) {
    return this.atomic(() => {
      const axis = this.applyAxisPatch(required(id, "axisId"), patch, options);
      this.assertClaimsAreBacked(axis, assertedClaims(patch));
      return axis;
    });
  }
  deleteAxis(id) {
    this.atomic(() => {
      const axisId = required(id, "axisId");
      const result = this.db.query("DELETE FROM development_axes WHERE id = ?").run(axisId);
      if (Number(result.changes) === 0) {
        throw new ResearchStoreError("Axis not found.");
      }
    });
  }
  registerRepository(input) {
    return this.atomic(() => this.upsertRepository(input));
  }
  registerPerson(input) {
    return this.atomic(() => this.upsertPerson(input));
  }
  linkTopicRepository(topicId, repositoryId, relationship = "supporting") {
    this.atomic(() => {
      if (!this.getTopic(required(topicId, "topicId"))) {
        throw new ResearchStoreError("Topic not found.");
      }
      if (!this.repositoryExists(required(repositoryId, "repositoryId"))) {
        throw new ResearchStoreError("Repository not found.");
      }
      this.linkRepository("topic_repositories", "topic_id", topicId, repositoryId, relationship);
    });
  }
  linkAxisRepository(axisId, repositoryId, relationship = "supporting") {
    this.atomic(() => {
      if (!this.getAxis(required(axisId, "axisId"))) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (!this.repositoryExists(required(repositoryId, "repositoryId"))) {
        throw new ResearchStoreError("Repository not found.");
      }
      this.linkRepository("axis_repositories", "axis_id", axisId, repositoryId, relationship);
    });
  }
  linkTopicPerson(topicId, personId, role = "") {
    this.atomic(() => {
      if (!this.getTopic(required(topicId, "topicId"))) {
        throw new ResearchStoreError("Topic not found.");
      }
      if (!this.getPerson(required(personId, "personId"))) {
        throw new ResearchStoreError("Person not found.");
      }
      this.db.query("INSERT INTO topic_people (topic_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (topic_id, person_id) DO UPDATE SET role = excluded.role").run(topicId, personId, role);
    });
  }
  linkAxisPerson(axisId, personId, role = "") {
    this.atomic(() => {
      if (!this.getAxis(required(axisId, "axisId"))) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (!this.getPerson(required(personId, "personId"))) {
        throw new ResearchStoreError("Person not found.");
      }
      this.db.query("INSERT INTO axis_people (axis_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (axis_id, person_id) DO UPDATE SET role = excluded.role").run(axisId, personId, role);
    });
  }
  addActivity(input) {
    return this.atomic(() => {
      const summary = required(input.summary, "summary");
      const topicId = input.topicId ? required(input.topicId, "topicId") : null;
      const axisId = input.axisId ? required(input.axisId, "axisId") : null;
      if (!(topicId || axisId)) {
        throw new ResearchStoreError("topicId or axisId is required.");
      }
      if (topicId && !this.getTopic(topicId)) {
        throw new ResearchStoreError("Topic not found.");
      }
      const axis = axisId ? this.getAxis(axisId) : null;
      if (axisId && !axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (axis && topicId && axis.topicId !== topicId) {
        throw new ResearchStoreError("Axis does not belong to this topic.");
      }
      const repositoryId = input.repositoryFullName ? this.upsertRepository({ fullName: input.repositoryFullName }).repository.id : input.repositoryId;
      if (repositoryId && !this.repositoryExists(repositoryId)) {
        throw new ResearchStoreError("Repository not found.");
      }
      return this.insertActivity({
        actorId: input.actorId ?? "",
        actorType: optionalOneOf(input.actorType, ACTOR_TYPES, "actorType") ?? "unknown",
        axisId,
        occurredAt: input.occurredAt ?? nowIso(),
        repositoryId: repositoryId ?? null,
        sourceRef: text(input.sourceRef),
        sourceType: optionalOneOf(input.sourceType, SOURCE_TYPES, "sourceType") ?? "manual",
        sourceUrl: text(input.sourceUrl),
        summary,
        topicId: topicId ?? axis?.topicId ?? null
      });
    });
  }
  addAnnotation(input) {
    return this.atomic(() => {
      const body = required(input.text, "text");
      const topicId = input.topicId ? required(input.topicId, "topicId") : null;
      const axisId = input.axisId ? required(input.axisId, "axisId") : null;
      if (!(topicId || axisId)) {
        throw new ResearchStoreError("topicId or axisId is required.");
      }
      if (topicId && !this.getTopic(topicId)) {
        throw new ResearchStoreError("Topic not found.");
      }
      const axis = axisId ? this.getAxis(axisId) : null;
      if (axisId && !axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      return this.insertAnnotation({
        authorId: input.authorId ?? "",
        authorType: input.authorType ?? "human",
        axisId,
        text: body,
        topicId: topicId ?? axis?.topicId ?? null
      });
    });
  }
  reconcileTopic(input) {
    return this.atomic(() => {
      const actor = {
        id: input.actor?.id ?? "",
        type: input.actor?.type ?? "unknown"
      };
      oneOf(actor.type, ACTOR_TYPES, "actor.type");
      const resolved = this.resolveTopicForReconcile(input);
      let topic = resolved.topic;
      if (actor.id) {
        const known = this.db.query("SELECT id FROM people WHERE nakama_user_id = ? LIMIT 1").get(actor.id);
        if (known) {
          this.db.query("INSERT INTO topic_people (topic_id, person_id, role) VALUES (?, ?, '') ON CONFLICT (topic_id, person_id) DO NOTHING").run(topic.id, known.id);
        }
      }
      if (input.topic) {
        const patch = { ...input.topic };
        if (patch.name !== undefined && patch.name.trim() === topic.name) {
          delete patch.name;
        }
        if (Object.keys(patch).length > 0) {
          topic = this.applyTopicPatch(topic.id, patch, {
            expectedVersion: input.expectedVersion
          });
        }
      }
      const created = {
        axes: 0,
        people: 0,
        repositories: 0,
        topic: resolved.created
      };
      const touchedAxes = [];
      const assertedByAxis = new Map;
      const activities = [];
      const annotations = [];
      for (const person of input.people ?? []) {
        const result = this.resolvePersonForLink(person);
        if (result.created) {
          created.people += 1;
        }
        this.db.query("INSERT INTO topic_people (topic_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (topic_id, person_id) DO UPDATE SET role = excluded.role").run(topic.id, result.person.id, person.role ?? "");
      }
      for (const repository of input.repositories ?? []) {
        const result = this.upsertRepository(repository);
        if (result.created) {
          created.repositories += 1;
        }
        this.linkRepository("topic_repositories", "topic_id", topic.id, result.repository.id, repository.relationship ?? "supporting");
      }
      for (const axisInput of input.axes ?? []) {
        const existing = axisInput.id ? this.getAxis(required(axisInput.id, "axis.id")) : axisInput.title ? this.findAxisByTitle(topic.id, axisInput.title) : null;
        if (axisInput.id && !existing) {
          throw new ResearchStoreError("Axis not found.");
        }
        if (existing && existing.topicId !== topic.id) {
          throw new ResearchStoreError("Axis does not belong to this topic.");
        }
        let axis;
        if (existing) {
          axis = this.applyAxisPatch(existing.id, axisInput, {
            expectedVersion: axisInput.expectedVersion
          });
        } else {
          if (!axisInput.title) {
            throw new ResearchStoreError("axis.title is required for a new axis.");
          }
          axis = this.insertAxis(topic.id, axisInput);
          created.axes += 1;
        }
        for (const repository of axisInput.repositories ?? []) {
          const result = this.upsertRepository(repository);
          if (result.created) {
            created.repositories += 1;
          }
          this.linkRepository("axis_repositories", "axis_id", axis.id, result.repository.id, repository.relationship ?? "supporting");
        }
        for (const person of axisInput.people ?? []) {
          const result = this.resolvePersonForLink(person);
          if (result.created) {
            created.people += 1;
          }
          this.db.query("INSERT INTO axis_people (axis_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (axis_id, person_id) DO UPDATE SET role = excluded.role").run(axis.id, result.person.id, person.role ?? "");
        }
        touchedAxes.push(axis);
        assertedByAxis.set(axis.id, assertedClaims(axisInput));
      }
      for (const activityInput of input.activities ?? []) {
        const axisId = this.resolveAxisId(topic.id, activityInput.axisId, activityInput.axisTitle);
        const repository = activityInput.repositoryFullName ? this.upsertRepository({
          fullName: activityInput.repositoryFullName
        }) : null;
        if (repository?.created) {
          created.repositories += 1;
        }
        const activity = this.insertActivity({
          actorId: actor.id,
          actorType: actor.type,
          axisId,
          occurredAt: activityInput.occurredAt ?? nowIso(),
          repositoryId: repository?.repository.id ?? null,
          sourceRef: text(activityInput.sourceRef),
          sourceType: optionalOneOf(activityInput.sourceType, SOURCE_TYPES, "sourceType") ?? "manual",
          sourceUrl: text(activityInput.sourceUrl),
          summary: required(activityInput.summary, "summary"),
          topicId: topic.id
        });
        activities.push(activity.id);
      }
      for (const annotationInput of input.annotations ?? []) {
        const axisId = this.resolveAxisId(topic.id, annotationInput.axisId, annotationInput.axisTitle);
        const annotation = this.insertAnnotation({
          authorId: actor.id,
          authorType: annotationInput.authorType ?? (actor.type === "agent" ? "agent" : "human"),
          axisId,
          text: required(annotationInput.text, "text"),
          topicId: topic.id
        });
        annotations.push(annotation.id);
      }
      for (const axis of touchedAxes) {
        this.assertClaimsAreBacked(axis, assertedByAxis.get(axis.id) ?? NO_CLAIMS);
      }
      return {
        axes: touchedAxes.map((axis) => this.getAxis(axis.id) ?? axis),
        created,
        recorded: { activities, annotations },
        topic: this.getTopic(topic.id)
      };
    });
  }
  resolveTopicForReconcile(input) {
    if (input.topicId) {
      const topic = this.getTopic(required(input.topicId, "topicId"));
      if (!topic) {
        throw new ResearchStoreError("Topic not found.");
      }
      return { created: false, topic };
    }
    const name = input.topic?.name ?? input.topicName;
    if (!name || name.trim().length === 0) {
      throw new ResearchStoreError("topicId or topicName is required.");
    }
    const existing = this.getTopicByName(name.trim());
    if (existing) {
      return { created: false, topic: existing };
    }
    return {
      created: true,
      topic: this.insertTopic({
        description: text(input.topic?.description),
        name: name.trim(),
        status: input.topic?.status ?? "active",
        summary: text(input.topic?.summary)
      })
    };
  }
  insertTopic(input) {
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO topics (id, name, description, status, summary, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(id, input.name, input.description, input.status, input.summary, timestamp, timestamp);
    return this.getTopic(id);
  }
  applyTopicPatch(id, patch, options) {
    const existing = this.getTopic(id);
    if (!existing) {
      throw new ResearchStoreError("Topic not found.");
    }
    this.assertVersion("topic", existing.name, existing.version, options?.expectedVersion);
    const next = {
      description: patch.description ?? existing.description,
      name: patch.name === undefined ? existing.name : required(patch.name, "name"),
      status: optionalOneOf(patch.status, TOPIC_STATUSES, "status") ?? existing.status,
      summary: patch.summary ?? existing.summary
    };
    if (next.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = this.getTopicByName(next.name);
      if (clash && clash.id !== id) {
        throw new ResearchStoreError(`A topic named "${next.name}" already exists.`);
      }
    }
    this.db.query("UPDATE topics SET name = ?, description = ?, status = ?, summary = ?, version = version + 1, updated_at = ? WHERE id = ?").run(next.name, next.description, next.status, next.summary, nowIso(), id);
    return this.getTopic(id);
  }
  insertAxis(topicId, input) {
    const title = required(input.title, "axis.title");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    const state = optionalOneOf(input.state, AXIS_STATES, "state") ?? "active";
    const blocker = text(input.blocker);
    this.assertBlockerPresent(state, blocker);
    this.db.query(`INSERT INTO development_axes (
           id, topic_id, title, description, kind, state, branch, pr_number, pr_url,
           current_state, blocker, state_confidence, current_state_confidence, blocker_confidence,
           version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(id, topicId, title, text(input.description), optionalOneOf(input.kind, AXIS_KINDS, "kind") ?? "feature", state, text(input.branch), input.prNumber ?? null, text(input.prUrl), text(input.currentState), blocker, optionalOneOf(input.stateConfidence, CONFIDENCES, "stateConfidence") ?? "confirmed", optionalOneOf(input.currentStateConfidence, CONFIDENCES, "currentStateConfidence") ?? "confirmed", optionalOneOf(input.blockerConfidence, CONFIDENCES, "blockerConfidence") ?? "confirmed", timestamp, timestamp);
    return this.getAxis(id);
  }
  applyAxisPatch(id, patch, options) {
    const existing = this.getAxis(id);
    if (!existing) {
      throw new ResearchStoreError("Axis not found.");
    }
    const stored = this.db.query("SELECT current_state_confidence, blocker_confidence FROM development_axes WHERE id = ?").get(id);
    this.assertVersion("axis", existing.title, existing.version, options?.expectedVersion);
    const next = {
      blocker: patch.blocker ?? existing.blocker,
      blockerConfidence: optionalOneOf(patch.blockerConfidence, CONFIDENCES, "blockerConfidence"),
      branch: patch.branch ?? existing.branch,
      currentState: patch.currentState ?? existing.currentState,
      currentStateConfidence: optionalOneOf(patch.currentStateConfidence, CONFIDENCES, "currentStateConfidence"),
      description: patch.description ?? existing.description,
      kind: optionalOneOf(patch.kind, AXIS_KINDS, "kind"),
      prNumber: patch.prNumber === undefined ? existing.prNumber : patch.prNumber,
      prUrl: patch.prUrl ?? existing.prUrl,
      state: optionalOneOf(patch.state, AXIS_STATES, "state"),
      stateConfidence: optionalOneOf(patch.stateConfidence, CONFIDENCES, "stateConfidence"),
      title: patch.title === undefined ? existing.title : required(patch.title, "axis.title")
    };
    this.assertBlockerPresent(next.state ?? existing.state, next.blocker);
    this.db.query(`UPDATE development_axes SET
           title = ?, description = ?, kind = ?, state = ?, branch = ?, pr_number = ?, pr_url = ?,
           current_state = ?, blocker = ?, state_confidence = ?, current_state_confidence = ?,
           blocker_confidence = ?, version = version + 1, updated_at = ?
         WHERE id = ?`).run(next.title, next.description, next.kind ?? existing.kind, next.state ?? existing.state, next.branch, next.prNumber, next.prUrl, next.currentState, next.blocker, next.stateConfidence ?? existing.stateConfidence, next.currentStateConfidence ?? stored?.current_state_confidence ?? "confirmed", next.blockerConfidence ?? stored?.blocker_confidence ?? "confirmed", nowIso(), id);
    return this.getAxis(id);
  }
  upsertRepository(input) {
    const fullName = required(input.fullName, "repository.fullName");
    const existing = this.getRepositoryByFullName(fullName);
    if (existing) {
      const next = {
        defaultBranch: input.defaultBranch ?? existing.defaultBranch,
        description: input.description ?? existing.description,
        url: input.url ?? existing.url
      };
      if (next.defaultBranch !== existing.defaultBranch || next.description !== existing.description || next.url !== existing.url) {
        this.db.query("UPDATE repositories SET url = ?, description = ?, default_branch = ?, updated_at = ? WHERE id = ?").run(next.url, next.description, next.defaultBranch, nowIso(), existing.id);
      }
      return {
        created: false,
        repository: this.getRepositoryByFullName(fullName)
      };
    }
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO repositories (id, full_name, url, description, default_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, fullName, text(input.url), text(input.description), text(input.defaultBranch), timestamp, timestamp);
    return {
      created: true,
      repository: this.getRepositoryByFullName(fullName)
    };
  }
  resolvePersonForLink(input) {
    const displayName = required(input.displayName, "person.displayName");
    const hasIdentity = Boolean(input.nakamaUserId?.trim() || input.githubLogin?.trim());
    if (!hasIdentity) {
      const matches = this.db.query("SELECT * FROM people WHERE display_name = ? COLLATE NOCASE").all(displayName);
      if (matches.length === 1) {
        return { created: false, person: toPerson(matches[0]) };
      }
      if (matches.length > 1) {
        throw new ResearchStoreError(`${matches.length} people are named "${displayName}" \u2014 link the right one with a githubLogin or nakamaUserId.`);
      }
    }
    return this.upsertPerson(input);
  }
  upsertPerson(input) {
    const displayName = required(input.displayName, "person.displayName");
    const nakamaUserId = input.nakamaUserId?.trim() || null;
    const githubLogin = input.githubLogin?.trim() || null;
    const existing = nakamaUserId ? this.db.query("SELECT * FROM people WHERE nakama_user_id = ?").get(nakamaUserId) : githubLogin ? this.db.query("SELECT * FROM people WHERE github_login = ? COLLATE NOCASE").get(githubLogin) : null;
    if (existing) {
      return { created: false, person: toPerson(existing) };
    }
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO people (id, display_name, nakama_user_id, github_login, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, displayName, nakamaUserId, githubLogin, text(input.notes), timestamp, timestamp);
    return { created: true, person: this.getPerson(id) };
  }
  linkRepository(table, column, parentId, repositoryId, relationship) {
    const next = oneOf(relationship, RELATIONSHIPS, "relationship");
    if (next === "primary") {
      this.db.query(`UPDATE ${table} SET relationship = 'supporting' WHERE ${column} = ? AND relationship = 'primary'`).run(parentId);
    }
    this.db.query(`INSERT INTO ${table} (${column}, repository_id, relationship) VALUES (?, ?, ?)
         ON CONFLICT (${column}, repository_id) DO UPDATE SET relationship = excluded.relationship`).run(parentId, repositoryId, next);
  }
  insertActivity(input) {
    const id = input.id ?? crypto.randomUUID();
    const recordedAt = nowIso();
    this.db.query(`INSERT INTO activities (
           id, topic_id, axis_id, repository_id, summary, source_type, source_ref, source_url,
           actor_type, actor_id, occurred_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.topicId, input.axisId, input.repositoryId, input.summary, input.sourceType, input.sourceRef, input.sourceUrl, input.actorType, input.actorId, input.occurredAt, recordedAt);
    this.touch("topics", input.topicId);
    this.touch("development_axes", input.axisId);
    return toActivity(this.db.query("SELECT * FROM activities WHERE id = ?").get(id));
  }
  insertAnnotation(input) {
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO annotations (id, topic_id, axis_id, text, author_type, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, input.topicId, input.axisId, input.text, input.authorType, input.authorId, nowIso());
    this.touch("topics", input.topicId);
    this.touch("development_axes", input.axisId);
    return toAnnotation(this.db.query("SELECT * FROM annotations WHERE id = ?").get(id));
  }
  touch(table, id) {
    if (!id) {
      return;
    }
    this.db.query(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
  }
  findAxisByTitle(topicId, title) {
    const row = this.db.query("SELECT * FROM development_axes WHERE topic_id = ? AND title = ? COLLATE NOCASE").get(topicId, title.trim());
    return row ? toAxis(row) : null;
  }
  resolveAxisId(topicId, axisId, axisTitle) {
    if (axisId) {
      const axis = this.getAxis(required(axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (axis.topicId !== topicId) {
        throw new ResearchStoreError("Axis does not belong to this topic.");
      }
      return axis.id;
    }
    if (axisTitle) {
      const axis = this.findAxisByTitle(topicId, axisTitle);
      if (!axis) {
        throw new ResearchStoreError(`Axis "${axisTitle}" not found in this topic.`);
      }
      return axis.id;
    }
    return null;
  }
  repositoryExists(id) {
    return Boolean(this.db.query("SELECT 1 AS present FROM repositories WHERE id = ?").get(id));
  }
  assertVersion(entity, label, current, expected) {
    if (expected === undefined) {
      return;
    }
    if (!Number.isInteger(expected) || expected !== current) {
      throw new ResearchStoreConflictError(`conflict: ${entity} "${label}" is at version ${current}, not ${String(expected)} \u2014 re-read it and retry.`);
    }
  }
  assertBlockerPresent(state, blocker) {
    if (state === "blocked" && blocker.trim().length === 0) {
      throw new ResearchStoreError("An axis cannot be 'blocked' without blocker text \u2014 say what it is waiting on.");
    }
  }
  assertClaimsAreBacked(axis, asserted) {
    const claims = [
      ["state", axis.stateConfidence, asserted.has("state")],
      [
        "current_state",
        axis.currentStateConfidence,
        axis.currentState.trim().length > 0
      ],
      ["blocker", axis.blockerConfidence, axis.blocker.trim().length > 0]
    ];
    const unbacked = claims.filter(([, confidence, isClaim]) => isClaim && confidence === "confirmed").map(([field]) => field);
    if (unbacked.length === 0) {
      return;
    }
    if (this.axisEvidence(axis).length === 0) {
      throw new ResearchStoreError(`Axis "${axis.title}" claims 'confirmed' for ${unbacked.join(", ")} but carries no evidence \u2014 add a branch, a PR or an activity, or mark it 'inferred'.`);
    }
  }
}

// src/actions.ts
class BusinessRuleError extends Error {
}
function optionalText(value, field, max) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string") {
    throw new BusinessRuleError(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }
  if (trimmed.length > max) {
    throw new BusinessRuleError(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}
function requiredText(value, field, max) {
  const text = optionalText(value, field, max);
  if (text === undefined) {
    throw new BusinessRuleError(`${field} is required.`);
  }
  return text;
}
function optionalInt(value, field, min, max) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BusinessRuleError(`${field} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new BusinessRuleError(`${field} must be between ${min} and ${max}.`);
  }
  return value;
}
function optionalEnum(value, allowed, field) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new BusinessRuleError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}
function actorOf(context) {
  const id = context.actor?.id ?? "";
  if (context.profileId) {
    return { id, type: "agent" };
  }
  return id ? { id, type: "human" } : { id: "", type: "unknown" };
}
function requireTopic(store, input) {
  const topicId = optionalText(input.topicId, "topicId", 100);
  if (topicId) {
    const topic = store.getTopic(topicId);
    if (!topic) {
      throw new BusinessRuleError("Topic not found.");
    }
    return topic;
  }
  const topicName = optionalText(input.topicName, "topicName", 120);
  if (topicName) {
    const topic = store.getTopicByName(topicName);
    if (!topic) {
      throw new BusinessRuleError(`No topic named "${topicName}". Find the right one with search_dashboard.`);
    }
    return topic;
  }
  throw new BusinessRuleError("topicId or topicName is required.");
}
function resolveAxis(store, topic, input) {
  const axisId = optionalText(input.axisId, "axisId", 100);
  if (axisId) {
    const axis = store.getAxis(axisId);
    if (!axis) {
      throw new BusinessRuleError("Axis not found.");
    }
    if (axis.topicId !== topic.id) {
      throw new BusinessRuleError("Axis does not belong to this topic.");
    }
    return axis;
  }
  const axisTitle = optionalText(input.axisTitle, "axisTitle", 160);
  if (axisTitle) {
    const axis = store.findAxisByTitle(topic.id, axisTitle);
    if (!axis) {
      throw new BusinessRuleError(`No axis "${axisTitle}" in this topic.`);
    }
    return axis;
  }
  return null;
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
    case "get_overview": {
      return {
        ok: true,
        ...store.getOverview({
          activitySinceDays: optionalInt(input.activitySinceDays, "activitySinceDays", 0, 365),
          includeArchived: input.includeArchived === true,
          limit: optionalInt(input.limit, "limit", 1, 50)
        })
      };
    }
    case "get_topic": {
      const topic = requireTopic(store, input);
      const includeAnnotations = input.includeAnnotations !== false;
      const detail = store.getTopicDetail(topic.id, {
        activityLimit: optionalInt(input.activityLimit, "activityLimit", 1, 100),
        activitySinceDays: optionalInt(input.activitySinceDays, "activitySinceDays", 1, 365),
        historyLimit: optionalInt(input.historyLimit, "historyLimit", 1, 100),
        notesLimit: optionalInt(input.notesLimit, "notesLimit", 1, 100)
      });
      return {
        ...detail,
        annotations: includeAnnotations ? detail.notes : [],
        axes: includeAnnotations ? detail.axes : detail.axes.map((axis) => ({ ...axis, notes: [] })),
        ok: true
      };
    }
    case "search_dashboard": {
      return {
        ok: true,
        ...store.searchDashboard({
          includeArchived: input.includeArchived === true,
          limit: optionalInt(input.limit, "limit", 1, 50),
          query: requiredText(input.query, "query", 200)
        })
      };
    }
    case "reconcile_topic": {
      return {
        ok: true,
        ...store.reconcileTopic({
          ...input,
          actor: actorOf(context)
        })
      };
    }
    case "record_activity": {
      const actor = actorOf(context);
      const topic = requireTopic(store, input);
      const axis = resolveAxis(store, topic, input);
      const activity = store.addActivity({
        actorId: actor.id,
        actorType: actor.type,
        axisId: axis?.id,
        occurredAt: optionalText(input.occurredAt, "occurredAt", 40),
        repositoryFullName: optionalText(input.repositoryFullName, "repositoryFullName", 200),
        sourceRef: optionalText(input.sourceRef, "sourceRef", 200),
        sourceType: optionalEnum(input.sourceType, SOURCE_TYPES, "sourceType"),
        sourceUrl: optionalText(input.sourceUrl, "sourceUrl", 500),
        summary: requiredText(input.summary, "summary", 1000),
        topicId: topic.id
      });
      return { activity, ok: true, topic: store.getTopic(topic.id) };
    }
    case "list_topics": {
      return {
        ok: true,
        topics: store.listTopics(optionalEnum(input.status, TOPIC_STATUSES, "status"))
      };
    }
    case "list_activity": {
      return {
        activity: store.listActivity({
          axisId: optionalText(input.axisId, "axisId", 100),
          limit: optionalInt(input.limit, "limit", 1, 100),
          sinceDays: optionalInt(input.sinceDays, "sinceDays", 1, 365),
          topicId: optionalText(input.topicId, "topicId", 100)
        }),
        ok: true
      };
    }
    case "add_annotation": {
      const actor = actorOf(context);
      const topicId = optionalText(input.topicId, "topicId", 100);
      const axisId = optionalText(input.axisId, "axisId", 100);
      if (!(topicId || axisId)) {
        throw new BusinessRuleError("topicId or axisId is required.");
      }
      return {
        annotation: store.addAnnotation({
          authorId: actor.id,
          authorType: actor.type === "agent" ? "agent" : "human",
          axisId,
          text: requiredText(input.text, "text", 2000),
          topicId
        }),
        ok: true
      };
    }
    default:
      throw new Error(`Unsupported action: ${context.actionKey}`);
  }
}
export {
  run
};
