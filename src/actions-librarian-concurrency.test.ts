/**
 * Librarian concurrency regressions — A3 optional version checks.
 *
 * These exercise the real entrypoint (`run`) against disposable databases built from the shipped
 * migrations, exactly as the A1/A2 half does. The contract being pinned is the "Optional version
 * checks" section of `docs/design/dashboard-data-and-maintenance-contract.md`:
 *
 *   - A supplied reconciliation `expectedVersion` is checked against the resolved project's current
 *     version **before any writes**, even for relationship-only, annotation-only or empty updates.
 *   - Existing-task updates accept `problems[].expectedVersion`; existing-plan updates accept
 *     `plans[].expectedVersion` — checking the existing row versions, including task link replacement
 *     and plan summary updates. A stale supplied version refuses the whole transaction as `conflict`.
 *   - Versions remain optional: omission retains the unchecked-write behavior. Per-task/per-plan
 *     versions apply to updates by existing id, not creation. No new version counters are introduced,
 *     and the project version is not an aggregate revision.
 *
 * A stale version here is *obtained from a real update* wherever practical: the version is read, a
 * genuine write advances it, and the value read before that write is the one presented as stale — never
 * invented, so the test fails if the writer's own bump semantics change underneath it.
 *
 * The three current gaps these tests reproduce:
 *   1. a top-level `expectedVersion` is read only when a `topic` patch is present, so a link-only or
 *      annotation-only (or empty) update ignores it entirely and writes;
 *   2. `problems[].expectedVersion` is neither in the input type nor forwarded to `updateProblem`;
 *   3. `plans[].expectedVersion` is neither in the input type nor forwarded to `updatePlan`.
 */
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { run } from "./actions";

const repoRoot = join(import.meta.dir, "..");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
  "006-task-plan-text.sql",
].map((name) => readFileSync(join(repoRoot, "migrations", name), "utf8"));

type RunContext = Parameters<typeof run>[1];
type Row = Record<string, unknown>;

function contextFor(actionKey: string, databasePath: string, profileId?: string): RunContext {
  return {
    actionKey,
    actor: { id: "user-1", role: "member" },
    databasePath,
    host: () => Promise.resolve({}),
    orgId: "org-test",
    ...(profileId ? { profileId } : {}),
  } as unknown as RunContext;
}

const disposablePaths: string[] = [];
afterEach(() => {
  for (const path of disposablePaths.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  }
});

function freshDatabase(): string {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-concurrency-${crypto.randomUUID()}.sqlite`;
  disposablePaths.push(path);
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

async function call(
  actionKey: string,
  input: Record<string, unknown>,
  path: string,
  profileId?: string
): Promise<Row> {
  return (await run(input, contextFor(actionKey, path, profileId))) as Row;
}

function rows(path: string, sql: string, ...params: Array<string | number>): Row[] {
  const db = new Database(path, { readonly: true });
  try {
    return db.query(sql).all(...params) as Row[];
  } finally {
    db.close();
  }
}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/** Every user table's rows in sorted, column-ordered JSON — a logical snapshot, not file bytes. */
function canonicalSnapshot(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    const tables = (
      db
        .query(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
        )
        .all() as Array<{ name: string }>
    ).map((object) => object.name);
    const snapshot: Record<string, string[]> = {};
    for (const table of tables) {
      const columns = (
        db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      )
        .map((column) => column.name)
        .sort();
      snapshot[table] = (
        db.query(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>
      )
        .map((row) => {
          const ordered: Record<string, unknown> = {};
          for (const column of columns) {
            ordered[column] = row[column] ?? null;
          }
          return JSON.stringify(ordered);
        })
        .sort();
    }
    return JSON.stringify(snapshot);
  } finally {
    db.close();
  }
}

function versionOf(path: string, table: "topics" | "plans" | "problems", id: string): number {
  const row = rows(path, `SELECT version FROM ${table} WHERE id = ?`, id)[0];
  return must(row?.version as number | undefined, `${table} ${id} has no version`);
}

type Seeded = { axisId: string; planId: string; problemId: string; topicId: string };

/**
 * One topic with one axis, one task and one topic-owned plan, created through the real action. The
 * second call is needed because a plan's owner must be named by id, and the topic id only exists after
 * the first call — the same two-step the contract describes for a task-owned plan.
 */
async function seed(path: string): Promise<Seeded> {
  const created = await call(
    "reconcile_topic",
    {
      axes: [{ title: "Axis X" }],
      problems: [{ axisTitle: "Axis X", statement: "Task one" }],
      topicName: "A3 Topic",
    },
    path
  );
  const topicId = (created.topic as { id: string }).id;
  const axisId = must(
    (created.axes as Array<{ id: string; title: string }>).find((axis) => axis.title === "Axis X"),
    "Axis X missing from the seed"
  ).id;
  const problemId = must(
    (created.problems as Array<{ id: string }>)[0],
    "task missing from the seed"
  ).id;
  const withPlan = await call("reconcile_topic", { plans: [{ summary: "Plan one", topicId }], topicId }, path);
  const planId = must(
    (withPlan.plans as Array<{ id: string }>)[0],
    "plan missing from the seed"
  ).id;
  return { axisId, planId, problemId, topicId };
}

/** Read the topic version, then advance it with a real field patch; return the now-stale version. */
async function staleTopicVersion(path: string, topicId: string): Promise<number> {
  const stale = versionOf(path, "topics", topicId);
  await call("reconcile_topic", { topic: { summary: "advanced" }, topicId }, path);
  return stale;
}

/** Read the task version, then advance it with a real statement rewrite; return the now-stale version. */
async function staleProblemVersion(path: string, topicId: string, problemId: string): Promise<number> {
  const stale = versionOf(path, "problems", problemId);
  await call("reconcile_topic", { problems: [{ problemId, statement: "Task renamed" }], topicId }, path);
  return stale;
}

describe("A3 — a supplied project expectedVersion is checked even with no project patch", () => {
  for (const [name, body] of [
    ["a relationship-only update", { repositories: [{ fullName: "acme/thing" }] }],
    ["an annotation-only update", { annotations: [{ text: "a note only" }] }],
    ["an empty update", {}],
    ["an unchanged topic-name echo", { topic: { name: "A3 Topic" } }],
  ] as Array<[string, Record<string, unknown>]>) {
    test(`a stale version refuses ${name} and writes nothing`, async () => {
      const path = freshDatabase();
      const seeded = await seed(path);
      const stale = await staleTopicVersion(path, seeded.topicId);
      expect(versionOf(path, "topics", seeded.topicId)).toBe(stale + 1);

      const before = canonicalSnapshot(path);
      const result = await call(
        "reconcile_topic",
        { expectedVersion: stale, topicId: seeded.topicId, ...body },
        path
      );

      expect(result.ok).toBe(false);
      expect(result.kind).toBe("conflict");
      expect(canonicalSnapshot(path)).toBe(before);
    });
  }

  test("a fresh project version with no project patch is accepted", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const current = versionOf(path, "topics", seeded.topicId);

    const result = await call(
      "reconcile_topic",
      { expectedVersion: current, repositories: [{ fullName: "acme/thing" }], topicId: seeded.topicId },
      path
    );

    expect(result.ok).toBe(true);
    // This is a topic-row guard, not an aggregate project revision.
    expect(versionOf(path, "topics", seeded.topicId)).toBe(current);
    expect(
      rows(path, "SELECT count(*) AS n FROM topic_repositories WHERE topic_id = ?", seeded.topicId)[0]?.n
    ).toBe(1);
  });
});

describe("A3 — an existing task update honours problems[].expectedVersion", () => {
  test("a stale task version refuses a link replacement (statement echoed) and writes nothing", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const stale = await staleProblemVersion(path, seeded.topicId, seeded.problemId);
    expect(versionOf(path, "problems", seeded.problemId)).toBe(stale + 1);

    const before = canonicalSnapshot(path);
    const result = await call(
      "reconcile_topic",
      {
        problems: [
          {
            // An existing task still requires its statement; echoing the current one transfers nothing.
            expectedVersion: stale,
            problemId: seeded.problemId,
            repositoryFullNames: ["acme/thing"],
            statement: "Task renamed",
          },
        ],
        topicId: seeded.topicId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("conflict");
    expect(
      rows(path, "SELECT count(*) AS n FROM problem_repositories WHERE problem_id = ?", seeded.problemId)[0]
        ?.n
    ).toBe(0);
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("a fresh task version replaces the links and is accepted", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const current = versionOf(path, "problems", seeded.problemId);

    const result = await call(
      "reconcile_topic",
      {
        problems: [
          {
            expectedVersion: current,
            problemId: seeded.problemId,
            repositoryFullNames: ["acme/thing"],
            statement: "Task one",
          },
        ],
        topicId: seeded.topicId,
      },
      path
    );

    expect(result.ok).toBe(true);
    expect(
      rows(path, "SELECT count(*) AS n FROM problem_repositories WHERE problem_id = ?", seeded.problemId)[0]
        ?.n
    ).toBe(1);
  });

  test("an update with no task version stays unchecked, as before", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);

    const result = await call(
      "reconcile_topic",
      {
        problems: [
          { problemId: seeded.problemId, repositoryFullNames: ["acme/thing"], statement: "Task one" },
        ],
        topicId: seeded.topicId,
      },
      path
    );

    expect(result.ok).toBe(true);
    expect(
      rows(path, "SELECT count(*) AS n FROM problem_repositories WHERE problem_id = ?", seeded.problemId)[0]
        ?.n
    ).toBe(1);
  });
});

describe("A3 — an existing plan update honours plans[].expectedVersion", () => {
  test("a stale plan version refuses the summary update and writes nothing", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const stale = versionOf(path, "plans", seeded.planId);
    await call(
      "reconcile_topic",
      { plans: [{ planId: seeded.planId, summary: "Plan renamed", topicId: seeded.topicId }], topicId: seeded.topicId },
      path
    );
    expect(versionOf(path, "plans", seeded.planId)).toBe(stale + 1);

    const before = canonicalSnapshot(path);
    const result = await call(
      "reconcile_topic",
      {
        plans: [
          { expectedVersion: stale, planId: seeded.planId, summary: "Plan again", topicId: seeded.topicId },
        ],
        topicId: seeded.topicId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("conflict");
    expect(rows(path, "SELECT summary FROM plans WHERE id = ?", seeded.planId)[0]?.summary).toBe(
      "Plan renamed"
    );
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("a fresh plan version applies the summary update", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const current = versionOf(path, "plans", seeded.planId);

    const result = await call(
      "reconcile_topic",
      {
        plans: [
          { expectedVersion: current, planId: seeded.planId, summary: "Plan renamed", topicId: seeded.topicId },
        ],
        topicId: seeded.topicId,
      },
      path
    );

    expect(result.ok).toBe(true);
    expect(rows(path, "SELECT summary FROM plans WHERE id = ?", seeded.planId)[0]?.summary).toBe(
      "Plan renamed"
    );
  });

  test("an update with no plan version stays unchecked, as before", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);

    const result = await call(
      "reconcile_topic",
      { plans: [{ planId: seeded.planId, summary: "Plan renamed", topicId: seeded.topicId }], topicId: seeded.topicId },
      path
    );

    expect(result.ok).toBe(true);
    expect(rows(path, "SELECT summary FROM plans WHERE id = ?", seeded.planId)[0]?.summary).toBe(
      "Plan renamed"
    );
  });
});

describe("A3 — a stale version rolls back the whole mixed transaction", () => {
  test("a valid project patch, link and note do not survive a stale task version", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const stale = await staleProblemVersion(path, seeded.topicId, seeded.problemId);
    const freshTopic = versionOf(path, "topics", seeded.topicId); // matching, so the project patch is legitimate

    const before = canonicalSnapshot(path);
    const result = await call(
      "reconcile_topic",
      {
        annotations: [{ text: "a valid note that must roll back" }],
        expectedVersion: freshTopic,
        problems: [
          {
            expectedVersion: stale,
            problemId: seeded.problemId,
            statement: "Task renamed",
          },
        ],
        repositories: [{ fullName: "acme/valid" }],
        topic: { summary: "a valid patch that must roll back" },
        topicId: seeded.topicId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("conflict");
    // Nothing from the same call landed: the topic patch, the repository link and the note all rolled back.
    expect(rows(path, "SELECT summary FROM topics WHERE id = ?", seeded.topicId)[0]?.summary).toBe("");
    expect(
      rows(path, "SELECT count(*) AS n FROM topic_repositories WHERE topic_id = ?", seeded.topicId)[0]?.n
    ).toBe(0);
    expect(rows(path, "SELECT count(*) AS n FROM annotations")[0]?.n).toBe(0);
    expect(canonicalSnapshot(path)).toBe(before);
  });
});

describe("A3 — the manifest advertises the per-row versions it forwards", () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "nakama.plugin.json"), "utf8")) as {
    actions: Array<{
      key: string;
      inputSchema: {
        properties: Record<
          string,
          { items?: { properties?: Record<string, unknown> } }
        >;
      };
    }>;
  };
  const reconcile = must(
    manifest.actions.find((action) => action.key === "reconcile_topic"),
    "reconcile_topic is not declared in the manifest"
  );
  const properties = reconcile.inputSchema.properties;

  test("problems[] items expose an expectedVersion integer", () => {
    expect(properties.problems?.items?.properties?.expectedVersion).toEqual({
      minimum: 1,
      type: "integer",
    });
  });

  test("plans[] items expose an expectedVersion integer", () => {
    expect(properties.plans?.items?.properties?.expectedVersion).toEqual({
      minimum: 1,
      type: "integer",
    });
  });
});
