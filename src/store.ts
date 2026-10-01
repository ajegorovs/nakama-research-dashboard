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
  /**
   * Sufficient for the current research need, with known gaps, and resumable without implying failure.
   * Distinct from `completed` (the work is done) and from `parked` (it is set aside). Appended rather than
   * inserted: if anything orders axes by position in this list, adding a state must not silently reorder
   * every existing one. Presenting `usable` in its own place is a view decision (U4 onward), not a
   * vocabulary decision.
   */
  "usable",
] as const;
/** A problem is unresolved or resolved — nothing else. Work context lives on its axis, its steps or a note. */
export const PROBLEM_STATES = ["open", "resolved"] as const;
export const PLAN_STEP_STATES = ["pending", "active", "done", "blocked"] as const;
/** The claim kinds an annotation may carry. `note` is the historical shape and stays the default. */
export const ANNOTATION_KINDS = ["note", "interpretation", "steering"] as const;
/**
 * Who authored a piece of text, and who caused a state transition — the same two answers, deliberately
 * one vocabulary. `migration` is the migration's word and is not available to a caller.
 */
export const AUTHOR_TYPES = ["human", "agent"] as const;
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
export type ProblemState = (typeof PROBLEM_STATES)[number];
export type PlanStepState = (typeof PLAN_STEP_STATES)[number];
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];
/** Who wrote a thing: the only two answers a caller may give. */
export type Author = (typeof AUTHOR_TYPES)[number];
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
  /** Null where the claim itself is absent — see toAxis. */
  currentStateConfidence: Confidence | null;
  blockerConfidence: Confidence | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
};

export type Activity = {
  id: string;
  topicId: string | null;
  axisId: string | null;
  /**
   * The problem this event is evidence for, when it is about one. A durable relationship rather than a
   * presentation value: it is what makes "a problem's latest activity" answerable at all.
   */
  problemId: string | null;
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
  problemId: string | null;
  text: string;
  kind: AnnotationKind;
  /** Null when the note is not a claim at all — which is most notes. */
  confidence: Confidence | null;
  authorType: "human" | "agent";
  authorId: string;
  createdAt: string;
};

/** Text a human wrote, and who last wrote it: `authorType` describes the stored text, not the row's origin. */
export type AuthoredText = {
  authorType: "human" | "agent";
  authorId: string;
};

/**
 * A problem is a first-class child of an axis: unresolved or resolved, meaningful without a repository, a
 * plan step or any activity. Those are implementation and evidence links, not parentage.
 */
export type Problem = {
  id: string;
  axisId: string;
  statement: string;
  state: ProblemState;
  stateConfidence: Confidence;
  planStepId: string | null;
  authorType: "human" | "agent";
  authorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** Optional by design: most axes will never have one, and creating a problem must never invent one. */
export type Plan = {
  id: string;
  axisId: string;
  summary: string;
  authorType: "human" | "agent";
  authorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanStep = {
  id: string;
  planId: string;
  title: string;
  /** Null where the plan has no order — an unordered checklist is not an ordered one with gaps filled in. */
  position: number | null;
  state: PlanStepState;
  createdAt: string;
  updatedAt: string;
};

/** One row of the append-only state log. `fromState` is null only for the migration's bootstrap rows. */
export type StateLogEntry = {
  id: string;
  axisId: string | null;
  problemId: string | null;
  fromState: string | null;
  toState: string;
  origin: Author | "migration";
  actorId: string;
  /** When the state was observed, when anyone knows. Null is a fact, not a gap to be filled with `recordedAt`. */
  observedAt: string | null;
  recordedAt: string;
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
  problem_id: string | null;
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
  problem_id: string | null;
  text: string;
  kind: string;
  confidence: string | null;
  author_type: string;
  author_id: string;
  created_at: string;
};

type ProblemRow = {
  id: string;
  axis_id: string;
  statement: string;
  state: string;
  state_confidence: string;
  plan_step_id: string | null;
  author_type: string;
  author_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

type PlanRow = {
  id: string;
  axis_id: string;
  summary: string;
  author_type: string;
  author_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

type PlanStepRow = {
  id: string;
  plan_id: string;
  title: string;
  position: number | null;
  state: string;
  created_at: string;
  updated_at: string;
};

type StateLogRow = {
  id: string;
  axis_id: string | null;
  problem_id: string | null;
  from_state: string | null;
  to_state: string;
  origin: string;
  actor_id: string;
  observed_at: string | null;
  recorded_at: string;
};

export const DEFAULT_ACTIVITY_LIMIT = 25;
export const MAX_ACTIVITY_LIMIT = 100;
export const DEFAULT_ANNOTATION_LIMIT = 25;
export const MAX_ANNOTATION_LIMIT = 100;
/** How many people (and how many repositories) a rollup names before it reports a truncation. */
export const MAX_ROLLUP_LIMIT = 50;
/** How many attributable events one person / repository rollup carries inside the window. */
export const DEFAULT_ROLLUP_ACTIVITY_LIMIT = 5;
/** How many events one axis shows in the progress view before it says how many more there are. */
export const DEFAULT_TIMELINE_AXIS_LIMIT = 10;
/** How many recorded items of one kind count towards an axis's evidence line (activities, notes). */
export const EVIDENCE_ITEM_LIMIT = 5;
/** Per-axis history on the detail view: enough to see the arc of the work without paging. */
export const DEFAULT_AXIS_HISTORY_LIMIT = 25;
export const MAX_AXIS_HISTORY_LIMIT = 100;
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Why a write was refused, in a form a program can act on.
 *
 * The message is for a human and keeps its prefix; this is the same fact for a caller — an agent that gets
 * "no-op" should not retry, one that gets "conflict" should re-read and retry, one that gets
 * "human-authored" must stop and ask a person, and one that gets "invalid-state" sent a state name that does
 * not exist. Collapsing those into a single "business error" is exactly what makes an agent guess.
 *
 * Set only where the distinction matters to a caller; a rule with no useful code reports `invalid-input` at
 * the action boundary by default.
 */
export const STORE_ERROR_CODES = [
  "conflict",
  "human-authored",
  "invalid-input",
  "invalid-state",
  "no-op",
] as const;

export type StoreErrorCode = (typeof STORE_ERROR_CODES)[number];

/** A rule the caller can fix by sending different input. */
export class ResearchStoreError extends Error {
  readonly code?: StoreErrorCode;

  constructor(message: string, code?: StoreErrorCode) {
    super(message);
    this.code = code;
  }
}

/** Optimistic-version failure: someone else wrote to the row since the caller read it. */
export class ResearchStoreConflictError extends ResearchStoreError {
  constructor(message: string) {
    super(message, "conflict");
  }
}

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

/**
 * The same rule `oneOf` enforces, but for a *state* name — the one vocabulary where the difference between
 * "that is not a state" and "nothing would change" has to survive to the caller as two different answers.
 */
function oneOfState<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new ResearchStoreError(
      `invalid-state: ${field} must be one of: ${allowed.join(", ")}.`,
      "invalid-state"
    );
  }
  return value as T;
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

/**
 * A plan step's place in an order, when its plan has one. Absent and null both mean "unordered": an
 * unordered checklist is not an ordered one with positions filled in by guesswork.
 */
function optionalPosition(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ResearchStoreError(
      "position must be a non-negative integer, or omitted for an unordered plan."
    );
  }
  return value;
}

/**
 * How long a silence makes an object stale. The contract supplies the number rather than us: its fixture G
 * is "No activity for >7 days, no blocker" (`fixtures.md:98`), and it calls `STALE` "an observation about
 * recency, not a diagnosis" (`interaction-spec.md:63`).
 *
 * `stale` is deliberately **not** a state and not derived from one: a blocked axis nobody has touched for a
 * month is both blocked and stale, and a projection has to be able to carry both facts at once. Fixture G's
 * "no blocker" describes that fixture's setup, not a rule that blockers are exempt from recency.
 */
export const STALE_AFTER_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The newest of the timestamps we hold for an object, or null when we hold none. */
function newestOf(values: Array<string | null | undefined>): string | null {
  let newest: string | null = null;
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

/**
 * The single age function. Both the stale decision and the recency sort read *this* value from the object's
 * `recencyAt`, so a panel cannot sort something as current while another marks it stale — the failure that
 * two helpers sharing a threshold would eventually produce.
 */
function ageInDays(recencyAt: string | null, nowMs: number): number | null {
  if (!recencyAt) {
    return null;
  }
  const parsed = Date.parse(recencyAt);
  return Number.isNaN(parsed) ? null : (nowMs - parsed) / MS_PER_DAY;
}

function isStale(recencyAt: string | null, nowMs: number): boolean {
  const age = ageInDays(recencyAt, nowMs);
  return age !== null && age > STALE_AFTER_DAYS;
}

/** Most recent first, by the same `recencyAt` the stale decision uses. Objects with no timestamp sink. */
function byRecencyDesc<T extends { recencyAt: string | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) => Date.parse(right.recencyAt ?? "") - Date.parse(left.recencyAt ?? "")
  );
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

/**
 * A confidence belongs to a claim. Where the claim itself is absent (`current_state`, `blocker` are
 * both optional) there is nothing to be confident about, so the confidence reads as null rather than
 * falling back to the column default — otherwise an axis nothing is known about renders as
 * "confirmed", which is exactly the provenance a reader must be able to trust.
 */
function toAxis(row: AxisRow): Axis {
  return {
    blocker: row.blocker,
    blockerConfidence: row.blocker
      ? ((row.blocker_confidence as Confidence) ?? "confirmed")
      : null,
    branch: row.branch,
    createdAt: row.created_at,
    currentState: row.current_state,
    currentStateConfidence: row.current_state
      ? ((row.current_state_confidence as Confidence) ?? "confirmed")
      : null,
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

/**
 * An axis as the C6 rollups scan it: the fields a "what is this person / this codebase doing" line
 * needs, plus its repositories. Same provenance rules as `toAxis` — a blocker nobody claimed keeps a
 * null confidence rather than reading as confirmed.
 */
function toAxisScan(axis: Axis, repositories: LinkedRepository[]): AxisScan {
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
    version: axis.version,
  };
}

/** "3 active · 1 blocked" is computed the same way on the front page and in both C6 rollups. */
function countAxesByState(
  axes: Array<{ state: AxisState }>
): Record<AxisState, number> {
  const counts = Object.fromEntries(
    AXIS_STATES.map((state) => [state, 0])
  ) as Record<AxisState, number>;
  for (const axis of axes) {
    counts[axis.state] += 1;
  }
  return counts;
}

function toActivity(row: ActivityRow): Activity {
  return {
    actorId: row.actor_id,
    actorType: (row.actor_type as ActorType) ?? "unknown",
    axisId: row.axis_id,
    id: row.id,
    occurredAt: row.occurred_at,
    problemId: row.problem_id,
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
    confidence: (row.confidence as Confidence | null) ?? null,
    createdAt: row.created_at,
    id: row.id,
    kind: asAnnotationKind(row.kind),
    problemId: row.problem_id,
    text: row.text,
    topicId: row.topic_id,
  };
}

/** An unknown kind reads as `note`: the value a row had before kinds existed. */
function asAnnotationKind(value: string): AnnotationKind {
  return value === "interpretation" || value === "steering" ? value : "note";
}

function toProblem(row: ProblemRow): Problem {
  return {
    authorId: row.author_id,
    authorType: row.author_type === "human" ? "human" : "agent",
    axisId: row.axis_id,
    createdAt: row.created_at,
    id: row.id,
    planStepId: row.plan_step_id,
    state: row.state === "resolved" ? "resolved" : "open",
    stateConfidence: (row.state_confidence as Confidence) ?? "confirmed",
    statement: row.statement,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toPlan(row: PlanRow): Plan {
  return {
    authorId: row.author_id,
    authorType: row.author_type === "human" ? "human" : "agent",
    axisId: row.axis_id,
    createdAt: row.created_at,
    id: row.id,
    summary: row.summary,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toPlanStep(row: PlanStepRow): PlanStep {
  const state = row.state;
  return {
    createdAt: row.created_at,
    id: row.id,
    planId: row.plan_id,
    position: row.position,
    state:
      state === "active" || state === "done" || state === "blocked"
        ? state
        : "pending",
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function toStateLogEntry(row: StateLogRow): StateLogEntry {
  return {
    actorId: row.actor_id,
    axisId: row.axis_id,
    fromState: row.from_state,
    id: row.id,
    observedAt: row.observed_at,
    origin: row.origin === "migration" ? "migration" : row.origin === "agent" ? "agent" : "human",
    problemId: row.problem_id,
    recordedAt: row.recorded_at,
    toState: row.to_state,
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
    /** The problem this event is evidence for. Naming it is enough: the axis and topic are implied. */
    problemId?: string;
    repositoryFullName?: string;
  }>;
  annotations?: Array<{
    text: string;
    axisId?: string;
    axisTitle?: string;
    authorType?: "human" | "agent";
    /**
     * `note` keeps the historical multi-target shape; `interpretation` and `steering` are claims about the
     * record and must name exactly one target.
     */
    kind?: AnnotationKind;
    confidence?: Confidence;
    problemId?: string;
  }>;
  /**
   * Problems raised against an axis — first-class, and meaningful without a repository, a plan step or a
   * single activity. `problemId` targets an existing problem; without it, `statement` creates one.
   *
   * `state` is accepted only when creating. A change to an existing problem's state is a *recorded
   * transition* (see `transitions`), because the history is the point: the writer refuses a silent overwrite.
   */
  problems?: Array<{
    problemId?: string;
    statement: string;
    axisId?: string;
    axisTitle?: string;
    state?: ProblemState;
    stateConfidence?: Confidence;
    planStepId?: string | null;
    repositoryFullNames?: string[];
    personIds?: string[];
  }>;
  /**
   * An axis's plan, optional by design: a problem never invents one, and an axis without a plan is a normal
   * state of affairs rather than a gap to be filled.
   */
  plans?: Array<{
    planId?: string;
    axisId?: string;
    axisTitle?: string;
    summary: string;
    steps?: Array<{
      stepId?: string;
      title: string;
      position?: number | null;
      state?: PlanStepState;
    }>;
  }>;
  /**
   * Recorded state changes. These are descriptive lifecycle states, not a workflow: every change between two
   * *different* valid states is allowed and logged, including `abandoned → usable`. A request that would not
   * change anything is refused rather than written, so the history never carries an event that says nothing.
   */
  transitions?: Array<{
    subject: "axis" | "problem";
    axisId?: string;
    axisTitle?: string;
    problemId?: string;
    toState: string;
    observedAt?: string;
    expectedVersion?: number;
    /** Required when entering `blocked`, the rule the axis writers already enforce. */
    blocker?: string;
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

/** A plan as a write returns it: the row, plus the steps attached to it now. */
export type PlanWithSteps = Plan & { steps: PlanStep[] };

export type ReconcileResult = {
  topic: Topic;
  axes: Axis[];
  /** Problems this call created or updated, with their links and history as the store now holds them. */
  problems: Problem[];
  /** Plans this call created or updated, with their steps. */
  plans: PlanWithSteps[];
  /** The state-log rows this call wrote, in the order it wrote them. */
  transitions: StateLogEntry[];
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

/**
 * An axis as the overview shows it: the axis plus the repositories it touches, primary first. The
 * overview's scan line is "repo · branch · PR", and the repository lives on the link table (D2), so a
 * topic rollup would otherwise need a second read per axis.
 */
export type AxisOverview = Axis & {
  repositories: LinkedRepository[];
};

/**
 * One topic as the front page presents it, in the scan order C4 settled: topic → people → state
 * counts → axes (attention order) → recent-activity summary. `axes` is complete and ordered, so the
 * page shows the first few and expands to the rest without another read.
 */
export type TopicOverview = {
  topic: Topic;
  people: LinkedPerson[];
  repositories: LinkedRepository[];
  /** How many axes sit in each state — the reviewer's "active / blocked / draft / parked" row. */
  axisCounts: Record<AxisState, number>;
  /** Every axis, blocked first, then most recently updated inside each state. */
  axes: AxisOverview[];
  /** Activity inside the requested window, for "6 events · last activity today". */
  activityCount: number;
  /** When this topic last saw any activity at all, window or not (null when it never has). */
  lastActivityAt: string | null;
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
  /**
   * The front page proper: one entry per topic with its axes grouped underneath. Archived topics are
   * excluded unless the caller asks for them.
   */
  topics: TopicOverview[];
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
  /**
   * The other two views of the same data, in the same call (C6): person-first and repository-first.
   * Same window, same archived rule — one dashboard, one read.
   */
  people: PersonRollup[];
  peopleTruncated: boolean;
  repositories: RepositoryRollup[];
  repositoriesTruncated: boolean;
  /** The time view (C7): the window's events grouped topic → axis, newest topic first. */
  timeline: TimelineGroup[];
};

/** Evidence reads as a phrase, not as an enum value: "PR #88", "agent review", "repo document". */
const SOURCE_EVIDENCE_LABELS: Record<SourceType, string> = {
  agent_review: "agent review",
  experiment: "experiment",
  github_commit: "commit",
  github_issue: "issue",
  github_pr: "PR",
  group_chat: "group chat",
  manual: "manual record",
  repo_document: "repo document",
};

/** "PR #88" from `github_pr` + the ref the recorder gave, without stuttering ("PR PR #88"). */
function evidenceLabel(sourceType: SourceType, sourceRef: string): string {
  const base = SOURCE_EVIDENCE_LABELS[sourceType];
  const ref = sourceRef.trim();
  if (!ref) {
    return base;
  }
  return ref.toLowerCase().includes(base.toLowerCase())
    ? ref
    : `${base} ${ref}`;
}

/**
 * One piece of evidence on an axis, in the shape a reader can judge: what it is, where it came from,
 * who recorded it and when.
 *
 * This is deliberately the *same* set `assertClaimsAreBacked` accepts — a branch, a PR, an activity or
 * an annotation — because that method now calls `axisEvidence` too, so the rule and the page cannot
 * drift apart. What it does **not** carry is which claim a given item backs: evidence is recorded per
 * axis, not per field, so the UI phrases it as "evidence on this axis" instead of inventing an
 * attribution the store never made.
 */
export type AxisEvidence = {
  kind: "branch" | "pull_request" | "activity" | "annotation";
  label: string;
  /** Null for branch/PR evidence, which has no recorded source of its own. */
  sourceType: SourceType | null;
  sourceRef: string;
  sourceUrl: string;
  /** `human` / `agent` / `system` / `unknown`, or the note's author type. */
  by: string;
  at: string;
};

/** One axis as the detail view shows it: full metadata, its own history and notes, its evidence. */
export type AxisDetail = Axis & {
  people: LinkedPerson[];
  repositories: LinkedRepository[];
  evidence: AxisEvidence[];
  /** Activity on this axis only, newest first — never one merged log for the whole topic. */
  history: Activity[];
  /** Notes on this axis, kept out of `history` on purpose: a correction is not an event. */
  notes: Annotation[];
  /** The axis's plan and steps, or null — a plan is optional by contract, so absence is ordinary. */
  plan: { plan: Plan; steps: PlanStep[] } | null;
  /** What is in the way. Each problem carries its own state history, appended to and never rewritten. */
  problems: ProblemDetail[];
  /** The axis's own state history: what it is now, and every state it has been. */
  stateHistory: StateLogEntry[];
};

/** A problem as the detail view needs it: the record, its links, and how its state got here. */
export type ProblemDetail = Problem & {
  history: StateLogEntry[];
  planStepTitle: string | null;
  /** Evidence links, in no hierarchy: a problem concerns these codebases, it does not own them. */
  repositories: Repository[];
  people: Person[];
};

/** One topic in depth, in a single call. */
export type TopicDetail = {
  generatedAt: string;
  topic: Topic;
  people: LinkedPerson[];
  repositories: LinkedRepository[];
  axes: AxisDetail[];
  axisCounts: Record<AxisState, number>;
  /** The topic's own log — every activity recorded against it, axis-linked rows included. */
  activity: Activity[];
  /** Notes on the topic itself; a note that belongs to an axis renders under that axis. */
  notes: Annotation[];
  counts: {
    axes: number;
    activities: number;
    notes: number;
    /** Axes that carry no evidence at all — where a `confirmed` claim is impossible by rule. */
    axesWithoutEvidence: number;
  };
};

/** A topic as a rollup names it: enough to link and label it, not a second copy of the topic. */
export type TopicRef = {
  id: string;
  name: string;
  status: TopicStatus;
};

/**
 * The lean axis shape a person / repository rollup scans. Deliberately not `AxisOverview`: the rollup
 * is a scan line ("title · state · repo · branch · PR", plus the blocker where there is one), and the
 * topic detail is where full metadata lives. The overview already returns every axis once; sending
 * each of them twice in full would double the payload an agent pays for on the front page.
 */
export type AxisScan = {
  id: string;
  topicId: string;
  title: string;
  kind: AxisKind;
  state: AxisState;
  /** The state's own claim. A bare "blocked" is an assertion; the record may only hold an inference. */
  stateConfidence: Confidence;
  blocker: string;
  /** Null where the claim itself is absent — the same rule `toAxis` applies. */
  blockerConfidence: Confidence | null;
  branch: string;
  prNumber: number | null;
  prUrl: string;
  version: number;
  updatedAt: string;
  lastReviewedAt: string | null;
  repositories: LinkedRepository[];
};

/** One topic a person is involved in, with only the axes they are actually on inside it. */
export type PersonTopicInvolvement = {
  topic: TopicRef;
  /** The role carried on the topic link (empty when the link carries none). */
  role: string;
  axes: AxisScan[];
};

/**
 * What one person is working on (C6). Built from the links the store already holds — `topic_people`
 * and `axis_people` — plus the activity it can attribute, which is activity whose actor maps to this
 * person's account. Nothing here is scored, ranked or turned into a percentage: the dashboard reports
 * involvement, not utilisation.
 */
export type PersonRollup = {
  person: Person;
  /**
   * False when the person has no account mapped, i.e. **no** activity can ever be attributed to them.
   * The page says so instead of rendering an empty list that looks like idleness.
   */
  attributable: boolean;
  /** Topics they are linked to, and their own axes inside each; topics with no axes for them remain. */
  topics: PersonTopicInvolvement[];
  /** Every axis they are on, attention order — the "3 active · 1 blocked" counts come from here. */
  axes: AxisScan[];
  axisCounts: Record<AxisState, number>;
  /** Their own recorded events inside the window, newest first. Never another person's. */
  recentActivity: Activity[];
  lastActivityAt: string | null;
  /** The most recent `lastReviewedAt` across their axes — "last reviewed", never a workload score. */
  lastReviewedAt: string | null;
};

/** One repository as its own view presents it: what it supports, what is happening in it. */
export type RepositoryRollup = {
  repository: Repository;
  /** The topics it is attached to, primary first, with the relationship on each link. */
  topics: Array<{ relationship: Relationship; topic: TopicRef }>;
  /** The axes that name it, attention order, so "what work is happening in this codebase" is one read. */
  axes: AxisScan[];
  axisCounts: Record<AxisState, number>;
  /** Events recorded against this repository or against one of its axes, newest first. */
  recentActivity: Activity[];
  lastActivityAt: string | null;
};

/**
 * One recorded event as the progress view reads it (C7).
 *
 * `person` is resolved with the same narrow rule as the C6 rollups: the activity's actor, mapped through
 * `people.nakama_user_id`. `null` means the event cannot be attributed to anybody — which is a fact worth
 * showing, not a gap to paper over.
 */
export type TimelineEvent = Activity & {
  person: { displayName: string; id: string } | null;
};

/**
 * One axis's events inside the window. `axis` is `null` for events that name the topic and nothing else —
 * they are real activity and get their own group rather than being dropped.
 */
export type TimelineAxis = {
  axis: AxisScan | null;
  /** Newest first, capped at the timeline limit; `eventCount` is the true total in the window. */
  events: TimelineEvent[];
  eventCount: number;
};

/** A topic that saw activity in the window, with its axes — the default grouping of the progress view. */
export type TimelineGroup = {
  topic: TopicRef;
  /** Axes in attention order, topic-level events last; only axes with events in the window appear. */
  axes: TimelineAxis[];
  eventCount: number;
  lastActivityAt: string | null;
};

/**
 * A card on the overview: one object, the timestamp that decides its place in the order, and whether it has
 * gone quiet. Both `recencyAt` and `stale` are here so a reader — or a test — can check the verdict against
 * the value rather than trusting that two panels agree.
 */
export type RecencyCard = {
  activityInWindow: number;
  id: string;
  kind: "topic" | "repository";
  lastActivityAt: string | null;
  liveAxisCount: number;
  name: string;
  recencyAt: string | null;
  stale: boolean;
};

export type OverviewRecency = {
  activitySinceDays: number;
  repositories: RecencyCard[];
  staleAfterDays: number;
  topics: RecencyCard[];
};

/** One axis as the Progress view needs it: its own facts, plus the recency verdict shared with the Overview. */
export type ProgressAxisRow = {
  activityInWindow: number;
  /** What it is waiting on, and the strength of that claim — null where no claim has been made. */
  blocker: string;
  blockerConfidence: Confidence | null;
  id: string;
  lastActivityAt: string | null;
  openProblems: number;
  plan: {
    id: string;
    steps: PlanStep[];
    stepsDone: number;
    summary: string;
  } | null;
  problems: number;
  recencyAt: string | null;
  stale: boolean;
  state: AxisState;
  stateConfidence: Confidence;
  stateHistory: StateLogEntry[];
  title: string;
  topicId: string;
  topicName: string;
};

export type ProgressAxes = {
  activitySinceDays: number;
  axes: ProgressAxisRow[];
  staleAfterDays: number;
};

/** One problem as the Progress view needs it, read from the problem outwards. */
export type ProgressProblemRow = {
  activityCount: number;
  authorId: string | null;
  authorType: Author;
  axisId: string;
  axisTitle: string;
  history: StateLogEntry[];
  id: string;
  lastActivityAt: string | null;
  people: Array<{ displayName: string; id: string }>;
  planStepId: string | null;
  planStepTitle: string | null;
  recencyAt: string | null;
  repositories: Array<{ fullName: string; id: string }>;
  stale: boolean;
  state: ProblemState;
  stateConfidence: Confidence;
  statement: string;
  topicId: string;
  topicName: string;
};

export type ProgressProblems = {
  activitySinceDays: number;
  problems: ProgressProblemRow[];
  staleAfterDays: number;
};

/**
 * One axis's events inside the window, newest first — the Activity column's unit.
 *
 * `eventCount` is the true total in the window (the row list is capped, like the timeline's), and it is the
 * same number the index row reports as `activityInWindow`: both are the axis's rows in `activities` judged by
 * the same `visibleContext.inWindow`, so the column and the index cannot disagree about how much happened.
 * A test asserts that agreement rather than leaving it to convention.
 */
export type ProgressActivityAxis = {
  axisId: string;
  events: TimelineEvent[];
  eventCount: number;
};

/**
 * The window's activity, grouped by axis, in the index's own order.
 *
 * Only axis-linked events appear: the Activity column belongs to a selected axis, and an event that names
 * only its topic has no axis row to be selected. Those events are not lost — they keep their topic-level
 * bucket in the grouped timeline the Progress view already renders below.
 */
export type ProgressActivity = {
  activitySinceDays: number;
  byAxis: ProgressActivityAxis[];
  staleAfterDays: number;
};

/**
 * Attention order for axes on the overview: what needs a human first, then the rest of the work.
 * Completed and abandoned work sinks to the bottom instead of disappearing.
 *
 * `usable` sits next to `active` rather than near `completed`: the work is in use and its gaps are known,
 * which is live work, not finished work — parking it at the bottom would read as "done" and hide the gaps.
 * The contract states no axis order, so this placement is a product decision of ours, not a transcription;
 * it is one line to change if Progress decides otherwise, and nothing in either dataset is `usable` yet.
 */
const AXIS_STATE_ATTENTION: Record<AxisState, number> = {
  abandoned: 6,
  active: 1,
  blocked: 0,
  completed: 5,
  draft: 3,
  parked: 4,
  usable: 2,
};

/** Topic lifecycle order on the front page, so retired topics do not float above live work. */
const TOPIC_STATUS_ATTENTION: Record<TopicStatus, number> = {
  active: 0,
  archived: 3,
  completed: 2,
  paused: 1,
};

function compareAxesForAttention(
  a: Pick<Axis, "state" | "title" | "updatedAt">,
  b: Pick<Axis, "state" | "title" | "updatedAt">
): number {
  const byState = AXIS_STATE_ATTENTION[a.state] - AXIS_STATE_ATTENTION[b.state];
  if (byState !== 0) {
    return byState;
  }
  const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
  return byUpdated === 0 ? a.title.localeCompare(b.title) : byUpdated;
}

function compareTopicsForAttention(a: TopicOverview, b: TopicOverview): number {
  const byStatus =
    TOPIC_STATUS_ATTENTION[a.topic.status] -
    TOPIC_STATUS_ATTENTION[b.topic.status];
  if (byStatus !== 0) {
    return byStatus;
  }
  // Inside the same lifecycle, a topic carrying a blocker is the one to look at first.
  const byBlocked =
    Number(b.axisCounts.blocked > 0) - Number(a.axisCounts.blocked > 0);
  if (byBlocked !== 0) {
    return byBlocked;
  }
  const byUpdated = b.topic.updatedAt.localeCompare(a.topic.updatedAt);
  return byUpdated === 0 ? a.topic.name.localeCompare(b.topic.name) : byUpdated;
}

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
  /** The same, for a read snapshot — a read model assembled out of other read models must not re-`BEGIN`. */
  private readDepth = 0;

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
   *
   * Reentrant, and for the same reason `atomic` is: a read model built out of other read models (a plan
   * assembled from its steps, an axis's problems plus their evidence) must join the snapshot in flight
   * instead of issuing a second `BEGIN`, which SQLite refuses outright.
   */
  private snapshot<T>(fn: () => T): T {
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
      } catch {
        // Already unwound; the original error is the useful one.
      }
      throw error;
    } finally {
      this.readDepth -= 1;
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

  /** The people a problem is linked to. No role: a problem has an owner of its text, not a hierarchy. */
  listProblemPeople(problemId: string): Person[] {
    return (
      this.db
        .query(
          `SELECT p.*
           FROM problem_people l JOIN people p ON p.id = l.person_id
           WHERE l.problem_id = ?
           ORDER BY p.display_name COLLATE NOCASE ASC`
        )
        .all(problemId) as PersonRow[]
    ).map(toPerson);
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

  /** Notes on the topic itself — a note that belongs to an axis renders under that axis instead. */
  listTopicNotes(topicId: string, limit?: number): Annotation[] {
    const rows = this.db
      .query(
        `SELECT * FROM annotations
         WHERE topic_id = ? AND axis_id IS NULL
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(
        topicId,
        clampLimit(limit, DEFAULT_ANNOTATION_LIMIT, MAX_ANNOTATION_LIMIT)
      ) as AnnotationRow[];
    return rows.map(toAnnotation);
  }

  // ------------------------------------------------------- evidence & detail

  /**
   * Everything that counts as evidence for an axis, in reading order: the structural evidence the axis
   * names first (its branch and its PR), then what was recorded against it, newest first.
   *
   * **This is the one definition of "that axis has evidence"** — `assertClaimsAreBacked` calls it too,
   * so a claim the rule would reject cannot render as backed, and one it accepts cannot render as bare.
   * The reverse is the useful direction: an axis with an empty list here can only ever be `inferred` or
   * `uncertain`, and the page says so.
   */
  axisEvidence(axis: Axis): AxisEvidence[] {
    const items: AxisEvidence[] = [];
    const branch = axis.branch.trim();
    if (branch) {
      items.push({
        at: "",
        by: "",
        kind: "branch",
        label: branch,
        sourceRef: "",
        sourceType: null,
        sourceUrl: "",
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
        sourceUrl: axis.prUrl.trim(),
      });
    }
    const activities = this.db
      .query(
        `SELECT * FROM activities WHERE axis_id = ?
         ORDER BY occurred_at DESC, rowid DESC LIMIT ?`
      )
      .all(axis.id, EVIDENCE_ITEM_LIMIT) as ActivityRow[];
    for (const row of activities) {
      const activity = toActivity(row);
      items.push({
        at: activity.occurredAt,
        by: activity.actorType,
        kind: "activity",
        label: evidenceLabel(activity.sourceType, activity.sourceRef),
        sourceRef: activity.sourceRef,
        sourceType: activity.sourceType,
        sourceUrl: activity.sourceUrl,
      });
    }
    const notes = this.db
      .query(
        `SELECT * FROM annotations WHERE axis_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`
      )
      .all(axis.id, EVIDENCE_ITEM_LIMIT) as AnnotationRow[];
    for (const row of notes) {
      const note = toAnnotation(row);
      items.push({
        at: note.createdAt,
        by: note.authorType,
        kind: "annotation",
        label: "note",
        sourceRef: "",
        sourceType: null,
        sourceUrl: "",
      });
    }
    return items;
  }

  /**
   * One topic in depth, in a single call: full axis metadata with each axis's own history, notes and
   * evidence, plus the topic's own activity log and notes.
   *
   * The front page deliberately avoids a read per topic; here the opposite trade is right. This is one
   * topic with a handful of axes, and the per-axis reads are exactly what makes "history under the
   * axis, notes beside it" expressible — a merged log for the whole topic is what the reviewer asked
   * us *not* to build.
   */
  getTopicDetail(
    topicId: string,
    options?: {
      activityLimit?: number;
      activitySinceDays?: number;
      historyLimit?: number;
      notesLimit?: number;
    }
  ): TopicDetail {
    return this.snapshot(() => {
      const topic = this.getTopic(required(topicId, "topicId"));
      if (!topic) {
        throw new ResearchStoreError("Topic not found.");
      }
      const historyLimit = clampLimit(
        options?.historyLimit,
        DEFAULT_AXIS_HISTORY_LIMIT,
        MAX_AXIS_HISTORY_LIMIT
      );
      const notesLimit = clampLimit(
        options?.notesLimit,
        DEFAULT_ANNOTATION_LIMIT,
        MAX_ANNOTATION_LIMIT
      );
      const axes: AxisDetail[] = this.listAxes(topic.id).map((axis) => ({
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
          planStepTitle: problem.planStepId
            ? (this.getPlanStep(problem.planStepId)?.title ?? null)
            : null,
          repositories: this.listProblemRepositories(problem.id),
        })),
        repositories: this.listAxisRepositories(axis.id),
        stateHistory: this.stateHistory("axis_id", axis.id),
      }));
      const axisCounts = Object.fromEntries(
        AXIS_STATES.map((state) => [
          state,
          axes.filter((axis) => axis.state === state).length,
        ])
      ) as Record<AxisState, number>;
      const activity = this.listActivity({
        limit: clampLimit(
          options?.activityLimit,
          DEFAULT_ACTIVITY_LIMIT,
          MAX_ACTIVITY_LIMIT
        ),
        sinceDays: options?.activitySinceDays,
        topicId: topic.id,
      });
      const notes = this.listTopicNotes(topic.id, notesLimit);
      return {
        activity,
        axes,
        axisCounts,
        counts: {
          activities: activity.length,
          axes: axes.length,
          axesWithoutEvidence: axes.filter((axis) => axis.evidence.length === 0)
            .length,
          notes: notes.length,
        },
        generatedAt: nowIso(),
        notes,
        people: this.listTopicPeople(topic.id),
        repositories: this.listTopicRepositories(topic.id),
        topic,
      };
    });
  }

  // ------------------------------------------------------- aggregates & search

  /**
   * The dashboard front page: what exists, what is blocked and who is waiting on what, what moved
   * recently. `activitySinceDays` is a query parameter, never stored state — the same call answers
   * "what happened this week" and "what happened this quarter"; `0` means no lower bound at all.
   *
   * The `topics` rollup is what the page renders: axes grouped under their topic in attention order,
   * with people, repositories and an activity summary, all in this one call.
   */
  getOverview(options?: {
    activitySinceDays?: number;
    includeArchived?: boolean;
    limit?: number;
  }): Overview {
    return this.snapshot(() => {
      const activitySinceDays = options?.activitySinceDays ?? 14;
      const includeArchived = options?.includeArchived ?? false;
      const limit = clampLimit(options?.limit, 10, 50);
      // 0 means "all time": no lower bound on the window (the same convention as listActivity).
      const since =
        activitySinceDays > 0 ? isoDaysAgo(activitySinceDays) : null;

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
        .query(
          "SELECT state, count(*) AS n FROM development_axes GROUP BY state"
        )
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
        .get() as {
        axes: number;
        people: number;
        repositories: number;
        topics: number;
      };

      const blocked = this.db
        .query(
          `SELECT a.*, t.name AS topic_name
           FROM development_axes a JOIN topics t ON t.id = a.topic_id
           WHERE a.state = 'blocked'
           ORDER BY a.updated_at DESC`
        )
        .all() as Array<AxisRow & { topic_name: string }>;

      const rollups = this.involvementRollups(
        includeArchived,
        since,
        MAX_ROLLUP_LIMIT
      );

      return {
        activitySinceDays,
        axesByState,
        blocked: blocked.map((row) => ({
          axisId: row.id,
          blocker: row.blocker,
          blockerConfidence:
            (row.blocker_confidence as Confidence) ?? "uncertain",
          state: (row.state as AxisState) ?? "active",
          title: row.title,
          topicId: row.topic_id,
          topicName: row.topic_name,
          updatedAt: row.updated_at,
        })),
        counts: { ...counts, topicsByStatus },
        generatedAt: nowIso(),
        people: rollups.people,
        peopleTruncated: rollups.peopleTruncated,
        recentActivity: this.listActivity({
          limit: 25,
          sinceDays: activitySinceDays > 0 ? activitySinceDays : undefined,
        }),
        recentTopics: (
          this.db
            .query(
              "SELECT * FROM topics ORDER BY updated_at DESC, name ASC LIMIT ?"
            )
            .all(limit) as TopicRow[]
        ).map(toTopic),
        repositories: rollups.repositories,
        repositoriesTruncated: rollups.repositoriesTruncated,
        timeline: this.recentProgress(
          since,
          includeArchived,
          DEFAULT_TIMELINE_AXIS_LIMIT
        ),
        topics: this.topicOverviews(includeArchived, since),
      };
    });
  }

  /**
   * One entry per topic, axes grouped underneath in attention order. Built from a handful of grouped
   * queries rather than a read per topic: the front page is one call by contract, and an N+1 here
   * would be paid on every page load.
   */
  private topicOverviews(
    includeArchived: boolean,
    since: string | null
  ): TopicOverview[] {
    const axesByTopic = new Map<string, AxisOverview[]>();
    const repositoriesByAxis = this.repositoriesByAxis();
    for (const row of this.db
      .query("SELECT * FROM development_axes")
      .all() as AxisRow[]) {
      const axis = toAxis(row);
      const grouped = axesByTopic.get(axis.topicId) ?? [];
      grouped.push({
        ...axis,
        repositories: repositoriesByAxis.get(axis.id) ?? [],
      });
      axesByTopic.set(axis.topicId, grouped);
    }

    const peopleByTopic = new Map<string, LinkedPerson[]>();
    for (const row of this.db
      .query(
        `SELECT l.topic_id AS topic_id, p.*, l.role AS role
         FROM topic_people l JOIN people p ON p.id = l.person_id
         ORDER BY p.display_name COLLATE NOCASE ASC`
      )
      .all() as Array<PersonRow & { role: string; topic_id: string }>) {
      const linked = peopleByTopic.get(row.topic_id) ?? [];
      linked.push({ ...toPerson(row), role: row.role });
      peopleByTopic.set(row.topic_id, linked);
    }

    const repositoriesByTopic = new Map<string, LinkedRepository[]>();
    for (const row of this.db
      .query(
        `SELECT l.topic_id AS topic_id, r.*, l.relationship AS relationship
         FROM topic_repositories l JOIN repositories r ON r.id = l.repository_id
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`
      )
      .all() as Array<
      RepositoryRow & { relationship: string; topic_id: string }
    >) {
      const linked = repositoriesByTopic.get(row.topic_id) ?? [];
      linked.push({
        ...toRepository(row),
        relationship: row.relationship as Relationship,
      });
      repositoriesByTopic.set(row.topic_id, linked);
    }

    // One grouped query: events inside the window (for the count) and the latest ever (for the age).
    const activityByTopic = new Map<string, { last: string; n: number }>();
    for (const row of this.db
      .query(
        `SELECT topic_id,
                sum(CASE WHEN ? IS NULL OR occurred_at >= ? THEN 1 ELSE 0 END) AS n,
                max(occurred_at) AS last
         FROM activities WHERE topic_id IS NOT NULL
         GROUP BY topic_id`
      )
      .all(since, since) as Array<{
      last: string;
      n: number;
      topic_id: string;
    }>) {
      activityByTopic.set(row.topic_id, { last: row.last, n: row.n });
    }

    return this.listTopics()
      .filter((topic) => includeArchived || topic.status !== "archived")
      .map((topic) => {
        const axes = (axesByTopic.get(topic.id) ?? []).sort(
          compareAxesForAttention
        );
        const axisCounts = countAxesByState(axes);
        const activity = activityByTopic.get(topic.id);
        return {
          activityCount: activity?.n ?? 0,
          axes,
          axisCounts,
          lastActivityAt: activity?.last ?? null,
          people: peopleByTopic.get(topic.id) ?? [],
          repositories: repositoriesByTopic.get(topic.id) ?? [],
          topic,
        };
      })
      .sort(compareTopicsForAttention);
  }

  /**
   * The repository attachments for **every** linked axis, in one query: `axisId → repositories`, primary
   * first. Shared by the topic overview and the C6 rollups so the two cannot drift apart.
   */
  private repositoriesByAxis(): Map<string, LinkedRepository[]> {
    const map = new Map<string, LinkedRepository[]>();
    for (const row of this.db
      .query(
        `SELECT l.axis_id AS axis_id, r.*, l.relationship AS relationship
         FROM axis_repositories l JOIN repositories r ON r.id = l.repository_id
         ORDER BY (l.relationship = 'primary') DESC, r.full_name COLLATE NOCASE ASC`
      )
      .all() as Array<
      RepositoryRow & { axis_id: string; relationship: string }
    >) {
      const linked = map.get(row.axis_id) ?? [];
      linked.push({
        ...toRepository(row),
        relationship: row.relationship as Relationship,
      });
      map.set(row.axis_id, linked);
    }
    return map;
  }

  /**
   * The context C6 and C7 group by: every visible topic, and every axis of a visible topic with its
   * repositories. One definition of "visible", so the rollups, the progress view and the front page
   * cannot drift apart on archived work.
   *
   * It also owns the **activity window**, so the two halves of "what is in scope" — the archived rule and
   * the window — are resolved in one place per call and read by every projection. A projection that built
   * its own window could answer a different question from the panel beside it without anything failing.
   */
  private visibleContext(input: {
    includeArchived: boolean;
    activitySinceDays?: number;
  }): {
    activitySinceDays: number;
    inWindow: (at: string | null | undefined) => boolean;
    nowMs: number;
    repositoriesByAxis: Map<string, LinkedRepository[]>;
    scans: Map<string, AxisScan>;
    since: string | null;
    topicRefs: Map<string, TopicRef>;
    visible: (topicId: string) => boolean;
  } {
    const includeArchived = input.includeArchived;
    const activitySinceDays = input.activitySinceDays ?? 14;
    // Zero (or negative) means "no window": the same convention the overview already uses.
    const since = activitySinceDays > 0 ? isoDaysAgo(activitySinceDays) : null;
    const inWindow = (at: string | null | undefined): boolean =>
      Boolean(at) && (since === null || String(at) >= since);
    const nowMs = Date.now();
    const topicRefs = new Map<string, TopicRef>();
    for (const row of this.db
      .query("SELECT id, name, status FROM topics")
      .all() as Array<{ id: string; name: string; status: string }>) {
      if (isTopicStatus(row.status)) {
        topicRefs.set(row.id, {
          id: row.id,
          name: row.name,
          status: row.status,
        });
      }
    }
    // Archived work is hidden unless the page asks for it, exactly as on the front page.
    const visible = (topicId: string): boolean => {
      const ref = topicRefs.get(topicId);
      return Boolean(ref) && (includeArchived || ref?.status !== "archived");
    };

    const repositoriesByAxis = this.repositoriesByAxis();
    const scans = new Map<string, AxisScan>();
    for (const row of this.db
      .query("SELECT * FROM development_axes")
      .all() as AxisRow[]) {
      if (visible(row.topic_id)) {
        scans.set(
          row.id,
          toAxisScan(toAxis(row), repositoriesByAxis.get(row.id) ?? [])
        );
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
      visible,
    };
  }

  /** account id → the person it maps to. The one attribution map; the C6 rollups and C7 both read it. */
  private personRefByAccount(): Map<
    string,
    { displayName: string; id: string }
  > {
    const map = new Map<string, { displayName: string; id: string }>();
    for (const row of this.db
      .query("SELECT id, display_name, nakama_user_id FROM people")
      .all() as Array<{
      display_name: string;
      id: string;
      nakama_user_id: string | null;
    }>) {
      if (row.nakama_user_id) {
        map.set(row.nakama_user_id, {
          displayName: row.display_name,
          id: row.id,
        });
      }
    }
    return map;
  }

  /**
   * The time view of the same data (C7): what changed inside the window, grouped topic → axis, newest
   * topic first, with the topic and repository context **implied by the axis** rather than required on
   * the row.
   *
   * That last part is the C6 defect made into a rule. An event recorded by somebody who named only the
   * axis still lands under the right topic, and still reads as work in the right codebase, because the
   * grouping follows the relationship. An event that names a topic and no axis is kept as its own group
   * (topic-level events are real) instead of being dropped; an event that names neither is not shown,
   * because there is no honest place to put it.
   */
  private recentProgress(
    since: string | null,
    includeArchived: boolean,
    limit: number
  ): TimelineGroup[] {
    const { scans, topicRefs } = this.visibleContext({ includeArchived });
    const personByAccount = this.personRefByAccount();
    const rows = this.db
      .query(
        `SELECT * FROM activities
         WHERE (? IS NULL OR occurred_at >= ?)
         ORDER BY occurred_at DESC, rowid DESC`
      )
      .all(since, since) as ActivityRow[];

    /** topicId → axisId (`""` = the topic itself) → that axis's bucket. */
    const byTopic = new Map<string, Map<string, TimelineAxis>>();
    for (const row of rows) {
      const event = toActivity(row);
      const axis = event.axisId ? (scans.get(event.axisId) ?? null) : null;
      const topicId = axis?.topicId ?? event.topicId ?? "";
      if (topicId === "" || !topicRefs.has(topicId)) {
        continue;
      }
      const buckets = byTopic.get(topicId) ?? new Map<string, TimelineAxis>();
      const key = axis?.id ?? "";
      const bucket = buckets.get(key) ?? { axis, eventCount: 0, events: [] };
      bucket.eventCount += 1;
      if (bucket.events.length < limit) {
        bucket.events.push({
          ...event,
          person: personByAccount.get(event.actorId) ?? null,
        });
      }
      buckets.set(key, bucket);
      byTopic.set(topicId, buckets);
    }

    const groups: TimelineGroup[] = [];
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
        eventCount: axes.reduce(
          (total, bucket) => total + bucket.eventCount,
          0
        ),
        lastActivityAt: axes[0]?.events[0]?.occurredAt ?? null,
        topic,
      });
    }

    // Most recently active topic first: the view answers "what changed", so the newest change leads.
    return groups.sort(
      (a, b) =>
        (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
        a.topic.name.localeCompare(b.topic.name)
    );
  }

  /**
   * The person-first and repository-first views of the same data (C6), riding along in the call the
   * front page already makes: one dashboard, one read, and no new action for an agent to learn.
   *
   * Two rules are worth stating, because they are the two a reader should not have to trust.
   *
   * 1. **A person is one row.** Grouping is by `people.id`, never by display name: someone on three
   *    topics and two axes appears once, with their involvement grouped underneath. The identity
   *    duplication C4 hit was a read-model bug, and this is the read model that must not repeat it.
   * 2. **Attribution is narrow, and says so.** An event belongs to a person only when the activity's
   *    `actor_id` maps to their account (`people.nakama_user_id`); an unmapped or unknown actor owns
   *    nothing, and a person with no account can never own anything — hence `attributable: false`
   *    instead of an empty log that would read as idleness.
   *
   * Nothing here is scored, ranked or expressed as a percentage: this reports involvement, and the
   * only time-shaped facts are when something was last recorded and when an axis was last reviewed.
   */
  private involvementRollups(
    includeArchived: boolean,
    since: string | null,
    limit: number
  ): {
    people: PersonRollup[];
    peopleTruncated: boolean;
    repositories: RepositoryRollup[];
    repositoriesTruncated: boolean;
  } {
    const { repositoriesByAxis, scans, topicRefs, visible } =
      this.visibleContext({ includeArchived });

    // Every event inside the window, read once: the two rollups slice it differently.
    const events = (
      this.db
        .query(
          `SELECT * FROM activities
           WHERE (? IS NULL OR occurred_at >= ?)
           ORDER BY occurred_at DESC, rowid DESC`
        )
        .all(since, since) as ActivityRow[]
    ).map(toActivity);

    // ---------------------------------------------------------------------------- people
    const people = this.db
      .query("SELECT * FROM people ORDER BY display_name COLLATE NOCASE ASC")
      .all() as PersonRow[];
    const idByAccount = new Map<string, string>();
    for (const row of people) {
      if (row.nakama_user_id) {
        idByAccount.set(row.nakama_user_id, row.id);
      }
    }

    const activityByPerson = new Map<string, Activity[]>();
    for (const event of events) {
      const personId = event.actorId
        ? idByAccount.get(event.actorId)
        : undefined;
      if (!personId) {
        continue;
      }
      const own = activityByPerson.get(personId) ?? [];
      if (own.length < DEFAULT_ROLLUP_ACTIVITY_LIMIT) {
        own.push(event);
        activityByPerson.set(personId, own);
      }
    }
    // "Last activity" ignores the window on purpose: someone whose last event was three weeks ago has
    // not recorded nothing, and the page should not imply they had.
    const lastByAccount = new Map<string, string>();
    for (const row of this.db
      .query(
        "SELECT actor_id, max(occurred_at) AS last FROM activities WHERE actor_id <> '' GROUP BY actor_id"
      )
      .all() as Array<{ actor_id: string; last: string }>) {
      lastByAccount.set(row.actor_id, row.last);
    }

    const axesByPerson = new Map<string, AxisScan[]>();
    for (const row of this.db
      .query("SELECT person_id, axis_id FROM axis_people")
      .all() as Array<{ axis_id: string; person_id: string }>) {
      const axis = scans.get(row.axis_id);
      if (!axis) {
        continue;
      }
      const own = axesByPerson.get(row.person_id) ?? [];
      own.push(axis);
      axesByPerson.set(row.person_id, own);
    }

    const involvementsByPerson = new Map<
      string,
      Map<string, PersonTopicInvolvement>
    >();
    // Topic links first: someone can be on a topic without being on any of its axes.
    for (const row of this.db
      .query("SELECT person_id, topic_id, role FROM topic_people")
      .all() as Array<{ person_id: string; role: string; topic_id: string }>) {
      const topic = topicRefs.get(row.topic_id);
      if (!(topic && visible(row.topic_id))) {
        continue;
      }
      const own =
        involvementsByPerson.get(row.person_id) ??
        new Map<string, PersonTopicInvolvement>();
      own.set(row.topic_id, { axes: [], role: row.role, topic });
      involvementsByPerson.set(row.person_id, own);
    }
    // Then the axes, which may name a topic the person was never linked to directly.
    for (const [personId, own] of axesByPerson) {
      const involvements =
        involvementsByPerson.get(personId) ??
        new Map<string, PersonTopicInvolvement>();
      for (const axis of own) {
        const topic = topicRefs.get(axis.topicId);
        if (!topic) {
          continue;
        }
        const entry = involvements.get(axis.topicId) ?? {
          axes: [],
          role: "",
          topic,
        };
        entry.axes.push(axis);
        involvements.set(axis.topicId, entry);
      }
      involvementsByPerson.set(personId, involvements);
    }

    const personRollups: PersonRollup[] = people.slice(0, limit).map((row) => {
      const person = toPerson(row);
      const own = (axesByPerson.get(person.id) ?? []).sort(
        compareAxesForAttention
      );
      const reviewed = own
        .map((axis) => axis.lastReviewedAt)
        .filter((value): value is string => Boolean(value));
      return {
        attributable: Boolean(person.nakamaUserId),
        axes: own,
        axisCounts: countAxesByState(own),
        lastActivityAt: person.nakamaUserId
          ? (lastByAccount.get(person.nakamaUserId) ?? null)
          : null,
        lastReviewedAt:
          reviewed.length > 0 ? (reviewed.sort().at(-1) ?? null) : null,
        person,
        recentActivity: activityByPerson.get(person.id) ?? [],
        topics: [...(involvementsByPerson.get(person.id)?.values() ?? [])]
          .map((entry) => ({
            ...entry,
            axes: entry.axes.sort(compareAxesForAttention),
          }))
          .sort((a, b) => a.topic.name.localeCompare(b.topic.name)),
      };
    });

    // ---------------------------------------------------------------------- repositories
    /**
     * axisId → the repositories that axis names, so an event recorded against an axis alone still
     * belongs to the codebase that axis points at. (The map below is the other direction: the axes a
     * repository has, which is what the rollup's axis list reads.)
     */
    const repositoryIdsByAxis = new Map<string, string[]>();
    const axisIdsByRepository = new Map<string, string[]>();
    for (const [axisId, linked] of repositoriesByAxis) {
      repositoryIdsByAxis.set(
        axisId,
        linked.map((repository) => repository.id)
      );
      for (const repository of linked) {
        const own = axisIdsByRepository.get(repository.id) ?? [];
        own.push(axisId);
        axisIdsByRepository.set(repository.id, own);
      }
    }

    const activityByRepository = new Map<string, Activity[]>();
    const addRepositoryEvent = (
      repositoryId: string,
      event: Activity
    ): void => {
      const own = activityByRepository.get(repositoryId) ?? [];
      if (
        own.length < DEFAULT_ROLLUP_ACTIVITY_LIMIT &&
        !own.some((item) => item.id === event.id)
      ) {
        own.push(event);
        activityByRepository.set(repositoryId, own);
      }
    };
    for (const event of events) {
      if (event.repositoryId) {
        addRepositoryEvent(event.repositoryId, event);
      }
      // An event recorded against an axis also belongs to the codebase that axis names, even when the
      // recorder only filled in the axis. This is the common case: an activity recorder names the work,
      // not the repository, and the link is what makes the repository view show anything at all.
      for (const repositoryId of repositoryIdsByAxis.get(event.axisId ?? "") ??
        []) {
        addRepositoryEvent(repositoryId, event);
      }
    }

    const lastByRepository = new Map<string, string>();
    const noteLast = (repositoryId: string, at: string): void => {
      const current = lastByRepository.get(repositoryId);
      if (!current || at > current) {
        lastByRepository.set(repositoryId, at);
      }
    };
    for (const row of this.db
      .query(
        `SELECT repository_id, max(occurred_at) AS last FROM activities
         WHERE repository_id IS NOT NULL GROUP BY repository_id`
      )
      .all() as Array<{ last: string; repository_id: string }>) {
      noteLast(row.repository_id, row.last);
    }
    for (const row of this.db
      .query(
        `SELECT ar.repository_id AS repository_id, max(x.occurred_at) AS last
         FROM activities x JOIN axis_repositories ar ON ar.axis_id = x.axis_id
         GROUP BY ar.repository_id`
      )
      .all() as Array<{ last: string; repository_id: string }>) {
      noteLast(row.repository_id, row.last);
    }

    const topicsByRepository = new Map<
      string,
      Array<{ relationship: Relationship; topic: TopicRef }>
    >();
    for (const row of this.db
      .query(
        "SELECT topic_id, repository_id, relationship FROM topic_repositories"
      )
      .all() as Array<{
      relationship: string;
      repository_id: string;
      topic_id: string;
    }>) {
      const topic = topicRefs.get(row.topic_id);
      if (!(topic && visible(row.topic_id))) {
        continue;
      }
      const own = topicsByRepository.get(row.repository_id) ?? [];
      own.push({ relationship: row.relationship as Relationship, topic });
      topicsByRepository.set(row.repository_id, own);
    }
    const compareTopicLinks = (
      a: { relationship: Relationship; topic: TopicRef },
      b: { relationship: Relationship; topic: TopicRef }
    ): number => {
      const byPrimary =
        Number(b.relationship === "primary") -
        Number(a.relationship === "primary");
      return byPrimary === 0
        ? a.topic.name.localeCompare(b.topic.name)
        : byPrimary;
    };

    const repositoryRows = this.db
      .query("SELECT * FROM repositories ORDER BY full_name COLLATE NOCASE ASC")
      .all() as RepositoryRow[];
    const repositoryRollups: RepositoryRollup[] = repositoryRows
      .slice(0, limit)
      .map((row) => {
        const repository = toRepository(row);
        const own = (axisIdsByRepository.get(repository.id) ?? [])
          .map((axisId) => scans.get(axisId))
          .filter((axis): axis is AxisScan => Boolean(axis))
          .sort(compareAxesForAttention);
        return {
          axes: own,
          axisCounts: countAxesByState(own),
          lastActivityAt: lastByRepository.get(repository.id) ?? null,
          recentActivity: activityByRepository.get(repository.id) ?? [],
          repository,
          topics: (topicsByRepository.get(repository.id) ?? []).sort(
            compareTopicLinks
          ),
        };
      });

    return {
      people: personRollups,
      peopleTruncated: people.length > limit,
      repositories: repositoryRollups,
      repositoriesTruncated: repositoryRows.length > limit,
    };
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
      const archivedFilter = includeArchived
        ? ""
        : "AND t.status <> 'archived'";

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
        .all(pattern, pattern, limit + 1) as Array<
        ActivityRow & { topic_name: string | null }
      >;

      const annotationRows = this.db
        .query(
          `SELECT n.*, t.name AS topic_name FROM annotations n LEFT JOIN topics t ON t.id = n.topic_id
           WHERE n.text LIKE ? ESCAPE '\\'
           ORDER BY n.created_at DESC, n.rowid DESC
           LIMIT ?`
        )
        .all(pattern, limit + 1) as Array<
        AnnotationRow & { topic_name: string | null }
      >;

      const fields = (
        row: Record<string, unknown>,
        names: string[]
      ): string[] =>
        names.filter((name) =>
          String(row[name] ?? "")
            .toLowerCase()
            .includes(needle)
        );

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
        matchedFields: fields(row as unknown as Record<string, unknown>, [
          "summary",
          "source_ref",
        ]),
        record: toActivity(row),
        topicName: row.topic_name,
      }));
      const annotations = annotationRows.slice(0, limit).map((row) => ({
        matchedFields: fields(row as unknown as Record<string, unknown>, [
          "text",
        ]),
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
    /** The problem this event is evidence for. Naming it is enough: the axis and topic are implied. */
    problemId?: string;
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
      const problemId = input.problemId ? required(input.problemId, "problemId") : null;
      const problem = problemId ? this.getProblem(problemId) : null;
      if (problemId && !problem) {
        throw new ResearchStoreError("Problem not found.");
      }
      // The common shape: an event names its problem, and the axis and topic are implied by where that
      // problem already sits. Making the caller repeat them is how one recording contradicts another.
      const topicId = input.topicId ? required(input.topicId, "topicId") : null;
      const axisId = input.axisId
        ? required(input.axisId, "axisId")
        : (problem?.axisId ?? null);
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
      // A named repository is registered inside this transaction, so recording an event that names a
      // repository is still one atomic step for the caller.
      const repositoryId = input.repositoryFullName
        ? this.upsertRepository({ fullName: input.repositoryFullName })
            .repository.id
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
        problemId,
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
    problemId?: string;
    text: string;
    kind?: AnnotationKind;
    /** Only meaningful on a claim. A plain note has nothing to be confident about. */
    confidence?: Confidence | null;
    authorType?: "human" | "agent";
    authorId?: string;
  }): Annotation {
    return this.atomic(() => {
      const body = required(input.text, "text");
      const kind = optionalOneOf(input.kind, ANNOTATION_KINDS, "kind") ?? "note";
      const topicId = input.topicId ? required(input.topicId, "topicId") : null;
      const axisId = input.axisId ? required(input.axisId, "axisId") : null;
      const problemId = input.problemId
        ? required(input.problemId, "problemId")
        : null;
      if (!(topicId || axisId || problemId)) {
        throw new ResearchStoreError("topicId, axisId or problemId is required.");
      }
      // One canonical target for the claim kinds, enforced here as well as in the schema. A `note` may
      // still sit on several entities at once — five of the seven rows in the real corpus database do, and
      // rewriting them would trade history for tidiness — but a steering or interpretation claim that
      // points at two things is ambiguous the moment one of them changes.
      const targets = [topicId, axisId, problemId].filter(
        (value) => value !== null
      ).length;
      if (kind !== "note" && targets !== 1) {
        throw new ResearchStoreError(
          `A ${kind} claim must sit on exactly one of a topic, an axis or a problem — it names ${targets}.`
        );
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
      if (
        kind === "note" &&
        input.confidence !== undefined &&
        input.confidence !== null
      ) {
        throw new ResearchStoreError(
          "A plain note carries no confidence — carrying one is what makes it an interpretation."
        );
      }
      return this.insertAnnotation({
        authorId: input.authorId ?? "",
        authorType: input.authorType ?? "human",
        // Deliberately not derived from the problem: an axis link as well as a problem link is two targets,
        // which is exactly what the claim kinds may not have.
        axisId,
        confidence:
          optionalOneOf(input.confidence ?? undefined, CONFIDENCES, "confidence") ??
          null,
        kind,
        problemId,
        text: body,
        // Only a note inherits the axis's topic. For a claim kind that inheritance would silently create a
        // second target — a steering claim on an axis would also be filed against its topic, and the row
        // the schema forbids is exactly the row this would write.
        topicId:
          kind === "note" ? (topicId ?? axis?.topicId ?? null) : topicId,
      });
    });
  }

  // ------------------------------------------- problems, plans and state transitions

  listProblems(axisId: string): Problem[] {
    return this.snapshot(() =>
      (
        this.db
          .query("SELECT * FROM problems WHERE axis_id = ? ORDER BY created_at, id")
          .all(required(axisId, "axisId")) as ProblemRow[]
      ).map(toProblem)
    );
  }

  getProblem(id: string): Problem | null {
    const row = this.db
      .query("SELECT * FROM problems WHERE id = ?")
      .get(id) as ProblemRow | null;
    return row ? toProblem(row) : null;
  }

  /** The repository side of the rollup: problems whose evidence links name this repository. */
  problemsForRepository(repositoryId: string): Problem[] {
    return this.snapshot(() =>
      (
        this.db
          .query(
            `SELECT p.* FROM problems p
               JOIN problem_repositories l ON l.problem_id = p.id
              WHERE l.repository_id = ?
              ORDER BY p.created_at, p.id`
          )
          .all(required(repositoryId, "repositoryId")) as ProblemRow[]
      ).map(toProblem)
    );
  }

  /** Oldest first: a history read backwards is a history nobody can follow. */
  problemStateHistory(problemId: string): StateLogEntry[] {
    return this.stateHistory("problem_id", required(problemId, "problemId"));
  }

  axisStateHistory(axisId: string): StateLogEntry[] {
    return this.stateHistory("axis_id", required(axisId, "axisId"));
  }

  listPlans(axisId: string): Plan[] {
    return this.snapshot(() =>
      (
        this.db
          .query("SELECT * FROM plans WHERE axis_id = ? ORDER BY created_at, id")
          .all(required(axisId, "axisId")) as PlanRow[]
      ).map(toPlan)
    );
  }

  getPlan(id: string): Plan | null {
    const row = this.db
      .query("SELECT * FROM plans WHERE id = ?")
      .get(id) as PlanRow | null;
    return row ? toPlan(row) : null;
  }

  getPlanStep(id: string): PlanStep | null {
    const row = this.db
      .query("SELECT * FROM plan_steps WHERE id = ?")
      .get(id) as PlanStepRow | null;
    return row ? toPlanStep(row) : null;
  }

  /**
   * The repositories a problem is linked to — evidence links, not parentage, which is why there is no
   * relationship to report: a problem names the codebase it concerns, it does not own one.
   */
  listProblemRepositories(problemId: string): Repository[] {
    return (
      this.db
        .query(
          `SELECT r.*
           FROM problem_repositories l JOIN repositories r ON r.id = l.repository_id
           WHERE l.problem_id = ?
           ORDER BY r.full_name COLLATE NOCASE ASC`
        )
        .all(problemId) as RepositoryRow[]
    ).map(toRepository);
  }

  /**
   * The plan a view should show: the most recent one for the axis, with its steps.
   *
   * More than one plan per axis is legal (the schema forbids nothing), so "the plan" is a presentation
   * choice and this is where it is made — newest first, and the rest are still reachable through
   * `listPlans`. Steps come back in their own order when they have one and in the order they were written
   * when they do not; no positions are synthesized for an unordered checklist.
   */
  planForAxis(axisId: string): { plan: Plan; steps: PlanStep[] } | null {
    return this.snapshot(() => {
      const plans = this.listPlans(axisId);
      const plan = plans.at(-1) ?? null;
      return plan ? { plan, steps: this.listPlanSteps(plan.id) } : null;
    });
  }

  listPlanSteps(planId: string): PlanStep[] {
    return (
      this.db
        .query(
          `SELECT * FROM plan_steps WHERE plan_id = ?
            ORDER BY position IS NULL, position, created_at, id`
        )
        .all(required(planId, "planId")) as PlanStepRow[]
    ).map(toPlanStep);
  }

  /**
   * A problem is created in a state and that state is recorded, with `from_state` null: the row means "this
   * is what it was when its history began", exactly like the migration's bootstrap rows. Without it, a
   * problem's history would start at its first *change*, and "when did this open" would be unanswerable.
   */
  createProblem(input: {
    axisId: string;
    statement: string;
    authorType: Author;
    authorId?: string;
    state?: ProblemState;
    stateConfidence?: Confidence;
    planStepId?: string | null;
    repositoryIds?: string[];
    /** Registered inside this transaction, so naming a repository is still one step for the caller. */
    repositoryFullNames?: string[];
    personIds?: string[];
  }): Problem {
    return this.atomic(() => {
      const axis = this.getAxis(required(input.axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      const authorType = oneOf(input.authorType, AUTHOR_TYPES, "authorType");
      const state = optionalOneOf(input.state, PROBLEM_STATES, "state") ?? "open";
      const stateConfidence =
        optionalOneOf(input.stateConfidence, CONFIDENCES, "stateConfidence") ??
        "confirmed";
      const planStepId = input.planStepId ?? null;
      if (planStepId) {
        this.assertPlanStepBelongsToAxis(planStepId, axis.id);
      }
      const id = crypto.randomUUID();
      const at = nowIso();
      this.db
        .query(
          `INSERT INTO problems (
             id, axis_id, statement, state, state_confidence, plan_step_id,
             author_type, author_id, version, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          id,
          axis.id,
          required(input.statement, "statement"),
          state,
          stateConfidence,
          planStepId,
          authorType,
          input.authorId ?? "",
          at,
          at
        );
      this.insertStateLogEntry({
        actorId: input.authorId ?? "",
        axisId: null,
        fromState: null,
        observedAt: null,
        origin: authorType,
        problemId: id,
        toState: state,
      });
      for (const repositoryId of input.repositoryIds ?? []) {
        this.linkProblemRepository(id, repositoryId);
      }
      for (const fullName of input.repositoryFullNames ?? []) {
        this.linkProblemRepository(
          id,
          this.upsertRepository({ fullName }).repository.id
        );
      }
      for (const personId of input.personIds ?? []) {
        this.linkProblemPerson(id, personId);
      }
      this.touch("development_axes", axis.id);
      return this.getProblem(id) as Problem;
    });
  }

  /**
   * A state change is not an update: it goes through `transitionProblem`, which appends history. This
   * writer touches the statement, its confidence, the plan-step link and the links — never the state.
   */
  updateProblem(input: {
    id: string;
    statement?: string;
    stateConfidence?: Confidence;
    planStepId?: string | null;
    authorType: Author;
    authorId?: string;
    expectedVersion?: number;
    repositoryIds?: string[];
    /** Registered inside this transaction, so an agent can name a repository without a second call. */
    repositoryFullNames?: string[];
    personIds?: string[];
  }): Problem {
    return this.atomic(() => {
      const problem = this.getProblem(required(input.id, "id"));
      if (!problem) {
        throw new ResearchStoreError("Problem not found.");
      }
      const authorType = oneOf(input.authorType, AUTHOR_TYPES, "authorType");
      this.assertVersion(
        "problem",
        problem.statement,
        problem.version,
        input.expectedVersion
      );
      const sets: string[] = [];
      const values: (string | null)[] = [];
      if (input.statement !== undefined) {
        const statement = required(input.statement, "statement");
        this.assertTextIsReplaceable(
          problem.authorType,
          authorType,
          problem.statement,
          statement,
          "the statement of this problem"
        );
        if (statement !== problem.statement) {
          sets.push("statement = ?");
          values.push(statement);
          // Authorship follows the words: the text this row now holds was written by this caller, so the
          // next agent along must not be able to replace it. An unchanged echo transfers nothing — the
          // words are still the human's, and the protection has to stay with them.
          sets.push("author_type = ?", "author_id = ?");
          values.push(authorType, input.authorId ?? problem.authorId);
        }
      }
      if (input.stateConfidence !== undefined) {
        sets.push("state_confidence = ?");
        values.push(
          oneOf(input.stateConfidence, CONFIDENCES, "stateConfidence")
        );
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
        this.db
          .query(`UPDATE problems SET ${sets.join(", ")} WHERE id = ?`)
          .run(...values);
      }
      if (input.repositoryIds) {
        this.replaceProblemRepositories(problem.id, input.repositoryIds);
      }
      if (input.repositoryFullNames) {
        this.replaceProblemRepositories(
          problem.id,
          input.repositoryFullNames.map(
            (fullName) => this.upsertRepository({ fullName }).repository.id
          )
        );
      }
      if (input.personIds) {
        this.replaceProblemPeople(problem.id, input.personIds);
      }
      this.touch("development_axes", problem.axisId);
      return this.getProblem(problem.id) as Problem;
    });
  }

  /**
   * Moves a problem between `open` and `resolved`.
   *
   * A no-op is refused rather than written: the database cannot compare the requested state with the
   * current one (no CHECK can see another row), so refusing a non-change is this writer's job. Reopening is
   * not a special case — it is a transition to `open`, and because the log is append-only the earlier
   * `resolved` row survives it.
   */
  transitionProblem(input: {
    id: string;
    toState: ProblemState;
    origin: Author;
    actorId?: string;
    observedAt?: string | null;
    expectedVersion?: number;
  }): { problem: Problem; transition: StateLogEntry } {
    return this.atomic(() => {
      const problem = this.getProblem(required(input.id, "id"));
      if (!problem) {
        throw new ResearchStoreError("Problem not found.");
      }
      const toState = oneOfState(input.toState, PROBLEM_STATES, "toState");
      const origin = oneOf(input.origin, AUTHOR_TYPES, "origin");
      // Version before state: a writer that lost the race should hear "someone else wrote", not
      // "nothing to do" — otherwise a caller retries a stale request believing it was a no-op.
      this.assertVersion(
        "problem",
        problem.statement,
        problem.version,
        input.expectedVersion
      );
      if (problem.state === toState) {
        throw new ResearchStoreError(
          `no-op: the problem is already "${toState}" — nothing was written.`,
            "no-op"
        );
      }
      this.db
        .query(
          "UPDATE problems SET state = ?, version = version + 1, updated_at = ? WHERE id = ?"
        )
        .run(toState, nowIso(), problem.id);
      const transition = this.insertStateLogEntry({
        actorId: input.actorId ?? "",
        axisId: null,
        fromState: problem.state,
        observedAt: input.observedAt ?? null,
        origin,
        problemId: problem.id,
        toState,
      });
      this.touch("development_axes", problem.axisId);
      return { problem: this.getProblem(problem.id) as Problem, transition };
    });
  }

  /**
   * Moves an axis between states and records it. Same rules as a problem's transition, plus the one the
   * store already held: an axis cannot be `blocked` without saying what it is waiting on.
   *
   * There is deliberately **no table of forbidden transitions**. The contract names three reopenings and
   * enumerates no illegal edges, so every change to a different valid state is accepted — including
   * `abandoned -> active`. If a transition reads oddly, its log row is what explains it; refusing a
   * legitimate research decision because we guessed a workflow graph would be worse than a surprising row.
   */
  transitionAxis(input: {
    axisId: string;
    toState: AxisState;
    origin: Author;
    actorId?: string;
    observedAt?: string | null;
    expectedVersion?: number;
    /** Required when entering `blocked`, the rule `updateAxis` already enforces. */
    blocker?: string;
  }): { axis: Axis; transition: StateLogEntry } {
    return this.atomic(() => {
      const axis = this.getAxis(required(input.axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      const toState = oneOfState(input.toState, AXIS_STATES, "toState");
      const origin = oneOf(input.origin, AUTHOR_TYPES, "origin");
      this.assertVersion("axis", axis.title, axis.version, input.expectedVersion);
      if (axis.state === toState) {
        throw new ResearchStoreError(
          `no-op: the axis is already "${toState}" — nothing was written.`,
            "no-op"
        );
      }
      const blocker =
        input.blocker === undefined ? axis.blocker : text(input.blocker);
      this.assertBlockerPresent(toState, blocker);
      this.db
        .query(
          "UPDATE development_axes SET state = ?, blocker = ?, version = version + 1, updated_at = ? WHERE id = ?"
        )
        .run(toState, blocker, nowIso(), axis.id);
      const transition = this.insertStateLogEntry({
        actorId: input.actorId ?? "",
        axisId: axis.id,
        fromState: axis.state,
        observedAt: input.observedAt ?? null,
        origin,
        problemId: null,
        toState,
      });
      return { axis: this.getAxis(axis.id) as Axis, transition };
    });
  }

  createPlan(input: {
    axisId: string;
    summary: string;
    authorType: Author;
    authorId?: string;
  }): Plan {
    return this.atomic(() => {
      const axis = this.getAxis(required(input.axisId, "axisId"));
      if (!axis) {
        throw new ResearchStoreError("Axis not found.");
      }
      const id = crypto.randomUUID();
      const at = nowIso();
      this.db
        .query(
          `INSERT INTO plans (id, axis_id, summary, author_type, author_id, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          id,
          axis.id,
          required(input.summary, "summary"),
          oneOf(input.authorType, AUTHOR_TYPES, "authorType"),
          input.authorId ?? "",
          at,
          at
        );
      this.touch("development_axes", axis.id);
      return this.getPlan(id) as Plan;
    });
  }

  updatePlan(input: {
    id: string;
    summary?: string;
    authorType: Author;
    authorId?: string;
    expectedVersion?: number;
  }): Plan {
    return this.atomic(() => {
      const plan = this.getPlan(required(input.id, "id"));
      if (!plan) {
        throw new ResearchStoreError("Plan not found.");
      }
      const authorType = oneOf(input.authorType, AUTHOR_TYPES, "authorType");
      this.assertVersion("plan", plan.summary, plan.version, input.expectedVersion);
      if (input.summary !== undefined) {
        const summary = required(input.summary, "summary");
        this.assertTextIsReplaceable(
          plan.authorType,
          authorType,
          plan.summary,
          summary,
          "this plan's summary"
        );
        // As on a problem's statement: an unchanged echo keeps the plan's authorship where it is, so an
        // agent cannot launder a human's summary into its own by repeating it back.
        if (summary !== plan.summary) {
          this.db
            .query(
              "UPDATE plans SET summary = ?, author_type = ?, author_id = ?, version = version + 1, updated_at = ? WHERE id = ?"
            )
            .run(
              summary,
              authorType,
              input.authorId ?? plan.authorId,
              nowIso(),
              plan.id
            );
        }
      }
      return this.getPlan(plan.id) as Plan;
    });
  }

  createPlanStep(input: {
    planId: string;
    title: string;
    position?: number | null;
    state?: PlanStepState;
  }): PlanStep {
    return this.atomic(() => {
      const plan = this.getPlan(required(input.planId, "planId"));
      if (!plan) {
        throw new ResearchStoreError("Plan not found.");
      }
      const id = crypto.randomUUID();
      const at = nowIso();
      this.db
        .query(
          `INSERT INTO plan_steps (id, plan_id, title, position, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          plan.id,
          required(input.title, "title"),
          optionalPosition(input.position),
          optionalOneOf(input.state, PLAN_STEP_STATES, "state") ?? "pending",
          at,
          at
        );
      return this.listPlanSteps(plan.id).find((step) => step.id === id) as PlanStep;
    });
  }

  /**
   * A step's state, position and title are all editable here. Note the gap: `plan_steps` carries no
   * authorship columns, so the protection that keeps an agent from rewriting a human's words cannot be
   * enforced for a step title — there is nothing on the row to compare against. Stated rather than
   * pretended; giving steps authorship is a schema change with its own review.
   */
  updatePlanStep(input: {
    id: string;
    title?: string;
    position?: number | null;
    state?: PlanStepState;
  }): PlanStep {
    return this.atomic(() => {
      const existing = this.db
        .query("SELECT * FROM plan_steps WHERE id = ?")
        .get(required(input.id, "id")) as PlanStepRow | null;
      if (!existing) {
        throw new ResearchStoreError("Plan step not found.");
      }
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
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
        this.db
          .query(`UPDATE plan_steps SET ${sets.join(", ")} WHERE id = ?`)
          .run(...values);
      }
      const row = this.db
        .query("SELECT * FROM plan_steps WHERE id = ?")
        .get(existing.id) as PlanStepRow;
      return toPlanStep(row);
    });
  }

  linkProblemRepository(problemId: string, repositoryId: string): void {
    this.atomic(() => {
      if (!this.getProblem(problemId)) {
        throw new ResearchStoreError("Problem not found.");
      }
      if (!this.repositoryExists(repositoryId)) {
        throw new ResearchStoreError("Repository not found.");
      }
      this.db
        .query(
          "INSERT OR IGNORE INTO problem_repositories (problem_id, repository_id) VALUES (?, ?)"
        )
        .run(problemId, repositoryId);
    });
  }

  linkProblemPerson(problemId: string, personId: string): void {
    this.atomic(() => {
      if (!this.getProblem(problemId)) {
        throw new ResearchStoreError("Problem not found.");
      }
      if (!this.getPerson(personId)) {
        throw new ResearchStoreError("Person not found.");
      }
      this.db
        .query(
          "INSERT OR IGNORE INTO problem_people (problem_id, person_id) VALUES (?, ?)"
        )
        .run(problemId, personId);
    });
  }

  // ----------------------------------------------------- the v2 projections

  /**
   * The Overview's projection: every visible topic and every repository, each with the ONE timestamp that
   * decides both its place in the order and whether it has gone quiet.
   *
   * `recencyAt` is the newest thing we know about the object — its last recorded activity, or when it
   * appeared if nothing has ever happened. `stale` is derived from that same value, so sorting and marking
   * cannot disagree.
   */
  overviewRecency(options?: {
    activitySinceDays?: number;
    includeArchived?: boolean;
    limit?: number;
  }): OverviewRecency {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false,
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const axisTopic = new Map<string, string>();
      for (const row of this.db
        .query("SELECT id, topic_id FROM development_axes")
        .all() as Array<{ id: string; topic_id: string }>) {
        axisTopic.set(row.id, row.topic_id);
      }
      const topicTimes = new Map<string, string[]>();
      const repositoryTimes = new Map<string, string[]>();
      const remember = (
        map: Map<string, string[]>,
        key: string | null,
        at: string
      ): void => {
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
      for (const event of this.db
        .query(
          "SELECT topic_id, axis_id, repository_id, occurred_at FROM activities"
        )
        .all() as Array<{
        topic_id: string | null;
        axis_id: string | null;
        repository_id: string | null;
        occurred_at: string;
      }>) {
        // An event recorded on an axis still dates its topic: the axis is why it belongs to one.
        remember(
          topicTimes,
          event.topic_id ??
            (event.axis_id ? (axisTopic.get(event.axis_id) ?? null) : null),
          event.occurred_at
        );
        remember(repositoryTimes, event.repository_id, event.occurred_at);
      }

      const axisRows = this.db
        .query("SELECT id, topic_id, state FROM development_axes")
        .all() as Array<{ id: string; topic_id: string; state: string }>;

      // Live axes per repository, read once: a repository's "live work" is the axes that name it.
      const liveAxesPerRepository = new Map<string, number>();
      for (const row of this.db
        .query(
          `SELECT l.repository_id AS repository_id, a.state AS state
             FROM axis_repositories l
             JOIN development_axes a ON a.id = l.axis_id`
        )
        .all() as Array<{ repository_id: string; state: string }>) {
        if (row.state === "active") {
          liveAxesPerRepository.set(
            row.repository_id,
            (liveAxesPerRepository.get(row.repository_id) ?? 0) + 1
          );
        }
      }

      const card = (
        id: string,
        name: string,
        kind: "topic" | "repository",
        createdAt: string | null,
        times: string[],
        liveAxisCount: number
      ): RecencyCard => {
        const recencyAt = newestOf([...times, createdAt]);
        return {
          activityInWindow: times.filter((at) => scope.inWindow(at)).length,
          id,
          kind,
          lastActivityAt: newestOf(times),
          liveAxisCount,
          name,
          recencyAt,
          stale: isStale(recencyAt, scope.nowMs),
        };
      };

      const topics = (
        this.db.query("SELECT * FROM topics").all() as Array<
          TopicRow & { created_at?: string }
        >
      )
        .filter((row) => scope.visible(row.id))
        .map((row) =>
          card(
            row.id,
            row.name,
            "topic",
            row.created_at ?? null,
            topicTimes.get(row.id) ?? [],
            axisRows.filter(
              (axis) => axis.topic_id === row.id && axis.state === "active"
            ).length
          )
        );

      const repositories = (
        this.db.query("SELECT * FROM repositories").all() as Array<{
          id: string;
          full_name: string;
          created_at?: string;
        }>
      ).map((row) =>
        card(
          row.id,
          row.full_name,
          "repository",
          row.created_at ?? null,
          repositoryTimes.get(row.id) ?? [],
          liveAxesPerRepository.get(row.id) ?? 0
        )
      );

      return {
        activitySinceDays: scope.activitySinceDays,
        repositories: byRecencyDesc(repositories).slice(0, limit),
        staleAfterDays: STALE_AFTER_DAYS,
        topics: byRecencyDesc(topics).slice(0, limit),
      };
    });
  }

  /**
   * The Progress view's axis side: each visible axis with its problems, its optional plan, its recorded
   * state history and the same recency verdict the Overview uses.
   *
   * `state` and `stale` are independent facts here on purpose. An axis can be `usable` and stale at once —
   * it works, its gaps are known, and nobody has touched it for a while — and a projection that collapsed
   * the two into one status would lose whichever fact came second.
   */
  progressAxes(options?: {
    activitySinceDays?: number;
    includeArchived?: boolean;
    limit?: number;
  }): ProgressAxes {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false,
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const problems = this.db
        .query("SELECT * FROM problems")
        .all() as ProblemRow[];
      const plans = this.db.query("SELECT * FROM plans").all() as PlanRow[];
      const steps = this.db.query("SELECT * FROM plan_steps").all() as PlanStepRow[];
      const axisTimes = new Map<string, string[]>();
      for (const row of this.db
        .query(
          "SELECT axis_id, occurred_at FROM activities WHERE axis_id IS NOT NULL"
        )
        .all() as Array<{ axis_id: string; occurred_at: string }>) {
        const list = axisTimes.get(row.axis_id);
        if (list) {
          list.push(row.occurred_at);
        } else {
          axisTimes.set(row.axis_id, [row.occurred_at]);
        }
      }

      const rows: ProgressAxisRow[] = [...scope.scans.values()].map((scan) => {
        const mine = problems.filter((row) => row.axis_id === scan.id);
        const plan = plans.filter((row) => row.axis_id === scan.id).at(-1) ?? null;
        const planSteps = plan
          ? steps
              .filter((row) => row.plan_id === plan.id)
              .map(toPlanStep)
              .sort(
                (left, right) =>
                  (left.position ?? Number.MAX_SAFE_INTEGER) -
                    (right.position ?? Number.MAX_SAFE_INTEGER) ||
                  left.createdAt.localeCompare(right.createdAt)
              )
          : [];
        const times = axisTimes.get(scan.id) ?? [];
        // `updated_at`, not a creation time: `AxisScan` carries what the record knows about an axis's
        // history of attention, and an axis nobody has touched since it appeared has an old `updated_at`.
        const recencyAt = newestOf([...times, scan.updatedAt]);
        return {
          activityInWindow: times.filter((at) => scope.inWindow(at)).length,
          blocker: scan.blocker,
          blockerConfidence: scan.blockerConfidence,
          id: scan.id,
          lastActivityAt: newestOf(times),
          openProblems: mine.filter((row) => row.state === "open").length,
          plan: plan
            ? {
                id: plan.id,
                steps: planSteps,
                stepsDone: planSteps.filter((step) => step.state === "done")
                  .length,
                summary: plan.summary,
              }
            : null,
          problems: mine.length,
          recencyAt,
          stale: isStale(recencyAt, scope.nowMs),
          state: scan.state,
          stateConfidence: scan.stateConfidence,
          stateHistory: this.axisStateHistory(scan.id),
          title: scan.title,
          topicId: scan.topicId,
          topicName: scope.topicRefs.get(scan.topicId)?.name ?? "",
        };
      });

      return {
        activitySinceDays: scope.activitySinceDays,
        axes: byRecencyDesc(rows.filter((row) => row.problems > 0 || true)).slice(
          0,
          limit
        ),
        staleAfterDays: STALE_AFTER_DAYS,
      };
    });
  }

  /**
   * The Progress view's problem side: the same axes read from the problem outwards — its parent axis and
   * topic, the repositories and people it touches, the plan step it blocks, its evidence and its
   * resolution/reopen history.
   */
  progressProblems(options?: {
    activitySinceDays?: number;
    includeArchived?: boolean;
    limit?: number;
  }): ProgressProblems {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false,
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const stepRows = new Map<string, PlanStepRow>();
      for (const row of this.db
        .query("SELECT * FROM plan_steps")
        .all() as PlanStepRow[]) {
        stepRows.set(row.id, row);
      }
      const problemTimes = new Map<string, string[]>();
      for (const row of this.db
        .query(
          "SELECT problem_id, occurred_at FROM activities WHERE problem_id IS NOT NULL"
        )
        .all() as Array<{ problem_id: string; occurred_at: string }>) {
        const list = problemTimes.get(row.problem_id);
        if (list) {
          list.push(row.occurred_at);
        } else {
          problemTimes.set(row.problem_id, [row.occurred_at]);
        }
      }
      const repositoriesOf = new Map<string, Array<{ fullName: string; id: string }>>();
      for (const row of this.db
        .query(
          `SELECT l.problem_id AS problem_id, r.id AS id, r.full_name AS full_name
             FROM problem_repositories l
             JOIN repositories r ON r.id = l.repository_id`
        )
        .all() as Array<{ problem_id: string; id: string; full_name: string }>) {
        const list = repositoriesOf.get(row.problem_id) ?? [];
        list.push({ fullName: row.full_name, id: row.id });
        repositoriesOf.set(row.problem_id, list);
      }
      const peopleOf = new Map<string, Array<{ displayName: string; id: string }>>();
      for (const row of this.db
        .query(
          `SELECT l.problem_id AS problem_id, p.id AS id, p.display_name AS display_name
             FROM problem_people l
             JOIN people p ON p.id = l.person_id`
        )
        .all() as Array<{ problem_id: string; id: string; display_name: string }>) {
        const list = peopleOf.get(row.problem_id) ?? [];
        list.push({ displayName: row.display_name, id: row.id });
        peopleOf.set(row.problem_id, list);
      }

      const rows: ProgressProblemRow[] = (
        this.db.query("SELECT * FROM problems").all() as ProblemRow[]
      )
        .map((row) => ({ problem: toProblem(row), row }))
        .filter(({ row }) => {
          const axis = scope.scans.get(row.axis_id);
          return Boolean(axis) && scope.visible(axis?.topicId ?? "");
        })
        .map(({ problem }) => {
          const scan = scope.scans.get(problem.axisId);
          const times = problemTimes.get(problem.id) ?? [];
          const recencyAt = newestOf([...times, problem.createdAt]);
          const stepRow = problem.planStepId
            ? stepRows.get(problem.planStepId)
            : null;
          return {
            activityCount: times.length,
            authorId: problem.authorId,
            authorType: problem.authorType,
            axisId: problem.axisId,
            axisTitle: scan?.title ?? "",
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
            topicId: scan?.topicId ?? "",
            topicName: scope.topicRefs.get(scan?.topicId ?? "")?.name ?? "",
          };
        });

      return {
        activitySinceDays: scope.activitySinceDays,
        problems: byRecencyDesc(rows).slice(0, limit),
        staleAfterDays: STALE_AFTER_DAYS,
      };
    });
  }

  /**
   * The Progress view's activity side: the window's events grouped by axis, in the index's own order.
   *
   * The grouping is the server's, not the page's. A client filtering a flat row list by the selected axis
   * would be deciding what is in scope — the projection's job, and the same mistake as filtering an axis
   * list in JSX. Each axis's rows are newest first and capped like the timeline's, with `eventCount` the
   * true total; the count comes from the same predicate as the index row's `activityInWindow`.
   */
  progressActivity(options?: {
    activitySinceDays?: number;
    includeArchived?: boolean;
    limit?: number;
  }): ProgressActivity {
    return this.snapshot(() => {
      const scope = this.visibleContext({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false,
      });
      const limit = clampLimit(options?.limit, MAX_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT);
      const personByAccount = this.personRefByAccount();
      const rows = this.db
        .query(
          `SELECT * FROM activities
           WHERE axis_id IS NOT NULL
           ORDER BY occurred_at DESC, rowid DESC`
        )
        .all() as ActivityRow[];

      const byAxis = new Map<string, ProgressActivityAxis>();
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
            person: personByAccount.get(event.actorId) ?? null,
          });
        }
        byAxis.set(axisId, bucket);
      }

      // The index's own order, not a second one — and any axis whose events the index's capped list left
      // out keeps them, newest first, rather than being dropped for not being selectable.
      const listed = this.progressAxes({
        activitySinceDays: options?.activitySinceDays,
        includeArchived: options?.includeArchived ?? false,
        limit,
      }).axes.map((row) => row.id);
      const byIndexOrder = listed
        .map((id) => byAxis.get(id))
        .filter((bucket): bucket is ProgressActivityAxis => Boolean(bucket));
      const unlisted = [...byAxis.values()]
        .filter((bucket) => !listed.includes(bucket.axisId))
        .sort((left, right) =>
          (right.events[0]?.occurredAt ?? "").localeCompare(
            left.events[0]?.occurredAt ?? ""
          )
        );

      return {
        activitySinceDays: scope.activitySinceDays,
        byAxis: [...byIndexOrder, ...unlisted],
        staleAfterDays: STALE_AFTER_DAYS,
      };
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
      const touchedPlans: PlanWithSteps[] = [];
      const touchedProblems: Problem[] = [];
      const recordedTransitions: StateLogEntry[] = [];
      const assertedByAxis = new Map<string, ReadonlySet<ClaimField>>();
      const activities: string[] = [];
      const annotations: string[] = [];

      // Topic-level links first: the topic-level people/repositories are what the axes below refine.
      for (const person of input.people ?? []) {
        const result = this.resolvePersonForLink(person);
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
          const result = this.resolvePersonForLink(person);
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
          // Naming a problem is evidence for it: the axis and topic follow from the problem's own links.
          problemId: activityInput.problemId ?? null,
        });
        activities.push(activity.id);
      }

      for (const annotationInput of input.annotations ?? []) {
        const axisId = this.resolveAxisId(
          topic.id,
          annotationInput.axisId,
          annotationInput.axisTitle
        );
        const kind =
          optionalOneOf(annotationInput.kind, ANNOTATION_KINDS, "kind") ?? "note";
        const annotation = this.insertAnnotation({
          authorId: actor.id,
          authorType:
            annotationInput.authorType ??
            (actor.type === "agent" ? "agent" : "human"),
          axisId,
          // A note carries no confidence — it is context, not a claim. A claim carries one, including an
          // explicit null when the caller is asserting something they cannot grade.
          confidence:
            kind === "note"
              ? null
              : (optionalOneOf(
                  annotationInput.confidence,
                  CONFIDENCES,
                  "confidence"
                ) ?? null),
          kind,
          problemId: annotationInput.problemId ?? null,
          text: required(annotationInput.text, "text"),
          // A note keeps the historical topic+axis shape the corpus uses. A claim must name exactly one
          // target, so the topic must not be attached on its behalf — that would manufacture the second
          // target the schema refuses.
          topicId: kind === "note" ? topic.id : null,
        });
        annotations.push(annotation.id);
      }

      // The author type of everything this call writes: a tool call is the machine, anything else is the
      // person using the page. Never taken from input, so a caller cannot claim the other's authorship.
      const authorType: Author = actor.type === "agent" ? "agent" : "human";

      // Plans before problems: a problem may name the plan step it blocks, and that step has to exist first.
      for (const planInput of input.plans ?? []) {
        const axisId = this.resolveAxisId(
          topic.id,
          planInput.axisId,
          planInput.axisTitle
        );
        if (!axisId) {
          throw new ResearchStoreError(
            "plans[] need an axisId or axisTitle: a plan belongs to an axis."
          );
        }
        const plan = planInput.planId
          ? this.updatePlan({
              authorId: actor.id,
              authorType,
              id: planInput.planId,
              summary: required(planInput.summary, "summary"),
            })
          : this.createPlan({
              authorId: actor.id,
              authorType,
              axisId,
              summary: required(planInput.summary, "summary"),
            });
        for (const step of planInput.steps ?? []) {
          if (step.stepId) {
            this.updatePlanStep({
              id: step.stepId,
              position: step.position,
              state: optionalOneOf(step.state, PLAN_STEP_STATES, "state"),
              title: required(step.title, "title"),
            });
          } else {
            this.createPlanStep({
              planId: plan.id,
              position: step.position,
              state: optionalOneOf(step.state, PLAN_STEP_STATES, "state"),
              title: required(step.title, "title"),
            });
          }
        }
        touchedPlans.push({
          ...plan,
          steps: this.listPlanSteps(plan.id),
        });
      }

      for (const problemInput of input.problems ?? []) {
        const statement = required(problemInput.statement, "statement");
        if (problemInput.problemId) {
          if (problemInput.state !== undefined) {
            // Not an oversight: a state change goes through `transitions` so that it is recorded. Accepting
            // it here would let a caller overwrite the state with no history row, which is the one thing the
            // state log exists to prevent.
            throw new ResearchStoreError(
              "problems[].state applies when creating. To change an existing problem's state, send it in `transitions` so the change is recorded."
            );
          }
          touchedProblems.push(
            this.updateProblem({
              authorId: actor.id,
              authorType,
              id: problemInput.problemId,
              personIds: problemInput.personIds,
              planStepId: problemInput.planStepId,
              repositoryFullNames: problemInput.repositoryFullNames,
              statement,
              stateConfidence: optionalOneOf(
                problemInput.stateConfidence,
                CONFIDENCES,
                "stateConfidence"
              ),
            })
          );
          continue;
        }
        const axisId = this.resolveAxisId(
          topic.id,
          problemInput.axisId,
          problemInput.axisTitle
        );
        if (!axisId) {
          throw new ResearchStoreError(
            "problems[] need an axisId or axisTitle: a problem is raised against an axis."
          );
        }
        touchedProblems.push(
          this.createProblem({
            authorId: actor.id,
            authorType,
            axisId,
            personIds: problemInput.personIds,
            planStepId: problemInput.planStepId ?? null,
            repositoryFullNames: problemInput.repositoryFullNames,
            state: optionalOneOf(problemInput.state, PROBLEM_STATES, "state"),
            stateConfidence: optionalOneOf(
              problemInput.stateConfidence,
              CONFIDENCES,
              "stateConfidence"
            ),
            statement,
          })
        );
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
            // The state is validated by the writer against the problem vocabulary, not here: one authority
            // on what a valid problem state is, and it is the writer.
            toState: transitionInput.toState as ProblemState,
          });
          recordedTransitions.push(result.transition);
          touchedProblems.push(result.problem);
          continue;
        }
        const axisId = this.resolveAxisId(
          topic.id,
          transitionInput.axisId,
          transitionInput.axisTitle
        );
        if (!axisId) {
          throw new ResearchStoreError(
            "transitions[] with subject 'axis' need an axisId or axisTitle."
          );
        }
        const result = this.transitionAxis({
          actorId: actor.id,
          axisId,
          blocker: text(transitionInput.blocker),
          expectedVersion: transitionInput.expectedVersion,
          observedAt,
          origin: authorType,
          toState: transitionInput.toState as AxisState,
        });
        recordedTransitions.push(result.transition);
        touchedAxes.push(result.axis);
      }

      // Only now can "this claim is confirmed" be judged: the evidence may have arrived in this very
      // call (an activity or annotation above). Runs inside the transaction, so a claim with nothing
      // behind it rolls the whole update back instead of laundering a guess into a fact.
      for (const axis of touchedAxes) {
        this.assertClaimsAreBacked(
          axis,
          assertedByAxis.get(axis.id) ?? NO_CLAIMS
        );
      }

      return {
        axes: touchedAxes.map((axis) => this.getAxis(axis.id) ?? axis),
        created,
        plans: touchedPlans,
        problems: touchedProblems,
        recorded: { activities, annotations },
        topic: this.getTopic(topic.id) as Topic,
        transitions: recordedTransitions,
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
    // The read model reports null for a confidence whose claim is absent, but the columns are NOT NULL:
    // the write path reads them straight so that a patch which says nothing about a confidence leaves
    // the stored value exactly as it was.
    const stored = this.db
      .query(
        "SELECT current_state_confidence, blocker_confidence FROM development_axes WHERE id = ?"
      )
      .get(id) as {
      blocker_confidence: string;
      current_state_confidence: string;
    } | null;
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
        next.currentStateConfidence ??
          stored?.current_state_confidence ??
          "confirmed",
        next.blockerConfidence ?? stored?.blocker_confidence ?? "confirmed",
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

  /**
   * The person a reconcile's `people` entry should link.
   *
   * Identity columns are matched first, exactly as `registerPerson` does. A bare `displayName` — the
   * form a librarian uses when the group named someone in conversation — falls back to an
   * **unambiguous** exact-name match, so reconciling the same topic twice attaches to one person
   * instead of minting a new row per call. That is a real defect otherwise: the overview lists the
   * people tagged to a topic, and the duplicates show up there.
   *
   * Deliberately narrower than the primitive: `registerPerson` still treats a name as a non-identity
   * (two people may share one). Here an ambiguous name is refused rather than guessed at or
   * multiplied — the caller disambiguates with `githubLogin` or `nakamaUserId`.
   */
  private resolvePersonForLink(input: {
    displayName: string;
    githubLogin?: string;
    nakamaUserId?: string;
    notes?: string;
  }): { created: boolean; person: Person } {
    const displayName = required(input.displayName, "person.displayName");
    const hasIdentity = Boolean(
      input.nakamaUserId?.trim() || input.githubLogin?.trim()
    );
    if (!hasIdentity) {
      const matches = this.db
        .query("SELECT * FROM people WHERE display_name = ? COLLATE NOCASE")
        .all(displayName) as PersonRow[];
      if (matches.length === 1) {
        return { created: false, person: toPerson(matches[0]) };
      }
      if (matches.length > 1) {
        throw new ResearchStoreError(
          `${matches.length} people are named "${displayName}" — link the right one with a githubLogin or nakamaUserId.`
        );
      }
    }
    return this.upsertPerson(input);
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

  /**
   * The one place a transition row is written, so every writer produces the same shape: `from_state` is
   * the state actually being replaced, `recorded_at` is always now, and `observed_at` stays null when
   * nobody knows when the change was observed — a different fact from when the ledger heard about it.
   */
  private insertStateLogEntry(input: {
    axisId: string | null;
    problemId: string | null;
    fromState: string | null;
    toState: string;
    origin: Author;
    actorId: string;
    observedAt: string | null;
  }): StateLogEntry {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO state_log (
           id, axis_id, problem_id, from_state, to_state, origin, actor_id, observed_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.axisId,
        input.problemId,
        input.fromState,
        input.toState,
        input.origin,
        input.actorId,
        input.observedAt,
        nowIso()
      );
    return toStateLogEntry(
      this.db.query("SELECT * FROM state_log WHERE id = ?").get(id) as StateLogRow
    );
  }

  /**
   * Oldest first. `rowid` breaks ties inside one millisecond, so two transitions recorded in the same tick
   * still read back in the order they were written rather than in an order SQLite happened to pick.
   */
  private stateHistory(
    column: "axis_id" | "problem_id",
    id: string
  ): StateLogEntry[] {
    return (
      this.db
        .query(
          `SELECT * FROM state_log WHERE ${column} = ? ORDER BY recorded_at, rowid`
        )
        .all(id) as StateLogRow[]
    ).map(toStateLogEntry);
  }

  /**
   * A human's words are not an agent's to replace. `existing` is the authorship of the text **currently
   * stored**, not of whoever created the row: a human rewrite makes the text human-authored, so the
   * protection follows the words rather than the row's origin.
   *
   * Restating is not rewriting. An unchanged echo says "keep these words" while the caller changes the
   * links, the confidence or the plan step — which is ordinary work, and is the *only* way to update a
   * problem through the action surface, where the statement is required. Refusing the echo would make a
   * human-authored problem impossible for an agent to update at all, which protects nothing.
   */
  private assertTextIsReplaceable(
    existing: Author,
    incoming: Author,
    current: string,
    next: string,
    what: string
  ): void {
    if (next === current) {
      return;
    }
    if (existing === "human" && incoming === "agent") {
      throw new ResearchStoreError(
        `human-authored: ${what} was written by a human — an agent cannot rewrite it. Change the state, the links or a plan step instead, or have the human edit the text.`,
        "human-authored"
      );
    }
  }

  /** A problem may only point at a step of a plan on its own axis; anything else is a cross-axis claim. */
  private assertPlanStepBelongsToAxis(planStepId: string, axisId: string): void {
    const row = this.db
      .query(
        `SELECT p.axis_id AS axis_id
           FROM plan_steps s
           JOIN plans p ON p.id = s.plan_id
          WHERE s.id = ?`
      )
      .get(planStepId) as { axis_id: string } | null;
    if (!row) {
      throw new ResearchStoreError("Plan step not found.");
    }
    if (row.axis_id !== axisId) {
      throw new ResearchStoreError(
        "That plan step belongs to a plan on another axis."
      );
    }
  }

  private replaceProblemRepositories(
    problemId: string,
    repositoryIds: string[]
  ): void {
    this.db
      .query("DELETE FROM problem_repositories WHERE problem_id = ?")
      .run(problemId);
    for (const repositoryId of repositoryIds) {
      this.linkProblemRepository(problemId, repositoryId);
    }
  }

  private replaceProblemPeople(problemId: string, personIds: string[]): void {
    this.db.query("DELETE FROM problem_people WHERE problem_id = ?").run(problemId);
    for (const personId of personIds) {
      this.linkProblemPerson(problemId, personId);
    }
  }

  private insertActivity(input: {
    id?: string;
    topicId: string | null;
    axisId: string | null;
    problemId: string | null;
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
    // "Naming a problem is enough: the axis and topic are implied." Resolved **here**, on the one path every
    // activity row goes through, rather than left to callers. An event stored with a problem but no axis is
    // invisible to that axis's Activity column and missing from its `activityInWindow` count — the two read
    // models agree precisely because they read the same column, so a dropped `axis_id` shows up as work that
    // silently happened nowhere. Called before the problems exist in a *single* call (the write order is
    // activities → problems), which is why the fixture references a problem in a second pass; when the row is
    // there, the link is completed.
    let topicId = input.topicId;
    let axisId = input.axisId;
    if (input.problemId && (axisId === null || topicId === null)) {
      const problem = this.db
        .query("SELECT axis_id FROM problems WHERE id = ?")
        .get(input.problemId) as { axis_id: string } | null;
      if (problem) {
        const axis = this.db
          .query("SELECT topic_id FROM development_axes WHERE id = ?")
          .get(problem.axis_id) as { topic_id: string } | null;
        axisId = axisId ?? problem.axis_id;
        topicId = topicId ?? axis?.topic_id ?? null;
      }
    }
    const recordedAt = nowIso();
    this.db
      .query(
        `INSERT INTO activities (
           id, topic_id, axis_id, problem_id, repository_id, summary, source_type, source_ref,
           source_url, actor_type, actor_id, occurred_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        topicId,
        axisId,
        input.problemId,
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
    this.touch("topics", topicId);
    this.touch("development_axes", axisId);
    return toActivity(
      this.db
        .query("SELECT * FROM activities WHERE id = ?")
        .get(id) as ActivityRow
    );
  }

  private insertAnnotation(input: {
    topicId: string | null;
    axisId: string | null;
    problemId: string | null;
    text: string;
    kind: AnnotationKind;
    confidence: Confidence | null;
    authorType: "human" | "agent";
    authorId: string;
  }): Annotation {
    // The one place a claim's target rule is enforced on **every** path. `addAnnotation` checks it too, but
    // the reconcile loop calls this directly — so before this check existed here, a two-target (or
    // targetless) claim reached the INSERT and died on the schema's CHECK constraint: a raw SQLiteError that
    // escaped the action boundary as "an unexpected server error" with no `kind`, instead of the
    // `invalid-input` a caller can act on. The database constraint stays as the backstop for anything
    // writing SQL directly; this is what turns the violation into a refusal. Found while seeding Fixture E.
    const targets = [input.topicId, input.axisId, input.problemId].filter(
      (value) => value !== null
    ).length;
    if (input.kind !== "note" && targets !== 1) {
      throw new ResearchStoreError(
        `A ${input.kind} claim must sit on exactly one of a topic, an axis or a problem — it names ${targets}.`,
        "invalid-input"
      );
    }
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO annotations (
           id, topic_id, axis_id, problem_id, text, kind, confidence, author_type, author_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.topicId,
        input.axisId,
        input.problemId,
        input.text,
        input.kind,
        input.confidence,
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
    entity: "topic" | "axis" | "problem" | "plan",
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
  private assertClaimsAreBacked(
    axis: Axis,
    asserted: ReadonlySet<ClaimField>
  ): void {
    const claims: Array<[ClaimField, Confidence | null, boolean]> = [
      ["state", axis.stateConfidence, asserted.has("state")],
      [
        "current_state",
        axis.currentStateConfidence,
        axis.currentState.trim().length > 0,
      ],
      ["blocker", axis.blockerConfidence, axis.blocker.trim().length > 0],
    ];
    const unbacked = claims
      .filter(
        ([, confidence, isClaim]) => isClaim && confidence === "confirmed"
      )
      .map(([field]) => field);
    if (unbacked.length === 0) {
      return;
    }
    // The same list the detail view renders, from `axisEvidence` — one definition of "has evidence",
    // so what the page shows and what this rule enforces can never disagree.
    if (this.axisEvidence(axis).length === 0) {
      throw new ResearchStoreError(
        `Axis "${axis.title}" claims 'confirmed' for ${unbacked.join(
          ", "
        )} but carries no evidence — add a branch, a PR or an activity, or mark it 'inferred'.`
      );
    }
  }
}
