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
  "abandoned",
  "usable"
];
var PROBLEM_STATES = ["open", "resolved"];
var PLAN_STEP_STATES = ["pending", "active", "done", "blocked"];
var ANNOTATION_KINDS = ["note", "interpretation", "steering"];
var AUTHOR_TYPES = ["human", "agent"];
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
var MAX_ROLLUP_LIMIT = 50;
var DEFAULT_ROLLUP_ACTIVITY_LIMIT = 5;
var DEFAULT_TIMELINE_AXIS_LIMIT = 10;
var EVIDENCE_ITEM_LIMIT = 5;
var PROGRESS_SUPPORT_LIMIT = 10;
var DEFAULT_AXIS_HISTORY_LIMIT = 25;
var MAX_AXIS_HISTORY_LIMIT = 100;
var BUSY_TIMEOUT_MS = 5000;
class ResearchStoreError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

class ResearchStoreConflictError extends ResearchStoreError {
  constructor(message) {
    super(message, "conflict");
  }
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
function oneOfState(value, allowed, field) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ResearchStoreError(`invalid-state: ${field} must be one of: ${allowed.join(", ")}.`, "invalid-state");
  }
  return value;
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
function optionalPosition(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ResearchStoreError("position must be a non-negative integer, or omitted for an unordered plan.");
  }
  return value;
}
var STALE_AFTER_DAYS = 7;
var MS_PER_DAY = 24 * 60 * 60 * 1000;
function newestOf(values) {
  let newest = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) {
      continue;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && parsed > newestMs) {
      newestMs = parsed;
      newest = value;
    }
  }
  return newest;
}
function ageInDays(recencyAt, nowMs) {
  if (!recencyAt) {
    return null;
  }
  const parsed = Date.parse(recencyAt);
  return Number.isNaN(parsed) ? null : (nowMs - parsed) / MS_PER_DAY;
}
function isStale(recencyAt, nowMs) {
  const age = ageInDays(recencyAt, nowMs);
  return age !== null && age > STALE_AFTER_DAYS;
}
function byRecencyDesc(rows) {
  return [...rows].sort((left, right) => Date.parse(right.recencyAt ?? "") - Date.parse(left.recencyAt ?? ""));
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
function toAxisScan(axis, repositories) {
  return {
    blocker: axis.blocker,
    blockerConfidence: axis.blockerConfidence,
    branch: axis.branch,
    id: axis.id,
    kind: axis.kind,
    lastReviewedAt: axis.lastReviewedAt,
    prNumber: axis.prNumber,
    prUrl: axis.prUrl,
    repositories,
    state: axis.state,
    stateConfidence: axis.stateConfidence,
    title: axis.title,
    topicId: axis.topicId,
    updatedAt: axis.updatedAt,
    version: axis.version
  };
}
function countAxesByState(axes) {
  const counts = Object.fromEntries(AXIS_STATES.map((state) => [state, 0]));
  for (const axis of axes) {
    counts[axis.state] += 1;
  }
  return counts;
}
function toActivity(row) {
  return {
    actorId: row.actor_id,
    actorType: row.actor_type ?? "unknown",
    axisId: row.axis_id,
    id: row.id,
    occurredAt: row.occurred_at,
    problemId: row.problem_id,
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
    confidence: row.confidence ?? null,
    createdAt: row.created_at,
    id: row.id,
    kind: asAnnotationKind(row.kind),
    problemId: row.problem_id,
    text: row.text,
    topicId: row.topic_id
  };
}
function asAnnotationKind(value) {
  return value === "interpretation" || value === "steering" ? value : "note";
}
function toProblem(row) {
  return {
    authorId: row.author_id,
    authorType: row.author_type === "human" ? "human" : "agent",
    axisId: row.axis_id,
    createdAt: row.created_at,
    id: row.id,
    planStepId: row.plan_step_id,
    state: row.state === "resolved" ? "resolved" : "open",
    stateConfidence: row.state_confidence ?? "confirmed",
    statement: row.statement,
    updatedAt: row.updated_at,
    version: row.version
  };
}
function toPlan(row) {
  return {
    authorId: row.author_id,
    authorType: row.author_type === "human" ? "human" : "agent",
    axisId: row.axis_id,
    createdAt: row.created_at,
    id: row.id,
    summary: row.summary,
    updatedAt: row.updated_at,
    version: row.version
  };
}
function toPlanStep(row) {
  const state = row.state;
  return {
    createdAt: row.created_at,
    id: row.id,
    planId: row.plan_id,
    position: row.position,
    state: state === "active" || state === "done" || state === "blocked" ? state : "pending",
    title: row.title,
    updatedAt: row.updated_at
  };
}
function toStateLogEntry(row) {
  return {
    actorId: row.actor_id,
    axisId: row.axis_id,
    fromState: row.from_state,
    id: row.id,
    observedAt: row.observed_at,
    origin: row.origin === "migration" ? "migration" : row.origin === "agent" ? "agent" : "human",
    problemId: row.problem_id,
    recordedAt: row.recorded_at,
    toState: row.to_state
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
  abandoned: 6,
  active: 1,
  blocked: 0,
  completed: 5,
  draft: 3,
  parked: 4,
  usable: 2
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
  readDepth = 0;
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
    if (this.depth > 0 || this.readDepth > 0) {
      return fn();
    }
    this.db.exec("BEGIN");
    this.readDepth += 1;
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
      this.readDepth -= 1;
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
  listProblemPeople(problemId) {
    return this.db.query(`SELECT p.*
           FROM problem_people l JOIN people p ON p.id = l.person_id
           WHERE l.problem_id = ?
           ORDER BY p.display_name COLLATE NOCASE ASC`).all(problemId).map(toPerson);
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
        plan: this.planForAxis(axis.id),
        problems: this.listProblems(axis.id).map((problem) => ({
          ...problem,
          history: this.stateHistory("problem_id", problem.id),
          people: this.listProblemPeople(problem.id),
          planStepTitle: problem.planStepId ? this.getPlanStep(problem.planStepId)?.title ?? null : null,
          repositories: this.listProblemRepositories(problem.id)
        })),
        repositories: this.listAxisRepositories(axis.id),
        stateHistory: this.stateHistory("axis_id", axis.id)
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
      const rollups = this.involvementRollups(includeArchived, since, MAX_ROLLUP_LIMIT);
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
        people: rollups.people,
        peopleTruncated: rollups.peopleTruncated,
        recentActivity: this.listActivity({
          limit: 25,
          sinceDays: activitySinceDays > 0 ? activitySinceDays : undefined
        }),
        recentTopics: this.db.query("SELECT * FROM topics ORDER BY updated_at DESC, name ASC LIMIT ?").all(limit).map(toTopic),
        repositories: rollups.repositories,
        repositoriesTruncated: rollups.repositoriesTruncated,
        timeline: this.recentProgress(since, includeArchived, DEFAULT_TIMELINE_AXIS_LIMIT),
        topics: this.topicOverviews(includeArchived, since)
      };
    });
  }
  topicOverviews(includeArchived, since) {
    const axesByTopic = new Map;
    const repositoriesByAxis = this.repositoriesByAxis();
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
      const axisCounts = countAxesByState(axes);
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
  repositoriesByAxis() {
    const map = new Map;
    for (const row of this.db.query(`SELECT l.axis_id AS axis_id, r.*, l.relationship AS relationship
         FROM axis_repositories l JOIN repositories r ON r.id = l.repository_id
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`).all()) {
      const linked = map.get(row.axis_id) ?? [];
      linked.push({
        ...toRepository(row),
        relationship: row.relationship
      });
      map.set(row.axis_id, linked);
    }
    return map;
  }
  visibleContext(input) {
    const includeArchived = input.includeArchived;
    const activitySinceDays = input.activitySinceDays ?? 14;
    const since = activitySinceDays > 0 ? isoDaysAgo(activitySinceDays) : null;
    const inWindow = (at) => Boolean(at) && (since === null || String(at) >= since);
    const nowMs = Date.now();
    const topicRefs = new Map;
    for (const row of this.db.query("SELECT id, name, status FROM topics").all()) {
      if (isTopicStatus(row.status)) {
        topicRefs.set(row.id, {
          id: row.id,
          name: row.name,
          status: row.status
        });
      }
    }
    const visible = (topicId) => {
      const ref = topicRefs.get(topicId);
      return Boolean(ref) && (includeArchived || ref?.status !== "archived");
    };
    const repositoriesByAxis = this.repositoriesByAxis();
    const scans = new Map;
    for (const row of this.db.query("SELECT * FROM development_axes").all()) {
      if (visible(row.topic_id)) {
        scans.set(row.id, toAxisScan(toAxis(row), repositoriesByAxis.get(row.id) ?? []));
      }
    }
    return {
      activitySinceDays,
      inWindow,
      nowMs,
      repositoriesByAxis,
      scans,
      since,
      topicRefs,
      visible
    };
  }
  personRefByAccount() {
    const map = new Map;
    for (const row of this.db.query("SELECT id, display_name, nakama_user_id FROM people").all()) {
      if (row.nakama_user_id) {
        map.set(row.nakama_user_id, {
          displayName: row.display_name,
          id: row.id
        });
      }
    }
    return map;
  }
  recentProgress(since, includeArchived, limit) {
    const { scans, topicRefs } = this.visibleContext({ includeArchived });
    const personByAccount = this.personRefByAccount();
    const rows = this.db.query(`SELECT * FROM activities
         WHERE (? IS NULL OR occurred_at >= ?)
         ORDER BY occurred_at DESC, rowid DESC`).all(since, since);
    const byTopic = new Map;
    for (const row of rows) {
      const event = toActivity(row);
      const axis = event.axisId ? scans.get(event.axisId) ?? null : null;
      const topicId = axis?.topicId ?? event.topicId ?? "";
      if (topicId === "" || !topicRefs.has(topicId)) {
        continue;
      }
      const buckets = byTopic.get(topicId) ?? new Map;
      const key = axis?.id ?? "";
      const bucket = buckets.get(key) ?? { axis, eventCount: 0, events: [] };
      bucket.eventCount += 1;
      if (bucket.events.length < limit) {
        bucket.events.push({
          ...event,
          person: personByAccount.get(event.actorId) ?? null
        });
      }
      buckets.set(key, bucket);
      byTopic.set(topicId, buckets);
    }
    const groups = [];
    for (const [topicId, buckets] of byTopic) {
      const topic = topicRefs.get(topicId);
      if (!topic) {
        continue;
      }
      const axes = [...buckets.values()].sort((a, b) => {
        if (a.axis === null || b.axis === null) {
          return a.axis === null ? 1 : -1;
        }
        return compareAxesForAttention(a.axis, b.axis);
      });
      groups.push({
        axes,
        eventCount: axes.reduce((total, bucket) => total + bucket.eventCount, 0),
        lastActivityAt: axes[0]?.events[0]?.occurredAt ?? null,
        topic
      });
    }
    return groups.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") || a.topic.name.localeCompare(b.topic.name));
  }
  involvementRollups(includeArchived, since, limit) {
    const { repositoriesByAxis, scans, topicRefs, visible } = this.visibleContext({ includeArchived });
    const events = this.db.query(`SELECT * FROM activities
           WHERE (? IS NULL OR occurred_at >= ?)
           ORDER BY occurred_at DESC, rowid DESC`).all(since, since).map(toActivity);
    const people = this.db.query("SELECT * FROM people ORDER BY display_name COLLATE NOCASE ASC").all();
    const idByAccount = new Map;
    for (const row of people) {
      if (row.nakama_user_id) {
        idByAccount.set(row.nakama_user_id, row.id);
      }
    }
    const activityByPerson = new Map;
    for (const event of events) {
      const personId = event.actorId ? idByAccount.get(event.actorId) : undefined;
      if (!personId) {
        continue;
      }
      const own = activityByPerson.get(personId) ?? [];
      if (own.length < DEFAULT_ROLLUP_ACTIVITY_LIMIT) {
        own.push(event);
        activityByPerson.set(personId, own);
      }
    }
    const lastByAccount = new Map;
    for (const row of this.db.query("SELECT actor_id, max(occurred_at) AS last FROM activities WHERE actor_id <> '' GROUP BY actor_id").all()) {
      lastByAccount.set(row.actor_id, row.last);
    }
    const axesByPerson = new Map;
    for (const row of this.db.query("SELECT person_id, axis_id FROM axis_people").all()) {
      const axis = scans.get(row.axis_id);
      if (!axis) {
        continue;
      }
      const own = axesByPerson.get(row.person_id) ?? [];
      own.push(axis);
      axesByPerson.set(row.person_id, own);
    }
    const involvementsByPerson = new Map;
    for (const row of this.db.query("SELECT person_id, topic_id, role FROM topic_people").all()) {
      const topic = topicRefs.get(row.topic_id);
      if (!(topic && visible(row.topic_id))) {
        continue;
      }
      const own = involvementsByPerson.get(row.person_id) ?? new Map;
      own.set(row.topic_id, { axes: [], role: row.role, topic });
      involvementsByPerson.set(row.person_id, own);
    }
    for (const [personId, own] of axesByPerson) {
      const involvements = involvementsByPerson.get(personId) ?? new Map;
      for (const axis of own) {
        const topic = topicRefs.get(axis.topicId);
        if (!topic) {
          continue;
        }
        const entry = involvements.get(axis.topicId) ?? {
          axes: [],
          role: "",
          topic
        };
        entry.axes.push(axis);
        involvements.set(axis.topicId, entry);
      }
      involvementsByPerson.set(personId, involvements);
    }
    const personRollups = people.slice(0, limit).map((row) => {
      const person = toPerson(row);
      const own = (axesByPerson.get(person.id) ?? []).sort(compareAxesForAttention);
      const reviewed = own.map((axis) => axis.lastReviewedAt).filter((value) => Boolean(value));
      return {
        attributable: Boolean(person.nakamaUserId),
        axes: own,
        axisCounts: countAxesByState(own),
        lastActivityAt: person.nakamaUserId ? lastByAccount.get(person.nakamaUserId) ?? null : null,
        lastReviewedAt: reviewed.length > 0 ? reviewed.sort().at(-1) ?? null : null,
        person,
        recentActivity: activityByPerson.get(person.id) ?? [],
        topics: [...involvementsByPerson.get(person.id)?.values() ?? []].map((entry) => ({
          ...entry,
          axes: entry.axes.sort(compareAxesForAttention)
        })).sort((a, b) => a.topic.name.localeCompare(b.topic.name))
      };
    });
    const repositoryIdsByAxis = new Map;
    const axisIdsByRepository = new Map;
    for (const [axisId, linked] of repositoriesByAxis) {
      repositoryIdsByAxis.set(axisId, linked.map((repository) => repository.id));
      for (const repository of linked) {
        const own = axisIdsByRepository.get(repository.id) ?? [];
        own.push(axisId);
        axisIdsByRepository.set(repository.id, own);
      }
    }
    const activityByRepository = new Map;
    const addRepositoryEvent = (repositoryId, event) => {
      const own = activityByRepository.get(repositoryId) ?? [];
      if (own.length < DEFAULT_ROLLUP_ACTIVITY_LIMIT && !own.some((item) => item.id === event.id)) {
        own.push(event);
        activityByRepository.set(repositoryId, own);
      }
    };
    for (const event of events) {
      if (event.repositoryId) {
        addRepositoryEvent(event.repositoryId, event);
      }
      for (const repositoryId of repositoryIdsByAxis.get(event.axisId ?? "") ?? []) {
        addRepositoryEvent(repositoryId, event);
      }
    }
    const lastByRepository = new Map;
    const noteLast = (repositoryId, at) => {
      const current = lastByRepository.get(repositoryId);
      if (!current || at > current) {
        lastByRepository.set(repositoryId, at);
      }
    };
    for (const row of this.db.query(`SELECT repository_id, max(occurred_at) AS last FROM activities
         WHERE repository_id IS NOT NULL GROUP BY repository_id`).all()) {
      noteLast(row.repository_id, row.last);
    }
    for (const row of this.db.query(`SELECT ar.repository_id AS repository_id, max(x.occurred_at) AS last
         FROM activities x JOIN axis_repositories ar ON ar.axis_id = x.axis_id
         GROUP BY ar.repository_id`).all()) {
      noteLast(row.repository_id, row.last);
    }
    const topicsByRepository = new Map;
    for (const row of this.db.query("SELECT topic_id, repository_id, relationship FROM topic_repositories").all()) {
      const topic = topicRefs.get(row.topic_id);
      if (!(topic && visible(row.topic_id))) {
        continue;
      }
      const own = topicsByRepository.get(row.repository_id) ?? [];
      own.push({ relationship: row.relationship, topic });
      topicsByRepository.set(row.repository_id, own);
    }
    const compareTopicLinks = (a, b) => {
      const byPrimary = Number(b.relationship === "primary") - Number(a.relationship === "primary");
      return byPrimary === 0 ? a.topic.name.localeCompare(b.topic.name) : byPrimary;
    };
    const repositoryRows = this.db.query("SELECT * FROM repositories ORDER BY full_name COLLATE NOCASE ASC").all();
    const repositoryRollups = repositoryRows.slice(0, limit).map((row) => {
      const repository = toRepository(row);
      const own = (axisIdsByRepository.get(repository.id) ?? []).map((axisId) => scans.get(axisId)).filter((axis) => Boolean(axis)).sort(compareAxesForAttention);
      return {
        axes: own,
        axisCounts: countAxesByState(own),
        lastActivityAt: lastByRepository.get(repository.id) ?? null,
        recentActivity: activityByRepository.get(repository.id) ?? [],
        repository,
        topics: (topicsByRepository.get(repository.id) ?? []).sort(compareTopicLinks)
      };
    });
    return {
      people: personRollups,
      peopleTruncated: people.length > limit,
      repositories: repositoryRollups,
      repositoriesTruncated: repositoryRows.length > limit
    };
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
      const problemId = input.problemId ? required(input.problemId, "problemId") : null;
      const problem = problemId ? this.getProblem(problemId) : null;
      if (problemId && !problem) {
        throw new ResearchStoreError("Problem not found.");
      }
      const topicId = input.topicId ? required(input.topicId, "topicId") : null;
      const axisId = input.axisId ? required(input.axisId, "axisId") : problem?.axisId ?? null;
      if (!(topicId || axisId)) {
        throw new ResearchStoreError("topicId, axisId or problemId is required.");
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
        problemId,
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
      const kind = optionalOneOf(input.kind, ANNOTATION_KINDS, "kind") ?? "note";
      const topicId = input.topicId ? required(input.topicId, "topicId") : null;
      const axisId = input.axisId ? required(input.axisId, "axisId") : null;
      const problemId = input.problemId ? required(input.problemId, "problemId") : null;
      if (!(topicId || axisId || problemId)) {
        throw new ResearchStoreError("topicId, axisId or problemId is required.");
      }
      const targets = [topicId, axisId, problemId].filter((value) => value !== null).length;
      if (kind !== "note" && targets !== 1) {
        throw new ResearchStoreError(`A ${kind} claim must sit on exactly one of a topic, an axis or a problem \u2014 it names ${targets}.`);
      }
      if (topicId && !this.getTopic(topicId)) {
        throw new ResearchStoreError("Topic not found.");
      }
      const axis = axisId ? this.getAxis(axisId) : null;
      if (axisId && !axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (problemId && !this.getProblem(problemId)) {
        throw new ResearchStoreError("Problem not found.");
      }
      if (kind === "note" && input.confidence !== undefined && input.confidence !== null) {
        throw new ResearchStoreError("A plain note carries no confidence \u2014 carrying one is what makes it an interpretation.");
      }
      return this.insertAnnotation({
        authorId: input.authorId ?? "",
        authorType: input.authorType ?? "human",
        axisId,
        confidence: optionalOneOf(input.confidence ?? undefined, CONFIDENCES, "confidence") ?? null,
        kind,
        problemId,
        text: body,
        topicId: kind === "note" ? topicId ?? axis?.topicId ?? null : topicId
      });
    });
  }
  listProblems(axisId) {
    return this.snapshot(() => this.db.query("SELECT * FROM problems WHERE axis_id = ? ORDER BY created_at, id").all(required(axisId, "axisId")).map(toProblem));
  }
  getProblem(id) {
    const row = this.db.query("SELECT * FROM problems WHERE id = ?").get(id);
    return row ? toProblem(row) : null;
  }
  problemsForRepository(repositoryId) {
    return this.snapshot(() => this.db.query(`SELECT p.* FROM problems p
               JOIN problem_repositories l ON l.problem_id = p.id
              WHERE l.repository_id = ?
              ORDER BY p.created_at, p.id`).all(required(repositoryId, "repositoryId")).map(toProblem));
  }
  problemStateHistory(problemId) {
    return this.stateHistory("problem_id", required(problemId, "problemId"));
  }
  axisStateHistory(axisId) {
    return this.stateHistory("axis_id", required(axisId, "axisId"));
  }
  listPlans(axisId) {
    return this.snapshot(() => this.db.query("SELECT * FROM plans WHERE axis_id = ? ORDER BY created_at, id").all(required(axisId, "axisId")).map(toPlan));
  }
  getPlan(id) {
    const row = this.db.query("SELECT * FROM plans WHERE id = ?").get(id);
    return row ? toPlan(row) : null;
  }
  getPlanStep(id) {
    const row = this.db.query("SELECT * FROM plan_steps WHERE id = ?").get(id);
    return row ? toPlanStep(row) : null;
  }
  listProblemRepositories(problemId) {
    return this.db.query(`SELECT r.*
           FROM problem_repositories l JOIN repositories r ON r.id = l.repository_id
           WHERE l.problem_id = ?
           ORDER BY r.full_name COLLATE NOCASE ASC`).all(problemId).map(toRepository);
  }
  planForAxis(axisId) {
    return this.snapshot(() => {
      const plans = this.listPlans(axisId);
      const plan = plans.at(-1) ?? null;
      return plan ? { plan, steps: this.listPlanSteps(plan.id) } : null;
    });
  }
  listPlanSteps(planId) {
    return this.db.query(`SELECT * FROM plan_steps WHERE plan_id = ?
            ORDER BY position IS NULL, position, created_at, id`).all(required(planId, "planId")).map(toPlanStep);
  }
  createProblem(input) {
    return this.atomic(() => {
      const axis = this.getAxis(required(input.axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      const authorType = oneOf(input.authorType, AUTHOR_TYPES, "authorType");
      const state = optionalOneOf(input.state, PROBLEM_STATES, "state") ?? "open";
      const stateConfidence = optionalOneOf(input.stateConfidence, CONFIDENCES, "stateConfidence") ?? "confirmed";
      const planStepId = input.planStepId ?? null;
      if (planStepId) {
        this.assertPlanStepBelongsToAxis(planStepId, axis.id);
      }
      const id = crypto.randomUUID();
      const at = nowIso();
      this.db.query(`INSERT INTO problems (
             id, axis_id, statement, state, state_confidence, plan_step_id,
             author_type, author_id, version, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(id, axis.id, required(input.statement, "statement"), state, stateConfidence, planStepId, authorType, input.authorId ?? "", at, at);
      this.insertStateLogEntry({
        actorId: input.authorId ?? "",
        axisId: null,
        fromState: null,
        observedAt: null,
        origin: authorType,
        problemId: id,
        toState: state
      });
      for (const repositoryId of input.repositoryIds ?? []) {
        this.linkProblemRepository(id, repositoryId);
      }
      for (const fullName of input.repositoryFullNames ?? []) {
        this.linkProblemRepository(id, this.upsertRepository({ fullName }).repository.id);
      }
      for (const personId of input.personIds ?? []) {
        this.linkProblemPerson(id, personId);
      }
      this.touch("development_axes", axis.id);
      return this.getProblem(id);
    });
  }
  updateProblem(input) {
    return this.atomic(() => {
      const problem = this.getProblem(required(input.id, "id"));
      if (!problem) {
        throw new ResearchStoreError("Problem not found.");
      }
      const authorType = oneOf(input.authorType, AUTHOR_TYPES, "authorType");
      this.assertVersion("problem", problem.statement, problem.version, input.expectedVersion);
      const sets = [];
      const values = [];
      if (input.statement !== undefined) {
        const statement = required(input.statement, "statement");
        this.assertTextIsReplaceable(problem.authorType, authorType, problem.statement, statement, "the statement of this problem");
        if (statement !== problem.statement) {
          sets.push("statement = ?");
          values.push(statement);
          sets.push("author_type = ?", "author_id = ?");
          values.push(authorType, input.authorId ?? problem.authorId);
        }
      }
      if (input.stateConfidence !== undefined) {
        sets.push("state_confidence = ?");
        values.push(oneOf(input.stateConfidence, CONFIDENCES, "stateConfidence"));
      }
      if (input.planStepId !== undefined) {
        if (input.planStepId !== null) {
          this.assertPlanStepBelongsToAxis(input.planStepId, problem.axisId);
        }
        sets.push("plan_step_id = ?");
        values.push(input.planStepId);
      }
      if (sets.length > 0) {
        sets.push("version = version + 1", "updated_at = ?");
        values.push(nowIso(), problem.id);
        this.db.query(`UPDATE problems SET ${sets.join(", ")} WHERE id = ?`).run(...values);
      }
      if (input.repositoryIds) {
        this.replaceProblemRepositories(problem.id, input.repositoryIds);
      }
      if (input.repositoryFullNames) {
        this.replaceProblemRepositories(problem.id, input.repositoryFullNames.map((fullName) => this.upsertRepository({ fullName }).repository.id));
      }
      if (input.personIds) {
        this.replaceProblemPeople(problem.id, input.personIds);
      }
      this.touch("development_axes", problem.axisId);
      return this.getProblem(problem.id);
    });
  }
  transitionProblem(input) {
    return this.atomic(() => {
      const problem = this.getProblem(required(input.id, "id"));
      if (!problem) {
        throw new ResearchStoreError("Problem not found.");
      }
      const toState = oneOfState(input.toState, PROBLEM_STATES, "toState");
      const origin = oneOf(input.origin, AUTHOR_TYPES, "origin");
      this.assertVersion("problem", problem.statement, problem.version, input.expectedVersion);
      if (problem.state === toState) {
        throw new ResearchStoreError(`no-op: the problem is already "${toState}" \u2014 nothing was written.`, "no-op");
      }
      this.db.query("UPDATE problems SET state = ?, version = version + 1, updated_at = ? WHERE id = ?").run(toState, nowIso(), problem.id);
      const transition = this.insertStateLogEntry({
        actorId: input.actorId ?? "",
        axisId: null,
        fromState: problem.state,
        observedAt: input.observedAt ?? null,
        origin,
        problemId: problem.id,
        toState
      });
      this.touch("development_axes", problem.axisId);
      return { problem: this.getProblem(problem.id), transition };
    });
  }
  transitionAxis(input) {
    return this.atomic(() => {
      const axis = this.getAxis(required(input.axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      const toState = oneOfState(input.toState, AXIS_STATES, "toState");
      const origin = oneOf(input.origin, AUTHOR_TYPES, "origin");
      this.assertVersion("axis", axis.title, axis.version, input.expectedVersion);
      if (axis.state === toState) {
        throw new ResearchStoreError(`no-op: the axis is already "${toState}" \u2014 nothing was written.`, "no-op");
      }
      const blocker = input.blocker === undefined ? axis.blocker : text(input.blocker);
      this.assertBlockerPresent(toState, blocker);
      this.db.query("UPDATE development_axes SET state = ?, blocker = ?, version = version + 1, updated_at = ? WHERE id = ?").run(toState, blocker, nowIso(), axis.id);
      const transition = this.insertStateLogEntry({
        actorId: input.actorId ?? "",
        axisId: axis.id,
        fromState: axis.state,
        observedAt: input.observedAt ?? null,
        origin,
        problemId: null,
        toState
      });
      return { axis: this.getAxis(axis.id), transition };
    });
  }
  createPlan(input) {
    return this.atomic(() => {
      const axis = this.getAxis(required(input.axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      const id = crypto.randomUUID();
      const at = nowIso();
      this.db.query(`INSERT INTO plans (id, axis_id, summary, author_type, author_id, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).run(id, axis.id, required(input.summary, "summary"), oneOf(input.authorType, AUTHOR_TYPES, "authorType"), input.authorId ?? "", at, at);
      this.touch("development_axes", axis.id);
      return this.getPlan(id);
    });
  }
  updatePlan(input) {
    return this.atomic(() => {
      const plan = this.getPlan(required(input.id, "id"));
      if (!plan) {
        throw new ResearchStoreError("Plan not found.");
      }
      const authorType = oneOf(input.authorType, AUTHOR_TYPES, "authorType");
      this.assertVersion("plan", plan.summary, plan.version, input.expectedVersion);
      if (input.summary !== undefined) {
        const summary = required(input.summary, "summary");
        this.assertTextIsReplaceable(plan.authorType, authorType, plan.summary, summary, "this plan's summary");
        if (summary !== plan.summary) {
          this.db.query("UPDATE plans SET summary = ?, author_type = ?, author_id = ?, version = version + 1, updated_at = ? WHERE id = ?").run(summary, authorType, input.authorId ?? plan.authorId, nowIso(), plan.id);
        }
      }
      return this.getPlan(plan.id);
    });
  }
  createPlanStep(input) {
    return this.atomic(() => {
      const plan = this.getPlan(required(input.planId, "planId"));
      if (!plan) {
        throw new ResearchStoreError("Plan not found.");
      }
      const id = crypto.randomUUID();
      const at = nowIso();
      this.db.query(`INSERT INTO plan_steps (id, plan_id, title, position, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, plan.id, required(input.title, "title"), optionalPosition(input.position), optionalOneOf(input.state, PLAN_STEP_STATES, "state") ?? "pending", at, at);
      return this.listPlanSteps(plan.id).find((step) => step.id === id);
    });
  }
  updatePlanStep(input) {
    return this.atomic(() => {
      const existing = this.db.query("SELECT * FROM plan_steps WHERE id = ?").get(required(input.id, "id"));
      if (!existing) {
        throw new ResearchStoreError("Plan step not found.");
      }
      const sets = [];
      const values = [];
      if (input.title !== undefined) {
        sets.push("title = ?");
        values.push(required(input.title, "title"));
      }
      if (input.position !== undefined) {
        sets.push("position = ?");
        values.push(optionalPosition(input.position));
      }
      if (input.state !== undefined) {
        sets.push("state = ?");
        values.push(oneOf(input.state, PLAN_STEP_STATES, "state"));
      }
      if (sets.length > 0) {
        sets.push("updated_at = ?");
        values.push(nowIso(), existing.id);
        this.db.query(`UPDATE plan_steps SET ${sets.join(", ")} WHERE id = ?`).run(...values);
      }
      const row = this.db.query("SELECT * FROM plan_steps WHERE id = ?").get(existing.id);
      return toPlanStep(row);
    });
  }
  linkProblemRepository(problemId, repositoryId) {
    this.atomic(() => {
      if (!this.getProblem(problemId)) {
        throw new ResearchStoreError("Problem not found.");
      }
      if (!this.repositoryExists(repositoryId)) {
        throw new ResearchStoreError("Repository not found.");
      }
      this.db.query("INSERT OR IGNORE INTO problem_repositories (problem_id, repository_id) VALUES (?, ?)").run(problemId, repositoryId);
    });
  }
  linkProblemPerson(problemId, personId) {
    this.atomic(() => {
      if (!this.getProblem(problemId)) {
        throw new ResearchStoreError("Problem not found.");
      }
      if (!this.getPerson(personId)) {
        throw new ResearchStoreError("Person not found.");
      }
      this.db.query("INSERT OR IGNORE INTO problem_people (problem_id, person_id) VALUES (?, ?)").run(problemId, personId);
    });
  }
  overviewRecency(options) {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const axisTopic = new Map;
      for (const row of this.db.query("SELECT id, topic_id FROM development_axes").all()) {
        axisTopic.set(row.id, row.topic_id);
      }
      const topicTimes = new Map;
      const repositoryTimes = new Map;
      const remember = (map, key, at) => {
        if (!key) {
          return;
        }
        const list = map.get(key);
        if (list) {
          list.push(at);
        } else {
          map.set(key, [at]);
        }
      };
      for (const event of this.db.query("SELECT topic_id, axis_id, repository_id, occurred_at FROM activities").all()) {
        remember(topicTimes, event.topic_id ?? (event.axis_id ? axisTopic.get(event.axis_id) ?? null : null), event.occurred_at);
        remember(repositoryTimes, event.repository_id, event.occurred_at);
      }
      const axisRows = this.db.query("SELECT id, topic_id, state FROM development_axes").all();
      const liveAxesPerRepository = new Map;
      for (const row of this.db.query(`SELECT l.repository_id AS repository_id, a.state AS state
             FROM axis_repositories l
             JOIN development_axes a ON a.id = l.axis_id`).all()) {
        if (row.state === "active") {
          liveAxesPerRepository.set(row.repository_id, (liveAxesPerRepository.get(row.repository_id) ?? 0) + 1);
        }
      }
      const card = (id, name, kind, createdAt, times, liveAxisCount) => {
        const recencyAt = newestOf([...times, createdAt]);
        return {
          activityInWindow: times.filter((at) => scope.inWindow(at)).length,
          id,
          kind,
          lastActivityAt: newestOf(times),
          liveAxisCount,
          name,
          recencyAt,
          stale: isStale(recencyAt, scope.nowMs)
        };
      };
      const topics = this.db.query("SELECT * FROM topics").all().filter((row) => scope.visible(row.id)).map((row) => card(row.id, row.name, "topic", row.created_at ?? null, topicTimes.get(row.id) ?? [], axisRows.filter((axis) => axis.topic_id === row.id && axis.state === "active").length));
      const repositories = this.db.query("SELECT * FROM repositories").all().map((row) => card(row.id, row.full_name, "repository", row.created_at ?? null, repositoryTimes.get(row.id) ?? [], liveAxesPerRepository.get(row.id) ?? 0));
      return {
        activitySinceDays: scope.activitySinceDays,
        repositories: byRecencyDesc(repositories).slice(0, limit),
        staleAfterDays: STALE_AFTER_DAYS,
        topics: byRecencyDesc(topics).slice(0, limit)
      };
    });
  }
  evidenceByProblem() {
    const evidence = new Map;
    for (const row of this.db.query(`SELECT * FROM activities WHERE problem_id IS NOT NULL
          ORDER BY occurred_at DESC, rowid DESC`).all()) {
      const problemId = row.problem_id ?? "";
      const list = evidence.get(problemId) ?? [];
      if (list.length >= PROGRESS_SUPPORT_LIMIT) {
        continue;
      }
      list.push({
        id: row.id,
        label: evidenceLabel(row.source_type, row.source_ref),
        occurredAt: row.occurred_at,
        sourceRef: row.source_ref,
        sourceType: row.source_type,
        sourceUrl: row.source_url,
        summary: row.summary
      });
      evidence.set(problemId, list);
    }
    return evidence;
  }
  humanSteeringBy(target) {
    const column = target === "axis" ? "axis_id" : "problem_id";
    const steering = new Map;
    for (const row of this.db.query(`SELECT * FROM annotations
          WHERE ${column} IS NOT NULL
            AND kind IN ('interpretation', 'steering')
            AND author_type = 'human'
          ORDER BY created_at DESC, rowid DESC`).all()) {
      const owner = (target === "axis" ? row.axis_id : row.problem_id) ?? "";
      const list = steering.get(owner) ?? [];
      if (list.length >= PROGRESS_SUPPORT_LIMIT) {
        continue;
      }
      list.push({
        authorId: row.author_id,
        authorType: row.author_type === "agent" ? "agent" : "human",
        confidence: row.confidence ?? null,
        id: row.id,
        kind: asAnnotationKind(row.kind),
        recordedAt: row.created_at,
        scope: target,
        text: row.text
      });
      steering.set(owner, list);
    }
    return steering;
  }
  progressAxes(options) {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const problems = this.db.query("SELECT * FROM problems").all();
      const plans = this.db.query("SELECT * FROM plans").all();
      const steps = this.db.query("SELECT * FROM plan_steps").all();
      const axisTimes = new Map;
      for (const row of this.db.query("SELECT axis_id, occurred_at FROM activities WHERE axis_id IS NOT NULL").all()) {
        const list = axisTimes.get(row.axis_id);
        if (list) {
          list.push(row.occurred_at);
        } else {
          axisTimes.set(row.axis_id, [row.occurred_at]);
        }
      }
      const axisSteering = this.humanSteeringBy("axis");
      const rows = [...scope.scans.values()].map((scan) => {
        const mine = problems.filter((row) => row.axis_id === scan.id);
        const plan = plans.filter((row) => row.axis_id === scan.id).at(-1) ?? null;
        const planSteps = plan ? steps.filter((row) => row.plan_id === plan.id).map(toPlanStep).sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER) || left.createdAt.localeCompare(right.createdAt)) : [];
        const times = axisTimes.get(scan.id) ?? [];
        const recencyAt = newestOf([...times, scan.updatedAt]);
        return {
          activityInWindow: times.filter((at) => scope.inWindow(at)).length,
          blocker: scan.blocker,
          blockerConfidence: scan.blockerConfidence,
          id: scan.id,
          lastActivityAt: newestOf(times),
          openProblems: mine.filter((row) => row.state === "open").length,
          plan: plan ? {
            id: plan.id,
            steps: planSteps,
            stepsDone: planSteps.filter((step) => step.state === "done").length,
            summary: plan.summary
          } : null,
          problems: mine.length,
          recencyAt,
          stale: isStale(recencyAt, scope.nowMs),
          state: scan.state,
          stateConfidence: scan.stateConfidence,
          stateHistory: this.axisStateHistory(scan.id),
          steering: axisSteering.get(scan.id) ?? [],
          title: scan.title,
          topicId: scan.topicId,
          topicName: scope.topicRefs.get(scan.topicId)?.name ?? ""
        };
      });
      return {
        activitySinceDays: scope.activitySinceDays,
        axes: byRecencyDesc(rows.filter((row) => row.problems > 0 || true)).slice(0, limit),
        staleAfterDays: STALE_AFTER_DAYS
      };
    });
  }
  progressProblems(options) {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const stepRows = new Map;
      for (const row of this.db.query("SELECT * FROM plan_steps").all()) {
        stepRows.set(row.id, row);
      }
      const problemTimes = new Map;
      for (const row of this.db.query("SELECT problem_id, occurred_at FROM activities WHERE problem_id IS NOT NULL").all()) {
        const list = problemTimes.get(row.problem_id);
        if (list) {
          list.push(row.occurred_at);
        } else {
          problemTimes.set(row.problem_id, [row.occurred_at]);
        }
      }
      const repositoriesOf = new Map;
      for (const row of this.db.query(`SELECT l.problem_id AS problem_id, r.id AS id, r.full_name AS full_name
             FROM problem_repositories l
             JOIN repositories r ON r.id = l.repository_id
            ORDER BY l.rowid, r.full_name`).all()) {
        const list = repositoriesOf.get(row.problem_id) ?? [];
        list.push({ fullName: row.full_name, id: row.id });
        repositoriesOf.set(row.problem_id, list);
      }
      const peopleOf = new Map;
      for (const row of this.db.query(`SELECT l.problem_id AS problem_id, p.id AS id, p.display_name AS display_name
             FROM problem_people l
             JOIN people p ON p.id = l.person_id`).all()) {
        const list = peopleOf.get(row.problem_id) ?? [];
        list.push({ displayName: row.display_name, id: row.id });
        peopleOf.set(row.problem_id, list);
      }
      const evidenceOf = this.evidenceByProblem();
      const steeringOf = this.humanSteeringBy("problem");
      const rows = this.db.query("SELECT * FROM problems").all().map((row) => ({ problem: toProblem(row), row })).filter(({ row }) => {
        const axis = scope.scans.get(row.axis_id);
        return Boolean(axis) && scope.visible(axis?.topicId ?? "");
      }).map(({ problem }) => {
        const scan = scope.scans.get(problem.axisId);
        const times = problemTimes.get(problem.id) ?? [];
        const recencyAt = newestOf([...times, problem.createdAt]);
        const stepRow = problem.planStepId ? stepRows.get(problem.planStepId) : null;
        return {
          activityCount: times.length,
          authorId: problem.authorId,
          authorType: problem.authorType,
          axisId: problem.axisId,
          axisTitle: scan?.title ?? "",
          evidence: evidenceOf.get(problem.id) ?? [],
          history: this.problemStateHistory(problem.id),
          id: problem.id,
          lastActivityAt: newestOf(times),
          people: peopleOf.get(problem.id) ?? [],
          planStepId: problem.planStepId,
          planStepTitle: stepRow?.title ?? null,
          recencyAt,
          repositories: repositoriesOf.get(problem.id) ?? [],
          stale: isStale(recencyAt, scope.nowMs),
          state: problem.state,
          stateConfidence: problem.stateConfidence,
          statement: problem.statement,
          steering: steeringOf.get(problem.id) ?? [],
          topicId: scan?.topicId ?? "",
          topicName: scope.topicRefs.get(scan?.topicId ?? "")?.name ?? ""
        };
      });
      return {
        activitySinceDays: scope.activitySinceDays,
        problems: byRecencyDesc(rows).slice(0, limit),
        staleAfterDays: STALE_AFTER_DAYS
      };
    });
  }
  progressActivity(options) {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const personByAccount = this.personRefByAccount();
      const rows = this.db.query(`SELECT * FROM activities
           WHERE axis_id IS NOT NULL
           ORDER BY occurred_at DESC, rowid DESC`).all();
      const byAxis = new Map;
      for (const row of rows) {
        const event = toActivity(row);
        const axisId = event.axisId;
        if (!axisId || !scope.scans.has(axisId) || !scope.inWindow(event.occurredAt)) {
          continue;
        }
        const bucket = byAxis.get(axisId) ?? { axisId, eventCount: 0, events: [] };
        bucket.eventCount += 1;
        if (bucket.events.length < limit) {
          bucket.events.push({
            ...event,
            person: personByAccount.get(event.actorId) ?? null
          });
        }
        byAxis.set(axisId, bucket);
      }
      const listed = this.progressAxes({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false,
        limit
      }).axes.map((row) => row.id);
      const byIndexOrder = listed.map((id) => byAxis.get(id)).filter((bucket) => Boolean(bucket));
      const unlisted = [...byAxis.values()].filter((bucket) => !listed.includes(bucket.axisId)).sort((left, right) => (right.events[0]?.occurredAt ?? "").localeCompare(left.events[0]?.occurredAt ?? ""));
      return {
        activitySinceDays: scope.activitySinceDays,
        byAxis: [...byIndexOrder, ...unlisted],
        staleAfterDays: STALE_AFTER_DAYS
      };
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
      const touchedPlans = [];
      const touchedProblems = [];
      const recordedTransitions = [];
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
          topicId: topic.id,
          problemId: activityInput.problemId ?? null
        });
        activities.push(activity.id);
      }
      for (const annotationInput of input.annotations ?? []) {
        const axisId = this.resolveAxisId(topic.id, annotationInput.axisId, annotationInput.axisTitle);
        const kind = optionalOneOf(annotationInput.kind, ANNOTATION_KINDS, "kind") ?? "note";
        const annotation = this.insertAnnotation({
          authorId: actor.id,
          authorType: annotationInput.authorType ?? (actor.type === "agent" ? "agent" : "human"),
          axisId,
          confidence: kind === "note" ? null : optionalOneOf(annotationInput.confidence, CONFIDENCES, "confidence") ?? null,
          kind,
          problemId: annotationInput.problemId ?? null,
          text: required(annotationInput.text, "text"),
          topicId: kind === "note" ? topic.id : null
        });
        annotations.push(annotation.id);
      }
      const authorType = actor.type === "agent" ? "agent" : "human";
      for (const planInput of input.plans ?? []) {
        const axisId = this.resolveAxisId(topic.id, planInput.axisId, planInput.axisTitle);
        if (!axisId) {
          throw new ResearchStoreError("plans[] need an axisId or axisTitle: a plan belongs to an axis.");
        }
        const plan = planInput.planId ? this.updatePlan({
          authorId: actor.id,
          authorType,
          id: planInput.planId,
          summary: required(planInput.summary, "summary")
        }) : this.createPlan({
          authorId: actor.id,
          authorType,
          axisId,
          summary: required(planInput.summary, "summary")
        });
        for (const step of planInput.steps ?? []) {
          if (step.stepId) {
            this.updatePlanStep({
              id: step.stepId,
              position: step.position,
              state: optionalOneOf(step.state, PLAN_STEP_STATES, "state"),
              title: required(step.title, "title")
            });
          } else {
            this.createPlanStep({
              planId: plan.id,
              position: step.position,
              state: optionalOneOf(step.state, PLAN_STEP_STATES, "state"),
              title: required(step.title, "title")
            });
          }
        }
        touchedPlans.push({
          ...plan,
          steps: this.listPlanSteps(plan.id)
        });
      }
      for (const problemInput of input.problems ?? []) {
        const statement = required(problemInput.statement, "statement");
        if (problemInput.problemId) {
          if (problemInput.state !== undefined) {
            throw new ResearchStoreError("problems[].state applies when creating. To change an existing problem's state, send it in `transitions` so the change is recorded.");
          }
          touchedProblems.push(this.updateProblem({
            authorId: actor.id,
            authorType,
            id: problemInput.problemId,
            personIds: problemInput.personIds,
            planStepId: problemInput.planStepId,
            repositoryFullNames: problemInput.repositoryFullNames,
            statement,
            stateConfidence: optionalOneOf(problemInput.stateConfidence, CONFIDENCES, "stateConfidence")
          }));
          continue;
        }
        const axisId = this.resolveAxisId(topic.id, problemInput.axisId, problemInput.axisTitle);
        if (!axisId) {
          throw new ResearchStoreError("problems[] need an axisId or axisTitle: a problem is raised against an axis.");
        }
        touchedProblems.push(this.createProblem({
          authorId: actor.id,
          authorType,
          axisId,
          personIds: problemInput.personIds,
          planStepId: problemInput.planStepId ?? null,
          repositoryFullNames: problemInput.repositoryFullNames,
          state: optionalOneOf(problemInput.state, PROBLEM_STATES, "state"),
          stateConfidence: optionalOneOf(problemInput.stateConfidence, CONFIDENCES, "stateConfidence"),
          statement
        }));
      }
      for (const transitionInput of input.transitions ?? []) {
        const observedAt = text(transitionInput.observedAt);
        if (transitionInput.subject === "problem") {
          const result = this.transitionProblem({
            actorId: actor.id,
            expectedVersion: transitionInput.expectedVersion,
            id: required(transitionInput.problemId, "problemId"),
            observedAt,
            origin: authorType,
            toState: transitionInput.toState
          });
          recordedTransitions.push(result.transition);
          touchedProblems.push(result.problem);
          continue;
        }
        const axisId = this.resolveAxisId(topic.id, transitionInput.axisId, transitionInput.axisTitle);
        if (!axisId) {
          throw new ResearchStoreError("transitions[] with subject 'axis' need an axisId or axisTitle.");
        }
        const result = this.transitionAxis({
          actorId: actor.id,
          axisId,
          blocker: text(transitionInput.blocker),
          expectedVersion: transitionInput.expectedVersion,
          observedAt,
          origin: authorType,
          toState: transitionInput.toState
        });
        recordedTransitions.push(result.transition);
        touchedAxes.push(result.axis);
      }
      for (const axis of touchedAxes) {
        this.assertClaimsAreBacked(axis, assertedByAxis.get(axis.id) ?? NO_CLAIMS);
      }
      return {
        axes: touchedAxes.map((axis) => this.getAxis(axis.id) ?? axis),
        created,
        plans: touchedPlans,
        problems: touchedProblems,
        recorded: { activities, annotations },
        topic: this.getTopic(topic.id),
        transitions: recordedTransitions
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
  insertStateLogEntry(input) {
    const id = crypto.randomUUID();
    this.db.query(`INSERT INTO state_log (
           id, axis_id, problem_id, from_state, to_state, origin, actor_id, observed_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.axisId, input.problemId, input.fromState, input.toState, input.origin, input.actorId, input.observedAt, nowIso());
    return toStateLogEntry(this.db.query("SELECT * FROM state_log WHERE id = ?").get(id));
  }
  stateHistory(column, id) {
    return this.db.query(`SELECT * FROM state_log WHERE ${column} = ? ORDER BY recorded_at, rowid`).all(id).map(toStateLogEntry);
  }
  assertTextIsReplaceable(existing, incoming, current, next, what) {
    if (next === current) {
      return;
    }
    if (existing === "human" && incoming === "agent") {
      throw new ResearchStoreError(`human-authored: ${what} was written by a human \u2014 an agent cannot rewrite it. Change the state, the links or a plan step instead, or have the human edit the text.`, "human-authored");
    }
  }
  assertPlanStepBelongsToAxis(planStepId, axisId) {
    const row = this.db.query(`SELECT p.axis_id AS axis_id
           FROM plan_steps s
           JOIN plans p ON p.id = s.plan_id
          WHERE s.id = ?`).get(planStepId);
    if (!row) {
      throw new ResearchStoreError("Plan step not found.");
    }
    if (row.axis_id !== axisId) {
      throw new ResearchStoreError("That plan step belongs to a plan on another axis.");
    }
  }
  replaceProblemRepositories(problemId, repositoryIds) {
    this.db.query("DELETE FROM problem_repositories WHERE problem_id = ?").run(problemId);
    for (const repositoryId of repositoryIds) {
      this.linkProblemRepository(problemId, repositoryId);
    }
  }
  replaceProblemPeople(problemId, personIds) {
    this.db.query("DELETE FROM problem_people WHERE problem_id = ?").run(problemId);
    for (const personId of personIds) {
      this.linkProblemPerson(problemId, personId);
    }
  }
  insertActivity(input) {
    const id = input.id ?? crypto.randomUUID();
    let topicId = input.topicId;
    let axisId = input.axisId;
    if (input.problemId && (axisId === null || topicId === null)) {
      const problem = this.db.query("SELECT axis_id FROM problems WHERE id = ?").get(input.problemId);
      if (problem) {
        const axis = this.db.query("SELECT topic_id FROM development_axes WHERE id = ?").get(problem.axis_id);
        axisId = axisId ?? problem.axis_id;
        topicId = topicId ?? axis?.topic_id ?? null;
      }
    }
    const recordedAt = nowIso();
    this.db.query(`INSERT INTO activities (
           id, topic_id, axis_id, problem_id, repository_id, summary, source_type, source_ref,
           source_url, actor_type, actor_id, occurred_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, topicId, axisId, input.problemId, input.repositoryId, input.summary, input.sourceType, input.sourceRef, input.sourceUrl, input.actorType, input.actorId, input.occurredAt, recordedAt);
    this.touch("topics", topicId);
    this.touch("development_axes", axisId);
    return toActivity(this.db.query("SELECT * FROM activities WHERE id = ?").get(id));
  }
  insertAnnotation(input) {
    const targets = [input.topicId, input.axisId, input.problemId].filter((value) => value !== null).length;
    if (input.kind !== "note" && targets !== 1) {
      throw new ResearchStoreError(`A ${input.kind} claim must sit on exactly one of a topic, an axis or a problem \u2014 it names ${targets}.`, "invalid-input");
    }
    const id = crypto.randomUUID();
    this.db.query(`INSERT INTO annotations (
           id, topic_id, axis_id, problem_id, text, kind, confidence, author_type, author_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.topicId, input.axisId, input.problemId, input.text, input.kind, input.confidence, input.authorType, input.authorId, nowIso());
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
function refusalKind(error) {
  if (error instanceof ResearchStoreConflictError) {
    return "conflict";
  }
  if (error instanceof ResearchStoreError && error.code) {
    return error.code;
  }
  return "invalid-input";
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
      return {
        error: error.message,
        kind: refusalKind(error),
        ok: false
      };
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
    case "get_progress": {
      const options = {
        activitySinceDays: optionalInt(input.activitySinceDays, "activitySinceDays", 0, 365),
        includeArchived: input.includeArchived === true,
        limit: optionalInt(input.limit, "limit", 1, 50)
      };
      return {
        ok: true,
        activity: store.progressActivity(options),
        axes: store.progressAxes(options),
        problems: store.progressProblems(options)
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
