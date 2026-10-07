/**
 * OFFLINE tests for explicit organization selection in the mutating harness helpers.
 *
 * Two layers:
 *   1. the pure resolver (`selectOrgId`) — every branch the reviewer named: a named org is honoured, a
 *      foreign/unavailable name is refused, a multi-org account with no selector is refused, and a
 *      single-org account falls back to its only organization;
 *   2. an end-to-end check that drives the **real** `reinstall-plugin.mjs` against a loopback stub of the
 *      host, asserting that a refusal performs **no reinstall request** — the safety property, not just the
 *      return value. No live instance, no inference, no mutation: the stub records what it was asked.
 *
 *     bun test harness/org-selection.test.mjs
 */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { parseOrgSelector, selectOrgId } from "./org-selection.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const MULTI = [
  { id: "org_alpha", name: "Alpha" },
  { id: "org_beta", name: "Beta" },
];

// ---------------------------------------------------------------------------- 1. the pure resolver

describe("selectOrgId — explicit, or fail", () => {
  test("no selector on a single-org account falls back to its only organization", () => {
    expect(selectOrgId([{ id: "org_only", name: "Only" }])).toEqual({
      ok: true,
      id: "org_only",
      name: "Only",
      matchedBy: "single-org",
    });
  });

  test("no selector on a multi-org account is refused (ambiguous), not guessed", () => {
    const result = selectOrgId(MULTI);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ambiguous");
    expect(result.message).toMatch(/--org-id|NAKAMA_ORG_ID/);
  });

  test("an explicit id on a multi-org account selects exactly that organization", () => {
    expect(selectOrgId(MULTI, { orgId: "org_beta" })).toEqual({
      ok: true,
      id: "org_beta",
      name: "Beta",
      matchedBy: "id",
    });
  });

  test("an explicit name resolves when unique", () => {
    expect(selectOrgId(MULTI, { orgName: "Beta" })).toMatchObject({ ok: true, id: "org_beta" });
  });

  test("a foreign/unavailable id is refused", () => {
    const result = selectOrgId(MULTI, { orgId: "org_not_here" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unavailable");
  });

  test("a foreign/unavailable name is refused", () => {
    const result = selectOrgId(MULTI, { orgName: "Gamma" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unavailable");
  });

  test("an ambiguous name is refused", () => {
    const result = selectOrgId(
      [
        { id: "org_1", name: "Twin" },
        { id: "org_2", name: "Twin" },
      ],
      { orgName: "Twin" }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ambiguous-name");
  });

  test("an id and a name that disagree are refused", () => {
    const result = selectOrgId(MULTI, { orgId: "org_alpha", orgName: "Beta" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("conflicting-selector");
  });

  test("an id and its matching name together are accepted", () => {
    expect(selectOrgId(MULTI, { orgId: "org_alpha", orgName: "Alpha" })).toMatchObject({
      ok: true,
      id: "org_alpha",
    });
  });

  test("an empty account is refused", () => {
    expect(selectOrgId([], {})).toMatchObject({ ok: false, reason: "no-org" });
  });
});

describe("parseOrgSelector", () => {
  test("flags win over the environment", () => {
    expect(
      parseOrgSelector(["--org-id", "flag_id", "--org-name", "flag_name"], {
        NAKAMA_ORG_ID: "env_id",
        NAKAMA_ORG_NAME: "env_name",
      })
    ).toEqual({ orgId: "flag_id", orgName: "flag_name" });
  });

  test("the environment is used when no flag is present", () => {
    expect(parseOrgSelector([], { NAKAMA_ORG_ID: "env_id" })).toEqual({ orgId: "env_id", orgName: "" });
  });

  test("nothing set yields empty selectors (falls through to the single-org/refuse rule)", () => {
    expect(parseOrgSelector([], {})).toEqual({ orgId: "", orgName: "" });
  });
});

// ---------------------------------------------------------------------------- 2. the CLI, end to end

/**
 * Start a loopback stub of the small host surface `reinstall-plugin.mjs` uses, run the real script against
 * it, and return the exit code plus every request the script made. `orgs` chooses the account shape.
 */
async function runReinstall(orgs, extraEnv = {}) {
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      requests.push({
        method: request.method,
        path: pathname,
        orgId: request.headers.get("x-org-id"),
      });
      const cookieHeaders = new Headers();
      cookieHeaders.append("set-cookie", "nakama_csrf=test-csrf; Path=/");
      cookieHeaders.append("set-cookie", "nakama_session=s1; Path=/");
      if (pathname === "/v1/auth/login") {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cookieHeaders });
      }
      if (pathname === "/v1/auth/orgs") {
        return new Response(JSON.stringify({ orgs }), { status: 200 });
      }
      if (pathname === "/v1/plugins/research-dashboard") {
        return new Response(
          JSON.stringify({
            installed: true,
            revision: 7,
            selectedVersion: "0.2.0+dev.stub",
            lifecycleState: "enabled",
          }),
          { status: 200 }
        );
      }
      if (pathname === "/v1/plugins/official/research-dashboard/reinstall") {
        return new Response(JSON.stringify({ install: { lifecycleState: "enabled", revision: 8 } }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 404 });
    },
  });

  const child = Bun.spawn(["bun", "harness/reinstall-plugin.mjs"], {
    cwd: REPO,
    env: {
      ...process.env,
      NAKAMA_URL: `http://127.0.0.1:${server.port}`,
      NAKAMA_EMAIL: "reviewer@example.com",
      NAKAMA_PASSWORD: "from-the-stub",
      NAKAMA_ORG_ID: "",
      NAKAMA_ORG_NAME: "",
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  server.stop(true);
  return { code, stdout, stderr, requests };
}

const reinstalls = (requests) =>
  requests.filter((r) => r.path === "/v1/plugins/official/research-dashboard/reinstall");

describe("reinstall-plugin.mjs — refuses before any mutating request", () => {
  test("multi-org with no selector: non-zero exit, NO reinstall request", async () => {
    const run = await runReinstall(MULTI);
    expect(run.code).not.toBe(0);
    expect(reinstalls(run.requests)).toHaveLength(0);
    expect(run.stderr).toMatch(/--org-id|NAKAMA_ORG_ID/);
  });

  test("multi-org with a foreign id: non-zero exit, NO reinstall request", async () => {
    const run = await runReinstall(MULTI, { NAKAMA_ORG_ID: "org_not_here" });
    expect(run.code).not.toBe(0);
    expect(reinstalls(run.requests)).toHaveLength(0);
  });

  test("multi-org with an explicit valid id: succeeds and pins x-org-id to that org", async () => {
    const run = await runReinstall(MULTI, { NAKAMA_ORG_ID: "org_beta" });
    expect(run.code).toBe(0);
    const done = reinstalls(run.requests);
    expect(done).toHaveLength(1);
    expect(done[0].orgId).toBe("org_beta");
    expect(run.stdout).toContain("org_beta");
  });

  test("single-org with no selector: succeeds via the legacy fallback", async () => {
    const run = await runReinstall([{ id: "org_only", name: "Only" }]);
    expect(run.code).toBe(0);
    const done = reinstalls(run.requests);
    expect(done).toHaveLength(1);
    expect(done[0].orgId).toBe("org_only");
  });
});
