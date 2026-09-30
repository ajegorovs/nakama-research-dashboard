// src/ui.tsx
var inject = ["slots", "host", "ui", "styles"];
var STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" }
];
var SOURCE_OPTIONS = [
  { label: "Manual note", value: "manual" },
  { label: "Pull request", value: "github_pr" },
  { label: "Commit", value: "github_commit" },
  { label: "Issue", value: "github_issue" },
  { label: "Document / notebook", value: "repo_document" },
  { label: "Group chat", value: "group_chat" },
  { label: "Experiment / run", value: "experiment" },
  { label: "Agent review", value: "agent_review" }
];
var WINDOW_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All time" }
];
var COUNTED_STATES = ["blocked", "active", "draft", "parked"];
var OTHER_STATES = ["completed", "abandoned"];
var LEAD_AXES = 3;
var css = `
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
function countLabel(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
function describeAge(iso) {
  if (!iso) {
    return "no activity yet";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "unknown";
  }
  const days = Math.floor((Date.now() - then) / 86400000);
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
function apply(ctx) {
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
    Textarea
  } = ctx.ui;
  ctx.styles(css);
  function StatusSelect({
    value,
    onChange,
    disabled
  }) {
    return /* @__PURE__ */ React.createElement(Select, {
      disabled,
      onValueChange: (next) => {
        if (next !== null) {
          onChange(String(next));
        }
      },
      value
    }, /* @__PURE__ */ React.createElement(SelectTrigger, {
      "aria-label": "Topic status"
    }, /* @__PURE__ */ React.createElement(SelectValue, null, STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value)), /* @__PURE__ */ React.createElement(SelectContent, null, STATUS_OPTIONS.map((option) => /* @__PURE__ */ React.createElement(SelectItem, {
      key: option.value,
      value: option.value
    }, option.label))));
  }
  function SourceSelect({
    value,
    onChange,
    disabled
  }) {
    return /* @__PURE__ */ React.createElement(Select, {
      disabled,
      onValueChange: (next) => {
        if (next !== null) {
          onChange(String(next));
        }
      },
      value
    }, /* @__PURE__ */ React.createElement(SelectTrigger, {
      "aria-label": "Source type"
    }, /* @__PURE__ */ React.createElement(SelectValue, null, SOURCE_OPTIONS.find((option) => option.value === value)?.label ?? value)), /* @__PURE__ */ React.createElement(SelectContent, null, SOURCE_OPTIONS.map((option) => /* @__PURE__ */ React.createElement(SelectItem, {
      key: option.value,
      value: option.value
    }, option.label))));
  }
  function WindowControl({
    value,
    onChange,
    disabled
  }) {
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-window",
      role: "group",
      "aria-label": "Activity window"
    }, WINDOW_OPTIONS.map((option) => /* @__PURE__ */ React.createElement(Button, {
      "aria-pressed": option.days === value,
      "data-rd-window": option.days,
      disabled,
      key: option.days,
      onClick: () => onChange(option.days),
      size: "sm",
      variant: "outline"
    }, option.label)));
  }
  function StateCounts({ counts }) {
    const shown = [...COUNTED_STATES, ...OTHER_STATES].filter((state) => counts[state] > 0);
    if (shown.length === 0) {
      return /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "no development axes yet");
    }
    return /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, shown.map((state) => /* @__PURE__ */ React.createElement("span", {
      className: "rd-count",
      "data-rd-state": state,
      key: state
    }, counts[state], " ", state)));
  }
  function AxisItem({ axis }) {
    const primary = axis.repositories[0]?.fullName ?? "";
    const line = [
      primary,
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : ""
    ].filter(Boolean).join(" · ");
    const blocked = axis.state === "blocked";
    return /* @__PURE__ */ React.createElement("li", {
      className: "rd-axis",
      "data-rd-axis-state": axis.state
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-state",
      "data-rd-state": axis.state
    }, axis.state), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, axis.kind)), /* @__PURE__ */ React.createElement("div", {
      className: "rd-axis-title"
    }, axis.title), line ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, line) : null, axis.currentState ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-meta"
    }, axis.currentState) : null, axis.blocker ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-blocker",
      "data-rd-strong": blocked
    }, "Blocker: ", axis.blocker) : null);
  }
  function ResearchPage() {
    const [overview, setOverview] = React.useState(null);
    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [expandedId, setExpandedId] = React.useState(null);
    const [editing, setEditing] = React.useState(null);
    const [newName, setNewName] = React.useState("");
    const [activity, setActivity] = React.useState([]);
    const [activitySummary, setActivitySummary] = React.useState("");
    const [activitySourceType, setActivitySourceType] = React.useState("github_pr");
    const [activitySourceRef, setActivitySourceRef] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    async function call(action, input) {
      setBusy(true);
      setError("");
      try {
        const result = await ctx.host.call(action, input);
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
          setError(String(cause?.message ?? cause));
        }
        return null;
      } finally {
        if (!ctx.signal.aborted) {
          setBusy(false);
        }
      }
    }
    async function load(nextWindow, archived) {
      const result = await call("get_overview", {
        activitySinceDays: nextWindow,
        ...archived ? { includeArchived: true } : {}
      });
      if (!ctx.signal.aborted && result) {
        setOverview(result);
      }
    }
    React.useEffect(() => {
      load(windowDays, includeArchived);
    }, [windowDays, includeArchived]);
    React.useEffect(() => {
      if (!expandedId) {
        setActivity([]);
        return;
      }
      let active = true;
      (async () => {
        const result = await call("list_activity", { limit: 50, topicId: expandedId });
        if (active && result) {
          setActivity(result.activity ?? []);
        }
      })();
      return () => {
        active = false;
      };
    }, [expandedId]);
    function toggle(topicId) {
      setExpandedId((current) => current === topicId ? null : topicId);
      setEditing(null);
      setActivity([]);
    }
    function startEditing(entry) {
      setExpandedId(entry.topic.id);
      setEditing({
        description: entry.topic.description,
        summary: entry.topic.summary,
        topicId: entry.topic.id
      });
    }
    async function createTopic(event) {
      const formEvent = event;
      formEvent.preventDefault();
      const name = newName.trim();
      if (!name) {
        return;
      }
      const result = await call("reconcile_topic", { topicName: name });
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
            parked: 0
          },
          lastActivityAt: null,
          people: [],
          repositories: [],
          topic: result.topic
        });
      }
    }
    async function saveDetails() {
      const entry = overview?.topics.find((candidate) => candidate.topic.id === editing?.topicId);
      if (!(entry && editing)) {
        return;
      }
      const result = await call("reconcile_topic", {
        expectedVersion: entry.topic.version,
        topic: { description: editing.description, summary: editing.summary },
        topicId: editing.topicId
      });
      if (result) {
        await load(windowDays, includeArchived);
      }
    }
    async function changeStatus(next) {
      const entry = editing ? overview?.topics.find((candidate) => candidate.topic.id === editing.topicId) : null;
      if (!entry) {
        return;
      }
      const result = await call("reconcile_topic", {
        expectedVersion: entry.topic.version,
        topic: { status: next },
        topicId: entry.topic.id
      });
      if (result) {
        await load(windowDays, includeArchived);
      }
    }
    async function addActivity(event) {
      const formEvent = event;
      formEvent.preventDefault();
      if (!(expandedId && activitySummary.trim())) {
        return;
      }
      const result = await call("record_activity", {
        sourceRef: activitySourceRef.trim(),
        sourceType: activitySourceType,
        summary: activitySummary.trim(),
        topicId: expandedId
      });
      if (result) {
        setActivitySummary("");
        setActivitySourceRef("");
        const refreshed = await call("list_activity", { limit: 50, topicId: expandedId });
        if (refreshed) {
          setActivity(refreshed.activity ?? []);
        }
        await load(windowDays, includeArchived);
      }
    }
    const topics = overview?.topics ?? [];
    const counts = overview?.counts;
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("h2", {
      style: { margin: 0 }
    }, "Research overview"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(WindowControl, {
      disabled: busy,
      onChange: setWindowDays,
      value: windowDays
    }), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(Switch, {
      "aria-label": "Show archived topics",
      checked: includeArchived,
      disabled: busy,
      onCheckedChange: (next) => setIncludeArchived(next === true),
      size: "sm"
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "archived")), /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: () => {
        load(windowDays, includeArchived);
      },
      variant: "outline"
    }, "Refresh"))), error ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-error",
      role: "alert"
    }, error) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("form", {
      className: "rd-cluster rd-newtopic",
      onSubmit: (event) => {
        createTopic(event);
      }
    }, /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "New topic name",
      disabled: busy,
      maxLength: 120,
      onChange: (event) => setNewName(event.target.value),
      placeholder: "New topic name",
      value: newName
    }), /* @__PURE__ */ React.createElement(Button, {
      disabled: busy || !newName.trim(),
      type: "submit"
    }, "Add topic"))), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, counts ? [
      countLabel(counts.topics, "topic", "topics"),
      countLabel(counts.axes, "axis", "axes"),
      countLabel(counts.people, "person", "people"),
      countLabel(counts.repositories, "repository", "repositories")
    ].join(" · ") : "loading…")), topics.map((entry) => {
      const hasBlocked = entry.axisCounts.blocked > 0;
      const expanded = entry.topic.id === expandedId;
      const shown = expanded ? entry.axes : entry.axes.slice(0, LEAD_AXES);
      const hidden = entry.axes.length - shown.length;
      const editingThis = editing?.topicId === entry.topic.id;
      return /* @__PURE__ */ React.createElement(Card, {
        className: "rd-topic-card",
        "data-rd-blocked": hasBlocked,
        "data-rd-topic": entry.topic.name,
        key: entry.topic.id
      }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement("div", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement(CardTitle, null, entry.topic.name), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, entry.topic.status)), /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, entry.people.length > 0 ? entry.people.map((person) => person.displayName).join(", ") : "nobody tagged yet", entry.repositories.length > 0 ? ` · ${entry.repositories.map((repository) => repository.fullName).join(", ")}` : "")), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
        className: "rd-form"
      }, /* @__PURE__ */ React.createElement(StateCounts, {
        counts: entry.axisCounts
      }), /* @__PURE__ */ React.createElement("ul", {
        className: "rd-axes"
      }, shown.map((axis) => /* @__PURE__ */ React.createElement(AxisItem, {
        axis,
        key: axis.id
      }))), /* @__PURE__ */ React.createElement("div", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "Recent: ", entry.activityCount, " event", entry.activityCount === 1 ? "" : "s", " · last activity", " ", describeAge(entry.lastActivityAt)), /* @__PURE__ */ React.createElement("div", {
        className: "rd-cluster"
      }, entry.axes.length > LEAD_AXES ? /* @__PURE__ */ React.createElement(Button, {
        disabled: busy,
        onClick: () => toggle(entry.topic.id),
        size: "sm",
        variant: "outline"
      }, expanded ? "Show fewer axes" : `All ${entry.axes.length} axes`) : null, /* @__PURE__ */ React.createElement(Button, {
        disabled: busy,
        onClick: () => {
          if (editingThis) {
            setEditing(null);
          } else {
            startEditing(entry);
          }
        },
        size: "sm",
        variant: editingThis ? "outline" : "default"
      }, editingThis ? "Close" : "Edit"))), hidden > 0 && !expanded ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, hidden, " more axe", hidden === 1 ? "" : "s", " hidden") : null, editingThis && editing ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-form rd-divider"
      }, /* @__PURE__ */ React.createElement(Textarea, {
        "aria-label": "Topic description",
        disabled: busy,
        onChange: (event) => setEditing({
          ...editing,
          description: event.target.value
        }),
        placeholder: "What this topic is",
        value: editing.description
      }), /* @__PURE__ */ React.createElement(Textarea, {
        "aria-label": "Approved summary",
        disabled: busy,
        onChange: (event) => setEditing({
          ...editing,
          summary: event.target.value
        }),
        placeholder: "Approved summary (interpretation, confirmed by a human)",
        value: editing.summary
      }), /* @__PURE__ */ React.createElement("div", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement(StatusSelect, {
        disabled: busy,
        onChange: (next) => {
          changeStatus(next);
        },
        value: entry.topic.status
      }), /* @__PURE__ */ React.createElement("div", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "v", entry.topic.version, " · updated", " ", entry.topic.updatedAt.slice(0, 10)), /* @__PURE__ */ React.createElement(Button, {
        disabled: busy,
        onClick: () => {
          saveDetails();
        }
      }, "Save"))), /* @__PURE__ */ React.createElement(CardTitle, {
        className: "rd-meta"
      }, "Activity"), /* @__PURE__ */ React.createElement("ul", {
        className: "rd-activity"
      }, activity.map((item) => /* @__PURE__ */ React.createElement("li", {
        key: item.id
      }, /* @__PURE__ */ React.createElement("div", null, item.summary), /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, SOURCE_OPTIONS.find((option) => option.value === item.sourceType)?.label ?? item.sourceType, item.sourceRef ? ` · ${item.sourceRef}` : "", " ·", " ", item.occurredAt.slice(0, 10), item.actorType ? ` · ${item.actorType}` : ""))), activity.length === 0 ? /* @__PURE__ */ React.createElement("li", {
        className: "rd-muted"
      }, "No activity recorded yet.") : null), /* @__PURE__ */ React.createElement("form", {
        className: "rd-form",
        onSubmit: (event) => {
          addActivity(event);
        }
      }, /* @__PURE__ */ React.createElement(Textarea, {
        "aria-label": "Activity",
        disabled: busy,
        onChange: (event) => setActivitySummary(event.target.value),
        placeholder: "One objective event, e.g. PR #72 merged",
        value: activitySummary
      }), /* @__PURE__ */ React.createElement("div", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement(SourceSelect, {
        disabled: busy,
        onChange: setActivitySourceType,
        value: activitySourceType
      }), /* @__PURE__ */ React.createElement(Input, {
        "aria-label": "Source reference",
        disabled: busy,
        maxLength: 200,
        onChange: (event) => setActivitySourceRef(event.target.value),
        placeholder: "Reference (PR #, commit, run id)",
        value: activitySourceRef
      })), /* @__PURE__ */ React.createElement(Button, {
        disabled: busy || !activitySummary.trim(),
        type: "submit"
      }, "Record activity"))) : null)));
    }), overview && topics.length === 0 ? /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No topics yet. Add one above, or let the agent record what the group is working on."))) : null);
  }
  ctx.slots.register("page", ResearchPage);
}
export {
  apply,
  inject
};
