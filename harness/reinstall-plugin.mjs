/**
 * Mint a fresh `+dev.<digest>` release from the vendored checkout and serve it on a running instance.
 *
 *   bun harness/reinstall-plugin.mjs --env-file /tmp/nakama-review.env --org-id org_...
 *
 * The target organization is named explicitly (`--org-id` / `--org-name`, or `NAKAMA_ORG_ID` /
 * `NAKAMA_ORG_NAME`): the historical `orgs[0]` default silently rebound the wrong organization on a
 * multi-org account. A single-org account still falls back to its only organization; a multi-org account
 * without an explicit selector is refused **before** any reinstall is sent (see `org-selection.mjs`).
 *
 * The loop after a plugin source change is **rebuild → vendor → reinstall**, and only the last step makes the
 * instance serve the new bytes: the server reads the plugin from `<checkout>/packages/plugins/<id>`, and a
 * reinstall snapshots whatever is there as an immutable release for the active org (unchanged bytes reuse the
 * existing release, which is why a no-op rebuild looks like "nothing happened"). Without this the pass keeps
 * measuring the previous release — and a *fresh install* is not a substitute, because it publishes the
 * packaged version (`0.2.0`) instead of a digest of the tree you just built.
 *
 * The call is revision-guarded, like enable: name the revision you read or be refused `stale_revision`.
 * Prints the resulting version/revision so a transcript can quote the release the checks ran against.
 */
import { loadEnvFileArg } from "./env-file.mjs";
import { parseOrgSelector, selectOrgId } from "./org-selection.mjs";

loadEnvFileArg();

const BASE = (process.env.NAKAMA_URL ?? "http://127.0.0.1:4399").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const EMAIL = process.env.NAKAMA_EMAIL ?? process.env.NAKAMA_DEV_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_PASSWORD ?? process.env.NAKAMA_DEV_PASSWORD ?? "";

if (!EMAIL || !PASSWORD) {
  console.error("reinstall-plugin: NAKAMA_EMAIL / NAKAMA_PASSWORD are not set (or pass --env-file)");
  process.exit(2);
}

const jar = new Map();
const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

const call = async (path, body, headers = {}) => {
  let response;
  try {
    response = await fetch(BASE + path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(jar.size === 0 ? {} : { cookie: cookieHeader() }),
        ...headers,
      },
      method: body === undefined ? "GET" : "POST",
    });
  } catch (error) {
    console.error(
      `reinstall-plugin: cannot reach ${BASE} (${error?.cause?.code ?? error.message}) — is the instance running?`
    );
    process.exit(2);
  }
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const split = pair.indexOf("=");
    if (split > 0) {
      jar.set(pair.slice(0, split).trim(), pair.slice(split + 1));
    }
  }
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text || "{}");
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  return { body: parsed, status: response.status };
};

const login = await call("/v1/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 200) {
  console.error(`reinstall-plugin: login failed (HTTP ${login.status}) at ${BASE}`);
  process.exit(2);
}
const csrf = jar.get("nakama_csrf");
if (!csrf) {
  console.error("reinstall-plugin: no nakama_csrf cookie after login");
  process.exit(2);
}
// /v1/auth/orgs must be called without x-org-id; everything else needs it.
const orgs = await call("/v1/auth/orgs");
// Resolve the target organization explicitly, and refuse before any mutating request: the historical
// `orgs[0]` default rebound the wrong organization on a multi-org account.
const selection = selectOrgId(orgs.body?.orgs, parseOrgSelector());
if (!selection.ok) {
  console.error(`reinstall-plugin: ${selection.message}`);
  process.exit(2);
}
const orgId = selection.id;
console.log(
  `reinstall-plugin: target organization ${orgId}` +
    (selection.name ? ` (${selection.name})` : "") +
    `, matched by ${selection.matchedBy}`
);
const headers = { "x-csrf-token": csrf, "x-org-id": orgId };

const before = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
if (before.installed !== true) {
  console.error(
    `reinstall-plugin: '${PLUGIN_ID}' is not installed on this instance — run harness/install-plugin.mjs first`
  );
  process.exit(1);
}
const previousVersion = before.selectedVersion ?? "?";
if (before.revision === undefined) {
  console.error("reinstall-plugin: the plugin detail carries no revision — cannot reinstall safely");
  process.exit(1);
}

const reinstall = await call(
  `/v1/plugins/official/${PLUGIN_ID}/reinstall`,
  { expectedRevision: before.revision },
  headers
);
if (reinstall.status !== 200) {
  console.error(
    `reinstall-plugin: reinstall refused (HTTP ${reinstall.status}) ${JSON.stringify(reinstall.body).slice(0, 300)}`
  );
  process.exit(1);
}

const after = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
const version = after.selectedVersion ?? "?";
console.log(
  `reinstall-plugin: ${previousVersion} -> ${version} ` +
    `(revision ${after.revision ?? "?"}, lifecycleState ${after.lifecycleState ?? "?"})`
);
if (previousVersion === version) {
  // Not an error — vendoring an unchanged tree reuses the release on purpose — but it is the signal that
  // the checks about to run are measuring the *previous* build, so say it out loud.
  console.log(
    `reinstall-plugin: NOTE the version did not change — the vendored bytes are identical to the release ` +
      `already installed, so any pass run now still measures ${version}`
  );
}
if (after.lifecycleState !== "enabled") {
  console.error(
    `reinstall-plugin: lifecycleState is '${after.lifecycleState}', not 'enabled' — the page will not load`
  );
  process.exit(1);
}
