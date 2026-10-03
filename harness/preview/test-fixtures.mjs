#!/usr/bin/env bun
/**
 * test-fixtures.mjs — the preview's fixtures must show the Progress states, not an empty view.
 *
 * The preview replays each dataset's own write transcript. The plain transcript alone leaves the Progress
 * view with **no problem rows** (a problem is named by a store-minted id, so it takes a second pass), which
 * is exactly the defect this guards: both datasets derive their problems — the corpus from its unmerged
 * pull requests, the fixture from Fixture E — and this asserts the payloads actually carry them.
 *
 * It builds each dataset with the same `make-fixtures.mjs` the preview uses, into a temp file, and reads
 * the result. No hand-written expectation of the data: the assertions are about coverage and shape.
 *
 *   bun harness/preview/test-fixtures.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");
const dir = mkdtempSync(path.join(tmpdir(), "rd-preview-test-"));

let failures = 0;
const check = (ok, message) => {
  if (ok) {
    console.log(`ok    ${message}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${message}`);
  }
};

const build = (dataset) => {
  const out = path.join(dir, `${dataset}.json`);
  const run = spawnSync(
    "bun",
    [path.join(HERE, "make-fixtures.mjs"), "--dataset", dataset, "--out", out],
    { cwd: REPO, encoding: "utf8" }
  );
  if (run.status !== 0) {
    failures += 1;
    console.error(run.stdout);
    console.error(run.stderr);
    throw new Error(`make-fixtures --dataset ${dataset} exited ${run.status}`);
  }
  return JSON.parse(readFileSync(out, "utf8"));
};

const progress = (fixtures, days = 0) =>
  fixtures.responses[`get_progress:${days}`]?.problems?.problems ?? [];

try {
  // ── the corpus: its own unmerged pull requests, derived ─────────────────────────────────────────
  const corpus = build("corpus");
  const corpusProblems = progress(corpus);
  check(
    corpus.derived?.problems >= 3 && corpusProblems.length >= 3,
    `corpus derives >= 3 problems (derived ${corpus.derived?.problems}, payload ${corpusProblems.length})`
  );
  check(
    corpusProblems.filter((row) => row.state === "open").length >= 2,
    "corpus payload has the two open problems (PR #68, PR #70)"
  );
  check(
    corpusProblems.some((row) => row.state === "resolved"),
    "corpus payload has the closed-without-merging problem, read as resolved"
  );
  check(
    corpusProblems.every(
      (row) => row.statement && row.axisTitle && Array.isArray(row.evidence) && row.evidence.length > 0
    ),
    "every corpus problem carries a statement, an axis and its linked event"
  );
  check(
    corpusProblems.every((row) => row.repositories.length > 0),
    "every corpus problem names its own repository (derived from the PR's sourceUrl)"
  );

  // ── the fixture: Fixture E, applied in its own two-pass shape ──────────────────────────────────
  const fixture = build("fixture");
  const fixtureProblems = progress(fixture);
  check(
    fixture.derived?.problems >= 3 && fixtureProblems.length >= 3,
    `fixture derives Fixture E (derived ${fixture.derived?.problems}, payload ${fixtureProblems.length})`
  );
  const onStep = fixtureProblems.find((row) => row.planStepId);
  check(
    onStep && onStep.repositories.length === 2 && onStep.people.length >= 1 && onStep.evidence.length >= 1,
    "fixture keeps the problem on a plan step, on two repositories, with a person and its evidence"
  );
  check(
    fixtureProblems.some((row) => row.planStepId === null),
    "fixture keeps the problem with no plan step, no repository and no artifact"
  );
  check(
    fixtureProblems.some((row) => row.state === "resolved"),
    "fixture keeps the closed-out problem the inventory must not list"
  );
  const fixtureAxes = fixture.responses["get_progress:0"]?.axes?.axes ?? [];
  check(
    fixtureAxes.some((axis) => (axis.plan?.steps ?? []).length >= 2),
    "fixture has a plan with steps above the problems"
  );

  // ── representative selection has a target ──────────────────────────────────────────────────────
  // `capture.mjs` selects the most-populated repository and the axis/problem carrying support, *where the
  // dataset permits*; these assert the preconditions exist, so the capture's own assertions are not
  // vacuous and a dataset that lost its populated rows fails here before it is ever photographed.
  const repositories = (fixtures) =>
    fixtures.responses[`get_overview:${fixtures.windowDays}`]?.repositories ?? [];
  const axes = (fixtures) => fixtures.responses["get_progress:0"]?.axes?.axes ?? [];
  for (const dataset of [corpus, fixture]) {
    check(
      repositories(dataset).some((row) => (row.axes ?? []).length > 0),
      `${dataset.dataset} has a repository with axes — a populated repository for the capture to select`
    );
    check(
      axes(dataset).some((axis) => axis.openProblems > 0),
      `${dataset.dataset} has an axis with open problems — the capture's axis selection has a target`
    );
    check(
      progress(dataset).some((row) => (row.repositories ?? []).length > 0),
      `${dataset.dataset} has a problem naming a repository — the capture's problem selection has support`
    );
  }

  // ── both: every window the page can ask for answers the same way ───────────────────────────────
  for (const dataset of [corpus, fixture]) {
    for (const days of [7, 14, 30, 0]) {
      check(
        progress(dataset, days).length > 0,
        `${dataset.dataset} window ${days}: Progress has problem rows`
      );
    }
  }
} finally {
  rmSync(dir, { force: true, recursive: true });
}

if (failures > 0) {
  console.error(`test-fixtures: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("test-fixtures: all assertions passed");
