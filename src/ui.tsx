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
  updatedAt: string;
};

type AxisOverview = Axis & { repositories: LinkedRepository[] };

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

type Activity = {
  id: string;
  axisId: string | null;
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
`;

type Draft = {
  description: string;
  summary: string;
};

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
      <div className="rd-cluster rd-window" role="group" aria-label="Activity window">
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
          <span className="rd-state" data-rd-state={axis.state}>
            {axis.state}
          </span>
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

  function ResearchPage() {
    const [overview, setOverview] = React.useState<Overview | null>(null);
    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<
      (Draft & { topicId: string }) | null
    >(null);
    const [newName, setNewName] = React.useState("");
    const [activity, setActivity] = React.useState<Activity[]>([]);
    const [activitySummary, setActivitySummary] = React.useState("");
    const [activitySourceType, setActivitySourceType] =
      React.useState("github_pr");
    const [activitySourceRef, setActivitySourceRef] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");

    async function call<T extends { ok?: boolean; error?: string }>(
      action: string,
      input?: unknown
    ): Promise<T | null> {
      setBusy(true);
      setError("");
      try {
        const result = (await ctx.host.call(action, input)) as T;
        if (ctx.signal.aborted) {
          return null;
        }
        if (result && result.ok === false) {
          setError(result.error ?? "The request was rejected.");
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

    React.useEffect(() => {
      if (!expandedId) {
        setActivity([]);
        return;
      }
      let active = true;
      (async () => {
        const result = await call<{ activity: Activity[]; ok?: boolean }>(
          "list_activity",
          { limit: 50, topicId: expandedId }
        );
        if (active && result) {
          setActivity(result.activity ?? []);
        }
      })();
      return () => {
        active = false;
      };
      // The expanded card is the only reader of the per-topic history.
    }, [expandedId]);

    function toggle(topicId: string) {
      setExpandedId((current) => (current === topicId ? null : topicId));
      setEditing(null);
      setActivity([]);
    }

    function startEditing(entry: TopicOverview) {
      setExpandedId(entry.topic.id);
      setEditing({
        description: entry.topic.description,
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

    async function saveDetails() {
      const entry = overview?.topics.find(
        (candidate) => candidate.topic.id === editing?.topicId
      );
      if (!(entry && editing)) {
        return;
      }
      const result = await call("reconcile_topic", {
        expectedVersion: entry.topic.version,
        topic: { description: editing.description, summary: editing.summary },
        topicId: editing.topicId,
      });
      if (result) {
        await load(windowDays, includeArchived);
      }
    }

    async function changeStatus(next: string) {
      const entry = editing
        ? overview?.topics.find(
            (candidate) => candidate.topic.id === editing.topicId
          )
        : null;
      if (!entry) {
        return;
      }
      const result = await call("reconcile_topic", {
        expectedVersion: entry.topic.version,
        topic: { status: next },
        topicId: entry.topic.id,
      });
      if (result) {
        await load(windowDays, includeArchived);
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
        const refreshed = await call<{ activity: Activity[]; ok?: boolean }>(
          "list_activity",
          { limit: 50, topicId: expandedId }
        );
        if (refreshed) {
          setActivity(refreshed.activity ?? []);
        }
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
          </div>
          <span className="rd-muted">
            {counts
              ? [
                  countLabel(counts.topics, "topic", "topics"),
                  countLabel(counts.axes, "axis", "axes"),
                  countLabel(counts.people, "person", "people"),
                  countLabel(
                    counts.repositories,
                    "repository",
                    "repositories"
                  ),
                ].join(" · ")
              : "loading…"}
          </span>
        </div>

        {topics.map((entry) => {
          const hasBlocked = entry.axisCounts.blocked > 0;
          const expanded = entry.topic.id === expandedId;
          const shown = expanded
            ? entry.axes
            : entry.axes.slice(0, LEAD_AXES);
          const hidden = entry.axes.length - shown.length;
          const editingThis = editing?.topicId === entry.topic.id;
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
                    {shown.map((axis) => (
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
                            setEditing(null);
                          } else {
                            startEditing(entry);
                          }
                        }}
                        size="sm"
                        variant={editingThis ? "outline" : "default"}
                      >
                        {editingThis ? "Close" : "Edit"}
                      </Button>
                    </div>
                  </div>

                  {hidden > 0 && !expanded ? (
                    <span className="rd-muted">
                      {hidden} more axe{hidden === 1 ? "" : "s"} hidden
                    </span>
                  ) : null}

                  {editingThis && editing ? (
                    <div className="rd-form rd-divider">
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
                            summary: (event.target as { value: string }).value,
                          })
                        }
                        placeholder="Approved summary (interpretation, confirmed by a human)"
                        value={editing.summary}
                      />
                      <div className="rd-row">
                        <StatusSelect
                          disabled={busy}
                          onChange={(next) => {
                            void changeStatus(next);
                          }}
                          value={entry.topic.status}
                        />
                        <div className="rd-cluster">
                          <span className="rd-muted">
                            v{entry.topic.version} · updated{" "}
                            {entry.topic.updatedAt.slice(0, 10)}
                          </span>
                          <Button
                            disabled={busy}
                            onClick={() => {
                              void saveDetails();
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      </div>

                      <CardTitle className="rd-meta">Activity</CardTitle>
                      <ul className="rd-activity">
                        {activity.map((item) => (
                          <li key={item.id}>
                            <div>{item.summary}</div>
                            <span className="rd-meta">
                              {SOURCE_OPTIONS.find(
                                (option) => option.value === item.sourceType
                              )?.label ?? item.sourceType}
                              {item.sourceRef ? ` · ${item.sourceRef}` : ""} ·{" "}
                              {item.occurredAt.slice(0, 10)}
                              {item.actorType ? ` · ${item.actorType}` : ""}
                            </span>
                          </li>
                        ))}
                        {activity.length === 0 ? (
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
                </div>
              </CardContent>
            </Card>
          );
        })}

        {overview && topics.length === 0 ? (
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
