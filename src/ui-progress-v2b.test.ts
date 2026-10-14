/**
 * Source UI test — V12 Progress structural composition (supersedes the V2b task-first/plan-collapsed/
 * purpose-native requirements).
 *
 * V12 rebuilds the selected workstream as the accepted Tinted reader: a named left rail ("Workstreams")
 * whose flat rows carry a narrow **spaced state pipe** (no pill, dot or duplicated state tag) and whose
 * stored state/confidence survive as assistive text; a kicker + prominent title with its state beside it
 * and one factual metadata line; Current reading and the **optional** Workstream plan as adjacent columns
 * under matching headings with no dividing rule (the plan before the tasks and open by default, absent —
 * no dead column); the Purpose as a genuine stored excerpt behind a real show full / show less button;
 * flat ordinal task rows; then evidence/provenance/maintenance and the full-width activity, open by
 * default. Two pure helpers and the no-evidence sentence are pinned directly; the composition (ordering,
 * disclosure defaults, preserved hooks, selection keys) is pinned by reading the rendered source, the same
 * way `actions.test.ts` reads the plugin sources — no DOM.
 *
 * Scope: this file asserts V12 Progress only. It never asserts a frozen view (People/Repositories/Projects).
 */
import { describe, expect, test } from "bun:test";
import {
  PROGRESS_NO_EVIDENCE_TEXT,
  progressActivitySummary,
  progressEvidenceSummary,
} from "./ui";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();

/** The position of the first occurrence of `needle` in the source, or -1 — never coerced. */
const at = (needle: string): number => source.indexOf(needle);

describe("V12 Progress disclosures — pure helpers", () => {
  test("the evidence summary is the authoritative total when paged, else the count shown", () => {
    // With a backend page the heading carries the page's own total, independent of the rows returned
    // (6 shown, 7 total → "7"); without one the capped `axis.evidence` count is labelled as *shown*.
    expect(progressEvidenceSummary({ count: 0 })).toBe("Supporting evidence");
    expect(progressEvidenceSummary({ count: 1 })).toBe(
      "Supporting evidence (1 shown)",
    );
    expect(progressEvidenceSummary({ count: 7 })).toBe(
      "Supporting evidence (7 shown)",
    );
    expect(progressEvidenceSummary({ count: 6, total: 7 })).toBe(
      "Supporting evidence (7)",
    );
    expect(progressEvidenceSummary({ count: 0, total: 0 })).toBe(
      "Supporting evidence",
    );
  });

  test("the activity summary carries the exact scoped total, or just the label", () => {
    expect(progressActivitySummary(0)).toBe("Recent activity");
    expect(progressActivitySummary(5)).toBe("Recent activity (5)");
  });

  test("the explicit no-evidence sentence is preserved verbatim", () => {
    expect(PROGRESS_NO_EVIDENCE_TEXT).toBe(
      "No evidence on record — a 'confirmed' reading needs evidence",
    );
    expect(source).toContain("PROGRESS_NO_EVIDENCE_TEXT");
  });
});

describe("V12 Progress — the named left rail", () => {
  test("a visible Workstreams heading + instruction sits above the grouped selector", () => {
    const head = at('<h2 className="rd-index-title">Workstreams</h2>');
    const index = at('data-rd-progress-index="true"');
    const hero = at('data-rd-progress-kicker="true"');
    expect(head).toBeGreaterThan(-1);
    expect(source).toContain("Choose a workstream · organized by project");
    // The heading and the hero share the top of the split, so the rail title levels with the hero kicker.
    expect(index).toBeGreaterThan(head);
    expect(hero).toBeGreaterThan(-1);
    // The rail is its own column (the split's fixed selector basis), and the project groups are retained.
    expect(source).toContain(
      'className="rd-progress-rail" data-rd-progress-rail="true"',
    );
    expect(source).toContain('className="rd-project-heading">{group.name}</div>');
  });

  test("the row state is a narrow spaced pipe, not a pill, dot or duplicated tag", () => {
    // The pipe: ~4px wide, spanning the row, coloured by the stored state.
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-progress-index .rd-index-item::before',
    );
    expect(source).toContain("width: 4px;");
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-progress-index .rd-index-item[data-rd-index-state="blocked"]::before { background: #a33f2c; }',
    );
    // ~8px between rows' pipes.
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-progress-index .rd-index-list > li + li { margin-top: 8px; }',
    );
    // The retired duplicate: no state pill and no dot render inside a Progress selector row.
    expect(source).not.toContain("confidence={row.stateConfidence}");
    expect(source).not.toContain("className=\"rd-status-dot\"");
    const row = at("data-rd-index-topic={row.topicName}");
    const block = source.slice(row, row + 900);
    expect(block).not.toContain("<StateBadge");
  });

  test("the stored state and confidence remain as assistive text, not colour alone", () => {
    const row = at("data-rd-index-topic={row.topicName}");
    const block = source.slice(row, row + 900);
    expect(block).toContain('className="rd-visually-hidden"');
    expect(block).toContain("State ${row.state}");
    expect(block).toContain('row.stateConfidence !== "confirmed"');
    // Removing duplicated status pills does not remove factual selector metadata.
    expect(source).toContain('row.openProblems, "open task"');
    expect(source).toContain("describeAge(row.recencyAt)");
    expect(source).toContain('row.plan ? "" : " · No plan"');
  });
});

describe("V12 Progress — the selected-workstream hero", () => {
  test("a kicker + prominent title with adjacent state + one factual metadata line lead the pane", () => {
    const kicker = at('data-rd-progress-kicker="true"');
    const title = at('data-rd-progress-detail-title="true"');
    const meta = at('data-rd-progress-hero-meta="true"');
    expect(kicker).toBeGreaterThan(-1);
    expect(source).toContain("Selected workstream · ${projectName}");
    expect(kicker).toBeLessThan(title);
    expect(title).toBeLessThan(meta);
    // The state sits beside the title inside the shared head, not floated to the far edge.
    const head = source.slice(title, meta);
    expect(head).toContain("<StateBadge");
    expect(source).toContain('className="rd-work-title rd-hero-title"');
  });

  test("the metadata line is assembled from real counts only", () => {
    const meta = at('data-rd-progress-hero-meta="true"');
    const block = source.slice(meta, meta + 1200);
    expect(block).toContain('countLabel(taskTotal, "task", "tasks")');
    expect(block).toContain('axis.plan.steps.length');
    expect(block).toContain("in scope");
    expect(block).toContain('.filter((part): part is string => part !== null)');
  });
});

describe("V12 Progress — reading and the optional plan, before the tasks", () => {
  test("Current reading and the Workstream plan precede the tasks, under matching headings", () => {
    const columns = at('className="rd-progress-columns"');
    const reading = at('data-rd-progress-col="reading"');
    const plan = source.indexOf('data-rd-progress-col="plan"', columns);
    const tasks = at("data-rd-progress-tasks={taskTotal}");
    expect(columns).toBeGreaterThan(-1);
    expect(reading).toBeGreaterThan(columns);
    expect(plan).toBeGreaterThan(reading);
    expect(tasks).toBeGreaterThan(plan);
    // Matching headings: the reading head and the plan's summary share one heading treatment.
    expect(source).toContain("Current reading");
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-section-head .rd-section {',
    );
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-progress-col .rd-scoped-plan > summary {',
    );
  });

  test("there is no vertical dividing rule between the two columns", () => {
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-progress-col { border-left: 0;',
    );
  });

  test("the workstream plan is open by default and gated on an actual stored plan", () => {
    const plan = at("{axis.plan && axis.plan.steps.length > 0 ? (");
    expect(plan).toBeGreaterThan(-1);
    const block = source.slice(plan, plan + 700);
    expect(block).toContain('data-rd-progress-col="plan"');
    expect(block).toContain("defaultOpen={true}");
    expect(block).toContain('label="Workstream plan"');
    // A plan with no stored steps renders nothing — no dead column, and no fabricated step (ScopedPlan
    // returns null for an empty plan).
    expect(source).toContain("if (!plan || plan.steps.length === 0) {");
  });

  test("a task's own plan keeps its default-open ownership", () => {
    expect(source).toContain('<ScopedPlan label="Task plan" plan={task.plan} />');
  });
});

describe("V12 Progress — plan steps are the three-part stored row", () => {
  test("a neutral stored position, neutral text, a trailing square status tag", () => {
    // The stored position renders as stored — 0 included — and an absent position draws no numeral.
    expect(source).toContain("step.position === null ? null : (");
    expect(source).toContain('<span className="rd-plan-position">{step.position}</span>');
    expect(source).toContain("data-rd-scoped-plan-position=");
    // The neutral circle numeral's own rule.
    expect(source).toContain('[data-plugin-id="research-dashboard"] .rd-plan-position {');
    // Status stays the stored (square) tag, and the step title stays neutral strong text.
    expect(source).toContain('<StateBadge kind="stored" state={step.state} />');
    expect(source).toContain('<span className="rd-strong">{step.title}{" "}<StateBadge kind="stored" state={step.state} /></span>');
  });
});

describe("V12 Progress — the inline Purpose excerpt", () => {
  test("a real show full / show less button, not a native details", () => {
    expect(source).toContain("function PurposeExcerpt({ text, emptyText =");
    expect(source).toContain("const [expanded, setExpanded] = React.useState(false);");
    expect(source).toContain("<PurposeExcerpt text={axis.description ?? null} />");
    expect(source).toContain('data-rd-purpose-toggle={purpose ? (expanded ? "less" : "full") : undefined}');
    expect(source).toContain('{expanded ? "Show less" : "Show full text"}');
    // The context-more marker is on a real block, not a `<details>`.
    expect(source).toContain(
      '<div className="rd-context-more" data-rd-progress-context-more="true">',
    );
    expect(source).not.toContain(
      '<details\n                    className="rd-context-more"',
    );
  });

  test("the excerpt node keeps its marker and the complete stored text, never a paraphrase", () => {
    // The marker stays on the excerpt node itself.
    const excerpt = source.slice(
      at("className={`rd-purpose-text"),
      at('className="rd-purpose-toggle"'),
    );
    expect(excerpt).toContain('data-rd-axis-description={purpose ? "true" : undefined}');
    expect(excerpt).toContain("{text.slice(0, cut)}");
    expect(excerpt).toContain('<span hidden={!expanded}>{text.slice(cut)}</span>');
    // Both slices concatenate to the original; the suffix remains in DOM and the toggle stays inline.
    expect(source).toContain("No workstream purpose recorded.");
    expect(source).toContain("aria-expanded={expanded}");
    expect(source).toContain("is-expanded");
  });
});

describe("V12 Progress — flat ordinal task rows", () => {
  test("the ordinal continues across pages using the returned offset, never a stored rank", () => {
    expect(source).toContain("{taskShown.map((task, index) => (");
    expect(source).toContain("data-rd-task-ordinal={taskStart + index + 1}");
    expect(source).toContain('String(taskStart + index + 1).padStart(2, "0")');
    expect(source).toContain('className="rd-task-ordinal" aria-hidden="true"');
    expect(source).not.toContain("data-rd-task-offset");
  });

  test("the row is flat (no box, no decorative bar) with the ordinal in its own gutter", () => {
    const rule = at(
      '[data-plugin-id="research-dashboard"] .rd-task-card {\n  background: none;',
    );
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 320);
    expect(block).toContain("border: 0;");
    expect(block).toContain("grid-template-columns: 3.25rem minmax(0, 1fr);");
  });

  test("title, full statement, adjacent state, own plan, links and people are retained", () => {
    expect(source).toContain("data-rd-task-card={task.id}");
    expect(source).toContain("data-rd-task-state={task.state}");
    expect(source).toContain('className="rd-task-statement"');
    expect(source).toContain("data-rd-task-facts=\"true\"");
    expect(source).toContain("people={task.people}");
    // The task pager keeps its backend totals and handlers.
    expect(source).toContain('label="Tasks"');
  });
});

describe("Owner corrections — activity before maintenance and final evidence", () => {
  test("activity precedes grouped maintenance/correction and final evidence", () => {
    const tasks = at("data-rd-progress-tasks={taskTotal}");
    const evidence = at("data-rd-progress-evidence={evidence.length}");
    const provenance = at('data-rd-progress-provenance="true"');
    const maintenance = at('data-rd-progress-maintenance="true"');
    const activity = at('data-rd-progress-activity="true"');
    for (const mark of [tasks, evidence, provenance, maintenance, activity]) {
      expect(mark).toBeGreaterThan(-1);
    }
    expect(activity).toBeGreaterThan(tasks);
    expect(maintenance).toBeGreaterThan(activity);
    expect(evidence).toBeGreaterThan(at("<WorkstreamCorrection"));
    expect(provenance).toBeGreaterThan(evidence);
  });

  test("the activity disclosure is open by default and keeps its scope and pager", () => {
    const activity = at('className="rd-progress-activity"');
    expect(activity).toBeGreaterThan(-1);
    const block = source.slice(activity, activity + 1700);
    expect(block).toContain("data-rd-progress-activity-total={activityTotal}");
    expect(block).toContain('<h4 className="rd-section-heading">{progressActivitySummary(activityTotal)}</h4>');
    expect(block).not.toContain("<summary>");
    expect(block).toContain("progressActivitySummary(activityTotal)");
    // Scoped rows + the independent backend pager are retained.
    expect(block).toContain("data-rd-progress-feed={activityTotal}");
    expect(block).toContain("data-rd-feed-event");
    expect(block).toContain('label="Activity"');
    // The retired nested-feed cap stays gone.
    expect(source).not.toContain("max-height: 270px");
    expect(source).not.toContain(".rd-progress-activity .rd-feed {");
  });
});

describe("V12 Progress — evidence, maintenance and preserved hooks", () => {
  test("evidence is a static section with a real stored link, never a guessed href", () => {
    const evidence = at('className="rd-progress-evidence"');
    const block = source.slice(evidence, evidence + 3600);
    expect(block).toContain("data-rd-axis-evidence={evidence.length}");
    expect(block).toContain("data-rd-has-evidence={evidence.length > 0}");
    expect(block).toContain("progressEvidenceSummary({");
    expect(block).toContain("href={parts.href}");
    expect(block).toContain("data-rd-evidence-no-url");
    expect(block).not.toContain("title={evidenceText}");
    expect(source).not.toContain("evidenceText");
  });

  test("maintenance keeps the correction toggle and the retained Return to project", () => {
    const maintenance = at('data-rd-progress-maintenance="true"');
    expect(maintenance).toBeGreaterThan(-1);
    const block = source.slice(maintenance, maintenance + 2000);
    expect(block).toContain("data-rd-correct-toggle={axis.id}");
    expect(block).toContain("data-rd-return-project=");
    expect(block).toContain("Return to project →");
    // The correction form itself is not folded behind a closed disclosure: it renders after the
    // maintenance controls (and after the bottom activity), never hidden inside a `<details>`.
    const correction = at("<WorkstreamCorrection");
    expect(correction).toBeGreaterThan(maintenance);
  });

  test("the preserved Progress hooks the capture/harness reads are all still present", () => {
    for (const hook of [
      'data-rd-progress-detail="true"',
      'data-rd-progress-detail-title="true"',
      "data-rd-index-axis={row.id}",
      "data-rd-progress-tasks={taskTotal}",
      "data-rd-progress-activity-total={activityTotal}",
      "data-rd-progress-feed={activityTotal}",
      'attrs={{ "data-rd-feed-event": item.id }}',
      'data-rd-context-panel={axis.id}',
    ]) {
      expect(source).toContain(hook);
    }
  });
});

describe("V12 shared grammar — nav surface tint and the blocked-count ink", () => {
  test("the @supports nav tokens mix the blue accent into the card, not the neutral foreground", () => {
    // V12 iteration 2 (V-01, owner decision 2026-10-13): the earlier mix of the *ink* (#253e55 8%) into
    // the host card computed an almost-neutral grey bar in the light theme. The revised token mixes a mid
    // blue accent so the light result lands on the accepted pale-blue surface (~#edf3f8) while keeping
    // var(--card) as the base for dark-theme awareness. This is a recorded rule revision, not a hidden fix.
    expect(source).toContain(
      "--rd-nav-surface: color-mix(in oklab, #6f97ba 12%, var(--card, #ffffff));",
    );
    expect(source).not.toContain(
      "--rd-nav-surface: color-mix(in oklab, var(--foreground",
    );
  });

  test("the blocked child count keeps red semantic ink, not a pill or a parent-derived state", () => {
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-count[data-rd-state="blocked"] { color: #9a332b; }',
    );
    expect(source).not.toContain("#fdecec");
  });
});
