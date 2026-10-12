/**
 * Source UI test — V2b (task-centered Progress composition).
 *
 * V2b re-orders the selected workstream's Progress detail so the **tasks** lead: a compact header
 * (title/state, the current reading and blocker in full with their confidences, the axis's own explicit
 * participants, the enduring purpose one disclosure away) comes first, then Tasks, and only afterwards the
 * workstream plan, activity, evidence, provenance and maintenance. Two pure helpers the view calls are
 * pinned directly; the composition (ordering, disclosure defaults, preserved hooks, the removed feed cap)
 * is pinned by reading the rendered source, the same way `actions.test.ts` reads the plugin sources — no DOM.
 *
 * Scope: this file asserts V2b only. It never asserts a frozen view (People/Repositories/Projects).
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

describe("V2b Progress disclosures — pure helpers", () => {
  test("the evidence summary states the count shown, or just the label", () => {
    // The projection caps evidence per source, so the count is the evidence *shown*, not the workstream's
    // exact total — the label says so rather than asserting a total the view cannot read.
    expect(progressEvidenceSummary(0)).toBe("Evidence");
    expect(progressEvidenceSummary(1)).toBe("Evidence (1 shown)");
    expect(progressEvidenceSummary(7)).toBe("Evidence (7 shown)");
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

describe("V2b Progress composition — compact header", () => {
  test("the header leads with the two claims in full, each with its own confidence", () => {
    // The reading and the blocker hang off the context panel, before the tasks.
    const panel = at('data-rd-context-panel={axis.id}');
    const reading = at('data-rd-axis-reading="true"');
    const blocker = at('data-rd-axis-blocker="true"');
    const tasks = at("data-rd-progress-tasks={taskTotal}");
    expect(panel).toBeGreaterThan(-1);
    expect(reading).toBeGreaterThan(panel);
    expect(blocker).toBeGreaterThan(reading);
    expect(tasks).toBeGreaterThan(blocker);
    // Both claims still carry a ConfidenceBadge; the state badge stays in the head.
    expect(source).toContain("<ConfidenceBadge value={axis.currentStateConfidence} />");
    expect(source).toContain("<ConfidenceBadge value={axis.blockerConfidence} />");
  });

  test("the purpose is a native disclosure (data-rd-progress-context-more), full text retained", () => {
    const more = at('data-rd-progress-context-more="true"');
    const description = at('data-rd-axis-description="true"');
    const tasks = at("data-rd-progress-tasks={taskTotal}");
    expect(more).toBeGreaterThan(-1);
    // Purpose lives in the header, before the tasks.
    expect(tasks).toBeGreaterThan(more);
    expect(description).toBeGreaterThan(more);
    // The full stored string (or its honest empty) — no clamped preview.
    expect(source).toContain("No workstream purpose recorded.");
  });

  test("the participants are the axis's own explicit people, not inferred", () => {
    expect(source).toContain("people={axis.people}");
    expect(at("people={axis.people}")).toBeLessThan(
      at("data-rd-progress-tasks={taskTotal}"),
    );
  });
});

describe("V2b Progress composition — tasks lead, the rest follow", () => {
  test("tasks come first, then evidence, the workstream plan, activity and maintenance", () => {
    const tasks = at("data-rd-progress-tasks={taskTotal}");
    const evidence = at("data-rd-progress-evidence={evidence.length}");
    const plan = at('data-rd-progress-plan="true"');
    const activity = at('data-rd-progress-activity="true"');
    const provenance = at('data-rd-progress-provenance="true"');
    const maintenance = at('data-rd-progress-maintenance="true"');
    for (const mark of [tasks, evidence, plan, activity, provenance, maintenance]) {
      expect(mark).toBeGreaterThan(-1);
    }
    expect(evidence).toBeGreaterThan(tasks);
    expect(plan).toBeGreaterThan(evidence);
    expect(activity).toBeGreaterThan(plan);
    expect(provenance).toBeGreaterThan(activity);
    expect(maintenance).toBeGreaterThan(provenance);
  });

  test("the task cards keep their title, full statement, state, own plan and participants", () => {
    expect(source).toContain("data-rd-task-card={task.id}");
    expect(source).toContain("data-rd-task-state={task.state}");
    expect(source).toContain('className="rd-task-statement"');
    expect(source).toContain("<ScopedPlan label=\"Task plan\" plan={task.plan} />");
    expect(source).toContain("people={task.people}");
  });
});

describe("V2b Progress composition — disclosure defaults", () => {
  test("the workstream plan is collapsed by default; the task plan keeps its default open", () => {
    const workstream = at('data-rd-progress-plan="true"');
    expect(workstream).toBeGreaterThan(-1);
    // The one `defaultOpen={false}` on the page belongs to the workstream plan call.
    expect(source.match(/defaultOpen=\{false\}/g)?.length).toBe(1);
    const planCall = source.slice(workstream, workstream + 400);
    expect(planCall).toContain("defaultOpen={false}");
    expect(planCall).toContain('label="Workstream plan"');
    // A task's own plan is still rendered with the default-open call (no defaultOpen prop).
    expect(source).toContain("<ScopedPlan label=\"Task plan\" plan={task.plan} />");
  });

  test("activity is a native disclosure carrying its exact total in the summary", () => {
    const activity = at('className="rd-progress-activity"');
    expect(activity).toBeGreaterThan(-1);
    const block = source.slice(activity, activity + 1600);
    expect(block).toContain('data-rd-progress-activity="true"');
    expect(block).toContain("data-rd-progress-activity-total={activityTotal}");
    expect(block).toContain("progressActivitySummary(activityTotal)");
    // The scoped rows and the existing backend pager are retained.
    expect(block).toContain("data-rd-progress-feed={activityTotal}");
    expect(block).toContain("data-rd-feed-event");
    expect(block).toContain('label="Activity"');
  });

  test("evidence is a native disclosure after the tasks, no guessed link", () => {
    const evidence = at('className="rd-progress-evidence"');
    const block = source.slice(evidence, evidence + 2200);
    expect(block).toContain("data-rd-axis-evidence={evidence.length}");
    expect(block).toContain("data-rd-has-evidence={evidence.length > 0}");
    expect(block).toContain("progressEvidenceSummary(evidence.length)");
    // A real stored URL is linked; where there is none, the recorded ref is shown — never a guessed href.
    expect(block).toContain("href={item.sourceUrl}");
    expect(block).toContain("data-rd-evidence-no-url");
    // The stale clamped-summarizer tooltip is gone: the disclosure carries no fabricated count in a title.
    expect(block).not.toContain("title={evidenceText}");
    expect(source).not.toContain("evidenceText");
  });
});

describe("V2b Progress composition — maintenance and the removed feed cap", () => {
  test("maintenance keeps the correction toggle and the retained Return to project", () => {
    const maintenance = at('data-rd-progress-maintenance="true"');
    expect(maintenance).toBeGreaterThan(-1);
    const block = source.slice(maintenance, maintenance + 2400);
    expect(block).toContain("data-rd-correct-toggle={axis.id}");
    expect(block).toContain("data-rd-return-project=");
    expect(block).toContain("Return to project →");
    // The correction form itself is not folded behind a closed disclosure.
    expect(block).toContain("<WorkstreamCorrection");
  });

  test("the Progress-only nested feed max-height/overflow cap is gone", () => {
    expect(source).not.toContain("max-height: 270px");
    expect(source).not.toContain(".rd-progress-activity .rd-feed {");
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
    ]) {
      expect(source).toContain(hook);
    }
  });
});
