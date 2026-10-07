/**
 * Which organization does a **mutating** harness helper act on? Answer it explicitly, or fail.
 *
 * `install-plugin.mjs` / `reinstall-plugin.mjs` / `update-plugin.mjs` all log in, read `/v1/auth/orgs`, and
 * then send an `x-org-id` header. The historical code took `orgs[0]`. On a **multi-org** account that is the
 * wrong organization often enough to be a mis-deployment trap: on this estate `orgs[0]` is the Layout Demo
 * organization, not the fixture, so a reinstall rebound Layout Demo to a fixture build (see the stage report
 * §6). The fix is a single, tested resolution used by every caller: a named organization (`--org-id` /
 * `--org-name`, or `NAKAMA_ORG_ID` / `NAKAMA_ORG_NAME`) is honoured and must exist on the authenticated
 * account; with no name, a **single-org** account falls back to its only organization (the legacy behaviour,
 * said out loud), and a multi-org account is refused rather than guessed.
 *
 * Resolution is a pure function over the `/v1/auth/orgs` payload, so the guard is testable without a live
 * instance, and it runs **before any mutating request** — a refusal performs no install/reinstall call.
 */

/** Read the org selector from argv + env. A `--org-id`/`--org-name` flag wins over its env variable. */
export function parseOrgSelector(argv = process.argv, env = process.env) {
  const flag = (name) => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    orgId: (flag("--org-id") ?? env.NAKAMA_ORG_ID ?? "").trim(),
    orgName: (flag("--org-name") ?? env.NAKAMA_ORG_NAME ?? "").trim(),
  };
}

/**
 * Resolve the target org id against the account's org list.
 *
 * @param {Array<{id?: string, name?: string}>} orgs the `/v1/auth/orgs` `orgs` array
 * @param {{orgId?: string, orgName?: string}} [selector]
 * @returns {{ok: true, id: string, name: string|undefined, matchedBy: string}
 *          | {ok: false, reason: string, message: string}}
 */
export function selectOrgId(orgs, selector = {}) {
  const list = Array.isArray(orgs) ? orgs : [];
  const id = String(selector.orgId ?? "").trim();
  const name = String(selector.orgName ?? "").trim();

  if (id && name) {
    const byId = list.find((org) => org.id === id);
    const byName = list.filter((org) => org.name === name);
    if (!byId || byName.length !== 1 || byName[0].id !== byId.id) {
      return {
        ok: false,
        reason: "conflicting-selector",
        message: `--org-id ${id} and --org-name ${name} do not name the same organization on this account`,
      };
    }
    return { ok: true, id: byId.id, name: byId.name, matchedBy: "id+name" };
  }

  if (id) {
    const match = list.find((org) => org.id === id);
    if (!match) {
      return {
        ok: false,
        reason: "unavailable",
        message:
          `no organization with id ${id} on this account — it may belong to another account, ` +
          `or not be available to this credential`,
      };
    }
    return { ok: true, id: match.id, name: match.name, matchedBy: "id" };
  }

  if (name) {
    const matches = list.filter((org) => org.name === name);
    if (matches.length === 0) {
      return {
        ok: false,
        reason: "unavailable",
        message: `no organization named ${name} on this account`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        reason: "ambiguous-name",
        message: `${matches.length} organizations are named ${name} — select one with --org-id`,
      };
    }
    return { ok: true, id: matches[0].id, name: matches[0].name, matchedBy: "name" };
  }

  if (list.length === 0) {
    return { ok: false, reason: "no-org", message: "no organization on this account" };
  }
  if (list.length === 1) {
    return { ok: true, id: list[0].id, name: list[0].name, matchedBy: "single-org" };
  }
  return {
    ok: false,
    reason: "ambiguous",
    message:
      `this account has ${list.length} organizations — pass --org-id (or set NAKAMA_ORG_ID) to name the ` +
      `one to act on; refusing to guess`,
  };
}
