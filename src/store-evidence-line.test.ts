/**
 * The workstream evidence line — the projection fact and the rule behind it (requirements #17/#18).
 *
 * This is the *meaning* half of the served evidence-line probe: it asserts, against the schema the host
 * applies (migrations 001–006), that
 *
 *   - the scoped workstream read carries the axis's **recorded evidence** (`axisEvidence`: structural
 *     branch/PR plus the axis's own activities and notes), and reports its coverage;
 *   - an axis that states a current reading but has recorded **no** evidence reads `evidence: []` —
 *     evidence-absence is independent of progress (the reading is present, the evidence is not);
 *   - a `confirmed` claim is only ever persisted when that evidence exists **and it was asserted**:
 *     `assertClaimsAreBacked` refuses an asserted `confirmed` claim with no evidence on every axis write
 *     path, so a reader never sees a confirmed claim a caller stated without backing. The rule bans an
 *     asserted claim, not the value: an axis that names no state keeps the column's own `confirmed`
 *     default with no evidence on record (nobody claimed it), which is why the page may not tell a reader
 *     that a confirmed reading is "impossible" beside an empty evidence line;
 *   - the store neither upgrades nor downgrades a persisted confidence — what a caller wrote is what
 *     reads back, so the evidence line never restates (or overrides) the claim's own confidence.
 *
 * The negative controls are the point: the last two assertions would pass trivially if the evidence set
 * and the confidence rule were not actually coupled.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Axis, ResearchStore, ResearchStoreError, type Topic } from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
  "006-task-plan-text.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

function openStore(): ResearchStore {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-evidence-${crypto.randomUUID()}.sqlite`;
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return new ResearchStore(path);
}

function seed(store: ResearchStore, name = "Evidence line"): { topic: Topic; axis: Axis } {
  const topic = store.createTopic({ name });
  const axis = store.createAxis({
    kind: "experiment",
    // An axis that names its state with no evidence yet must say the honest confidence: the column
    // default (`confirmed`) is refused the moment a state is asserted and nothing backs it. This is the
    // same rule the served seeder follows (every synthetic axis is written `inferred`).
    state: "active",
    stateConfidence: "inferred",
    title: "Subgrid closure",
    topicId: topic.id,
  });
  return { axis, topic };
}

function caught(fn: () => unknown): Error | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe("workstream evidence line — the projection fact", () => {
  test("an axis with a branch and recorded activity carries both as evidence, and states its coverage", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    const axis = store.createAxis({
      branch: "data/subgrid-closure",
      kind: "experiment",
      state: "active",
      title: "Subgrid closure",
      topicId: topic.id,
    });
    store.addActivity({ axisId: axis.id, summary: "ran the sweep", topicId: topic.id });

    const ws = store.getAxisWorkstream(topic.id, axis.id);
    const kinds = ws.axis.evidence.map((item) => item.kind).sort();
    expect(kinds).toEqual(["activity", "branch"]);
    // The line is not empty and its coverage is not "absent": the reading was given rows.
    expect(ws.coverage.evidence.absent).toBe(false);
    expect(ws.coverage.evidence.total).toBeGreaterThanOrEqual(2);
    expect(ws.coverage.evidence.returned).toBe(ws.axis.evidence.length);
  });

  test("a note on the axis is evidence too (kind annotation)", () => {
    const store = openStore();
    const { topic, axis } = seed(store);
    store.addAnnotation({ axisId: axis.id, text: "parked while the papers land" });

    const ws = store.getAxisWorkstream(topic.id, axis.id);
    expect(ws.axis.evidence.some((item) => item.kind === "annotation")).toBe(true);
  });

  test("an axis that states a reading but has recorded no evidence reads an empty evidence set", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    // A current reading IS stated (progress exists) … and its confidence is `inferred`, the honest value
    // when nothing backs it. This is the evidence-absent-but-progress-present case: absence of evidence
    // is independent of absence of progress.
    const axis = store.createAxis({
      currentState: "drafting the closure note",
      currentStateConfidence: "inferred",
      kind: "investigation",
      state: "active",
      stateConfidence: "inferred",
      title: "Reading without evidence",
      topicId: topic.id,
    });

    const ws = store.getAxisWorkstream(topic.id, axis.id);
    expect(ws.axis.currentState).toBe("drafting the closure note");
    expect(ws.axis.currentStateConfidence).toBe("inferred");
    expect(ws.axis.evidence).toEqual([]);
    // `absent` is the empty-collection fact, distinct from `truncated` (rows left out).
    expect(ws.coverage.evidence.absent).toBe(true);
    expect(ws.coverage.evidence.truncated).toBe(false);
  });
});

describe("workstream evidence line — the rule behind it (no unsupported confirmed claim)", () => {
  test("creating an axis with a confirmed state and no evidence is refused", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    const error = caught(() =>
      store.createAxis({
        kind: "experiment",
        state: "active",
        stateConfidence: "confirmed",
        title: "Unbacked confirmed",
        topicId: topic.id,
      })
    );
    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(error?.message).toMatch(/no evidence/i);
  });

  test("a state nobody asserted keeps the column's default `confirmed` with no evidence — the distinction", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    // `{ title }` names no state, so nothing is claimed: the axis is created and the column's default
    // (`confirmed`) stands, with no evidence recorded. So an evidence-free axis CAN read `confirmed` — the
    // rule refuses an *asserted* confirmed claim, not the value — which is exactly why the page must not
    // print "a confirmed claim is impossible" beside an empty evidence line.
    const axis = store.createAxis({
      kind: "experiment",
      title: "No state asserted",
      topicId: topic.id,
    });
    const ws = store.getAxisWorkstream(topic.id, axis.id);
    expect(ws.axis.stateConfidence).toBe("confirmed");
    expect(ws.axis.evidence).toEqual([]);
    expect(ws.coverage.evidence.absent).toBe(true);
  });

  test("a confirmed current reading with no evidence is refused; the same reading as inferred is accepted", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    const refused = caught(() =>
      store.createAxis({
        currentState: "the sweep agrees",
        currentStateConfidence: "confirmed",
        kind: "experiment",
        state: "active",
        title: "Unbacked reading",
        topicId: topic.id,
      })
    );
    expect(refused?.message).toMatch(/no evidence/i);
    // Nothing was written: the refusal rolls the whole create back.
    expect(store.listAxes(topic.id)).toHaveLength(0);

    // The honest value for the same text is accepted, and reads back exactly as written.
    const axis = store.createAxis({
      currentState: "the sweep agrees",
      currentStateConfidence: "inferred",
      kind: "experiment",
      state: "active",
      stateConfidence: "inferred",
      title: "Inferred reading",
      topicId: topic.id,
    });
    expect(axis.currentStateConfidence).toBe("inferred");
  });

  test("once evidence exists, the same claim may be confirmed — the rule is evidence, not a blanket ban", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    const axis = store.createAxis({
      branch: "data/subgrid-closure",
      currentState: "the sweep agrees",
      currentStateConfidence: "inferred",
      kind: "experiment",
      state: "active",
      title: "Backed reading",
      topicId: topic.id,
    });
    const updated = store.updateAxis(axis.id, { currentStateConfidence: "confirmed" });
    expect(updated.currentStateConfidence).toBe("confirmed");
  });

  test("the store neither upgrades nor downgrades a persisted confidence — what was written is what reads back", () => {
    const store = openStore();
    const topic = store.createTopic({ name: "T" });
    const axis = store.createAxis({
      branch: "data/subgrid-closure",
      kind: "experiment",
      state: "active",
      stateConfidence: "uncertain",
      title: "Uncertain but evidenced",
      topicId: topic.id,
    });
    // Evidence exists, yet the persisted confidence stays `uncertain` — the line does not promote it.
    const ws = store.getAxisWorkstream(topic.id, axis.id);
    expect(ws.axis.stateConfidence).toBe("uncertain");
    expect(ws.axis.evidence.length).toBeGreaterThan(0);
  });
});
