/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * Plugin page. One page is required by the host; the list/detail split lives inside it.
 * React, the shared UI controls and the stylesheet are supplied by the dashboard — this
 * module must not bundle React, React DOM or @nakama/ui.
 */
import type * as UI from "@nakama/ui";
import type * as ReactType from "react";

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

type Activity = {
  id: string;
  projectId: string;
  sourceType: string;
  sourceRef: string;
  summary: string;
  occurredAt: string;
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
  { label: "Done", value: "done" },
];

const SOURCE_OPTIONS = [
  { label: "Manual note", value: "manual" },
  { label: "Pull request", value: "github_pr" },
  { label: "Issue", value: "github_issue" },
  { label: "Commit", value: "commit" },
  { label: "Experiment / run", value: "experiment" },
  { label: "Document / notebook", value: "document" },
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
[data-plugin-id="research-dashboard"] .rd-projects { display: grid; gap: 4px; }
[data-plugin-id="research-dashboard"] .rd-project {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}
[data-plugin-id="research-dashboard"] .rd-project:hover { border-color: var(--border); }
[data-plugin-id="research-dashboard"] .rd-project[data-selected="true"] {
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
        <SelectTrigger aria-label="Project status">
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
    const [projects, setProjects] = React.useState<Project[]>([]);
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

    const selected =
      projects.find((project) => project.id === selectedId) ?? null;

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

    async function loadProjects(): Promise<Project[]> {
      const result = await call<{ ok?: boolean; projects: Project[] }>(
        "list_projects"
      );
      const next = result?.projects ?? [];
      if (!ctx.signal.aborted) {
        setProjects(next);
      }
      return next;
    }

    async function loadActivity(projectId: string): Promise<void> {
      const result = await call<{ ok?: boolean; activity: Activity[] }>(
        "list_activity",
        {
          limit: 50,
          projectId,
        }
      );
      if (!ctx.signal.aborted) {
        setActivity(result?.activity ?? []);
      }
    }

    React.useEffect(() => {
      let active = true;
      (async () => {
        const result = await call<{ ok?: boolean; projects: Project[] }>(
          "list_projects"
        );
        if (active && result) {
          setProjects(result.projects);
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
            projectId: selectedId,
          }
        );
        if (active && result) {
          setActivity(result.activity);
        }
      })();
      return () => {
        active = false;
      };
      // Reloads when the selected project changes.
    }, [selectedId]);

    function select(project: Project) {
      setSelectedId(project.id);
      setDraft({ description: project.description, summary: project.summary });
    }

    async function createProject(event: unknown) {
      const formEvent = event as { preventDefault(): void };
      formEvent.preventDefault();
      const name = newName.trim();
      if (!name) {
        return;
      }
      const result = await call<{ ok?: boolean; project: Project }>(
        "create_project",
        {
          name,
        }
      );
      if (result?.project) {
        setNewName("");
        await loadProjects();
        select(result.project);
      }
    }

    async function saveDetails() {
      if (!selected) {
        return;
      }
      await call("update_project", {
        description: draft.description,
        projectId: selected.id,
        summary: draft.summary,
      });
      await loadProjects();
    }

    async function changeStatus(next: string) {
      if (!selected) {
        return;
      }
      await call("update_project", { projectId: selected.id, status: next });
      await loadProjects();
    }

    async function addActivity(event: unknown) {
      const formEvent = event as { preventDefault(): void };
      formEvent.preventDefault();
      if (!(selected && activitySummary.trim())) {
        return;
      }
      const result = await call("add_activity", {
        projectId: selected.id,
        sourceRef: activitySourceRef.trim(),
        sourceType: activitySourceType,
        summary: activitySummary.trim(),
      });
      if (result) {
        setActivitySummary("");
        setActivitySourceRef("");
        await loadActivity(selected.id);
        await loadProjects();
      }
    }

    return (
      <div className="rd-stack">
        <div className="rd-row">
          <h2 style={{ margin: 0 }}>Research dashboard</h2>
          <div className="rd-row">
            <span className="rd-muted">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
            <Button
              disabled={busy}
              onClick={() => {
                void loadProjects();
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
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rd-form">
                <form
                  className="rd-form"
                  onSubmit={(event) => {
                    void createProject(event);
                  }}
                >
                  <Input
                    aria-label="New project name"
                    disabled={busy}
                    maxLength={120}
                    onChange={(event) =>
                      setNewName((event.target as { value: string }).value)
                    }
                    placeholder="New project name"
                    value={newName}
                  />
                  <Button disabled={busy || !newName.trim()} type="submit">
                    Add project
                  </Button>
                </form>
                <div className="rd-projects">
                  {projects.map((project) => (
                    <button
                      className="rd-project"
                      data-selected={project.id === selectedId}
                      disabled={busy}
                      key={project.id}
                      onClick={() => select(project)}
                      type="button"
                    >
                      {project.name}
                      <span className="rd-meta">
                        {project.status} · updated{" "}
                        {project.updatedAt.slice(0, 10)}
                      </span>
                    </button>
                  ))}
                  {projects.length === 0 ? (
                    <p className="rd-muted">No projects recorded yet.</p>
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
                      aria-label="Project description"
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          description: (event.target as { value: string })
                            .value,
                        })
                      }
                      placeholder="What this project is"
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
                        created {selected.createdAt.slice(0, 10)} · id{" "}
                        {selected.id.slice(0, 8)}
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
                  Select a project to see its description, approved summary and
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
