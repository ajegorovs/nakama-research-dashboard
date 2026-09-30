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
var css = `
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
  function ResearchPage() {
    const [topics, setTopics] = React.useState([]);
    const [activity, setActivity] = React.useState([]);
    const [selectedId, setSelectedId] = React.useState(null);
    const [draft, setDraft] = React.useState({
      description: "",
      summary: ""
    });
    const [newName, setNewName] = React.useState("");
    const [activitySummary, setActivitySummary] = React.useState("");
    const [activitySourceType, setActivitySourceType] = React.useState("github_pr");
    const [activitySourceRef, setActivitySourceRef] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const selected = topics.find((topic) => topic.id === selectedId) ?? null;
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
    async function loadActivity(topicId) {
      const result = await call("list_activity", {
        limit: 50,
        topicId
      });
      if (!ctx.signal.aborted) {
        setActivity(result?.activity ?? []);
      }
    }
    React.useEffect(() => {
      let active = true;
      (async () => {
        const result = await call("list_topics");
        if (active && result) {
          setTopics(result.topics);
        }
      })();
      return () => {
        active = false;
      };
    }, []);
    React.useEffect(() => {
      if (!selectedId) {
        setActivity([]);
        return;
      }
      let active = true;
      (async () => {
        const result = await call("list_activity", {
          limit: 50,
          topicId: selectedId
        });
        if (active && result) {
          setActivity(result.activity);
        }
      })();
      return () => {
        active = false;
      };
    }, [selectedId]);
    async function loadTopics() {
      const result = await call("list_topics");
      const next = result?.topics ?? [];
      if (!ctx.signal.aborted) {
        setTopics(next);
      }
      return next;
    }
    function select(topic) {
      setSelectedId(topic.id);
      setDraft({ description: topic.description, summary: topic.summary });
    }
    async function createTopic(event) {
      const formEvent = event;
      formEvent.preventDefault();
      const name = newName.trim();
      if (!name) {
        return;
      }
      const result = await call("reconcile_topic", {
        topicName: name
      });
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
        topicId: selected.id
      });
      await loadTopics();
    }
    async function changeStatus(next) {
      if (!selected) {
        return;
      }
      await call("reconcile_topic", {
        expectedVersion: selected.version,
        topic: { status: next },
        topicId: selected.id
      });
      await loadTopics();
    }
    async function addActivity(event) {
      const formEvent = event;
      formEvent.preventDefault();
      if (!(selected && activitySummary.trim())) {
        return;
      }
      const result = await call("record_activity", {
        sourceRef: activitySourceRef.trim(),
        sourceType: activitySourceType,
        summary: activitySummary.trim(),
        topicId: selected.id
      });
      if (result) {
        setActivitySummary("");
        setActivitySourceRef("");
        await loadActivity(selected.id);
        await loadTopics();
      }
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("h2", {
      style: { margin: 0 }
    }, "Research dashboard"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, topics.length, " topic", topics.length === 1 ? "" : "s"), /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: () => {
        loadTopics();
        if (selectedId) {
          loadActivity(selectedId);
        }
      },
      variant: "outline"
    }, "Refresh"))), error ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-error",
      role: "alert"
    }, error) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-grid"
    }, /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(CardTitle, null, "Topics")), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-form"
    }, /* @__PURE__ */ React.createElement("form", {
      className: "rd-form",
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
    }, "Add topic")), /* @__PURE__ */ React.createElement("div", {
      className: "rd-topics"
    }, topics.map((topic) => /* @__PURE__ */ React.createElement("button", {
      className: "rd-topic",
      "data-selected": topic.id === selectedId,
      disabled: busy,
      key: topic.id,
      onClick: () => select(topic),
      type: "button"
    }, topic.name, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, topic.status, " · updated ", topic.updatedAt.slice(0, 10)))), topics.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No topics recorded yet.") : null)))), selected ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement(CardTitle, null, selected.name), /* @__PURE__ */ React.createElement(StatusSelect, {
      disabled: busy,
      onChange: (next) => {
        changeStatus(next);
      },
      value: selected.status
    }))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-form"
    }, /* @__PURE__ */ React.createElement(Textarea, {
      "aria-label": "Topic description",
      disabled: busy,
      onChange: (event) => setDraft({
        ...draft,
        description: event.target.value
      }),
      placeholder: "What this topic is",
      value: draft.description
    }), /* @__PURE__ */ React.createElement(Textarea, {
      "aria-label": "Approved summary",
      disabled: busy,
      onChange: (event) => setDraft({
        ...draft,
        summary: event.target.value
      }),
      placeholder: "Approved summary (interpretation, confirmed by a human)",
      value: draft.summary
    }), /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "created ", selected.createdAt.slice(0, 10), " · v", selected.version, " · id ", selected.id.slice(0, 8)), /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: () => {
        saveDetails();
      }
    }, "Save"))))), /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(CardTitle, null, "Activity")), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-form"
    }, /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity"
    }, activity.map((entry) => /* @__PURE__ */ React.createElement("li", {
      key: entry.id
    }, /* @__PURE__ */ React.createElement("div", null, entry.summary), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, SOURCE_OPTIONS.find((option) => option.value === entry.sourceType)?.label ?? entry.sourceType, entry.sourceRef ? ` · ${entry.sourceRef}` : "", " ·", " ", entry.occurredAt.slice(0, 10), entry.actorType ? ` · ${entry.actorType}` : ""))), activity.length === 0 ? /* @__PURE__ */ React.createElement("li", {
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
    }, "Record activity")))))) : /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "Select a topic to see its description, approved summary and recorded activity.")))));
  }
  ctx.slots.register("page", ResearchPage);
}
export {
  apply,
  inject
};
