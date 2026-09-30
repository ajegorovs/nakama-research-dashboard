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
  | "completed"
  | "abandoned";

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

type Activity = {
  id: string;
  axisId: string | null;
  topicId: string | null;
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

/** How many axes a collapsed card leads with — "then 2–4 most relevant axes". */
const LEAD_AXES = 3;

const css = `
[data-plugin-id="research-dashboard"] .rd-stack { display: grid; gap: 14px; }
[data-plugin-id="research-dashboard"] .rd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
[data-plugin-id="research-dashboard"] .rd-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-muted { font-size: 12px; opacity: 0.65; }
[data-plugin-id="research-dashboard"] .rd-error { color: var(--destructive, #b91c1c); font-size: 13px; }
[data-plugin-id="research-dashboard"] .rd-meta {
  display: block;
  font-size: 12px;
  opacity: 0.65;
  margin-top: 2px;
}
[data-plugin-id="research-dashboard"] .rd-topic-card[data-rd-blocked="true"] {
  border-left: 3px solid var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-axes { display: grid; gap: 10px; margin: 0; padding: 0; }
[data-plugin-id="research-dashboard"] .rd-axis {
  list-style: none;
  border-left: 2px solid var(--border);
  padding: 0 0 0 10px;
}
[data-plugin-id="research-dashboard"] .rd-axis[data-rd-axis-state="blocked"] {
  border-left-color: var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-axis-title { font-weight: 600; }
[data-plugin-id="research-dashboard"] .rd-state {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
[data-plugin-id="research-dashboard"] .rd-state[data-rd-state="blocked"] {
  border-color: var(--destructive, #b91c1c);
  color: var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-count {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--muted, rgba(127, 127, 127, 0.1));
}
[data-plugin-id="research-dashboard"] .rd-count[data-rd-state="blocked"] {
  color: var(--destructive, #b91c1c);
  font-weight: 600;
}
[data-plugin-id="research-dashboard"] .rd-blocker { font-size: 12px; margin-top: 2px; }
[data-plugin-id="research-dashboard"] .rd-blocker[data-rd-strong="true"] {
  color: var(--destructive, #b91c1c);
  font-weight: 600;
}
[data-plugin-id="research-dashboard"] .rd-window [aria-pressed="true"] { font-weight: 600; }
[data-plugin-id="research-dashboard"] .rd-views [aria-pressed="true"] { font-weight: 600; }
/* C7: the progress timeline — filters on one line, each axis a labelled rail. */
[data-plugin-id="research-dashboard"] .rd-filters { flex-wrap: wrap; gap: 8px; }
/* C8: the qualifier on a state is part of the claim, not decoration — quieter, never optional. */
[data-plugin-id="research-dashboard"] .rd-claim-suffix { font-weight: 400; opacity: 0.75; }
[data-plugin-id="research-dashboard"] .rd-timeline-axis {
  border-left: 2px solid var(--border, #e5e7eb);
  display: grid;
  gap: 6px;
  padding-left: 10px;
}
[data-plugin-id="research-dashboard"] .rd-timeline-axis .rd-activity li { display: grid; gap: 2px; }
[data-plugin-id="research-dashboard"] .rd-newtopic { flex-wrap: nowrap; }
[data-plugin-id="research-dashboard"] .rd-newtopic input { width: 18rem; }
[data-plugin-id="research-dashboard"] .rd-activity { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-activity li {
  border-left: 2px solid var(--border);
  padding: 0 0 0 10px;
}
[data-plugin-id="research-dashboard"] .rd-form { display: grid; gap: 8px; }
[data-plugin-id="research-dashboard"] .rd-divider {
  border-top: 1px solid var(--border);
  margin: 4px 0 0;
  padding-top: 12px;
}
[data-plugin-id="research-dashboard"] .rd-detail { display: grid; gap: 12px; }
[data-plugin-id="research-dashboard"] .rd-section {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
  font-weight: 600;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  display: grid;
  gap: 6px;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail[data-rd-axis-state="blocked"] {
  border-left: 3px solid var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-claim { display: grid; gap: 2px; }
[data-plugin-id="research-dashboard"] .rd-claim-value { font-size: 13px; }
[data-plugin-id="research-dashboard"] .rd-conf {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px dashed var(--border);
  opacity: 0.8;
}
[data-plugin-id="research-dashboard"] .rd-conf[data-rd-conf="confirmed"] { border-style: solid; }
[data-plugin-id="research-dashboard"] .rd-conf[data-rd-conf="uncertain"] {
  color: var(--destructive, #b91c1c);
  border-color: var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-evidence { font-size: 12px; }
[data-plugin-id="research-dashboard"] .rd-evidence[data-rd-has-evidence="false"] {
  color: var(--destructive, #b91c1c);
}
[data-plugin-id="research-dashboard"] .rd-history { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-history li {
  border-left: 2px solid var(--border);
  padding: 0 0 0 8px;
}
[data-plugin-id="research-dashboard"] .rd-note { border-left-color: var(--accent, #6366f1) !important; }
[data-plugin-id="research-dashboard"] .rd-notes { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-notes li {
  border-left: 2px solid var(--accent, #6366f1);
  padding: 0 0 0 8px;
}
[data-plugin-id="research-dashboard"] .rd-correction {
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  display: grid;
  gap: 8px;
}
[data-plugin-id="research-dashboard"] .rd-grid2 {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
[data-plugin-id="research-dashboard"] .rd-conflict {
  border: 1px solid var(--destructive, #b91c1c);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  gap: 6px;
}
/* C6: the index + panel split both rollup views use. The index stays narrow and the panel takes the
   rest; below a reading width the two stack instead of squeezing a table into a phone. */
[data-plugin-id="research-dashboard"] .rd-split {
  display: flex;
  gap: 12px;
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
  gap: 2px;
}
[data-plugin-id="research-dashboard"] .rd-index-item {
  width: 100%;
  text-align: left;
  display: grid;
  gap: 2px;
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
[data-plugin-id="research-dashboard"] .rd-index-item:hover {
  border-color: var(--border);
}
[data-plugin-id="research-dashboard"] .rd-index-item[aria-pressed="true"] {
  border-color: var(--border);
  background: var(--muted, rgba(127, 127, 127, 0.1));
}
[data-plugin-id="research-dashboard"] .rd-panel {
  flex: 1 1 22rem;
  min-width: 16rem;
}
[data-plugin-id="research-dashboard"] .rd-view { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-involvement {
  border-left: 2px solid var(--border);
  padding: 0 0 0 10px;
  display: grid;
  gap: 6px;
}
[data-plugin-id="research-dashboard"] .rd-involvement > ul { margin: 0; }
`;

type Draft = {
  description: string;
  summary: string;
  /** A manual topic status change carries its rationale (D8) — a note, not a required field. */
  note: string;
  status: string;
  topicId: string;
};

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
  function StateCounts({ counts }: { counts: Record<AxisState, number> }) {
    const shown = [...COUNTED_STATES, ...OTHER_STATES].filter(
      (state) => counts[state] > 0
    );
    if (shown.length === 0) {
      return <span className="rd-muted">no development axes yet</span>;
    }
    return (
      <span className="rd-cluster">
        {shown.map((state) => (
          <span className="rd-count" data-rd-state={state} key={state}>
            {counts[state]} {state}
          </span>
        ))}
      </span>
    );
  }

  function AxisItem({ axis }: { axis: AxisOverview }) {
    const primary = axis.repositories[0]?.fullName ?? "";
    const line = [
      primary,
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const blocked = axis.state === "blocked";
    return (
      <li className="rd-axis" data-rd-axis-state={axis.state}>
        <div className="rd-cluster">
          <StateBadge confidence={axis.stateConfidence} state={axis.state} />
          <span className="rd-muted">{axis.kind}</span>
        </div>
        <div className="rd-axis-title">{axis.title}</div>
        {line ? <span className="rd-meta">{line}</span> : null}
        {axis.currentState ? (
          <div className="rd-meta">{axis.currentState}</div>
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
   * An axis state with the claim attached (C8). A bare "blocked" reads as a fact, and the temporal view
   * would launder an inference into one — so a state that is not confirmed always says so, in the view
   * and in the detail alike: "BLOCKED · inferred". A confirmed state stays bare on screen but still
   * carries `data-rd-state-confidence`, so the two can be told apart from outside without shouting on
   * every card. Nothing renders a state any other way.
   */
  function StateBadge({
    confidence,
    state,
  }: {
    confidence: Confidence | null;
    state: AxisState;
  }) {
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
    onReload: () => void;
    onSave: () => void;
    onToggleHistory: () => void;
  }) {
    const primary = axis.repositories[0]?.fullName ?? "";
    const line = [
      primary,
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const people = axis.people.map((person) => person.displayName).join(", ");
    const correcting = correction?.axisId === axis.id;
    return (
      <li
        className="rd-axis-detail"
        data-rd-axis-state={axis.state}
        data-rd-axis-title={axis.title}
        data-rd-axis-version={axis.version}
      >
        <div className="rd-cluster">
          <StateBadge confidence={axis.stateConfidence} state={axis.state} />
          <span className="rd-muted">{axis.kind}</span>
          <span className="rd-axis-title">{axis.title}</span>
          <span className="rd-muted">v{axis.version}</span>
        </div>
        {axis.description ? (
          <span className="rd-meta">{axis.description}</span>
        ) : null}
        {line ? <span className="rd-meta">{line}</span> : null}
        {people ? <span className="rd-meta">people: {people}</span> : null}

        <div className="rd-claim">
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
        </div>

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

        <div className="rd-cluster">
          <span className="rd-muted">state</span>
          <ConfidenceBadge value={axis.stateConfidence} />
          {axis.lastReviewedAt ? (
            <span className="rd-muted">
              last reviewed {axis.lastReviewedAt.slice(0, 10)}
            </span>
          ) : null}
        </div>

        <EvidenceLine evidence={axis.evidence} />

        <div className="rd-cluster">
          <Button
            data-rd-history-toggle={axis.id}
            disabled={busy}
            onClick={onToggleHistory}
            size="sm"
            variant="outline"
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
            variant={correcting ? "default" : "outline"}
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
  function AxisScanItem({ axis }: { axis: AxisScan }) {
    const where = [
      axis.repositories.map((repository) => repository.fullName).join(", "),
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
        <div className="rd-row">
          <span className="rd-cluster">
            <StateBadge confidence={axis.stateConfidence} state={axis.state} />
            <span className="rd-strong">{axis.title}</span>
          </span>
          <span className="rd-muted">{axis.kind}</span>
        </div>
        <span className="rd-meta">
          {where || "no repository or branch recorded"}
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
    windowDays,
  }: {
    dataAttr: string;
    items: Activity[];
    windowDays: number;
  }) {
    return (
      <ul className="rd-activity" {...{ [dataAttr]: items.length }}>
        {items.map((item) => (
          <li key={item.id}>
            <div>{item.summary}</div>
            <span className="rd-meta">
              {describeSource(item.sourceType, item.sourceRef)} ·{" "}
              {item.occurredAt.slice(0, 10)}
            </span>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rd-muted">
            Nothing recorded in{" "}
            {windowDays === 0
              ? "any window"
              : `the last ${countLabel(windowDays, "day", "days")}`}
            .
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
    windowDays,
  }: {
    entry: PersonRollup;
    windowDays: number;
  }) {
    return (
      <Card
        className="rd-panel"
        data-rd-person-panel={entry.person.displayName}
      >
        <CardHeader>
          <div className="rd-row">
            <CardTitle>{entry.person.displayName}</CardTitle>
            {entry.person.githubLogin ? (
              <span className="rd-muted">@{entry.person.githubLogin}</span>
            ) : null}
          </div>
          <span className="rd-meta" data-rd-person-counts="true">
            {involvementLine(entry)}
          </span>
        </CardHeader>
        <CardContent>
          <div className="rd-form">
            <span className="rd-section">Topics they are on</span>
            <ul className="rd-view" data-rd-person-topics={entry.topics.length}>
              {entry.topics.map((involvement) => (
                <li
                  className="rd-involvement"
                  data-rd-involvement={involvement.topic.name}
                  key={involvement.topic.id}
                >
                  <div className="rd-row">
                    <span className="rd-strong">{involvement.topic.name}</span>
                    <span className="rd-muted">
                      {involvement.role
                        ? `${involvement.topic.status} · ${involvement.role}`
                        : involvement.topic.status}
                    </span>
                  </div>
                  {involvement.axes.length === 0 ? (
                    <span className="rd-muted">no axis of theirs here</span>
                  ) : (
                    <ul className="rd-axes">
                      {involvement.axes.map((axis) => (
                        <AxisScanItem axis={axis} key={axis.id} />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {entry.topics.length === 0 ? (
                <li className="rd-muted">
                  Not linked to a topic yet — the link is what puts work on this
                  page.
                </li>
              ) : null}
            </ul>

            <span className="rd-section">Activity attributable to them</span>
            {entry.attributable ? (
              <ActivityList
                dataAttr="data-rd-person-activity"
                items={entry.recentActivity}
                windowDays={windowDays}
              />
            ) : (
              <p className="rd-muted" data-rd-attributable="false">
                No account is mapped to this person, so no recorded event can be
                attributed to them. That is a missing link, not an absence of
                work.
              </p>
            )}

            <span className="rd-meta" data-rd-person-last="true">
              {entry.lastActivityAt
                ? `last activity ${describeAge(entry.lastActivityAt)}`
                : "no attributable activity yet"}
              {entry.lastReviewedAt
                ? ` · last reviewed ${describeAge(entry.lastReviewedAt)}`
                : " · never reviewed"}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  function PeopleView({
    people,
    truncated,
    windowDays,
  }: {
    people: PersonRollup[];
    truncated: boolean;
    windowDays: number;
  }) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
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
                onClick={() => setSelectedId(entry.person.id)}
                type="button"
              >
                <span className="rd-strong">{entry.person.displayName}</span>
                <span className="rd-meta">{involvementLine(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <PersonPanel entry={selected} windowDays={windowDays} />
        ) : null}
      </div>
    );
  }

  /**
   * Repository-first (C6): what each codebase supports, the axes that name it, and the events recorded
   * against it or against one of those axes. The same rules as the person view — factual, never scored.
   */
  function RepositoriesView({
    repositories,
    truncated,
    windowDays,
  }: {
    repositories: RepositoryRollup[];
    truncated: boolean;
    windowDays: number;
  }) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
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
              <CardTitle>{selected.repository.fullName}</CardTitle>
              <span className="rd-meta">
                {selected.repository.description || "no description recorded"}
                {selected.repository.defaultBranch
                  ? ` · default branch ${selected.repository.defaultBranch}`
                  : ""}
              </span>
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
                      <span className="rd-strong">{link.topic.name}</span>
                      <span className="rd-muted">· {link.relationship}</span>
                    </li>
                  ))}
                  {selected.topics.length === 0 ? (
                    <li className="rd-muted">no topic names it yet</li>
                  ) : null}
                </ul>

                <span className="rd-section">Current work</span>
                <ul
                  className="rd-axes"
                  data-rd-repository-axes={selected.axes.length}
                >
                  {selected.axes.map((axis) => (
                    <AxisScanItem axis={axis} key={axis.id} />
                  ))}
                  {selected.axes.length === 0 ? (
                    <li className="rd-muted">no axis names this repository</li>
                  ) : null}
                </ul>

                <span className="rd-section">Recent activity</span>
                <ActivityList
                  dataAttr="data-rd-repository-activity"
                  items={selected.recentActivity}
                  windowDays={windowDays}
                />

                <span className="rd-meta" data-rd-repository-last="true">
                  {selected.lastActivityAt
                    ? `last activity ${describeAge(selected.lastActivityAt)}`
                    : "no activity recorded yet"}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  /** One filter control. "All …" is the default and means "no filter" — a sentinel, not an empty value. */
  function FilterSelect({
    label,
    onChange,
    options,
    value,
  }: {
    label: string;
    onChange: (next: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) {
    return (
      <Select
        onValueChange={(next: string | null) => {
          if (next !== null) {
            onChange(String(next));
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label={label}>
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

  /**
   * The time view (C7): what changed inside the window, grouped topic → axis, newest topic first.
   *
   * Grouped rather than one flat log, because "what moved in the last two weeks across six concurrent
   * axes" is only readable when the events keep their axis. Every filter is applied to the payload the
   * page already holds — no re-query, no new call — and the two *context* filters (topic, repository)
   * read the axis, which is exactly how an event that named only its axis still filters correctly.
   */
  function ProgressView({
    people,
    repositories,
    timeline,
    windowDays,
  }: {
    people: PersonRollup[];
    repositories: RepositoryRollup[];
    timeline: TimelineGroup[];
    windowDays: number;
  }) {
    const [topicFilter, setTopicFilter] = React.useState("all");
    const [personFilter, setPersonFilter] = React.useState("all");
    const [repositoryFilter, setRepositoryFilter] = React.useState("all");
    const [stateFilter, setStateFilter] = React.useState("all");

    const groups = timeline
      .filter(
        (group) => topicFilter === "all" || group.topic.id === topicFilter
      )
      .map((group) => {
        const axes = group.axes
          .filter(
            (bucket) =>
              stateFilter === "all" || bucket.axis?.state === stateFilter
          )
          .filter(
            (bucket) =>
              repositoryFilter === "all" ||
              (bucket.axis?.repositories ?? []).some(
                (repository) => repository.id === repositoryFilter
              )
          )
          .map((bucket) => ({
            ...bucket,
            events: bucket.events.filter(
              (event) =>
                personFilter === "all" || event.person?.id === personFilter
            ),
          }))
          .filter((bucket) => bucket.events.length > 0);
        return { ...group, axes };
      })
      .filter((group) => group.axes.length > 0);

    const eventCount = groups.reduce(
      (total, group) =>
        total +
        group.axes.reduce((sum, bucket) => sum + bucket.events.length, 0),
      0
    );
    const filtered =
      topicFilter !== "all" ||
      personFilter !== "all" ||
      repositoryFilter !== "all" ||
      stateFilter !== "all";

    return (
      <div className="rd-stack" data-rd-view="progress">
        <div className="rd-cluster rd-filters">
          <FilterSelect
            label="Filter by topic"
            onChange={setTopicFilter}
            options={[
              { label: "All topics", value: "all" },
              ...timeline.map((group) => ({
                label: group.topic.name,
                value: group.topic.id,
              })),
            ]}
            value={topicFilter}
          />
          <FilterSelect
            label="Filter by person"
            onChange={setPersonFilter}
            options={[
              { label: "Anyone (incl. unattributed)", value: "all" },
              ...people.map((entry) => ({
                label: entry.person.displayName,
                value: entry.person.id,
              })),
            ]}
            value={personFilter}
          />
          <FilterSelect
            label="Filter by repository"
            onChange={setRepositoryFilter}
            options={[
              { label: "All repositories", value: "all" },
              ...repositories.map((entry) => ({
                label: entry.repository.fullName,
                value: entry.repository.id,
              })),
            ]}
            value={repositoryFilter}
          />
          <FilterSelect
            label="Filter by axis state"
            onChange={setStateFilter}
            options={[
              { label: "All states", value: "all" },
              ...STATE_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              })),
            ]}
            value={stateFilter}
          />
        </div>

        <span className="rd-muted" data-rd-progress-summary="true">
          {windowDays === 0
            ? "All time"
            : `Last ${countLabel(windowDays, "day", "days")}`}{" "}
          · {countLabel(eventCount, "event", "events")} across{" "}
          {countLabel(groups.length, "topic", "topics")}
          {filtered ? " (filtered)" : ""}
        </span>

        {groups.length === 0 ? (
          <Card data-rd-progress-empty="true">
            <CardContent>
              <p className="rd-muted">
                {filtered
                  ? "Nothing matches these filters in this window."
                  : "Nothing was recorded in this window yet."}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {groups.map((group) => (
          <Card data-rd-progress-topic={group.topic.name} key={group.topic.id}>
            <CardHeader>
              <div className="rd-row">
                <CardTitle>{group.topic.name}</CardTitle>
                <span className="rd-muted">
                  {countLabel(group.eventCount, "event", "events")} ·{" "}
                  {describeAge(group.lastActivityAt)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rd-stack">
                {group.axes.map((bucket) => (
                  <div
                    className="rd-timeline-axis"
                    data-rd-progress-axis={bucket.axis?.title ?? "topic-level"}
                    key={bucket.axis?.id ?? "topic-level"}
                  >
                    <div className="rd-row">
                      <span className="rd-cluster">
                        {bucket.axis ? (
                          <StateBadge
                            confidence={bucket.axis.stateConfidence}
                            state={bucket.axis.state}
                          />
                        ) : null}
                        <span className="rd-strong">
                          {bucket.axis?.title ?? "topic-level"}
                        </span>
                      </span>
                      <span className="rd-meta">
                        {[
                          bucket.axis?.kind ?? "",
                          (bucket.axis?.repositories ?? [])
                            .map((repository) => repository.fullName)
                            .join(", "),
                          bucket.axis?.branch ?? "",
                          bucket.axis?.prNumber === null ||
                          bucket.axis?.prNumber === undefined
                            ? ""
                            : `PR #${bucket.axis.prNumber}`,
                        ]
                          .filter((value) => value !== "")
                          .join(" · ")}
                      </span>
                    </div>
                    <ul
                      className="rd-activity"
                      data-rd-progress-events={bucket.events.length}
                    >
                      {bucket.events.map((event) => (
                        <li data-rd-progress-event="true" key={event.id}>
                          <div className="rd-cluster">
                            <span className="rd-meta">
                              {event.occurredAt.slice(0, 10)}
                            </span>
                            <span className="rd-strong">{event.summary}</span>
                          </div>
                          <span className="rd-meta">
                            {describeSource(event.sourceType, event.sourceRef)}{" "}
                            ·{" "}
                            {event.person
                              ? event.person.displayName
                              : "no account attributed"}
                          </span>
                        </li>
                      ))}
                      {bucket.eventCount > bucket.events.length ? (
                        <li className="rd-muted">
                          {bucket.eventCount - bucket.events.length} older here
                          — open the topic for the full history
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  function ResearchPage() {
    const [overview, setOverview] = React.useState<Overview | null>(null);
    const [view, setView] = React.useState<ViewName>("topics");
    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<
      (Draft & { topicId: string }) | null
    >(null);
    const [newName, setNewName] = React.useState("");
    const [detail, setDetail] = React.useState<TopicDetail | null>(null);
    const [correction, setCorrection] = React.useState<AxisCorrection | null>(
      null
    );
    const [historyAxisId, setHistoryAxisId] = React.useState<string | null>(
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
     */
    async function load(nextWindow: number, archived: boolean): Promise<void> {
      const result = await call<{ ok?: boolean } & Overview>("get_overview", {
        activitySinceDays: nextWindow,
        ...(archived ? { includeArchived: true } : {}),
      });
      if (!ctx.signal.aborted && result) {
        setOverview(result as Overview);
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

    function toggle(topicId: string) {
      setExpandedId((current) => (current === topicId ? null : topicId));
      setEditing(null);
      setDetail(null);
      setConflict(null);
    }

    function startEditing(entry: TopicOverview) {
      setExpandedId(entry.topic.id);
      setConflict(null);
      setEditing({
        description: entry.topic.description,
        note: "",
        status: entry.topic.status,
        summary: entry.topic.summary,
        topicId: entry.topic.id,
      });
    }

    async function createTopic(event: unknown) {
      const formEvent = event as { preventDefault(): void };
      formEvent.preventDefault();
      const name = newName.trim();
      if (!name) {
        return;
      }
      // Creating a topic is a reconcile with nothing but its name — the same single write path.
      const result = await call<{ ok?: boolean; topic: Topic }>(
        "reconcile_topic",
        { topicName: name }
      );
      if (result?.topic) {
        setNewName("");
        await load(windowDays, includeArchived);
        startEditing({
          activityCount: 0,
          axes: [],
          axisCounts: {
            abandoned: 0,
            active: 0,
            blocked: 0,
            completed: 0,
            draft: 0,
            parked: 0,
          },
          lastActivityAt: null,
          people: [],
          repositories: [],
          topic: result.topic,
        });
      }
    }

    /**
     * Saving the topic's own fields. The status change rides along with its note (D8): one atomic
     * reconcile, so the rationale and the change it explains can never be separated.
     */
    async function saveDetails() {
      if (!(detail && editing)) {
        return;
      }
      const note = editing.note.trim();
      const result = await call("reconcile_topic", {
        expectedVersion: detail.topic.version,
        topic: {
          description: editing.description,
          ...(editing.status === detail.topic.status
            ? {}
            : { status: editing.status }),
          summary: editing.summary,
        },
        topicId: detail.topic.id,
        ...(note ? { annotations: [{ text: note }] } : {}),
      });
      if (result) {
        setEditing(null);
        setConflict(null);
        await loadDetail(detail.topic.id);
        await load(windowDays, includeArchived);
      }
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

    return (
      <div className="rd-stack">
        <div className="rd-row">
          <h2 style={{ margin: 0 }}>Research overview</h2>
          <div className="rd-cluster">
            <ViewControl disabled={busy} onChange={setView} value={view} />
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

        {error ? (
          <p className="rd-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rd-row">
          <div className="rd-cluster">
            {view === "topics" ? (
              <form
                className="rd-cluster rd-newtopic"
                onSubmit={(event) => {
                  void createTopic(event);
                }}
              >
                <Input
                  aria-label="New topic name"
                  disabled={busy}
                  maxLength={120}
                  onChange={(event) =>
                    setNewName((event.target as { value: string }).value)
                  }
                  placeholder="New topic name"
                  value={newName}
                />
                <Button disabled={busy || !newName.trim()} type="submit">
                  Add topic
                </Button>
              </form>
            ) : null}
          </div>
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

        {view === "topics"
          ? topics.map((entry) => {
              const hasBlocked = entry.axisCounts.blocked > 0;
              const expanded = entry.topic.id === expandedId;
              const shown = expanded
                ? entry.axes
                : entry.axes.slice(0, LEAD_AXES);
              const hidden = entry.axes.length - shown.length;
              const editingThis = editing?.topicId === entry.topic.id;
              // The expanded card renders from the `get_topic` detail (history, notes and evidence per
              // axis); the collapsed card renders from the overview it already has.
              const details =
                expanded && detail && detail.topic.id === entry.topic.id
                  ? detail
                  : null;
              return (
                <Card
                  className="rd-topic-card"
                  data-rd-blocked={hasBlocked}
                  data-rd-topic={entry.topic.name}
                  key={entry.topic.id}
                >
                  <CardHeader>
                    <div className="rd-row">
                      <CardTitle>{entry.topic.name}</CardTitle>
                      <span className="rd-muted">{entry.topic.status}</span>
                    </div>
                    <span className="rd-meta">
                      {entry.people.length > 0
                        ? entry.people
                            .map((person) => person.displayName)
                            .join(", ")
                        : "nobody tagged yet"}
                      {entry.repositories.length > 0
                        ? ` · ${entry.repositories
                            .map((repository) => repository.fullName)
                            .join(", ")}`
                        : ""}
                    </span>
                  </CardHeader>
                  <CardContent>
                    <div className="rd-form">
                      <StateCounts counts={entry.axisCounts} />

                      <ul className="rd-axes">
                        {details
                          ? details.axes.map((axis) => (
                              <AxisDetailCard
                                axis={axis}
                                busy={busy}
                                conflict={conflict}
                                correction={correction}
                                historyOpen={historyAxisId === axis.id}
                                key={axis.id}
                                onCorrection={setCorrection}
                                onReload={() => {
                                  void reloadAxis(details.topic.id, axis.id);
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
                            ))
                          : shown.map((axis) => (
                              <AxisItem axis={axis} key={axis.id} />
                            ))}
                      </ul>

                      <div className="rd-row">
                        <span className="rd-muted">
                          Recent: {entry.activityCount} event
                          {entry.activityCount === 1 ? "" : "s"} · last activity{" "}
                          {describeAge(entry.lastActivityAt)}
                        </span>
                        <div className="rd-cluster">
                          {entry.axes.length > LEAD_AXES ? (
                            <Button
                              disabled={busy}
                              onClick={() => toggle(entry.topic.id)}
                              size="sm"
                              variant="outline"
                            >
                              {expanded
                                ? "Show fewer axes"
                                : `All ${entry.axes.length} axes`}
                            </Button>
                          ) : null}
                          <Button
                            disabled={busy}
                            onClick={() => {
                              if (editingThis) {
                                // Closing the fields closes the card with them: for a topic with fewer axes
                                // than the lead count there is no "show fewer axes" control, so this is the
                                // only way back to a collapsed card — and the detail is not a separate
                                // navigation pattern, it is the expanded card.
                                setEditing(null);
                                setExpandedId(null);
                              } else {
                                startEditing(entry);
                              }
                            }}
                            size="sm"
                            variant={editingThis ? "outline" : "default"}
                          >
                            {editingThis ? "Close" : "Edit fields"}
                          </Button>
                        </div>
                      </div>

                      {hidden > 0 && !expanded ? (
                        <span className="rd-muted">
                          {hidden} more axe{hidden === 1 ? "" : "s"} hidden
                        </span>
                      ) : null}

                      {details ? (
                        <div
                          className="rd-detail rd-divider"
                          data-rd-detail={details.topic.name}
                        >
                          <span className="rd-section">Topic</span>
                          <div className="rd-claim">
                            <span
                              className="rd-claim-value"
                              data-rd-claim="description"
                            >
                              {details.topic.description || (
                                <span className="rd-muted">
                                  no description yet
                                </span>
                              )}
                            </span>
                            <span className="rd-muted">description</span>
                          </div>
                          <div className="rd-claim">
                            <span
                              className="rd-claim-value"
                              data-rd-claim="summary"
                            >
                              {details.topic.summary || (
                                <span className="rd-muted">
                                  no approved summary
                                </span>
                              )}
                            </span>
                            <span className="rd-muted">
                              approved summary — a human interpretation, not an
                              agent one
                            </span>
                          </div>
                          <span
                            className="rd-meta"
                            data-rd-detail-counts="true"
                          >
                            {[
                              countLabel(details.counts.axes, "axis", "axes"),
                              countLabel(
                                details.counts.activities,
                                "activity",
                                "activities"
                              ),
                              countLabel(details.counts.notes, "note", "notes"),
                              `${details.counts.axesWithoutEvidence} without evidence`,
                            ].join(" · ")}
                          </span>

                          {conflict && !conflict.axisId ? (
                            <div
                              className="rd-conflict"
                              data-rd-conflict="true"
                              role="alert"
                            >
                              <span className="rd-strong">
                                This topic changed since you opened it.
                              </span>
                              <span className="rd-meta">
                                {conflict.message}
                              </span>
                              <div className="rd-cluster">
                                <Button
                                  disabled={busy}
                                  onClick={() => {
                                    void loadDetail(details.topic.id);
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

                          <span className="rd-section">
                            Corrections &amp; notes · {details.notes.length}
                          </span>
                          <ul
                            className="rd-notes"
                            data-rd-topic-notes={details.notes.length}
                          >
                            {details.notes.map((note) => (
                              <li key={note.id}>
                                <div>{note.text}</div>
                                <span className="rd-meta">
                                  {note.authorType} ·{" "}
                                  {note.createdAt.slice(0, 10)}
                                </span>
                              </li>
                            ))}
                            {details.notes.length === 0 ? (
                              <li className="rd-muted">
                                No notes yet. This is where a correction or a
                                caveat goes — deliberately not in the activity
                                log.
                              </li>
                            ) : null}
                          </ul>
                          <form
                            className="rd-cluster"
                            onSubmit={(event) => {
                              void addTopicNote(event);
                            }}
                          >
                            <Input
                              aria-label="Topic note"
                              disabled={busy}
                              maxLength={1000}
                              onChange={(event) =>
                                setTopicNote(
                                  (event.target as { value: string }).value
                                )
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
                              Add note
                            </Button>
                          </form>

                          <CardTitle className="rd-meta">Activity</CardTitle>
                          <ul
                            className="rd-activity"
                            data-rd-topic-activity={details.activity.length}
                          >
                            {details.activity.map((item) => {
                              const axisTitle = details.axes.find(
                                (axis) => axis.id === item.axisId
                              )?.title;
                              return (
                                <li key={item.id}>
                                  <div>{item.summary}</div>
                                  <span className="rd-meta">
                                    {SOURCE_OPTIONS.find(
                                      (option) =>
                                        option.value === item.sourceType
                                    )?.label ?? item.sourceType}
                                    {item.sourceRef
                                      ? ` · ${item.sourceRef}`
                                      : ""}{" "}
                                    · {item.occurredAt.slice(0, 10)}
                                    {item.actorType
                                      ? ` · ${item.actorType}`
                                      : ""}
                                    {axisTitle ? ` · axis: ${axisTitle}` : ""}
                                  </span>
                                </li>
                              );
                            })}
                            {details.activity.length === 0 ? (
                              <li className="rd-muted">
                                No activity recorded yet.
                              </li>
                            ) : null}
                          </ul>
                          <form
                            className="rd-form"
                            onSubmit={(event) => {
                              void addActivity(event);
                            }}
                          >
                            <Textarea
                              aria-label="Activity"
                              disabled={busy}
                              onChange={(event) =>
                                setActivitySummary(
                                  (event.target as { value: string }).value
                                )
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
                              type="submit"
                            >
                              Record activity
                            </Button>
                          </form>
                        </div>
                      ) : null}

                      {editingThis && editing ? (
                        <div
                          className="rd-form rd-divider"
                          data-rd-topic-editor="true"
                        >
                          <Textarea
                            aria-label="Topic description"
                            disabled={busy}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                description: (event.target as { value: string })
                                  .value,
                              })
                            }
                            placeholder="What this topic is"
                            value={editing.description}
                          />
                          <Textarea
                            aria-label="Approved summary"
                            disabled={busy}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                summary: (event.target as { value: string })
                                  .value,
                              })
                            }
                            placeholder="Approved summary (interpretation, confirmed by a human)"
                            value={editing.summary}
                          />
                          <div className="rd-row">
                            <div className="rd-cluster">
                              <StatusSelect
                                disabled={busy}
                                onChange={(next) => {
                                  setEditing({ ...editing, status: next });
                                }}
                                value={editing.status}
                              />
                              <span className="rd-muted">
                                {editing.status === entry.topic.status
                                  ? "unchanged"
                                  : `was ${entry.topic.status}`}
                              </span>
                            </div>
                            <span className="rd-muted">
                              v{entry.topic.version} · updated{" "}
                              {entry.topic.updatedAt.slice(0, 10)}
                            </span>
                          </div>
                          <Textarea
                            aria-label="Note on this change"
                            disabled={busy}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                note: (event.target as { value: string }).value,
                              })
                            }
                            placeholder="Why (optional) — saved with the change as a note on this topic"
                            value={editing.note}
                          />
                          <div className="rd-cluster">
                            <Button
                              disabled={busy || !details}
                              onClick={() => {
                                void saveDetails();
                              }}
                            >
                              Save
                            </Button>
                            <span className="rd-muted">
                              The status change and its note land in one call.
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          : null}

        {view === "people" ? (
          <PeopleView
            people={overview?.people ?? []}
            truncated={overview?.peopleTruncated === true}
            windowDays={windowDays}
          />
        ) : null}

        {view === "repositories" ? (
          <RepositoriesView
            repositories={overview?.repositories ?? []}
            truncated={overview?.repositoriesTruncated === true}
            windowDays={windowDays}
          />
        ) : null}

        {view === "progress" ? (
          <ProgressView
            people={overview?.people ?? []}
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
