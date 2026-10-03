#!/usr/bin/env bun
/**
 * make-fixtures.mjs — build the preview's payloads from a *committed* dataset, locally.
 *
 * The preview needs `get_overview`, `get_progress` and `get_topic` results, and it must not invent
 * them: a preview fed hand-written JSON drifts from what the server would answer, and then the
 * preview lies about the thing it exists to show. So this script builds a real database, applies the
 * shipped migrations, replays a dataset's own action transcript through the **real action layer**
 * (`src/actions.ts`), then asks that same layer for the three read payloads and writes them out.
 *
 * Datasets:
 *   corpus  (default) — `docs/corpus/transcript/actions.jsonl`, the corpus's own record (695 calls).
 *   fixture           — the synthetic edge-state pack declared in `harness/apply-layout-fixture.mjs`.
 *
 * Nothing here touches a server: the store is testable without a host, and that is the whole trick.
 *
 *   bun harness/preview/make-fixtures.mjs --dataset corpus --out harness/preview/fixtures.json
 */
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const DATASET = flag("dataset", "corpus");
const OUT = flag("out", path.join(HERE, "fixtures.json"));
const WINDOW_DAYS = Number(flag("window", "14"));

// ── a database as the platform would hand it to the plugin: every migration applied, in order ──────
const MIGRATIONS_DIR = path.join(REPO, "migrations");
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => [name, readFileSync(path.join(MIGRATIONS_DIR, name), "utf8")]);

const dataDir = mkdtempSync(path.join(tmpdir(), "rd-preview-"));
const databasePath = path.join(dataDir, "preview.sqlite");
{
  const db = new Database(databasePath);
  try {
    for (const [, sql] of MIGRATIONS) {
      db.exec(sql);
    }
  } finally {
    db.close();
  }
}

const { run } = await import(path.join(REPO, "src/actions.ts"));

const context = (actionKey) => ({
  actionKey,
  actor: { id: "preview-seed", role: "admin" },
  apiVersion: 1,
  dataDir,
  databasePath,
  host: async () => ({}),
  invocationId: crypto.randomUUID(),
  orgId: "preview",
  pluginId: "research-dashboard",
  pluginVersion: "0.0.0-preview",
});

/** Run one action and fail loudly — a preview built from a swallowed error is a preview of nothing. */
async function call(action, input) {
  const result = await run(input, context(action));
  if (result && typeof result === "object" && result.ok === false) {
    throw new Error(`${action} refused: ${result.error ?? "unknown"}`);
  }
  return result;
}

// ── the dataset's own write transcript ─────────────────────────────────────────────────────────────
// The plain writes are replayed here; the states a dataset *derives* (below) come from the same sources
// the instance is seeded from, never from a second copy of the dataset.
let rows = null;
let derived = null;
let writes;
if (DATASET === "corpus") {
  const transcript = path.join(REPO, "docs/corpus/transcript/actions.jsonl");
  rows = readFileSync(transcript, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record.action !== undefined)
    .map((record) => ({ action: record.action, input: record.input ?? {} }));
  // The same derivation `harness/replay-corpus.mjs` applies: each activity takes its repository from
  // its own `sourceUrl`, and the corpus's unmerged pull requests become its problems. The derived block
  // mutates `rows`, flagging the PR rows it moves to the problem write path.
  const { deriveCorpusProblems } = await import(path.join(HERE, "corpus-derivation.mjs"));
  derived = deriveCorpusProblems(rows);
  writes = rows.filter((row) => !row.movedToProblem);
} else if (DATASET === "fixture") {
  const { layoutFixtureCalls } = await import(
    path.join(HERE, "layout-fixture-calls.mjs")
  );
  writes = layoutFixtureCalls();
} else {
  console.error(`make-fixtures: --dataset wants 'corpus' or 'fixture', got '${DATASET}'`);
  process.exit(2);
}

const counts = new Map();
for (const { action, input } of writes) {
  await call(action, input);
  counts.set(action, (counts.get(action) ?? 0) + 1);
}

// ── the states a dataset derives, which no single call can express ─────────────────────────────────
// A problem is named by an id the store mints, so both datasets write theirs in a second pass and read
// the ids back from the projection. Neither derivation is restated here: the corpus's is sliced out of
// `harness/replay-corpus.mjs` (corpus-derivation.mjs) and the fixture's out of
// `harness/apply-layout-fixture.mjs` (fixture-e-calls.mjs), so the preview cannot drift from the seed.
let derivedProblems = 0;
let derivedEvents = 0;
if (DATASET === "corpus" && derived.derivedProblems.length > 0) {
  const topicName =
    rows.find((row) => row.action === "reconcile_topic")?.input?.topicName ?? "UDV Echo Process";
  await call("reconcile_topic", { topicName, problems: derived.derivedProblems });
  const created = (await call("get_progress", { activitySinceDays: 0 })).problems?.problems ?? [];
  const activities = derived.linkedActivities.map(({ statement, ...activity }) => {
    const match = created.find((problem) => problem.statement === statement);
    if (!match) {
      throw new Error(
        `make-fixtures: no problem carries the statement the pull request states (${JSON.stringify(statement)}) — ` +
          "the derivation and the projection disagree"
      );
    }
    return { ...activity, problemId: match.id };
  });
  await call("reconcile_topic", { topicName, activities });
  derivedProblems = derived.derivedProblems.length;
  derivedEvents = activities.length;
} else if (DATASET === "fixture") {
  const { applyFixtureEWith } = await import(path.join(HERE, "fixture-e-calls.mjs"));
  // The dispatcher does not throw on a refusal: `applyFixtureE`'s own `act` reads `ok` and reports the
  // failure, which is how the seeded instance sees it too. Only a non-zero return is fatal here.
  const applyFixtureE = applyFixtureEWith(async (key, input) => run(input, context(key)));
  const refused = await applyFixtureE({});
  if (refused !== 0) {
    throw new Error("make-fixtures: Fixture E could not be applied — see the fixture E line above");
  }
  derivedProblems =
    (await call("get_progress", { activitySinceDays: 0 })).problems?.problems?.length ?? 0;
}

// ── the read payloads the page fetches ─────────────────────────────────────────────────────────────
// The window is the page's only query-level control, so every window it offers gets a real payload —
// otherwise clicking "30 days" would answer with a missing-fixture error and the preview would be
// lying about the control it is supposed to let you judge.
const WINDOWS = [7, 14, 30, 0];
const reads = {};
const overviews = {};
for (const days of WINDOWS) {
  overviews[days] = await call("get_overview", { activitySinceDays: days });
  reads[`get_overview:${days}`] = overviews[days];
  reads[`get_progress:${days}`] = await call("get_progress", { activitySinceDays: days });
}
const overview = overviews[WINDOW_DAYS] ?? overviews[14];

const topics = {};
// Each overview row is `{ topic: TopicRef, axes, people, repositories, … }` — the topic itself is
// nested, and its `id` is what `get_topic` wants.
for (const row of overview.topics ?? []) {
  const topicId = row.topic?.id;
  if (topicId) {
    reads[`get_topic:${topicId}`] = await call("get_topic", { topicId });
  }
}

const fixtures = {
  dataset: DATASET,
  builtAt: new Date().toISOString(),
  migrations: MIGRATIONS.map(([name]) => name),
  windowDays: WINDOW_DAYS,
  writes: Object.fromEntries(counts),
  /** Problems the dataset derives rather than states in one call (corpus PRs / fixture E), and the
   *  events that name them. Non-zero for both datasets is what makes the Progress view meaningful. */
  derived: { events: derivedEvents, problems: derivedProblems },
  /** Keyed `<action>:<window|topicId>`; the preview host resolves a call to one of these. */
  responses: reads,
  /** Which topic the preview should open first, so a re-run lands on the same screen. */
  subjectTopicId: overview.topics?.[0]?.topic?.id ?? null,
};

writeFileSync(OUT, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(
  `make-fixtures: ${DATASET} — replayed ${writes.size ?? writes.length} calls ` +
    `(${[...counts].map(([k, v]) => `${k}×${v}`).join(", ")})`
);
console.log(
  `  topics ${overview.topics?.length ?? 0} · ` +
    `axes ${overview.counts?.axes ?? "?"} · ` +
    `people ${overview.people?.length ?? 0} · repositories ${overview.repositories?.length ?? 0}`
);
console.log(
  `  derived ${derivedProblems} problem(s)` +
    (derivedEvents > 0 ? ` · ${derivedEvents} problem-linked event(s)` : "") +
    ` · Progress problems in the payload: ${(reads[`get_progress:${WINDOW_DAYS}`]?.problems?.problems ?? []).length}`
);
console.log(`  wrote ${path.relative(REPO, OUT)}`);
