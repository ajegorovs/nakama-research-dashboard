/**
 * Regression tests for the independent-review findings on the dashboard task/plan/text/read contract.
 *
 * Four concrete findings are pinned here:
 *  1. Activity/problem pairing is centralized in `insertActivity`, so `reconcileTopic` cannot store an
 *     activity whose `problem_id` contradicts the row's own `axis_id`/`topic_id` — and a refusal writes
 *     nothing.
 *  2. `get_progress`'s `activityPage`/`problemPage` siblings carry the **same** archived-topic scope and
 *     activity window as the `activity`/`problems` arrays beside them.
 *  3. `progressAxes` picks an axis's plan deterministically by `created_at, id` (the order `planForAxis`
 *     uses), not `.at(-1)` over an unordered read.
 *  4. (Doc-only — see `docs/design/dashboard-minimal-implementation-design.md`; no runtime assertion.)
 *
 * Built from the shipped migrations 001–006, so every test runs against the schema the host applies.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./actions";
import {
  type Axis,
  type Problem,
  ResearchStore,
  ResearchStoreError,
  type Topic,
} from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
  "006-task-plan-text.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

function openStore(): { path: string; store: ResearchStore } {
  const path = `${process.env.TMPDIR ?? "/tmp"}/review-findings-${crypto.randomUUID()}.sqlite`;
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return { path, store: new ResearchStore(path) };
}

/** A topic with two active axes, so a same-topic cross-axis mismatch can be built. */
function seedPair(
  store: ResearchStore,
  name = "Topic A"
): { a2: Axis; axis: Axis; topic: Topic } {
  const topic = store.createTopic({ name });
  const axis = store.createAxis({
    branch: "b1",
    kind: "experiment",
    state: "active",
    title: "First axis",
    topicId: topic.id,
  });
  const a2 = store.createAxis({
    branch: "b2",
    kind: "experiment",
    state: "active",
    title: "Second axis",
    topicId: topic.id,
  });
  return { a2, axis, topic };
}

function caught(fn: () => unknown): Error | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error as Error;
  }
}

type RunContext = Parameters<typeof run>[1];
function contextFor(actionKey: string, databasePath: string): RunContext {
  return {
    actionKey,
    actor: { id: "user-1", role: "member" },
    databasePath,
    host: () => Promise.resolve({}),
    orgId: "org-test",
  } as unknown as RunContext;
}

async function call(
  actionKey: string,
  input: Record<string, unknown>,
  path: string
): Promise<Record<string, unknown>> {
  return (await run(input, contextFor(actionKey, path))) as Record<string, unknown>;
}

// ----------------------------------- Finding 1: pairing centralized in insertActivity

describe("Finding 1 — reconcile activity pairing cannot be bypassed", () => {
  test("a reconcile activity on another axis of the same topic is refused, and nothing is written", () => {
    const { store } = openStore();
    const { axis, a2, topic } = seedPair(store);
    const taskOnA2 = store.createProblem({
      axisId: a2.id,
      authorType: "human",
      statement: "Task on the second axis.",
    });

    const error = caught(() =>
      store.reconcileTopic({
        actor: { id: "agent", type: "agent" },
        activities: [
          { axisId: axis.id, problemId: taskOnA2.id, summary: "mismatched pair" },
        ],
        topicId: topic.id,
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect((error as ResearchStoreError).code).toBe("invalid-input");
    // No activity landed: the whole reconcile transaction rolled back.
    expect(store.activityPage({ topicId: topic.id }, { limit: 50 }).total).toBe(0);
  });

  test("a reconcile activity naming a cross-topic problem with no axis is refused, and nothing is written", () => {
    const { store } = openStore();
    const a = seedPair(store, "Topic A");
    const b = seedPair(store, "Topic B");
    const taskOnB = store.createProblem({
      axisId: b.axis.id,
      authorType: "human",
      statement: "Task on B.",
    });

    const error = caught(() =>
      store.reconcileTopic({
        actor: { id: "agent", type: "agent" },
        activities: [{ problemId: taskOnB.id, summary: "cross-topic" }],
        topicId: a.topic.id,
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect((error as ResearchStoreError).code).toBe("invalid-input");
    // Nothing anywhere: not on A (the reconciling topic) and not on B (the problem's topic).
    expect(store.activityPage({}, { limit: 50 }).total).toBe(0);
  });

  test("a well-formed same-axis reconcile activity still lands (the guard is a pairing rule, not a block)", () => {
    const { store } = openStore();
    const { a2, topic } = seedPair(store);
    const taskOnA2 = store.createProblem({
      axisId: a2.id,
      authorType: "human",
      statement: "Task on the second axis.",
    });

    const result = store.reconcileTopic({
      actor: { id: "agent", type: "agent" },
      activities: [
        { axisId: a2.id, problemId: taskOnA2.id, summary: "valid pairing" },
      ],
      topicId: topic.id,
    });
    expect(result.recorded.activities).toHaveLength(1);
    const page = store.activityPage({ axisId: a2.id }, { limit: 50 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.problemId).toBe(taskOnA2.id);
    expect(page.items[0]?.axisId).toBe(a2.id);
  });

  test("addActivity still refuses a cross-axis pairing after the guard moved into insertActivity", () => {
    const { store } = openStore();
    const { axis, a2, topic } = seedPair(store);
    const taskOnA2 = store.createProblem({
      axisId: a2.id,
      authorType: "human",
      statement: "Task on the second axis.",
    });

    const error = caught(() =>
      store.addActivity({
        axisId: axis.id,
        problemId: taskOnA2.id,
        summary: "mismatch",
        topicId: topic.id,
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect((error as ResearchStoreError).code).toBe("invalid-input");
    expect(store.activityPage({}, { limit: 50 }).total).toBe(0);
  });
});

// ------------------------------- Finding 2: page siblings share the view's scope

describe("Finding 2 — get_progress page siblings match the view arrays' scope", () => {
  async function scenario(): Promise<{
    path: string;
    activeTask: Problem;
    archivedTask: Problem;
  }> {
    const { path, store } = openStore();
    const a = seedPair(store, "Topic A");
    const b = seedPair(store, "Topic B");
    const activeTask = store.createProblem({
      axisId: a.axis.id,
      authorType: "agent",
      statement: "active-topic task",
    });
    const archivedTask = store.createProblem({
      axisId: b.axis.id,
      authorType: "agent",
      statement: "archived-topic task",
    });
    // One recent activity on each topic, so both arrays have something to (not) show.
    store.addActivity({ axisId: a.axis.id, summary: "active activity", topicId: a.topic.id });
    store.addActivity({ axisId: b.axis.id, summary: "archived activity", topicId: b.topic.id });
    store.updateTopic(b.topic.id, { status: "archived" });
    store.close();
    return { activeTask, archivedTask, path };
  }

  test("archived topics are excluded from both the array and the page, and their totals agree", async () => {
    const { activeTask, archivedTask, path } = await scenario();
    const progress = await call("get_progress", { offset: 0, pageSize: 50 }, path);

    const arrayProblems = (progress.problems as { problems: Problem[] }).problems;
    const problemPage = progress.problemPage as { items: Problem[]; total: number };
    const arrayActivity = (
      progress.activity as { byAxis: Array<{ eventCount: number }> }
    ).byAxis.reduce((sum, bucket) => sum + bucket.eventCount, 0);
    const activityPage = progress.activityPage as { items: unknown[]; total: number };

    // The array excludes the archived topic's task; the page must agree.
    expect(arrayProblems.map((row) => row.id)).toEqual([activeTask.id]);
    expect(problemPage.total).toBe(1);
    expect(problemPage.items.map((row) => row.id)).toEqual([activeTask.id]);
    expect(problemPage.items.some((row) => row.id === archivedTask.id)).toBe(false);

    // Same for activity: the page's count equals the array's in-window event count.
    expect(arrayActivity).toBe(1);
    expect(activityPage.total).toBe(1);
    expect(activityPage.items).toHaveLength(1);
  });

  test("includeArchived:true surfaces the archived topic in both the array and the page", async () => {
    const { activeTask, archivedTask, path } = await scenario();
    const progress = await call(
      "get_progress",
      { includeArchived: true, offset: 0, pageSize: 50 },
      path
    );

    const arrayProblems = (progress.problems as { problems: Problem[] }).problems;
    const problemPage = progress.problemPage as { items: Problem[]; total: number };
    const activityPage = progress.activityPage as { total: number };

    expect(new Set(arrayProblems.map((row) => row.id))).toEqual(
      new Set([activeTask.id, archivedTask.id])
    );
    expect(problemPage.total).toBe(2);
    expect(new Set(problemPage.items.map((row) => row.id))).toEqual(
      new Set([activeTask.id, archivedTask.id])
    );
    expect(activityPage.total).toBe(2);
  });

  test("the page honors the same activity window as the array (an out-of-window event is in neither)", async () => {
    const { path, store } = openStore();
    const a = seedPair(store, "Topic A");
    store.addActivity({
      axisId: a.axis.id,
      occurredAt: "2020-01-01T00:00:00.000Z",
      summary: "old activity",
      topicId: a.topic.id,
    });
    store.addActivity({ axisId: a.axis.id, summary: "recent activity", topicId: a.topic.id });
    store.close();

    // No activitySinceDays sent: the rollups default to a 14-day window, and the page must match.
    const defaulted = await call("get_progress", { offset: 0, pageSize: 50 }, path);
    const defaultPage = defaulted.activityPage as { total: number };
    const defaultArray = (
      defaulted.activity as { byAxis: Array<{ eventCount: number }> }
    ).byAxis.reduce((sum, bucket) => sum + bucket.eventCount, 0);
    expect(defaultArray).toBe(1);
    expect(defaultPage.total).toBe(1);

    // activitySinceDays:0 is "all time" for the array; the page must widen with it.
    const allTime = await call(
      "get_progress",
      { activitySinceDays: 0, offset: 0, pageSize: 50 },
      path
    );
    const allPage = allTime.activityPage as { total: number };
    const allArray = (
      allTime.activity as { byAxis: Array<{ eventCount: number }> }
    ).byAxis.reduce((sum, bucket) => sum + bucket.eventCount, 0);
    expect(allArray).toBe(2);
    expect(allPage.total).toBe(2);
  });
});

// ------------------------- Finding 4: progressAxes latest-plan selection is ordered

describe("Finding 4 — progressAxes selects an axis's latest plan deterministically", () => {
  test("with tied created_at the greater id wins, matching planForAxis", () => {
    const { path, store } = openStore();
    const { axis } = seedPair(store);
    // Two plans on one axis, same `created_at`. Insert the greater id FIRST so a rowid-ordered
    // `.at(-1)` would pick the smaller id while the explicit `created_at, id` max picks the greater.
    // Written directly so the tie is exact (the public writer only stamps `now`).
    const raw = new Database(path);
    raw.exec(
      `INSERT INTO plans (id, summary, author_type, author_id, version, created_at, updated_at)
       VALUES ('plan-zzz', 'greater id', 'human', '', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
              ('plan-aaa', 'smaller id', 'human', '', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`
    );
    raw.exec(
      `INSERT INTO plan_owners (plan_id, topic_id, axis_id, problem_id)
       VALUES ('plan-zzz', NULL, '${axis.id}', NULL),
              ('plan-aaa', NULL, '${axis.id}', NULL);`
    );
    raw.close();

    const row = store
      .progressAxes({ activitySinceDays: 0 })
      .axes.find((candidate) => candidate.id === axis.id);
    // The axis card picks the greater-id plan under the tie.
    expect(row?.plan?.id).toBe("plan-zzz");
    // And it agrees with the explicit axis-plan read (created_at, id) — the semantics it must mirror.
    expect(store.planForAxis(axis.id)?.plan.id).toBe("plan-zzz");
  });
});
