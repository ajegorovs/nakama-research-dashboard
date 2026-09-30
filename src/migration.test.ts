/**
 * Migration 002 tests.
 *
 * The interesting failures only happen on data that already exists, so every test here starts from a
 * database built out of `001-research.sql` and populated the way an installed generation-1 instance
 * would have it — including the vocabulary drift gen 1 allowed (a free-string source type) and the
 * status value gen 2 renamed ('done' → 'completed', which a CHECK constraint makes fatal if the copy
 * forgets to map it).
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dir, "../migrations");
const V1 = readFileSync(join(migrationsDir, "001-research.sql"), "utf8");
const V2 = readFileSync(
  join(migrationsDir, "002-coordination-model.sql"),
  "utf8"
);

const AT = "2026-09-01T10:00:00.000Z";

function tempPath(): string {
  return `${process.env.TMPDIR ?? "/tmp"}/research-migration-${crypto.randomUUID()}.sqlite`;
}

function apply(path: string, sql: string): void {
  const db = new Database(path);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
}

/** A generation-1 database: 001 applied, two projects, activity covering every legacy source type. */
function v1Database(): string {
  const path = tempPath();
  const db = new Database(path);
  try {
    db.exec(V1);
    const project = db.query(
      "INSERT INTO projects (id, name, description, status, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    project.run(
      "p-active",
      "Signal Processing",
      "filtering and reconstruction",
      "active",
      "validated on the full evaluation set",
      AT,
      AT
    );
    project.run(
      "p-done",
      "Reconstruction Study",
      "",
      "done",
      "closed out after the comparison",
      AT,
      AT
    );

    const activity = db.query(
      "INSERT INTO activities (id, project_id, source_type, source_ref, summary, occurred_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    activity.run("a-1", "p-active", "manual", "", "recorded by hand", AT);
    activity.run(
      "a-2",
      "p-active",
      "github_pr",
      "PR #142",
      "sampler refactor merged",
      AT
    );
    activity.run("a-3", "p-active", "github_issue", "#88", "issue opened", AT);
    activity.run(
      "a-4",
      "p-active",
      "commit",
      "a1f3c9",
      "sweep config committed",
      AT
    );
    activity.run(
      "a-5",
      "p-done",
      "experiment",
      "run 2026-09-29-a",
      "prototype run finished",
      AT
    );
    activity.run(
      "a-6",
      "p-done",
      "document",
      "agenda.md",
      "document updated",
      AT
    );
    // Free-string drift: gen 1 let this through before the manifest declared an enum.
    activity.run("a-7", "p-done", "PR", "", "drifted source type", AT);
  } finally {
    db.close();
  }
  return path;
}

function open(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("migration 002 (V1 -> V2)", () => {
  test("copies generation 1 into topics, mapping the renamed status", () => {
    const path = v1Database();
    apply(path, V2);
    const db = open(path);
    try {
      const topics = db
        .query(
          "SELECT id, name, status, summary, version FROM topics ORDER BY id"
        )
        .all() as Array<Record<string, unknown>>;
      expect(topics).toHaveLength(2);
      expect(topics[0]).toMatchObject({
        id: "p-active",
        status: "active",
        version: 1,
      });
      // 'done' is not in the gen-2 vocabulary; unmapped it would trip the CHECK and abort the file.
      expect(topics[1]).toMatchObject({ id: "p-done", status: "completed" });
      expect(topics[1]?.summary).toBe("closed out after the comparison");
    } finally {
      db.close();
    }
  });

  test("copies activity with the mapped vocabulary, no axis, and honest provenance", () => {
    const path = v1Database();
    apply(path, V2);
    const db = open(path);
    try {
      const rows = db
        .query(
          "SELECT id, topic_id, axis_id, source_type, actor_type, actor_id, occurred_at, recorded_at FROM activities ORDER BY id"
        )
        .all() as Array<Record<string, string | null>>;
      expect(rows).toHaveLength(7);
      const byId = new Map(rows.map((row) => [row.id, row]));

      expect(byId.get("a-4")).toMatchObject({
        source_type: "github_commit",
        topic_id: "p-active",
      });
      expect(byId.get("a-6")).toMatchObject({
        source_type: "repo_document",
        topic_id: "p-done",
      });
      expect(byId.get("a-1")).toMatchObject({ source_type: "manual" });
      expect(byId.get("a-2")).toMatchObject({ source_type: "github_pr" });
      expect(byId.get("a-3")).toMatchObject({ source_type: "github_issue" });
      expect(byId.get("a-5")).toMatchObject({ source_type: "experiment" });
      // Unrecognised gen-1 values degrade instead of aborting the migration.
      expect(byId.get("a-7")).toMatchObject({ source_type: "manual" });

      for (const row of rows) {
        expect(row.axis_id).toBeNull();
        expect(row.recorded_at).toBe(row.occurred_at);
        // Gen 1 recorded no actor; claiming 'human' would invent attribution.
        expect(row.actor_type).toBe("unknown");
        expect(row.actor_id).toBe("");
      }
    } finally {
      db.close();
    }
  });

  test("keeps generation 1 readable, with its foreign key following the rename", () => {
    const path = v1Database();
    apply(path, V2);
    const db = open(path);
    try {
      expect(
        (
          db.query("SELECT count(*) AS n FROM projects_v1").get() as {
            n: number;
          }
        ).n
      ).toBe(2);
      expect(
        (
          db.query("SELECT count(*) AS n FROM activities_v1").get() as {
            n: number;
          }
        ).n
      ).toBe(7);
      // The original values, unmapped — the copy is additive, not destructive.
      expect(
        (
          db
            .query("SELECT status FROM projects_v1 WHERE id = 'p-done'")
            .get() as { status: string }
        ).status
      ).toBe("done");

      const keys = db
        .query("PRAGMA foreign_key_list(activities_v1)")
        .all() as Array<{ table: string }>;
      expect(keys.map((key) => key.table)).toContain("projects_v1");
      expect(db.query("PRAGMA foreign_key_check").all()).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  test("enforces the gen-2 vocabularies that gen 1 left open", () => {
    const path = v1Database();
    apply(path, V2);
    const db = open(path);
    try {
      expect(() =>
        db
          .query(
            "INSERT INTO topics (id, name, status, created_at, updated_at) VALUES ('t', 'x', 'done', ?, ?)"
          )
          .run(AT, AT)
      ).toThrow();
      expect(() =>
        db
          .query(
            "INSERT INTO activities (id, summary, source_type, occurred_at, recorded_at) VALUES ('a', 'x', 'PR', ?, ?)"
          )
          .run(AT, AT)
      ).toThrow();
      expect(() =>
        db
          .query(
            "INSERT INTO development_axes (id, topic_id, title, kind, created_at, updated_at) VALUES ('x', 'p-active', 't', 'sprint', ?, ?)"
          )
          .run(AT, AT)
      ).toThrow();
    } finally {
      db.close();
    }
  });

  test("allows one primary repository per axis, and any number of supporting ones", () => {
    const path = v1Database();
    apply(path, V2);
    const db = open(path);
    try {
      db.query(
        "INSERT INTO repositories (id, full_name, created_at, updated_at) VALUES ('r1', 'group/one', ?, ?)"
      ).run(AT, AT);
      db.query(
        "INSERT INTO repositories (id, full_name, created_at, updated_at) VALUES ('r2', 'group/two', ?, ?)"
      ).run(AT, AT);
      db.query(
        "INSERT INTO development_axes (id, topic_id, title, created_at, updated_at) VALUES ('ax', 'p-active', 'Signal explorer', ?, ?)"
      ).run(AT, AT);
      const link = db.query(
        "INSERT INTO axis_repositories (axis_id, repository_id, relationship) VALUES (?, ?, ?)"
      );
      link.run("ax", "r1", "primary");
      link.run("ax", "r2", "supporting");
      expect(() => link.run("ax", "r2", "primary")).toThrow();
    } finally {
      db.close();
    }
  });

  test("cascades an axis deletion to its links, activity and annotations", () => {
    const path = v1Database();
    apply(path, V2);
    const db = open(path);
    try {
      db.query(
        "INSERT INTO development_axes (id, topic_id, title, created_at, updated_at) VALUES ('ax', 'p-active', 'Filtering comparison', ?, ?)"
      ).run(AT, AT);
      db.query(
        "INSERT INTO activities (id, topic_id, axis_id, summary, occurred_at, recorded_at) VALUES ('a-x', 'p-active', 'ax', 'note', ?, ?)"
      ).run(AT, AT);
      db.query(
        "INSERT INTO annotations (id, axis_id, text, author_type, created_at) VALUES ('ann', 'ax', 'hardware test postponed', 'human', ?)"
      ).run(AT);

      db.query("DELETE FROM development_axes WHERE id = 'ax'").run();

      expect(
        (
          db
            .query("SELECT count(*) AS n FROM activities WHERE id = 'a-x'")
            .get() as { n: number }
        ).n
      ).toBe(0);
      expect(
        (
          db
            .query("SELECT count(*) AS n FROM annotations WHERE id = 'ann'")
            .get() as { n: number }
        ).n
      ).toBe(0);
      // The topic itself survives; only the axis and its evidence go.
      expect(
        (db.query("SELECT count(*) AS n FROM topics").get() as { n: number }).n
      ).toBe(2);
    } finally {
      db.close();
    }
  });

  test("is atomic: a failure part-way through leaves the database untouched", () => {
    // The host runs a migration with a bare `exec` and no transaction of its own, so 002 opens one.
    // Simulated here by appending a statement that cannot succeed after the schema work is done.
    const path = v1Database();
    const broken = V2.replace(
      "COMMIT;",
      "INSERT INTO no_such_table (x) VALUES (1);\nCOMMIT;"
    );
    expect(broken).not.toBe(V2);
    expect(() => apply(path, broken)).toThrow();

    const db = open(path);
    try {
      const names = (
        db
          .query("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name);
      expect(names).not.toContain("topics");
      expect(names).toContain("projects");
      expect(names).not.toContain("projects_v1");
      expect(
        (db.query("SELECT count(*) AS n FROM projects").get() as { n: number })
          .n
      ).toBe(2);
    } finally {
      db.close();
    }
  });
});
