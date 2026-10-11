// src/ui.tsx
var inject = ["slots", "host", "ui", "styles"];
function activityActorIndication(actorType, hasPerson) {
  if (hasPerson)
    return "person";
  return actorType === "system" ? "system" : "unattributed";
}
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
var VIEW_OPTIONS = [
  { label: "Projects", value: "topics" },
  { label: "Progress", value: "progress" },
  { label: "People", value: "people" },
  { label: "Repositories", value: "repositories" }
];
var VIEW_HEADINGS = {
  people: "See who each person is, the research and work they are involved in, their repositories and latest activity.",
  progress: "Read workstreams and tasks in full, with their status, scoped plans, supporting repositories and activity. Selection changes what you view, not the research state.",
  repositories: "Understand what each repository is for, the work underway, the projects it supports, its people and recent activity.",
  topics: "Understand each project: its purpose, people, current workstreams and recent activity. Open a workstream in Progress for the full work details."
};
var ENTITY_VIEW = {
  axis: "progress",
  person: "people",
  problem: "progress",
  repository: "repositories",
  topic: "topics"
};
var PROGRESS_PAGE_SIZE = 5;
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
 *
 *   --rd-title-view  V1: the page-level step, above every subsection. The token block used to top out at
 *   the host's own 16px card title, so a view's name and a card's name were the same size and the shell
 *   title (16px) outranked the view it governed — which is what made every page read as compressed. There
 *   is deliberately no second new token for the detail/entity title: that IS the host's --rd-title.
 */
[data-plugin-id="research-dashboard"] {
  --rd-title-view: 23px;
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
  /* V1-B/B3 (2026-10-03) — separation between the flat rail sections. A rail is a stack of sections with
     no boxes between them; at 12px the sections read as one run of text (V1-B B3: the
     spacing is insufficient to replace the missing card boundaries). This is the larger step the rail
     wants, and the reviewer's own suggested range (about 20-24px). Not a new box. */
  --rd-gap-rail: 24px;
  /* V1/A4 (2026-10-03) — one index width. A shrinkable basis of 15rem with a 12rem floor let the rail give
     ground whenever the detail wanted room, so the same rail laid out at a different width in each view and
     long entity names wrapped to three and four lines. One basis, and the rail does not shrink below it:
     where there is not room for both, .rd-split wraps the detail below rather than squeezing the index.
     Progress used to carry its own 16rem override; it takes this one now. */
  /* Pivot port (2026-10-10) — one shared selector-rail width for all four views, matching the accepted
     prototype's 380px desktop rail. The four side selectors used to disagree (Progress carried a narrower
     240px variant); the pivot's "All four side selectors use the same pane width (380px at the measured
     desktop viewports)" is the value the token now holds, and Progress takes this one too — it no longer
     overrides itself. */
  --rd-index-basis: 23.75rem;
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
/*
 * V1 Phase-4 ruling (DECISIONS §14.10) — focus scroll clearance, not a weaker indicator. The shared
 * indicator above is 2px wide, offset 2px clear of the control's own edge, so it is painted 4px outside
 * the border box. A real Tab press that brings a control to rest flush against the host scrollport's edge
 * (measured: fixture 1280×800, a Progress index row at the port's bottom) lets that outline overhang the
 * scrollport and be cut by its overflow clipping — a defect a keyboard user sees, fixed here by clearance
 * rather than by changing the shared rule. Six pixels of scroll margin on the controls this page draws
 * makes the browser's own focus scroll frame the element's margin box, leaving the indicator room on every
 * side. The scroll-margin property has no layout effect: it only moves where a focus scroll stops.
 */
[data-plugin-id="research-dashboard"] button,
[data-plugin-id="research-dashboard"] summary,
[data-plugin-id="research-dashboard"] a[href],
[data-plugin-id="research-dashboard"] input,
[data-plugin-id="research-dashboard"] [tabindex] {
  scroll-margin-block: 6px;
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
  /* The event band: the prototype's Last event block — an eyebrow over the event's own line. Rendered
     only where the payload carries a real event; a card with none states what it does carry rather than
     being given a fabricated title.
     V1-B/B4 (2026-10-03) — it used to be a gray rectangular inset, visually louder than the card it sits
     in (V1-B B4: "a fairly heavy gray rectangular inset … visually louder than it needs to
     be"). The prototype integrates the event with a divider and whitespace, so the fill is gone: a
     hairline above, then the eyebrow and the event's own lines in the card's own whitespace. */
  [data-plugin-id="research-dashboard"] .rd-event-band {
    display: grid; gap: 2px;
    border-top: var(--rd-edge);
    margin-top: 2px;
    padding: 8px 0 0;
  }
  [data-plugin-id="research-dashboard"] .rd-event-band .rd-section { font-size: 10px; }
  [data-plugin-id="research-dashboard"] .rd-event-band .rd-meta { margin-top: 0; }
  /* V1-B/B4 (2026-10-03) — the card's own state line and its blocker, as two lines with a real step
     between them (the review found them concatenated into one serialized sentence). The counts stay the
     compact metadata step; the blocked axis is its own line at the card's reading weight. Scoped to the
     card so it outranks the generic .rd-current-work 2px row gap rather than racing its source order. */
  [data-plugin-id="research-dashboard"] .rd-landing-card .rd-landing-current { gap: var(--rd-gap-tight); }
  /* V1-B/B4 — one footer/action geometry for both landing columns: the action sits at the card's right
     edge, the prototype's card-footer placement, instead of left-aligned under the tags. Both columns
     carry it, so the two cards' feet read the same. Scoped to the card to outrank .rd-row's own
     space-between. */
  [data-plugin-id="research-dashboard"] .rd-landing-card .rd-landing-action { justify-content: flex-end; }
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
  /* The collapsed Dashboard summary above the Projects landing (Overview retired). A quiet disclosure in the
     shared token vocabulary: a bold muted summary heading, and the six aggregates as a compact stat row. */
  [data-plugin-id="research-dashboard"] .rd-dashboard-summary { margin-bottom: var(--rd-gap-block); }
  [data-plugin-id="research-dashboard"] .rd-dashboard-summary > summary {
    color: var(--rd-muted);
    cursor: pointer;
    font-size: var(--rd-label);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  [data-plugin-id="research-dashboard"] .rd-stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: var(--rd-gap);
    list-style: none;
    margin: var(--rd-gap-block) 0 0;
    padding: 0;
  }
  [data-plugin-id="research-dashboard"] .rd-stat { display: grid; gap: 2px; }
  [data-plugin-id="research-dashboard"] .rd-stat-value { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; }
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
/* §7 / V1 — the view names itself, under the shell (brand) title that stays. This is now the page-level
   type step: the token block used to top out at the host's 16px card title, so the shell title outranked the
   view it governed and every page read as compressed. The heading is a row, so a view that owns a control
   (Overview's window selector) puts it at the right edge, while the name and its hint sit in their own
   column — the hint on its own line at the metadata step, not sharing the title's line at near-body weight.
   The heading takes the whole row: .rd-split is a *wrapping flex* row (not a grid), so the spanning
   declaration is flex: 0 0 100% — grid-column alone was inert and let the index share the heading's line,
   which pushed the detail into a second row and broke the "tops aligned" geometry. Both are declared so the
   rule survives a change of layout mode. */
[data-plugin-id="research-dashboard"] .rd-view-heading {
  align-items: flex-end;
  display: flex;
  flex: 0 0 100%;
  gap: var(--rd-gap-block);
  grid-column: 1 / -1;
  justify-content: space-between;
}
[data-plugin-id="research-dashboard"] .rd-view-titles {
  display: grid;
  gap: 2px;
  min-width: 0;
}
/* Overview's heading carries the window selector at its right edge: the control belongs to the tab, so it
   sits with the heading that names it rather than in the global toolbar. */
[data-plugin-id="research-dashboard"] .rd-overview-head {
  align-items: flex-end;
}
[data-plugin-id="research-dashboard"] .rd-view-title {
  font-size: var(--rd-title-view);
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
/* The axis's own "More on this axis" fold already carries the detail the compact reading does not need;
   opening it also releases the reading's clamp, so the reader can read the complete state in place. The
   rule is keyed on the fold's own native [open] state and scoped to the row that owns the fold, so a
   collapsed card is byte-identical to before and a row with no fold (the Repositories scan rows, the
   pre-detail fallback) is untouched. No new control, state, hook or fact: textContent is unchanged. */
[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value,
[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value {
  -webkit-line-clamp: unset;
  display: block;
  overflow: visible;
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
/* V1-B/B5 (2026-10-03) — Overview's time-scope control is one segmented track, not a row of peers.
   The four options used to render as four separate outline buttons inside a wrapping .rd-cluster: at a
   glance they read as four independent controls competing with the view heading, and at narrow widths
   they wrapped. The prototype draws one rounded track holding all four options with the pressed one
   lifted on a light face (contract/prototypes/overview.html .window). This restyles that one control —
   the window is Overview's alone (DECISIONS section 13) — and it converges on the same joined-switch
   grammar as .rd-progress-switch rather than inventing a third segmented spelling, which is the drift
   V1 exists to remove. Every hook the harness reads is untouched: the four buttons, their data-rd-window
   value, aria-pressed, the group role and aria-label, the disabled wiring and the .rd-window class all
   stay exactly as they were. */
[data-plugin-id="research-dashboard"] .rd-window {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 0;
  width: fit-content;
  padding: 3px;
  border: var(--rd-edge);
  border-radius: 9px;
  background: var(--muted, #e5e7eb);
}
[data-plugin-id="research-dashboard"] .rd-window [data-rd-window] {
  border: 0;
  border-radius: 6px;
  background: transparent;
  opacity: 0.72;
  padding: 5px 12px;
}
[data-plugin-id="research-dashboard"] .rd-window [aria-pressed="true"] {
  background: var(--card, #fff);
  color: var(--foreground, #171717);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  font-weight: 600;
  opacity: 1;
}
[data-plugin-id="research-dashboard"] .rd-views [aria-pressed="true"] { font-weight: 600; }
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
  flex: 0 0 var(--rd-index-basis);
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
  flex: 0 0 var(--rd-index-basis);
}
/* V1/A5 — this pane is a Card now, like the other three views' detail panes, so its surface comes from the
   shared host grammar rather than from the 1px rule it used to carry on its left edge. That lone rule was
   the whole difference the montage review saw as "visually much flatter / less clearly enclosed": the pane
   was the only detail surface on the page with no card around it.
   Verified by measurement, not by eye: the pane now computes the reference Card's own surface exactly
   (rounded-xl border bg-card shadow-sm, 1px / 14px radius / white).
   The inset is set here rather than by re-nesting the pane in CardHeader + CardContent: the host Card
   itself has padding 0 and takes it from those two, and the reference palette's CardHeader measures
   p-6 = 24px. Wrapping ~430 lines of the pane only to re-indent them would bury the real change, so the
   measured value is stated instead — if the host's Card padding ever moves, this is the one line to move
   with it. */
[data-plugin-id="research-dashboard"] .rd-progress-detail {
  display: grid;
  flex: 1 1 34rem;
  gap: var(--rd-gap-block);
  min-width: 20rem;
  padding: 24px;
  /* V1 Phase-4 ruling (DECISIONS §14.10) — the support band is container-responsive at exactly 720/480.
     The band fills this pane's content box, so the pane is the size query container: its inline-size is
     the band's own width, which is what the ruling's "available" means and what the harness reads. */
  container-type: inline-size;
}
/* V1/A1 — the rd-progress-title rule is gone with the third header path: the pane's title is a CardTitle in
   the shared header now, so this view-local flex wrapper (and its last-child wrap rule) had no caller left. */
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
  /* V1-B/B1 (2026-10-03) — the support band is three columns of one group, not three stacked bands, and
     the montage review read it as "much flatter" than the rest of the page: 12px between columns and a
     4px heading-to-content gap. The prototype separates the three into three cards and tints Human
     steering; the flat version keeps that grouping but needs the gutters and the top step to carry it.
     So: a real column gutter, a slightly larger top step above the group, and a tighter-to-looser gap
     inside each column. The steering tint is added below. */
  /* V1 Phase-4 ruling (DECISIONS §14.10) — the band is container-responsive at exactly 720/480. The
     auto-fit basis this replaced put the second switch at ~471 px: a 3-card band at 471–479 px rendered
     TWO columns while the ruled rule the harness enforces reads "below 480 → one column", a real mismatch
     the record used to explain away. Two exact thresholds cannot both fall out of one equal-gutter
     auto-fit basis (720 = 3·M + 2·g and 480 = 2·M + g would need g = 0), so the layout is written
     explicitly with container queries on the pane (container-type: inline-size above): one column
     below 480; two from 480; three from 720 — each capped at the band's own card count, so a two-card
     band stays two columns and a subject short of material still collapses instead of holding a column
     open (conditional sections natural). Gutter 28px, unchanged. */
  grid-template-columns: minmax(0, 1fr);
  column-gap: 28px;
  row-gap: var(--rd-gap-block);
  padding-top: 14px;
}
@container (min-width: 480px) {
  [data-plugin-id="research-dashboard"] .rd-progress-band:has(> section:nth-of-type(2)) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container (min-width: 720px) {
  [data-plugin-id="research-dashboard"] .rd-progress-band:has(> section:nth-of-type(3)) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
/* Each column reads its eyebrow, then its content, with a real step between them. */
[data-plugin-id="research-dashboard"] .rd-progress-band > section {
  gap: var(--rd-gap);
}
/* Human steering is a different kind of fact from Evidence (a person's constraint, not a document), so it
   is tinted rather than left identical to the column beside it. It does not stretch to the group's full
   height — that would make the tint a heavy block; it hugs its own content. */
[data-plugin-id="research-dashboard"] .rd-progress-band > .rd-progress-steering {
  align-self: start;
  background: var(--muted, rgba(127, 127, 127, 0.05));
  border-radius: 8px;
  padding: 12px 14px;
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
/* V1/A2+A6 — one event-type scale for every rail, in one rule. Two rules used to set this, in this order:
   one to --rd-meta/400, then one to --rd-body/500, so the first was dead code and the survivor left the
   event headline (500) sitting ABOVE the axis's own reading (--rd-claim-value, which carries no weight of
   its own, i.e. 400). The event now sits one step below the claim it reports on — body size, regular weight,
   full foreground so it still reads as the row's headline. This is also why the Problem statement is not
   pushed to a higher weight: the scale tops out at .rd-strong (600), and a fifth weight step is the bloat
   this pass removes. What the review asked for is the relationship, and the relationship is now unambiguous. */
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity .rd-strong,
[data-plugin-id="research-dashboard"] .rd-progress-activity .rd-feed .rd-strong {
  color: var(--foreground, #171717);
  flex: 1 1 100%;
  font-size: var(--rd-body);
  font-weight: 400;
  line-height: 1.45;
  min-width: 0;
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
/* A scoped plan step's marker line. The shared cluster is a wrapping flex row and a step number is a
   block-level meta span, so when a title is long enough the cluster's single flex line breaks and the
   number is left stranded on its own line above the title (short titles fit, which is why the flaw hid).
   Keep the number on the title's first line and let the TITLE take the wrap — the same rule the index
   rows already carry for their status dot — and align the number and the state badge to that first line
   rather than floating them over a two-line title. One rule, shared by the project, workstream and task
   plans. */
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-row { align-items: baseline; }
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-cluster { flex-wrap: nowrap; align-items: baseline; }
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-cluster > .rd-meta { margin-top: 0; }
[data-plugin-id="research-dashboard"] .rd-plan-step .rd-cluster > .rd-strong { min-width: 0; }
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
/* V1/A8 — every problem row is a row, and selection is a layer on top of it. Before this only
   [aria-pressed="true"] had any surface at all: an unselected row was bare text between the rows that
   had one, so the selected row read as the only row that existed rather than as the chosen one.
   The base is the outline .rd-index-item already reserves for itself (1px, transparent until now); the
   selected row adds the fill on top of it.
   A first attempt gave the base the same --muted fill the selected row already used. Measured on the
   rendered page rather than judged by eye, all three rows then computed oklch(0.97 0 0) and the selected
   row kept only its border to say so — the change removed the one property that distinguished selection.
   The palette offers white and --muted and nothing between, so the base takes the outline and the
   selection keeps the fill. */
[data-plugin-id="research-dashboard"] .rd-index-item[data-rd-problem-index] {
  border-color: var(--border);
}
/* …and the selection treatment, on top of that base. */
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
  flex: 0 0 var(--rd-index-basis);
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
     ~320px at 1440. The floor is the rail's OWN share, not a fixed 250px: an absolute 250px floor
     is larger than the rail's 0.6fr share (37.5% of the panel) once the panel narrows below
     ~667px, so at 1280 the panel (~500px) forced the rail up to 250px and the lane down to 244px
     — a real 0.98x, not the 1.25x the composition promises. Capping the floor at min(250px, 37.5%)
     keeps the rail at its natural 0.6fr share in a narrow panel (measured 190px / lane 304px =
     1.60x at 1280) and leaves the 250px floor in force above ~667px, so 1440 is unchanged (the
     floor never exceeds the dominance bound lane ≥ 1.25x rail ⟺ rail ≤ ~44% of the panel). It
     never stacks below the work at desktop widths. */
  grid-template-columns: minmax(0, 1fr) minmax(min(250px, 37.5%), 0.6fr);
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
  gap: var(--rd-gap-rail);
  border-left: var(--rd-rule);
  padding: 0 0 0 12px;
}
[data-plugin-id="research-dashboard"] .rd-side-card {
  display: grid;
  gap: var(--rd-gap-row);
}
/* A rail is a bounded column: its cards must shrink to the rail's width, never push it wider. Without
   this, the nested grid/flex containers inside a side card keep their default min-width: auto, so a
   long entity tag (white-space: nowrap) sets the rail's min-content to the tag's full one-line width,
   the second .rd-detail-grid track is forced open past the viewport, and the page scrolls sideways
   at 1280/1440 with the tag and the event text clipped at the right edge. A tag's own max-width: 100%
   cannot bind while its containing block has grown to fit it, so every link in the chain takes
   min-width: 0: the tag then truncates on its own ellipsis, keeping its full identity on the title
   attribute and data-rd-tag-label, and the rail stays inside its column. Composition and placement are
   unchanged — this is the min-width:0 the Progress rail already carries, applied to the shared side rail. */
[data-plugin-id="research-dashboard"] .rd-side-stack,
[data-plugin-id="research-dashboard"] .rd-side-card,
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity,
[data-plugin-id="research-dashboard"] .rd-side-card .rd-view,
[data-plugin-id="research-dashboard"] .rd-side-card .rd-cluster {
  min-width: 0;
}
/* The rail is context, not a feed — and since activity is a **paged** record now, the page itself bounds
   the rail (five rows at a time, cut at the backend), so the rail no longer clamps a local window: the
   page's own five rows render in full and the pager sits below them. Notes keep their own short window. */
[data-plugin-id="research-dashboard"] .rd-side-card .rd-activity {
  max-height: none;
  overflow: visible;
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

/* ---- Pivot port (2026-10-10): shared work cards, project headings, repo links, context panel, pager ----
   The accepted prototype's composition, built from the existing rd-* token vocabulary and the host's own
   palette (--border/--card/--muted). No new framework, no new colour scale, no chart. */
/* A muted project heading grouping workstreams / work cards — no tree indentation, no enclosing box. */
[data-plugin-id="research-dashboard"] .rd-project-group { margin-top: var(--rd-gap-block); }
[data-plugin-id="research-dashboard"] .rd-project-group + .rd-project-group { margin-top: 24px; }
[data-plugin-id="research-dashboard"] .rd-project-heading {
  align-items: center; display: flex; gap: 8px;
  color: var(--muted-foreground, #5c6270); font-size: var(--rd-body); font-weight: 700;
  margin: 0 0 10px;
}
[data-plugin-id="research-dashboard"] .rd-project-heading::after {
  border-top: var(--rd-edge); content: ""; flex: 1;
}
/* The project intro row: a short description left, right-aligned Open project action. */
[data-plugin-id="research-dashboard"] .rd-project-intro {
  align-items: center; display: flex; gap: 12px; justify-content: space-between;
  margin-bottom: 12px;
}
[data-plugin-id="research-dashboard"] .rd-project-intro p { margin: 0; }
/* A shared workstream card (Projects, People and Repositories all reuse this one surface). */
[data-plugin-id="research-dashboard"] .rd-work-card {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-left: var(--rd-rule);
  border-radius: 8px;
  display: grid;
  gap: var(--rd-gap-tight);
  padding: 12px 14px;
}
[data-plugin-id="research-dashboard"] .rd-work-card + .rd-work-card { margin-top: 12px; }
/* No status-coloured contour: the pivot retired the workstream status outline (and the orange/red
   blocker banner). A blocked workstream reads through its state badge and its recorded counts, exactly
   as an active one does; the blocker's own prose lives in the Progress context, not on this card. */
/* The Projects detail, restructured (2026-10-10): a **native details element** whose summary carries the
   project's title and status; the workstream cards run full width across the body; the project's activity
   is its own collapsible, backend-paged section below. The heading + Dashboard summary sit above the
   split, so the 380px selector rail is never pushed onto a row of its own. */
[data-plugin-id="research-dashboard"] .rd-view-topics { display: grid; gap: var(--rd-gap-block); }
[data-plugin-id="research-dashboard"] .rd-topic-summary {
  align-items: flex-start; cursor: pointer; display: flex; gap: 10px; justify-content: space-between;
  list-style: none; padding-bottom: 10px;
}
[data-plugin-id="research-dashboard"] .rd-topic-summary::-webkit-details-marker { display: none; }
/* The shared disclosure affordance (the prototype's caret): a closed panel reads ▸, an open one ▾, on every
   detail whose header is a native summary — Projects, People and Repositories alike. */
[data-plugin-id="research-dashboard"] .rd-topic-summary::before {
  content: "▸"; display: inline-block; flex: 0 0 12px; font-size: 15px; line-height: 1; width: 12px;
}
[data-plugin-id="research-dashboard"] .rd-topic-detail[open] > .rd-topic-summary::before { content: "▾"; }
/* People and Repositories share the same disclosure: their header (DetailHeader) is the summary's one
   child, so it takes the row and the panel's own padding does the rest. */
[data-plugin-id="research-dashboard"] .rd-topic-summary > .rd-detail-head { flex: 1 1 auto; min-width: 0; }
/* The project summary's title row takes the slack so the title sits beside the caret and the status/last-activity
   cluster stays right — without it the three flex children (caret, title, meta) would centre the title. */
[data-plugin-id="research-dashboard"] .rd-topic-summary > .rd-row { flex: 1 1 auto; min-width: 0; }
[data-plugin-id="research-dashboard"] .rd-topic-summary .rd-detail-head .rd-row { margin: 0; }
[data-plugin-id="research-dashboard"] .rd-topic-summary-meta { align-items: center; display: flex; gap: 8px; }
[data-plugin-id="research-dashboard"] .rd-topic-detail[open] > .rd-topic-summary { border-bottom: var(--rd-edge); }
[data-plugin-id="research-dashboard"] .rd-topic-body { display: grid; gap: var(--rd-gap-block); padding-top: 12px; }
[data-plugin-id="research-dashboard"] .rd-context-tags,
[data-plugin-id="research-dashboard"] .rd-references {
  align-items: baseline; border-top: var(--rd-edge); display: flex; flex-wrap: wrap; gap: 8px;
  padding-top: 10px;
}
[data-plugin-id="research-dashboard"] .rd-topic-controls > summary { cursor: pointer; }
[data-plugin-id="research-dashboard"] .rd-topic-controls[open] > summary { margin-bottom: var(--rd-gap-row); }
[data-plugin-id="research-dashboard"] .rd-work-head {
  align-items: flex-start; display: flex; gap: 10px; justify-content: space-between;
}
[data-plugin-id="research-dashboard"] .rd-work-title { font-size: 15px; font-weight: 640; letter-spacing: -0.01em; margin: 0; }
[data-plugin-id="research-dashboard"] .rd-work-link { color: inherit; text-decoration: none; }
[data-plugin-id="research-dashboard"] .rd-work-link:hover { text-decoration: underline; }
/* The blocked-task count pill: red, matching sibling pills' typography/padding/height. */
[data-plugin-id="research-dashboard"] .rd-blocked-pill,
[data-plugin-id="research-dashboard"] .rd-count[data-rd-state="blocked"] { color: #a12626; background: #fdecec; }
/* The selected workstream's full-context panel (Progress): purpose, reading, blocker, plan. */
[data-plugin-id="research-dashboard"] .rd-context-panel {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-left: 3px solid var(--usable, #3a56a0);
  border-radius: var(--radius-md, 10px);
  display: grid;
  gap: var(--rd-gap-tight);
  padding: 16px 18px;
}
[data-plugin-id="research-dashboard"] .rd-context-body { display: grid; gap: 6px; }
/* The context body is a grid, and a grid item's default min-width: auto is its min-content width — which
   the nowrap evidence line inside the reading paragraph makes the full unwrapped line. The track would then
   widen to fit the whole line and the ellipsis would never bite, pushing the pane past its column instead of
   clamping. A min-width: 0 on the reading cell lets the line clamp to the pane (one line, ellipsised) as the
   density contract intends. Scoped to this body's own claim cells; nothing else moves. */
[data-plugin-id="research-dashboard"] .rd-context-body > .rd-claim-value { min-width: 0; }
[data-plugin-id="research-dashboard"] .rd-context-label {
  color: var(--muted-foreground, #5c6270); font-size: var(--rd-label); font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
}
/* The evidence line (D1/#17/#18): one compact row stating the projection's own recorded evidence, or the
   explicit absence of it. It is a block-level span inside the reading's own paragraph, so it costs a line
   and not a line plus a grid row and gap — the density contract measures the newest activity row against
   the first screen. Clamped to one line so a long evidence set cannot wrap. */
[data-plugin-id="research-dashboard"] .rd-evidence {
  display: block; font-size: var(--rd-meta); line-height: 1.2; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
[data-plugin-id="research-dashboard"] .rd-evidence[data-rd-has-evidence="false"] {
  color: var(--muted-foreground, #5c6270);
}
[data-plugin-id="research-dashboard"] .rd-context-footer {
  align-items: center; border-top: var(--rd-edge); display: flex; gap: 12px;
  justify-content: space-between; margin-top: 6px; padding-top: 10px;
}
/* An optional scoped plan: a bold heading on a rule, steps beneath; absent means absent. */
[data-plugin-id="research-dashboard"] .rd-scoped-plan { border-top: var(--rd-edge); margin-top: 10px; padding-top: 10px; }
[data-plugin-id="research-dashboard"] .rd-scoped-plan > summary { cursor: pointer; font-weight: 700; }
/* A visible task card: title + full statement + status + own plan + links, without opening a row. */
[data-plugin-id="research-dashboard"] .rd-task-card {
  background: var(--card, #fff);
  border: var(--rd-edge);
  border-radius: var(--radius-md, 10px);
  display: grid;
  gap: 8px;
  padding: 14px 16px;
}
[data-plugin-id="research-dashboard"] .rd-task-card + .rd-task-card { margin-top: 12px; }
[data-plugin-id="research-dashboard"] .rd-task-title { font-size: 15px; font-weight: 640; margin: 0; }
[data-plugin-id="research-dashboard"] .rd-task-statement { margin: 0; }
/* Supporting-repository link pairs: internal dashboard name, thin separator, external GitHub ↗. */
[data-plugin-id="research-dashboard"] .rd-repo-pair { align-items: baseline; display: inline-flex; flex-wrap: wrap; gap: 8px; margin-right: 10px; }
[data-plugin-id="research-dashboard"] .rd-repo-pair + .rd-repo-pair { border-left: var(--rd-edge); padding-left: 8px; }
[data-plugin-id="research-dashboard"] .rd-repo-ext { border-left: 1px solid var(--border); padding-left: 8px; white-space: nowrap; }
/* Participants: a quiet inline label beneath a divider. */
[data-plugin-id="research-dashboard"] .rd-participants {
  align-items: baseline; border-top: var(--rd-edge); display: flex; flex-wrap: wrap; gap: 8px;
  margin-top: 12px; padding-top: 12px;
}
/* The pager: the segmented-switch grammar, one numbered control per paged list. */
[data-plugin-id="research-dashboard"] .rd-pager { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; margin-top: 12px; row-gap: 6px; }
[data-plugin-id="research-dashboard"] .rd-pager-switch {
  background: var(--muted, #e5e7eb); border: var(--rd-edge); border-radius: 9px;
  display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px;
}
[data-plugin-id="research-dashboard"] .rd-pager-btn {
  background: transparent; border: 0; border-radius: 6px; color: var(--muted-foreground, #5c6270);
  cursor: pointer; font: inherit; opacity: 0.72; padding: 5px 10px;
}
[data-plugin-id="research-dashboard"] .rd-pager-btn[aria-current="page"] {
  background: var(--card, #fff); color: var(--foreground, #171717);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14); font-weight: 600; opacity: 1;
}
[data-plugin-id="research-dashboard"] .rd-pager-btn:disabled { cursor: default; opacity: 0.35; }
[data-plugin-id="research-dashboard"] .rd-pager-sep { color: var(--muted-foreground, #5c6270); padding: 0 2px; }
/* The rail's per-project list and the visible task list: the shared index grammar, no nesting indent. */
[data-plugin-id="research-dashboard"] .rd-index-group,
[data-plugin-id="research-dashboard"] .rd-task-list { list-style: none; margin: 0; padding: 0; }
/* A grouped stack of shared work cards (People, Repositories): the project group, sparsely spaced. */
[data-plugin-id="research-dashboard"] .rd-work-groups { display: grid; gap: 4px; }
/* The selector-row status dot: colour by state, never the only signal (the state word is always beside it).
   Its default is the muted *foreground* (a mid grey), not the near-white --muted background token — a
   selector row's dot must read at a glance whatever its state. */
[data-plugin-id="research-dashboard"] .rd-status-dot {
  border-radius: 50%; display: inline-block; flex: none; height: 8px; margin-right: 7px; width: 8px;
  background: var(--muted-foreground, #6b7280);
}
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="active"],
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="completed"] { background: #176b4d; }
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="blocked"] { background: #a33f2c; }
[data-plugin-id="research-dashboard"] .rd-status-dot[data-rd-state="parked"] { background: #8a611a; }
/* The dot and its title share one line in every selector row — the dot never wraps onto a line of its own
   above a long title. The title, not the row, takes the wrap. */
[data-plugin-id="research-dashboard"] .rd-index-item > .rd-cluster { flex-wrap: nowrap; }
[data-plugin-id="research-dashboard"] .rd-index-item > .rd-cluster > .rd-strong { min-width: 0; }

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
  function AxisHead({
    axisId,
    kindNote = null,
    onOpenEntity,
    state,
    stateConfidence = null,
    title
  }) {
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-axis-head"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: stateConfidence,
      state
    }), /* @__PURE__ */ React.createElement(EntityTag, {
      compact: true,
      id: axisId,
      label: title,
      onOpen: onOpenEntity,
      type: "axis"
    }), kindNote === null ? null : /* @__PURE__ */ React.createElement("span", {
      className: "rd-axis-kind"
    }, kindNote));
  }
  function AxisRow({
    attrs,
    axisId,
    blocker = null,
    className = "rd-axis",
    disclosure = null,
    kindNote = null,
    onOpenEntity,
    reading = null,
    readingAttrs,
    references = null,
    state,
    stateConfidence = null,
    title
  }) {
    return /* @__PURE__ */ React.createElement("li", {
      className,
      ...attrs ?? {}
    }, /* @__PURE__ */ React.createElement(AxisHead, {
      axisId,
      kindNote,
      onOpenEntity,
      state,
      stateConfidence,
      title
    }), reading === null ? null : /* @__PURE__ */ React.createElement("p", {
      className: "rd-axis-reading",
      ...readingAttrs ?? {}
    }, reading), blocker, references === null ? null : /* @__PURE__ */ React.createElement("div", {
      className: "rd-axis-secondary rd-axis-refs"
    }, references), disclosure);
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
    return /* @__PURE__ */ React.createElement(AxisRow, {
      attrs: { "data-rd-axis-state": axis.state },
      axisId: axis.id,
      blocker: axis.blocker ? /* @__PURE__ */ React.createElement("div", {
        className: "rd-blocker",
        "data-rd-strong": blocked
      }, "Blocker: ", axis.blocker) : null,
      kindNote: axis.kind,
      onOpenEntity,
      reading: axis.currentState ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", {
        className: "rd-claim-value"
      }, axis.currentState), /* @__PURE__ */ React.createElement("span", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "current state"), /* @__PURE__ */ React.createElement(ConfidenceBadge, {
        value: axis.stateConfidence
      }))) : /* @__PURE__ */ React.createElement("span", {
        className: "rd-muted"
      }, "no progress note"),
      references: where || axis.currentState || axis.repositories.length > 0 ? /* @__PURE__ */ React.createElement("span", {
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
      }, where) : null, /* @__PURE__ */ React.createElement(RecencyLabel, {
        at: axis.updatedAt,
        prefix: "· updated "
      })) : null,
      state: axis.state,
      stateConfidence: axis.stateConfidence,
      title: axis.title
    });
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
    const actorIndication = activityActorIndication(item.actorType, person !== null);
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
    }) : null, actorIndication === "person" && person ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: person.id,
      label: person.displayName,
      onOpen: onOpenEntity,
      type: "person"
    }) : actorIndication === "system" && unattributedNote !== null ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted rd-actor",
      "data-rd-actor": "system"
    }, "system") : unattributedNote !== null ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, unattributedNote) : null, item.problemId !== null && problemLabel !== null ? /* @__PURE__ */ React.createElement(EntityTag, {
      id: item.problemId,
      label: problemLabel,
      onOpen: onOpenEntity,
      type: "problem"
    }) : null));
  }
  function ActivityFooter({
    all,
    hidden,
    moreAttr,
    noteAttr,
    onToggle,
    shown,
    total
  }) {
    if (!all && hidden <= 0) {
      return null;
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster",
      ...{ [moreAttr]: String(hidden) }
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      ...{ [noteAttr]: "true" }
    }, all ? `all ${total} shown, newest first` : `${shown} of ${total} shown, newest first`), /* @__PURE__ */ React.createElement(Button, {
      onClick: onToggle,
      size: "sm",
      variant: "ghost"
    }, all ? "Show fewer" : `Show all ${total}`));
  }
  function PagedActivityFeed({
    countAttr,
    dataAttr,
    emptyText,
    labelFor,
    onOpenEntity,
    person = null,
    scope
  }) {
    const [page, setPage] = React.useState(null);
    const [offset, setOffset] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const scopeKey = JSON.stringify(scope);
    const scopeRef = React.useRef(scopeKey);
    React.useEffect(() => {
      if (scopeRef.current !== scopeKey) {
        scopeRef.current = scopeKey;
        setPage(null);
        if (offset !== 0) {
          setOffset(0);
          return;
        }
      }
      let active = true;
      setLoading(true);
      (async () => {
        try {
          const result = await ctx.host.call("list_activity", {
            ...scope,
            offset,
            pageSize: PROGRESS_PAGE_SIZE
          });
          if (active && !ctx.signal.aborted) {
            setPage(result.activityPage ?? null);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [scopeKey, offset]);
    const items = page?.items ?? [];
    const total = page?.total ?? 0;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      "data-rd-activity-shown": items.length,
      ...{ [countAttr]: total },
      ...{ [dataAttr]: total }
    }, items.map((item) => {
      const labels = labelFor?.(item) ?? {};
      return /* @__PURE__ */ React.createElement(ActivityLine, {
        axisLabel: labels.axis ?? null,
        item,
        key: item.id,
        onOpenEntity,
        person,
        problemLabel: labels.problem ?? null,
        repositoryLabel: labels.repository ?? null,
        topicLabel: labels.topic ?? null
      });
    }), !loading && items.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, emptyText) : null), /* @__PURE__ */ React.createElement(Pager, {
      label: "Activity",
      offset,
      onOffset: setOffset,
      pageSize: PROGRESS_PAGE_SIZE,
      total
    }));
  }
  function ViewHeading({ view }) {
    const hint = VIEW_HEADINGS[view];
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-view-heading",
      "data-rd-view-heading": view
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-view-titles"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-view-title",
      "data-rd-view-title": view
    }, VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view), hint ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, hint) : null));
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
  function Pager({
    label,
    offset,
    pageSize,
    total,
    onOffset
  }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(0, Math.floor(offset / pageSize)), pages - 1);
    const from = total === 0 ? 0 : page * pageSize + 1;
    const to = Math.min((page + 1) * pageSize, total);
    const go = (next) => onOffset(next * pageSize);
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-pager",
      "data-rd-pager": label
    }, pages > 1 ? /* @__PURE__ */ React.createElement("div", {
      "aria-label": `${label} pages`,
      className: "rd-pager-switch",
      role: "group"
    }, /* @__PURE__ */ React.createElement("button", {
      className: "rd-pager-btn",
      disabled: page === 0,
      onClick: () => go(page - 1),
      type: "button"
    }, "Previous"), Array.from({ length: pages }).map((_, index) => {
      if (index === 0 || index === pages - 1 || Math.abs(index - page) <= 1) {
        return /* @__PURE__ */ React.createElement("button", {
          "aria-current": index === page ? "page" : undefined,
          className: "rd-pager-btn",
          key: index,
          onClick: () => go(index),
          type: "button"
        }, index + 1);
      }
      if (index === page - 2 || index === page + 2) {
        return /* @__PURE__ */ React.createElement("span", {
          "aria-hidden": "true",
          className: "rd-pager-sep",
          key: `sep-${index}`
        }, "…");
      }
      return null;
    }), /* @__PURE__ */ React.createElement("button", {
      className: "rd-pager-btn",
      disabled: page === pages - 1,
      onClick: () => go(page + 1),
      type: "button"
    }, "Next")) : /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-pager-range": `${from}-${to}`
    }, total === 0 ? "No entries" : `${from}–${to} of ${total} available`));
  }
  function ScopedPlan({ label, plan }) {
    if (!plan || plan.steps.length === 0) {
      return null;
    }
    return /* @__PURE__ */ React.createElement("details", {
      className: "rd-scoped-plan",
      open: true
    }, /* @__PURE__ */ React.createElement("summary", null, label), plan.plan.summary ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta"
    }, plan.plan.summary) : null, /* @__PURE__ */ React.createElement("ol", {
      className: "rd-plan-steps",
      "data-rd-scoped-plan-steps": plan.steps.length
    }, plan.steps.map((step) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-plan-step",
      "data-rd-scoped-plan-step": step.id,
      "data-rd-scoped-plan-position": step.position === null ? "" : String(step.position),
      key: step.id
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, step.position === null ? null : /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `${step.position}.`), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, step.title)), /* @__PURE__ */ React.createElement(StateBadge, {
      kind: "stored",
      state: step.state
    }))))));
  }
  function RepoLinkPair({
    repository,
    onOpen
  }) {
    return /* @__PURE__ */ React.createElement("span", {
      className: "rd-repo-pair",
      "data-rd-repo-pair": repository.id
    }, /* @__PURE__ */ React.createElement(EntityTag, {
      id: repository.id,
      label: repository.fullName,
      onOpen,
      type: "repository"
    }), repository.url ? /* @__PURE__ */ React.createElement("a", {
      "aria-label": `Open ${repository.fullName} on GitHub`,
      className: "rd-repo-ext",
      "data-rd-repo-ext": repository.id,
      href: repository.url,
      rel: "noopener noreferrer",
      target: "_blank",
      title: `Open ${repository.fullName} on GitHub`
    }, "GitHub ↗") : null);
  }
  function Participants({
    onOpen,
    people
  }) {
    if (people.length === 0) {
      return null;
    }
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-participants",
      "data-rd-participants": people.length
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "Participants ·"), people.map((person) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: person.id,
      key: person.id,
      label: person.displayName,
      onOpen,
      type: "person"
    })));
  }
  function WorkstreamCard({
    axis,
    onOpenEntity,
    onOpenWorkstream
  }) {
    const summary = axis.description || axis.currentState || "";
    return /* @__PURE__ */ React.createElement("article", {
      className: "rd-work-card",
      "data-rd-state": axis.state,
      "data-rd-work-card": axis.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-work-head"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-work-title"
    }, /* @__PURE__ */ React.createElement("a", {
      className: "rd-work-link",
      "data-rd-work-link": axis.id,
      href: `#/progress/${axis.id}`,
      onClick: (event) => {
        event.preventDefault();
        onOpenWorkstream(axis.id);
      }
    }, axis.title)), /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: axis.stateConfidence,
      state: axis.state
    })), summary ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta",
      "data-rd-work-summary": "true"
    }, summary) : null, axis.latestEvent ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta",
      "data-rd-work-event": "true"
    }, /* @__PURE__ */ React.createElement(EventDate, {
      at: axis.latestEvent.at
    }), " | ", axis.latestEvent.summary) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags"
    }, typeof axis.openTasks === "number" ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-count"
    }, countLabel(axis.openTasks, "open task", "open tasks")) : null, typeof axis.blockedTasks === "number" && axis.blockedTasks > 0 ? /* @__PURE__ */ React.createElement("span", {
      className: "rd-count rd-blocked-pill",
      "data-rd-state": "blocked"
    }, countLabel(axis.blockedTasks, "blocked", "blocked")) : null, axis.repositories.map((repository) => /* @__PURE__ */ React.createElement(RepoLinkPair, {
      key: repository.id,
      onOpen: onOpenEntity,
      repository
    }))));
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
  function WorkstreamCorrection({
    axis,
    busy,
    conflict,
    correction,
    onCorrection,
    onReload,
    onSave
  }) {
    return /* @__PURE__ */ React.createElement("div", {
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
    }, "This workstream changed since you opened it."), /* @__PURE__ */ React.createElement("span", {
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
    }, "Saved against v", axis.version, "; a change made since then comes back as a conflict instead of overwriting it.")));
  }
  function involvementLine(entry) {
    const parts = [];
    if (entry.axisCounts.active > 0) {
      parts.push(`${entry.axisCounts.active} active`);
    }
    if (entry.axisCounts.blocked > 0) {
      parts.push(`${entry.axisCounts.blocked} blocked`);
    }
    parts.push(countLabel(entry.axes.length, "workstream", "workstreams"));
    parts.push(countLabel(entry.topics.length, "project", "projects"));
    return parts.join(" · ");
  }
  function supportsLine(entry) {
    const current = entry.axes.filter((axis) => !isTerminalAxis(axis.state)).length;
    const topics = entry.topics.length === 0 ? "no project names it" : `supports ${countLabel(entry.topics.length, "project", "projects")}`;
    return `${topics} · ${current === 0 ? "no current workstream" : countLabel(current, "current workstream", "current workstreams")}`;
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
  function PersonPanel({
    entry,
    onOpenEntity,
    windowDays
  }) {
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
    return /* @__PURE__ */ React.createElement("details", {
      className: "rd-panel rd-topic-detail",
      "data-rd-detail-header": "true",
      "data-rd-detail-mode": "disclosure",
      "data-rd-person-panel": entry.person.displayName,
      open: true
    }, /* @__PURE__ */ React.createElement("summary", {
      className: "rd-topic-summary"
    }, /* @__PURE__ */ React.createElement(DetailHeader, {
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
    }, involvementLine(entry)))), /* @__PURE__ */ React.createElement("div", {
      className: "rd-topic-body"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-grid",
      "data-rd-person-split": "true"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-current-work",
      "data-rd-person-lane": "current"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Involvement"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-work-groups",
      "data-rd-person-topics": entry.topics.length
    }, entry.topics.map((involvement) => /* @__PURE__ */ React.createElement("section", {
      className: "rd-project-group",
      "data-rd-involvement": involvement.topic.name,
      key: involvement.topic.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-project-heading"
    }, involvement.topic.name), /* @__PURE__ */ React.createElement("div", {
      className: "rd-project-intro"
    }, /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta"
    }, involvement.role ? `${involvement.topic.status} · ${involvement.role}` : involvement.topic.status), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => onOpenEntity("topic", involvement.topic.id),
      size: "sm",
      variant: "outline"
    }, "Open project →")), involvement.axes.length === 0 ? /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "no workstream of theirs here") : [
      ...involvement.axes.filter((axis) => !isTerminalAxis(axis.state)),
      ...involvement.axes.filter((axis) => isTerminalAxis(axis.state))
    ].map((axis) => /* @__PURE__ */ React.createElement(WorkstreamCard, {
      axis: {
        id: axis.id,
        repositories: axis.repositories,
        state: axis.state,
        stateConfidence: axis.stateConfidence,
        title: axis.title
      },
      key: axis.id,
      onOpenEntity,
      onOpenWorkstream: (axisId) => onOpenEntity("axis", axisId)
    })))), entry.topics.length === 0 ? /* @__PURE__ */ React.createElement(Notice, {
      kind: "empty"
    }, "Not linked to a topic yet — the link is what puts work on this page.") : null)), /* @__PURE__ */ React.createElement("aside", {
      className: "rd-side-stack",
      "data-rd-person-rail": "true"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Recent activity"), entry.attributable ? /* @__PURE__ */ React.createElement(PagedActivityFeed, {
      countAttr: "data-rd-person-activity-total",
      dataAttr: "data-rd-person-activity",
      emptyText: "No attributable activity recorded yet.",
      key: entry.person.id,
      labelFor: (item) => ({
        topic: entry.topics.find((involvement) => involvement.topic.id === item.topicId)?.topic.name ?? null
      }),
      onOpenEntity,
      person: {
        displayName: entry.person.displayName,
        id: entry.person.id
      },
      scope: { personActorId: entry.person.nakamaUserId ?? undefined }
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
      className: "rd-strong"
    }, entry.person.displayName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-context": "true"
    }, involvementLine(entry), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-person-recency": entry.attributable ? entry.lastActivityAt ?? "none" : "unattributable"
    }, entry.attributable ? entry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: entry.lastActivityAt,
      prefix: "last activity "
    }) : "nothing attributed yet" : "no account mapped")))))), selected ? /* @__PURE__ */ React.createElement(PersonPanel, {
      entry: selected,
      onOpenEntity,
      windowDays
    }) : null);
  }
  function DashboardSummary({ overview }) {
    const figure = (n) => overview && typeof n === "number" ? String(n) : "—";
    const stats = [
      { label: "Projects", value: figure(overview?.counts.topics) },
      { label: "Workstreams", value: figure(overview?.counts.axes) },
      { label: "Open tasks", value: figure(overview?.problemsByState.open) },
      { label: "Blocked tasks", value: figure(overview?.problemsByState.blocked) },
      { label: "Repositories", value: figure(overview?.counts.repositories) },
      { label: "People", value: figure(overview?.counts.people) }
    ];
    return /* @__PURE__ */ React.createElement("details", {
      className: "rd-panel rd-dashboard-summary",
      "data-rd-dashboard-summary": overview ? "ready" : "loading"
    }, /* @__PURE__ */ React.createElement("summary", null, "Dashboard summary"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-stat-grid"
    }, stats.map((stat) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-stat",
      key: stat.label
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-stat-value"
    }, stat.value), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, stat.label)))));
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
    React.useEffect(() => {
      if (preselect) {
        setSelectedId(preselect.id);
      }
    }, [preselect?.id, preselect?.seq]);
    const selected = repositories.find((entry) => entry.repository.id === selectedId) ?? repositories[0] ?? null;
    const repositoryGroups = [];
    {
      const byTopic = new Map;
      for (const axis of selected?.axes ?? []) {
        const name = selected?.topics.find((link) => link.topic.id === axis.topicId)?.topic.name ?? "Unrecorded project";
        let at = byTopic.get(axis.topicId);
        if (at === undefined) {
          at = repositoryGroups.length;
          byTopic.set(axis.topicId, at);
          repositoryGroups.push({ topic: { id: axis.topicId, name }, axes: [] });
        }
        repositoryGroups[at].axes.push(axis);
      }
      for (const group of repositoryGroups) {
        group.axes = [
          ...group.axes.filter((axis) => !isTerminalAxis(axis.state)),
          ...group.axes.filter((axis) => isTerminalAxis(axis.state))
        ];
      }
    }
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
      className: "rd-strong"
    }, entry.repository.fullName), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-repository-line": "true"
    }, supportsLine(entry), " · ", /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: entry.lastActivityAt
    })))))), selected ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-panel rd-topic-detail",
      "data-rd-detail-header": "true",
      "data-rd-detail-mode": "disclosure",
      "data-rd-repository-panel": selected.repository.fullName,
      open: true
    }, /* @__PURE__ */ React.createElement("summary", {
      className: "rd-topic-summary"
    }, /* @__PURE__ */ React.createElement(DetailHeader, {
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
      })), selected.axes.length > 0 ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta"
      }, countLabel(selected.axes.length, "workstream", "workstreams")) : null) : null,
      title: /* @__PURE__ */ React.createElement(CardTitle, null, selected.repository.fullName)
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-repository-description": "true"
    }, selected.repository.description || "no description recorded"), /* @__PURE__ */ React.createElement("div", {
      className: "rd-context-footer"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-repository-branch": "true"
    }, selected.repository.defaultBranch ? `Default branch · ${selected.repository.defaultBranch}` : "Default branch · not recorded"), selected.repository.url ? /* @__PURE__ */ React.createElement("a", {
      "aria-label": `Open ${selected.repository.fullName} on GitHub`,
      className: "rd-repo-ext",
      "data-rd-repository-url": "true",
      href: selected.repository.url,
      rel: "noopener noreferrer",
      target: "_blank",
      title: `Open ${selected.repository.fullName} on GitHub`
    }, "GitHub ↗") : null))), /* @__PURE__ */ React.createElement("div", {
      className: "rd-topic-body"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-grid",
      "data-rd-repository-split": "true"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-current-work",
      "data-rd-repository-current": selected.axes.length,
      "data-rd-repository-lane": "current"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, "Current work"), selected.axes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No workstream names this repository yet.") : /* @__PURE__ */ React.createElement("div", {
      "data-rd-repository-axes": selected.axes.length
    }, repositoryGroups.map((group) => /* @__PURE__ */ React.createElement("section", {
      className: "rd-project-group",
      key: group.topic.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-project-heading"
    }, group.topic.name), /* @__PURE__ */ React.createElement("div", {
      className: "rd-project-intro"
    }, /* @__PURE__ */ React.createElement("p", {
      className: "rd-meta"
    }, "Workstreams this repository supports."), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => onOpenEntity("topic", group.topic.id),
      size: "sm",
      variant: "outline"
    }, "Open project →")), group.axes.map((axis) => /* @__PURE__ */ React.createElement(WorkstreamCard, {
      axis: {
        id: axis.id,
        repositories: axis.repositories,
        state: axis.state,
        stateConfidence: axis.stateConfidence,
        title: axis.title
      },
      key: axis.id,
      onOpenEntity,
      onOpenWorkstream: (axisId) => onOpenEntity("axis", axisId)
    })))))), /* @__PURE__ */ React.createElement("aside", {
      className: "rd-side-stack"
    }, /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Recent activity"), /* @__PURE__ */ React.createElement(PagedActivityFeed, {
      countAttr: "data-rd-repository-activity",
      dataAttr: "data-rd-repository-activity-list",
      emptyText: "No repository-scoped events in this snapshot.",
      key: selected.repository.id,
      labelFor: (item) => ({
        axis: selected.axes.find((axis) => axis.id === item.axisId)?.title ?? null,
        topic: selected.topics.find((link) => link.topic.id === item.topicId)?.topic.name ?? null
      }),
      onOpenEntity,
      scope: { repositoryId: selected.repository.id }
    })), /* @__PURE__ */ React.createElement("section", {
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
  function ProgressView({
    activityOffset,
    activityPage,
    busy,
    conflict,
    correction,
    loading,
    onActivityOffset,
    onCorrection,
    onOpenEntity,
    onReloadCorrection,
    onSaveCorrection,
    onSelectWorkstream,
    onTaskOffset,
    progress,
    selection,
    taskOffset,
    taskPage,
    workstream
  }) {
    const axisRows = progress?.axes.axes ?? [];
    const groups = [];
    const groupAt = new Map;
    for (const row of axisRows) {
      const at = groupAt.get(row.topicId);
      if (at === undefined) {
        groupAt.set(row.topicId, groups.length);
        groups.push({ name: row.topicName, rows: [row] });
      } else {
        groups[at].rows.push(row);
      }
    }
    const axis = workstream?.axis ?? null;
    const tasks = axis?.problems ?? [];
    const taskTotal = taskPage ? taskPage.total : tasks.length;
    const taskShown = taskPage ? taskPage.items : tasks.slice(taskOffset, taskOffset + PROGRESS_PAGE_SIZE);
    const activityAll = axis?.history ?? [];
    const activityItems = activityPage ? activityPage.items : activityAll.slice(activityOffset, activityOffset + PROGRESS_PAGE_SIZE);
    const activityTotal = activityPage ? activityPage.total : activityAll.length;
    const axisRepositories = axis?.repositories ?? [];
    const evidence = axis?.evidence ?? [];
    const evidenceText = evidence.length > 0 ? `Evidence: ${evidence.slice(0, 3).map((item) => item.by ? `${item.label} (${item.by})` : item.label).join(" · ")}${evidence.length > 3 ? " + more recorded evidence" : ""}` : "No evidence on record — a 'confirmed' reading needs evidence";
    const correcting = correction != null && correction.axisId === axis?.id;
    const projectName = workstream?.topic.name ?? groups.find((group) => group.rows.some((row) => row.id === selection?.axisId))?.name ?? "Not recorded";
    return /* @__PURE__ */ React.createElement("div", {
      className: "rd-stack",
      "data-rd-view": "progress"
    }, /* @__PURE__ */ React.createElement(ViewHeading, {
      view: "progress"
    }), /* @__PURE__ */ React.createElement("div", {
      className: "rd-split rd-progress-top",
      "data-rd-progress-top": "true"
    }, /* @__PURE__ */ React.createElement("ul", {
      className: "rd-index rd-progress-index",
      "data-rd-progress-index": "true",
      "data-rd-progress-index-rows": axisRows.length,
      "data-rd-progress-index-window": progress?.axes.activitySinceDays ?? 0
    }, groups.map((group) => /* @__PURE__ */ React.createElement("li", {
      className: "rd-project-group",
      key: group.rows[0]?.topicId ?? group.name
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-project-heading"
    }, group.name), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-index-list"
    }, group.rows.map((row) => /* @__PURE__ */ React.createElement("li", {
      key: row.id
    }, /* @__PURE__ */ React.createElement("button", {
      "aria-pressed": selection?.axisId === row.id,
      className: "rd-index-item",
      "data-rd-index-axis": row.id,
      "data-rd-index-open-problems": row.openProblems,
      "data-rd-index-problems": row.problems,
      "data-rd-index-recency": row.recencyAt ?? "",
      "data-rd-index-state": row.state,
      "data-rd-index-topic": row.topicName,
      onClick: () => onSelectWorkstream(row.topicId, row.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement("span", {
      "aria-hidden": "true",
      className: "rd-status-dot",
      "data-rd-state": row.state
    }), /* @__PURE__ */ React.createElement("span", {
      className: "rd-strong"
    }, row.title)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: row.stateConfidence,
      state: row.state
    }), ` · ${countLabel(row.openProblems, "open task", "open tasks")}`, row.plan ? "" : " · No plan", row.recencyAt ? ` · ${describeAge(row.recencyAt)}` : ""))))))), axisRows.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted",
      "data-rd-progress-index-empty": "true"
    }, "No workstreams yet.") : null), /* @__PURE__ */ React.createElement("div", {
      className: "rd-progress-detail",
      "data-rd-progress-detail": "true",
      "data-rd-progress-detail-axis": selection?.axisId ?? ""
    }, !selection ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-empty": "true"
    }, "Select a workstream to read its context, scoped plan and tasks.") : null, selection && !axis && loading ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-loading": "true"
    }, "Loading this workstream…") : null, selection && axis ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("section", {
      className: "rd-context-panel",
      "data-rd-context-panel": axis.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-work-head"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-work-title",
      "data-rd-progress-detail-title": "true"
    }, axis.title), /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: axis.stateConfidence,
      state: axis.state
    })), /* @__PURE__ */ React.createElement("div", {
      className: "rd-context-body"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Purpose"), /* @__PURE__ */ React.createElement("p", {
      className: "rd-claim-value",
      "data-rd-axis-description": "true"
    }, axis.description ? axis.description : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No workstream purpose recorded.")), /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Current reading"), /* @__PURE__ */ React.createElement("p", {
      className: "rd-claim-value",
      "data-rd-axis-reading": "true"
    }, axis.currentState ? /* @__PURE__ */ React.createElement(React.Fragment, null, axis.currentState, /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.currentStateConfidence
    })) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No current reading recorded."), /* @__PURE__ */ React.createElement("span", {
      className: "rd-evidence",
      "data-rd-axis-evidence": evidence.length,
      "data-rd-has-evidence": evidence.length > 0,
      title: evidenceText
    }, evidenceText)), axis.blocker ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Blocker"), /* @__PURE__ */ React.createElement("p", {
      className: "rd-claim-value",
      "data-rd-axis-blocker": "true"
    }, axis.blocker, /* @__PURE__ */ React.createElement(ConfidenceBadge, {
      value: axis.blockerConfidence
    }))) : null), /* @__PURE__ */ React.createElement(ScopedPlan, {
      label: "Workstream plan",
      plan: axis.plan ?? null
    }), axisRepositories.length > 0 ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags",
      "data-rd-context-repositories": axisRepositories.length
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "Supporting repositories ·"), axisRepositories.map((repository) => /* @__PURE__ */ React.createElement(RepoLinkPair, {
      key: repository.id,
      onOpen: onOpenEntity,
      repository
    }))) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-context-footer"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, `Project · ${projectName}`), /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster"
    }, /* @__PURE__ */ React.createElement(Button, {
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
    }, correcting ? "Cancel" : "Correct"), /* @__PURE__ */ React.createElement(Button, {
      "data-rd-return-project": workstream?.topic.id ?? selection.topicId,
      onClick: () => onOpenEntity("topic", workstream?.topic.id ?? selection.topicId),
      size: "sm",
      variant: "outline"
    }, "Return to project →")))), correcting && correction ? /* @__PURE__ */ React.createElement(WorkstreamCorrection, {
      axis,
      busy,
      conflict,
      correction,
      onCorrection,
      onReload: onReloadCorrection,
      onSave: onSaveCorrection
    }) : null, /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-tasks",
      "data-rd-progress-tasks": taskTotal
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-row"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-section"
    }, `Tasks (${taskTotal})`)), taskTotal === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-tasks-empty": "true"
    }, "No tasks recorded for this workstream.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-task-list"
    }, taskShown.map((task) => /* @__PURE__ */ React.createElement("article", {
      className: "rd-task-card",
      "data-rd-task-card": task.id,
      "data-rd-task-state": task.state,
      key: task.id
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-work-head"
    }, /* @__PURE__ */ React.createElement("h4", {
      className: "rd-task-title"
    }, task.title || task.statement), /* @__PURE__ */ React.createElement(StateBadge, {
      confidence: task.stateConfidence,
      state: task.state
    })), task.title && task.title !== task.statement ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-task-statement"
    }, task.statement) : null, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta",
      "data-rd-task-facts": "true"
    }, task.authorType === "human" ? "owner-authored" : "librarian-inferred", task.planStepTitle ? ` · step: ${task.planStepTitle}` : ""), /* @__PURE__ */ React.createElement(ScopedPlan, {
      label: "Task plan",
      plan: task.plan
    }), task.repositories.length > 0 ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-cluster rd-tags"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, "Supporting repositories ·"), task.repositories.map((repository) => /* @__PURE__ */ React.createElement(RepoLinkPair, {
      key: repository.id,
      onOpen: onOpenEntity,
      repository
    }))) : null, /* @__PURE__ */ React.createElement(Participants, {
      onOpen: onOpenEntity,
      people: task.people
    })))), /* @__PURE__ */ React.createElement(Pager, {
      label: "Tasks",
      offset: taskOffset,
      onOffset: onTaskOffset,
      pageSize: PROGRESS_PAGE_SIZE,
      total: taskTotal
    }))), /* @__PURE__ */ React.createElement("section", {
      className: "rd-progress-activity",
      "data-rd-progress-activity-total": activityTotal
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Recent activity"), activityItems.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted",
      "data-rd-progress-feed-empty": "true"
    }, "Nothing recorded against this workstream.") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-feed",
      "data-rd-progress-feed": activityTotal
    }, activityItems.map((item) => /* @__PURE__ */ React.createElement(ActivityLine, {
      attrs: { "data-rd-feed-event": item.id },
      item,
      key: item.id,
      onOpenEntity,
      topicLabel: workstream?.topic.name ?? null,
      unattributedNote: "no account attributed"
    }))), activityTotal > 0 ? /* @__PURE__ */ React.createElement(Pager, {
      label: "Activity",
      offset: activityOffset,
      onOffset: onActivityOffset,
      pageSize: PROGRESS_PAGE_SIZE,
      total: activityTotal
    }) : null)) : null)));
  }
  function ResearchPage() {
    const [loadedOverview, setOverview] = React.useState(null);
    const [loadedScope, setLoadedScope] = React.useState(null);
    const [view, setView] = React.useState("topics");
    const [entityTarget, setEntityTarget] = React.useState(null);
    function openEntity(type, id) {
      setEntityTarget({ id, seq: (entityTarget?.seq ?? 0) + 1, type });
      setView(ENTITY_VIEW[type]);
    }
    const [expandedId, setExpandedId] = React.useState(null);
    React.useEffect(() => {
      if (entityTarget?.type === "topic") {
        setExpandedId(entityTarget.id);
      }
    }, [entityTarget?.id, entityTarget?.seq, entityTarget?.type]);
    const [detail, setDetail] = React.useState(null);
    const [topicActivityPage, setTopicActivityPage] = React.useState(null);
    const [topicActivityOffset, setTopicActivityOffset] = React.useState(0);
    const [progress, setProgress] = React.useState(null);
    const [progressSelection, setProgressSelection] = React.useState(null);
    const [workstream, setWorkstream] = React.useState(null);
    const [workstreamActivity, setWorkstreamActivity] = React.useState(null);
    const [workstreamTask, setWorkstreamTask] = React.useState(null);
    const [workstreamLoading, setWorkstreamLoading] = React.useState(false);
    const [taskOffset, setTaskOffset] = React.useState(0);
    const [activityOffset, setActivityOffset] = React.useState(0);
    const [correction, setCorrection] = React.useState(null);
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
          if (options?.isStale?.()) {
            return null;
          }
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
        if (!ctx.signal.aborted && !options?.isStale?.()) {
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
    const workstreamSeq = React.useRef(0);
    const detailSeq = React.useRef(0);
    const scopeWindow = 0;
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
      if (progressSelection) {
        loadWorkstream(progressSelection, taskOffset, activityOffset);
      }
      return load(scopeWindow);
    }
    async function loadWorkstream(selection, nextTaskOffset, nextActivityOffset) {
      const seq = ++workstreamSeq.current;
      const stale = () => workstreamSeq.current !== seq;
      setWorkstreamLoading(true);
      const scope = {
        axisId: selection.axisId,
        pageSize: PROGRESS_PAGE_SIZE,
        topicId: selection.topicId
      };
      const [taskResult, activityResult] = await Promise.all([
        call("get_topic", { ...scope, offset: nextTaskOffset }, { isStale: stale }),
        call("get_topic", { ...scope, offset: nextActivityOffset }, { isStale: stale })
      ]);
      if (ctx.signal.aborted) {
        return null;
      }
      if (stale()) {
        return null;
      }
      setWorkstreamLoading(false);
      const result = taskResult ?? activityResult;
      if (!result) {
        return null;
      }
      const axis = result.axis ?? (result.axes ?? []).find((candidate) => candidate.id === selection.axisId) ?? null;
      setWorkstream(axis ? {
        axis,
        axisId: selection.axisId,
        topic: result.topic ?? {
          id: selection.topicId,
          name: "",
          status: ""
        }
      } : null);
      setWorkstreamTask(taskResult?.problemPage ?? null);
      setWorkstreamActivity(activityResult?.activityPage ?? null);
      return axis;
    }
    function selectWorkstream(topicId, axisId) {
      const next = { axisId, topicId };
      setProgressSelection(next);
      setTaskOffset(0);
      setActivityOffset(0);
      setCorrection(null);
      setConflict(null);
      setWorkstream(null);
      setWorkstreamTask(null);
      setWorkstreamActivity(null);
      loadWorkstream(next, 0, 0);
    }
    const problemFocusRef = React.useRef(null);
    React.useEffect(() => {
      if (!entityTarget || entityTarget.type !== "axis" && entityTarget.type !== "problem") {
        return;
      }
      const rows = visibleProgress?.axes.axes ?? [];
      const problems = visibleProgress?.problems.problems ?? [];
      if (entityTarget.type === "axis") {
        const row = rows.find((candidate) => candidate.id === entityTarget.id);
        const topicId = row?.topicId ?? rows[0]?.topicId;
        if (topicId) {
          problemFocusRef.current = null;
          selectWorkstream(topicId, entityTarget.id);
        }
        return;
      }
      const problem = problems.find((candidate) => candidate.id === entityTarget.id);
      if (problem) {
        problemFocusRef.current = entityTarget.id;
        selectWorkstream(problem.topicId, problem.axisId);
      }
    }, [entityTarget?.id, entityTarget?.seq, visibleProgress]);
    React.useEffect(() => {
      const focus = problemFocusRef.current;
      if (!focus || !workstream || !progressSelection) {
        return;
      }
      const tasks = workstream.axis.problems ?? [];
      const at = tasks.findIndex((task) => task.id === focus);
      problemFocusRef.current = null;
      if (at >= 0) {
        const next = Math.floor(at / PROGRESS_PAGE_SIZE) * PROGRESS_PAGE_SIZE;
        setTaskOffset(next);
        loadWorkstream(progressSelection, next, activityOffset);
      }
    }, [workstream]);
    React.useEffect(() => {
      load(scopeWindow);
    }, [scopeWindow]);
    async function loadDetail(topicId, offset = 0) {
      const seq = ++detailSeq.current;
      const stale = () => detailSeq.current !== seq;
      const result = await call("get_topic", { offset, pageSize: PROGRESS_PAGE_SIZE, topicId }, { isStale: stale });
      if (ctx.signal.aborted || stale()) {
        return;
      }
      if (result) {
        setDetail(result);
        setTopicActivityPage(result.activityPage ?? null);
      }
    }
    React.useEffect(() => {
      setCorrection(null);
      setTopicNote("");
      setConflict(null);
      if (!expandedId) {
        setDetail(null);
        setTopicActivityPage(null);
        setTopicActivityOffset(0);
        return;
      }
      setTopicActivityOffset(0);
      loadDetail(expandedId, 0);
    }, [expandedId]);
    function selectTopicActivityOffset(next) {
      setTopicActivityOffset(next);
      if (expandedId) {
        loadDetail(expandedId, next);
      }
    }
    function selectTopic(topicId) {
      if (topicId === expandedId) {
        return;
      }
      setExpandedId(topicId);
      setDetail(null);
      setConflict(null);
    }
    async function saveWorkstreamCorrection() {
      if (!(workstream && correction)) {
        return;
      }
      const axis = workstream.axis;
      if (axis.id !== correction.axisId) {
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
        topicId: workstream.topic.id,
        ...note ? { annotations: [{ axisId: axis.id, text: note }] } : {}
      }, { conflictAxisId: correction.axisId });
      if (result) {
        setCorrection(null);
        setConflict(null);
        await reloadCurrent();
      }
    }
    async function reloadWorkstreamCorrection() {
      if (!progressSelection) {
        return;
      }
      const fresh = await loadWorkstream(progressSelection, taskOffset, activityOffset);
      if (ctx.signal.aborted) {
        return;
      }
      setConflict(null);
      if (fresh) {
        setCorrection((current) => current && current.axisId === fresh.id ? draftFrom(fresh, current.note) : current);
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
    const topicActivityItems = topicActivityPage?.items ?? [];
    const topicActivityTotal = topicActivityPage?.total ?? 0;
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
    }, error) : null, view === "topics" ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-view-topics",
      "data-rd-view": "topics"
    }, /* @__PURE__ */ React.createElement(ViewHeading, {
      view: "topics"
    }), /* @__PURE__ */ React.createElement(DashboardSummary, {
      overview
    }), /* @__PURE__ */ React.createElement("div", {
      className: "rd-split"
    }, /* @__PURE__ */ React.createElement("ul", {
      "aria-label": "Projects",
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
        className: "rd-strong"
      }, entry.topic.name), /* @__PURE__ */ React.createElement("span", {
        className: "rd-cluster"
      }, /* @__PURE__ */ React.createElement("span", {
        className: "rd-meta",
        "data-rd-index-current": currentCount
      }, countLabel(currentCount, "workstream", "workstreams")), entry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
        at: entry.lastActivityAt
      }) : null, isStale ? /* @__PURE__ */ React.createElement("span", {
        className: "rd-count",
        "data-rd-index-stale": "true"
      }, "Stale") : null)));
    })), selectedEntry ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-panel rd-topic-detail",
      "data-rd-detail": selectedEntry.topic.name,
      "data-rd-detail-header": "true",
      "data-rd-detail-mode": "disclosure",
      open: true
    }, /* @__PURE__ */ React.createElement("summary", {
      className: "rd-topic-summary"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-row rd-detail-title-row"
    }, /* @__PURE__ */ React.createElement(CardTitle, null, selectedEntry.topic.name)), /* @__PURE__ */ React.createElement("span", {
      className: "rd-cluster rd-topic-summary-meta"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, selectedEntry.topic.status), selectedEntry.lastActivityAt ? /* @__PURE__ */ React.createElement(RecencyLabel, {
      at: selectedEntry.lastActivityAt,
      prefix: "last activity "
    }) : null)), /* @__PURE__ */ React.createElement("div", {
      className: "rd-topic-body"
    }, selectedDetails ? /* @__PURE__ */ React.createElement("div", {
      className: "rd-detail-claims"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "rd-claim rd-claim-summary"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Summary"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-value",
      "data-rd-claim": "summary"
    }, selectedDetails.topic.summary || /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No summary recorded."))), /* @__PURE__ */ React.createElement("div", {
      className: "rd-claim",
      "data-rd-description-field": "true"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Description"), /* @__PURE__ */ React.createElement("span", {
      className: "rd-claim-value",
      "data-rd-claim": "description"
    }, selectedDetails.topic.description || /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No description recorded.")))) : null, /* @__PURE__ */ React.createElement("div", {
      className: "rd-context-tags",
      "data-rd-detail-context": "true"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Participants"), (selectedDetails?.people ?? selectedEntry.people).length > 0 ? (selectedDetails?.people ?? selectedEntry.people).map((person) => /* @__PURE__ */ React.createElement(EntityTag, {
      id: person.id,
      key: person.id,
      label: person.displayName,
      onOpen: openEntity,
      type: "person"
    })) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No participant linked yet.")), /* @__PURE__ */ React.createElement("div", {
      className: "rd-references"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Supporting repositories"), (selectedDetails?.repositories ?? selectedEntry.repositories).length > 0 ? (selectedDetails?.repositories ?? selectedEntry.repositories).map((repository) => /* @__PURE__ */ React.createElement(RepoLinkPair, {
      key: repository.id,
      onOpen: openEntity,
      repository
    })) : /* @__PURE__ */ React.createElement("span", {
      className: "rd-muted"
    }, "No repository linked yet.")), selectedDetails?.plan ? /* @__PURE__ */ React.createElement(ScopedPlan, {
      label: "Project plan",
      plan: {
        plan: {
          authorId: "",
          authorType: "",
          id: selectedDetails.plan.id,
          summary: selectedDetails.plan.summary,
          updatedAt: "",
          version: 0
        },
        steps: selectedDetails.plan.steps
      }
    }) : null, selectedDetails && conflict && !conflict.axisId ? /* @__PURE__ */ React.createElement("div", {
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
    }, "Nothing you typed has been thrown away."))) : null, /* @__PURE__ */ React.createElement("section", {
      className: "rd-current-work",
      "data-rd-current-work": currentAxes.length
    }, /* @__PURE__ */ React.createElement("span", {
      className: "rd-context-label"
    }, "Workstreams (", currentAxes.length, ")"), currentAxes.length === 0 ? /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No workstreams on this project.") : /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes"
    }, currentAxes.map((axis) => selectedDetails ? /* @__PURE__ */ React.createElement("li", {
      key: axis.id
    }, /* @__PURE__ */ React.createElement(WorkstreamCard, {
      axis: {
        blockedTasks: (axis.problems ?? []).filter((task) => task.state === "blocked").length,
        currentState: axis.currentState,
        description: axis.description,
        id: axis.id,
        latestEvent: axis.history.length > 0 ? {
          at: axis.history[0].occurredAt,
          summary: axis.history[0].summary
        } : null,
        openTasks: (axis.problems ?? []).filter((task) => task.state === "open").length,
        repositories: axis.repositories,
        state: axis.state,
        stateConfidence: axis.stateConfidence,
        title: axis.title
      },
      onOpenEntity: openEntity,
      onOpenWorkstream: (axisId) => openEntity("axis", axisId)
    })) : /* @__PURE__ */ React.createElement(AxisItem, {
      axis,
      key: axis.id,
      onOpenEntity: openEntity
    }))), foldedAxes.length > 0 ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-completed-fold",
      "data-rd-folded-axes": foldedAxes.length
    }, /* @__PURE__ */ React.createElement("summary", null, "Completed and abandoned work (", foldedAxes.length, ")"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-axes"
    }, foldedAxes.map((axis) => /* @__PURE__ */ React.createElement("li", {
      key: axis.id
    }, /* @__PURE__ */ React.createElement(WorkstreamCard, {
      axis: {
        blockedTasks: (axis.problems ?? []).filter((task) => task.state === "blocked").length,
        currentState: axis.currentState,
        description: axis.description,
        id: axis.id,
        latestEvent: axis.history.length > 0 ? {
          at: axis.history[0].occurredAt,
          summary: axis.history[0].summary
        } : null,
        openTasks: (axis.problems ?? []).filter((task) => task.state === "open").length,
        repositories: axis.repositories,
        state: axis.state,
        stateConfidence: axis.stateConfidence,
        title: axis.title
      },
      onOpenEntity: openEntity,
      onOpenWorkstream: (axisId) => openEntity("axis", axisId)
    }))))) : null), /* @__PURE__ */ React.createElement("details", {
      className: "rd-scoped-plan rd-topic-activity-fold",
      "data-rd-topic-activity-fold": "true",
      open: true
    }, /* @__PURE__ */ React.createElement("summary", null, "Activity (", topicActivityTotal, ")"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-activity",
      "data-rd-topic-activity": topicActivityTotal,
      "data-rd-topic-activity-shown": topicActivityItems.length
    }, topicActivityItems.map((item) => /* @__PURE__ */ React.createElement(ActivityLine, {
      axisLabel: selectedDetails?.axes.find((axis) => axis.id === item.axisId)?.title ?? null,
      item,
      key: item.id,
      onOpenEntity: openEntity,
      repositoryLabel: selectedDetails?.repositories.find((repository) => repository.id === item.repositoryId)?.fullName ?? null,
      topicLabel: selectedEntry.topic.name
    })), selectedDetails && topicActivityTotal === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No activity recorded yet.") : null, !selectedDetails ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "Loading this project…") : null), /* @__PURE__ */ React.createElement(Pager, {
      label: "Activity",
      offset: topicActivityOffset,
      onOffset: selectTopicActivityOffset,
      pageSize: PROGRESS_PAGE_SIZE,
      total: topicActivityTotal
    })), selectedDetails ? /* @__PURE__ */ React.createElement("details", {
      className: "rd-narrow-write rd-topic-controls",
      "data-rd-topic-controls": "true"
    }, /* @__PURE__ */ React.createElement("summary", null, "Notes & corrections"), /* @__PURE__ */ React.createElement("section", {
      className: "rd-side-card"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "rd-side-title"
    }, "Notes"), /* @__PURE__ */ React.createElement("ul", {
      className: "rd-notes",
      "data-rd-topic-notes": selectedDetails.notes.length
    }, selectedDetails.notes.map((note) => /* @__PURE__ */ React.createElement("li", {
      key: note.id
    }, /* @__PURE__ */ React.createElement("div", null, note.text), /* @__PURE__ */ React.createElement("span", {
      className: "rd-meta"
    }, note.authorType, " · ", note.createdAt.slice(0, 10)))), selectedDetails.notes.length === 0 ? /* @__PURE__ */ React.createElement("li", {
      className: "rd-muted"
    }, "No notes yet. This is where a correction or a caveat goes — deliberately not in the activity log.") : null), /* @__PURE__ */ React.createElement("form", {
      className: "rd-narrow-write",
      onSubmit: (event) => {
        addTopicNote(event);
      }
    }, /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Topic note",
      disabled: busy,
      maxLength: 1000,
      onChange: (event) => setTopicNote(event.target.value),
      placeholder: "A correction or caveat about this project",
      value: topicNote
    }), /* @__PURE__ */ React.createElement(Button, {
      disabled: busy || !topicNote.trim(),
      size: "sm",
      type: "submit",
      variant: "outline"
    }, "Add note / correction"))), /* @__PURE__ */ React.createElement("details", {
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
    }, "Record activity")))) : null)) : null)) : null, view === "people" ? /* @__PURE__ */ React.createElement(PeopleView, {
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
      activityOffset,
      activityPage: workstreamActivity,
      busy,
      conflict,
      correction,
      loading: workstreamLoading,
      onActivityOffset: (next) => {
        setActivityOffset(next);
        if (progressSelection) {
          loadWorkstream(progressSelection, taskOffset, next);
        }
      },
      onCorrection: setCorrection,
      onOpenEntity: openEntity,
      onReloadCorrection: () => {
        reloadWorkstreamCorrection();
      },
      onSaveCorrection: () => {
        saveWorkstreamCorrection();
      },
      onSelectWorkstream: selectWorkstream,
      onTaskOffset: (next) => {
        setTaskOffset(next);
        if (progressSelection) {
          loadWorkstream(progressSelection, next, activityOffset);
        }
      },
      progress: visibleProgress,
      selection: progressSelection,
      taskOffset,
      taskPage: workstreamTask,
      workstream
    }) : null, view === "topics" && overview && topics.length === 0 ? /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardContent, null, /* @__PURE__ */ React.createElement("p", {
      className: "rd-muted"
    }, "No topics yet. Add one above, or let the agent record what the group is working on."))) : null);
  }
  ctx.slots.register("page", ResearchPage);
}
export {
  activityActorIndication,
  apply,
  inject
};
