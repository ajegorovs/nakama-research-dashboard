/**
 * Migration 006 tests — replay safety, preservation, and the widened task vocabulary.
 *
 * Every claim here was reproduced against `bun:sqlite` 3.53.2, the engine the host's applier uses
 * (`harness/test-004.mjs` applies each file with `db.exec(file)`).
 *
 * The load-bearing one: `db.exec()` propagates an error only from the FINAL statement of a script, so a
 * migration cannot rest safety on a constraint abort — a replay-safe migration must be TOTAL (no statement
 * may ever fail; see `migrations/006-task-plan-text.sql`). These tests assert that a second execution, with
 * or without post-migration writes, converges and preserves rather than destroying.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dir, "../migrations");
const read = (name: string): string =>
  readFileSync(join(migrationsDir, name), "utf8");

const CORE = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
].map(read);
const MIGRATION_006 = read("006-task-plan-text.sql");

/**
 * A pre-006 database (001–005) with one topic, one axis, one human problem carrying a bootstrap and a
 * resolved transition, and one axis-scoped plan with two steps and a same-axis plan-step link.
 */
function seeded(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  for (const migration of CORE) {
    db.exec(migration);
  }
  db.exec(`INSERT INTO topics (id,name,description,status,summary,version,created_at,updated_at)
    VALUES ('t1','Turbulence','d','active','s',1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`);
  db.exec(`INSERT INTO development_axes (id,topic_id,title,description,kind,state,branch,pr_number,pr_url,current_state,blocker,state_confidence,current_state_confidence,blocker_confidence,version,created_at,updated_at,last_reviewed_at)
    VALUES ('a1','t1','Axis','','feature','active','',NULL,'','','','confirmed','confirmed','confirmed',1,'2026-01-01T00:00:00Z','2026-01-03T00:00:00Z',NULL)`);
  db.exec(`INSERT INTO problems (id,axis_id,statement,state,state_confidence,plan_step_id,author_type,author_id,version,created_at,updated_at)
    VALUES ('p1','a1','the statement','open','confirmed',NULL,'human','',1,'2026-01-01T00:00:00Z','2026-01-04T00:00:00Z')`);
  db.exec(`INSERT INTO state_log (id,axis_id,problem_id,from_state,to_state,origin,actor_id,observed_at,recorded_at)
    VALUES ('sl-boot','a1',NULL,NULL,'active','migration','',NULL,'2026-01-03T00:00:00Z')`);
  db.exec(`INSERT INTO state_log (id,axis_id,problem_id,from_state,to_state,origin,actor_id,observed_at,recorded_at)
    VALUES ('sl-p1-1',NULL,'p1','open','resolved','human','','2026-01-04T00:00:00Z','2026-01-04T00:00:00Z')`);
  db.exec(`INSERT INTO plans (id,axis_id,summary,author_type,author_id,version,created_at,updated_at)
    VALUES ('pl1','a1','the axis plan','human','',1,'2026-01-02T00:00:00Z','2026-01-02T00:00:00Z')`);
  db.exec(`INSERT INTO plan_steps (id,plan_id,title,position,state,created_at,updated_at)
    VALUES ('ps1','pl1','step one',0,'pending','2026-01-02T00:00:00Z','2026-01-02T00:00:00Z'),
           ('ps2','pl1','step two',1,'done','2026-01-02T00:00:00Z','2026-01-02T00:00:00Z')`);
  db.query("UPDATE problems SET plan_step_id='ps1' WHERE id='p1'").run();
  return db;
}

const apply = (db: Database, sql: string): void => {
  db.exec(sql);
};

/** Identity, not counts: rows, schema, foreign-key clauses and integrity, per table. */
function fingerprint(db: Database): Record<string, unknown> {
  const tables = (
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
  const fp: Record<string, unknown> = {
    counts: {} as Record<string, number>,
    fks: {} as Record<string, unknown>,
    integrity: (db.query("PRAGMA integrity_check").get() as { integrity_check: string })
      .integrity_check,
    rows: {} as Record<string, string>,
    schema: {} as Record<string, string | null>,
  };
  for (const table of tables) {
    (fp.counts as Record<string, number>)[table] = (
      db.query(`SELECT * FROM ${table}`).all() as unknown[]
    ).length;
    (fp.rows as Record<string, string>)[table] = JSON.stringify(
      db.query(`SELECT * FROM ${table}`).all()
    );
    (fp.schema as Record<string, string | null>)[table] = (
      db
        .query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(table) as { sql: string | null } | null
    )?.sql ?? null;
    (fp.fks as Record<string, unknown>)[table] = (
      db.query(`PRAGMA foreign_key_list(${table})`).all() as Array<Record<string, string>>
    )
      .map((fk) => `${fk.from}->${fk.table}.${fk.to} on_delete=${fk.on_delete}`)
      .sort();
  }
  return fp;
}

const count = (db: Database, sql: string): number =>
  (db.query(sql).get() as { n: number }).n;

describe("migration 006 — first-run preservation", () => {
  test("keeps the problem, its history, its steps and its same-axis link by identity", () => {
    const db = seeded();
    const preProblem = db.query("SELECT * FROM problems WHERE id='p1'").get();
    const preLog = db.query("SELECT * FROM state_log ORDER BY id").all();
    const preSteps = db.query("SELECT * FROM plan_steps ORDER BY id").all();

    apply(db, MIGRATION_006);

    expect(db.query("SELECT * FROM problems WHERE id='p1'").get()).toEqual(preProblem);
    expect(db.query("SELECT * FROM state_log ORDER BY id").all()).toEqual(preLog);
    expect(db.query("SELECT * FROM plan_steps ORDER BY id").all()).toEqual(preSteps);
    // No title row is fabricated; absence reads as ''.
    expect(
      count(db, "SELECT count(*) n FROM problem_titles WHERE problem_id='p1'")
    ).toBe(0);
    // The axis plan keeps its id and body; its owner moves to the side table.
    expect(db.query("SELECT * FROM plans WHERE id='pl1'").get()).toEqual({
      author_id: "",
      author_type: "human",
      created_at: "2026-01-02T00:00:00Z",
      id: "pl1",
      summary: "the axis plan",
      updated_at: "2026-01-02T00:00:00Z",
      version: 1,
    });
    expect(db.query("SELECT * FROM plan_owners WHERE plan_id='pl1'").get()).toEqual({
      axis_id: "a1",
      plan_id: "pl1",
      problem_id: null,
      topic_id: null,
    });
    expect(
      db.query("SELECT plan_step_id FROM problems WHERE id='p1'").get()
    ).toEqual({ plan_step_id: "ps1" });
    expect((db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe(
      "ok"
    );
  });

  test("widens the task vocabulary to blocked in problems and state_log", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    db.exec("UPDATE problems SET state='blocked' WHERE id='p1'");
    expect(db.query("SELECT state FROM problems WHERE id='p1'").get()).toEqual({
      state: "blocked",
    });
    db.exec(`INSERT INTO state_log (id,axis_id,problem_id,from_state,to_state,origin,actor_id,observed_at,recorded_at)
      VALUES ('sl-p1-block',NULL,'p1','open','blocked','human','',NULL,'2026-01-05T00:00:00Z')`);
    expect(
      count(db, "SELECT count(*) n FROM state_log WHERE id='sl-p1-block'")
    ).toBe(1);
    // The axis vocabulary is untouched by the widening: `blocked` was already an axis state, but a
    // problem-only state is still refused for an axis.
    expect(() =>
      db.exec("UPDATE development_axes SET state='resolved' WHERE id='a1'")
    ).toThrow();
  });

  test("plan_owners rejects zero owners and two owners (the XOR CHECK)", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    expect(() =>
      db.exec(
        "INSERT INTO plan_owners (plan_id,topic_id,axis_id,problem_id) VALUES ('plz',NULL,NULL,NULL)"
      )
    ).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO plan_owners (plan_id,topic_id,axis_id,problem_id) VALUES ('plz','t1','a1',NULL)"
      )
    ).toThrow();
  });
});

describe("migration 006 — delete semantics after the redesign", () => {
  test("deleting the axis cascades problems, plans, steps, titles and log; a direct log delete is refused", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    db.exec("PRAGMA foreign_keys = ON");
    expect(() => db.exec("DELETE FROM state_log WHERE id='sl-p1-1'")).toThrow(/append-only/);

    db.exec("DELETE FROM development_axes WHERE id='a1'");
    expect(count(db, "SELECT count(*) n FROM problems WHERE axis_id='a1'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plans WHERE id='pl1'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plan_steps WHERE plan_id='pl1'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plan_owners WHERE plan_id='pl1'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM state_log WHERE axis_id='a1'")).toBe(0);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("a task plan is retired with its problem via plan_owners_retire_plan", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`INSERT INTO plans (id,summary,author_type,author_id,version,created_at,updated_at)
      VALUES ('pl-task','the task plan','agent','bot',1,'2026-01-06T00:00:00Z','2026-01-06T00:00:00Z')`);
    db.exec(
      "INSERT INTO plan_owners (plan_id,topic_id,axis_id,problem_id) VALUES ('pl-task',NULL,NULL,'p1')"
    );
    db.exec(`INSERT INTO plan_steps (id,plan_id,title,position,state,created_at,updated_at)
      VALUES ('ps9','pl-task','only step',0,'pending','2026-01-06T00:00:00Z','2026-01-06T00:00:00Z')`);

    db.exec("DELETE FROM problems WHERE id='p1'");
    // The FK cascades the owner row; the trigger retires the now-ownerless plan body.
    expect(count(db, "SELECT count(*) n FROM plan_owners WHERE plan_id='pl-task'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plans WHERE id='pl-task'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plan_steps WHERE plan_id='pl-task'")).toBe(0);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

describe("migration 006 — replay safety (the contract this file exists to keep)", () => {
  test("crash-window replay converges byte-identical", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    const first = fingerprint(db);

    let threw = false;
    try {
      apply(db, MIGRATION_006);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);

    const second = fingerprint(db);
    expect(second.schema).toEqual(first.schema);
    expect(second.counts).toEqual(first.counts);
    expect(second.rows).toEqual(first.rows);
    expect(second.fks).toEqual(first.fks);
    expect(second.integrity).toBe("ok");
    // The migration's bootstrap is not duplicated.
    expect(
      count(db, "SELECT count(*) n FROM state_log WHERE origin='migration' AND axis_id='a1'")
    ).toBe(1);
  });

  test("replay after real writes converges and preserves everything (no reset, no skip)", () => {
    const db = seeded();
    apply(db, MIGRATION_006);

    // Post-migration writes across every new shape: a human title, a blocked state + its transition,
    // a topic-scoped plan, a task-scoped plan with a step.
    db.exec("INSERT INTO problem_titles (problem_id, title) VALUES ('p1','Human title after 006')");
    db.exec("UPDATE problems SET state='blocked' WHERE id='p1'");
    db.exec(`INSERT INTO state_log (id,axis_id,problem_id,from_state,to_state,origin,actor_id,observed_at,recorded_at)
      VALUES ('sl-p1-2',NULL,'p1','open','blocked','human','','2026-01-05T00:00:00Z','2026-01-05T00:00:00Z')`);
    db.exec(`INSERT INTO plans (id,summary,author_type,author_id,version,created_at,updated_at)
      VALUES ('pl-topic','the project plan','human','',1,'2026-01-06T00:00:00Z','2026-01-06T00:00:00Z')`);
    db.exec(
      "INSERT INTO plan_owners (plan_id,topic_id,axis_id,problem_id) VALUES ('pl-topic','t1',NULL,NULL)"
    );
    db.exec(`INSERT INTO plans (id,summary,author_type,author_id,version,created_at,updated_at)
      VALUES ('pl-task','the task plan','agent','bot',1,'2026-01-06T00:00:00Z','2026-01-06T00:00:00Z')`);
    db.exec(
      "INSERT INTO plan_owners (plan_id,topic_id,axis_id,problem_id) VALUES ('pl-task',NULL,NULL,'p1')"
    );
    db.exec(`INSERT INTO plan_steps (id,plan_id,title,position,state,created_at,updated_at)
      VALUES ('ps9','pl-task','only step',0,'pending','2026-01-06T00:00:00Z','2026-01-06T00:00:00Z')`);

    expect(() => apply(db, MIGRATION_006)).not.toThrow();

    expect(
      db.query("SELECT title FROM problem_titles WHERE problem_id='p1'").get()
    ).toEqual({ title: "Human title after 006" });
    expect(db.query("SELECT state FROM problems WHERE id='p1'").get()).toEqual({
      state: "blocked",
    });
    expect(db.query("SELECT * FROM state_log WHERE id='sl-p1-2'").get()).not.toBeNull();
    expect(db.query("SELECT * FROM plan_owners WHERE plan_id='pl-topic'").get()).toEqual({
      axis_id: null,
      plan_id: "pl-topic",
      problem_id: null,
      topic_id: "t1",
    });
    expect(db.query("SELECT * FROM plan_owners WHERE plan_id='pl-task'").get()).toEqual({
      axis_id: null,
      plan_id: "pl-task",
      problem_id: "p1",
      topic_id: null,
    });
    expect(
      db.query("SELECT plan_id FROM plan_steps WHERE id='ps9'").get()
    ).toEqual({ plan_id: "pl-task" });
    expect(db.query("SELECT axis_id FROM plan_owners WHERE plan_id='pl1'").get()).toEqual({
      axis_id: "a1",
    });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe(
      "ok"
    );
  });

  /**
   * The gap the retained staging table opens: `plans_legacy_owner` keeps a row for a deleted legacy plan,
   * so an unguarded seed would resurrect it as a dangling `plan_owners` row (a ghost owner steering a plan
   * that no longer exists). The seed is filtered to existing plans and existing axes, so this replay leaves
   * `plan_owners` untouched.
   */
  test("replay after deleting the legacy axis plan does not resurrect the owner or leave FK violations", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    db.exec("PRAGMA foreign_keys = ON");

    // Delete only the plan body: the owner row cascades away, but plans_legacy_owner retains its row.
    db.exec("DELETE FROM plans WHERE id='pl1'");
    expect(count(db, "SELECT count(*) n FROM plan_owners WHERE plan_id='pl1'")).toBe(0);
    expect(
      count(db, "SELECT count(*) n FROM plans_legacy_owner WHERE plan_id='pl1'")
    ).toBe(1);

    expect(() => apply(db, MIGRATION_006)).not.toThrow();

    // No resurrection, no ghost owner, and the stored foreign keys are all backed.
    expect(count(db, "SELECT count(*) n FROM plan_owners WHERE plan_id='pl1'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plans WHERE id='pl1'")).toBe(0);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("replay after the owning axis was deleted does not resurrect the plan either", () => {
    const db = seeded();
    apply(db, MIGRATION_006);
    db.exec("PRAGMA foreign_keys = ON");

    db.exec("DELETE FROM development_axes WHERE id='a1'"); // cascades the owner row + trigger retires the body
    expect(count(db, "SELECT count(*) n FROM plan_owners WHERE plan_id='pl1'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM plans_legacy_owner WHERE plan_id='pl1'")).toBe(1);

    expect(() => apply(db, MIGRATION_006)).not.toThrow();
    expect(count(db, "SELECT count(*) n FROM plan_owners WHERE plan_id='pl1'")).toBe(0);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

/**
 * The negative controls that justify the side-table shape, kept as regression tests so no future edit
 * reintroduces an in-place rebuilt user-data column. They assert the OPPOSITE of what the design once
 * claimed: on this applier the failure is silent and destructive, not a refusal.
 */
describe("migration 006 — why the shape is what it is (negative controls)", () => {
  test("applier primitive: a non-final statement's error is swallowed and the txn still commits", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
    expect(() =>
      db.exec("BEGIN; INSERT INTO t VALUES('a'); INSERT INTO t VALUES('a'); INSERT INTO t VALUES('b'); COMMIT;")
    ).not.toThrow();
    // The duplicate was skipped, not surfaced — so a CHECK on an early statement aborts nothing.
    expect((db.query("SELECT id FROM t ORDER BY id").all() as Array<{ id: string }>).map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("an in-place rebuilt title column is silently reset by a replay (the design's rejected shape)", () => {
    const db = seeded();
    const designProblems = `BEGIN IMMEDIATE;
DROP TABLE IF EXISTS problems_new;
CREATE TABLE problems_new (id TEXT PRIMARY KEY, axis_id TEXT NOT NULL REFERENCES development_axes (id) ON DELETE CASCADE, statement TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','blocked','resolved')), state_confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (state_confidence IN ('confirmed','inferred','uncertain')), plan_step_id TEXT REFERENCES plan_steps (id) ON DELETE SET NULL, author_type TEXT NOT NULL CHECK (author_type IN ('human','agent')), author_id TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO problems_new (id,axis_id,statement,title,state,state_confidence,plan_step_id,author_type,author_id,version,created_at,updated_at) SELECT id,axis_id,statement,'',state,state_confidence,plan_step_id,author_type,author_id,version,created_at,updated_at FROM problems;
DROP TABLE problems; ALTER TABLE problems_new RENAME TO problems; COMMIT;`;
    apply(db, designProblems);
    db.exec("UPDATE problems SET title='A human wrote this' WHERE id='p1'");
    expect(() => apply(db, designProblems)).not.toThrow();
    expect(db.query("SELECT title FROM problems WHERE id='p1'").get()).toEqual({ title: "" });
  });
});
