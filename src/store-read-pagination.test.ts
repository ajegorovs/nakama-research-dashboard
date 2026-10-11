/**
 * The read/pagination additions: independent task counts, task/plan/text projections on the detail,
 * Progress and search reads, and the scoped page reads (`activityPage`/`problemPage`).
 *
 * Built from the shipped migrations 001–006, so every test runs against the schema the host applies. The
 * page tests are the point of §6: `items` and `total` must come from one predicate in one snapshot, the
 * ordering must be the portable `id` tie-break (never `rowid`), and the existing array reads must be
 * unchanged when no paging input is sent.
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

function freshPath(): string {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-read-${crypto.randomUUID()}.sqlite`;
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return path;
}

function openStore(): ResearchStore {
  return new ResearchStore(freshPath());
}

/** A topic with one active axis, with an authored description on the axis. */
function seed(
  store: ResearchStore,
  name = "Turbulence modelling",
  description = "Close the subgrid model."
): { axis: Axis; topic: Topic } {
  const topic = store.createTopic({ name });
  const axis = store.createAxis({
    branch: "data/subgrid-closure",
    description,
    kind: "experiment",
    state: "active",
    title: "Subgrid closure",
    topicId: topic.id,
  });
  return { axis, topic };
}

function addActivity(
  store: ResearchStore,
  axis: Axis,
  topic: Topic,
  summary: string,
  occurredAt?: string
) {
  return store.addActivity({
    axisId: axis.id,
    occurredAt,
    summary,
    topicId: topic.id,
  });
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

// ----------------------------------------------------------------- activities

describe("§6 activity page — coverage, ordering, bounds", () => {
  test("12 rows read as 5/5/2: disjoint, covering, with exact totals and hasMore", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    for (let i = 1; i <= 12; i += 1) {
      const day = String(i).padStart(2, "0");
      addActivity(store, axis, topic, `event ${i}`, `2026-03-${day}T00:00:00.000Z`);
    }

    const p0 = store.activityPage({ axisId: axis.id }, { limit: 5, offset: 0 });
    const p1 = store.activityPage({ axisId: axis.id }, { limit: 5, offset: 5 });
    const p2 = store.activityPage({ axisId: axis.id }, { limit: 5, offset: 10 });

    expect([p0.items.length, p1.items.length, p2.items.length]).toEqual([5, 5, 2]);
    expect([p0.total, p1.total, p2.total]).toEqual([12, 12, 12]);
    expect([p0.hasMore, p1.hasMore, p2.hasMore]).toEqual([true, true, false]);

    const ids = [...p0.items, ...p1.items, ...p2.items].map((row) => row.id);
    expect(new Set(ids).size).toBe(12);
    // Nothing from topic B could be here, and every row names this axis.
    expect([...p0.items, ...p1.items, ...p2.items].every((row) => row.axisId === axis.id)).toBe(true);

    // Ordering is occurred_at DESC: the concatenation is non-increasing.
    const times = [...p0.items, ...p1.items, ...p2.items].map((row) => row.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  test("an out-of-range offset is an empty page, not an error", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    for (let i = 1; i <= 3; i += 1) {
      addActivity(store, axis, topic, `e${i}`, `2026-03-0${i}T00:00:00.000Z`);
    }
    const page = store.activityPage({ axisId: axis.id }, { offset: 99 });
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(3);
    expect(page.limit).toBe(5);
    expect(page.offset).toBe(99);
  });

  test("a same-instant tie is broken by id DESC and repeated reads are identical", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    const at = "2026-04-01T00:00:00.000Z";
    addActivity(store, axis, topic, "a", at);
    addActivity(store, axis, topic, "b", at);
    addActivity(store, axis, topic, "c", at);

    const first = store.activityPage({ axisId: axis.id }, { limit: 10 });
    const ids = first.items.map((row) => row.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(first.items.map((row) => row.occurredAt)).toEqual([at, at, at]);

    const again = store.activityPage({ axisId: axis.id }, { limit: 10 });
    expect(again.items.map((row) => row.id)).toEqual(ids);
  });

  test("scope isolation and the window predicate are the same predicate as the total", () => {
    const store = openStore();
    const a = seed(store, "Topic A");
    const b = seed(store, "Topic B");
    // A: two recent, B: one recent.
    addActivity(store, a.axis, a.topic, "a-recent-1");
    addActivity(store, a.axis, a.topic, "a-recent-2");
    addActivity(store, b.axis, b.topic, "b-recent");
    // A: one old row, outside a 7-day window.
    addActivity(store, a.axis, a.topic, "a-old", "2020-01-01T00:00:00.000Z");

    const scopedA = store.activityPage({ topicId: a.topic.id }, { limit: 50 });
    expect(scopedA.total).toBe(3);
    expect(scopedA.items.every((row) => row.topicId === a.topic.id)).toBe(true);

    const scopedB = store.activityPage({ topicId: b.topic.id }, { limit: 50 });
    expect(scopedB.total).toBe(1);
    expect(scopedB.items.map((row) => row.summary)).toEqual(["b-recent"]);

    // The window narrows `items` and `total` together.
    const windowed = store.activityPage(
      { topicId: a.topic.id, sinceDays: 7 },
      { limit: 50 }
    );
    expect(windowed.total).toBe(2);
    expect(windowed.items.some((row) => row.summary === "a-old")).toBe(false);
  });

  test("an invalid offset or pageSize is refused with invalid-input", () => {
    const store = openStore();
    const { axis } = seed(store);
    for (const bad of [
      () => store.activityPage({ axisId: axis.id }, { offset: -1 }),
      () => store.activityPage({ axisId: axis.id }, { limit: 0 }),
      () => store.activityPage({ axisId: axis.id }, { limit: 101 }),
    ]) {
      const error = caught(bad);
      expect(error instanceof ResearchStoreError).toBe(true);
      expect((error as ResearchStoreError).code).toBe("invalid-input");
    }
  });
});

// ---------------------------------------------------------------------- tasks

describe("§6 task page — coverage, ordering, bounds", () => {
  test("12 tasks read as 5/5/2, ordered created_at ASC then id ASC", () => {
    const store = openStore();
    const { axis } = seed(store);
    for (let i = 1; i <= 12; i += 1) {
      store.createProblem({
        axisId: axis.id,
        authorType: "agent",
        statement: `task ${i}`,
      });
    }

    const p0 = store.problemPage({ axisId: axis.id }, { limit: 5, offset: 0 });
    const p1 = store.problemPage({ axisId: axis.id }, { limit: 5, offset: 5 });
    const p2 = store.problemPage({ axisId: axis.id }, { limit: 5, offset: 10 });

    expect([p0.items.length, p1.items.length, p2.items.length]).toEqual([5, 5, 2]);
    expect([p0.total, p1.total, p2.total]).toEqual([12, 12, 12]);
    expect([p0.hasMore, p1.hasMore, p2.hasMore]).toEqual([true, true, false]);

    const all = [...p0.items, ...p1.items, ...p2.items];
    expect(new Set(all.map((row) => row.id)).size).toBe(12);
    // created_at ASC, id ASC — a portable order, checkable from the returned rows.
    for (let i = 1; i < all.length; i += 1) {
      const prev = all[i - 1] as Problem;
      const next = all[i] as Problem;
      const ordered =
        prev.createdAt < next.createdAt ||
        (prev.createdAt === next.createdAt && prev.id < next.id);
      expect(ordered).toBe(true);
    }

    const beyond = store.problemPage({ axisId: axis.id }, { offset: 99 });
    expect(beyond.items).toEqual([]);
    expect(beyond.hasMore).toBe(false);
    expect(beyond.total).toBe(12);
  });

  test("axis scope and topic scope isolate tasks; an invalid page input is refused", () => {
    const store = openStore();
    const a = seed(store, "Topic A");
    const b = seed(store, "Topic B");
    const taskA = store.createProblem({
      axisId: a.axis.id,
      authorType: "agent",
      statement: "on A",
    });
    const taskB = store.createProblem({
      axisId: b.axis.id,
      authorType: "agent",
      statement: "on B",
    });

    const axisA = store.problemPage({ axisId: a.axis.id }, { limit: 50 });
    expect(axisA.items.map((row) => row.id)).toEqual([taskA.id]);
    const topicB = store.problemPage({ topicId: b.topic.id }, { limit: 50 });
    expect(topicB.items.map((row) => row.id)).toEqual([taskB.id]);

    for (const bad of [
      () => store.problemPage({ axisId: a.axis.id }, { offset: -5 }),
      () => store.problemPage({ axisId: a.axis.id }, { limit: 0 }),
      () => store.problemPage({ axisId: a.axis.id }, { limit: 101 }),
    ]) {
      const error = caught(bad);
      expect(error instanceof ResearchStoreError).toBe(true);
      expect((error as ResearchStoreError).code).toBe("invalid-input");
    }
  });
});

describe("§6 enriched task page — the visible cards' own rows, scoped to the page", () => {
  test("taskPage colours only the returned rows with each task's own plan and step", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    const planned = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "has its own plan",
      title: "Planned task",
    });
    const other = store.createProblem({
      axisId: axis.id,
      authorType: "agent",
      statement: "bare task",
    });
    // An axis plan exists and must never be inherited by a task's page row.
    store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "Workstream plan",
    });
    const taskPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "problem", problemId: planned.id },
      summary: "Task plan",
    });
    addActivity(store, axis, topic, "touching the axis");

    const page = store.taskPage({ axisId: axis.id }, { limit: 5, offset: 0 });
    // Same predicate and total as the bare page.
    expect(page.total).toBe(2);
    expect(page.items.map((row) => row.id).sort()).toEqual([planned.id, other.id].sort());
    const plannedRow = page.items.find((row) => row.id === planned.id);
    expect(plannedRow?.title).toBe("Planned task");
    expect(plannedRow?.plan?.plan.id).toBe(taskPlan.id);
    const bareRow = page.items.find((row) => row.id === other.id);
    expect(bareRow?.plan).toBeNull();
    expect(bareRow?.repositories).toEqual([]);
    expect(bareRow?.people).toEqual([]);
  });

  test("taskPage enriches only the page's own rows; totals/hasMore match problemPage", () => {
    const store = openStore();
    const { axis } = seed(store);
    for (let i = 1; i <= 12; i += 1) {
      store.createProblem({ axisId: axis.id, authorType: "agent", statement: `task ${i}` });
    }
    const bare0 = store.problemPage({ axisId: axis.id }, { offset: 0 });
    const bare2 = store.problemPage({ axisId: axis.id }, { offset: 10 });
    const page0 = store.taskPage({ axisId: axis.id }, { offset: 0 });
    const page2 = store.taskPage({ axisId: axis.id }, { offset: 10 });

    expect(page0.items).toHaveLength(5);
    expect(page2.items).toHaveLength(2);
    expect([page0.total, page2.total]).toEqual([bare0.total, bare2.total]);
    expect([page0.hasMore, page2.hasMore]).toEqual([true, false]);
    // Identical ordering to the bare page: the enrichment adds fields, never reorders.
    expect(page0.items.map((row) => row.id)).toEqual(bare0.items.map((row) => row.id));
    expect(page2.items.map((row) => row.id)).toEqual(bare2.items.map((row) => row.id));
    const ids = [...page0.items, ...page2.items].map((row) => row.id);
    expect(new Set(ids).size).toBe(7);
  });
});

// ------------------------------------------------------------- read projections

describe("§5 read projections", () => {
  test("getOverview.problemsByState splits stored states and does not move with limit", () => {
    const store = openStore();
    const { axis } = seed(store);
    store.createProblem({ axisId: axis.id, authorType: "human", statement: "open one" });
    store.createProblem({
      axisId: axis.id,
      authorType: "human",
      state: "blocked",
      statement: "blocked one",
    });
    store.createProblem({
      axisId: axis.id,
      authorType: "human",
      state: "resolved",
      statement: "resolved one",
    });

    const narrow = store.getOverview({ limit: 1 });
    const wide = store.getOverview({ limit: 50 });
    expect(narrow.problemsByState).toEqual({ blocked: 1, open: 1, resolved: 1 });
    expect(wide.problemsByState).toEqual(narrow.problemsByState);
  });

  test("getTopicDetail carries the project plan and each task's own plan, never an inherited one", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    const withPlan = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "has its own plan",
      title: "Task label",
    });
    const withoutPlan = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "no plan of its own",
    });

    const projectPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "topic", topicId: topic.id },
      summary: "Project plan",
    });
    // An axis plan exists too — it must never be shown as a task's plan.
    store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "Workstream plan",
    });
    const taskPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "problem", problemId: withPlan.id },
      summary: "Task plan",
    });

    const detail = store.getTopicDetail(topic.id);
    expect(detail.plan?.plan.id).toBe(projectPlan.id);

    const problems = detail.axes[0]?.problems ?? [];
    const planned = problems.find((row) => row.id === withPlan.id);
    const bare = problems.find((row) => row.id === withoutPlan.id);
    expect(planned?.title).toBe("Task label");
    expect(planned?.plan?.plan.id).toBe(taskPlan.id);
    // No inheritance: the axis plan is not attached to a task that owns none.
    expect(bare?.plan).toBeNull();
  });

  test("getAxisWorkstream attaches a task's own plan and title beside the axis plan", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    const task = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "task body",
      title: "task title",
    });
    const taskPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "problem", problemId: task.id },
      summary: "task plan",
    });

    const ws = store.getAxisWorkstream(topic.id, axis.id);
    const row = ws.axis.problems[0];
    expect(row?.title).toBe("task title");
    expect(row?.plan?.plan.id).toBe(taskPlan.id);
  });

  test("ProgressAxisRow carries the enduring description; ProgressProblemRow carries title and own plan", () => {
    const store = openStore();
    const { axis, topic } = seed(store, "T", "The enduring purpose of this axis.");
    const task = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "task body",
      title: "progress title",
    });
    const taskPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "problem", problemId: task.id },
      summary: "task plan",
    });
    addActivity(store, axis, topic, "activity");

    const axisRow = store.progressAxes({ activitySinceDays: 0 }).axes[0];
    expect(axisRow?.description).toBe("The enduring purpose of this axis.");

    const problemRow = store.progressProblems({ activitySinceDays: 0 }).problems.find(
      (row) => row.id === task.id
    );
    expect(problemRow?.title).toBe("progress title");
    expect(problemRow?.plan?.id).toBe(taskPlan.id);
  });

  test("a scoped workstream read refuses an axis that belongs to another topic", () => {
    const store = openStore();
    const a = seed(store, "Topic A");
    const b = seed(store, "Topic B");
    const error = caught(() => store.getAxisWorkstream(a.topic.id, b.axis.id));
    expect(error instanceof ResearchStoreError).toBe(true);
    expect(String(error)).toContain("does not belong");
    // The page reads stay honest about their own scope too: B's axis is never inside A's scope.
    store.createProblem({
      axisId: b.axis.id,
      authorType: "agent",
      statement: "task on B",
    });
    expect(store.problemPage({ topicId: a.topic.id }, { limit: 50 }).items).toEqual([]);
  });

  test("searchDashboard finds a task by statement and by title, and truncates at the boundary", () => {
    const store = openStore();
    const { axis } = seed(store);
    store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "statement-only unique-alpha",
    });
    store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "body text",
      title: "title-only unique-beta",
    });

    const byStatement = store.searchDashboard({ query: "unique-alpha" });
    expect(byStatement.problems).toHaveLength(1);
    expect(byStatement.problems[0]?.matchedFields).toContain("statement");

    const byTitle = store.searchDashboard({ query: "unique-beta" });
    expect(byTitle.problems).toHaveLength(1);
    expect(byTitle.problems[0]?.matchedFields).toContain("title");

    // Two matches, a limit of one → truncated.
    store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "second unique-alpha row",
    });
    const bounded = store.searchDashboard({ limit: 1, query: "unique-alpha" });
    expect(bounded.problems).toHaveLength(1);
    expect(bounded.truncated).toBe(true);
  });
});

// ------------------------------------------------------------- action boundary

describe("§6 action boundary — opt-in paging", () => {
  test("old shapes are unchanged when no paging input is sent", async () => {
    const path = freshPath();
    const store = new ResearchStore(path);
    const { axis, topic } = seed(store);
    addActivity(store, axis, topic, "one");
    store.createProblem({ axisId: axis.id, authorType: "human", statement: "t" });

    const progress = await call("get_progress", {}, path);
    expect(Object.keys(progress).sort()).toEqual(["activity", "axes", "ok", "problems"]);

    const activity = await call("list_activity", { topicId: topic.id }, path);
    expect(Object.keys(activity).sort()).toEqual(["activity", "ok"]);

    const detail = await call("get_topic", { topicId: topic.id }, path);
    expect(Object.keys(detail)).not.toContain("activityPage");
  });

  test("paging input adds the page siblings, and invalid paging input is refused", async () => {
    const path = freshPath();
    const store = new ResearchStore(path);
    const { axis, topic } = seed(store);
    addActivity(store, axis, topic, "one");
    store.createProblem({ axisId: axis.id, authorType: "human", statement: "t" });

    const progress = await call("get_progress", { offset: 0, pageSize: 5 }, path);
    expect(Object.keys(progress)).toContain("activityPage");
    expect(Object.keys(progress)).toContain("problemPage");
    const activityPage = progress.activityPage as { items: unknown[]; total: number };
    expect(Array.isArray(activityPage.items)).toBe(true);
    expect(typeof activityPage.total).toBe("number");

    const scoped = await call(
      "get_topic",
      { axisId: axis.id, offset: 0, topicId: topic.id },
      path
    );
    expect(Object.keys(scoped)).toContain("activityPage");
    expect(Object.keys(scoped)).toContain("problemPage");

    const thread = await call("list_activity", { pageSize: 5, topicId: topic.id }, path);
    expect(Object.keys(thread)).toContain("activityPage");

    for (const input of [{ offset: -1 }, { pageSize: 0 }, { pageSize: 101 }]) {
      const refused = await call("list_activity", { ...input, topicId: topic.id }, path);
      expect(refused.ok).toBe(false);
      expect(refused.kind).toBe("invalid-input");
    }
  });
});

// --------------------------------------------- person / repository activity scopes
//
// The People and Repositories rails page the backend (`list_activity` + `offset`/`pageSize`), so the
// person (`personActorId` at the public action boundary; the store's internal predicate is `actorId`) and
// `repositoryId` scopes are load-bearing predicates, not decoration. The suites above pin
// the project (`topicId`) and workstream (`axisId`) scopes; these pin the two the other two views use,
// plus the combined-filter behaviour the page/array parity depends on.

describe("§6 activity page — person and repository scopes", () => {
  test("actorId scopes items and total to the recorded actor, newest-first, with an honest empty page", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    for (let i = 1; i <= 12; i += 1) {
      const day = String(i).padStart(2, "0");
      store.addActivity({
        actorId: i % 2 === 0 ? "user-even" : "user-odd",
        axisId: axis.id,
        occurredAt: `2026-05-${day}T00:00:00.000Z`,
        summary: `event ${i}`,
        topicId: topic.id,
      });
    }

    const even = store.activityPage({ actorId: "user-even" }, { limit: 50 });
    expect(even.total).toBe(6);
    expect(even.items).toHaveLength(6);
    expect(even.items.every((row) => row.actorId === "user-even")).toBe(true);
    // Ordering is the portable occurred_at DESC, id DESC even under a person scope.
    const times = even.items.map((row) => row.occurredAt);
    expect(times).toEqual([...times].sort().reverse());

    // The odd actor's rows are the disjoint complement.
    const odd = store.activityPage({ actorId: "user-odd" }, { limit: 50 });
    expect(odd.total).toBe(6);
    expect(new Set([...even.items, ...odd.items].map((row) => row.id)).size).toBe(12);

    // An actor with no recorded rows is an empty page, not an error.
    const ghost = store.activityPage({ actorId: "user-ghost" }, { limit: 50 });
    expect(ghost.items).toEqual([]);
    expect(ghost.total).toBe(0);
    expect(ghost.hasMore).toBe(false);
  });

  test("repositoryId scopes to rows carrying that repository; 12 rows read as 5/5/2 and unlinked rows never appear", () => {
    const store = openStore();
    const { axis, topic } = seed(store);
    const first = store.addActivity({
      axisId: axis.id,
      repositoryFullName: "owner/alpha",
      summary: "repo event 0",
      topicId: topic.id,
    });
    const repositoryId = first.repositoryId as string;
    expect(repositoryId).toBeTruthy();
    for (let i = 1; i <= 11; i += 1) {
      const day = String(i + 1).padStart(2, "0");
      store.addActivity({
        axisId: axis.id,
        occurredAt: `2026-06-${day}T00:00:00.000Z`,
        repositoryId,
        summary: `repo event ${i}`,
        topicId: topic.id,
      });
    }
    // A row with no repository must never leak into the repository's page or its total.
    store.addActivity({ axisId: axis.id, summary: "unlinked", topicId: topic.id });

    const p0 = store.activityPage({ repositoryId }, { offset: 0 });
    const p1 = store.activityPage({ repositoryId }, { offset: 5 });
    const p2 = store.activityPage({ repositoryId }, { offset: 10 });

    expect([p0.items.length, p1.items.length, p2.items.length]).toEqual([5, 5, 2]);
    expect([p0.total, p1.total, p2.total]).toEqual([12, 12, 12]);
    expect([p0.hasMore, p1.hasMore, p2.hasMore]).toEqual([true, true, false]);
    const all = [...p0.items, ...p1.items, ...p2.items];
    expect(new Set(all.map((row) => row.id)).size).toBe(12);
    expect(all.every((row) => row.repositoryId === repositoryId)).toBe(true);
    // Out-of-range stays an empty page with the correct total.
    const beyond = store.activityPage({ repositoryId }, { offset: 99 });
    expect(beyond.items).toEqual([]);
    expect(beyond.hasMore).toBe(false);
    expect(beyond.total).toBe(12);
  });

  test("combined filters AND together, and items and total share one predicate", () => {
    const store = openStore();
    const a = seed(store, "Topic A");
    const b = seed(store, "Topic B");
    const onRepoA = store.addActivity({
      actorId: "user-1",
      axisId: a.axis.id,
      repositoryFullName: "owner/alpha",
      summary: "a-repo-user1",
      topicId: a.topic.id,
    });
    const repositoryId = onRepoA.repositoryId as string;
    // Same repository, a different recorded actor.
    store.addActivity({
      actorId: "user-2",
      axisId: a.axis.id,
      repositoryId,
      summary: "a-repo-user2",
      topicId: a.topic.id,
    });
    // Same repository id (repository ids are global), same actor, but a different project.
    store.addActivity({
      actorId: "user-1",
      axisId: b.axis.id,
      repositoryId,
      summary: "b-repo-user1",
      topicId: b.topic.id,
    });
    // Same actor and project, but no repository.
    store.addActivity({
      actorId: "user-1",
      axisId: a.axis.id,
      summary: "a-norepo-user1",
      topicId: a.topic.id,
    });

    // actor + repository: the two rows that are both user-1 and this repository.
    const both = store.activityPage({ actorId: "user-1", repositoryId }, { limit: 50 });
    expect(both.total).toBe(2);
    expect(both.items.map((row) => row.summary).sort()).toEqual(["a-repo-user1", "b-repo-user1"]);

    // actor + repository + project narrows to the single a-topic row.
    const triple = store.activityPage(
      { actorId: "user-1", repositoryId, topicId: a.topic.id },
      { limit: 50 }
    );
    expect(triple.total).toBe(1);
    expect(triple.items[0]?.summary).toBe("a-repo-user1");

    // The window ANDs with the person scope: an old event of the same actor drops out of both.
    store.addActivity({
      actorId: "user-1",
      axisId: a.axis.id,
      occurredAt: "2020-01-01T00:00:00.000Z",
      summary: "a-old-user1",
      topicId: a.topic.id,
    });
    const windowed = store.activityPage({ actorId: "user-1", sinceDays: 7 }, { limit: 50 });
    expect(windowed.total).toBe(3); // a-repo-user1, b-repo-user1, a-norepo-user1
    expect(windowed.items.some((row) => row.summary === "a-old-user1")).toBe(false);
  });

  test("the action boundary carries person and repository scopes into the page sibling", async () => {
    const path = freshPath();
    const store = new ResearchStore(path);
    const { axis, topic } = seed(store);
    const onRepo = store.addActivity({
      actorId: "user-1",
      axisId: axis.id,
      repositoryFullName: "owner/alpha",
      summary: "one",
      topicId: topic.id,
    });
    const repositoryId = onRepo.repositoryId as string;
    store.addActivity({ actorId: "user-2", axisId: axis.id, summary: "two", topicId: topic.id });
    store.close();

    // The public person filter key is `personActorId`; the store's internal predicate is still `actorId`.
    const byActor = await call(
      "list_activity",
      { pageSize: 5, personActorId: "user-1", topicId: topic.id },
      path
    );
    const actorPage = byActor.activityPage as { items: Array<{ actorId: string }>; total: number };
    expect(actorPage.total).toBe(1);
    expect(actorPage.items.every((row) => row.actorId === "user-1")).toBe(true);

    const byRepo = await call(
      "list_activity",
      { pageSize: 5, repositoryId, topicId: topic.id },
      path
    );
    const repoPage = byRepo.activityPage as { items: unknown[]; total: number };
    expect(repoPage.total).toBe(1);
    expect(repoPage.items).toHaveLength(1);
  });
});
