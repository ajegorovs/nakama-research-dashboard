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
var VIEW_OPTIONS = [
  { label: "Overview", value: "overview" },
  { label: "Topics", value: "topics" },
  { label: "People", value: "people" },
  { label: "Repositories", value: "repositories" },
  { label: "Progress", value: "progress" }
];
var VIEW_HEADINGS = {
  overview: "Topic and repository activity in the window you choose",
  people: "Recent activity is factual, not a workload score",
  progress: "Problem first; execution detail beneath it",
  repositories: "Alphabetical by name · factual context, never scored",
  topics: "Most recently active first · primarily read-only"
};
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
var FEED_LEAD = 5;
var RAIL_ACTIVITY_LEAD = 5;
var TERMINAL_AXIS_STATES = ["completed", "abandoned"];
var isTerminalAxis = (state) => TERMINAL_AXIS_STATES.includes(state);
var css = `
/*
 * One small vocabulary for type, spacing and quietness. The rules below used to carry ten literal type
 * sizes, seven gap values and five opacities — which reads as noise rather than hierarchy, and made every
 * later tweak a new number. Four type steps, four gaps and one quietness are the whole scale: the tier a
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
  /* V1 (2026-10-03). This read var(--rd-gap): a self-reference, which per CSS Variables makes the custom
     property invalid at computed-value time — so the eleven 'gap: var(--rd-gap)' rules below resolved to
     normal, i.e. to no gap at all, and the rows they govern sat tighter than designed. It was reported and
     deliberately left alone in the C1 pass (docs/reviews/2026-10-02-c1-acceptance-record.md, "Not changed,
     deliberately"), because repairing it moves geometry the accepted records had already measured. The V1
     visual pass re-measures that geometry, so the token is repaired here — and the few places that had
     papered over the hole with a literal (.rd-current-work > .rd-axes, gap: 18px) are the survivors to
     reconcile, not the model to follow. */
  --rd-gap: 8px;
  --rd-gap-block: 12px;
  /* One box edge and one inner line: a surface is a card, and everything inside it is a rule, not a box. */
  --rd-edge: 1px solid var(--border);
  --rd-rule: 2px solid var(--border);
  /* H1 — keyboard focus, one rule for every control this page draws. The host paints its ring at half alpha
     (Tailwind's ring-ring/50), which measures about 2:1 on the surfaces this page sits on: a reader can see it,
     but it is under the 3:1 that non-text contrast asks for. The plugin asks for the same hue at full strength,
     2px wide and offset clear of the control's own edge, so tags, index rows, disclosure summaries, folds,
     rails and the window controls all take their indicator from this one place rather than from the browser's
     one-pixel default. The fallback is the theme's own accent at full strength, for a host that sets no --ring. */
  --rd-focus: var(--ring, oklch(0.55 0.15 65));
  --rd-focus-width: 2px;
  --rd-focus-offset: 2px;
}
/*
 * The doubled :focus-visible is deliberate: the host stylesheet declares its ring colour as an
 * outline-color longhand *after* this sheet, so at equal specificity it wins the colour while these
 * declarations win the width and offset — which measured as a 2px outline in the host's half-alpha ring
 * colour, i.e. the very defect this rule exists to fix. One extra pseudo-class settles it without
 * !important, and the measurement states the result rather than assuming it.
 */
[data-plugin-id="research-dashboard"] :focus-visible:focus-visible {
  outline: var(--rd-focus-width) solid var(--rd-focus);
  outline-offset: var(--rd-focus-offset);
}
[data-plugin-id="research-dashboard"] .rd-stack { display: grid; gap: var(--rd-gap-block); }

  /* C3 — the default landing. Two columns from one payload. Topic activity is the wider column, the way the
     prototype has it, and both begin in the first viewport at 1440 and 1280 (the host leaves a 1144px and a
     984px container at those widths). It collapses to one column only below the narrowest review width, so a
     single-column read is never confused with the composition being judged. */
  [data-plugin-id="research-dashboard"] .rd-landing { display: grid; gap: var(--rd-gap-block); }
  [data-plugin-id="research-dashboard"] .rd-landing-grid {
    align-items: start;
    display: grid;
    gap: var(--rd-gap-block);
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }
  [data-plugin-id="research-dashboard"] .rd-landing-column { display: grid; gap: 12px; }
  /* The column head is a section, not a floating line: its label sits on a rule, so the two columns read
     as two labelled sections of one page rather than two loose stacks. */
  [data-plugin-id="research-dashboard"] .rd-landing-head {
    align-items: baseline; display: flex; gap: 8px; justify-content: space-between;
    padding-bottom: 8px; border-bottom: var(--rd-edge);
  }
  [data-plugin-id="research-dashboard"] .rd-landing-head .rd-side-title { font-size: var(--rd-body); }
  /* The card is a surface — white, edged, rounded, with room to breathe. Before this the landing cards
     were bare text on the page background, which is exactly what read as "flat" beside the prototype's
     panel cards. */
  [data-plugin-id="research-dashboard"] .rd-landing-card {
    background: var(--card, #fff);
    border: var(--rd-edge);
    border-radius: var(--radius-md, 10px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    display: grid;
    gap: 8px;
    padding: 12px 14px;
  }
  /* The card head: name + description as one block, and the age stated beside it in the prototype's own
     age-box grammar (a strong age over a quiet label) instead of as a third muted line. */
  [data-plugin-id="research-dashboard"] .rd-landing-top {
    align-items: flex-start; display: flex; gap: 12px; justify-content: space-between;
  }
  [data-plugin-id="research-dashboard"] .rd-landing-title { display: grid; gap: 2px; min-width: 0; }
  [data-plugin-id="research-dashboard"] .rd-landing-title .rd-meta { margin-top: 0; }
  [data-plugin-id="research-dashboard"] .rd-age-box {
    display: grid; gap: 1px; text-align: right; white-space: nowrap;
  }
  [data-plugin-id="research-dashboard"] .rd-age-box > .rd-meta { margin-top: 0; }
  /* The event band: the prototype's Last event block — an eyebrow over the event's own line, on a soft
     inset. Rendered only where the payload carries a real event; a card with none states what it does
     carry rather than being given a fabricated title. */
  [data-plugin-id="research-dashboard"] .rd-event-band {
    display: grid; gap: 2px;
    background: var(--muted, rgba(127, 127, 127, 0.06));
    border-radius: calc(var(--radius-sm, 6px));
    padding: 8px 10px;
  }
  [data-plugin-id="research-dashboard"] .rd-event-band .rd-section { font-size: 10px; }
  [data-plugin-id="research-dashboard"] .rd-event-band .rd-meta { margin-top: 0; }
  [data-plugin-id="research-dashboard"] .rd-landing-pills { display: flex; flex-wrap: wrap; gap: 4px; }
  /* The shell title as the way home: the same type as the heading it replaces, with nothing of a tab about
     it — no border, no fill, no pressed state. It underlines on hover and that is the whole affordance. */
  [data-plugin-id="research-dashboard"] .rd-home {
    background: none; border: 0; cursor: pointer; font: inherit; padding: 0; text-align: left;
  }
  [data-plugin-id="research-dashboard"] .rd-home:hover { text-decoration: underline; }
  @media (max-width: 899px) {
    [data-plugin-id="research-dashboard"] .rd-landing-grid { grid-template-columns: minmax(0, 1fr); }
  }
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
[data-plugin-id="research-dashboard"] [data-rd-topbar] {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] .rd-page-title {
  white-space: nowrap;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] .rd-toolbar {
  flex: 1 1 auto;
  justify-content: space-between;
}
[data-plugin-id="research-dashboard"] [data-rd-topbar] .rd-group {
  border: 0;
  padding: 0;
}
[data-plugin-id="research-dashboard"] .rd-views { gap: 4px; }
[data-plugin-id="research-dashboard"] .rd-views [data-rd-view-option] {
  border-color: transparent;
  background: transparent;
  padding: 7px 11px;
}
[data-plugin-id="research-dashboard"] .rd-views [aria-pressed="true"] {
  border-color: var(--border);
  background: var(--card, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
[data-plugin-id="research-dashboard"] .rd-views [data-rd-view-option]:hover {
  border-color: var(--border);
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
/* Blocked keeps the stronger exceptional rule on every axis surface; the badge still
   provides the explicit state text. */
[data-plugin-id="research-dashboard"] .rd-axis[data-rd-axis-state="blocked"] {
  border-left: 3px solid var(--destructive, #b91c1c);
}
/* Scan rows in the main work lane get the same bounded rhythm as detailed axis rows.
   The stopped-work disclosure remains separate and no state or navigation is hidden. */
[data-plugin-id="research-dashboard"] .rd-current-work > .rd-axes > .rd-axis {
  background: var(--muted, rgba(127, 127, 127, 0.04));
  border-top: var(--rd-edge);
  border-right: var(--rd-edge);
  border-bottom: var(--rd-edge);
  border-radius: 7px;
  padding: 9px 11px;
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
/* Overview's heading carries the window selector at its right edge: the control belongs to the tab, so it
   sits with the heading that names it rather than in the global toolbar. */
[data-plugin-id="research-dashboard"] .rd-overview-head {
  align-items: center;
  justify-content: space-between;
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
/* A joined segmented switch: white selected face against a darker muted track. */
[data-plugin-id="research-dashboard"] .rd-progress-switch {
  display: inline-flex;
  width: fit-content;
  gap: 0;
  margin-bottom: 10px;
  padding: 3px;
  border: var(--rd-edge);
  border-radius: 9px;
  background: var(--muted, #e5e7eb);
}
[data-plugin-id="research-dashboard"] .rd-progress-switch [data-rd-progress-subview-option] {
  border: 0;
  border-radius: 6px;
  background: transparent;
  opacity: 0.72;
  padding: 5px 12px;
}
[data-plugin-id="research-dashboard"] .rd-progress-switch [aria-pressed="true"] {
  background: var(--card, #fff);
  color: var(--foreground, #171717);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  font-weight: 600;
  opacity: 1;
}
/* C8: the qualifier on a state is part of the claim, not decoration — quieter, never optional. */
[data-plugin-id="research-dashboard"] .rd-claim-suffix { font-weight: 400; opacity: var(--rd-quiet); }
[data-plugin-id="research-dashboard"] .rd-newtopic { flex-wrap: nowrap; }
[data-plugin-id="research-dashboard"] .rd-newtopic input { width: 18rem; }
[data-plugin-id="research-dashboard"] .rd-activity { display: grid; gap: var(--rd-gap); margin: 0; padding: 0; list-style: none; }
/* Activity is a flat chronology in every detail rail, not nested cards inside a card. */
[data-plugin-id="research-dashboard"] .rd-activity li {
  border-bottom: var(--rd-edge);
  padding: 6px 0 10px;
  min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-activity li:last-child {
  border-bottom: 0;
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
  /* On a heading element (the Progress top-grid's eyebrows) this keeps the label tight; on a span it is
     inert. */
  margin: 0;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail {
  /* Work rows are grouped reading surfaces, not a run of equally weighted metadata. */
  border: var(--rd-edge);
  border-left: var(--rd-rule);
  border-radius: 7px;
  background: var(--muted, rgba(127, 127, 127, 0.04));
  padding: 14px 15px;
  display: grid;
  gap: 9px;
}
[data-plugin-id="research-dashboard"] .rd-current-work > .rd-axes {
  gap: 18px;
}
[data-plugin-id="research-dashboard"] .rd-axis-detail .rd-axis-controls {
  border-top: var(--rd-edge);
  padding-top: 4px;
}
[data-plugin-id="research-dashboard"] .rd-axis-more[open] > .rd-evidence {
  margin-top: 8px;
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
  max-height: min(72vh, 760px);
  overflow-y: auto;
  overscroll-behavior: contain;
  /* The index is a surface, not a bare list — the prototype's panel. Rows sit inside on a small inset,
     so a pressed row reads as a selected row within a panel rather than a stray rectangle on the page. */
  padding: 5px;
  list-style: none;
  display: grid;
  gap: 2px;
  align-content: start;
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-radius: var(--radius-md, 10px);
}
[data-plugin-id="research-dashboard"] .rd-index-item {
  width: 100%;
  text-align: left;
  display: grid;
  gap: var(--rd-gap-row);
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}
[data-plugin-id="research-dashboard"] .rd-index-item:hover {
  border-color: var(--border);
}
/* An index row's age stays whole at the row's end and never breaks mid-label; the counts line below it
   is free to wrap. */
[data-plugin-id="research-dashboard"] .rd-index-item .rd-row { align-items: baseline; }
[data-plugin-id="research-dashboard"] .rd-index-item .rd-row > .rd-meta {
  margin-top: 0;
  white-space: nowrap;
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
[data-plugin-id="research-dashboard"] .rd-progress-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-progress-title > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
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
[data-plugin-id="research-dashboard"] .rd-progress-problem > .rd-problem-card {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  gap: 12px;
  min-height: 165px;
  padding: 18px 20px;
}
[data-plugin-id="research-dashboard"] .rd-progress-problem > .rd-problem-card > .rd-strong {
  font-size: 18px;
  line-height: 1.4;
  overflow-wrap: anywhere;
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
/* Progress is a problem-first page. Keep its activity rail bounded and quiet so a run of
   verbose recorded events cannot push Plan and supporting evidence out of the glance.
   Every event remains in the DOM and the rail scrolls; links remain keyboard reachable. */
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed {
  max-height: 270px;
  overflow-y: auto;
  padding-right: 5px;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed > li {
  border-bottom: var(--rd-edge);
  padding: 5px 0 8px;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity {
  min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-cluster {
  min-width: 0;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-strong {
  flex: 1 1 100%;
  min-width: 0;
  font-size: var(--rd-meta);
  font-weight: 400;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
/* One legible event type scale across Topics, People, Repositories and Progress. */
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity .rd-strong,
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-strong {
  font-size: var(--rd-body);
  font-weight: 500;
  line-height: 1.45;
  color: var(--foreground, #171717);
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity .rd-meta,
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-meta {
  opacity: 0.78;
  overflow-wrap: anywhere;
}
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-tags {
  font-size: var(--rd-label);
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
  background: var(--muted, rgba(127, 127, 127, 0.08));
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
  border: var(--rd-edge);
  border-left: var(--rd-rule);
  border-radius: 7px;
  background: var(--muted, rgba(127, 127, 127, 0.04));
  padding: 11px 13px;
  display: grid;
  gap: var(--rd-gap-tight);
}
[data-plugin-id="research-dashboard"] .rd-involvement > ul {
  margin: 0;
  display: grid;
  gap: 12px;
}
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
  /* The detail is the same card the People and Repositories panels get from the host; the Topics pane
     draws its own, so the three views read as one surface. */
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-radius: var(--radius-md, 10px);
  padding: 16px 18px;
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
      title: label,
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
  function ViewHeading({ view }) {
    const hint = VIEW_HEADINGS[view];
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-view-heading",
      "data-rd-view-heading": view
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-view-title",
      "data-rd-view-title": view
    }, VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view), hint ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, hint) : null);
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
    }, axis.kind, " · v", axis.version)), /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-reading",
      "data-rd-axis-reading": axis.id
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
      className: "rd-axis-secondary rd-axis-refs"
    }, line || axis.people.length > 0 || axis.repositories.length > 0 ? /* @__PURE__ */ React.createElement("span", {
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
    }, line) : null) : null), /* @__PURE__ */ React.createElement("details", {
      className: "rd-axis-more",
      "data-rd-axis-more": axis.id
    }, /* @__PURE__ */ React.createElement("summary", null, "More on this axis"), /* @__PURE__ */ React.createElement(EvidenceLine, {
      evidence: axis.evidence
    }), axis.description ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-secondary",
      "data-rd-axis-description": "true"
    }, axis.description) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "state"), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.stateConfidence
    }), axis.lastReviewedAt ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "last reviewed ", axis.lastReviewedAt.slice(0, 10)) : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-axis-controls"
    }, /* @__PURE__ */ React.createElement(Button, {
      "data-rd-history-toggle": axis.id,
      disabled: busy,
      onClick: onToggleHistory,
      size: "sm",
      variant: "ghost"
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
      variant: correcting ? "default" : "ghost"
    }, correcting ? "Cancel" : "Correct"))), historyOpen ? /* @__PURE__ */ React.createElement(AxisHistory, {
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
  function supportsLine(entry) {
    const current = entry.axes.filter((axis) => !isTerminalAxis(axis.state)).length;
    const topics = entry.topics.length === 0 ? "no topic names it" : `supports ${countLabel(entry.topics.length, "topic", "topics")}`;
    return `${topics} · ${current === 0 ? "no current axis" : countLabel(current, "current axis", "current axes")}`;
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
    }, windowDays === 0 ? "Nothing recorded yet." : `Nothing recorded in the last ${countLabel(windowDays, "day", "days")}.`)) : null);
  }
  function PersonAxisRow({
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
    }, axis.kind, " · v", axis.version)), /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-reading",
      "data-rd-person-axis-reading": axis.id
    }, axis.blocker ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-value"
    }, axis.blocker), /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "blocker"), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.blockerConfidence
    }))) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "no blocker recorded")), /* @__PURE__ */ React.createElement("div", {
      className: "rd-axis-secondary rd-axis-refs"
    }, /* @__PURE__ */ React.createElement("span", {
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
    }, where) : null)), /* @__PURE__ */ React.createElement("details", {
      className: "rd-axis-more",
      "data-rd-person-axis-more": axis.id
    }, /* @__PURE__ */ React.createElement("summary", null, "More on this axis"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "state"), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.stateConfidence
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "last recorded ", axis.updatedAt.slice(0, 10)), axis.lastReviewedAt ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "· last reviewed ", axis.lastReviewedAt.slice(0, 10)) : null)));
  }
  function PersonPanel({
    entry,
    onOpenEntity,
    windowDays
  }) {
    const [railAll, setRailAll] = React.useState(false);
    const railActivity = entry.recentActivity;
    const railShown = railAll ? railActivity : railActivity.slice(0, RAIL_ACTIVITY_LEAD);
    const railHidden = railActivity.length - railShown.length;
    const relatedRepositories = React.useMemo(() => {
      const seen = new Map;
      for (const axis of entry.axes) {
        for (const repository of axis.repositories) {
          if (!seen.has(repository.id)) {
            seen.set(repository.id, repository);
          }
        }
      }
      return [...seen.values()];
    }, [entry]);
    return /* @__PURE__ */ React.createElement(Card, {
      className: "rd-panel",
      "data-rd-person-panel": entry.person.displayName
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(DetailHeader, {
      badge: entry.person.githubLogin ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "@", entry.person.githubLogin) : null,
      context: entry.topics.length > 0 || relatedRepositories.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, entry.topics.slice(0, 4).map((involvement) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: involvement.topic.id,
        key: involvement.topic.id,
        label: involvement.topic.name,
        onOpen: onOpenEntity,
        type: "topic"
      })), entry.topics.length > 4 ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "+", entry.topics.length - 4, " more") : null, relatedRepositories.slice(0, 3).map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: repository.id,
        key: repository.id,
        label: repository.fullName,
        onOpen: onOpenEntity,
        type: "repository"
      }))) : null,
      title: /* @__PURE__ */ React.createElement(CardTitle, null, entry.person.displayName)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-counts": "true"
    }, involvementLine(entry)))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-grid",
      "data-rd-person-split": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-current-work",
      "data-rd-person-lane": "current"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Current involvement"), /* @__PURE__ */ React.createElement("ul", {
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
    }, involvement.axes.map((axis) => /* @__PURE__ */ React.createElement(PersonAxisRow, {
      axis,
      key: axis.id,
      onOpenEntity
    }))))), entry.topics.length === 0 ? /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "Not linked to a topic yet — the link is what puts work on this page.")) : null)), /* @__PURE__ */ React.createElement("aside", {
      className: "rd-side-stack",
      "data-rd-person-rail": "true"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Recent activity"), entry.attributable ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", {
      "data-rd-person-activity-shown": railShown.length,
      "data-rd-person-activity-total": railActivity.length
    }, /* @__PURE__ */ React.createElement(ActivityList, {
      dataAttr: "data-rd-person-activity",
      items: railShown,
      labelFor: (item) => ({
        topic: entry.topics.find((involvement) => involvement.topic.id === item.topicId)?.topic.name ?? null
      }),
      onOpenEntity,
      windowDays
    })), railHidden > 0 || railAll ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster",
      "data-rd-person-activity-more": String(railHidden)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-activity-note": "true"
    }, railAll ? `all ${railActivity.length} shown, newest first` : `${railShown.length} of ${railActivity.length} shown, newest first`), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => setRailAll(!railAll),
      size: "sm",
      variant: "ghost"
    }, railAll ? "Show fewer" : `Show all ${railActivity.length}`)) : null) : /* @__PURE__ */ React.createElement("p", {
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
    }, "· never reviewed"))), /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "About"), entry.person.notes ? /* @__PURE__ */ React.createElement("p", {
      "data-rd-person-notes": "true"
    }, entry.person.notes) : /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-person-notes": "empty"
    }, "No note recorded for this person.")), /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Related repositories"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags",
      "data-rd-person-repositories": relatedRepositories.length
    }, relatedRepositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: onOpenEntity,
      type: "repository"
    })), relatedRepositories.length === 0 ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No repository is named by their axes yet.") : null))))));
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
    }, /* @__PURE__ */ React.createElement(ViewHeading, {
      view: "people"
    }), /* @__PURE__ */ React.createElement("ul", {
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
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, entry.person.displayName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-recency": entry.attributable ? entry.lastActivityAt ?? "none" : "unattributable"
    }, entry.attributable ? entry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: entry.lastActivityAt,
      prefix: "last activity "
    }) : "nothing attributed yet" : "no account mapped")), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-context": "true"
    }, involvementLine(entry)))))), selected ? /* @__PURE__ */ React.createElement(PersonPanel, {
      entry: selected,
      onOpenEntity,
      windowDays
    }) : null);
  }
  function LandingView({
    blocked,
    busy,
    onOpenEntity,
    onWindowChange,
    repositories,
    topics,
    windowDays
  }) {
    const stateWords = ["blocked", "active", "draft", "parked", "usable"];
    function currentWorkLine(entry) {
      const counts = stateWords.filter((state) => (entry.axisCounts[state] ?? 0) > 0).map((state) => `${entry.axisCounts[state]} ${state}`);
      const blockedAxis = blocked.find((row) => row.topicId === entry.topic.id);
      if (blockedAxis) {
        counts.push(`blocked on ${blockedAxis.title}`);
      }
      return counts.length > 0 ? counts.join(" · ") : null;
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-landing",
      "data-rd-landing": topics.length + repositories.length
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-view-heading rd-overview-head",
      "data-rd-view-heading": "overview"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-view-title",
      "data-rd-view-title": "overview"
    }, "Overview"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, VIEW_HEADINGS.overview)), /* @__PURE__ */ React.createElement(WindowControl, {
      disabled: busy,
      onChange: onWindowChange,
      value: windowDays
    })), /* @__PURE__ */ React.createElement("div", {
      className: "rd-landing-grid"
    }, /* @__PURE__ */ React.createElement("section", {
      "aria-label": "Topic activity",
      className: "rd-landing-column",
      "data-rd-landing-column": "topics",
      "data-rd-landing-topics": topics.length
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-landing-head"
    }, /* @__PURE__ */ React.createElement("h4", {
      className: "rd-side-title"
    }, "Topic activity"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "Attention order, as the payload sends it")), topics.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-landing-empty": "topics"
    }, "No topics recorded yet.") : null, topics.map((entry) => {
      const current = currentWorkLine(entry);
      return /* @__PURE__ */ React.createElement("article", {
        className: "rd-topic-card rd-landing-card",
        "data-rd-landing-topic": entry.topic.id,
        key: entry.topic.id
      }, /* @__PURE__ */ React.createElement("div", {
        className: "rd-landing-top"
      }, /* @__PURE__ */ React.createElement("div", {
        className: "rd-landing-title"
      }, /* @__PURE__ */ React.createElement("h5", {
        className: "rd-strong",
        "data-rd-landing-name": entry.topic.id
      }, entry.topic.name), entry.topic.description ? /* @__PURE__ */ React.createElement("p", {
        className: "rd-meta",
        "data-rd-landing-description": entry.topic.id
      }, entry.topic.description) : null), /* @__PURE__ */ React.createElement("span", {
        className: "rd-age-box",
        "data-rd-landing-recency": entry.topic.id
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-strong"
      }, describeAge(entry.lastActivityAt)), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "last recorded activity"))), current ? /* @__PURE__ */ React.createElement("p", {
        className: "rd-current-work",
        "data-rd-landing-current-work": entry.topic.id
      }, current) : null, entry.axes.length > 0 ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-landing-pills",
        "data-rd-landing-pills": entry.axes.length
      }, entry.axes.slice(0, 3).map((axis) => /* @__PURE__ */ React.createElement("span", {
        className: "rd-tag",
        "data-rd-landing-pill": axis.state,
        key: axis.id
      }, axis.title, " · ", axis.state, axis.stateConfidence === "confirmed" ? "" : ` (${axis.stateConfidence})`)), entry.axes.length > 3 ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, "+", entry.axes.length - 3, " more") : null) : null, /* @__PURE__ */ React.createElement("p", {
        className: "rd-meta",
        "data-rd-landing-activity": entry.topic.id
      }, countLabel(entry.activityCount, "event", "events"), " in the selected window", entry.lastActivityAt ? "" : " · no activity recorded yet"), entry.people.length > 0 || entry.repositories.length > 0 ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-tags",
        "data-rd-landing-chips": entry.topic.id
      }, entry.people.map((person) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: person.id,
        key: person.id,
        label: person.displayName,
        onOpen: onOpenEntity,
        type: "person"
      })), entry.repositories.map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: repository.id,
        key: repository.id,
        label: repository.fullName,
        onOpen: onOpenEntity,
        type: "repository"
      }))) : null, /* @__PURE__ */ React.createElement("div", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement(Button, {
        "data-rd-landing-open": "topic",
        onClick: () => onOpenEntity("topic", entry.topic.id),
        size: "sm",
        variant: "outline"
      }, "Open topic →")));
    })), /* @__PURE__ */ React.createElement("section", {
      "aria-label": "Repository activity",
      className: "rd-landing-column",
      "data-rd-landing-column": "repositories",
      "data-rd-landing-repositories": repositories.length
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-landing-head"
    }, /* @__PURE__ */ React.createElement("h4", {
      className: "rd-side-title"
    }, "Repository activity"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "By name, as the payload sends it")), repositories.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-landing-empty": "repositories"
    }, "No repositories recorded yet.") : null, repositories.map((entry) => {
      const latest = entry.recentActivity[0] ?? null;
      return /* @__PURE__ */ React.createElement("article", {
        className: "rd-topic-card rd-landing-card",
        "data-rd-landing-repository": entry.repository.id,
        key: entry.repository.id
      }, /* @__PURE__ */ React.createElement("div", {
        className: "rd-landing-top"
      }, /* @__PURE__ */ React.createElement("div", {
        className: "rd-landing-title"
      }, /* @__PURE__ */ React.createElement("h5", {
        className: "rd-strong",
        "data-rd-landing-name": entry.repository.id
      }, entry.repository.fullName), entry.repository.description ? /* @__PURE__ */ React.createElement("p", {
        className: "rd-meta",
        "data-rd-landing-description": entry.repository.id
      }, entry.repository.description) : null), /* @__PURE__ */ React.createElement("span", {
        className: "rd-age-box",
        "data-rd-landing-recency": entry.repository.id
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-strong"
      }, describeAge(entry.lastActivityAt)), /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "last recorded activity"))), latest ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-event-band",
        "data-rd-landing-last-event": entry.repository.id
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-section"
      }, "Last event"), /* @__PURE__ */ React.createElement("span", {
        className: "rd-strong"
      }, latest.summary), /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, latest.sourceRef || latest.sourceType, " · ", describeAge(latest.occurredAt))) : null, entry.topics.length > 0 || entry.axes.length > 0 ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-tags",
        "data-rd-landing-chips": entry.repository.id
      }, entry.topics.map((link) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: link.topic.id,
        key: link.topic.id,
        label: link.topic.name,
        onOpen: onOpenEntity,
        type: "topic"
      })), entry.axes.length > 0 ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta",
        "data-rd-landing-axes": entry.repository.id
      }, countLabel(entry.axes.length, "development axis", "development axes")) : null) : null, /* @__PURE__ */ React.createElement("div", {
        className: "rd-row",
        "data-rd-landing-count-omitted": "d4"
      }, /* @__PURE__ */ React.createElement(Button, {
        "data-rd-landing-open": "repository",
        onClick: () => onOpenEntity("repository", entry.repository.id),
        size: "sm",
        variant: "outline"
      }, "Expand activity →")));
    }))));
  }
  function RepositoriesView({
    onOpenEntity,
    people,
    peopleTruncated,
    preselect,
    repositories,
    truncated,
    windowDays
  }) {
    const [selectedId, setSelectedId] = React.useState(null);
    const [railAllFor, setRailAllFor] = React.useState(null);
    React.useEffect(() => {
      if (preselect) {
        setSelectedId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq]);
    const selected = repositories.find((entry) => entry.repository.id === selectedId) ?? repositories[0] ?? null;
    const railAll = railAllFor !== null && railAllFor === selected?.repository.id;
    const railActivity = selected?.recentActivity ?? [];
    const railShown = railAll ? railActivity : railActivity.slice(0, RAIL_ACTIVITY_LEAD);
    const railHidden = railActivity.length - railShown.length;
    const currentAxes = (selected?.axes ?? []).filter((axis) => !isTerminalAxis(axis.state));
    const foldedAxes = (selected?.axes ?? []).filter((axis) => isTerminalAxis(axis.state));
    const repositoryPeople = people.filter((entry) => entry.axes.some((axis) => axis.repositories.some((link) => link.id === selected?.repository.id)));
    if (repositories.length === 0) {
      return /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
        className: "rd-muted"
      }, "No repository is attached yet. A topic or an axis names one and it appears here.")));
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-split",
      "data-rd-view": "repositories"
    }, /* @__PURE__ */ React.createElement(ViewHeading, {
      view: "repositories"
    }), /* @__PURE__ */ React.createElement("ul", {
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
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, entry.repository.fullName), /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: entry.lastActivityAt
    })), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-repository-line": "true"
    }, supportsLine(entry)))))), selected ? /* @__PURE__ */ React.createElement(Card, {
      className: "rd-panel",
      "data-rd-repository-panel": selected.repository.fullName
    }, /* @__PURE__ */ React.createElement(CardHeader, null, /* @__PURE__ */ React.createElement(DetailHeader, {
      badge: /* @__PURE__ */ React.createElement("span", {
        className: "rd-cluster",
        "data-rd-repository-last": "true"
      }, selected.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
        at: selected.lastActivityAt,
        prefix: "last activity "
      }) : /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "no activity recorded yet")),
      context: selected.topics.length > 0 || selected.axes.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, selected.topics.map((link) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: link.topic.id,
        key: link.topic.id,
        label: link.topic.name,
        onOpen: onOpenEntity,
        type: "topic"
      })), selected.axes.slice(0, 4).map((axis) => /* @__PURE__ */ React.createElement(EntityTag, {
        compact: true,
        id: axis.id,
        key: axis.id,
        label: axis.title,
        onOpen: onOpenEntity,
        type: "axis"
      })), selected.axes.length > 4 ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "+", selected.axes.length - 4, " more") : null) : null,
      title: /* @__PURE__ */ React.createElement(CardTitle, null, selected.repository.fullName)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, selected.repository.description || "no description recorded", selected.repository.defaultBranch ? ` · default branch ${selected.repository.defaultBranch}` : ""))), /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-grid",
      "data-rd-repository-split": "true"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-current-work",
      "data-rd-repository-current": currentAxes.length,
      "data-rd-repository-lane": "current"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Current work"), currentAxes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No current work in this repository.") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes",
      "data-rd-repository-axes": selected.axes.length
    }, currentAxes.map((axis) => /* @__PURE__ */ React.createElement(AxisScanItem, {
      axis,
      key: axis.id,
      onOpenEntity
    }))), foldedAxes.length > 0 ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-completed-fold",
      "data-rd-repository-folded": foldedAxes.length
    }, /* @__PURE__ */ React.createElement("summary", null, "Completed and abandoned work (", foldedAxes.length, ")"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes",
      "data-rd-repository-axes": selected.axes.length
    }, foldedAxes.map((axis) => /* @__PURE__ */ React.createElement(AxisScanItem, {
      axis,
      key: axis.id,
      onOpenEntity
    })))) : null, selected.axes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No axis names this repository yet.") : null), /* @__PURE__ */ React.createElement("aside", {
      className: "rd-side-stack"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Recent activity"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      "data-rd-repository-activity": railActivity.length,
      "data-rd-repository-activity-shown": railShown.length
    }, railShown.map((item) => /* @__PURE__ */ React.createElement(ActivityLine, {
      axisLabel: selected.axes.find((axis) => axis.id === item.axisId)?.title ?? null,
      item,
      key: item.id,
      onOpenEntity,
      topicLabel: selected.topics.find((link) => link.topic.id === item.topicId)?.topic.name ?? null
    })), railActivity.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No activity recorded yet.") : null), railHidden > 0 || railAll ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster",
      "data-rd-repository-activity-more": String(railHidden)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-repository-activity-note": "true"
    }, railAll ? `all ${railActivity.length} shown, newest first` : `${railShown.length} of ${railActivity.length} shown, newest first`), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => {
        setRailAllFor(railAll ? null : selected?.repository.id ?? null);
      },
      size: "sm",
      variant: "ghost"
    }, railAll ? "Show fewer" : `Show all ${railActivity.length}`)) : null), /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
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
    }, "no topic names it yet")) : null)), repositoryPeople.length > 0 || peopleTruncated ? /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card",
      "data-rd-repository-people": repositoryPeople.length
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "People"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags"
    }, repositoryPeople.map((entry) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: entry.person.id,
      key: entry.person.id,
      label: entry.person.displayName,
      onOpen: onOpenEntity,
      type: "person"
    }))), peopleTruncated ? /* @__PURE__ */ React.createElement(Notice, {
      kind: "truncated"
    }, "the people rollup is truncated, so this list may be partial") : null) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row",
      "data-rd-repository-notes-omitted": "true"
    }))))) : null);
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
    repositories
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
    }, /* @__PURE__ */ React.createElement(ViewHeading, {
      view: "progress"
    }), /* @__PURE__ */ React.createElement("div", {
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
      "data-rd-problem-index-recency": problem.recencyAt ?? "",
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
      "data-rd-index-recency": row.recencyAt ?? "",
      onClick: () => setSelectedAxisId(row.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, row.title), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `last activity ${describeAge(row.recencyAt)}`)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: row.stateConfidence,
      state: row.state
    }), ` · ${row.topicName} · ${problemCountLine(row)}${row.stale ? " · stale" : ""}`))))), problemsMode && problemRows.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-problem-index-empty": "true"
    }, "No problems yet.") : null, !problemsMode && progress && progress.axes.axes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-index-empty": "true"
    }, "No axes yet.") : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-detail",
      "data-rd-progress-detail": "true",
      "data-rd-progress-detail-axis": activeAxis?.id ?? ""
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
        className: "rd-strong rd-progress-title",
        "data-rd-progress-detail-title": "true"
      }, activeAxis ? /* @__PURE__ */ React.createElement(StateBadge, {
        confidence: activeAxis.stateConfidence,
        state: activeAxis.state
      }) : null, /* @__PURE__ */ React.createElement("span", null, activeAxis?.title ?? "Nothing is selected"))
    }, activeAxis ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster",
      "data-rd-progress-recency": "true"
    }, /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: activeAxis.recencyAt,
      prefix: "last activity "
    }), activeAxis.stale ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "· stale") : null) : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-grid rd-progress-pair",
      "data-rd-progress-pair": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-problem",
      "data-rd-progress-problem-axis": activeAxis?.id ?? "",
      "data-rd-progress-problem-mode": indexMode,
      "data-rd-progress-problem-open": activeAxis?.openProblems ?? 0,
      "data-rd-progress-problem-shown": shownProblem?.id ?? ""
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-section",
      "data-rd-progress-problem-heading": "true"
    }, "Current problem"), problemsMode && shownProblem ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-progress-problem-context": "true"
    }, problemContext(shownProblem)) : null, activeAxis === null && !problemsMode ? /* @__PURE__ */ React.createElement("p", {
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
      className: "rd-side-title"
    }, "Recent activity"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-progress-activity-total": "true"
    }, countLabel(activeAxis?.activityInWindow ?? 0, "recorded event", "recorded events"), " total"), problemsMode && activeAxis ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-progress-feed-parent": "true"
    }, `on ${activeAxis.title}`) : null, feed === null || feed.events.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-feed-empty": "true"
    }, "Nothing recorded against this axis.") : /* @__PURE__ */ React.createElement("ul", {
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
      size: "sm",
      variant: "ghost"
    }, feedAll ? "Show fewer" : `Show all ${feed.events.length}`)) : null)), axisPlan !== null || openAxisProblems.length > 0 ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-row",
      "data-rd-progress-row": "true"
    }, axisPlan ? /* @__PURE__ */ React.createElement("section", {
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
    }, problemContext(problem))))))) : null) : null, (shownProblem?.repositories.length ?? 0) > 0 || (shownProblem?.evidence.length ?? 0) > 0 || problemSteering.length > 0 || axisSteering.length > 0 ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-band",
      "data-rd-progress-band": "true"
    }, shownProblem && shownProblem.repositories.length > 0 ? /* @__PURE__ */ React.createElement("section", {
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
    }, claim.text)))) : null) : null) : null)));
  }
  function ResearchPage() {
    const [loadedOverview, setOverview] = React.useState(null);
    const [loadedScope, setLoadedScope] = React.useState(null);
    const [view, setView] = React.useState("overview");
    const [entityTarget, setEntityTarget] = React.useState(null);
    function openEntity(type, id) {
      setEntityTarget({ id, seq: (entityTarget?.seq ?? 0) + 1, type });
      setView(ENTITY_VIEW[type]);
    }
    const [windowDays, setWindowDays] = React.useState(14);
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
    const [railAllFor, setRailAllFor] = React.useState(null);
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
    const loadSeq = React.useRef(0);
    const scopeWindow = view === "overview" ? windowDays : 0;
    const overview = loadedScope === scopeWindow ? loadedOverview : null;
    const visibleProgress = loadedScope === scopeWindow ? progress : null;
    async function load(nextWindow) {
      const seq = ++loadSeq.current;
      const scope = { activitySinceDays: nextWindow };
      const result = await call("get_overview", scope);
      if (loadSeq.current !== seq || ctx.signal.aborted) {
        return;
      }
      const progressResult = await call("get_progress", scope);
      if (loadSeq.current !== seq || ctx.signal.aborted) {
        return;
      }
      setOverview(result ? result : null);
      setProgress(progressResult ? progressResult : null);
      setLoadedScope(nextWindow);
    }
    function reloadCurrent() {
      return load(scopeWindow);
    }
    React.useEffect(() => {
      load(scopeWindow);
    }, [scopeWindow]);
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
    function selectTopic(topicId) {
      if (topicId === expandedId) {
        return;
      }
      setExpandedId(topicId);
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
        await reloadCurrent();
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
        await reloadCurrent();
      }
    }
    const topics = overview?.topics ?? [];
    const counts = overview?.counts;
    React.useEffect(() => {
      if (topics.length === 0) {
        return;
      }
      if (expandedId && topics.some((entry) => entry.topic.id === expandedId)) {
        return;
      }
      setExpandedId(topics[0].topic.id);
    }, [topics, expandedId]);
    const selectedEntry = topics.find((entry) => entry.topic.id === expandedId) ?? topics[0] ?? null;
    const selectedDetails = selectedEntry && detail && detail.topic.id === selectedEntry.topic.id ? detail : null;
    const railActivity = selectedDetails?.activity ?? [];
    const railAll = railAllFor !== null && railAllFor === selectedEntry?.topic.id;
    const railShown = railAll ? railActivity : railActivity.slice(0, RAIL_ACTIVITY_LEAD);
    const railHidden = railActivity.length - railShown.length;
    const currentAxes = (selectedDetails ? selectedDetails.axes : selectedEntry?.axes ?? []).filter((axis) => !isTerminalAxis(axis.state));
    const foldedAxes = selectedDetails ? selectedDetails.axes.filter((axis) => isTerminalAxis(axis.state)) : [];
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row",
      "data-rd-topbar": "true"
    }, /* @__PURE__ */ React.createElement("h2", {
      className: "rd-page-title",
      "data-rd-home": "current"
    }, "Research dashboard"), /* @__PURE__ */ React.createElement("div", {
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
      "data-rd-group": "actions"
    }, /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: () => {
        reloadCurrent();
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
    ].join(" · ") : "loading…")), view === "overview" ? /* @__PURE__ */ React.createElement(LandingView, {
      blocked: overview?.blocked ?? [],
      busy,
      onOpenEntity: openEntity,
      onWindowChange: setWindowDays,
      repositories: overview?.repositories ?? [],
      topics,
      windowDays
    }) : null, view === "topics" ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-split",
      "data-rd-view": "topics"
    }, /* @__PURE__ */ React.createElement(ViewHeading, {
      view: "topics"
    }), /* @__PURE__ */ React.createElement("ul", {
      "aria-label": "Topics",
      className: "rd-index rd-topic-index",
      "data-rd-topic-index": topics.length
    }, topics.map((entry) => {
      const isSelected = entry.topic.id === expandedId;
      const isStale = entry.topic.status === "stale";
      const currentCount = Object.entries(entry.axisCounts).filter(([state]) => state !== "completed" && state !== "abandoned").reduce((sum, [, n]) => sum + n, 0);
      return /* @__PURE__ */ React.createElement("li", {
        key: entry.topic.id
      }, /* @__PURE__ */ React.createElement("button", {
        "aria-pressed": isSelected,
        className: "rd-index-item",
        "data-rd-index-topic": entry.topic.name,
        "data-rd-topic-stale": isStale,
        disabled: busy,
        onClick: () => selectTopic(entry.topic.id),
        type: "button"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-row"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-strong"
      }, entry.topic.name), entry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
        at: entry.lastActivityAt
      }) : null), /* @__PURE__ */ React.createElement("span", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta",
        "data-rd-index-current": currentCount
      }, countLabel(currentCount, "current axis", "current axes")), isStale ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-count",
        "data-rd-index-stale": "true"
      }, "Stale") : null)));
    })), selectedEntry ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-panel rd-topic-detail",
      "data-rd-detail": selectedEntry.topic.name,
      "data-rd-detail-mode": "persistent"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-head"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row",
      "data-rd-detail-header": "true"
    }, /* @__PURE__ */ React.createElement(CardTitle, null, selectedEntry.topic.name), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, selectedEntry.topic.status)), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags",
      "data-rd-detail-context": "true"
    }, (selectedDetails?.repositories ?? selectedEntry.repositories).map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: openEntity,
      type: "repository"
    })), (selectedDetails?.people ?? selectedEntry.people).map((person) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: person.id,
      key: person.id,
      label: person.displayName,
      onOpen: openEntity,
      type: "person"
    })), (selectedDetails?.repositories ?? selectedEntry.repositories).length === 0 && (selectedDetails?.people ?? selectedEntry.people).length === 0 ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "nobody tagged yet") : null), selectedDetails ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-claims"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-claim",
      "data-rd-description-field": "true"
    }, selectedDetails.topic.description ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-value",
      "data-rd-claim": "description"
    }, selectedDetails.topic.description), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "description")) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted",
      "data-rd-claim": "description"
    }, "No description recorded.")), /* @__PURE__ */ React.createElement("div", {
      className: "rd-claim"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-value",
      "data-rd-claim": "summary"
    }, selectedDetails.topic.summary || /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "no approved summary")), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "approved summary — a human interpretation, not an agent one"))) : null), selectedDetails && conflict && !conflict.axisId ? /* @__PURE__ */ React.createElement("div", {
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
        loadDetail(selectedDetails.topic.id);
      },
      size: "sm",
      variant: "outline"
    }, "Reload this topic"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "Nothing you typed has been thrown away."))) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-grid"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-current-work",
      "data-rd-current-work": currentAxes.length
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Current work"), currentAxes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No current axes on this topic.") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes"
    }, currentAxes.map((axis) => selectedDetails ? /* @__PURE__ */ React.createElement(AxisDetailCard, {
      axis,
      busy,
      conflict,
      correction,
      historyOpen: historyAxisId === axis.id,
      key: axis.id,
      onCorrection: setCorrection,
      onOpenEntity: openEntity,
      onReload: () => {
        reloadAxis(selectedEntry.topic.id, axis.id);
      },
      onSave: () => {
        saveCorrection();
      },
      onToggleHistory: () => {
        setHistoryAxisId((current) => current === axis.id ? null : axis.id);
      }
    }) : /* @__PURE__ */ React.createElement(AxisItem, {
      axis,
      key: axis.id,
      onOpenEntity: openEntity
    }))), foldedAxes.length > 0 ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-completed-fold",
      "data-rd-folded-axes": foldedAxes.length
    }, /* @__PURE__ */ React.createElement("summary", null, "Completed and abandoned work (", foldedAxes.length, ")"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes"
    }, foldedAxes.map((axis) => /* @__PURE__ */ React.createElement(AxisDetailCard, {
      axis,
      busy,
      conflict,
      correction,
      historyOpen: historyAxisId === axis.id,
      key: axis.id,
      onCorrection: setCorrection,
      onOpenEntity: openEntity,
      onReload: () => {
        reloadAxis(selectedEntry.topic.id, axis.id);
      },
      onSave: () => {
        saveCorrection();
      },
      onToggleHistory: () => {
        setHistoryAxisId((current) => current === axis.id ? null : axis.id);
      }
    })))) : null), /* @__PURE__ */ React.createElement("aside", {
      className: "rd-side-stack"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Recent activity"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      "data-rd-topic-activity": selectedDetails?.activity.length ?? selectedEntry.activityCount,
      "data-rd-topic-activity-shown": railShown.length
    }, railShown.map((item) => /* @__PURE__ */ React.createElement(ActivityLine, {
      axisLabel: selectedDetails?.axes.find((axis) => axis.id === item.axisId)?.title ?? null,
      item,
      key: item.id,
      onOpenEntity: openEntity,
      repositoryLabel: selectedDetails?.repositories.find((repository) => repository.id === item.repositoryId)?.fullName ?? null,
      topicLabel: selectedEntry.topic.name
    })), selectedDetails && selectedDetails.activity.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No activity recorded yet.") : null, !selectedDetails ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "Loading this topic…") : null), railHidden > 0 || railAll ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster",
      "data-rd-topic-activity-more": String(railHidden)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-topic-activity-note": "true"
    }, railAll ? `all ${railActivity.length} shown, newest first` : `${railShown.length} of ${railActivity.length} shown, newest first`), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => {
        setRailAllFor(railAll ? null : selectedEntry?.topic.id ?? null);
      },
      size: "sm",
      variant: "ghost"
    }, railAll ? "Show fewer" : `Show all ${railActivity.length}`)) : null, selectedDetails ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-narrow-write",
      "data-rd-write": "activity"
    }, /* @__PURE__ */ React.createElement("summary", null, "Record activity"), /* @__PURE__ */ React.createElement("form", {
      className: "rd-narrow-write",
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
      size: "sm",
      type: "submit"
    }, "Record activity"))) : null), /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Notes"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-notes",
      "data-rd-topic-notes": selectedDetails?.notes.length ?? 0
    }, (selectedDetails?.notes ?? []).map((note) => /* @__PURE__ */ React.createElement("li", {
      key: note.id
    }, /* @__PURE__ */ React.createElement("div", null, note.text), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, note.authorType, " · ", note.createdAt.slice(0, 10)))), selectedDetails && selectedDetails.notes.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No notes yet. This is where a correction or a caveat goes — deliberately not in the activity log.") : null), selectedDetails ? /* @__PURE__ */ React.createElement("form", {
      className: "rd-narrow-write",
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
    }, "Add note / correction")) : null), /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Related repositories"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags"
    }, (selectedDetails?.repositories ?? selectedEntry.repositories).map((repository) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: repository.id,
      key: repository.id,
      label: repository.fullName,
      onOpen: openEntity,
      type: "repository"
    })), (selectedDetails?.repositories ?? selectedEntry.repositories).length === 0 ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No repository linked yet.") : null))))) : null) : null, view === "people" ? /* @__PURE__ */ React.createElement(PeopleView, {
      onOpenEntity: openEntity,
      people: overview?.people ?? [],
      preselect: entityTarget?.type === "person" ? entityTarget : null,
      truncated: overview?.peopleTruncated === true,
      windowDays: scopeWindow
    }) : null, view === "repositories" ? /* @__PURE__ */ React.createElement(RepositoriesView, {
      onOpenEntity: openEntity,
      people: overview?.people ?? [],
      peopleTruncated: overview?.peopleTruncated === true,
      preselect: entityTarget?.type === "repository" ? entityTarget : null,
      repositories: overview?.repositories ?? [],
      truncated: overview?.repositoriesTruncated === true,
      windowDays: scopeWindow
    }) : null, view === "progress" ? /* @__PURE__ */ React.createElement(ProgressView, {
      onOpenEntity: openEntity,
      people: overview?.people ?? [],
      preselect: entityTarget && (entityTarget.type === "axis" || entityTarget.type === "problem") ? entityTarget : null,
      progress: visibleProgress,
      repositories: overview?.repositories ?? []
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
