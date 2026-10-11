/**
 * folded-axes.test.mjs — the executable check for the folded-workstream reader (finding F3).
 *
 * `bun test harness/folded-axes.test.mjs`
 *
 * The defect: the fold-text check read the RETIRED in-detail axis hook (`[data-rd-axis-title]`) while the
 * compact-card build renders `[data-rd-work-card]`, so it found no node and reported a correctly-rendered
 * fold as a FAIL. The fix reads the current hook and compares the rendered titles to the exact stored
 * terminal workstreams. The negative cases are load-bearing: an empty read (the retired hook) must fail;
 * a fold missing one stored terminal title must fail; a presence-only check would pass both and is refuted
 * by the "missing title" case.
 */
import { describe, expect, test } from "bun:test";
import {
  FOLDED_WORK_CARD_SELECTOR,
  RETIRED_AXIS_TITLE_SELECTOR,
  foldTextIssues,
} from "./folded-axes.mjs";

const card = (title, text = `${title} COMPLETED`) => ({ title, text });

describe("folded-workstream reader (F3)", () => {
  test("the current hook differs from the retired hook (a regression is visible)", () => {
    expect(FOLDED_WORK_CARD_SELECTOR).toContain("[data-rd-work-card]");
    expect(RETIRED_AXIS_TITLE_SELECTOR).toContain("[data-rd-axis-title]");
    expect(FOLDED_WORK_CARD_SELECTOR).not.toBe(RETIRED_AXIS_TITLE_SELECTOR);
  });

  test("positive: every stored terminal workstream rendered with its own text → no issues", () => {
    const issues = foldTextIssues({
      rendered: [card("Completed Workstream")],
      terminalTitles: ["Completed Workstream"],
    });
    expect(issues).toEqual([]);
  });

  test("negative (the defect): the retired hook finds nothing → the check fails", () => {
    // Reading the retired hook yields an empty list; the fixed check must NOT report a green.
    const issues = foldTextIssues({ rendered: [], terminalTitles: ["Completed Workstream"] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(" ")).toContain("no folded workstream card rendered");
  });

  test("negative (load-bearing): a missing stored terminal title fails, so presence alone is not enough", () => {
    const issues = foldTextIssues({
      rendered: [card("Some Other Workstream")],
      terminalTitles: ["Completed Workstream"],
    });
    // Length > 0 refutes a presence-only check; the stored title is named in the defect.
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(" ")).toContain('"Completed Workstream"');
  });

  test("negative: a card that renders no text fails", () => {
    const issues = foldTextIssues({
      rendered: [card("Completed Workstream", "")],
      terminalTitles: ["Completed Workstream"],
    });
    expect(issues.join(" ")).toContain("renders no text");
  });
});
