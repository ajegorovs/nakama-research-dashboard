/**
 * Logical no-write proof for the **plugin store**, plus generation + revision pinning.
 *
 * Ported from `harness/librarian-db-snapshot.mjs`'s `canonicalSnapshot` idea (schema objects + per-table
 * row count + canonical-sorted rows + a version map), retargeted at the live fixture org's plugin-store
 * generation file:
 *
 *     <data-root>/orgs/<org>/plugins/<pluginId>/db/<generation>.sqlite
 *
 * Hardening applied here (review envelope `docs/evidence-automation/NAKAMA-E2E-EXECUTION.md`, amendment 5,
 * and the independent review B4/L5):
 *   1. the store identity is pinned by **generation AND revision** — both read from the current pinned
 *      host `org_plugins` schema (pinned source `945420b6…`, `packages/db/src/migrate.ts:1760-1773`), which
 *      carries **both** `database_generation TEXT` **and** `revision INTEGER NOT NULL`. They are distinct
 *      columns and are never conflated: the *file* is selected by `database_generation`, the monotonic
 *      *pin* is `revision`. The proof fails closed when either moves.
 *   2. the active generation is resolved from the platform DB, so a data root that holds several
 *      historical generations does not fail as "ambiguous" and does not accidentally snapshot a stale
 *      generation file that still holds the rows (the documented empty-corpus trap). Absent / malformed /
 *      lifecycle-incompatible / missing-file all fail closed.
 *   3. `canonicalSnapshot` reads every object inside **one explicit read transaction** with safely quoted
 *      identifiers, so schema, counts, rows and versions are a single consistent point-in-time projection
 *      rather than a mixed-time stitch of separate reads.
 *   4. the positive-control write is **never applied to the live store**; it is applied to a scratch
 *      snapshot copy built with SQLite's own consistent serialization (Bun's `Database#serialize`, read
 *      from a read-only source inside a read transaction), and the scratch copy is removed afterwards.
 *
 * This measures logical rows/schema/versions only — never SQLite file bytes, WAL or page layout.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

export class SnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = "SnapshotError";
  }
}

/**
 * `org_plugins.lifecycle_state` domain from the pinned host contract
 * (`packages/core/src/plugins.ts:43-49`). Only `enabled` is a servable/active state; the transitional and
 * terminal states are treated as lifecycle-incompatible for a no-write proof, and an unknown string is
 * malformed rather than silently accepted.
 */
export const KNOWN_LIFECYCLE_STATES = ["disabled", "disabling", "enabled", "enabling", "retained", "updating"];
export const ACTIVE_LIFECYCLE_STATES = ["enabled"];

/** Safely quote an SQLite identifier (double any embedded quote). Never accept an empty identifier. */
export function quoteIdentifier(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new SnapshotError(`cannot quote empty/invalid SQLite identifier: ${JSON.stringify(name)}`);
  }
  return `"${name.replaceAll('"', '""')}"`;
}

function normalizeSql(sql) {
  return String(sql ?? "").replace(/\s+/g, " ").trim();
}

/** True when the path is a regular file (guards against pointing the snapshot at a directory). */
export function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/**
 * The canonical logical projection: schema objects, row counts, canonical rows and a version map, read
 * inside a single transaction so the whole projection is one consistent point in time.
 */
export function canonicalSnapshot(path) {
  const db = new Database(path, { readonly: true });
  try {
    db.exec("BEGIN");
    const objects = db
      .query(`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`)
      .all()
      .map((row) => ({ name: row.name, sql: normalizeSql(row.sql), type: row.type }));
    const tables = objects.filter((row) => row.type === "table").map((row) => row.name);
    const rows = {};
    const counts = {};
    const versions = {};
    for (const table of tables) {
      const ident = quoteIdentifier(table);
      const columns = db.query(`PRAGMA table_info(${ident})`).all().map((c) => c.name).sort();
      const present = db.query(`SELECT * FROM ${ident}`).all();
      rows[table] = present
        .map((row) => JSON.stringify(Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))))
        .sort();
      counts[table] = rows[table].length;
      if (table === "development_axes" || table === "problems") {
        if (columns.includes("id") && columns.includes("version")) {
          versions[table] = present.map((row) => `${row.id}=${row.version}`).sort();
        }
      }
    }
    const result = { counts, objects, rows, versions };
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* connection may already be unwound */ }
    throw error;
  } finally {
    db.close();
  }
}

export function snapshotsEqual(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

export function describeDifference(before, after) {
  const details = [];
  if (JSON.stringify(before.objects) !== JSON.stringify(after.objects)) details.push("schema objects differ");
  for (const table of Object.keys({ ...before.counts, ...after.counts })) {
    const left = before.counts[table] ?? 0;
    const right = after.counts[table] ?? 0;
    if (left !== right) details.push(`row count ${table}: ${left} -> ${right}`);
    else if (JSON.stringify(before.rows[table]) !== JSON.stringify(after.rows[table])) {
      details.push(`contents of ${table} changed`);
    }
  }
  if (JSON.stringify(before.versions) !== JSON.stringify(after.versions)) details.push("a version moved");
  return details.length ? details.join("; ") : "unspecified logical difference";
}

/**
 * Locate a generation file for a plugin store.
 *
 * With `activeGeneration` supplied the named generation is selected explicitly and the presence of other
 * (historical/archived) generations is expected and fine — this is the hardened path used by
 * `resolveActiveStoreIdentity`. Without it the legacy single-generation contract is preserved: exactly one
 * generation must exist, else fail closed.
 */
export function discoverStorePath({ dataRoot, org, pluginId, activeGeneration }) {
  const dir = join(dataRoot, "orgs", org, "plugins", pluginId, "db");
  if (!existsSync(dir)) throw new SnapshotError(`plugin store directory not found: ${dir}`);
  const generations = readdirSync(dir)
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => ({ file: name, generation: name.slice(0, -".sqlite".length), path: join(dir, name) }));
  if (activeGeneration !== undefined) {
    const match = generations.find((entry) => entry.generation === activeGeneration);
    if (!match) throw new SnapshotError(`active generation ${activeGeneration}.sqlite not found under ${dir}`);
    if (!isFile(match.path)) throw new SnapshotError(`active generation is not a regular file: ${match.path}`);
    return match;
  }
  if (generations.length === 0) throw new SnapshotError(`no generation .sqlite under ${dir}`);
  if (generations.length > 1) {
    throw new SnapshotError(`ambiguous plugin store: ${generations.length} generations under ${dir}`);
  }
  return generations[0];
}

/**
 * The revision the org is actually serving, from the platform DB's `org_plugins` table. This legacy reader
 * is retained for the single-column `revision` pin; the hardened active resolution is
 * `resolveActiveStoreIdentity` (which needs both columns). Fails closed if the row cannot be read.
 */
export function readServedRevision({ platformDbPath, orgId, pluginId, table = "org_plugins", column = "revision" }) {
  const db = new Database(platformDbPath, { readonly: true });
  try {
    const row = db
      .query(`SELECT ${quoteIdentifier(column)} AS revision FROM ${quoteIdentifier(table)} WHERE org_id = ? AND plugin_id = ?`)
      .get(orgId, pluginId);
    if (!row || row.revision === null || row.revision === undefined) {
      throw new SnapshotError(`no served ${column} for org ${orgId} plugin ${pluginId} in ${table}`);
    }
    return row.revision;
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError(`could not read served revision: ${error.message}`);
  } finally {
    db.close();
  }
}

/**
 * Read the served `org_plugins` row (both `database_generation` and `revision`, plus `lifecycle_state`)
 * read-only, inside a single transaction. Returns `null` when no row exists.
 */
export function readActivePluginRow({ platformDbPath, orgId, pluginId, table = "org_plugins" }) {
  const db = new Database(platformDbPath, { readonly: true });
  try {
    db.exec("BEGIN");
    const row = db
      .query(
        `SELECT org_id, plugin_id, database_generation, revision, lifecycle_state
           FROM ${quoteIdentifier(table)}
          WHERE org_id = ? AND plugin_id = ?`
      )
      .get(orgId, pluginId);
    db.exec("COMMIT");
    return row ?? null;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw new SnapshotError(`could not read ${table} for org ${orgId} plugin ${pluginId}: ${error.message}`);
  } finally {
    db.close();
  }
}

/**
 * Resolve the store the org is actually serving, from the current pinned host schema:
 * `database_generation` selects the generation **file** and `revision` is the integer **pin**. Fails closed
 * on: absent row, absent/empty generation, a missing generation file, a non-integer revision, or a
 * lifecycle state that is not active (or is unknown).
 */
export function resolveActiveStoreIdentity({
  dataRoot,
  org,
  pluginId,
  platformDbPath,
  orgId,
  table = "org_plugins",
  activeLifecycleStates = ACTIVE_LIFECYCLE_STATES,
}) {
  const row = readActivePluginRow({ platformDbPath, orgId, pluginId, table });
  if (!row) throw new SnapshotError(`no org_plugins row for org ${orgId} plugin ${pluginId} in ${table}`);

  const generation = row.database_generation;
  if (typeof generation !== "string" || generation.trim() === "") {
    throw new SnapshotError(
      `org ${orgId} plugin ${pluginId}: database_generation absent or malformed (${JSON.stringify(generation)})`
    );
  }

  const revision = row.revision;
  if (!Number.isInteger(revision)) {
    throw new SnapshotError(
      `org ${orgId} plugin ${pluginId}: revision is not an integer (${JSON.stringify(revision)})`
    );
  }

  const lifecycleState = row.lifecycle_state;
  if (!KNOWN_LIFECYCLE_STATES.includes(lifecycleState)) {
    throw new SnapshotError(
      `org ${orgId} plugin ${pluginId}: lifecycle_state unknown (${JSON.stringify(lifecycleState)})`
    );
  }
  if (!activeLifecycleStates.includes(lifecycleState)) {
    throw new SnapshotError(
      `org ${orgId} plugin ${pluginId}: lifecycle incompatible with a served store (${lifecycleState})`
    );
  }

  const store = discoverStorePath({ dataRoot, org, pluginId, activeGeneration: generation });
  return {
    generation: store.generation,
    revision,
    lifecycleState,
    path: store.path,
    file: store.file,
    storeDir: join(dataRoot, "orgs", org, "plugins", pluginId, "db"),
    orgId,
    org,
    pluginId,
  };
}

/**
 * Legacy identity pin `{ generation, revision, path }`: single generation file + the served revision
 * column. Retained for callers that predate the active-generation resolution.
 */
export function pinStoreIdentity({ dataRoot, org, pluginId, platformDbPath, orgId }) {
  const store = discoverStorePath({ dataRoot, org, pluginId });
  const revision = readServedRevision({ platformDbPath, orgId, pluginId });
  return { generation: store.generation, path: store.path, revision };
}

/** Hardened identity pin built from `resolveActiveStoreIdentity` (generation + revision + lifecycle). */
export function pinActiveStoreIdentity(options) {
  const resolved = resolveActiveStoreIdentity(options);
  return {
    generation: resolved.generation,
    path: resolved.path,
    revision: resolved.revision,
    lifecycleState: resolved.lifecycleState,
  };
}

/** Compare two identity pins. Fails closed on a generation or revision change. */
export function assertIdentityPinned(pinBefore, pinAfter) {
  const failures = [];
  if (pinBefore.generation !== pinAfter.generation) {
    failures.push(`plugin store generation changed: ${pinBefore.generation} -> ${pinAfter.generation}`);
  }
  if (pinBefore.revision !== pinAfter.revision) {
    failures.push(`served plugin revision changed: ${pinBefore.revision} -> ${pinAfter.revision}`);
  }
  return { ok: failures.length === 0, failures };
}

/**
 * The no-write verdict: the two logical snapshots must be equal AND the store identity must be unchanged.
 * A generation/revision change fails the proof even if the rows happen to match.
 */
export function assertNoLogicalMutation({ before, after, pinBefore, pinAfter }) {
  const failures = [];
  const pin = assertIdentityPinned(pinBefore, pinAfter);
  failures.push(...pin.failures);
  if (!snapshotsEqual(before, after)) failures.push(describeDifference(before, after));
  return { ok: failures.length === 0, failures };
}

/**
 * Build a **consistent** snapshot copy of a SQLite database at `destPath`.
 *
 * The previous file-level copy (`copyFileSync` of the main file plus `-wal`/`-shm`) is not atomic: a writer
 * can check it between the copies, so the result can be torn. This instead opens the source **read-only**,
 * starts a read transaction, and uses SQLite's own serialization (Bun's `Database#serialize`) — a single,
 * internally consistent image that already includes any uncheckpointed WAL content. The bytes are written
 * before the connection closes (the serialize buffer is connection-owned). This never writes to the source
 * and never forces a checkpoint on it.
 */
export function copyDatabase(sourcePath, destPath) {
  if (!isFile(sourcePath)) throw new SnapshotError(`cannot snapshot a non-file source: ${sourcePath}`);
  const db = new Database(sourcePath, { readonly: true });
  try {
    db.exec("BEGIN");
    const bytes = db.serialize();
    if (!bytes || bytes.byteLength === 0) {
      throw new SnapshotError(`serialize produced an empty image for ${sourcePath}`);
    }
    for (const suffix of ["", "-wal", "-shm"]) rmSync(destPath + suffix, { force: true });
    writeFileSync(destPath, bytes);
    db.exec("COMMIT");
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError(`could not snapshot ${sourcePath}: ${error.message}`);
  } finally {
    db.close();
  }
  return destPath;
}

/**
 * The positive instrument control, run against a **copy** so the live store is never touched. Instead of
 * editing an existing row (which assumes a `rowid` and can collide with constraints, and is invalid for a
 * `WITHOUT ROWID` table), it creates a **dedicated, uniquely named control table** in the copy and inserts
 * one row — a real logical change that any schema can carry. Returns `{ ok, detected, detail }`; `detected`
 * true means the comparator is not a rubber stamp. The scratch copy is removed afterwards unless the caller
 * asks to keep it as intended evidence.
 */
export function positiveControlMutation({ dbPath, scratchDir, keepCopy = false }) {
  mkdirSync(scratchDir, { recursive: true });
  const copyPath = join(scratchDir, `control-copy-${crypto.randomUUID()}.sqlite`);
  copyDatabase(dbPath, copyPath);

  const controlTable = `snapshot_control_${crypto.randomUUID().replaceAll("-", "")}`;
  const before = canonicalSnapshot(copyPath);

  const db = new Database(copyPath);
  let detail;
  try {
    db.exec(`CREATE TABLE ${quoteIdentifier(controlTable)} (marker TEXT NOT NULL)`);
    db.query(`INSERT INTO ${quoteIdentifier(controlTable)} (marker) VALUES (?)`).run("control");
    detail = `created control table ${controlTable} on a scratch copy`;
  } finally {
    db.close();
  }

  const after = canonicalSnapshot(copyPath);
  const detected = !snapshotsEqual(before, after);

  let cleaned = false;
  if (!keepCopy) {
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(copyPath + suffix, { force: true });
      cleaned = true;
    }
  }
  return { ok: detected, detected, copyPath, controlTable, detail, cleaned };
}
