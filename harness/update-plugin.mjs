#!/usr/bin/env bun
/**
 * update-plugin.mjs — apply this checkout's plugin migrations to a running instance.
 *
 *   bun harness/update-plugin.mjs --env-file /tmp/nakama-review.env [--data-root <dir>]
 *
 * Why this exists: the host runs plugin migrations during an install/enable/update cycle, never at boot,
 * and a pending migration makes it build a **new database generation** — a fresh copy of the current one
 * with the migrations applied. So "apply 004" is an update call, and the pre-migration database is left in
 * place, untouched, as the rollback artifact.
 *
 * The plugin's migrations are declared in nakama.plugin.json; a migration file that is not registered there
 * is never seen by the host, which this script therefore checks first.
 *
 * Idempotent in the useful sense: with no pending migration it reports that and changes nothing.
 */
import { loadEnvFileArg } from "./env-file.mjs";
import { parseOrgSelector, selectOrgId } from "./org-selection.mjs";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadEnvFileArg();

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const BASE = (process.env.NAKAMA_URL ?? "http://127.0.0.1:4399").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const EMAIL = process.env.NAKAMA_EMAIL ?? process.env.NAKAMA_DEV_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_PASSWORD ?? process.env.NAKAMA_DEV_PASSWORD ?? "";
const DATA_ROOT = process.env.NAKAMA_DATA_ROOT ?? argValue("--data-root") ?? "";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (!EMAIL || !PASSWORD) {
  console.error("update-plugin: NAKAMA_EMAIL / NAKAMA_PASSWORD are not set (or pass --env-file)");
  process.exit(2);
}

// The manifest is what the host reads: an unregistered migration file is invisible, and a registered one
// that is missing from disk is a load error. Check the pairing before talking to the instance.
const manifest = JSON.parse(readFileSync(join(REPO, "nakama.plugin.json"), "utf8"));
const declared = manifest.database?.migrations ?? [];
const onDisk = [...new Bun.Glob("migrations/*.sql").scanSync(REPO)].sort();
const declaredPaths = declared.map((m) => m.path).sort();
const undeclared = onDisk.filter((p) => !declaredPaths.includes(p));
const missing = declaredPaths.filter((p) => !onDisk.includes(p));
if (undeclared.length || missing.length) {
  console.error(
    `update-plugin: manifest/disk mismatch — undeclared: [${undeclared}], missing: [${missing}]\n` +
      "register every migration in nakama.plugin.json under database.migrations, and keep the ids unique"
  );
  process.exit(1);
}
console.log(`update-plugin: ${declared.length} migrations declared, ${declared.length} on disk`);
console.log(`  newest declared: ${declared[declared.length - 1].id} (plugin version ${manifest.version})`);

const jar = new Map();
const cookieHeader = () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
const call = async (path, body, headers = {}) => {
  let response;
  try {
    response = await fetch(BASE + path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(jar.size === 0 ? {} : { cookie: cookieHeader() }),
        ...headers,
      },
      method: body === undefined ? "GET" : "POST",
    });
  } catch (error) {
    console.error(`update-plugin: cannot reach ${BASE} (${error?.cause?.code ?? error.message})`);
    process.exit(2);
  }
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
  }
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text || "{}"); } catch { parsed = { raw: text.slice(0, 400) }; }
  return { body: parsed, status: response.status };
};

const login = await call("/v1/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 200) {
  console.error(`update-plugin: login failed (HTTP ${login.status}) at ${BASE}`);
  process.exit(2);
}
const csrf = jar.get("nakama_csrf");
const orgs = await call("/v1/auth/orgs");
// Resolve the target organization explicitly; a multi-org account without a selector is refused before the
// reinstall request (the historical `orgs[0]` default bound the wrong organization).
const selection = selectOrgId(orgs.body?.orgs, parseOrgSelector());
if (!csrf || !selection.ok) {
  console.error(`update-plugin: ${csrf ? selection.message : "missing csrf cookie"}`);
  process.exit(2);
}
const orgId = selection.id;
console.log(
  `update-plugin: target organization ${orgId}` +
    (selection.name ? ` (${selection.name})` : "") +
    `, matched by ${selection.matchedBy}`
);
const headers = { "x-csrf-token": csrf, "x-org-id": orgId };

const before = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
if (before.installed !== true) {
  console.error(`update-plugin: '${PLUGIN_ID}' is not installed on this instance — install it first`);
  process.exit(1);
}
const beforeGeneration = before.databaseGeneration ?? null;
console.log(`update-plugin: before — version=${before.selectedVersion} revision=${before.revision} ` +
            `generation=${beforeGeneration} lifecycle=${before.lifecycleState}`);

// Reinstall, not update. For a checkout loaded as a bundled ("official-style") plugin the release
// version embeds a digest of the plugin's files, so every edit produces a version the instance has never
// registered — and `update/preview` answers 404 not_found for a release that does not exist yet.
// `reinstall` is the route that registers the new release, and its own documentation is
// "Reload a bundled official plugin while preserving organization data". That is what applying a
// migration to a dev instance is.
const reinstall = await call(
  `/v1/plugins/official/${PLUGIN_ID}/reinstall`,
  { expectedRevision: before.revision },
  headers
);
if (reinstall.status !== 200) {
  console.error(
    `update-plugin: reinstall refused (HTTP ${reinstall.status}) ${JSON.stringify(reinstall.body).slice(0, 600)}\n` +
      "if the instance has not seen your edits, vendor them into the checkout first:\n" +
      "  ./vendor/vendor-into-nakama.sh <nakama-checkout>"
  );
  process.exit(1);
}
let detail = reinstall.body?.install ?? {};

// The update can be asynchronous; wait for a settled, enabled state rather than assuming the first
// response means the migration has been applied.
const deadline = Date.now() + 30_000;
while (Date.now() < deadline && detail.lifecycleState && detail.lifecycleState !== "enabled") {
  await Bun.sleep(500);
  detail = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
}
console.log(`update-plugin: after — version=${detail.selectedVersion} revision=${detail.revision} ` +
            `generation=${detail.databaseGeneration ?? "?"} lifecycle=${detail.lifecycleState}`);
if (detail.lifecycleState !== "enabled") {
  console.error(`update-plugin: ended in '${detail.lifecycleState}' — lastLifecycleError: ` +
                `${JSON.stringify(detail.lastLifecycleError ?? null).slice(0, 400)}`);
  process.exit(1);
}
if (detail.databaseGeneration && detail.databaseGeneration === beforeGeneration) {
  console.log("update-plugin: generation unchanged — the host saw no pending migration for this version");
}

if (DATA_ROOT) {
  for (const candidate of [detail.databaseGeneration, beforeGeneration].filter(Boolean)) {
    const path = join(DATA_ROOT, "orgs", orgId, "plugins", PLUGIN_ID, "db", `${candidate}.sqlite`);
    if (!(await Bun.file(path).exists())) { console.log(`update-plugin: (no file at ${path})`); continue; }
    const db = new Database(path, { readonly: true });
    const one = (sql) => db.query(sql).get()?.n ?? 0;
    const has = db.query("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='state_log'").get().n > 0;
    console.log(`\n  ${candidate}  ${path}`);
    console.log(`    journal_mode=${db.query("PRAGMA journal_mode").get().journal_mode} ` +
                `state_log=${has ? "present" : "absent"}`);
    console.log(`    topics=${one("SELECT COUNT(*) n FROM topics")} axes=${one("SELECT COUNT(*) n FROM development_axes")} ` +
                `activities=${one("SELECT COUNT(*) n FROM activities")} annotations=${one("SELECT COUNT(*) n FROM annotations")}`);
    console.log(`    axes by state: ${JSON.stringify(db.query("SELECT state, COUNT(*) n FROM development_axes GROUP BY 1 ORDER BY 1").all())}`);
    if (has) {
      console.log(`    state_log rows=${one("SELECT COUNT(*) n FROM state_log")} ` +
                  `migration rows=${one("SELECT COUNT(*) n FROM state_log WHERE origin='migration'")}`);
    }
    db.close();
  }
}
console.log("\nupdate-plugin: done");
