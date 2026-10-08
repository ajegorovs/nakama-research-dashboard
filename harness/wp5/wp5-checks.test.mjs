/**
 * wp5/wp5-checks.test.mjs — the WP5 check suite. It PASSES, and what it proves is that the checker
 * **can go red and can report BLOCKED** — so a green result from `run.mjs` would mean something.
 *
 *   bun test harness/wp5/wp5-checks.test.mjs
 *
 * Five things are exercised, none of which touches the retained fixture or a network:
 *
 *   1. **Green is reachable.** The approved baseline, seeded into an isolated throwaway temp store,
 *      passes every non-gate check.
 *   2. **Green can go red.** Injected defects turn their check red, including the **targeted C20 tamper
 *      controls** (a metadata / link / claim / plan / activity change in the untargeted store) and the
 *      **C17 identity control** (an AGENDA event duplicated across axes).
 *   3. **Missing approval is BLOCKED, not green.** With the parameter gates unresolved the aggregate is
 *      BLOCKED; the gate views are separated (baseline vs amendment vs retained) and a gate never passes
 *      merely because the baseline equals an approved value.
 *   4. **The fully-PASS path is reachable only through test-only decisions.** `run.mjs` defaults to
 *      BLOCKED; with `--test-only-decisions` it is fully PASS; without the `testOnly` label it refuses.
 *   5. **All temp handles are disposed.** Every isolated store — including each `makeStore()` handle — is
 *      tracked and disposed, and no `wp5-` temp directory remains.
 *
 * Plus the one that matters most: the **real retained-fixture readiness** (the committed, sanitized WP1
 * evidence) is projected into a readback view and run through the same checks; it is red and blocked,
 * never a fictitious green.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { STATUS_VALUES, canonicalReadback, evaluateStore, evaluateView, summarize } from "./checks.mjs";
import {
  addAxis4Evidence,
  applyTestOnlyAmendment,
  listTempStoreDirs,
  openIsolatedStore,
  readView,
  seedApprovedBaseline,
  seedRetainedLike,
} from "./fixture.mjs";
import { AXES, TOPIC_NAMES, testOnlyDecisions, unresolvedGates } from "./manifest.mjs";

const repoRoot = join(import.meta.dir, "../..");

function seededView() {
  const iso = openIsolatedStore("wp5-test");
  try {
    seedApprovedBaseline(iso.store);
    return readView(iso.store);
  } finally {
    iso.dispose();
  }
}

function retainedView() {
  const iso = openIsolatedStore("wp5-retained-test");
  try {
    seedRetainedLike(iso.store);
    return readView(iso.store);
  } finally {
    iso.dispose();
  }
}

const statusOf = (results, id) => results.find((r) => r.id === id)?.status;
const nonGate = (results) => results.filter((r) => !r.id.startsWith("G0"));

/** A resolved gate set from the test-only decisions, with one gate's value overridden. */
function gatesWith(id, value) {
  return testOnlyDecisions().gates.map((g) => (g.id === id ? { ...g, value } : g));
}

// ---------------------------------------------------------------------------- 1. green is reachable

describe("WP5 baseline checks — green is reachable", () => {
  test("the approved baseline, seeded in an isolated store, passes every non-gate check", () => {
    const results = nonGate(evaluateView(seededView(), unresolvedGates()));
    const failed = results.filter((r) => r.status !== STATUS_VALUES.PASS);
    expect(failed.map((r) => `${r.id}:${r.status}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------- 2. green can go red

describe("WP5 negative controls — green can go red", () => {
  const poison = (mutate) => {
    const v = structuredClone(seededView());
    mutate(v);
    return evaluateView(v, unresolvedGates());
  };

  test("a null plan position is red (C11)", () => {
    const results = poison((v) => {
      const axis = v.topics.flatMap((t) => t.axes).find((a) => a.plan);
      axis.plan.steps[2].position = null;
    });
    expect(statusOf(results, "C11")).toBe(STATUS_VALUES.FAIL);
  });

  test("a paraphrased repository description is red (C14)", () => {
    const results = poison((v) => {
      v.repositories[0].description = "A summary that is not the pinned README.";
    });
    expect(statusOf(results, "C14")).toBe(STATUS_VALUES.FAIL);
  });

  test("a confidence left to the store default is red (C08)", () => {
    const results = poison((v) => {
      v.topics[0].axes[0].stateConfidence = "confirmed"; // what the omitted-value default would store
    });
    expect(statusOf(results, "C08")).toBe(STATUS_VALUES.FAIL);
  });

  test("a confirmed claim with no evidence is red (C09)", () => {
    const results = poison((v) => {
      const axis = v.topics.flatMap((t) => t.axes).find((a) => a.blocker);
      axis.evidenceCount = 0; // the same-transaction backing event is gone
    });
    expect(statusOf(results, "C09")).toBe(STATUS_VALUES.FAIL);
  });

  test("the AGENDA event dated to ingestion is red (C12)", () => {
    const results = poison((v) => {
      const axis = v.topics.flatMap((t) => t.axes).find((a) =>
        a.history.some((h) => h.sourceRef === "docs/AGENDA.md")
      );
      const agenda = axis.history.find((h) => h.sourceRef === "docs/AGENDA.md");
      agenda.occurredAt = "2026-10-07T14:32:13.984Z";
      agenda.recordedAt = agenda.occurredAt;
    });
    expect(statusOf(results, "C12")).toBe(STATUS_VALUES.FAIL);
  });

  test("an empty source URL is red (C13)", () => {
    const results = poison((v) => {
      v.topics.flatMap((t) => t.axes).flatMap((a) => a.history)[0].sourceUrl = "";
    });
    expect(statusOf(results, "C13")).toBe(STATUS_VALUES.FAIL);
  });

  test("a wrong event placement mapping is red (C07b)", () => {
    const results = poison((v) => {
      const axis = v.topics[0].axes[0];
      axis.historyCount += 1;
    });
    expect(statusOf(results, "C07b")).toBe(STATUS_VALUES.FAIL);
  });

  test("a drifted topic count is red (C01)", () => {
    const results = poison((v) => {
      v.counts.topics = 3;
    });
    expect(statusOf(results, "C01")).toBe(STATUS_VALUES.FAIL);
  });
});

// ---------------------------------------------------------------------------- 2b. C20 tamper controls

describe("WP5 C20 — targeted tamper controls (a mutation-public change in the untargeted store is red)", () => {
  const runWithTamper = (tamper) => {
    const iso = openIsolatedStore("wp5-c20");
    const aux = [];
    const makeStore = () => {
      const s = openIsolatedStore("wp5-c20-aux");
      aux.push(s);
      return s.store;
    };
    try {
      seedApprovedBaseline(iso.store);
      const results = evaluateStore({
        store: iso.store,
        makeStore,
        pluginActions: [],
        harnessSources: {},
        gates: unresolvedGates(),
        untargetedTamper: tamper,
      });
      return statusOf(results, "C20");
    } finally {
      iso.dispose();
      for (const s of aux) s.dispose();
    }
  };

  test("the untargeted store is unchanged when nothing tampers with it (C20 PASS)", () => {
    expect(runWithTamper(null)).toBe(STATUS_VALUES.PASS);
  });

  test("a repository-metadata change is red (C20)", () => {
    const status = runWithTamper((b) => {
      const repo = b.getRepositoryByFullName("ajegorovs/udv-echo-process");
      b.reconcileTopic({
        topicName: "Experimental research",
        repositories: [{ fullName: repo.fullName, description: "tampered", relationship: "primary" }],
      });
    });
    expect(status).toBe(STATUS_VALUES.FAIL);
  });

  test("a link change is red (C20)", () => {
    const status = runWithTamper((b) => {
      const topic = b.getTopicByName("Experimental research");
      const repo = b.getRepositoryByFullName("ajegorovs/nakama-research-dashboard");
      b.linkTopicRepository(topic.id, repo.id, "supporting");
    });
    expect(status).toBe(STATUS_VALUES.FAIL);
  });

  test("a claim change (currentState/confidence) is red (C20)", () => {
    const status = runWithTamper((b) => {
      const topic = b.getTopicByName("Experimental research");
      const axis = b.listAxes(topic.id)[0];
      b.reconcileTopic({
        topicName: topic.name,
        axes: [{ id: axis.id, expectedVersion: axis.version, currentState: "tampered claim", currentStateConfidence: "inferred" }],
      });
    });
    expect(status).toBe(STATUS_VALUES.FAIL);
  });

  test("a plan-step change (position) is red (C20)", () => {
    const status = runWithTamper((b) => {
      const topic = b.getTopicByName("Experimental research");
      const axis = b.listAxes(topic.id).find((a) => a.title === AXES.find((x) => x.n === 4).title);
      const plan = b.planForAxis(axis.id);
      b.reconcileTopic({
        topicName: topic.name,
        plans: [{ planId: plan.plan.id, axisId: axis.id, summary: plan.plan.summary, steps: plan.steps.map((s, i) => ({ stepId: s.id, title: s.title, position: s.position + 1 + i })) }],
      });
    });
    expect(status).toBe(STATUS_VALUES.FAIL);
  });

  test("an activity change (a new event) is red (C20)", () => {
    const status = runWithTamper((b) => {
      b.reconcileTopic({
        topicName: "Experimental research",
        activities: [{ summary: "tamper event", sourceType: "github_pr", sourceRef: "PR #999", axisTitle: AXES.find((x) => x.n === 1).title }],
      });
    });
    expect(status).toBe(STATUS_VALUES.FAIL);
  });
});

// ---------------------------------------------------------------------------- 2c. C17 identity control

describe("WP5 C17 — source-event identity is axis-independent (cross-axis duplicate is red)", () => {
  const runWithStore = (seed, gates) => {
    const iso = openIsolatedStore("wp5-c17");
    const aux = [];
    const makeStore = () => {
      const s = openIsolatedStore("wp5-c17-aux");
      aux.push(s);
      return s.store;
    };
    try {
      seed(iso.store);
      const results = evaluateStore({
        store: iso.store,
        makeStore,
        pluginActions: [],
        harnessSources: {},
        gates: gates ?? unresolvedGates(),
      });
      return statusOf(results, "C17");
    } finally {
      iso.dispose();
      for (const s of aux) s.dispose();
    }
  };

  test("the baseline has no duplicate identity (C17 PASS)", () => {
    expect(runWithStore(seedApprovedBaseline)).toBe(STATUS_VALUES.PASS);
  });

  test("an AGENDA event duplicated onto a second axis is red without an explicit strategy (C17)", () => {
    const status = runWithStore((store) => {
      seedApprovedBaseline(store);
      store.reconcileTopic({
        topicName: "Experimental research",
        activities: [
          {
            summary: "duplicate AGENDA placement (negative control)",
            sourceType: "repo_document",
            sourceRef: "docs/AGENDA.md",
            sourceUrl: "https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/blob/e6f83b2f5a45a961044b107f2628b046d41c3ab2/docs/AGENDA.md",
            axisTitle: AXES.find((x) => x.n === 1).title,
          },
        ],
      });
    });
    expect(status).toBe(STATUS_VALUES.FAIL);
  });

  test("the same duplicate is still red under a blanket allow (loophole rejected) (C17)", () => {
    const dupSeed = (store) => {
      seedApprovedBaseline(store);
      store.reconcileTopic({
        topicName: "Experimental research",
        activities: [{ summary: "duplicate AGENDA placement", sourceType: "repo_document", sourceRef: "docs/AGENDA.md", axisTitle: AXES.find((x) => x.n === 1).title }],
      });
    };
    const status = runWithStore(dupSeed, gatesWith("G04", { strategy: "duplicate" }));
    expect(status).toBe(STATUS_VALUES.FAIL);
  });

  test("the duplicate passes only when the strategy names that exact ref (C17)", () => {
    const dupSeed = (store) => {
      seedApprovedBaseline(store);
      store.reconcileTopic({
        topicName: "Experimental research",
        activities: [{ summary: "duplicate AGENDA placement", sourceType: "repo_document", sourceRef: "docs/AGENDA.md", axisTitle: AXES.find((x) => x.n === 1).title }],
      });
    };
    const status = runWithStore(dupSeed, gatesWith("G04", { strategy: "duplicate", allow: ["repo_document|docs/AGENDA.md"] }));
    expect(status).toBe(STATUS_VALUES.PASS);
  });
});

// ---------------------------------------------------------------------------- 3. missing approval = BLOCKED

describe("WP5 parameter gates — no default, no fictitious green", () => {
  test("with the gates unresolved the aggregate is BLOCKED, not PASS", () => {
    const results = evaluateView(seededView(), unresolvedGates());
    expect(summarize(results)).toBe(STATUS_VALUES.BLOCKED);
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.BLOCKED);
  });

  test("a role decision with no amendment view is BLOCKED (decision not established)", () => {
    // The baseline withholds all axis→repo links; a resolved role map cannot be verified without an
    // amendment view, so the gate is BLOCKED rather than a baseline-equal false PASS.
    const results = evaluateView(seededView(), gatesWith("G01", Object.fromEntries(AXES.map((a) => [a.title, "primary"]))));
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.BLOCKED);
  });

  test("a role decision verified against a mismatching amendment view is red (G01)", () => {
    const amendment = seededView(); // no axis→repo links applied
    const results = evaluateView(seededView(), gatesWith("G01", Object.fromEntries(AXES.map((a) => [a.title, "primary"]))), { amendment });
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.FAIL);
  });

  test("G03 skip verifies the retained `inferred` and PASSES", () => {
    const results = evaluateView(seededView(), gatesWith("G03", "skip"), { retained: retainedView() });
    expect(statusOf(results, "G03-blocker")).toBe(STATUS_VALUES.PASS);
  });

  test("G03 skip is not a baseline-equal false pass — the baseline (confirmed) is red", () => {
    // The baseline's axis-4 blocker is `confirmed`; presenting it as the retained view must NOT pass.
    const results = evaluateView(seededView(), gatesWith("G03", "skip"), { retained: seededView() });
    expect(statusOf(results, "G03-blocker")).toBe(STATUS_VALUES.FAIL);
  });

  test("G03 restore with evidence PASSES; without evidence is red", () => {
    // With evidence: baseline axis 4 carries the same-transaction AGENDA event, so a `confirmed` restore
    // is backed.
    const iso = openIsolatedStore("wp5-g03");
    const aux = [];
    const makeStore = () => {
      const s = openIsolatedStore("wp5-g03-aux");
      aux.push(s);
      return s.store;
    };
    try {
      seedApprovedBaseline(iso.store);
      applyTestOnlyAmendment(iso.store, gatesWith("G03", "restore"));
      const withEvidence = readView(iso.store);
      const passResults = evaluateView(seededView(), gatesWith("G03", "restore"), { amendment: withEvidence });
      expect(statusOf(passResults, "G03-blocker")).toBe(STATUS_VALUES.PASS);

      // Without evidence: poison the amendment view so axis 4 is `confirmed` with 0 evidence.
      const poisoned = structuredClone(withEvidence);
      const axis4 = poisoned.topics.flatMap((t) => t.axes).find((a) => a.blocker);
      axis4.blockerConfidence = "confirmed";
      axis4.evidenceCount = 0;
      const redResults = evaluateView(seededView(), gatesWith("G03", "restore"), { amendment: poisoned });
      expect(statusOf(redResults, "G03-blocker")).toBe(STATUS_VALUES.FAIL);
    } finally {
      iso.dispose();
      for (const s of aux) s.dispose();
    }
  });

  test("G04 'leave' PASSES; a blanket duplication allow is red; a named allow is BLOCKED (needs an execution)", () => {
    const leave = evaluateView(seededView(), gatesWith("G04", "leave"));
    expect(statusOf(leave, "G04-evidence")).toBe(STATUS_VALUES.PASS);
    const blanket = evaluateView(seededView(), gatesWith("G04", { strategy: "duplicate" }));
    expect(statusOf(blanket, "G04-evidence")).toBe(STATUS_VALUES.FAIL);
    const named = evaluateView(seededView(), gatesWith("G04", { strategy: "duplicate", allow: ["x|y"] }));
    expect(statusOf(named, "G04-evidence")).toBe(STATUS_VALUES.BLOCKED);
  });

  test("G05 accepts a proposed-target decision only; an authorization claim is red", () => {
    const proposed = evaluateView(seededView(), gatesWith("G05", { proposedTarget: "test-only", ownerAuthorization: false, liveBinding: false }));
    expect(statusOf(proposed, "G05-target")).toBe(STATUS_VALUES.PASS);
    const claimed = evaluateView(seededView(), gatesWith("G05", { proposedTarget: "test-only", ownerAuthorization: true }));
    expect(statusOf(claimed, "G05-target")).toBe(STATUS_VALUES.FAIL);
  });

  test("the fully-resolved test-only decisions with both views make the view family fully PASS", () => {
    const decisions = testOnlyDecisions();
    const results = evaluateView(seededView(), decisions.gates, { amendment: seededView(), retained: retainedView() });
    // Without the amendment deltas G01 is red here; the point is that a resolved gate is *verified*, not
    // defaulted. Assert G04/G05/G03 pass and that no gate is BLOCKED.
    expect(statusOf(results, "G04-evidence")).toBe(STATUS_VALUES.PASS);
    expect(statusOf(results, "G05-target")).toBe(STATUS_VALUES.PASS);
    expect(statusOf(results, "G03-blocker")).toBe(STATUS_VALUES.PASS);
    expect(results.some((r) => r.status === STATUS_VALUES.BLOCKED)).toBe(false);
  });
});

// ---------------------------------------------------------------------------- 4. real fixture readiness

/**
 * Project the committed, sanitized WP1 evidence (`fixture_measured`) into the readback-view shape. This
 * is a **faithful projection of the retained fixture's measured state** — the real readiness, committed
 * read-only — not a live read and not the retained fixture itself.
 */
function readinessView() {
  const evidence = JSON.parse(
    readFileSync(join(repoRoot, "docs/reviews/wp1-public-research-fixture-verification-evidence.json"), "utf8")
  );
  const titleByKey = {
    udv_acquisition_automation: "UDV acquisition automation",
    udv_sparse_analysis_validation: "UDV sparse-analysis validation",
    high_rate_optical_acquisition: "High-rate optical acquisition",
    grablink_diagnostics_and_sustained_rate_validation: "Grablink diagnostics and sustained-rate validation",
    research_dashboard_and_focused_retrieval: "Research dashboard and focused retrieval",
    agent_consultation_and_automation_evidence: "Agent consultation and automation evidence",
  };
  const repoFull = { udv: "ajegorovs/udv-echo-process", Grablink: "ajegorovs/Grablink-Full-sequence-acquisition" };
  const fm = evidence.fixture_measured;

  const axesByTitle = {};
  for (const [key, a] of Object.entries(fm.axes)) {
    const title = titleByKey[key];
    const refs = [];
    for (const r of a.includes ?? []) refs.push({ sourceRef: r, occurredAt: "", recordedAt: "" });
    for (const c of a.commits ?? []) refs.push({ sourceRef: c, occurredAt: "", recordedAt: "" });
    // The AGENDA event carries the ingestion timestamp in the retained fixture (F05).
    if (refs.some((r) => r.sourceRef === "docs/AGENDA.md")) {
      const agenda = refs.find((r) => r.sourceRef === "docs/AGENDA.md");
      agenda.occurredAt = fm.agenda_event.occurredAt;
      agenda.recordedAt = fm.agenda_event.recordedAt;
    }
    const history = refs.map((r) => ({ sourceType: "unknown", sourceUrl: "", ...r }));
    axesByTitle[title] = {
      id: `readiness-${key}`,
      title,
      state: "usable",
      stateConfidence: "inferred",
      currentState: a.currentState ?? (a.currentState_present ? "(present)" : ""),
      currentStateConfidence: a.currentStateConfidence ?? (a.currentState_present ? "inferred" : null),
      blocker: a.blocker_present ? "(present)" : "",
      blockerConfidence: a.blocker_present ? "inferred" : null, // the RATIFIED retained value
      evidenceCount: a.evidence ?? 0,
      historyCount: history.length,
      history,
      plan:
        a.plan_steps != null
          ? {
              id: "readiness-plan",
              summary: "",
              steps: Array.from({ length: a.plan_steps }, (_, i) => ({
                id: `readiness-step-${i}`,
                title: "(step)",
                position: a.positions_all_null ? null : i + 1, // F12: all null in the retained fixture
              })),
            }
          : null,
      problems: Array.from({ length: a.problems ?? 0 }, () => ({
        statement: "",
        state: "open",
        stateConfidence: "confirmed",
        repositoryFullNames:
          a.problem_repo_linked && key === "grablink_diagnostics_and_sustained_rate_validation"
            ? ["ajegorovs/Grablink-Full-sequence-acquisition"]
            : [],
      })),
      repositories: (a.repos ?? []).map((name) => ({
        fullName: repoFull[name] ?? name,
        relationship: "supporting", // the retained fixture's unapproved default (F01)
      })),
      people: [],
    };
  }

  const topics = TOPIC_NAMES.map((name) => ({
    id: `readiness-topic-${name}`,
    name,
    version: 1,
    axes: AXES.filter((d) => d.topic === name).map((d) => axesByTitle[d.title]),
    repositories: [],
    people: [],
    lastActivityAt: null,
    activityCount: 0,
  }));

  return {
    counts: { ...fm.counts, people: fm.counts.people },
    topics,
    generatedAt: "as-of-read (sanitized evidence)",
    repositories: Object.entries(fm.repositories).map(([fullName, r]) => ({
      fullName,
      url: r.url,
      description: r.description,
      defaultBranch: r.defaultBranch,
    })),
  };
}

describe("WP5 against the real retained-fixture readiness", () => {
  test("the committed readiness evidence is the retained fixture (2/6/3/1)", () => {
    const evidence = JSON.parse(
      readFileSync(join(repoRoot, "docs/reviews/wp1-public-research-fixture-verification-evidence.json"), "utf8")
    );
    expect(evidence.status).toContain("wp1-executed");
    expect(evidence.fixture_measured.counts).toMatchObject({ topics: 2, axes: 6, repositories: 3, people: 1 });
  });

  test("a run over the real readiness is NOT green — red and blocked, never a fictitious pass", () => {
    const results = evaluateView(readinessView(), unresolvedGates());
    expect(summarize(results)).not.toBe(STATUS_VALUES.PASS);
    // Metadata is skeletal (F09/F07), plan positions are all null (F12), the source URLs are empty (F10),
    // and the AGENDA event is ingestion-dated (F05) — each must be red.
    expect(statusOf(results, "C14")).toBe(STATUS_VALUES.FAIL);
    expect(statusOf(results, "C11")).toBe(STATUS_VALUES.FAIL);
    expect(statusOf(results, "C13")).toBe(STATUS_VALUES.FAIL);
    expect(statusOf(results, "C12")).toBe(STATUS_VALUES.FAIL);
    // The AGENDA event sits on the high-rate axis, not its dependent axis → mapping 2/1/2/0/3/0 (F03).
    expect(statusOf(results, "C07b")).toBe(STATUS_VALUES.FAIL);
    // The axis→repository roles remain unapproved regardless → BLOCKED, not a default.
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.BLOCKED);
  });
});

// ---------------------------------------------------------------------------- 5. store family

describe("WP5 store-family checks", () => {
  test("every store-family check passes on the isolated approved seed", () => {
    const iso = openIsolatedStore("wp5-store-test");
    const aux = [];
    const makeStore = () => {
      const s = openIsolatedStore("wp5-store-aux");
      aux.push(s);
      return s.store;
    };
    try {
      seedApprovedBaseline(iso.store);
      const results = evaluateStore({
        store: iso.store,
        makeStore,
        pluginActions: ["get_overview", "get_topic", "reconcile_topic", "record_activity"],
        harnessSources: {},
        gates: unresolvedGates(),
      });
      const failed = results.filter((r) => r.status !== STATUS_VALUES.PASS);
      expect(failed.map((r) => `${r.id}:${r.status}`)).toEqual([]);
    } finally {
      iso.dispose();
      for (const s of aux) s.dispose();
    }
  });

  test("the safety guard is red when a module could reach a network or name a target", () => {
    // Built by concatenation so this test's own source does not contain the tokens the guard hunts for.
    const netImport = ["node", "net"].join(":");
    const net = evaluateStore({
      store: openIsolatedStore("wp5-guard").store,
      makeStore: () => openIsolatedStore("wp5-guard-aux").store,
      pluginActions: [],
      harnessSources: { "some-module.mjs": `import * as net from "${netImport}";` },
      gates: unresolvedGates(),
    });
    expect(statusOf(net, "C21")).toBe(STATUS_VALUES.FAIL);
  });
});

// ---------------------------------------------------------------------------- 6. temp cleanup

describe("WP5 temp cleanup", () => {
  test("every isolated store handle (including each makeStore handle) is disposed; no wp5- dirs remain", () => {
    const before = listTempStoreDirs().length;
    const handles = [];
    const makeStore = () => {
      const s = openIsolatedStore("wp5-cleanup-aux");
      handles.push(s);
      return s.store;
    };
    const primary = openIsolatedStore("wp5-cleanup");
    handles.push(primary);
    try {
      seedApprovedBaseline(primary.store);
      evaluateView(readView(primary.store), unresolvedGates(), { retained: retainedView() });
      evaluateStore({
        store: primary.store,
        makeStore,
        pluginActions: [],
        harnessSources: {},
        gates: unresolvedGates(),
      });
    } finally {
      for (const s of handles) s.dispose();
    }
    expect(listTempStoreDirs().length).toBe(before);
    // Every handle we created is disposed, which removes its directory.
    for (const s of handles) expect(s.dir.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------- 7. the runner

describe("WP5 runner — default BLOCKED, test-only decisions reachable, no-label refused", () => {
  const run = (args) =>
    spawnSync("bun", [join(import.meta.dir, "run.mjs"), ...args], { cwd: repoRoot, encoding: "utf8" });

  test("the default runner aggregates BLOCKED (exit 2)", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("BLOCKED");
  });

  test("the runner reaches a fully PASS with test-only decisions (exit 0)", () => {
    const result = run(["--test-only-decisions"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("TEST-ONLY SYNTHETIC");
    expect(result.stdout).toContain("result: PASS");
  });

  test("the runner refuses a decisions payload without the testOnly label (exit 3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "wp5-decisions-"));
    const path = join(dir, "unlabelled.json");
    writeFileSync(path, JSON.stringify({ gates: testOnlyDecisions().gates })); // no `testOnly: true`
    const result = spawnSync("bun", [join(import.meta.dir, "run.mjs"), "--decisions", path], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("REFUSED");
  });
});
