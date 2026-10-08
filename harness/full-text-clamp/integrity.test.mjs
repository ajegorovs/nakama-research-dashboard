#!/usr/bin/env bun
/**
 * integrity.test.mjs — the full-text-clamp check must be able to go RED, and must refuse rather than
 * pass when it cannot identify the server it measures. Each case here runs the real `check.mjs` in a
 * deliberately broken condition and asserts the exit code it actually returns.
 *
 * The cases, and what a green run would hide:
 *   1. bytes        — a default run reports `ui/app.js`'s **byte** length (Buffer / on-disk size), not
 *                     its UTF-16 code-unit count. Asserted from the run's own preflight manifest.
 *   2. stale fixture — a self-served run regenerates its generated fixture even when a stale one is on
 *                     disk, and the regenerated payload carries the shared F08 constant (measured).
 *   3. wrong title  — a fixture whose F08 row carries a WRONG title must FAIL (exit 1), not pass.
 *   4. wrong length — a fixture whose F08 `currentState` is the wrong length/text must FAIL (exit 1).
 *   5. occupied port — a run whose fixed port is already taken must fail (child exits before readiness),
 *                     never report PASS.
 *   6. foreign responder — a responder that does not echo this run's token/sha must be REFUSED (exit 3),
 *                     never measured.
 *
 *   bun test harness/full-text-clamp/integrity.test.mjs
 */
import { test, expect, beforeAll } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { F08_STATE, F08_TITLE } from "./make-clamp-fixtures.mjs";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");
const CHECK = path.join(HERE, "check.mjs");
const GENERATED_FIXTURE = path.join(HERE, "clamp-fixtures.json");
const SCRATCH = mkdtempSync(path.join(tmpdir(), "ftc-integrity-"));

// The generated fixture is rebuilt on every self-served run; guarantee one exists before any test so a
// mutation case has a payload to copy even if a previous run's teardown removed it.
beforeAll(() => {
  spawnSync("bun", [path.join(HERE, "make-clamp-fixtures.mjs")], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
}, 120_000);

// `spawnSync` blocks the event loop, so a case must outlast the child's own 90s cap.
const CASE_TIMEOUT = 120_000;

const runCheck = (extra) =>
  spawnSync("bun", [CHECK, "--preflight", ...extra], { cwd: REPO, encoding: "utf8", timeout: 90_000 });

// Async variant for cases whose responder lives in THIS process: `spawnSync` would freeze the event
// loop and the in-process server could never answer.
const runCheckAsync = (extra) =>
  new Promise((resolve) => {
    const child = spawn("bun", [CHECK, "--preflight", ...extra], { cwd: REPO });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("exit", (status) => resolve({ status, stdout, stderr }));
  });

const topicKey = (payload) => Object.keys(payload.responses).find((k) => k.startsWith("get_topic:"));

/** Read the fixture's F08 row (axis 0), whatever title it currently carries. */
const readAxis0 = (file) => {
  const payload = JSON.parse(readFileSync(file, "utf8"));
  return payload.responses[topicKey(payload)].axes[0];
};

/** A copy of the generated fixture with its F08 row (axis 0) mutated by `mutate`. */
const mutatedFixture = (name, mutate) => {
  const payload = JSON.parse(readFileSync(GENERATED_FIXTURE, "utf8"));
  mutate(payload.responses[topicKey(payload)].axes[0]);
  const out = path.join(SCRATCH, name);
  writeFileSync(out, `${JSON.stringify(payload)}\n`);
  return out;
};

test("1. bytes: a default run reports the file's byte length, not its UTF-16 code-unit count", () => {
  const res = runCheck([]);
  expect(res.status).toBe(0);
  const manifest = JSON.parse(
    readFileSync(path.join(REPO, ".hermes", "scratch", "full-text-clamp", "pack", "preflight-manifest.json"), "utf8")
  );
  const onDisk = readFileSync(path.join(REPO, "ui", "app.js")).length;
  expect(typeof manifest.buildBytes).toBe("number");
  expect(manifest.buildBytes).toBe(onDisk);
  expect(manifest.checks.find((c) => c.id === "build.bytesExact")?.status).toBe("PASS");
}, CASE_TIMEOUT);

test("2. stale fixture: a self-served run overwrites a stale generated fixture and measures the F08 canon", () => {
  const stale = JSON.parse(readFileSync(GENERATED_FIXTURE, "utf8"));
  stale.responses[topicKey(stale)].axes[0].title = "STALE WRONG TITLE — must be overwritten";
  stale.responses[topicKey(stale)].axes[0].currentState = "stale";
  writeFileSync(GENERATED_FIXTURE, `${JSON.stringify(stale)}\n`);
  expect(readAxis0(GENERATED_FIXTURE).title).toBe("STALE WRONG TITLE — must be overwritten");

  const res = runCheck([]);
  expect(res.status).toBe(0);
  const after = readAxis0(GENERATED_FIXTURE);
  expect(after.title).toBe(F08_TITLE);
  expect(after.currentState).toBe(F08_STATE);
  expect(readFileSync(GENERATED_FIXTURE, "utf8")).not.toContain("STALE WRONG TITLE");
}, CASE_TIMEOUT);

test("3. WRONG F08 title in the mounted fixture → the check FAILS (exit 1)", () => {
  const fixture = mutatedFixture("wrong-title.json", (a) => {
    a.title = "WRONG TITLE not the F08 subject";
  });
  const res = runCheck(["--url", "http://127.0.0.1:1/preview.html", "--fixtures", fixture]);
  expect(res.status).toBe(1);
  expect(res.stdout).toContain("FAIL    fixtures.f08TitleExact");
}, CASE_TIMEOUT);

test("4. WRONG F08 currentState length/text in the mounted fixture → the check FAILS (exit 1)", () => {
  const fixture = mutatedFixture("wrong-length.json", (a) => {
    a.currentState = a.currentState.slice(0, 100);
  });
  const res = runCheck(["--url", "http://127.0.0.1:1/preview.html", "--fixtures", fixture]);
  expect(res.status).toBe(1);
  expect(res.stdout).toContain("FAIL    fixtures.f08StateExact");
}, CASE_TIMEOUT);

test("5. an occupied fixed port → the run fails, never PASS (child exits before readiness)", async () => {
  const listener = createNetServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  try {
    const res = runCheck(["--serve", "--port", String(port)]);
    expect(res.status).not.toBe(0);
    expect(res.status).not.toBeNull();
    expect(res.stdout + res.stderr).toMatch(/exited before readiness|REFUSED|ABORTED/);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
}, CASE_TIMEOUT);

test("6. a foreign responder that does not echo this run's identity → REFUSED (exit 3), never measured", async () => {
  const foreign = createHttpServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ token: "not-this-runs-token", buildSha256: "0".repeat(64), buildBytes: 1 }));
  });
  await new Promise((resolve) => foreign.listen(0, "127.0.0.1", resolve));
  const port = foreign.address().port;
  try {
    const res = await runCheckAsync([
      "--url", `http://127.0.0.1:${port}/preview.html`,
      "--identity", `http://127.0.0.1:${port}/preview-identity.json`,
    ]);
    expect(res.status).toBe(3);
    expect(res.stderr).toContain("is not this run's preview child");
    expect(res.stderr).toContain("REFUSED");
  } finally {
    await new Promise((resolve) => foreign.close(resolve));
  }
}, CASE_TIMEOUT);
