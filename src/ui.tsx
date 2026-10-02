/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * Plugin page — the overview (C4).
 *
 * The default screen is the group's 10-second view, and it renders from **one** `get_overview` call:
 * one card per topic, and under each topic the scan order the reviewer settled —
 * topic name → people → axis state counts → the most relevant axes (kind, repo/branch/PR line,
 * current state, blocker) → a recent-activity summary. Expanding a card shows the remaining axes and
 * the editing surface (fields, status, activity) that generation 1 kept as its whole page; this is
 * the "detail editing underneath" the redesign asked to retain, which C5 deepens and C8 annotates
 * with provenance.
 *
 * The only control that changes the *query* is the window (7d / 14d / 30d / all time): it re-issues
 * `get_overview` with a different `activitySinceDays`, which the store treats as a parameter rather
 * than stored state. Everything else on the page is presentation.
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
};

/** One topic in depth — everything the detail view needs, from one `get_topic` call. */
type TopicDetail = {
  generatedAt: string;
  topic: Topic;
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
};

/**
 * One event as the Activity column renders it. Same row the grouped timeline below uses — date, summary,
 * reported source, attributed person — plus `problemId`, which is what lets the feed mark the line that is
 * evidence for the problem shown beside it.
 */
type ProgressEventRow = {
  axisId: string | null;
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
  /** The step this problem sits on, where it sits on one — the other half of the plan ↔ problem link. */
  planStepId: string | null;
  planStepTitle: string | null;
  recencyAt: string | null;
  repositories: Array<{ fullName: string; id: string }>;
  state: string;
  stateConfidence: Confidence;
  statement: string;
  steering: ProgressSteering[];
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
 * The window control is the page's only query-level control. `0` means "no lower bound" and is what
 * the store reads as all time.
 */
const WINDOW_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All time" },
];

/** The state counts the reviewer's scan asks for, in attention order. */
const COUNTED_STATES: AxisState[] = ["blocked", "active", "draft", "parked"];
const OTHER_STATES: AxisState[] = ["completed", "abandoned"];

/**
 * The three views of one page (C6). The reviewer's symmetry, in the order a reader asks about it:
 * what research directions are active (Topics, the default), what each person is on (People), what is
 * happening in each codebase (Repositories). The counts line under the header is the compressed
 * synthesis they all share.
 */
const VIEW_OPTIONS = [
  { label: "Topics", value: "topics" },
  { label: "People", value: "people" },
  { label: "Repositories", value: "repositories" },
  { label: "Progress", value: "progress" },
] as const;

type ViewName = (typeof VIEW_OPTIONS)[number]["value"];

/**
 * §7 — the shell title stays and each view names itself. These are the prototypes' own one-line hints,
 * carried over verbatim so the page and the reference read the same way; a view whose hint is missing says
 * nothing rather than something invented.
 */
const VIEW_HEADINGS: Record<ViewName, string> = {
  people: "Recent activity is factual, not a workload score",
  progress: "Problem first; execution detail beneath it",
  repositories: "Most recently active first",
  topics: "Most recently active first · primarily read-only",
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
 * How many events the Progress feed leads with before it states the rest — the density reference is
 * 1280×800, and one corpus axis carries 43 events (the uncapped column measured ~10.8k px tall, i.e.
 * thirteen screens of Activity before anything else in the view). Showing the newest and **stating** the
 * remainder is the same reading decision the axis index already makes (`LEAD_AXES`); nothing is lost,
 * because the count is the projection's own and the rest is one control away.
 */
const FEED_LEAD = 12;

/**
 * How many activity events the Topics side rail leads with. The reference reading width is 1440×900, and
 * the rail is the topic detail's *context*, not its feed: on the corpus's topic (25 events, several of them
 * long subjects) the uncapped rail is eleven screens of activity and the two cards under it — Notes and
 * Related repositories — never reach the first screen. Four is what the prototype's rail shows, and the
 * remainder is **stated** with the rest one control away, exactly as the Progress feed does. Density here
 * is a composition decision, not a data one: nothing is dropped, and no cap is applied to the count the
 * store reports (`data-rd-topic-activity` stays the payload's own number).
 */
const RAIL_ACTIVITY_LEAD = 4;

const css = `
/*
 * One small vocabulary for type, spacing and quietness. The rules below used to carry ten literal type
 * sizes, seven gap values and five opacities — which reads as noise rather than hierarchy, and made every
 * later tweak a new number. Four type steps, three gaps and one quietness are the whole scale: the tier a
 * thing belongs to is now the thing you read, not the pixel it happens to sit at.
 *
 *   --rd-title  the host card's own title (16px, set by CardTitle) — the entity's name
 *   --rd-body   the line that answers the question
 *   --rd-meta   supporting text: provenance, dates, counts, secondary lines
 *   --rd-label  a label for a section or a qualifier — uppercase, tracked, quieter
 */
[data-plugin-id="research-dashboard"] {
  --rd-body: 13px;
  --rd-meta: 12px;
  --rd-label: 11px;
  --rd-quiet: 0.62;
  --rd-gap-row: 2px;
  --rd-gap-tight: 4px;
  --rd-gap: var(--rd-gap);
  --rd-gap-block: 12px;
  /* One box edge and one inner line: a surface is a card, and everything inside it is a rule, not a box. */
  --rd-edge: 1px solid var(--border);
  --rd-rule: 2px solid var(--border);
}
[data-plugin-id="research-dashboard"] .rd-stack { display: grid; gap: var(--rd-gap-block); }
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
/* Blocked is an exceptional state and must be legible before its badge is read: it keeps the narrow
   left rule every axis has, but the rule thickens and takes the exceptional colour. The blocked
   .rd-axis-detail rule below states the same accent for the detail element, so the axis reads as
   blocked on whichever element owns it, and a normal axis is untouched (U9: exceptional colour only
   for exceptional state). No box, no background, no new treatment. */
[data-plugin-id="research-dashboard"] .rd-axis[data-rd-axis-state="blocked"] {
  border-left: 3px solid var(--destructive, #b91c1c);
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
/* §7 — the view names itself, under the shell title that stays. Modest on purpose: the shell already
   carries the page title, so this is the view's identity, not a second banner. The heading takes the whole
   row: .rd-split is a *wrapping flex* row (not a grid), so the spanning declaration is flex: 0 0 100%
   — grid-column alone was inert and let the index share the heading's line, which pushed the detail into
   a second row and broke the "tops aligned" geometry. Both are declared so the rule survives a change of
   layout mode. */
[data-plugin-id="research-dashboard"] .rd-view-heading {
  display: flex;
  align-items: baseline;
  flex: 0 0 100%;
  gap: var(--rd-gap-block);
  grid-column: 1 / -1;
}
[data-plugin-id="research-dashboard"] .rd-view-title {
  font-size: 14px;
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
[data-plugin-id="research-dashboard"] .rd-window [aria-pressed="true"] { font-weight: 600; }
[data-plugin-id="research-dashboard"] .rd-views [aria-pressed="true"] { font-weight: 600; }
/* The Progress index's subject switch: a control over the left column, so it sits with it rather than in
   the toolbar — the page it governs is the same page in both positions. */
[data-plugin-id="research-dashboard"] .rd-progress-switch { margin-bottom: 10px; }
[data-plugin-id="research-dashboard"] .rd-progress-switch [aria-pressed="true"] { font-weight: 600; }
/* C8: the qualifier on a state is part of the claim, not decoration — quieter, never optional. */
[data-plugin-id="research-dashboard"] .rd-claim-suffix { font-weight: 400; opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-newtopic { flex-wrap: nowrap; }
[data-plugin-id="research-dashboard"] .rd-newtopic input { width: 18rem; }
[data-plugin-id="research-dashboard"] .rd-activity { display: grid; gap: var(--rd-gap); margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-activity li {
  border-left: var(--rd-rule);
  padding: 0 0 0 10px;
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
}
[data-plugin-id="research-dashboard"] .rd-axis-detail {
  /* An axis inside an open card is not a second card: it takes the same left rule the axis index uses. */
  border-left: var(--rd-rule);
  padding: 0 0 0 10px;
  display: grid;
  gap: var(--rd-gap-tight);
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
  flex: 0 1 15rem;
  min-width: 12rem;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--rd-gap-row);
}
[data-plugin-id="research-dashboard"] .rd-index-item {
  width: 100%;
  text-align: left;
  display: grid;
  gap: var(--rd-gap-row);
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
[data-plugin-id="research-dashboard"] .rd-index-item:hover {
  border-color: var(--border);
}
/* The Progress composition, nested the way the prototype nests it: the index, then ONE selected-subject pane
   holding the header and three grouped rows. Previously the Problem and Activity columns were the index's own
   siblings in one wrapping row and every lower section was an independent full-width band, so the selected axis
   never became the subject of the right-hand pane — its identity sat in the index row and was repeated as tags
   inside the Problem column. The sections inside the pane stay individually conditional, so a subject without a
   plan or without support material collapses honestly instead of reserving space for it. */
[data-plugin-id="research-dashboard"] .rd-progress-top > .rd-progress-index {
  flex: 0 1 16rem;
}
[data-plugin-id="research-dashboard"] .rd-progress-detail {
  border-left: 1px solid var(--border);
  display: grid;
  flex: 1 1 34rem;
  gap: var(--rd-gap-block);
  min-width: 20rem;
  padding-left: 12px;
}
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
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
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
  background: none;
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
  border-left: var(--rd-rule);
  padding: 0 0 0 10px;
  display: grid;
  gap: var(--rd-gap-tight);
}
[data-plugin-id="research-dashboard"] .rd-involvement > ul { margin: 0; }
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
  flex: 0 1 15rem;
}
[data-plugin-id="research-dashboard"] .rd-topic-detail {
  flex: 1 1 34rem;
  min-width: 20rem;
  display: grid;
  gap: var(--rd-gap-block);
}
[data-plugin-id="research-dashboard"] .rd-detail-head {
  display: grid;
  gap: var(--rd-gap-row);
}
[data-plugin-id="research-dashboard"] .rd-detail-claims {
  display: grid;
  gap: var(--rd-gap-tight);
}
[data-plugin-id="research-dashboard"] .rd-detail-grid {
  display: grid;
  gap: var(--rd-gap-block);
  /* The side rail is proportional, not a fixed 20rem column: at a narrow container a fixed 320px
     rail squeezed Current Work to 1.10x its width, which reads as two near-equal columns rather
     than as the work with a rail beside it. A 0.6fr rail against 1fr keeps it near its current
     ~320px at 1440 while letting it shrink to a 250px floor at 1280, so the main lane stays
     visibly dominant (at least 1.25x) at both. It never stacks below the work at desktop widths. */
  grid-template-columns: minmax(0, 1fr) minmax(250px, 0.6fr);
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
  gap: var(--rd-gap-block);
  border-left: var(--rd-rule);
  padding: 0 0 0 12px;
}
[data-plugin-id="research-dashboard"] .rd-side-card {
  display: grid;
  gap: var(--rd-gap-row);
}
/* The rail is context, not a feed. Measured at 1440×900 on the corpus: the rail begins 385px down the page
   and has ~515px to the fold, while four of the 25 events already occupy 664px (166px per event, because
   the summary wraps at rail width and every event names its entities). So a count cap alone cannot put
   Notes and Related repositories in the first screen at any lead that still carries real data. The two
   lists are therefore *windows*: bounded, scrollable, and with the count and the remainder still stated
   below each one. Nothing is dropped, nothing is truncated, and the three cards participate in the first
   screen whatever the data volume. */
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity {
  max-height: 190px;
  overflow-y: auto;
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

export function apply(ctx: Context) {
  const React = ctx.React;
  const {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
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

  function WindowControl({
    value,
    onChange,
    disabled,
  }: {
    value: number;
    onChange: (next: number) => void;
    disabled: boolean;
  }) {
    return (
      <div
        aria-label="Activity window"
        className="rd-cluster rd-window"
        role="group"
      >
        {WINDOW_OPTIONS.map((option) => (
          <Button
            aria-pressed={option.days === value}
            data-rd-window={option.days}
            disabled={disabled}
            key={option.days}
            onClick={() => onChange(option.days)}
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
   * Which view of the same data is on screen (C6). Not a query-level control: `get_overview` already
   * carries all three views, so switching costs nothing and the page never asks the store twice.
   */
  function ViewControl({
    value,
    onChange,
    disabled,
  }: {
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

  /** The state counts the reviewer's scan asks for: one line, or nothing at all when there is no work. */

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
    return (
      <li className="rd-axis" data-rd-axis-state={axis.state}>
        {/* Two levels, not four. The first row is what a reader scans: the state claim and the axis
            name dominate, and the kind recedes to the end of the row. Where the work lives and what it
            says about itself are one subordinate line underneath. A blocker is the exception — it stays
            on its own line, immediately visible, because it is the thing that needs acting on.
            The axis names itself and it names the repositories it lives in: both are entities, so both
            are tags (component-contract.md § EntityTag), and the row's own words are unchanged. */}
        <div className="rd-axis-head">
          <StateBadge confidence={axis.stateConfidence} state={axis.state} />
          <EntityTag
            compact
            id={axis.id}
            label={axis.title}
            onOpen={onOpenEntity}
            type="axis"
          />
          <span className="rd-axis-kind">{axis.kind}</span>
        </div>
        {where || axis.currentState || axis.repositories.length > 0 ? (
          <p className="rd-axis-secondary">
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
              {axis.currentState ? (
                <span className="rd-meta">{axis.currentState}</span>
              ) : null}
              {/* The age of the timestamp this list is ordered by — the component's whole rule. */}
              <RecencyLabel at={axis.updatedAt} prefix="· updated " />
            </span>
          </p>
        ) : null}
        {axis.blocker ? (
          <div className="rd-blocker" data-rd-strong={blocked}>
            Blocker: {axis.blocker}
          </div>
        ) : null}
      </li>
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
   * The reviewer's "inferred from PR #88 / repo review / manual note" — stated as what it is. The
   * store records evidence per axis, not per field, so this says "evidence on this axis" and never
   * claims to attribute one item to one claim. When the list is empty the claim above it can only be
   * inferred or uncertain: that is a rule, not a rendering choice, and saying so is the point.
   */
  function EvidenceLine({ evidence }: { evidence: AxisEvidence[] }) {
    const shown = evidence.slice(0, 3);
    const more = evidence.length - shown.length;
    return (
      <div
        className="rd-evidence"
        data-rd-evidence-count={evidence.length}
        data-rd-has-evidence={evidence.length > 0}
      >
        {evidence.length > 0
          ? `evidence: ${shown
              .map((item) =>
                item.by ? `${item.label} (${item.by})` : item.label
              )
              .join(" · ")}${more > 0 ? ` +${more} more` : ""}`
          : "no evidence on record"}
      </div>
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
    /** The caller's own marker for this row (e.g. the Progress feed's `data-rd-feed-event`). */
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
          {person ? (
            <EntityTag
              id={person.id}
              label={person.displayName}
              onOpen={onOpenEntity}
              type="person"
            />
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
   * §7 — the view names itself, under the shell title that stays. The prototype's heading block, kept
   * modest: the view's own name and its one-line hint, above the layout it governs. It is a heading, not a
   * control, and the toolbar's pressed button is no longer the only thing saying which page this is — which
   * is what a reader arriving from a tag needs.
   */
  function ViewHeading({ view }: { view: ViewName }) {
    const hint = VIEW_HEADINGS[view];
    return (
      <div className="rd-view-heading" data-rd-view-heading={view}>
        <h3 className="rd-view-title" data-rd-view-title={view}>
          {VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view}
        </h3>
        {hint ? <span className="rd-meta">{hint}</span> : null}
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
   * One axis's own history, and its notes as a separate list. Deliberately not merged into the
   * topic's log: a correction is not an event, and the reviewer asked for them kept apart.
   */
  function AxisHistory({ axis }: { axis: AxisDetail }) {
    return (
      <div className="rd-stack">
        <span className="rd-section">History · {axis.history.length}</span>
        <ul className="rd-history" data-rd-history={axis.id}>
          {axis.history.map((item) => (
            <li key={item.id}>
              <div>{item.summary}</div>
              <span className="rd-meta">
                {describeSource(item.sourceType, item.sourceRef)} ·{" "}
                {item.occurredAt.slice(0, 10)}
                {item.actorType ? ` · ${item.actorType}` : ""}
              </span>
            </li>
          ))}
          {axis.history.length === 0 ? (
            <li className="rd-muted">No activity on this axis yet.</li>
          ) : null}
        </ul>
        <span className="rd-section">Notes · {axis.notes.length}</span>
        <ul className="rd-notes" data-rd-axis-notes={axis.id}>
          {axis.notes.map((note) => (
            <li key={note.id}>
              <div>{note.text}</div>
              <span className="rd-meta">
                {note.authorType} · {note.createdAt.slice(0, 10)}
              </span>
            </li>
          ))}
          {axis.notes.length === 0 ? (
            <li className="rd-muted">No notes on this axis.</li>
          ) : null}
        </ul>
      </div>
    );
  }

  /** One axis in full, with its history and — on demand — the correction form. */
  function AxisDetailCard({
    axis,
    busy,
    conflict,
    correction,
    historyOpen,
    onCorrection,
    onOpenEntity,
    onReload,
    onSave,
    onToggleHistory,
  }: {
    axis: AxisDetail;
    busy: boolean;
    conflict: ConflictState;
    correction: AxisCorrection | null;
    historyOpen: boolean;
    onCorrection: (next: AxisCorrection | null) => void;
    onOpenEntity: (type: EntityType, id: string) => void;
    onReload: () => void;
    onSave: () => void;
    onToggleHistory: () => void;
  }) {
    const line = [
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const correcting = correction?.axisId === axis.id;
    return (
      <li
        className="rd-axis-detail"
        data-rd-axis-state={axis.state}
        data-rd-axis-title={axis.title}
        data-rd-axis-version={axis.version}
      >
        {/* The same two levels as a lead row in a collapsed card: the state claim and the name on one
            line, with kind and version receding to the end of it; everything else about the axis on one
            subordinate line underneath. Four equal-weight lines is what step 3 exists to remove, and the
            detail is where they cost the most height. */}
        <div className="rd-axis-head">
          <StateBadge confidence={axis.stateConfidence} state={axis.state} />
          <EntityTag
            compact
            id={axis.id}
            label={axis.title}
            onOpen={onOpenEntity}
            type="axis"
          />
          <span className="rd-axis-kind">
            {axis.kind} · v{axis.version}
          </span>
        </div>
        {/* The reading: what this axis says about itself right now, clamped so one verbose axis cannot
            push the rest of the lane off the screen. Its own confidence travels with it (C8), and a claim
            nobody stated renders no confidence at all. */}
        <p className="rd-axis-reading" data-rd-axis-reading={axis.id}>
          <span className="rd-claim-value" data-rd-claim="current_state">
            {axis.currentState ? (
              axis.currentState
            ) : (
              <span className="rd-muted">no progress note</span>
            )}
          </span>
          <span className="rd-cluster">
            <span className="rd-muted">current state</span>
            <ConfidenceBadge value={axis.currentStateConfidence} />
          </span>
        </p>

        {axis.blocker ? (
          <div className="rd-cluster">
            <span
              className="rd-blocker"
              data-rd-strong={axis.state === "blocked"}
            >
              Blocker: {axis.blocker}
            </span>
            <ConfidenceBadge value={axis.blockerConfidence} />
          </div>
        ) : null}

        {/* One quiet reference line: the entities this axis names — the repositories it lives in and the
            people on it, both with canonical homes, so they are tags plus the axis's own words — where the
            work physically lives, and what backs it. The evidence line renders whether or not there is
            anything to name: "no evidence on record" is a claim, and it is read here. */}
        <div className="rd-axis-secondary rd-axis-refs">
          {line || axis.people.length > 0 || axis.repositories.length > 0 ? (
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
              {axis.people.map((person) => (
                <EntityTag
                  compact
                  id={person.id}
                  key={person.id}
                  label={person.displayName}
                  onOpen={onOpenEntity}
                  type="person"
                />
              ))}
              {line ? <span className="rd-meta">{line}</span> : null}
            </span>
          ) : null}
          <EvidenceLine evidence={axis.evidence} />
        </div>

        {/* Everything else about the axis, one disclosure per axis rather than four equal-weight lines in
            the reading surface: what the axis is for, the second half of the state claim, and when it was
            last looked at. Nothing here is removed — the reader opens it for detail, the way the rail's own
            writes sit behind theirs. */}
        <details className="rd-axis-more" data-rd-axis-more={axis.id}>
          <summary>More on this axis</summary>
          {axis.description ? (
            <p className="rd-axis-secondary" data-rd-axis-description="true">
              {axis.description}
            </p>
          ) : null}
          <div className="rd-cluster">
            <span className="rd-muted">state</span>
            <ConfidenceBadge value={axis.stateConfidence} />
            {axis.lastReviewedAt ? (
              <span className="rd-muted">
                last reviewed {axis.lastReviewedAt.slice(0, 10)}
              </span>
            ) : null}
          </div>
        </details>

        <div className="rd-cluster rd-axis-controls">
          <Button
            data-rd-history-toggle={axis.id}
            disabled={busy}
            onClick={onToggleHistory}
            size="sm"
            variant="ghost"
          >
            {historyOpen ? "Hide history" : `History (${axis.history.length})`}
          </Button>
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
            variant={correcting ? "default" : "ghost"}
          >
            {correcting ? "Cancel" : "Correct"}
          </Button>
        </div>

        {historyOpen ? <AxisHistory axis={axis} /> : null}

        {correcting && correction ? (
          <div className="rd-correction" data-rd-correction={axis.id}>
            <span className="rd-section">Correct this axis</span>
            {conflict?.axisId === axis.id ? (
              <div className="rd-conflict" data-rd-conflict="true" role="alert">
                <span className="rd-strong">
                  This development axis changed since you opened it.
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
        ) : null}
      </li>
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
    parts.push(countLabel(entry.axes.length, "axis", "axes"));
    parts.push(countLabel(entry.topics.length, "topic", "topics"));
    return parts.join(" · ");
  }

  /** One axis in a C6 rollup: state, title, repo/branch/PR, and the blocker where there is one. */
  function AxisScanItem({
    axis,
    onOpenEntity,
  }: {
    axis: AxisScan;
    onOpenEntity: (type: EntityType, id: string) => void;
  }) {
    const where = [
      axis.branch,
      axis.prNumber === null ? "" : `PR #${axis.prNumber}`,
    ]
      .filter((value) => value !== "")
      .join(" · ");
    return (
      <li
        className="rd-axis"
        data-rd-axis-state={axis.state}
        data-rd-scan-axis={axis.title}
      >
        {/* The axis names itself and it names where the work lives: both are entities, so both are tags —
            the axis opens in Progress's own subview, the repositories open in theirs. The label is the
            entity's own name, and the row's own words are unchanged. */}
        <div className="rd-row">
          <span className="rd-cluster">
            <StateBadge confidence={axis.stateConfidence} state={axis.state} />
            <EntityTag
              compact
              id={axis.id}
              label={axis.title}
              onOpen={onOpenEntity}
              type="axis"
            />
          </span>
          <span className="rd-muted">{axis.kind}</span>
        </div>
        <span className="rd-cluster rd-tags" data-rd-scan-where="true">
          {axis.repositories.length === 0 ? (
            <span className="rd-meta">no repository or branch recorded</span>
          ) : (
            axis.repositories.map((repository) => (
              <EntityTag
                id={repository.id}
                key={repository.id}
                label={repository.fullName}
                onOpen={onOpenEntity}
                type="repository"
              />
            ))
          )}
          {where ? <span className="rd-meta">{where}</span> : null}
        </span>
        {axis.blocker ? (
          <span
            className="rd-blocker"
            data-rd-strong={axis.blockerConfidence === "confirmed"}
          >
            {axis.blocker}
            {axis.blockerConfidence ? ` · ${axis.blockerConfidence}` : ""}
          </span>
        ) : null}
      </li>
    );
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
              Nothing recorded in{" "}
              {windowDays === 0
                ? "any window"
                : `the last ${countLabel(windowDays, "day", "days")}`}
              .
            </Notice>
          </li>
        ) : null}
      </ul>
    );
  }

  /**
   * C2 (increment 2): the C1 axis-row grammar, as far as the person rollup can carry it.
   *
   * A C1 row's dominant element is its current-state *reading*, and `AxisScan` does not hold one: it is a scan
   * of the links (title, kind, state and its confidence, blocker, branch/PR, version, when it was last touched,
   * repositories), not the axis detail. So the reading here is the one narrative fact the rollup does have
   * about the axis's condition — its blocker — and where there is none the row says so, because "no blocker
   * recorded" is a claim and inventing a sentence to fill the space would be worse than the gap. Everything
   * else is one quiet reference line plus a disclosure, and there are no controls: this panel has no write
   * path, and the row stays short on purpose (a person's involvement is a pointer to the axis, not a copy of
   * the axis's own lane).
   */
  function PersonAxisRow({
    axis,
    onOpenEntity,
  }: {
    axis: AxisScan;
    onOpenEntity: (type: EntityType, id: string) => void;
  }) {
    const where = [
      axis.branch,
      axis.prNumber === null ? "" : `PR #${axis.prNumber}`,
    ]
      .filter((value) => value !== "")
      .join(" · ");
    return (
      <li
        className="rd-axis"
        data-rd-axis-state={axis.state}
        data-rd-scan-axis={axis.title}
      >
        <div className="rd-axis-head">
          <StateBadge confidence={axis.stateConfidence} state={axis.state} />
          <EntityTag
            compact
            id={axis.id}
            label={axis.title}
            onOpen={onOpenEntity}
            type="axis"
          />
          <span className="rd-axis-kind">
            {axis.kind} · v{axis.version}
          </span>
        </div>
        {/* The reading. A C1 row leads with its current-state claim and its own confidence; this rollup has
            no current state, so the claim here is the axis's blocker where it has one, in C1's own
            "value + label + confidence" shape. Where it has none the row reads one muted sentence and stops:
            an orphan `blocker` label under "no blocker recorded" is noise that reads like the blocker text. */}
        <p className="rd-axis-reading" data-rd-person-axis-reading={axis.id}>
          {axis.blocker ? (
            <>
              <span className="rd-claim-value">{axis.blocker}</span>
              <span className="rd-cluster">
                <span className="rd-muted">blocker</span>
                <ConfidenceBadge value={axis.blockerConfidence} />
              </span>
            </>
          ) : (
            <span className="rd-muted">no blocker recorded</span>
          )}
        </p>
        <div className="rd-axis-secondary rd-axis-refs">
          <span className="rd-cluster rd-tags" data-rd-scan-where="true">
            {axis.repositories.length === 0 ? (
              <span className="rd-meta">no repository or branch recorded</span>
            ) : (
              axis.repositories.map((repository) => (
                <EntityTag
                  id={repository.id}
                  key={repository.id}
                  label={repository.fullName}
                  onOpen={onOpenEntity}
                  type="repository"
                />
              ))
            )}
            {where ? <span className="rd-meta">{where}</span> : null}
          </span>
        </div>
        <details className="rd-axis-more" data-rd-person-axis-more={axis.id}>
          <summary>More on this axis</summary>
          <div className="rd-cluster">
            <span className="rd-muted">state</span>
            <ConfidenceBadge value={axis.stateConfidence} />
            <span className="rd-muted">
              last recorded {axis.updatedAt.slice(0, 10)}
            </span>
            {axis.lastReviewedAt ? (
              <span className="rd-muted">
                · last reviewed {axis.lastReviewedAt.slice(0, 10)}
              </span>
            ) : null}
          </div>
        </details>
      </li>
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
    const [railAll, setRailAll] = React.useState(false);
    const railActivity = entry.recentActivity;
    const railShown = railAll
      ? railActivity
      : railActivity.slice(0, RAIL_ACTIVITY_LEAD);
    const railHidden = railActivity.length - railShown.length;
    /**
     * C2: the repositories their own axes name — derived from the involvement the payload already carries,
     * never fetched again and never guessed. De-duplicated by id in first-mention order, so the card is stable
     * across renders. `AxisScan.repositories` is built from every `axis_people` link the store holds, with no
     * cap, so this list is complete for the axes shown rather than a window of them.
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
    return (
      <Card
        className="rd-panel"
        data-rd-person-panel={entry.person.displayName}
      >
        <CardHeader>
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
        </CardHeader>
        <CardContent>
          {/* C2 increment 2: the inner split, on C1's own grid. `rd-detail-grid` is the composition unit the
              Topics detail already uses — a 1fr lane against a `minmax(250px, 0.6fr)` rail, which is exactly
              what makes the lane measurably dominant (≥1.25×) at both reference viewports rather than merely
              wider, and it stacks below 1000px. Inheriting the grid means People inherits the dominance rule
              rather than restating it with its own numbers. */}
          <div className="rd-detail-grid" data-rd-person-split="true">
            <div className="rd-current-work" data-rd-person-lane="current">
              <span className="rd-section">Current involvement</span>
              <ul className="rd-view" data-rd-person-topics={entry.topics.length}>
                {entry.topics.map((involvement) => (
                  <li
                    className="rd-involvement"
                    data-rd-involvement={involvement.topic.name}
                    key={involvement.topic.id}
                  >
                    <div className="rd-row">
                      <EntityTag
                        compact
                        id={involvement.topic.id}
                        label={involvement.topic.name}
                        onOpen={onOpenEntity}
                        type="topic"
                      />
                      <span className="rd-muted">
                        {involvement.role
                          ? `${involvement.topic.status} · ${involvement.role}`
                          : involvement.topic.status}
                      </span>
                    </div>
                    {involvement.axes.length === 0 ? (
                      <Notice kind="empty">no axis of theirs here</Notice>
                    ) : (
                      <ul className="rd-axes">
                        {involvement.axes.map((axis) => (
                          <PersonAxisRow
                            axis={axis}
                            key={axis.id}
                            onOpenEntity={onOpenEntity}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {entry.topics.length === 0 ? (
                  <li>
                    <Notice kind="empty">
                      Not linked to a topic yet — the link is what puts work on this
                      page.
                    </Notice>
                  </li>
                ) : null}
              </ul>
            </div>

            <aside className="rd-side-stack" data-rd-person-rail="true">
              <section className="rd-side-card">
                <h3 className="rd-side-title">Recent activity</h3>
                {entry.attributable ? (
                  <>
                    <div
                      data-rd-person-activity-shown={railShown.length}
                      data-rd-person-activity-total={railActivity.length}
                    >
                      <ActivityList
                        dataAttr="data-rd-person-activity"
                        items={railShown}
                        labelFor={(item) => ({
                          topic:
                            entry.topics.find(
                              (involvement) => involvement.topic.id === item.topicId
                            )?.topic.name ?? null,
                        })}
                        onOpenEntity={onOpenEntity}
                        windowDays={windowDays}
                      />
                    </div>
                    {/* The remainder, stated — the same treatment the Topics rail gives it, because the same
                        rule applies: a bounded window is only honest if the reader is told what it holds and
                        can have the rest in one click. */}
                    {railHidden > 0 || railAll ? (
                      <div
                        className="rd-cluster"
                        data-rd-person-activity-more={String(railHidden)}
                      >
                        <span
                          className="rd-meta"
                          data-rd-person-activity-note="true"
                        >
                          {railAll
                            ? `all ${railActivity.length} shown, newest first`
                            : `${railShown.length} of ${railActivity.length} shown, newest first`}
                        </span>
                        <Button
                          onClick={() => setRailAll(!railAll)}
                          size="sm"
                          variant="ghost"
                        >
                          {railAll
                            ? "Show fewer"
                            : `Show all ${railActivity.length}`}
                        </Button>
                      </div>
                    ) : null}
                  </>
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
        </CardContent>
      </Card>
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
                <span className="rd-strong">{entry.person.displayName}</span>
                <span className="rd-meta" data-rd-person-context="true">
                  {involvementLine(entry)}
                </span>
                {/* The row's last segment is *when*, not *how much*: recency here is unwindowed on purpose
                    (a person whose last event was three weeks ago has not recorded nothing), and a person
                    with no mapped account gets the missing-link fact instead — "no activity" would be a
                    different and false claim. `data-rd-person-recency` carries the timestamp, or `none` /
                    `unattributable`, so a check can compare the row against the payload it came from. */}
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
   * Repository-first (C6): what each codebase supports, the axes that name it, and the events recorded
   * against it or against one of those axes. The same rules as the person view — factual, never scored.
   */
  function RepositoriesView({
    onOpenEntity,
    preselect,
    repositories,
    truncated,
    windowDays,
  }: {
    onOpenEntity: (type: EntityType, id: string) => void;
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
                <span className="rd-strong">{entry.repository.fullName}</span>
                <span className="rd-meta">{involvementLine(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <Card
            className="rd-panel"
            data-rd-repository-panel={selected.repository.fullName}
          >
            <CardHeader>
              <DetailHeader title={<CardTitle>{selected.repository.fullName}</CardTitle>}>
                <span className="rd-meta">
                  {selected.repository.description || "no description recorded"}
                  {selected.repository.defaultBranch
                    ? ` · default branch ${selected.repository.defaultBranch}`
                    : ""}
                </span>
              </DetailHeader>
            </CardHeader>
            <CardContent>
              <div className="rd-form">
                <span className="rd-section">Supports</span>
                <ul
                  className="rd-view"
                  data-rd-repository-topics={selected.topics.length}
                >
                  {selected.topics.map((link) => (
                    <li className="rd-cluster" key={link.topic.id}>
                      <EntityTag
                        compact
                        id={link.topic.id}
                        label={link.topic.name}
                        onOpen={onOpenEntity}
                        type="topic"
                      />
                      <span className="rd-muted">· {link.relationship}</span>
                    </li>
                  ))}
                  {selected.topics.length === 0 ? (
                    <li>
                      <Notice kind="empty">no topic names it yet</Notice>
                    </li>
                  ) : null}
                </ul>

                <span className="rd-section">Current work</span>
                <ul
                  className="rd-axes"
                  data-rd-repository-axes={selected.axes.length}
                >
                  {selected.axes.map((axis) => (
                    <AxisScanItem
                      axis={axis}
                      key={axis.id}
                      onOpenEntity={onOpenEntity}
                    />
                  ))}
                  {selected.axes.length === 0 ? (
                    <li>
                      <Notice kind="empty">no axis names this repository</Notice>
                    </li>
                  ) : null}
                </ul>

                <span className="rd-section">Recent activity</span>
                <ActivityList
                  dataAttr="data-rd-repository-activity"
                  items={selected.recentActivity}
                  labelFor={(item) => ({
                    topic:
                      selected.topics.find(
                        (link) => link.topic.id === item.topicId
                      )?.topic.name ?? null,
                  })}
                  onOpenEntity={onOpenEntity}
                  windowDays={windowDays}
                />

                <span className="rd-cluster" data-rd-repository-last="true">
                  {selected.lastActivityAt ? (
                    <RecencyLabel
                      at={selected.lastActivityAt}
                      prefix="last activity "
                    />
                  ) : (
                    <span className="rd-muted">no activity recorded yet</span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  /**
   * The progress view: the axis/problem index on the left, the selected subject's own reading on the right —
   * Problem beside Activity on top, Plan beside Open problems beneath, then the support band. One dominant
   * interpretation of the selected subject, and the window's totals stated rather than listed beneath it.
   */
  /**
   * The two counts the projection carries, phrased. Not a computation: `problems` and `openProblems` are the
   * projection's own numbers — this only decides how to say them.
   */
  function problemCountLine(row: ProgressAxisRow): string {
    if (row.problems === 0) {
      return "no problems";
    }
    return row.openProblems === row.problems
      ? `${row.problems} problem${row.problems === 1 ? "" : "s"}`
      : `${row.openProblems} open of ${row.problems}`;
  }

  function ProgressView({
    onOpenEntity,
    people,
    preselect,
    progress,
    repositories,
    timeline,
    windowDays,
  }: {
    onOpenEntity: (type: EntityType, id: string) => void;
    people: PersonRollup[];
    /**
     * The EntityTag contract's other half for the two entities whose home is Progress: an axis tag lands in
     * `Axes` with that axis selected, a problem tag lands in `Problems` with that problem selected — and the
     * axis follows the problem, exactly as it does for a hand-made pick, because that rule is already the
     * view's. A tag naming anything else never arrives here.
     */
    preselect: { id: string; seq: number; type: EntityType } | null;
    progress: ProgressIndex | null;
    repositories: RepositoryRollup[];
    timeline: TimelineGroup[];
    windowDays: number;
  }) {
    const [selectedAxisId, setSelectedAxisId] = React.useState<string | null>(null);
    /**
     * Which problem the Problem column shows. Set only by picking one from the list beside it — the default is
     * the projection's first open problem for the selected axis, so this holds "the reader chose otherwise".
     */
    const [selectedProblemId, setSelectedProblemId] = React.useState<string | null>(null);
    /**
     * Which index the left column renders. `Axes` is the Progress slice's own index; `Problems` inverts the
     * projection so the reader navigates the concrete problems. One payload serves both, so this is a switch
     * over one model — never a second view with its own query.
     */
    const [indexMode, setIndexMode] = React.useState<ProgressIndexMode>("axes");
    /**
     * Which axis's feed the reader asked to see in full. Keyed by the axis rather than a boolean, so
     * switching axes resets the cap by construction: the reader never has to wonder whether "show all"
     * from the axis they just left is still in force on this one.
     */
    const [feedAllFor, setFeedAllFor] = React.useState<string | null>(null);
    /**
     * Apply an arriving tag once, keyed on `seq` so the same tag asked for twice lands twice. It sets the
     * subview and the selection — nothing else; a tag is navigation, so a reader's own click is never
     * overridden and no request follows from it.
     */
    React.useEffect(() => {
      if (!preselect) {
        return;
      }
      if (preselect.type === "axis") {
        setIndexMode("axes");
        setSelectedAxisId(preselect.id);
      } else if (preselect.type === "problem") {
        setIndexMode("problems");
        setSelectedProblemId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq, preselect?.type]);
    /*
     * The window's own total — the one thing kept from the second reading that used to sit below the
     * composition.
     *
     * That was a four-filter, topic-bucketed event feed over the same window, and it is retired (C4/F2,
     * reviewer-ruled): an unbounded second grouping of the same events is the report/dump shape C1 and C2
     * removed, and it competed with the composition's one dominant reading of the selected subject. Its count
     * stays, so nothing disappears silently — scoped to the *same* window the composition's boxes are scoped
     * to, because `load()` issues `get_overview` (this timeline) and `get_progress` (the index and its detail)
     * with one `activitySinceDays`. A window-wide audit is a separate product surface if it is ever wanted; it
     * does not belong underneath Progress as a second reading.
     */
    const windowEventCount = timeline.reduce(
      (total, group) => total + group.eventCount,
      0
    );

    // ---- the index's subject, and the two columns that follow it ---------------------------------------
    // One payload, two indexes. Row sets, order, states, counts and staleness all come from the server in
    // both, and switching between them changes selection and nothing else — no call, no write, and no
    // re-derivation of anything the projection already decided.
    //
    // Defaulting to the projection's own first row is not a ranking: the axis index arrives ordered by
    // attention, so the axis most in need of a reader is already first. Selection changes which row is
    // active; it does not change the order, and nothing here re-sorts anything.
    const axisRows = progress?.axes.axes ?? [];
    const problemRows = progress?.problems.problems ?? [];
    const problemsMode = indexMode === "problems";
    const selectedAxisRow = axisRows.find((row) => row.id === selectedAxisId) ?? null;
    /** The reader's own problem pick, or the problem they picked on the axis it belongs to. */
    const chosenProblem: ProgressProblemRow | null = selectedProblemId
      ? (problemRows.find((row) => row.id === selectedProblemId) ?? null)
      : null;
    const axesModeAxis: ProgressAxisRow | null = selectedAxisRow ?? axisRows[0] ?? null;
    const axesModeProblems = problemRows.filter((row) => row.axisId === axesModeAxis?.id);
    // `Problems` mode shows the reader's own pick if they made one and otherwise the projection's first
    // problem row — the same "the page never opens on a choice it invented" rule the axis index uses.
    // `Axes` mode keeps steps 1–5's rule exactly: the pick when it belongs to this axis, else the first
    // *open* problem in the projection's order, else the axis's first problem whatever its state.
    const shownProblem: ProgressProblemRow | null = problemsMode
      ? (chosenProblem ?? problemRows[0] ?? null)
      : chosenProblem && chosenProblem.axisId === axesModeAxis?.id
        ? chosenProblem
        : // Axes mode emphasizes CURRENT work: the card is the axis's first open Problem in projection
          // order, or the one explicitly selected. A resolved Problem is never shown here — with none open
          // there is no card, and the axis still stands (the Activity column still follows it). Resolved
          // Problems stay inspectable in the Problems subview, which is the view that shows the full
          // inventory. The fallback to `axesModeProblems[0]` contradicted the heading's own count.
          (axesModeProblems.filter((row) => row.state === "open")[0] ?? null);
    // In `Axes` the columns follow the selected axis. In `Problems` the axis follows the problem on screen,
    // so the card, the plan, the sections and the Activity feed all describe that problem's own parent
    // context — read off the projection's relations, never re-derived in the markup. With no problem on
    // screen (a dataset that has none) there is nothing to follow and the axis selection stands.
    const parentAxisOfShownProblem: ProgressAxisRow | null =
      shownProblem === null
        ? null
        : (axisRows.find((row) => row.id === shownProblem.axisId) ?? null);
    const activeAxis: ProgressAxisRow | null = problemsMode
      ? (parentAxisOfShownProblem ?? axesModeAxis)
      : axesModeAxis;
    // The axis's own problems, taken from the projection's list in the projection's order. The *count* in the
    // heading is the server's (`activeAxis.openProblems`), and the rows are the server's rows: a test asserts
    // the two agree, so a heading can never overstate what it lists.
    const axisProblems = problemRows.filter((row) => row.axisId === activeAxis?.id);
    const openAxisProblems = axisProblems.filter((row) => row.state === "open");
    // The server already grouped the window by axis and put the groups in the index's order, so the page
    // looks a bucket up rather than filtering a flat list to decide what belongs to this axis.
    const feed =
      (progress?.activity.byAxis ?? []).find(
        (bucket) => bucket.axisId === activeAxis?.id
      ) ?? null;
    const feedAll = feedAllFor !== null && feedAllFor === (activeAxis?.id ?? "");
    const feedShown = feed === null || feedAll ? (feed?.events ?? []) : feed.events.slice(0, FEED_LEAD);
    const feedHidden = (feed?.events.length ?? 0) - feedShown.length;
    const axisPlan = activeAxis?.plan ?? null;
    // Whether the plan claims an order is read off the projection's own `position` values and nothing else:
    // a step that claims no position is never given one, and a plan whose steps claim none says so rather
    // than letting the list's order read as a sequence the model never asserted.
    const planClaimsOrder =
      axisPlan?.steps.some((step) => step.position !== null) ?? false;

    /**
     * The steering the sections show: the problem's own claims and the axis's, kept as two lists because they
     * answer different questions and are rendered under separate labels. The store has already excluded
     * ordinary notes and agent-authored readings, so nothing is filtered here.
     */
    const problemSteering = shownProblem?.steering ?? [];
    const axisSteering = activeAxis?.steering ?? [];

    /** The inventory's compact context for one problem: its repositories, its step, and how alive it is. */
    function problemContext(problem: ProgressProblemRow): string {
      const parts: string[] = [
        problem.repositories.length === 0
          ? "no repository"
          : problem.repositories.map((repo) => repo.fullName).join(", "),
      ];
      if (problem.planStepTitle) {
        parts.push(`step: ${problem.planStepTitle}`);
      }
      parts.push(countLabel(problem.activityCount, "event", "events"));
      parts.push(`last activity ${describeAge(problem.recencyAt)}`);
      return parts.join(" · ");
    }

    /** The problem's own fields, phrased — nothing here is computed that the projection did not carry. */
    function problemFacts(problem: ProgressProblemRow): string {
      const parts = [
        problem.authorType === "human" ? "owner-authored" : "librarian-inferred",
      ];
      if (problem.planStepTitle) {
        parts.push(`step: ${problem.planStepTitle}`);
      }
      if (problem.repositories.length > 0) {
        parts.push(problem.repositories.map((repo) => repo.fullName).join(", "));
      }
      parts.push(countLabel(problem.activityCount, "event", "events"));
      parts.push(`last activity ${describeAge(problem.recencyAt)}`);
      return parts.join(" · ");
    }

    /**
     * The repository an event names, resolved from the rollups already in this payload — a tag must never cost a
     * call, and the repository's own name is the label the contract asks for. `null` when the id is absent or the
     * rollup does not carry it: then no tag renders, rather than a tag that names nothing.
     */
    function repositoryOf(id: string | null): { fullName: string; id: string } | null {
      if (id === null) {
        return null;
      }
      return (
        repositories.find((entry) => entry.repository.id === id)?.repository ?? null
      );
    }

    /**
     * The problem an event is evidence for, when the projection carries it — the tag's label is the problem's
     * own statement, so the same problem reads the same here and in the index.
     */
    function problemOf(id: string | null): ProgressProblemRow | null {
      return id === null ? null : (problemRows.find((row) => row.id === id) ?? null);
    }

    /**
     * The problem index's context line: where the problem sits first (parent axis, topic), then the same
     * compact context the axis inventory's rows already carry. Reusing `problemContext` is deliberate — one
     * phrasing of one set of facts, so the two lists cannot describe the same problem differently.
     */
    function indexProblemContext(problem: ProgressProblemRow): string {
      return `${problem.axisTitle} · ${problem.topicName} · ${problemContext(problem)}`;
    }

    /**
     * Switching the index's subject. Two explicit rules, neither of which invents a selection:
     *
     *  - `Axes → Problems` keeps the reader where they were: their own problem pick if they made one, else
     *    the first **open** problem of the axis on screen in the projection's order (the rule the axis
     *    index's own default already uses), else that axis's first problem whatever its state, else nothing —
     *    a dataset with no problem has no bridge to preserve.
     *  - `Problems → Axes` selects the problem's parent axis, so the axis index marks the row the page is
     *    actually showing.
     *
     * Nothing else happens: no action is called, no state is written server-side, and the payload is not
     * re-read. The switch is the whole of it.
     */
    function switchIndex(next: ProgressIndexMode) {
      if (next === indexMode) {
        return;
      }
      if (next === "problems") {
        setSelectedProblemId(
          chosenProblem?.id ?? openAxisProblems[0]?.id ?? axisProblems[0]?.id ?? null
        );
      } else if (shownProblem) {
        setSelectedAxisId(shownProblem.axisId);
      }
      setIndexMode(next);
    }

    return (
      <div className="rd-stack" data-rd-view="progress">
        <ViewHeading view="progress" />
        {/*
         * The desktop composition the contract asks for: the index on the left, the selected axis's Problem in
         * the central column, and its Activity feed beside it — all three visible at once. They are siblings
         * in one wrapping row, so below a reading width they stack in semantic order (Problem, then Activity,
         * per interaction-spec §13) rather than squeezing into columns that no longer fit.
         */}
        {/*
         * The index's subject — `Axes | Problems`. This is a **switch**, not a view: both positions render
         * the same `get_progress` payload, so it issues no call, writes nothing, and preserves selection
         * across the two wherever the problem↔axis relation makes the bridge explicit (`switchIndex`).
         * It sits with the column it governs rather than in the toolbar, because the page below it is the
         * same page in both positions.
         */}
        <div
          aria-label="Progress index"
          className="rd-cluster rd-progress-switch"
          data-rd-progress-switch="true"
          data-rd-progress-subview={indexMode}
          role="group"
        >
          {PROGRESS_INDEX_OPTIONS.map((option) => (
            <Button
              aria-pressed={option.value === indexMode}
              data-rd-progress-subview-option={option.value}
              key={option.value}
              onClick={() => switchIndex(option.value)}
              size="sm"
              variant="outline"
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="rd-split rd-progress-top" data-rd-progress-top="true">
        {/*
         * The index — rendered straight from `get_progress`, in one of its two subjects.
         *
         * `Axes` (the default): server order is the presentation order — no re-sorting, no re-grouping, no
         * client-side recomputation of `stale` or of either problem count. The row's two numbers and its
         * stale flag are read off the projection; only their phrasing is decided here.
         *
         * `Problems`: the projection inverted — the concrete problem becomes the navigation object, and the
         * rows are the server's problem list in the server's order, each carrying its own state, parent
         * axis, topic and recency. Picking one drives the *same* reading surface, sections and feed the axis
         * index drives. Nothing is recomputed, and nothing is written.
         *
         * Selection marks a row active and does nothing else — it filters nothing. The index is a projection
         * renderer, not a second model.
         */}
        <div
          className="rd-progress-index"
          data-rd-progress-index="true"
          data-rd-progress-index-mode={indexMode}
          data-rd-progress-index-rows={(problemsMode ? problemRows : axisRows).length}
          data-rd-progress-index-stale-after={progress?.axes.staleAfterDays ?? 0}
          data-rd-progress-index-window={progress?.axes.activitySinceDays ?? 0}
        >
          {problemsMode ? (
            <ul className="rd-index" data-rd-problem-index-list={problemRows.length}>
              {problemRows.map((problem) => (
                <li key={problem.id}>
                  <button
                    /* The problem the reading surface is showing, by the same active-row rule the axis index uses. */
                    aria-pressed={shownProblem?.id === problem.id}
                    className="rd-index-item"
                    data-rd-problem-index={problem.id}
                    data-rd-problem-index-axis={problem.axisId}
                    data-rd-problem-index-state={problem.state}
                    data-rd-problem-index-topic={problem.topicName}
                    /* The raw value the context line phrases — carried so the pass can compare the phrase's
                       source against `get_progress` instead of trusting the phrase (the C2 technique). */
                    data-rd-problem-index-recency={problem.recencyAt ?? ""}
                    onClick={() => {
                      setSelectedProblemId(problem.id);
                      setSelectedAxisId(problem.axisId);
                    }}
                    type="button"
                  >
                    <div className="rd-cluster">
                      <StateBadge
                        confidence={problem.stateConfidence}
                        state={problem.state as ProblemState}
                      />
                      <span className="rd-strong">{problem.statement}</span>
                    </div>
                    <span className="rd-meta" data-rd-problem-index-context="true">
                      {indexProblemContext(problem)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
          <ul className="rd-index">
            {(progress?.axes.axes ?? []).map((row) => (
              <li key={row.id}>
                <button
                  /*
                   * The row the detail columns are actually showing — the derived default included. Marking
                   * only the *clicked* row would leave the page displaying an axis's detail with nothing
                   * selected, which is a hidden state the reader cannot see through.
                   */
                  aria-pressed={activeAxis?.id === row.id}
                  className="rd-index-item"
                  data-rd-index-activity={row.activityInWindow}
                  data-rd-index-axis={row.id}
                  data-rd-index-open-problems={row.openProblems}
                  data-rd-index-problems={row.problems}
                  data-rd-index-stale={row.stale}
                  data-rd-index-state={row.state}
                  data-rd-index-topic={row.topicName}
                  /* As on the problem index: the raw `recencyAt` behind `last activity …`, for the pass. */
                  data-rd-index-recency={row.recencyAt ?? ""}
                  onClick={() => setSelectedAxisId(row.id)}
                  type="button"
                >
                  <span className="rd-strong">{row.title}</span>
                  <span className="rd-meta">
                    <StateBadge confidence={row.stateConfidence} state={row.state} />
                    {` · ${row.topicName} · ${problemCountLine(row)} · ${
                      row.stale ? "stale · " : ""
                    }last activity ${describeAge(row.recencyAt)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          )}
          {problemsMode && problemRows.length === 0 ? (
            <p className="rd-muted" data-rd-problem-index-empty="true">
              No problems yet.
            </p>
          ) : null}
          {!problemsMode && progress && progress.axes.axes.length === 0 ? (
            <p className="rd-muted" data-rd-progress-index-empty="true">
              No axes yet.
            </p>
          ) : null}
        </div>
        {/* ONE pane holds everything right of the index: the selected subject's own header, then the three
            grouped rows the prototype nests inside it. Before this the Problem and Activity columns were the
            index's own siblings in one wrapping row and every lower section was an independent full-width
            band, so the selected axis was never the subject of the pane — its identity sat in the index row
            and was repeated as tags inside the Problem column. */}
        <div
          className="rd-progress-detail"
          data-rd-progress-detail="true"
          data-rd-progress-detail-axis={activeAxis?.id ?? ""}
        >
          {/* The axis as this pane's subject: its state, its title, the context its projection row carries
              (the topic and the axis itself, both navigable — the payload carries no repository or person
              relation at axis scope, and none is invented here), and when it last moved. */}
          <DetailHeader
            badge={
              activeAxis ? (
                <StateBadge confidence={activeAxis.stateConfidence} state={activeAxis.state} />
              ) : null
            }
            context={
              activeAxis ? (
                <>
                  <EntityTag
                    id={activeAxis.topicId}
                    label={activeAxis.topicName}
                    onOpen={onOpenEntity}
                    type="topic"
                  />
                  <EntityTag
                    id={activeAxis.id}
                    label={activeAxis.title}
                    onOpen={onOpenEntity}
                    type="axis"
                  />
                </>
              ) : null
            }
            title={
              <h3 className="rd-strong" data-rd-progress-detail-title="true">
                {activeAxis?.title ?? "Nothing is selected"}
              </h3>
            }
          >
            {activeAxis ? (
              <span className="rd-cluster" data-rd-progress-recency="true">
                <RecencyLabel at={activeAxis.recencyAt} prefix="last activity " />
                {activeAxis.stale ? <span className="rd-muted">· stale</span> : null}
              </span>
            ) : null}
          </DetailHeader>

          {/* Row 1 — the glimpse: the Problem beside its Activity, on C1's own dominance grid (the Problem the
              main lane, the Activity its subordinate rail). */}
          <div className="rd-detail-grid rd-progress-pair" data-rd-progress-pair="true">
            {/*
             * The central Problem column — the reading surface, in both index modes, from one set of components.
             *
             * `Axes`: the heading's number is the projection's own `openProblems` for this axis, and the card is
             * the first open problem *in the projection's order* — no recency ranking, no activity-count ranking,
             * no repository-count ranking — with the remaining ones listed and selectable.
             *
             * `Problems`: the card is the problem the index selected, which may be closed out, so a count of open
             * problems would describe something the card is not showing. The heading names what the card is, and
             * a context line says where the problem sits.
             */}
            <div
              className="rd-progress-problem"
              data-rd-progress-problem-axis={activeAxis?.id ?? ""}
              data-rd-progress-problem-mode={indexMode}
              data-rd-progress-problem-open={activeAxis?.openProblems ?? 0}
              data-rd-progress-problem-shown={shownProblem?.id ?? ""}
            >
              <h3 className="rd-strong" data-rd-progress-problem-heading="true">
                {problemsMode
                  ? "Problem"
                  : `Open problems (${activeAxis?.openProblems ?? 0})`}
              </h3>
              {problemsMode && shownProblem ? (
                <span className="rd-meta" data-rd-progress-problem-context="true">
                  {problemContext(shownProblem)}
                </span>
              ) : null}
              {activeAxis === null && !problemsMode ? (
                <p className="rd-muted" data-rd-progress-problem-empty="true">
                  No axis is selected.
                </p>
              ) : shownProblem === null ? (
                <p className="rd-muted" data-rd-progress-problem-empty="true">
                  {problemsMode
                    ? "No problem is recorded yet."
                    : axesModeProblems.length > 0
                      ? "No open problems on this axis."
                      : "Nothing is recorded against this axis."}
                </p>
              ) : (
                <div className="rd-problem-card" data-rd-problem={shownProblem.id}>
                  <div className="rd-cluster">
                    <StateBadge
                      confidence={shownProblem.stateConfidence}
                      state={shownProblem.state as ProblemState}
                    />
                    <span className="rd-meta">{describeAge(shownProblem.recencyAt)}</span>
                  </div>
                  <p className="rd-strong">{shownProblem.statement}</p>
                  <p className="rd-meta" data-rd-problem-facts="true">
                    {problemFacts(shownProblem)}
                  </p>
                  {shownProblem.people.length > 0 ? (
                    <p className="rd-meta">
                      {shownProblem.people
                        .map((person) => person.displayName)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            {/*
             * The Activity column: the server's bucket for this axis, newest first, rendered with the same line
             * the grouped view below uses. The count in the heading is the axis row's `activityInWindow`, which
             * the projection computes from the same predicate as the bucket's `eventCount`.
             *
             * In `Problems` the bucket is the problem's **parent axis**, so the column says which axis it is
             * showing rather than letting the reader assume the feed is the problem's own events. It is the
             * projection's bucket either way — the markup does not reconstruct what belongs to what.
             */}
            <div
              className="rd-progress-activity"
              data-rd-progress-feed-axis={activeAxis?.id ?? ""}
              data-rd-progress-feed-count={feed?.eventCount ?? 0}
              data-rd-progress-feed-mode={indexMode}
            >
              <h3 className="rd-strong">
                {`Activity (${activeAxis?.activityInWindow ?? 0})`}
              </h3>
              {problemsMode && activeAxis ? (
                <span className="rd-meta" data-rd-progress-feed-parent="true">
                  {`on ${activeAxis.title}`}
                </span>
              ) : null}
              {feed === null || feed.events.length === 0 ? (
                <p className="rd-muted" data-rd-progress-feed-empty="true">
                  Nothing recorded against this axis in this window.
                </p>
              ) : (
                <ul
                  className="rd-feed"
                  data-rd-progress-feed={feed.events.length}
                  data-rd-progress-feed-shown={feedShown.length}
                >
                  {/*
                   * The ActivityFeed's half of the contract, rendered through the one shared event line
                   * (component-contract.md § ActivityFeed): the date, the summary, provenance, and a tag for
                   * every entity the event names. The repository and problem are resolved from the rollups and
                   * the problem list already in this payload, so a tag costs no call; an event with no mapped
                   * account says so in words, and an event naming a problem the projection does not carry gets no
                   * tag rather than an unnamed one.
                   */}
                  {feedShown.map((event) => (
                    <ActivityLine
                      attrs={{ "data-rd-feed-event": "true" }}
                      axisLabel={
                        event.axisId !== null && event.axisId === activeAxis?.id
                          ? activeAxis?.title ?? null
                          : null
                      }
                      item={event}
                      key={event.id}
                      onOpenEntity={onOpenEntity}
                      person={event.person}
                      problemLabel={problemOf(event.problemId)?.statement ?? null}
                      repositoryLabel={repositoryOf(event.repositoryId)?.fullName ?? null}
                      topicLabel={
                        event.topicId !== null && event.topicId === activeAxis?.topicId
                          ? activeAxis?.topicName ?? null
                          : null
                      }
                      unattributedNote="no account attributed"
                    />
                  ))}
                </ul>
              )}
              {feed !== null && (feedHidden > 0 || feedAll) ? (
                /*
                 * The feed is capped, and says so. This is not a second disclosure for the *axis* — that is
                 * `Read topic`'s job and stays one control — it governs the feed's own window, which is a
                 * different piece of state. The count is the projection's own, so capping what is shown loses
                 * nothing silently: the reader is told how many there are and can have them in one click.
                 */
                <div className="rd-cluster" data-rd-progress-feed-more={String(feedHidden)}>
                  <span className="rd-meta" data-rd-progress-feed-note="true">
                    {feedAll
                      ? `all ${feed.events.length} shown, newest first`
                      : `${feedShown.length} of ${feed.events.length} shown, newest first`}
                  </span>
                  <Button
                    onClick={() => {
                      setFeedAllFor(feedAll ? null : (activeAxis?.id ?? ""));
                    }}
                    variant="outline"
                  >
                    {feedAll ? "Show fewer" : `Show all ${feed.events.length}`}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {/*
           * Row 2 — the plan beside the axis's problem inventory. Both are optional and each renders only where
           * the projection carries one, so the row collapses honestly rather than reserving a column for a
           * section this axis does not have.
           */}
          {axisPlan !== null || openAxisProblems.length > 0 ? (
            <div className="rd-progress-row" data-rd-progress-row="true">
            {/*
             * The axis's plan, below the top row rather than a fourth column: the composition's glance — which
             * axis, which problem, what has been happening — is the strongest part of the layout, and a plan
             * squeezed in beside it would cost that. Optional by construction: an axis with no plan renders
             * **nothing** here, not an empty shell and not a warning that one is missing.
             *
             * The steps are the projection's own list in the projection's own order. A step's number is rendered
             * only where the step claims a `position`; where the plan claims none, the page says so instead of
             * letting the list order imply a sequence.
             */}
            {axisPlan ? (
              <section
                className="rd-progress-plan"
                data-rd-progress-plan={axisPlan.id}
                data-rd-progress-plan-claims-order={planClaimsOrder}
                data-rd-progress-plan-steps={axisPlan.steps.length}
              >
                <div className="rd-cluster">
                  <span className="rd-section">
                    {`Plan · ${countLabel(axisPlan.steps.length, "step", "steps")}`}
                  </span>
                  <span className="rd-meta">
                    {`${axisPlan.stepsDone} of ${axisPlan.steps.length} done`}
                  </span>
                  {planClaimsOrder ? null : (
                    <span className="rd-meta" data-rd-progress-plan-unordered="true">
                      unordered — no step claims a position
                    </span>
                  )}
                </div>
                <p className="rd-meta">{axisPlan.summary}</p>
                <ul className="rd-plan-steps" data-rd-plan-steps={axisPlan.steps.length}>
                  {axisPlan.steps.map((step) => (
                    <li
                      className="rd-plan-step"
                      data-rd-plan-step={step.id}
                      data-rd-plan-step-position={step.position === null ? "" : String(step.position)}
                      key={step.id}
                    >
                      <div className="rd-cluster">
                        {step.position === null ? null : (
                          <span className="rd-meta">{`${step.position + 1}.`}</span>
                        )}
                        <StateBadge kind="stored" state={step.state} />
                        <span className="rd-strong">{step.title}</span>
                      </div>
                      {step.id === shownProblem?.planStepId ? (
                        <span className="rd-meta" data-rd-plan-step-shown="true">
                          the step the problem on screen sits on
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/*
             * The axis's problem inventory: navigation plus compact context, while the card in the middle column
             * stays the detailed reading surface. Open problems only — resolved ones are not folded in yet — in
             * the projection's own order and set, with no ranking, severity or importance of any kind. The list
             * is *not* "the others": every open problem appears, including the one on screen, which is marked
             * active so the reader can see which card the list is driving.
             *
             * The heading carries no count on purpose: the count is already on the card column's heading, and two
             * headings asserting the same number would be two sources for one fact. An axis with no open problem
             * renders nothing here — the axis is meaningful on its own, and a warning about a missing problem
             * would say otherwise.
             */}
            {openAxisProblems.length > 0 ? (
              <section
                className="rd-progress-problems"
                data-rd-progress-problems={openAxisProblems.length}
                data-rd-progress-problems-axis={activeAxis?.id ?? ""}
              >
                <span className="rd-section">Open problems on this axis</span>
                <ul className="rd-problems" data-rd-problem-list={openAxisProblems.length}>
                  {openAxisProblems.map((problem) => (
                    <li key={problem.id}>
                      <button
                        aria-pressed={problem.id === shownProblem?.id}
                        className="rd-index-item"
                        data-rd-problem-choice={problem.id}
                        onClick={() => setSelectedProblemId(problem.id)}
                        type="button"
                      >
                        <div className="rd-cluster">
                          <StateBadge
                            confidence={problem.stateConfidence}
                            state={problem.state as ProblemState}
                          />
                          <span className="rd-strong">{problem.statement}</span>
                        </div>
                        <span className="rd-meta" data-rd-problem-context="true">
                          {problemContext(problem)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            </div>
          ) : null}

          {/*
           * The support band — repository threads, evidence and human steering, side by side because they
           * answer three different questions about the same problem. Conditional as a group: a subject with
           * none of the three renders no band at all.
           */}
          {(shownProblem?.repositories.length ?? 0) > 0 ||
          (shownProblem?.evidence.length ?? 0) > 0 ||
          problemSteering.length > 0 ||
          axisSteering.length > 0 ? (
            <div className="rd-progress-band" data-rd-progress-band="true">
            {/*
             * Repository threads — where this problem's implementation is happening. The durable relations the
             * projection carries, in the projection's order, each an `EntityTag`: it navigates to the canonical
             * Repository view and selects that repository, and it never filters or mutates anything. Nothing here
             * picks a "primary" repository, because the model does not have one — an implementation link is not a
             * parentage.
             */}
            {shownProblem && shownProblem.repositories.length > 0 ? (
              <section
                className="rd-progress-repositories"
                data-rd-progress-repositories={shownProblem.repositories.length}
              >
                <span className="rd-section">Repository threads</span>
                <div className="rd-cluster rd-tags">
                  {shownProblem.repositories.map((repository) => (
                    <EntityTag
                      id={repository.id}
                      key={repository.id}
                      label={repository.fullName}
                      onOpen={onOpenEntity}
                      type="repository"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/*
             * Evidence — what substantiates the reading, kept with its source. These are the same rows the
             * Activity column shows when they fall in the window, and they are here for a different reason: the
             * feed is chronological movement, this is support for the problem on screen. The source type is
             * rendered, never flattened into a generic link.
             */}
            {shownProblem && shownProblem.evidence.length > 0 ? (
              <section
                className="rd-progress-evidence"
                data-rd-progress-evidence={shownProblem.evidence.length}
              >
                <span className="rd-section">Evidence</span>
                <ul className="rd-evidence">
                  {shownProblem.evidence.map((item) => (
                    <li data-rd-evidence={item.id} key={item.id}>
                      <div className="rd-cluster">
                        <span className="rd-source" data-rd-evidence-source={item.sourceType}>
                          {describeSource(item.sourceType, item.sourceRef)}
                        </span>
                        <span className="rd-strong">{item.summary}</span>
                        <span className="rd-muted">{item.label}</span>
                      </div>
                      <span className="rd-meta">
                        {`${item.occurredAt.slice(0, 10)}${
                          item.sourceUrl ? ` · ${item.sourceUrl}` : ""
                        }`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/*
             * Human steering — the constraint a person put on the librarian's reading, and nothing else: not an
             * ordinary note, not an agent's interpretation (the store excludes both before the page sees them).
             * The two scopes stay apart and each is labelled: a claim aimed at the axis is the axis context, not a
             * claim about every problem beneath it.
             */}
            {problemSteering.length > 0 || axisSteering.length > 0 ? (
              <section className="rd-progress-steering" data-rd-progress-steering="true">
                <span className="rd-section">Human steering</span>
                {problemSteering.length > 0 ? (
                  <ul className="rd-steering" data-rd-steering-scope="problem">
                    {problemSteering.map((claim) => (
                      <li data-rd-steering={claim.id} key={claim.id}>
                        <div className="rd-cluster">
                          <span className="rd-source">{claim.kind}</span>
                          <span className="rd-meta">
                            {`${claim.authorType} · ${claim.recordedAt.slice(0, 10)}${
                              claim.confidence ? ` · ${claim.confidence}` : ""
                            }`}
                          </span>
                        </div>
                        <p className="rd-steering-text">{claim.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {axisSteering.length > 0 ? (
                  <ul className="rd-steering" data-rd-steering-scope="axis">
                    {axisSteering.map((claim) => (
                      <li data-rd-steering={claim.id} key={claim.id}>
                        <div className="rd-cluster">
                          <span className="rd-source">{claim.kind}</span>
                          <span className="rd-meta">
                            {`on the axis · ${claim.authorType} · ${claim.recordedAt.slice(0, 10)}${
                              claim.confidence ? ` · ${claim.confidence}` : ""
                            }`}
                          </span>
                        </div>
                        <p className="rd-steering-text">{claim.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            </div>
          ) : null}
        </div>
        </div>

        {/* The retired feed's one survivor: what this window holds, stated rather than listed. */}
        <p className="rd-muted" data-rd-progress-summary="true">
          {windowDays === 0
            ? "All time"
            : `Last ${countLabel(windowDays, "day", "days")}`}{" "}
          · {countLabel(windowEventCount, "event", "events")} recorded across{" "}
          {countLabel(timeline.length, "topic", "topics")} in this window — the reading above is the
          selected {problemsMode ? "problem" : "axis"}
        </p>

        {/*
         * The topic-bucketed event feed used to stand here: every topic in the window, each with its axis
         * rails and their events, filterable without a re-query. It is retired (C4/F2) — the same window's
         * events were being read twice, once inside the composition's scoped `Activity` box and once here
         * unbounded, and the unbounded copy is what would grow back into a dump. What it reported survives as
         * the count line above, and anything a reader needs per axis is in the composition: the selected
         * axis's `Activity` box already states the axis's own total and how much of it it is showing.
         *
         * The markers it carried (`data-rd-progress-topic`, `data-rd-progress-axis`,
         * `data-rd-progress-events`, `data-rd-progress-event`, `data-rd-progress-empty`, `data-rd-progress-filters`)
         * are gone with it, and the pass asserts their absence rather than merely not looking for them.
         */}
      </div>
    );
  }

  function ResearchPage() {
    const [overview, setOverview] = React.useState<Overview | null>(null);
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

    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
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
     * The Progress index, straight from `get_progress`. Held here rather than inside the view for the same
     * reason the window is: it is scoped by the window, and it is replaced whole on every window change.
     */
    const [progress, setProgress] = React.useState<ProgressIndex | null>(null);
    const [correction, setCorrection] = React.useState<AxisCorrection | null>(
      null
    );
    const [historyAxisId, setHistoryAxisId] = React.useState<string | null>(
      null
    );
    /**
     * Which topic's rail activity the reader asked to see in full, by topic id — the same shape the
     * Progress feed uses (`feedAllFor`). Keyed on the id rather than a boolean, so the rail collapses
     * again when the reader moves to another topic instead of carrying an expansion across.
     */
    const [railAllFor, setRailAllFor] = React.useState<string | null>(null);
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
      options?: { conflictAxisId?: string }
    ): Promise<T | null> {
      setBusy(true);
      setError("");
      try {
        const result = (await ctx.host.call(action, input)) as T;
        if (ctx.signal.aborted) {
          return null;
        }
        if (result && result.ok === false) {
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
        if (!ctx.signal.aborted) {
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
     * The whole default screen comes from this one call. The window is the only thing that changes
     * the query; `includeArchived` is additive and only sent when it is on, so a request body shows
     * exactly what the page asked for.
     *
     * The Progress index rides the same trigger rather than its own: the contract says switching views never
     * queries, so the second read happens when the *window* changes, not when Progress is opened. That costs
     * one extra read per window change and keeps view switching free, which is the trade the contract asks
     * for.
     */
    async function load(nextWindow: number, archived: boolean): Promise<void> {
      const scope = {
        activitySinceDays: nextWindow,
        ...(archived ? { includeArchived: true } : {}),
      };
      const result = await call<{ ok?: boolean } & Overview>("get_overview", scope);
      if (!ctx.signal.aborted && result) {
        setOverview(result as Overview);
      }
      const progressResult = await call<{ ok?: boolean } & ProgressIndex>("get_progress", scope);
      if (!ctx.signal.aborted) {
        // Replaced wholesale, never merged: the index is the projection for *this* window, and a row kept
        // from the previous result would be a client-side model the projection never answered for.
        setProgress(progressResult ? (progressResult as ProgressIndex) : null);
      }
    }

    React.useEffect(() => {
      void load(windowDays, includeArchived);
      // Re-issued whenever the window or the archived toggle changes — nothing else re-queries.
    }, [windowDays, includeArchived]);

    /** The expanded card *is* the detail view: one `get_topic` call, per-axis history included. */
    async function loadDetail(topicId: string): Promise<void> {
      const result = await call<{ ok?: boolean } & TopicDetail>("get_topic", {
        topicId,
      });
      if (!ctx.signal.aborted && result) {
        setDetail(result as TopicDetail);
      }
    }

    React.useEffect(() => {
      setCorrection(null);
      setHistoryAxisId(null);
      setTopicNote("");
      // Changing the subject clears the news about the old one: a conflict from this topic must not
      // follow the reader to the next.
      setConflict(null);
      if (!expandedId) {
        setDetail(null);
        return;
      }
      let active = true;
      (async () => {
        const result = await call<{ ok?: boolean } & TopicDetail>("get_topic", {
          topicId: expandedId,
        });
        if (active && result) {
          setDetail(result as TopicDetail);
        }
      })();
      return () => {
        active = false;
      };
      // One call per topic opened, not per axis: the detail arrives complete.
    }, [expandedId]);

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
     * A manager's correction to an axis: the claim, its confidence, and optionally why. The note lands
     * in the same call as the claim, which is what makes `confirmed` reachable on an axis that nothing
     * else backs — the note *is* the evidence (D8, and the store's evidence rule).
     */
    async function saveCorrection() {
      if (!(detail && correction)) {
        return;
      }
      const axis = detail.axes.find(
        (candidate) => candidate.id === correction.axisId
      );
      if (!axis) {
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
          expectedVersion: detail.topic.version,
          topicId: detail.topic.id,
          ...(note ? { annotations: [{ axisId: axis.id, text: note }] } : {}),
        },
        { conflictAxisId: correction.axisId }
      );
      if (result) {
        setCorrection(null);
        setConflict(null);
        await loadDetail(detail.topic.id);
        await load(windowDays, includeArchived);
      }
    }

    /**
     * Re-read one axis after a refused write, and rebuild the draft on the refreshed facts. The
     * rationale is carried across because it belongs to the person, not to the version they read; the
     * claims are not, because those have to be judged again against what actually changed.
     */
    async function reloadAxis(topicId: string, axisId: string) {
      const result = await call<{ ok?: boolean } & TopicDetail>("get_topic", {
        topicId,
      });
      if (ctx.signal.aborted || !result) {
        return;
      }
      const fresh = result as TopicDetail;
      setDetail(fresh);
      setConflict(null);
      const axis = fresh.axes.find((candidate) => candidate.id === axisId);
      if (axis) {
        setCorrection((current: AxisCorrection | null) =>
          current && current.axisId === axisId
            ? draftFrom(axis, current.note)
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
        await load(windowDays, includeArchived);
      }
    }

    const topics = overview?.topics ?? [];
    const counts = overview?.counts;
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
    const railActivity = selectedDetails?.activity ?? [];
    const railAll = railAllFor !== null && railAllFor === selectedEntry?.topic.id;
    const railShown = railAll ? railActivity : railActivity.slice(0, RAIL_ACTIVITY_LEAD);
    const railHidden = railActivity.length - railShown.length;
    // Before the detail lands, the overview's own axes stand in: the pane is never empty, and the
    // current/completed split appears as soon as the detail that can answer it arrives.
    const currentAxes: Array<AxisDetail | AxisOverview> = (
      selectedDetails ? selectedDetails.axes : (selectedEntry?.axes ?? [])
    ).filter((axis) => axis.state !== "completed" && axis.state !== "abandoned");
    const foldedAxes: AxisDetail[] = selectedDetails
      ? selectedDetails.axes.filter(
          (axis) => axis.state === "completed" || axis.state === "abandoned"
        )
      : [];


    return (
      <div className="rd-stack">
        <div className="rd-row" data-rd-topbar="true">
          <h2 className="rd-page-title">Research overview</h2>
          {/* Three groups rather than one strip: what you are looking at, the window you are looking
              at it through, and the actions. The divider between them is the point — without it this
              reads as ten controls of equal weight in a row. */}
          <div className="rd-toolbar" data-rd-toolbar="true">
            <div className="rd-group" data-rd-group="views">
              <ViewControl disabled={busy} onChange={setView} value={view} />
            </div>
            <div className="rd-group" data-rd-group="window">
              <WindowControl
                disabled={busy}
                onChange={setWindowDays}
                value={windowDays}
              />
              <div className="rd-cluster">
                <Switch
                  aria-label="Show archived topics"
                  checked={includeArchived}
                  disabled={busy}
                  onCheckedChange={(next) => setIncludeArchived(next === true)}
                  size="sm"
                />
                <span className="rd-muted">archived</span>
              </div>
            </div>
            <div className="rd-group" data-rd-group="actions">
              <Button
                disabled={busy}
                onClick={() => {
                  void load(windowDays, includeArchived);
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

        <div className="rd-row">
          <span className="rd-muted">
            {counts
              ? [
                  countLabel(counts.topics, "topic", "topics"),
                  countLabel(counts.axes, "axis", "axes"),
                  countLabel(counts.people, "person", "people"),
                  countLabel(counts.repositories, "repository", "repositories"),
                ].join(" · ")
              : "loading…"}
          </span>
        </div>

        {view === "topics" ? (
          <div className="rd-split" data-rd-view="topics">
            {/* §7 — the shell title stays (the toolbar's "Research overview") and the view names itself:
                a reader landing here, or arriving from a tag, can see which view this page is without
                inferring it from which toolbar button is pressed. */}
            <ViewHeading view="topics" />
            {/* C1 — the prototype's composition: a compact index rail, and ONE persistent detail. The
                index carries the server's order unreranked; the only client state is which topic is
                selected. There is no disclosure control, so the detail is never "closed". */}
            <ul
              aria-label="Topics"
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
                      <span className="rd-row">
                        <span className="rd-strong">{entry.topic.name}</span>
                        {entry.lastActivityAt ? (
                          <RecencyLabel at={entry.lastActivityAt} />
                        ) : null}
                      </span>
                      <span className="rd-cluster">
                        <span className="rd-meta" data-rd-index-current={currentCount}>
                          {countLabel(currentCount, "current axis", "current axes")}
                        </span>
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
              <div
                className="rd-panel rd-topic-detail"
                data-rd-detail={selectedEntry.topic.name}
                data-rd-detail-mode="persistent"
              >
                <div className="rd-detail-head">
                  <div className="rd-row" data-rd-detail-header="true">
                    <CardTitle>{selectedEntry.topic.name}</CardTitle>
                    <span className="rd-muted">{selectedEntry.topic.status}</span>
                  </div>
                  <div className="rd-cluster rd-tags" data-rd-detail-context="true">
                    {(selectedDetails?.repositories ?? selectedEntry.repositories).map(
                      (repository) => (
                        <EntityTag
                          id={repository.id}
                          key={repository.id}
                          label={repository.fullName}
                          onOpen={openEntity}
                          type="repository"
                        />
                      )
                    )}
                    {(selectedDetails?.people ?? selectedEntry.people).map((person) => (
                      <EntityTag
                        id={person.id}
                        key={person.id}
                        label={person.displayName}
                        onOpen={openEntity}
                        type="person"
                      />
                    ))}
                    {(selectedDetails?.repositories ?? selectedEntry.repositories).length === 0 &&
                    (selectedDetails?.people ?? selectedEntry.people).length === 0 ? (
                      <span className="rd-meta">nobody tagged yet</span>
                    ) : null}
                  </div>

                  {selectedDetails ? (
                    <div className="rd-detail-claims">
                      <div className="rd-claim">
                        <span className="rd-claim-value" data-rd-claim="description">
                          {selectedDetails.topic.description || (
                            <span className="rd-muted">no description yet</span>
                          )}
                        </span>
                        <span className="rd-muted">description</span>
                      </div>
                      <div className="rd-claim">
                        <span className="rd-claim-value" data-rd-claim="summary">
                          {selectedDetails.topic.summary || (
                            <span className="rd-muted">no approved summary</span>
                          )}
                        </span>
                        <span className="rd-muted">
                          approved summary — a human interpretation, not an agent one
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

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

                <div className="rd-detail-grid">
                  <section className="rd-current-work" data-rd-current-work={currentAxes.length}>
                    <span className="rd-section">Current work</span>
                    {currentAxes.length === 0 ? (
                      <p className="rd-muted">No current axes on this topic.</p>
                    ) : (
                      <ul className="rd-axes">
                        {currentAxes.map((axis) =>
                          selectedDetails ? (
                            <AxisDetailCard
                              axis={axis as AxisDetail}
                              busy={busy}
                              conflict={conflict}
                              correction={correction}
                              historyOpen={historyAxisId === axis.id}
                              key={axis.id}
                              onCorrection={setCorrection}
                              onOpenEntity={openEntity}
                              onReload={() => {
                                void reloadAxis(selectedEntry.topic.id, axis.id);
                              }}
                              onSave={() => {
                                void saveCorrection();
                              }}
                              onToggleHistory={() => {
                                setHistoryAxisId((current) =>
                                  current === axis.id ? null : axis.id
                                );
                              }}
                            />
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
                            <AxisDetailCard
                              axis={axis as AxisDetail}
                              busy={busy}
                              conflict={conflict}
                              correction={correction}
                              historyOpen={historyAxisId === axis.id}
                              key={axis.id}
                              onCorrection={setCorrection}
                              onOpenEntity={openEntity}
                              onReload={() => {
                                void reloadAxis(selectedEntry.topic.id, axis.id);
                              }}
                              onSave={() => {
                                void saveCorrection();
                              }}
                              onToggleHistory={() => {
                                setHistoryAxisId((current) =>
                                  current === axis.id ? null : axis.id
                                );
                              }}
                            />
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </section>

                  <aside className="rd-side-stack">
                    <section className="rd-side-card">
                      <h3 className="rd-side-title">Recent activity</h3>
                      <ul
                        className="rd-activity"
                        data-rd-topic-activity={
                          selectedDetails?.activity.length ?? selectedEntry.activityCount
                        }
                        data-rd-topic-activity-shown={railShown.length}
                      >
                        {railShown.map((item) => (
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
                        {selectedDetails && selectedDetails.activity.length === 0 ? (
                          <li className="rd-muted">No activity recorded yet.</li>
                        ) : null}
                        {!selectedDetails ? (
                          <li className="rd-muted">Loading this topic…</li>
                        ) : null}
                      </ul>
                      {/* The rail's remainder, stated — the same treatment the Progress feed uses, so the
                          reader is told how many there are and can have them in one click. It governs the
                          rail's own window, not the topic: the topic is already open. */}
                      {railHidden > 0 || railAll ? (
                        <div
                          className="rd-cluster"
                          data-rd-topic-activity-more={String(railHidden)}
                        >
                          <span className="rd-meta" data-rd-topic-activity-note="true">
                            {railAll
                              ? `all ${railActivity.length} shown, newest first`
                              : `${railShown.length} of ${railActivity.length} shown, newest first`}
                          </span>
                          <Button
                            onClick={() => {
                              setRailAllFor(
                                railAll ? null : (selectedEntry?.topic.id ?? null)
                              );
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            {railAll ? "Show fewer" : `Show all ${railActivity.length}`}
                          </Button>
                        </div>
                      ) : null}
                      {selectedDetails ? (
                        // The write path stays (this is a composition-only unit), but it is not the
                        // rail's lede: it sits behind a compact disclosure so the rail reads as
                        // activity, not as a form.
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
                      ) : null}
                    </section>

                    <section className="rd-side-card">
                      <h3 className="rd-side-title">Notes</h3>
                      <ul
                        className="rd-notes"
                        data-rd-topic-notes={selectedDetails?.notes.length ?? 0}
                      >
                        {(selectedDetails?.notes ?? []).map((note) => (
                          <li key={note.id}>
                            <div>{note.text}</div>
                            <span className="rd-meta">
                              {note.authorType} · {note.createdAt.slice(0, 10)}
                            </span>
                          </li>
                        ))}
                        {selectedDetails && selectedDetails.notes.length === 0 ? (
                          <li className="rd-muted">
                            No notes yet. This is where a correction or a caveat goes —
                            deliberately not in the activity log.
                          </li>
                        ) : null}
                      </ul>
                      {selectedDetails ? (
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
                            placeholder="A correction or caveat about this topic"
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
                      ) : null}
                    </section>

                    <section className="rd-side-card">
                      <h3 className="rd-side-title">Related repositories</h3>
                      <div className="rd-cluster rd-tags">
                        {(selectedDetails?.repositories ?? selectedEntry.repositories).map(
                          (repository) => (
                            <EntityTag
                              id={repository.id}
                              key={repository.id}
                              label={repository.fullName}
                              onOpen={openEntity}
                              type="repository"
                            />
                          )
                        )}
                        {(selectedDetails?.repositories ?? selectedEntry.repositories)
                          .length === 0 ? (
                          <span className="rd-muted">No repository linked yet.</span>
                        ) : null}
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {view === "people" ? (
          <PeopleView
            onOpenEntity={openEntity}
            people={overview?.people ?? []}
            preselect={entityTarget?.type === "person" ? entityTarget : null}
            truncated={overview?.peopleTruncated === true}
            windowDays={windowDays}
          />
        ) : null}

        {view === "repositories" ? (
          <RepositoriesView
            onOpenEntity={openEntity}
            preselect={entityTarget?.type === "repository" ? entityTarget : null}
            repositories={overview?.repositories ?? []}
            truncated={overview?.repositoriesTruncated === true}
            windowDays={windowDays}
          />
        ) : null}

        {view === "progress" ? (
          <ProgressView
            onOpenEntity={openEntity}
            people={overview?.people ?? []}
            preselect={
              entityTarget &&
              (entityTarget.type === "axis" || entityTarget.type === "problem")
                ? entityTarget
                : null
            }
            progress={progress}
            repositories={overview?.repositories ?? []}
            timeline={overview?.timeline ?? []}
            windowDays={windowDays}
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
