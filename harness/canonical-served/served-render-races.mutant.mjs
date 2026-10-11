#!/usr/bin/env bun
/**
 * served-render-races.mutant.mjs — build a temporary MUTANT plugin bundle (in the isolated host copy only,
 * never the repo) that removes the two guard families the served-render-races checks are about, so the
 * checks can be shown to FAIL without the fix (a green suite that cannot go red proves nothing):
 *
 *   - the identity / scope reset (the `scopeRef` block that nulls the page and resets the offset on a
 *     scope change) — its removal leaves the previous scope's rows under the new identity (IR);
 *   - the stable feed `key` on both PagedActivityFeed usages (forces the remount on identity change);
 *   - the request-generation guard (`active && !ctx.signal.aborted`) — its removal lets a superseded
 *     response commit over the newer one (SR / PR) and lets a stale failure surface (SE).
 *
 *   bun harness/canonical-served/served-render-races.mutant.mjs apply  <host-plugin-dir>
 *   bun harness/canonical-served/served-render-races.mutant.mjs restore <host-plugin-dir>
 *
 * `apply` backs the host's ui/app.js + src/ui.tsx + actions/actions.js up under the scratch dir first, then
 * patches src/ui.tsx and rebuilds in the host. `restore` copies the byte-exact backups back.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2];
const HOST_PLUGIN = process.argv[3];
if (!HOST_PLUGIN || !existsSync(path.join(HOST_PLUGIN, "src", "ui.tsx"))) {
  console.error("mutant: pass the host plugin dir (…/host/packages/plugins/research-dashboard)");
  process.exit(2);
}
const BACKUP = path.resolve(import.meta.dir, "../../.hermes/scratch/mutant-backup");
const UI = path.join(HOST_PLUGIN, "src", "ui.tsx");
const APP = path.join(HOST_PLUGIN, "ui", "app.js");
const ACTIONS = path.join(HOST_PLUGIN, "actions", "actions.js");

if (mode === "restore") {
  for (const [src, dst] of [
    ["ui.tsx", UI],
    ["app.js", APP],
    ["actions.js", ACTIONS],
  ]) {
    copyFileSync(path.join(BACKUP, src), dst);
  }
  console.log("mutant: restored host ui.tsx / ui/app.js / actions/actions.js byte-exact");
  process.exit(0);
}
if (mode !== "apply") {
  console.error("mutant: mode must be apply|restore");
  process.exit(2);
}

// Idempotent backup: capture the pristine host files once.
mkdirSync(BACKUP, { recursive: true });
for (const [name, file] of [
  ["ui.tsx", UI],
  ["app.js", APP],
  ["actions.js", ACTIONS],
]) {
  const dst = path.join(BACKUP, name);
  if (!existsSync(dst)) copyFileSync(file, dst);
}

let s = readFileSync(UI, "utf8");
const before = s;
// (a) remove the identity/scope reset block (defix R3).
s = s.replace(
  `      if (scopeRef.current !== scopeKey) {\n        scopeRef.current = scopeKey;\n        setPage(null);\n        if (offset !== 0) {\n          setOffset(0);\n          return;\n        }\n      }\n`,
  ""
);
// (b) remove the request-generation guard so a superseded response commits.
s = s.replace("if (active && !ctx.signal.aborted) {", "if (true) {");
// (c) remove the stable feed key on both PagedActivityFeed usages.
s = s.replace(/(emptyText="No attributable activity recorded yet\."\s*\n\s*)key=\{entry\.person\.id\}\n/, "$1");
s = s.replace(/(emptyText="No repository-scoped events in this snapshot\."\s*\n\s*)key=\{selected\.repository\.id\}\n/, "$1");
if (s === before) {
  console.error("mutant: no replacement matched — host src/ui.tsx has drifted");
  process.exit(2);
}
writeFileSync(UI, s);
console.log("mutant: patched host src/ui.tsx (scope reset + request-generation guard + feed keys removed)");

const build = spawnSync("bun", ["run", "build"], { cwd: HOST_PLUGIN, encoding: "utf8", stdio: "inherit" });
if (build.status !== 0) {
  console.error(`mutant: host build failed (${build.status})`);
  process.exit(build.status ?? 1);
}
console.log("mutant: rebuilt the mutant bundle in the host");
