/**
 * Rollup archive scoping — the `people` / `repositories` rollups that `get_overview` carries, exercised
 * through the real `run` entrypoint against a disposable database built from the shipped migrations.
 *
 * The policy these tests pin down (the R1 fix):
 *
 *   - `recentActivity` on a person or repository rollup is **nested** work: it honors `includeArchived`
 *     (default false) *and* the selected activity window, exactly like the top-level `recentActivity`.
 *   - `lastActivityAt` reports the last event across **visible** projects, and it is **independent of the
 *     selected window**: a person whose last visible event was three weeks ago has not recorded nothing.
 *   - With `includeArchived: true` every project counts, so the newest archived event wins.
 *   - A truly **topicless** event — owned by no project, axis or task, even when it names a repository —
 *     is retained: no project exists to hide it.
 *
 * The fixture maps one account to a person, shares one repository between an active and an archived axis,
 * and records an old active event (outside the window) beside a newer archived one (inside it). Every read
 * goes through `run` and must not mutate the database.
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

function contextFor(actionKey: string, databasePath: string, actorId = "user-1"): RunContext {
  return {
    actionKey,
    actor: { id: actorId, role: "member" },
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
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-rollup-archive-${crypto.randomUUID()}.sqlite`;
  disposablePaths.push(path);
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) db.exec(migration);
  } finally {
    db.close();
  }
  return path;
}

async function call(
  actionKey: string,
  input: Row,
  path: string,
  actorId = "user-1"
): Promise<Row> {
  return (await run(input, contextFor(actionKey, path, actorId))) as Row;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
/** An active event old enough to fall outside the default 14-day window. */
const T_OLD = new Date(NOW - 20 * MS_PER_DAY).toISOString();
/** A newer archived event, comfortably inside the window. */
const T_NEW = new Date(NOW - 1 * MS_PER_DAY).toISOString();
/** A topicless direct repository event, inside the window. */
const T_DIRECT = new Date(NOW - 2 * MS_PER_DAY).toISOString();

const SHARED_REPO = "acme/shared";
const ARCHIVE_ONLY_REPO = "acme/archive-only";

type Seeded = {
  archivedTopicId: string;
  sharedRepositoryId: string;
  archiveOnlyRepositoryId: string;
};

/**
 * One active project (axis → shared repository) and one archived project (axis → the same shared
 * repository and one archive-only repository).
 *
 * Activities:
 *   - "active shared"    actor user-1, on the active axis, at T_OLD (outside the window).
 *   - "archived shared"  actor user-1, on the archived axis, at T_NEW (inside the window).
 *   - "archived q"       actor user-2, on the archived axis, at T_NEW.
 *   - "topicless direct" actor "" (unattributable), repository set, no topic/axis, at T_DIRECT — inserted
 *     directly because no writer produces a genuinely topicless activity.
 *
 * People: P is on the active project (account user-1); Q is on the archived project only (account user-2).
 */
async function seed(path: string): Promise<Seeded> {
  await call(
    "reconcile_topic",
    {
      axes: [
        {
          repositories: [{ fullName: SHARED_REPO, relationship: "primary" }],
          title: "Active Axis",
        },
      ],
      people: [{ displayName: "Person P", nakamaUserId: "user-1", role: "" }],
      topic: { description: "Active project", name: "Active Topic" },
      activities: [{ axisTitle: "Active Axis", occurredAt: T_OLD, summary: "active shared" }],
    },
    path,
    "user-1"
  );

  const archived = await call(
    "reconcile_topic",
    {
      axes: [
        {
          blocker: "Waiting on review",
          blockerConfidence: "inferred",
          repositories: [
            { fullName: SHARED_REPO, relationship: "supporting" },
            { fullName: ARCHIVE_ONLY_REPO, relationship: "primary" },
          ],
          state: "blocked",
          stateConfidence: "inferred",
          title: "Archived Axis",
        },
      ],
      people: [{ displayName: "Person Q", nakamaUserId: "user-2", role: "" }],
      topic: { description: "Archived project", name: "Archived Topic", status: "archived" },
      activities: [{ axisTitle: "Archived Axis", occurredAt: T_NEW, summary: "archived shared" }],
    },
    path,
    "user-1"
  );
  const archivedTopicId = (archived.topic as { id: string }).id;

  // Q's own event, so a person whose only work is on the archived project has a last event to hide.
  await call(
    "reconcile_topic",
    {
      activities: [{ axisTitle: "Archived Axis", occurredAt: T_NEW, summary: "archived q" }],
      topicId: archivedTopicId,
    },
    path,
    "user-2"
  );

  const db = new Database(path);
  let sharedRepositoryId: string;
  let archiveOnlyRepositoryId: string;
  try {
    const shared = db
      .query("SELECT id FROM repositories WHERE full_name = ?")
      .get(SHARED_REPO) as { id: string } | null;
    sharedRepositoryId = must(shared?.id, "shared repository missing");
    const archiveOnly = db
      .query("SELECT id FROM repositories WHERE full_name = ?")
      .get(ARCHIVE_ONLY_REPO) as { id: string } | null;
    archiveOnlyRepositoryId = must(archiveOnly?.id, "archive-only repository missing");
  } finally {
    db.close();
  }

  // Truly topicless direct activity: no project, axis or task owns it, only a repository is named.
  exec(
    path,
    `INSERT INTO activities (id, topic_id, axis_id, problem_id, repository_id, summary, source_type, source_ref, source_url, actor_type, actor_id, occurred_at, recorded_at)
     VALUES (?, NULL, NULL, NULL, ?, ?, 'manual', '', '', 'human', '', ?, ?)`,
    crypto.randomUUID(),
    sharedRepositoryId,
    "topicless direct",
    T_DIRECT,
    T_DIRECT
  );

  return { archivedTopicId, sharedRepositoryId, archiveOnlyRepositoryId };
}

type Activity = { occurredAt: string; summary: string };
type PersonRollup = {
  lastActivityAt: string | null;
  person: { displayName: string; id: string; nakamaUserId: string | null };
  recentActivity: Activity[];
};
type RepositoryRollup = {
  lastActivityAt: string | null;
  recentActivity: Activity[];
  repository: { fullName: string; id: string };
};
type Overview = { people: PersonRollup[]; repositories: RepositoryRollup[] };

function personFor(overview: Overview, displayName: string): PersonRollup {
  return must(
    overview.people.find((rollup) => rollup.person.displayName === displayName),
    `person rollup missing: ${displayName}`
  );
}

function repositoryFor(overview: Overview, fullName: string): RepositoryRollup {
  return must(
    overview.repositories.find((rollup) => rollup.repository.fullName === fullName),
    `repository rollup missing: ${fullName}`
  );
}

function summaries(rollup: { recentActivity: Activity[] }): string[] {
  return rollup.recentActivity.map((event) => event.summary).sort();
}

async function overviews(path: string): Promise<{ base: Overview; withArchived: Overview }> {
  const base = (await call("get_overview", {}, path)) as unknown as Overview;
  const withArchived = (await call(
    "get_overview",
    { includeArchived: true },
    path
  )) as unknown as Overview;
  return { base, withArchived };
}

describe("rollup recentActivity is nested work: includeArchived and the window both apply", () => {
  test("hidden archived events never reach a person or repository recentActivity (default false)", async () => {
    const path = freshDatabase();
    await seed(path);
    const { base } = await overviews(path);

    // The active event is outside the 14-day window, so P has nothing recent — and the newer archived
    // event by the same account must not leak in behind the archive filter.
    expect(summaries(personFor(base, "Person P"))).toEqual([]);

    // The shared repository keeps only its genuinely topicless direct event; the archived axis events
    // recorded by both accounts are hidden, and the old active event is outside the window.
    expect(summaries(repositoryFor(base, SHARED_REPO))).toEqual(["topicless direct"]);
  });

  test("with includeArchived the archived events appear (window still applies)", async () => {
    const path = freshDatabase();
    await seed(path);
    const { withArchived } = await overviews(path);

    expect(summaries(personFor(withArchived, "Person P"))).toEqual(["archived shared"]);
    expect(summaries(personFor(withArchived, "Person Q"))).toEqual(["archived q"]);
    expect(summaries(repositoryFor(withArchived, SHARED_REPO))).toEqual([
      "archived q",
      "archived shared",
      "topicless direct",
    ]);
    expect(summaries(repositoryFor(withArchived, ARCHIVE_ONLY_REPO))).toEqual([
      "archived q",
      "archived shared",
    ]);
  });
});

describe("rollup lastActivityAt spans visible projects and ignores the selected window", () => {
  test("a newer archived event does not become a person's or repository's last when hidden", async () => {
    const path = freshDatabase();
    await seed(path);
    const { base } = await overviews(path);

    // P's last visible event is the old active one: outside the window, still their last recorded work.
    expect(personFor(base, "Person P").lastActivityAt).toBe(T_OLD);
    // The shared repository's last visible event is the topicless direct one (newer than the old active).
    expect(repositoryFor(base, SHARED_REPO).lastActivityAt).toBe(T_DIRECT);
  });

  test("with includeArchived the newest archived event is the last for both", async () => {
    const path = freshDatabase();
    await seed(path);
    const { withArchived } = await overviews(path);

    expect(personFor(withArchived, "Person P").lastActivityAt).toBe(T_NEW);
    expect(personFor(withArchived, "Person Q").lastActivityAt).toBe(T_NEW);
    expect(repositoryFor(withArchived, SHARED_REPO).lastActivityAt).toBe(T_NEW);
    expect(repositoryFor(withArchived, ARCHIVE_ONLY_REPO).lastActivityAt).toBe(T_NEW);
  });
});

describe("rollup lastActivityAt is null for archived-only people and repositories when hidden", () => {
  test("an archived-only person and repository report no last activity by default", async () => {
    const path = freshDatabase();
    await seed(path);
    const { base } = await overviews(path);

    expect(personFor(base, "Person Q").lastActivityAt).toBeNull();
    expect(summaries(personFor(base, "Person Q"))).toEqual([]);
    expect(repositoryFor(base, ARCHIVE_ONLY_REPO).lastActivityAt).toBeNull();
    expect(summaries(repositoryFor(base, ARCHIVE_ONLY_REPO))).toEqual([]);
  });
});

describe("rollup reads never mutate the database", () => {
  test("an overview read leaves the canonical snapshot unchanged", async () => {
    const path = freshDatabase();
    await seed(path);

    const before = canonicalSnapshot(path);
    await call("get_overview", {}, path);
    await call("get_overview", { includeArchived: true }, path);
    expect(canonicalSnapshot(path)).toBe(before);
  });
});
