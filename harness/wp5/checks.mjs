/**
 * wp5/checks.mjs — the WP5 executable checks.
 *
 * Two families, both **read-only against anything that matters**:
 *
 *   - `evaluateView(view, gates, views)` — pure checks over a readback view of an isolated store, plus the
 *     parameter-gate checks. Baseline counts/mapping/confidence/guard/dates/urls/metadata/positions are
 *     asserted here; a gate with no explicit approval yields **BLOCKED**, never a silent default.
 *   - `evaluateStore({ store, makeStore, ... })` — behavioural checks that need to *exercise* the
 *     isolated store: link idempotency, the real retained-like amendment delta, version discipline,
 *     source-event identity, non-activity preservation, the unsupported activity-update boundary,
 *     untargeted-store preservation (full mutation-public readback), and the no-network guard. Every store
 *     it touches is an isolated temp throwaway (`fixture.openIsolatedStore`); the retained fixture is never
 *     opened, and nothing is ever written to a target.
 *
 * Outcome model: `PASS` / `FAIL` / `BLOCKED`. A run with any FAIL is red; a run with any BLOCKED (and no
 * FAIL) is **not green** — it means an approval is missing, so the run did not establish the full
 * contract. `summarize` encodes that precedence.
 *
 * **Gate semantics — decision resolution vs state verification.** A gate is a *decision* (what a human
 * approved). A gate check *verifies* the decision's effect on the view it belongs to: baseline-seed gates
 * verify the seed; amendment gates verify the amendment view; the F08/blocker gates verify the retained
 * view (the retained fixture's measured state). A gate never passes merely because the baseline happens to
 * equal an approved value.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ResearchStoreConflictError } from "../../src/store.ts";
import {
  ACTIVITIES,
  ACTIVITY_MAPPING,
  AXES,
  BASELINE_COUNTS,
  PERSON,
  PLAN,
  PROBLEMS,
  REPOSITORIES,
  TOPIC_NAMES,
  TOPIC_REPO_LINKS,
  gateById,
} from "./manifest.mjs";
import {
  SYNTHETIC_ROLE,
  readView,
  seedApprovedBaseline,
  seedRetainedLike,
  topicRepoLinkInputs,
} from "./fixture.mjs";

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

/** The canonical source-event list of a view: identity + occurrence, none of the volatile presentation. */
function canonicalEvents(v) {
  return v.topics
    .flatMap((t) =>
      t.axes.flatMap((a) =>
        a.history.map(
          (h) => `${t.name}|${a.title}|${h.sourceType}|${h.sourceRef}|${h.sourceUrl}|${h.occurredAt}`
        )
      )
    )
    .sort();
}

function lastActivityMap(v) {
  return v.topics.map((t) => `${t.name}:${t.lastActivityAt}`).sort();
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

/**
 * Gate checks. `views` names which view a gate's decision is verified against:
 *
 *   - `views.amendment` — the amendment view (seed + approved delta): verification gates G01/G02;
 *   - `views.retained`  — the retained-fixture view (the measured retained state): G03;
 *   - G04/G05 are decision-only and verify no view.
 *
 * A gate that cannot be verified against its view is BLOCKED (the decision is not established), never a
 * silent PASS on the baseline.
 */
function gateChecks(views, gates) {
  const results = [];
  const v = views ?? {};

  const guard = (gateId, checkId, title, evaluate) => {
    const gate = gateById(gates, gateId);
    if (!gate || !gate.resolved) {
      results.push(
        blocked(checkId, title, "gate", `${gateId} unresolved — no default chosen. ${gate?.detail ?? ""}`.trim())
      );
      return;
    }
    results.push(evaluate(gate.value, gate));
  };

  // G01 — axis→repository roles. The decision is verified against the AMENDMENT view (the seed withholds
  // all six links, so a realized role can only be read from the amended state).
  guard("G01", "G01-roles", "explicit axis→repository roles (never a defaulted `supporting`; amendment view)", (value) => {
    if (!v.amendment) {
      return blocked("G01-roles", "explicit axis→repository roles", "gate", "the role decision is approved for execution, but no amendment view is available to verify the realized roles against — not established here");
    }
    const bad = [];
    for (const def of AXES) {
      const a = axisIn(v.amendment, def);
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
    return assertThat("G01-roles", "explicit axis→repository roles", "gate", bad.length === 0, "all six roles match the approved values on the amendment view", bad.join("; "));
  });

  // G02 — F08 axis-4 currentState wording + confidence, verified against the AMENDMENT view.
  guard("G02", "G02-currentstate", "F08 axis-4 `currentState` wording + confidence (amendment view)", (value) => {
    if (!v.amendment) {
      return blocked("G02-currentstate", "F08 axis-4 currentState", "gate", "the wording is approved for execution, but no amendment view is available to verify it against — not established here");
    }
    const a = axisIn(v.amendment, AXES.find((x) => x.n === 4));
    const ok = a?.currentState === value?.currentState && a?.currentStateConfidence === value?.confidence;
    return assertThat("G02-currentstate", "F08 axis-4 currentState", "gate", ok, "axis-4 currentState matches the approved wording+confidence on the amendment view", `axis-4 currentState ${JSON.stringify(a?.currentState)} / ${num(a?.currentStateConfidence)} != approved`);
  });

  // G03 — the retained axis-4 blocker. Verified against the RETAINED view, with the ACTUAL evidence
  // interaction: the ratified `inferred` requires none; an OPTIONAL `confirmed` restoration must be backed
  // by axis-4 evidence present by the transaction's end. Never a "baseline == approved value" false pass.
  guard("G03", "G03-blocker", "axis-4 blocker — retained `inferred` ratified; optional `confirmed` restoration (retained view, evidence-graded)", (value) => {
    const decision = typeof value === "string" ? value : value?.decision;
    // The decision selects WHICH view establishes it: "skip" is established by the untouched retained
    // fixture; "restore" is established by the amendment view. Never a "baseline == approved" false pass.
    const view = decision === "skip" || decision === "inferred" ? (v.retained ?? v.amendment) : (v.amendment ?? v.retained);
    if (!view) {
      return blocked("G03-blocker", "axis-4 blockerConfidence", "gate", "the decision is approved, but no view is available to verify the retained/restored confidence and its evidence against — not established here");
    }
    const a = axisIn(view, AXES.find((x) => x.n === 4));
    if (decision === "skip" || decision === "inferred") {
      return assertThat(
        "G03-blocker",
        "axis-4 blockerConfidence (retained `inferred` ratified)",
        "gate",
        a?.blockerConfidence === "inferred",
        "the retained `inferred` stands unchanged — an inferred claim requires no evidence",
        `blockerConfidence ${num(a?.blockerConfidence)} != inferred`
      );
    }
    if (decision === "restore" || decision === "confirmed") {
      const conf = a?.blockerConfidence;
      const evidence = a?.evidenceCount ?? 0;
      const ok = conf === "confirmed" && evidence > 0;
      return assertThat(
        "G03-blocker",
        "axis-4 blockerConfidence (optional `confirmed` restoration)",
        "gate",
        ok,
        "the `confirmed` restoration is backed by axis-4 evidence present by the transaction end",
        conf !== "confirmed"
          ? `blockerConfidence ${num(conf)} != confirmed`
          : `confirmed with ${evidence} evidence — a confirmed claim requires evidence by the transaction's end`
      );
    }
    return fail("G03-blocker", "axis-4 blockerConfidence", "gate", `unrecognized G03 decision ${JSON.stringify(value)}`);
  });

  // G04 — evidence strategy. Only "leave" is exercisable without an authorized execution; a duplication
  // strategy must name the specific refs (a blanket allow is a loophole and is red).
  guard("G04", "G04-evidence", "F03/F04/F14a evidence strategy approved", (value) => {
    const strategy = typeof value === "string" ? value : value?.strategy;
    if (strategy === "leave") {
      return pass("G04-evidence", "evidence strategy", "gate", "approved strategy is 'leave as-is' — no event is moved or duplicated");
    }
    if (strategy === "duplicate") {
      const allow = Array.isArray(value?.allow) ? value.allow : null;
      if (!allow || allow.length === 0) {
        return fail("G04-evidence", "evidence strategy", "gate", "a blanket duplication strategy is rejected: it must name the specific source refs (a blanket allow proves nothing)");
      }
      return blocked("G04-evidence", "evidence strategy", "gate", `a duplication strategy naming ${JSON.stringify(allow)} requires an authorized execution not exercised by WP5`);
    }
    return blocked("G04-evidence", "evidence strategy", "gate", `strategy '${strategy}' requires an authorized execution not exercised by WP5`);
  });

  // G05 — a proposed-target DECISION only. It records no owner write authorization, binds no live target
  // and performs no network or write execution; WP-G stays closed. A resolution that claims authorization
  // or a live binding is rejected rather than allowed to cycle a write path into existence.
  guard("G05", "G05-target", "explicit proposed target decision only (no owner write authorization, no live binding — WP-G's to grant)", (value) => {
    if (value?.ownerAuthorization === true || value?.liveBinding === true) {
      return fail(
        "G05-target",
        "target write authorization",
        "gate",
        `the resolution claims ${value?.ownerAuthorization === true ? "owner write authorization" : "a live target binding"} — WP5 records only a proposed-target DECISION; no owner authorization and no live binding exist, and neither is accepted here`
      );
    }
    if (!value || typeof value.proposedTarget !== "string" || value.proposedTarget.trim().length === 0) {
      return fail("G05-target", "target write authorization", "gate", "no explicit proposed target was named");
    }
    return pass(
      "G05-target",
      "target write authorization",
      "gate",
      `proposed target decision recorded (TEST-ONLY SYNTHETIC where labelled); this is NOT owner write authorization, no target is bound and this harness performs no network or write execution — WP-G remains closed`
    );
  });

  return results;
}

// ---------------------------------------------------------------------------- view family

export function evaluateView(view, gates, views) {
  return [
    ...countChecks(view),
    ...confidenceChecks(view),
    ...sourceChecks(view),
    ...gateChecks(views ?? {}, gates),
  ];
}

// ---------------------------------------------------------------------------- store family

/**
 * Canonical, order-stable readback of a store's **full mutation-public state** — a measurement, never a
 * byte comparison. It covers everything an approved mutation may change (repository metadata; topic/axis
 * repository links and people; currentState/blocker confidences; problem repository sets; plan step ids,
 * titles and positions; source events with their ref/url/time/axis; and versions) and **excludes only the
 * volatile presentation** (generated/recorded/updated timestamps and random row ids). Because C20 compares
 * two readbacks, a change to *any* of those fields is detected.
 */
export function canonicalReadback(store) {
  const v = readView(store);
  // The persistent state version is a canonical, mutation-public value — a no-op axis reconcile bumps it.
  // It must be an actual number on every axis, never `undefined` (which JSON.stringify would silently
  // drop, blinding this readback to a version-only change and letting C20 pass falsely).
  const axisVersions = v.topics.flatMap((t) => t.axes.map((a) => a.version));
  if (axisVersions.length === 0 || axisVersions.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    throw new Error(
      "canonicalReadback: every axis must carry a numeric `version` (stateVersion is required, never undefined)"
    );
  }
  return JSON.stringify({
    counts: v.counts,
    topics: v.topics.map((t) => ({
      name: t.name,
      version: t.version,
      repositories: t.repositories.map((r) => `${r.fullName}:${r.relationship}`).sort(),
      people: [...t.people].sort(),
      lastActivityAt: t.lastActivityAt,
      axes: t.axes.map((a) => ({
        title: a.title,
        state: a.state,
        stateConfidence: a.stateConfidence,
        currentState: a.currentState,
        currentStateConfidence: a.currentStateConfidence,
        blocker: a.blocker,
        blockerConfidence: a.blockerConfidence,
        stateVersion: a.version,
        evidenceCount: a.evidenceCount,
        historyCount: a.historyCount,
        repositories: a.repositories.map((r) => `${r.fullName}:${r.relationship}`).sort(),
        people: [...a.people].sort(),
        plan: a.plan
          ? {
              id: a.plan.id,
              summary: a.plan.summary,
              steps: a.plan.steps.map((s) => ({ id: s.id, title: s.title, position: s.position })),
            }
          : null,
        problems: a.problems.map((p) => ({
          statement: p.statement,
          state: p.state,
          stateConfidence: p.stateConfidence,
          repositories: [...p.repositoryFullNames].sort(),
        })),
      })),
    })),
    repositories: v.repositories
      .map((r) => ({ fullName: r.fullName, url: r.url, description: r.description, defaultBranch: r.defaultBranch }))
      .sort((x, y) => x.fullName.localeCompare(y.fullName)),
    activities: canonicalEvents(v),
  });
}

/** The raw link rows of a store, as order-stable label sets (for the C15 idempotency comparison). */
function linkSets(store) {
  const v = readView(store);
  const topicRepo = [];
  const topicPeople = [];
  const axisRepo = [];
  const axisPeople = [];
  const problemRepo = [];
  for (const t of v.topics) {
    for (const r of t.repositories) topicRepo.push(`topic:${t.name}|${r.fullName}:${r.relationship}`);
    for (const p of t.people) topicPeople.push(`topic:${t.name}|${p}`);
    for (const a of t.axes) {
      for (const r of a.repositories) axisRepo.push(`axis:${t.name}/${a.title}|${r.fullName}:${r.relationship}`);
      for (const p of a.people) axisPeople.push(`axis:${t.name}/${a.title}|${p}`);
      for (const p of a.problems) for (const rn of p.repositoryFullNames) problemRepo.push(`problem:${t.name}/${a.title}|${p.statement.slice(0, 12)}|${rn}`);
    }
  }
  return {
    topicRepo: topicRepo.sort(),
    topicPeople: topicPeople.sort(),
    axisRepo: axisRepo.sort(),
    axisPeople: axisPeople.sort(),
    problemRepo: problemRepo.sort(),
    all: [...topicRepo, ...topicPeople, ...axisRepo, ...axisPeople, ...problemRepo].sort(),
  };
}

function storeAxisByTitle(store, title) {
  for (const name of TOPIC_NAMES) {
    const topic = store.getTopicByName(name);
    if (!topic) continue;
    const axis = store.listAxes(topic.id).find((a) => a.title === title);
    if (axis) return axis;
  }
  return null;
}

/** A reconcile response is a success when it returns the touched axis with a numeric new version. */
function isReconcileSuccess(result) {
  return !!result && Array.isArray(result.axes) && result.axes.length === 1 && typeof result.axes[0].version === "number";
}

/**
 * Apply the retained-like amendment delta (D1–D6): D1/D2 axis→repo, D3/D4 axis→person, D5/D6 problem→repo
 * (full-set replacement). **Each axis's version is read fresh, immediately before that axis's own
 * reconcile**, so the `expectedVersion` it passes is current — never hoisted once and reused across calls
 * (a stale `expectedVersion` makes `reconcileTopic` throw `ResearchStoreConflictError`). Returns the two
 * `ReconcileResult`s so a caller asserts the response rather than discarding it.
 *
 * `versions` is a **TEST-ONLY override** for the freshness/conflict probe: when given, it supplies the
 * `expectedVersion` for each axis instead of the freshly-read one, so a caller can drive a deliberately
 * stale value and observe the refusal.
 */
export function applyRetainedLikeDelta(store, versions) {
  const infra = "Research infrastructure / team management";
  const dashboard = "ajegorovs/nakama-research-dashboard";
  const person = { displayName: PERSON.displayName, githubLogin: PERSON.githubLogin };

  // D1/D3 — axis 5: read its version immediately before reconciling it.
  const ax5 = storeAxisByTitle(store, AXES.find((x) => x.n === 5).title);
  const r5 = store.reconcileTopic({
    topicName: infra,
    axes: [
      {
        id: ax5.id,
        expectedVersion: versions ? versions.v5 : ax5.version,
        repositories: [{ fullName: dashboard, relationship: SYNTHETIC_ROLE }],
        people: [person],
      },
    ],
  });

  // D2/D4/D5/D6 — axis 6: read its version immediately before reconciling it.
  const ax6 = storeAxisByTitle(store, AXES.find((x) => x.n === 6).title);
  const problems = store.listProblems(ax6.id);
  const r6 = store.reconcileTopic({
    topicName: infra,
    axes: [
      {
        id: ax6.id,
        expectedVersion: versions ? versions.v6 : ax6.version,
        repositories: [{ fullName: dashboard, relationship: SYNTHETIC_ROLE }],
        people: [person],
      },
    ],
    // D5/D6 (problem→repo): `repositoryFullNames` REPLACES the whole set — carry the full intended set.
    problems: problems.map((p) => ({ problemId: p.id, statement: p.statement, repositoryFullNames: [dashboard] })),
  });

  return { r5, r6 };
}

/** Spin to the next millisecond so a write lands on a settled, strictly-distinct clock tick. */
function waitForNextMillis() {
  const start = Date.now();
  while (Date.now() === start) {
    /* the store exposes no clock seam (`nowIso` reads the real clock); a bounded spin is the honest seam */
  }
}

/**
 * Behavioural checks against isolated, throwaway stores. `makeStore()` must return a fresh store (the
 * harness supplies `fixture.openIsolatedStore`). `harnessSources` is the text of the harness's own
 * modules, used only for the static no-network guard. `gates` carries any resolved decisions (for C15/C17).
 * `untargetedTamper` is a **negative-control hook** (tests only): it mutates the untargeted store so C20
 * must fail, proving the full readback sees the change.
 */
export function evaluateStore({ store, makeStore, pluginActions, harnessSources, gates, untargetedTamper }) {
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

  // C15 — the real retained-fixture amendment delta (D1–D6), applied to a disposable RETAINED-LIKE store.
  // Each axis's version is read fresh, immediately before that axis's own reconcile (never hoisted), and
  // the reconcile RESPONSE is asserted — a success returns the axis, a stale `expectedVersion` THROWS
  // `ResearchStoreConflictError` (it is never a returned value that could be ignored). The sequence is
  // explicit: pass 1 advances both axis versions; a pass-2 attempt carrying the pass-1 (now stale)
  // versions must refuse with `conflict`; a pass-2 attempt with fresh versions succeeds; and the link
  // sets stay stable and duplicate-free across all of it.
  try {
    const b = makeStore();
    seedRetainedLike(b); // TEST-ONLY SYNTHETIC: models the retained fixture's link shape
    const before = linkSets(b);
    const t5 = AXES.find((x) => x.n === 5).title;
    const t6 = AXES.find((x) => x.n === 6).title;
    const versionOf = (title) => storeAxisByTitle(b, title).version;

    const v5start = versionOf(t5);
    const v6start = versionOf(t6);

    // Pass 1 — fresh reads; both reconciles return a result (success), and both versions advance.
    const r1 = applyRetainedLikeDelta(b);
    const once = linkSets(b);
    const v5once = versionOf(t5);
    const v6once = versionOf(t6);
    const pass1Advanced = v5once > v5start && v6once > v6start;
    const pass1Returned = isReconcileSuccess(r1.r5) && isReconcileSuccess(r1.r6);

    // Pass 2 (stale) — the pass-1 versions are now stale; the reconcile must refuse with `conflict`.
    let staleError = null;
    try {
      applyRetainedLikeDelta(b, { v5: v5once - 1, v6: v6once - 1 });
    } catch (err) {
      staleError = err;
    }
    const staleConflicts = staleError instanceof ResearchStoreConflictError;
    const afterStale = linkSets(b); // the refused attempt mutated nothing.

    // Pass 2 (fresh) — succeeds; versions advance again; link sets unchanged.
    const r2 = applyRetainedLikeDelta(b);
    const twice = linkSets(b);
    const v5after = versionOf(t5);
    const v6after = versionOf(t6);
    const pass2Advanced = v5after > v5once && v6after > v6once;
    const pass2Returned = isReconcileSuccess(r2.r5) && isReconcileSuccess(r2.r6);

    const ax5 = storeAxisByTitle(b, t5);
    const ax6 = storeAxisByTitle(b, t6);
    const role5 = b.listAxisRepositories(ax5.id).map((r) => r.relationship);
    const role6 = b.listAxisRepositories(ax6.id).map((r) => r.relationship);
    const consult = b.listProblems(ax6.id).map((p) => b.listProblemRepositories(p.id).map((r) => r.fullName).sort());
    const consultFull = consult.every((set) => set.length === 1 && set[0] === "ajegorovs/nakama-research-dashboard");

    // Preserve the other existing links: every pre-delta link is still present afterwards.
    const preserved = before.all.every((row) => once.all.includes(row));
    // No duplicates: no link row appears twice.
    const noDup = once.all.length === new Set(once.all).size;
    // The refused stale attempt left the store untouched.
    const stableAcrossStale = JSON.stringify(afterStale.all) === JSON.stringify(once.all);
    // The role is the explicit SYNTHETIC value, and no G01 *decision* is made (a real, non-test-only
    // resolution would be a decision this check refuses to launder).
    const g01 = gateById(gates, "G01");
    const noRealG01 = !g01 || !g01.resolved || g01.testOnly === true;

    // Primary hazard, demonstrated: a `primary` link demotes the existing axis-level primary.
    const scratch = makeStore();
    scratch.reconcileTopic({ topicName: "Synthetic hazard", repositories: [{ fullName: "ajegorovs/nakama-research-dashboard", relationship: "primary" }] });
    scratch.reconcileTopic({ topicName: "Synthetic hazard", repositories: [{ fullName: "ajegorovs/udv-echo-process", relationship: "primary" }] });
    const hazardTopic = scratch.getTopicByName("Synthetic hazard");
    const demoted = scratch
      .listTopicRepositories(hazardTopic.id)
      .find((r) => r.fullName === "ajegorovs/nakama-research-dashboard")?.relationship;

    const ok =
      pass1Advanced &&
      pass1Returned &&
      staleConflicts &&
      stableAcrossStale &&
      pass2Advanced &&
      pass2Returned &&
      JSON.stringify(once.all) === JSON.stringify(twice.all) &&
      noDup &&
      preserved &&
      consultFull &&
      role5.length === 1 &&
      role5[0] === SYNTHETIC_ROLE &&
      role6.length === 1 &&
      role6[0] === SYNTHETIC_ROLE &&
      noRealG01;
    results.push(
      assertThat(
        "C15",
        "retained-like amendment delta (D1–D6) idempotent — fresh versions, stale refused, stable link sets (TEST-ONLY SYNTHETIC)",
        "amendment",
        ok,
        `TEST-ONLY SYNTHETIC delta (${RETAINED_LIKE_NOTE}): pass 1 read each axis's version fresh and advanced it (v5 ${v5start}->${v5once}, v6 ${v6start}->${v6once}); a pass-2 attempt with the stale pass-1 versions refused with conflict (nothing mutated); a pass-2 fresh attempt succeeded and advanced again (v5 ${v5once}->${v5after}, v6 ${v6once}->${v6after}); link sets identical and duplicate-free, existing links preserved, the two consultation problems carry the full set [dashboard]; role '${SYNTHETIC_ROLE}' is synthetic (the store cannot store "undecided" and would default to 'supporting'), not a G01 decision${demoted === "supporting" ? "; a 'primary' would demote the existing primary (demonstrated), the hazard avoided" : ""}`,
        `delta not stable: pass1Advanced ${pass1Advanced}, pass1Returned ${pass1Returned}, staleConflicts ${staleConflicts}, stableAcrossStale ${stableAcrossStale}, pass2Advanced ${pass2Advanced}, pass2Returned ${pass2Returned}, once==twice ${JSON.stringify(once.all) === JSON.stringify(twice.all)}, noDup ${noDup}, preserved ${preserved}, consultFull ${consultFull}, roles ${JSON.stringify([role5, role6])}, noRealG01 ${noRealG01}`
      )
    );
  } catch (err) {
    results.push(fail("C15", "retained-like amendment delta idempotency", "amendment", err.message));
  }

  // C16 — version discipline. Both a stale `axes[].expectedVersion` and a stale top-level topic
  // `expectedVersion` refuse with `conflict`; the store's problem/plan writers support a version guard,
  // but the reconcile tool input exposes NO `expectedVersion` for `problems[]`/`plans[]` — an asymmetry,
  // recorded not hidden.
  try {
    const topic0 = store.getTopicByName(TOPIC_NAMES[0]);
    const axis0 = store.listAxes(topic0.id)[0];
    const planAxis = storeAxisByTitle(store, AXES.find((x) => x.n === 4).title);

    let axisConflict = null;
    try {
      store.reconcileTopic({ topicName: topic0.name, axes: [{ id: axis0.id, expectedVersion: axis0.version + 50, description: "stale probe" }] });
    } catch (err) {
      axisConflict = err;
    }

    let topicConflict = null;
    try {
      store.reconcileTopic({ topicName: topic0.name, expectedVersion: topic0.version + 50, topic: { summary: "stale probe" } });
    } catch (err) {
      topicConflict = err;
    }

    // The store CAN guard a problem/plan; the tool path does not expose it.
    const problem = store.listProblems(planAxis.id)[0];
    let problemConflict = null;
    try {
      store.updateProblem({ id: problem.id, statement: problem.statement, authorType: "agent", expectedVersion: problem.version + 50 });
    } catch (err) {
      problemConflict = err;
    }
    const plan = store.planForAxis(planAxis.id);
    let planConflict = null;
    try {
      store.updatePlan({ id: plan.plan.id, authorType: "agent", expectedVersion: plan.plan.version + 50 });
    } catch (err) {
      planConflict = err;
    }

    // The tool path drops an `expectedVersion` supplied on a problems[] item: no conflict is raised.
    let toolPathRaised = false;
    try {
      store.reconcileTopic({
        topicName: topic0.name,
        problems: [{ problemId: problem.id, statement: problem.statement, expectedVersion: problem.version + 50 }],
      });
    } catch {
      toolPathRaised = true;
    }

    const ok =
      axisConflict instanceof ResearchStoreConflictError &&
      topicConflict instanceof ResearchStoreConflictError &&
      problemConflict instanceof ResearchStoreConflictError &&
      planConflict instanceof ResearchStoreConflictError &&
      !toolPathRaised;
    results.push(
      assertThat(
        "C16",
        "version discipline — stale topic AND axes[].expectedVersion conflict; problem/plan lack a tool-level guard",
        "amendment",
        ok,
        "a stale topic and a stale `axes[].expectedVersion` both refuse with `conflict`; the store's problem/plan writers also conflict, but the reconcile tool input exposes no `expectedVersion` for `problems[]`/`plans[]`, so the tool path cannot be version-guarded (an asymmetry, stated not hidden)",
        `axisConflict ${axisConflict?.constructor?.name ?? "none"}, topicConflict ${topicConflict?.constructor?.name ?? "none"}, problemConflict ${problemConflict?.constructor?.name ?? "none"}, planConflict ${planConflict?.constructor?.name ?? "none"}, toolPathRaised ${toolPathRaised}`
      )
    );
  } catch (err) {
    results.push(fail("C16", "version conflict", "amendment", err.message));
  }

  // C17 — source-event identity is the EVENT (sourceType+sourceRef), independent of the axis. The same
  // source event appearing more than once — e.g. an AGENDA event duplicated across two axes — is RED
  // unless an explicit G04 strategy names those refs (a blanket allow is a loophole and is rejected).
  {
    const v = readView(store);
    const events = v.topics.flatMap((t) =>
      t.axes.flatMap((a) => a.history.map((h) => ({ topic: t.name, axis: a.title, key: `${h.sourceType}|${h.sourceRef}` })))
    );
    const byKey = new Map();
    for (const e of events) {
      if (!byKey.has(e.key)) byKey.set(e.key, []);
      byKey.get(e.key).push(e);
    }
    const dupKeys = [...byKey.entries()].filter(([, list]) => list.length > 1);

    const g04 = gateById(gates, "G04");
    const raw = g04 && g04.resolved ? g04.value : null;
    const strategy = typeof raw === "string" ? raw : raw?.strategy;
    const allow = raw && typeof raw === "object" && Array.isArray(raw.allow) ? raw.allow : null;
    const blanket = strategy === "duplicate" && (!allow || allow.length === 0);

    let ok;
    let detail;
    if (dupKeys.length === 0) {
      ok = true;
      detail = `${events.length} source events; every identity (sourceType|sourceRef) is unique across axes`;
    } else if (strategy === "duplicate" && allow && allow.length > 0) {
      ok = dupKeys.every(([key]) => allow.includes(key));
      detail = ok
        ? `duplication limited to the explicitly-named refs ${JSON.stringify(allow)}`
        : `duplication of refs not named in the approved strategy: ${dupKeys.map(([k]) => k).join(", ")}`;
    } else {
      ok = false;
      detail = `duplicate source identities across axes without an explicit approved strategy: ${dupKeys
        .map(([k, list]) => `${k} on ${list.map((e) => e.axis).join(" + ")}`)
        .join("; ")}${blanket ? " (a blanket duplication allow is rejected as a loophole)" : ""}`;
    }
    results.push(
      assertThat(
        "C17",
        "source-event identity is axis-independent — no cross-axis duplicate (unless an explicit G04 strategy names it)",
        "amendment",
        ok,
        detail,
        detail
      )
    );
  }

  // C18 — an ACTUAL axis reconcile and a problem→repository replacement touching the same axis advance
  // updatedAt/recency but add no activity: the event count, each event's occurredAt and lastActivityAt are
  // unchanged. No clock seam exists, so the check spins to the next millisecond to get a settled, distinct
  // tick, then asserts the advance strictly (failures are never hidden).
  try {
    const beforeView = readView(store);
    const beforeEvents = canonicalEvents(beforeView);
    const beforeLast = lastActivityMap(beforeView);
    const infra = "Research infrastructure / team management";
    const ax6 = storeAxisByTitle(store, AXES.find((x) => x.n === 6).title);
    const beforeUpdated = store.getAxis(ax6.id).updatedAt;
    const problem = store.listProblems(ax6.id)[0];

    waitForNextMillis();
    // (1) an actual axis reconcile (bumps the axis `updated_at` and version);
    store.reconcileTopic({ topicName: infra, axes: [{ id: ax6.id, expectedVersion: ax6.version, description: ax6.description }] });
    // (2) a problem→repository replacement touching the same axis (`updateProblem` touches the axis).
    store.reconcileTopic({
      topicName: infra,
      problems: [{ problemId: problem.id, statement: problem.statement, repositoryFullNames: ["ajegorovs/nakama-research-dashboard"] }],
    });

    const afterView = readView(store);
    const afterEvents = canonicalEvents(afterView);
    const afterLast = lastActivityMap(afterView);
    const afterUpdated = store.getAxis(ax6.id).updatedAt;

    const eventsUnchanged = JSON.stringify(beforeEvents) === JSON.stringify(afterEvents);
    const lastUnchanged = JSON.stringify(beforeLast) === JSON.stringify(afterLast);
    const recencyAdvanced = afterUpdated > beforeUpdated;
    results.push(
      assertThat(
        "C18",
        "an actual axis reconcile + problem→repo replacement advance updatedAt/recency but add no activity",
        "amendment",
        eventsUnchanged && lastUnchanged && recencyAdvanced,
        `axis updatedAt advanced ${beforeUpdated} -> ${afterUpdated} (a settled, strictly-distinct tick — no clock seam is exposed, so a bounded spin to the next millisecond is used); event count/occurredAt and lastActivityAt are unchanged`,
        `eventsUnchanged ${eventsUnchanged}, lastUnchanged ${lastUnchanged}, recencyAdvanced ${recencyAdvanced} (${beforeUpdated} -> ${afterUpdated})`
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

  // C20 — untargeted store unchanged by its OWN full mutation-public readback (never DB byte identity).
  // `untargetedTamper` (tests only) mutates the untargeted store so this check must go red.
  try {
    const b = makeStore();
    seedApprovedBaseline(b);
    const bBefore = canonicalReadback(b);
    if (typeof untargetedTamper === "function") untargetedTamper(b);
    // Write to the target store (this one) only.
    const experimental = view(store, TOPIC_NAMES[0]).id;
    for (const link of topicRepoLinkInputs(TOPIC_NAMES[0])) {
      store.linkTopicRepository(experimental, store.getRepositoryByFullName(link.fullName).id, link.relationship);
    }
    const bAfter = canonicalReadback(b);
    const readbackAxes = JSON.parse(bAfter).topics.flatMap((t) => t.axes);
    const versionsNumeric =
      readbackAxes.length > 0 &&
      readbackAxes.every((a) => typeof a.stateVersion === "number" && Number.isFinite(a.stateVersion));
    results.push(
      assertThat(
        "C20",
        "untargeted store unchanged — by full mutation-public readback (incl. numeric axis stateVersions), not byte identity",
        "amendment",
        bBefore === bAfter && versionsNumeric,
        "a second isolated store read back identically after the target was written (metadata, links, claims, plans, activities, and numeric axis stateVersions all measured; only volatile presentation excluded)",
        `untargeted store readback changed or a stateVersion is not a number: versionsNumeric ${versionsNumeric}`
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
      if (/\bfetch\s*\(/.test(src)) offenders.push(`${name}: calls the network client`);
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

const RETAINED_LIKE_NOTE = "see fixture.RETAINED_LIKE_LABEL";

function view(store, topicName) {
  const v = readView(store);
  if (topicName === null) return v;
  return v.topics.find((t) => t.name === topicName) ?? { id: null, axes: [] };
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
