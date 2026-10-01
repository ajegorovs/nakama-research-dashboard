#!/usr/bin/env node
// Apply the layout fixture state to a running Nakama instance, through the plugin's own action surface.
//
//   NAKAMA_URL=http://127.0.0.1:4399 NAKAMA_EMAIL=… NAKAMA_PASSWORD=… node harness/apply-layout-fixture.mjs
//   node harness/apply-layout-fixture.mjs --env-file /tmp/nakama-review.env
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

import { loadEnvFileArg } from "./env-file.mjs";

loadEnvFileArg();

const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const BASE = (process.env.NAKAMA_URL ?? "http://127.0.0.1:4399").replace(/\/+$/, "");
const EMAIL = process.env.NAKAMA_EMAIL ?? process.env.NAKAMA_DEV_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_PASSWORD ?? process.env.NAKAMA_DEV_PASSWORD ?? "";

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
      {
        // The seventh state, and the only one neither the corpus nor the earlier fixture reached: given
        // up on deliberately. It is here so the layout has to render `abandoned` as a state rather than
        // as a missing badge, and so all seven reachable axis states have page-level coverage. Where the
        // page puts it in the detail's order is the page's business: the fixture's job is that the state
        // exists somewhere, because a missing badge and a correct badge are indistinguishable otherwise.
        branch: "data/fixture-abandoned",
        currentState: "Given up on: the merged approach lost to the simpler baseline.",
        currentStateConfidence: "confirmed",
        kind: "experiment",
        repositories: [repoLink("fixture/crowded-card")],
        state: "abandoned",
        stateConfidence: "confirmed",
        title: "Fixture: abandoned axis (given up on deliberately)",
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
        // U10 seed: one recorded activity that NAMES a repository, so the Progress feed's repository
        // EntityTag has a subject and its check executes instead of skipping — and the repository it names
        // is linked to no topic and no axis, so the Repositories view renders its `empty` notices ("no topic
        // names it yet", "no axis names this repository") as well. Both are fixture-owned data: no page
        // logic was added to make either render. The name sorts first by full_name, so the repository view's
        // default selection is this bare one and the notices are on screen without a click.
        axisTitle: "Fixture: active axis (with evidence)",
        occurredAt: "2026-10-01T09:05:00+03:00",
        repositoryFullName: "fixture/0-bare-repository",
        sourceRef: "#92",
        sourceType: "github_pr",
        summary: "Fixture: opened the bare-repository PR that no topic or axis claims yet.",
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
      {
        // The abandoned axis keeps one activity so it is not mistaken for the evidence-free axis: the
        // draft axis above is the one that must render "no evidence on record".
        axisTitle: "Fixture: abandoned axis (given up on deliberately)",
        occurredAt: "2026-09-22T10:05:00+03:00",
        sourceRef: "fixture-activity-6",
        sourceType: "manual",
        summary: "Abandoned deliberately: the merged approach lost to the simpler baseline.",
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

// --- Fixture E: a Problem with real structure (contract `fixtures.md` §E) -------------------------
//
// It hangs off an axis and repositories that **already exist**, so nothing about the V1 layout changes:
// the page as it stands renders no problems at all, which is why seeding this cannot disturb the frozen
// baseline. What it has to exercise, per the reviewer: one parent axis; one open Problem on two
// repositories; a person link; an activity tied to the Problem; an evidence/artifact link; a
// human-authored steering note; and a plan with a step the Problem sits on — plus a second Problem with no
// step, no repository and no artifact, so `planStep = null` stays a rendered case rather than an assumption.
//
// It needs **two calls**, and the model forces that rather than taste: within one `reconcile_topic` the
// writes are ordered topic → people → repositories → axes → activities → annotations → plans → problems,
// and row ids are server-generated. An activity or annotation therefore cannot name a problem created in
// the same call, and no caller-supplied id can name a new row.
const FIXTURE_E_AXIS = "Fixture: active axis (with evidence)";
const FIXTURE_E_PERSON = "Fixture Alpha";
const FIXTURE_E_TOPIC = "Layout fixture — crowded card";
const FIXTURE_E_STEP_1 = "Fixture step 1: reproduce the disagreement on the second rig pass";
const FIXTURE_E_STEP_2 = "Fixture step 2: reconcile the two rigs' floors";
const FIXTURE_E_ON_STEP =
  "Fixture E: the two rigs disagree on the loss floor by more than the reported spread.";
const FIXTURE_E_UNLINKED =
  "Fixture E: no plan step, no repository and no artifact on purpose — this one must still render.";
const FIXTURE_E_EVENT_REF = "fixture-activity-7";
const FIXTURE_E_EVIDENCE_REF = "fixture-evidence-1";
const FIXTURE_E_EVIDENCE_URL = "https://example.invalid/fixture/rig-floor-comparison";
const FIXTURE_E_EVENT =
  "Fixture E: rig two's floor measured 4% below rig one's on the same seed.";
const FIXTURE_E_EVIDENCE_SUMMARY =
  "Fixture E: logged the rig-floor comparison sheet as the artifact both rigs are measured against.";
const FIXTURE_E_NOTE =
  "Fixture E evidence link: the rig-floor comparison sheet both rigs are measured against.";
const FIXTURE_E_STEERING =
  "Fixture E (human-authored steering): do not reconcile the two floors by widening the reported spread.";
// The unordered-plan case (U4 step 3). The model allows one plan per axis and Fixture E's axis already has
// one, so this goes on a different fixture axis — the parked one, which has no problems either, giving the
// plan section a case where it renders with both columns above it empty. The titles are written in reverse
// alphabetical order so that any client-side sort (alphabetical, or by anything but the store's own order)
// would visibly reorder them.
const FIXTURE_E_UNORDERED_AXIS = "Fixture: parked axis (inferred state)";
const FIXTURE_E_UNORDERED_FIRST = "Fixture E: unordered step — zulu, written first";
const FIXTURE_E_UNORDERED_SECOND = "Fixture E: unordered step — alpha, written second";
const FIXTURE_E_UNORDERED_SUMMARY =
  "Fixture E: an unordered checklist, so nothing about it claims a sequence.";
// U4 step 4's case: a problem on the same axis that has been **closed out**. The inventory may not list it,
// and without one the rule "open problems only" would be untestable — the check would pass on a dataset that
// simply had no resolved problem to leak.
const FIXTURE_E_RESOLVED =
  "Fixture E: closed out — the second rig's floor was traced to a stale calibration file.";
// And the axis-scope case: a human claim aimed at the axis, which must appear as the axis context and must
// **not** be copied under the problems beneath it. (`FIXTURE_E_NOTE` above is the other discriminator: the
// same problem carries an ordinary note, which the steering section may not show.)
const FIXTURE_E_AXIS_STEERING =
  "Fixture E (axis steering): treat this axis as usable, not complete, until both rigs agree.";

/**
 * Fixture E, idempotently. Re-applying the fixture must not pile up duplicates, and problems have no
 * natural key in the model — the statement is used as one **here**, which is a fixture convention, not a
 * guarantee the store makes. Activities dedupe on `sourceRef` and annotations on their exact text, both
 * read back from the instance first.
 */
async function applyFixtureE(headers) {
  const act = async (key, input) => {
    const { body, status } = await call(
      `/v1/plugins/${PLUGIN_ID}/actions/${key}`,
      { input },
      headers
    );
    return { ok: status === 200 && body?.result?.ok === true, result: body?.result, raw: body };
  };
  const fail = (what, raw) => {
    console.error(`FAILED  fixture E: ${what}: ${JSON.stringify(raw).slice(0, 240)}`);
    return 1;
  };

  const progress = await act("get_progress", { activitySinceDays: 0 });
  if (!progress.ok) {
    return fail("reading the current state", progress.raw);
  }
  const axisRow = (progress.result.axes?.axes ?? []).find(
    (row) => row.topicName === FIXTURE_E_TOPIC && row.title === FIXTURE_E_AXIS
  );
  if (!axisRow) {
    return fail(`no axis "${FIXTURE_E_AXIS}" on "${FIXTURE_E_TOPIC}"`, progress.raw);
  }
  const onAxis = (progress.result.problems?.problems ?? []).filter(
    (row) => row.topicName === FIXTURE_E_TOPIC && row.axisTitle === FIXTURE_E_AXIS
  );
  const haveOnStep = onAxis.find((row) => row.statement === FIXTURE_E_ON_STEP);
  const haveUnlinked = onAxis.find((row) => row.statement === FIXTURE_E_UNLINKED);

  // Call 1 — the plan (with the step the problem will name) and whichever problem is missing. Steps have no
  // natural key either, so the plan is treated as present once it carries the step title, and when it does
  // exist but lack that step, only the **missing step** is sent: re-sending step 1 would add it again.
  const planId = axisRow.plan?.id ?? "";
  const plannedStep =
    (axisRow.plan?.steps ?? []).find((step) => step.title === FIXTURE_E_STEP_2) ?? null;
  const needsPlan = !plannedStep;
  if (needsPlan || !haveOnStep || !haveUnlinked) {
    const payload = { topicName: FIXTURE_E_TOPIC };
    if (needsPlan) {
      payload.plans = [
        {
          ...(planId ? { planId } : {}),
          axisTitle: FIXTURE_E_AXIS,
          steps: planId
            ? [{ position: 1, state: "active", title: FIXTURE_E_STEP_2 }]
            : [
                { position: 0, state: "done", title: FIXTURE_E_STEP_1 },
                { position: 1, state: "active", title: FIXTURE_E_STEP_2 },
              ],
          summary: "Fixture E: two staged steps, so a problem can name the one it is working on.",
        },
      ];
    }
    payload.problems = [];
    if (!haveOnStep) {
      payload.problems.push({
        axisTitle: FIXTURE_E_AXIS,
        repositoryFullNames: ["fixture/crowded-card", "fixture/second-topic"],
        statement: FIXTURE_E_ON_STEP,
      });
    }
    if (!haveUnlinked) {
      payload.problems.push({ axisTitle: FIXTURE_E_AXIS, statement: FIXTURE_E_UNLINKED });
    }
    const seeded = await act("reconcile_topic", payload);
    if (!seeded.ok) {
      return fail("creating the problems / plan", seeded.raw);
    }
    const created = seeded.result.problems ?? [];
    console.log(
      `fixture E: created ${created.length} problem(s), ` +
        `${payload.plans ? (planId ? "1 step added to the existing plan" : "1 plan with 2 steps") : "plan already present"}`
    );
  } else {
    console.log("fixture E: the problems and plan are already there — nothing to create");
  }

  // ---- Fixture E's unordered plan, on an axis that has none -------------------------------------------
  // U4 step 3's edge case: a plan whose steps claim **no positions at all**. Written in two calls with a
  // pause between, because `listPlanSteps` orders unpositioned steps by `created_at` and then `id`: one call
  // would leave both rows in the same millisecond and hand their order to a random id, so the fixture — and
  // therefore the check that compares the page against the projection — would not be reproducible.
  const unorderedRow = (progress.result.axes?.axes ?? []).find(
    (row) => row.topicName === FIXTURE_E_TOPIC && row.title === FIXTURE_E_UNORDERED_AXIS
  );
  if (!unorderedRow) {
    return fail(`no axis "${FIXTURE_E_UNORDERED_AXIS}" on "${FIXTURE_E_TOPIC}"`, progress.raw);
  }
  const haveUnorderedPlan = (unorderedRow.plan?.steps ?? []).some(
    (step) => step.title === FIXTURE_E_UNORDERED_FIRST
  );
  if (haveUnorderedPlan) {
    console.log("fixture E: the unordered plan is already there — nothing to create");
  } else {
    const plan = {
      axisTitle: FIXTURE_E_UNORDERED_AXIS,
      steps: [
        { position: null, state: "pending", title: FIXTURE_E_UNORDERED_FIRST },
      ],
      summary: FIXTURE_E_UNORDERED_SUMMARY,
    };
    const first = await act("reconcile_topic", {
      plans: [plan],
      topicName: FIXTURE_E_TOPIC,
    });
    if (!first.ok) {
      return fail("creating the unordered plan", first.raw);
    }
    const unorderedPlanId = first.result.plans?.[0]?.id ?? "";
    await new Promise((resolve) => setTimeout(resolve, 250));
    const second = await act("reconcile_topic", {
      plans: [
        {
          ...(unorderedPlanId ? { planId: unorderedPlanId } : {}),
          axisTitle: FIXTURE_E_UNORDERED_AXIS,
          steps: [
            { position: null, state: "pending", title: FIXTURE_E_UNORDERED_SECOND },
          ],
          summary: FIXTURE_E_UNORDERED_SUMMARY,
        },
      ],
      topicName: FIXTURE_E_TOPIC,
    });
    if (!second.ok) {
      return fail("adding the second unordered step", second.raw);
    }
    console.log(
      `fixture E: created an unordered plan on "${FIXTURE_E_UNORDERED_AXIS}" — 2 steps, no positions, ` +
        `written "zulu" before "alpha" so any client-side sort would flip them`
    );
  }

  // ---- Fixture E's closed-out problem ------------------------------------------------------------------
  // U4 step 4 lists the axis's *open* problems. This one is created and then resolved through the action
  // surface (a problem's state changes only through `transitions[]`), so the inventory has something it must
  // exclude: without it, "open problems only" is a rule nothing on the dataset could break.
  const haveResolved = onAxis.find((row) => row.statement === FIXTURE_E_RESOLVED);
  if (haveResolved) {
    console.log("fixture E: the closed-out problem is already there — nothing to create");
  } else {
    const created = await act("reconcile_topic", {
      problems: [{ axisTitle: FIXTURE_E_AXIS, statement: FIXTURE_E_RESOLVED }],
      topicName: FIXTURE_E_TOPIC,
    });
    if (!created.ok) {
      return fail("creating the closed-out problem", created.raw);
    }
    // Its id is the store's, so it is read back rather than assumed — the same two-pass shape as the rest.
    const reread = await act("get_progress", { activitySinceDays: 0 });
    if (!reread.ok) {
      return fail("reading the closed-out problem back", reread.raw);
    }
    const target = (reread.result.problems?.problems ?? []).find(
      (row) => row.statement === FIXTURE_E_RESOLVED
    );
    if (!target) {
      return fail("the closed-out problem is not readable after the write", reread.raw);
    }
    const resolved = await act("reconcile_topic", {
      topicName: FIXTURE_E_TOPIC,
      transitions: [{ problemId: target.id, subject: "problem", toState: "resolved" }],
    });
    if (!resolved.ok) {
      return fail("resolving the closed-out problem", resolved.raw);
    }
    console.log(
      `fixture E: created and resolved one problem — the inventory has a row it must not list (${target.state} → resolved)`
    );
  }

  // ---- Fixture E's axis-scoped steering claim -----------------------------------------------------------
  // The other half of target specificity: a human claim aimed at the **axis**. It must render as the axis
  // context and must not appear under the problems beneath it, which is only checkable if one exists.
  const haveAxisSteering = await act("get_topic", { topicName: FIXTURE_E_TOPIC }).then((read) => {
    const axisRows = read.result.axes ?? [];
    return axisRows.some((axis) =>
      (axis.notes ?? []).some((note) => note.text === FIXTURE_E_AXIS_STEERING)
    );
  });
  if (haveAxisSteering) {
    console.log("fixture E: the axis-scoped steering claim is already there — nothing to create");
  } else {
    const claimed = await act("reconcile_topic", {
      annotations: [{ axisTitle: FIXTURE_E_AXIS, kind: "steering", text: FIXTURE_E_AXIS_STEERING }],
      topicName: FIXTURE_E_TOPIC,
    });
    if (!claimed.ok) {
      return fail("creating the axis-scoped steering claim", claimed.raw);
    }
    console.log(
      `fixture E: created one axis-scoped human steering claim — ${JSON.stringify(FIXTURE_E_AXIS_STEERING.slice(0, 40))}…`
    );
  }

  // Re-read, so the ids are the store's own rather than anything assumed from the write.
  const after = await act("get_progress", { activitySinceDays: 0 });
  if (!after.ok) {
    return fail("reading the problems back", after.raw);
  }
  const rows = (after.result.problems?.problems ?? []).filter(
    (row) => row.topicName === FIXTURE_E_TOPIC && row.axisTitle === FIXTURE_E_AXIS
  );
  const onStep = rows.find((row) => row.statement === FIXTURE_E_ON_STEP);
  const unlinked = rows.find((row) => row.statement === FIXTURE_E_UNLINKED);
  if (!onStep || !unlinked) {
    return fail("the problems are not readable after the write", after.raw);
  }
  // Read the topic back once: the step it must link to, the people on the axis, and what is already there.
  const topic = await act("get_topic", { topicName: FIXTURE_E_TOPIC, includeAnnotations: true });
  if (!topic.ok) {
    return fail("reading the topic back", topic.raw);
  }
  const afterAxis = (after.result.axes?.axes ?? []).find(
    (row) => row.topicName === FIXTURE_E_TOPIC && row.title === FIXTURE_E_AXIS
  );
  let stepId = onStep.planStepId ?? "";
  if (!stepId) {
    // The step the problem belongs to. Its id cannot be known before call 1 (the store mints it), so the
    // link is written in call 2 — the same two-pass shape as the activity and the annotations.
    const steps = afterAxis?.plan?.steps ?? [];
    stepId = (steps.find((step) => step.title === FIXTURE_E_STEP_2) ?? steps[1] ?? {}).id ?? "";
  }
  if (!stepId) {
    return fail("the fixture plan has no step to link the problem to", after.raw);
  }
  if (unlinked.planStepId !== null) {
    // The null case is the contract's, not a convenience: a problem must stay meaningful with no plan.
    return fail(`the unlinked problem has planStepId=${unlinked.planStepId}, expected null`, after.raw);
  }

  // The person to link, taken from the **axis** rather than looked up by name over the whole instance: on a
  // shared instance the fixture's own person is the corpus person (the attribution bleed the isolated rerun
  // exposed), so a by-name lookup finds nothing and a by-axis lookup finds the right person either way.
  const axisPeople =
    (topic.result?.axes ?? []).find((axis) => axis.title === FIXTURE_E_AXIS)?.people ?? [];
  const person =
    axisPeople.find((entry) => entry.displayName === FIXTURE_E_PERSON) ?? axisPeople[0] ?? null;
  if (!person) {
    return fail(`no person on "${FIXTURE_E_AXIS}" to link the problem to`, topic.raw);
  }
  const personId = person.id;
  if (person.displayName !== FIXTURE_E_PERSON) {
    console.log(
      `fixture E: this instance's "${FIXTURE_E_AXIS}" carries ${person.displayName} rather than ` +
        `"${FIXTURE_E_PERSON}" — a shared instance merges the two, so the link follows the axis`
    );
  }

  // Call 2 — everything that references a problem by id. Each piece is written only if it is not there.
  //
  // The "is it there" reads come from `get_progress`, not from the topic detail or the activity feed, and
  // that is a correctness point rather than a preference: this problem's own evidence and claims are
  // **problem-targeted**, so they do not appear in the topic's annotations (targeted at the topic) nor in an
  // axis-scoped activity list that is capped per axis. Reading those lists made the guard blind to rows the
  // fixture itself had written — so every application added another copy of its activity, its evidence record
  // and its claims. The projection the page reads is the one read that shows them.
  const alreadyLinked = (onStep.people ?? []).some((linked) => linked.id === personId);
  const projection = await act("get_progress", {});
  if (!projection.ok) {
    return fail("reading the Progress projections back", projection.raw);
  }
  const linkedRow = (projection.result.problems?.problems ?? []).find((row) => row.id === onStep.id) ?? {};
  const annotationTexts = new Set(
    (linkedRow.steering ?? []).map((claim) => claim.text).concat(
      (topic.result?.annotations ?? []).map((annotation) => annotation.text)
    )
  );
  const sourceRefs = new Set(
    (linkedRow.evidence ?? []).map((item) => item.sourceRef).filter(Boolean)
  );

  const link = { topicName: FIXTURE_E_TOPIC };
  if (!sourceRefs.has(FIXTURE_E_EVENT_REF)) {
    link.activities = [
      {
        axisTitle: FIXTURE_E_AXIS,
        occurredAt: "2026-10-01T15:20:00+03:00",
        problemId: onStep.id,
        sourceRef: FIXTURE_E_EVENT_REF,
        sourceType: "experiment",
        summary: FIXTURE_E_EVENT,
      },
    ];
  }
  if (!sourceRefs.has(FIXTURE_E_EVIDENCE_REF)) {
    // The evidence/artifact link is an activity carrying the artifact reference: annotations have no
    // source fields (`fixtures.md` §E asks for a link, and this is where the model keeps one).
    link.activities = [
      ...(link.activities ?? []),
      {
        axisTitle: FIXTURE_E_AXIS,
        occurredAt: "2026-10-01T15:25:00+03:00",
        problemId: onStep.id,
        sourceRef: FIXTURE_E_EVIDENCE_REF,
        sourceType: "repo_document",
        sourceUrl: FIXTURE_E_EVIDENCE_URL,
        summary: FIXTURE_E_EVIDENCE_SUMMARY,
      },
    ];
  }
  const missingAnnotations = [
    // The note is problem-targeted, and **no read exposes a problem's plain notes** — the projection carries
    // claims, not notes, and the topic detail only lists notes aimed at the topic or an axis. So unlike the
    // others it cannot guard itself by text; it rides on the evidence guard, which the projection does expose.
    // Without that, a re-apply would silently add a second copy of it.
    ...(sourceRefs.has(FIXTURE_E_EVIDENCE_REF)
      ? []
      : [{ axisTitle: FIXTURE_E_AXIS, kind: "note", problemId: onStep.id, text: FIXTURE_E_NOTE }]),
    // The steering claim names the **problem alone**: a claim kind must sit on exactly one target, and an
    // axis link alongside the problem link is the two-target row the schema refuses. (The note above may
    // carry both, which is how the corpus's own notes are shaped.)
    { kind: "steering", problemId: onStep.id, text: FIXTURE_E_STEERING },
  ].filter((annotation) => !annotationTexts.has(annotation.text));
  if (missingAnnotations.length > 0) {
    link.annotations = missingAnnotations;
  }
  const needsStepLink = onStep.planStepId !== stepId;
  const linkProblem =
    !alreadyLinked || needsStepLink
      ? {
          planStepId: stepId,
          problemId: onStep.id,
          statement: FIXTURE_E_ON_STEP,
          ...(alreadyLinked ? {} : { personIds: [personId] }),
        }
      : null;

  if (Object.keys(link).length > 1 || linkProblem) {
    const referenced = await act("reconcile_topic", {
      ...link,
      ...(linkProblem ? { problems: [linkProblem] } : {}),
    });
    if (!referenced.ok) {
      return fail("linking the activity/evidence/annotations/person/step", referenced.raw);
    }
    console.log(
      `fixture E: linked ${(link.activities ?? []).length} activity/evidence record(s), ` +
        `${(link.annotations ?? []).length} annotation(s)` +
        `${linkProblem ? `, the plan step and${alreadyLinked ? " " : " the person and "}link` : ""}`
    );
  } else {
    console.log("fixture E: the activity, evidence, annotations and person link are already there");
  }

  const final = await act("get_progress", { activitySinceDays: 0 });
  const finalOnStep = (final.result?.problems?.problems ?? []).find(
    (row) => row.statement === FIXTURE_E_ON_STEP
  );
  const finalUnlinked = (final.result?.problems?.problems ?? []).find(
    (row) => row.statement === FIXTURE_E_UNLINKED
  );
  if (!finalOnStep || !finalUnlinked) {
    return fail("the fixture is not readable through get_progress", final.raw);
  }
  console.log(
    `fixture E: problem on a step — ${finalOnStep.repositories.length} repositories, ` +
      `${finalOnStep.people.length} person, ${finalOnStep.activityCount} activity record(s), ` +
      `step "${finalOnStep.planStepTitle}", history ${finalOnStep.history.length} row(s)`
  );
  console.log(
    `fixture E: problem with nothing behind it — repositories ${finalUnlinked.repositories.length}, ` +
      `step ${finalUnlinked.planStepTitle === null ? "null" : finalUnlinked.planStepTitle}, ` +
      `history ${finalUnlinked.history.length} row(s)`
  );
  return 0;
}

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
  const login = await call("/v1/auth/login", { email: EMAIL, password: PASSWORD }).catch((error) => {
    console.error(
      `cannot reach ${BASE} (${error?.cause?.code ?? error.message}) — is the instance running, ` +
        "and is NAKAMA_URL right?"
    );
    return { body: null, status: 0 };
  });
  if (login.status === 0) {
    return 1; // the reason was printed by the catch above
  }
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
  /**
   * What a topic already carries, so applying the fixture twice does not double its events.
   *
   * `reconcile_topic` appends: nothing in the model makes an activity or an annotation unique by text. The
   * fixture pack is therefore the layer that has to be idempotent, and it is idempotent by the only durable
   * handle it has — the `sourceRef` of an activity and the text of a claim. Without this, the fixture's event
   * counts drift with the number of applies, and a reviewer's numbers differ from ours on the same dataset.
   */
  const recorded = new Map();
  const alreadyRecorded = async (topicName, headers) => {
    const cached = recorded.get(topicName);
    if (cached) {
      return cached;
    }
    const { body } = await call(
      `/v1/plugins/${PLUGIN_ID}/actions/get_topic`,
      { input: { topicName } },
      headers
    );
    const detail = body?.result ?? {};
    const refs = new Set();
    const texts = new Set();
    for (const axis of detail.axes ?? []) {
      for (const item of axis.items ?? []) {
        if (item.sourceRef) {
          refs.add(item.sourceRef);
        }
      }
      for (const note of axis.notes ?? []) {
        if (note.text) {
          texts.add(note.text);
        }
      }
    }
    // The topic's own log is a different shape from an axis's items — full activities, notes beside it.
    for (const activity of detail.activity ?? []) {
      if (activity.sourceRef) {
        refs.add(activity.sourceRef);
      }
    }
    for (const note of detail.notes ?? []) {
      if (note.text) {
        texts.add(note.text);
      }
    }
    const entry = { refs, texts };
    recorded.set(topicName, entry);
    return entry;
  };
  for (const entry of FIXTURE) {
    const headers = { "x-csrf-token": csrf, "x-org-id": orgId };
    const seen = await alreadyRecorded(entry.topicName, headers);
    const activities = (entry.activities ?? []).filter(
      (row) => !row.sourceRef || !seen.refs.has(row.sourceRef)
    );
    const annotations = (entry.annotations ?? []).filter(
      (row) => !row.text || !seen.texts.has(row.text)
    );
    const { status, body } = await call(
      `/v1/plugins/${PLUGIN_ID}/actions/reconcile_topic`,
      {
        input: {
          activities,
          annotations,
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

  // Fixture E needs a second pass that references the problems it creates, so it runs after the loop.
  failures += await applyFixtureE({ "x-csrf-token": csrf, "x-org-id": orgId });

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
