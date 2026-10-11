#!/usr/bin/env bun
/**
 * seed-synthetic.mjs — write the labelled synthetic cases for an isolated served acceptance run.
 *
 * STEP O4 of `run.mjs`. It writes through the product's OWN write path (`reconcile_topic` +
 * `record_activity`) over the documented direct-HTTP action route — never SQL, never a harness seeder
 * table. Every node it writes carries the literal `[synthetics]` label so the dataset is
 * self-identifying and can never be mistaken for real research.
 *
 * The seeder is IDEMPOTENT: `reconcile_topic` upserts by name/title (the topic, its axes, its
 * repositories and its people are reconciled, not appended), and the activity pass reads the topic's
 * existing `sourceRef` set back first and records only the events whose ref is missing. Re-running it
 * against a populated throwaway therefore changes nothing — it can never duplicate events or links.
 *
 * Transport (per .agents/skills/research-fixture-authoring): log in for a session cookie; echo the
 * `nakama_csrf` cookie in `x-csrf-token`; select the organization EXPLICITLY with `x-org-id` (never
 * `orgs[0]`); the action response is `{ invocationId, result }` and the domain payload is under `result`.
 *
 *   bun harness/canonical-served/seed-synthetic.mjs --env-file <served.env> [--org-id <id>]
 *
 * The exact field acceptance is confirmed on every run by the readback at the end (counts + the people
 * rollup). Credential values are read from the env file and are never printed.
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};

const ENV_FILE = flag("env-file", "");
if (!ENV_FILE) {
  console.error("seed-synthetic: --env-file <path> is required");
  process.exit(2);
}
const env = {};
for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = (env.NAKAMA_URL ?? "http://127.0.0.1:4401").replace(/\/+$/, "");
const PLUGIN_ID = env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const LABEL = "[synthetics]";

const jar = new Map();
const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(jar.size === 0 ? {} : { cookie: cookieHeader() }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
  }
  const text = await res.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text || "{}");
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  return { body: parsed, status: res.status };
};

const action = async (name, input, headers) => {
  const res = await call("POST", `/v1/plugins/${PLUGIN_ID}/actions/${name}`, { input }, headers);
  if (res.status !== 200) throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  const result = res.body?.result ?? res.body;
  if (result?.ok === false) throw new Error(`${name}: ok=false ${JSON.stringify(result).slice(0, 300)}`);
  return result;
};

// ── log in, take the CSRF cookie, resolve the organization explicitly ──────────────────────────────
const login = await call("POST", "/v1/auth/login", {
  email: env.NAKAMA_EMAIL ?? env.NAKAMA_DEV_EMAIL,
  password: env.NAKAMA_PASSWORD ?? env.NAKAMA_DEV_PASSWORD,
});
if (login.status !== 200) {
  console.error(`seed-synthetic: login failed (HTTP ${login.status})`);
  process.exit(2);
}
const csrf = jar.get("nakama_csrf");
if (!csrf) {
  console.error("seed-synthetic: no nakama_csrf cookie after login");
  process.exit(2);
}
const actorId = login.body?.user?.id ?? login.body?.id ?? null;

const orgs = await call("GET", "/v1/auth/orgs");
const wanted = flag("org-id", "");
const wantedName = env.NAKAMA_SEED_ORG_NAME ?? "";
const list = orgs.body?.orgs ?? [];
const org = wanted
  ? list.find((o) => o.id === wanted)
  : list.find((o) => (o.name ?? "") === wantedName);
if (!org) {
  console.error(
    `seed-synthetic: no target organization (wanted id=${JSON.stringify(wanted)} name=${JSON.stringify(wantedName)}); ` +
      "refusing to fall back to orgs[0]"
  );
  process.exit(2);
}
console.log(`seed-synthetic: target organization ${org.id}${org.name ? ` (${org.name})` : ""} — matched explicitly`);
const headers = { "x-csrf-token": csrf, "x-org-id": org.id };

// ── the labelled synthetic cases ───────────────────────────────────────────────────────────────────
// The four-tab verify-page reads: two workstreams with their OWN people links, a plan with stored
// positions 1,2,3,4,0,null, one open + one blocked + one resolved problem (R2's split AND the resolved
// history), TWO repositories (each with attributable activity), and TWO people mapped to accounts with a
// multi-page activity list (>=12 events, pageSize 5 → >=3 pages). PERSON is on both workstreams; PERSON2
// is on Workstream Two only, so a per-person scope transition has a subject.
const REPO = `${LABEL} synthetics/served-validation`;
const REPO2 = `${LABEL} synthetics/secondary-repo`;
const PERSON = `${LABEL} Synthetics Actor`;
const PERSON2 = `${LABEL} Second Actor`;
const WS_ONE = `${LABEL} Workstream One`;
const WS_TWO = `${LABEL} Workstream Two`;
// Next-risk-batch subjects (all synthetic, product write path only): a blocked workstream (axis-level
// blocker text — the retired "blocked axis shows its blocker text" subject's current counterpart), an
// axis whose plan carries NO positions at all (the all-or-nothing unordered subject), and an axis that
// states no progress at all (the "states no progress carries no confidence" subject).
const WS_BLOCKED = `${LABEL} Blocked Workstream`;
const WS_UNORDERED = `${LABEL} Unordered Workstream`;
const WS_BARE = `${LABEL} No-Progress Workstream`;
const WS_DONE = `${LABEL} Completed Workstream`;
// The stated-reading, evidence-free axis (requirement #18 independence half).
const WS_STATED = `${LABEL} Stated Reading Workstream`;
// The supported-confirmed axis (the negative control: a claim with evidence MAY read `confirmed`).
const WS_CONFIRMED = `${LABEL} Confirmed Workstream`;
// The default-confirmed, evidence-free axis (the regression subject for #18's semantics correction): it names
// NO state field, so nothing is asserted and the column's own `confirmed` default stands, with no evidence.
const WS_DEFAULT_CONFIRMED = `${LABEL} Default-Confirmed Workstream`;
// The BARE repository (subject of requirements #60 + #61): registered ONLY through
// `record_activity.repositoryFullName`, never named in a `reconcile_topic.repositories[]` list and never
// referenced by any axis. `record_activity` upserts the repository row without touching `topic_repositories`
// or `axis_repositories`, so the rollup renders it with `topics: []` and `axes: []` — the true bare case.
const BARE_REPO = `${LABEL} bare/empty-current`;
const person = (displayName, role) => ({
  displayName,
  role,
  nakamaUserId: displayName === PERSON ? actorId ?? "synthetics-actor" : "synthetics-actor-2",
});
const topicInput = {
  topicName: `${LABEL} Canonical Served Validation`,
  topic: {
    name: `${LABEL} Canonical Served Validation`,
    description: `${LABEL} A throwaway served fixture for the canonical four-tab acceptance pass.`,
    status: "active",
    summary: `${LABEL} Synthetic topic; every node in this dataset carries the [synthetics] label.`,
  },
  repositories: [
    { fullName: REPO, relationship: "primary", defaultBranch: "main" },
    { fullName: REPO2, relationship: "supporting", defaultBranch: "main" },
  ],
  people: [person(PERSON, "fixture"), person(PERSON2, "fixture")],
  // A fresh baseline write names a NEW axis by `title` only: passing `id` asserts an EXISTING axis and the
  // store refuses an unknown one ("Axis not found."). The same rule holds for plans/steps below — reference
  // a just-created axis by `axisTitle`, and let the store mint its own ids. The axis-level `people` links are
  // what populate `axis_people`, so the People view derives each person's own workstreams from them.
  axes: [
    {
      title: WS_ONE,
      kind: "feature",
      state: "active",
      stateConfidence: "inferred",
      // The axis names the repository it lives in (`axes[].repositories`), which is what puts an axis
      // into the repository rollup and lets the repository panel render it in its "Current work" lane
      // (the subject of the Repositories → Progress/Axes cross-navigation check).
      repositories: [{ fullName: REPO, relationship: "primary", defaultBranch: "main" }],
      people: [person(PERSON, "fixture")],
    },
    {
      title: WS_TWO,
      kind: "investigation",
      state: "active",
      stateConfidence: "inferred",
      people: [person(PERSON, "fixture"), person(PERSON2, "fixture")],
    },
    // A blocked workstream: axis-level state `blocked` with its own blocker text (the pivot moved the
    // blocked subject off the retired window feed; the axis blocker renders in both the Projects detail
    // axis row and the Progress context panel).
    {
      title: WS_BLOCKED,
      kind: "investigation",
      state: "blocked",
      stateConfidence: "inferred",
      blocker: `${LABEL} blocked on an upstream dependency; not a replacement task.`,
      blockerConfidence: "inferred",
      people: [person(PERSON, "fixture")],
    },
    // An axis that states NO progress at all: no currentState and no evidence, so its reading must say
    // so and carry no confidence (the "states no progress carries no confidence" subject).
    {
      title: WS_BARE,
      kind: "feature",
      state: "active",
      stateConfidence: "inferred",
      people: [person(PERSON, "fixture")],
    },
    // The axis that owns the UNORDERED plan (three steps, every position null).
    {
      title: WS_UNORDERED,
      kind: "feature",
      state: "active",
      stateConfidence: "inferred",
      people: [person(PERSON, "fixture")],
    },
    // The TERMINAL axis (subject of requirement #11): a `completed` workstream alongside the active
    // ones, so the Projects detail's completed/abandoned fold renders (`data-rd-folded-axes`), is closed
    // initially, and opens on demand. `completed` is a state the store's own schema accepts.
    {
      title: WS_DONE,
      kind: "feature",
      state: "completed",
      stateConfidence: "inferred",
      description: `${LABEL} completed workstream — retained so the fold has a subject.`,
      people: [person(PERSON, "fixture")],
    },
    // The STATED-READING, EVIDENCE-FREE axis (subject of requirement #18's independence half): it states
    // a current reading, but records NO branch, NO PR, NO activity and NO note — so the Progress panel's
    // evidence line must say "no evidence on record" while the reading is still shown. This proves the
    // absence of evidence is asserted independently of the absence of progress (the WS_BARE axis above is
    // the no-progress case). Written `inferred`: the store refuses a `confirmed` reading with no evidence,
    // so the honest confidence is the only one the public write path will accept here.
    {
      title: WS_STATED,
      kind: "investigation",
      state: "active",
      stateConfidence: "inferred",
      currentState: `${LABEL} a reading is stated but nothing is recorded behind it yet.`,
      currentStateConfidence: "inferred",
      people: [person(PERSON, "fixture")],
    },
    // The SUPPORTED-CONFIRMED axis (the negative control for #18's "no confirmed claim" half): it names a
    // branch — the structural evidence `axisEvidence` accepts — and so MAY carry `confirmed`, the honest
    // value when something backs the claim. Written through the SAME public reconcile path. It proves the
    // "no confirmed claim" assertion above is not passing merely because confidence badges never render:
    // a supported claim is still rendered `confirmed`.
    {
      title: WS_CONFIRMED,
      kind: "experiment",
      state: "active",
      stateConfidence: "confirmed",
      branch: `${LABEL} synthetics/confirmed-workstream`,
      people: [person(PERSON, "fixture")],
    },
    // The DEFAULT-CONFIRMED, EVIDENCE-FREE axis (the regression subject): it names NO `state` and NO
    // `stateConfidence`, so nothing is asserted and the column's own `confirmed` default stands. It records
    // NO branch, NO PR, NO activity and NO note, so `axisEvidence` is empty. The store refuses an ASSERTED
    // `confirmed` with no evidence (`assertClaimsAreBacked`), NOT the unasserted default — so this axis reads
    // `confirmed` with an empty evidence line, and the page must say "no evidence on record — a 'confirmed'
    // reading needs evidence" without downgrading the badge. Written through the SAME public reconcile path.
    {
      title: WS_DEFAULT_CONFIRMED,
      kind: "feature",
      people: [person(PERSON, "fixture")],
    },
  ],
  problems: [
    {
      title: `${LABEL} Blocked step`,
      statement: `${LABEL} One step is blocked, so the open-vs-blocked split is exercised.`,
      axisTitle: WS_ONE,
      state: "blocked",
    },
    {
      title: `${LABEL} Open step`,
      statement: `${LABEL} One step is open, so the open lane is exercised too.`,
      axisTitle: WS_TWO,
      state: "open",
    },
    {
      title: `${LABEL} Resolved step`,
      statement: `${LABEL} One step is resolved, so the terminal lane has a subject.`,
      axisTitle: WS_ONE,
      state: "resolved",
    },
  ],
  plans: [
    {
      axisTitle: WS_ONE,
      summary: `${LABEL} Plan with stored positions 1,2,3,4, a 0 and an unordered step.`,
      steps: [
        { title: `${LABEL} step 1`, position: 1, state: "done" },
        { title: `${LABEL} step 2`, position: 2, state: "done" },
        { title: `${LABEL} step 3`, position: 3, state: "active" },
        { title: `${LABEL} step 4`, position: 4, state: "pending" },
        { title: `${LABEL} zero step`, position: 0, state: "pending" },
        { title: `${LABEL} unnumbered step`, position: null, state: "blocked" },
      ],
    },
    // An UNORDERED plan: three steps, every position null. The store's own order is B, A, C on purpose
    // (it differs from alphabetical), so a page that sorted the steps or invented numbers would fail.
    {
      axisTitle: WS_UNORDERED,
      summary: `${LABEL} Unordered plan: every step carries no position.`,
      steps: [
        { title: `${LABEL} unordered step B`, position: null, state: "active" },
        { title: `${LABEL} unordered step A`, position: null, state: "pending" },
        { title: `${LABEL} unordered step C`, position: null, state: "pending" },
      ],
    },
  ],
};

// Read the topic back first so the activity pass is idempotent by `sourceRef`.
const scopedTopic = async () => {
  try {
    return await action("get_topic", { topicName: topicInput.topicName }, headers);
  } catch {
    return null;
  }
};
const before = await scopedTopic();
const existingRefs = new Set(
  (before?.activity ?? []).map((row) => row.sourceRef).filter((ref) => typeof ref === "string")
);

// Problems are NOT reconciled by title the way a topic/axis is: `reconcile_topic` updates a problem only
// when it is targeted by `problemId`, and a bare `statement` CREATES one. So a re-run against a populated
// store would append a duplicate task for every row here. Read the existing problem titles back first and
// create only the ones that are missing — the same idempotency the `sourceRef` set gives the event pass.
const problemRows = (detail) =>
  (detail?.axes ?? []).flatMap((axis) =>
    (axis.problems ?? []).map((problem) => ({ axisTitle: axis.title, id: problem.id, title: problem.title }))
  );
const existingProblems = problemRows(before);
const existingProblemTitles = new Set(existingProblems.map((p) => p.title).filter(Boolean));
const onlyNew = (rows) => rows.filter((p) => !existingProblemTitles.has(p.title));
topicInput.problems = onlyNew(topicInput.problems);

const reconcile = await action("reconcile_topic", topicInput, headers);
console.log(`seed-synthetic: reconcile_topic ${reconcile?.ok === false ? "FAILED" : "ok"}`);
console.log(`seed-synthetic: counts ${JSON.stringify(reconcile?.counts ?? {})}`);

// ── the labelled event set (idempotent by sourceRef) ────────────────────────────────────────────────
const events = [];
for (let i = 1; i <= 12; i += 1) {
  const day = String(((i - 1) % 28) + 1).padStart(2, "0");
  events.push({
    axisTitle: i % 2 ? WS_ONE : WS_TWO,
    occurredAt: `2026-10-${day}T00:00:00.000Z`,
    repositoryFullName: REPO,
    sourceRef: `synthetics-${i}`,
    summary: `${LABEL} synthetic event ${i}`,
  });
}
// Four events against the SECOND repository, so both repositories have attributable activity.
for (let j = 1; j <= 4; j += 1) {
  const day = String(j + 12).padStart(2, "0");
  events.push({
    axisTitle: WS_TWO,
    occurredAt: `2026-10-${day}T00:00:00.000Z`,
    repositoryFullName: REPO2,
    sourceRef: `synthetics-repo2-${j}`,
    summary: `${LABEL} secondary-repo event ${j}`,
  });
}
// One event recorded at the CALLER'S CURRENT instant, on an explicit axis, against an explicit
// repository, through `record_activity`. It is written by the seed's own authenticated session, so its
// actor is the caller's real principal (mapped to PERSON) — the readback below proves the mapping landed.
// The date-stamped sourceRef keeps the write idempotent per day while still advancing the newest event.
const CURRENT_AT = new Date().toISOString();
events.push({
  axisTitle: WS_ONE,
  occurredAt: CURRENT_AT,
  repositoryFullName: REPO,
  sourceRef: `synthetics-current-${CURRENT_AT.slice(0, 10)}`,
  summary: `${LABEL} current synthetic axis event`,
});
let recorded = 0;
let skipped = 0;
for (const ev of events) {
  if (existingRefs.has(ev.sourceRef)) {
    skipped += 1;
    continue;
  }
  await action(
    "record_activity",
    { topicId: before?.topic?.id ?? reconcile?.topic?.id ?? topicInput.topicName, sourceType: "manual", ...ev },
    headers
  );
  recorded += 1;
}
console.log(
  `seed-synthetic: recorded ${recorded} new ${LABEL} event(s), skipped ${skipped} already present (of ${events.length})`
);

// ── the BARE repository (requirements #60 + #61) ────────────────────────────────────────────────────
// Registered ONLY through `record_activity.repositoryFullName` against the main topic, with NO
// `reconcile_topic.repositories[]` entry anywhere. `addActivity` upserts the repository row and touches
// neither `topic_repositories` nor `axis_repositories`, so the rollup renders it with `topics: []` and
// `axes: []`. Idempotent by sourceRef. This is the public-write-path bare case; nothing is injected into a
// table and no `reconcile_topic` call is used for the repository.
//
// FINDING F2 (now FIXED, so the workaround is removed): an activity recorded with a topic but NO axis
// produces a legitimate **topic-level** bucket (`axis: null`, store key `""`) in the `get_overview.timeline`
// projection (store.ts `recentProgress`). The canonical pass's projection reader used to dereference
// `bucket.axis.title` and aborted on it (exit 2); the reader now represents the topic-level bucket (labelled,
// with its event count — `harness/overview-timeline.mjs`). This event therefore records axisless again, the
// honest shape: it names only the repository. The REPOSITORY row is upserted without touching
// `topic_repositories` or `axis_repositories`, so the rollup still renders it with `topics: []` and
// `axes: []` — the property #60/#61 key on (no topic/axis link persisted).
const BARE_REF = "synthetics-bare-repo-2";
if (!existingRefs.has(BARE_REF)) {
  await action(
    "record_activity",
    {
      topicId: before?.topic?.id ?? reconcile?.topic?.id ?? topicInput.topicName,
      occurredAt: CURRENT_AT,
      repositoryFullName: BARE_REPO,
      sourceRef: BARE_REF,
      sourceType: "manual",
      summary: `${LABEL} bare repository registration (no topic or axis link)`,
    },
    headers
  );
  console.log(`seed-synthetic: registered bare repository ${JSON.stringify(BARE_REPO)} via record_activity.repositoryFullName`);
} else {
  console.log(`seed-synthetic: bare repository ${JSON.stringify(BARE_REPO)} already registered (skipped)`);
}

// ── plan ownership triangle, task paging, and the exact-scope read-back ─────────────────────────────
// A plan is owned by exactly ONE of a project (topic), a workstream (axis) or a task (problem). The
// workstream-owned plan for the *rendered* main project is the `plans[0]` written in the first reconcile
// above (axisTitle = WS_ONE). The project-owned and task-owned plans, the 12-task paging set and the
// plan-bearing task are seeded into a SECOND, clearly-labelled **ACTIVE** synthetic project ("[synthetics]
// ACTIVE Project Triangle"): a separate, self-identifying project so the plan-ownership triangle and the
// task paging (offset 0/5/10) are exercised THROUGH THE SERVED UI (its own index row, its plan, its
// tasks), not only in an API read-back. It is labelled ACTIVE, not archived, on purpose: the parent asked
// for the projections to actually carry it. Adding it changes the project/task universe the canonical pass
// measures (reported, not hidden).
const topicId = reconcile?.topic?.id ?? before?.topic?.id ?? topicInput.topicName;
const axisIdByTitle = (detail, title) =>
  (detail?.axes ?? []).find((a) => a.title === title)?.id ?? null;

const PAGED_TOPIC = `${LABEL} ACTIVE Project Triangle`;
const WS_PAGED = `${LABEL} Paged Workstream`;

const tasks = [];
for (let i = 1; i <= 12; i += 1) {
  tasks.push({
    title: `${LABEL} task ${String(i).padStart(2, "0")}`,
    statement: `${LABEL} Paged task ${i}: twelve tasks read as three backend pages (5/5/2).`,
    axisTitle: WS_PAGED,
    state: "open",
  });
}

// Idempotency for the archived topic too: problems are created, not reconciled by title.
const pagedBefore = await action("get_topic", { topicName: PAGED_TOPIC }, headers).catch(() => null);
const pagedExisting = problemRows(pagedBefore);
const pagedTitles = new Set(pagedExisting.map((p) => p.title).filter(Boolean));
const onlyNewPaged = (rows) => rows.filter((p) => !pagedTitles.has(p.title));

// reconcile2: the archived topic, its workstream, the WORKSTREAM-owned plan, the 12 paged tasks and the
// plan-bearing task. A plan cannot name a task created in the same call, so the task's own plan and the
// PROJECT-owned plan (which needs the topic id) follow in reconcile3.
const reconcile2 = await action(
  "reconcile_topic",
  {
    topicName: PAGED_TOPIC,
    topic: {
      name: PAGED_TOPIC,
      description: `${LABEL} ACTIVE second synthetic project — the plan-ownership triangle and task paging.`,
      status: "active",
      summary: `${LABEL} ACTIVE; carries the plan triangle and the >=12-task paging set.`,
    },
    // PERSON is linked to THIS project's own workstream too, so the one mapped person is on TWO
    // active projects (this ACTIVE triangle project and the main canonical project) each with its own
    // workstream — the subject of P01 (a person whose People panel groups several topics, each with its
    // own axes underneath, no axis shared between the groups). Idempotent by displayName.
    axes: [{ title: WS_PAGED, kind: "feature", state: "active", stateConfidence: "inferred", people: [person(PERSON, "fixture")] }],
    plans: [
      {
        axisTitle: WS_PAGED,
        summary: `${LABEL} WORKSTREAM-owned plan (owner = axis).`,
        steps: [
          { title: `${LABEL} paged ws step 1`, position: 1, state: "active" },
          { title: `${LABEL} paged ws step 2`, position: 2, state: "pending" },
        ],
      },
    ],
    problems: onlyNewPaged([
      {
        title: `${LABEL} plan-bearing task`,
        statement: `${LABEL} A task that owns its own plan.`,
        axisTitle: WS_PAGED,
        state: "open",
      },
      ...tasks,
    ]),
  },
  headers
);
const pagedTopic = reconcile2?.topic?.id ?? pagedBefore?.topic?.id ?? null;
const pagedAxis = axisIdByTitle(reconcile2, WS_PAGED) ?? axisIdByTitle(pagedBefore, WS_PAGED);
const taskWithPlan =
  pagedExisting.find((p) => p.title === `${LABEL} plan-bearing task`) ??
  (reconcile2?.problems ?? []).find((p) => (p.title ?? "") === `${LABEL} plan-bearing task`);
console.log(
  `seed-synthetic: reconcile2 (ACTIVE project triangle) ${
    reconcile2?.ok === false ? "FAILED" : "ok"
  }; task ${taskWithPlan?.id ?? "(none)"}`
);

const reconcile3 =
  pagedTopic && taskWithPlan
    ? await action(
        "reconcile_topic",
        {
          topicName: PAGED_TOPIC,
          plans: [
            {
              topicId: pagedTopic,
              summary: `${LABEL} PROJECT-owned plan (owner = topic).`,
              steps: [
                { title: `${LABEL} project step 1`, position: 1, state: "active" },
                { title: `${LABEL} project step 2`, position: 2, state: "pending" },
              ],
            },
            {
              problemId: taskWithPlan.id,
              summary: `${LABEL} TASK-owned plan (owner = problem).`,
              steps: [
                { title: `${LABEL} task step 1`, position: 1, state: "done" },
                { title: `${LABEL} task step 2`, position: 2, state: "active" },
                { title: `${LABEL} task step 3`, position: 3, state: "pending" },
              ],
            },
          ],
        },
        headers
      )
    : null;
console.log(
  `seed-synthetic: reconcile3 (project + task plans) ${
    reconcile3?.ok === false ? "FAILED" : reconcile3 ? "ok" : "skipped (no topic/task id)"
  }`
);

// ── read back and report the counts (never credentials) ─────────────────────────────────────────────
const overview = await action("get_overview", { activitySinceDays: 0 }, headers);
console.log(
  `seed-synthetic: readback counts ${JSON.stringify(overview?.counts ?? {})} ` +
    `(expected topics=2 active [main + ACTIVE project triangle], axes=9 [main 8 incl. the completed fold axis, the stated-reading evidence-free axis and the supported-confirmed axis + triangle 1], repositories=3 [served-validation, secondary-repo, bare/empty-current], people=2, activities=17)`
);
const people = (overview?.people ?? []).map((p) => ({
  name: p.displayName ?? p.person?.displayName,
  attributable: p.attributable,
  axes: (p.axes ?? p.topics ?? []).length,
}));
console.log(`seed-synthetic: people readback ${JSON.stringify(people)}`);

// The plan scopes, read back exactly from the archived topic. `get_topic` returns the project plan on
// `plan`, each axis's own plan on `axes[].plan`, and each task's own plan on `axes[].problems[].plan` —
// and a task's plan must never be its axis's plan (the sibling-no-inheritance property).
const pagedDetail = await action("get_topic", { topicName: PAGED_TOPIC }, headers);
const pagedWs = (pagedDetail?.axes ?? []).find((a) => a.title === WS_PAGED);
const pagedTask = (pagedWs?.problems ?? []).find(
  (p) => (p.title ?? "") === `${LABEL} plan-bearing task`
);
const stepTitles = (plan) => (plan?.steps ?? []).map((s) => s.title).join("|");
const planScopes = {
  projectSteps: pagedDetail?.plan?.steps?.length ?? null,
  taskSteps: pagedTask?.plan?.steps?.length ?? null,
  taskIsNotAxisPlan:
    stepTitles(pagedTask?.plan) !== stepTitles(pagedWs?.plan) && stepTitles(pagedTask?.plan) !== "",
  workstreamSteps: pagedWs?.plan?.steps?.length ?? null,
};
console.log(
  `seed-synthetic: plan-owner readback ${JSON.stringify(planScopes)} (expected projectSteps=2, workstreamSteps=2, taskSteps=3, taskIsNotAxisPlan=true)`
);

// ── task ↔ repository relations: the current task-card "Supporting repositories" subject ─────────────
// The IA pivot moved repository relations off the retired Problems inventory onto the current task-card
// surface (each card renders its own `Supporting repositories` tags). To EXERCISE that assertion (not
// SKIP it), one task ON THE FIRST SHOWN TASK PAGE of the paged workstream is linked to BOTH synthetic
// repositories — through the product's own write path only: `reconcile_topic` targets the existing task
// by `problemId` and links each repository by its PUBLIC fullName (`upsertRepository`), the same
// reference a real caller uses. Nothing is fabricated: no evidence row, no authored claim — only the two
// links the store supports. Re-running replaces the same two links (idempotent).
// The link target is chosen from the ACTUAL first rendered task page (`problemPage`, offset 0), not from a
// page-1 position assumption. The workstream's task order is `created_at ASC, id ASC`; tasks created in one
// reconcile can share a created_at millisecond and so tie-break by a random id, which made "task 01 is on
// page 1" a coin flip and let the served repository-relation check SKIP. Reading the backend's own first
// page and linking the first task on it makes the subject deterministic for an unchanged dataset — no
// production ordering is changed and no timestamp is fabricated. Fall back to "task 01" only if the page
// read carries no task (a responder that offers no page).
const firstTaskPage = pagedAxis
  ? await action("get_topic", { topicName: PAGED_TOPIC, axisId: pagedAxis, offset: 0, pageSize: 5 }, headers)
  : null;
const pageOneTask = (firstTaskPage?.problemPage?.items ?? []).find((p) =>
  (p.title ?? "").startsWith(`${LABEL} task `)
);
const linkTask =
  pageOneTask ??
  (pagedWs?.problems ?? []).find((p) => (p.title ?? "") === `${LABEL} task 01`) ??
  (pagedWs?.problems ?? []).find((p) => (p.title ?? "").startsWith(`${LABEL} task `)) ??
  null;
console.log(
  `seed-synthetic: repository-link target ${JSON.stringify(linkTask?.title ?? null)} (chosen from the actual first task page)`
);
let relResult = null;
if (linkTask) {
  relResult = await action(
    "reconcile_topic",
    {
      topicName: PAGED_TOPIC,
      problems: [
        {
          problemId: linkTask.id,
          statement: linkTask.statement ?? `${LABEL} task`,
          title: linkTask.title,
          // Link in ALPHABETICAL fullName order on purpose: the two read paths order a task's own
          // repositories differently — `get_topic` by `full_name COLLATE NOCASE` and `get_progress` by the
          // link row's insertion order (`ORDER BY l.rowid, r.full_name`). Writing them alphabetically makes
          // the two orderings coincide, so the current-surface re-point (which compares the rendered card,
          // drawn from get_topic, against the get_progress projection) compares like with like. The latent
          // cross-path ordering difference is reported as a finding, not hidden.
          repositoryFullNames: [REPO2, REPO],
        },
      ],
    },
    headers
  );
}
const relDetail = await action("get_topic", { topicName: PAGED_TOPIC }, headers);
const relAxis = (relDetail?.axes ?? []).find((a) => a.title === WS_PAGED);
const relTasks = relAxis?.problems ?? [];
const repoIdsOfTask = (p) => (p.repositories ?? []).map((r) => r.id);
const linkedTask = relTasks.find((p) => p.id === linkTask?.id) ?? null;
const siblingTasks = relTasks.filter((p) => p.id !== linkTask?.id);
const relReadback = {
  taskTitle: linkedTask?.title ?? null,
  taskId: linkedTask?.id ?? null,
  linkedRepoIds: repoIdsOfTask(linkedTask),
  linkedRepoNames: (linkedTask?.repositories ?? []).map((r) => r.fullName),
  siblingCount: siblingTasks.length,
  siblingRepoLinkTotal: siblingTasks.reduce((n, p) => n + repoIdsOfTask(p).length, 0),
  expectedTwo: repoIdsOfTask(linkedTask).length === 2 && siblingTasks.every((p) => repoIdsOfTask(p).length === 0),
};
console.log(`seed-synthetic: task-relation readback ${JSON.stringify(relReadback)}`);
console.log(
  `seed-synthetic: repo id map ${JSON.stringify(
    (overview?.repositories ?? []).map((r) => ({ fullName: r.repository?.fullName ?? r.fullName, id: r.repository?.id ?? r.id }))
  )}`
);

// Bare-repository read-back: prove the registered repository carries NO topic link and NO axis in the
// rollup (the exact predicate requirements #60/#61 key on). Read from the server projection, not derived.
const bareEntry = (overview?.repositories ?? []).find(
  (r) => (r.repository?.fullName ?? r.fullName) === BARE_REPO
);
console.log(
  `seed-synthetic: bare-repo readback ${JSON.stringify({
    fullName: bareEntry?.repository?.fullName ?? bareEntry?.fullName ?? null,
    topics: (bareEntry?.topics ?? []).length,
    axes: (bareEntry?.axes ?? []).length,
  })} (expected topics=0, axes=0)`
);

// Axisless-event read-back (finding F2): the bare event named its topic but no axis, so
// `get_overview.timeline` carries a legitimate **topic-level** bucket (`axis: null`) for the main project.
// Prove it exists and carries the event, so the reader's null-axis path is exercised by this very dataset
// (not only by the unit fixture) — and prove the repository row still links to no topic and no axis.
const mainGroup = (overview?.timeline ?? []).find(
  (g) => (g.topic?.name ?? "") === `${LABEL} Canonical Served Validation`
);
const topicLevelBuckets = (mainGroup?.axes ?? []).filter((b) => (b.axis ?? null) === null);
console.log(
  `seed-synthetic: axisless-event readback ${JSON.stringify({
    topic: mainGroup?.topic?.name ?? null,
    topicLevelBuckets: topicLevelBuckets.length,
    topicLevelEvents: topicLevelBuckets.reduce((n, b) => n + (b.eventCount ?? 0), 0),
    bareRepoTopics: (bareEntry?.topics ?? []).length,
    bareRepoAxes: (bareEntry?.axes ?? []).length,
  })} (expected topicLevelBuckets=1, topicLevelEvents>=1, bareRepoTopics=0, bareRepoAxes=0)`
);

// The backend-independent pages: repo A (12+ events), repo B (2+) and a task page (12+ tasks). Each page
// reports its own total and hasMore, so the counts are read off the server, not derived by the seeder.
const repoIdByName = (fullName) =>
  (overview?.repositories ?? []).find((r) => (r.repository?.fullName ?? r.fullName) === fullName)?.repository
    ?.id ?? null;
const pageOf = (obj, key) => {
  const page = obj?.[key] ?? null;
  return { items: (page?.items ?? []).length, total: page?.total ?? null, hasMore: page?.hasMore ?? null };
};
const repoPage = async (fullName) =>
  pageOf(
    await action("list_activity", { repositoryId: repoIdByName(fullName), offset: 0, pageSize: 5 }, headers),
    "activityPage"
  );
console.log(
  `seed-synthetic: page readback repoA ${JSON.stringify(await repoPage(REPO))} repoB ${JSON.stringify(
    await repoPage(REPO2)
  )} (expected repoA total>=12, repoB total>=2)`
);
if (pagedAxis) {
  const pg = await action(
    "get_topic",
    { topicName: PAGED_TOPIC, axisId: pagedAxis, offset: 0, pageSize: 5 },
    headers
  );
  console.log(
    `seed-synthetic: page readback taskPage ${JSON.stringify(pageOf(pg, "problemPage"))} (expected total>=13, items=5, hasMore=true)`
  );
}

// ── the evidence-line subjects (requirements #17/#18) ────────────────────────────────────────────────
// Read each workstream's OWN recorded evidence back from the scoped `get_topic { axisId }` — the exact
// projection the Progress panel renders — so the served probe's subjects are proven present/absent by the
// server, never invented by the seeder:
//   • an EVIDENCE-BEARING workstream (WS_ONE, which carries the labelled `[synthetics]` events recorded
//     above through the public `record_activity` writer) — evidence.length > 0, provenance labelled;
//   • a STATED-READING, EVIDENCE-FREE workstream (WS_STATED) — evidence.length === 0 but currentState set;
//   • a BARE workstream (WS_BARE) — evidence.length === 0 and no currentState.
const mainDetail = await action("get_topic", { topicName: topicInput.topicName }, headers);
const wsByTitle = (title) => (mainDetail?.axes ?? []).find((a) => a.title === title) ?? null;
const evidenceOf = (title) => {
  const ws = wsByTitle(title);
  return {
    title,
    evidenceCount: (ws?.evidence ?? []).length,
    kinds: [...new Set((ws?.evidence ?? []).map((e) => e.kind))],
    labels: (ws?.evidence ?? []).slice(0, 3).map((e) => e.label),
    currentState: (ws?.currentState ?? "") !== "",
    stateConfidence: ws?.stateConfidence ?? null,
  };
};
const evidenceSubjects = {
  evidenced: evidenceOf(WS_ONE),
  statedNoEvidence: evidenceOf(WS_STATED),
  bareNoEvidence: evidenceOf(WS_BARE),
  supportedConfirmed: evidenceOf(WS_CONFIRMED),
  defaultConfirmedNoEvidence: evidenceOf(WS_DEFAULT_CONFIRMED),
};
console.log(`seed-synthetic: evidence-line readback ${JSON.stringify(evidenceSubjects)}`);
console.log(
  `seed-synthetic: evidence subjects ${JSON.stringify({
    evidencedPresent: evidenceSubjects.evidenced.evidenceCount > 0,
    statedIsEvidenceFree: evidenceSubjects.statedNoEvidence.evidenceCount === 0 && evidenceSubjects.statedNoEvidence.currentState,
    bareIsEvidenceFreeAndNoReading: evidenceSubjects.bareNoEvidence.evidenceCount === 0 && !evidenceSubjects.bareNoEvidence.currentState,
    supportedConfirmedIsBacked: evidenceSubjects.supportedConfirmed.evidenceCount > 0 && evidenceSubjects.supportedConfirmed.stateConfidence === "confirmed",
    // The regression subject: no state asserted (so no explicit/inferred confidence was supplied), yet the
    // column's own default stands — `confirmed` — with an empty evidence set.
    defaultConfirmedIsUnassertedConfirmedAndEvidenceFree: evidenceSubjects.defaultConfirmedNoEvidence.evidenceCount === 0 && !evidenceSubjects.defaultConfirmedNoEvidence.currentState && evidenceSubjects.defaultConfirmedNoEvidence.stateConfidence === "confirmed",
  })} (expected all true)`
);
