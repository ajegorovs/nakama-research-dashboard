/**
 * Seed the corpus dataset from the committed transcript — the same 695 calls the dashboard's corpus
 * was built from, replayed through the plugin's own action surface.
 *
 *   bun harness/replay-corpus.mjs --env-file ../compose/nakama.env
 *   bun harness/replay-corpus.mjs --base http://127.0.0.1:4399 --limit 20   # a probe run
 *   bun harness/replay-corpus.mjs --force                                   # onto an instance that has it
 *
 * Why a replay rather than a dump: the transcript IS the corpus record (docs/corpus/README.md) — every
 * row reached the database through an action call, so re-running the calls reproduces the dataset
 * without shipping a SQLite file, and a refused call fails loudly here instead of silently seeding less.
 *
 * Attribution: the transcript names the contributor's platform account (`nakamaUserId`). A fresh
 * instance mints its own admin id, so each call's person link is rewritten to the id of the account
 * this replay logs in as — otherwise the dataset's attribution would depend on which instance made it.
 *
 * The two datasets must not be mixed: apply this to a fresh instance (or a fresh data root), and use a
 * second one for the layout fixture (`harness/apply-layout-fixture.mjs`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFileArg } from "./env-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// --env-file first, so a value there can be overridden by an explicit flag below.
const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) {
    const inline = argv.find((value) => value.startsWith(`--${name}=`));
    return inline === undefined ? fallback : inline.slice(name.length + 3);
  }
  return argv[index + 1] ?? fallback;
};
loadEnvFileArg();

const BASE = (flag("base", process.env.NAKAMA_URL ?? "http://127.0.0.1:4399")).replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const EMAIL = process.env.NAKAMA_EMAIL ?? process.env.NAKAMA_DEV_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_PASSWORD ?? process.env.NAKAMA_DEV_PASSWORD ?? "";
const TRANSCRIPT = resolve(
  flag("transcript", `${HERE}/../docs/corpus/transcript/actions.jsonl`)
);
const LIMIT = Number(flag("limit", "0")) || 0;
const START = Number(flag("start", "0")) || 0;
const FORCE = argv.includes("--force");
const ACTOR_ID = flag("user-id", "");

if (!EMAIL || !PASSWORD) {
  console.error("replay-corpus: NAKAMA_EMAIL / NAKAMA_PASSWORD are not set (or pass --env-file)");
  process.exit(2);
}

const jar = new Map();
const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

const call = async (path, body, headers = {}) => {
  const response = await fetch(BASE + path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(jar.size === 0 ? {} : { cookie: cookieHeader() }),
      ...headers,
    },
    method: body === undefined ? "GET" : "POST",
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
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

const rows = readFileSync(TRANSCRIPT, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line))
  .slice(START, LIMIT > 0 ? START + LIMIT : undefined);

const first = rows.find((row) => row.action === "reconcile_topic");
const topicName = first?.input?.topicName ?? "UDV Echo Process";

let login;
try {
  login = await call("/v1/auth/login", { email: EMAIL, password: PASSWORD });
} catch (error) {
  console.error(
    `replay-corpus: cannot reach ${BASE} (${error?.cause?.code ?? error.message}) — ` +
      "is the instance running, and is NAKAMA_URL right?"
  );
  process.exit(2);
}
if (login.status !== 200) {
  console.error(`replay-corpus: login failed (HTTP ${login.status}) at ${BASE}`);
  process.exit(2);
}
const csrf = jar.get("nakama_csrf");
if (!csrf) {
  console.error("replay-corpus: no nakama_csrf cookie after login");
  process.exit(2);
}
// /v1/auth/orgs must be called without x-org-id; everything else needs it.
const orgs = await call("/v1/auth/orgs");
const orgId = orgs.body?.orgs?.[0]?.id;
if (!orgId) {
  console.error("replay-corpus: no organization on this account");
  process.exit(2);
}
const me = await call("/v1/auth/me");
const actorId = ACTOR_ID || me.body?.id || "";
if (!actorId) {
  console.error("replay-corpus: could not read the logged-in user id (/v1/auth/me) — pass --user-id");
  process.exit(2);
}
console.log(
  `replay-corpus: ${BASE} · org ${orgId} · acting as ${actorId} · ${rows.length} calls from ${TRANSCRIPT}`
);

const headers = { "x-csrf-token": csrf, "x-org-id": orgId };
// The guard must fail CLOSED: a guard that cannot read its subject looks exactly like "nothing here
// yet", and the cost of that mistake is a second copy of the corpus (695 duplicated calls).
const existing = await call(`/v1/plugins/${PLUGIN_ID}/actions/list_topics`, { input: {} }, headers);
const topics = existing.body?.result?.topics;
if (existing.status !== 200 || !Array.isArray(topics)) {
  console.error(
    `replay-corpus: could not list this instance's topics (HTTP ${existing.status}) — the already-seeded\n` +
      "guard cannot run, so this refuses rather than risking a second copy of the dataset."
  );
  process.exit(2);
}
const clash = topics.find(
  (topic) => String(topic.name ?? "").toLowerCase() === topicName.toLowerCase()
);
if (clash && !FORCE) {
  console.error(
    `replay-corpus: '${topicName}' already exists on this instance (${clash.id}) — refusing to seed a\n` +
      "second copy. Use a fresh instance/data root, or pass --force if you mean it."
  );
  process.exit(2);
}

const started = Date.now();
let failures = 0;
for (const [index, row] of rows.entries()) {
  const input = { ...row.input };
  if (input.people) {
    input.people = input.people.map((person) => ({ ...person, nakamaUserId: actorId }));
  }
  const { body, status } = await call(
    `/v1/plugins/${PLUGIN_ID}/actions/${row.action}`,
    { input },
    headers
  );
  const result = body?.result ?? body;
  if (status !== 200 || result?.ok !== true) {
    failures += 1;
    console.error(
      `\nFAILED  call ${START + index + 1} of ${rows.length} (${row.action}): HTTP ${status} ` +
        `${JSON.stringify(result).slice(0, 400)}\n  input: ${JSON.stringify(input).slice(0, 600)}`
    );
    break;
  }
  if ((index + 1) % 100 === 0 || index + 1 === rows.length) {
    console.log(`  ${index + 1}/${rows.length} calls accepted`);
  }
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (failures > 0) {
  console.error(`replay-corpus: refused — the dataset is NOT this transcript (${seconds}s)`);
  process.exit(1);
}
console.log(
  `replay-corpus: all ${rows.length} calls accepted in ${seconds}s — the corpus is seeded; ` +
    `run 'bun run harness:read' to check it.`
);
