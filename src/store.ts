/**
 * Data access for the research dashboard, generation 2.
 *
 * The database is the organization-scoped generation Nakama selects for this plugin
 * (`context.databasePath`). Nothing here resolves its own paths or reads user input as a storage
 * location.
 *
 * ## Transaction boundaries are part of this API
 *
 * Every public writer below is atomic on its own, and composite operations reuse the same boundary
 * instead of asking the caller to orchestrate several writes: `reconcileTopic` applies a whole topic
 * update — topic fields, axes, repository/person links, activities, annotations — in one transaction,
 * so a librarian action can call it once and rely on all-or-nothing. Callers never write SQL and never
 * open a transaction; `atomic()` is the only place `BEGIN`/`COMMIT` appears, and it is reentrant so
 * nested calls join the transaction already in flight.
 *
 * ## Why the connection is configured on every open
 *
 * Each action runs in a fresh child process, so there is no "set the pragmas once at startup" moment:
 * `foreign_keys` (cascades and referential checks), `journal_mode = WAL` (concurrent readers while a
 * writer holds the file) and `busy_timeout` (waiting instead of failing on a lock) are set in the
 * constructor, i.e. on every open.
 *
 * ## Errors
 *
 * `ResearchStoreError` is a rule the caller can fix by sending different input (unknown id, empty
 * required field, blocked without blocker text). `ResearchStoreConflictError` extends it for the
 * optimistic-version case; its message starts with `conflict: `. The action layer turns both into
 * `{ ok: false, error }` because a thrown error from plugin code reaches the caller as a generic
 * server error.
 */
import { Database } from "bun:sqlite";

export const TOPIC_STATUSES = [
  "active",
  "paused",
  "completed",
  "archived",
] as const;
export const AXIS_KINDS = [
  "feature",
  "experiment",
  "test",
  "investigation",
  "maintenance",
] as const;
/** Axis lifecycle. Deliberately a different vocabulary from topic status. */
export const AXIS_STATES = [
  "active",
  "draft",
  "blocked",
  "parked",
  "completed",
  "abandoned",
] as const;
export const CONFIDENCES = ["confirmed", "inferred", "uncertain"] as const;
export const SOURCE_TYPES = [
  "manual",
  "github_pr",
  "github_commit",
  "github_issue",
  "repo_document",
  "group_chat",
  "experiment",
  "agent_review",
] as const;
export const ACTOR_TYPES = ["human", "agent", "system", "unknown"] as const;
export const RELATIONSHIPS = ["primary", "supporting"] as const;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export type AxisKind = (typeof AXIS_KINDS)[number];
export type AxisState = (typeof AXIS_STATES)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ActorType = (typeof ACTOR_TYPES)[number];
export type Relationship = (typeof RELATIONSHIPS)[number];

export type Topic = {
  id: string;
  name: string;
  description: string;
  status: TopicStatus;
  summary: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Repository = {
  id: string;
  fullName: string;
  url: string;
  description: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
};

export type Person = {
  id: string;
  displayName: string;
  nakamaUserId: string | null;
  githubLogin: string | null;
  notes: string;
};

export type Axis = {
  id: string;
  topicId: string;
  title: string;
  description: string;
  kind: AxisKind;
  state: AxisState;
  branch: string;
  prNumber: number | null;
  prUrl: string;
  currentState: string;
  blocker: string;
  stateConfidence: Confidence;
  currentStateConfidence: Confidence;
  blockerConfidence: Confidence;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
};

export type Activity = {
  id: string;
  topicId: string | null;
  axisId: string | null;
  repositoryId: string | null;
  summary: string;
  sourceType: SourceType;
  sourceRef: string;
  sourceUrl: string;
  actorType: ActorType;
  actorId: string;
  occurredAt: string;
  recordedAt: string;
};

export type Annotation = {
  id: string;
  topicId: string | null;
  axisId: string | null;
  text: string;
  authorType: "human" | "agent";
  authorId: string;
  createdAt: string;
};

/** A repository as attached to a topic or an axis, with the relationship carried on the link row. */
export type LinkedRepository = Repository & { relationship: Relationship };
export type LinkedPerson = Person & { role: string };

type TopicRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  summary: string;
  version: number;
  created_at: string;
  updated_at: string;
};

type RepositoryRow = {
  id: string;
  full_name: string;
  url: string;
  description: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
};

type PersonRow = {
  id: string;
  display_name: string;
  nakama_user_id: string | null;
  github_login: string | null;
  notes: string;
};

type AxisRow = {
  id: string;
  topic_id: string;
  title: string;
  description: string;
  kind: string;
  state: string;
  branch: string;
  pr_number: number | null;
  pr_url: string;
  current_state: string;
  blocker: string;
  state_confidence: string;
  current_state_confidence: string;
  blocker_confidence: string;
  version: number;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
};

type ActivityRow = {
  id: string;
  topic_id: string | null;
  axis_id: string | null;
  repository_id: string | null;
  summary: string;
  source_type: string;
  source_ref: string;
  source_url: string;
  actor_type: string;
  actor_id: string;
  occurred_at: string;
  recorded_at: string;
};

type AnnotationRow = {
  id: string;
  topic_id: string | null;
  axis_id: string | null;
  text: string;
  author_type: string;
  author_id: string;
  created_at: string;
};

export const DEFAULT_ACTIVITY_LIMIT = 25;
export const MAX_ACTIVITY_LIMIT = 100;
export const DEFAULT_ANNOTATION_LIMIT = 25;
export const MAX_ANNOTATION_LIMIT = 100;
export const BUSY_TIMEOUT_MS = 5000;

/** A rule the caller can fix by sending different input. */
export class ResearchStoreError extends Error {}

/** Optimistic-version failure: someone else wrote to the row since the caller read it. */
export class ResearchStoreConflictError extends ResearchStoreError {}

function nowIso(): string {
  return new Date().toISOString();
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ResearchStoreError(`${field} is required.`);
  }
  return value.trim();
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new ResearchStoreError(
      `${field} must be one of: ${allowed.join(", ")}.`
    );
  }
  return value as T;
}

function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T | undefined {
  return value === undefined || value === null
    ? undefined
    : oneOf(value, allowed, field);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

export function isTopicStatus(value: unknown): value is TopicStatus {
  return (
    typeof value === "string" &&
    (TOPIC_STATUSES as readonly string[]).includes(value)
  );
}

function toTopic(row: TopicRow): Topic {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    status: isTopicStatus(row.status) ? row.status : "active",
    summary: row.summary,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toRepository(row: RepositoryRow): Repository {
  return {
    createdAt: row.created_at,
    defaultBranch: row.default_branch,
    description: row.description,
    fullName: row.full_name,
    id: row.id,
    updatedAt: row.updated_at,
    url: row.url,
  };
}

function toPerson(row: PersonRow): Person {
  return {
    displayName: row.display_name,
    githubLogin: row.github_login,
    id: row.id,
    nakamaUserId: row.nakama_user_id,
    notes: row.notes,
  };
}

function toAxis(row: AxisRow): Axis {
  return {
    blocker: row.blocker,
    blockerConfidence: (row.blocker_confidence as Confidence) ?? "confirmed",
    branch: row.branch,
    createdAt: row.created_at,
    currentState: row.current_state,
    currentStateConfidence:
      (row.current_state_confidence as Confidence) ?? "confirmed",
    description: row.description,
    id: row.id,
    kind: (row.kind as AxisKind) ?? "feature",
    lastReviewedAt: row.last_reviewed_at,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    state: (row.state as AxisState) ?? "active",
    stateConfidence: (row.state_confidence as Confidence) ?? "confirmed",
    title: row.title,
    topicId: row.topic_id,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toActivity(row: ActivityRow): Activity {
  return {
    actorId: row.actor_id,
    actorType: (row.actor_type as ActorType) ?? "unknown",
    axisId: row.axis_id,
    id: row.id,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    repositoryId: row.repository_id,
    sourceRef: row.source_ref,
    sourceType: (row.source_type as SourceType) ?? "manual",
    sourceUrl: row.source_url,
    summary: row.summary,
    topicId: row.topic_id,
  };
}

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    authorId: row.author_id,
    authorType: row.author_type === "agent" ? "agent" : "human",
    axisId: row.axis_id,
    createdAt: row.created_at,
    id: row.id,
    text: row.text,
    topicId: row.topic_id,
  };
}

export type ReconcileAxisInput = {
  id?: string;
  title?: string;
  description?: string;
  kind?: AxisKind;
  state?: AxisState;
  branch?: string;
  prNumber?: number | null;
  prUrl?: string;
  currentState?: string;
  blocker?: string;
  stateConfidence?: Confidence;
  currentStateConfidence?: Confidence;
  blockerConfidence?: Confidence;
  expectedVersion?: number;
  repositories?: Array<{
    fullName: string;
    relationship?: Relationship;
    url?: string;
    description?: string;
    defaultBranch?: string;
  }>;
  people?: Array<{
    displayName: string;
    role?: string;
    githubLogin?: string;
    nakamaUserId?: string;
  }>;
};

export type ReconcileTopicInput = {
  actor?: { id?: string; type?: ActorType };
  topicId?: string;
  topicName?: string;
  topic?: {
    name?: string;
    description?: string;
    status?: TopicStatus;
    summary?: string;
  };
  expectedVersion?: number;
  axes?: ReconcileAxisInput[];
  activities?: Array<{
    summary: string;
    sourceType?: SourceType;
    sourceRef?: string;
    sourceUrl?: string;
    occurredAt?: string;
    axisId?: string;
    axisTitle?: string;
    repositoryFullName?: string;
  }>;
  annotations?: Array<{
    text: string;
    axisId?: string;
    axisTitle?: string;
    authorType?: "human" | "agent";
  }>;
  people?: Array<{
    displayName: string;
    role?: string;
    githubLogin?: string;
    nakamaUserId?: string;
  }>;
  repositories?: Array<{
    fullName: string;
    relationship?: Relationship;
    url?: string;
    description?: string;
    defaultBranch?: string;
  }>;
};

export type ReconcileResult = {
  topic: Topic;
  axes: Axis[];
  created: {
    topic: boolean;
    axes: number;
    repositories: number;
    people: number;
  };
  recorded: {
    activities: string[];
    annotations: string[];
  };
};

/** One search hit, with the fields it matched so a caller can say *why* it came back. */
export type SearchHit<T> = {
  matchedFields: string[];
  record: T;
  /** The owning topic, for hits that are not topics themselves. */
  topicName?: string | null;
};

export type SearchResults = {
  query: string;
  limit: number;
  includeArchived: boolean;
  topics: Array<SearchHit<Topic>>;
  axes: Array<SearchHit<Axis>>;
  activities: Array<SearchHit<Activity>>;
  annotations: Array<SearchHit<Annotation>>;
  /** True when a group hit the limit, i.e. there may be more matches than returned. */
  truncated: boolean;
};

/** The dashboard front page in one call. */
export type Overview = {
  generatedAt: string;
  activitySinceDays: number;
  counts: {
    topics: number;
    axes: number;
    repositories: number;
    people: number;
    topicsByStatus: Record<TopicStatus, number>;
  };
  axesByState: Record<AxisState, number>;
  blocked: Array<{
    axisId: string;
    topicId: string;
    topicName: string;
    title: string;
    state: AxisState;
    blocker: string;
    blockerConfidence: Confidence;
    updatedAt: string;
  }>;
  recentTopics: Topic[];
  recentActivity: Activity[];
};

/** The three fields an axis can make a claim about. */
type ClaimField = "blocker" | "current_state" | "state";

/** Nothing asserted — the set a caller passes when a write mentions no `state` at all. */
const NO_CLAIMS: ReadonlySet<ClaimField> = new Set();

/**
 * Which claims a call actually makes. `current_state` and `blocker` assert themselves when they carry
 * text; `state` counts only when the caller mentions it, because the column's default is where a new
 * axis starts rather than something anyone said.
 */
function assertedClaims(input: { state?: unknown }): ReadonlySet<ClaimField> {
  return new Set(input.state === undefined ? [] : (["state"] as const));
}

export class ResearchStore {
  private readonly db: Database;
  /** Depth of the transaction in flight; >0 means a nested call must join it, not open a second one. */
  private depth = 0;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    // Every action runs in a fresh child process: configure on every open, never "once at startup".
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  }

  close(): void {
    this.db.close();
  }

  /** The effective connection settings — asserted by the tests rather than assumed. */
  pragmas(): { foreignKeys: number; journalMode: string; busyTimeout: number } {
    const value = (name: string): unknown => {
      const row = this.db.query(`PRAGMA ${name}`).get() as Record<
        string,
        unknown
      > | null;
      return row ? Object.values(row)[0] : undefined;
    };
    return {
      busyTimeout: Number(value("busy_timeout")),
      foreignKeys: Number(value("foreign_keys")),
      journalMode: String(value("journal_mode")),
    };
  }

  /**
   * The only place a transaction begins. Reentrant on purpose: a composite operation (reconcileTopic)
   * calls the same single-row writers below, and those must join its transaction instead of nesting a
   * second `BEGIN` (SQLite has no nested transactions).
   */
  private atomic<T>(fn: () => T): T {
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
      } catch {
        // Already unwound (for example a failed COMMIT) — the original error is the useful one.
      }
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  /**
   * A consistent read across several queries. Deferred (no write lock), so a dashboard aggregate
   * cannot mix a row from before a write with one from after it.
   */
  private snapshot<T>(fn: () => T): T {
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
      } catch {
        // Already unwound; the original error is the useful one.
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- reads

  listTopics(status?: TopicStatus): Topic[] {
    const rows = this.db
      .query(
        "SELECT * FROM topics WHERE (? IS NULL OR status = ?) ORDER BY updated_at DESC, name ASC"
      )
      .all(status ?? null, status ?? null) as TopicRow[];
    return rows.map(toTopic);
  }

  getTopic(id: string): Topic | null {
    const row = this.db
      .query("SELECT * FROM topics WHERE id = ?")
      .get(id) as TopicRow | null;
    return row ? toTopic(row) : null;
  }

  getTopicByName(name: string): Topic | null {
    const row = this.db
      .query("SELECT * FROM topics WHERE name = ? COLLATE NOCASE")
      .get(name) as TopicRow | null;
    return row ? toTopic(row) : null;
  }

  listAxes(topicId: string): Axis[] {
    const rows = this.db
      .query(
        "SELECT * FROM development_axes WHERE topic_id = ? ORDER BY updated_at DESC, title ASC"
      )
      .all(topicId) as AxisRow[];
    return rows.map(toAxis);
  }

  getAxis(id: string): Axis | null {
    const row = this.db
      .query("SELECT * FROM development_axes WHERE id = ?")
      .get(id) as AxisRow | null;
    return row ? toAxis(row) : null;
  }

  listRepositories(): Repository[] {
    const rows = this.db
      .query("SELECT * FROM repositories ORDER BY full_name COLLATE NOCASE ASC")
      .all() as RepositoryRow[];
    return rows.map(toRepository);
  }

  getRepositoryByFullName(fullName: string): Repository | null {
    const row = this.db
      .query("SELECT * FROM repositories WHERE full_name = ? COLLATE NOCASE")
      .get(fullName) as RepositoryRow | null;
    return row ? toRepository(row) : null;
  }

  listPeople(): Person[] {
    const rows = this.db
      .query("SELECT * FROM people ORDER BY display_name COLLATE NOCASE ASC")
      .all() as PersonRow[];
    return rows.map(toPerson);
  }

  getPerson(id: string): Person | null {
    const row = this.db
      .query("SELECT * FROM people WHERE id = ?")
      .get(id) as PersonRow | null;
    return row ? toPerson(row) : null;
  }

  /** The people row mapped to a Nakama user, if the acting user is known to the dashboard (F6). */
  getPersonByNakamaUser(nakamaUserId: string): Person | null {
    const row = this.db
      .query("SELECT * FROM people WHERE nakama_user_id = ?")
      .get(nakamaUserId) as PersonRow | null;
    return row ? toPerson(row) : null;
  }

  listActivity(options?: {
    topicId?: string;
    axisId?: string;
    sinceDays?: number;
    limit?: number;
  }): Activity[] {
    const limit = clampLimit(
      options?.limit,
      DEFAULT_ACTIVITY_LIMIT,
      MAX_ACTIVITY_LIMIT
    );
    const since = options?.sinceDays ? isoDaysAgo(options.sinceDays) : null;
    const rows = this.db
      .query(
        `SELECT * FROM activities
         WHERE (? IS NULL OR topic_id = ?)
           AND (? IS NULL OR axis_id = ?)
           AND (? IS NULL OR occurred_at >= ?)
         ORDER BY occurred_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(
        options?.topicId ?? null,
        options?.topicId ?? null,
        options?.axisId ?? null,
        options?.axisId ?? null,
        since,
        since,
        limit
      ) as ActivityRow[];
    return rows.map(toActivity);
  }

  listAnnotations(options?: {
    topicId?: string;
    axisId?: string;
    limit?: number;
  }): Annotation[] {
    const limit = clampLimit(
      options?.limit,
      DEFAULT_ANNOTATION_LIMIT,
      MAX_ANNOTATION_LIMIT
    );
    const rows = this.db
      .query(
        `SELECT * FROM annotations
         WHERE (? IS NULL OR topic_id = ?)
           AND (? IS NULL OR axis_id = ?)
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(
        options?.topicId ?? null,
        options?.topicId ?? null,
        options?.axisId ?? null,
        options?.axisId ?? null,
        limit
      ) as AnnotationRow[];
    return rows.map(toAnnotation);
  }

  listTopicRepositories(topicId: string): LinkedRepository[] {
    const rows = this.db
      .query(
        `SELECT r.*, l.relationship AS relationship
         FROM topic_repositories l JOIN repositories r ON r.id = l.repository_id
         WHERE l.topic_id = ?
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`
      )
      .all(topicId) as Array<RepositoryRow & { relationship: string }>;
    return rows.map((row) => ({
      ...toRepository(row),
      relationship: row.relationship as Relationship,
    }));
  }

  listAxisRepositories(axisId: string): LinkedRepository[] {
    const rows = this.db
      .query(
        `SELECT r.*, l.relationship AS relationship
         FROM axis_repositories l JOIN repositories r ON r.id = l.repository_id
         WHERE l.axis_id = ?
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`
      )
      .all(axisId) as Array<RepositoryRow & { relationship: string }>;
    return rows.map((row) => ({
      ...toRepository(row),
      relationship: row.relationship as Relationship,
    }));
  }

  listAxisPeople(axisId: string): LinkedPerson[] {
    const rows = this.db
      .query(
        `SELECT p.*, l.role AS role
         FROM axis_people l JOIN people p ON p.id = l.person_id
         WHERE l.axis_id = ?
         ORDER BY p.display_name COLLATE NOCASE ASC`
      )
      .all(axisId) as Array<PersonRow & { role: string }>;
    return rows.map((row) => ({ ...toPerson(row), role: row.role }));
  }

  listTopicPeople(topicId: string): LinkedPerson[] {
    const rows = this.db
      .query(
        `SELECT p.*, l.role AS role
         FROM topic_people l JOIN people p ON p.id = l.person_id
         WHERE l.topic_id = ?
         ORDER BY p.display_name COLLATE NOCASE ASC`
      )
      .all(topicId) as Array<PersonRow & { role: string }>;
    return rows.map((row) => ({ ...toPerson(row), role: row.role }));
  }

  // ------------------------------------------------------- aggregates & search

  /**
   * The dashboard front page: what exists, what is blocked and who is waiting on what, what moved
   * recently. `activitySinceDays` is a query parameter, never stored state — the same call answers
   * "what happened this week" and "what happened this quarter".
   */
  getOverview(options?: { activitySinceDays?: number; limit?: number }): Overview {
    return this.snapshot(() => {
      const activitySinceDays = options?.activitySinceDays ?? 14;
      const limit = clampLimit(options?.limit, 10, 50);

      const topicsByStatus = Object.fromEntries(
        TOPIC_STATUSES.map((status) => [status, 0])
      ) as Record<TopicStatus, number>;
      for (const row of this.db
        .query("SELECT status, count(*) AS n FROM topics GROUP BY status")
        .all() as Array<{ n: number; status: string }>) {
        if (isTopicStatus(row.status)) {
          topicsByStatus[row.status] = row.n;
        }
      }

      const axesByState = Object.fromEntries(
        AXIS_STATES.map((state) => [state, 0])
      ) as Record<AxisState, number>;
      for (const row of this.db
        .query("SELECT state, count(*) AS n FROM development_axes GROUP BY state")
        .all() as Array<{ n: number; state: string }>) {
        if ((AXIS_STATES as readonly string[]).includes(row.state)) {
          axesByState[row.state as AxisState] = row.n;
        }
      }

      const counts = this.db
        .query(
          `SELECT (SELECT count(*) FROM topics) AS topics,
                  (SELECT count(*) FROM development_axes) AS axes,
                  (SELECT count(*) FROM repositories) AS repositories,
                  (SELECT count(*) FROM people) AS people`
        )
        .get() as { axes: number; people: number; repositories: number; topics: number };

      const blocked = this.db
        .query(
          `SELECT a.*, t.name AS topic_name
           FROM development_axes a JOIN topics t ON t.id = a.topic_id
           WHERE a.state = 'blocked'
           ORDER BY a.updated_at DESC`
        )
        .all() as Array<AxisRow & { topic_name: string }>;

      return {
        activitySinceDays,
        axesByState,
        blocked: blocked.map((row) => ({
          axisId: row.id,
          blocker: row.blocker,
          blockerConfidence: (row.blocker_confidence as Confidence) ?? "uncertain",
          state: (row.state as AxisState) ?? "active",
          title: row.title,
          topicId: row.topic_id,
          topicName: row.topic_name,
          updatedAt: row.updated_at,
        })),
        counts: { ...counts, topicsByStatus },
        generatedAt: nowIso(),
        recentActivity: this.listActivity({ limit: 25, sinceDays: activitySinceDays }),
        recentTopics: (
          this.db
            .query("SELECT * FROM topics ORDER BY updated_at DESC, name ASC LIMIT ?")
            .all(limit) as TopicRow[]
        ).map(toTopic),
      };
    });
  }

  /**
   * Substring search across topics, axes, activity and annotations. Deliberately simple (no FTS table
   * yet): a librarian uses it to find the row a conversation is about, not to rank a corpus.
   */
  searchDashboard(options: {
    query: string;
    limit?: number;
    includeArchived?: boolean;
  }): SearchResults {
    const query = required(options.query, "query");
    const limit = clampLimit(options.limit, 10, 50);
    const includeArchived = options.includeArchived ?? false;
    const needle = query.toLowerCase();
    const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

    return this.snapshot(() => {
      const archivedFilter = includeArchived ? "" : "AND t.status <> 'archived'";

      const topicRows = this.db
        .query(
          `SELECT t.* FROM topics t
           WHERE (t.name LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\')
             ${archivedFilter}
           ORDER BY t.updated_at DESC
           LIMIT ?`
        )
        .all(pattern, pattern, pattern, limit + 1) as TopicRow[];

      const axisRows = this.db
        .query(
          `SELECT a.*, t.name AS topic_name FROM development_axes a JOIN topics t ON t.id = a.topic_id
           WHERE (a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\'
                  OR a.current_state LIKE ? ESCAPE '\\' OR a.blocker LIKE ? ESCAPE '\\'
                  OR a.branch LIKE ? ESCAPE '\\')
             ${archivedFilter}
           ORDER BY a.updated_at DESC
           LIMIT ?`
        )
        .all(pattern, pattern, pattern, pattern, pattern, limit + 1) as Array<
        AxisRow & { topic_name: string }
      >;

      const activityRows = this.db
        .query(
          `SELECT x.*, t.name AS topic_name FROM activities x LEFT JOIN topics t ON t.id = x.topic_id
           WHERE (x.summary LIKE ? ESCAPE '\\' OR x.source_ref LIKE ? ESCAPE '\\')
           ORDER BY x.occurred_at DESC, x.rowid DESC
           LIMIT ?`
        )
        .all(pattern, pattern, limit + 1) as Array<ActivityRow & { topic_name: string | null }>;

      const annotationRows = this.db
        .query(
          `SELECT n.*, t.name AS topic_name FROM annotations n LEFT JOIN topics t ON t.id = n.topic_id
           WHERE n.text LIKE ? ESCAPE '\\'
           ORDER BY n.created_at DESC, n.rowid DESC
           LIMIT ?`
        )
        .all(pattern, limit + 1) as Array<AnnotationRow & { topic_name: string | null }>;

      const fields = (row: Record<string, unknown>, names: string[]): string[] =>
        names.filter((name) => String(row[name] ?? "").toLowerCase().includes(needle));

      const topics = topicRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row as unknown as Record<string, unknown>, [
          "name",
          "description",
          "summary",
        ]),
        record: toTopic(row),
      }));
      const axes = axisRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row as unknown as Record<string, unknown>, [
          "title",
          "description",
          "current_state",
          "blocker",
          "branch",
        ]),
        record: toAxis(row),
        topicName: row.topic_name,
      }));
      const activities = activityRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row as unknown as Record<string, unknown>, ["summary", "source_ref"]),
        record: toActivity(row),
        topicName: row.topic_name,
      }));
      const annotations = annotationRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row as unknown as Record<string, unknown>, ["text"]),
        record: toAnnotation(row),
        topicName: row.topic_name,
      }));

      return {
        activities,
        annotations,
        axes,
        includeArchived,
        limit,
        query,
        topics,
        truncated:
          topicRows.length > limit ||
          axisRows.length > limit ||
          activityRows.length > limit ||
          annotationRows.length > limit,
      };
    });
  }

  // ------------------------------------------------------- single-row writers

  createTopic(input: {
    name: string;
    description?: string;
    status?: TopicStatus;
    summary?: string;
  }): Topic {
    return this.atomic(() => {
      const name = required(input.name, "name");
      if (this.getTopicByName(name)) {
        throw new ResearchStoreError(`A topic named "${name}" already exists.`);
      }
      return this.insertTopic({
        description: text(input.description),
        name,
        status: input.status ?? "active",
        summary: text(input.summary),
      });
    });
  }

  updateTopic(
    id: string,
    patch: {
      name?: string;
      description?: string;
      status?: TopicStatus;
      summary?: string;
    },
    options?: { expectedVersion?: number }
  ): Topic {
    return this.atomic(() =>
      this.applyTopicPatch(required(id, "topicId"), patch, options)
    );
  }

  /** Cascades to the topic's axes, links, activities and annotations (FKs are on). */
  deleteTopic(id: string): void {
    this.atomic(() => {
      const topicId = required(id, "topicId");
      const result = this.db
        .query("DELETE FROM topics WHERE id = ?")
        .run(topicId);
      if (Number(result.changes) === 0) {
        throw new ResearchStoreError("Topic not found.");
      }
    });
  }

  createAxis(input: {
    topicId: string;
    title: string;
    description?: string;
    kind?: AxisKind;
    state?: AxisState;
    branch?: string;
    prNumber?: number | null;
    prUrl?: string;
    currentState?: string;
    blocker?: string;
    stateConfidence?: Confidence;
    currentStateConfidence?: Confidence;
    blockerConfidence?: Confidence;
  }): Axis {
    return this.atomic(() => {
      const topicId = required(input.topicId, "topicId");
      if (!this.getTopic(topicId)) {
        throw new ResearchStoreError("Topic not found.");
      }
      const axis = this.insertAxis(topicId, input);
      // A brand-new axis starts from the column defaults, and a default nobody chose is not a claim:
      // only what the caller actually said is held to the evidence rule.
      this.assertClaimsAreBacked(axis, assertedClaims(input));
      return axis;
    });
  }

  updateAxis(
    id: string,
    patch: Omit<ReconcileAxisInput, "id" | "repositories" | "people">,
    options?: { expectedVersion?: number }
  ): Axis {
    return this.atomic(() => {
      const axis = this.applyAxisPatch(required(id, "axisId"), patch, options);
      // Unconditional: a write is the moment to check that the axis still stands behind every claim it
      // carries, including ones this patch did not touch.
      this.assertClaimsAreBacked(axis, assertedClaims(patch));
      return axis;
    });
  }

  deleteAxis(id: string): void {
    this.atomic(() => {
      const axisId = required(id, "axisId");
      const result = this.db
        .query("DELETE FROM development_axes WHERE id = ?")
        .run(axisId);
      if (Number(result.changes) === 0) {
        throw new ResearchStoreError("Axis not found.");
      }
    });
  }

  /** Idempotent by `full_name` (case-insensitive) — callers may pass a repository they already know. */
  registerRepository(input: {
    fullName: string;
    url?: string;
    description?: string;
    defaultBranch?: string;
  }): { repository: Repository; created: boolean } {
    return this.atomic(() => this.upsertRepository(input));
  }

  /** Resolved by Nakama user id, then GitHub login; otherwise a new person row. */
  registerPerson(input: {
    displayName: string;
    nakamaUserId?: string;
    githubLogin?: string;
    notes?: string;
  }): { person: Person; created: boolean } {
    return this.atomic(() => this.upsertPerson(input));
  }

  linkTopicRepository(
    topicId: string,
    repositoryId: string,
    relationship: Relationship = "supporting"
  ): void {
    this.atomic(() => {
      if (!this.getTopic(required(topicId, "topicId"))) {
        throw new ResearchStoreError("Topic not found.");
      }
      if (!this.repositoryExists(required(repositoryId, "repositoryId"))) {
        throw new ResearchStoreError("Repository not found.");
      }
      this.linkRepository(
        "topic_repositories",
        "topic_id",
        topicId,
        repositoryId,
        relationship
      );
    });
  }

  linkAxisRepository(
    axisId: string,
    repositoryId: string,
    relationship: Relationship = "supporting"
  ): void {
    this.atomic(() => {
      if (!this.getAxis(required(axisId, "axisId"))) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (!this.repositoryExists(required(repositoryId, "repositoryId"))) {
        throw new ResearchStoreError("Repository not found.");
      }
      this.linkRepository(
        "axis_repositories",
        "axis_id",
        axisId,
        repositoryId,
        relationship
      );
    });
  }

  linkTopicPerson(topicId: string, personId: string, role = ""): void {
    this.atomic(() => {
      if (!this.getTopic(required(topicId, "topicId"))) {
        throw new ResearchStoreError("Topic not found.");
      }
      if (!this.getPerson(required(personId, "personId"))) {
        throw new ResearchStoreError("Person not found.");
      }
      this.db
        .query(
          "INSERT INTO topic_people (topic_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (topic_id, person_id) DO UPDATE SET role = excluded.role"
        )
        .run(topicId, personId, role);
    });
  }

  linkAxisPerson(axisId: string, personId: string, role = ""): void {
    this.atomic(() => {
      if (!this.getAxis(required(axisId, "axisId"))) {
        throw new ResearchStoreError("Axis not found.");
      }
      if (!this.getPerson(required(personId, "personId"))) {
        throw new ResearchStoreError("Person not found.");
      }
      this.db
        .query(
          "INSERT INTO axis_people (axis_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (axis_id, person_id) DO UPDATE SET role = excluded.role"
        )
        .run(axisId, personId, role);
    });
  }

  /**
   * Records activity against a topic and/or an axis. Also moves the parent's `updated_at` forward so
   * "most recently touched first" stays meaningful — one transaction, not two statements (F5).
   */
  addActivity(input: {
    topicId?: string;
    axisId?: string;
    repositoryId?: string;
    /** Registered inside the same transaction when given, so a caller never has to two-step it. */
    repositoryFullName?: string;
    summary: string;
    sourceType?: SourceType;
    sourceRef?: string;
    sourceUrl?: string;
    actorType?: ActorType;
    actorId?: string;
    occurredAt?: string;
  }): Activity {
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
      // A named repository is registered inside this transaction, so recording an event that names a
      // repository is still one atomic step for the caller.
      const repositoryId = input.repositoryFullName
        ? this.upsertRepository({ fullName: input.repositoryFullName }).repository.id
        : input.repositoryId;
      if (repositoryId && !this.repositoryExists(repositoryId)) {
        throw new ResearchStoreError("Repository not found.");
      }
      return this.insertActivity({
        actorId: input.actorId ?? "",
        actorType:
          optionalOneOf(input.actorType, ACTOR_TYPES, "actorType") ?? "unknown",
        axisId,
        occurredAt: input.occurredAt ?? nowIso(),
        repositoryId: repositoryId ?? null,
        sourceRef: text(input.sourceRef),
        // Validated here rather than left to the column's CHECK: a raw SQLite error reaches the caller
        // as a generic 500, and this is input the caller can fix.
        sourceType:
          optionalOneOf(input.sourceType, SOURCE_TYPES, "sourceType") ??
          "manual",
        sourceUrl: text(input.sourceUrl),
        summary,
        topicId: topicId ?? axis?.topicId ?? null,
      });
    });
  }

  addAnnotation(input: {
    topicId?: string;
    axisId?: string;
    text: string;
    authorType?: "human" | "agent";
    authorId?: string;
  }): Annotation {
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
        topicId: topicId ?? axis?.topicId ?? null,
      });
    });
  }

  // --------------------------------------------------------- composite writers

  /**
   * Applies a whole topic update in **one** transaction: resolve-or-create the topic, patch its
   * fields, create/update axes, link repositories and people, record activity and annotations — then
   * check the invariants that can only be checked once everything is in place.
   *
   * This is the operation `reconcile_topic` needs: a librarian calls it once, and either the whole
   * update lands or nothing changes. No caller has to order its own writes or remember a transaction.
   */
  reconcileTopic(input: ReconcileTopicInput): ReconcileResult {
    return this.atomic(() => {
      const actor = {
        id: input.actor?.id ?? "",
        type: input.actor?.type ?? ("unknown" as ActorType),
      };
      oneOf(actor.type, ACTOR_TYPES, "actor.type");

      const resolved = this.resolveTopicForReconcile(input);
      let topic = resolved.topic;

      // Whoever just wrote is on the topic they wrote to, if the dashboard already knows them as a
      // person. A link, never a new row: "who touched this" must not invent people (F6).
      if (actor.id) {
        const known = this.db
          .query("SELECT id FROM people WHERE nakama_user_id = ? LIMIT 1")
          .get(actor.id) as { id: string } | null;
        if (known) {
          this.db
            .query(
              "INSERT INTO topic_people (topic_id, person_id, role) VALUES (?, ?, '') ON CONFLICT (topic_id, person_id) DO NOTHING"
            )
            .run(topic.id, known.id);
        }
      }

      if (input.topic) {
        const patch = { ...input.topic };
        if (patch.name !== undefined && patch.name.trim() === topic.name) {
          delete patch.name;
        }
        if (Object.keys(patch).length > 0) {
          topic = this.applyTopicPatch(topic.id, patch, {
            expectedVersion: input.expectedVersion,
          });
        }
      }

      const created = {
        axes: 0,
        people: 0,
        repositories: 0,
        topic: resolved.created,
      };
      const touchedAxes: Axis[] = [];
      const assertedByAxis = new Map<string, ReadonlySet<ClaimField>>();
      const activities: string[] = [];
      const annotations: string[] = [];

      // Topic-level links first: the topic-level people/repositories are what the axes below refine.
      for (const person of input.people ?? []) {
        const result = this.upsertPerson(person);
        if (result.created) {
          created.people += 1;
        }
        this.db
          .query(
            "INSERT INTO topic_people (topic_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (topic_id, person_id) DO UPDATE SET role = excluded.role"
          )
          .run(topic.id, result.person.id, person.role ?? "");
      }
      for (const repository of input.repositories ?? []) {
        const result = this.upsertRepository(repository);
        if (result.created) {
          created.repositories += 1;
        }
        this.linkRepository(
          "topic_repositories",
          "topic_id",
          topic.id,
          result.repository.id,
          repository.relationship ?? "supporting"
        );
      }

      for (const axisInput of input.axes ?? []) {
        const existing = axisInput.id
          ? this.getAxis(required(axisInput.id, "axis.id"))
          : axisInput.title
            ? this.findAxisByTitle(topic.id, axisInput.title)
            : null;
        if (axisInput.id && !existing) {
          throw new ResearchStoreError("Axis not found.");
        }
        if (existing && existing.topicId !== topic.id) {
          throw new ResearchStoreError("Axis does not belong to this topic.");
        }

        let axis: Axis;
        if (existing) {
          axis = this.applyAxisPatch(existing.id, axisInput, {
            expectedVersion: axisInput.expectedVersion,
          });
        } else {
          if (!axisInput.title) {
            throw new ResearchStoreError(
              "axis.title is required for a new axis."
            );
          }
          axis = this.insertAxis(topic.id, axisInput);
          created.axes += 1;
        }

        for (const repository of axisInput.repositories ?? []) {
          const result = this.upsertRepository(repository);
          if (result.created) {
            created.repositories += 1;
          }
          this.linkRepository(
            "axis_repositories",
            "axis_id",
            axis.id,
            result.repository.id,
            repository.relationship ?? "supporting"
          );
        }
        for (const person of axisInput.people ?? []) {
          const result = this.upsertPerson(person);
          if (result.created) {
            created.people += 1;
          }
          this.db
            .query(
              "INSERT INTO axis_people (axis_id, person_id, role) VALUES (?, ?, ?) ON CONFLICT (axis_id, person_id) DO UPDATE SET role = excluded.role"
            )
            .run(axis.id, result.person.id, person.role ?? "");
        }
        touchedAxes.push(axis);
        assertedByAxis.set(axis.id, assertedClaims(axisInput));
      }

      for (const activityInput of input.activities ?? []) {
        const axisId = this.resolveAxisId(
          topic.id,
          activityInput.axisId,
          activityInput.axisTitle
        );
        const repository = activityInput.repositoryFullName
          ? this.upsertRepository({
              fullName: activityInput.repositoryFullName,
            })
          : null;
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
          sourceType:
            optionalOneOf(
              activityInput.sourceType,
              SOURCE_TYPES,
              "sourceType"
            ) ?? "manual",
          sourceUrl: text(activityInput.sourceUrl),
          summary: required(activityInput.summary, "summary"),
          topicId: topic.id,
        });
        activities.push(activity.id);
      }

      for (const annotationInput of input.annotations ?? []) {
        const axisId = this.resolveAxisId(
          topic.id,
          annotationInput.axisId,
          annotationInput.axisTitle
        );
        const annotation = this.insertAnnotation({
          authorId: actor.id,
          authorType:
            annotationInput.authorType ??
            (actor.type === "agent" ? "agent" : "human"),
          axisId,
          text: required(annotationInput.text, "text"),
          topicId: topic.id,
        });
        annotations.push(annotation.id);
      }

      // Only now can "this claim is confirmed" be judged: the evidence may have arrived in this very
      // call (an activity or annotation above). Runs inside the transaction, so a claim with nothing
      // behind it rolls the whole update back instead of laundering a guess into a fact.
      for (const axis of touchedAxes) {
        this.assertClaimsAreBacked(axis, assertedByAxis.get(axis.id) ?? NO_CLAIMS);
      }

      return {
        axes: touchedAxes.map((axis) => this.getAxis(axis.id) ?? axis),
        created,
        recorded: { activities, annotations },
        topic: this.getTopic(topic.id) as Topic,
      };
    });
  }

  // ------------------------------------------------------------------ internals

  private resolveTopicForReconcile(input: ReconcileTopicInput): {
    topic: Topic;
    created: boolean;
  } {
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
        summary: text(input.topic?.summary),
      }),
    };
  }

  private insertTopic(input: {
    name: string;
    description: string;
    status: TopicStatus;
    summary: string;
  }): Topic {
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO topics (id, name, description, status, summary, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
      )
      .run(
        id,
        input.name,
        input.description,
        input.status,
        input.summary,
        timestamp,
        timestamp
      );
    return this.getTopic(id) as Topic;
  }

  private applyTopicPatch(
    id: string,
    patch: {
      name?: string;
      description?: string;
      status?: TopicStatus;
      summary?: string;
    },
    options?: { expectedVersion?: number }
  ): Topic {
    const existing = this.getTopic(id);
    if (!existing) {
      throw new ResearchStoreError("Topic not found.");
    }
    this.assertVersion(
      "topic",
      existing.name,
      existing.version,
      options?.expectedVersion
    );
    const next = {
      description: patch.description ?? existing.description,
      name:
        patch.name === undefined ? existing.name : required(patch.name, "name"),
      status:
        optionalOneOf(patch.status, TOPIC_STATUSES, "status") ??
        existing.status,
      summary: patch.summary ?? existing.summary,
    };
    if (next.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = this.getTopicByName(next.name);
      if (clash && clash.id !== id) {
        throw new ResearchStoreError(
          `A topic named "${next.name}" already exists.`
        );
      }
    }
    this.db
      .query(
        "UPDATE topics SET name = ?, description = ?, status = ?, summary = ?, version = version + 1, updated_at = ? WHERE id = ?"
      )
      .run(
        next.name,
        next.description,
        next.status,
        next.summary,
        nowIso(),
        id
      );
    return this.getTopic(id) as Topic;
  }

  private insertAxis(
    topicId: string,
    input: Omit<ReconcileAxisInput, "id" | "repositories" | "people">
  ): Axis {
    const title = required(input.title, "axis.title");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    const state = optionalOneOf(input.state, AXIS_STATES, "state") ?? "active";
    const blocker = text(input.blocker);
    this.assertBlockerPresent(state, blocker);
    this.db
      .query(
        `INSERT INTO development_axes (
           id, topic_id, title, description, kind, state, branch, pr_number, pr_url,
           current_state, blocker, state_confidence, current_state_confidence, blocker_confidence,
           version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        id,
        topicId,
        title,
        text(input.description),
        optionalOneOf(input.kind, AXIS_KINDS, "kind") ?? "feature",
        state,
        text(input.branch),
        input.prNumber ?? null,
        text(input.prUrl),
        text(input.currentState),
        blocker,
        optionalOneOf(input.stateConfidence, CONFIDENCES, "stateConfidence") ??
          "confirmed",
        optionalOneOf(
          input.currentStateConfidence,
          CONFIDENCES,
          "currentStateConfidence"
        ) ?? "confirmed",
        optionalOneOf(
          input.blockerConfidence,
          CONFIDENCES,
          "blockerConfidence"
        ) ?? "confirmed",
        timestamp,
        timestamp
      );
    return this.getAxis(id) as Axis;
  }

  private applyAxisPatch(
    id: string,
    patch: Omit<ReconcileAxisInput, "id" | "repositories" | "people">,
    options?: { expectedVersion?: number }
  ): Axis {
    const existing = this.getAxis(id);
    if (!existing) {
      throw new ResearchStoreError("Axis not found.");
    }
    this.assertVersion(
      "axis",
      existing.title,
      existing.version,
      options?.expectedVersion
    );
    const next = {
      blocker: patch.blocker ?? existing.blocker,
      blockerConfidence: optionalOneOf(
        patch.blockerConfidence,
        CONFIDENCES,
        "blockerConfidence"
      ),
      branch: patch.branch ?? existing.branch,
      currentState: patch.currentState ?? existing.currentState,
      currentStateConfidence: optionalOneOf(
        patch.currentStateConfidence,
        CONFIDENCES,
        "currentStateConfidence"
      ),
      description: patch.description ?? existing.description,
      kind: optionalOneOf(patch.kind, AXIS_KINDS, "kind"),
      prNumber:
        patch.prNumber === undefined ? existing.prNumber : patch.prNumber,
      prUrl: patch.prUrl ?? existing.prUrl,
      state: optionalOneOf(patch.state, AXIS_STATES, "state"),
      stateConfidence: optionalOneOf(
        patch.stateConfidence,
        CONFIDENCES,
        "stateConfidence"
      ),
      title:
        patch.title === undefined
          ? existing.title
          : required(patch.title, "axis.title"),
    };
    this.assertBlockerPresent(next.state ?? existing.state, next.blocker);

    this.db
      .query(
        `UPDATE development_axes SET
           title = ?, description = ?, kind = ?, state = ?, branch = ?, pr_number = ?, pr_url = ?,
           current_state = ?, blocker = ?, state_confidence = ?, current_state_confidence = ?,
           blocker_confidence = ?, version = version + 1, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.title,
        next.description,
        next.kind ?? existing.kind,
        next.state ?? existing.state,
        next.branch,
        next.prNumber,
        next.prUrl,
        next.currentState,
        next.blocker,
        next.stateConfidence ?? existing.stateConfidence,
        next.currentStateConfidence ?? existing.currentStateConfidence,
        next.blockerConfidence ?? existing.blockerConfidence,
        nowIso(),
        id
      );
    return this.getAxis(id) as Axis;
  }

  private upsertRepository(input: {
    fullName: string;
    url?: string;
    description?: string;
    defaultBranch?: string;
  }): { repository: Repository; created: boolean } {
    const fullName = required(input.fullName, "repository.fullName");
    const existing = this.getRepositoryByFullName(fullName);
    if (existing) {
      const next = {
        defaultBranch: input.defaultBranch ?? existing.defaultBranch,
        description: input.description ?? existing.description,
        url: input.url ?? existing.url,
      };
      if (
        next.defaultBranch !== existing.defaultBranch ||
        next.description !== existing.description ||
        next.url !== existing.url
      ) {
        this.db
          .query(
            "UPDATE repositories SET url = ?, description = ?, default_branch = ?, updated_at = ? WHERE id = ?"
          )
          .run(
            next.url,
            next.description,
            next.defaultBranch,
            nowIso(),
            existing.id
          );
      }
      return {
        created: false,
        repository: this.getRepositoryByFullName(fullName) as Repository,
      };
    }
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO repositories (id, full_name, url, description, default_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        fullName,
        text(input.url),
        text(input.description),
        text(input.defaultBranch),
        timestamp,
        timestamp
      );
    return {
      created: true,
      repository: this.getRepositoryByFullName(fullName) as Repository,
    };
  }

  private upsertPerson(input: {
    displayName: string;
    nakamaUserId?: string;
    githubLogin?: string;
    notes?: string;
  }): { person: Person; created: boolean } {
    const displayName = required(input.displayName, "person.displayName");
    const nakamaUserId = input.nakamaUserId?.trim() || null;
    const githubLogin = input.githubLogin?.trim() || null;

    // Only these two columns are unique, so an existing person is matched on them, never on a name.
    const existing = nakamaUserId
      ? (this.db
          .query("SELECT * FROM people WHERE nakama_user_id = ?")
          .get(nakamaUserId) as PersonRow | null)
      : githubLogin
        ? (this.db
            .query("SELECT * FROM people WHERE github_login = ? COLLATE NOCASE")
            .get(githubLogin) as PersonRow | null)
        : null;
    if (existing) {
      return { created: false, person: toPerson(existing) };
    }
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO people (id, display_name, nakama_user_id, github_login, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        displayName,
        nakamaUserId,
        githubLogin,
        text(input.notes),
        timestamp,
        timestamp
      );
    return { created: true, person: this.getPerson(id) as Person };
  }

  private linkRepository(
    table: "topic_repositories" | "axis_repositories",
    column: "topic_id" | "axis_id",
    parentId: string,
    repositoryId: string,
    relationship: Relationship
  ): void {
    const next = oneOf(relationship, RELATIONSHIPS, "relationship");
    if (next === "primary") {
      // The schema allows at most one primary per parent; promoting one demotes the previous holder,
      // which is what a caller means by "this is now the primary repository".
      this.db
        .query(
          `UPDATE ${table} SET relationship = 'supporting' WHERE ${column} = ? AND relationship = 'primary'`
        )
        .run(parentId);
    }
    this.db
      .query(
        `INSERT INTO ${table} (${column}, repository_id, relationship) VALUES (?, ?, ?)
         ON CONFLICT (${column}, repository_id) DO UPDATE SET relationship = excluded.relationship`
      )
      .run(parentId, repositoryId, next);
  }

  private insertActivity(input: {
    id?: string;
    topicId: string | null;
    axisId: string | null;
    repositoryId: string | null;
    summary: string;
    sourceType: SourceType;
    sourceRef: string;
    sourceUrl: string;
    actorType: ActorType;
    actorId: string;
    occurredAt: string;
  }): Activity {
    const id = input.id ?? crypto.randomUUID();
    const recordedAt = nowIso();
    this.db
      .query(
        `INSERT INTO activities (
           id, topic_id, axis_id, repository_id, summary, source_type, source_ref, source_url,
           actor_type, actor_id, occurred_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.topicId,
        input.axisId,
        input.repositoryId,
        input.summary,
        input.sourceType,
        input.sourceRef,
        input.sourceUrl,
        input.actorType,
        input.actorId,
        input.occurredAt,
        recordedAt
      );
    // One transaction: the activity and the ordering bump on its parents cannot disagree.
    this.touch("topics", input.topicId);
    this.touch("development_axes", input.axisId);
    return toActivity(
      this.db
        .query("SELECT * FROM activities WHERE id = ?")
        .get(id) as ActivityRow
    );
  }

  private insertAnnotation(input: {
    topicId: string | null;
    axisId: string | null;
    text: string;
    authorType: "human" | "agent";
    authorId: string;
  }): Annotation {
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO annotations (id, topic_id, axis_id, text, author_type, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.topicId,
        input.axisId,
        input.text,
        input.authorType,
        input.authorId,
        nowIso()
      );
    this.touch("topics", input.topicId);
    this.touch("development_axes", input.axisId);
    return toAnnotation(
      this.db
        .query("SELECT * FROM annotations WHERE id = ?")
        .get(id) as AnnotationRow
    );
  }

  /** `updated_at` is maintained in exactly one place. */
  private touch(table: "topics" | "development_axes", id: string | null): void {
    if (!id) {
      return;
    }
    this.db
      .query(`UPDATE ${table} SET updated_at = ? WHERE id = ?`)
      .run(nowIso(), id);
  }

  /** Axis lookup within a topic, case-insensitively — the way a caller names an axis in conversation. */
  findAxisByTitle(topicId: string, title: string): Axis | null {
    const row = this.db
      .query(
        "SELECT * FROM development_axes WHERE topic_id = ? AND title = ? COLLATE NOCASE"
      )
      .get(topicId, title.trim()) as AxisRow | null;
    return row ? toAxis(row) : null;
  }

  private resolveAxisId(
    topicId: string,
    axisId: string | undefined,
    axisTitle: string | undefined
  ): string | null {
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
        throw new ResearchStoreError(
          `Axis "${axisTitle}" not found in this topic.`
        );
      }
      return axis.id;
    }
    return null;
  }

  private repositoryExists(id: string): boolean {
    return Boolean(
      this.db
        .query("SELECT 1 AS present FROM repositories WHERE id = ?")
        .get(id)
    );
  }

  private assertVersion(
    entity: "topic" | "axis",
    label: string,
    current: number,
    expected?: number
  ): void {
    if (expected === undefined) {
      return;
    }
    if (!Number.isInteger(expected) || expected !== current) {
      throw new ResearchStoreConflictError(
        `conflict: ${entity} "${label}" is at version ${current}, not ${String(expected)} — re-read it and retry.`
      );
    }
  }

  private assertBlockerPresent(state: AxisState, blocker: string): void {
    if (state === "blocked" && blocker.trim().length === 0) {
      throw new ResearchStoreError(
        "An axis cannot be 'blocked' without blocker text — say what it is waiting on."
      );
    }
  }

  /**
   * A claim may only be `confirmed` when something could have confirmed it: a branch, a PR, a recorded
   * activity or an annotation on the axis. Otherwise the honest values are `inferred` or `uncertain`.
   *
   * Only fields that actually state something count as claims. A blank `current_state` or `blocker`
   * states nothing, and neither does a `state` the caller never mentioned — the column's default is
   * where a new axis starts, not something anyone asserted. Holding those to the evidence rule made a
   * fresh `{ title }` axis impossible to create, which is the sort of error that teaches callers to
   * pass `inferred` everywhere and means nothing.
   */
  private assertClaimsAreBacked(axis: Axis, asserted: ReadonlySet<ClaimField>): void {
    const claims: Array<[ClaimField, Confidence, boolean]> = [
      ["state", axis.stateConfidence, asserted.has("state")],
      ["current_state", axis.currentStateConfidence, axis.currentState.trim().length > 0],
      ["blocker", axis.blockerConfidence, axis.blocker.trim().length > 0],
    ];
    const unbacked = claims
      .filter(([, confidence, isClaim]) => isClaim && confidence === "confirmed")
      .map(([field]) => field);
    if (unbacked.length === 0) {
      return;
    }
    const evidence =
      axis.branch.trim().length > 0 ||
      axis.prUrl.trim().length > 0 ||
      axis.prNumber !== null ||
      Boolean(
        this.db
          .query(
            "SELECT 1 AS present FROM activities WHERE axis_id = ? LIMIT 1"
          )
          .get(axis.id)
      ) ||
      Boolean(
        this.db
          .query(
            "SELECT 1 AS present FROM annotations WHERE axis_id = ? LIMIT 1"
          )
          .get(axis.id)
      );
    if (!evidence) {
      throw new ResearchStoreError(
        `Axis "${axis.title}" claims 'confirmed' for ${unbacked.join(
          ", "
        )} but carries no evidence — add a branch, a PR or an activity, or mark it 'inferred'.`
      );
    }
  }
}
