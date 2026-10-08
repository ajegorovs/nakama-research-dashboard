/**
 * wp5/wp5-checks.test.mjs — the WP5 check suite. It PASSES, and what it proves is that the checker
 * **can go red and can report BLOCKED** — so a green result from `run.mjs` would mean something.
 *
 *   bun test harness/wp5/wp5-checks.test.mjs
 *
 * Three things are exercised, none of which touches the retained fixture or a network:
 *
 *   1. **Green is reachable.** The approved baseline, seeded into an isolated throwaway temp store,
 *      passes every non-gate check.
 *   2. **Green can go red.** Injected defects (a null position, a paraphrased description, a defaulted
 *      confidence, a confirmed claim without evidence, a wrong event mapping, an ingestion-dated event,
 *      an empty source URL, a drifted count) each turn their check red.
 *   3. **Missing approval is BLOCKED, not green.** With the parameter gates unresolved the aggregate is
 *      BLOCKED — never a defaulted PASS — and resolving a gate flips only *its own* check.
 *
 * Plus the one that matters most: the **real retained-fixture readiness** (the committed, sanitized WP1
 * evidence) is projected into a readback view and run through the same checks; it is red and blocked,
 * never a fictitious green.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { STATUS_VALUES, evaluateStore, evaluateView, summarize } from "./checks.mjs";
import { openIsolatedStore, readView, seedApprovedBaseline } from "./fixture.mjs";
import { AXES, TOPIC_NAMES, unresolvedGates } from "./manifest.mjs";

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

const statusOf = (results, id) => results.find((r) => r.id === id)?.status;
const nonGate = (results) => results.filter((r) => !r.id.startsWith("G0"));

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

// ---------------------------------------------------------------------------- 3. missing approval = BLOCKED

describe("WP5 parameter gates — no default, no fictitious green", () => {
  test("with the gates unresolved the aggregate is BLOCKED, not PASS", () => {
    const results = evaluateView(seededView(), unresolvedGates());
    expect(summarize(results)).toBe(STATUS_VALUES.BLOCKED);
    // The six axis→repository roles specifically: BLOCKED, never a defaulted `supporting`.
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.BLOCKED);
  });

  test("resolving a gate flips only its own check; unresolved gates stay BLOCKED", () => {
    const gates = unresolvedGates().map((g) => {
      if (g.id === "G03") return { ...g, resolved: true, value: "confirmed" };
      if (g.id === "G04") return { ...g, resolved: true, value: "leave" };
      return g;
    });
    const results = evaluateView(seededView(), gates);
    expect(statusOf(results, "G03-blocker")).toBe(STATUS_VALUES.PASS);
    expect(statusOf(results, "G04-evidence")).toBe(STATUS_VALUES.PASS);
    // G01 (roles), G02 (F08 wording) and G05 (target) are still unapproved → still BLOCKED.
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.BLOCKED);
    expect(statusOf(results, "G02-currentstate")).toBe(STATUS_VALUES.BLOCKED);
    expect(statusOf(results, "G05-target")).toBe(STATUS_VALUES.BLOCKED);
  });

  test("a resolved role gate that does not match the stored links is red, not silent", () => {
    // The baseline withholds all axis→repo links, so any approved role map is unsatisfied → FAIL.
    const gates = unresolvedGates().map((g) =>
      g.id === "G01"
        ? { ...g, resolved: true, value: Object.fromEntries(AXES.map((a) => [a.title, "primary"])) }
        : g
    );
    const results = evaluateView(seededView(), gates);
    expect(statusOf(results, "G01-roles")).toBe(STATUS_VALUES.FAIL);
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
    });
    expect(statusOf(net, "C21")).toBe(STATUS_VALUES.FAIL);
  });
});
