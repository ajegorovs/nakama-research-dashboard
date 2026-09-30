/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * Plugin page. One page is required by the host; the list/detail split lives inside it.
 * React, the shared UI controls and the stylesheet are supplied by the dashboard — this
 * module must not bundle React, React DOM or @nakama/ui.
 *
 * The page talks to the same actions the agent uses (`list_topics`, `reconcile_topic`,
 * `record_activity`); `exposeAsTool` governs the agent's tool registry, not HTTP access, so the two
 * callers share one write path and one set of rules. Writes send the version they read, so a change
 * made elsewhere shows up as a conflict message instead of being silently overwritten.
 *
 * Still generation-1 in presentation: topics only, no axes, no confidence marking, no provenance
 * display — chunk C8 redesigns what the page shows, now against this surface.
 */
import type * as UI from "@nakama/ui";
import type * as ReactType from "react";

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

type Activity = {
  id: string;
  axisId: string | null;
  sourceType: string;
  sourceRef: string;
  summary: string;
  occurredAt: string;
  actorType: string;
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

const css = `
[data-plugin-id="research-dashboard"] .rd-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(240px, 1fr) minmax(320px, 2fr);
  align-items: start;
}
[data-plugin-id="research-dashboard"] .rd-stack { display: grid; gap: 12px; }
[data-plugin-id="research-dashboard"] .rd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
[data-plugin-id="research-dashboard"] .rd-topics { display: grid; gap: 4px; }
[data-plugin-id="research-dashboard"] .rd-topic {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}
[data-plugin-id="research-dashboard"] .rd-topic:hover { border-color: var(--border); }
[data-plugin-id="research-dashboard"] .rd-topic[data-selected="true"] {
  border-color: var(--border);
  background: var(--muted, rgba(127, 127, 127, 0.08));
}
[data-plugin-id="research-dashboard"] .rd-meta {
  font-size: 12px;
  opacity: 0.65;
  display: block;
  margin-top: 2px;
}
[data-plugin-id="research-dashboard"] .rd-activity { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
[data-plugin-id="research-dashboard"] .rd-activity li {
  border-left: 2px solid var(--border);
  padding: 0 0 0 10px;
}
[data-plugin-id="research-dashboard"] .rd-form { display: grid; gap: 8px; }
[data-plugin-id="research-dashboard"] .rd-muted { font-size: 12px; opacity: 0.65; }
[data-plugin-id="research-dashboard"] .rd-error { color: var(--destructive, #b91c1c); font-size: 13px; }
`;

type Draft = {
  description: string;
  summary: string;
};

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

  function ResearchPage() {
    const [topics, setTopics] = React.useState<Topic[]>([]);
    const [activity, setActivity] = React.useState<Activity[]>([]);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState<Draft>({
      description: "",
      summary: "",
    });
    const [newName, setNewName] = React.useState("");
    const [activitySummary, setActivitySummary] = React.useState("");
    const [activitySourceType, setActivitySourceType] =
      React.useState("github_pr");
    const [activitySourceRef, setActivitySourceRef] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");

    const selected = topics.find((topic) => topic.id === selectedId) ?? null;

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

    async function loadActivity(topicId: string): Promise<void> {
      const result = await call<{ ok?: boolean; activity: Activity[] }>(
        "list_activity",
        {
          limit: 50,
          topicId,
        }
      );
      if (!ctx.signal.aborted) {
        setActivity(result?.activity ?? []);
      }
    }

    React.useEffect(() => {
      let active = true;
      (async () => {
        const result = await call<{ ok?: boolean; topics: Topic[] }>(
          "list_topics"
        );
        if (active && result) {
          setTopics(result.topics);
        }
      })();
      return () => {
        active = false;
      };
      // Runs once per activation; org/theme/revision changes dispose and re-run it.
    }, []);

    React.useEffect(() => {
      if (!selectedId) {
        setActivity([]);
        return;
      }
      let active = true;
      (async () => {
        const result = await call<{ ok?: boolean; activity: Activity[] }>(
          "list_activity",
          {
            limit: 50,
            topicId: selectedId,
          }
        );
        if (active && result) {
          setActivity(result.activity);
        }
      })();
      return () => {
        active = false;
      };
      // Reloads when the selected topic changes.
    }, [selectedId]);

    async function loadTopics(): Promise<Topic[]> {
      const result = await call<{ ok?: boolean; topics: Topic[] }>(
        "list_topics"
      );
      const next = result?.topics ?? [];
      if (!ctx.signal.aborted) {
        setTopics(next);
      }
      return next;
    }

    function select(topic: Topic) {
      setSelectedId(topic.id);
      setDraft({ description: topic.description, summary: topic.summary });
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
        {
          topicName: name,
        }
      );
      if (result?.topic) {
        setNewName("");
        await loadTopics();
        select(result.topic);
      }
    }

    async function saveDetails() {
      if (!selected) {
        return;
      }
      await call("reconcile_topic", {
        expectedVersion: selected.version,
        topic: { description: draft.description, summary: draft.summary },
        topicId: selected.id,
      });
      await loadTopics();
    }

    async function changeStatus(next: string) {
      if (!selected) {
        return;
      }
      await call("reconcile_topic", {
        expectedVersion: selected.version,
        topic: { status: next },
        topicId: selected.id,
      });
      await loadTopics();
    }

    async function addActivity(event: unknown) {
      const formEvent = event as { preventDefault(): void };
      formEvent.preventDefault();
      if (!(selected && activitySummary.trim())) {
        return;
      }
      const result = await call("record_activity", {
        sourceRef: activitySourceRef.trim(),
        sourceType: activitySourceType,
        summary: activitySummary.trim(),
        topicId: selected.id,
      });
      if (result) {
        setActivitySummary("");
        setActivitySourceRef("");
        await loadActivity(selected.id);
        await loadTopics();
      }
    }

    return (
      <div className="rd-stack">
        <div className="rd-row">
          <h2 style={{ margin: 0 }}>Research dashboard</h2>
          <div className="rd-row">
            <span className="rd-muted">
              {topics.length} topic{topics.length === 1 ? "" : "s"}
            </span>
            <Button
              disabled={busy}
              onClick={() => {
                void loadTopics();
                if (selectedId) {
                  void loadActivity(selectedId);
                }
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

        <div className="rd-grid">
          <Card>
            <CardHeader>
              <CardTitle>Topics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rd-form">
                <form
                  className="rd-form"
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
                <div className="rd-topics">
                  {topics.map((topic) => (
                    <button
                      className="rd-topic"
                      data-selected={topic.id === selectedId}
                      disabled={busy}
                      key={topic.id}
                      onClick={() => select(topic)}
                      type="button"
                    >
                      {topic.name}
                      <span className="rd-meta">
                        {topic.status} · updated {topic.updatedAt.slice(0, 10)}
                      </span>
                    </button>
                  ))}
                  {topics.length === 0 ? (
                    <p className="rd-muted">No topics recorded yet.</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {selected ? (
            <div className="rd-stack">
              <Card>
                <CardHeader>
                  <div className="rd-row">
                    <CardTitle>{selected.name}</CardTitle>
                    <StatusSelect
                      disabled={busy}
                      onChange={(next) => {
                        void changeStatus(next);
                      }}
                      value={selected.status}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rd-form">
                    <Textarea
                      aria-label="Topic description"
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          description: (event.target as { value: string })
                            .value,
                        })
                      }
                      placeholder="What this topic is"
                      value={draft.description}
                    />
                    <Textarea
                      aria-label="Approved summary"
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          summary: (event.target as { value: string }).value,
                        })
                      }
                      placeholder="Approved summary (interpretation, confirmed by a human)"
                      value={draft.summary}
                    />
                    <div className="rd-row">
                      <span className="rd-muted">
                        created {selected.createdAt.slice(0, 10)} · v
                        {selected.version} · id {selected.id.slice(0, 8)}
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rd-form">
                    <ul className="rd-activity">
                      {activity.map((entry) => (
                        <li key={entry.id}>
                          <div>{entry.summary}</div>
                          <span className="rd-meta">
                            {SOURCE_OPTIONS.find(
                              (option) => option.value === entry.sourceType
                            )?.label ?? entry.sourceType}
                            {entry.sourceRef ? ` · ${entry.sourceRef}` : ""} ·{" "}
                            {entry.occurredAt.slice(0, 10)}
                            {entry.actorType ? ` · ${entry.actorType}` : ""}
                          </span>
                        </li>
                      ))}
                      {activity.length === 0 ? (
                        <li className="rd-muted">No activity recorded yet.</li>
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
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="rd-muted">
                  Select a topic to see its description, approved summary and
                  recorded activity.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  ctx.slots.register("page", ResearchPage);
}
