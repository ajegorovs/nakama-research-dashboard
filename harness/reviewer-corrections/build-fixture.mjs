// Build the reviewer-corrections regression fixture from the committed corpus preview fixture.
//
// Why: the committed `harness/preview/fixtures.json` (dataset 'corpus') has no scoped plan, no blocked
// task, a single person and no `list_activity` array, so none of R1–R4 can be exercised locally. This
// script derives a labelled local fixture that injects only what each finding needs, leaving the corpus
// rows otherwise intact. It performs no research write and touches no canonical record (scratch-only).
//
//   bun .hermes/scratch/reviewer-corrections/build-fixture.mjs
//
// (committed copy under harness/reviewer-corrections/ writes fixtures-corrections.json beside itself)
//
// Injected (all labelled synthetic):
//   R1 — a Workstream plan and a Task plan with stored positions 1,2,3,4 plus a 0-position and an
//        unnumbered (null) step, to prove numbering renders stored positions directly.
//   R2 — one axis with tasks in all three states (open, blocked, resolved), so the Project card's open
//        count and the Progress rail's open count can be compared under mixed states.
//   R3 — a second person with a mapped account and a 12-event / 2-event `list_activity` array, so the
//        person activity feed can be paged and its scope switched.
//   R4 — two populated axes to switch between, with 12 tasks on the first (three task pages), so the
//        selection race and the rapid-pager race have subjects.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "../..");
const SRC = path.join(REPO, "harness", "preview", "fixtures.json");
const OUT = path.join(import.meta.dir, "fixtures-corrections.json");

const TOPIC = "440c6597-0365-4b23-b91a-83bd8cd94510";
const AXIS_A = "957aca52-9d2d-41cd-838e-ba0ddb7dd194";
const AXIS_B = "57ab60bf-d8fb-4f0c-87b5-927542267d46";
const NOW = "2026-10-01T00:00:00.000Z";

const d = JSON.parse(readFileSync(SRC, "utf8"));
const r = d.responses;
const topic = r[`get_topic:${TOPIC}`];
const axisA = topic.axes.find((a) => a.id === AXIS_A);
const axisB = topic.axes.find((a) => a.id === AXIS_B);

const step = (planId, i, position, title) => ({
  createdAt: NOW,
  id: `${planId}-s${i}`,
  planId,
  position,
  state: "pending",
  title,
  updatedAt: NOW,
});
const stored = (planId, steps, summary) => ({
  plan: { authorId: "synthetic", authorType: "agent", id: planId, summary, updatedAt: NOW, version: 1 },
  steps,
});

// ---- R1: stored positions 1..4 + a 0 + an unnumbered (null) step --------------------------------
axisA.plan = stored(
  "plan-ws-synth",
  [
    step("plan-ws-synth", 1, 1, "Step one"),
    step("plan-ws-synth", 2, 2, "Step two"),
    step("plan-ws-synth", 3, 3, "Step three"),
    step("plan-ws-synth", 4, 4, "Step four"),
    step("plan-ws-synth", 5, 0, "Step zero"),
    step("plan-ws-synth", 6, null, "Step unnumbered"),
  ],
  "Workstream strategy (synthetic) — stored positions 1..4, a 0, and an unnumbered step."
);
axisB.plan = stored(
  "plan-ws-b-synth",
  [step("plan-ws-b-synth", 1, 1, "B step one")],
  "B workstream strategy (synthetic)."
);

// ---- R2 + R4: mixed states and three task pages on axis A ---------------------------------------
const template = axisA.problems[0];
const mk = (id, state, statement) => ({
  ...template,
  authorId: "synthetic",
  authorType: "human",
  history: [],
  id,
  people: [],
  plan: null,
  planStepId: null,
  planStepTitle: null,
  repositories: [],
  state,
  stateConfidence: "confirmed",
  statement,
  title: "",
  version: 1,
});
const tasks = [
  mk("task-open", "open", "Open task (synthetic)."),
  mk("task-blocked", "blocked", "Blocked task (synthetic)."),
  mk("task-resolved", "resolved", "Resolved task (synthetic)."),
];
for (let i = 0; i < 9; i += 1) {
  tasks.push(mk(`task-resolved-${i + 1}`, "resolved", `Resolved task ${i + 1} (synthetic).`));
}
tasks[0].plan = stored(
  "plan-task-synth",
  [step("plan-task-synth", 1, 1, "Task step one"), step("plan-task-synth", 2, 2, "Task step two")],
  "Task implementation steps (synthetic)."
);
axisA.problems = tasks;

// 1 open, 1 blocked, 10 resolved.
for (const key of Object.keys(r)) {
  if (key.startsWith("get_progress:")) {
    const row = r[key].axes.axes.find((a) => a.id === AXIS_A);
    if (row) {
      row.openProblems = 1;
      row.problems = 12;
    }
  }
  if (key.startsWith("get_overview:")) {
    r[key].problemsByState = { blocked: 1, open: 1, resolved: 10 };
  }
}

// ---- R3: a second person + the scoped activity array --------------------------------------------
const personA = r["get_overview:0"].people[0];
const zeroCounts = Object.fromEntries(Object.keys(personA.axisCounts).map((k) => [k, 0]));
const personB = {
  attributable: true,
  axes: [],
  axisCounts: zeroCounts,
  lastActivityAt: null,
  lastReviewedAt: null,
  person: {
    displayName: "reviewer-b",
    githubLogin: "reviewer-b",
    id: "person-b-0001",
    nakamaUserId: "user_b",
    notes: "",
  },
  recentActivity: [],
  topics: [],
};
for (const key of Object.keys(r)) {
  if (key.startsWith("get_overview:")) {
    r[key].people = [...r[key].people, personB];
  }
}

const event = (id, actorId, summary, at) => ({
  actorId,
  actorType: "human",
  axisId: AXIS_A,
  id,
  observedAt: null,
  occurredAt: at,
  origin: "human",
  recordedAt: at,
  sourceRef: "",
  sourceType: "manual",
  sourceUrl: null,
  summary,
  topicId: TOPIC,
});
const activity = [];
for (let i = 0; i < 12; i += 1) {
  activity.push(event(`ev-a-${i}`, "user_admin", `A event ${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00Z`));
}
for (let i = 0; i < 2; i += 1) {
  activity.push(event(`ev-b-${i}`, "user_b", `B event ${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00Z`));
}
r.list_activity = { activity, ok: true };

d.dataset = "reviewer-corrections-scratch";
d.derivedFrom = "corpus (harness/preview/fixtures.json) + labelled synthetic edge states for R1–R4";
writeFileSync(OUT, JSON.stringify(d, null, 1));
console.log(`wrote ${OUT}`);
console.log(`axis A: ${axisA.id} (12 tasks: 1 open / 1 blocked / 10 resolved) · axis B: ${axisB.id}`);
console.log(`persons: ${r["get_overview:0"].people.map((p) => p.person.displayName).join(", ")}`);
console.log(`list_activity: 12 (user_admin) + 2 (user_b)`);
