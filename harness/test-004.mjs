#!/usr/bin/env bun
/**
 * test-004.mjs — the U1 acceptance tests for migration 004.
 *
 * Two modes:
 *   bun harness/test-004.mjs                 self-contained: builds a pre-004 database by applying
 *                                            001→003 itself, seeds a synthetic dataset that exercises
 *                                            every state and both annotation shapes, then migrates.
 *   bun harness/test-004.mjs --db <path>     also runs the same preservation checks against a real
 *                                            pre-004 plugin database (e.g. a corpus snapshot).
 *
 * Runs on bun:sqlite — the host's own engine — so the constraint semantics being tested are the ones the
 * plugin will actually be loaded with, not a different SQLite build.
 *
 * The checks are the ones the U1 charter asks to be proved, plus the invalid combinations the state log has
 * to reject. Every check prints, and the process exits non-zero if any fails.
 */
import { Database } from "bun:sqlite";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const MIG = ["001-research.sql", "002-coordination-model.sql", "003-drop-legacy.sql"];

let passed = 0;
const failures = [];

function ok(label) {
  passed++;
  console.log(`  ok    ${label}`);
}
function fail(label, detail) {
  failures.push(`${label} — ${detail}`);
  console.log(`  FAIL  ${label}\n        ${detail}`);
}
function check(label, condition, detail = "") {
  condition ? ok(label) : fail(label, detail || "condition was false");
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  a === e ? ok(label) : fail(label, `got ${a}, expected ${e}`);
}
function expectThrow(label, fn, match) {
  try {
    fn();
    fail(label, "expected a rejection, but the statement was accepted");
  } catch (e) {
    const m = String(e.message ?? e);
    match && !m.includes(match)
      ? fail(label, `rejected, but not for the expected reason: ${m}`)
      : ok(label);
  }
}
function expectAccept(label, fn) {
  try {
    fn();
    ok(label);
  } catch (e) {
    fail(label, `expected acceptance, but it was rejected: ${String(e.message ?? e)}`);
  }
}

const apply = (db, file) => db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));

/** Everything about a database that must not change: per-table rows by identity, schema, foreign keys. */
function fingerprint(db) {
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  const fp = { tables: {}, schema: {}, fks: {} };
  for (const t of tables) {
    const rows = db.query(`SELECT * FROM ${t}`).all();
    fp.tables[t] = rows.length;
    fp.schema[t] = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t)?.sql;
    fp.fks[t] = db.query(`PRAGMA foreign_key_list(${t})`).all()
      .map((f) => `${f.from}->${f.table}.${f.to} on_delete=${f.on_delete} on_update=${f.on_update}`)
      .sort();
  }
  return fp;
}

function online(db) {
  // The connection-level invariant the preservation argument rests on.
  return db.query("PRAGMA foreign_keys").get().foreign_keys;
}

// ---------------------------------------------------------------------------------------------------
// A pre-004 database: the plugin's own migrations, then a dataset that covers what the migration must
// preserve and what it must start representing.
// ---------------------------------------------------------------------------------------------------
function buildPre004() {
  const db = new Database(":memory:");
  for (const m of MIG) apply(db, m);

  const t = (s) => db.exec(s);
  t(`INSERT INTO topics (id, name, description, status, summary, version, created_at, updated_at)
     VALUES ('topic-1','Turbulence','desc','active','sum',1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`);
  t(`INSERT INTO repositories (id, full_name, url, description, default_branch, created_at, updated_at)
     VALUES ('repo-1','group/model','https://example.invalid/model','d','main','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
  t(`INSERT INTO people (id, display_name, nakama_user_id, github_login, notes, created_at, updated_at)
     VALUES ('person-1','A. Researcher','u1','ares','', '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);

  // One axis per legacy state — including `abandoned`, which neither the corpus nor the fixture reaches.
  const states = ["active", "draft", "blocked", "parked", "completed", "abandoned"];
  states.forEach((state, i) => {
    db.query(
      `INSERT INTO development_axes
         (id, topic_id, title, description, kind, state, branch, pr_number, pr_url, current_state, blocker,
          state_confidence, current_state_confidence, blocker_confidence, version, created_at, updated_at,
          last_reviewed_at)
       VALUES (?, 'topic-1', ?, '', 'feature', ?, '', NULL, '', '', '', 'confirmed','confirmed','confirmed',
               1, '2026-01-01T00:00:00Z','2026-01-03T00:00:00Z', NULL)`
    ).run(`axis-${state}`, `Axis ${state}`, state);
    db.query("INSERT INTO axis_repositories (axis_id, repository_id) VALUES (?, 'repo-1')").run(`axis-${state}`);
    db.query("INSERT INTO axis_people (axis_id, person_id) VALUES (?, 'person-1')").run(`axis-${state}`);
  });

  // Annotations: the historical shape, including five notes that legitimately sit on BOTH a topic and an
  // axis — the rows a strict one-target rule would reject.
  for (let i = 0; i < 4; i++) {
    db.query(`INSERT INTO annotations (id, topic_id, axis_id, text, author_type, author_id, created_at)
              VALUES (?, 'topic-1', 'axis-active', ?, 'human', '', '2026-01-04T00:00:00Z')`)
      .run(`ann-both-${i}`, `note ${i}`);
  }
  db.query(`INSERT INTO annotations (id, topic_id, axis_id, text, author_type, author_id, created_at)
            VALUES ('ann-topic-only','topic-1',NULL,'topic note','human','','2026-01-04T00:00:00Z')`).run();
  for (let i = 0; i < 3; i++) {
    db.query(`INSERT INTO annotations (id, topic_id, axis_id, text, author_type, author_id, created_at)
              VALUES (?, NULL, 'axis-parked', ?, 'agent', 'librarian','2026-01-05T00:00:00Z')`)
      .run(`ann-axis-only-${i}`, `agent note ${i}`);
  }

  for (let i = 0; i < 25; i++) {
    db.query(
      `INSERT INTO activities
         (id, topic_id, axis_id, repository_id, summary, source_type, source_ref, source_url, actor_type,
          actor_id, occurred_at, recorded_at)
       VALUES (?, 'topic-1', 'axis-active', 'repo-1', ?, 'manual', '', '', 'human', '', ?, ?)`
    ).run(`act-${i}`, `activity ${i}`, `2026-01-06T00:00:${String(i).padStart(2, "0")}Z`, "2026-01-06T01:00:00Z");
  }
  return db;
}

// ---------------------------------------------------------------------------------------------------
console.log("\n=== A. Pre-004 → 004 preservation ===\n");
{
  const db = buildPre004();
  const before = fingerprint(db);
  const beforeAxisStates = db.query("SELECT id, state FROM development_axes ORDER BY id").all();
  const beforeAnnotationTargets = db
    .query("SELECT id, topic_id, axis_id FROM annotations ORDER BY id").all();
  const beforeActivityRows = db.query("SELECT id, summary, occurred_at, recorded_at FROM activities ORDER BY id").all();
  const beforeFks = db.query("PRAGMA foreign_key_list(activities)").all()
    .map((f) => `${f.from}->${f.table}.${f.to} on_delete=${f.on_delete}`).sort();

  apply(db, "004-ux-v2-model.sql");

  // Proof 2: every axis keeps its exact state, and nothing lands on `usable`.
  eq("every existing axis keeps its exact state",
     db.query("SELECT id, state FROM development_axes ORDER BY id").all(), beforeAxisStates);
  eq("the new `usable` state has zero historical instances",
     db.query("SELECT COUNT(*) n FROM development_axes WHERE state='usable'").get().n, 0);

  // Proof 1: entities and relationships survive; new columns start empty.
  eq("annotation targets survive byte-for-byte (including the five dual-target notes)",
     db.query("SELECT id, topic_id, axis_id FROM annotations ORDER BY id").all(), beforeAnnotationTargets);
  eq("annotation kinds default to 'note' and confidence to NULL",
     db.query("SELECT COUNT(*) n FROM annotations WHERE kind='note' AND confidence IS NULL").get().n,
     before.tables.annotations);
  eq("activities survive by identity",
     db.query("SELECT id, summary, occurred_at, recorded_at FROM activities ORDER BY id").all(), beforeActivityRows);
  eq("activities.problem_id starts NULL for every historical row",
     db.query("SELECT COUNT(*) n FROM activities WHERE problem_id IS NOT NULL").get().n, 0);
  eq("row counts unchanged where nothing was added",
     [before.tables.topics, before.tables.repositories, before.tables.people,
      db.query("SELECT COUNT(*) n FROM topics").get().n, db.query("SELECT COUNT(*) n FROM activities").get().n],
     [1, 1, 1, 1, 25]);
  eq("join tables survive",
     db.query("SELECT COUNT(*) n FROM axis_repositories").get().n, 6);

  // The rebuild must not lose the referring tables' foreign-key definitions.
  eq("activities still references development_axes ON DELETE CASCADE",
     db.query("PRAGMA foreign_key_list(activities)").all()
       .map((f) => `${f.from}->${f.table}.${f.to} on_delete=${f.on_delete}`).sort()
       .filter((s) => s.includes("development_axes")),
     beforeFks.filter((s) => s.includes("development_axes")));
  eq("annotations still references development_axes ON DELETE CASCADE",
     db.query("PRAGMA foreign_key_list(annotations)").all()
       .filter((f) => f.table === "development_axes").length, 1);
  for (const t of ["axis_repositories", "axis_people"]) {
    eq(`${t} still references development_axes`, db.query(`PRAGMA foreign_key_list(${t})`).all()
      .filter((f) => f.table === "development_axes" && f.on_delete === "CASCADE").length, 1);
  }
  eq("the rebuilt axes table kept its own foreign key to topics",
     db.query("PRAGMA foreign_key_list(development_axes)").all().filter((f) => f.table === "topics").length, 1);
  eq("the rebuilt axes table kept its index",
     db.query("SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='axes_by_topic'").get().n, 1);

  // Proof 3: bootstrap rows are provenance, not activity.
  const boot = db.query("SELECT * FROM state_log ORDER BY axis_id").all();
  eq("one bootstrap row per existing axis", boot.length, 6);
  eq("bootstrap rows carry the axis's exact state as to_state",
     boot.map((r) => r.to_state).sort(), ["abandoned", "active", "blocked", "completed", "draft", "parked"]);
  eq("bootstrap rows have from_state NULL and observed_at NULL",
     boot.every((r) => r.from_state === null && r.observed_at === null), true);
  eq("bootstrap rows are marked origin='migration' and carry a bookkeeping timestamp",
     boot.every((r) => r.origin === "migration" && typeof r.recorded_at === "string" && r.recorded_at.length > 0), true);
  eq("bootstrap row ids are derived from the axis id (deterministic)",
     boot.every((r) => r.id === `mig004:${r.axis_id}`), true);
  eq("no bootstrap row pretends to be problem history",
     db.query("SELECT COUNT(*) n FROM state_log WHERE problem_id IS NOT NULL").get().n, 0);
  eq("the log is not an activity feed: nothing in it was copied from activities",
     boot.every((r) => r.origin === "migration"), true);

  // Proof: integrity, checked with enforcement ON.
  db.exec("PRAGMA foreign_keys = ON");
  eq("PRAGMA foreign_key_check is clean with enforcement ON",
     db.query("PRAGMA foreign_key_check").all().length, 0);
  eq("PRAGMA integrity_check is ok",
     db.query("PRAGMA integrity_check").get().integrity_check, "ok");

  console.log("\n=== B. The state log's rules (valid and invalid combinations) ===\n");
  const ins = (cols, vals) => db.query(`INSERT INTO state_log (${cols}) VALUES (${vals})`);

  expectThrow("axis row carrying a problem state → rejected",
    () => ins("id,axis_id,to_state,origin,recorded_at", "'x1','axis-active','resolved','human','2026-02-01T00:00:00Z'").run(),
    "CHECK");
  expectThrow("problem row carrying an axis state → rejected",
    () => ins("id,problem_id,to_state,origin,recorded_at", "'x2','problem-1','usable','human','2026-02-01T00:00:00Z'").run(),
    "CHECK");
  expectThrow("both ids NULL → rejected",
    () => ins("id,to_state,origin,recorded_at", "'x3','active','human','2026-02-01T00:00:00Z'").run(), "CHECK");
  expectThrow("both ids populated → rejected",
    () => ins("id,axis_id,problem_id,to_state,origin,recorded_at",
              "'x4','axis-active','problem-1','active','human','2026-02-01T00:00:00Z'").run(), "CHECK");
  expectThrow("from_state validated per target type (problem row with axis from_state) → rejected",
    () => ins("id,problem_id,from_state,to_state,origin,recorded_at",
              "'x5','problem-1','active','resolved','human','2026-02-01T00:00:00Z'").run(), "CHECK");

  // A problem, so the problem-side rules have a subject.
  db.query(`INSERT INTO problems (id, axis_id, statement, state, author_type, author_id, version, created_at, updated_at)
            VALUES ('problem-1','axis-active','The sampler stalls under long runs.','open','human','',1,
                    '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`).run();

  expectAccept("axis row with an axis state → accepted",
    () => ins("id,axis_id,from_state,to_state,origin,recorded_at",
              "'x6','axis-completed','completed','active','human','2026-02-01T00:00:00Z'").run());
  expectAccept("reopening a problem (resolved → open) → accepted",
    () => ins("id,problem_id,from_state,to_state,origin,recorded_at",
              "'x7','problem-1','resolved','open','human','2026-02-01T00:00:00Z'").run());
  expectAccept("a new axis state, usable → accepted on an axis row",
    () => ins("id,axis_id,to_state,origin,recorded_at",
              "'x8','axis-active','usable','human','2026-02-01T00:00:00Z'").run());

  expectThrow("duplicate migration bootstrap for the same axis → rejected",
    () => ins("id,axis_id,to_state,origin,recorded_at",
              "'x9','axis-active','active','migration','2026-02-02T00:00:00Z'").run(), "UNIQUE");
  expectAccept("a problem may carry its own migration provenance (no bootstrap row exists for it yet)",
    () => ins("id,problem_id,to_state,origin,recorded_at",
              "'x10','problem-1','open','migration','2026-02-02T00:00:00Z'").run());
  expectThrow("duplicate migration bootstrap for the same problem → rejected",
    () => ins("id,problem_id,to_state,origin,recorded_at",
              "'x10b','problem-1','open','migration','2026-02-03T00:00:00Z'").run(), "UNIQUE");
  expectAccept("a different problem may carry its own (two namespaces, two indexes)",
    () => { db.query(`INSERT INTO problems (id, axis_id, statement, author_type, author_id, version, created_at, updated_at)
                      VALUES ('problem-2','axis-draft','Second problem.','agent','librarian',1,
                              '2026-02-02T00:00:00Z','2026-02-02T00:00:00Z')`).run();
             ins("id,problem_id,to_state,origin,recorded_at",
                 "'x11','problem-2','open','migration','2026-02-02T00:00:00Z'").run(); });

  expectThrow("UPDATE of a log row → rejected",
    () => db.exec("UPDATE state_log SET to_state='active' WHERE id='x6'"), "append-only");
  expectThrow("DELETE of a log row → rejected",
    () => db.exec("DELETE FROM state_log WHERE id='x6'"), "append-only");

  // The honest boundary: no CHECK can see another row's current state, so refusing a no-op transition
  // (open → open) is the writer's job, not the database's.
  expectAccept("no-op transition is legal at the DB level — its refusal belongs to the transition writer",
    () => ins("id,problem_id,from_state,to_state,origin,recorded_at",
              "'x12','problem-1','open','open','agent','2026-02-03T00:00:00Z'").run());

  console.log("\n=== C. Problems, plans and the annotation invariant ===\n");
  expectThrow("problem state outside the lifecycle → rejected",
    () => db.query(`INSERT INTO problems (id, axis_id, statement, state, author_type, author_id, version, created_at, updated_at)
                    VALUES ('p-bad','axis-active','s','blocked','human','',1,'2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`).run(),
    "CHECK");
  expectThrow("problem state 'usable' → rejected (that vocabulary is the axis's)",
    () => db.query(`INSERT INTO problems (id, axis_id, statement, state, author_type, author_id, version, created_at, updated_at)
                    VALUES ('p-bad2','axis-active','s','usable','human','',1,'2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`).run(),
    "CHECK");
  expectAccept("a problem with no repository, no PR and no plan is valid",
    () => db.query(`INSERT INTO problems (id, axis_id, statement, author_type, author_id, version, created_at, updated_at)
                    VALUES ('p-loner','axis-active','Meaningful with nothing attached.','agent','librarian',1,
                            '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`).run());
  expectAccept("an axis with no plan at all stays valid (plans are optional)",
    () => db.query("SELECT COUNT(*) FROM development_axes WHERE id NOT IN (SELECT axis_id FROM plans)").get());
  expectAccept("plan_steps.state 'active' → accepted",
    () => db.exec(`INSERT INTO plans (id, axis_id, summary, author_type, author_id, version, created_at, updated_at)
                   VALUES ('plan-1','axis-active','s','human','',1,'2026-02-01T00:00:00Z','2026-02-01T00:00:00Z');
                   INSERT INTO plan_steps (id, plan_id, title, position, state, created_at, updated_at)
                   VALUES ('step-1','plan-1','first',NULL,'active','2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`));
  expectThrow("plan_steps.state 'current' → rejected (renamed to active)",
    () => db.exec(`INSERT INTO plan_steps (id, plan_id, title, position, state, created_at, updated_at)
                   VALUES ('step-2','plan-1','second',1,'current','2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`),
    "CHECK");
  eq("an unordered plan stores no synthesized ordering",
     db.query("SELECT position FROM plan_steps WHERE id='step-1'").get().position, null);

  expectThrow("kind='steering' with two targets → rejected",
    () => db.query(`INSERT INTO annotations (id, topic_id, axis_id, text, kind, author_type, author_id, created_at)
                    VALUES ('a-bad','topic-1','axis-active','s','steering','human','','2026-02-01T00:00:00Z')`).run(),
    "CHECK");
  expectAccept("kind='note' keeps the historical two-target shape (5 real rows depend on it)",
    () => db.query(`INSERT INTO annotations (id, topic_id, axis_id, text, kind, author_type, author_id, created_at)
                    VALUES ('a-note','topic-1','axis-active','s','note','human','','2026-02-01T00:00:00Z')`).run());
  expectAccept("kind='steering' on a single problem → accepted",
    () => db.query(`INSERT INTO annotations (id, problem_id, text, kind, author_type, author_id, created_at)
                    VALUES ('a-steer','problem-1','Interpret this as intentional.','steering','human','','2026-02-01T00:00:00Z')`).run());
  expectAccept("kind='interpretation' with NULL confidence → accepted (no claim, no confidence)",
    () => db.query(`INSERT INTO annotations (id, problem_id, text, kind, confidence, author_type, author_id, created_at)
                    VALUES ('a-interp','problem-1','Reading it as a sampling artefact.','interpretation',NULL,'agent','','2026-02-01T00:00:00Z')`).run());

  console.log("\n=== D. Links, cascades and the growing set of states ===\n");
  db.query("UPDATE activities SET problem_id='problem-1' WHERE id='act-0'").run();
  expectAccept("an activity can be linked to a problem",
    () => check("activity carries the link", db.query("SELECT problem_id FROM activities WHERE id='act-0'").get().problem_id === "problem-1"));
  db.query("INSERT INTO problem_repositories (problem_id, repository_id) VALUES ('problem-1','repo-1')").run();
  db.query("INSERT INTO problem_people (problem_id, person_id) VALUES ('problem-1','person-1')").run();
  eq("a problem can reference a repository and a person at once",
     [db.query("SELECT COUNT(*) n FROM problem_repositories WHERE problem_id='problem-1'").get().n,
      db.query("SELECT COUNT(*) n FROM problem_people WHERE problem_id='problem-1'").get().n], [1, 1]);

  // All seven axis states are reachable, and the reopen cycles the charter names are representable.
  db.query(`INSERT INTO development_axes (id, topic_id, title, description, kind, state, branch, pr_number,
              pr_url, current_state, blocker, state_confidence, current_state_confidence, blocker_confidence,
              version, created_at, updated_at, last_reviewed_at)
            VALUES ('axis-usable','topic-1','Axis usable','','feature','usable','',NULL,'','','','confirmed',
                    'confirmed','confirmed',1,'2026-02-01T00:00:00Z','2026-02-01T00:00:00Z',NULL)`).run();
  const cycle = [
    ["axis-usable", "usable", "active"],
    ["axis-usable", "active", "completed"],
    ["axis-completed", "completed", "active"],
  ];
  expectAccept("reopen cycles usable→active→completed and completed→active are recordable",
    () => cycle.forEach(([axis, from, to], i) =>
      db.query(`INSERT INTO state_log (id, axis_id, from_state, to_state, origin, actor_id, observed_at, recorded_at)
                VALUES (?,?,?,?, 'human','', NULL, ?)`)
        .run(`cyc-${i}`, axis, from, to, `2026-02-0${i + 2}T00:00:00Z`)));
  eq("all seven axis states now have at least one row in play",
     new Set(db.query("SELECT state FROM development_axes").all().map((r) => r.state)).size, 7);
  eq("reopening preserved the prior closed/usable state in history, rather than replacing it",
     db.query("SELECT from_state FROM state_log WHERE axis_id='axis-usable' ORDER BY recorded_at").all()
       .map((r) => r.from_state), ["usable", "active"]);
  eq("the closed and usable states remain readable as history after the cycle",
     db.query("SELECT to_state FROM state_log WHERE axis_id='axis-usable' ORDER BY recorded_at").all()
       .map((r) => r.to_state), ["active", "completed"]);

  db.query("DELETE FROM problems WHERE id='problem-1'").run();
  eq("deleting a problem unlinks its activity instead of destroying it",
     db.query("SELECT problem_id FROM activities WHERE id='act-0'").get().problem_id, null);
  eq("deleting a problem removes its own history rows (CASCADE), and only those",
     [db.query("SELECT COUNT(*) n FROM state_log WHERE problem_id='problem-1'").get().n,
      db.query("SELECT COUNT(*) n FROM state_log WHERE problem_id='problem-2'").get().n], [0, 1]);
  db.query("DELETE FROM development_axes WHERE id='axis-active'").run();
  eq("deleting an axis cascades to its problems, links and log rows",
     [db.query("SELECT COUNT(*) n FROM problems WHERE axis_id='axis-active'").get().n,
      db.query("SELECT COUNT(*) n FROM state_log WHERE axis_id='axis-active'").get().n,
      db.query("SELECT COUNT(*) n FROM axis_repositories WHERE axis_id='axis-active'").get().n], [0, 0, 0]);
  eq("FK check still clean after the cascade", db.query("PRAGMA foreign_key_check").all().length, 0);

  // The regression this file's DELETE trigger exists to avoid: `deleteAxis` (src/store.ts) must keep
  // working for an axis that has history. A plain BEFORE DELETE trigger rejects the cascade and breaks it.
  const doomed = db.query("SELECT id FROM development_axes WHERE id='axis-blocked'").get();
  expectAccept("deleteAxis still works on an axis that has a bootstrap row",
    () => db.query("DELETE FROM development_axes WHERE id=?").run(doomed.id));
  eq("that axis's history went with it (the only way a row leaves the log)",
     db.query("SELECT COUNT(*) n FROM state_log WHERE axis_id='axis-blocked'").get().n, 0);
  expectThrow("...while a direct delete of a log row whose subject still exists stays impossible",
    () => db.exec(`DELETE FROM state_log WHERE id=(SELECT id FROM state_log WHERE axis_id='axis-draft' LIMIT 1)`),
    "append-only");
}

// ---------------------------------------------------------------------------------------------------
console.log("\n=== E. Re-runnable: the crash-after-COMMIT, before-the-ledger case ===\n");
{
  const db = buildPre004();
  const migrationsRun = () => db.query("SELECT COUNT(*) n FROM _nakama_plugin_migrations").get().n;

  apply(db, "004-ux-v2-model.sql");
  const afterFirst = fingerprint(db);
  const logAfterFirst = JSON.stringify(db.query("SELECT * FROM state_log ORDER BY id").all());
  const axesAfterFirst = JSON.stringify(db.query("SELECT * FROM development_axes ORDER BY id").all());
  const actsAfterFirst = JSON.stringify(db.query("SELECT * FROM activities ORDER BY id").all());

  // The host re-runs the whole file when it does not find its ledger row: the database has already
  // changed, the host believes it has not.
  apply(db, "004-ux-v2-model.sql");
  ok("a second execution of the whole file succeeds (no 'table already exists')");

  eq("schema is identical after the re-run", fingerprint(db).schema, afterFirst.schema);
  eq("every table's row count is identical after the re-run", fingerprint(db).tables, afterFirst.tables);
  eq("the bootstrap is not duplicated", db.query("SELECT * FROM state_log ORDER BY id").all().length,
     JSON.parse(logAfterFirst).length);
  eq("state_log rows are byte-identical after the re-run",
     JSON.stringify(db.query("SELECT * FROM state_log ORDER BY id").all()), logAfterFirst);
  eq("development_axes rows are byte-identical after the re-run",
     JSON.stringify(db.query("SELECT * FROM development_axes ORDER BY id").all()), axesAfterFirst);
  eq("activities rows are byte-identical after the re-run",
     JSON.stringify(db.query("SELECT * FROM activities ORDER BY id").all()), actsAfterFirst);
  eq("the file leaves the host's migration ledger alone (no plugin migration mentions it)",
     ["004-ux-v2-model.sql", ...MIG].every((f) =>
       !readFileSync(join(MIGRATIONS, f), "utf8").includes("_nakama_plugin_migrations")), true);
  eq("FK check clean after the re-run", db.query("PRAGMA foreign_key_check").all().length, 0);
}

// ---------------------------------------------------------------------------------------------------
const dbArgIndex = process.argv.indexOf("--db");
if (dbArgIndex !== -1) {
  const source = process.argv[dbArgIndex + 1];
  console.log(`\n=== F. The same preservation checks against a real pre-004 database ===\n        ${source}\n`);
  const { copyFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "nakama-004-"));
  const copy = join(dir, "pre004.sqlite");
  copyFileSync(source, copy);
  const db = new Database(copy);
  const before = fingerprint(db);
  const axesBefore = db.query("SELECT id, state FROM development_axes ORDER BY id").all();
  const annotationsBefore = db.query("SELECT id, topic_id, axis_id, text FROM annotations ORDER BY id").all();
  const activitiesBefore = db.query("SELECT id, summary, occurred_at FROM activities ORDER BY id").all();

  apply(db, "004-ux-v2-model.sql");

  eq("every real axis keeps its exact state", db.query("SELECT id, state FROM development_axes ORDER BY id").all(), axesBefore);
  eq("zero real axes became `usable`", db.query("SELECT COUNT(*) n FROM development_axes WHERE state='usable'").get().n, 0);
  eq("every real annotation survives by identity",
     db.query("SELECT id, topic_id, axis_id, text FROM annotations ORDER BY id").all(), annotationsBefore);
  eq("every real activity survives by identity",
     db.query("SELECT id, summary, occurred_at FROM activities ORDER BY id").all(), activitiesBefore);
  eq("row counts unchanged for the tables that were rebuilt",
     [db.query("SELECT COUNT(*) n FROM activities").get().n, db.query("SELECT COUNT(*) n FROM annotations").get().n],
     [before.tables.activities, before.tables.annotations]);
  eq("one bootstrap row per real axis",
     db.query("SELECT COUNT(*) n FROM state_log WHERE origin='migration'").get().n, before.tables.development_axes);
  db.exec("PRAGMA foreign_keys = ON");
  eq("FK check clean on the real database", db.query("PRAGMA foreign_key_check").all().length, 0);
  console.log(`\n        (copy kept at ${copy})`);
}

console.log(`\n${failures.length ? "FAILED" : "PASSED"} — ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
