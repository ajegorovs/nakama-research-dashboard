#!/usr/bin/env bun
/**
 * scale-fixture-calls.mjs — a large, deterministic *third* dataset for the preview.
 *
 * The corpus is the real dataset and `fixture` is the edge-state pack; both are small. This is the
 * oversized one: it exists to show the page when the records stop fitting — many topics, axes and
 * problems (past the store's rollup caps), labels long enough to wrap, activity piled on a few axes and
 * absent on most, and subjects that are legitimately empty (a topic with no axes, an axis with nothing
 * behind it, a repository no topic claims, a person with no mapped account, a problem with no support).
 *
 * It is a **separate** dataset, not a replacement for `fixture`: apply one or the other, never merge.
 *
 * Like every other dataset here it is *built, not written*: this module only declares the writes, as
 * `reconcile_topic` payloads, and `make-fixtures.mjs` replays them through the real action layer
 * (`src/actions.ts`) and asks that layer for the read payloads. Nothing here is a hand-written
 * projection — a pre-baked JSON fixture would drift from what the server answers the moment the store
 * changed, which is the one thing the preview must not do.
 *
 * The shape of the writes is the model's own, not a convenience:
 *   - a topic is one call; within it the store orders topic → people → repositories → axes →
 *     activities → annotations → plans → problems, so a problem may name an axis created in the same
 *     call by title, but **not** a plan step or a person id the store mints later;
 *   - the states that need a store-minted id (a problem's evidence, its steering claim, its plan-step
 *     link, a recorded resolution) are therefore written in a second pass, exactly as Fixture E is —
 *     see `applyScaleLinksWith`, which reads the ids back from `get_progress` / `get_topic`.
 *
 * Determinism: the dataset is a pure function of this file. Times are offsets from a fixed base, names
 * are index-driven, and the one pseudo-random stream is seeded — so two builds carry the same subjects
 * (ids and `generatedAt` are the store's and differ, as they must).
 *
 *   bun harness/preview/scale-fixture-calls.mjs --check   # print what it declares
 */

// ── fixed clock and a seeded stream, so a rebuild lands on the same subjects ────────────────────────
const BASE_MS = Date.parse("2026-10-03T09:00:00.000Z");
/** An ISO instant `daysAgo` before the fixed base, offset by `minutes` for stable ordering. */
const at = (daysAgo, minutes = 0) =>
  new Date(BASE_MS - daysAgo * 86_400_000 - minutes * 60_000).toISOString();

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const repoLink = (fullName) => ({ fullName });
const person = (displayName, extra = {}) => ({ displayName, ...extra });
const repo = (fullName, description) => ({ description, fullName, relationship: "primary" });
const clip = (text, max) => (text.length <= max ? text : text.slice(0, max));

// ── the subjects the assertions and the capture look for, declared once, by name ────────────────────
// Exported so `test-scale-fixture.mjs` can assert the payloads carry *these* subjects without
// restating the dataset. These are the fixture's own labels, not a projection of the read model.
export const SCALE_SUBJECTS = {
  bareRepository: "scale-org/scale-bare-only",
  emptyTopic: "Scale fixture — empty subject (no axes, nobody, nothing recorded)",
  evidenceFreeAxis: "Scale fixture: evidence-free axis (inferred, nothing behind it)",
  heroProblem:
    "Scale fixture: hero problem on a plan step, carrying repositories, a person, evidence and steering.",
  heroTopic: "Scale fixture — hero topic (dense axes and problems)",
  longAxisTitle: null, // filled below from the generated literal
  longPerson: "Scale Person With A Deliberately Long Display Name That Has To Be Allowed To Wrap Without Breaking The Row Layout",
  longRepository: "scale-org/scale-repo-with-a-deliberately-long-name-segment-repeated-to-force-wrapping-in-the-repository-column-of-the-dashboard",
  longTopic: null, // filled below
  mappedPerson: "Scale Person 01",
  unmappedPerson: "Scale Person 05 (no mapped account)",
  supportlessProblem:
    "Scale fixture: problem with no repository, no plan step and no artifact — it must still render.",
  toResolveProblem:
    "Scale fixture: problem closed out — the inventory must not list it once resolved.",
};

// Long but inside the schema's own limits (topic name ≤120, axis title ≤160, repo ≤200).
const LONG_TOPIC_NAME = clip(
  "Scale fixture — a deliberately very long topic name that keeps going to force the topic column to wrap rather than truncate silently",
  119
);
const LONG_TOPIC_SUMMARY = clip(
  "Scale fixture: this topic's summary is deliberately enormous so the overview has a subject whose prose, not its structure, is what overflows. ".repeat(30),
  3990
);
const LONG_AXIS_TITLE = clip(
  "Scale fixture: an axis title long enough to wrap across several lines and to be truncated by any component that assumes a title fits on one — the point is that nothing here may quietly drop characters",
  158
);
const LONG_ACTIVITY = clip(
  "Scale fixture: a deliberately long activity summary. ".repeat(20) +
    "The activity column must show it without pushing the rest of the row off the page.",
  980
);
const LONG_PROBLEM = clip(
  "Scale fixture: a problem statement this long exists only to prove the detail column wraps it instead of clipping it. ".repeat(18),
  1980
);
SCALE_SUBJECTS.longAxisTitle = LONG_AXIS_TITLE;
SCALE_SUBJECTS.longTopic = LONG_TOPIC_NAME;

// ── the dataset's declared shape, index-driven and reproducible ─────────────────────────────────────
// Topic 0 is the empty subject; topic 1 is the hero (plan step + evidence + steering); topic 12 carries
// the long topic name and summary; topic 13 carries the long axis/repo/person/activity/problem labels.
const TOPIC_DEFS = [
  { name: SCALE_SUBJECTS.emptyTopic, axes: 0 },
  { name: SCALE_SUBJECTS.heroTopic, axes: 7 },
  { name: "Scale fixture — dense topic 2", axes: 6 },
  { name: "Scale fixture — dense topic 3", axes: 5 },
  { name: "Scale fixture — sparse topic 4", axes: 4 },
  { name: "Scale fixture — sparse topic 5", axes: 3 },
  { name: "Scale fixture — dense topic 6", axes: 6 },
  { name: "Scale fixture — dense topic 7", axes: 5 },
  { name: "Scale fixture — sparse topic 8", axes: 4 },
  { name: "Scale fixture — sparse topic 9", axes: 3 },
  { name: "Scale fixture — dense topic 10", axes: 7 },
  { name: "Scale fixture — dense topic 11", axes: 6 },
  { name: LONG_TOPIC_NAME, axes: 5 },
  { name: "Scale fixture — long labels", axes: 1 },
];

const AXIS_STATES = ["active", "usable", "draft", "blocked", "parked", "completed", "abandoned"];
const KINDS = ["feature", "experiment", "test", "investigation", "maintenance"];
const pad = (n, width = 2) => String(n).padStart(width, "0");
const axisKey = (topicIndex, axisIndex) => `t${pad(topicIndex)}-a${pad(axisIndex)}`;

/** One axis input, with the states and the evidence the store's claim rule allows. */
function buildAxis(topicIndex, axisIndex, globalIndex, options) {
  const key = axisKey(topicIndex, axisIndex);
  if (options.evidenceFree) {
    // The axis nothing can back: no branch, no PR, no activity, no note. Its state has to read as
    // inferred, and its absence of a current-state claim has to render as no-confidence, not as a guess.
    return {
      kind: "maintenance",
      repositories: [repoLink(options.repository)],
      state: "draft",
      stateConfidence: "inferred",
      title: options.title ?? `Scale fixture: ${key} — evidence-free axis`,
    };
  }
  const state = options.state;
  const input = {
    branch: `scale/${key}`,
    currentState: `Scale fixture: ${key} is ${state}; recorded so the detail has a claim to show.`,
    currentStateConfidence: "confirmed",
    kind: KINDS[globalIndex % KINDS.length],
    repositories: [repoLink(options.repository)],
    state,
    stateConfidence: "confirmed",
    title: options.title ?? `Scale fixture: ${key} — ${state} axis`,
  };
  if (options.people) input.people = options.people;
  if (state === "blocked") {
    input.blocker = `Scale fixture: ${key} is waiting on the rig firmware window.`;
    input.blockerConfidence = "confirmed";
  }
  if (options.pr) {
    input.prNumber = options.pr;
    input.prUrl = `https://example.invalid/scale/pull/${options.pr}`;
  }
  return input;
}

/**
 * The whole first-pass dataset: one `reconcile_topic` call per topic, in the order the store expects.
 * Nothing here references a store-minted id — that is what the second pass (`applyScaleLinksWith`) is for.
 */
export function scaleFixtureCalls() {
  const random = mulberry32(0x5ca1e);
  const calls = [];
  let globalAxis = 0;

  for (let topicIndex = 0; topicIndex < TOPIC_DEFS.length; topicIndex += 1) {
    const def = TOPIC_DEFS[topicIndex];
    const isLong = topicIndex === 13;
    const input = {
      activities: [],
      annotations: [],
      axes: [],
      people: [],
      plans: [],
      problems: [],
      repositories: [],
      topic: {
        summary:
          topicIndex === 12
            ? LONG_TOPIC_SUMMARY
            : `Scale fixture: synthetic topic ${pad(topicIndex)} of ${TOPIC_DEFS.length} — declared for preview scale only.`,
      },
      topicName: def.name,
    };

    if (topicIndex === 0) {
      // The empty subject: a topic with a name and a summary and nothing else. It still has to appear
      // on the overview without a crash and without pretending it carries axes.
      calls.push({ action: "reconcile_topic", input });
      continue;
    }

    // People: every non-empty topic carries the shared person (so one row spans topics) plus its own —
    // except topic 5 whose local person has no account, and topic 13 whose person has a long name.
    input.people.push(
      person(SCALE_SUBJECTS.mappedPerson, { nakamaUserId: "scale-user-shared", role: "owner" })
    );
    if (isLong) {
      input.people.push(person(SCALE_SUBJECTS.longPerson, { role: "reviewer" }));
    } else if (topicIndex === 5) {
      input.people.push(person(SCALE_SUBJECTS.unmappedPerson, { role: "reviewer" }));
    } else {
      input.people.push(person(`Scale Person ${pad(topicIndex)}`, { nakamaUserId: `scale-user-${pad(topicIndex)}`, role: "contributor" }));
    }

    const topicRepo = isLong
      ? SCALE_SUBJECTS.longRepository
      : `scale-org/scale-repo-${pad(topicIndex)}`;
    input.repositories.push(repo(topicRepo, `Scale fixture repository for topic ${pad(topicIndex)} (synthetic).`));

    for (let axisIndex = 0; axisIndex < def.axes; axisIndex += 1) {
      const key = axisKey(topicIndex, axisIndex);
      const state = AXIS_STATES[globalAxis % AXIS_STATES.length];
      // The designated evidence-free axis: the hero topic's second axis, so the Progress index shows one
      // row with no state behind it next to rows that are backed.
      const evidenceFree = topicIndex === 1 && axisIndex === 1;
      // A second repository, so repositories roll up from more than one axis and the column is populated.
      const repository =
        isLong && axisIndex === 0
          ? SCALE_SUBJECTS.longRepository
          : axisIndex % 2 === 0
            ? topicRepo
            : `scale-org/scale-repo-${pad(topicIndex)}-secondary`;
      if (axisIndex % 2 === 1 && !(isLong && axisIndex === 0)) {
        input.repositories.push(repo(repository, `Secondary scale fixture repository (synthetic).`));
      }
      const people =
        topicIndex === 1 && axisIndex === 0
          ? [person(SCALE_SUBJECTS.mappedPerson, { nakamaUserId: "scale-user-shared", role: "owner" })]
          : undefined;
      input.axes.push(
        buildAxis(topicIndex, axisIndex, globalAxis, {
          evidenceFree,
          people,
          pr: axisIndex === 0 && topicIndex % 4 === 0 ? 1000 + topicIndex : undefined,
          repository,
          state,
          title:
            isLong && axisIndex === 0
              ? LONG_AXIS_TITLE
              : evidenceFree
                ? SCALE_SUBJECTS.evidenceFreeAxis
                : undefined,
        })
      );
      globalAxis += 1;
    }

    // Activities — deliberately uneven. The hero topic's first axis carries twenty-four events spread
    // across 45 days, so the 7/14/30/all windows disagree instead of moving together; the bare
    // repository is named only here; and the long-labels topic carries the long summary. Most axes get
    // none, which is the other half of "uneven".
    if (topicIndex === 1) {
      for (let k = 0; k < 24; k += 1) {
        input.activities.push({
          axisTitle: input.axes[0].title,
          occurredAt: at((k * 2) % 46, k),
          sourceRef: `scale-hero-${pad(k)}`,
          sourceType: k % 3 === 0 ? "experiment" : "manual",
          summary: `Scale fixture: hero event ${pad(k)} — the dense axis so the window counts differ.`,
        });
      }
      input.activities.push({
        // Names a repository that no topic and no axis claims, so the Repositories view has a subject
        // that renders its empty notices.
        axisTitle: input.axes[0].title,
        occurredAt: at(3, 5),
        repositoryFullName: SCALE_SUBJECTS.bareRepository,
        sourceRef: "#9001",
        sourceType: "github_pr",
        summary: "Scale fixture: opened the bare-repository PR that no topic or axis claims yet.",
      });
    } else if (topicIndex === 5) {
      for (let k = 0; k < 3; k += 1) {
        input.activities.push({
          axisTitle: input.axes[0].title,
          occurredAt: at(2 + k * 9, k),
          sourceRef: `scale-t05-${pad(k)}`,
          sourceType: "manual",
          summary: `Scale fixture: an event on a sparse topic, ${pad(k)}.`,
        });
      }
    } else if (isLong) {
      input.activities.push({
        axisTitle: LONG_AXIS_TITLE,
        occurredAt: at(1, 3),
        sourceRef: "scale-long-activity",
        sourceType: "repo_document",
        summary: LONG_ACTIVITY,
        sourceUrl: "https://example.invalid/scale/long/activity",
      });
    } else if (topicIndex % 2 === 0) {
      input.activities.push({
        axisTitle: input.axes[0].title,
        occurredAt: at(6 + (random() * 20) | 0, 0),
        sourceRef: `scale-t${pad(topicIndex)}-event`,
        sourceType: "manual",
        summary: `Scale fixture: one recorded event on ${def.name}.`,
      });
    }

    // Annotations — topic notes, an axis note, and two axis-scoped steering claims.
    input.annotations.push({
      text: `Scale fixture: topic-level note on ${def.name}.`,
    });
    if (topicIndex % 3 === 0) {
      input.annotations.push({
        axisTitle: input.axes[0].title,
        kind: "note",
        text: `Scale fixture: a note against ${keyOf(input, 0)}.`,
      });
    }
    if (topicIndex === 1 || topicIndex === 6) {
      input.annotations.push({
        axisTitle: input.axes[0].title,
        kind: "steering",
        text: `Scale fixture (axis steering): treat ${keyOf(input, 0)} as usable, not complete, until the rigs agree.`,
      });
    }

    // Plans — a few axes carry one, so the Progress detail has steps above its problems.
    if (topicIndex === 1 || topicIndex === 6 || topicIndex === 10) {
      input.plans = [
        {
          axisTitle: input.axes[0].title,
          steps: [
            { position: 0, state: "done", title: `Scale fixture: step 0 on ${keyOf(input, 0)}` },
            { position: 1, state: "active", title: `Scale fixture: step 1 on ${keyOf(input, 0)}` },
            { position: 2, state: "pending", title: `Scale fixture: step 2 on ${keyOf(input, 0)}` },
          ],
          summary: `Scale fixture: a staged plan under ${keyOf(input, 0)}.`,
        },
      ];
    }

    // Problems — on roughly two axes in three, one to three each, so the Progress projections are
    // pushed past the store's cap of fifty and the ordering by recency actually matters. The hero
    // topic's three named problems are forced in regardless of the density rule, because the second
    // pass addresses them by statement.
    for (let axisIndex = 0; axisIndex < def.axes; axisIndex += 1) {
      const g = globalAxis - def.axes + axisIndex;
      if (topicIndex === 1 && axisIndex === 0) {
        input.problems.push({
          axisTitle: input.axes[0].title,
          repositoryFullNames: [topicRepo, "scale-org/scale-repo-01-secondary"],
          statement: SCALE_SUBJECTS.heroProblem,
        });
        input.problems.push({
          axisTitle: input.axes[0].title,
          statement: SCALE_SUBJECTS.supportlessProblem,
        });
        continue;
      }
      if (topicIndex === 1 && axisIndex === 2) {
        input.problems.push({
          axisTitle: input.axes[2].title,
          statement: SCALE_SUBJECTS.toResolveProblem,
        });
        continue;
      }
      if (g % 3 === 2) continue;
      const count = 1 + (g % 3);
      for (let p = 0; p < count; p += 1) {
        const problem = {
          axisTitle: input.axes[axisIndex].title,
          statement: `Scale fixture: problem ${pad(g)}.${p} on ${keyOf(input, axisIndex)} — synthetic, for density only.`,
        };
        if (isLong && axisIndex === 0 && p === 0) {
          problem.statement = LONG_PROBLEM;
          problem.repositoryFullNames = [SCALE_SUBJECTS.longRepository];
        } else if (g % 4 !== 3) {
          // Most problems name a repository, so the Progress selection has support to find.
          problem.repositoryFullNames = [
            axisIndex % 2 === 0 ? topicRepo : `scale-org/scale-repo-${pad(topicIndex)}-secondary`,
          ];
        }
        input.problems.push(problem);
      }
    }

    calls.push({ action: "reconcile_topic", input });
  }

  // Write the hero topic last. The Progress projections cap at the store's rollup limit (fifty), ordered
  // by recency, so the problems the second pass links by statement must be the *newest* rows — otherwise
  // they fall off the capped list and the link pass cannot see them. This changes only call order, never
  // the dataset's content.
  const heroAt = calls.findIndex((call) => call.input.topicName === SCALE_SUBJECTS.heroTopic);
  if (heroAt !== -1) {
    calls.push(...calls.splice(heroAt, 1));
  }

  return calls;
}

/** The axis title at `index` of a topic payload, for readable generated text. */
function keyOf(input, index) {
  return input.axes[index]?.title ?? "an axis";
}

/**
 * The second pass: the states that need a store-minted id. It reads the ids back from the projection
 * — never assumes them — and writes:
 *   - the hero problem's plan-step link, a person link, one evidence activity and a steering claim;
 *   - one more problem's evidence, so "supported" is not a single accident;
 *   - a recorded resolution of a problem, so the inventory has a row it must exclude.
 *
 * `dispatch(key, input)` runs one action and returns the action layer's result object (with `ok`).
 * Resolves to `0` on success, `1` on the first failure — the same convention `applyFixtureE` uses.
 */
export function applyScaleLinksWith(dispatch) {
  return async () => {
    const act = async (key, input) => dispatch(key, input);
    const fail = (what) => {
      console.error(`scale fixture: ${what}`);
      return 1;
    };

    const progress = await act("get_progress", { activitySinceDays: 0 });
    if (!progress?.ok) return fail("could not read the Progress projection back");
    const problems = progress.problems?.problems ?? [];
    const axes = progress.axes?.axes ?? [];

    const hero = problems.find((row) => row.statement === SCALE_SUBJECTS.heroProblem);
    const supportless = problems.find((row) => row.statement === SCALE_SUBJECTS.supportlessProblem);
    const toResolve = problems.find((row) => row.statement === SCALE_SUBJECTS.toResolveProblem);
    if (!hero || !supportless || !toResolve) {
      return fail("the hero / support-less / to-resolve problems are not readable after the first pass");
    }
    const heroAxis = axes.find((row) => row.id === hero.axisId);
    const steps = heroAxis?.plan?.steps ?? [];
    const step = steps.find((entry) => entry.position === 1) ?? steps[1] ?? steps[0] ?? null;
    if (!step) return fail("the hero axis has no plan step to link the problem to");

    const topic = await act("get_topic", { topicName: SCALE_SUBJECTS.heroTopic });
    if (!topic?.ok) return fail("could not read the hero topic back");
    const heroPeople = (topic.axes ?? []).find((axis) => axis.id === hero.axisId)?.people ?? [];
    const personId = heroPeople[0]?.id ?? null;
    if (!personId) return fail("the hero axis carries no person to link the problem to");

    const linked = await act("reconcile_topic", {
      activities: [
        {
          axisTitle: heroAxis.title,
          occurredAt: at(1, 5),
          problemId: hero.id,
          sourceRef: "scale-evidence-hero",
          sourceType: "repo_document",
          sourceUrl: "https://example.invalid/scale/hero-evidence",
          summary: "Scale fixture: logged the comparison sheet the hero problem is measured against.",
        },
      ],
      annotations: [
        {
          kind: "steering",
          problemId: hero.id,
          text: "Scale fixture (human steering, problem-scoped): do not reconcile the floors by widening the spread.",
        },
      ],
      problems: [
        {
          personIds: [personId],
          planStepId: step.id,
          problemId: hero.id,
          statement: hero.statement,
        },
      ],
      topicName: SCALE_SUBJECTS.heroTopic,
    });
    if (!linked?.ok) return fail("could not link the hero problem's step, person, evidence and steering");

    // A second supported problem, on the hero topic's third axis, so the capture's selection is a choice.
    const second = problems.find(
      (row) => row.axisId !== hero.axisId && (row.repositories ?? []).length > 0
    );
    if (second) {
      const secondLink = await act("reconcile_topic", {
        activities: [
          {
            axisTitle: second.axisTitle,
            occurredAt: at(4, 10),
            problemId: second.id,
            sourceRef: "scale-evidence-second",
            sourceType: "experiment",
            summary: "Scale fixture: an evidence record for a second supported problem.",
          },
        ],
        problems: [{ problemId: second.id, statement: second.statement }],
        topicName: second.topicName,
      });
      if (!secondLink?.ok) return fail("could not add evidence to the second supported problem");
    }

    // Record the resolution, so a resolved problem exists in the payload the inventory must exclude.
    const resolved = await act("reconcile_topic", {
      topicName: SCALE_SUBJECTS.heroTopic,
      transitions: [{ problemId: toResolve.id, subject: "problem", toState: "resolved" }],
    });
    if (!resolved?.ok) return fail("could not record the resolution of the to-resolve problem");

    const after = await act("get_progress", { activitySinceDays: 0 });
    const heroAfter = (after?.problems?.problems ?? []).find((row) => row.id === hero.id);
    const resolvedAfter = (after?.problems?.problems ?? []).find((row) => row.id === toResolve.id);
    if (!heroAfter || heroAfter.planStepId !== step.id || (heroAfter.people ?? []).length === 0) {
      return fail("the hero problem did not keep its step and person links");
    }
    if (!resolvedAfter || resolvedAfter.state !== "resolved") {
      return fail("the to-resolve problem is not resolved after the transition");
    }
    return 0;
  };
}

// `--check` prints what the dataset declares, so a change that breaks the read is visible here rather
// than as a quietly smaller fixture.
if (import.meta.main) {
  const calls = scaleFixtureCalls();
  const inputs = calls.map((call) => call.input);
  const axes = inputs.reduce((n, input) => n + (input.axes?.length ?? 0), 0);
  const problems = inputs.reduce((n, input) => n + (input.problems?.length ?? 0), 0);
  const activities = inputs.reduce((n, input) => n + (input.activities?.length ?? 0), 0);
  const plans = inputs.reduce((n, input) => n + (input.plans?.length ?? 0), 0);
  const people = new Set(inputs.flatMap((input) => (input.people ?? []).map((entry) => entry.displayName)));
  const repositories = new Set(
    inputs.flatMap((input) => (input.repositories ?? []).map((entry) => entry.fullName))
  );
  const blocked = inputs.reduce(
    (n, input) => n + (input.axes ?? []).filter((axis) => axis.state === "blocked").length,
    0
  );
  console.log(
    `scale fixture: ${calls.length} topic calls · ${axes} axes · ${problems} problems · ${activities} activities · ` +
      `${plans} plans · ${blocked} blocked · ${people.size} people · ${repositories.size} repositories (declared)`
  );
  for (const input of inputs) {
    console.log(
      `  ${input.topicName.slice(0, 60).padEnd(60)} axes ${String(input.axes?.length ?? 0).padStart(2)} · ` +
        `problems ${String(input.problems?.length ?? 0).padStart(2)} · activities ${String(input.activities?.length ?? 0).padStart(2)}`
    );
  }
}
