/**
 * Install and enable this plugin on a running instance, and say what state it ended in.
 *
 *   bun harness/install-plugin.mjs --env-file /tmp/nakama-review.env
 *
 * The README used to name the two endpoints and leave the rest to the reader: the call needs a session
 * cookie, the `nakama_csrf` cookie echoed in `x-csrf-token`, and an `x-org-id` header — and the catalog
 * check is the one that fails first, because a checkout without the `OFFICIAL_PLUGINS` entry
 * (`vendor/vendor-into-nakama.sh`) simply does not list the plugin. This does all of that and exits
 * non-zero when the instance refuses.
 *
 * Idempotent: on an instance where it is already installed it only reports the state. That default is
 * deliberate — an acceptance run must not change the build it is measuring — so refreshing a *review*
 * instance onto the vendored build is an explicit act: pass `--reinstall`.
 *
 *   bun harness/install-plugin.mjs --env-file <env> --reinstall
 *
 * `--reinstall` calls the official-plugin reinstall endpoint, which reloads the bundled copy from the
 * checkout while preserving organization data, and prints the version/revision before and after. Use it
 * when a long-running instance is serving a build older than the checkout (a plugin is installed *into*
 * the instance's config dir; restarting the server reloads that copy, not the checkout).
 */
import { loadEnvFileArg } from "./env-file.mjs";

loadEnvFileArg();

const BASE = (process.env.NAKAMA_URL ?? "http://127.0.0.1:4399").replace(/\/+$/, "");
/** Opt-in: refresh an existing install onto the vendored build (see the header). */
const REINSTALL = process.argv.includes("--reinstall");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const EMAIL = process.env.NAKAMA_EMAIL ?? process.env.NAKAMA_DEV_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_PASSWORD ?? process.env.NAKAMA_DEV_PASSWORD ?? "";

if (!EMAIL || !PASSWORD) {
  console.error("install-plugin: NAKAMA_EMAIL / NAKAMA_PASSWORD are not set (or pass --env-file)");
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
      `install-plugin: cannot reach ${BASE} (${error?.cause?.code ?? error.message}) — is the instance running?`
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
  console.error(`install-plugin: login failed (HTTP ${login.status}) at ${BASE}`);
  process.exit(2);
}
const csrf = jar.get("nakama_csrf");
if (!csrf) {
  console.error("install-plugin: no nakama_csrf cookie after login");
  process.exit(2);
}
// /v1/auth/orgs must be called without x-org-id; everything else needs it.
const orgs = await call("/v1/auth/orgs");
const orgId = orgs.body?.orgs?.[0]?.id;
if (!orgId) {
  console.error("install-plugin: no organization on this account");
  process.exit(2);
}
const headers = { "x-csrf-token": csrf, "x-org-id": orgId };

const catalog = await call("/v1/plugins/official", undefined, headers);
const listed = (catalog.body?.plugins ?? []).some((plugin) => plugin.id === PLUGIN_ID);
if (!listed) {
  console.error(
    `install-plugin: '${PLUGIN_ID}' is NOT in this instance's official catalog — the checkout is missing\n` +
      "the bundled entry. Run vendor/vendor-into-nakama.sh against it and restart the server."
  );
  process.exit(1);
}
console.log(`install-plugin: '${PLUGIN_ID}' is in the official catalog`);

const before = await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers);
let detail = before.body ?? {};
if (detail.installed !== true) {
  const install = await call(`/v1/plugins/official/${PLUGIN_ID}/install`, {}, headers);
  const state = install.body?.install?.lifecycleState;
  if (install.status !== 200 || !state) {
    console.error(
      `install-plugin: install refused (HTTP ${install.status}) ${JSON.stringify(install.body).slice(0, 300)}`
    );
    process.exit(1);
  }
  console.log(`install-plugin: installed — lifecycleState ${state}`);
  detail = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
} else {
  console.log("install-plugin: already installed on this instance");
}

// Enabling is a separate call, and it is the step that actually creates the organization data store — an
// installed-but-disabled plugin serves no page. Doing it here is what makes this script live up to its name
// and to the clean-instance recipe: on a fresh instance, `install` alone leaves the plugin disabled.
if (detail.lifecycleState !== "enabled") {
  // The lifecycle endpoints are revision-guarded: enabling without naming the revision you read is refused
  // with `stale_revision`, which is the same optimistic-concurrency rule the action surface uses.
  const body = detail.revision === undefined ? {} : { expectedRevision: detail.revision };
  const enable = await call(`/v1/plugins/${PLUGIN_ID}/enable`, body, headers);
  const state = enable.body?.lifecycleState ?? enable.body?.enable?.lifecycleState;
  if (enable.status !== 200 || !state) {
    console.error(
      `install-plugin: enable refused (HTTP ${enable.status}) ${JSON.stringify(enable.body).slice(0, 300)}`
    );
    process.exit(1);
  }
  console.log(`install-plugin: enabled — lifecycleState ${state}`);
  detail = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
}

if (REINSTALL && detail.selectedVersion !== undefined) {
  const beforeVersion = detail.selectedVersion;
  const beforeRevision = detail.revision;
  const reload = await call(
    `/v1/plugins/official/${PLUGIN_ID}/reinstall`,
    { expectedRevision: beforeRevision },
    headers
  );
  if (reload.status !== 200) {
    console.error(
      `install-plugin: reinstall refused (HTTP ${reload.status}) ${JSON.stringify(reload.body).slice(0, 300)}`
    );
    process.exit(1);
  }
  detail = (await call(`/v1/plugins/${PLUGIN_ID}`, undefined, headers)).body ?? {};
  console.log(
    `install-plugin: reinstalled — version ${beforeVersion} -> ${detail.selectedVersion ?? "?"}, ` +
      `revision ${beforeRevision} -> ${detail.revision ?? "?"}`
  );
}

console.log(
  `install-plugin: installed=${detail.installed} lifecycleState=${detail.lifecycleState} ` +
    `version=${detail.selectedVersion ?? "?"} revision=${detail.revision ?? "?"}`
);
if (detail.lifecycleState !== "enabled") {
  console.error(
    `install-plugin: lifecycleState is '${detail.lifecycleState}', not 'enabled' — the page will not load`
  );
  process.exit(1);
}
