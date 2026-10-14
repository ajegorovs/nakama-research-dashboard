/**
 * Librarian integrity regressions — A1 cross-topic scope and A2 axis lifecycle.
 *
 * These exercise the real entrypoint (`run`) against disposable databases built from the shipped
 * migrations. They are the action-boundary half of the fixture-control work: a librarian may name any
 * id it read back from a scoped read, so the writer must decide whether that id is *reachable from the
 * topic it is being applied to* — and it must decide it before it writes anything.
 *
 * A1 — cross-topic scope. `reconcile_topic` resolves its axes through `resolveAxisId(topicId, …)`, which
 * refuses an axis from another topic. A **problem** is not routed through that path: `problems[]` updates,
 * `transitions[]` with `subject: "problem"`, and `annotations[].problemId` are all applied by bare id, so a
 * call scoped to Topic A can reach into Topic B — update its statement, move its state, or hang a note on it.
 * The same hole exists *within* one topic: a note may name axis X and a problem that lives on axis Y. Every
 * one of those writes must be refused as a caller mistake, not silently applied, and the refusal must be
 * atomic so a valid write earlier in the same call rolls back with it.
 *
 * A2 — axis lifecycle. A state is *recorded, not typed in*. `transitions[]` is the only path that appends to
 * `state_log`; `problems[].state` is already refused on an existing problem for exactly this reason. An
 * existing `axes[].state` is not: `applyAxisPatch` writes the column directly, so a state change through
 * `axes[]` moves the lifecycle with no history row — the one thing the state log exists to prevent. A new
 * axis may carry its initial state at creation (that is the bootstrap row's sibling), and echoing the state
 * already stored transfers nothing and must stay accepted.
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

function contextFor(
  actionKey: string,
  databasePath: string,
  profileId?: string
): RunContext {
  return {
    actionKey,
    actor: { id: "user-1", role: "member" },
    databasePath,
    host: () => Promise.resolve({}),
    orgId: "org-test",
    // Present, this is an agent tool call; absent, the person using the page. The store never reads
    // authorship from input — only the context decides it.
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
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-integrity-${crypto.randomUUID()}.sqlite`;
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

/** One call the way the host makes it: a fresh connection, one action, a structured result. */
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

/**
 * A canonical **logical** snapshot: every user table's rows in sorted, column-ordered JSON. Nothing that
 * moves without a logical change (SQLite file bytes, WAL, page layout) is compared — the equality this
 * feeds is a claim about rows and versions only, which is exactly what "the refusal wrote nothing" means.
 */
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

type Seeded = {
  axisXId: string;
  axisYId: string;
  problemOnBId: string;
  problemOnYId: string;
  topicAId: string;
  topicBId: string;
};

/**
 * Two topics, each with an axis and a problem. Topic A also carries a second axis so the "same topic, wrong
 * axis" case has a sibling to be wrong against. Created through the real action, exactly as a librarian would.
 */
async function seedTwoTopics(path: string): Promise<Seeded> {
  const a = await call(
    "reconcile_topic",
    { axes: [{ title: "Axis X" }, { title: "Axis Y" }], topicName: "Topic A" },
    path
  );
  const topicAId = (a.topic as { id: string }).id;
  const axesA = a.axes as Array<{ id: string; title: string }>;
  const axisXId = must(
    axesA.find((axis) => axis.title === "Axis X"),
    "Axis X missing from the seed"
  ).id;
  const axisYId = must(
    axesA.find((axis) => axis.title === "Axis Y"),
    "Axis Y missing from the seed"
  ).id;
  const problemA = await call(
    "reconcile_topic",
    {
      problems: [{ axisId: axisYId, statement: "A problem that lives on Axis Y" }],
      topicId: topicAId,
    },
    path
  );
  const problemOnYId = must(
    (problemA.problems as Array<{ id: string }>)[0],
    "problem on Axis Y missing from the seed"
  ).id;

  const b = await call(
    "reconcile_topic",
    { axes: [{ title: "Axis B" }], topicName: "Topic B" },
    path
  );
  const topicBId = (b.topic as { id: string }).id;
  const axisBId = must(
    (b.axes as Array<{ id: string }>)[0],
    "Axis B missing from the seed"
  ).id;
  const problemB = await call(
    "reconcile_topic",
    {
      problems: [{ axisId: axisBId, statement: "A problem that lives on Topic B" }],
      topicId: topicBId,
    },
    path
  );
  const problemOnBId = must(
    (problemB.problems as Array<{ id: string }>)[0],
    "problem on Topic B missing from the seed"
  ).id;

  return { axisXId, axisYId, problemOnBId, problemOnYId, topicAId, topicBId };
}

describe("A1 — reconcile_topic stays inside the topic it is scoped to", () => {
  test("an update naming another topic's problem is refused and writes nothing", async () => {
    const path = freshDatabase();
    const seeded = await seedTwoTopics(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        problems: [
          { problemId: seeded.problemOnBId, statement: "hijacked from Topic A" },
        ],
        topicId: seeded.topicAId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/does not belong/);
    // Topic B's problem is exactly as Topic B left it, and the refusal rolled the whole call back.
    expect(
      rows(path, "SELECT statement FROM problems WHERE id = ?", seeded.problemOnBId)[0]
        ?.statement
    ).toBe("A problem that lives on Topic B");
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("a transition naming another topic's problem is refused and writes nothing", async () => {
    const path = freshDatabase();
    const seeded = await seedTwoTopics(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        topicId: seeded.topicAId,
        transitions: [
          { problemId: seeded.problemOnBId, subject: "problem", toState: "resolved" },
        ],
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/does not belong/);
    expect(
      rows(path, "SELECT state FROM problems WHERE id = ?", seeded.problemOnBId)[0]?.state
    ).toBe("open");
    expect(
      rows(path, "SELECT count(*) AS n FROM state_log WHERE problem_id = ?", seeded.problemOnBId)[0]?.n
    ).toBe(1); // only the creation bootstrap row
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("an annotation naming another topic's problem is refused and writes nothing", async () => {
    const path = freshDatabase();
    const seeded = await seedTwoTopics(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        annotations: [{ problemId: seeded.problemOnBId, text: "a note from Topic A" }],
        topicId: seeded.topicAId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/does not belong/);
    expect(
      rows(path, "SELECT count(*) AS n FROM annotations WHERE problem_id = ?", seeded.problemOnBId)[0]
        ?.n
    ).toBe(0);
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("an annotation naming an axis and a problem from a different axis in the same topic is refused", async () => {
    const path = freshDatabase();
    const seeded = await seedTwoTopics(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        annotations: [
          {
            axisId: seeded.axisXId,
            problemId: seeded.problemOnYId,
            text: "an axis-X note about an Axis-Y problem",
          },
        ],
        topicId: seeded.topicAId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/not on the axis|does not belong/);
    expect(
      rows(path, "SELECT count(*) AS n FROM annotations WHERE text = ?", "an axis-X note about an Axis-Y problem")[0]
        ?.n
    ).toBe(0);
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("a valid write earlier in the same call rolls back with the foreign reference", async () => {
    const path = freshDatabase();
    const seeded = await seedTwoTopics(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        // Two writes that are legitimate on their own, ordered before the offending transition by the
        // writer (axes, then annotations, then transitions): if the refusal is atomic, neither lands.
        annotations: [{ text: "a valid note on Topic A" }],
        axes: [{ title: "Brand new axis" }],
        topicId: seeded.topicAId,
        transitions: [
          { problemId: seeded.problemOnBId, subject: "problem", toState: "resolved" },
        ],
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(canonicalSnapshot(path)).toBe(before);
    expect(
      rows(path, "SELECT count(*) AS n FROM development_axes WHERE topic_id = ?", seeded.topicAId)[0]
        ?.n
    ).toBe(2); // Axis X and Axis Y only
  });
});

describe("A2 — an axis's state is recorded, never typed in through axes[]", () => {
  type AxisSeed = { axisId: string; topicId: string };

  /** One topic with one axis that carries evidence, so a `confirmed` reading is legal to assert. */
  async function seedAxis(path: string): Promise<AxisSeed> {
    const created = await call(
      "reconcile_topic",
      {
        axes: [
          {
            branch: "feat/sweep",
            state: "active",
            stateConfidence: "inferred",
            title: "Parameter automation",
          },
        ],
        topicName: "Lifecycle",
      },
      path
    );
    const topicId = (created.topic as { id: string }).id;
    const axisId = must(
      (created.axes as Array<{ id: string }>)[0],
      "axis missing from the lifecycle seed"
    ).id;
    return { axisId, topicId };
  }

  test("changing an existing axis's state through axes[] is refused and leaves no history", async () => {
    const path = freshDatabase();
    const { axisId, topicId } = await seedAxis(path);
    const before = canonicalSnapshot(path);

    const result = await call(
      "reconcile_topic",
      {
        annotations: [{ text: "must roll back with the state refusal" }],
        people: [{ displayName: "Disposable collaborator", githubLogin: "disposable-collaborator" }],
        axes: [{ id: axisId, state: "parked", stateConfidence: "inferred" }],
        topic: { summary: "must also roll back" },
        topicId,
      },
      path
    );

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    // The refusal names the recorded path, the same way an existing problem's state does.
    expect(String(result.error)).toMatch(/transitions/);
    expect(rows(path, "SELECT state FROM development_axes WHERE id = ?", axisId)[0]?.state).toBe(
      "active"
    );
    expect(rows(path, "SELECT count(*) AS n FROM state_log WHERE axis_id = ?", axisId)[0]?.n).toBe(0);
    expect(canonicalSnapshot(path)).toBe(before);
  });

  test("echoing the stored state unchanged is accepted and records nothing", async () => {
    const path = freshDatabase();
    const { axisId, topicId } = await seedAxis(path);

    const result = await call(
      "reconcile_topic",
      { axes: [{ id: axisId, state: "active", stateConfidence: "inferred" }], topicId },
      path
    );

    expect(result.ok).toBe(true);
    expect(rows(path, "SELECT state FROM development_axes WHERE id = ?", axisId)[0]?.state).toBe(
      "active"
    );
    // An echo transfers nothing: no history row is fabricated for it.
    expect(rows(path, "SELECT count(*) AS n FROM state_log WHERE axis_id = ?", axisId)[0]?.n).toBe(0);
  });

  test("a new axis may carry its initial state at creation", async () => {
    const path = freshDatabase();
    const { topicId } = await seedAxis(path);

    const result = await call(
      "reconcile_topic",
      {
        axes: [{ state: "usable", stateConfidence: "inferred", title: "Fresh axis" }],
        topicId,
      },
      path
    );

    expect(result.ok).toBe(true);
    const fresh = must(
      (result.axes as Array<{ id: string; state: string; title: string }>).find(
        (axis) => axis.title === "Fresh axis"
      ),
      "the fresh axis was not returned"
    );
    expect(fresh.state).toBe("usable");
  });

  test("a dedicated transition records exactly once, then is a no-op, then refuses a stale version", async () => {
    const path = freshDatabase();
    const { axisId, topicId } = await seedAxis(path);

    const moved = await call(
      "reconcile_topic",
      { topicId, transitions: [{ axisId, subject: "axis", toState: "usable" }] },
      path
    );
    expect(moved.ok).toBe(true);
    expect(moved.transitions as unknown[]).toHaveLength(1);
    expect(
      rows(path, "SELECT from_state, to_state FROM state_log WHERE axis_id = ?", axisId)
    ).toEqual([{ from_state: "active", to_state: "usable" }]);

    // Exactly once: repeating the same transition is a no-op, not a second row.
    const repeated = await call(
      "reconcile_topic",
      { topicId, transitions: [{ axisId, subject: "axis", toState: "usable" }] },
      path
    );
    expect(repeated.ok).toBe(false);
    expect(repeated.kind).toBe("no-op");
    expect(rows(path, "SELECT count(*) AS n FROM state_log WHERE axis_id = ?", axisId)[0]?.n).toBe(1);

    // And a stale version is a conflict the caller re-reads, not a no-op it retries blindly.
    const stale = await call(
      "reconcile_topic",
      {
        topicId,
        transitions: [{ axisId, expectedVersion: 999, subject: "axis", toState: "active" }],
      },
      path
    );
    expect(stale.ok).toBe(false);
    expect(stale.kind).toBe("conflict");
    expect(rows(path, "SELECT state FROM development_axes WHERE id = ?", axisId)[0]?.state).toBe(
      "usable"
    );
    expect(rows(path, "SELECT count(*) AS n FROM state_log WHERE axis_id = ?", axisId)[0]?.n).toBe(1);
  });
});

/**
 * The statement seeded for `problemOnYId`. These updates deliberately echo it: an unchanged echo
 * transfers nothing and must never be the reason a call is refused. Omission is also supported;
 * what is under test here is the *axis* the update names.
 */
const PROBLEM_ON_Y_STATEMENT = "A problem that lives on Axis Y";

/**
 * A1 edge — an existing task's *axis* is verified before it is written.
 *
 * A call scoped to Topic A may name any axis id it read back, including a sibling axis in the *same*
 * topic. For an existing problem, `problems[].axisId`/`axisTitle` are currently ignored, so a mismatch —
 * or two fields that disagree with each other — is silently applied rather than refused. Each case is a
 * caller mistake and must be refused atomically, leaving the task byte-for-byte as it was.
 */
describe("A1 edge — an existing task's axis is verified before any write", () => {
  type Case = { name: string; input: (seeded: Seeded) => Record<string, unknown> };

  const cases: Case[] = [
    {
      input: (seeded) => ({
        problems: [
          { axisId: seeded.axisXId, problemId: seeded.problemOnYId, statement: PROBLEM_ON_Y_STATEMENT },
        ],
      }),
      name: "an update naming the sibling axis by id",
    },
    {
      input: (seeded) => ({
        problems: [
          { axisTitle: "Axis X", problemId: seeded.problemOnYId, statement: PROBLEM_ON_Y_STATEMENT },
        ],
      }),
      name: "an update naming the sibling axis by title",
    },
    {
      input: (seeded) => ({
        transitions: [
          { axisId: seeded.axisXId, problemId: seeded.problemOnYId, subject: "problem", toState: "resolved" },
        ],
      }),
      name: "a transition naming the sibling axis by id",
    },
    {
      input: (seeded) => ({
        transitions: [
          { axisTitle: "Axis X", problemId: seeded.problemOnYId, subject: "problem", toState: "resolved" },
        ],
      }),
      name: "a transition naming the sibling axis by title",
    },
    {
      input: (seeded) => ({
        problems: [
          {
            axisId: seeded.axisXId,
            axisTitle: "Axis Y",
            problemId: seeded.problemOnYId,
            statement: PROBLEM_ON_Y_STATEMENT,
          },
        ],
      }),
      name: "an update whose axisId and axisTitle point at two different axes",
    },
    {
      input: (seeded) => ({
        transitions: [
          {
            axisId: seeded.axisXId,
            axisTitle: "Axis Y",
            problemId: seeded.problemOnYId,
            subject: "problem",
            toState: "resolved",
          },
        ],
      }),
      name: "a transition whose axisId and axisTitle point at two different axes",
    },
    {
      input: (seeded) => ({
        problems: [{ axisId: seeded.axisXId, problemId: "no-such-task", statement: "x" }],
      }),
      name: "an update naming a task id that does not exist",
    },
  ];

  for (const current of cases) {
    test(`${current.name} is refused and writes nothing`, async () => {
      const path = freshDatabase();
      const seeded = await seedTwoTopics(path);
      const before = canonicalSnapshot(path);

      const result = await call(
        "reconcile_topic",
        { topicId: seeded.topicAId, ...current.input(seeded) },
        path
      );

      expect(result.ok).toBe(false);
      // A caller mistake, not a crash or a conflict: the same kind the in-topic axis guard already uses.
      expect(result.kind).toBe("invalid-input");
      // The task is exactly as it was: same statement, same state, no fabricated history row.
      expect(
        rows(path, "SELECT statement, state FROM problems WHERE id = ?", seeded.problemOnYId)[0]
      ).toEqual({ statement: PROBLEM_ON_Y_STATEMENT, state: "open" });
      expect(
        rows(path, "SELECT count(*) AS n FROM state_log WHERE problem_id = ?", seeded.problemOnYId)[0]
          ?.n
      ).toBe(1); // only the creation bootstrap row
      expect(canonicalSnapshot(path)).toBe(before);
    });
  }
});

/**
 * A1 edge — a *claim* naming a task is verified before it is written.
 *
 * A `note` carries the topic on the row, so a foreign `problemId` is caught when the axis is resolved.
 * `interpretation`/`steering` are claims, so the store deliberately writes `topic_id = null` on them — the
 * question "which topic is this scoped to" then only survives in the `problemId` the caller named, and a
 * foreign (or non-existent) task id slips past the one-target check straight into the INSERT. It must be
 * refused instead, before anything is written.
 */
describe("A1 edge — a claim naming a task is verified before it is written", () => {
  type Case = { name: string; problemId: (seeded: Seeded) => string };

  const cases: Case[] = [
    { name: "a task in another topic", problemId: (seeded) => seeded.problemOnBId },
    { name: "a task id that does not exist", problemId: () => "no-such-task" },
  ];

  for (const current of cases) {
    test(`an interpretation naming ${current.name} is refused and writes nothing`, async () => {
      const path = freshDatabase();
      const seeded = await seedTwoTopics(path);
      const before = canonicalSnapshot(path);
      const text = `a claim naming ${current.name}`;

      const result = await call(
        "reconcile_topic",
        {
          annotations: [
            {
              confidence: "inferred",
              kind: "interpretation",
              problemId: current.problemId(seeded),
              text,
            },
          ],
          topicId: seeded.topicAId,
        },
        path
      );

      expect(result.ok).toBe(false);
      expect(result.kind).toBe("invalid-input");
      expect(rows(path, "SELECT count(*) AS n FROM annotations WHERE text = ?", text)[0]?.n).toBe(0);
      expect(canonicalSnapshot(path)).toBe(before);
    });
  }
});

/**
 * A1 positive — the same scoped writes, done right, go through.
 *
 * The seed ran with a human context, so `problemOnYId` is human-authored. An agent call that restates that
 * human sentence unchanged is ordinary work (the statement is required to update the task at all), so it
 * must be accepted — and must leave the authorship *with the human's words*. The transition and the note
 * the same agent adds are new acts, and are recorded as the agent's.
 */
describe("A1 positive — same-topic writes through an agent context are accepted", () => {
  test("an echoing update, a transition and a note keep the human statement and record the agent", async () => {
    const path = freshDatabase();
    const seeded = await seedTwoTopics(path);

    // The seed used the human context (no profileId), so the task is human-authored.
    expect(
      rows(
        path,
        "SELECT author_type, author_id FROM problems WHERE id = ?",
        seeded.problemOnYId
      )[0]
    ).toEqual({ author_id: "user-1", author_type: "human" });

    const result = await call(
      "reconcile_topic",
      {
        annotations: [{ problemId: seeded.problemOnYId, text: "An agent's note on the same task" }],
        problems: [
          {
            axisId: seeded.axisYId,
            problemId: seeded.problemOnYId,
            // Echoed unchanged, exactly as the human wrote it: a restatement transfers nothing.
            statement: PROBLEM_ON_Y_STATEMENT,
            stateConfidence: "inferred",
          },
        ],
        topicId: seeded.topicAId,
        transitions: [
          { axisId: seeded.axisYId, problemId: seeded.problemOnYId, subject: "problem", toState: "resolved" },
        ],
      },
      path,
      "agent-7"
    );

    expect(result.ok).toBe(true);

    // The statement is still the human's — an agent restating it does not take it over.
    expect(
      rows(
        path,
        "SELECT statement, author_type, author_id, state_confidence FROM problems WHERE id = ?",
        seeded.problemOnYId
      )[0]
    ).toEqual({
      author_id: "user-1",
      author_type: "human",
      state_confidence: "inferred",
      statement: PROBLEM_ON_Y_STATEMENT,
    });

    // History: the bootstrap row from creation is the human's, the agent's move is attributed to the agent.
    expect(
      rows(
        path,
        "SELECT from_state, to_state, origin, actor_id FROM state_log WHERE problem_id = ? ORDER BY recorded_at, rowid",
        seeded.problemOnYId
      )
    ).toEqual([
      { actor_id: "user-1", from_state: null, origin: "human", to_state: "open" },
      { actor_id: "user-1", from_state: "open", origin: "agent", to_state: "resolved" },
    ]);

    // The note carries the agent's authorship too.
    expect(
      rows(
        path,
        "SELECT author_type, author_id FROM annotations WHERE problem_id = ?",
        seeded.problemOnYId
      )
    ).toEqual([{ author_id: "user-1", author_type: "agent" }]);
  });
});
