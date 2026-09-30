// @bun
// src/store.ts
import { Database } from "bun:sqlite";
var TOPIC_STATUSES = ["active", "paused", "completed", "archived"];
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
    blockerConfidence: row.blocker_confidence ?? "confirmed",
    branch: row.branch,
    createdAt: row.created_at,
    currentState: row.current_state,
    currentStateConfidence: row.current_state_confidence ?? "confirmed",
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
      const explicit = [
        input.stateConfidence,
        input.currentStateConfidence,
        input.blockerConfidence
      ].some((value) => value === "confirmed");
      if (explicit) {
        this.assertClaimsAreBacked(axis);
      }
      return axis;
    });
  }
  updateAxis(id, patch, options) {
    return this.atomic(() => {
      const axis = this.applyAxisPatch(required(id, "axisId"), patch, options);
      const claims = [
        patch.state,
        patch.currentState,
        patch.blocker,
        patch.stateConfidence,
        patch.currentStateConfidence,
        patch.blockerConfidence
      ].some((value) => value !== undefined);
      if (claims) {
        this.assertClaimsAreBacked(axis);
      }
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
      if (!topicId && !axisId) {
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
      if (input.repositoryId && !this.repositoryExists(input.repositoryId)) {
        throw new ResearchStoreError("Repository not found.");
      }
      return this.insertActivity({
        actorId: input.actorId ?? "",
        actorType: optionalOneOf(input.actorType, ACTOR_TYPES, "actorType") ?? "unknown",
        axisId,
        occurredAt: input.occurredAt ?? nowIso(),
        repositoryId: input.repositoryId ?? null,
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
      if (!topicId && !axisId) {
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
      const created = { axes: 0, people: 0, repositories: 0, topic: resolved.created };
      const touchedAxes = [];
      const activities = [];
      const annotations = [];
      for (const person of input.people ?? []) {
        const result = this.upsertPerson(person);
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
        const existing = axisInput.id ? this.getAxis(required(axisInput.id, "axis.id")) : axisInput.title ? this.getAxisByTitle(topic.id, axisInput.title) : null;
        if (axisInput.id && !existing) {
          throw new ResearchStoreError("Axis not found.");
        }
        if (existing && existing.topicId !== topic.id) {
          throw new ResearchStoreError("Axis does not belong to this topic.");
        }
        let axis;
        if (existing) {
          axis = this.applyAxisPatch(existing.id, axisInput, { expectedVersion: axisInput.expectedVersion });
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
          const result = this.upsertPerson(person);
          if (result.created) {
            created.people += 1;
          }
          this.db.query("INSERT INTO axis_people (axis_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (axis_id, person_id) DO UPDATE SET role = excluded.role").run(axis.id, result.person.id, person.role ?? "");
        }
        touchedAxes.push(axis);
      }
      for (const activityInput of input.activities ?? []) {
        const axisId = this.resolveAxisId(topic.id, activityInput.axisId, activityInput.axisTitle);
        const repository = activityInput.repositoryFullName ? this.upsertRepository({ fullName: activityInput.repositoryFullName }) : null;
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
        this.assertClaimsAreBacked(axis);
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
      name: patch.name !== undefined ? required(patch.name, "name") : existing.name,
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
      title: patch.title !== undefined ? required(patch.title, "axis.title") : existing.title
    };
    this.assertBlockerPresent(next.state ?? existing.state, next.blocker);
    this.db.query(`UPDATE development_axes SET
           title = ?, description = ?, kind = ?, state = ?, branch = ?, pr_number = ?, pr_url = ?,
           current_state = ?, blocker = ?, state_confidence = ?, current_state_confidence = ?,
           blocker_confidence = ?, version = version + 1, updated_at = ?
         WHERE id = ?`).run(next.title, next.description, next.kind ?? existing.kind, next.state ?? existing.state, next.branch, next.prNumber, next.prUrl, next.currentState, next.blocker, next.stateConfidence ?? existing.stateConfidence, next.currentStateConfidence ?? existing.currentStateConfidence, next.blockerConfidence ?? existing.blockerConfidence, nowIso(), id);
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
      return { created: false, repository: this.getRepositoryByFullName(fullName) };
    }
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO repositories (id, full_name, url, description, default_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, fullName, text(input.url), text(input.description), text(input.defaultBranch), timestamp, timestamp);
    return { created: true, repository: this.getRepositoryByFullName(fullName) };
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
  getAxisByTitle(topicId, title) {
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
      const axis = this.getAxisByTitle(topicId, axisTitle);
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
  assertClaimsAreBacked(axis) {
    const claims = [
      ["state", axis.stateConfidence],
      ["current_state", axis.currentStateConfidence],
      ["blocker", axis.blockerConfidence]
    ];
    const unbacked = claims.filter(([, confidence]) => confidence === "confirmed");
    if (unbacked.length === 0) {
      return;
    }
    const evidence = axis.branch.trim().length > 0 || axis.prUrl.trim().length > 0 || axis.prNumber !== null || Boolean(this.db.query("SELECT 1 AS present FROM activities WHERE axis_id = ? LIMIT 1").get(axis.id)) || Boolean(this.db.query("SELECT 1 AS present FROM annotations WHERE axis_id = ? LIMIT 1").get(axis.id));
    if (!evidence) {
      throw new ResearchStoreError(`Axis "${axis.title}" claims 'confirmed' for ${unbacked.map(([field]) => field).join(", ")} but carries no evidence \u2014 add a branch, a PR or an activity, or mark it 'inferred'.`);
    }
  }
}

// src/actions.ts
var LEGACY_STATUS_TO_TOPIC = {
  active: "active",
  done: "completed",
  paused: "paused"
};
var TOPIC_STATUS_TO_LEGACY = {
  active: "active",
  archived: "archived",
  completed: "done",
  paused: "paused"
};

class BusinessRuleError extends Error {
}
function required2(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BusinessRuleError(`${field} is required.`);
  }
  return value.trim();
}
function optionalStatus(value) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !(value in LEGACY_STATUS_TO_TOPIC)) {
    throw new BusinessRuleError("status must be one of: active, paused, done.");
  }
  return LEGACY_STATUS_TO_TOPIC[value];
}
function activityLimit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_ACTIVITY_LIMIT);
}
function actorOf(context) {
  const id = context.actor?.id ?? "";
  if (context.profileId) {
    return { id, type: "agent" };
  }
  return id ? { id, type: "human" } : { id: "", type: "unknown" };
}
function toLegacyProject(topic) {
  return {
    createdAt: topic.createdAt,
    description: topic.description,
    id: topic.id,
    name: topic.name,
    status: TOPIC_STATUS_TO_LEGACY[topic.status],
    summary: topic.summary,
    updatedAt: topic.updatedAt
  };
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
      return {
        ok: true,
        projects: store.listTopics(status).map(toLegacyProject)
      };
    }
    case "create_project": {
      const topic = store.createTopic({
        description: input.description ?? "",
        name: required2(input.name, "name"),
        status: optionalStatus(input.status)
      });
      return { ok: true, project: toLegacyProject(topic) };
    }
    case "update_project": {
      const topicId = required2(input.projectId, "projectId");
      const topic = store.updateTopic(topicId, {
        description: input.description,
        name: input.name,
        status: optionalStatus(input.status),
        summary: input.summary
      });
      return { ok: true, project: toLegacyProject(topic) };
    }
    case "list_activity": {
      const topicId = input.projectId ? required2(input.projectId, "projectId") : undefined;
      return {
        activity: store.listActivity({ limit: activityLimit(input.limit), topicId }).map((activity) => ({
          id: activity.id,
          occurredAt: activity.occurredAt,
          projectId: activity.topicId ?? "",
          sourceRef: activity.sourceRef,
          sourceType: activity.sourceType,
          summary: activity.summary
        })),
        ok: true
      };
    }
    case "add_activity": {
      const topicId = required2(input.projectId, "projectId");
      const actor = actorOf(context);
      const activity = store.addActivity({
        actorId: actor.id,
        actorType: actor.type,
        occurredAt: input.occurredAt,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        summary: required2(input.summary, "summary"),
        topicId
      });
      const topic = store.getTopic(topicId);
      return {
        activity: {
          id: activity.id,
          occurredAt: activity.occurredAt,
          projectId: activity.topicId ?? "",
          sourceRef: activity.sourceRef,
          sourceType: activity.sourceType,
          summary: activity.summary
        },
        ok: true,
        project: topic ? toLegacyProject(topic) : null
      };
    }
    default:
      throw new Error(`Unsupported action: ${context.actionKey}`);
  }
}
export {
  run
};
