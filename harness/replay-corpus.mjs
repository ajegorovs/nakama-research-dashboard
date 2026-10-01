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
  return { body: parsed, status: response.status, retryAfter: response.headers.get("retry-after") };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Nakama's newer releases rate-limit the action endpoint: a 695-call replay at ~11/s trips it around
// call 600 with `429 Too many requests`, which is a property of the instance, not of the transcript.
// A 429 (or a 503) is therefore retried with backoff — and the failure is *not* reported as "the
// dataset is not this transcript", which is what it would look like without this.
const postAction = async (path, body, headers, attempts = 6) => {
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await call(path, body, headers);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(Math.min(250 * 2 ** attempt, 4000));
      continue;
    }
    if ((response.status !== 429 && response.status !== 503) || attempt >= attempts) {
      return response;
    }
    const header = Number(response.retryAfter);
    const wait = Number.isFinite(header) && header > 0
      ? header * 1000
      : Math.min(500 * 2 ** attempt, 15_000);
    console.log(
      `  HTTP ${response.status} at attempt ${attempt} (rate limit) — waiting ${(wait / 1000).toFixed(1)}s`
    );
    await sleep(wait);
  }
};

const rows = readFileSync(TRANSCRIPT, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line))
  .slice(START, LIMIT > 0 ? START + LIMIT : undefined);

const first = rows.find((row) => row.action === "reconcile_topic");
const topicName = first?.input?.topicName ?? "UDV Echo Process";

// Every event in this transcript is read from one public repository's own history, and each event's own
// `sourceUrl` names that repository. `record_activity` has a field for it, so the replayer *derives* the
// link rather than leaving the corpus's provenance unstated — this is not new data: the event is from that
// repository (the axes declare the same one). The count is printed so the derivation is visible in the
// replay's own output instead of being assumed.
const repositoryOfSource = (url) => {
  const found =
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/(?:commit|pull)\//.exec(url ?? "");
  return found ? found[1] : null;
};
let derivedRepositories = 0;
for (const row of rows) {
  if (row.action !== "record_activity") continue;
  const fullName = repositoryOfSource(row.input?.sourceUrl);
  if (fullName) {
    row.input.repositoryFullName = fullName;
    derivedRepositories += 1;
  }
}

// ---------------------------------------------------------------- problems, derived from the same material
// The corpus's pull requests that never merged are the repository's own open work: two are OPEN in the PR's own
// status ("PR #70 (open)"), and one is a design review the repository CLOSED without merging — read as
// *resolved* by explicit inference, which is this corpus's documented habit for a state the material does not
// state outright ("the axis states are the repository's own statements or an explicit inference").
// Nothing here is hand-typed: the statement is the PR's own subject line, the axis is the axis the corpus
// already assigned that PR, and the repository is the PR's own. Merged PRs are finished work, not problems.
// The three events move to the topic write path (record_activity's schema has no problemId; reconcile_topic's
// activities do), so each stays ONE row while also carrying its problem.
const PR_REF = /^PR #(\d+)\s*\(([^)]+)\)$/;
const derivedProblems = [];
const linkedActivities = [];
for (const row of rows) {
  if (row.action !== "record_activity" || row.input?.sourceType !== "github_pr") continue;
  const ref = PR_REF.exec(row.input.sourceRef ?? "");
  if (!ref) continue;
  const status = ref[2];
  if (!/^(open|closed)/i.test(status)) continue;
  const repositoryFullName = repositoryOfSource(row.input.sourceUrl);
  const resolved = /^closed/i.test(status);
  const statement = `${row.input.summary} (${row.input.sourceRef})`;
  derivedProblems.push({
    statement,
    axisTitle: row.input.axisTitle,
    state: resolved ? "resolved" : "open",
    stateConfidence: resolved ? "inferred" : "confirmed",
    ...(repositoryFullName ? { repositoryFullNames: [repositoryFullName] } : {})
  });
  linkedActivities.push({
    statement,
    summary: row.input.summary,
    sourceType: row.input.sourceType,
    sourceRef: row.input.sourceRef,
    sourceUrl: row.input.sourceUrl,
    occurredAt: row.input.occurredAt,
    axisTitle: row.input.axisTitle,
    ...(repositoryFullName ? { repositoryFullName } : {})
  });
  row.movedToProblem = true;
}

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
  `replay-corpus: ${BASE} · org ${orgId} · acting as ${actorId} · ${rows.length} calls from ${TRANSCRIPT} · ` +
    `${derivedRepositories} event(s) take their repository from their own sourceUrl`
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
  // The unmerged PRs are recorded through the derived call below instead, where their problem link exists.
  if (row.movedToProblem) continue;
  const input = { ...row.input };
  if (input.people) {
    input.people = input.people.map((person) => ({ ...person, nakamaUserId: actorId }));
  }
  const { body, status } = await postAction(
    `/v1/plugins/${PLUGIN_ID}/actions/${row.action}`,
    { input },
    headers
  );
  const result = body?.result ?? body;
  if (status !== 200 || result?.ok !== true) {
    failures += 1;
    console.error(
      `\nFAILED  call ${START + index + 1} of ${rows.length} (${row.action}): HTTP ${status} ` +
        `${JSON.stringify(result).slice(0, 400)}\n  input: ${JSON.stringify(input).slice(0, 600)}` +
        `\n  the calls before this one were accepted, so resume with:` +
        `\n    bun harness/replay-corpus.mjs --force --start ${START + index}`
    );
    break;
  }
  if ((index + 1) % 100 === 0 || index + 1 === rows.length) {
    console.log(`  ${index + 1}/${rows.length} calls accepted`);
  }
}
// The two derived calls: the problems first (the store assigns their ids), then the events that name them.
// The ids are read back from the projection and matched on the statement — the PR's own subject line — so
// this is a derivation the instance confirms rather than an id the seed pretends to know.
let problemsSeeded = 0;
let eventsLinked = 0;
if (failures === 0 && derivedProblems.length > 0) {
  const problemsCall = await postAction(
    `/v1/plugins/${PLUGIN_ID}/actions/reconcile_topic`,
    { input: { topicName, problems: derivedProblems } },
    headers
  );
  if (problemsCall.status !== 200 || (problemsCall.body?.result ?? problemsCall.body)?.ok !== true) {
    failures += 1;
    console.error(
      `\nFAILED  the problems derived from this corpus's own unmerged pull requests: HTTP ${problemsCall.status} ` +
        `${JSON.stringify(problemsCall.body).slice(0, 400)}`
    );
  } else {
    problemsSeeded = derivedProblems.length;
    const read = await postAction(
      `/v1/plugins/${PLUGIN_ID}/actions/get_progress`,
      { input: {} },
      headers
    );
    const created = read.body?.result?.problems?.problems ?? [];
    const activities = linkedActivities.map(({ statement, ...activity }) => {
      const match = created.find((problem) => problem.statement === statement);
      return match ? { ...activity, problemId: match.id } : null;
    });
    const unlinked = activities.filter((row) => row === null).length;
    if (unlinked > 0) {
      failures += 1;
      console.error(
        `\nFAILED  ${unlinked} of the ${activities.length} derived problem event(s) found no problem to name — ` +
          "the projection did not return a problem with the statement the pull request carries."
      );
    } else {
      const activitiesCall = await postAction(
        `/v1/plugins/${PLUGIN_ID}/actions/reconcile_topic`,
        { input: { topicName, activities } },
        headers
      );
      if (activitiesCall.status !== 200 || (activitiesCall.body?.result ?? activitiesCall.body)?.ok !== true) {
        failures += 1;
        console.error(
          `\nFAILED  the events that name those problems: HTTP ${activitiesCall.status} ` +
            `${JSON.stringify(activitiesCall.body).slice(0, 400)}`
        );
      } else {
        eventsLinked = activities.length;
      }
    }
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (failures > 0) {
  console.error(`replay-corpus: refused — the dataset is NOT this transcript (${seconds}s)`);
  process.exit(1);
}
console.log(
  `replay-corpus: all ${rows.length} calls accepted in ${seconds}s — the corpus is seeded; ` +
    `run 'bun run harness:read' to check it.` +
    (problemsSeeded > 0
      ? `\nreplay-corpus: derived ${problemsSeeded} problem(s) from this corpus's own unmerged pull requests, ` +
        `and ${eventsLinked} event(s) now name theirs.`
      : "")
);
