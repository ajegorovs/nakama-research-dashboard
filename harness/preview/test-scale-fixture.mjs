#!/usr/bin/env bun
/**
 * test-scale-fixture.mjs — the oversized dataset must actually be oversized, and the states it exists for
 * must survive the round trip through the real action layer.
 *
 * It builds `scale` with the same `make-fixtures.mjs` the preview uses, into a temp file, then reads the
 * payloads back. Nothing here restates a payload: the assertions are about coverage and shape, and the
 * subjects they name come from the fixture's own declared `SCALE_SUBJECTS`.
 *
 * The thing being guarded is the same defect `test-fixtures.mjs` guards — a dataset that builds but
 * silently loses the states it was written for — plus the scale-specific ones: a capped projection that
 * drops the subjects the second pass must find, windows that all move together instead of unevenly, and
 * a dataset that quietly shrank below the store's rollup cap.
 *
 *   bun harness/preview/test-scale-fixture.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SCALE_SUBJECTS, scaleFixtureCalls } from "./scale-fixture-calls.mjs";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");
const dir = mkdtempSync(path.join(tmpdir(), "rd-scale-test-"));

let failures = 0;
const check = (ok, message) => {
  if (ok) {
    console.log(`ok    ${message}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${message}`);
  }
};

const build = () => {
  const out = path.join(dir, "scale.json");
  const run = spawnSync(
    "bun",
    [path.join(HERE, "make-fixtures.mjs"), "--dataset", "scale", "--out", out],
    { cwd: REPO, encoding: "utf8" }
  );
  if (run.status !== 0) {
    failures += 1;
    console.error(run.stdout);
    console.error(run.stderr);
    throw new Error(`make-fixtures --dataset scale exited ${run.status}`);
  }
  return JSON.parse(readFileSync(out, "utf8"));
};

try {
  const fixtures = build();
  const overview = fixtures.responses[`get_overview:${fixtures.windowDays}`];
  const progress = (days) => fixtures.responses[`get_progress:${days}`];
  const problems = (days) => progress(days)?.problems?.problems ?? [];
  const axes = (days) => progress(days)?.axes?.axes ?? [];
  const windows = [7, 14, 30, 0];

  // ── it built the scale dataset, through the real action layer ─────────────────────────────────────
  check(fixtures.dataset === "scale", "the dataset identifies itself as scale");
  check(fixtures.writes?.reconcile_topic >= 10, `replayed ${fixtures.writes?.reconcile_topic} reconcile_topic call(s)`);

  // ── declarations vs payload: oversized past the store's rollup cap ────────────────────────────────
  const declared = scaleFixtureCalls().reduce((n, call) => n + (call.input.problems?.length ?? 0), 0);
  check(declared > 50, `the fixture declares more problems (${declared}) than the store's rollup cap (50)`);
  check(
    overview.counts.axes > 50,
    `more axes than the rollup cap: ${overview.counts.axes}`
  );
  check(overview.topics.length >= 12, `many topics: ${overview.topics.length}`);
  check(
    problems(0).length === 50 && declared > problems(0).length,
    `the Progress projection caps the declared problems to ${problems(0).length} (declared ${declared})`
  );
  check(
    new Set(overview.counts.topicsByStatus ? Object.keys(overview.counts.topicsByStatus) : []).size > 0,
    "the overview reports its topics by status"
  );

  // ── deterministic declaration: the same file twice is the same calls ──────────────────────────────
  check(
    JSON.stringify(scaleFixtureCalls()) === JSON.stringify(scaleFixtureCalls()),
    "scaleFixtureCalls() is deterministic across builds"
  );

  // ── uneven activity: the windows must disagree ────────────────────────────────────────────────────
  const windowEvents = windows.map(
    (days) =>
      (progress(days)?.activity?.byAxis ?? []).reduce((n, bucket) => n + (bucket.events?.length ?? 0), 0)
  );
  check(
    windowEvents[0] < windowEvents[1] && windowEvents[1] < windowEvents[2] && windowEvents[2] <= windowEvents[3],
    `event counts grow with the window: ${windowEvents.join(" · ")} (7/14/30/all)`
  );
  check(
    new Set(windowEvents).size > 1,
    `the windows do not all move together: ${windowEvents.join(" · ")}`
  );
  const heroAxisEvents = (progress(0)?.activity?.byAxis ?? [])
    .map((bucket) => bucket.eventCount)
    .filter((n) => n > 0);
  check(
    heroAxisEvents.some((n) => n >= 20),
    `one axis carries a dense event list (${Math.max(0, ...heroAxisEvents)} events)`
  );
  check(
    (progress(0)?.activity?.byAxis ?? []).length < overview.counts.axes,
    "most axes carry no events at all (uneven activity)"
  );

  // ── empty subjects ────────────────────────────────────────────────────────────────────────────────
  const emptyTopic = overview.topics.find((row) => row.topic.name === SCALE_SUBJECTS.emptyTopic);
  check(Boolean(emptyTopic), "the empty topic (no axes) is present on the overview");
  check(
    emptyTopic && emptyTopic.axes.length === 0 && emptyTopic.people.length === 0 && (emptyTopic.activityCount ?? 0) === 0,
    "the empty topic really carries no axes, no people and no activity"
  );
  const bare = overview.repositories.find(
    (row) => row.repository.fullName === SCALE_SUBJECTS.bareRepository
  );
  check(Boolean(bare), "the bare repository (no topic, no axis claims it) is present");
  check(bare && (bare.axes ?? []).length === 0 && (bare.topics ?? []).length === 0, "the bare repository draws no work");
  check(
    overview.repositories.some((row) => (row.axes ?? []).length > 0),
    "a populated repository exists — the Repositories selection has a target"
  );
  check(
    overview.people.some((row) => !row.person.nakamaUserId),
    "a person with no mapped account is present"
  );
  check(
    overview.people.some((row) => row.topics.length > 1),
    "a person spanning more than one topic is present"
  );
  const evidenceFree = axes(0).find((row) => row.title === SCALE_SUBJECTS.evidenceFreeAxis);
  check(Boolean(evidenceFree), "the evidence-free axis is present in Progress");
  check(
    evidenceFree && evidenceFree.state === "draft" && evidenceFree.stateConfidence === "inferred",
    "the evidence-free axis reads as draft/inferred, not as a guess"
  );
  check(
    overview.blocked.length > 0,
    `blocked axes are present (${overview.blocked.length}) — the blocker sentence renders`
  );

  // ── long labels: past the comfortable width, inside the schema's own limits ───────────────────────
  check(
    overview.topics.some((row) => row.topic.name.length > 100),
    "a topic name long enough to wrap is present"
  );
  check(axes(0).some((row) => row.title.length > 100), "an axis title long enough to wrap is present");
  check(
    overview.repositories.some((row) => row.repository.fullName.length > 100),
    "a repository name long enough to wrap is present"
  );
  check(
    overview.people.some((row) => row.person.displayName.length > 80),
    "a person display name long enough to wrap is present"
  );
  check(problems(0).some((row) => row.statement.length > 1000), "a long problem statement is present");
  check(
    (progress(0)?.activity?.byAxis ?? []).some((bucket) =>
      (bucket.events ?? []).some((event) => (event.summary ?? "").length > 500)
    ),
    "a long activity summary is present"
  );

  // ── the second pass: id-resolved links landed ─────────────────────────────────────────────────────
  const hero = problems(0).find((row) => row.statement === SCALE_SUBJECTS.heroProblem);
  check(Boolean(hero), "the hero problem is present");
  check(
    hero && hero.planStepId && hero.planStepTitle,
    "the hero problem is linked to its plan step"
  );
  check(hero && (hero.repositories ?? []).length >= 2, "the hero problem names two repositories");
  check(hero && (hero.people ?? []).length >= 1, "the hero problem names a person");
  check(hero && (hero.evidence ?? []).length >= 1, "the hero problem carries its evidence");
  check(hero && (hero.steering ?? []).length >= 1, "the hero problem carries its human steering claim");
  const supportless = problems(0).find((row) => row.statement === SCALE_SUBJECTS.supportlessProblem);
  check(Boolean(supportless), "the support-less problem is present");
  check(
    supportless && (supportless.repositories ?? []).length === 0 && supportless.planStepId === null && (supportless.evidence ?? []).length === 0,
    "the support-less problem carries no repository, no plan step and no artifact"
  );
  check(
    problems(0).some((row) => row.state === "resolved"),
    "a resolved problem exists — the inventory has a row it must exclude"
  );
  check(axes(0).some((row) => (row.plan?.steps ?? []).length >= 2), "a plan with steps sits above the problems");

  // ── every window the page can ask for answers, and every problem names a markable subject ─────────
  for (const days of windows) {
    check(problems(days).length > 0, `window ${days}: Progress has problem rows`);
    check(axes(days).length > 0, `window ${days}: Progress has axis rows`);
  }
  check(
    problems(0).every((row) => row.statement && row.axisTitle && row.topicName),
    "every problem carries its statement, axis and topic"
  );
  check(
    problems(0).some((row) => (row.repositories ?? []).length > 0),
    "the Progress selection has a supported problem to find"
  );
  check(
    axes(0).some((row) => row.openProblems > 0),
    "the Progress axis selection has a target with open problems"
  );
} finally {
  rmSync(dir, { force: true, recursive: true });
}

if (failures > 0) {
  console.error(`test-scale-fixture: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("test-scale-fixture: all assertions passed");
