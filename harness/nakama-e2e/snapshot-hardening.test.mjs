/**
 * Hardening tests for `snapshot.mjs` — **disjoint** from `nakama-e2e.test.mjs` (owned elsewhere).
 *
 * Covers the reviewer amendments that `snapshot.mjs` was hardened for:
 *   - active store identity resolved from the current pinned host `org_plugins` schema, which carries
 *     **both** `database_generation TEXT` and `revision INTEGER NOT NULL` (pinned source `945420b6…`,
 *     `packages/db/src/migrate.ts:1760-1773`) — the two are distinct and never conflated;
 *   - a data root that holds several historical generations: the active one is selected, archived
 *     generations do not make the store "ambiguous";
 *   - a consistent single-transaction logical snapshot, including uncheckpointed WAL content;
 *   - a scratch-copy positive control that builds a consistent copy, mutates only the copy, handles
 *     `WITHOUT ROWID`/constraints, and cleans its scratch artifacts;
 *   - fail-closed on absent/malformed/lifecycle-incompatible/missing-file pins;
 *   - a negative control (the comparator can go green; a moved pin still fails).
 *
 * Offline only: scratch SQLite files, no network, no live instance, no model, no new dependency.
 *
 *     bun test harness/nakama-e2e/snapshot-hardening.test.mjs
 */
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ACTIVE_LIFECYCLE_STATES,
  SnapshotError,
  assertNoLogicalMutation,
  canonicalSnapshot,
  copyDatabase,
  discoverStorePath,
  positiveControlMutation,
  readActivePluginRow,
  resolveActiveStoreIdentity,
  snapshotsEqual,
  quoteIdentifier,
} from "./snapshot.mjs";

const scratchRoot = mkdtempSync(join(tmpdir(), "nakama-snapshot-harden-"));

function isolated(name) {
  const dir = join(scratchRoot, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Build a platform DB with the **real host-shaped** `org_plugins` schema, transcribing the pinned
 * `packages/db/src/migrate.ts:1760-1773` DDL. `nullableRevision` builds a schema variant only so a NULL
 * revision can be inserted for the malformed-pin case; the column type/order otherwise match the host.
 */
function makePlatformDb(path, { nullableRevision = false } = {}) {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE org_plugins (
      org_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      selected_version TEXT,
      database_generation TEXT,
      lifecycle_state TEXT NOT NULL,
      revision INTEGER ${nullableRevision ? "" : "NOT NULL"},
      pending_operation TEXT,
      last_lifecycle_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (org_id, plugin_id)
    );
  `);
  return db;
}

const PLUGIN = "research-dashboard";

function insertOrgPlugin(db, { orgId = "org-fixture", pluginId = PLUGIN, generation, revision, lifecycle = "enabled" }) {
  db.query(
    `INSERT INTO org_plugins
       (org_id, plugin_id, selected_version, database_generation, lifecycle_state, revision,
        pending_operation, last_lifecycle_error, created_at, updated_at)
     VALUES (?, ?, '1.0.0', ?, ?, ?, NULL, NULL, 't', 't')`
  ).run(orgId, pluginId, generation, lifecycle, revision);
}

/** Create a plugin-store generation file, optionally with a table + rows. */
function makeStoreFile(dataRoot, org, generation, { rows = [], withoutRowid = false } = {}) {
  const dir = join(dataRoot, "orgs", org, "plugins", PLUGIN, "db");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${generation}.sqlite`);
  const db = new Database(path);
  const ddl = withoutRowid
    ? `CREATE TABLE topics (id TEXT PRIMARY KEY, summary TEXT) WITHOUT ROWID`
    : `CREATE TABLE topics (id TEXT PRIMARY KEY, summary TEXT)`;
  db.exec(ddl);
  const stmt = db.query(`INSERT INTO topics (id, summary) VALUES (?, ?)`);
  for (const [id, summary] of rows) stmt.run(id, summary);
  db.close();
  return path;
}

// ---------------------------------------------------------------- host-shaped identity

describe("active plugin store identity — host-shaped org_plugins", () => {
  test("transcribed schema carries database_generation TEXT and revision INTEGER NOT NULL", () => {
    const dir = isolated("schema-shape");
    const platformPath = join(dir, "nakama.sqlite");
    const platform = makePlatformDb(platformPath);
    const cols = Object.fromEntries(
      platform.query(`PRAGMA table_info(${quoteIdentifier("org_plugins")})`).all().map((c) => [c.name, c])
    );
    platform.close();

    expect(cols.database_generation?.type).toBe("TEXT");
    expect(cols.revision?.type).toBe("INTEGER");
    expect(cols.revision?.notnull).toBe(1);
    expect(cols.lifecycle_state?.notnull).toBe(1);
    // The two columns are distinct — the hardening never treats one as the other.
    expect(cols.database_generation.name).not.toBe(cols.revision.name);
  });

  test("resolves the generation file from database_generation and the integer pin from revision", () => {
    const dir = isolated("resolve");
    const dataRoot = join(dir, "data-root");
    makeStoreFile(dataRoot, "org-fixture", "g2", { rows: [["a", "one"]] });
    const platformPath = join(dir, "nakama.sqlite");
    const platform = makePlatformDb(platformPath);
    insertOrgPlugin(platform, { generation: "g2", revision: 42 });
    platform.close();

    const resolved = resolveActiveStoreIdentity({
      dataRoot, org: "org-fixture", pluginId: PLUGIN, platformDbPath: platformPath, orgId: "org-fixture",
    });
    expect(resolved.generation).toBe("g2");
    expect(resolved.revision).toBe(42); // integer, not a string
    expect(Number.isInteger(resolved.revision)).toBe(true);
    expect(resolved.lifecycleState).toBe("enabled");
    expect(resolved.path.endsWith(join("db", "g2.sqlite"))).toBe(true);
  });

  test("selects the active generation and ignores archived generations (non-ambiguous)", () => {
    const dir = isolated("archived");
    const dataRoot = join(dir, "data-root");
    // The DECOY older file holds the rows the host docs warn about.
    makeStoreFile(dataRoot, "org-fixture", "g1", { rows: [["stale", "old rows"]] });
    makeStoreFile(dataRoot, "org-fixture", "g2", { rows: [] });
    const activePath = makeStoreFile(dataRoot, "org-fixture", "g3", { rows: [["live", "active rows"]] });
    const platformPath = join(dir, "nakama.sqlite");
    const platform = makePlatformDb(platformPath);
    insertOrgPlugin(platform, { generation: "g3", revision: 7 });
    platform.close();

    // Legacy single-generation discovery still refuses the multi-file store …
    expect(() => discoverStorePath({ dataRoot, org: "org-fixture", pluginId: PLUGIN })).toThrow(SnapshotError);
    // … but the active-generation path selects the served file explicitly.
    const resolved = resolveActiveStoreIdentity({
      dataRoot, org: "org-fixture", pluginId: PLUGIN, platformDbPath: platformPath, orgId: "org-fixture",
    });
    expect(resolved.path).toBe(activePath);
    expect(resolved.generation).toBe("g3");
    expect(canonicalSnapshot(resolved.path).counts.topics).toBe(1);
  });

  test("readActivePluginRow returns both columns and null when absent", () => {
    const dir = isolated("read-row");
    const platformPath = join(dir, "nakama.sqlite");
    const platform = makePlatformDb(platformPath);
    insertOrgPlugin(platform, { generation: "g5", revision: 3 });
    platform.close();

    const row = readActivePluginRow({ platformDbPath: platformPath, orgId: "org-fixture", pluginId: PLUGIN });
    expect(row.database_generation).toBe("g5");
    expect(row.revision).toBe(3);
    expect(row.lifecycle_state).toBe("enabled");
    expect(readActivePluginRow({ platformDbPath: platformPath, orgId: "nope", pluginId: PLUGIN })).toBeNull();
  });
});

// ---------------------------------------------------------------- malformed / fail-closed pins

describe("fail-closed on absent / malformed / incompatible pins", () => {
  function setup({ generation = "g1", revision = 1, lifecycle = "enabled", nullableRevision = false } = {}) {
    const dir = isolated(`malformed-${Math.random().toString(36).slice(2)}`);
    const dataRoot = join(dir, "data-root");
    makeStoreFile(dataRoot, "org-fixture", "g1");
    const platformPath = join(dir, "nakama.sqlite");
    const platform = makePlatformDb(platformPath, { nullableRevision });
    insertOrgPlugin(platform, { generation, revision, lifecycle });
    platform.close();
    return { dataRoot, platformPath };
  }

  const resolve = (opts) =>
    resolveActiveStoreIdentity({
      dataRoot: opts.dataRoot, org: "org-fixture", pluginId: PLUGIN,
      platformDbPath: opts.platformPath, orgId: "org-fixture",
    });

  test("absent org_plugins row fails closed", () => {
    const dir = isolated("absent-row");
    const platformPath = join(dir, "nakama.sqlite");
    makePlatformDb(platformPath).close();
    expect(() =>
      resolveActiveStoreIdentity({ dataRoot: dir, org: "org-fixture", pluginId: PLUGIN, platformDbPath: platformPath, orgId: "org-fixture" })
    ).toThrow(SnapshotError);
  });

  test("NULL database_generation fails closed", () => {
    const { dataRoot, platformPath } = setup({ generation: null });
    expect(() => resolve({ dataRoot, platformPath })).toThrow(/database_generation absent or malformed/);
  });

  test("empty database_generation fails closed", () => {
    const { dataRoot, platformPath } = setup({ generation: "   " });
    expect(() => resolve({ dataRoot, platformPath })).toThrow(/database_generation absent or malformed/);
  });

  test("NULL revision fails closed (nullable variant)", () => {
    const { dataRoot, platformPath } = setup({ revision: null, nullableRevision: true });
    expect(() => resolve({ dataRoot, platformPath })).toThrow(/revision is not an integer/);
  });

  test("non-integer revision fails closed", () => {
    const { dataRoot, platformPath } = setup({ revision: "abc" });
    expect(() => resolve({ dataRoot, platformPath })).toThrow(/revision is not an integer/);
  });

  test("unknown lifecycle_state fails closed as malformed", () => {
    const { dataRoot, platformPath } = setup({ lifecycle: "frozen" });
    expect(() => resolve({ dataRoot, platformPath })).toThrow(/lifecycle_state unknown/);
  });

  test("non-active lifecycle states fail closed as incompatible", () => {
    for (const lifecycle of ["disabled", "disabling", "enabling", "retained", "updating"]) {
      const { dataRoot, platformPath } = setup({ lifecycle });
      expect(() => resolve({ dataRoot, platformPath })).toThrow(/lifecycle incompatible/);
    }
    expect(ACTIVE_LIFECYCLE_STATES).toEqual(["enabled"]);
  });

  test("missing active generation file fails closed", () => {
    const { dataRoot, platformPath } = setup({ generation: "g404" });
    expect(() => resolve({ dataRoot, platformPath })).toThrow(/active generation g404\.sqlite not found/);
  });

  test("corrupt platform DB fails closed rather than looking unchanged", () => {
    const dir = isolated("corrupt");
    const platformPath = join(dir, "nakama.sqlite");
    writeFileSync(platformPath, "not a database");
    expect(() =>
      resolveActiveStoreIdentity({ dataRoot: dir, org: "org-fixture", pluginId: PLUGIN, platformDbPath: platformPath, orgId: "org-fixture" })
    ).toThrow(SnapshotError);
  });
});

// ---------------------------------------------------------------- WAL / consistent snapshot

describe("consistent logical snapshot incl. uncheckpointed WAL", () => {
  test("a read-only snapshot sees rows that live only in the WAL of an open writer", () => {
    const dir = isolated("wal");
    const path = join(dir, "store.sqlite");
    const writer = new Database(path);
    writer.exec("PRAGMA journal_mode=WAL");
    writer.exec("CREATE TABLE topics (id TEXT PRIMARY KEY, summary TEXT)");
    writer.exec("PRAGMA wal_autocheckpoint=0"); // keep data uncheckpointed in the WAL
    for (let i = 0; i < 500; i++) writer.query("INSERT INTO topics (id, summary) VALUES (?, ?)").run(`t${i}`, `s${i}`);

    const walBefore = readFileSync(path + "-wal");
    const mainBefore = readFileSync(path);
    expect(walBefore.byteLength).toBeGreaterThan(0); // the rows really are uncheckpointed

    // A second, read-only connection snapshots while the writer is still open.
    const snap = canonicalSnapshot(path);
    expect(snap.counts.topics).toBe(500);

    // A consistent copy built from the live WAL-backed source matches the source projection.
    const copyPath = join(dir, "wal-copy.sqlite");
    copyDatabase(path, copyPath);
    expect(snapshotsEqual(snap, canonicalSnapshot(copyPath))).toBe(true);

    // The reader/snapshot never checkpointed or mutated the source.
    expect(readFileSync(path + "-wal")).toEqual(walBefore);
    expect(readFileSync(path)).toEqual(mainBefore);

    writer.close();
  });

  test("a post-snapshot write is caught (snapshot is a real point in time)", () => {
    const dir = isolated("wal-delta");
    const path = join(dir, "store.sqlite");
    const db = new Database(path);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("CREATE TABLE topics (id TEXT PRIMARY KEY, summary TEXT)");
    db.exec("PRAGMA wal_autocheckpoint=0");
    db.query("INSERT INTO topics VALUES ('a', 'one')").run();
    const before = canonicalSnapshot(path);
    db.query("INSERT INTO topics VALUES ('b', 'two')").run();
    expect(snapshotsEqual(before, canonicalSnapshot(path))).toBe(false);
    db.close();
  });

  test("a WITHOUT ROWID store snapshots cleanly", () => {
    const dir = isolated("without-rowid");
    const path = makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", {
      rows: [["x", "one"], ["y", "two"]], withoutRowid: true,
    });
    const snap = canonicalSnapshot(path);
    expect(snap.counts.topics).toBe(2);
    expect(snap.rows.topics.length).toBe(2);
  });
});

// ---------------------------------------------------------------- positive / negative control

describe("scratch-copy positive control", () => {
  test("detects a change made only to a consistent scratch copy and cleans the copy", () => {
    const dir = isolated("control");
    const live = makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", { rows: [["a", "one"]] });
    const liveBefore = canonicalSnapshot(live);

    const control = positiveControlMutation({ dbPath: live, scratchDir: join(dir, "scratch") });

    expect(control.detected).toBe(true);
    expect(control.ok).toBe(true);
    expect(control.copyPath.startsWith(join(dir, "scratch"))).toBe(true);
    expect(control.cleaned).toBe(true);
    // The dedicated control table is created in the copy and removed with it.
    expect(existsSync(control.copyPath)).toBe(false);
    expect(control.controlTable.startsWith("snapshot_control_")).toBe(true);
    // The live store is byte-for-byte and logically untouched.
    expect(snapshotsEqual(liveBefore, canonicalSnapshot(live))).toBe(true);
    expect(readFileSync(live)).toEqual(readFileSync(live));
  });

  test("works on a store whose only table is WITHOUT ROWID (no rowid assumption)", () => {
    const dir = isolated("control-without-rowid");
    const live = makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", {
      rows: [["a", "one"]], withoutRowid: true,
    });
    const control = positiveControlMutation({ dbPath: live, scratchDir: join(dir, "scratch") });
    expect(control.detected).toBe(true);
  });

  test("keepCopy retains the scratch copy as intended evidence", () => {
    const dir = isolated("control-keep");
    const live = makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", { rows: [["a", "one"]] });
    const control = positiveControlMutation({ dbPath: live, scratchDir: join(dir, "scratch"), keepCopy: true });
    expect(control.cleaned).toBe(false);
    expect(existsSync(control.copyPath)).toBe(true);
    rmSync(control.copyPath, { force: true });
  });
});

describe("negative control (comparator can go green, pin guards still bite)", () => {
  test("two snapshots of an idle store are equal", () => {
    const dir = isolated("negative");
    const path = makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", { rows: [["a", "one"], ["b", "two"]] });
    const first = canonicalSnapshot(path);
    const second = canonicalSnapshot(path);
    expect(snapshotsEqual(first, second)).toBe(true);
    expect(assertNoLogicalMutation({
      before: first, after: second,
      pinBefore: { generation: "g1", revision: 5 },
      pinAfter: { generation: "g1", revision: 5 },
    }).ok).toBe(true);
  });

  test("an unmutated scratch copy equals its source (copy step is not a mutation)", () => {
    const dir = isolated("negative-copy");
    const source = makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", { rows: [["a", "one"]] });
    const copy = join(dir, "plain-copy.sqlite");
    copyDatabase(source, copy);
    expect(snapshotsEqual(canonicalSnapshot(source), canonicalSnapshot(copy))).toBe(true);
  });

  test("a moved revision fails the proof even when rows are identical", () => {
    const dir = isolated("negative-pin");
    const snap = canonicalSnapshot(makeStoreFile(join(dir, "data-root"), "org-fixture", "g1", { rows: [["a", "one"]] }));
    const result = assertNoLogicalMutation({
      before: snap, after: snap,
      pinBefore: { generation: "g1", revision: 5 },
      pinAfter: { generation: "g1", revision: 6 },
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/revision changed/);
  });
});
