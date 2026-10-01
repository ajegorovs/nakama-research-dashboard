/**
 * U2 store tests: the runtime half of the v2 model.
 *
 * Problems, plans and state transitions, against a database built from the shipped migrations (001–004).
 *
 * These are the tests the earlier store could not have expressed. A transition is a *recorded* event —
 * append-only, carrying the state it replaced and the actor who caused it; a no-op is refused rather than
 * written, because no column CHECK can compare a request with the row it is replacing; a human's words
 * survive an agent's update, and authorship follows the words rather than the row; and a writer that lost a
 * race gets a conflict instead of appending history derived from a state it no longer owned.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Axis,
  ResearchStore,
  ResearchStoreConflictError,
  ResearchStoreError,
} from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

function tempPath(): string {
  return `${process.env.TMPDIR ?? "/tmp"}/research-ux-v2-${crypto.randomUUID()}.sqlite`;
}

function seededPath(): string {
  const path = tempPath();
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return path;
}

function openStore(): { path: string; store: ResearchStore } {
  const path = seededPath();
  return { path, store: new ResearchStore(path) };
}

function count(path: string, table: string): number {
  const db = new Database(path);
  try {
    return (
      db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
    ).n;
  } finally {
    db.close();
  }
}

/** A topic with one active axis — the shape every test below starts from. */
function seedAxis(store: ResearchStore): Axis {
  const topic = store.createTopic({ name: "Turbulence modelling" });
  // The branch is not decoration: the store refuses a `confirmed` state claim with nothing behind it, and
  // that rule predates U2. The fixture satisfies it the way real data does.
  return store.createAxis({
    branch: "data/subgrid-closure",
    kind: "experiment",
    state: "active",
    title: "Subgrid closure",
    topicId: topic.id,
  });
}

function caught(fn: () => unknown): Error | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe("U2 axis transitions", () => {
  test("records the transition with the state it replaced and the actor who caused it", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);

    const { axis: after, transition } = store.transitionAxis({
      actorId: "person-1",
      axisId: axis.id,
      observedAt: "2026-09-30T09:00:00.000Z",
      origin: "human",
      toState: "usable",
    });

    expect(after.state).toBe("usable");
    expect(after.version).toBe(axis.version + 1);
    expect(transition.fromState).toBe("active");
    expect(transition.toState).toBe("usable");
    expect(transition.origin).toBe("human");
    expect(transition.actorId).toBe("person-1");
    // Observed and recorded are different facts, and this is where that shows.
    expect(transition.observedAt).toBe("2026-09-30T09:00:00.000Z");
    expect(transition.recordedAt).toBeTruthy();
    expect(transition.recordedAt).not.toBe(transition.observedAt);
    expect(count(path, "state_log")).toBe(1);
    expect(store.axisStateHistory(axis.id).map((row) => row.toState)).toEqual([
      "usable",
    ]);
  });

  test("refuses a no-op transition and writes nothing at all", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);

    const error = caught(() =>
      store.transitionAxis({
        axisId: axis.id,
        origin: "human",
        toState: "active",
      })
    );

    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).toContain("no-op:");
    expect(count(path, "state_log")).toBe(0);
    expect((store.getAxis(axis.id) as Axis).state).toBe("active");
    expect((store.getAxis(axis.id) as Axis).version).toBe(axis.version);
  });

  test("refuses a state outside the vocabulary as something the caller can fix", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);

    const error = caught(() =>
      store.transitionAxis({
        axisId: axis.id,
        origin: "human",
        // Deliberately not a state: a raw CHECK violation would reach the caller as a generic 500.
        toState: "finished" as unknown as Axis["state"],
      })
    );

    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).not.toContain("SQLITE");
    expect(count(path, "state_log")).toBe(0);
  });

  test("keeps the prior state in history when work is reopened", () => {
    const { store, path } = openStore();
    const axis = seedAxis(store);

    store.transitionAxis({ axisId: axis.id, origin: "human", toState: "usable" });
    store.transitionAxis({ axisId: axis.id, origin: "human", toState: "active" });

    // Reopening is not a special case: it is a transition back, and the `usable` row survives it.
    const history = store.axisStateHistory(axis.id);
    expect(history.map((row) => [row.fromState, row.toState])).toEqual([
      ["active", "usable"],
      ["usable", "active"],
    ]);
    expect((store.getAxis(axis.id) as Axis).state).toBe("active");
    expect(count(path, "state_log")).toBe(2);
  });

  test("a stale writer conflicts instead of appending history it no longer owns", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);
    const other = new ResearchStore(path);

    // Both writers read the same version before either writes.
    const versionSeen = axis.version;
    store.transitionAxis({
      axisId: axis.id,
      expectedVersion: versionSeen,
      origin: "human",
      toState: "usable",
    });

    const error = caught(() =>
      other.transitionAxis({
        axisId: axis.id,
        expectedVersion: versionSeen,
        origin: "agent",
        toState: "completed",
      })
    );

    expect(error).toBeInstanceOf(ResearchStoreConflictError);
    expect(String(error)).toContain("conflict:");
    // Exactly one transition landed: the loser appended nothing based on the state it thought it had.
    expect(count(path, "state_log")).toBe(1);
    expect((store.getAxis(axis.id) as Axis).state).toBe("usable");
    expect((store.getAxis(axis.id) as Axis).version).toBe(versionSeen + 1);
    other.close();
  });

  test("leaves the axis and the log untouched when the transition itself fails", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);

    // The store's existing rule: an axis cannot be blocked without saying what it waits on. The point of
    // the test is not the rule, it is that the half-applied transition is impossible — state and history
    // can never disagree about what happened.
    const error = caught(() =>
      store.transitionAxis({
        axisId: axis.id,
        origin: "agent",
        toState: "blocked",
        blocker: "",
      })
    );

    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(count(path, "state_log")).toBe(0);
    const unchanged = store.getAxis(axis.id) as Axis;
    expect(unchanged.state).toBe("active");
    expect(unchanged.version).toBe(axis.version);
    expect(unchanged.blocker).toBe("");
  });

  test("a newly created usable axis is a state the store understands", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Calibration" });

    const axis = store.createAxis({
      state: "usable",
      stateConfidence: "inferred",
      title: "RANS baseline",
      topicId: topic.id,
    });

    expect(axis.state).toBe("usable");
  });
});

describe("U2 problems", () => {
  test("records the opening state, then resolves and reopens without losing either", () => {
    const { store } = openStore();
    const axis = seedAxis(store);

    const problem = store.createProblem({
      authorId: "agent-7",
      authorType: "agent",
      axisId: axis.id,
      statement: "The closure over-predicts dissipation in the log layer.",
    });

    expect(problem.state).toBe("open");
    expect(problem.version).toBe(1);
    store.transitionProblem({
      actorId: "person-1",
      id: problem.id,
      origin: "human",
      toState: "resolved",
    });
    const reopened = store.transitionProblem({
      actorId: "person-1",
      id: problem.id,
      origin: "human",
      toState: "open",
    });

    expect(reopened.problem.state).toBe("open");
    // The opening row is here too: with it, "when did this open" is answerable rather than implied.
    expect(
      store.problemStateHistory(problem.id).map((row) => [row.fromState, row.toState])
    ).toEqual([
      [null, "open"],
      ["open", "resolved"],
      ["resolved", "open"],
    ]);
  });

  test("refuses a no-op problem transition and writes nothing", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorType: "agent",
      axisId: axis.id,
      statement: "Still open.",
    });

    const error = caught(() =>
      store.transitionProblem({
        id: problem.id,
        origin: "agent",
        toState: "open",
      })
    );

    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).toContain("no-op:");
    // One row, and it is the creation's — no second row for a change that did not happen.
    expect(count(path, "state_log")).toBe(1);
  });

  test("a problem with no repository, no plan and no activity is still a problem", () => {
    const { store } = openStore();
    const axis = seedAxis(store);

    const problem = store.createProblem({
      authorType: "human",
      axisId: axis.id,
      statement: "The inlet profile is not documented anywhere.",
    });

    expect(problem.planStepId).toBeNull();
    expect(store.problemsForRepository("repo-that-does-not-exist")).toEqual([]);
    expect(store.getProblem(problem.id)?.statement).toBe(
      "The inlet profile is not documented anywhere."
    );
  });

  test("links a problem to repositories and people, and reads it back from the repository side", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const repo = store.registerRepository({ fullName: "group/turbulence" });
    const person = store.registerPerson({ displayName: "A. Researcher" });
    const problem = store.createProblem({
      authorType: "agent",
      axisId: axis.id,
      personIds: [person.person.id],
      repositoryFullNames: ["group/turbulence"],
      statement: "The boundary layer trips too early.",
    });

    // Naming the repository registered it inside the same call, and the rollup reads the other way round.
    expect(store.problemsForRepository(repo.repository.id).map((row) => row.id)).toEqual([
      problem.id,
    ]);
    expect(store.getProblem(problem.id)?.axisId).toBe(axis.id);
  });

  test("an agent cannot rewrite a human's words, even on a problem the agent created", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorId: "agent-7",
      authorType: "agent",
      axisId: axis.id,
      statement: "First draft of the statement.",
    });

    // The handoff: a human rewrites the statement, and authorship follows the words.
    const rewritten = store.updateProblem({
      authorId: "person-1",
      authorType: "human",
      id: problem.id,
      statement: "Rewritten by the person who actually ran the experiment.",
    });
    expect(rewritten.authorType).toBe("human");

    const error = caught(() =>
      store.updateProblem({
        authorId: "agent-7",
        authorType: "agent",
        id: problem.id,
        statement: "An agent's tidier version of the same sentence.",
      })
    );
    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).toContain("human-authored:");
    expect(store.getProblem(problem.id)?.statement).toBe(
      "Rewritten by the person who actually ran the experiment."
    );

    // The agent may still change the operational fields around the human's text.
    const linked = store.updateProblem({
      authorId: "agent-7",
      authorType: "agent",
      id: problem.id,
      stateConfidence: "inferred",
    });
    expect(linked.statement).toBe(
      "Rewritten by the person who actually ran the experiment."
    );
    expect(linked.stateConfidence).toBe("inferred");
  });

  test("a statement no human has touched stays open to a later agent write", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorType: "agent",
      axisId: axis.id,
      statement: "An agent's first attempt.",
    });

    const updated = store.updateProblem({
      authorId: "agent-9",
      authorType: "agent",
      id: problem.id,
      statement: "An agent's clearer second attempt.",
    });

    expect(updated.statement).toBe("An agent's clearer second attempt.");
  });

  test("an update never changes a problem's state — that is the transition writer's job", () => {
    const { path, store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorType: "agent",
      axisId: axis.id,
      statement: "Open, and staying open through this update.",
    });

    const updated = store.updateProblem({
      authorType: "agent",
      id: problem.id,
      statement: "Open, with a better sentence.",
    });

    expect(updated.state).toBe("open");
    expect(count(path, "state_log")).toBe(1);
  });
});

describe("U2 plans", () => {
  test("a plan with positions returns its steps in order, and a problem can point at one", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const plan = store.createPlan({
      authorId: "person-1",
      authorType: "human",
      axisId: axis.id,
      summary: "Two-step closure rework.",
    });
    const second = store.createPlanStep({
      planId: plan.id,
      position: 2,
      title: "Re-fit the constants",
    });
    store.createPlanStep({
      planId: plan.id,
      position: 1,
      title: "Re-run the baseline",
    });

    const read = store.planForAxis(axis.id);
    expect(read?.plan.id).toBe(plan.id);
    expect(read?.steps.map((step) => [step.position, step.title])).toEqual([
      [1, "Re-run the baseline"],
      [2, "Re-fit the constants"],
    ]);

    const problem = store.createProblem({
      authorType: "agent",
      axisId: axis.id,
      planStepId: second.id,
      statement: "The re-fit does not converge at the finest resolution.",
    });
    expect(store.getProblem(problem.id)?.planStepId).toBe(second.id);
  });

  test("an unordered plan reports no positions rather than inventing them", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const plan = store.createPlan({
      authorType: "human",
      axisId: axis.id,
      summary: "A checklist, not a sequence.",
    });
    store.createPlanStep({ planId: plan.id, title: "Check the inlet profile" });
    store.createPlanStep({ planId: plan.id, title: "Check the outlet" });

    const steps = store.listPlanSteps(plan.id);
    expect(steps.map((step) => step.position)).toEqual([null, null]);
    expect(steps.map((step) => step.state)).toEqual(["pending", "pending"]);
  });

  test("a step's state moves, and a step from another axis's plan is refused", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const otherAxis = store.createAxis({
      stateConfidence: "inferred",
      title: "Second axis",
      topicId: axis.topicId,
    });
    const plan = store.createPlan({
      authorType: "human",
      axisId: axis.id,
      summary: "Plan on the first axis.",
    });
    const step = store.createPlanStep({ planId: plan.id, title: "Do the thing" });

    const done = store.updatePlanStep({ id: step.id, state: "done" });
    expect(done.state).toBe("done");

    const error = caught(() =>
      store.createProblem({
        authorType: "agent",
        axisId: otherAxis.id,
        planStepId: step.id,
        statement: "Points at another axis's step.",
      })
    );
    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).toContain("another axis");
  });

  test("plans are optional: a problem never invents one", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorType: "agent",
      axisId: axis.id,
      statement: "No plan exists for this axis at all.",
    });

    expect(store.planForAxis(axis.id)).toBeNull();
    expect(store.listPlans(axis.id)).toEqual([]);
    expect(store.getProblem(problem.id)?.planStepId).toBeNull();
  });
});

describe("U2 claims and evidence links", () => {
  test("a steering claim must name exactly one target", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const topic = store.getTopic(axis.topicId);

    const error = caught(() =>
      store.addAnnotation({
        axisId: axis.id,
        confidence: "confirmed",
        kind: "steering",
        text: "Two targets, one claim — ambiguous the moment either changes.",
        topicId: topic?.id,
      })
    );

    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).toContain("exactly one");

    const one = store.addAnnotation({
      axisId: axis.id,
      confidence: "confirmed",
      kind: "steering",
      text: "This line of work should be read as an investigation, not a deadline.",
    });
    expect(one.kind).toBe("steering");
    expect(one.confidence).toBe("confirmed");
    expect(one.topicId).toBeNull();
  });

  test("the historical note shape still works, and a note carries no confidence", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const topic = store.getTopic(axis.topicId);

    // Five of the seven rows in the real corpus database are shaped like this; the write path must keep
    // accepting them, or preserving history would mean refusing new rows shaped like old ones.
    const note = store.addAnnotation({
      axisId: axis.id,
      text: "Sits on the topic and the axis, the way the corpus's notes do.",
      topicId: topic?.id,
    });
    expect(note.kind).toBe("note");
    expect(note.confidence).toBeNull();
    expect(note.topicId).toBe(topic?.id);
    expect(note.axisId).toBe(axis.id);

    const error = caught(() =>
      store.addAnnotation({
        axisId: axis.id,
        confidence: "confirmed",
        text: "A note claiming to know how confident it is.",
      })
    );
    expect(error).toBeInstanceOf(ResearchStoreError);
    expect(String(error)).toContain("no confidence");
  });

  test("an activity that names its problem implies its axis and topic", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorType: "human",
      axisId: axis.id,
      statement: "The inlet profile is undocumented.",
    });

    const activity = store.addActivity({
      actorId: "person-1",
      actorType: "human",
      occurredAt: "2026-09-29T12:00:00.000Z",
      problemId: problem.id,
      summary: "Measured the inlet profile by hand.",
    });

    // The common shape: the event names the problem, and the axis is implied rather than repeated.
    expect(activity.problemId).toBe(problem.id);
    expect(activity.axisId).toBe(axis.id);
    expect(activity.topicId).toBe(axis.topicId);
  });

  test("a problem's activity is reachable as its evidence", () => {
    const { store } = openStore();
    const axis = seedAxis(store);
    const problem = store.createProblem({
      authorType: "human",
      axisId: axis.id,
      statement: "The re-fit drifts.",
    });
    store.addActivity({
      problemId: problem.id,
      summary: "Re-ran the fit with a smaller step.",
    });
    store.addActivity({ axisId: axis.id, summary: "Unrelated to the problem." });

    const mine = store
      .listActivity({ axisId: axis.id })
      .filter((row) => row.problemId === problem.id);

    expect(mine.map((row) => row.summary)).toEqual([
      "Re-ran the fit with a smaller step.",
    ]);
  });
});
