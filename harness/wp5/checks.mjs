/**
 * wp5/checks.mjs — the WP5 executable checks.
 *
 * Two families, both **read-only against anything that matters**:
 *
 *   - `evaluateView(view, gates)` — pure checks over a readback view of an isolated store, plus the
 *     parameter-gate checks. Baseline counts/mapping/confidence/guard/dates/urls/metadata/positions are
 *     asserted here; a gate with no explicit approval yields **BLOCKED**, never a silent default.
 *   - `evaluateStore({ store, makeStore, ... })` — behavioural checks that need to *exercise* the
 *     isolated store: link idempotency, version conflict, duplicate detection, non-activity preservation,
 *     the unsupported activity-update boundary, untargeted-store preservation and the no-network guard.
 *     Every store it touches is an isolated temp throwaway (`fixture.openIsolatedStore`); the retained
 *     fixture is never opened, and nothing is ever written to a target.
 *
 * Outcome model: `PASS` / `FAIL` / `BLOCKED`. A run with any FAIL is red; a run with any BLOCKED (and no
 * FAIL) is **not green** — it means an approval is missing, so the run did not establish the full
 * contract. `summarize` encodes that precedence.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ResearchStoreConflictError } from "../../src/store.ts";
import {
  ACTIVITIES,
  ACTIVITY_MAPPING,
  AXES,
  BASELINE_COUNTS,
  PLAN,
  PROBLEMS,
  REPOSITORIES,
  TOPIC_NAMES,
  TOPIC_REPO_LINKS,
  gateById,
} from "./manifest.mjs";
import { readView, seedApprovedBaseline, topicRepoLinkInputs } from "./fixture.mjs";

const STATUS = { PASS: "PASS", FAIL: "FAIL", BLOCKED: "BLOCKED" };

function mk(id, title, kind, status, detail) {
  return { id, title, kind, status, detail };
}

function pass(id, title, kind, detail) {
  return mk(id, title, kind, STATUS.PASS, detail);
}

function fail(id, title, kind, detail) {
  return mk(id, title, kind, STATUS.FAIL, detail);
}

function blocked(id, title, kind, detail) {
  return mk(id, title, kind, STATUS.BLOCKED, detail);
}

/** PASS when `ok`, else FAIL — with an explicit detail either way. */
function assertThat(id, title, kind, ok, okDetail, badDetail) {
  return ok ? pass(id, title, kind, okDetail) : fail(id, title, kind, badDetail);
}

const num = (n) => (n === null || n === undefined ? "null" : String(n));

function axisIn(view, axisDef) {
  const topic = view.topics.find((t) => t.name === axisDef.topic);
  return topic?.axes.find((a) => a.title === axisDef.title) ?? null;
}

function allAxes(view) {
  return view.topics.flatMap((t) => t.axes.map((a) => ({ ...a, topicName: t.name })));
}

// ---------------------------------------------------------------------------- baseline count/mapping

function countChecks(view) {
  const c = view.counts;
  const axes = allAxes(view);
  const planSteps = axes.reduce((n, a) => n + (a.plan?.steps.length ?? 0), 0);
  const problems = axes.reduce((n, a) => n + a.problems.length, 0);
  const activities = axes.reduce((n, a) => n + a.historyCount, 0);
  const axisRepoLinks = axes.reduce((n, a) => n + a.repositories.length, 0);
  const topicRepoLinks = view.topics.reduce((n, t) => n + t.repositories.length, 0);
  const topicPersonLinks = view.topics.reduce((n, t) => n + t.people.length, 0);
  const axisPersonLinks = axes.reduce((n, a) => n + a.people.length, 0);
  const problemRepoLinks = axes.reduce(
    (n, a) => n + a.problems.reduce((m, p) => m + p.repositoryFullNames.length, 0),
    0
  );

  const want = (id, title, got, expected) =>
    assertThat(
      id,
      title,
      "baseline",
      got === expected,
      `${got} == ${expected}`,
      `expected ${expected}, read ${got}`
    );

  return [
    want("C01", "topics count", c.topics, BASELINE_COUNTS.topics),
    want("C02", "axes count", c.axes, BASELINE_COUNTS.axes),
    want("C03", "people count", c.people, BASELINE_COUNTS.people),
    want("C04", "repositories count", c.repositories, BASELINE_COUNTS.repositories),
    want("C05", "plan steps count", planSteps, BASELINE_COUNTS.planSteps),
    want("C06", "problems count", problems, BASELINE_COUNTS.problems),
    want("C07a", "initial activities count (8 unique events)", activities, BASELINE_COUNTS.activities),
    assertThat(
      "C07b",
      "activity placement mapping 2/1/1/1/3/0",
      "baseline",
      JSON.stringify(AXES.map((d) => axisIn(view, d)?.historyCount ?? -1)) ===
        JSON.stringify(ACTIVITY_MAPPING),
      `mapping ${JSON.stringify(AXES.map((d) => axisIn(view, d)?.historyCount ?? -1))}`,
      `expected ${JSON.stringify(ACTIVITY_MAPPING)}, read ${JSON.stringify(
        AXES.map((d) => axisIn(view, d)?.historyCount ?? -1)
      )}`
    ),
    want("C07c", "topic→repository links", topicRepoLinks, BASELINE_COUNTS.topicRepoLinks),
    want("C07d", "topic→person links", topicPersonLinks, BASELINE_COUNTS.topicPersonLinks),
    want("C07e", "axis→person links", axisPersonLinks, BASELINE_COUNTS.axisPersonLinks),
    want("C07f", "problem→repository links", problemRepoLinks, BASELINE_COUNTS.problemRepoLinks),
    // The six axis→repository roles are unresolved → ZERO written (never defaulted to `supporting`).
    want("C07g", "axis→repository links written (all six withheld)", axisRepoLinks, BASELINE_COUNTS.axisRepoLinksWritten),
  ];
}

// ---------------------------------------------------------------------------- confidence & guard

function confidenceChecks(view) {
  const mismatches = [];
  for (const def of AXES) {
    const a = axisIn(view, def);
    if (!a) {
      mismatches.push(`${def.title}: axis missing`);
      continue;
    }
    if (a.stateConfidence !== def.stateConfidence) {
      mismatches.push(`${def.title}: stateConfidence ${a.stateConfidence} != ${def.stateConfidence}`);
    }
    if (a.currentStateConfidence !== def.currentStateConfidence) {
      mismatches.push(`${def.title}: currentStateConfidence ${num(a.currentStateConfidence)} != ${num(def.currentStateConfidence)}`);
    }
    if (a.blockerConfidence !== def.blockerConfidence) {
      mismatches.push(`${def.title}: blockerConfidence ${num(a.blockerConfidence)} != ${num(def.blockerConfidence)}`);
    }
  }
  const explicit = assertThat(
    "C08",
    "explicit confidence — no store default relied on (state/currentState/blocker)",
    "baseline",
    mismatches.length === 0,
    "every axis claim carries its mandated explicit confidence",
    mismatches.join("; ")
  );

  // Confirmed-claim guard: a `confirmed` axis claim must carry evidence — present when the check runs
  // (pre-existing evidence counts; here axis 4's `confirmed` blocker is backed by the same-transaction
  // AGENDA event). Problem claims are deliberately excluded — see C10.
  const unbacked = [];
  for (const def of AXES) {
    const a = axisIn(view, def);
    if (!a) continue;
    const claims = [
      ["state", a.stateConfidence, true],
      ["current_state", a.currentStateConfidence, a.currentState.trim().length > 0],
      ["blocker", a.blockerConfidence, a.blocker.trim().length > 0],
    ];
    for (const [field, conf, isClaim] of claims) {
      if (isClaim && conf === "confirmed" && a.evidenceCount === 0) {
        unbacked.push(`${def.title}: ${field}=confirmed with 0 evidence`);
      }
    }
  }
  const guard = assertThat(
    "C09",
    "confirmed axis claim ⟹ evidence on that axis (guard)",
    "baseline",
    unbacked.length === 0,
    "every confirmed claim is backed",
    unbacked.join("; ")
  );
  return [explicit, guard];
}

// ---------------------------------------------------------------------------- dates / urls / metadata / positions

function sourceChecks(view) {
  const events = allAxes(view).flatMap((a) =>
    a.history.map((h) => ({ ...h, axisTitle: a.title, topicName: a.topicName }))
  );
  const byRef = new Map(events.map((e) => [e.sourceRef, e]));

  const dateProblems = [];
  for (const spec of ACTIVITIES) {
    const got = byRef.get(spec.sourceRef);
    if (!got) {
      dateProblems.push(`${spec.sourceRef}: event missing`);
    } else if (got.occurredAt !== spec.occurredAt) {
      dateProblems.push(`${spec.sourceRef}: occurredAt ${got.occurredAt} != ${spec.occurredAt}`);
    }
  }
  const agenda = byRef.get("docs/AGENDA.md");
  if (agenda && agenda.occurredAt === agenda.recordedAt) {
    dateProblems.push("docs/AGENDA.md: occurredAt equals recordedAt (ingestion date substituted)");
  }
  const dates = assertThat(
    "C12",
    "source dates — each event carries its own §3.4 date (AGENDA day-only present)",
    "baseline",
    dateProblems.length === 0,
    "8 event dates match the approved manifest; AGENDA is 2026-09-24",
    dateProblems.join("; ")
  );

  const urlProblems = [];
  for (const spec of ACTIVITIES) {
    const got = byRef.get(spec.sourceRef);
    if (!got) {
      urlProblems.push(`${spec.sourceRef}: event missing`);
      continue;
    }
    if (got.sourceUrl !== spec.sourceUrl) {
      urlProblems.push(`${spec.sourceRef}: sourceUrl ${got.sourceUrl} != ${spec.sourceUrl}`);
    }
    if (!got.sourceUrl.startsWith("https://github.com/")) {
      urlProblems.push(`${spec.sourceRef}: non-public sourceUrl ${got.sourceUrl}`);
    }
  }
  const urls = assertThat(
    "C13",
    "source URLs — every event carries its public §3.4 URL",
    "baseline",
    urlProblems.length === 0,
    "8 public github.com source URLs match the approved manifest",
    urlProblems.join("; ")
  );

  const metaProblems = [];
  for (const spec of REPOSITORIES) {
    const got = view.repositories.find((r) => r.fullName === spec.fullName);
    if (!got) {
      metaProblems.push(`${spec.fullName}: repository missing`);
      continue;
    }
    if (got.url !== spec.url) metaProblems.push(`${spec.fullName}: url mismatch`);
    if (got.defaultBranch !== spec.defaultBranch) metaProblems.push(`${spec.fullName}: defaultBranch ${got.defaultBranch} != ${spec.defaultBranch}`);
    if (got.description !== spec.description) metaProblems.push(`${spec.fullName}: description is not byte-equal to the normalized pinned README string`);
  }
  const metadata = assertThat(
    "C14",
    "repository metadata — normalized pinned strings, byte-equal",
    "baseline",
    metaProblems.length === 0,
    "3 repositories match url/defaultBranch/description exactly",
    metaProblems.join("; ")
  );

  const planProblems = [];
  for (const def of AXES) {
    const a = axisIn(view, def);
    if (!a || a.plan === null) continue;
    if (def.n !== PLAN.axis) {
      planProblems.push(`${def.title}: unexpected plan on a non-plan axis`);
      continue;
    }
    const steps = a.plan.steps;
    if (steps.length !== PLAN.steps.length) {
      planProblems.push(`${def.title}: ${steps.length} steps != ${PLAN.steps.length}`);
    }
    PLAN.steps.forEach((spec, i) => {
      const got = steps[i];
      if (!got) return planProblems.push(`${def.title}: step ${i + 1} missing`);
      if (got.position !== spec.position) planProblems.push(`${def.title}: step ${i + 1} position ${num(got.position)} != ${spec.position}`);
      if ((got.position ?? -1) < 1) planProblems.push(`${def.title}: step ${i + 1} position must be ≥ 1`);
      if (got.title !== spec.title) planProblems.push(`${def.title}: step ${i + 1} title drift`);
    });
  }
  const positions = assertThat(
    "C11",
    "plan positions — explicit 1..4, no nulls, authored titles unchanged",
    "baseline",
    planProblems.length === 0,
    "axis-4 plan has four explicit ascending positions 1..4",
    planProblems.join("; ")
  );

  return [dates, urls, metadata, positions];
}

// ---------------------------------------------------------------------------- parameter gates

function gateChecks(view, gates) {
  const results = [];

  const guard = (gateId, checkId, title, evaluate) => {
    const gate = gateById(gates, gateId);
    if (!gate || !gate.resolved) {
      results.push(
        blocked(checkId, title, "gate", `${gateId} unresolved — no default chosen. ${gate?.detail ?? ""}`.trim())
      );
      return;
    }
    results.push(evaluate(gate.value));
  };

  // G01 — axis→repository roles. Resolved only with an explicit per-axis role map.
  guard("G01", "G01-roles", "explicit axis→repository roles (never a defaulted `supporting`)", (value) => {
    const bad = [];
    for (const def of AXES) {
      const a = axisIn(view, def);
      const wanted = value?.[def.title];
      if (!wanted) {
        bad.push(`${def.title}: no approved role`);
        continue;
      }
      const got = a?.repositories.map((r) => r.relationship) ?? [];
      if (got.length !== 1 || got[0] !== wanted) {
        bad.push(`${def.title}: read ${JSON.stringify(got)} != [${wanted}]`);
      }
    }
    return assertThat("G01-roles", "explicit axis→repository roles", "gate", bad.length === 0, "all six roles match the approved values", bad.join("; "));
  });

  // G02 — F08 axis-4 currentState wording + confidence.
  guard("G02", "G02-currentstate", "F08 axis-4 `currentState` wording + confidence approved", (value) => {
    const a = axisIn(view, AXES.find((x) => x.n === 4));
    const ok = a?.currentState === value?.currentState && a?.currentStateConfidence === value?.confidence;
    return assertThat("G02-currentstate", "F08 axis-4 currentState", "gate", ok, "axis-4 currentState matches the approved wording+confidence", `axis-4 currentState ${JSON.stringify(a?.currentState)} / ${num(a?.currentStateConfidence)} != approved`);
  });

  // G03 — optional blocker restoration.
  guard("G03", "G03-blocker", "optional axis-4 blocker restoration approved", (value) => {
    const a = axisIn(view, AXES.find((x) => x.n === 4));
    return assertThat("G03-blocker", "axis-4 blockerConfidence", "gate", a?.blockerConfidence === value, `blockerConfidence == ${value}`, `blockerConfidence ${num(a?.blockerConfidence)} != ${value}`);
  });

  // G04 — evidence strategy (move/duplicate/reassociate/leave).
  guard("G04", "G04-evidence", "F03/F04/F14a evidence strategy approved", (value) => {
    if (value === "leave") {
      return pass("G04-evidence", "evidence strategy", "gate", "approved strategy is 'leave as-is' — no event is moved or duplicated");
    }
    return blocked("G04-evidence", "evidence strategy", "gate", `strategy '${value}' requires an authorized execution not exercised by WP5`);
  });

  // G05 — explicit target org + owner authorization.
  guard("G05", "G05-target", "explicit target organization + owner write authorization", (value) => {
    return blocked("G05-target", "target write authorization", "gate", `approval recorded (${JSON.stringify(value)}) but this harness never writes a target; execution stays a WP-G decision`);
  });

  return results;
}

// ---------------------------------------------------------------------------- view family

export function evaluateView(view, gates) {
  return [
    ...countChecks(view),
    ...confidenceChecks(view),
    ...sourceChecks(view),
    ...gateChecks(view, gates),
  ];
}

// ---------------------------------------------------------------------------- store family

/** Canonical, order-stable readback of a store — a measurement, never a byte comparison. */
export function canonicalReadback(store) {
  const view = readView(store);
  return JSON.stringify({
    counts: view.counts,
    topics: view.topics.map((t) => ({
      name: t.name,
      axes: t.axes.map((a) => ({
        title: a.title,
        state: a.state,
        stateConfidence: a.stateConfidence,
        evidenceCount: a.evidenceCount,
        historyCount: a.historyCount,
      })),
      lastActivityAt: t.lastActivityAt,
    })),
    repositories: view.repositories.map((r) => r.fullName).sort(),
  });
}

/**
 * Behavioural checks against isolated, throwaway stores. `makeStore()` must return a fresh store (the
 * harness supplies `fixture.openIsolatedStore`). `harnessSources` is the text of the harness's own
 * modules, used only for the static no-network guard.
 */
export function evaluateStore({ store, makeStore, pluginActions, harnessSources }) {
  const results = [];

  // C09b — pre-existing evidence satisfies the guard (evidence need not be same-transaction).
  try {
    const s = makeStore();
    s.reconcileTopic({ topicName: "Guard pre-existing", axes: [{ title: "A", state: "active", stateConfidence: "inferred" }] });
    s.reconcileTopic({ topicName: "Guard pre-existing", activities: [{ summary: "backing", axisTitle: "A", sourceType: "github_pr", sourceRef: "PR #1", occurredAt: "2026-01-01" }] });
    // Now assert `confirmed` on a later transaction: the evidence already exists, so it must pass.
    const updated = s.reconcileTopic({ topicName: "Guard pre-existing", axes: [{ title: "A", state: "usable", stateConfidence: "confirmed" }] });
    const a = updated.axes[0];
    results.push(
      a.stateConfidence === "confirmed"
        ? pass("C09b", "pre-existing axis evidence counts for a later confirmed claim", "baseline", "a confirmed claim was accepted with evidence added in an earlier transaction")
        : fail("C09b", "pre-existing axis evidence counts", "baseline", "confirmed claim did not persist")
    );
  } catch (err) {
    results.push(fail("C09b", "pre-existing axis evidence counts", "baseline", `guarded when it should not have been: ${err.message}`));
  }

  // C10 — problem confidence is a fixture POLICY, not store enforcement; the author route is distinct.
  try {
    const s = makeStore();
    s.reconcileTopic({
      topicName: "Problem policy",
      axes: [{ title: "A", state: "active", stateConfidence: "inferred" }],
      problems: [{ statement: "confirmed problem with no event", axisTitle: "A", state: "open", stateConfidence: "confirmed" }],
    });
    const detail = s.getTopicDetail(s.getTopicByName("Problem policy").id);
    const problem = detail.axes[0]?.problems?.[0] ?? null;
    const ok = problem !== null && problem.stateConfidence === "confirmed";
    results.push(
      assertThat(
        "C10",
        "problem `confirmed` is fixture policy, not a store guard (author policy distinct)",
        "baseline",
        ok,
        "a confirmed problem with no event is stored (no guard fired) — proving the problem policy is distinct from the axis guard",
        `unexpected problem state ${JSON.stringify(problem)}`
      )
    );
  } catch (err) {
    results.push(fail("C10", "problem policy distinct from guard", "baseline", `unexpected throw: ${err.message}`));
  }

  // C15 — link-set idempotency (re-running link writes yields the same set, no duplicates).
  try {
    const experimental = view(store, TOPIC_NAMES[0]);
    const before = store.listTopicRepositories(experimental.id).map((r) => `${r.fullName}:${r.relationship}`).sort();
    for (const link of topicRepoLinkInputs(TOPIC_NAMES[0])) {
      store.linkTopicRepository(experimental.id, store.getRepositoryByFullName(link.fullName).id, link.relationship);
    }
    const after = store.listTopicRepositories(experimental.id).map((r) => `${r.fullName}:${r.relationship}`).sort();
    results.push(
      assertThat(
        "C15",
        "link-set idempotency — re-running a link write adds no duplicate",
        "amendment",
        JSON.stringify(before) === JSON.stringify(after),
        "topic→repository link set is stable across a re-run",
        `link set changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`
      )
    );
  } catch (err) {
    results.push(fail("C15", "link-set idempotency", "amendment", err.message));
  }

  // C16 — version conflict: a stale expectedVersion refuses with `conflict`.
  try {
    const topic = store.getTopicByName(TOPIC_NAMES[1]);
    let conflict = null;
    try {
      store.reconcileTopic({ topicName: topic.name, expectedVersion: topic.version + 50, topic: { summary: "stale probe" } });
    } catch (err) {
      conflict = err;
    }
    results.push(
      assertThat(
        "C16",
        "version discipline — a stale expectedVersion refuses with `conflict`",
        "amendment",
        conflict instanceof ResearchStoreConflictError,
        "stale version refused as a conflict",
        conflict ? `refused with ${conflict.constructor.name}: ${conflict.message}` : "stale version was accepted"
      )
    );
  } catch (err) {
    results.push(fail("C16", "version conflict", "amendment", err.message));
  }

  // C17 — no activity duplication: events are unique by (topic, axis, sourceRef).
  {
    const events = view(store, null).topics.flatMap((t) =>
      t.axes.flatMap((a) => a.history.map((h) => `${t.name}|${a.title}|${h.sourceRef}`))
    );
    const unique = new Set(events);
    results.push(
      assertThat(
        "C17",
        "no activity duplication — 8 unique events, no repeated sourceRef on an axis",
        "amendment",
        events.length === unique.size && events.length === BASELINE_COUNTS.activities,
        `${events.length} events, all unique`,
        `${events.length} events, ${unique.size} unique`
      )
    );
  }

  // C18 — a non-activity change preserves counts / occurredAt / lastActivityAt (recency may advance).
  try {
    const beforeView = readView(store);
    const beforeEvents = canonicalEvents(beforeView);
    const beforeLast = beforeView.topics.map((t) => `${t.name}:${t.lastActivityAt}`);

    // A link-only reconcile and an unchanged plan-step write: no new activity.
    const experimental = view(store, TOPIC_NAMES[0]).id;
    for (const link of topicRepoLinkInputs(TOPIC_NAMES[0])) {
      store.linkTopicRepository(experimental, store.getRepositoryByFullName(link.fullName).id, link.relationship);
    }
    const planAxis = axisIn(beforeView, AXES.find((x) => x.n === PLAN.axis));
    if (planAxis?.plan) {
      store.reconcileTopic({
        topicName: AXES.find((x) => x.n === PLAN.axis).topic,
        plans: [
          {
            axisTitle: planAxis.title,
            summary: planAxis.plan.summary,
            steps: planAxis.plan.steps.map((s) => ({ stepId: s.id, title: s.title, position: s.position })),
          },
        ],
      });
    }

    const afterView = readView(store);
    const afterEvents = canonicalEvents(afterView);
    const afterLast = afterView.topics.map((t) => `${t.name}:${t.lastActivityAt}`);
    results.push(
      assertThat(
        "C18",
        "non-activity change preserves event count / occurredAt / lastActivityAt (recency may advance)",
        "amendment",
        JSON.stringify(beforeEvents) === JSON.stringify(afterEvents) && JSON.stringify(beforeLast) === JSON.stringify(afterLast),
        "event set and lastActivityAt unchanged; updated_at/recency is allowed to advance",
        "event set or lastActivityAt changed under a non-activity write"
      )
    );
  } catch (err) {
    results.push(fail("C18", "non-activity preservation", "amendment", err.message));
  }

  // C19 — unsupported activity-update paths are BLOCKED (no path asserted to exist).
  {
    const noUpdate = typeof store.updateActivity === "undefined";
    const noDelete = typeof store.deleteActivity === "undefined";
    const noAction = !(pluginActions ?? []).some((k) => /(update|delete|edit)_activity/.test(k));
    results.push(
      assertThat(
        "C19",
        "unsupported activity-update paths blocked (no `updateActivity`/`deleteActivity`, no such action)",
        "amendment",
        noUpdate && noDelete && noAction,
        "activities are INSERT-only: no store method and no declared action can update or delete one",
        `updateActivity=${!noUpdate} deleteActivity=${!noDelete} declaredAction=${!noAction}`
      )
    );
  }

  // C20 — untargeted store unchanged by its OWN readback measurement (never DB byte identity).
  try {
    const b = makeStore();
    seedApprovedBaseline(b);
    const bBefore = canonicalReadback(b);
    // Write to the target store (this one) only.
    const experimental = view(store, TOPIC_NAMES[0]).id;
    for (const link of topicRepoLinkInputs(TOPIC_NAMES[0])) {
      store.linkTopicRepository(experimental, store.getRepositoryByFullName(link.fullName).id, link.relationship);
    }
    const bAfter = canonicalReadback(b);
    results.push(
      assertThat(
        "C20",
        "untargeted store unchanged — by readback measurement, not byte identity",
        "amendment",
        bBefore === bAfter,
        "a second isolated store read back identically after the target was written (measurement, not byte proof)",
        "untargeted store readback changed"
      )
    );
  } catch (err) {
    results.push(fail("C20", "untargeted store preservation", "amendment", err.message));
  }

  // C21 — safety guard: no write-capable runner path, no target, offline only.
  {
    const forbidden = ["node:http", "node:net", "node:https", "node:dgram"];
    const offenders = [];
    for (const [name, src] of Object.entries(harnessSources ?? {})) {
      for (const token of forbidden) {
        if (src.includes(token)) offenders.push(`${name}: imports ${token}`);
      }
      if (/\bfetch\s*\(/.test(src)) offenders.push(`${name}: calls fetch(`);
      if (/NAKAMA_URL|NAKAMA_EMAIL|x-org-id|active-org/.test(src)) offenders.push(`${name}: references a live endpoint/target`);
    }
    results.push(
      assertThat(
        "C21",
        "safety guard — offline, no network write path, no bound target",
        "gate",
        offenders.length === 0,
        "harness modules contain no network client and name no live target; stores are isolated temp throwaways",
        offenders.join("; ")
      )
    );
  }

  return results;
}

function view(store, topicName) {
  const v = readView(store);
  if (topicName === null) return v;
  return v.topics.find((t) => t.name === topicName) ?? { id: null, axes: [] };
}

function canonicalEvents(v) {
  return v.topics.flatMap((t) =>
    t.axes.flatMap((a) => a.history.map((h) => `${t.name}|${a.title}|${h.sourceRef}|${h.occurredAt}`))
  );
}

/**
 * Read the harness's runtime modules (only the static safety guard uses this). The guard's own module
 * is excluded on purpose — it necessarily contains the forbidden-token patterns it searches for, and
 * auditing itself would be a tautology; the guard audits the code paths that could actually reach a
 * network (the runner, the fixture builder and the manifest).
 */
export function harnessSources() {
  const dir = import.meta.dir;
  const out = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".mjs")) continue;
    if (name === "checks.mjs") continue; // the guard's own module — not self-audited
    out[name] = readFileSync(join(dir, name), "utf8");
  }
  return out;
}

export function summarize(results) {
  if (results.some((r) => r.status === STATUS.FAIL)) return STATUS.FAIL;
  if (results.some((r) => r.status === STATUS.BLOCKED)) return STATUS.BLOCKED;
  return STATUS.PASS;
}

export const STATUS_VALUES = STATUS;

/** Read the declared action keys from the plugin manifest (for the unsupported-path check). */
export function pluginActionKeys(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return (manifest.actions ?? []).map((a) => a.key).filter(Boolean);
}
