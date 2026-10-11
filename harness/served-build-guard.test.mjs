/**
 * Offline unit tests for `served-build-guard.mjs`'s target selection. No browser, no instance, no network:
 * `resolveDashboardOrigin` is pure, and the missing-config refusal exits before any browser is launched, so
 * the child process is exercised directly. Run with:
 *
 *     bun test harness/served-build-guard.test.mjs
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDashboardOrigin } from "./served-build-guard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "served-build-guard.mjs");

describe("served-build-guard origin resolution", () => {
  test("a missing or blank NAKAMA_DASHBOARD is refused, naming the variable and the no-default rule", () => {
    for (const value of [undefined, "", "   "]) {
      const result = resolveDashboardOrigin(value);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("NAKAMA_DASHBOARD");
      expect(result.message).toMatch(/no default/i);
    }
  });

  test("an explicit origin is accepted; surrounding space and trailing slashes are stripped", () => {
    expect(resolveDashboardOrigin("http://127.0.0.1:3003")).toEqual({ ok: true, origin: "http://127.0.0.1:3003" });
    expect(resolveDashboardOrigin("  http://127.0.0.1:3003/  ")).toEqual({ ok: true, origin: "http://127.0.0.1:3003" });
  });

  test("a unified origin (web and API on one origin) is accepted, never rejected", () => {
    const result = resolveDashboardOrigin("http://127.0.0.1:4399");
    expect(result.ok).toBe(true);
    expect(result.origin).toBe("http://127.0.0.1:4399");
  });
});

describe("served-build-guard refuses a missing target before any browser", () => {
  test("run with NAKAMA_DASHBOARD unset exits 2 and names the required variable", () => {
    const env = { ...process.env };
    delete env.NAKAMA_DASHBOARD;
    const run = spawnSync(process.execPath, [GUARD], { env, encoding: "utf8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("NAKAMA_DASHBOARD");
  });
});
