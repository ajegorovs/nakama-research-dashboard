/**
 * assign-capabilities.mjs — assign the plugin's **exposed agent tools** and its shipped
 * `research-coordinator` skill to ONE explicitly named profile, on ONE explicitly named organization.
 *
 *   bun harness/assign-capabilities.mjs --env-file <env> --org-id <id> [--org-name <name>] \
 *       --profile-id <id> [--profile-name <name>]
 *
 * Why this exists: a reinstall replaces the plugin's tool rows, so the agent's assigned tools vanish and it
 * silently calls nothing (the trap the remote handback records). This puts them back — and only them.
 *
 * Contract — every route and shape is taken from the tree, none invented:
 *
 *   - **Identity**: `createHttpAuth` (`harness/nakama-e2e/driver/http-adapters.mjs`), the tree's own scoped
 *     auth. It requires an explicit organization (`expectedOrgId`) and refuses an ambient one; its `headers()`
 *     supplies the session cookie + `x-csrf-token` + `x-org-id` that every mutating route checks. A write that
 *     forgets to merge `headers()` is a 403 CSRF failure that reads like a permissions problem — so **every**
 *     write here passes `headers: auth.headers()`. (This is the trap the remote handback flags: `request()`
 *     sets only cookies and content-type.)
 *   - **Registry, not a fixed count**: the tool set is read from the live registry — `GET /v1/tools`, filtered
 *     to `pluginId === research-dashboard` — and the skill from `GET /v1/skills` (`name === research-coordinator`).
 *     No tool list and no tool count is hardcoded; the ids come from the registry.
 *   - **Write**: `POST /v1/profiles/<id>/tools {"toolId": "<id>"}` and `POST /v1/profiles/<id>/skills {"skillId": "<id>"}`.
 *   - **Verify**: after every write, `GET /v1/profiles/<id>` is re-read and the exact id must be present.
 *
 * Non-destructive and idempotent: it only ADDS, skips anything already assigned, and never issues a DELETE —
 * unrelated tools and skills already on the profile are left untouched. The target organization and profile
 * MUST be named by the operator; there is no `orgs[0]` and no first-profile guess.
 */
import { createHttpAuth } from "./nakama-e2e/driver/http-adapters.mjs";
import { loadEnvFileArg } from "./env-file.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The profile fields an assignment readback needs, from a `{ profile }` (or bare) payload. */
function profileFromBody(body) {
  const row = body?.profile ?? body;
  if (!row || typeof row !== "object") return null;
  return {
    id: typeof row.id === "string" ? row.id : "",
    name: typeof row.name === "string" ? row.name : "",
    tools: Array.isArray(row.tools) ? row.tools : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
  };
}

/**
 * Resolve the target profile from the org's `/v1/profiles` list. Pure, so it is unit tested.
 * Exactly one of `profileId` / `profileName` (or both, agreeing) must select a single profile.
 *
 * @returns {{ok: true, id: string} | {ok: false, reason: string, message: string}}
 */
export function resolveProfileId(list, { profileId = "", profileName = "" } = {}) {
  const profiles = Array.isArray(list) ? list : [];
  const id = String(profileId ?? "").trim();
  const name = String(profileName ?? "").trim();
  if (!id && !name) {
    return {
      ok: false,
      reason: "no-selector",
      message: "name the target profile explicitly (--profile-id or --profile-name); no ambient profile is guessed",
    };
  }
  if (id) {
    const match = profiles.find((p) => p?.id === id);
    if (!match) return { ok: false, reason: "unavailable", message: `profile ${id} is not in this organization` };
    if (name && match.name !== name) {
      return { ok: false, reason: "conflicting-selector", message: `profile ${id} is named "${match.name}", not "${name}"` };
    }
    return { ok: true, id: match.id };
  }
  const byName = profiles.filter((p) => p?.name === name);
  if (byName.length === 0) return { ok: false, reason: "unavailable", message: `no profile named "${name}" in this organization` };
  if (byName.length > 1) return { ok: false, reason: "ambiguous", message: `${byName.length} profiles are named "${name}"` };
  return { ok: true, id: byName[0].id };
}

/**
 * Which assignments are missing. Pure: given the live registry and the profile's current rows, returns only
 * the plugin tools and the coordinator skill that are not already assigned — the caller assigns exactly these
 * and removes nothing.
 *
 * @returns {{tools: Array<{id:string,name:string}>, skills: Array<{id:string,name:string}>}}
 */
export function planAssignments({ pluginTools = [], skills = [], assignedToolNames = [], assignedSkillNames = [], pluginId = "research-dashboard", skillName = "research-coordinator" } = {}) {
  const haveTools = new Set(assignedToolNames);
  const haveSkills = new Set(assignedSkillNames);
  const tools = pluginTools.filter(
    (t) => t && typeof t.id === "string" && t.id !== "" && !haveTools.has(t.name)
  );
  const coordinator = skills.filter(
    (s) =>
      s &&
      s.name === skillName &&
      (s.pluginId === undefined || s.pluginId === pluginId) &&
      typeof s.id === "string" &&
      s.id !== "" &&
      !haveSkills.has(s.name)
  );
  return { tools, skills: coordinator };
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

/**
 * Run the assignment against a logged-in `auth`. Exported so it is unit tested with an injected fetch.
 *
 * @returns {Promise<{ok: true, profileId: string, assigned: {tools: string[], skills: string[]}, skipped: {tools: string[], skills: string[]}}>}
 * @throws {Error} on a refused selector, a foreign profile, or a write that fails its own readback
 */
export async function runAssignment({ auth, pluginId = "research-dashboard", skillName = "research-coordinator", profileId = "", profileName = "" } = {}) {
  // 1. Enumerate the live registry (never a hardcoded list or count).
  const [toolsBody, skillsBody] = await Promise.all([
    readJson(await auth.request("/v1/tools", { headers: auth.headers() })),
    readJson(await auth.request("/v1/skills", { headers: auth.headers() })),
  ]);
  const pluginTools = (toolsBody.tools ?? []).filter((t) => t?.pluginId === pluginId).map((t) => ({ id: t.id, name: t.name }));
  const skills = (skillsBody.skills ?? []).map((s) => ({ id: s.id, name: s.name, pluginId: s.pluginId }));
  if (pluginTools.length === 0) throw new Error(`the registry exposes no tools for plugin "${pluginId}" — is the plugin enabled in this org?`);

  // 2. Resolve the explicit target profile within this (explicit) org — a named selector must match exactly
  //    one profile that belongs to the org; nothing is guessed.
  const listBody = await readJson(await auth.request("/v1/profiles", { headers: auth.headers() }));
  const list = listBody.profiles ?? listBody;
  const resolved = resolveProfileId(list, { profileId, profileName });
  if (!resolved.ok) throw new Error(resolved.message);
  const targetId = resolved.id;

  // 3. Read the profile's current rows (readback shape).
  const before = profileFromBody(await readJson(await auth.request(`/v1/profiles/${encodeURIComponent(targetId)}`, { headers: auth.headers() })));
  if (!before || before.id !== targetId) throw new Error(`profile ${targetId} was not readable in this organization (foreign-org profile?)`);

  const haveToolNames = before.tools.map((t) => t?.name);
  const haveSkillNames = before.skills.map((s) => s?.name);
  const plan = planAssignments({ pluginTools, skills, assignedToolNames: haveToolNames, assignedSkillNames: haveSkillNames, pluginId, skillName });

  // 4. Write only what is missing, and verify each write against an exact readback.
  const assigned = { tools: [], skills: [] };
  for (const tool of plan.tools) {
    const response = await auth.request(`/v1/profiles/${encodeURIComponent(targetId)}/tools`, { method: "POST", body: { toolId: tool.id }, headers: auth.headers() });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`assigning tool ${tool.name} failed (HTTP ${response.status}); a 403 here usually means the CSRF header was not merged`);
    }
    const back = profileFromBody(await readJson(await auth.request(`/v1/profiles/${encodeURIComponent(targetId)}`, { headers: auth.headers() })));
    if (!back || !back.tools.some((t) => t?.id === tool.id)) throw new Error(`readback did not show tool ${tool.name} (${tool.id}) after the write`);
    assigned.tools.push(tool.name);
  }
  for (const skill of plan.skills) {
    const response = await auth.request(`/v1/profiles/${encodeURIComponent(targetId)}/skills`, { method: "POST", body: { skillId: skill.id }, headers: auth.headers() });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`assigning skill ${skill.name} failed (HTTP ${response.status}); a 403 here usually means the CSRF header was not merged`);
    }
    const back = profileFromBody(await readJson(await auth.request(`/v1/profiles/${encodeURIComponent(targetId)}`, { headers: auth.headers() })));
    if (!back || !back.skills.some((s) => s?.id === skill.id)) throw new Error(`readback did not show skill ${skill.name} (${skill.id}) after the write`);
    assigned.skills.push(skill.name);
  }

  const skipped = {
    tools: pluginTools.filter((t) => haveToolNames.includes(t.name)).map((t) => t.name),
    skills: skills.filter((s) => s.name === skillName && haveSkillNames.includes(s.name)).map((s) => s.name),
  };
  return { ok: true, profileId: targetId, assigned, skipped };
}

const IS_MAIN =
  import.meta.main ??
  (process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false);

if (IS_MAIN) {
  loadEnvFileArg();
  const argv = process.argv;
  const flag = (name) => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const base = (process.env.NAKAMA_URL ?? "").replace(/\/+$/, "");
  const orgId = (flag("--org-id") ?? process.env.NAKAMA_ORG_ID ?? "").trim();
  const orgName = ((flag("--org-name") ?? process.env.NAKAMA_ORG_NAME ?? "").trim()) || null;
  const profileId = (flag("--profile-id") ?? process.env.NAKAMA_PROFILE_ID ?? "").trim();
  const profileName = (flag("--profile-name") ?? process.env.NAKAMA_PROFILE_NAME ?? "").trim();
  const pluginId = flag("--plugin-id") ?? process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
  const allowNonLoopback = argv.includes("--allow-non-loopback");
  const email = process.env.NAKAMA_EMAIL ?? process.env.NAKAMA_DEV_EMAIL ?? "";
  const password = process.env.NAKAMA_PASSWORD ?? process.env.NAKAMA_DEV_PASSWORD ?? "";

  const die = (code, message) => {
    console.error(`assign-capabilities: ${message}`);
    process.exit(code);
  };

  if (!base) die(2, "NAKAMA_URL is not set (pass --env-file, or set the origin)");
  if (!email || !password) die(2, "NAKAMA_EMAIL / NAKAMA_PASSWORD are not set (pass --env-file)");
  if (!orgId) die(2, "an explicit --org-id is required — createHttpAuth refuses an ambient organization");
  if (!profileId && !profileName) die(2, "name the target profile explicitly (--profile-id or --profile-name)");

  const auth = createHttpAuth({ allowNonLoopback, base, email, expectedOrgId: orgId, expectedOrgName: orgName, password });
  try {
    const { orgId: resolvedOrg } = await auth.login();
    const result = await runAssignment({ auth, pluginId, profileId, profileName });
    console.log(JSON.stringify({ org: resolvedOrg, ...result }, null, 2));
  } catch (error) {
    die(1, error?.message ?? String(error));
  }
}
