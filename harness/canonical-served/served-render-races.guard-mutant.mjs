#!/usr/bin/env bun
/**
 * served-render-races.guard-mutant.mjs — a TARGETED generation-guard mutant for the served render-races
 * checks. Unlike `served-render-races.mutant.mjs` (which removes three guard families at once and leaves
 * SR/PR nondeterministic), this removes ONLY the request-generation guard the PR/SE checks are about:
 *
 *     if (active && !ctx.signal.aborted) {   ->   if (true) {
 *
 * Why only this one: the feed is keyed by the selected entity (`key={entry.person.id}` /
 * `key={selected.repository.id}`), so a *scope* change (person/repository A -> B) REMOUNTS the feed —
 * the old instance's effect cleanup sets `active=false` regardless of the generation guard, which is why
 * a scope mutant (SR) can stay green. A *page* change inside the SAME entity does NOT remount (the key is
 * unchanged), so the generation guard is the ONLY thing that stops a superseded page response from
 * committing. Removing exactly that guard therefore makes the PR check (offset 5 released after offset 0
 * committed) causally red, deterministically, with no other guard disturbed.
 *
 * It copies ONLY the isolated host copy's plugin dir (never the product repo). `apply` patches + rebuilds
 * THERE; `restore` copies the byte-exact pristine backups back and rebuilds.
 *
 *   bun harness/canonical-served/served-render-races.guard-mutant.mjs apply  <host-plugin-dir>
 *   bun harness/canonical-served/served-render-races.guard-mutant.mjs restore <host-plugin-dir>
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2];
const HOST_PLUGIN = process.argv[3];
if (!HOST_PLUGIN || !existsSync(path.join(HOST_PLUGIN, "src", "ui.tsx"))) {
  console.error("guard-mutant: pass the host plugin dir (…/host/packages/plugins/research-dashboard)");
  process.exit(2);
}
const BACKUP = path.resolve(import.meta.dir, "../../.hermes/scratch/mutant-backup");
const UI = path.join(HOST_PLUGIN, "src", "ui.tsx");
const APP = path.join(HOST_PLUGIN, "ui", "app.js");
const ACTIONS = path.join(HOST_PLUGIN, "actions", "actions.js");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// Idempotent backup: capture the pristine host files once.
mkdirSync(BACKUP, { recursive: true });
for (const [name, file] of [["ui.tsx", UI], ["app.js", APP], ["actions.js", ACTIONS]]) {
  const dst = path.join(BACKUP, name);
  if (!existsSync(dst)) copyFileSync(file, dst);
}

const rebuild = () => {
  const build = spawnSync("bun", ["run", "build"], { cwd: HOST_PLUGIN, encoding: "utf8", stdio: "inherit" });
  if (build.status !== 0) {
    console.error(`guard-mutant: host build failed (${build.status})`);
    process.exit(build.status ?? 1);
  }
};

if (mode === "restore") {
  for (const [src, dst] of [["ui.tsx", UI], ["app.js", APP], ["actions.js", ACTIONS]]) {
    copyFileSync(path.join(BACKUP, src), dst);
  }
  rebuild();
  console.log(`guard-mutant: restored host ui.tsx/app.js/actions.js and rebuilt; ui/app.js sha256 ${sha(APP)}`);
  process.exit(0);
}
if (mode !== "apply") {
  console.error("guard-mutant: mode must be apply|restore");
  process.exit(2);
}

let s = readFileSync(UI, "utf8");
const GUARD = "if (active && !ctx.signal.aborted) {";
const occurrences = s.split(GUARD).length - 1;
if (occurrences !== 1) {
  console.error(`guard-mutant: expected exactly 1 generation guard, found ${occurrences} — refusing`);
  process.exit(2);
}
s = s.replace(GUARD, "if (true) {");
writeFileSync(UI, s);
console.log("guard-mutant: removed ONLY the request-generation guard (active && !ctx.signal.aborted)");
rebuild();
const productSha = sha(path.join(BACKUP, "app.js"));
const mutantSha = sha(APP);
console.log(`guard-mutant: mutant ui/app.js sha256 ${mutantSha}`);
console.log(`guard-mutant: product ui/app.js sha256 ${productSha}`);
if (mutantSha === productSha) {
  console.error("guard-mutant: mutant bundle is byte-identical to the product — the guard patch did not take");
  process.exit(1);
}
