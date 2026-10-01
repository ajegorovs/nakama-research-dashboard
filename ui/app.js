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
var SOURCE_LABELS = {
  agent_review: "agent review",
  experiment: "experiment",
  github_commit: "commit",
  github_issue: "issue",
  github_pr: "PR",
  group_chat: "group chat",
  manual: "manual note",
  repo_document: "document"
};
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
var VIEW_OPTIONS = [
  { label: "Topics", value: "topics" },
  { label: "People", value: "people" },
  { label: "Repositories", value: "repositories" },
  { label: "Progress", value: "progress" }
];
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
/* Grouped controls: a divider between clusters, so the toolbar reads as three things rather than one
   row of ten peers. The first group carries no leading divider. */
[data-plugin-id="research-dashboard"] .rd-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding-left: 12px;
  border-left: 1px solid rgba(127, 127, 127, 0.35);
}
[data-plugin-id="research-dashboard"] .rd-group:first-child {
  padding-left: 0;
  border-left: 0;
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
/* Step 3: one primary row per axis (state claim + name, kind receding), one subordinate line for where
   the work lives and what it says about itself. The title carries the weight; everything else in the row
   is deliberately quieter than it. */
[data-plugin-id="research-dashboard"] .rd-axis-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-axis-kind {
  font-size: 11px;
  letter-spacing: 0.02em;
  opacity: 0.55;
}
[data-plugin-id="research-dashboard"] .rd-axis-secondary {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.65;
}
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
/* The Progress desktop composition: the index, the Problem column and the Activity feed are siblings in one
   wrapping row, so they keep the contract's semantic order — Problem before Activity — and stack instead of
   squeezing when the width runs out. The columns are separated by a rule rather than a box each: the contract
   asks for a composition, not three cards of equal weight. */
[data-plugin-id="research-dashboard"] .rd-progress-top > .rd-progress-index {
  flex: 0 1 16rem;
}
[data-plugin-id="research-dashboard"] .rd-progress-problem {
  flex: 2 1 22rem;
  min-width: 17rem;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
[data-plugin-id="research-dashboard"] .rd-progress-activity {
  flex: 1 1 18rem;
  min-width: 15rem;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
[data-plugin-id="research-dashboard"] .rd-problem-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  display: grid;
  gap: 4px;
}
[data-plugin-id="research-dashboard"] .rd-problem-card p {
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-feed {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
[data-plugin-id="research-dashboard"] .rd-feed > li {
  display: grid;
  gap: 2px;
}
/* The plan sits below the composition, separated by a rule rather than boxed: it is a secondary section, and
   the top row is the glance. The step list is a plain list because the markup must not imply an order the
   model may never have claimed — the numbers are rendered per step, only where a step carries a position. */
[data-plugin-id="research-dashboard"] .rd-progress-plan {
  border-top: 1px solid var(--border);
  display: grid;
  gap: 4px;
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-progress-plan p {
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-plan-steps {
  display: grid;
  gap: 4px;
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
[data-plugin-id="research-dashboard"] .rd-plan-step {
  display: grid;
  gap: 2px;
}
[data-plugin-id="research-dashboard"] .rd-step-state {
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.85em;
  padding: 0 6px;
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
  function ViewControl({
    value,
    onChange,
    disabled
  }) {
    return /* @__PURE__ */ React.createElement("div", {
      "aria-label": "Dashboard view",
      className: "rd-cluster rd-views",
      role: "group"
    }, VIEW_OPTIONS.map((option) => /* @__PURE__ */ React.createElement(Button, {
      "aria-pressed": option.value === value,
      "data-rd-view-option": option.value,
      disabled,
      key: option.value,
      onClick: () => onChange(option.value),
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
    const where = [
      primary,
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : ""
    ].filter(Boolean).join(" · ");
    const blocked = axis.state === "blocked";
    return /* @__PURE__ */ React.createElement("li", {
      className: "rd-axis",
      "data-rd-axis-state": axis.state
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-axis-head"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: axis.stateConfidence,
      state: axis.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-title"
    }, axis.title), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-kind"
    }, axis.kind)), where || axis.currentState ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-secondary"
    }, [where, axis.currentState].filter(Boolean).join(" · ")) : null, axis.blocker ? /* @__PURE__ */ React.createElement("div", {
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
    }, evidence.length > 0 ? `evidence: ${shown.map((item) => item.by ? `${item.label} (${item.by})` : item.label).join(" · ")}${more > 0 ? ` +${more} more` : ""}` : "no evidence on record");
  }
  function describeSource(sourceType, sourceRef) {
    const base = SOURCE_LABELS[sourceType] ?? sourceType;
    const ref = sourceRef.trim();
    if (!ref) {
      return base;
    }
    return ref.toLowerCase().includes(base.toLowerCase()) ? ref : `${base} · ${ref}`;
  }
  function StateBadge({
    confidence,
    kind = "claim",
    state
  }) {
    if (kind === "stored") {
      return /* @__PURE__ */ React.createElement("span", {
        className: "rd-step-state",
        "data-rd-step-state": state
      }, state);
    }
    return /* @__PURE__ */ React.createElement("span", {
      className: "rd-state",
      "data-rd-state": state,
      "data-rd-state-confidence": confidence ?? "none"
    }, state, confidence && confidence !== "confirmed" ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-suffix"
    }, " · ", confidence) : null);
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
    }, describeSource(item.sourceType, item.sourceRef), " ·", " ", item.occurredAt.slice(0, 10), item.actorType ? ` · ${item.actorType}` : ""))), axis.history.length === 0 ? /* @__PURE__ */ React.createElement("li", {
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
      className: "rd-axis-head"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: axis.stateConfidence,
      state: axis.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-title"
    }, axis.title), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-kind"
    }, axis.kind, " · v", axis.version)), line || axis.description || people ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-secondary"
    }, [line, axis.description, people ? `people: ${people}` : ""].filter(Boolean).join(" · ")) : null, /* @__PURE__ */ React.createElement("div", {
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
  function involvementLine(entry) {
    const parts = [];
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
  function AxisScanItem({ axis }) {
    const where = [
      axis.repositories.map((repository) => repository.fullName).join(", "),
      axis.branch,
      axis.prNumber === null ? "" : `PR #${axis.prNumber}`
    ].filter((value) => value !== "").join(" · ");
    return /* @__PURE__ */ React.createElement("li", {
      className: "rd-axis",
      "data-rd-axis-state": axis.state,
      "data-rd-scan-axis": axis.title
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: axis.stateConfidence,
      state: axis.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, axis.title)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, axis.kind)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, where || "no repository or branch recorded"), axis.blocker ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-blocker",
      "data-rd-strong": axis.blockerConfidence === "confirmed"
    }, axis.blocker, axis.blockerConfidence ? ` · ${axis.blockerConfidence}` : "") : null);
  }
  function ActivityList({
    dataAttr,
    items,
    windowDays
  }) {
    return /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      ...{ [dataAttr]: items.length }
    }, items.map((item) => /* @__PURE__ */ React.createElement("li", {
      key: item.id
    }, /* @__PURE__ */ React.createElement("div", null, item.summary), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, describeSource(item.sourceType, item.sourceRef), " ·", " ", item.occurredAt.slice(0, 10)))), items.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "Nothing recorded in", " ", windowDays === 0 ? "any window" : `the last ${countLabel(windowDays, "day", "days")}`, ".") : null);
  }
  function PersonPanel({
    entry,
    windowDays
  }) {
    return /* @__PURE__ */ React.createElement(Card, {
      className: "rd-panel",
      "data-rd-person-panel": entry.person.displayName
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement(CardTitle, null, entry.person.displayName), entry.person.githubLogin ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "@", entry.person.githubLogin) : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-counts": "true"
    }, involvementLine(entry))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-form"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Topics they are on"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-view",
      "data-rd-person-topics": entry.topics.length
    }, entry.topics.map((involvement) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-involvement",
      "data-rd-involvement": involvement.topic.name,
      key: involvement.topic.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, involvement.topic.name), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, involvement.role ? `${involvement.topic.status} · ${involvement.role}` : involvement.topic.status)), involvement.axes.length === 0 ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "no axis of theirs here") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes"
    }, involvement.axes.map((axis) => /* @__PURE__ */ React.createElement(AxisScanItem, {
      axis,
      key: axis.id
    }))))), entry.topics.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "Not linked to a topic yet — the link is what puts work on this page.") : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Activity attributable to them"), entry.attributable ? /* @__PURE__ */ React.createElement(ActivityList, {
      dataAttr: "data-rd-person-activity",
      items: entry.recentActivity,
      windowDays
    }) : /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-attributable": "false"
    }, "No account is mapped to this person, so no recorded event can be attributed to them. That is a missing link, not an absence of work."), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-last": "true"
    }, entry.lastActivityAt ? `last activity ${describeAge(entry.lastActivityAt)}` : "no attributable activity yet", entry.lastReviewedAt ? ` · last reviewed ${describeAge(entry.lastReviewedAt)}` : " · never reviewed"))));
  }
  function PeopleView({
    people,
    truncated,
    windowDays
  }) {
    const [selectedId, setSelectedId] = React.useState(null);
    const selected = people.find((entry) => entry.person.id === selectedId) ?? people[0] ?? null;
    if (people.length === 0) {
      return /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
        className: "rd-muted"
      }, "Nobody is linked yet. People appear here once a topic or an axis names them.")));
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-split",
      "data-rd-view": "people"
    }, /* @__PURE__ */ React.createElement("ul", {
      className: "rd-index",
      "data-rd-people": people.length,
      "data-rd-people-truncated": truncated
    }, people.map((entry) => /* @__PURE__ */ React.createElement("li", {
      key: entry.person.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": selected?.person.id === entry.person.id,
      className: "rd-index-item",
      "data-rd-person": entry.person.displayName,
      onClick: () => setSelectedId(entry.person.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, entry.person.displayName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, involvementLine(entry)))))), selected ? /* @__PURE__ */ React.createElement(PersonPanel, {
      entry: selected,
      windowDays
    }) : null);
  }
  function RepositoriesView({
    repositories,
    truncated,
    windowDays
  }) {
    const [selectedId, setSelectedId] = React.useState(null);
    const selected = repositories.find((entry) => entry.repository.id === selectedId) ?? repositories[0] ?? null;
    if (repositories.length === 0) {
      return /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
        className: "rd-muted"
      }, "No repository is attached yet. A topic or an axis names one and it appears here.")));
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-split",
      "data-rd-view": "repositories"
    }, /* @__PURE__ */ React.createElement("ul", {
      className: "rd-index",
      "data-rd-repositories": repositories.length,
      "data-rd-repositories-truncated": truncated
    }, repositories.map((entry) => /* @__PURE__ */ React.createElement("li", {
      key: entry.repository.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": selected?.repository.id === entry.repository.id,
      className: "rd-index-item",
      "data-rd-repository": entry.repository.fullName,
      onClick: () => setSelectedId(entry.repository.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, entry.repository.fullName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, involvementLine(entry)))))), selected ? /* @__PURE__ */ React.createElement(Card, {
      className: "rd-panel",
      "data-rd-repository-panel": selected.repository.fullName
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(CardTitle, null, selected.repository.fullName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, selected.repository.description || "no description recorded", selected.repository.defaultBranch ? ` · default branch ${selected.repository.defaultBranch}` : "")), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-form"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Supports"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-view",
      "data-rd-repository-topics": selected.topics.length
    }, selected.topics.map((link) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-cluster",
      key: link.topic.id
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, link.topic.name), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "· ", link.relationship))), selected.topics.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "no topic names it yet") : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Current work"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes",
      "data-rd-repository-axes": selected.axes.length
    }, selected.axes.map((axis) => /* @__PURE__ */ React.createElement(AxisScanItem, {
      axis,
      key: axis.id
    })), selected.axes.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "no axis names this repository") : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Recent activity"), /* @__PURE__ */ React.createElement(ActivityList, {
      dataAttr: "data-rd-repository-activity",
      items: selected.recentActivity,
      windowDays
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-repository-last": "true"
    }, selected.lastActivityAt ? `last activity ${describeAge(selected.lastActivityAt)}` : "no activity recorded yet")))) : null);
  }
  function FilterSelect({
    label,
    onChange,
    options,
    value
  }) {
    return /* @__PURE__ */ React.createElement(Select, {
      onValueChange: (next) => {
        if (next !== null) {
          onChange(String(next));
        }
      },
      value
    }, /* @__PURE__ */ React.createElement(SelectTrigger, {
      "aria-label": label
    }, /* @__PURE__ */ React.createElement(SelectValue, null, options.find((option) => option.value === value)?.label ?? value)), /* @__PURE__ */ React.createElement(SelectContent, null, options.map((option) => /* @__PURE__ */ React.createElement(SelectItem, {
      key: option.value,
      value: option.value
    }, option.label))));
  }
  function problemCountLine(row) {
    if (row.problems === 0) {
      return "no problems";
    }
    return row.openProblems === row.problems ? `${row.problems} problem${row.problems === 1 ? "" : "s"}` : `${row.openProblems} open of ${row.problems}`;
  }
  function ProgressView({
    people,
    progress,
    repositories,
    timeline,
    windowDays
  }) {
    const [selectedAxisId, setSelectedAxisId] = React.useState(null);
    const [selectedProblemId, setSelectedProblemId] = React.useState(null);
    const [topicFilter, setTopicFilter] = React.useState("all");
    const [personFilter, setPersonFilter] = React.useState("all");
    const [repositoryFilter, setRepositoryFilter] = React.useState("all");
    const [stateFilter, setStateFilter] = React.useState("all");
    const groups = timeline.filter((group) => topicFilter === "all" || group.topic.id === topicFilter).map((group) => {
      const axes = group.axes.filter((bucket) => stateFilter === "all" || bucket.axis?.state === stateFilter).filter((bucket) => repositoryFilter === "all" || (bucket.axis?.repositories ?? []).some((repository) => repository.id === repositoryFilter)).map((bucket) => ({
        ...bucket,
        events: bucket.events.filter((event) => personFilter === "all" || event.person?.id === personFilter)
      })).filter((bucket) => bucket.events.length > 0);
      return { ...group, axes };
    }).filter((group) => group.axes.length > 0);
    const eventCount = groups.reduce((total, group) => total + group.axes.reduce((sum, bucket) => sum + bucket.events.length, 0), 0);
    const filtered = topicFilter !== "all" || personFilter !== "all" || repositoryFilter !== "all" || stateFilter !== "all";
    const axisRows = progress?.axes.axes ?? [];
    const activeAxis = axisRows.find((row) => row.id === selectedAxisId) ?? axisRows[0] ?? null;
    const axisProblems = (progress?.problems.problems ?? []).filter((row) => row.axisId === activeAxis?.id);
    const openAxisProblems = axisProblems.filter((row) => row.state === "open");
    const chosenProblem = selectedProblemId ? axisProblems.find((row) => row.id === selectedProblemId) ?? null : null;
    const shownProblem = chosenProblem ?? openAxisProblems[0] ?? axisProblems[0] ?? null;
    const otherOpenProblems = openAxisProblems.filter((problem) => problem.id !== shownProblem?.id);
    const feed = (progress?.activity.byAxis ?? []).find((bucket) => bucket.axisId === activeAxis?.id) ?? null;
    const axisPlan = activeAxis?.plan ?? null;
    const planClaimsOrder = axisPlan?.steps.some((step) => step.position !== null) ?? false;
    function problemFacts(problem) {
      const parts = [
        problem.authorType === "human" ? "owner-authored" : "librarian-inferred"
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
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack",
      "data-rd-view": "progress"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-split rd-progress-top",
      "data-rd-progress-top": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-index",
      "data-rd-progress-index": "true",
      "data-rd-progress-index-rows": (progress?.axes.axes ?? []).length,
      "data-rd-progress-index-stale-after": progress?.axes.staleAfterDays ?? 0,
      "data-rd-progress-index-window": progress?.axes.activitySinceDays ?? 0
    }, /* @__PURE__ */ React.createElement("ul", {
      className: "rd-index"
    }, (progress?.axes.axes ?? []).map((row) => /* @__PURE__ */ React.createElement("li", {
      key: row.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": activeAxis?.id === row.id,
      className: "rd-index-item",
      "data-rd-index-activity": row.activityInWindow,
      "data-rd-index-axis": row.id,
      "data-rd-index-open-problems": row.openProblems,
      "data-rd-index-problems": row.problems,
      "data-rd-index-stale": row.stale,
      "data-rd-index-state": row.state,
      "data-rd-index-topic": row.topicName,
      onClick: () => setSelectedAxisId(row.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, row.title), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: row.stateConfidence,
      state: row.state
    }), ` · ${row.topicName} · ${problemCountLine(row)} · ${row.stale ? "stale · " : ""}last activity ${describeAge(row.recencyAt)}`))))), progress && progress.axes.axes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-index-empty": "true"
    }, "No axes yet.") : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-problem",
      "data-rd-progress-problem-axis": activeAxis?.id ?? "",
      "data-rd-progress-problem-open": activeAxis?.openProblems ?? 0,
      "data-rd-progress-problem-shown": shownProblem?.id ?? ""
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-strong"
    }, `Open problems (${activeAxis?.openProblems ?? 0})`), activeAxis === null ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-problem-empty": "true"
    }, "No axis is selected.") : shownProblem === null ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-problem-empty": "true"
    }, "Nothing is recorded against this axis.") : /* @__PURE__ */ React.createElement("div", {
      className: "rd-problem-card",
      "data-rd-problem": shownProblem.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: shownProblem.stateConfidence,
      state: shownProblem.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, describeAge(shownProblem.recencyAt))), /* @__PURE__ */ React.createElement("p", {
      className: "rd-strong"
    }, shownProblem.statement), /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta",
      "data-rd-problem-facts": "true"
    }, problemFacts(shownProblem)), shownProblem.people.length > 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta"
    }, shownProblem.people.map((person) => person.displayName).join(", ")) : null), otherOpenProblems.length > 0 ? /* @__PURE__ */ React.createElement("ul", {
      className: "rd-feed",
      "data-rd-progress-problem-list": "true"
    }, otherOpenProblems.map((problem) => /* @__PURE__ */ React.createElement("li", {
      key: problem.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": problem.id === shownProblem?.id,
      className: "rd-index-item",
      "data-rd-problem-choice": problem.id,
      onClick: () => setSelectedProblemId(problem.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, problem.statement), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `last activity ${describeAge(problem.recencyAt)}`))))) : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-activity",
      "data-rd-progress-feed-axis": activeAxis?.id ?? "",
      "data-rd-progress-feed-count": feed?.eventCount ?? 0
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-strong"
    }, `Activity (${activeAxis?.activityInWindow ?? 0})`), feed === null || feed.events.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-feed-empty": "true"
    }, "Nothing recorded against this axis in this window.") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-feed",
      "data-rd-progress-feed": feed.events.length
    }, feed.events.map((event) => /* @__PURE__ */ React.createElement("li", {
      "data-rd-feed-event": "true",
      key: event.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, event.occurredAt.slice(0, 10)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, event.summary)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, describeSource(event.sourceType, event.sourceRef ?? ""), " · ", event.person ? event.person.displayName : "no account attributed", event.problemId && event.problemId === shownProblem?.id ? " · evidence for the problem shown" : "")))))), axisPlan ? /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-plan",
      "data-rd-progress-plan": axisPlan.id,
      "data-rd-progress-plan-claims-order": planClaimsOrder,
      "data-rd-progress-plan-steps": axisPlan.steps.length
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, `Plan · ${countLabel(axisPlan.steps.length, "step", "steps")}`), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `${axisPlan.stepsDone} of ${axisPlan.steps.length} done`), planClaimsOrder ? null : /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-progress-plan-unordered": "true"
    }, "unordered — no step claims a position")), /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta"
    }, axisPlan.summary), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-plan-steps",
      "data-rd-plan-steps": axisPlan.steps.length
    }, axisPlan.steps.map((step) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-plan-step",
      "data-rd-plan-step": step.id,
      "data-rd-plan-step-position": step.position === null ? "" : String(step.position),
      key: step.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, step.position === null ? null : /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `${step.position + 1}.`), /* @__PURE__ */ React.createElement(StateBadge, {
      kind: "stored",
      state: step.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, step.title)), step.id === shownProblem?.planStepId ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-plan-step-shown": "true"
    }, "the step the problem on screen sits on") : null)))) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-filters"
    }, /* @__PURE__ */ React.createElement(FilterSelect, {
      label: "Filter by topic",
      onChange: setTopicFilter,
      options: [
        { label: "All topics", value: "all" },
        ...timeline.map((group) => ({
          label: group.topic.name,
          value: group.topic.id
        }))
      ],
      value: topicFilter
    }), /* @__PURE__ */ React.createElement(FilterSelect, {
      label: "Filter by person",
      onChange: setPersonFilter,
      options: [
        { label: "Anyone (incl. unattributed)", value: "all" },
        ...people.map((entry) => ({
          label: entry.person.displayName,
          value: entry.person.id
        }))
      ],
      value: personFilter
    }), /* @__PURE__ */ React.createElement(FilterSelect, {
      label: "Filter by repository",
      onChange: setRepositoryFilter,
      options: [
        { label: "All repositories", value: "all" },
        ...repositories.map((entry) => ({
          label: entry.repository.fullName,
          value: entry.repository.id
        }))
      ],
      value: repositoryFilter
    }), /* @__PURE__ */ React.createElement(FilterSelect, {
      label: "Filter by axis state",
      onChange: setStateFilter,
      options: [
        { label: "All states", value: "all" },
        ...STATE_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value
        }))
      ],
      value: stateFilter
    })), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted",
      "data-rd-progress-summary": "true"
    }, windowDays === 0 ? "All time" : `Last ${countLabel(windowDays, "day", "days")}`, " ", "· ", countLabel(eventCount, "event", "events"), " across", " ", countLabel(groups.length, "topic", "topics"), filtered ? " (filtered)" : ""), groups.length === 0 ? /* @__PURE__ */ React.createElement(Card, {
      "data-rd-progress-empty": "true"
    }, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, filtered ? "Nothing matches these filters in this window." : "Nothing was recorded in this window yet."))) : null, groups.map((group) => /* @__PURE__ */ React.createElement(Card, {
      "data-rd-progress-topic": group.topic.name,
      key: group.topic.id
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement(CardTitle, null, group.topic.name), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, countLabel(group.eventCount, "event", "events"), " ·", " ", describeAge(group.lastActivityAt)))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, group.axes.map((bucket) => /* @__PURE__ */ React.createElement("div", {
      className: "rd-timeline-axis",
      "data-rd-progress-axis": bucket.axis?.title ?? "topic-level",
      key: bucket.axis?.id ?? "topic-level"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, bucket.axis ? /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: bucket.axis.stateConfidence,
      state: bucket.axis.state
    }) : null, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, bucket.axis?.title ?? "topic-level")), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, [
      bucket.axis?.kind ?? "",
      (bucket.axis?.repositories ?? []).map((repository) => repository.fullName).join(", "),
      bucket.axis?.branch ?? "",
      bucket.axis?.prNumber === null || bucket.axis?.prNumber === undefined ? "" : `PR #${bucket.axis.prNumber}`
    ].filter((value) => value !== "").join(" · "))), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      "data-rd-progress-events": bucket.events.length
    }, bucket.events.map((event) => /* @__PURE__ */ React.createElement("li", {
      "data-rd-progress-event": "true",
      key: event.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, event.occurredAt.slice(0, 10)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, event.summary)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, describeSource(event.sourceType, event.sourceRef), " ", "·", " ", event.person ? event.person.displayName : "no account attributed"))), bucket.eventCount > bucket.events.length ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, bucket.eventCount - bucket.events.length, " older here — open the topic for the full history") : null))))))));
  }
  function ResearchPage() {
    const [overview, setOverview] = React.useState(null);
    const [view, setView] = React.useState("topics");
    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [expandedId, setExpandedId] = React.useState(null);
    const [editing, setEditing] = React.useState(null);
    const [newName, setNewName] = React.useState("");
    const [detail, setDetail] = React.useState(null);
    const [progress, setProgress] = React.useState(null);
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
      const scope = {
        activitySinceDays: nextWindow,
        ...archived ? { includeArchived: true } : {}
      };
      const result = await call("get_overview", scope);
      if (!ctx.signal.aborted && result) {
        setOverview(result);
      }
      const progressResult = await call("get_progress", scope);
      if (!ctx.signal.aborted) {
        setProgress(progressResult ? progressResult : null);
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
            parked: 0,
            usable: 0
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
        expectedVersion: detail.topic.version,
        topicId: detail.topic.id,
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
      className: "rd-row",
      "data-rd-topbar": "true"
    }, /* @__PURE__ */ React.createElement("h2", {
      style: { margin: 0 }
    }, "Research overview"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-toolbar",
      "data-rd-toolbar": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-group",
      "data-rd-group": "views"
    }, /* @__PURE__ */ React.createElement(ViewControl, {
      disabled: busy,
      onChange: setView,
      value: view
    })), /* @__PURE__ */ React.createElement("div", {
      className: "rd-group",
      "data-rd-group": "window"
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
    }, "archived"))), /* @__PURE__ */ React.createElement("div", {
      className: "rd-group",
      "data-rd-group": "actions"
    }, /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: () => {
        load(windowDays, includeArchived);
      },
      variant: "outline"
    }, "Refresh")))), error ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-error",
      role: "alert"
    }, error) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, view === "topics" ? /* @__PURE__ */ React.createElement("form", {
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
    }, "Add topic")) : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, counts ? [
      countLabel(counts.topics, "topic", "topics"),
      countLabel(counts.axes, "axis", "axes"),
      countLabel(counts.people, "person", "people"),
      countLabel(counts.repositories, "repository", "repositories")
    ].join(" · ") : "loading…")), view === "topics" ? topics.map((entry) => {
      const hasBlocked = entry.axisCounts.blocked > 0;
      const expanded = entry.topic.id === expandedId;
      const shown = expanded ? entry.axes : entry.axes.slice(0, LEAD_AXES);
      const hidden = entry.axes.length - shown.length;
      const editingThis = editing?.topicId === entry.topic.id;
      const details = expanded && detail && detail.topic.id === entry.topic.id ? detail : null;
      return /* @__PURE__ */ React.createElement(Card, {
        className: "rd-topic-card",
        "data-rd-blocked": hasBlocked,
        "data-rd-mode": editingThis ? "edit" : expanded ? "read" : "collapsed",
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
      }, /* @__PURE__ */ React.createElement(Button, {
        "data-rd-close": expanded ? "true" : "false",
        "data-rd-read-open": expanded ? "false" : "true",
        disabled: busy,
        onClick: () => {
          if (expanded) {
            setEditing(null);
            setExpandedId(null);
          } else {
            toggle(entry.topic.id);
          }
        },
        size: "sm",
        variant: expanded ? "outline" : "default"
      }, expanded ? "Close" : "Read topic"), /* @__PURE__ */ React.createElement(Button, {
        "data-rd-edit-open": editingThis ? "false" : "true",
        disabled: busy,
        onClick: () => {
          if (editingThis) {
            setEditing(null);
          } else {
            startEditing(entry);
          }
        },
        size: "sm",
        variant: editingThis || !expanded ? "outline" : "default"
      }, editingThis ? "Done editing" : "Edit fields"))), hidden > 0 && !expanded ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted",
        "data-rd-hidden-axes": hidden
      }, shown.length, " of ", entry.axes.length, " axes shown · ", hidden, " more") : null, details ? /* @__PURE__ */ React.createElement("div", {
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
      }, note.authorType, " ·", " ", note.createdAt.slice(0, 10)))), details.notes.length === 0 ? /* @__PURE__ */ React.createElement("li", {
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
        }, SOURCE_OPTIONS.find((option) => option.value === item.sourceType)?.label ?? item.sourceType, item.sourceRef ? ` · ${item.sourceRef}` : "", " ", "· ", item.occurredAt.slice(0, 10), item.actorType ? ` · ${item.actorType}` : "", axisTitle ? ` · axis: ${axisTitle}` : ""));
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
    }) : null, view === "people" ? /* @__PURE__ */ React.createElement(PeopleView, {
      people: overview?.people ?? [],
      truncated: overview?.peopleTruncated === true,
      windowDays
    }) : null, view === "repositories" ? /* @__PURE__ */ React.createElement(RepositoriesView, {
      repositories: overview?.repositories ?? [],
      truncated: overview?.repositoriesTruncated === true,
      windowDays
    }) : null, view === "progress" ? /* @__PURE__ */ React.createElement(ProgressView, {
      people: overview?.people ?? [],
      progress,
      repositories: overview?.repositories ?? [],
      timeline: overview?.timeline ?? [],
      windowDays
    }) : null, view === "topics" && overview && topics.length === 0 ? /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No topics yet. Add one above, or let the agent record what the group is working on."))) : null);
  }
  ctx.slots.register("page", ResearchPage);
}
export {
  apply,
  inject
};
