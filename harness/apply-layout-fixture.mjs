#!/usr/bin/env node
// Apply the layout fixture state to a running Nakama instance, through the plugin's own action surface.
//
//   NAKAMA_URL=http://127.0.0.1:4399 NAKAMA_EMAIL=… NAKAMA_PASSWORD=… node harness/apply-layout-fixture.mjs
//
// Why this exists: the canonical dataset in `docs/corpus/` is a real repository, which is the point of
// it — but a real dataset also lacks states the layout still has to survive (a blocked axis, an axis
// with nothing behind it, a topic whose card hides axes, a person spanning topics, a person with no
// mapped account). This is the synthetic second dataset that has exactly those states, so a redesign
// cannot look clean on the real corpus while regressing them. Screenshots captured from it live in
// `docs/layout-fixtures/`; the real corpus stays canonical.
//
// It is deliberately a *separate* dataset: apply it to a throwaway or dev instance, capture, then
// re-seed whatever the instance is supposed to hold. Every write goes through
// POST /v1/plugins/research-dashboard/actions/<key> — nothing here touches SQLite directly.

const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const BASE = (process.env.NAKAMA_URL ?? "http://127.0.0.1:4399").replace(/\/+$/, "");
const EMAIL = process.env.NAKAMA_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_PASSWORD ?? "";

const repo = (fullName, description) => ({ description, fullName, relationship: "primary" });
const repoLink = (fullName) => ({ fullName });
const person = (displayName, extra = {}) => ({ displayName, ...extra });

// The two topics. Topic A is the crowded one: five axes, one of them blocked, one with nothing behind
// it — a card that leads with three axes and has to disclose the other two.
const FIXTURE = [
  {
    topic: { summary: "Synthetic layout fixture: a topic whose card is dense enough to hide axes." },
    topicName: "Layout fixture — crowded card",
    people: [person("Fixture Alpha", { nakamaUserId: "user_admin", role: "owner" })],
    repositories: [
      repo(
        "fixture/crowded-card",
        "Stand-in repository for the layout fixture pack (synthetic)."
      ),
    ],
    axes: [
      {
        blocker: "waiting on the rig firmware window",
        blockerConfidence: "confirmed",
        branch: "acquire/fixture-blocked",
        currentState: "Handover to the instrument vendor is scheduled, not started.",
        currentStateConfidence: "confirmed",
        kind: "experiment",
        people: [person("Fixture Alpha", { nakamaUserId: "user_admin", role: "owner" })],
        repositories: [repoLink("fixture/crowded-card")],
        state: "blocked",
        stateConfidence: "confirmed",
        title: "Fixture: blocked axis (blocked + blocker text)",
      },
      {
        branch: "analysis/fixture-active",
        currentState: "Two of three sweeps replayed cleanly on the second rig pass.",
        currentStateConfidence: "confirmed",
        kind: "experiment",
        people: [person("Fixture Alpha", { nakamaUserId: "user_admin", role: "owner" })],
        repositories: [repoLink("fixture/crowded-card")],
        state: "active",
        stateConfidence: "confirmed",
        title: "Fixture: active axis (with evidence)",
      },
      {
        // No activities name this axis, no branch and no document states its progress: this is the axis
        // that must render "no evidence on record" and say its own state is inferred. It also carries no
        // current-state claim at all, which is the other half of the pair — an axis that states no
        // progress must not have a confidence rendered for it.
        kind: "maintenance",
        repositories: [repoLink("fixture/crowded-card")],
        state: "draft",
        stateConfidence: "inferred",
        title: "Fixture: evidence-free axis (inferred, nothing behind it)",
      },
      {
        branch: "feat/fixture-parked",
        currentState: "Parked behind the blocked acquisition axis on purpose.",
        currentStateConfidence: "inferred",
        kind: "feature",
        people: [person("Fixture Alpha", { nakamaUserId: "user_admin", role: "owner" })],
        repositories: [repoLink("fixture/crowded-card")],
        state: "parked",
        stateConfidence: "inferred",
        title: "Fixture: parked axis (inferred state)",
      },
      {
        branch: "data/fixture-completed",
        currentState: "Dataset build finished and archived with its provenance note.",
        currentStateConfidence: "confirmed",
        kind: "experiment",
        repositories: [repoLink("fixture/crowded-card")],
        state: "completed",
        stateConfidence: "confirmed",
        title: "Fixture: completed axis",
      },
    ],
    activities: [
      {
        axisTitle: "Fixture: blocked axis (blocked + blocker text)",
        occurredAt: "2026-09-29T09:15:00+03:00",
        sourceRef: "fixture-activity-1",
        sourceType: "manual",
        summary: "Blocked on the vendor's firmware window; nothing to record until it lands.",
      },
      {
        axisTitle: "Fixture: active axis (with evidence)",
        occurredAt: "2026-09-30T14:40:00+03:00",
        sourceRef: "fixture-activity-2",
        sourceType: "manual",
        summary: "Second rig pass replayed; two of three sweeps clean.",
      },
      {
        axisTitle: "Fixture: parked axis (inferred state)",
        occurredAt: "2026-10-01T13:00:00+03:00",
        sourceRef: "fixture-activity-3",
        sourceType: "manual",
        summary: "Parked deliberately, waiting on the blocked axis.",
      },
      {
        axisTitle: "Fixture: completed axis",
        occurredAt: "2026-09-28T17:20:00+03:00",
        sourceRef: "fixture-activity-4",
        sourceType: "manual",
        summary: "Dataset build archived with its provenance note.",
      },
    ],
    annotations: [
      {
        axisTitle: "Fixture: blocked axis (blocked + blocker text)",
        text: "Synthetic note: this blocker is the state the layout must make obvious without a click.",
      },
      {
        text: "Synthetic dataset. Nothing here is real work; see docs/layout-fixtures/README.md.",
      },
    ],
  },
  {
    topic: { summary: "Synthetic second topic, so one person spans more than one." },
    topicName: "Layout fixture — second topic",
    people: [
      // The same person as topic A, linked at topic level as well: that is what makes the People view
      // show one row with two involvements.
      person("Fixture Alpha", { nakamaUserId: "user_admin", role: "owner" }),
      // No mapped account: must read as "no account is mapped", never as idleness.
      person("Fixture Zeta", { role: "reviewer" }),
    ],
    repositories: [
      repo("fixture/second-topic", "Stand-in repository for the layout fixture pack (synthetic)."),
    ],
    axes: [
      {
        branch: "analysis/fixture-second",
        currentState: "Shares its owner with the crowded topic on purpose.",
        currentStateConfidence: "confirmed",
        kind: "experiment",
        people: [
          // The same person as topic A: one row in the People view, two topics underneath.
          person("Fixture Alpha", { nakamaUserId: "user_admin", role: "owner" }),
          // No mapped account: must read as "no account is mapped", never as idleness.
          person("Fixture Zeta", { role: "reviewer" }),
        ],
        repositories: [repoLink("fixture/second-topic")],
        state: "active",
        stateConfidence: "confirmed",
        title: "Fixture: second-topic axis (two people, one unmapped)",
      },
    ],
    activities: [
      {
        axisTitle: "Fixture: second-topic axis (two people, one unmapped)",
        occurredAt: "2026-10-01T11:30:00+03:00",
        sourceRef: "fixture-activity-5",
        sourceType: "manual",
        summary: "Second topic, so the People view has a person with two involvements.",
      },
    ],
    annotations: [],
  },
];

const jar = new Map();

const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

async function call(path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: cookieHeader(), ...headers },
    method: body === undefined ? "GET" : "POST",
  });
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  return { body: json, status: response.status };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("NAKAMA_EMAIL and NAKAMA_PASSWORD are required (they are never printed).");
    return 2;
  }
  const login = await call("/v1/auth/login", { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) {
    console.error(`login failed: HTTP ${login.status}`);
    return 1;
  }
  const csrf = jar.get("nakama_csrf");
  if (!csrf) {
    console.error("no nakama_csrf cookie after login");
    return 1;
  }
  const orgs = await call("/v1/auth/orgs");
  const orgId = orgs.body?.orgs?.[0]?.id;
  if (!orgId) {
    console.error("no organization on this account");
    return 1;
  }
  console.log(`target: ${BASE}  org: ${orgId}`);

  let failures = 0;
  for (const entry of FIXTURE) {
    const { status, body } = await call(
      `/v1/plugins/${PLUGIN_ID}/actions/reconcile_topic`,
      {
        input: {
          activities: entry.activities,
          annotations: entry.annotations,
          axes: entry.axes,
          people: entry.people,
          repositories: entry.repositories,
          topic: entry.topic,
          topicName: entry.topicName,
        },
      },
      { "x-csrf-token": csrf, "x-org-id": orgId }
    );
    const result = body?.result;
    // Fail loudly: a refused write that prints nothing turns this into a silent no-op.
    if (status !== 200 || result?.ok !== true) {
      failures += 1;
      console.error(`FAILED  ${entry.topicName}: HTTP ${status} ${JSON.stringify(body).slice(0, 300)}`);
      continue;
    }
    console.log(
      `applied ${entry.topicName}: ${result.axes?.length ?? "?"} axes, ` +
        `topic ${String(result.topic?.id ?? "?").slice(0, 8)}`
    );
  }

  const overview = await call(
    `/v1/plugins/${PLUGIN_ID}/actions/get_overview`,
    { input: { activitySinceDays: 0 } },
    { "x-csrf-token": csrf, "x-org-id": orgId }
  );
  const view = overview.body?.result;
  if (view) {
    console.log(
      `now: ${view.topics.length} topics, ${view.counts?.axes ?? "?"} axes, ` +
        `${view.people.length} people, ${view.repositories.length} repositories, ` +
        `${view.blocked.length} blocked`
    );
    for (const topic of view.topics) {
      console.log(
        `  ${topic.topic.name}: ${topic.axes.length} axes ` +
          `(${topic.axes.map((axis) => axis.state).join(", ")})`
      );
    }
    for (const entry of view.people) {
      console.log(
        `  person ${entry.person.displayName}: attributable=${entry.attributable}, ` +
          `topics=${entry.topics.length}, axes=${entry.axes.length}`
      );
    }
  }
  return failures === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
