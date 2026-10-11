#!/usr/bin/env bun
/**
 * make-build.mjs — refresh build.json, the prototype's build identity.
 *
 * Records the sha256 of the frozen data.json and the git HEAD of the worktree that carries the
 * prototype, so a screenshot can be tied to the exact data and revision it was taken against.
 *
 *   bun prototypes/dashboard-ui-rework/make-build.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const HERE = import.meta.dir;
const dataPath = path.join(HERE, "data.json");
const bytes = readFileSync(dataPath);
let gitHead = "";
try { gitHead = execSync("git rev-parse HEAD", { cwd: HERE }).toString().trim(); } catch { /* not a git tree */ }

const build = {
  schema: "dashboard-ui-rework/build-identity@1",
  builtAt: new Date().toISOString(),
  dataFile: "data.json",
  dataBytes: bytes.length,
  dataSha256: createHash("sha256").update(bytes).digest("hex"),
  gitHead,
};
writeFileSync(path.join(HERE, "build.json"), JSON.stringify(build, null, 2) + "\n");
console.log(JSON.stringify(build, null, 2));
