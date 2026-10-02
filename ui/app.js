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
var ENTITY_VIEW = {
  axis: "progress",
  person: "people",
  problem: "progress",
  repository: "repositories",
  topic: "topics"
};
var PROGRESS_INDEX_OPTIONS = [
  { label: "Axes", value: "axes" },
  { label: "Problems", value: "problems" }
];
var LEAD_AXES = 3;
var FEED_LEAD = 12;
var css = `
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
  gap: var(--rd-gap);
  flex-wrap: wrap;
}
[data-plugin-id="research-dashboard"] .rd-axis-kind {
  font-size: var(--rd-label);
  letter-spacing: 0.04em;
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
/* C7: the progress timeline — filters on one line, each axis a labelled rail. */
[data-plugin-id="research-dashboard"] .rd-filters { flex-wrap: wrap; gap: var(--rd-gap); }
/* C8: the qualifier on a state is part of the claim, not decoration — quieter, never optional. */
[data-plugin-id="research-dashboard"] .rd-claim-suffix { font-weight: 400; opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-timeline-axis {
  border-left: var(--rd-rule);
  display: grid;
  gap: var(--rd-gap-tight);
  padding-left: 10px;
}
[data-plugin-id="research-dashboard"] .rd-timeline-axis .rd-activity li { display: grid; gap: var(--rd-gap-row); }
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
  padding: 1px 8px;
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
  function AxisItem({
    axis,
    onOpenEntity
  }) {
    const where = [
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
    }), /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: axis.id,
      label: axis.title,
      onOpen: onOpenEntity,
      type: "axis"
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-kind"
    }, axis.kind)), where || axis.currentState || axis.repositories.length > 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-secondary"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster rd-tags"
    }, axis.repositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: onOpenEntity,
      type: "repository"
    })), where ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, where) : null, axis.currentState ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, axis.currentState) : null, /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: axis.updatedAt,
      prefix: "· updated "
    }))) : null, axis.blocker ? /* @__PURE__ */ React.createElement("div", {
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
  function EntityTag({
    compact = false,
    id,
    label,
    onOpen,
    type
  }) {
    return /* @__PURE__ */ React.createElement("button", {
      className: compact ? "rd-tag rd-tag-compact" : "rd-tag",
      "data-rd-entity-id": id,
      "data-rd-entity-tag": type,
      "data-rd-tag-compact": compact,
      "data-rd-tag-label": label,
      onClick: () => onOpen(type, id),
      type: "button"
    }, label);
  }
  function EventDate({ at }) {
    return /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-event-date": at
    }, at.slice(0, 10));
  }
  function RecencyLabel({ at, prefix = "" }) {
    if (at === null) {
      return /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, prefix || "never");
    }
    return /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-recency": at
    }, prefix, describeAge(at));
  }
  function DetailHeader({
    badge = null,
    children,
    context = null,
    title
  }) {
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-head",
      "data-rd-detail-header": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row rd-detail-title-row"
    }, title, badge), context ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags",
      "data-rd-detail-context": "true"
    }, context) : null, children);
  }
  function ActivityLine({
    attrs,
    axisLabel = null,
    item,
    onOpenEntity,
    person = null,
    problemLabel = null,
    repositoryLabel = null,
    topicLabel = null,
    unattributedNote = null
  }) {
    return /* @__PURE__ */ React.createElement("li", {
      "data-rd-activity-event": "true",
      ...attrs ?? {}
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(EventDate, {
      at: item.occurredAt
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, item.summary)), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags",
      "data-rd-event-tags": "true"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, describeSource(item.sourceType, item.sourceRef ?? "")), item.topicId !== null && topicLabel !== null ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: item.topicId,
      label: topicLabel,
      onOpen: onOpenEntity,
      type: "topic"
    }) : null, item.repositoryId !== null && repositoryLabel !== null ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: item.repositoryId,
      label: repositoryLabel,
      onOpen: onOpenEntity,
      type: "repository"
    }) : null, item.axisId !== null && axisLabel !== null ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: item.axisId,
      label: axisLabel,
      onOpen: onOpenEntity,
      type: "axis"
    }) : null, person ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: person.id,
      label: person.displayName,
      onOpen: onOpenEntity,
      type: "person"
    }) : unattributedNote !== null ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, unattributedNote) : null, item.problemId !== null && problemLabel !== null ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: item.problemId,
      label: problemLabel,
      onOpen: onOpenEntity,
      type: "problem"
    }) : null));
  }
  function Notice({
    attrs,
    children,
    kind
  }) {
    return /* @__PURE__ */ React.createElement("p", {
      className: "rd-notice rd-muted",
      "data-rd-notice": kind,
      ...attrs ?? {}
    }, children);
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
    onOpenEntity,
    onReload,
    onSave,
    onToggleHistory
  }) {
    const line = [
      axis.branch,
      axis.prNumber ? `PR #${axis.prNumber}` : ""
    ].filter(Boolean).join(" · ");
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
    }), /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: axis.id,
      label: axis.title,
      onOpen: onOpenEntity,
      type: "axis"
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-kind"
    }, axis.kind, " · v", axis.version)), line || axis.description || axis.people.length > 0 || axis.repositories.length > 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-secondary"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster rd-tags"
    }, axis.repositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: onOpenEntity,
      type: "repository"
    })), axis.people.map((person) => /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: person.id,
      key: person.id,
      label: person.displayName,
      onOpen: onOpenEntity,
      type: "person"
    })), line ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, line) : null, axis.description ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, axis.description) : null)) : null, /* @__PURE__ */ React.createElement("div", {
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
  function AxisScanItem({
    axis,
    onOpenEntity
  }) {
    const where = [
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
    }), /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: axis.id,
      label: axis.title,
      onOpen: onOpenEntity,
      type: "axis"
    })), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, axis.kind)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster rd-tags",
      "data-rd-scan-where": "true"
    }, axis.repositories.length === 0 ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "no repository or branch recorded") : axis.repositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: onOpenEntity,
      type: "repository"
    })), where ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, where) : null), axis.blocker ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-blocker",
      "data-rd-strong": axis.blockerConfidence === "confirmed"
    }, axis.blocker, axis.blockerConfidence ? ` · ${axis.blockerConfidence}` : "") : null);
  }
  function ActivityList({
    dataAttr,
    items,
    labelFor,
    onOpenEntity,
    windowDays
  }) {
    return /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      ...{ [dataAttr]: items.length }
    }, items.map((item) => {
      const labels = labelFor?.(item) ?? {};
      return /* @__PURE__ */ React.createElement(ActivityLine, {
        item,
        key: item.id,
        onOpenEntity,
        problemLabel: labels.problem ?? null,
        repositoryLabel: labels.repository ?? null,
        topicLabel: labels.topic ?? null
      });
    }), items.length === 0 ? /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "Nothing recorded in", " ", windowDays === 0 ? "any window" : `the last ${countLabel(windowDays, "day", "days")}`, ".")) : null);
  }
  function PersonPanel({
    entry,
    onOpenEntity,
    windowDays
  }) {
    return /* @__PURE__ */ React.createElement(Card, {
      className: "rd-panel",
      "data-rd-person-panel": entry.person.displayName
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(DetailHeader, {
      badge: entry.person.githubLogin ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "@", entry.person.githubLogin) : null,
      title: /* @__PURE__ */ React.createElement(CardTitle, null, entry.person.displayName)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-counts": "true"
    }, involvementLine(entry)))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
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
    }, /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: involvement.topic.id,
      label: involvement.topic.name,
      onOpen: onOpenEntity,
      type: "topic"
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, involvement.role ? `${involvement.topic.status} · ${involvement.role}` : involvement.topic.status)), involvement.axes.length === 0 ? /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "no axis of theirs here") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes"
    }, involvement.axes.map((axis) => /* @__PURE__ */ React.createElement(AxisScanItem, {
      axis,
      key: axis.id,
      onOpenEntity
    }))))), entry.topics.length === 0 ? /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "Not linked to a topic yet — the link is what puts work on this page.")) : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Activity attributable to them"), entry.attributable ? /* @__PURE__ */ React.createElement(ActivityList, {
      dataAttr: "data-rd-person-activity",
      items: entry.recentActivity,
      labelFor: (item) => ({
        topic: entry.topics.find((involvement) => involvement.topic.id === item.topicId)?.topic.name ?? null
      }),
      onOpenEntity,
      windowDays
    }) : /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-attributable": "false"
    }, "No account is mapped to this person, so no recorded event can be attributed to them. That is a missing link, not an absence of work."), /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster",
      "data-rd-person-last": "true"
    }, entry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: entry.lastActivityAt,
      prefix: "last activity "
    }) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "no attributable activity yet"), entry.lastReviewedAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: entry.lastReviewedAt,
      prefix: "· last reviewed "
    }) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "· never reviewed")))));
  }
  function PeopleView({
    onOpenEntity,
    people,
    preselect,
    truncated,
    windowDays
  }) {
    const [selectedId, setSelectedId] = React.useState(null);
    React.useEffect(() => {
      if (preselect) {
        setSelectedId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq]);
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
      "data-rd-person-id": entry.person.id,
      onClick: () => setSelectedId(entry.person.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, entry.person.displayName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, involvementLine(entry)))))), selected ? /* @__PURE__ */ React.createElement(PersonPanel, {
      entry: selected,
      onOpenEntity,
      windowDays
    }) : null);
  }
  function RepositoriesView({
    onOpenEntity,
    preselect,
    repositories,
    truncated,
    windowDays
  }) {
    const [selectedId, setSelectedId] = React.useState(null);
    React.useEffect(() => {
      if (preselect) {
        setSelectedId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq]);
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
      "data-rd-repository-id": entry.repository.id,
      onClick: () => setSelectedId(entry.repository.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, entry.repository.fullName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, involvementLine(entry)))))), selected ? /* @__PURE__ */ React.createElement(Card, {
      className: "rd-panel",
      "data-rd-repository-panel": selected.repository.fullName
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(DetailHeader, {
      title: /* @__PURE__ */ React.createElement(CardTitle, null, selected.repository.fullName)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, selected.repository.description || "no description recorded", selected.repository.defaultBranch ? ` · default branch ${selected.repository.defaultBranch}` : ""))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-form"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Supports"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-view",
      "data-rd-repository-topics": selected.topics.length
    }, selected.topics.map((link) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-cluster",
      key: link.topic.id
    }, /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: link.topic.id,
      label: link.topic.name,
      onOpen: onOpenEntity,
      type: "topic"
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "· ", link.relationship))), selected.topics.length === 0 ? /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "no topic names it yet")) : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Current work"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes",
      "data-rd-repository-axes": selected.axes.length
    }, selected.axes.map((axis) => /* @__PURE__ */ React.createElement(AxisScanItem, {
      axis,
      key: axis.id,
      onOpenEntity
    })), selected.axes.length === 0 ? /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "no axis names this repository")) : null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Recent activity"), /* @__PURE__ */ React.createElement(ActivityList, {
      dataAttr: "data-rd-repository-activity",
      items: selected.recentActivity,
      labelFor: (item) => ({
        topic: selected.topics.find((link) => link.topic.id === item.topicId)?.topic.name ?? null
      }),
      onOpenEntity,
      windowDays
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster",
      "data-rd-repository-last": "true"
    }, selected.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: selected.lastActivityAt,
      prefix: "last activity "
    }) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "no activity recorded yet"))))) : null);
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
    onOpenEntity,
    people,
    preselect,
    progress,
    repositories,
    timeline,
    windowDays
  }) {
    const [selectedAxisId, setSelectedAxisId] = React.useState(null);
    const [selectedProblemId, setSelectedProblemId] = React.useState(null);
    const [indexMode, setIndexMode] = React.useState("axes");
    const [feedAllFor, setFeedAllFor] = React.useState(null);
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
    const problemRows = progress?.problems.problems ?? [];
    const problemsMode = indexMode === "problems";
    const selectedAxisRow = axisRows.find((row) => row.id === selectedAxisId) ?? null;
    const chosenProblem = selectedProblemId ? problemRows.find((row) => row.id === selectedProblemId) ?? null : null;
    const axesModeAxis = selectedAxisRow ?? axisRows[0] ?? null;
    const axesModeProblems = problemRows.filter((row) => row.axisId === axesModeAxis?.id);
    const shownProblem = problemsMode ? chosenProblem ?? problemRows[0] ?? null : chosenProblem && chosenProblem.axisId === axesModeAxis?.id ? chosenProblem : axesModeProblems.filter((row) => row.state === "open")[0] ?? null;
    const parentAxisOfShownProblem = shownProblem === null ? null : axisRows.find((row) => row.id === shownProblem.axisId) ?? null;
    const activeAxis = problemsMode ? parentAxisOfShownProblem ?? axesModeAxis : axesModeAxis;
    const axisProblems = problemRows.filter((row) => row.axisId === activeAxis?.id);
    const openAxisProblems = axisProblems.filter((row) => row.state === "open");
    const feed = (progress?.activity.byAxis ?? []).find((bucket) => bucket.axisId === activeAxis?.id) ?? null;
    const feedAll = feedAllFor !== null && feedAllFor === (activeAxis?.id ?? "");
    const feedShown = feed === null || feedAll ? feed?.events ?? [] : feed.events.slice(0, FEED_LEAD);
    const feedHidden = (feed?.events.length ?? 0) - feedShown.length;
    const axisPlan = activeAxis?.plan ?? null;
    const planClaimsOrder = axisPlan?.steps.some((step) => step.position !== null) ?? false;
    const problemSteering = shownProblem?.steering ?? [];
    const axisSteering = activeAxis?.steering ?? [];
    function problemContext(problem) {
      const parts = [
        problem.repositories.length === 0 ? "no repository" : problem.repositories.map((repo) => repo.fullName).join(", ")
      ];
      if (problem.planStepTitle) {
        parts.push(`step: ${problem.planStepTitle}`);
      }
      parts.push(countLabel(problem.activityCount, "event", "events"));
      parts.push(`last activity ${describeAge(problem.recencyAt)}`);
      return parts.join(" · ");
    }
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
    function repositoryOf(id) {
      if (id === null) {
        return null;
      }
      return repositories.find((entry) => entry.repository.id === id)?.repository ?? null;
    }
    function problemOf(id) {
      return id === null ? null : problemRows.find((row) => row.id === id) ?? null;
    }
    function indexProblemContext(problem) {
      return `${problem.axisTitle} · ${problem.topicName} · ${problemContext(problem)}`;
    }
    function switchIndex(next) {
      if (next === indexMode) {
        return;
      }
      if (next === "problems") {
        setSelectedProblemId(chosenProblem?.id ?? openAxisProblems[0]?.id ?? axisProblems[0]?.id ?? null);
      } else if (shownProblem) {
        setSelectedAxisId(shownProblem.axisId);
      }
      setIndexMode(next);
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack",
      "data-rd-view": "progress"
    }, /* @__PURE__ */ React.createElement("div", {
      "aria-label": "Progress index",
      className: "rd-cluster rd-progress-switch",
      "data-rd-progress-switch": "true",
      "data-rd-progress-subview": indexMode,
      role: "group"
    }, PROGRESS_INDEX_OPTIONS.map((option) => /* @__PURE__ */ React.createElement(Button, {
      "aria-pressed": option.value === indexMode,
      "data-rd-progress-subview-option": option.value,
      key: option.value,
      onClick: () => switchIndex(option.value),
      size: "sm",
      variant: "outline"
    }, option.label))), /* @__PURE__ */ React.createElement("div", {
      className: "rd-split rd-progress-top",
      "data-rd-progress-top": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-index",
      "data-rd-progress-index": "true",
      "data-rd-progress-index-mode": indexMode,
      "data-rd-progress-index-rows": (problemsMode ? problemRows : axisRows).length,
      "data-rd-progress-index-stale-after": progress?.axes.staleAfterDays ?? 0,
      "data-rd-progress-index-window": progress?.axes.activitySinceDays ?? 0
    }, problemsMode ? /* @__PURE__ */ React.createElement("ul", {
      className: "rd-index",
      "data-rd-problem-index-list": problemRows.length
    }, problemRows.map((problem) => /* @__PURE__ */ React.createElement("li", {
      key: problem.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": shownProblem?.id === problem.id,
      className: "rd-index-item",
      "data-rd-problem-index": problem.id,
      "data-rd-problem-index-axis": problem.axisId,
      "data-rd-problem-index-state": problem.state,
      "data-rd-problem-index-topic": problem.topicName,
      onClick: () => {
        setSelectedProblemId(problem.id);
        setSelectedAxisId(problem.axisId);
      },
      type: "button"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: problem.stateConfidence,
      state: problem.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, problem.statement)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-problem-index-context": "true"
    }, indexProblemContext(problem)))))) : /* @__PURE__ */ React.createElement("ul", {
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
    }), ` · ${row.topicName} · ${problemCountLine(row)} · ${row.stale ? "stale · " : ""}last activity ${describeAge(row.recencyAt)}`))))), problemsMode && problemRows.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-problem-index-empty": "true"
    }, "No problems yet.") : null, !problemsMode && progress && progress.axes.axes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-index-empty": "true"
    }, "No axes yet.") : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-problem",
      "data-rd-progress-problem-axis": activeAxis?.id ?? "",
      "data-rd-progress-problem-mode": indexMode,
      "data-rd-progress-problem-open": activeAxis?.openProblems ?? 0,
      "data-rd-progress-problem-shown": shownProblem?.id ?? ""
    }, /* @__PURE__ */ React.createElement(DetailHeader, {
      context: activeAxis ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(EntityTag, {
        id: activeAxis.topicId,
        label: activeAxis.topicName,
        onOpen: onOpenEntity,
        type: "topic"
      }), /* @__PURE__ */ React.createElement(EntityTag, {
        id: activeAxis.id,
        label: activeAxis.title,
        onOpen: onOpenEntity,
        type: "axis"
      })) : null,
      title: /* @__PURE__ */ React.createElement("h3", {
        className: "rd-strong"
      }, problemsMode ? "Problem" : `Open problems (${activeAxis?.openProblems ?? 0})`)
    }, activeAxis ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster",
      "data-rd-progress-recency": "true"
    }, problemsMode && shownProblem ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, problemContext(shownProblem)) : /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: activeAxis.recencyAt,
      prefix: "last activity "
    }), activeAxis.stale ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "· stale") : null) : null), activeAxis === null && !problemsMode ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-problem-empty": "true"
    }, "No axis is selected.") : shownProblem === null ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-problem-empty": "true"
    }, problemsMode ? "No problem is recorded yet." : axesModeProblems.length > 0 ? "No open problems on this axis." : "Nothing is recorded against this axis.") : /* @__PURE__ */ React.createElement("div", {
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
    }, shownProblem.people.map((person) => person.displayName).join(", ")) : null)), /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-activity",
      "data-rd-progress-feed-axis": activeAxis?.id ?? "",
      "data-rd-progress-feed-count": feed?.eventCount ?? 0,
      "data-rd-progress-feed-mode": indexMode
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-strong"
    }, `Activity (${activeAxis?.activityInWindow ?? 0})`), problemsMode && activeAxis ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-progress-feed-parent": "true"
    }, `on ${activeAxis.title}`) : null, feed === null || feed.events.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-feed-empty": "true"
    }, "Nothing recorded against this axis in this window.") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-feed",
      "data-rd-progress-feed": feed.events.length,
      "data-rd-progress-feed-shown": feedShown.length
    }, feedShown.map((event) => /* @__PURE__ */ React.createElement(ActivityLine, {
      attrs: { "data-rd-feed-event": "true" },
      axisLabel: event.axisId !== null && event.axisId === activeAxis?.id ? activeAxis?.title ?? null : null,
      item: event,
      key: event.id,
      onOpenEntity,
      person: event.person,
      problemLabel: problemOf(event.problemId)?.statement ?? null,
      repositoryLabel: repositoryOf(event.repositoryId)?.fullName ?? null,
      topicLabel: event.topicId !== null && event.topicId === activeAxis?.topicId ? activeAxis?.topicName ?? null : null,
      unattributedNote: "no account attributed"
    }))), feed !== null && (feedHidden > 0 || feedAll) ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster",
      "data-rd-progress-feed-more": String(feedHidden)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-progress-feed-note": "true"
    }, feedAll ? `all ${feed.events.length} shown, newest first` : `${feedShown.length} of ${feed.events.length} shown, newest first`), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => {
        setFeedAllFor(feedAll ? null : activeAxis?.id ?? "");
      },
      variant: "outline"
    }, feedAll ? "Show fewer" : `Show all ${feed.events.length}`)) : null)), axisPlan ? /* @__PURE__ */ React.createElement("section", {
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
    }, "the step the problem on screen sits on") : null)))) : null, openAxisProblems.length > 0 ? /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-problems",
      "data-rd-progress-problems": openAxisProblems.length,
      "data-rd-progress-problems-axis": activeAxis?.id ?? ""
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Open problems on this axis"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-problems",
      "data-rd-problem-list": openAxisProblems.length
    }, openAxisProblems.map((problem) => /* @__PURE__ */ React.createElement("li", {
      key: problem.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": problem.id === shownProblem?.id,
      className: "rd-index-item",
      "data-rd-problem-choice": problem.id,
      onClick: () => setSelectedProblemId(problem.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: problem.stateConfidence,
      state: problem.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, problem.statement)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-problem-context": "true"
    }, problemContext(problem))))))) : null, shownProblem && shownProblem.repositories.length > 0 ? /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-repositories",
      "data-rd-progress-repositories": shownProblem.repositories.length
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Repository threads"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags"
    }, shownProblem.repositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: onOpenEntity,
      type: "repository"
    })))) : null, shownProblem && shownProblem.evidence.length > 0 ? /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-evidence",
      "data-rd-progress-evidence": shownProblem.evidence.length
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Evidence"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-evidence"
    }, shownProblem.evidence.map((item) => /* @__PURE__ */ React.createElement("li", {
      "data-rd-evidence": item.id,
      key: item.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-source",
      "data-rd-evidence-source": item.sourceType
    }, describeSource(item.sourceType, item.sourceRef)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, item.summary), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, item.label)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `${item.occurredAt.slice(0, 10)}${item.sourceUrl ? ` · ${item.sourceUrl}` : ""}`))))) : null, problemSteering.length > 0 || axisSteering.length > 0 ? /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-steering",
      "data-rd-progress-steering": "true"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Human steering"), problemSteering.length > 0 ? /* @__PURE__ */ React.createElement("ul", {
      className: "rd-steering",
      "data-rd-steering-scope": "problem"
    }, problemSteering.map((claim) => /* @__PURE__ */ React.createElement("li", {
      "data-rd-steering": claim.id,
      key: claim.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-source"
    }, claim.kind), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `${claim.authorType} · ${claim.recordedAt.slice(0, 10)}${claim.confidence ? ` · ${claim.confidence}` : ""}`)), /* @__PURE__ */ React.createElement("p", {
      className: "rd-steering-text"
    }, claim.text)))) : null, axisSteering.length > 0 ? /* @__PURE__ */ React.createElement("ul", {
      className: "rd-steering",
      "data-rd-steering-scope": "axis"
    }, axisSteering.map((claim) => /* @__PURE__ */ React.createElement("li", {
      "data-rd-steering": claim.id,
      key: claim.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-source"
    }, claim.kind), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `on the axis · ${claim.authorType} · ${claim.recordedAt.slice(0, 10)}${claim.confidence ? ` · ${claim.confidence}` : ""}`)), /* @__PURE__ */ React.createElement("p", {
      className: "rd-steering-text"
    }, claim.text)))) : null) : null, /* @__PURE__ */ React.createElement("div", {
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
    const [entityTarget, setEntityTarget] = React.useState(null);
    function openEntity(type, id) {
      setEntityTarget({ id, seq: (entityTarget?.seq ?? 0) + 1, type });
      setView(ENTITY_VIEW[type]);
    }
    const [windowDays, setWindowDays] = React.useState(14);
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [expandedId, setExpandedId] = React.useState(null);
    React.useEffect(() => {
      if (entityTarget?.type === "topic") {
        setExpandedId(entityTarget.id);
      }
    }, [entityTarget?.id, entityTarget?.seq, entityTarget?.type]);
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
      setDetail(null);
      setConflict(null);
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
      className: "rd-page-title"
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
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, counts ? [
      countLabel(counts.topics, "topic", "topics"),
      countLabel(counts.axes, "axis", "axes"),
      countLabel(counts.people, "person", "people"),
      countLabel(counts.repositories, "repository", "repositories")
    ].join(" · ") : "loading…")), view === "topics" ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack",
      "data-rd-view": "topics"
    }, topics.map((entry) => {
      const hasBlocked = entry.axisCounts.blocked > 0;
      const expanded = entry.topic.id === expandedId;
      const shown = expanded ? entry.axes : entry.axes.slice(0, LEAD_AXES);
      const hidden = entry.axes.length - shown.length;
      const details = expanded && detail && detail.topic.id === entry.topic.id ? detail : null;
      return /* @__PURE__ */ React.createElement(Card, {
        className: "rd-topic-card",
        "data-rd-blocked": hasBlocked,
        "data-rd-mode": expanded ? "read" : "collapsed",
        "data-rd-topic": entry.topic.name,
        key: entry.topic.id
      }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(DetailHeader, {
        badge: /* @__PURE__ */ React.createElement("span", {
          className: "rd-muted"
        }, entry.topic.status),
        context: /* @__PURE__ */ React.createElement(React.Fragment, null, entry.repositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
          id: repository.id,
          key: repository.id,
          label: repository.fullName,
          onOpen: openEntity,
          type: "repository"
        })), entry.people.map((person) => /* @__PURE__ */ React.createElement(EntityTag, {
          id: person.id,
          key: person.id,
          label: person.displayName,
          onOpen: openEntity,
          type: "person"
        })), entry.repositories.length === 0 && entry.people.length === 0 ? /* @__PURE__ */ React.createElement("span", {
          className: "rd-meta"
        }, "nobody tagged yet") : null),
        title: /* @__PURE__ */ React.createElement(CardTitle, null, entry.topic.name)
      })), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
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
        onOpenEntity: openEntity,
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
        key: axis.id,
        onOpenEntity: openEntity
      }))), /* @__PURE__ */ React.createElement("div", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-cluster",
        "data-rd-topic-recent": "true"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, "Recent: ", countLabel(entry.activityCount, "event", "events")), entry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
        at: entry.lastActivityAt,
        prefix: "· last activity "
      }) : /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "· no activity yet")), /* @__PURE__ */ React.createElement("div", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement(Button, {
        "data-rd-close": expanded ? "true" : "false",
        "data-rd-read-open": expanded ? "false" : "true",
        disabled: busy,
        onClick: () => {
          if (expanded) {
            setExpandedId(null);
          } else {
            toggle(entry.topic.id);
          }
        },
        size: "sm",
        variant: expanded ? "outline" : "default"
      }, expanded ? "Close" : "Read topic"))), hidden > 0 && !expanded ? /* @__PURE__ */ React.createElement(Notice, {
        attrs: { "data-rd-hidden-axes": String(hidden) },
        kind: "truncated"
      }, shown.length, " of ", entry.axes.length, " axes shown · ", hidden, " ", "more") : null, details ? /* @__PURE__ */ React.createElement("div", {
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
      }, details.activity.map((item) => /* @__PURE__ */ React.createElement(ActivityLine, {
        axisLabel: details.axes.find((axis) => axis.id === item.axisId)?.title ?? null,
        item,
        key: item.id,
        onOpenEntity: openEntity,
        repositoryLabel: details.repositories.find((repository) => repository.id === item.repositoryId)?.fullName ?? null,
        topicLabel: details.topic.name
      })), details.activity.length === 0 ? /* @__PURE__ */ React.createElement("li", {
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
    })) : null, view === "people" ? /* @__PURE__ */ React.createElement(PeopleView, {
      onOpenEntity: openEntity,
      people: overview?.people ?? [],
      preselect: entityTarget?.type === "person" ? entityTarget : null,
      truncated: overview?.peopleTruncated === true,
      windowDays
    }) : null, view === "repositories" ? /* @__PURE__ */ React.createElement(RepositoriesView, {
      onOpenEntity: openEntity,
      preselect: entityTarget?.type === "repository" ? entityTarget : null,
      repositories: overview?.repositories ?? [],
      truncated: overview?.repositoriesTruncated === true,
      windowDays
    }) : null, view === "progress" ? /* @__PURE__ */ React.createElement(ProgressView, {
      onOpenEntity: openEntity,
      people: overview?.people ?? [],
      preselect: entityTarget && (entityTarget.type === "axis" || entityTarget.type === "problem") ? entityTarget : null,
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
