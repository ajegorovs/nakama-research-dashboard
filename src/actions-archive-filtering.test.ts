/**
 * Archived-record filtering — the "Archived-record filtering" section of
 * `docs/design/dashboard-data-and-maintenance-contract.md`, exercised through the real `run`
 * entrypoint against a disposable database built from the shipped migrations.
 *
 * The contract states:
 *
 *   - `get_overview` **inventory totals** (`counts`, status totals, workstream/task state totals)
 *     always include archived projects.
 *   - Its **result lists** honor `includeArchived` (default false), as do dashboard search hits.
 *   - Filtering occurs **before** result limits: hidden archived rows do not consume the visible page.
 *   - Activity and annotations **follow their owning project**, including ownership through a
 *     workstream (axis) or task (problem) when no direct project target is stored.
 *   - Truly **topicless** records remain visible; topic-grouped timelines still require a project.
 *
 * Every read goes through `run` (the real action surface) and must not mutate the database — the
 * canonical snapshot before and after a read is asserted equal. Seeded rows that no writer can
 * produce (a genuinely topicless note/activity) are inserted directly; everything else is written
 * through `reconcile_topic` with a human context.
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

function contextFor(actionKey: string, databasePath: string): RunContext {
  return {
    actionKey,
    actor: { id: "user-1", role: "member" },
    databasePath,
    host: () => Promise.resolve({}),
    orgId: "org-test",
  } as unknown as RunContext;
}

const disposablePaths: string[] = [];
afterEach(() => {
  for (const path of disposablePaths.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  }
});

function freshDatabase(): string {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-archive-${crypto.randomUUID()}.sqlite`;
  disposablePaths.push(path);
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) db.exec(migration);
  } finally {
    db.close();
  }
  return path;
}

async function call(actionKey: string, input: Row, path: string): Promise<Row> {
  return (await run(input, contextFor(actionKey, path))) as Row;
}

/** A direct writer for rows no action can produce (a genuinely topicless record). */
function exec(path: string, sql: string, ...params: Array<string | number | null>): void {
  const db = new Database(path);
  try {
    db.query(sql).run(...params);
  } finally {
    db.close();
  }
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
  if (value === undefined) throw new Error(message);
  return value;
}

/** Every user table's rows in sorted, column-ordered JSON — a logical snapshot, not file bytes. */
function canonicalSnapshot(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    const tables = (
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
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
          for (const column of columns) ordered[column] = row[column] ?? null;
          return JSON.stringify(ordered);
        })
        .sort();
    }
    return JSON.stringify(snapshot);
  } finally {
    db.close();
  }
}

/** The token every seeded record carries, so one search matches the whole fixture. */
const TOKEN = "zebrafish";

type Seeded = {
  activeAxisId: string;
  activeProblemId: string;
  activeTopicId: string;
  archivedAxisId: string;
  archivedProblemId: string;
  archivedTopicId: string;
};

/**
 * One active project and one archived project, each with its own axis, task, plain note, an axis
 * claim and a task claim; an archived topic-level activity (no axis) as well as axis activities in
 * both; plus a genuinely topicless note and activity no writer can produce.
 */
async function seed(path: string): Promise<Seeded> {
  const active = await call(
    "reconcile_topic",
    {
      axes: [{ description: `Active axis ${TOKEN}`, title: "Active Axis" }],
      topic: { description: `Active project ${TOKEN}`, name: "Active Topic" },
    },
    path
  );
  const activeTopicId = (active.topic as { id: string }).id;
  const activeAxisId = must(
    (active.axes as Array<{ id: string; title: string }>).find((a) => a.title === "Active Axis"),
    "Active Axis missing"
  ).id;

  const archived = await call(
    "reconcile_topic",
    {
      axes: [
        {
          blocker: "Waiting on review",
          blockerConfidence: "inferred",
          description: `Archived axis ${TOKEN}`,
          state: "blocked",
          stateConfidence: "inferred",
          title: "Archived Axis",
        },
      ],
      topic: { description: `Archived project ${TOKEN}`, name: "Archived Topic", status: "archived" },
    },
    path
  );
  const archivedTopicId = (archived.topic as { id: string }).id;
  const archivedAxisId = must(
    (archived.axes as Array<{ id: string; title: string }>).find(
      (a) => a.title === "Archived Axis"
    ),
    "Archived Axis missing"
  ).id;

  const activeTask = await call(
    "reconcile_topic",
    {
      problems: [{ axisId: activeAxisId, statement: `Active task statement ${TOKEN}`, title: "Active task" }],
      topicId: activeTopicId,
    },
    path
  );
  const activeProblemId = must(
    (activeTask.problems as Array<{ id: string }>)[0],
    "active task missing"
  ).id;

  const archivedTask = await call(
    "reconcile_topic",
    {
      problems: [
        { axisId: archivedAxisId, statement: `Archived task statement ${TOKEN}`, title: "Archived task" },
      ],
      topicId: archivedTopicId,
    },
    path
  );
  const archivedProblemId = must(
    (archivedTask.problems as Array<{ id: string }>)[0],
    "archived task missing"
  ).id;

  // Plain notes: topic-level, so they carry a direct project target.
  await call(
    "reconcile_topic",
    { annotations: [{ text: `Active plain note ${TOKEN}` }], topicId: activeTopicId },
    path
  );
  await call(
    "reconcile_topic",
    { annotations: [{ text: `Archived plain note ${TOKEN}` }], topicId: archivedTopicId },
    path
  );
  // Bulk archived plain notes: enough to exceed a small search limit, so the "filter before LIMIT"
  // rule has something to be tested against.
  for (let index = 0; index < 8; index += 1) {
    await call(
      "reconcile_topic",
      { annotations: [{ text: `Archived bulk note ${index} ${TOKEN}` }], topicId: archivedTopicId },
      path
    );
  }

  // Claims with no direct project target: ownership is carried through the axis, then the task.
  await call(
    "reconcile_topic",
    {
      annotations: [
        { axisId: activeAxisId, confidence: "inferred", kind: "interpretation", text: `Active axis claim ${TOKEN}` },
      ],
      topicId: activeTopicId,
    },
    path
  );
  await call(
    "reconcile_topic",
    {
      annotations: [
        { axisId: archivedAxisId, confidence: "inferred", kind: "interpretation", text: `Archived axis claim ${TOKEN}` },
      ],
      topicId: archivedTopicId,
    },
    path
  );
  await call(
    "reconcile_topic",
    {
      annotations: [
        { confidence: "inferred", kind: "interpretation", problemId: activeProblemId, text: `Active task claim ${TOKEN}` },
      ],
      topicId: activeTopicId,
    },
    path
  );
  await call(
    "reconcile_topic",
    {
      annotations: [
        { confidence: "inferred", kind: "interpretation", problemId: archivedProblemId, text: `Archived task claim ${TOKEN}` },
      ],
      topicId: archivedTopicId,
    },
    path
  );

  // Activities: an axis activity in each project, plus a topic-level (no axis) activity in the
  // archived project — ownership there is direct, not through an axis.
  await call(
    "reconcile_topic",
    { activities: [{ axisId: activeAxisId, summary: `Active activity ${TOKEN}` }], topicId: activeTopicId },
    path
  );
  await call(
    "reconcile_topic",
    { activities: [{ axisId: archivedAxisId, summary: `Archived activity ${TOKEN}` }], topicId: archivedTopicId },
    path
  );
  await call(
    "reconcile_topic",
    { activities: [{ summary: `Archived topic activity ${TOKEN}` }], topicId: archivedTopicId },
    path
  );

  // Truly topicless rows: no writer produces these, so they are inserted directly. They must stay
  // visible — they belong to no archived project.
  exec(
    path,
    `INSERT INTO annotations (id, topic_id, axis_id, problem_id, text, kind, confidence, author_type, author_id, created_at)
     VALUES (?, NULL, NULL, NULL, ?, 'note', NULL, 'human', '', ?)`,
    crypto.randomUUID(),
    `Global note ${TOKEN}`,
    new Date().toISOString()
  );
  exec(
    path,
    `INSERT INTO activities (id, topic_id, axis_id, problem_id, repository_id, summary, source_type, source_ref, source_url, actor_type, actor_id, occurred_at, recorded_at)
     VALUES (?, NULL, NULL, NULL, NULL, ?, 'manual', '', '', 'human', '', ?, ?)`,
    crypto.randomUUID(),
    `Global activity ${TOKEN}`,
    new Date().toISOString(),
    new Date().toISOString()
  );

  return { activeAxisId, activeProblemId, activeTopicId, archivedAxisId, archivedProblemId, archivedTopicId };
}

function names<T>(list: T[], pick: (item: T) => string): string[] {
  return list.map(pick);
}

type Overview = {
  blocked: Array<{ title: string }>;
  counts: { axes: number; people: number; repositories: number; topics: number; topicsByStatus: Record<string, number> };
  recentActivity: Array<{ summary: string }>;
  recentTopics: Array<{ name: string }>;
  timeline: Array<{ topic: { name: string } }>;
  topics: Array<{ topic: { name: string } }>;
};

type Search = {
  activities: Array<{ record: { summary: string } }>;
  annotations: Array<{ record: { text: string } }>;
  axes: Array<{ record: { title: string } }>;
  problems: Array<{ record: { statement: string } }>;
  topics: Array<{ record: { name: string } }>;
  truncated: boolean;
};

describe("Archived-record filtering — inventory totals always include archived", () => {
  test("counts and status totals are identical with and without archived, and count archived rows", async () => {
    const path = freshDatabase();
    await seed(path);

    const base = (await call("get_overview", {}, path)) as unknown as Overview;
    const withArchived = (await call("get_overview", { includeArchived: true }, path)) as unknown as Overview;

    // The inventory totals never depend on the presentation filter.
    expect(base.counts).toEqual(withArchived.counts);
    expect(base.counts.axes).toBe(2);
    expect(base.counts.topics).toBe(2);
    // The archived project and its axis are counted, not hidden.
    expect(base.counts.topicsByStatus.archived).toBe(1);
    expect(base.counts.topicsByStatus.active).toBe(1);
  });
});

describe("Archived-record filtering — overview result lists honor includeArchived (default false)", () => {
  test("topics and recentTopics drop the archived project by default and return it when asked", async () => {
    const path = freshDatabase();
    await seed(path);

    const base = (await call("get_overview", {}, path)) as unknown as Overview;
    const withArchived = (await call("get_overview", { includeArchived: true }, path)) as unknown as Overview;

    expect(names(base.topics, (t) => t.topic.name)).toEqual(["Active Topic"]);
    expect(names(withArchived.topics, (t) => t.topic.name).sort()).toEqual(["Active Topic", "Archived Topic"]);

    expect(names(base.recentTopics, (t) => t.name)).not.toContain("Archived Topic");
    expect(names(withArchived.recentTopics, (t) => t.name)).toContain("Archived Topic");
  });

  test("the blocked list drops a blocked axis of an archived project by default", async () => {
    const path = freshDatabase();
    await seed(path);

    const base = (await call("get_overview", {}, path)) as unknown as Overview;
    const withArchived = (await call("get_overview", { includeArchived: true }, path)) as unknown as Overview;

    expect(names(base.blocked, (b) => b.title)).not.toContain("Archived Axis");
    expect(names(withArchived.blocked, (b) => b.title)).toContain("Archived Axis");
  });

  test("recentActivity follows the owning project, but a topicless activity stays visible", async () => {
    const path = freshDatabase();
    await seed(path);

    const base = (await call("get_overview", {}, path)) as unknown as Overview;
    const withArchived = (await call("get_overview", { includeArchived: true }, path)) as unknown as Overview;

    const baseSummaries = names(base.recentActivity, (a) => a.summary);
    expect(baseSummaries).toContain(`Active activity ${TOKEN}`);
    expect(baseSummaries).not.toContain(`Archived activity ${TOKEN}`);
    expect(baseSummaries).not.toContain(`Archived topic activity ${TOKEN}`);
    // Truly topicless records remain visible.
    expect(baseSummaries).toContain(`Global activity ${TOKEN}`);
    expect(names(withArchived.recentActivity, (a) => a.summary)).toContain(`Archived activity ${TOKEN}`);
  });

  test("the timeline drops an archived project whether the event names an axis or the project itself", async () => {
    const path = freshDatabase();
    await seed(path);

    const base = (await call("get_overview", {}, path)) as unknown as Overview;
    const withArchived = (await call("get_overview", { includeArchived: true }, path)) as unknown as Overview;

    expect(names(base.timeline, (g) => g.topic.name)).not.toContain("Archived Topic");
    expect(names(base.timeline, (g) => g.topic.name)).toContain("Active Topic");
    expect(names(withArchived.timeline, (g) => g.topic.name)).toContain("Archived Topic");
  });
});

describe("Archived-record filtering — search hits honor includeArchived (default false)", () => {
  test("search drops archived topics, axes, tasks, activities and notes, and keeps active/global ones", async () => {
    const path = freshDatabase();
    await seed(path);

    const base = (await call("search_dashboard", { limit: 50, query: TOKEN }, path)) as unknown as Search;

    expect(names(base.topics, (h) => h.record.name)).toEqual(["Active Topic"]);
    expect(names(base.axes, (h) => h.record.title)).toEqual(["Active Axis"]);
    expect(names(base.problems, (h) => h.record.statement)).toEqual([`Active task statement ${TOKEN}`]);

    const activities = names(base.activities, (h) => h.record.summary);
    expect(activities).toContain(`Active activity ${TOKEN}`);
    expect(activities).toContain(`Global activity ${TOKEN}`);
    expect(activities).not.toContain(`Archived activity ${TOKEN}`);
    expect(activities).not.toContain(`Archived topic activity ${TOKEN}`);

    // Notes and claims: a direct project target, or ownership through the axis / task when the note
    // carries none. All three archived variants must be gone; the topicless global note stays.
    const annotations = names(base.annotations, (h) => h.record.text);
    expect(annotations).toContain(`Active plain note ${TOKEN}`);
    expect(annotations).toContain(`Active axis claim ${TOKEN}`);
    expect(annotations).toContain(`Active task claim ${TOKEN}`);
    expect(annotations).toContain(`Global note ${TOKEN}`);
    expect(annotations).not.toContain(`Archived plain note ${TOKEN}`);
    expect(annotations).not.toContain(`Archived axis claim ${TOKEN}`);
    expect(annotations).not.toContain(`Archived task claim ${TOKEN}`);
    expect(annotations.some((text) => text.startsWith("Archived bulk note"))).toBe(false);
  });

  test("search includeArchived:true returns the archived records too", async () => {
    const path = freshDatabase();
    await seed(path);

    const all = (await call(
      "search_dashboard",
      { includeArchived: true, limit: 50, query: TOKEN },
      path
    )) as unknown as Search;

    expect(names(all.topics, (h) => h.record.name).sort()).toEqual(["Active Topic", "Archived Topic"]);
    expect(names(all.axes, (h) => h.record.title).sort()).toEqual(["Active Axis", "Archived Axis"]);
    const annotations = names(all.annotations, (h) => h.record.text);
    expect(annotations).toContain(`Archived plain note ${TOKEN}`);
    expect(annotations).toContain(`Archived axis claim ${TOKEN}`);
    expect(annotations).toContain(`Archived task claim ${TOKEN}`);
  });

  test("search filters before the limit: archived matches do not consume the visible page", async () => {
    const path = freshDatabase();
    await seed(path);

    // Visible annotations (default) are the four active/global ones; the eleven archived notes exceed
    // the limit, so an unfiltered query would both return archived text and report `truncated`.
    const base = (await call("search_dashboard", { limit: 6, query: TOKEN }, path)) as unknown as {
      annotations: Array<{ record: { text: string } }>;
      truncated: boolean;
    };

    const annotations = names(base.annotations, (h) => h.record.text);
    expect(annotations).toHaveLength(4);
    expect(annotations.some((text) => text.includes("Archived"))).toBe(false);
    expect(base.truncated).toBe(false);
  });
});

describe("Archived-record filtering — reads never mutate the database", () => {
  test("an overview and a search read leave the canonical snapshot unchanged", async () => {
    const path = freshDatabase();
    await seed(path);

    const before = canonicalSnapshot(path);
    await call("get_overview", {}, path);
    await call("get_overview", { includeArchived: true }, path);
    await call("search_dashboard", { limit: 50, query: TOKEN }, path);
    expect(canonicalSnapshot(path)).toBe(before);
    // Sanity: the fixture actually populated the tables the reads touch.
    expect((rows(path, "SELECT count(*) AS n FROM annotations")[0]?.n as number) > 0).toBe(true);
  });
});
