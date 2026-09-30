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
var STATE_OPTIONS = [
  { label: "Blocked", value: "blocked" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Parked", value: "parked" },
  { label: "Completed", value: "completed" },
  { label: "Abandoned", value: "abandoned" }
];
var CONFIDENCE_OPTIONS = [
  { label: "Confirmed", value: "confirmed" },
  { label: "Inferred", value: "inferred" },
  { label: "Uncertain", value: "uncertain" }
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
`;
function draftFrom(axis, note = "") {
  return {
    axisId: axis.id,
    blocker: axis.blocker,
    blockerConfidence: axis.blockerConfidence ?? "inferred",
    currentState: axis.currentState,
    currentStateConfidence: axis.currentStateConfidence ?? "inferred",
    note,
    state: axis.state,
    stateConfidence: axis.stateConfidence
  };
}
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
      "aria-label": "Activity window",
      className: "rd-cluster rd-window",
      role: "group"
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
  function OptionSelect({
    ariaLabel,
    disabled,
    onChange,
    options,
    value
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
      "aria-label": ariaLabel
    }, /* @__PURE__ */ React.createElement(SelectValue, null, options.find((option) => option.value === value)?.label ?? value)), /* @__PURE__ */ React.createElement(SelectContent, null, options.map((option) => /* @__PURE__ */ React.createElement(SelectItem, {
      key: option.value,
      value: option.value
    }, option.label))));
  }
  function ConfidenceBadge({ value }) {
    if (!value) {
      return null;
    }
    return /* @__PURE__ */ React.createElement("span", {
      className: "rd-conf",
      "data-rd-conf": value
    }, value);
  }
  function EvidenceLine({ evidence }) {
    const shown = evidence.slice(0, 3);
    const more = evidence.length - shown.length;
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-evidence",
      "data-rd-evidence-count": evidence.length,
      "data-rd-has-evidence": evidence.length > 0
    }, evidence.length > 0 ? `evidence: ${shown.map((item) => item.by ? `${item.label} (${item.by})` : item.label).join(" · ")}${more > 0 ? ` +${more} more` : ""}` : "no evidence on record — a 'confirmed' claim is impossible here");
  }
  function AxisHistory({ axis }) {
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "History · ", axis.history.length), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-history",
      "data-rd-history": axis.id
    }, axis.history.map((item) => /* @__PURE__ */ React.createElement("li", {
      key: item.id
    }, /* @__PURE__ */ React.createElement("div", null, item.summary), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, SOURCE_OPTIONS.find((option) => option.value === item.sourceType)?.label ?? item.sourceType, item.sourceRef ? ` · ${item.sourceRef}` : "", " ·", " ", item.occurredAt.slice(0, 10), item.actorType ? ` · ${item.actorType}` : ""))), axis.history.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No activity on this axis yet.") : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Notes · ", axis.notes.length), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-notes",
      "data-rd-axis-notes": axis.id
    }, axis.notes.map((note) => /* @__PURE__ */ React.createElement("li", {
      key: note.id
    }, /* @__PURE__ */ React.createElement("div", null, note.text), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, note.authorType, " · ", note.createdAt.slice(0, 10)))), axis.notes.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No notes on this axis.") : null));
  }
  function AxisDetailCard({
    axis,
    busy,
    conflict,
    correction,
    historyOpen,
    onCorrection,
    onReload,
    onSave,
    onToggleHistory
  }) {
    const primary = axis.repositories[0]?.fullName ?? "";
    const line = [
      primary,
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : ""
    ].filter(Boolean).join(" · ");
    const people = axis.people.map((person) => person.displayName).join(", ");
    const correcting = correction?.axisId === axis.id;
    return /* @__PURE__ */ React.createElement("li", {
      className: "rd-axis-detail",
      "data-rd-axis-state": axis.state,
      "data-rd-axis-title": axis.title,
      "data-rd-axis-version": axis.version
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-state",
      "data-rd-state": axis.state
    }, axis.state), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, axis.kind), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-title"
    }, axis.title), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "v", axis.version)), axis.description ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, axis.description) : null, line ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, line) : null, people ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "people: ", people) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-claim"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-value",
      "data-rd-claim": "current_state"
    }, axis.currentState ? axis.currentState : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "no progress note")), /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "current state"), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.currentStateConfidence
    }))), axis.blocker ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-blocker",
      "data-rd-strong": axis.state === "blocked"
    }, "Blocker: ", axis.blocker), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.blockerConfidence
    })) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "state"), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.stateConfidence
    }), axis.lastReviewedAt ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "last reviewed ", axis.lastReviewedAt.slice(0, 10)) : null), /* @__PURE__ */ React.createElement(EvidenceLine, {
      evidence: axis.evidence
    }), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(Button, {
      "data-rd-history-toggle": axis.id,
      disabled: busy,
      onClick: onToggleHistory,
      size: "sm",
      variant: "outline"
    }, historyOpen ? "Hide history" : `History (${axis.history.length})`), /* @__PURE__ */ React.createElement(Button, {
      "data-rd-correct-toggle": axis.id,
      disabled: busy,
      onClick: () => {
        if (correcting) {
          onCorrection(null);
          return;
        }
        onCorrection(draftFrom(axis));
      },
      size: "sm",
      variant: correcting ? "default" : "outline"
    }, correcting ? "Cancel" : "Correct")), historyOpen ? /* @__PURE__ */ React.createElement(AxisHistory, {
      axis
    }) : null, correcting && correction ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-correction",
      "data-rd-correction": axis.id
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Correct this axis"), conflict?.axisId === axis.id ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-conflict",
      "data-rd-conflict": "true",
      role: "alert"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, "This development axis changed since you opened it."), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, conflict.message), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: onReload,
      size: "sm",
      variant: "outline"
    }, "Reload this topic"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "Your note stays; the fields above are re-read."))) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-grid2"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "State"), /* @__PURE__ */ React.createElement(OptionSelect, {
      ariaLabel: "Axis state",
      disabled: busy,
      onChange: (next) => onCorrection({ ...correction, state: next }),
      options: STATE_OPTIONS,
      value: correction.state
    })), /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "State confidence"), /* @__PURE__ */ React.createElement(OptionSelect, {
      ariaLabel: "State confidence",
      disabled: busy,
      onChange: (next) => onCorrection({
        ...correction,
        stateConfidence: next
      }),
      options: CONFIDENCE_OPTIONS,
      value: correction.stateConfidence
    }))), /* @__PURE__ */ React.createElement("div", {
      className: "rd-grid2"
    }, /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Current state",
      disabled: busy,
      maxLength: 500,
      onChange: (event) => onCorrection({
        ...correction,
        currentState: event.target.value
      }),
      placeholder: "What is happening now",
      value: correction.currentState
    }), /* @__PURE__ */ React.createElement(OptionSelect, {
      ariaLabel: "Current state confidence",
      disabled: busy,
      onChange: (next) => onCorrection({
        ...correction,
        currentStateConfidence: next
      }),
      options: CONFIDENCE_OPTIONS,
      value: correction.currentStateConfidence
    })), /* @__PURE__ */ React.createElement("div", {
      className: "rd-grid2"
    }, /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Blocker",
      disabled: busy,
      maxLength: 500,
      onChange: (event) => onCorrection({
        ...correction,
        blocker: event.target.value
      }),
      placeholder: "What is blocking it, if anything",
      value: correction.blocker
    }), /* @__PURE__ */ React.createElement(OptionSelect, {
      ariaLabel: "Blocker confidence",
      disabled: busy,
      onChange: (next) => onCorrection({
        ...correction,
        blockerConfidence: next
      }),
      options: CONFIDENCE_OPTIONS,
      value: correction.blockerConfidence
    })), /* @__PURE__ */ React.createElement(Textarea, {
      "aria-label": "Note on this correction",
      disabled: busy,
      onChange: (event) => onCorrection({
        ...correction,
        note: event.target.value
      }),
      placeholder: "Why (optional) — recorded as a note on this axis, and it is itself evidence",
      value: correction.note
    }), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: onSave
    }, "Save correction"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "Saved against v", axis.version, "; a change made since then comes back as a conflict instead of overwriting it."))) : null);
  }
  function ResearchPage() {
    const [overview, setOverview] = React.useState(null);
    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [expandedId, setExpandedId] = React.useState(null);
    const [editing, setEditing] = React.useState(null);
    const [newName, setNewName] = React.useState("");
    const [detail, setDetail] = React.useState(null);
    const [correction, setCorrection] = React.useState(null);
    const [historyAxisId, setHistoryAxisId] = React.useState(null);
    const [topicNote, setTopicNote] = React.useState("");
    const [conflict, setConflict] = React.useState(null);
    const [activitySummary, setActivitySummary] = React.useState("");
    const [activitySourceType, setActivitySourceType] = React.useState("github_pr");
    const [activitySourceRef, setActivitySourceRef] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    async function call(action, input, options) {
      setBusy(true);
      setError("");
      try {
        const result = await ctx.host.call(action, input);
        if (ctx.signal.aborted) {
          return null;
        }
        if (result && result.ok === false) {
          const message = result.error ?? "The request was rejected.";
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
    async function loadDetail(topicId) {
      const result = await call("get_topic", {
        topicId
      });
      if (!ctx.signal.aborted && result) {
        setDetail(result);
      }
    }
    React.useEffect(() => {
      setCorrection(null);
      setHistoryAxisId(null);
      setTopicNote("");
      setConflict(null);
      if (!expandedId) {
        setDetail(null);
        return;
      }
      let active = true;
      (async () => {
        const result = await call("get_topic", {
          topicId: expandedId
        });
        if (active && result) {
          setDetail(result);
        }
      })();
      return () => {
        active = false;
      };
    }, [expandedId]);
    function toggle(topicId) {
      setExpandedId((current) => current === topicId ? null : topicId);
      setEditing(null);
      setDetail(null);
      setConflict(null);
    }
    function startEditing(entry) {
      setExpandedId(entry.topic.id);
      setConflict(null);
      setEditing({
        description: entry.topic.description,
        note: "",
        status: entry.topic.status,
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
      if (!(detail && editing)) {
        return;
      }
      const note = editing.note.trim();
      const result = await call("reconcile_topic", {
        expectedVersion: detail.topic.version,
        topic: {
          description: editing.description,
          ...editing.status === detail.topic.status ? {} : { status: editing.status },
          summary: editing.summary
        },
        topicId: detail.topic.id,
        ...note ? { annotations: [{ text: note }] } : {}
      });
      if (result) {
        setEditing(null);
        setConflict(null);
        await loadDetail(detail.topic.id);
        await load(windowDays, includeArchived);
      }
    }
    async function saveCorrection() {
      if (!(detail && correction)) {
        return;
      }
      const axis = detail.axes.find((candidate) => candidate.id === correction.axisId);
      if (!axis) {
        return;
      }
      const note = correction.note.trim();
      const result = await call("reconcile_topic", {
        expectedVersion: detail.topic.version,
        topicId: detail.topic.id,
        axes: [
          {
            blocker: correction.blocker,
            blockerConfidence: correction.blockerConfidence,
            currentState: correction.currentState,
            currentStateConfidence: correction.currentStateConfidence,
            expectedVersion: axis.version,
            id: axis.id,
            state: correction.state,
            stateConfidence: correction.stateConfidence
          }
        ],
        ...note ? { annotations: [{ axisId: axis.id, text: note }] } : {}
      }, { conflictAxisId: correction.axisId });
      if (result) {
        setCorrection(null);
        setConflict(null);
        await loadDetail(detail.topic.id);
        await load(windowDays, includeArchived);
      }
    }
    async function reloadAxis(topicId, axisId) {
      const result = await call("get_topic", {
        topicId
      });
      if (ctx.signal.aborted || !result) {
        return;
      }
      const fresh = result;
      setDetail(fresh);
      setConflict(null);
      const axis = fresh.axes.find((candidate) => candidate.id === axisId);
      if (axis) {
        setCorrection((current) => current && current.axisId === axisId ? draftFrom(axis, current.note) : current);
      }
    }
    async function addTopicNote(event) {
      const formEvent = event;
      formEvent.preventDefault();
      if (!(detail && topicNote.trim())) {
        return;
      }
      const result = await call("reconcile_topic", {
        annotations: [{ text: topicNote.trim() }],
        topicId: detail.topic.id
      });
      if (result) {
        setTopicNote("");
        await loadDetail(detail.topic.id);
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
        await loadDetail(expandedId);
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
      const details = expanded && detail && detail.topic.id === entry.topic.id ? detail : null;
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
      }, details ? details.axes.map((axis) => /* @__PURE__ */ React.createElement(AxisDetailCard, {
        axis,
        busy,
        conflict,
        correction,
        historyOpen: historyAxisId === axis.id,
        key: axis.id,
        onCorrection: setCorrection,
        onReload: () => {
          reloadAxis(details.topic.id, axis.id);
        },
        onSave: () => {
          saveCorrection();
        },
        onToggleHistory: () => {
          setHistoryAxisId((current) => current === axis.id ? null : axis.id);
        }
      })) : shown.map((axis) => /* @__PURE__ */ React.createElement(AxisItem, {
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
            setExpandedId(null);
          } else {
            startEditing(entry);
          }
        },
        size: "sm",
        variant: editingThis ? "outline" : "default"
      }, editingThis ? "Close" : "Edit fields"))), hidden > 0 && !expanded ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, hidden, " more axe", hidden === 1 ? "" : "s", " hidden") : null, details ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-detail rd-divider",
        "data-rd-detail": details.topic.name
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-section"
      }, "Topic"), /* @__PURE__ */ React.createElement("div", {
        className: "rd-claim"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-claim-value",
        "data-rd-claim": "description"
      }, details.topic.description || /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "no description yet")), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "description")), /* @__PURE__ */ React.createElement("div", {
        className: "rd-claim"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-claim-value",
        "data-rd-claim": "summary"
      }, details.topic.summary || /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "no approved summary")), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "approved summary — a human interpretation, not an agent one")), /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta",
        "data-rd-detail-counts": "true"
      }, [
        countLabel(details.counts.axes, "axis", "axes"),
        countLabel(details.counts.activities, "activity", "activities"),
        countLabel(details.counts.notes, "note", "notes"),
        `${details.counts.axesWithoutEvidence} without evidence`
      ].join(" · ")), conflict && !conflict.axisId ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-conflict",
        "data-rd-conflict": "true",
        role: "alert"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-strong"
      }, "This topic changed since you opened it."), /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, conflict.message), /* @__PURE__ */ React.createElement("div", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement(Button, {
        disabled: busy,
        onClick: () => {
          loadDetail(details.topic.id);
        },
        size: "sm",
        variant: "outline"
      }, "Reload this topic"), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "Nothing you typed has been thrown away."))) : null, /* @__PURE__ */ React.createElement("span", {
        className: "rd-section"
      }, "Corrections & notes · ", details.notes.length), /* @__PURE__ */ React.createElement("ul", {
        className: "rd-notes",
        "data-rd-topic-notes": details.notes.length
      }, details.notes.map((note) => /* @__PURE__ */ React.createElement("li", {
        key: note.id
      }, /* @__PURE__ */ React.createElement("div", null, note.text), /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, note.authorType, " · ", note.createdAt.slice(0, 10)))), details.notes.length === 0 ? /* @__PURE__ */ React.createElement("li", {
        className: "rd-muted"
      }, "No notes yet. This is where a correction or a caveat goes — deliberately not in the activity log.") : null), /* @__PURE__ */ React.createElement("form", {
        className: "rd-cluster",
        onSubmit: (event) => {
          addTopicNote(event);
        }
      }, /* @__PURE__ */ React.createElement(Input, {
        "aria-label": "Topic note",
        disabled: busy,
        maxLength: 1000,
        onChange: (event) => setTopicNote(event.target.value),
        placeholder: "A correction or caveat about this topic",
        value: topicNote
      }), /* @__PURE__ */ React.createElement(Button, {
        disabled: busy || !topicNote.trim(),
        size: "sm",
        type: "submit",
        variant: "outline"
      }, "Add note")), /* @__PURE__ */ React.createElement(CardTitle, {
        className: "rd-meta"
      }, "Activity"), /* @__PURE__ */ React.createElement("ul", {
        className: "rd-activity",
        "data-rd-topic-activity": details.activity.length
      }, details.activity.map((item) => {
        const axisTitle = details.axes.find((axis) => axis.id === item.axisId)?.title;
        return /* @__PURE__ */ React.createElement("li", {
          key: item.id
        }, /* @__PURE__ */ React.createElement("div", null, item.summary), /* @__PURE__ */ React.createElement("span", {
          className: "rd-meta"
        }, SOURCE_OPTIONS.find((option) => option.value === item.sourceType)?.label ?? item.sourceType, item.sourceRef ? ` · ${item.sourceRef}` : "", " ·", " ", item.occurredAt.slice(0, 10), item.actorType ? ` · ${item.actorType}` : "", axisTitle ? ` · axis: ${axisTitle}` : ""));
      }), details.activity.length === 0 ? /* @__PURE__ */ React.createElement("li", {
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
      }, "Record activity"))) : null, editingThis && editing ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-form rd-divider",
        "data-rd-topic-editor": "true"
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
      }, /* @__PURE__ */ React.createElement("div", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement(StatusSelect, {
        disabled: busy,
        onChange: (next) => {
          setEditing({ ...editing, status: next });
        },
        value: editing.status
      }), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, editing.status === entry.topic.status ? "unchanged" : `was ${entry.topic.status}`)), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "v", entry.topic.version, " · updated", " ", entry.topic.updatedAt.slice(0, 10))), /* @__PURE__ */ React.createElement(Textarea, {
        "aria-label": "Note on this change",
        disabled: busy,
        onChange: (event) => setEditing({
          ...editing,
          note: event.target.value
        }),
        placeholder: "Why (optional) — saved with the change as a note on this topic",
        value: editing.note
      }), /* @__PURE__ */ React.createElement("div", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement(Button, {
        disabled: busy || !details,
        onClick: () => {
          saveDetails();
        }
      }, "Save"), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "The status change and its note land in one call."))) : null)));
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
