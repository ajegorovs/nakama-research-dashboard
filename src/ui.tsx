/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * Plugin page — the research dashboard.
 *
 * Five peer tabs: **Overview, Topics, People, Repositories, Progress**. Overview is the default
 * landing and the only tab whose data is scoped by a window (7d / 14d / 30d / all time, offered by its
 * own heading); the other four read **all time**, so a reader never has to wonder whether a piece of
 * work is missing because it fell outside a window. Overview's window re-issues `get_overview` with a
 * different `activitySinceDays`, which the store treats as a parameter rather than stored state.
 *
 * Each non-Overview tab's read is `get_overview` + `get_progress` at `activitySinceDays: 0`; the two
 * are issued together so the Progress index and the timeline it rides are scoped the same. Everything
 * else on the page is presentation.
 *
 * No personal identifiers live here: names shown are the display names the group itself entered into
 * the dashboard.
 *
 * React, the shared UI controls and the stylesheet are supplied by the dashboard — this module must
 * not bundle React, React DOM or @nakama/ui.
 */
import type * as UI from "@nakama/ui";
import type * as ReactType from "react";

type AxisState =
  | "active"
  | "draft"
  | "blocked"
  | "parked"
  | "usable"
  | "completed"
  | "abandoned";

/** A problem's own vocabulary: distinct from an axis's, and deliberately not merged with it. */
type ProblemState = "open" | "resolved";

/**
 * A plan step's vocabulary. Its own again: `blocked` means something different on a step than on an axis
 * (work waiting, not an axis waiting on the world), so the three lists stay three lists.
 */
type PlanStepState = "pending" | "active" | "done" | "blocked";

type Topic = {
  id: string;
  name: string;
  description: string;
  status: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  /** Read to write: sent back on the next update so a concurrent change is caught. */
  version: number;
};

type LinkedRepository = {
  id: string;
  fullName: string;
  url: string;
  description: string;
  defaultBranch: string;
  relationship: string;
};

type LinkedPerson = {
  id: string;
  displayName: string;
  githubLogin: string | null;
  notes: string;
  role: string;
};

type Confidence = "confirmed" | "inferred" | "uncertain";

type Axis = {
  id: string;
  topicId: string;
  title: string;
  description: string;
  kind: string;
  state: AxisState;
  branch: string;
  prNumber: number | null;
  prUrl: string;
  currentState: string;
  blocker: string;
  /** Per-claim provenance: "the state is confirmed" and "this note is inferred" are different claims. */
  stateConfidence: Confidence;
  /** Null where the claim itself is absent — nothing to be confident about, so nothing to show. */
  currentStateConfidence: Confidence | null;
  blockerConfidence: Confidence | null;
  updatedAt: string;
  lastReviewedAt: string | null;
  /** Read to write: sent back with a correction so a concurrent change is caught, not overwritten. */
  version: number;
};

type AxisOverview = Axis & { repositories: LinkedRepository[] };

/** One piece of evidence on an axis — the same set the store's write rule accepts. */
type AxisEvidence = {
  kind: "branch" | "pull_request" | "activity" | "annotation";
  label: string;
  sourceType: string | null;
  sourceRef: string;
  sourceUrl: string;
  by: string;
  at: string;
};

/** One axis in the detail view: full metadata, its own history, its own notes, its evidence. */
type AxisDetail = Axis & {
  people: LinkedPerson[];
  repositories: LinkedRepository[];
  evidence: AxisEvidence[];
  history: Activity[];
  notes: Annotation[];
  /** The workstream's own plan (`{plan, steps}`), or null — a plan is optional by contract. */
  plan?: StoredPlan | null;
  /** The workstream's problems, each carrying its own (never inherited) plan and its links. */
  problems?: WorkstreamTask[];
};

/** One topic in depth — everything the detail view needs, from one `get_topic` call. */
type TopicDetail = {
  generatedAt: string;
  topic: Topic;
  /** The project plan (owned by the topic), or null; optional on the mirror until the view reads it. */
  plan?: ProgressPlan | null;
  people: LinkedPerson[];
  repositories: LinkedRepository[];
  axes: AxisDetail[];
  axisCounts: Record<AxisState, number>;
  activity: Activity[];
  notes: Annotation[];
  counts: {
    axes: number;
    activities: number;
    notes: number;
    axesWithoutEvidence: number;
  };
};

type Annotation = {
  id: string;
  axisId: string | null;
  text: string;
  authorType: string;
  authorId: string;
  createdAt: string;
};

/** One topic as `get_overview` presents it: axes grouped under it, already in attention order. */
type TopicOverview = {
  topic: Topic;
  people: LinkedPerson[];
  repositories: LinkedRepository[];
  axisCounts: Record<AxisState, number>;
  axes: AxisOverview[];
  activityCount: number;
  lastActivityAt: string | null;
};

/** A person as the rollup carries them: the link has its own row in `topic_people`/`axis_people`. */
type Person = {
  id: string;
  displayName: string;
  nakamaUserId: string | null;
  githubLogin: string | null;
  notes: string;
};

/** A repository as the rollup carries it: the relationship belongs to the link, not the repository. */
type Repository = {
  id: string;
  fullName: string;
  url: string;
  description: string;
  defaultBranch: string;
};

/**
 * The lean axis shape both C6 views scan: title, state, repo/branch/PR and the blocker where there is
 * one. No description — that belongs to the topic detail, and the overview already sends each axis once.
 */
type AxisScan = {
  id: string;
  topicId: string;
  title: string;
  kind: string;
  state: AxisState;
  stateConfidence: Confidence;
  blocker: string;
  blockerConfidence: Confidence | null;
  branch: string;
  prNumber: number | null;
  prUrl: string;
  version: number;
  updatedAt: string;
  lastReviewedAt: string | null;
  repositories: LinkedRepository[];
};

/** A topic as a rollup names it: enough to link and label, not a second copy of the topic. */
type TopicRef = { id: string; name: string; status: string };

type PersonTopicInvolvement = {
  topic: TopicRef;
  role: string;
  axes: AxisScan[];
};

/** One person as the People view presents them: grouped involvement, and only their own events. */
type PersonRollup = {
  person: Person;
  /** False when no account is mapped, i.e. no recorded event can ever be attributed to them. */
  attributable: boolean;
  topics: PersonTopicInvolvement[];
  axes: AxisScan[];
  axisCounts: Record<AxisState, number>;
  recentActivity: Activity[];
  lastActivityAt: string | null;
  lastReviewedAt: string | null;
};

/** One repository as the Repositories view presents it: what it supports, what is happening in it. */
type RepositoryRollup = {
  repository: Repository;
  topics: Array<{ relationship: string; topic: TopicRef }>;
  axes: AxisScan[];
  axisCounts: Record<AxisState, number>;
  recentActivity: Activity[];
  lastActivityAt: string | null;
};

/**
 * One row of the Progress axis index, exactly as `get_progress` returns it.
 *
 * Deliberately a **subset** of the store's `ProgressAxisRow`: the page declares what it renders, and the
 * store stays the source of truth — the row's field set is pinned by `src/actions.test.ts` (16 keys), so a
 * field added or renamed there fails there first. The fields not listed (blocker, blockerConfidence, plan,
 * stateHistory) belong to steps this slice has not reached; they are out of scope, not dropped.
 */
type ProgressPlan = {
  id: string;
  steps: ProgressPlanStep[];
  stepsDone: number;
  summary: string;
};

type ProgressPlanStep = {
  createdAt: string;
  id: string;
  planId: string;
  /** Null where the plan has no order at all — the page renders the number only where one is claimed. */
  position: number | null;
  state: PlanStepState;
  title: string;
  updatedAt: string;
};

type ProgressAxisRow = {
  activityInWindow: number;
  blocker: string;
  blockerConfidence: Confidence | null;
  /** The axis's enduring purpose; optional on the mirror until the card reads it. */
  description?: string;
  id: string;
  lastActivityAt: string | null;
  openProblems: number;
  /** The axis's plan, or null where it has none. Optional by construction — no plan, no section. */
  plan: ProgressPlan | null;
  problems: number;
  recencyAt: string | null;
  stale: boolean;
  state: AxisState;
  stateConfidence: Confidence;
  /** Human claims aimed at this axis — the axis context, kept apart from any problem's own steering. */
  steering: ProgressSteering[];
  title: string;
  topicId: string;
  topicName: string;
};

/**
 * `get_progress`'s payload, as far as this view reads it.
 *
 * The nesting is the contract's, not a local convenience: the **outer** `axes` is the projection — the window
 * it was scoped to, the staleness threshold, and the rows — and the row list is `axes.axes`. That shape is
 * pinned by the U2 contract and the action tests, so it is read as-is rather than renamed to `rows` for
 * readability here. Getting this one level wrong is invisible to `tsc` (a client-side mirror is still
 * type-correct against itself) and shows up as an empty view at runtime, so it is worth naming plainly.
 *
 * `problems` also arrives in the payload; the Problems half of the subview is a later step, so it is not
 * declared here yet — undeclared, not dropped.
 */
type ProgressIndex = {
  activity: {
    activitySinceDays: number;
    byAxis: ProgressActivityBucket[];
    staleAfterDays: number;
  };
  axes: {
    activitySinceDays: number;
    axes: ProgressAxisRow[];
    staleAfterDays: number;
  };
  problems: {
    activitySinceDays: number;
    problems: ProgressProblemRow[];
    staleAfterDays: number;
  };
  /** Present only when paging was requested. Scoped to the same window as the arrays beside them. */
  activityPage?: Page<ProgressEventRow>;
  problemPage?: Page<ProgressProblemRow>;
};

/**
 * One event as the Activity column renders it. Same row the grouped timeline below uses — date, summary,
 * reported source, attributed person — plus `problemId`, which is what lets the feed mark the line that is
 * evidence for the problem shown beside it.
 */
type ProgressEventRow = {
  axisId: string | null;
  /** The recorded actor's kind. `system` is collector/automation activity and is stated as such. */
  actorType: string;
  id: string;
  occurredAt: string;
  person: { displayName: string; id: string } | null;
  problemId: string | null;
  /** The topic and repository this event names — the feed's tags navigate from these, not from a lookup. */
  repositoryId: string | null;
  sourceRef: string | null;
  sourceType: string;
  summary: string;
  topicId: string | null;
};

/** One axis's events in the window, as the server grouped them. The page picks a bucket; it never filters. */
type ProgressActivityBucket = {
  axisId: string;
  eventCount: number;
  events: ProgressEventRow[];
};

/**
 * One problem as the Problem column renders it — the subset of the store's `ProgressProblemRow` this slice
 * shows. The fields it does not take (history, authorId, topicId/topicName, planStepId, lastActivityAt,
 * axisTitle, stale) belong to the Problems subview and the later sections; undeclared, not dropped.
 */
type ProgressProblemRow = {
  activityCount: number;
  authorType: "agent" | "human";
  axisId: string;
  /** The parent axis's title — the problem index's context line names it rather than looking the axis up. */
  axisTitle: string;
  evidence: ProgressEvidence[];
  id: string;
  people: Array<{ displayName: string; id: string }>;
  /** The task's own plan, or null; optional on the mirror until the card reads it. */
  plan?: ProgressPlan | null;
  /** The step this problem sits on, where it sits on one — the other half of the plan ↔ problem link. */
  planStepId: string | null;
  planStepTitle: string | null;
  recencyAt: string | null;
  repositories: Array<{ fullName: string; id: string }>;
  state: string;
  stateConfidence: Confidence;
  statement: string;
  steering: ProgressSteering[];
  /** The task's concise short text; optional on the mirror until the card reads it. */
  title?: string;
  /** The problem's topic — the third entity a Progress context line can name, and a tag's destination. */
  topicId: string;
  topicName: string;
};

/**
 * One record that supports the reading on screen, with its source intact: a PR, a document, an experiment
 * record or a manual note can all be evidence, and the page says which it is rather than turning every one
 * into the same generic link.
 */
type ProgressEvidence = {
  id: string;
  label: string;
  occurredAt: string;
  sourceRef: string;
  sourceType: string;
  sourceUrl: string;
  summary: string;
};

/**
 * A human claim about an axis or a problem — `interpretation` or `steering`, never an ordinary note and never
 * agent-authored: the store excludes both, and `scope` is what keeps an axis claim out of the problems
 * beneath it instead of silently attaching it to each.
 */
type ProgressSteering = {
  authorType: string;
  confidence: Confidence | null;
  id: string;
  kind: string;
  recordedAt: string;
  scope: "axis" | "problem";
  text: string;
};

/**
 * A stored plan as the scoped workstream read carries it: the plan record and its ordered steps. This is
 * the store's own `{plan, steps}` shape (a workstream's or a task's), not the Progress index's flattened
 * `ProgressPlan` — the two reads differ and the page keeps both honest rather than reshaping one into the
 * other.
 */
type StoredPlan = {
  plan: {
    authorId: string;
    authorType: string;
    id: string;
    summary: string;
    updatedAt: string;
    version: number;
  };
  steps: ProgressPlanStep[];
};

/**
 * One task as the scoped workstream read (`get_topic` with an `axisId`) carries it. The task's plan here is
 * its **own** (`planForProblem`), never the parent workstream's — the pivot's "no inherited plans".
 */
type WorkstreamTask = {
  authorType: "human" | "agent";
  id: string;
  axisId: string;
  people: Array<{ displayName: string; id: string }>;
  plan: StoredPlan | null;
  planStepId: string | null;
  planStepTitle: string | null;
  repositories: Array<{ fullName: string; id: string; url?: string }>;
  state: string;
  stateConfidence: Confidence;
  statement: string;
  /** The task's concise, independently authored short text; `""` where none has been written. */
  title: string;
};

/**
 * The scoped `get_topic` read for one workstream (`{topicId, axisId}`): the axis in full. `readWorkstream`
 * normalizes both responder shapes into this one — the backend's own axis-scoped read (`axis`) and the
 * topic-wide detail a plain `get_topic` answers (`axes[]`), so one view renders either without a branch.
 */
type AxisWorkstream = {
  axis: AxisDetail;
  axisId: string;
  topic: { id: string; name: string; status: string };
};

/**
 * A page of a scoped read — the store's own envelope (`ScopedPage<T>`): `items` and `total` come from one
 * predicate in one snapshot, so the range shown is the backend's and the page never reports a total it did
 * not receive. `activityPage`/`problemPage` arrive on the payload only when an `offset`/`pageSize` was sent.
 */
type Page<T> = {
  hasMore: boolean;
  items: T[];
  limit: number;
  offset: number;
  total: number;
};

type Activity = {
  id: string;
  axisId: string | null;
  topicId: string | null;
  /**
   * The entities the event itself names — read by the shared ActivityFeed's tags. The projection carries
   * them (the store's own `Activity`), so declaring them here is not an addition to the payload, only to
   * what the page admits it can render.
   */
  problemId: string | null;
  repositoryId: string | null;
  sourceType: string;
  sourceRef: string;
  summary: string;
  occurredAt: string;
  actorType: string;
};

/**
 * A blocked axis as the overview's own `blocked[]` states it: the axis, its topic, and the blocker sentence
 * that axis actually asserted. Mirrored here because the landing's current-work line reads it — the store
 * already sends it (`Overview.blocked`), so this admits a field rather than adding one.
 */
type BlockedAxis = {
  axisId: string;
  topicId: string;
  topicName: string;
  title: string;
  state: AxisState;
  blocker: string;
};

type Overview = {
  generatedAt: string;
  activitySinceDays: number;
  counts: {
    topics: number;
    axes: number;
    repositories: number;
    people: number;
  };
  axesByState: Record<string, number>;
  /**
   * Tasks by stored state, counted by the same grouped query as `axesByState` — so the Dashboard summary's
   * Open and Blocked counts come from the authoritative `problems` rows, never from the page on screen and
   * never inferred from a workstream blocker (pivot: "never infer blocked children from a parent blocker").
   */
  problemsByState: Record<string, number>;
  /** Blocked axes, with the blocker each one states. Read by the landing's current-work line. */
  blocked: BlockedAxis[];
  topics: TopicOverview[];
  recentActivity: Activity[];
  people: PersonRollup[];
  peopleTruncated: boolean;
  repositories: RepositoryRollup[];
  repositoriesTruncated: boolean;
  /** The time view (C7): the window's events grouped topic → axis, newest topic first. */
  timeline: TimelineGroup[];
};

/** One recorded event in the progress view; `person` is null when no account can be attributed. */
type TimelineEvent = Activity & {
  person: { displayName: string; id: string } | null;
};
/** One axis's events in the window. `axis` is null for events that name the topic and nothing else. */
type TimelineAxis = {
  axis: AxisScan | null;
  events: TimelineEvent[];
  eventCount: number;
};
type TimelineGroup = {
  topic: TopicRef;
  axes: TimelineAxis[];
  eventCount: number;
  lastActivityAt: string | null;
};

type Context = {
  React: typeof ReactType;
  ui: typeof UI;
  pluginId: string;
  signal: AbortSignal;
  slots: {
    register(slot: "page", component: ReactType.ComponentType): void;
  };
  styles(css: string): void;
  host: { call(action: string, input?: unknown): Promise<unknown> };
};

export const inject = ["slots", "host", "ui", "styles"];

/**
 * The shared activity line's actor-attribution decision, named so a unit test can pin it without a DOM.
 *
 * A mapped person is a person. Collector/automation activity — the store records it `actorType` `system`
 * and never the GitHub author (`ingest_github_activity`) — is stated as `system`, visibly. Anything else,
 * including an unmapped human, is unattributed (the caller words that "no account attributed").
 *
 * The event's source type never decides this: a github PR or commit is not `system` by virtue of being a
 * github event. Only the recorded actor kind does.
 */
export function activityActorIndication(
  actorType: string,
  hasPerson: boolean
): "person" | "system" | "unattributed" {
  if (hasPerson) return "person";
  return actorType === "system" ? "system" : "unattributed";
}

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
];

const SOURCE_OPTIONS = [
  { label: "Manual note", value: "manual" },
  { label: "Pull request", value: "github_pr" },
  { label: "Commit", value: "github_commit" },
  { label: "Issue", value: "github_issue" },
  { label: "Document / notebook", value: "repo_document" },
  { label: "Group chat", value: "group_chat" },
  { label: "Experiment / run", value: "experiment" },
  { label: "Agent review", value: "agent_review" },
];

/**
 * How a source is *said* when it is being reported rather than chosen (C8): a menu offers "Pull request"
 * because the reader is picking one; a line of record says "PR #88". Lower case, and short enough to sit
 * beside a date and a summary.
 */
const SOURCE_LABELS: Record<string, string> = {
  agent_review: "agent review",
  experiment: "experiment",
  github_commit: "commit",
  github_issue: "issue",
  github_pr: "PR",
  group_chat: "group chat",
  manual: "manual note",
  repo_document: "document",
};

/** Axis states, in the same attention order the overview uses. */
const STATE_OPTIONS = [
  { label: "Blocked", value: "blocked" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Parked", value: "parked" },
  { label: "Completed", value: "completed" },
  { label: "Abandoned", value: "abandoned" },
];

/**
 * Per-claim confidence. `confirmed` is the strict one: the store refuses it unless the axis carries
 * evidence — a branch, a PR, an activity or a note — so the correction form says that out loud rather
 * than letting the write come back as an error with no explanation.
 */
const CONFIDENCE_OPTIONS = [
  { label: "Confirmed", value: "confirmed" },
  { label: "Inferred", value: "inferred" },
  { label: "Uncertain", value: "uncertain" },
];

/**
 * The state counts the reviewer's scan asks for, in attention order.
 */
const COUNTED_STATES: AxisState[] = ["blocked", "active", "draft", "parked"];
const OTHER_STATES: AxisState[] = ["completed", "abandoned"];

/**
 * The four peer tabs, in the accepted pivot's order. **Projects** is the landing (`value: "topics"`, so the
 * entity-navigation contract `ENTITY_VIEW.topic === "topics"` and the prototype's own `data-view="topics"`
 * for the Projects tab are unchanged). Overview is retired; its aggregate counts live in the collapsed
 * Dashboard summary above the Projects landing. Every tab reads all time (`activitySinceDays: 0`).
 */
const VIEW_OPTIONS = [
  { label: "Projects", value: "topics" },
  { label: "Progress", value: "progress" },
  { label: "People", value: "people" },
  { label: "Repositories", value: "repositories" },
] as const;

type ViewName = (typeof VIEW_OPTIONS)[number]["value"];

/**
 * §7 — the shell title stays and each view names itself. These are the prototypes' own one-line hints,
 * carried over verbatim so the page and the reference read the same way; a view whose hint is missing says
 * nothing rather than something invented.
 */
const VIEW_HEADINGS: Record<ViewName, string> = {
  people:
    "See who each person is, the research and work they are involved in, their repositories and latest activity.",
  progress:
    "Read workstreams and tasks in full, with their status, scoped plans, supporting repositories and activity. Selection changes what you view, not the research state.",
  repositories:
    "Understand what each repository is for, the work underway, the projects it supports, its people and recent activity.",
  topics:
    "Understand each project: its purpose, people, current workstreams and recent activity. Open a workstream in Progress for the full work details.",
};

/**
 * The entity types a tag can name (component-contract.md § EntityTag), and the view each one's canonical home
 * is. Two of them live in Progress — an axis in its `Axes` subview, a problem in its `Problems` subview — which
 * is why the destination is a view *plus* the destination view's own selection, and never a query parameter.
 */
type EntityType = "axis" | "person" | "problem" | "repository" | "topic";
const ENTITY_VIEW: Record<EntityType, ViewName> = {
  axis: "progress",
  person: "people",
  problem: "progress",
  repository: "repositories",
  topic: "topics",
};

/**
 * The Progress index's two subjects. `Axes` is the slice's original index; `Problems` inverts the
 * projection so the concrete problem — not the axis that owns it — is what the reader navigates. Both
 * render the **same** `get_progress` payload, so this is a switch over one model rather than a second view:
 * no request, no write, and the reading surface, sections and Activity feed are the ones already built.
 */
const PROGRESS_INDEX_OPTIONS = [
  { label: "Axes", value: "axes" },
  { label: "Problems", value: "problems" },
] as const;

type ProgressIndexMode = (typeof PROGRESS_INDEX_OPTIONS)[number]["value"];

/** How many axes a collapsed card leads with — "then 2–4 most relevant axes". */

/**
 * How many events the Progress Activity column leads with before it states the rest. The reader's latest
 * preference is **five**: the last change plus a few prior, enough to see momentum without turning the
 * column into a dump. Nothing is lost — the authoritative **all-time** total is the projection's own
 * `eventCount` (stated in the column's own line and never the length of the capped list), and the rest is
 * one control away. This is a display cap only; it is not the projection's bucket.
 */
const FEED_LEAD = 5;

/**
 * The pivot's page size: **five** entries per page in every paged list (tasks and activity on Progress).
 * The numbered pager hides itself when a list fits one page, so the size is a ceiling, never an obligation.
 */
const PROGRESS_PAGE_SIZE = 5;

/**
 * How many activity events the Topics side rail leads with. The reference reading width is 1440×900, and
 * the rail is the topic detail's *context*, not its feed: on the corpus's topic (25 events, several of them
 * long subjects) a longer rail pushes the two cards under it — Notes and Related repositories — off the
 * first screen. **Five** is the reader's latest preference and it is now the ceiling for every recent-activity
 * rail (Topics, People, Repositories): a person's or repository's rollup already carries at most
 * `DEFAULT_ROLLUP_ACTIVITY_LIMIT` (5) events, so the rail shows the full list for those and the remainder for
 * a topic is **stated** with the rest one control away, exactly as the Progress feed does. Density here
 * is a composition decision, not a data one: nothing is dropped, and no cap is applied to the count the
 * store reports (`data-rd-topic-activity` stays the payload's own number).
 */
const RAIL_ACTIVITY_LEAD = 5;

/**
 * The two states that mean *work that has stopped*, and the one place that decides it.
 *
 * The Topics lane and the repository lane both split their axes into "current" and a fold, and a second copy
 * of this predicate is exactly how two lanes come to disagree about what "current" means. No state is terminal
 * because of how its name reads: `parked` and `draft` are still current work.
 */
const TERMINAL_AXIS_STATES: ReadonlyArray<AxisScan["state"]> = ["completed", "abandoned"];
const isTerminalAxis = (state: AxisScan["state"]): boolean =>
  TERMINAL_AXIS_STATES.includes(state);

const css = `
/*
 * One small vocabulary for type, spacing and quietness. The rules below used to carry ten literal type
 * sizes, seven gap values and five opacities — which reads as noise rather than hierarchy, and made every
 * later tweak a new number. Four type steps, four gaps and one quietness are the whole scale: the tier a
 * thing belongs to is now the thing you read, not the pixel it happens to sit at.
 *
 *   --rd-title  the host card's own title (16px, set by CardTitle) — the entity's name
 *   --rd-body   the line that answers the question
 *   --rd-meta   supporting text: provenance, dates, counts, secondary lines
 *   --rd-label  a label for a section or a qualifier — uppercase, tracked, quieter
 *
 *   --rd-title-view  V1: the page-level step, above every subsection. The token block used to top out at
 *   the host's own 16px card title, so a view's name and a card's name were the same size and the shell
 *   title (16px) outranked the view it governed — which is what made every page read as compressed. There
 *   is deliberately no second new token for the detail/entity title: that IS the host's --rd-title.
 */
[data-plugin-id="research-dashboard"] {
  --rd-title-view: 23px;
  --rd-body: 13px;
  --rd-meta: 12px;
  --rd-label: 11px;
  --rd-quiet: 0.62;
  --rd-gap-row: 2px;
  --rd-gap-tight: 4px;
  /* V1 (2026-10-03). This read var(--rd-gap): a self-reference, which per CSS Variables makes the custom
     property invalid at computed-value time — so the eleven 'gap: var(--rd-gap)' rules below resolved to
     normal, i.e. to no gap at all, and the rows they govern sat tighter than designed. It was reported and
     deliberately left alone in the C1 pass (docs/reviews/2026-10-02-c1-acceptance-record.md, "Not changed,
     deliberately"), because repairing it moves geometry the accepted records had already measured. The V1
     visual pass re-measures that geometry, so the token is repaired here — and the few places that had
     papered over the hole with a literal (.rd-current-work > .rd-axes, gap: 18px) are the survivors to
     reconcile, not the model to follow. */
  --rd-gap: 8px;
  --rd-gap-block: 12px;
  /* V1-B/B3 (2026-10-03) — separation between the flat rail sections. A rail is a stack of sections with
     no boxes between them; at 12px the sections read as one run of text (V1-B B3: the
     spacing is insufficient to replace the missing card boundaries). This is the larger step the rail
     wants, and the reviewer's own suggested range (about 20-24px). Not a new box. */
  --rd-gap-rail: 24px;
  /* V1/A4 (2026-10-03) — one index width. A shrinkable basis of 15rem with a 12rem floor let the rail give
     ground whenever the detail wanted room, so the same rail laid out at a different width in each view and
     long entity names wrapped to three and four lines. One basis, and the rail does not shrink below it:
     where there is not room for both, .rd-split wraps the detail below rather than squeezing the index.
     Progress used to carry its own 16rem override; it takes this one now. */
  /* Pivot port (2026-10-10) — one shared selector-rail width for all four views, matching the accepted
     prototype's 380px desktop rail. The four side selectors used to disagree (Progress carried a narrower
     240px variant); the pivot's "All four side selectors use the same pane width (380px at the measured
     desktop viewports)" is the value the token now holds, and Progress takes this one too — it no longer
     overrides itself. */
  --rd-index-basis: 23.75rem;
  /* One box edge and one inner line: a surface is a card, and everything inside it is a rule, not a box. */
  --rd-edge: 1px solid var(--border);
  --rd-rule: 2px solid var(--border);
  /* H1 — keyboard focus, one rule for every control this page draws. The host paints its ring at half alpha
     (Tailwind's ring-ring/50), which measures about 2:1 on the surfaces this page sits on: a reader can see it,
     but it is under the 3:1 that non-text contrast asks for. The plugin asks for the same hue at full strength,
     2px wide and offset clear of the control's own edge, so tags, index rows, disclosure summaries, folds,
     rails and the window controls all take their indicator from this one place rather than from the browser's
     one-pixel default. The fallback is the theme's own accent at full strength, for a host that sets no --ring. */
  --rd-focus: var(--ring, oklch(0.55 0.15 65));
  --rd-focus-width: 2px;
  --rd-focus-offset: 2px;
}
/*
 * The doubled :focus-visible is deliberate: the host stylesheet declares its ring colour as an
 * outline-color longhand *after* this sheet, so at equal specificity it wins the colour while these
 * declarations win the width and offset — which measured as a 2px outline in the host's half-alpha ring
 * colour, i.e. the very defect this rule exists to fix. One extra pseudo-class settles it without
 * !important, and the measurement states the result rather than assuming it.
 */
[data-plugin-id="research-dashboard"] :focus-visible:focus-visible {
  outline: var(--rd-focus-width) solid var(--rd-focus);
  outline-offset: var(--rd-focus-offset);
}
/*
 * V1 Phase-4 ruling (DECISIONS §14.10) — focus scroll clearance, not a weaker indicator. The shared
 * indicator above is 2px wide, offset 2px clear of the control's own edge, so it is painted 4px outside
 * the border box. A real Tab press that brings a control to rest flush against the host scrollport's edge
 * (measured: fixture 1280×800, a Progress index row at the port's bottom) lets that outline overhang the
 * scrollport and be cut by its overflow clipping — a defect a keyboard user sees, fixed here by clearance
 * rather than by changing the shared rule. Six pixels of scroll margin on the controls this page draws
 * makes the browser's own focus scroll frame the element's margin box, leaving the indicator room on every
 * side. The scroll-margin property has no layout effect: it only moves where a focus scroll stops.
 */
[data-plugin-id="research-dashboard"] button,
[data-plugin-id="research-dashboard"] summary,
[data-plugin-id="research-dashboard"] a[href],
[data-plugin-id="research-dashboard"] input,
[data-plugin-id="research-dashboard"] [tabindex] {
  scroll-margin-block: 6px;
}
[data-plugin-id="research-dashboard"] .rd-stack { display: grid; gap: var(--rd-gap-block); }

  /* C3 — the default landing. Two columns from one payload. Topic activity is the wider column, the way the
     prototype has it, and both begin in the first viewport at 1440 and 1280 (the host leaves a 1144px and a
     984px container at those widths). It collapses to one column only below the narrowest review width, so a
     single-column read is never confused with the composition being judged. */
  [data-plugin-id="research-dashboard"] .rd-landing { display: grid; gap: var(--rd-gap-block); }
  [data-plugin-id="research-dashboard"] .rd-landing-grid {
    align-items: start;
    display: grid;
    gap: var(--rd-gap-block);
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }
  [data-plugin-id="research-dashboard"] .rd-landing-column { display: grid; gap: 12px; }
  /* The column head is a section, not a floating line: its label sits on a rule, so the two columns read
     as two labelled sections of one page rather than two loose stacks. */
  [data-plugin-id="research-dashboard"] .rd-landing-head {
    align-items: baseline; display: flex; gap: 8px; justify-content: space-between;
    padding-bottom: 8px; border-bottom: var(--rd-edge);
  }
  [data-plugin-id="research-dashboard"] .rd-landing-head .rd-side-title { font-size: var(--rd-body); }
  /* The card is a surface — white, edged, rounded, with room to breathe. Before this the landing cards
     were bare text on the page background, which is exactly what read as "flat" beside the prototype's
     panel cards. */
  [data-plugin-id="research-dashboard"] .rd-landing-card {
    background: var(--card, #fff);
    border: var(--rd-edge);
    border-radius: var(--radius-md, 10px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    display: grid;
    gap: 8px;
    padding: 12px 14px;
  }
  /* The card head: name + description as one block, and the age stated beside it in the prototype's own
     age-box grammar (a strong age over a quiet label) instead of as a third muted line. */
  [data-plugin-id="research-dashboard"] .rd-landing-top {
    align-items: flex-start; display: flex; gap: 12px; justify-content: space-between;
  }
  [data-plugin-id="research-dashboard"] .rd-landing-title { display: grid; gap: 2px; min-width: 0; }
  [data-plugin-id="research-dashboard"] .rd-landing-title .rd-meta { margin-top: 0; }
  [data-plugin-id="research-dashboard"] .rd-age-box {
    display: grid; gap: 1px; text-align: right; white-space: nowrap;
  }
  [data-plugin-id="research-dashboard"] .rd-age-box > .rd-meta { margin-top: 0; }
  /* The event band: the prototype's Last event block — an eyebrow over the event's own line. Rendered
     only where the payload carries a real event; a card with none states what it does carry rather than
     being given a fabricated title.
     V1-B/B4 (2026-10-03) — it used to be a gray rectangular inset, visually louder than the card it sits
     in (V1-B B4: "a fairly heavy gray rectangular inset … visually louder than it needs to
     be"). The prototype integrates the event with a divider and whitespace, so the fill is gone: a
     hairline above, then the eyebrow and the event's own lines in the card's own whitespace. */
  [data-plugin-id="research-dashboard"] .rd-event-band {
    display: grid; gap: 2px;
    border-top: var(--rd-edge);
    margin-top: 2px;
    padding: 8px 0 0;
  }
  [data-plugin-id="research-dashboard"] .rd-event-band .rd-section { font-size: 10px; }
  [data-plugin-id="research-dashboard"] .rd-event-band .rd-meta { margin-top: 0; }
  /* V1-B/B4 (2026-10-03) — the card's own state line and its blocker, as two lines with a real step
     between them (the review found them concatenated into one serialized sentence). The counts stay the
     compact metadata step; the blocked axis is its own line at the card's reading weight. Scoped to the
     card so it outranks the generic .rd-current-work 2px row gap rather than racing its source order. */
  [data-plugin-id="research-dashboard"] .rd-landing-card .rd-landing-current { gap: var(--rd-gap-tight); }
  /* V1-B/B4 — one footer/action geometry for both landing columns: the action sits at the card's right
     edge, the prototype's card-footer placement, instead of left-aligned under the tags. Both columns
     carry it, so the two cards' feet read the same. Scoped to the card to outrank .rd-row's own
     space-between. */
  [data-plugin-id="research-dashboard"] .rd-landing-card .rd-landing-action { justify-content: flex-end; }
  [data-plugin-id="research-dashboard"] .rd-landing-pills { display: flex; flex-wrap: wrap; gap: 4px; }
  /* The shell title as the way home: the same type as the heading it replaces, with nothing of a tab about
     it — no border, no fill, no pressed state. It underlines on hover and that is the whole affordance. */
  [data-plugin-id="research-dashboard"] .rd-home {
    background: none; border: 0; cursor: pointer; font: inherit; padding: 0; text-align: left;
  }
  [data-plugin-id="research-dashboard"] .rd-home:hover { text-decoration: underline; }
  @media (max-width: 899px) {
    [data-plugin-id="research-dashboard"] .rd-landing-grid { grid-template-columns: minmax(0, 1fr); }
  }
  /* The collapsed Dashboard summary above the Projects landing (Overview retired). A quiet disclosure in the
     shared token vocabulary: a bold muted summary heading, and the six aggregates as a compact stat row. */
  [data-plugin-id="research-dashboard"] .rd-dashboard-summary { margin-bottom: var(--rd-gap-block); }
  [data-plugin-id="research-dashboard"] .rd-dashboard-summary > summary {
    color: var(--rd-muted);
    cursor: pointer;
    font-size: var(--rd-label);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  [data-plugin-id="research-dashboard"] .rd-stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: var(--rd-gap);
    list-style: none;
    margin: var(--rd-gap-block) 0 0;
    padding: 0;
  }
  [data-plugin-id="research-dashboard"] .rd-stat { display: grid; gap: 2px; }
  [data-plugin-id="research-dashboard"] .rd-stat-value { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; }
[data-plugin-id="research-dashboard"] .rd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rd-gap);
}
[data-plugin-id="research-dashboard"] .rd-cluster {
  display: flex;
  align-items: center;
  gap: var(--rd-gap);
  flex-wrap: wrap;
}
/* Grouped controls: a divider between clusters, so the toolbar reads as three things rather than one
   row of ten peers. The first group carries no leading divider. */
[data-plugin-id="research-dashboard"] .rd-toolbar {
  display: flex;
  align-items: center;
  gap: var(--rd-gap-block);
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-group {
  display: flex;
  align-items: center;
  gap: var(--rd-gap);
  min-height: 28px;
  padding-left: 12px;
  border-left: 1px solid rgba(127, 127, 127, 0.35);
}
[data-plugin-id="research-dashboard"] .rd-group:first-child {
  padding-left: 0;
  border-left: 0;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] .rd-page-title {
  white-space: nowrap;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] .rd-toolbar {
  flex: 1 1 auto;
  justify-content: space-between;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] .rd-group {
  border: 0;
  padding: 0;
}
[data-plugin-id="research-dashboard"] .rd-views { gap: 4px; }
[data-plugin-id="research-dashboard"] .rd-views [data-rd-view-option] {
  border-color: transparent;
  background: transparent;
  padding: 7px 11px;
}
[data-plugin-id="research-dashboard"] .rd-views [aria-pressed="true"] {
  border-color: var(--border);
  background: var(--card, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
[data-plugin-id="research-dashboard"] .rd-views [data-rd-view-option]:hover {
  border-color: var(--border);
}
[data-plugin-id="research-dashboard"] .rd-muted { font-size: var(--rd-meta); opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-error { color: var(--destructive, #b91c1c); font-size: var(--rd-body); }
[data-plugin-id="research-dashboard"] .rd-meta {
  display: block;
  font-size: var(--rd-meta);
  opacity: var(--rd-quiet);
  margin-top: 2px;
}
[data-plugin-id="research-dashboard"] .rd-topic-card[data-rd-blocked="true"] {
  border-left: 3px solid var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-axes { display: grid; gap: var(--rd-gap); margin: 0; padding: 0; }
[data-plugin-id="research-dashboard"] .rd-axis {
  list-style: none;
  border-left: var(--rd-rule);
  padding: 0 0 0 10px;
}
/* Blocked keeps the stronger exceptional rule on every axis surface; the badge still
   provides the explicit state text. */
[data-plugin-id="research-dashboard"] .rd-axis[data-rd-axis-state="blocked"] {
  border-left: 3px solid var(--destructive, #b91c1c);
}
/* Scan rows in the main work lane get the same bounded rhythm as detailed axis rows.
   The stopped-work disclosure remains separate and no state or navigation is hidden. */
[data-plugin-id="research-dashboard"] .rd-current-work > .rd-axes > .rd-axis {
  background: var(--muted, rgba(127, 127, 127, 0.04));
  border-top: var(--rd-edge);
  border-right: var(--rd-edge);
  border-bottom: var(--rd-edge);
  border-radius: 7px;
  padding: 9px 11px;
}
[data-plugin-id="research-dashboard"] .rd-axis-title { font-weight: 600; }
/* Step 3: one primary row per axis (state claim + name, kind receding), one subordinate line for where
   the work lives and what it says about itself. The title carries the weight; everything else in the row
   is deliberately quieter than it. */
[data-plugin-id="research-dashboard"] .rd-axis-head {
  display: flex;
  align-items: baseline;
  gap: var(--rd-gap);
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-axis-kind {
  font-size: var(--rd-label);
  letter-spacing: 0.04em;
  opacity: var(--rd-quiet);
}
/* §7 / V1 — the view names itself, under the shell (brand) title that stays. This is now the page-level
   type step: the token block used to top out at the host's 16px card title, so the shell title outranked the
   view it governed and every page read as compressed. The heading is a row, so a view that owns a control
   (Overview's window selector) puts it at the right edge, while the name and its hint sit in their own
   column — the hint on its own line at the metadata step, not sharing the title's line at near-body weight.
   The heading takes the whole row: .rd-split is a *wrapping flex* row (not a grid), so the spanning
   declaration is flex: 0 0 100% — grid-column alone was inert and let the index share the heading's line,
   which pushed the detail into a second row and broke the "tops aligned" geometry. Both are declared so the
   rule survives a change of layout mode. */
[data-plugin-id="research-dashboard"] .rd-view-heading {
  align-items: flex-end;
  display: flex;
  flex: 0 0 100%;
  gap: var(--rd-gap-block);
  grid-column: 1 / -1;
  justify-content: space-between;
}
[data-plugin-id="research-dashboard"] .rd-view-titles {
  display: grid;
  gap: 2px;
  min-width: 0;
}
/* Overview's heading carries the window selector at its right edge: the control belongs to the tab, so it
   sits with the heading that names it rather than in the global toolbar. */
[data-plugin-id="research-dashboard"] .rd-overview-head {
  align-items: flex-end;
}
[data-plugin-id="research-dashboard"] .rd-view-title {
  font-size: var(--rd-title-view);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}
/* The axis row in the detail reads in three levels rather than ten (the first C1 montage found ten
   equal-weight lines, two of them the same fact twice). The reading is clamped so one verbose axis cannot
   push the rest of the lane off the screen: the text is untouched and still in the DOM, so the pass reads
   it exactly as before while the reader sees the hierarchy the prototype has. */
[data-plugin-id="research-dashboard"] .rd-axis-reading {
  display: grid;
  gap: var(--rd-gap-tight);
  margin: 2px 0 0;
}
[data-plugin-id="research-dashboard"] .rd-axis-reading .rd-claim-value {
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  overflow: hidden;
}
/* The axis's own "More on this axis" fold already carries the detail the compact reading does not need;
   opening it also releases the reading's clamp, so the reader can read the complete state in place. The
   rule is keyed on the fold's own native [open] state and scoped to the row that owns the fold, so a
   collapsed card is byte-identical to before and a row with no fold (the Repositories scan rows, the
   pre-detail fallback) is untouched. No new control, state, hook or fact: textContent is unchanged. */
[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value,
[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value {
  -webkit-line-clamp: unset;
  display: block;
  overflow: visible;
}
[data-plugin-id="research-dashboard"] .rd-axis-refs {
  display: grid;
  gap: var(--rd-gap-tight);
}
/* The detail the reading does not need: what the axis is for, and the second half of the state claim.
   One disclosure per axis, the same shape the rail's own writes use. */
[data-plugin-id="research-dashboard"] .rd-axis-more > summary {
  cursor: pointer;
  font-size: var(--rd-label);
  opacity: var(--rd-quiet);
}
[data-plugin-id="research-dashboard"] .rd-axis-more[open] > summary {
  margin-bottom: var(--rd-gap-tight);
}
/* The controls stay reachable and stop competing with the reading: History and Correct are capabilities,
   not content, so they read as quiet text until used. */
[data-plugin-id="research-dashboard"] .rd-axis-controls {
  font-size: var(--rd-label);
  opacity: var(--rd-quiet);
}
[data-plugin-id="research-dashboard"] .rd-axis-secondary {
  margin: 2px 0 0;
  font-size: var(--rd-meta);
  line-height: 1.45;
  opacity: var(--rd-quiet);
}
[data-plugin-id="research-dashboard"] .rd-state {
  font-size: var(--rd-label);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 999px;
  border: var(--rd-edge);
}
[data-plugin-id="research-dashboard"] .rd-state[data-rd-state="blocked"] {
  border-color: var(--destructive, #b91c1c);
  color: var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-count {
  font-size: var(--rd-meta);
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--muted, rgba(127, 127, 127, 0.1));
}
[data-plugin-id="research-dashboard"] .rd-count[data-rd-state="blocked"] {
  /* The state badge beside it already says blocked; a count is not a louder fact than the thing it counts. */
  font-weight: 600;
}
[data-plugin-id="research-dashboard"] .rd-blocker { font-size: var(--rd-meta); margin-top: 2px; }
[data-plugin-id="research-dashboard"] .rd-blocker[data-rd-strong="true"] {
  /* The words say what blocks it ("blocked by …"); the colour would say it twice. */
  font-weight: 600;
}
/* V1-B/B5 (2026-10-03) — Overview's time-scope control is one segmented track, not a row of peers.
   The four options used to render as four separate outline buttons inside a wrapping .rd-cluster: at a
   glance they read as four independent controls competing with the view heading, and at narrow widths
   they wrapped. The prototype draws one rounded track holding all four options with the pressed one
   lifted on a light face (contract/prototypes/overview.html .window). This restyles that one control —
   the window is Overview's alone (DECISIONS section 13) — and it converges on the same joined-switch
   grammar as .rd-progress-switch rather than inventing a third segmented spelling, which is the drift
   V1 exists to remove. Every hook the harness reads is untouched: the four buttons, their data-rd-window
   value, aria-pressed, the group role and aria-label, the disabled wiring and the .rd-window class all
   stay exactly as they were. */
[data-plugin-id="research-dashboard"] .rd-window {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 0;
  width: fit-content;
  padding: 3px;
  border: var(--rd-edge);
  border-radius: 9px;
  background: var(--muted, #e5e7eb);
}
[data-plugin-id="research-dashboard"] .rd-window [data-rd-window] {
  border: 0;
  border-radius: 6px;
  background: transparent;
  opacity: 0.72;
  padding: 5px 12px;
}
[data-plugin-id="research-dashboard"] .rd-window [aria-pressed="true"] {
  background: var(--card, #fff);
  color: var(--foreground, #171717);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  font-weight: 600;
  opacity: 1;
}
[data-plugin-id="research-dashboard"] .rd-views [aria-pressed="true"] { font-weight: 600; }
/* C8: the qualifier on a state is part of the claim, not decoration — quieter, never optional. */
[data-plugin-id="research-dashboard"] .rd-claim-suffix { font-weight: 400; opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-newtopic { flex-wrap: nowrap; }
[data-plugin-id="research-dashboard"] .rd-newtopic input { width: 18rem; }
[data-plugin-id="research-dashboard"] .rd-activity { display: grid; gap: var(--rd-gap); margin: 0; padding: 0; list-style: none; }
/* Activity is a flat chronology in every detail rail, not nested cards inside a card. */
[data-plugin-id="research-dashboard"] .rd-activity li {
  border-bottom: var(--rd-edge);
  padding: 6px 0 10px;
  min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-activity li:last-child {
  border-bottom: 0;
}
[data-plugin-id="research-dashboard"] .rd-form { display: grid; gap: var(--rd-gap); }
[data-plugin-id="research-dashboard"] .rd-divider {
  border-top: var(--rd-edge);
  margin: 4px 0 0;
  padding-top: 12px;
}
[data-plugin-id="research-dashboard"] .rd-detail { display: grid; gap: var(--rd-gap-block); }
[data-plugin-id="research-dashboard"] .rd-section {
  font-size: var(--rd-label);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: var(--rd-quiet);
  font-weight: 600;
  /* On a heading element (the Progress top-grid's eyebrows) this keeps the label tight; on a span it is
     inert. */
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail {
  /* Work rows are grouped reading surfaces, not a run of equally weighted metadata. */
  border: var(--rd-edge);
  border-left: var(--rd-rule);
  border-radius: 7px;
  background: var(--muted, rgba(127, 127, 127, 0.04));
  padding: 14px 15px;
  display: grid;
  gap: 9px;
}
[data-plugin-id="research-dashboard"] .rd-current-work > .rd-axes {
  gap: 18px;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail .rd-axis-controls {
  border-top: var(--rd-edge);
  padding-top: 4px;
}
[data-plugin-id="research-dashboard"] .rd-axis-more[open] > .rd-evidence {
  margin-top: 8px;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail[data-rd-axis-state="blocked"] {
  border-left: 3px solid var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-claim { display: grid; gap: var(--rd-gap-row); }
[data-plugin-id="research-dashboard"] .rd-claim-value { font-size: var(--rd-body); }
[data-plugin-id="research-dashboard"] .rd-conf {
  font-size: var(--rd-label);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px dashed var(--border);
  opacity: var(--rd-quiet);
}
[data-plugin-id="research-dashboard"] .rd-conf[data-rd-conf="confirmed"] { border-style: solid; }
[data-plugin-id="research-dashboard"] .rd-evidence { font-size: var(--rd-meta); }
[data-plugin-id="research-dashboard"] .rd-history { display: grid; gap: var(--rd-gap-tight); margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-history li {
  border-left: var(--rd-rule);
  padding: 0 0 0 8px;
}
[data-plugin-id="research-dashboard"] .rd-note { border-left-color: var(--accent, #6366f1) !important; }
[data-plugin-id="research-dashboard"] .rd-notes { display: grid; gap: var(--rd-gap-tight); margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-notes li {
  border-left: 2px solid var(--accent, #6366f1);
  padding: 0 0 0 8px;
}
[data-plugin-id="research-dashboard"] .rd-correction {
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  display: grid;
  gap: var(--rd-gap);
}
[data-plugin-id="research-dashboard"] .rd-grid2 {
  display: grid;
  gap: var(--rd-gap);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
[data-plugin-id="research-dashboard"] .rd-conflict {
  border: 1px solid var(--destructive, #b91c1c);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  gap: var(--rd-gap-tight);
}
/* C6: the index + panel split both rollup views use. The index stays narrow and the panel takes the
   rest; below a reading width the two stack instead of squeezing a table into a phone. */
[data-plugin-id="research-dashboard"] .rd-split {
  display: flex;
  gap: var(--rd-gap-block);
  align-items: flex-start;
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-index {
  flex: 0 0 var(--rd-index-basis);
  margin: 0;
  max-height: min(72vh, 760px);
  overflow-y: auto;
  overscroll-behavior: contain;
  /* The index is a surface, not a bare list — the prototype's panel. Rows sit inside on a small inset,
     so a pressed row reads as a selected row within a panel rather than a stray rectangle on the page. */
  padding: 5px;
  list-style: none;
  display: grid;
  gap: 2px;
  align-content: start;
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-radius: var(--radius-md, 10px);
}
[data-plugin-id="research-dashboard"] .rd-index-item {
  width: 100%;
  text-align: left;
  display: grid;
  gap: var(--rd-gap-row);
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}
[data-plugin-id="research-dashboard"] .rd-index-item:hover {
  border-color: var(--border);
}
/* An index row's age stays whole at the row's end and never breaks mid-label; the counts line below it
   is free to wrap. */
[data-plugin-id="research-dashboard"] .rd-index-item .rd-row { align-items: baseline; }
[data-plugin-id="research-dashboard"] .rd-index-item .rd-row > .rd-meta {
  margin-top: 0;
  white-space: nowrap;
}
/* The Progress composition, nested the way the prototype nests it: the index, then ONE selected-subject pane
   holding the header and three grouped rows. Previously the Problem and Activity columns were the index's own
   siblings in one wrapping row and every lower section was an independent full-width band, so the selected axis
   never became the subject of the right-hand pane — its identity sat in the index row and was repeated as tags
   inside the Problem column. The sections inside the pane stay individually conditional, so a subject without a
   plan or without support material collapses honestly instead of reserving space for it. */
[data-plugin-id="research-dashboard"] .rd-progress-top > .rd-progress-index {
  flex: 0 0 var(--rd-index-basis);
}
/* V1/A5 — this pane is a Card now, like the other three views' detail panes, so its surface comes from the
   shared host grammar rather than from the 1px rule it used to carry on its left edge. That lone rule was
   the whole difference the montage review saw as "visually much flatter / less clearly enclosed": the pane
   was the only detail surface on the page with no card around it.
   Verified by measurement, not by eye: the pane now computes the reference Card's own surface exactly
   (rounded-xl border bg-card shadow-sm, 1px / 14px radius / white).
   The inset is set here rather than by re-nesting the pane in CardHeader + CardContent: the host Card
   itself has padding 0 and takes it from those two, and the reference palette's CardHeader measures
   p-6 = 24px. Wrapping ~430 lines of the pane only to re-indent them would bury the real change, so the
   measured value is stated instead — if the host's Card padding ever moves, this is the one line to move
   with it. */
[data-plugin-id="research-dashboard"] .rd-progress-detail {
  display: grid;
  flex: 1 1 34rem;
  gap: var(--rd-gap-block);
  min-width: 20rem;
  padding: 24px;
  /* V1 Phase-4 ruling (DECISIONS §14.10) — the support band is container-responsive at exactly 720/480.
     The band fills this pane's content box, so the pane is the size query container: its inline-size is
     the band's own width, which is what the ruling's "available" means and what the harness reads. */
  container-type: inline-size;
}
/* V1/A1 — the rd-progress-title rule is gone with the third header path: the pane's title is a CardTitle in
   the shared header now, so this view-local flex wrapper (and its last-child wrap rule) had no caller left. */
/* Row 1 reuses C1's own dominance grid, the same rule the Topics and People panes use: the Problem is the main
   lane and the Activity its rail at no less than 1.25x. Row 2 and the support band size to how many sections
   actually rendered — auto-fit gives two and three columns when both or all exist and one when a subject has
   fewer, so a subject short of material collapses instead of holding a column open for it. */
[data-plugin-id="research-dashboard"] .rd-progress-row,
[data-plugin-id="research-dashboard"] .rd-progress-band {
  border-top: var(--rd-edge);
  display: grid;
  gap: var(--rd-gap-block);
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-progress-row {
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}
[data-plugin-id="research-dashboard"] .rd-progress-band {
  /* V1-B/B1 (2026-10-03) — the support band is three columns of one group, not three stacked bands, and
     the montage review read it as "much flatter" than the rest of the page: 12px between columns and a
     4px heading-to-content gap. The prototype separates the three into three cards and tints Human
     steering; the flat version keeps that grouping but needs the gutters and the top step to carry it.
     So: a real column gutter, a slightly larger top step above the group, and a tighter-to-looser gap
     inside each column. The steering tint is added below. */
  /* V1 Phase-4 ruling (DECISIONS §14.10) — the band is container-responsive at exactly 720/480. The
     auto-fit basis this replaced put the second switch at ~471 px: a 3-card band at 471–479 px rendered
     TWO columns while the ruled rule the harness enforces reads "below 480 → one column", a real mismatch
     the record used to explain away. Two exact thresholds cannot both fall out of one equal-gutter
     auto-fit basis (720 = 3·M + 2·g and 480 = 2·M + g would need g = 0), so the layout is written
     explicitly with container queries on the pane (container-type: inline-size above): one column
     below 480; two from 480; three from 720 — each capped at the band's own card count, so a two-card
     band stays two columns and a subject short of material still collapses instead of holding a column
     open (conditional sections natural). Gutter 28px, unchanged. */
  grid-template-columns: minmax(0, 1fr);
  column-gap: 28px;
  row-gap: var(--rd-gap-block);
  padding-top: 14px;
}
@container (min-width: 480px) {
  [data-plugin-id="research-dashboard"] .rd-progress-band:has(> section:nth-of-type(2)) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container (min-width: 720px) {
  [data-plugin-id="research-dashboard"] .rd-progress-band:has(> section:nth-of-type(3)) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
/* Each column reads its eyebrow, then its content, with a real step between them. */
[data-plugin-id="research-dashboard"] .rd-progress-band > section {
  gap: var(--rd-gap);
}
/* Human steering is a different kind of fact from Evidence (a person's constraint, not a document), so it
   is tinted rather than left identical to the column beside it. It does not stretch to the group's full
   height — that would make the tint a heavy block; it hugs its own content. */
[data-plugin-id="research-dashboard"] .rd-progress-band > .rd-progress-steering {
  align-self: start;
  background: var(--muted, rgba(127, 127, 127, 0.05));
  border-radius: 8px;
  padding: 12px 14px;
}
/* The group owns the rule above it; the sections inside it are columns of that group, not stacked bands. */
[data-plugin-id="research-dashboard"] .rd-progress-row > section,
[data-plugin-id="research-dashboard"] .rd-progress-band > section {
  border-top: none;
  padding-top: 0;
}
[data-plugin-id="research-dashboard"] .rd-problem-card {
  /* The lede of the middle column, not a box beside two other boxes — the columns are already separated by rules. */
  border-left: var(--rd-rule);
  padding: 0 0 0 10px;
  display: grid;
  gap: var(--rd-gap-tight);
}
[data-plugin-id="research-dashboard"] .rd-progress-problem > .rd-problem-card {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  gap: 12px;
  min-height: 165px;
  padding: 18px 20px;
}
[data-plugin-id="research-dashboard"] .rd-progress-problem > .rd-problem-card > .rd-strong {
  font-size: 18px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-problem-card p {
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-feed {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--rd-gap-tight);
}
[data-plugin-id="research-dashboard"] .rd-feed > li {
  display: grid;
  gap: var(--rd-gap-row);
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed > li {
  border-bottom: var(--rd-edge);
  padding: 5px 0 8px;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity {
  min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-cluster {
  min-width: 0;
}
/* V1/A2+A6 — one event-type scale for every rail, in one rule. Two rules used to set this, in this order:
   one to --rd-meta/400, then one to --rd-body/500, so the first was dead code and the survivor left the
   event headline (500) sitting ABOVE the axis's own reading (--rd-claim-value, which carries no weight of
   its own, i.e. 400). The event now sits one step below the claim it reports on — body size, regular weight,
   full foreground so it still reads as the row's headline. This is also why the Problem statement is not
   pushed to a higher weight: the scale tops out at .rd-strong (600), and a fifth weight step is the bloat
   this pass removes. What the review asked for is the relationship, and the relationship is now unambiguous. */
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity .rd-strong,
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-strong {
  color: var(--foreground, #171717);
  flex: 1 1 100%;
  font-size: var(--rd-body);
  font-weight: 400;
  line-height: 1.45;
  min-width: 0;
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity .rd-meta,
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-meta {
  opacity: 0.78;
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-tags {
  font-size: var(--rd-label);
}
/* The plan sits below the composition, separated by a rule rather than boxed: it is a secondary section, and
   the top row is the glance. The step list is a plain list because the markup must not imply an order the
   model may never have claimed — the numbers are rendered per step, only where a step carries a position. */
[data-plugin-id="research-dashboard"] .rd-progress-plan {
  border-top: var(--rd-edge);
  display: grid;
  gap: var(--rd-gap-tight);
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-progress-plan p {
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-plan-steps {
  display: grid;
  gap: var(--rd-gap-tight);
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
[data-plugin-id="research-dashboard"] .rd-plan-step {
  display: grid;
  gap: var(--rd-gap-row);
}
[data-plugin-id="research-dashboard"] .rd-step-state {
  border: var(--rd-edge);
  border-radius: 999px;
  font-size: var(--rd-meta);
  padding: 0 6px;
}
/* A scoped plan step's marker line. The shared cluster is a wrapping flex row and a step number is a
   block-level meta span, so when a title is long enough the cluster's single flex line breaks and the
   number is left stranded on its own line above the title (short titles fit, which is why the flaw hid).
   Keep the number on the title's first line and let the TITLE take the wrap — the same rule the index
   rows already carry for their status dot — and align the number and the state badge to that first line
   rather than floating them over a two-line title. One rule, shared by the project, workstream and task
   plans. */
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-row { align-items: baseline; }
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-cluster { flex-wrap: nowrap; align-items: baseline; }
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-cluster > .rd-meta { margin-top: 0; }
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-cluster > .rd-strong { min-width: 0; }
/* The problem inventory is the same kind of secondary section as the plan: a rule above it, quiet rows, and
   each row is a button because picking one drives the card in the middle column. */
[data-plugin-id="research-dashboard"] .rd-progress-problems {
  border-top: var(--rd-edge);
  display: grid;
  gap: var(--rd-gap-tight);
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-problems {
  display: grid;
  gap: var(--rd-gap-tight);
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
/* The three supporting sections step 5 adds. Same quiet treatment as the plan and the inventory: a rule
   above, a heading, the rows. */
[data-plugin-id="research-dashboard"] .rd-progress-repositories,
[data-plugin-id="research-dashboard"] .rd-progress-evidence,
[data-plugin-id="research-dashboard"] .rd-progress-steering {
  border-top: var(--rd-edge);
  display: grid;
  gap: var(--rd-gap-tight);
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-tags { gap: var(--rd-gap-tight); }
/* An entity tag: navigation, not a filter — it reads as a chip because it goes somewhere. */
[data-plugin-id="research-dashboard"] .rd-tag {
  background: var(--muted, rgba(127, 127, 127, 0.08));
  border: var(--rd-edge);
  border-radius: 999px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: var(--rd-meta);
  /* An entity tag is ONE line: a long repository or topic name must not wrap it into a two-line chip,
     which breaks a cluster's baseline and the rail's rhythm. It truncates instead, and the full label
     stays available on the element (title + the accessible name). No font-size games. */
  max-width: 100%;
  overflow: hidden;
  padding: 1px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-plugin-id="research-dashboard"] .rd-tag:hover { border-color: inherit; opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-evidence,
[data-plugin-id="research-dashboard"] .rd-steering {
  display: grid;
  gap: var(--rd-gap);
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
[data-plugin-id="research-dashboard"] .rd-source {
  border: var(--rd-edge);
  border-radius: 999px;
  font-size: var(--rd-meta);
  padding: 0 6px;
}
[data-plugin-id="research-dashboard"] .rd-steering-text { margin: 2px 0 0; }
/* V1/A8 — every problem row is a row, and selection is a layer on top of it. Before this only
   [aria-pressed="true"] had any surface at all: an unselected row was bare text between the rows that
   had one, so the selected row read as the only row that existed rather than as the chosen one.
   The base is the outline .rd-index-item already reserves for itself (1px, transparent until now); the
   selected row adds the fill on top of it.
   A first attempt gave the base the same --muted fill the selected row already used. Measured on the
   rendered page rather than judged by eye, all three rows then computed oklch(0.97 0 0) and the selected
   row kept only its border to say so — the change removed the one property that distinguished selection.
   The palette offers white and --muted and nothing between, so the base takes the outline and the
   selection keeps the fill. */
[data-plugin-id="research-dashboard"] .rd-index-item[data-rd-problem-index] {
  border-color: var(--border);
}
/* …and the selection treatment, on top of that base. */
[data-plugin-id="research-dashboard"] .rd-index-item[aria-pressed="true"] {
  border-color: var(--border);
  background: var(--muted, rgba(127, 127, 127, 0.1));
}
[data-plugin-id="research-dashboard"] .rd-panel {
  flex: 1 1 22rem;
  min-width: 16rem;
}
[data-plugin-id="research-dashboard"] .rd-view { display: grid; gap: var(--rd-gap); margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-involvement {
  border: var(--rd-edge);
  border-left: var(--rd-rule);
  border-radius: 7px;
  background: var(--muted, rgba(127, 127, 127, 0.04));
  padding: 11px 13px;
  display: grid;
  gap: var(--rd-gap-tight);
}
[data-plugin-id="research-dashboard"] .rd-involvement > ul {
  margin: 0;
  display: grid;
  gap: 12px;
}
/*
 * The primary line. The rd-strong class carried no rule at all, so the sentence that answers the question — a
 * problem's statement, an axis's title, a person's name — rendered exactly like the provenance under it,
 * and the reader had to infer which was which from position. Weight is the cheap half of hierarchy: it
 * makes the primary line primary without making the page taller.
 */
[data-plugin-id="research-dashboard"] .rd-strong { font-weight: 600; }
/* The one page-level title, which used to be the only inline-styled heading on the page. */
[data-plugin-id="research-dashboard"] .rd-page-title { font-size: 16px; font-weight: 600; margin: 0; }
/* C1: the Topics composition. The split itself is the .rd-split rule above — this sizes the detail and
   gives it its own two lanes: the work being done, then a quieter side rail. The rail keeps a rule
   instead of a box, because the detail is one page, not a dashboard of panels. */
[data-plugin-id="research-dashboard"] .rd-topic-index {
  flex: 0 0 var(--rd-index-basis);
}
[data-plugin-id="research-dashboard"] .rd-topic-detail {
  flex: 1 1 34rem;
  min-width: 20rem;
  display: grid;
  gap: var(--rd-gap-block);
  /* The detail is the same card the People and Repositories panels get from the host; the Topics pane
     draws its own, so the three views read as one surface. */
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-radius: var(--radius-md, 10px);
  padding: 16px 18px;
}
[data-plugin-id="research-dashboard"] .rd-detail-head {
  display: grid;
  gap: var(--rd-gap-row);
}
[data-plugin-id="research-dashboard"] .rd-detail-claims {
  display: grid;
  gap: var(--rd-gap-tight);
}
/* V2a — the project detail's Description disclosure: a labelled native <summary> that reads like the
   neighbouring claim labels, collapsed by default, with the full stored string in its body. The marker is
   replaced by the same caret affordance the other detail disclosures use, so the route to the full text is
   visible rather than silent. */
[data-plugin-id="research-dashboard"] .rd-description > summary { cursor: pointer; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-description > summary::-webkit-details-marker { display: none; }
[data-plugin-id="research-dashboard"] .rd-description > summary::after {
  content: " ▸"; opacity: var(--rd-quiet);
}
[data-plugin-id="research-dashboard"] .rd-description[open] > summary::after { content: " ▾"; }
/* V2 correction — the stored multi-paragraph project description is rendered verbatim, so its own
   newlines and blank lines belong on screen: pre-wrap keeps them while still wrapping long lines, and
   overflow-wrap breaks a path/URL that would otherwise push the panel wide. Scoped to the Description
   body only — every other paragraph on the page keeps the host's normal white-space handling. */
[data-plugin-id="research-dashboard"] .rd-description [data-rd-claim="description"] {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-detail-grid {
  display: grid;
  gap: var(--rd-gap-block);
  /* The side rail is proportional, not a fixed 20rem column: at a narrow container a fixed 320px
     rail squeezed Current Work to 1.10x its width, which reads as two near-equal columns rather
     than as the work with a rail beside it. A 0.6fr rail against 1fr keeps it near its current
     ~320px at 1440. The floor is the rail's OWN share, not a fixed 250px: an absolute 250px floor
     is larger than the rail's 0.6fr share (37.5% of the panel) once the panel narrows below
     ~667px, so at 1280 the panel (~500px) forced the rail up to 250px and the lane down to 244px
     — a real 0.98x, not the 1.25x the composition promises. Capping the floor at min(250px, 37.5%)
     keeps the rail at its natural 0.6fr share in a narrow panel (measured 190px / lane 304px =
     1.60x at 1280) and leaves the 250px floor in force above ~667px, so 1440 is unchanged (the
     floor never exceeds the dominance bound lane ≥ 1.25x rail ⟺ rail ≤ ~44% of the panel). It
     never stacks below the work at desktop widths. */
  grid-template-columns: minmax(0, 1fr) minmax(min(250px, 37.5%), 0.6fr);
  align-items: start;
}
@media (max-width: 1000px) {
  [data-plugin-id="research-dashboard"] .rd-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
[data-plugin-id="research-dashboard"] .rd-current-work {
  display: grid;
  gap: var(--rd-gap-row);
}
[data-plugin-id="research-dashboard"] .rd-side-stack {
  display: grid;
  gap: var(--rd-gap-rail);
  border-left: var(--rd-rule);
  padding: 0 0 0 12px;
}
[data-plugin-id="research-dashboard"] .rd-side-card {
  display: grid;
  gap: var(--rd-gap-row);
}
/* A rail is a bounded column: its cards must shrink to the rail's width, never push it wider. Without
   this, the nested grid/flex containers inside a side card keep their default min-width: auto, so a
   long entity tag (white-space: nowrap) sets the rail's min-content to the tag's full one-line width,
   the second .rd-detail-grid track is forced open past the viewport, and the page scrolls sideways
   at 1280/1440 with the tag and the event text clipped at the right edge. A tag's own max-width: 100%
   cannot bind while its containing block has grown to fit it, so every link in the chain takes
   min-width: 0: the tag then truncates on its own ellipsis, keeping its full identity on the title
   attribute and data-rd-tag-label, and the rail stays inside its column. Composition and placement are
   unchanged — this is the min-width:0 the Progress rail already carries, applied to the shared side rail. */
[data-plugin-id="research-dashboard"] .rd-side-stack,
[data-plugin-id="research-dashboard"] .rd-side-card,
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity,
[data-plugin-id="research-dashboard"] .rd-side-card .rd-view,
[data-plugin-id="research-dashboard"] .rd-side-card .rd-cluster {
  min-width: 0;
}
/* The rail is context, not a feed — and since activity is a **paged** record now, the page itself bounds
   the rail (five rows at a time, cut at the backend), so the rail no longer clamps a local window: the
   page's own five rows render in full and the pager sits below them. Notes keep their own short window. */
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity {
  max-height: none;
  overflow: visible;
}
[data-plugin-id="research-dashboard"] .rd-side-card .rd-notes {
  max-height: 120px;
  overflow-y: auto;
}
[data-plugin-id="research-dashboard"] .rd-side-title {
  font-size: var(--rd-meta);
  font-weight: 600;
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-narrow-write {
  display: grid;
  gap: var(--rd-gap-row);
}
/* A write path kept for the composition phase sits behind a disclosure, so the rail reads as activity
   rather than as a form. The summary is the whole affordance until someone opens it. */
[data-plugin-id="research-dashboard"] .rd-narrow-write > summary {
  cursor: pointer;
  font-size: var(--rd-meta);
}
[data-plugin-id="research-dashboard"] .rd-narrow-write[open] > summary {
  margin-bottom: var(--rd-gap-row);
}

/* ---- Pivot port (2026-10-10): shared work cards, project headings, repo links, context panel, pager ----
   The accepted prototype's composition, built from the existing rd-* token vocabulary and the host's own
   palette (--border/--card/--muted). No new framework, no new colour scale, no chart. */
/* A muted project heading grouping workstreams / work cards — no tree indentation, no enclosing box. */
[data-plugin-id="research-dashboard"] .rd-project-group { margin-top: var(--rd-gap-block); }
[data-plugin-id="research-dashboard"] .rd-project-group + .rd-project-group { margin-top: 24px; }
[data-plugin-id="research-dashboard"] .rd-project-heading {
  align-items: center; display: flex; gap: 8px;
  color: var(--muted-foreground, #5c6270); font-size: var(--rd-body); font-weight: 700;
  margin: 0 0 10px;
}
[data-plugin-id="research-dashboard"] .rd-project-heading::after {
  border-top: var(--rd-edge); content: ""; flex: 1;
}
/* The project intro row: a short description left, right-aligned Open project action. */
[data-plugin-id="research-dashboard"] .rd-project-intro {
  align-items: center; display: flex; gap: 12px; justify-content: space-between;
  margin-bottom: 12px;
}
[data-plugin-id="research-dashboard"] .rd-project-intro p { margin: 0; }
/* A shared workstream card (Projects, People and Repositories all reuse this one surface). */
[data-plugin-id="research-dashboard"] .rd-work-card {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-left: var(--rd-rule);
  border-radius: 8px;
  display: grid;
  gap: var(--rd-gap-tight);
  padding: 12px 14px;
}
[data-plugin-id="research-dashboard"] .rd-work-card + .rd-work-card { margin-top: 12px; }
/* No status-coloured contour: the pivot retired the workstream status outline (and the orange/red
   blocker banner). A blocked workstream reads through its state badge and its recorded counts, exactly
   as an active one does; the blocker's own prose lives in the Progress context, not on this card. */
/* The Projects detail, restructured (2026-10-10): a **native details element** whose summary carries the
   project's title and status; the workstream cards run full width across the body; the project's activity
   is its own collapsible, backend-paged section below. The heading + Dashboard summary sit above the
   split, so the 380px selector rail is never pushed onto a row of its own. */
[data-plugin-id="research-dashboard"] .rd-view-topics { display: grid; gap: var(--rd-gap-block); }
[data-plugin-id="research-dashboard"] .rd-topic-summary {
  align-items: flex-start; cursor: pointer; display: flex; gap: 10px; justify-content: space-between;
  list-style: none; padding-bottom: 10px;
}
[data-plugin-id="research-dashboard"] .rd-topic-summary::-webkit-details-marker { display: none; }
/* The shared disclosure affordance (the prototype's caret): a closed panel reads ▸, an open one ▾, on every
   detail whose header is a native summary — Projects, People and Repositories alike. */
[data-plugin-id="research-dashboard"] .rd-topic-summary::before {
  content: "▸"; display: inline-block; flex: 0 0 12px; font-size: 15px; line-height: 1; width: 12px;
}
[data-plugin-id="research-dashboard"] .rd-topic-detail[open] > .rd-topic-summary::before { content: "▾"; }
/* People and Repositories share the same disclosure: their header (DetailHeader) is the summary's one
   child, so it takes the row and the panel's own padding does the rest. */
[data-plugin-id="research-dashboard"] .rd-topic-summary > .rd-detail-head { flex: 1 1 auto; min-width: 0; }
/* The project summary's title row takes the slack so the title sits beside the caret and the status/last-activity
   cluster stays right — without it the three flex children (caret, title, meta) would centre the title. */
[data-plugin-id="research-dashboard"] .rd-topic-summary > .rd-row { flex: 1 1 auto; min-width: 0; }
[data-plugin-id="research-dashboard"] .rd-topic-summary .rd-detail-head .rd-row { margin: 0; }
[data-plugin-id="research-dashboard"] .rd-topic-summary-meta { align-items: center; display: flex; gap: 8px; }
[data-plugin-id="research-dashboard"] .rd-topic-detail[open] > .rd-topic-summary { border-bottom: var(--rd-edge); }
[data-plugin-id="research-dashboard"] .rd-topic-body { display: grid; gap: var(--rd-gap-block); padding-top: 12px; }
[data-plugin-id="research-dashboard"] .rd-context-tags,
[data-plugin-id="research-dashboard"] .rd-references {
  align-items: baseline; border-top: var(--rd-edge); display: flex; flex-wrap: wrap; gap: 8px;
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-topic-controls > summary { cursor: pointer; }
[data-plugin-id="research-dashboard"] .rd-topic-controls[open] > summary { margin-bottom: var(--rd-gap-row); }
[data-plugin-id="research-dashboard"] .rd-work-head {
  align-items: flex-start; display: flex; gap: 10px; justify-content: space-between;
}
[data-plugin-id="research-dashboard"] .rd-work-title { font-size: 15px; font-weight: 640; letter-spacing: -0.01em; margin: 0; }
[data-plugin-id="research-dashboard"] .rd-work-link { color: inherit; text-decoration: none; }
[data-plugin-id="research-dashboard"] .rd-work-link:hover { text-decoration: underline; }
/* The blocked-task count pill: red, matching sibling pills' typography/padding/height. */
[data-plugin-id="research-dashboard"] .rd-blocked-pill,
[data-plugin-id="research-dashboard"] .rd-count[data-rd-state="blocked"] { color: #a12626; background: #fdecec; }
/* The selected workstream's full-context panel (Progress): purpose, reading, blocker, plan. */
[data-plugin-id="research-dashboard"] .rd-context-panel {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-left: 3px solid var(--usable, #3a56a0);
  border-radius: var(--radius-md, 10px);
  display: grid;
  gap: var(--rd-gap-tight);
  padding: 16px 18px;
}
[data-plugin-id="research-dashboard"] .rd-context-body { display: grid; gap: 6px; }
/* The context body is a grid, and a grid item's default min-width: auto is its min-content width, so a long
   unbroken token in a stored reading would widen the track past the pane instead of wrapping. A min-width: 0
   on the body's own claim cells lets them wrap within the column; scoped to this body, nothing else moves. */
[data-plugin-id="research-dashboard"] .rd-context-body > .rd-claim-value { min-width: 0; }
/* V2 correction — the stored current reading and purpose are paragraphs, and their own blank lines and
   indentation are part of the record: pre-wrap keeps them on screen while still wrapping long lines, and
   overflow-wrap breaks a path/URL that would otherwise push the pane wide. Scoped to the Progress context
   panel only, so the compact WorkstreamCard's reading and the V1 cards keep the host's normal handling. */
[data-plugin-id="research-dashboard"] .rd-context-panel [data-rd-axis-reading],
[data-plugin-id="research-dashboard"] .rd-context-panel [data-rd-axis-description] {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-context-label {
  color: var(--muted-foreground, #5c6270); font-size: var(--rd-label); font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
}
/* The evidence line (D1/#17/#18) and its one-line clamp are retired: V2b renders evidence as the native
   rd-progress-evidence disclosure (count in the summary, full list in the body), so the block-level
   nowrap span these rules styled no longer exists. */
[data-plugin-id="research-dashboard"] .rd-context-footer {
  align-items: center; border-top: var(--rd-edge); display: flex; gap: 12px;
  justify-content: space-between; margin-top: 6px; padding-top: 10px;
}
/* An optional scoped plan: a bold heading on a rule, steps beneath; absent means absent. */
[data-plugin-id="research-dashboard"] .rd-scoped-plan { border-top: var(--rd-edge); margin-top: 10px; padding-top: 10px; }
[data-plugin-id="research-dashboard"] .rd-scoped-plan > summary { cursor: pointer; font-weight: 700; }
/* V2b — the compact header's secondary disclosures (the enduring purpose) and the after-task sections
   (evidence, activity, maintenance) share one disclosure affordance: a bold labelled summary with a
   caret. A closed fold hides nothing silently — the summary names the section and its full body is one
   click away, never visually truncated. */
[data-plugin-id="research-dashboard"] .rd-context-more {
  border-top: var(--rd-edge); margin-top: 6px; padding-top: 8px;
}
[data-plugin-id="research-dashboard"] .rd-context-more > summary { cursor: pointer; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-context-more > summary::-webkit-details-marker { display: none; }
[data-plugin-id="research-dashboard"] .rd-context-more > summary::after {
  content: " ▸"; opacity: var(--rd-quiet);
}
[data-plugin-id="research-dashboard"] .rd-context-more[open] > summary::after { content: " ▾"; }
[data-plugin-id="research-dashboard"] .rd-context-more > .rd-claim-value { margin: 4px 0 0; min-width: 0; }
[data-plugin-id="research-dashboard"] .rd-progress-evidence,
[data-plugin-id="research-dashboard"] .rd-progress-activity {
  border-top: var(--rd-edge); display: grid; gap: var(--rd-gap-tight); min-width: 0; padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-progress-evidence > summary,
[data-plugin-id="research-dashboard"] .rd-progress-activity > summary {
  cursor: pointer; font-weight: 700; list-style: none;
}
[data-plugin-id="research-dashboard"] .rd-progress-evidence > summary::-webkit-details-marker,
[data-plugin-id="research-dashboard"] .rd-progress-activity > summary::-webkit-details-marker { display: none; }
[data-plugin-id="research-dashboard"] .rd-progress-evidence > summary::after,
[data-plugin-id="research-dashboard"] .rd-progress-activity > summary::after { content: " ▸"; opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-progress-evidence[open] > summary::after,
[data-plugin-id="research-dashboard"] .rd-progress-activity[open] > summary::after { content: " ▾"; }
[data-plugin-id="research-dashboard"] .rd-evidence-list {
  display: grid; gap: var(--rd-gap-tight); list-style: none; margin: 0; padding: 0;
}
[data-plugin-id="research-dashboard"] .rd-evidence-list > li { min-width: 0; overflow-wrap: anywhere; }
[data-plugin-id="research-dashboard"] .rd-progress-maintenance {
  border-top: var(--rd-edge); display: grid; gap: var(--rd-gap-tight); padding-top: 10px;
}
/* A visible task card: title + full statement + status + own plan + links, without opening a row. */
[data-plugin-id="research-dashboard"] .rd-task-card {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-radius: var(--radius-md, 10px);
  display: grid;
  gap: 8px;
  padding: 14px 16px;
}
[data-plugin-id="research-dashboard"] .rd-task-card + .rd-task-card { margin-top: 12px; }
[data-plugin-id="research-dashboard"] .rd-task-title { font-size: 15px; font-weight: 640; margin: 0; }
[data-plugin-id="research-dashboard"] .rd-task-statement { margin: 0; }
/* Supporting-repository link pairs: internal dashboard name, thin separator, external GitHub ↗. */
[data-plugin-id="research-dashboard"] .rd-repo-pair { align-items: baseline; display: inline-flex; flex-wrap: wrap; gap: 8px; margin-right: 10px; }
[data-plugin-id="research-dashboard"] .rd-repo-pair + .rd-repo-pair { border-left: var(--rd-edge); padding-left: 8px; }
[data-plugin-id="research-dashboard"] .rd-repo-ext { border-left: 1px solid var(--border); padding-left: 8px; white-space: nowrap; }
/* Participants: a quiet inline label beneath a divider. */
[data-plugin-id="research-dashboard"] .rd-participants {
  align-items: baseline; border-top: var(--rd-edge); display: flex; flex-wrap: wrap; gap: 8px;
  margin-top: 12px; padding-top: 12px;
}
/* The pager: the segmented-switch grammar, one numbered control per paged list. */
[data-plugin-id="research-dashboard"] .rd-pager { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; margin-top: 12px; row-gap: 6px; }
[data-plugin-id="research-dashboard"] .rd-pager-switch {
  background: var(--muted, #e5e7eb); border: var(--rd-edge); border-radius: 9px;
  display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px;
}
[data-plugin-id="research-dashboard"] .rd-pager-btn {
  background: transparent; border: 0; border-radius: 6px; color: var(--muted-foreground, #5c6270);
  cursor: pointer; font: inherit; opacity: 0.72; padding: 5px 10px;
}
[data-plugin-id="research-dashboard"] .rd-pager-btn[aria-current="page"] {
  background: var(--card, #fff); color: var(--foreground, #171717);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14); font-weight: 600; opacity: 1;
}
[data-plugin-id="research-dashboard"] .rd-pager-btn:disabled { cursor: default; opacity: 0.35; }
[data-plugin-id="research-dashboard"] .rd-pager-sep { color: var(--muted-foreground, #5c6270); padding: 0 2px; }
/* The rail's per-project list and the visible task list: the shared index grammar, no nesting indent. */
[data-plugin-id="research-dashboard"] .rd-index-group,
[data-plugin-id="research-dashboard"] .rd-task-list { list-style: none; margin: 0; padding: 0; }
/* A grouped stack of shared work cards (People, Repositories): the project group, sparsely spaced. */
[data-plugin-id="research-dashboard"] .rd-work-groups { display: grid; gap: 4px; }
/* V1a: the project-only affiliations — topics the person is named on with no workstream of theirs. A
   native disclosure keeps the lane compact while preserving each affiliation's tag, status and role. */
[data-plugin-id="research-dashboard"] .rd-affiliations { margin-top: var(--rd-gap-block); min-width: 0; }
[data-plugin-id="research-dashboard"] .rd-affiliations-summary {
  color: var(--muted-foreground, #5c6270); cursor: pointer;
  font-size: var(--rd-body); font-weight: 700;
}
[data-plugin-id="research-dashboard"] .rd-affiliation-list {
  display: grid; gap: var(--rd-gap-tight); list-style: none;
  margin: var(--rd-gap-row) 0 0; padding: 0; min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-affiliation {
  align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px;
  min-width: 0;
}
/* A long affiliation topic name: the shared tag is normally nowrap (max-width:100%, ellipsis). Inside the
   People lane that nowrap min-content sets the affiliation row's own min-content, forces the lane's grid
   item past its track and overlaps the rail at 1280. Scoped to the affiliation list only, the tag may wrap
   its name — overflow-wrap:anywhere is explicitly the value that lowers min-content, so the row shrinks
   with the lane and the name reads in full instead of truncating to an unreadable ellipsis. No other tag,
   project group or grid changes. */
[data-plugin-id="research-dashboard"] .rd-affiliation .rd-tag {
  max-width: 100%; overflow-wrap: anywhere; text-overflow: clip; white-space: normal;
}
/* The selector-row status dot: colour by state, never the only signal (the state word is always beside it).
   Its default is the muted *foreground* (a mid grey), not the near-white --muted background token — a
   selector row's dot must read at a glance whatever its state. */
[data-plugin-id="research-dashboard"] .rd-status-dot {
  border-radius: 50%; display: inline-block; flex: none; height: 8px; margin-right: 7px; width: 8px;
  background: var(--muted-foreground, #6b7280);
}
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="active"],
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="completed"] { background: #176b4d; }
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="blocked"] { background: #a33f2c; }
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="parked"] { background: #8a611a; }
/* The dot and its title share one line in every selector row — the dot never wraps onto a line of its own
   above a long title. The title, not the row, takes the wrap. */
[data-plugin-id="research-dashboard"] .rd-index-item > .rd-cluster { flex-wrap: nowrap; }
[data-plugin-id="research-dashboard"] .rd-index-item > .rd-cluster > .rd-strong { min-width: 0; }

`;

/**
 * A manager's correction to one axis, held locally until Save. Everything the write needs is here,
 * including the version read from the detail, so a concurrent change surfaces as a conflict instead of
 * being overwritten.
 */
type AxisCorrection = {
  axisId: string;
  blocker: string;
  blockerConfidence: Confidence;
  currentState: string;
  currentStateConfidence: Confidence;
  note: string;
  state: AxisState;
  stateConfidence: Confidence;
};

/**
 * A stale write, held together with the thing it belongs to: a topic-field save reports at topic level
 * (`axisId: null`), an axis save reports inside that axis. Only a successful save, a re-read, or a
 * change of subject clears it — never an unrelated background read, which would take the news away
 * before the person saw it.
 */
type ConflictState = { axisId: string | null; message: string } | null;

/**
 * The draft a correction starts from. The rationale is the one field a reload carries over: it is
 * human input, not stale database state, so the claims are re-read while the person's words stay put.
 */
function draftFrom(axis: AxisDetail, note = ""): AxisCorrection {
  return {
    axisId: axis.id,
    blocker: axis.blocker,
    blockerConfidence: axis.blockerConfidence ?? "inferred",
    currentState: axis.currentState,
    currentStateConfidence: axis.currentStateConfidence ?? "inferred",
    note,
    state: axis.state,
    stateConfidence: axis.stateConfidence,
  };
}

/** "4 topics · 1 repository" — the count line reads as English, not as a template. */
function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "6 events · last activity today" — ages, not timestamps, because the question is "how stale". */
function describeAge(iso: string | null): string {
  if (!iso) {
    return "no activity yet";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "unknown";
  }
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 14) {
    return "last week";
  }
  if (days < 60) {
    return `${Math.floor(days / 7)} weeks ago`;
  }
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * V1a (People composition): split a person's topic involvements into the projects that carry at least one
 * of the person's own workstreams (the *bearing* projects) and the project-only affiliations. Both lists
 * keep the projection's own order, and together they are the original list exactly once — so partitioning
 * can never drop, duplicate or reorder an affiliation, and the panel's `data-rd-person-topics` total stays
 * the true count rather than the bearing subset. Pure and exported so the invariant is pinned by a source
 * test without a DOM.
 */
export function partitionInvolvements(topics: PersonTopicInvolvement[]): {
  bearing: PersonTopicInvolvement[];
  projectOnly: PersonTopicInvolvement[];
} {
  return {
    bearing: topics.filter((involvement) => involvement.axes.length > 0),
    projectOnly: topics.filter((involvement) => involvement.axes.length === 0),
  };
}

/**
 * The shared workstream card's rendering context — a small discriminated prop, so the behaviour that
 * changes between callers is named rather than a boolean.
 *
 * `{ view: "general" }` (the default, used by People) renders **every** repository the workstream names.
 * `{ view: "repository", repositoryId }` is the repository panel's own context: it suppresses **only** the
 * one repository whose name equals the panel's subject — the panel header already states it, so repeating it
 * on every card is the "pill soup" the review flagged — while every *other* supporting repository and all of
 * the card's metadata (state, counts, latest event) are retained.
 *
 * `{ view: "project", repositoryIds }` is V2a's Projects detail context. The project panel already lists
 * its own **directly linked** repositories (`project_repository`) under "Supporting repositories". A
 * workstream card read there must not repeat *those* — but a workstream's own links (`axis_repository`) are
 * a different set and are not necessarily shown anywhere else, so the context carries the exact ids the
 * panel already shows and the card suppresses **only** the overlap. Every other repository the workstream
 * names stays on the card as its own explicit workstream link; nothing invents a project↔repository
 * association the record does not state, and nothing is dropped from the model.
 *
 * The `project` context also demotes the per-card latest-event prose (`workstreamCardShowsEvent`): rather
 * than a recency line per card, the workstream's recorded events stay reachable through the card's
 * title → the exact Progress entry, where the workstream's full history lives. This is **not** a claim that
 * the project panel's own Activity section contains every axis's events — it need not — only that the card
 * keeps the one exact navigation and drops the duplicated summary line.
 */
export type WorkstreamCardContext =
  | { view: "general" }
  | { repositoryIds: readonly string[]; view: "project" }
  | { repositoryId: string; view: "repository" };

export const GENERAL_WORKSTREAM_CARD_CONTEXT: WorkstreamCardContext = {
  view: "general",
};

/**
 * The Projects detail's card context — see `WorkstreamCardContext`. Built per project from the ids the
 * panel's own "Supporting repositories" list already shows (the project's direct `project_repository`
 * links), so the card suppresses exactly those and keeps every other workstream repository link.
 */
export function projectWorkstreamCardContext(
  repositoryIds: readonly string[],
): WorkstreamCardContext {
  return { repositoryIds, view: "project" };
}

/**
 * The repositories a workstream card shows, given its context. Pure and exported so the rules are pinned by
 * a source test without a DOM: the general context shows all; the repository context drops **only** its own
 * subject (the panel header already states it); and the project context drops **only** the repository ids
 * the project panel already lists directly — every other repository the workstream names survives as the
 * card's own workstream link.
 */
export function visibleWorkstreamRepositories<T extends { id: string }>(
  repositories: T[],
  context: WorkstreamCardContext,
): T[] {
  if (context.view === "repository") {
    return repositories.filter((repository) => repository.id !== context.repositoryId);
  }
  if (context.view === "project") {
    const alreadyShown = new Set(context.repositoryIds);
    return repositories.filter((repository) => !alreadyShown.has(repository.id));
  }
  return repositories;
}

/**
 * V2a: whether a workstream card draws its own latest recorded event. The Projects detail's `project`
 * context says no: the card's latest-event prose is demoted into the exact Progress navigation the title
 * already offers, where the workstream's full history lives, rather than duplicating a recency line on every
 * card. It does **not** claim the project panel's Activity section carries every axis's events.
 * People (`general`) and the Repositories panel (`repository`) keep the line. Pure and exported so the one
 * exception is pinned by a source test without a DOM.
 */
export function workstreamCardShowsEvent(context: WorkstreamCardContext): boolean {
  return context.view !== "project";
}

/**
 * V2a: a workstream card's one reading line — the axis's stored `description`, else its stored current
 * reading (`currentState`), else the empty string. The fallback is the record's own second field, never an
 * invented sentence, and the chosen string is passed through byte-for-byte. Pure and exported so the
 * precedence is pinned by a source test without a DOM.
 */
export function workstreamCardReading(axis: {
  currentState?: string;
  description?: string;
}): string {
  return axis.description || axis.currentState || "";
}

/**
 * V2a: one payload builder for the Projects detail's workstream cards, so the current lane and the
 * completed/abandoned fold construct the shared card's data the same way (they previously repeated the same
 * object literal twice). The counts are the axis's own stored task states (`blocked`/`open`), the latest
 * event is the axis's own newest recorded history row (never a synthesised recency), and the reading,
 * title, state and supporting repositories are carried through unchanged — nothing is guessed and no stored
 * string is rewritten. An overview axis (no `history`/`problems` yet) yields zero counts and a null event;
 * a detail axis supplies them. Pure and exported so the mapping is pinned by a source test without a DOM.
 */
export function projectWorkstreamCardData(axis: {
  currentState: string;
  description: string;
  id: string;
  repositories: LinkedRepository[];
  state: AxisState;
  stateConfidence: Confidence;
  title: string;
  history?: Activity[];
  problems?: WorkstreamTask[];
}): {
  blockedTasks: number;
  currentState: string;
  description: string;
  id: string;
  latestEvent: { at: string; summary: string } | null;
  openTasks: number;
  repositories: LinkedRepository[];
  state: AxisState;
  stateConfidence: Confidence;
  title: string;
} {
  const problems = axis.problems ?? [];
  const history = axis.history ?? [];
  return {
    blockedTasks: problems.filter((task) => task.state === "blocked").length,
    currentState: axis.currentState,
    description: axis.description,
    id: axis.id,
    latestEvent:
      history.length > 0
        ? { at: history[0].occurredAt, summary: history[0].summary }
        : null,
    openTasks: problems.filter((task) => task.state === "open").length,
    repositories: axis.repositories,
    state: axis.state,
    stateConfidence: axis.stateConfidence,
    title: axis.title,
  };
}

/**
 * V2b — the Progress evidence disclosure's summary text: the count of evidence **shown** when there is any,
 * otherwise just the section label. The count is the projection's own `evidence` length, which the read caps
 * per source — so it is labelled "shown" rather than presented as the workstream's exact total, which this
 * view cannot read. The empty case states the explicit absence in the disclosure's body
 * (`PROGRESS_NO_EVIDENCE_TEXT`), not in its summary. Pure and exported so both forms are pinned without a
 * DOM.
 */
export function progressEvidenceSummary(count: number): string {
  return count > 0 ? `Evidence (${count} shown)` : "Evidence";
}

/**
 * V2b — the Progress activity disclosure's summary text: the exact scoped total when there are events,
 * otherwise just the label. The total is the backend page's own `total` (or the read's own array length on
 * the legacy branch), never a client estimate. Pure and exported so both forms are pinned without a DOM.
 */
export function progressActivitySummary(total: number): string {
  return total > 0 ? `Recent activity (${total})` : "Recent activity";
}

/**
 * V2b — the explicit no-evidence claim, stated verbatim (V1/#18). One exported string, so the view and its
 * test cannot drift apart on the exact words — including the apostrophes in "'confirmed'".
 */
export const PROGRESS_NO_EVIDENCE_TEXT =
  "No evidence on record — a 'confirmed' reading needs evidence";

/**
 * V1b (Repositories composition): split a repository's workstreams into the nonterminal ones that read in
 * the dominant lane and the historical (completed/abandoned) ones that fold, grouped by their parent
 * project. The split is the one `isTerminalAxis` predicate, groups keep the projection's first-appearance
 * order and each group keeps its own order, and together the two partitions are the original list exactly
 * once — so the fold can never drop, duplicate or reorder a workstream, and the lane's
 * `data-rd-repository-current` count and the fold's own count are the true partitions rather than guesses.
 * Pure and exported so the invariant is pinned by a source test without a DOM.
 */
export function partitionRepositoryWorkstreams<
  T extends { state: string; topicId: string },
>(axes: T[]): {
  groups: Array<{ historical: T[]; nonterminal: T[]; topicId: string }>;
  historicalCount: number;
  nonterminalCount: number;
} {
  const groups: Array<{
    historical: T[];
    nonterminal: T[];
    topicId: string;
  }> = [];
  const byTopic = new Map<string, number>();
  for (const axis of axes) {
    let at = byTopic.get(axis.topicId);
    if (at === undefined) {
      at = groups.length;
      byTopic.set(axis.topicId, at);
      groups.push({ historical: [], nonterminal: [], topicId: axis.topicId });
    }
    (isTerminalAxis(axis.state as AxisScan["state"])
      ? groups[at].historical
      : groups[at].nonterminal
    ).push(axis);
  }
  return {
    groups,
    historicalCount: groups.reduce((n, group) => n + group.historical.length, 0),
    nonterminalCount: groups.reduce(
      (n, group) => n + group.nonterminal.length,
      0,
    ),
  };
}

export function apply(ctx: Context) {
  const React = ctx.React;
  const {
    Button,
    Card,
    CardContent,
    CardTitle,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
  } = ctx.ui;

  ctx.styles(css);

  function StatusSelect({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (next: string) => void;
    disabled: boolean;
  }) {
    return (
      <Select
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(String(next));
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label="Topic status">
          <SelectValue>
            {STATUS_OPTIONS.find((option) => option.value === value)?.label ??
              value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  function SourceSelect({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (next: string) => void;
    disabled: boolean;
  }) {
    return (
      <Select
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(String(next));
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label="Source type">
          <SelectValue>
            {SOURCE_OPTIONS.find((option) => option.value === value)?.label ??
              value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SOURCE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  /**
   * Which peer tab is on screen. Four equal buttons, no query of their own: the page already reads the
   * payload each tab renders, so switching costs nothing the reader waits for. Overview is retired, so its
   * window control went with it and every tab reads all time.
   */
  function ViewControl({
    value,
    onChange,
    disabled,
  }: {
    /** The selected tab. Overview is a real default, so there is no unselected state to render. */
    value: ViewName;
    onChange: (next: ViewName) => void;
    disabled: boolean;
  }) {
    return (
      <div
        aria-label="Dashboard view"
        className="rd-cluster rd-views"
        role="group"
      >
        {VIEW_OPTIONS.map((option) => (
          <Button
            aria-pressed={option.value === value}
            data-rd-view-option={option.value}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            size="sm"
            variant="outline"
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }

  /**
   * V1 — one Axis, one visual grammar.
   *
   * The same conceptual Axis was rendered four ways: a row with a head and no reading (the Topics
   * fallback), a row whose head was a plain `.rd-row` instead of an axis head (Repositories), a row with a
   * reading and a fold (People), and a card with head, reading, references and fold (the Topics detail). A
   * reader had to relearn what an axis looks like on every tab. This is the shape they now share:
   *
   *   head        the state claim · the axis's own name · kind/version, quiet at the row's end
   *   reading     what the axis says about itself now, with its own confidence where there is a claim
   *   blocker     the exception, kept visible — it is the thing that needs acting on
   *   references  the repositories/people/branch the work lives in
   *   disclosure  the fold that holds the rest
   *
   * It is deliberately **presentational**: it takes no domain projection, so it cannot grow a conditional
   * per caller. The two rollups, the overview projection and the axis detail do not share a type, and this
   * component should not learn four — each caller adapts its own projection into these slots. And the
   * reading is a slot rather than a field this component fills in: AxisScan carries no current state, so
   * "no blocker recorded" stays the caller's own truthful sentence instead of prose invented here.
   *
   * Every caller keeps its own `data-rd-*` hooks through `attrs`/`readingAttrs` — harness/verify-page.mjs
   * reads them, and for some checks they are the only way to tell which projection is on screen.
   */
  type AxisRowProps = {
    /** Attributes for the row element itself — the caller's own markers, e.g. data-rd-scan-axis. */
    attrs?: Record<string, string>;
    axisId: string;
    blocker?: React.ReactNode;
    className?: string;
    disclosure?: React.ReactNode;
    kindNote?: React.ReactNode;
    onOpenEntity: (type: EntityType, id: string) => void;
    reading?: React.ReactNode;
    /** Attributes for the reading element, where a check reads it (data-rd-person-axis-reading). */
    readingAttrs?: Record<string, string>;
    references?: React.ReactNode;
    state: AxisState;
    stateConfidence?: Confidence | null;
    title: string;
  };

  /** The head both a row and the axis detail read from: state claim · name · kind, at the row's end. */
  function AxisHead({
    axisId,
    kindNote = null,
    onOpenEntity,
    state,
    stateConfidence = null,
    title,
  }: {
    axisId: string;
    kindNote?: React.ReactNode;
    onOpenEntity: (type: EntityType, id: string) => void;
    state: AxisState;
    stateConfidence?: Confidence | null;
    title: string;
  }) {
    return (
      <div className="rd-axis-head">
        <StateBadge confidence={stateConfidence} state={state} />
        <EntityTag compact id={axisId} label={title} onOpen={onOpenEntity} type="axis" />
        {kindNote === null ? null : <span className="rd-axis-kind">{kindNote}</span>}
      </div>
    );
  }

  function AxisRow({
    attrs,
    axisId,
    blocker = null,
    className = "rd-axis",
    disclosure = null,
    kindNote = null,
    onOpenEntity,
    reading = null,
    readingAttrs,
    references = null,
    state,
    stateConfidence = null,
    title,
  }: AxisRowProps) {
    return (
      <li className={className} {...(attrs ?? {})}>
        <AxisHead
          axisId={axisId}
          kindNote={kindNote}
          onOpenEntity={onOpenEntity}
          state={state}
          stateConfidence={stateConfidence}
          title={title}
        />
        {reading === null ? null : (
          <p className="rd-axis-reading" {...(readingAttrs ?? {})}>
            {reading}
          </p>
        )}
        {blocker}
        {references === null ? null : (
          <div className="rd-axis-secondary rd-axis-refs">{references}</div>
        )}
        {disclosure}
      </li>
    );
  }

  function AxisItem({
    axis,
    onOpenEntity,
  }: {
    axis: AxisOverview;
    onOpenEntity: (type: EntityType, id: string) => void;
  }) {
    const where = [
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const blocked = axis.state === "blocked";
    /* V1: the shape the other three surfaces now read too — head, reading, blocker, references. The overview
       projection carries no version and no people, so those slots are simply absent rather than faked; the
       axis names itself and it names the repositories it lives in, because both are entities (both are tags,
       component-contract.md § EntityTag) and the row's own words are unchanged. */
    return (
      <AxisRow
        attrs={{ "data-rd-axis-state": axis.state }}
        axisId={axis.id}
        blocker={
          axis.blocker ? (
            <div className="rd-blocker" data-rd-strong={blocked}>
              Blocker: {axis.blocker}
            </div>
          ) : null
        }
        kindNote={axis.kind}
        onOpenEntity={onOpenEntity}
        reading={
          axis.currentState ? (
            <>
              <span className="rd-claim-value">{axis.currentState}</span>
              <span className="rd-cluster">
                <span className="rd-muted">current state</span>
                <ConfidenceBadge value={axis.stateConfidence} />
              </span>
            </>
          ) : (
            <span className="rd-muted">no progress note</span>
          )
        }
        references={
          where || axis.currentState || axis.repositories.length > 0 ? (
            <span className="rd-cluster rd-tags">
              {axis.repositories.map((repository) => (
                <EntityTag
                  compact
                  id={repository.id}
                  key={repository.id}
                  label={repository.fullName}
                  onOpen={onOpenEntity}
                  type="repository"
                />
              ))}
              {where ? <span className="rd-meta">{where}</span> : null}
              {/* The age of the timestamp this list is ordered by — the component's whole rule. */}
              <RecencyLabel at={axis.updatedAt} prefix="· updated " />
            </span>
          ) : null
        }
        state={axis.state}
        stateConfidence={axis.stateConfidence}
        title={axis.title}
      />
    );
  }

  /** The same select shell the topic status and activity source use, for the correction form. */
  function OptionSelect({
    ariaLabel,
    disabled,
    onChange,
    options,
    value,
  }: {
    ariaLabel: string;
    disabled: boolean;
    onChange: (next: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) {
    return (
      <Select
        disabled={disabled}
        onValueChange={(next: string | null) => {
          if (next !== null) {
            onChange(String(next));
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label={ariaLabel}>
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  /** `confirmed` / `inferred` / `uncertain`, next to the claim it belongs to. A claim nobody stated
   * has no confidence to show, so a null renders nothing at all. */
  function ConfidenceBadge({ value }: { value: Confidence | null }) {
    if (!value) {
      return null;
    }
    return (
      <span className="rd-conf" data-rd-conf={value}>
        {value}
      </span>
    );
  }

  /**
   * One way to say where a recorded event came from (C8). "manual note", "agent review", "PR #88" — the
   * same words the evidence line uses, and a ref that already names its source is not said twice.
   */
  function describeSource(sourceType: string, sourceRef: string): string {
    const base = SOURCE_LABELS[sourceType] ?? sourceType;
    const ref = sourceRef.trim();
    if (!ref) {
      return base;
    }
    return ref.toLowerCase().includes(base.toLowerCase())
      ? ref
      : `${base} · ${ref}`;
  }

  /**
   * The EntityTag contract, in one place (component-contract.md § EntityTag): a tag names an entity, the app
   * navigates to that entity's canonical view and **selects** it, and a tag writes nothing — never a filter,
   * never a mutation. One component for every type, so the same entity reads and behaves the same wherever it
   * appears: the label is always the entity's own name, and the attributes are always the same pair
   * (`data-rd-entity-tag` / `data-rd-entity-id`), which is what lets the pass prove the contract by clicking
   * rather than by reading this file. `onOpen` is the page's single navigation entry point.
   */
  function EntityTag({
    compact = false,
    id,
    label,
    onOpen,
    type,
  }: {
    compact?: boolean;
    id: string;
    label: string;
    onOpen: (type: EntityType, id: string) => void;
    type: EntityType;
  }) {
    return (
      <button
        className={compact ? "rd-tag rd-tag-compact" : "rd-tag"}
        data-rd-entity-id={id}
        data-rd-entity-tag={type}
        data-rd-tag-compact={compact}
        data-rd-tag-label={label}
        onClick={() => onOpen(type, id)}
        title={label}
        type="button"
      >
        {label}
      </button>
    );
  }

  /**
   * A compact exact event date (component-contract.md § EventDate): `2026-09-28`. One place so the four
   * views and the Progress feed cannot drift into three date formats. The attribute carries the full
   * timestamp, so a check can compare what was rendered against the projection the page actually read.
   */
  function EventDate({ at }: { at: string }) {
    return (
      <span className="rd-meta" data-rd-event-date={at}>
        {at.slice(0, 10)}
      </span>
    );
  }

  /**
   * Relative age (component-contract.md § RecencyLabel), derived from the **same timestamp the row is
   * sorted by** — that is the whole point of the component: a reader comparing two rows must be comparing
   * the ages of the things the order says they are comparing. `at` is that timestamp, and it travels to
   * the DOM so a check can prove the label matches its own field rather than trusting the text.
   */
  function RecencyLabel({ at, prefix = "" }: { at: string | null; prefix?: string }) {
    if (at === null) {
      return <span className="rd-muted">{prefix || "never"}</span>;
    }
    return (
      <span className="rd-meta" data-rd-recency={at}>
        {prefix}
        {describeAge(at)}
      </span>
    );
  }

  /**
   * The common selected-entity header (component-contract.md § DetailHeader): what the panel is about, its
   * exceptional status where it has one, a compact context line whose navigation tags are the entities it
   * belongs to, and the age of its last activity. Deliberately not a metadata dump — every caller passes
   * one line of context at most, and anything longer belongs in the panel's own sections.
   */
  function DetailHeader({
    badge = null,
    children,
    context = null,
    title,
  }: {
    badge?: React.ReactNode;
    children?: React.ReactNode;
    context?: React.ReactNode;
    /** The entity's own name — a string or the view's heading node, so a card keeps its heading level. */
    title: React.ReactNode;
  }) {
    return (
      <div className="rd-detail-head" data-rd-detail-header="true">
        <div className="rd-row rd-detail-title-row">
          {title}
          {badge}
        </div>
        {context ? (
          <div className="rd-cluster rd-tags" data-rd-detail-context="true">
            {context}
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  /**
   * What the shared activity line reads. Both payloads that carry events satisfy it structurally — the C6
   * lists' `Activity` and the Progress feed's own row — so one component renders both without either side
   * widening its type to match the other's.
   */
  type ActivityLineItem = {
    axisId: string | null;
    /** The recorded actor's kind (`human`/`agent`/`system`/`unknown`); drives the actor indication. */
    actorType: string;
    id: string;
    occurredAt: string;
    problemId: string | null;
    repositoryId: string | null;
    sourceRef: string | null;
    sourceType: string;
    summary: string;
    topicId: string | null;
  };

  /**
   * One recorded event, rendered one way (component-contract.md § ActivityFeed): the date, the summary, then
   * provenance and a tag for every entity the event itself names — its person, the topic and repository it
   * belongs to, and the problem it is evidence for. The Progress feed resolves attribution and its
   * repository/topic labels from the payload it already read; the C6 lists pass what they have. A tag
   * renders only where the entity is named, so one component is honest in every view — and an event with no
   * mapped account says so in words rather than showing a tag that names nobody.
   */
  function ActivityLine({
    attrs,
    axisLabel = null,
    item,
    onOpenEntity,
    person = null,
    problemLabel = null,
    repositoryLabel = null,
    topicLabel = null,
    unattributedNote = null,
  }: {
    /**
     * The caller's own marker for this row (e.g. the Progress feed's `data-rd-feed-event`, whose value is
     * the event's own stable id so the DOM asserts ids directly rather than inferring them).
     */
    attrs?: Record<string, string>;
    axisLabel?: string | null;
    item: ActivityLineItem;
    onOpenEntity: (type: EntityType, id: string) => void;
    person?: { displayName: string; id: string } | null;
    problemLabel?: string | null;
    repositoryLabel?: string | null;
    topicLabel?: string | null;
    /** Where attribution is a fact the view states (the Progress feed), the words to say it in. */
    unattributedNote?: string | null;
  }) {
    // One decision, one place: mapped → person tag, recorded system → a visible `system` label,
    // anything else → the caller's unattributed words. The source type is not consulted.
    const actorIndication = activityActorIndication(item.actorType, person !== null);
    return (
      <li data-rd-activity-event="true" {...(attrs ?? {})}>
        <div className="rd-cluster">
          <EventDate at={item.occurredAt} />
          <span className="rd-strong">{item.summary}</span>
        </div>
        <div className="rd-cluster rd-tags" data-rd-event-tags="true">
          <span className="rd-meta">
            {describeSource(item.sourceType, item.sourceRef ?? "")}
          </span>
          {item.topicId !== null && topicLabel !== null ? (
            <EntityTag
              id={item.topicId}
              label={topicLabel}
              onOpen={onOpenEntity}
              type="topic"
            />
          ) : null}
          {item.repositoryId !== null && repositoryLabel !== null ? (
            <EntityTag
              id={item.repositoryId}
              label={repositoryLabel}
              onOpen={onOpenEntity}
              type="repository"
            />
          ) : null}
          {item.axisId !== null && axisLabel !== null ? (
            <EntityTag
              id={item.axisId}
              label={axisLabel}
              onOpen={onOpenEntity}
              type="axis"
            />
          ) : null}
          {actorIndication === "person" && person ? (
            <EntityTag
              id={person.id}
              label={person.displayName}
              onOpen={onOpenEntity}
              type="person"
            />
          ) : actorIndication === "system" && unattributedNote !== null ? (
            /*
             * Collector/automation activity, stated where the view states attribution (the Progress
             * feed). It is not "no account attributed" — that would deny the actor that recorded it.
             * The worker records `actorType` `system` and never a GitHub author (see
             * `ingest_github_activity`), so the row states the automation, in words, visibly. The
             * `unattributedNote` guard is the same one the person tag and the words below use: a view
             * that does not state attribution states none, so the label cannot appear as a one-off in
             * a view that would show neither a mapped person nor "no account attributed". `rd-actor`
             * is the hook the rendered-provenance extractor reads; the words are what a reader sees.
             */
            <span className="rd-muted rd-actor" data-rd-actor="system">
              system
            </span>
          ) : unattributedNote !== null ? (
            <span className="rd-muted">{unattributedNote}</span>
          ) : null}
          {item.problemId !== null && problemLabel !== null ? (
            <EntityTag
              id={item.problemId}
              label={problemLabel}
              onOpen={onOpenEntity}
              type="problem"
            />
          ) : null}
        </div>
      </li>
    );
  }

  /**
   * V1/A2 — the rail's (and the Progress feed's) remainder, stated once. Four hand-rolled copies of this
   * block had drifted apart only in their `data-rd-*` names; the sentence, the control, and — the rule that
   * matters — the *omission* when the whole set already fits were identical in all four, so the block lives
   * here. `total` and `shown` are the projection's own bucket and how much of it is shown, so the sentence
   * never reports an all-time total it did not receive and never prints a meaningless "5 of 5 shown": with
   * nothing held back and nothing expanded the component renders nothing at all, and `hidden` is that bucket
   * minus what is shown. Every caller keeps its own hooks (`data-rd-*-more` / `data-rd-*-note`) through the
   * attribute names it passes, so the harness reads exactly the markup it read before.
   */
  function ActivityFooter({
    all,
    hidden,
    moreAttr,
    noteAttr,
    onToggle,
    shown,
    total,
  }: {
    /** Whether the whole bucket is on screen — the reader's own expansion state. */
    all: boolean;
    /** How many of the bucket's events are held back: `total` minus what is shown. */
    hidden: number;
    /** The caller's own marker for the remainder attr, e.g. `data-rd-topic-activity-more`. */
    moreAttr: string;
    /** The caller's own marker for the sentence, e.g. `data-rd-topic-activity-note`. */
    noteAttr: string;
    onToggle: () => void;
    /** How many of the bucket's events are shown. */
    shown: number;
    /** The projection's own bucket length — never an all-time total restated from a cap. */
    total: number;
  }) {
    if (!all && hidden <= 0) {
      return null;
    }
    return (
      <div className="rd-cluster" {...{ [moreAttr]: String(hidden) }}>
        <span className="rd-meta" {...{ [noteAttr]: "true" }}>
          {all
            ? `all ${total} shown, newest first`
            : `${shown} of ${total} shown, newest first`}
        </span>
        <Button onClick={onToggle} size="sm" variant="ghost">
          {all ? "Show fewer" : `Show all ${total}`}
        </Button>
      </div>
    );
  }

  /**
   * A **backend-paged** activity list, scoped to one entity (a person's recorded actor account, or a
   * repository), used by the People and Repositories rails. This replaces the local slice + "Show all N"
   * window the two rails used to keep: the rows and the total are the page's own (`list_activity` with an
   * `offset`/`pageSize` → `activityPage`), so the range shown is the range the backend returned and the
   * pager requests the next page rather than revealing rows already held in memory. An entity whose scope
   * holds no rows states that honestly, and the container reports the payload's own count.
   */
  function PagedActivityFeed({
    countAttr,
    dataAttr,
    emptyText,
    labelFor,
    onOpenEntity,
    person = null,
    scope,
  }: {
    /** The container's row-count attribute, e.g. `data-rd-person-activity`. */
    countAttr: string;
    dataAttr: string;
    emptyText: string;
    labelFor?: (item: Activity) => {
      axis?: string | null;
      problem?: string | null;
      repository?: string | null;
      topic?: string | null;
    };
    onOpenEntity: (type: EntityType, id: string) => void;
    person?: { displayName: string; id: string } | null;
    scope: { personActorId?: string; axisId?: string; repositoryId?: string; topicId?: string };
  }) {
    const [page, setPage] = React.useState<Page<Activity> | null>(null);
    const [offset, setOffset] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const scopeKey = JSON.stringify(scope);
    /**
     * The scope the current `offset` belongs to. A person/repository change is a change of identity, not a
     * change of page: the previous entity's offset must not be carried into the new one (repository A on
     * page 3 holds `offset=10`, which lands on an empty page for a repository B with two records). The
     * effect resets the offset and drops the previous page **before** it issues a request, so the request
     * that runs is always at the new scope's own offset — no stale page is shown under the new identity,
     * and no request is ever sent at the previous entity's offset.
     */
    const scopeRef = React.useRef(scopeKey);
    React.useEffect(() => {
      if (scopeRef.current !== scopeKey) {
        scopeRef.current = scopeKey;
        setPage(null);
        if (offset !== 0) {
          setOffset(0);
          return;
        }
      }
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const result = (await ctx.host.call("list_activity", {
            ...scope,
            offset,
            pageSize: PROGRESS_PAGE_SIZE,
          })) as { activityPage?: Page<Activity> };
          if (active && !ctx.signal.aborted) {
            setPage(result.activityPage ?? null);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
      // Re-reads when the scope changes (a different person / repository) or the reader pages.
    }, [scopeKey, offset]);
    const items = page?.items ?? [];
    const total = page?.total ?? 0;
    return (
      <>
        <ul
          className="rd-activity"
          data-rd-activity-shown={items.length}
          {...{ [countAttr]: total }}
          {...{ [dataAttr]: total }}
        >
          {items.map((item) => {
            const labels = labelFor?.(item) ?? {};
            return (
              <ActivityLine
                axisLabel={labels.axis ?? null}
                item={item}
                key={item.id}
                onOpenEntity={onOpenEntity}
                person={person}
                problemLabel={labels.problem ?? null}
                repositoryLabel={labels.repository ?? null}
                topicLabel={labels.topic ?? null}
              />
            );
          })}
          {!loading && items.length === 0 ? (
            <li className="rd-muted">{emptyText}</li>
          ) : null}
        </ul>
        <Pager
          label="Activity"
          offset={offset}
          onOffset={setOffset}
          pageSize={PROGRESS_PAGE_SIZE}
          total={total}
        />
      </>
    );
  }

  /**
   * §7 / V1 — the view names itself, under the shell (brand) title that stays. V1 raised it to the page-level
   * type step and put the hint on its own line: at the old 14px the view's name was smaller than the shell
   * title above it and shared a line with its own hint, which is what made every page read as compressed. It
   * is a heading, not a control, and the toolbar's pressed button is no longer the only thing saying which
   * page this is — which is what a reader arriving from a tag needs.
   */
  function ViewHeading({ view }: { view: ViewName }) {
    const hint = VIEW_HEADINGS[view];
    return (
      <div className="rd-view-heading" data-rd-view-heading={view}>
        <div className="rd-view-titles">
          <h3 className="rd-view-title" data-rd-view-title={view}>
            {VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view}
          </h3>
          {hint ? <span className="rd-meta">{hint}</span> : null}
        </div>
      </div>
    );
  }

  /**
   * An exceptional state, said in words (component-contract.md § EntityIndex's "show exceptional state where
   * relevant"): empty, truncated, or filtered. One treatment, because "nothing is recorded here" and
   * "everything is here and none of it matches your filter" must never look the same, and a check should be
   * able to ask which of the two it is reading.
   */
  function Notice({
    attrs,
    children,
    kind,
  }: {
    /** The caller's own fact about this notice, e.g. how many rows are out of view. */
    attrs?: Record<string, string>;
    children: React.ReactNode;
    kind: "empty" | "filtered" | "truncated";
  }) {
    return (
      <p className="rd-notice rd-muted" data-rd-notice={kind} {...(attrs ?? {})}>
        {children}
      </p>
    );
  }

  /**
   * The independent numbered pager the pivot asks for, in one place: **Previous / numbered pages / Next** on
   * the shared segmented-switch grammar. Page size is five. The controls render **only** when the list is
   * longer than one page — a one-page list shows its own range and no control at all, so a button that
   * cannot act is never drawn. The range and total are the **backend page's own** (`offset`/`limit`/`total`),
   * never a length re-derived here, so the page reports availability honestly.
   */
  function Pager({
    label,
    offset,
    pageSize,
    total,
    onOffset,
  }: {
    label: string;
    offset: number;
    pageSize: number;
    total: number;
    onOffset: (next: number) => void;
  }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(0, Math.floor(offset / pageSize)), pages - 1);
    const from = total === 0 ? 0 : page * pageSize + 1;
    const to = Math.min((page + 1) * pageSize, total);
    const go = (next: number) => onOffset(next * pageSize);
    return (
      <div className="rd-pager" data-rd-pager={label}>
        {pages > 1 ? (
          <div aria-label={`${label} pages`} className="rd-pager-switch" role="group">
            <button
              className="rd-pager-btn"
              disabled={page === 0}
              onClick={() => go(page - 1)}
              type="button"
            >
              Previous
            </button>
            {Array.from({ length: pages }).map((_, index) => {
              if (index === 0 || index === pages - 1 || Math.abs(index - page) <= 1) {
                return (
                  <button
                    aria-current={index === page ? "page" : undefined}
                    className="rd-pager-btn"
                    key={index}
                    onClick={() => go(index)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                );
              }
              if (index === page - 2 || index === page + 2) {
                return (
                  <span aria-hidden="true" className="rd-pager-sep" key={`sep-${index}`}>
                    …
                  </span>
                );
              }
              return null;
            })}
            <button
              className="rd-pager-btn"
              disabled={page === pages - 1}
              onClick={() => go(page + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        ) : (
          <span />
        )}
        <span className="rd-meta" data-rd-pager-range={`${from}-${to}`}>
          {total === 0 ? "No entries" : `${from}–${to} of ${total} available`}
        </span>
      </div>
    );
  }

  /**
   * An optional scoped plan — a workstream's strategy or a task's own implementation plan. Optional by
   * construction: no plan renders **nothing** (the pivot's "plans are optional"; no inheritance and no
   * rollup). The label is bold on a rule; the steps are the plan's own list, and a step's number is rendered
   * only where the step claims a `position` — stored positions are shown as stored, never rebased.
   */
  function ScopedPlan({
    label,
    plan,
    defaultOpen = true,
  }: {
    label: string;
    plan: StoredPlan | null;
    /**
     * V2b — whether the disclosure starts open. The default is `true` (a task's own implementation plan),
     * preserving every existing call site's behaviour; the Progress workstream's plan passes `false` so its
     * summary is the route and the reader opens it. Either way the summary is visible and every stored step
     * is retained in the body — collapse hides nothing that a click cannot restore.
     */
    defaultOpen?: boolean;
  }) {
    if (!plan || plan.steps.length === 0) {
      return null;
    }
    return (
      <details className="rd-scoped-plan" open={defaultOpen}>
        <summary>{label}</summary>
        {plan.plan.summary ? <p className="rd-meta">{plan.plan.summary}</p> : null}
        <ol className="rd-plan-steps" data-rd-scoped-plan-steps={plan.steps.length}>
          {plan.steps.map((step) => (
            <li
              className="rd-plan-step"
              data-rd-scoped-plan-step={step.id}
              data-rd-scoped-plan-position={
                step.position === null ? "" : String(step.position)
              }
              key={step.id}
            >
              <span className="rd-row">
                <span className="rd-cluster">
                  {step.position === null ? null : (
                    <span className="rd-meta">{`${step.position}.`}</span>
                  )}
                  <span className="rd-strong">{step.title}</span>
                </span>
                <StateBadge kind="stored" state={step.state} />
              </span>
            </li>
          ))}
        </ol>
      </details>
    );
  }

  /**
   * One supporting-repository reference, with the repository link **split** the pivot asks for: the name
   * opens the exact dashboard entry (an EntityTag — it navigates and selects, and writes nothing), then a
   * thin vertical separator, then a separate external **GitHub ↗** anchor to the repository's *actual
   * external URL*, opened in a new tab. The internal identity and the external destination are two different
   * facts and never collapse into one link; a repository whose stored `url` is blank gets no external half
   * rather than a guessed destination.
   */
  function RepoLinkPair({
    repository,
    onOpen,
  }: {
    repository: { fullName: string; id: string; url?: string };
    onOpen: (type: EntityType, id: string) => void;
  }) {
    return (
      <span className="rd-repo-pair" data-rd-repo-pair={repository.id}>
        <EntityTag
          id={repository.id}
          label={repository.fullName}
          onOpen={onOpen}
          type="repository"
        />
        {repository.url ? (
          <a
            aria-label={`Open ${repository.fullName} on GitHub`}
            className="rd-repo-ext"
            data-rd-repo-ext={repository.id}
            href={repository.url}
            rel="noopener noreferrer"
            target="_blank"
            title={`Open ${repository.fullName} on GitHub`}
          >
            GitHub ↗
          </a>
        ) : null}
      </span>
    );
  }

  /** Participants: a quiet inline label beneath a divider, exactly as the pivot asks. */
  function Participants({
    onOpen,
    people,
  }: {
    onOpen: (type: EntityType, id: string) => void;
    people: Array<{ displayName: string; id: string }>;
  }) {
    if (people.length === 0) {
      return null;
    }
    return (
      <div className="rd-participants" data-rd-participants={people.length}>
        <span className="rd-meta">Participants ·</span>
        {people.map((person) => (
          <EntityTag
            id={person.id}
            key={person.id}
            label={person.displayName}
            onOpen={onOpen}
            type="person"
          />
        ))}
      </div>
    );
  }

  /**
   * The shared workstream card, built once and reused by Projects, People and Repositories. Its title is the
   * navigation: it opens the exact Progress entry (no duplicate "Open workstream" or "Review blocker"
   * buttons). Status, the unknown-blocked-task count (where the caller carries it) and the supporting
   * repositories render beneath; a workstream with no summary states what it does carry rather than an
   * invented sentence.
   */
  type WorkstreamCardData = {
    /** The workstream's own task counts, where the caller's read carries them (Topics). */
    blockedTasks?: number;
    currentState?: string;
    description?: string;
    id: string;
    /**
     * The latest **recorded** event on this workstream, where the caller holds the workstream's own
     * history (the topic-wide read). Absent means the caller has no event list for this workstream, so
     * nothing is invented and no line is drawn — the pivot's "one latest recorded event", never a
     * synthesised recency.
     */
    latestEvent?: { at: string; summary: string } | null;
    openTasks?: number;
    repositories: Array<{ fullName: string; id: string; url?: string }>;
    state: AxisState;
    stateConfidence: Confidence;
    title: string;
  };

  function WorkstreamCard({
    axis,
    context = GENERAL_WORKSTREAM_CARD_CONTEXT,
    onOpenEntity,
    onOpenWorkstream,
  }: {
    axis: WorkstreamCardData;
    /**
     * Where the card is being read. Omitted (People) is the default `{ view: "general" }`, which renders
     * every supporting repository. The repository panel passes `{ view: "repository", repositoryId }` so the
     * card suppresses only its own subject's name; the Projects detail passes
     * `{ view: "project", repositoryIds }` so the card drops only the repository links the project panel
     * already lists directly — and demotes the latest-event prose into the exact Progress entry — while
     * keeping every other workstream repository link. See `WorkstreamCardContext`.
     */
    context?: WorkstreamCardContext;
    onOpenEntity: (type: EntityType, id: string) => void;
    onOpenWorkstream: (axisId: string) => void;
  }) {
    const reading = workstreamCardReading(axis);
    // Per the accepted pivot the compact card carries title → Progress, the workstream's status and its
    // task counts, and one latest recorded event. It does **not** restate the blocker: the blocker's full
    // prose belongs to the Progress context, and the old in-card blocker line (with its status-coloured
    // contour) is removed here. The latest-event line is drawn only where the caller is not the project
    // panel, which demotes it into the card's exact Progress navigation rather than repeating it per card
    // (`workstreamCardShowsEvent`); the repository tags drop only the links the project panel already lists
    // directly (see `visibleWorkstreamRepositories`).
    return (
      <article
        className="rd-work-card"
        data-rd-state={axis.state}
        data-rd-work-card={axis.id}
      >
        <div className="rd-work-head">
          <h3 className="rd-work-title">
            <a
              className="rd-work-link"
              data-rd-work-link={axis.id}
              href={`#/progress/${axis.id}`}
              onClick={(event) => {
                event.preventDefault();
                onOpenWorkstream(axis.id);
              }}
            >
              {axis.title}
            </a>
          </h3>
          <StateBadge confidence={axis.stateConfidence} state={axis.state} />
        </div>
        {reading ? (
          <p className="rd-meta" data-rd-work-summary="true">
            {reading}
          </p>
        ) : null}
        {axis.latestEvent && workstreamCardShowsEvent(context) ? (
          <p className="rd-meta" data-rd-work-event="true">
            <EventDate at={axis.latestEvent.at} /> | {axis.latestEvent.summary}
          </p>
        ) : null}
        <div className="rd-cluster rd-tags">
          {typeof axis.openTasks === "number" ? (
            <span className="rd-count">
              {countLabel(axis.openTasks, "open task", "open tasks")}
            </span>
          ) : null}
          {typeof axis.blockedTasks === "number" && axis.blockedTasks > 0 ? (
            <span className="rd-count rd-blocked-pill" data-rd-state="blocked">
              {countLabel(axis.blockedTasks, "blocked", "blocked")}
            </span>
          ) : null}
          {visibleWorkstreamRepositories(axis.repositories, context).map(
            (repository) => (
              <RepoLinkPair
                key={repository.id}
                onOpen={onOpenEntity}
                repository={repository}
              />
            ),
          )}
        </div>
      </article>
    );
  }

  /**
   * An axis state with the claim attached (C8). A bare "blocked" reads as a fact, and the temporal view
   * would launder an inference into one — so a state that is not confirmed always says so, in the view
   * and in the detail alike: "BLOCKED · inferred". A confirmed state stays bare on screen but still
   * carries `data-rd-state-confidence`, so the two can be told apart from outside without shouting on
   * every card. Nothing renders a state any other way.
   */
  function StateBadge({
    confidence,
    kind = "claim",
    state,
  }: {
    confidence?: Confidence | null;
    /**
     * `claim` (default) is an axis's or a problem's state: something the record asserts, possibly only by
     * inference, so it always carries its confidence. `stored` is a plan step's state — written by an author
     * rather than inferred, with no confidence in the model at all (migration 004 has no such column for
     * steps). It is rendered by this same component so the vocabulary stays one, but it carries no
     * confidence attribute: inventing one would turn a stored fact into a claim, which is the error C8
     * exists to catch in the other direction.
     */
    kind?: "claim" | "stored";
    state: AxisState | ProblemState | PlanStepState;
  }) {
    if (kind === "stored") {
      return (
        <span className="rd-step-state" data-rd-step-state={state}>
          {state}
        </span>
      );
    }
    return (
      <span
        className="rd-state"
        data-rd-state={state}
        data-rd-state-confidence={confidence ?? "none"}
      >
        {state}
        {confidence && confidence !== "confirmed" ? (
          <span className="rd-claim-suffix"> · {confidence}</span>
        ) : null}
      </span>
    );
  }

  /**
   * The correction form for one workstream — the claim, its confidence and optionally why. It lives in one
   * place so the Progress detail's **Correct** control is the single home of the write (Progress is the
   * correction's detail destination), and the note lands in the same `reconcile_topic` call as the claim:
   * that co-write is what makes `confirmed` reachable on an axis nothing else backs — the note *is* the
   * evidence (D8). Nothing here deletes: the toolset has no delete action.
   */
  function WorkstreamCorrection({
    axis,
    busy,
    conflict,
    correction,
    onCorrection,
    onReload,
    onSave,
  }: {
    axis: AxisDetail;
    busy: boolean;
    conflict: ConflictState;
    correction: AxisCorrection;
    onCorrection: (next: AxisCorrection | null) => void;
    onReload: () => void;
    onSave: () => void;
  }) {
    return (
      <div className="rd-correction" data-rd-correction={axis.id}>
        <span className="rd-section">Correct this axis</span>
            {conflict?.axisId === axis.id ? (
              <div className="rd-conflict" data-rd-conflict="true" role="alert">
                <span className="rd-strong">
                  This workstream changed since you opened it.
                </span>
                <span className="rd-meta">{conflict.message}</span>
                <div className="rd-cluster">
                  <Button
                    disabled={busy}
                    onClick={onReload}
                    size="sm"
                    variant="outline"
                  >
                    Reload this topic
                  </Button>
                  <span className="rd-muted">
                    Your note stays; the fields above are re-read.
                  </span>
                </div>
              </div>
            ) : null}
            <div className="rd-grid2">
              <div className="rd-stack">
                <span className="rd-muted">State</span>
                <OptionSelect
                  ariaLabel="Axis state"
                  disabled={busy}
                  onChange={(next) =>
                    onCorrection({ ...correction, state: next as AxisState })
                  }
                  options={STATE_OPTIONS}
                  value={correction.state}
                />
              </div>
              <div className="rd-stack">
                <span className="rd-muted">State confidence</span>
                <OptionSelect
                  ariaLabel="State confidence"
                  disabled={busy}
                  onChange={(next) =>
                    onCorrection({
                      ...correction,
                      stateConfidence: next as Confidence,
                    })
                  }
                  options={CONFIDENCE_OPTIONS}
                  value={correction.stateConfidence}
                />
              </div>
            </div>
            <div className="rd-grid2">
              <Input
                aria-label="Current state"
                disabled={busy}
                maxLength={500}
                onChange={(event) =>
                  onCorrection({
                    ...correction,
                    currentState: (event.target as { value: string }).value,
                  })
                }
                placeholder="What is happening now"
                value={correction.currentState}
              />
              <OptionSelect
                ariaLabel="Current state confidence"
                disabled={busy}
                onChange={(next) =>
                  onCorrection({
                    ...correction,
                    currentStateConfidence: next as Confidence,
                  })
                }
                options={CONFIDENCE_OPTIONS}
                value={correction.currentStateConfidence}
              />
            </div>
            <div className="rd-grid2">
              <Input
                aria-label="Blocker"
                disabled={busy}
                maxLength={500}
                onChange={(event) =>
                  onCorrection({
                    ...correction,
                    blocker: (event.target as { value: string }).value,
                  })
                }
                placeholder="What is blocking it, if anything"
                value={correction.blocker}
              />
              <OptionSelect
                ariaLabel="Blocker confidence"
                disabled={busy}
                onChange={(next) =>
                  onCorrection({
                    ...correction,
                    blockerConfidence: next as Confidence,
                  })
                }
                options={CONFIDENCE_OPTIONS}
                value={correction.blockerConfidence}
              />
            </div>
            <Textarea
              aria-label="Note on this correction"
              disabled={busy}
              onChange={(event) =>
                onCorrection({
                  ...correction,
                  note: (event.target as { value: string }).value,
                })
              }
              placeholder="Why (optional) — recorded as a note on this axis, and it is itself evidence"
              value={correction.note}
            />
            <div className="rd-cluster">
              <Button disabled={busy} onClick={onSave}>
                Save correction
              </Button>
              <span className="rd-muted">
                Saved against v{axis.version}; a change made since then comes
                back as a conflict instead of overwriting it.
              </span>
            </div>
      </div>
    );
  }

  /**
   * The one line an index row carries: how much is on, and how much of it is stuck. Never a score and
   * never a percentage — "3 active · 1 blocked" is all a reader needs to decide where to look.
   */
  function involvementLine(entry: {
    axes: AxisScan[];
    axisCounts: Record<AxisState, number>;
    topics: unknown[];
  }): string {
    const parts: string[] = [];
    if (entry.axisCounts.active > 0) {
      parts.push(`${entry.axisCounts.active} active`);
    }
    if (entry.axisCounts.blocked > 0) {
      parts.push(`${entry.axisCounts.blocked} blocked`);
    }
    parts.push(countLabel(entry.axes.length, "workstream", "workstreams"));
    parts.push(countLabel(entry.topics.length, "project", "projects"));
    return parts.join(" · ");
  }

  /**
   * The repository index row's second line, phrased from the rollup's own numbers — the prototype's
   * "supports 1 topic · 2 workstreams". The workstream half states the repository's own total (the same
   * total the panel header carries), so the row and the panel cannot disagree about how much work the
   * repository holds; the lane's current/terminal split is the panel's own composition and is not restated
   * here. The projects half counts the rollup's *direct* topic links: a project one of the axes names
   * without the repository being filed under it is navigable but is not a direct link, so a repository with
   * none says "no direct project link" rather than "no project names it".
   */
  function supportsLine(entry: { axes: AxisScan[]; topics: unknown[] }): string {
    const workstreams =
      entry.axes.length === 0
        ? "no workstreams"
        : countLabel(entry.axes.length, "workstream", "workstreams");
    const topics =
      entry.topics.length === 0
        ? "no direct project link"
        : `supports ${countLabel(entry.topics.length, "project", "projects")}`;
    return `${topics} · ${workstreams}`;
  }

  /**
   * A list of recorded events, shared by both C6 panels. `dataAttr` names the row count so a harness
   * can ask "how many rows did this panel show" without inferring it from the DOM.
   */
  function ActivityList({
    dataAttr,
    items,
    labelFor,
    onOpenEntity,
    windowDays,
  }: {
    dataAttr: string;
    items: Activity[];
    /**
     * The entities each event names, resolved by the caller from the payload it already holds. A panel
     * cannot label a repository its own projection does not carry, and a tag that cannot be named is not
     * rendered — the alternative is inventing a name, which is worse than a missing tag.
     */
    labelFor?: (item: Activity) => {
      problem?: string | null;
      repository?: string | null;
      topic?: string | null;
    };
    onOpenEntity: (type: EntityType, id: string) => void;
    windowDays: number;
  }) {
    return (
      <ul className="rd-activity" {...{ [dataAttr]: items.length }}>
        {items.map((item) => {
          const labels = labelFor?.(item) ?? {};
          return (
            <ActivityLine
              item={item}
              key={item.id}
              onOpenEntity={onOpenEntity}
              problemLabel={labels.problem ?? null}
              repositoryLabel={labels.repository ?? null}
              topicLabel={labels.topic ?? null}
            />
          );
        })}
        {items.length === 0 ? (
          <li>
            <Notice kind="empty">
              {windowDays === 0
                ? "Nothing recorded yet."
                : `Nothing recorded in the last ${countLabel(windowDays, "day", "days")}.`}
            </Notice>
          </li>
        ) : null}
      </ul>
    );
  }

  /**
   * Person-first (C6): the index answers "who", the panel answers "what are they on" — the topics they
   * are linked to, their own axes inside each, and only the events the store can attribute to their own
   * account. Where attribution is impossible the panel says so, because "cannot be attributed" is a
   * different fact from "recorded nothing"; and it reports when work was last recorded and last
   * reviewed rather than scoring anybody.
   */
  function PersonPanel({
    entry,
    onOpenEntity,
    windowDays,
  }: {
    entry: PersonRollup;
    onOpenEntity: (type: EntityType, id: string) => void;
    windowDays: number;
  }) {
    /**
     * C2 (increment 3): the rail's own window. The same rule the Topics rail follows — the newest few events,
     * the remainder stated with a count and one click to have them, and the list bounded by height as well as
     * by count (`.rd-side-card .rd-activity`), so About and Related repositories sit on the first screen
     * whatever the activity volume. The state is per panel and resets with the selection, which is what a
     * reader expects of a rail.
     */
    const relatedRepositories = React.useMemo(() => {
      const seen = new Map<string, LinkedRepository>();
      for (const axis of entry.axes) {
        for (const repository of axis.repositories) {
          if (!seen.has(repository.id)) {
            seen.set(repository.id, repository);
          }
        }
      }
      return [...seen.values()];
    }, [entry]);
    /**
     * V1a: the involvement lane is **partitioned, not reordered**. A topic the person is on where they hold
     * a workstream (a "bearing" project) reads first as a full project group; a topic they are only named on
     * — a role, no workstream of theirs — is a project-only affiliation and reads as a compact list instead
     * of an empty group. Each partition keeps the projection's own order, and `entry.topics.length` still
     * states the true total (the two partitions together), so the lane's count never shrinks to the bearing
     * subset.
     */
    const { bearing: bearingProjects, projectOnly } = partitionInvolvements(
      entry.topics,
    );
    return (
      <details
        className="rd-panel rd-topic-detail"
        data-rd-detail-header="true"
        data-rd-detail-mode="disclosure"
        data-rd-person-panel={entry.person.displayName}
        open
      >
        <summary className="rd-topic-summary">
          <DetailHeader
            badge={
              entry.person.githubLogin ? (
                <span className="rd-muted">@{entry.person.githubLogin}</span>
              ) : null
            }
            title={<CardTitle>{entry.person.displayName}</CardTitle>}
          >
            <span className="rd-meta" data-rd-person-counts="true">
              {involvementLine(entry)}
            </span>
          </DetailHeader>
        </summary>
        <div className="rd-topic-body">
          {/* C2 increment 2: the inner split, on C1's own grid. `rd-detail-grid` is the composition unit the
              Topics detail already uses — a 1fr lane against a `minmax(250px, 0.6fr)` rail, which is exactly
              what makes the lane measurably dominant (≥1.25×) at both reference viewports rather than merely
              wider, and it stacks below 1000px. Inheriting the grid means People inherits the dominance rule
              rather than restating it with its own numbers. */}
          <div className="rd-detail-grid" data-rd-person-split="true">
            <div className="rd-current-work" data-rd-person-lane="current">
              {/* Q2 (ruled): "Current involvement" is false the moment completed work sits under it — Topics
                  and Repositories both fold terminal axes out, so the rollup was the one place calling a
                  finished axis current. The section is renamed, and the axes are stably partitioned so the
                  terminal ones read last while the projection's own order survives inside each group. One
                  section, no sub-navigation: a fold can come later if historical axes ever outnumber these. */}
              <span className="rd-section">Involvement</span>
              <div className="rd-work-groups" data-rd-person-topics={entry.topics.length}>
                {bearingProjects.map((involvement) => (
                  <section
                    className="rd-project-group"
                    data-rd-involvement={involvement.topic.name}
                    key={involvement.topic.id}
                  >
                    {/* The shared project group: a muted heading, then a short project intro with the
                        right-aligned Open project action — the same grammar Repositories uses. Every
                        bearing project holds at least one workstream, so the group never renders empty.
                        The intro carries `data-rd-project-link` (the topic's id) and the heading
                        `data-rd-project-name`, so this group is a project *navigation* the pass can read
                        and click even though a bearing group renders no topic tag. */}
                    <div
                      className="rd-project-heading"
                      data-rd-project-name={involvement.topic.name}
                    >
                      {involvement.topic.name}
                    </div>
                    <div
                      className="rd-project-intro"
                      data-rd-project-link={involvement.topic.id}
                    >
                      <p className="rd-meta">
                        {involvement.role
                          ? `${involvement.topic.status} · ${involvement.role}`
                          : involvement.topic.status}
                      </p>
                      <Button
                        onClick={() =>
                          onOpenEntity("topic", involvement.topic.id)
                        }
                        size="sm"
                        variant="outline"
                      >
                        Open project →
                      </Button>
                    </div>
                    {[
                      ...involvement.axes.filter(
                        (axis) => !isTerminalAxis(axis.state),
                      ),
                      ...involvement.axes.filter((axis) =>
                        isTerminalAxis(axis.state),
                      ),
                    ].map((axis) => (
                      <WorkstreamCard
                        axis={{
                          id: axis.id,
                          repositories: axis.repositories,
                          state: axis.state,
                          stateConfidence: axis.stateConfidence,
                          title: axis.title,
                        }}
                        key={axis.id}
                        onOpenEntity={onOpenEntity}
                        onOpenWorkstream={(axisId) =>
                          onOpenEntity("axis", axisId)
                        }
                      />
                    ))}
                  </section>
                ))}
                {/* V1a: the project-only affiliations, folded into one compact disclosure. Each is a
                    topic the person is named on but where they hold no workstream of their own — the fact
                    the old per-project group stated as an empty "no workstream of theirs here". The summary
                    names the relationship ("Project-only affiliations (N)") and the disclosure states the
                    reason once ("No explicitly linked workstreams"); each row keeps its own
                    `data-rd-involvement` marker (so the lane's involvements still total
                    `data-rd-person-topics`), the project tag navigates to the exact topic, and the
                    status · role meta is the recorded role, the same string the group intro shows. */}
                {projectOnly.length > 0 ? (
                  <details
                    className="rd-affiliations"
                    data-rd-person-affiliations={projectOnly.length}
                  >
                    <summary className="rd-affiliations-summary">
                      Project-only affiliations ({projectOnly.length})
                    </summary>
                    <p className="rd-meta">No explicitly linked workstreams</p>
                    <ul className="rd-affiliation-list">
                      {projectOnly.map((involvement) => (
                        <li
                          className="rd-affiliation"
                          data-rd-involvement={involvement.topic.name}
                          key={involvement.topic.id}
                        >
                          <EntityTag
                            compact
                            id={involvement.topic.id}
                            label={involvement.topic.name}
                            onOpen={onOpenEntity}
                            type="topic"
                          />
                          <span className="rd-meta">
                            {involvement.role
                              ? `${involvement.topic.status} · ${involvement.role}`
                              : involvement.topic.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {entry.topics.length === 0 ? (
                  <Notice kind="empty">
                    Not linked to a topic yet — the link is what puts work on this
                    page.
                  </Notice>
                ) : null}
              </div>
            </div>

            <aside className="rd-side-stack" data-rd-person-rail="true">
              <section className="rd-side-card">
                <h3 className="rd-side-title">Recent activity</h3>
                {entry.attributable ? (
                  <PagedActivityFeed
                    countAttr="data-rd-person-activity-total"
                    dataAttr="data-rd-person-activity"
                    emptyText="No attributable activity recorded yet."
                    key={entry.person.id}
                    labelFor={(item) => ({
                      topic:
                        entry.topics.find(
                          (involvement) => involvement.topic.id === item.topicId
                        )?.topic.name ?? null,
                    })}
                    onOpenEntity={onOpenEntity}
                    person={{
                      displayName: entry.person.displayName,
                      id: entry.person.id,
                    }}
                    scope={{ personActorId: entry.person.nakamaUserId ?? undefined }}
                  />
                ) : (
                  <p className="rd-muted" data-rd-attributable="false">
                    No account is mapped to this person, so no recorded event can be
                    attributed to them. That is a missing link, not an absence of
                    work.
                  </p>
                )}
                <span className="rd-cluster" data-rd-person-last="true">
                  {entry.lastActivityAt ? (
                    <RecencyLabel at={entry.lastActivityAt} prefix="last activity " />
                  ) : (
                    <span className="rd-muted">no attributable activity yet</span>
                  )}
                  {entry.lastReviewedAt ? (
                    <RecencyLabel
                      at={entry.lastReviewedAt}
                      prefix="· last reviewed "
                    />
                  ) : (
                    <span className="rd-muted">· never reviewed</span>
                  )}
                </span>
              </section>

              {/* About is the person's own recorded note and nothing else: no generated prose, no inferred
                  role, no summary of their involvement dressed up as a description. Where the record holds no
                  note the card says so, which is the same claim the rest of the page makes about absences. */}
              <section className="rd-side-card">
                <h3 className="rd-side-title">About</h3>
                {entry.person.notes ? (
                  <p data-rd-person-notes="true">{entry.person.notes}</p>
                ) : (
                  <p className="rd-muted" data-rd-person-notes="empty">
                    No note recorded for this person.
                  </p>
                )}
              </section>

              <section className="rd-side-card">
                <h3 className="rd-side-title">Related repositories</h3>
                <div
                  className="rd-cluster rd-tags"
                  data-rd-person-repositories={relatedRepositories.length}
                >
                  {relatedRepositories.map((repository) => (
                    <EntityTag
                      id={repository.id}
                      key={repository.id}
                      label={repository.fullName}
                      onOpen={onOpenEntity}
                      type="repository"
                    />
                  ))}
                  {relatedRepositories.length === 0 ? (
                    <span className="rd-muted">
                      No repository is named by their axes yet.
                    </span>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </details>
    );
  }

  function PeopleView({
    onOpenEntity,
    people,
    preselect,
    truncated,
    windowDays,
  }: {
    onOpenEntity: (type: EntityType, id: string) => void;
    people: PersonRollup[];
    preselect: { id: string; seq: number } | null;
    truncated: boolean;
    windowDays: number;
  }) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    /**
     * The EntityTag contract's other half: a person tag elsewhere in the app navigates here and *selects*, so
     * the view honours the request rather than only opening. Keyed on `seq`, so asking for the same person
     * twice still lands; applied only when a tag asked, so a reader's own click is never overridden.
     */
    React.useEffect(() => {
      if (preselect) {
        setSelectedId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq]);
    // One person is always in view: the first until another is picked. The selection is an id, so it
    // survives a refresh that renames or re-orders the rows.
    const selected =
      people.find((entry) => entry.person.id === selectedId) ??
      people[0] ??
      null;

    if (people.length === 0) {
      return (
        <Card>
          <CardContent>
            <p className="rd-muted">
              Nobody is linked yet. People appear here once a topic or an axis
              names them.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="rd-split" data-rd-view="people">
        <ViewHeading view="people" />
        <ul
          className="rd-index"
          data-rd-people={people.length}
          data-rd-people-truncated={truncated}
        >
          {people.map((entry) => (
            <li key={entry.person.id}>
              <button
                aria-pressed={selected?.person.id === entry.person.id}
                className="rd-index-item"
                data-rd-person={entry.person.displayName}
                data-rd-person-id={entry.person.id}
                onClick={() => setSelectedId(entry.person.id)}
                type="button"
              >
                {/* The row is two lines, as the prototype's is: the name and *when* on the first line,
                    the involvement line beneath. Recency is unwindowed on purpose (a person whose last
                    event was three weeks ago has not recorded nothing), and a person with no mapped
                    account gets the missing-link fact instead — "no activity" would be a different and
                    false claim. `data-rd-person-recency` carries the timestamp, or `none` /
                    `unattributable`, so a check can compare the row against the payload it came from. */}
                <span className="rd-strong">{entry.person.displayName}</span>
                <span className="rd-meta" data-rd-person-context="true">
                  {involvementLine(entry)}
                  {/* V1/A4 — the shared index-row grammar: the name takes the row's full width and the recency
                      joins the involvement line beneath it. No inter-block separator sits between the two:
                      the recency child below is block-level, so a literal ` · ` here would orphan at the end
                      of the involvement line rather than join the two. The exceptional states are kept exactly
                      as they were, and keep their own marker: a person with no attributable activity states
                      that fact rather than an age, because "no activity" would be a different and false
                      claim. */}
                  <span
                    className="rd-meta"
                    data-rd-person-recency={
                      entry.attributable
                        ? entry.lastActivityAt ?? "none"
                        : "unattributable"
                    }
                  >
                    {entry.attributable ? (
                      entry.lastActivityAt ? (
                        <RecencyLabel
                          at={entry.lastActivityAt}
                          prefix="last activity "
                        />
                      ) : (
                        "nothing attributed yet"
                      )
                    ) : (
                      "no account mapped"
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <PersonPanel
            entry={selected}
            onOpenEntity={onOpenEntity}
            windowDays={windowDays}
          />
        ) : null}
      </div>
    );
  }

  /**
   * The collapsed **Dashboard summary** the accepted pivot puts above the Projects landing, replacing the
   * retired Overview's always-on count row and its duplicate fast-access. Six aggregates, each the payload's
   * own: Projects = `counts.topics` · Workstreams = `counts.axes` · Repositories · People · Open tasks and
   * Blocked tasks = `problemsByState`. Open/Blocked are the **stored** task states (one grouped query over
   * `problems`), never inferred from a workstream blocker. Before the payload loads every figure reads "—"
   * rather than a guessed 0 — an honest empty state, not a synthetic fact.
   */
  function DashboardSummary({ overview }: { overview: Overview | null }) {
    const figure = (n: number | undefined): string =>
      overview && typeof n === "number" ? String(n) : "—";
    const stats: Array<{ label: string; value: string }> = [
      { label: "Projects", value: figure(overview?.counts.topics) },
      { label: "Workstreams", value: figure(overview?.counts.axes) },
      { label: "Open tasks", value: figure(overview?.problemsByState.open) },
      { label: "Blocked tasks", value: figure(overview?.problemsByState.blocked) },
      { label: "Repositories", value: figure(overview?.counts.repositories) },
      { label: "People", value: figure(overview?.counts.people) },
    ];
    return (
      <details
        className="rd-panel rd-dashboard-summary"
        data-rd-dashboard-summary={overview ? "ready" : "loading"}
      >
        <summary>Dashboard summary</summary>
        <ul className="rd-stat-grid">
          {stats.map((stat) => (
            <li className="rd-stat" key={stat.label}>
              <span className="rd-stat-value">{stat.value}</span>
              <span className="rd-meta">{stat.label}</span>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  /**
   * Repository-first (C6, brought onto C1's composition by C5): what each codebase supports, what is happening
   * in it, and the entities it belongs to. The same rules as the person view — factual, never scored.
   *
   * C5 is a convergence pass, not a rebuild. The index/detail macro-layout is unchanged; the detail now uses the
   * shared `rd-detail-grid` — current work as the **dominant** lane with a rail beside it — the way the Topics
   * and People panels already do. The index row carries the prototype's two facts (the age of the last recorded
   * activity, and what the repository supports) and the head carries its age box. Nothing here is computed that
   * the rollup does not carry: `RepositoryRollup` holds no people and no note of its own, so People is
   * **derived** from the people rollup (D5's rule, and labelled when that rollup is truncated) and the
   * prototype's Notes card is **omitted with a marker**, because there is no repository-level note in the
   * payload to render.
   */
  function RepositoriesView({
    onOpenEntity,
    overviewTopics,
    people,
    peopleTruncated,
    preselect,
    repositories,
    truncated,
    windowDays,
  }: {
    onOpenEntity: (type: EntityType, id: string) => void;
    /**
     * V1b: the overview's own topics, read only to resolve a workstream's parent project name. The
     * repository rollup names the topics it links directly, but an axis can name a project the repository
     * is not filed under — so the group heading is resolved from the projection the page already holds
     * rather than guessed from the links, and no new backend field is introduced.
     */
    overviewTopics: TopicOverview[];
    /** D5: the people rollup, read only to derive this repository's people — never to assert one. */
    people: PersonRollup[];
    peopleTruncated: boolean;
    preselect: { id: string; seq: number } | null;
    repositories: RepositoryRollup[];
    truncated: boolean;
    windowDays: number;
  }) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    /**
     * The EntityTag contract's other half: a tag elsewhere in the app navigates here and *selects*, so the
     * view has to honour the request rather than only opening. Keyed on `seq` so the same repository asked for
     * twice still lands, and applied only when a tag asked — a reader's own click is never overridden.
     */
    React.useEffect(() => {
      if (preselect) {
        setSelectedId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq]);
    const selected =
      repositories.find((entry) => entry.repository.id === selectedId) ??
      repositories[0] ??
      null;

    // V1b — the repository's work, split by the one terminal predicate and grouped by parent project. The
    // nonterminal work reads in the dominant lane (parked and draft are neither completed nor abandoned, so
    // the heading names the nonterminal split rather than claiming "current"); the historical work folds
    // into a native disclosure. Both partitions group by the axis's parent project, whose name is resolved
    // from the overview's own topics (an axis may name a project the repository is not filed under, so the
    // links alone cannot name it). The direct topic links carry the *relationship* the projection records,
    // shown beside a group's intro only where such a link exists — an association is never invented for a
    // project the repository is not filed under.
    const { groups, historicalCount, nonterminalCount } =
      partitionRepositoryWorkstreams(selected?.axes ?? []);
    const topicNameById = new Map(
      overviewTopics.map((entry) => [entry.topic.id, entry.topic.name]),
    );
    const linkByTopic = new Map(
      (selected?.topics ?? []).map((link) => [link.topic.id, link]),
    );
    const nameFor = (topicId: string) =>
      topicNameById.get(topicId) ??
      linkByTopic.get(topicId)?.topic.name ??
      "Project name unavailable in this projection";
    const laneGroups = groups.filter((group) => group.nonterminal.length > 0);
    const foldGroups = groups.filter((group) => group.historical.length > 0);
    const laneTopicIds = new Set(laneGroups.map((group) => group.topicId));
    // Consolidation: a project represented by a work group already carries its own navigation, so the
    // sidebar lists only the *direct* topic links no work group represents — every relationship label and
    // every navigation target is still reachable exactly once.
    const groupedTopicIds = new Set(groups.map((group) => group.topicId));
    const sidebarTopics = (selected?.topics ?? []).filter(
      (link) => !groupedTopicIds.has(link.topic.id),
    );
    /**
     * A work group's intro: the project is named once as a heading, navigated once by the Open-project
     * action, and carries the *recorded* relationship beside the intro only where the repository is filed
     * directly under that project — an axis naming a project the repository is not filed under gets no
     * invented association.
     */
    const groupIntro = (topicId: string) => {
      const link = linkByTopic.get(topicId);
      return (
        <div className="rd-project-intro" data-rd-project-link={topicId}>
          <p className="rd-meta">Workstreams this repository supports.</p>
          {link ? (
            <span
              className="rd-meta"
              data-rd-project-relationship={link.relationship}
            >
              {link.relationship}
            </span>
          ) : null}
          <Button
            onClick={() => onOpenEntity("topic", topicId)}
            size="sm"
            variant="outline"
          >
            Open project →
          </Button>
        </div>
      );
    };
    /**
     * The shared work cards for a group, in its own recorded order. The repository context suppresses only
     * the panel's own subject's name on each card; the card's state, counts, latest event and every *other*
     * supporting repository are retained.
     */
    const groupCards = (axes: AxisScan[]) =>
      axes.map((axis) => (
        <WorkstreamCard
          axis={{
            id: axis.id,
            repositories: axis.repositories,
            state: axis.state,
            stateConfidence: axis.stateConfidence,
            title: axis.title,
          }}
          context={{ repositoryId: selected?.repository.id ?? "", view: "repository" }}
          key={axis.id}
          onOpenEntity={onOpenEntity}
          onOpenWorkstream={(axisId) => onOpenEntity("axis", axisId)}
        />
      ));
    // D5: the people on this repository, derived from the people rollup's own axes (an axis carries the
    // repositories it names). When that rollup is truncated the card says so rather than presenting a bounded
    // subset as the whole list.
    const repositoryPeople = people.filter((entry) =>
      entry.axes.some((axis) =>
        axis.repositories.some((link) => link.id === selected?.repository.id)
      )
    );

    if (repositories.length === 0) {
      return (
        <Card>
          <CardContent>
            <p className="rd-muted">
              No repository is attached yet. A topic or an axis names one and it
              appears here.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="rd-split" data-rd-view="repositories">
        <ViewHeading view="repositories" />
        <ul
          className="rd-index"
          data-rd-repositories={repositories.length}
          data-rd-repositories-truncated={truncated}
        >
          {repositories.map((entry) => (
            <li key={entry.repository.id}>
              <button
                aria-pressed={selected?.repository.id === entry.repository.id}
                className="rd-index-item"
                data-rd-repository={entry.repository.fullName}
                data-rd-repository-id={entry.repository.id}
                onClick={() => setSelectedId(entry.repository.id)}
                type="button"
              >
                {/* V1/A4 — the shared index-row grammar: the title takes the row's full width, and the age
                    moves down to the line that already carries the row's other quiet facts. */}
                <span className="rd-strong">{entry.repository.fullName}</span>
                <span className="rd-meta" data-rd-repository-line="true">
                  {supportsLine(entry)}
                  {" · "}
                  <RecencyLabel at={entry.lastActivityAt} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <details
            className="rd-panel rd-topic-detail"
            data-rd-detail-header="true"
            data-rd-detail-mode="disclosure"
            data-rd-repository-panel={selected.repository.fullName}
            open
          >
            <summary className="rd-topic-summary">
              <DetailHeader
                badge={
                  /* The prototype's age box: how stale this is, before any of the detail, in the title row
                     where it reads. The marker the previous composition carried moves with it. The label is
                     "related activity" because the repository's recency is a union of its own events and those
                     recorded against its associated workstreams (never its projects); the quiet note beside
                     it states that scope, always, so the age is never read as this repository's own events
                     alone. */
                  <span className="rd-cluster" data-rd-repository-last="true">
                    {selected.lastActivityAt ? (
                      <RecencyLabel at={selected.lastActivityAt} prefix="related activity " />
                    ) : (
                      <span className="rd-muted">no activity recorded yet</span>
                    )}
                    <span className="rd-meta" data-rd-repository-recency-note="true">
                      Recency includes repository and associated workstream events.
                    </span>
                  </span>
                }
                context={
                  /* C5, narrowed by the V1-B/B2 review and V1b: the header states the repository's own
                     workstream total as quiet metadata only. Its supporting projects are navigation now —
                     each is named and navigated once in its work group or the "Other project links" card —
                     so the header carries no project tags. */
                  selected.axes.length > 0 ? (
                    <span className="rd-meta">
                      {countLabel(selected.axes.length, "workstream", "workstreams")}
                    </span>
                  ) : null
                }
                title={<CardTitle>{selected.repository.fullName}</CardTitle>}
              >
                <span className="rd-meta" data-rd-repository-description="true">
                  {selected.repository.description || "no description recorded"}
                </span>
                {/* The description footer: the default branch as separate metadata on the left, and the
                    repository's **actual external URL** as the GitHub ↗ destination on the lower right —
                    distinct from the internal dashboard entry the WorkstreamCard repository names open. */}
                <div className="rd-context-footer">
                  <span className="rd-meta" data-rd-repository-branch="true">
                    {selected.repository.defaultBranch
                      ? `Default branch · ${selected.repository.defaultBranch}`
                      : "Default branch · not recorded"}
                  </span>
                  {selected.repository.url ? (
                    <a
                      aria-label={`Open ${selected.repository.fullName} on GitHub`}
                      className="rd-repo-ext"
                      data-rd-repository-url="true"
                      href={selected.repository.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      title={`Open ${selected.repository.fullName} on GitHub`}
                    >
                      GitHub ↗
                    </a>
                  ) : null}
                </div>
              </DetailHeader>
            </summary>
            <div className="rd-topic-body">
              {/* C5 convergence: the shared detail grid. The repository's current supported work is the dominant
                  lane; everything else is a rail beside it — the composition the Topics and People panels
                  already use, and the reason the panel no longer reads as four equal stacked sections. */}
              <div className="rd-detail-grid" data-rd-repository-split="true">
                <section
                  className="rd-current-work"
                  data-rd-repository-current={nonterminalCount}
                  data-rd-repository-lane="current"
                >
                  {/* V1b terminology closure: the lane holds the *nonterminal* workstreams — parked and
                      draft are neither completed nor abandoned — and its heading states the lane's own
                      count, exactly as the Progress panel's "Tasks (N)" heading does. The heading names the
                      workstreams it holds rather than the partition, so "nonterminal" reads only where the
                      contrast matters: the fold below, which is the completed-and-abandoned work. */}
                  <span className="rd-section">{`Workstreams (${nonterminalCount})`}</span>
                  {selected.axes.length === 0 ? (
                    <p className="rd-muted">
                      No workstream names this repository yet.
                    </p>
                  ) : (
                    <div data-rd-repository-axes={selected.axes.length}>
                      {nonterminalCount === 0 ? (
                        <p className="rd-muted">
                          No workstreams in this section.
                        </p>
                      ) : null}
                      {laneGroups.map((group) => (
                        <section
                          className="rd-project-group"
                          key={group.topicId}
                        >
                          <div className="rd-project-heading">
                            {nameFor(group.topicId)}
                          </div>
                          {groupIntro(group.topicId)}
                          {groupCards(group.nonterminal)}
                        </section>
                      ))}
                      {historicalCount > 0 ? (
                        <details
                          className="rd-completed-fold"
                          data-rd-repository-folded={historicalCount}
                        >
                          <summary>
                            Completed and abandoned work ({historicalCount})
                          </summary>
                          {foldGroups.map((group) => (
                            <section
                              className="rd-project-group"
                              key={group.topicId}
                            >
                              <div className="rd-project-heading">
                                {nameFor(group.topicId)}
                              </div>
                              {/* The project's nav lives once: a group already stated in the lane does
                                  not repeat it here, so the fold navigates only the projects it alone
                                  holds — every parent target is still one click away. */}
                              {laneTopicIds.has(group.topicId)
                                ? null
                                : groupIntro(group.topicId)}
                              {groupCards(group.historical)}
                            </section>
                          ))}
                        </details>
                      ) : null}
                    </div>
                  )}
                </section>

                <aside className="rd-side-stack">
                  <section className="rd-side-card">
                    <h3 className="rd-side-title">Repository-scoped activity</h3>
                    {/* V1b: this feed is the *directly* scoped page — events recorded against this
                        repository itself. Events associated with its workstreams (and projects) live on
                        those entities, so an empty here is not a claim that nothing related happened; the
                        empty text says exactly that, and names only workstream events — recency is never
                        asserted to include project events. */}
                    <PagedActivityFeed
                      countAttr="data-rd-repository-activity"
                      dataAttr="data-rd-repository-activity-list"
                      emptyText="No directly scoped events recorded. Related workstream events may still exist."
                      key={selected.repository.id}
                      labelFor={(item) => ({
                        axis:
                          selected.axes.find((axis) => axis.id === item.axisId)?.title ?? null,
                        topic:
                          selected.topics.find((link) => link.topic.id === item.topicId)?.topic
                            .name ?? null,
                      })}
                      onOpenEntity={onOpenEntity}
                      scope={{ repositoryId: selected.repository.id }}
                    />
                  </section>

                  {/* Consolidation: a direct topic link whose project is already a work group is named and
                      navigated in that group, so this card lists only the links no work group represents —
                      every link stays reachable, nothing is listed twice. When that leaves nothing to show
                      *and* the repository does link projects, the card is not rendered at all rather than
                      standing empty; when the repository links no project it stays, with its empty notice.
                      It is "Other project links" whenever some links were consolidated into groups, and the
                      plain "Supports" only when every link is a direct one. */}
                  {sidebarTopics.length > 0 || selected.topics.length === 0 ? (
                    <section className="rd-side-card">
                      <h3 className="rd-side-title">
                        {sidebarTopics.length === selected.topics.length
                          ? "Supports"
                          : "Other project links"}
                      </h3>
                      <ul
                        className="rd-view"
                        data-rd-repository-topics={sidebarTopics.length}
                      >
                        {sidebarTopics.map((link) => (
                          <li
                            className="rd-cluster"
                            data-rd-project-link={link.topic.id}
                            key={link.topic.id}
                          >
                            <EntityTag
                              compact
                              id={link.topic.id}
                              label={link.topic.name}
                              onOpen={onOpenEntity}
                              type="topic"
                            />
                            <span
                              className="rd-muted"
                              data-rd-project-relationship={link.relationship}
                            >
                              · {link.relationship}
                            </span>
                          </li>
                        ))}
                        {selected.topics.length === 0 ? (
                          <li>
                            <Notice kind="empty">no topic names it yet</Notice>
                          </li>
                        ) : null}
                      </ul>
                    </section>
                  ) : null}

                  {/* D5: the rollup carries no people of its own, so this is derived truthfully from the
                      people rollup's axes (each axis carries the repositories it names) — never invented.
                      It *collapses* only when the derivation is complete and finds nothing (a repository with
                      no linked person does not get a prototype-shaped empty card). While that rollup is
                      truncated the card stays, saying so **even when the derived list is empty** — an empty
                      list under a truncated rollup is not the same fact as an empty list under a complete
                      one, and presenting the two the same way is exactly the coverage claim we must not
                      make. */}
                  {repositoryPeople.length > 0 || peopleTruncated ? (
                    <section className="rd-side-card" data-rd-repository-people={repositoryPeople.length}>
                      <h3 className="rd-side-title">People</h3>
                      {/* The card's scope, stated once: this derives people through the workstreams those
                          people hold on this repository, not through the repository's own people field. */}
                      <p className="rd-meta">People linked through supporting workstreams.</p>
                      {repositoryPeople.length === 0 ? (
                        <Notice kind="empty">
                          No workstream-linked people in this projection.
                        </Notice>
                      ) : (
                        <div className="rd-cluster rd-tags">
                          {repositoryPeople.map((entry) => (
                            <EntityTag
                              id={entry.person.id}
                              key={entry.person.id}
                              label={entry.person.displayName}
                              onOpen={onOpenEntity}
                              type="person"
                            />
                          ))}
                        </div>
                      )}
                      {peopleTruncated ? (
                        <Notice kind="truncated">
                          the people rollup is truncated, so this list may be partial
                        </Notice>
                      ) : null}
                    </section>
                  ) : null}

                  {/* The prototype's Notes card is **omitted**, not faked: `RepositoryRollup` carries no
                      repository-level note (notes belong to a topic and the topic panel renders them). The
                      marker makes the absence a check rather than an oversight — the D4 pattern. */}
                  <div className="rd-row" data-rd-repository-notes-omitted="true" />
                </aside>
              </div>
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  /**
   * The Progress view, ported to the accepted prototype: a shared-width workstream selector rail grouped
   * under muted project headings, and the selected workstream's **full** context in the main column — its
   * enduring purpose and its current reading, its blocker, its scoped plan, and its tasks as always-visible
   * cards (concise title, full statement, status, the task's own plan and its supporting repositories).
   * Tasks and activity are each paged five at a time by the shared numbered pager; a list that fits one page
   * shows no control at all. Nothing here writes — selection is view state.
   */
  function ProgressView({
    activityOffset,
    activityPage,
    busy,
    conflict,
    correction,
    loading,
    onActivityOffset,
    onCorrection,
    onOpenEntity,
    onReloadCorrection,
    onSaveCorrection,
    onSelectWorkstream,
    onTaskOffset,
    progress,
    selection,
    taskOffset,
    taskPage,
    workstream,
  }: {
    activityOffset: number;
    /** The backend page of this workstream's activity (`activityPage`), or null when not offered. */
    activityPage: Page<Activity> | null;
    busy: boolean;
    conflict: ConflictState;
    /** The correction draft in flight for the selected workstream, or null. */
    correction: AxisCorrection | null;
    loading: boolean;
    onActivityOffset: (next: number) => void;
    onCorrection: (next: AxisCorrection | null) => void;
    onOpenEntity: (type: EntityType, id: string) => void;
    onReloadCorrection: () => void;
    onSaveCorrection: () => void;
    onSelectWorkstream: (topicId: string, axisId: string) => void;
    onTaskOffset: (next: number) => void;
    progress: ProgressIndex | null;
    selection: { axisId: string; topicId: string } | null;
    taskOffset: number;
    /** The backend page of this workstream's tasks, enriched (`taskPage`), or null when not offered. */
    taskPage: Page<WorkstreamTask> | null;
    workstream: AxisWorkstream | null;
  }) {
    // The rail: every workstream, grouped under its project's name (a muted heading, no tree indentation).
    // Grouping preserves the projection's own first-appearance order and re-sorts nothing.
    const axisRows = progress?.axes.axes ?? [];
    const groups: Array<{ name: string; rows: ProgressAxisRow[] }> = [];
    const groupAt = new Map<string, number>();
    for (const row of axisRows) {
      const at = groupAt.get(row.topicId);
      if (at === undefined) {
        groupAt.set(row.topicId, groups.length);
        groups.push({ name: row.topicName, rows: [row] });
      } else {
        groups[at].rows.push(row);
      }
    }

    const axis = workstream?.axis ?? null;
    // The visible task cards read the **backend page** (`problemPage`, enriched), scoped to this axis; the
    // read's own `axis.problems` array stays beside it for compatibility and for the direct-navigation
    // index, but it never draws the page. A responder that carries no page (a legacy read) falls back to a
    // client slice of the same array — same rows, same order, one code path.
    const tasks = axis?.problems ?? [];
    const taskTotal = taskPage ? taskPage.total : tasks.length;
    const taskShown = taskPage
      ? taskPage.items
      : tasks.slice(taskOffset, taskOffset + PROGRESS_PAGE_SIZE);
    // One activity list, two sources: the backend page when the read offers it, else the read's own
    // activity list (the store builds `axis.history`) paged client-side. Totals and rows come from the
    // same scoped dataset either way.
    const activityAll = axis?.history ?? [];
    const activityItems = activityPage
      ? activityPage.items
      : activityAll.slice(activityOffset, activityOffset + PROGRESS_PAGE_SIZE);
    const activityTotal = activityPage ? activityPage.total : activityAll.length;
    const axisRepositories = axis?.repositories ?? [];
    // The projection's own recorded evidence for the selected workstream (`axisEvidence`, capped per
    // source). The disclosure's count is this array's length, so it is labelled as the evidence *shown*
    // rather than presented as the workstream's exact total (see `progressEvidenceSummary`).
    const evidence = axis?.evidence ?? [];
    const correcting = correction != null && correction.axisId === axis?.id;
    const projectName =
      workstream?.topic.name ??
      groups.find((group) =>
        group.rows.some((row) => row.id === selection?.axisId)
      )?.name ??
      "Not recorded";

    return (
      <div className="rd-stack" data-rd-view="progress">
        <ViewHeading view="progress" />
        <div className="rd-split rd-progress-top" data-rd-progress-top="true">
          <ul
            className="rd-index rd-progress-index"
            data-rd-progress-index="true"
            data-rd-progress-index-rows={axisRows.length}
            data-rd-progress-index-window={progress?.axes.activitySinceDays ?? 0}
          >
            {groups.map((group) => (
              <li className="rd-project-group" key={group.rows[0]?.topicId ?? group.name}>
                <div className="rd-project-heading">{group.name}</div>
                <ul className="rd-index-list">
                  {group.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        aria-pressed={selection?.axisId === row.id}
                        className="rd-index-item"
                        data-rd-index-axis={row.id}
                        data-rd-index-open-problems={row.openProblems}
                        data-rd-index-problems={row.problems}
                        data-rd-index-recency={row.recencyAt ?? ""}
                        data-rd-index-state={row.state}
                        data-rd-index-topic={row.topicName}
                        onClick={() => onSelectWorkstream(row.topicId, row.id)}
                        type="button"
                      >
                        <span className="rd-cluster">
                          <span
                            aria-hidden="true"
                            className="rd-status-dot"
                            data-rd-state={row.state}
                          />
                          <span className="rd-strong">{row.title}</span>
                        </span>
                        <span className="rd-meta">
                          <StateBadge
                            confidence={row.stateConfidence}
                            state={row.state}
                          />
                          {` · ${countLabel(row.openProblems, "open task", "open tasks")}`}
                          {row.plan ? "" : " · No plan"}
                          {row.recencyAt ? ` · ${describeAge(row.recencyAt)}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {axisRows.length === 0 ? (
              <li className="rd-muted" data-rd-progress-index-empty="true">
                No workstreams yet.
              </li>
            ) : null}
          </ul>

          <div
            className="rd-progress-detail"
            data-rd-progress-detail="true"
            data-rd-progress-detail-axis={selection?.axisId ?? ""}
          >
            {!selection ? (
              <p className="rd-muted" data-rd-progress-empty="true">
                Select a workstream to read its context, scoped plan and tasks.
              </p>
            ) : null}
            {selection && !axis && loading ? (
              <p className="rd-muted" data-rd-progress-loading="true">
                Loading this workstream…
              </p>
            ) : null}
            {selection && axis ? (
              /* V2 correction — the selected body is keyed by the axis. A **different** workstream
                 remounts the body, so every native disclosure inside it (Purpose, evidence, activity,
                 the workstream plan) returns to its own default. Ordinary **same-axis** pagination keeps
                 the same key, so the DOM `<details>` elements are reused and a reader's own open/closed
                 disclosures are never re-closed under them. The correction draft/conflict reload and
                 save handlers live in the page state above, so nothing the reader typed is lost. */
              <React.Fragment key={axis.id}>
                {/* V2b — the compact header leads: title + state, then the current reading and (where
                    there is one) the blocker in full, each with its own confidence badge. The enduring
                    purpose is one native disclosure away and the axis's own people are stated explicitly;
                    the workstream plan, activity, evidence, provenance and maintenance all follow the
                    tasks below. */}
                <section
                  className="rd-context-panel"
                  data-rd-context-panel={axis.id}
                >
                  <div className="rd-work-head">
                    <h3
                      className="rd-work-title"
                      data-rd-progress-detail-title="true"
                    >
                      {axis.title}
                    </h3>
                    <StateBadge
                      confidence={axis.stateConfidence}
                      state={axis.state}
                    />
                  </div>
                  <div className="rd-context-body" data-rd-progress-context="true">
                    <span className="rd-context-label">Current reading</span>
                    <p className="rd-claim-value" data-rd-axis-reading="true">
                      {axis.currentState ? (
                        <>
                          {axis.currentState}
                          <ConfidenceBadge value={axis.currentStateConfidence} />
                        </>
                      ) : (
                        <span className="rd-muted">
                          No current reading recorded.
                        </span>
                      )}
                    </p>
                    {axis.blocker ? (
                      <>
                        <span className="rd-context-label">Blocker</span>
                        <p className="rd-claim-value" data-rd-axis-blocker="true">
                          {axis.blocker}
                          <ConfidenceBadge value={axis.blockerConfidence} />
                        </p>
                      </>
                    ) : null}
                  </div>
                  <details
                    className="rd-context-more"
                    data-rd-progress-context-more="true"
                  >
                    <summary className="rd-context-label">Purpose</summary>
                    <p className="rd-claim-value" data-rd-axis-description="true">
                      {axis.description ? (
                        axis.description
                      ) : (
                        <span className="rd-muted">
                          No workstream purpose recorded.
                        </span>
                      )}
                    </p>
                  </details>
                  <Participants onOpen={onOpenEntity} people={axis.people} />
                </section>

                <section
                  className="rd-progress-tasks"
                  data-rd-progress-tasks={taskTotal}
                >
                  <div className="rd-row">
                    <span className="rd-section">{`Tasks (${taskTotal})`}</span>
                  </div>
                  {taskTotal === 0 ? (
                    <p className="rd-muted" data-rd-progress-tasks-empty="true">
                      No tasks recorded for this workstream.
                    </p>
                  ) : (
                    <>
                      <div className="rd-task-list">
                        {taskShown.map((task) => (
                          <article
                            className="rd-task-card"
                            data-rd-task-card={task.id}
                            data-rd-task-state={task.state}
                            key={task.id}
                          >
                            <div className="rd-work-head">
                              <h4 className="rd-task-title">
                                {task.title || task.statement}
                              </h4>
                              <StateBadge
                                confidence={task.stateConfidence}
                                state={task.state as ProblemState}
                              />
                            </div>
                            {task.title && task.title !== task.statement ? (
                              <p className="rd-task-statement">{task.statement}</p>
                            ) : null}
                            <span className="rd-meta" data-rd-task-facts="true">
                              {task.authorType === "human"
                                ? "owner-authored"
                                : "librarian-inferred"}
                              {task.planStepTitle
                                ? ` · step: ${task.planStepTitle}`
                                : ""}
                            </span>
                            <ScopedPlan label="Task plan" plan={task.plan} />
                            {task.repositories.length > 0 ? (
                              <div className="rd-cluster rd-tags">
                                <span className="rd-meta">
                                  Supporting repositories ·
                                </span>
                                {task.repositories.map((repository) => (
                                  <RepoLinkPair
                                    key={repository.id}
                                    onOpen={onOpenEntity}
                                    repository={repository}
                                  />
                                ))}
                              </div>
                            ) : null}
                            <Participants
                              onOpen={onOpenEntity}
                              people={task.people}
                            />
                          </article>
                        ))}
                      </div>
                      <Pager
                        label="Tasks"
                        offset={taskOffset}
                        onOffset={onTaskOffset}
                        pageSize={PROGRESS_PAGE_SIZE}
                        total={taskTotal}
                      />
                    </>
                  )}
                </section>

                {/* V2b — evidence is a secondary native disclosure, after the tasks, read straight off the
                    axis's own recorded `evidence` set (the same set the store's write rule accepts for a
                    `confirmed` claim). The summary states the count of evidence *shown*, because the
                    projection is capped per source and is not the workstream's exact total; the body lists
                    each reference with its own label, its author where one is named, and its actual stored
                    `sourceUrl` where there is one — never a guessed destination — or its recorded source
                    ref where there is not. The explicit no-evidence sentence is preserved verbatim, and the
                    confidence distinctions stay on the reading/blocker claims in the compact header, not
                    here. */}
                <details
                  className="rd-progress-evidence"
                  data-rd-axis-evidence={evidence.length}
                  data-rd-has-evidence={evidence.length > 0}
                  data-rd-progress-evidence={evidence.length}
                >
                  <summary>{progressEvidenceSummary(evidence.length)}</summary>
                  {evidence.length > 0 ? (
                    <ul
                      className="rd-evidence-list"
                      data-rd-evidence-list="true"
                    >
                      {evidence.map((item, index) => (
                        <li
                          key={`${item.sourceRef}-${index}`}
                          data-rd-evidence-ref={item.sourceRef || String(index)}
                        >
                          <span className="rd-strong">{item.label}</span>
                          {item.by ? (
                            <span className="rd-meta">{` · ${item.by}`}</span>
                          ) : null}
                          {item.sourceUrl ? (
                            <a
                              className="rd-repo-ext"
                              data-rd-evidence-url={item.sourceRef || String(index)}
                              href={item.sourceUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                              title={item.sourceUrl}
                            >
                              source ↗
                            </a>
                          ) : (
                            <span
                              className="rd-meta"
                              data-rd-evidence-no-url="true"
                            >
                              {item.sourceRef || item.sourceType}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rd-muted" data-rd-evidence-empty="true">
                      {PROGRESS_NO_EVIDENCE_TEXT}
                    </p>
                  )}
                </details>

                {/* V2b — the workstream's own scoped plan, collapsed by default: its summary is the route
                    and every stored step is retained. A **task's** own plan keeps its existing default open
                    (`ScopedPlan`'s `defaultOpen` default), so only the workstream-level call changes. */}
                {axis.plan ? (
                  <div data-rd-progress-plan="true">
                    <ScopedPlan
                      defaultOpen={false}
                      label="Workstream plan"
                      plan={axis.plan}
                    />
                  </div>
                ) : null}

                {/* V2b — recent activity is a native disclosure, collapsed by default, its exact scoped
                    total stated in the summary; the rows and the backend Pager are the existing scoped
                    ones (unchanged handlers, exact total, five per page). */}
                <details
                  className="rd-progress-activity"
                  data-rd-progress-activity="true"
                  data-rd-progress-activity-total={activityTotal}
                >
                  <summary>{progressActivitySummary(activityTotal)}</summary>
                  {activityItems.length === 0 ? (
                    <p className="rd-muted" data-rd-progress-feed-empty="true">
                      Nothing recorded against this workstream.
                    </p>
                  ) : (
                    <ul className="rd-feed" data-rd-progress-feed={activityTotal}>
                      {activityItems.map((item) => (
                        <ActivityLine
                          attrs={{ "data-rd-feed-event": item.id }}
                          item={item}
                          key={item.id}
                          onOpenEntity={onOpenEntity}
                          topicLabel={workstream?.topic.name ?? null}
                          unattributedNote="no account attributed"
                        />
                      ))}
                    </ul>
                  )}
                  {activityTotal > 0 ? (
                    <Pager
                      label="Activity"
                      offset={activityOffset}
                      onOffset={onActivityOffset}
                      pageSize={PROGRESS_PAGE_SIZE}
                      total={activityTotal}
                    />
                  ) : null}
                </details>

                {/* V2b — provenance: the workstream's explicit supporting-repository links, secondary and
                    after the tasks, unchanged in substance from the context panel they used to sit in. */}
                {axisRepositories.length > 0 ? (
                  <div
                    className="rd-cluster rd-tags"
                    data-rd-context-repositories={axisRepositories.length}
                    data-rd-progress-provenance="true"
                  >
                    <span className="rd-meta">Supporting repositories ·</span>
                    {axisRepositories.map((repository) => (
                      <RepoLinkPair
                        key={repository.id}
                        onOpen={onOpenEntity}
                        repository={repository}
                      />
                    ))}
                  </div>
                ) : null}

                {/* V2b — maintenance is secondary and after the tasks: the correction control and the
                    retained Return to project live here. The correction form is **never** hidden behind a
                    closed fold — a currently open correction stays open (this block renders whenever a
                    draft is in flight), and the draft/conflict/reload/save handlers are unchanged. */}
                <section
                  className="rd-progress-maintenance"
                  data-rd-progress-maintenance="true"
                >
                  <div className="rd-row">
                    <span className="rd-section">Maintenance</span>
                    <span className="rd-meta">{`Project · ${projectName}`}</span>
                  </div>
                  <div className="rd-cluster">
                    <Button
                      data-rd-correct-toggle={axis.id}
                      disabled={busy}
                      onClick={() => {
                        if (correcting) {
                          onCorrection(null);
                          return;
                        }
                        onCorrection(draftFrom(axis));
                      }}
                      size="sm"
                      variant={correcting ? "default" : "outline"}
                    >
                      {correcting ? "Cancel" : "Correct"}
                    </Button>
                    <Button
                      data-rd-return-project={workstream?.topic.id ?? selection.topicId}
                      onClick={() =>
                        onOpenEntity(
                          "topic",
                          workstream?.topic.id ?? selection.topicId
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      Return to project →
                    </Button>
                  </div>
                </section>

                {correcting && correction ? (
                  <WorkstreamCorrection
                    axis={axis}
                    busy={busy}
                    conflict={conflict}
                    correction={correction}
                    onCorrection={onCorrection}
                    onReload={onReloadCorrection}
                    onSave={onSaveCorrection}
                  />
                ) : null}
              </React.Fragment>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function ResearchPage() {
    const [loadedOverview, setOverview] = React.useState<Overview | null>(null);
    const [loadedScope, setLoadedScope] = React.useState<number | null>(null);
    /**
     * The selected tab. **Projects** (`"topics"`) is the default landing and one of the four peers —
     * Overview is retired, so there is no unselected state. Choosing a tab or following a tag sets it.
     */
    const [view, setView] = React.useState<ViewName>("topics");
    /**
     * The entity a cross-view tag asked for, and how many times it has asked. `seq` is what makes a second
     * click on the same tag land again after the reader selected something else by hand — without it the
     * request would look unchanged and the effect that applies it would not run.
     */
    const [entityTarget, setEntityTarget] = React.useState<{
      id: string;
      seq: number;
      type: EntityType;
    } | null>(null);
    /**
     * The EntityTag contract's page half, in one place: a tag names an entity, the app navigates to that
     * entity's canonical view and selects it. It is never a filter and it writes nothing — the destination's own
     * selection (a row, or Progress's axis/problem and its subview) is the only state it touches, and `seq`
     * makes a second click on the same tag land again after a hand-made selection.
     */
    function openEntity(type: EntityType, id: string): void {
      setEntityTarget({ id, seq: (entityTarget?.seq ?? 0) + 1, type });
      setView(ENTITY_VIEW[type]);
    }

    /**
     * Overview is retired, so the window control went with it: every tab reads **all time**
     * (`activitySinceDays: 0`). The store treats `activitySinceDays` as a parameter, not stored state.
     */
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    /**
     * A topic tag's destination is the topic index, where "selected" means the card is expanded — the detail is
     * what makes a topic the subject of the page. Applied here rather than inside a view because the topic index
     * and its detail are one screen. Keyed on `seq` for the second-click case, like every other destination.
     */
    React.useEffect(() => {
      if (entityTarget?.type === "topic") {
        setExpandedId(entityTarget.id);
      }
    }, [entityTarget?.id, entityTarget?.seq, entityTarget?.type]);
    const [detail, setDetail] = React.useState<TopicDetail | null>(null);
    /**
     * The selected project's activity **page**, straight from the backend (`get_topic` with an
     * `offset`/`pageSize`). The topic-wide `activity` array still arrives beside it for compatibility,
     * but the pager reads this page — the offset the reader asked for, one `LIMIT ? OFFSET ?` at the
     * backend — never a client slice of the array. Null until the first paged read lands.
     */
    const [topicActivityPage, setTopicActivityPage] = React.useState<
      Page<Activity> | null
    >(null);
    const [topicActivityOffset, setTopicActivityOffset] = React.useState(0);
    /**
     * The Progress index, straight from `get_progress`. Held here rather than inside the view for the same
     * reason the window is: it is scoped by the window, and it is replaced whole on every window change.
     */
    const [progress, setProgress] = React.useState<ProgressIndex | null>(null);
    /**
     * The Progress view's selected workstream and its scoped read. The selection is `{topicId, axisId}` view
     * state (it writes nothing); `get_progress` supplies the rail, and the scoped `get_topic({topicId,
     * axisId})` supplies the workstream's full context (purpose, current reading, blocker, plan) and its
     * tasks, plus the backend `activityPage` for the workstream's own activity.
     */
    const [progressSelection, setProgressSelection] = React.useState<{
      axisId: string;
      topicId: string;
    } | null>(null);
    const [workstream, setWorkstream] = React.useState<AxisWorkstream | null>(null);
    const [workstreamActivity, setWorkstreamActivity] = React.useState<
      Page<Activity> | null
    >(null);
    /** The workstream's task page, enriched (`problemPage`) — what the visible task cards read. */
    const [workstreamTask, setWorkstreamTask] = React.useState<
      Page<WorkstreamTask> | null
    >(null);
    const [workstreamLoading, setWorkstreamLoading] = React.useState(false);
    /** Independent page offsets: tasks and activity page separately, each five at a time. */
    const [taskOffset, setTaskOffset] = React.useState(0);
    const [activityOffset, setActivityOffset] = React.useState(0);
    const [correction, setCorrection] = React.useState<AxisCorrection | null>(
      null
    );
    const [topicNote, setTopicNote] = React.useState("");
    const [conflict, setConflict] = React.useState<ConflictState>(null);
    const [activitySummary, setActivitySummary] = React.useState("");
    const [activitySourceType, setActivitySourceType] =
      React.useState("github_pr");
    const [activitySourceRef, setActivitySourceRef] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");

    async function call<T extends { ok?: boolean; error?: string }>(
      action: string,
      input?: unknown,
      options?: { conflictAxisId?: string; isStale?: () => boolean }
    ): Promise<T | null> {
      setBusy(true);
      setError("");
      try {
        const result = (await ctx.host.call(action, input)) as T;
        if (ctx.signal.aborted) {
          return null;
        }
        if (result && result.ok === false) {
          // A response superseded by a newer selection/offset is not news about what the reader is
          // looking at: it must not raise an error over the state the newer request is establishing.
          if (options?.isStale?.()) {
            return null;
          }
          const message = result.error ?? "The request was rejected.";
          // A stale write is its own case: it is reported where the person was working, with a
          // re-read, and it is never papered over by a retry. Anything else is an ordinary error.
          // Neither of them clears a conflict already on screen — only a successful save, a re-read
          // or a change of subject does that.
          if (message.startsWith("conflict:")) {
            setConflict({ axisId: options?.conflictAxisId ?? null, message });
          } else {
            setError(message);
          }
          return null;
        }
        return result;
      } catch (cause) {
        if (!ctx.signal.aborted && !options?.isStale?.()) {
          setError(String((cause as Error)?.message ?? cause));
        }
        return null;
      } finally {
        if (!ctx.signal.aborted) {
          setBusy(false);
        }
      }
    }

    /**
     * The tab's read. Overview scopes its query by the window its own heading offers; every other tab reads
     * **all time** (`activitySinceDays: 0`), so a reader never wonders whether work fell outside a window
     * they could not see. The store treats `activitySinceDays` as a parameter, not stored state, so this is
     * one call shape with one field changing.
     *
     * `get_overview` supplies the Topics/People/Repositories context and `get_progress` supplies the
     * Progress state. Both reads use the current tab's scope and share one generation counter: a slower
     * earlier load must not overwrite a newer one.
     */
    const loadSeq = React.useRef(0);
    /**
     * Generation counters for the scoped reads, the same guard shape `loadSeq` uses for the tab
     * projections. Every `loadWorkstream` invocation bumps `workstreamSeq` and only the newest may commit
     * its axis, its task page and its activity page; every `loadDetail` invocation bumps `detailSeq` and
     * only the newest may commit the project detail and its activity page. So a slower response from a
     * previous selection or a previous pager offset can never overwrite a newer one — the A-slow/B-fast
     * selection race and the rapid task/activity pager races both commit the response the reader last
     * asked for, and nothing else. Each call carries both current offsets, so both pages stay correct.
     */
    const workstreamSeq = React.useRef(0);
    const detailSeq = React.useRef(0);
    /**
     * Every tab reads **all time** (`activitySinceDays: 0`) now that Overview — the only window-scoped tab
     * — is retired. A constant, so switching tabs never re-queries.
     */
    const scopeWindow = 0;
    // Never render a previous window's projection under a newly selected tab/window.
    const overview = loadedScope === scopeWindow ? loadedOverview : null;
    const visibleProgress = loadedScope === scopeWindow ? progress : null;

    async function load(nextWindow: number): Promise<void> {
      const seq = ++loadSeq.current;
      const scope = { activitySinceDays: nextWindow };
      const result = await call<{ ok?: boolean } & Overview>("get_overview", scope);
      if (loadSeq.current !== seq || ctx.signal.aborted) {
        return;
      }
      const progressResult = await call<{ ok?: boolean } & ProgressIndex>("get_progress", scope);
      if (loadSeq.current !== seq || ctx.signal.aborted) {
        return;
      }
      // Commit the two projections together; never pair a new Overview with the old Progress index.
      setOverview(result ? (result as Overview) : null);
      // Replaced wholesale, never merged: the index is the projection for *this* scope, and a row kept
      // from the previous result would be a client-side model the projection never answered for.
      setProgress(progressResult ? (progressResult as ProgressIndex) : null);
      setLoadedScope(nextWindow);
    }

    /**
     * Reload the tab currently on screen — the one call shape the Refresh button, a successful save and a
     * recorded activity all use, so a write never re-reads a scope the reader is not looking at.
     */
    function reloadCurrent(): Promise<void> {
      // A refresh (or a write) re-reads the workstream the reader is looking at, at both page offsets they
      // are on, so the selected context does not go stale behind a global reload.
      if (progressSelection) {
        void loadWorkstream(progressSelection, taskOffset, activityOffset);
      }
      return load(scopeWindow);
    }

    /**
     * Read one workstream's task page and activity page. The scoped
     * `get_topic({topicId, axisId, offset, pageSize})` returns the axis in full (its plan and its tasks)
     * plus the backend `activityPage` **and** the enriched `problemPage` — both for the one `offset` sent.
     * The two pagers are independent, so each page state issues **its own** request at **its own** offset:
     * the task pager asks with `taskOffset`, the activity pager with `activityOffset`, and each response's
     * page is committed only under the pager that asked for it. `items` and `total` come from one
     * axis-scoped snapshot, so the page and its count agree.
     *
     * Returns the axis it landed on so a caller can rebuild a draft from the refreshed facts.
     */
    async function loadWorkstream(
      selection: { axisId: string; topicId: string },
      nextTaskOffset: number,
      nextActivityOffset: number
    ): Promise<AxisDetail | null> {
      const seq = ++workstreamSeq.current;
      const stale = () => workstreamSeq.current !== seq;
      setWorkstreamLoading(true);
      type WorkstreamRead = {
        activityPage?: Page<Activity>;
        axes?: AxisDetail[];
        axis?: AxisDetail;
        ok?: boolean;
        problemPage?: Page<WorkstreamTask>;
        topic?: { id: string; name: string; status: string };
      };
      const scope = {
        axisId: selection.axisId,
        pageSize: PROGRESS_PAGE_SIZE,
        topicId: selection.topicId,
      };
      const [taskResult, activityResult] = await Promise.all([
        call<WorkstreamRead>(
          "get_topic",
          { ...scope, offset: nextTaskOffset },
          { isStale: stale }
        ),
        call<WorkstreamRead>(
          "get_topic",
          { ...scope, offset: nextActivityOffset },
          { isStale: stale }
        ),
      ]);
      if (ctx.signal.aborted) {
        return null;
      }
      // A newer selection/offset read has superseded this one: commit nothing — neither the axis nor a
      // page — so a slow earlier selection (or a slow earlier page) cannot overwrite the newer one. The
      // superseding read owns the loading flag from here.
      if (stale()) {
        return null;
      }
      setWorkstreamLoading(false);
      const result = taskResult ?? activityResult;
      if (!result) {
        return null;
      }
      // Two responder shapes, one view: the backend's axis-scoped read answers `axis` (plus the optional
      // pages); a topic-wide detail answers `axes[]`, from which the workstream is the one axis.
      const axis =
        result.axis ??
        (result.axes ?? []).find(
          (candidate) => candidate.id === selection.axisId
        ) ??
        null;
      setWorkstream(
        axis
          ? {
              axis,
              axisId: selection.axisId,
              topic: result.topic ?? {
                id: selection.topicId,
                name: "",
                status: "",
              },
            }
          : null
      );
      // Each page is committed only from the newest request, so the two offsets stay independent and a
      // slower page response cannot overwrite the page the reader last asked for.
      setWorkstreamTask(taskResult?.problemPage ?? null);
      setWorkstreamActivity(activityResult?.activityPage ?? null);
      return axis;
    }

    /**
     * Selecting a workstream is view state: it sets the Progress selection and re-reads that workstream's
     * scoped pages with both offsets back at their first page — a reader arriving at a new workstream starts
     * at its start, not at the page they left the last one on. Selection writes nothing, and a correction
     * draft for the previous workstream does not follow the reader here.
     */
    function selectWorkstream(topicId: string, axisId: string): void {
      const next = { axisId, topicId };
      setProgressSelection(next);
      setTaskOffset(0);
      setActivityOffset(0);
      setCorrection(null);
      setConflict(null);
      // Identity-safe: a new workstream must not render the previous one's context or pages while its own
      // read is in flight — clear them so no stale scoped page shows under the new selection.
      setWorkstream(null);
      setWorkstreamTask(null);
      setWorkstreamActivity(null);
      void loadWorkstream(next, 0, 0);
    }

    /** The problem a direct task navigation asked for; applied once its workstream lands. */
    const problemFocusRef = React.useRef<string | null>(null);

    /**
     * Apply an arriving axis/problem tag (the EntityTag contract's other half for the two entities whose home
     * is Progress). An axis tag selects that workstream; a problem tag selects the workstream the problem
     * belongs to and remembers the problem so its containing task page opens. A reader's own click is never
     * overridden — this runs only when a tag asked, keyed on `seq`.
     */
    React.useEffect(() => {
      if (
        !entityTarget ||
        (entityTarget.type !== "axis" && entityTarget.type !== "problem")
      ) {
        return;
      }
      const rows = visibleProgress?.axes.axes ?? [];
      const problems = visibleProgress?.problems.problems ?? [];
      if (entityTarget.type === "axis") {
        const row = rows.find((candidate) => candidate.id === entityTarget.id);
        const topicId = row?.topicId ?? rows[0]?.topicId;
        if (topicId) {
          problemFocusRef.current = null;
          selectWorkstream(topicId, entityTarget.id);
        }
        return;
      }
      const problem = problems.find((candidate) => candidate.id === entityTarget.id);
      if (problem) {
        problemFocusRef.current = entityTarget.id;
        selectWorkstream(problem.topicId, problem.axisId);
      }
    }, [entityTarget?.id, entityTarget?.seq, visibleProgress]);

    /** Open the containing task page of a directly-navigated problem once its workstream has loaded. */
    React.useEffect(() => {
      const focus = problemFocusRef.current;
      if (!focus || !workstream || !progressSelection) {
        return;
      }
      const tasks = workstream.axis.problems ?? [];
      const at = tasks.findIndex((task) => task.id === focus);
      problemFocusRef.current = null;
      if (at >= 0) {
        const next = Math.floor(at / PROGRESS_PAGE_SIZE) * PROGRESS_PAGE_SIZE;
        setTaskOffset(next);
        // The containing page is a backend request at that offset, not a client slice.
        void loadWorkstream(progressSelection, next, activityOffset);
      }
    }, [workstream]);

    React.useEffect(() => {
      void load(scopeWindow);
      // Re-issued only when the scope changes: the Overview window moving, or a switch between the
      // Overview scope and the all-time one. Two all-time tabs share a scope and do not re-query.
    }, [scopeWindow]);

    /**
     * The expanded card *is* the detail view: one `get_topic` call, per-axis history included. The same
     * call also asks for the project's activity **page** at `offset` (five rows, backend-paged), so the
     * activity section below the workstreams reads a real page the reader can page through rather than a
     * slice of the array. A plain `get_topic` (no `offset`) keeps the array exactly as before.
     */
    async function loadDetail(topicId: string, offset = 0): Promise<void> {
      const seq = ++detailSeq.current;
      const stale = () => detailSeq.current !== seq;
      const result = await call<
        { ok?: boolean } & TopicDetail & { activityPage?: Page<Activity> }
      >(
        "get_topic",
        { offset, pageSize: PROGRESS_PAGE_SIZE, topicId },
        { isStale: stale }
      );
      // A newer subject's read (or a newer page of this one) owns the detail: a superseded response must
      // not overwrite it — neither the detail card nor its activity page.
      if (ctx.signal.aborted || stale()) {
        return;
      }
      if (result) {
        setDetail(result as TopicDetail);
        setTopicActivityPage(result.activityPage ?? null);
      }
    }

    React.useEffect(() => {
      setCorrection(null);
      setTopicNote("");
      // Changing the subject clears the news about the old one: a conflict from this topic must not
      // follow the reader to the next.
      setConflict(null);
      if (!expandedId) {
        setDetail(null);
        setTopicActivityPage(null);
        setTopicActivityOffset(0);
        return;
      }
      setTopicActivityOffset(0);
      // The scoped read (axis-scoped project detail + the project's activity page at offset 0). The
      // generation guard lives inside `loadDetail`, so a superseded subject's response cannot commit here.
      void loadDetail(expandedId, 0);
      // One call per topic opened, not per axis: the detail arrives complete.
    }, [expandedId]);

    /** Paging the project's activity is a backend request at that offset, not a client re-slice. */
    function selectTopicActivityOffset(next: number): void {
      setTopicActivityOffset(next);
      if (expandedId) {
        void loadDetail(expandedId, next);
      }
    }

    /** Selecting in the rail is the whole interaction — there is no disclosure control to close. */
    function selectTopic(topicId: string) {
      if (topicId === expandedId) {
        // Re-clicking the row that is already selected is not a change of subject, and it must not be
        // treated as one. `detail` is cleared only when the subject changes: the effect that fetches it
        // runs on `expandedId`, so clearing it here for the *same* id leaves the pane with nothing to
        // re-fetch it — the note surface and the current/folded split never come back, while the card
        // still renders from the overview row (the pane looks open and is empty). The conflict notice
        // stays too: it is scoped to the thing being edited and is cleared on a save, a re-read, or a
        // new subject, not by a stray click.
        return;
      }
      setExpandedId(topicId);
      setDetail(null);
      setConflict(null);
    }





    /**
     * The Progress correction: the claim, its confidence and optionally why, written through
     * `reconcile_topic` against the **selected workstream's own** axis version and topic. The note lands in
     * the same call as the claim, which is what makes `confirmed` reachable on an axis nothing else backs —
     * the note *is* the evidence (D8). Nothing here deletes: the toolset has no delete action.
     */
    async function saveWorkstreamCorrection() {
      if (!(workstream && correction)) {
        return;
      }
      const axis = workstream.axis;
      if (axis.id !== correction.axisId) {
        return;
      }
      const note = correction.note.trim();
      const result = await call(
        "reconcile_topic",
        {
          axes: [
            {
              blocker: correction.blocker,
              blockerConfidence: correction.blockerConfidence,
              currentState: correction.currentState,
              currentStateConfidence: correction.currentStateConfidence,
              expectedVersion: axis.version,
              id: axis.id,
              state: correction.state,
              stateConfidence: correction.stateConfidence,
            },
          ],
          topicId: workstream.topic.id,
          ...(note ? { annotations: [{ axisId: axis.id, text: note }] } : {}),
        },
        { conflictAxisId: correction.axisId }
      );
      if (result) {
        setCorrection(null);
        setConflict(null);
        await reloadCurrent();
      }
    }

    /**
     * Re-read the selected workstream after a refused write, and rebuild the draft on the refreshed facts.
     * The rationale is carried across because it belongs to the person, not to the version they read; the
     * claims are not, because those have to be judged again against what actually changed.
     */
    async function reloadWorkstreamCorrection() {
      if (!progressSelection) {
        return;
      }
      const fresh = await loadWorkstream(
        progressSelection,
        taskOffset,
        activityOffset
      );
      if (ctx.signal.aborted) {
        return;
      }
      setConflict(null);
      if (fresh) {
        setCorrection((current: AxisCorrection | null) =>
          current && current.axisId === fresh.id
            ? draftFrom(fresh, current.note)
            : current
        );
      }
    }

    /** A note on the topic itself — a correction or caveat that is not an event. */
    async function addTopicNote(event: unknown) {
      const formEvent = event as { preventDefault(): void };
      formEvent.preventDefault();
      if (!(detail && topicNote.trim())) {
        return;
      }
      const result = await call("reconcile_topic", {
        annotations: [{ text: topicNote.trim() }],
        topicId: detail.topic.id,
      });
      if (result) {
        setTopicNote("");
        await loadDetail(detail.topic.id);
      }
    }

    async function addActivity(event: unknown) {
      const formEvent = event as { preventDefault(): void };
      formEvent.preventDefault();
      if (!(expandedId && activitySummary.trim())) {
        return;
      }
      const result = await call("record_activity", {
        sourceRef: activitySourceRef.trim(),
        sourceType: activitySourceType,
        summary: activitySummary.trim(),
        topicId: expandedId,
      });
      if (result) {
        setActivitySummary("");
        setActivitySourceRef("");
        // The detail holds the list now, so it is the thing that has to be re-read; the overview
        // follows because a new event moves the topic's recent-activity line.
        await loadDetail(expandedId);
        await reloadCurrent();
      }
    }

    const topics = overview?.topics ?? [];
    /**
     * The detail is persistent, so something is always selected: on first load — and after a window or
     * archived change that dropped the selected topic — the server's first topic is the selection. The
     * order is the server's; this picks from it and does not rank it.
     */
    React.useEffect(() => {
      if (topics.length === 0) {
        return;
      }
      if (expandedId && topics.some((entry) => entry.topic.id === expandedId)) {
        return;
      }
      setExpandedId(topics[0].topic.id);
    }, [topics, expandedId]);

    const selectedEntry =
      topics.find((entry) => entry.topic.id === expandedId) ?? topics[0] ?? null;
    const selectedDetails =
      selectedEntry && detail && detail.topic.id === selectedEntry.topic.id ? detail : null;
    // The rail leads with the newest few events and states the rest (RAIL_ACTIVITY_LEAD). Keyed on the
    // topic id, so switching topics resets the rail rather than carrying one topic's expansion onto the
    // next; `data-rd-topic-activity` keeps reporting the payload's own count, so capping what is shown
    // never changes what the page says there is.
    // The project's activity is a **backend page**: the items and the total are the page's own
    // (`offset`/`limit`/`total`), never a length re-derived here, so the range shown is the range the
    // backend returned for the requested offset. The legacy `activity` array stays on the payload for
    // compatibility; this section reads the page, not the array.
    const topicActivityItems = topicActivityPage?.items ?? [];
    const topicActivityTotal = topicActivityPage?.total ?? 0;
    // Before the detail lands, the overview's own axes stand in: the pane is never empty, and the
    // current/completed split appears as soon as the detail that can answer it arrives.
    const currentAxes: Array<AxisDetail | AxisOverview> = (
      selectedDetails ? selectedDetails.axes : (selectedEntry?.axes ?? [])
    ).filter((axis) => !isTerminalAxis(axis.state));
    const foldedAxes: AxisDetail[] = selectedDetails
      ? selectedDetails.axes.filter((axis) => isTerminalAxis(axis.state))
      : [];
    // V2 correction — the project's card context suppresses exactly the repositories the panel's own
    // "Supporting repositories" list already shows (its direct `project_repository` links). A workstream's
    // own links are a different set, so only the overlap is deduplicated; the rest stay on each card.
    const projectCardContext = projectWorkstreamCardContext(
      (selectedDetails?.repositories ?? selectedEntry?.repositories ?? []).map(
        (repository) => repository.id,
      ),
    );

    return (
      <div className="rd-stack">
        <div className="rd-row" data-rd-topbar="true">
          {/* The shell title is the page's name, not a control: Overview is now a peer tab, so there is no
              unselected landing to return to and the title no longer doubles as a home button. */}
          <h2 className="rd-page-title" data-rd-home="current">
            Research dashboard
          </h2>
          {/* Two groups rather than one strip: what you are looking at, and the actions. The window control
              is no longer here — it belongs to Overview's own heading, where the data it scopes is read. */}
          <div className="rd-toolbar" data-rd-toolbar="true">
            <div className="rd-group" data-rd-group="views">
              <ViewControl disabled={busy} onChange={setView} value={view} />
            </div>
            <div className="rd-group" data-rd-group="actions">
              <Button
                disabled={busy}
                onClick={() => {
                  void reloadCurrent();
                }}
                variant="outline"
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <p className="rd-error" role="alert">
            {error}
          </p>
        ) : null}

        {view === "topics" ? (
          <div className="rd-view-topics" data-rd-view="topics">
            {/* The brand stays in the top bar while this view names itself; readers arriving from a
                tag need not infer the destination from the selected navigation button. */}
            <ViewHeading view="topics" />
            {/* The accepted pivot retires Overview: its aggregate counts live in a **collapsed**
                Dashboard summary directly above the Projects landing, not in duplicate fast-access rows.
                Every number is the payload's own (`getOverview.counts` and `problemsByState`); Open and
                Blocked are the stored task states, never inferred from a workstream blocker. It spans the
                full width above the split. */}
            <DashboardSummary overview={overview} />
            {/* The accepted prototype's composition: a **380px selector rail on the left** and the
                selected project's detail beside it, in the one shared `rd-split` all four views use. The
                heading and the summary are above it, so the rail is never pushed to a row of its own. */}
            <div className="rd-split">
            {/* C1 — the prototype's composition: a compact index rail, and ONE persistent detail. The
                index carries the server's order unreranked; the only client state is which topic is
                selected. There is no disclosure control, so the detail is never "closed". */}
            <ul
              aria-label="Projects"
              className="rd-index rd-topic-index"
              data-rd-topic-index={topics.length}
            >
              {topics.map((entry) => {
                const isSelected = entry.topic.id === expandedId;
                const isStale = entry.topic.status === "stale";
                // The count is the payload's own: `topicOverviews` groups every row of
                // `SELECT * FROM development_axes` with no LIMIT and no slice, and counts from that
                // complete list — so summing the non-terminal states here is the store's number, not a
                // count of a possibly-bounded subset (D5).
                const currentCount = Object.entries(entry.axisCounts)
                  .filter(([state]) => state !== "completed" && state !== "abandoned")
                  .reduce((sum, [, n]) => sum + n, 0);
                return (
                  <li key={entry.topic.id}>
                    <button
                      aria-pressed={isSelected}
                      className="rd-index-item"
                      data-rd-index-topic={entry.topic.name}
                      data-rd-topic-stale={isStale}
                      disabled={busy}
                      onClick={() => selectTopic(entry.topic.id)}
                      type="button"
                    >
                      {/* V1/A4 — the index-row grammar, shared by all four rails: the title takes the row's
                          full width and what used to compete with it for line 1 moves down. Here the age joins
                          the counts that were already beneath. At 240px a title sharing its line with a
                          right-aligned age wrapped even when it had room to fit. */}
                      <span className="rd-strong">{entry.topic.name}</span>
                      <span className="rd-cluster">
                        <span className="rd-meta" data-rd-index-current={currentCount}>
                          {countLabel(currentCount, "workstream", "workstreams")}
                        </span>
                        {entry.lastActivityAt ? (
                          <RecencyLabel at={entry.lastActivityAt} />
                        ) : null}
                        {isStale ? (
                          <span className="rd-count" data-rd-index-stale="true">
                            Stale
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedEntry ? (
              /* V2 correction — the project detail is keyed by the selected topic id. A different
                 selection remounts the panel, so the nested disclosures return to their defaults —
                 the **Description** disclosure reads collapsed again rather than staying open from the
                 previous project (the outer panel and the activity fold carry an explicit `open`, so
                 they stay open). A write draft that the reader typed lives in the page state above as
                 a controlled field, so remounting never drops it. */
              <details
                className="rd-panel rd-topic-detail"
                data-rd-detail={selectedEntry.topic.name}
                data-rd-detail-header="true"
                data-rd-detail-mode="disclosure"
                key={selectedEntry.topic.id}
                open
              >
                {/* The shared **native disclosure**: the `<summary>` carries the project's title and
                    status; the body carries the concise summary, the full description, the participants
                    and supporting repositories, the optional project plan, the workstream cards and the
                    paged activity below. Projects orients — the full workstream reading stays in
                    Progress, and the blocker's prose lives there too. */}
                <summary className="rd-topic-summary">
                  <span className="rd-row rd-detail-title-row">
                    <CardTitle>{selectedEntry.topic.name}</CardTitle>
                  </span>
                  <span className="rd-cluster rd-topic-summary-meta">
                    <span className="rd-muted">{selectedEntry.topic.status}</span>
                    {selectedEntry.lastActivityAt ? (
                      <RecencyLabel
                        at={selectedEntry.lastActivityAt}
                        prefix="last activity "
                      />
                    ) : null}
                  </span>
                </summary>
                <div className="rd-topic-body">
                {selectedDetails ? (
                  <div className="rd-detail-claims">
                    {/* V2a — the identity reads first and plainly: the concise stored `summary` is the
                        prominent orientation. It is a stored field, so its empty state is honest. The old
                        "approved summary — a human interpretation, not an agent one" label is removed: it
                        asserted a human-only rule the data contract no longer holds, so the field is
                        rendered plainly and an agent may maintain it. */}
                    <div className="rd-claim rd-claim-summary">
                      <span className="rd-context-label">Summary</span>
                      <span className="rd-claim-value" data-rd-claim="summary">
                        {selectedDetails.topic.summary || (
                          <span className="rd-muted">No summary recorded.</span>
                        )}
                      </span>
                    </div>
                    {/* V2a — the complete stored `description` stays reachable but not prominent: a
                        **native disclosure, collapsed by default**, whose labelled summary is the route
                        and whose body carries the exact stored string (or its own honest empty). Nothing
                        is hidden silently — the label names the field — and no preview is clamped here,
                        so no arbitrary visual truncation stands between the reader and the full text. */}
                    <details className="rd-claim rd-description" data-rd-description-field="true">
                      <summary className="rd-context-label">Description</summary>
                      <span className="rd-claim-value" data-rd-claim="description">
                        {selectedDetails.topic.description || (
                          <span className="rd-muted">No description recorded.</span>
                        )}
                      </span>
                    </details>
                  </div>
                ) : null}
                {/* Participants — an explicit quiet inline label beneath a divider. The hook the
                    harness reads is unchanged (`data-rd-detail-context`). */}
                <div className="rd-context-tags" data-rd-detail-context="true">
                  <span className="rd-context-label">Participants</span>
                  {(selectedDetails?.people ?? selectedEntry.people).length > 0 ? (
                    (selectedDetails?.people ?? selectedEntry.people).map((person) => (
                      <EntityTag
                        id={person.id}
                        key={person.id}
                        label={person.displayName}
                        onOpen={openEntity}
                        type="person"
                      />
                    ))
                  ) : (
                    <span className="rd-muted">No participant linked yet.</span>
                  )}
                </div>
                {/* Supporting repositories — explicit label; each name opens the exact Repositories
                    entry, with the separate external GitHub ↗ beside it. */}
                <div className="rd-references">
                  <span className="rd-context-label">Supporting repositories</span>
                  {(selectedDetails?.repositories ?? selectedEntry.repositories).length > 0 ? (
                    (selectedDetails?.repositories ?? selectedEntry.repositories).map(
                      (repository) => (
                        <RepoLinkPair
                          key={repository.id}
                          onOpen={openEntity}
                          repository={repository}
                        />
                      )
                    )
                  ) : (
                    <span className="rd-muted">No repository linked yet.</span>
                  )}
                </div>
                {/* The optional **project** plan, owned by the topic (`get_topic.plan`). Optional by
                    construction: no plan renders nothing, and the project's tasks do not inherit it. */}
                {selectedDetails?.plan ? (
                  <ScopedPlan
                    label="Project plan"
                    plan={{
                      plan: {
                        authorId: "",
                        authorType: "",
                        id: selectedDetails.plan.id,
                        summary: selectedDetails.plan.summary,
                        updatedAt: "",
                        version: 0,
                      },
                      steps: selectedDetails.plan.steps,
                    }}
                  />
                ) : null}

                {selectedDetails && conflict && !conflict.axisId ? (
                  <div className="rd-conflict" data-rd-conflict="true" role="alert">
                    <span className="rd-strong">
                      This topic changed since you opened it.
                    </span>
                    <span className="rd-meta">{conflict.message}</span>
                    <div className="rd-cluster">
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void loadDetail(selectedDetails.topic.id);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Reload this topic
                      </Button>
                      <span className="rd-muted">
                        Nothing you typed has been thrown away.
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* The workstreams are **full width** inside the detail — the accepted composition
                    puts the compact shared workstream cards across the detail, with the project's
                    activity in its own independent collapsible section below. There is no side rail. */}
                <section className="rd-current-work" data-rd-current-work={currentAxes.length}>
                  <span className="rd-context-label">
                    Workstreams ({currentAxes.length})
                  </span>
                  {currentAxes.length === 0 ? (
                    <p className="rd-muted">No workstreams on this project.</p>
                  ) : (
                    <ul className="rd-axes">
                      {currentAxes.map((axis) =>
                        selectedDetails ? (
                          /* The compact shared workstream card (S4), in the Projects **project context**:
                             title → the exact Progress entry (its full work context), status, its stored
                             reading and its own task counts. The card drops only the repository links the
                             project panel already lists directly, and demotes its latest-event prose into
                             that exact Progress entry; the same `projectWorkstreamCardData` builds this card
                             and the folded one below. */
                          <li key={axis.id}>
                            <WorkstreamCard
                              axis={projectWorkstreamCardData(axis)}
                              context={projectCardContext}
                              onOpenEntity={openEntity}
                              onOpenWorkstream={(axisId) => openEntity("axis", axisId)}
                            />
                          </li>
                        ) : (
                          <AxisItem
                            axis={axis as AxisOverview}
                            key={axis.id}
                            onOpenEntity={openEntity}
                          />
                        )
                      )}
                    </ul>
                  )}

                  {foldedAxes.length > 0 ? (
                    <details
                      className="rd-completed-fold"
                      data-rd-folded-axes={foldedAxes.length}
                    >
                      <summary>Completed and abandoned work ({foldedAxes.length})</summary>
                      <ul className="rd-axes">
                        {foldedAxes.map((axis) => (
                          <li key={axis.id}>
                            <WorkstreamCard
                              axis={projectWorkstreamCardData(axis)}
                              context={projectCardContext}
                              onOpenEntity={openEntity}
                              onOpenWorkstream={(axisId) => openEntity("axis", axisId)}
                            />
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </section>

                {/* The project's activity — an **independent, collapsible** section below the
                    workstreams, paged five backend rows at a time and scoped to this project. The items
                    and the total are the page's own (`get_topic` offset/pageSize → `activityPage`); the
                    legacy `activity` array is never re-sliced here. */}
                <details
                  className="rd-scoped-plan rd-topic-activity-fold"
                  data-rd-topic-activity-fold="true"
                  open
                >
                  <summary>Activity ({topicActivityTotal})</summary>
                  <ul
                    className="rd-activity"
                    data-rd-topic-activity={topicActivityTotal}
                    data-rd-topic-activity-shown={topicActivityItems.length}
                  >
                    {topicActivityItems.map((item) => (
                      <ActivityLine
                        axisLabel={
                          selectedDetails?.axes.find(
                            (axis) => axis.id === item.axisId
                          )?.title ?? null
                        }
                        item={item}
                        key={item.id}
                        onOpenEntity={openEntity}
                        repositoryLabel={
                          selectedDetails?.repositories.find(
                            (repository) => repository.id === item.repositoryId
                          )?.fullName ?? null
                        }
                        topicLabel={selectedEntry.topic.name}
                      />
                    ))}
                    {selectedDetails && topicActivityTotal === 0 ? (
                      <li className="rd-muted">No activity recorded yet.</li>
                    ) : null}
                    {!selectedDetails ? (
                      <li className="rd-muted">Loading this project…</li>
                    ) : null}
                  </ul>
                  <Pager
                    label="Activity"
                    offset={topicActivityOffset}
                    onOffset={selectTopicActivityOffset}
                    pageSize={PROGRESS_PAGE_SIZE}
                    total={topicActivityTotal}
                  />
                </details>

                {/* The existing write controls, **preserved but secondary**: Notes/corrections and
                    Record activity sit behind one disclosure at the foot of the detail, so the project
                    reads as a project rather than as a form. No control was removed. */}
                {selectedDetails ? (
                  <details
                    className="rd-narrow-write rd-topic-controls"
                    data-rd-topic-controls="true"
                  >
                    <summary>Notes &amp; corrections</summary>
                    <section className="rd-side-card">
                      <h3 className="rd-side-title">Notes</h3>
                      <ul
                        className="rd-notes"
                        data-rd-topic-notes={selectedDetails.notes.length}
                      >
                        {selectedDetails.notes.map((note) => (
                          <li key={note.id}>
                            <div>{note.text}</div>
                            <span className="rd-meta">
                              {note.authorType} · {note.createdAt.slice(0, 10)}
                            </span>
                          </li>
                        ))}
                        {selectedDetails.notes.length === 0 ? (
                          <li className="rd-muted">
                            No notes yet. This is where a correction or a caveat goes —
                            deliberately not in the activity log.
                          </li>
                        ) : null}
                      </ul>
                      <form
                        className="rd-narrow-write"
                        onSubmit={(event) => {
                          void addTopicNote(event);
                        }}
                      >
                        <Input
                          aria-label="Topic note"
                          disabled={busy}
                          maxLength={1000}
                          onChange={(event) =>
                            setTopicNote((event.target as { value: string }).value)
                          }
                          placeholder="A correction or caveat about this project"
                          value={topicNote}
                        />
                        <Button
                          disabled={busy || !topicNote.trim()}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          Add note / correction
                        </Button>
                      </form>
                    </section>
                    <details className="rd-narrow-write" data-rd-write="activity">
                      <summary>Record activity</summary>
                      <form
                        className="rd-narrow-write"
                        onSubmit={(event) => {
                          void addActivity(event);
                        }}
                      >
                        <Textarea
                          aria-label="Activity"
                          disabled={busy}
                          onChange={(event) =>
                            setActivitySummary((event.target as { value: string }).value)
                          }
                          placeholder="One objective event, e.g. PR #72 merged"
                          value={activitySummary}
                        />
                        <div className="rd-row">
                          <SourceSelect
                            disabled={busy}
                            onChange={setActivitySourceType}
                            value={activitySourceType}
                          />
                          <Input
                            aria-label="Source reference"
                            disabled={busy}
                            maxLength={200}
                            onChange={(event) =>
                              setActivitySourceRef(
                                (event.target as { value: string }).value
                              )
                            }
                            placeholder="Reference (PR #, commit, run id)"
                            value={activitySourceRef}
                          />
                        </div>
                        <Button
                          disabled={busy || !activitySummary.trim()}
                          size="sm"
                          type="submit"
                        >
                          Record activity
                        </Button>
                      </form>
                    </details>
                  </details>
                ) : null}
                </div>
              </details>
            ) : null}
            </div>
          </div>
        ) : null}

        {view === "people" ? (
          <PeopleView
            onOpenEntity={openEntity}
            people={overview?.people ?? []}
            preselect={entityTarget?.type === "person" ? entityTarget : null}
            truncated={overview?.peopleTruncated === true}
            windowDays={scopeWindow}
          />
        ) : null}

        {view === "repositories" ? (
          <RepositoriesView
            onOpenEntity={openEntity}
            overviewTopics={overview?.topics ?? []}
            people={overview?.people ?? []}
            peopleTruncated={overview?.peopleTruncated === true}
            preselect={entityTarget?.type === "repository" ? entityTarget : null}
            repositories={overview?.repositories ?? []}
            truncated={overview?.repositoriesTruncated === true}
            windowDays={scopeWindow}
          />
        ) : null}

        {view === "progress" ? (
          <ProgressView
            activityOffset={activityOffset}
            activityPage={workstreamActivity}
            busy={busy}
            conflict={conflict}
            correction={correction}
            loading={workstreamLoading}
            onActivityOffset={(next) => {
              setActivityOffset(next);
              // Each pager requests its **own** page at its own offset; the other page is re-committed from
              // its own request, so the two offsets stay independent.
              if (progressSelection) {
                void loadWorkstream(progressSelection, taskOffset, next);
              }
            }}
            onCorrection={setCorrection}
            onOpenEntity={openEntity}
            onReloadCorrection={() => {
              void reloadWorkstreamCorrection();
            }}
            onSaveCorrection={() => {
              void saveWorkstreamCorrection();
            }}
            onSelectWorkstream={selectWorkstream}
            onTaskOffset={(next) => {
              setTaskOffset(next);
              if (progressSelection) {
                void loadWorkstream(progressSelection, next, activityOffset);
              }
            }}
            progress={visibleProgress}
            selection={progressSelection}
            taskOffset={taskOffset}
            taskPage={workstreamTask}
            workstream={workstream}
          />
        ) : null}

        {view === "topics" && overview && topics.length === 0 ? (
          <Card>
            <CardContent>
              <p className="rd-muted">
                No topics yet. Add one above, or let the agent record what the
                group is working on.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  ctx.slots.register("page", ResearchPage);
}
