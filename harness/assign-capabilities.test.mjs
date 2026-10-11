/**
 * Offline unit tests for `assign-capabilities.mjs`. No network, no instance: an injected `fetchImpl`
 * emulates the host routes the tree already uses (login, `/v1/auth/orgs`, `/v1/auth/me`, `/v1/profiles`,
 * `/v1/profiles/:id`, `/v1/tools`, `/v1/skills`, and the two assignment writes) and REFUSES a write without
 * the `x-csrf-token` header — the trap the remote handback names. The auth identity is the real
 * `createHttpAuth` over that fake transport, so the CSRF-header merge is exercised end to end.
 *
 *     bun test harness/assign-capabilities.test.mjs
 */
import { describe, expect, test } from "bun:test";

import { createHttpAuth } from "./nakama-e2e/driver/http-adapters.mjs";
import { planAssignments, resolveProfileId, runAssignment } from "./assign-capabilities.mjs";

const ORG = "org_target";
const ORG_NAME = "Target Org";
const PLUGIN = "research-dashboard";
const SKILL = "research-coordinator";
const BASE = "http://127.0.0.1:4399";

const TOOL = (short) => ({ id: `id_${short}`, name: `plugin_research_dashboard__${short}`, pluginId: PLUGIN });
const CATALOG_TOOLS = [TOOL("get_overview"), TOOL("get_topic"), TOOL("search_dashboard")];
const CATALOG_SKILLS = [
  { id: "skill_coord", name: SKILL, pluginId: PLUGIN },
  { id: "skill_other", name: "unrelated-skill", pluginId: "other-plugin" },
];

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Emulate the host. `profiles` is the seed list; `/v1/profiles/:id` returns the live copy.
 * A mutating route without the CSRF header is refused 403 (so a helper that forgot to merge `headers()`
 * fails here, not on a live estate).
 */
function createHost({ profiles = [] } = {}) {
  const state = { profiles: structuredClone(profiles), calls: [] };
  const find = (id) => state.profiles.find((p) => p.id === id);

  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = init.headers ?? {};
    const body = init.body ? JSON.parse(init.body) : undefined;
    state.calls.push({ method, path: pathname, headers, body });

    if (pathname === "/v1/auth/login" && method === "POST") {
      const h = new Headers();
      h.append("set-cookie", "nakama_session=session-token; Path=/; HttpOnly");
      h.append("set-cookie", "nakama_csrf=csrf-token; Path=/");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    }
    if (pathname === "/v1/auth/orgs") return json({ orgs: [{ id: ORG, name: ORG_NAME }] });
    if (pathname === "/v1/auth/me") return json({ id: "user_admin" });

    const mutating = method !== "GET";
    if (mutating && (headers["x-csrf-token"] !== "csrf-token" || headers["x-org-id"] !== ORG)) {
      return json({ error: "CSRF token missing or invalid" }, 403);
    }

    if (pathname === "/v1/tools") return json({ tools: CATALOG_TOOLS });
    if (pathname === "/v1/skills") return json({ skills: CATALOG_SKILLS });
    if (pathname === "/v1/profiles") return json({ profiles: state.profiles.map((p) => ({ id: p.id, name: p.name })) });

    let match = pathname.match(/^\/v1\/profiles\/([^/]+)\/tools$/);
    if (match && method === "POST") {
      const profile = find(decodeURIComponent(match[1]));
      if (!profile) return json({ error: "Profile not found" }, 404);
      const tool = CATALOG_TOOLS.find((t) => t.id === body?.toolId);
      if (!tool) return json({ error: "Unknown tool" }, 400);
      profile.tools.push({ id: tool.id, name: tool.name });
      return json({ ok: true });
    }
    match = pathname.match(/^\/v1\/profiles\/([^/]+)\/skills$/);
    if (match && method === "POST") {
      const profile = find(decodeURIComponent(match[1]));
      if (!profile) return json({ error: "Profile not found" }, 404);
      const skill = CATALOG_SKILLS.find((s) => s.id === body?.skillId);
      if (!skill) return json({ error: "Unknown skill" }, 400);
      profile.skills.push({ id: skill.id, name: skill.name });
      return json({ ok: true });
    }
    match = pathname.match(/^\/v1\/profiles\/([^/]+)$/);
    if (match && method === "GET") {
      const profile = find(decodeURIComponent(match[1]));
      return profile ? json({ profile }) : json({ error: "Profile not found" }, 404);
    }
    return json({ error: `unhandled ${method} ${pathname}` }, 404);
  };
  return { fetchImpl, state };
}

const profileSeed = () => ({
  id: "p-readonly",
  name: "Readonly",
  tools: [{ id: "id_get_overview", name: "plugin_research_dashboard__get_overview" }, { id: "builtin_read", name: "read_file" }],
  skills: [],
});

async function loggedIn(host) {
  const auth = createHttpAuth({ base: BASE, email: "admin@example.com", password: "pw", expectedOrgId: ORG, expectedOrgName: ORG_NAME, fetchImpl: host.fetchImpl });
  await auth.login();
  return auth;
}

describe("planAssignments / resolveProfileId (pure)", () => {
  test("only the missing plugin tools and the coordinator skill are planned", () => {
    const plan = planAssignments({
      pluginTools: [{ id: "a", name: "t_a" }, { id: "b", name: "t_b" }],
      skills: [{ id: "s", name: SKILL, pluginId: PLUGIN }, { id: "x", name: "other", pluginId: "nope" }],
      assignedToolNames: ["t_a"],
      assignedSkillNames: [],
      pluginId: PLUGIN,
      skillName: SKILL,
    });
    expect(plan.tools.map((t) => t.name)).toEqual(["t_b"]);
    expect(plan.skills.map((s) => s.name)).toEqual([SKILL]);
  });

  test("no selector is refused; an id outside the org is refused; a name must be unique", () => {
    const list = [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }, { id: "p3", name: "Two" }];
    expect(resolveProfileId(list, {}).reason).toBe("no-selector");
    expect(resolveProfileId(list, { profileId: "missing" }).reason).toBe("unavailable");
    expect(resolveProfileId(list, { profileName: "Two" }).reason).toBe("ambiguous");
    expect(resolveProfileId(list, { profileId: "p1", profileName: "Wrong" }).reason).toBe("conflicting-selector");
    expect(resolveProfileId(list, { profileName: "One" })).toEqual({ ok: true, id: "p1" });
  });
});

describe("runAssignment over the real createHttpAuth", () => {
  test("assigns exactly the missing plugin tools + coordinator, leaves unrelated rows, merges CSRF", async () => {
    const host = createHost({ profiles: [profileSeed()] });
    const auth = await loggedIn(host);
    const result = await runAssignment({ auth, pluginId: PLUGIN, profileId: "p-readonly", skillName: SKILL });

    expect(result.ok).toBe(true);
    expect(result.profileId).toBe("p-readonly");
    expect(result.assigned.tools.sort()).toEqual(["plugin_research_dashboard__get_topic", "plugin_research_dashboard__search_dashboard"].sort());
    expect(result.assigned.skills).toEqual([SKILL]);
    expect(result.skipped.tools).toContain("plugin_research_dashboard__get_overview");

    const profile = host.state.profiles[0];
    expect(profile.tools.map((t) => t.name)).toContain("read_file"); // unrelated row untouched
    expect(profile.tools).toHaveLength(4);
    expect(profile.skills.map((s) => s.name)).toEqual([SKILL]); // only the coordinator, not the other plugin's skill

    const writes = host.state.calls.filter((c) => c.method === "POST" && c.path !== "/v1/auth/login");
    expect(writes.length).toBe(3);
    for (const write of writes) {
      expect(write.headers["x-csrf-token"]).toBe("csrf-token");
      expect(write.headers["x-org-id"]).toBe(ORG);
    }
    expect(host.state.calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("it is idempotent: a second run assigns nothing", async () => {
    const host = createHost({ profiles: [profileSeed()] });
    const auth = await loggedIn(host);
    await runAssignment({ auth, pluginId: PLUGIN, profileId: "p-readonly", skillName: SKILL });
    const again = await runAssignment({ auth, pluginId: PLUGIN, profileId: "p-readonly", skillName: SKILL });
    expect(again.assigned.tools).toEqual([]);
    expect(again.assigned.skills).toEqual([]);
    expect(again.skipped.tools).toContain("plugin_research_dashboard__get_topic");
  });

  test("resolves the profile by name", async () => {
    const host = createHost({ profiles: [profileSeed()] });
    const auth = await loggedIn(host);
    const result = await runAssignment({ auth, pluginId: PLUGIN, profileName: "Readonly", skillName: SKILL });
    expect(result.profileId).toBe("p-readonly");
  });

  test("refuses with no profile selector and with a foreign/absent profile", async () => {
    const host = createHost({ profiles: [profileSeed()] });
    const auth = await loggedIn(host);
    await expect(runAssignment({ auth, pluginId: PLUGIN })).rejects.toThrow(/name the target profile/i);
    await expect(runAssignment({ auth, pluginId: PLUGIN, profileId: "other-org-profile" })).rejects.toThrow(/not in this organization/i);
  });

  test("a registry with no plugin tools fails closed", async () => {
    const host = createHost({ profiles: [profileSeed()] });
    const auth = await loggedIn(host);
    await expect(runAssignment({ auth, pluginId: "absent-plugin", profileId: "p-readonly" })).rejects.toThrow(/no tools for plugin/i);
  });
});
