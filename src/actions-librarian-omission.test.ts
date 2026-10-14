/**
 * Librarian omission regressions — B2 non-text maintenance without text echoes.
 *
 * These exercise the real entrypoint (`run`) against disposable databases built from the shipped
 * migrations, exactly as the A1/A2 and A3 halves do. The contract being pinned is the
 * "Non-text maintenance without text echoes" section of
 * `docs/design/dashboard-data-and-maintenance-contract.md`:
 *
 *   - Existing `problems[].problemId` updates may omit `statement`; existing `steps[].stepId` updates
 *     may omit `title`. Omission preserves stored text and task authorship. This permits task link-only
 *     maintenance and plan-step state/position-only updates without repeating human text.
 *   - New tasks still require a nonblank statement; new steps still require a nonblank title. Explicit
 *     blank text is not omission. Plan updates still require their summary and owner selectors.
 *   - These inputs reuse existing writers and version semantics: task people/repository link-only writes
 *     need not advance the task version, and step-only edits need not advance the plan version.
 *
 * The gaps these tests reproduce on the current tree (`reconcileTopic` reads the text before the
 * existing-id branch, so it is unconditionally required at the action boundary even though every
 * existing-row writer already accepts an omitted field):
 *   1. an existing `problems[]` update with no `statement` is refused, so a links-only task
 *      maintenance call cannot run without echoing (and re-attributing) the human's sentence;
 *   2. an existing `plans[].steps[]` update with no `title` is refused, so a state/position-only
 *      step edit cannot run without echoing the step title;
 *   3. the manifest still lists `statement`/`title` in the item `required` arrays, which would reject
 *      an omission upstream of the store even if the writer accepted it.
 *
 * Every human-authored row here is created through the real action with a *human* context (no
 * profileId) so the authorship the omission must preserve is the corpus's own, not an invented one.
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
    // Present, this is an agent tool call; absent, the person using the page. Authorship is never read
    // from input — only the context decides it.
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
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-omission-${crypto.randomUUID()}.sqlite`;
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

function versionOf(path: string, table: "problems" | "plans", id: string): number {
  const row = rows(path, `SELECT version FROM ${table} WHERE id = ?`, id)[0];
  return must(row?.version as number | undefined, `${table} ${id} has no version`);
}

/** The human-authored statement the omission must preserve. */
const HUMAN_STATEMENT = "Human statement that an agent must not have to echo";
const HUMAN_TITLE = "Human task title";

type Seeded = {
  axisId: string;
  planOneId: string;
  planTwoId: string;
  problemId: string;
  stepOneId: string;
  stepTwoId: string;
  topicId: string;
};

/**
 * One topic with one axis, a human-authored task (statement *and* title), and two topic-owned plans each
 * carrying one titled step. Everything is created through the real action with a human context, so every
 * row is human-authored and the omission's preservation claim is about the human's own words.
 */
async function seed(path: string): Promise<Seeded> {
  const created = await call(
    "reconcile_topic",
    { axes: [{ title: "Axis B" }], topicName: "B2 Topic" },
    path
  );
  const topicId = (created.topic as { id: string }).id;
  const axisId = must(
    (created.axes as Array<{ id: string; title: string }>).find((axis) => axis.title === "Axis B"),
    "Axis B missing from the seed"
  ).id;

  const task = await call(
    "reconcile_topic",
    { problems: [{ axisId, statement: HUMAN_STATEMENT, title: HUMAN_TITLE }], topicId },
    path
  );
  const problemId = must(
    (task.problems as Array<{ id: string }>)[0],
    "task missing from the seed"
  ).id;

  const planOne = await call(
    "reconcile_topic",
    {
      plans: [
        { steps: [{ position: 0, state: "pending", title: "Step one" }], summary: "Plan one", topicId },
      ],
      topicId,
    },
    path
  );
  const planOneRow = must(
    (planOne.plans as Array<{ id: string; steps: Array<{ id: string }> }>)[0],
    "Plan one missing from the seed"
  );
  const planOneId = planOneRow.id;
  const stepOneId = must(planOneRow.steps[0], "Step one missing from the seed").id;

  const planTwo = await call(
    "reconcile_topic",
    { plans: [{ steps: [{ title: "Step two" }], summary: "Plan two", topicId }], topicId },
    path
  );
  const planTwoRow = must(
    (planTwo.plans as Array<{ id: string; steps: Array<{ id: string }> }>)[0],
    "Plan two missing from the seed"
  );
  const planTwoId = planTwoRow.id;
  const stepTwoId = must(planTwoRow.steps[0], "Step two missing from the seed").id;

  return { axisId, planOneId, planTwoId, problemId, stepOneId, stepTwoId, topicId };
}

describe("B2 — an existing task update may omit the statement", () => {
  test("an agent links-only update omits the statement and preserves the human text, title and authorship", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);

    // The task is human-authored, with a title of its own.
    expect(
      rows(
        path,
        "SELECT p.statement, p.author_type, p.author_id, t.title FROM problems p LEFT JOIN problem_titles t ON t.problem_id = p.id WHERE p.id = ?",
        seeded.problemId
      )[0]
    ).toEqual({ author_id: "user-1", author_type: "human", statement: HUMAN_STATEMENT, title: HUMAN_TITLE });

    const result = await call(
      "reconcile_topic",
      {
        problems: [
          // No statement: the update only links a repository. Omission is the whole point.
          { problemId: seeded.problemId, repositoryFullNames: ["acme/thing"] },
        ],
        topicId: seeded.topicId,
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(true);
    expect(
      rows(path, "SELECT count(*) AS n FROM problem_repositories WHERE problem_id = ?", seeded.problemId)[0]
        ?.n
    ).toBe(1);
    // The human's sentence and title survive verbatim and the row is still the human's — an agent that
    // restates nothing takes nothing over.
    expect(
      rows(
        path,
        "SELECT p.statement, p.author_type, p.author_id, t.title FROM problems p LEFT JOIN problem_titles t ON t.problem_id = p.id WHERE p.id = ?",
        seeded.problemId
      )[0]
    ).toEqual({ author_id: "user-1", author_type: "human", statement: HUMAN_STATEMENT, title: HUMAN_TITLE });
  });

  test("a links-only update with no statement still honours a stale problems[].expectedVersion", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const stale = versionOf(path, "problems", seeded.problemId);
    // Advance the row's version with a real field write, so the guard has a genuinely stale value to refuse.
    await call(
      "reconcile_topic",
      { problems: [{ problemId: seeded.problemId, stateConfidence: "inferred" }], topicId: seeded.topicId },
      path
    );
    expect(versionOf(path, "problems", seeded.problemId)).toBe(stale + 1);

    const before = canonicalSnapshot(path);
    const result = await call(
      "reconcile_topic",
      {
        problems: [
          { expectedVersion: stale, problemId: seeded.problemId, repositoryFullNames: ["acme/thing"] },
        ],
        topicId: seeded.topicId,
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("conflict");
    expect(
      rows(path, "SELECT count(*) AS n FROM problem_repositories WHERE problem_id = ?", seeded.problemId)[0]
        ?.n
    ).toBe(0);
    expect(canonicalSnapshot(path)).toBe(before);
  });
});

describe("B2 — an existing plan step update may omit the title", () => {
  test("an agent state/position-only step update omits the title and preserves it", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);

    const result = await call(
      "reconcile_topic",
      {
        plans: [
          {
            planId: seeded.planOneId,
            // The plan's summary is still required, so it is echoed unchanged.
            steps: [{ position: 0, state: "active", stepId: seeded.stepOneId }],
            summary: "Plan one",
            topicId: seeded.topicId,
          },
        ],
        topicId: seeded.topicId,
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(true);
    expect(
      rows(path, "SELECT title, position, state FROM plan_steps WHERE id = ?", seeded.stepOneId)[0]
    ).toEqual({ position: 0, state: "active", title: "Step one" });
  });

  test("a step naming a step id from another plan is refused and rolls the whole call back", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        // A legitimate write ordered before the plans loop; a whole-transaction refusal must drop it too.
        annotations: [{ text: "a valid note that must roll back" }],
        plans: [
          {
            planId: seeded.planOneId,
            // Step two belongs to plan two: a cross-plan reference laundered in by id.
            steps: [{ position: 0, state: "active", stepId: seeded.stepTwoId }],
            summary: "Plan one",
            topicId: seeded.topicId,
          },
        ],
        topicId: seeded.topicId,
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/does not belong/);
    // Neither the note nor any step moved, and plan one's step title is exactly as it was.
    expect(rows(path, "SELECT count(*) AS n FROM annotations")[0]?.n).toBe(0);
    expect(rows(path, "SELECT title, state FROM plan_steps WHERE id = ?", seeded.stepOneId)[0]).toEqual({
      state: "pending",
      title: "Step one",
    });
    expect(canonicalSnapshot(path)).toBe(before);
  });
});

describe("B2 — creation still requires nonblank text", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["a missing statement", { title: "a fresh title" }],
    ["a blank statement", { statement: "   ", title: "a fresh title" }],
  ];

  for (const [name, overrides] of cases) {
    test(`a new task with ${name} is refused as invalid-input and writes nothing`, async () => {
      const path = freshDatabase();
      const seeded = await seed(path);
      const before = canonicalSnapshot(path);

      const problem: Record<string, unknown> = { axisId: seeded.axisId, ...overrides };

      const result = await call("reconcile_topic", { problems: [problem], topicId: seeded.topicId }, path);

      expect(result.ok).toBe(false);
      expect(result.kind).toBe("invalid-input");
      expect(String(result.error)).toMatch(/statement/);
      expect(canonicalSnapshot(path)).toBe(before);
    });
  }

  for (const [name, overrides] of [
    ["a missing title", {}],
    ["a blank title", { title: "   " }],
  ] as Array<[string, Record<string, unknown>]>) {
    test(`a new plan step with ${name} is refused as invalid-input and writes nothing`, async () => {
      const path = freshDatabase();
      const seeded = await seed(path);
      const before = canonicalSnapshot(path);

      const result = await call(
        "reconcile_topic",
        {
          plans: [
            {
              steps: [{ position: 0, state: "pending", ...overrides }],
              summary: "Plan fresh",
              topicId: seeded.topicId,
            },
          ],
          topicId: seeded.topicId,
        },
        path
      );

      expect(result.ok).toBe(false);
      expect(result.kind).toBe("invalid-input");
      expect(String(result.error)).toMatch(/title/);
      expect(canonicalSnapshot(path)).toBe(before);
    });
  }
});

describe("B2 — plan updates keep their summary and owner selectors", () => {
  test("a plan update with no summary is refused as invalid-input and writes nothing", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        plans: [{ planId: seeded.planOneId, steps: [{ position: 0, state: "done", stepId: seeded.stepOneId }], topicId: seeded.topicId }],
        topicId: seeded.topicId,
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/summary/);
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("an agent echoing the human summary preserves the plan's authorship", async () => {
    const path = freshDatabase();
    const seeded = await seed(path);
    expect(
      rows(path, "SELECT author_type, author_id, summary FROM plans WHERE id = ?", seeded.planOneId)[0]
    ).toEqual({ author_id: "user-1", author_type: "human", summary: "Plan one" });

    const result = await call(
      "reconcile_topic",
      {
        plans: [{ planId: seeded.planOneId, summary: "Plan one", topicId: seeded.topicId }],
        topicId: seeded.topicId,
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(true);
    // An unchanged echo transfers nothing: the summary is still the human's.
    expect(
      rows(path, "SELECT author_type, author_id, summary FROM plans WHERE id = ?", seeded.planOneId)[0]
    ).toEqual({ author_id: "user-1", author_type: "human", summary: "Plan one" });
  });
});

describe("B2 — the manifest leaves the text optional on the item schemas", () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "nakama.plugin.json"), "utf8")) as {
    actions: Array<{
      key: string;
      inputSchema: {
        properties: Record<
          string,
          {
            items?: {
              required?: string[];
              properties?: Record<string, { items?: { required?: string[]; properties?: Record<string, unknown> } }>;
            };
          }
        >;
      };
    }>;
  };
  const reconcile = must(
    manifest.actions.find((action) => action.key === "reconcile_topic"),
    "reconcile_topic is not declared in the manifest"
  );
  const properties = reconcile.inputSchema.properties;

  test("problems[] items do not unconditionally require a statement", () => {
    expect(properties.problems?.items?.required ?? []).not.toContain("statement");
    // The property stays declared — omission is optional, not removed.
    expect(properties.problems?.items?.properties?.statement).toBeDefined();
  });

  test("plans[].steps[] items do not unconditionally require a title", () => {
    const steps = properties.plans?.items?.properties?.steps;
    expect(steps?.items?.required ?? []).not.toContain("title");
    expect(steps?.items?.properties?.title).toBeDefined();
  });

  test("plans[] items still require their summary", () => {
    expect(properties.plans?.items?.required).toContain("summary");
  });
});
