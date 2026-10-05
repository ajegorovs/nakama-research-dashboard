#!/usr/bin/env bun
/**
 * Librarian zero-mutation instrumentation harness (DESIGN-V1 §7/§9 M-3/M-4; OFFLINE §9).
 *
 * This is the **isolated, authoritative** proof that a librarian run changes no row. It observes from
 * outside:
 *
 *   1. it seeds a temporary fixture database from the shipped migrations and the committed synthetic
 *      dataset, using a seeding connection it closes **before** any librarian read, then primes the file
 *      into WAL mode so both snapshots are taken of a database that is already WAL;
 *   2. it takes a **canonical logical snapshot** — the schema (user tables/indexes/triggers) plus each
 *      user table's row count and its rows in a canonical sorted order. It compares **nothing** that moves
 *      without a logical change: never the SQLite file bytes, WAL/journal, page layout or `-wal`/`-shm`
 *      sidecars. The equality it asserts is therefore a claim about logical rows/schema/versions only —
 *      it does **not** measure journal/WAL bookkeeping, and a database whose bytes changed while its rows
 *      did not would still be reported equal;
 *   3. it runs the librarian through the closed read boundary over the existing action dispatch and
 *      attempts a write (`--force-write-attempt`) that must be refused before dispatch;
 *   4. it snapshots again and asserts the two logical snapshots are equal (zero row change, no version
 *      move, no `state_log` row);
 *   5. it proves the comparator is not a rubber stamp: a **deliberate isolated control write** must be
 *      detected as a difference (positive instrument control).
 *
 * It is a test/instrumentation artifact and is **never** an input the librarian reads.
 *
 * Modes:
 *   (default) / --force-write-attempt   read-only run + write-attempt refusal + control write
 *   --mutant-allowlist                  guard-disabled red-run: the write is NOT denied, so the
 *                                       "writes denied before dispatch" acceptance criterion FAILS. The
 *                                       retained log is printed; the process exits non-zero.
 *
 * Exit: 0 when the pristine run proves zero mutation and the control detects the injected write; 1 on any
 * failure (or on the designed red-run under --mutant-allowlist).
 */
import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReadBoundary, ReadBoundaryDeniedError } from "../src/librarian/read-boundary.ts";
import {
  loadCandidateInputs,
  seedFixtureDatabase,
  temporaryDatabasePath,
} from "../src/librarian/fixture-db.ts";

const args = process.argv.slice(2);
const MUTANT = args.includes("--mutant-allowlist");
const FORCE_WRITE = args.includes("--force-write-attempt") || MUTANT;

const scratch = process.env.TMPDIR ?? "/tmp";
mkdirSync(scratch, { recursive: true });
const runId = crypto.randomUUID();
const logPath = join(scratch, `librarian-snapshot-${runId}.log`);
const lines = [];
const log = (message) => {
  lines.push(message);
  console.log(message);
};

const WRITE_KEYS = ["reconcile_topic", "record_activity", "add_annotation"];

/** Collapse whitespace so a formatting-only schema difference is not read as a logical change. */
function normalizeSql(sql) {
  return String(sql ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The canonical logical projection. Schema objects (tables/indexes/triggers) plus, per user table, its row
 * count and its rows in canonical sorted order. Never the file bytes or WAL.
 */
function canonicalSnapshot(path) {
  const db = new Database(path, { readonly: true });
  try {
    const objects = db
      .query(
        `SELECT type, name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%'
         ORDER BY type, name`
      )
      .all()
      .map((row) => ({ name: row.name, sql: normalizeSql(row.sql), type: row.type }));
    const tables = objects
      .filter((row) => row.type === "table")
      .map((row) => row.name);
    const rows = {};
    const counts = {};
    const versions = {};
    for (const table of tables) {
      const columns = db
        .query(`PRAGMA table_info(${table})`)
        .all()
        .map((column) => column.name)
        .sort();
      const present = db.query(`SELECT * FROM ${table}`).all();
      rows[table] = present
        .map((row) => {
          const ordered = {};
          for (const column of columns) {
            ordered[column] = row[column] ?? null;
          }
          return JSON.stringify(ordered);
        })
        .sort();
      counts[table] = rows[table].length;
      if (table === "development_axes" || table === "problems") {
        versions[table] = present
          .map((row) => `${row.id}=${row.version}`)
          .sort();
      }
    }
    return { counts, objects, rows, versions };
  } finally {
    db.close();
  }
}

function assertEquals(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function describeDifference(before, after) {
  const details = [];
  if (JSON.stringify(before.objects) !== JSON.stringify(after.objects)) {
    details.push("schema objects differ");
  }
  for (const table of Object.keys({ ...before.counts, ...after.counts })) {
    const left = before.counts[table] ?? 0;
    const right = after.counts[table] ?? 0;
    if (left !== right) {
      details.push(`row count ${table}: ${left} -> ${right}`);
    } else if (JSON.stringify(before.rows[table]) !== JSON.stringify(after.rows[table])) {
      details.push(`contents of ${table} changed`);
    }
  }
  if (JSON.stringify(before.versions) !== JSON.stringify(after.versions)) {
    details.push("a version moved");
  }
  return details.length ? details.join("; ") : "unspecified logical difference";
}

async function main() {
  const databasePath = temporaryDatabasePath("librarian-snapshot");
  log(`librarian-db-snapshot — run ${runId}`);
  log(`fixture database: ${databasePath}`);

  // 1. seed — a temporary seeding step outside the runtime adapter, closed before any read.
  seedFixtureDatabase(databasePath);
  // Prime the file into WAL mode now, before the first snapshot. Then both snapshots observe an
  // already-WAL database, so the before/after equality is not partly a journal-mode transition: what it
  // measures is logical row/schema/version content, and only that.
  const primer = new Database(databasePath);
  try {
    primer.exec("PRAGMA journal_mode = WAL");
  } finally {
    primer.close();
  }

  const before = canonicalSnapshot(databasePath);
  log(
    `before — canonical logical snapshot: ${Object.entries(before.counts)
      .map(([table, count]) => `${table}=${count}`)
      .join(" ")}`
  );

  const boundary = createReadBoundary({
    actor: { id: "librarian-snapshot-harness", role: "member" },
    databasePath,
    mutants: MUTANT ? { disableAllowlist: true } : undefined,
    orgId: "offline-evaluation",
  });

  // 2. a read-only librarian run over the supported read surface.
  const candidates = loadCandidateInputs();
  const topicIds = [...new Set(candidates.cases.map((entry) => entry.subject.topicId))];
  await boundary.read("get_overview", {});
  for (const topicId of topicIds) {
    await boundary.read("get_topic", { notesLimit: 25, historyLimit: 25, topicId });
  }
  await boundary.read("search_dashboard", { limit: 5, query: "fixture" });
  log(`librarian reads dispatched: ${boundary.stats.dispatched}`);

  // 3. the write attempt must be refused before dispatch.
  const denials = [];
  let writeReachedDispatch = false;
  for (const key of WRITE_KEYS) {
    try {
      await boundary.read(key, {});
      writeReachedDispatch = true;
      denials.push(`${key}: NOT denied — dispatch reached`);
    } catch (error) {
      if (error instanceof ReadBoundaryDeniedError) {
        denials.push(`${key}: denied before dispatch`);
      } else {
        denials.push(`${key}: unexpected ${error?.name ?? "error"}`);
      }
    }
  }
  for (const line of denials) {
    log(`write attempt ${line}`);
  }

  const after = canonicalSnapshot(databasePath);

  if (MUTANT) {
    // The designed red-run: with the guard removed the write reaches dispatch, so the acceptance
    // criterion "writes denied before dispatch" fails. Exit non-zero and retain the log.
    log(
      writeReachedDispatch
        ? "MUTANT RESULT: guard removed — the write reached dispatch, so the acceptance criterion would FAIL (red-run demonstrated)."
        : "MUTANT RESULT: the guard was not actually disabled — the mutant is inert."
    );
    persist();
    process.exit(1);
  }

  let failed = false;

  if (!FORCE_WRITE) {
    log("write attempt not exercised (pass --force-write-attempt to include it)");
  } else if (writeReachedDispatch) {
    log("FAIL: a write action was not denied before dispatch");
    failed = true;
  }

  if (assertEquals(before, after)) {
    log("PASS: canonical logical snapshots are equal — zero row change, no version move, no state_log row");
  } else {
    log(`FAIL: the librarian run changed the database — ${describeDifference(before, after)}`);
    failed = true;
  }

  // 4. positive instrument control: the comparator must detect a deliberate write.
  const controlDb = new Database(databasePath);
  try {
    controlDb
      .query("UPDATE topics SET summary = summary || ' [control-write]' WHERE id = 'FIX-TOPIC-ALPHA'")
      .run();
  } finally {
    controlDb.close();
  }
  const afterControl = canonicalSnapshot(databasePath);
  if (!assertEquals(after, afterControl)) {
    log("PASS: the comparator detected the deliberate isolated control write (the instrument can go red)");
  } else {
    log("FAIL: the comparator did NOT detect the deliberate control write — the instrument is a rubber stamp");
    failed = true;
  }

  persist();
  process.exit(failed ? 1 : 0);

  function persist() {
    try {
      writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
      chmodSync(logPath, 0o644);
      console.log(`\nretained log: ${logPath}`);
    } catch (error) {
      console.log(`log persistence failed: ${error?.message ?? error}`);
    }
  }
}

await main();
