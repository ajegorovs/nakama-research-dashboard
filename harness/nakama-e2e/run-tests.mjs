#!/usr/bin/env bun
/**
 * Test gate for the Nakama E2E harness slice. Runs the offline seam tests. No provider, no model, no
 * live instance, no new dependency. Exits non-zero if the suite fails.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const HERE = import.meta.dir;
const REPO = join(HERE, "..", "..");

const result = spawnSync("bun", ["test", "harness/nakama-e2e"], { cwd: REPO, encoding: "utf8", stdio: "inherit" });
const code = result.status ?? 1;
console.log(`${code === 0 ? "PASS" : "FAIL"}  nakama-e2e offline suite`);
process.exit(code);
