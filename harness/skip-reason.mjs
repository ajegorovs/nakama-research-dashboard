/**
 * skip-reason.mjs — the SKIP reason selector for the retired step-5 problem surface.
 *
 * The four-tab pivot retired the step-5 problem surface (repository threads / evidence / human steering
 * and the problem-choice inventory). `harness/verify-page.mjs` therefore has TWO possible reasons for the
 * family of SKIPs it emits there:
 *
 *   - the surface is RETIRED on this build (its hooks — `data-rd-problem-choice`, `data-rd-evidence`,
 *     `data-rd-steering*` — are absent from the built bundle), or
 *   - the surface exists but this DATASET lacks the subject (a seedable gap).
 *
 * The selector keys off the measured boolean `retired` (the emitter reads it as
 * `(await root.locator("[data-rd-problem-choice]").count()) === 0`). Getting the branch backwards prints
 * the *dataset-lack* reason on a build whose surface is *retired*, which files a pivot removal as a
 * seedable gap — the exact inversion this module exists to prevent. It is factored out (rather than left
 * inline) so both condition paths are executable in a unit test.
 */

export const PIVOT_RETIRED_REASON =
  "the step-5 problem surface (repository threads / evidence / human steering) was retired by the " +
  "four-tab pivot — its hooks (data-rd-problem-choice, data-rd-evidence, data-rd-steering*) are absent " +
  "from the built bundle (docs/design/dashboard-information-architecture-pivot.md; " +
  "docs/ux-v2/DECISIONS.md §8.3), so this dataset cannot exercise it; the current-surface re-points run " +
  "in §(2b) above (docs/design/dashboard-information-architecture-pivot.md, Progress = full workstream " +
  "context, scoped plan, supporting repositories, activity and visible task cards)";

/** The reason for the "problem with >1 repository" family (repository threads / evidence / steering). */
export function stepFiveSkipReason({ retired, problemCount }) {
  return retired
    ? PIVOT_RETIRED_REASON
    : "this dataset carries no problem with more than one repository, so the step-5 sections have no " +
        `subject here (${problemCount} problem row(s) in the payload) — the ` +
        "fixture's axis carries one, so that run discriminates";
}

/** The reason for the sparse ("nothing behind it") negative-case family. */
export function sparseSkipReason({ retired }) {
  return retired
    ? PIVOT_RETIRED_REASON
    : "this dataset carries no problem with nothing behind it (no repositories, no evidence, no " +
        "steering), so the negative cases have no subject — the fixture's sparse problem does, so that " +
        "run discriminates";
}
