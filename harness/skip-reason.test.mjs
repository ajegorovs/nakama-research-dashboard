/**
 * skip-reason.test.mjs — the executable check for the inverted-ternary defect (SKIP reason selector).
 *
 * `bun test harness/skip-reason.test.mjs`
 *
 * It asserts BOTH condition paths on the actual boolean, and — crucially — that the two paths are
 * DISTINCT: a "fix" that collapsed both branches to one string would pass a single-path test but not this
 * one. The negative case is the defect itself: retired=true must NOT print the dataset-lack reason.
 */
import { describe, expect, test } from "bun:test";
import { PIVOT_RETIRED_REASON, sparseSkipReason, stepFiveSkipReason } from "./skip-reason.mjs";

describe("step-5 problem-surface SKIP reason selector", () => {
  test("retired=true reports the pivot-retired reason (the fixed path)", () => {
    const r = stepFiveSkipReason({ retired: true, problemCount: 16 });
    expect(r).toBe(PIVOT_RETIRED_REASON);
    expect(r).toContain("retired by the");
  });

  test("retired=false reports the dataset-lack reason, with the problem count", () => {
    const r = stepFiveSkipReason({ retired: false, problemCount: 16 });
    expect(r).toContain("this dataset carries no problem with more than one repository");
    expect(r).toContain("16 problem row(s) in the payload");
  });

  test("the two paths are distinct — the inversion is detectable", () => {
    const retired = stepFiveSkipReason({ retired: true, problemCount: 16 });
    const datasetLack = stepFiveSkipReason({ retired: false, problemCount: 16 });
    expect(retired).not.toBe(datasetLack);
    // The defect: retired=true yielding the dataset-lack text must fail.
    expect(retired).not.toContain("this dataset carries no problem with more than one repository");
  });

  test("sparse family obeys the same branch", () => {
    expect(sparseSkipReason({ retired: true })).toBe(PIVOT_RETIRED_REASON);
    expect(sparseSkipReason({ retired: false })).toContain("nothing behind it");
    expect(sparseSkipReason({ retired: true })).not.toContain("nothing behind it");
  });
});
