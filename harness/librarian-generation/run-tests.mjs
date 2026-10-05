#!/usr/bin/env bun
/**
 * Test gate for the librarian semantic-eval harness (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §10).
 *
 * Runs the offline runner/authorization tests, the end-to-end mock orchestration tests, and the Python
 * transport-helper guard tests (via the interpreter of the installed `hermes` executable). No new
 * dependency, no provider, no model. Exits non-zero if any suite fails.
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

const HERE = import.meta.dir;
const REPO = join(HERE, "..", "..");

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: REPO, encoding: "utf8", stdio: "inherit" });
  const code = result.status ?? 1;
  console.log(`${code === 0 ? "PASS" : "FAIL"}  ${label}`);
  return code;
}

function hermesInterpreter() {
  const which = spawnSync("sh", ["-c", "command -v hermes"], { encoding: "utf8" });
  const exe = (which.stdout ?? "").trim();
  if (!exe) return null;
  try {
    const candidate = join(dirname(realpathSync(exe)), "python3");
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

let failed = 0;
failed += run("bun — offline runner + authorization gate", "bun", [
  "test",
  "harness/librarian-generation/run-offline.test.mjs",
]);
failed += run("bun — end-to-end mock orchestration", "bun", [
  "test",
  "harness/librarian-generation/run-generation.test.mjs",
]);

const interpreter = hermesInterpreter();
if (interpreter) {
  failed += run("python — transport helper guard tests", interpreter, [
    "-m",
    "unittest",
    "harness.librarian-generation.test_transport_helper",
  ]);
} else {
  console.error("SKIP  python transport-helper guard tests (no installed hermes interpreter resolvable)");
}

if (failed > 0) {
  console.error(`librarian:semantic-eval:test — ${failed} suite(s) failed.`);
  process.exit(1);
}
console.log("librarian:semantic-eval:test — all suites passed.");
