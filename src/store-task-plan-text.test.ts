/**
 * Migration 006 store contract: task titles, task states, polymorphic plan ownership, containment, and the
 * `record_activity.problemId` link.
 *
 * Built from the shipped migrations 001–006, so every test runs against the schema the host will apply.
 * The negative controls are the point: a title on a human-authored row is refused to an agent, a plan
 * cannot be moved to another owner, a step cannot be laundered across plans, and a task-scoped activity
 * cannot disagree with the axis it names.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Axis,
  type Problem,
  ResearchStore,
  ResearchStoreError,
  type Topic,
} from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
  "006-task-plan-text.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

function openStore(): { path: string; store: ResearchStore } {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-006-${crypto.randomUUID()}.sqlite`;
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return { path, store: new ResearchStore(path) };
}

/** A topic with one active axis. */
function seed(store: ResearchStore, name = "Turbulence modelling"): { topic: Topic; axis: Axis } {
  const topic = store.createTopic({ name });
  const axis = store.createAxis({
    branch: "data/subgrid-closure",
    kind: "experiment",
    state: "active",
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

describe("006 tasks — states", () => {
  test("creates a blocked task and records each transition", () => {
    const { store } = openStore();
    const { axis } = seed(store);
    const problem = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      state: "blocked",
      statement: "Blocked on the inlet calibration.",
    });
    expect(problem.state).toBe("blocked");

    const toResolved = store.transitionProblem({
      id: problem.id,
      origin: "human",
      toState: "resolved",
    });
    expect(toResolved.transition.fromState).toBe("blocked");
    expect(toResolved.transition.toState).toBe("resolved");

    const toOpen = store.transitionProblem({
      id: problem.id,
      origin: "human",
      toState: "open",
    });
    expect(toOpen.transition.fromState).toBe("resolved");
    expect(toOpen.transition.toState).toBe("open");

    expect(store.problemStateHistory(problem.id).map((row) => row.toState)).toEqual([
      "blocked",
      "resolved",
      "open",
    ]);
  });

  test("a repeat of the current state is refused as a no-op", () => {
    const { store } = openStore();
    const { axis } = seed(store);
    const problem = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "Open task.",
    });
    const error = caught(() =>
      store.transitionProblem({ id: problem.id, origin: "human", toState: "open" })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect((error as ResearchStoreError).code).toBe("no-op");
  });
});

describe("006 tasks — title and mixed-text authorship", () => {
  test("stores a title distinct from the statement, and never derives one", () => {
    const { store } = openStore();
    const { axis } = seed(store);
    const titled = store.createProblem({
      axisId: axis.id,
      authorType: "agent",
      statement: "The full statement, which is not a title.",
      title: "A concise label",
    });
    expect(titled.title).toBe("A concise label");
    expect(store.getProblem(titled.id)?.title).toBe("A concise label");

    const untitled = store.createProblem({
      axisId: axis.id,
      authorType: "agent",
      statement: "No title was given.",
    });
    // Absence is '' — never copied from the statement.
    expect(untitled.title).toBe("");
  });

  test("an agent cannot change either text field on a human-authored task", () => {
    const { store } = openStore();
    const { axis } = seed(store);
    const problem = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "The human wrote this whole sentence.",
      title: "Human title",
    });
    // Changing the title alone is refused (the other field is an echo).
    const titleErr = caught(() =>
      store.updateProblem({
        id: problem.id,
        authorType: "agent",
        statement: problem.statement,
        title: "Agent-forged title",
      })
    );
    expect(titleErr instanceof ResearchStoreError).toBe(true);
    expect((titleErr as ResearchStoreError).code).toBe("human-authored");
    // Changing the statement alone is refused.
    const stmtErr = caught(() =>
      store.updateProblem({
        id: problem.id,
        authorType: "agent",
        statement: "Agent rewrote the sentence.",
        title: problem.title,
      })
    );
    expect((stmtErr as ResearchStoreError).code).toBe("human-authored");
    // Nothing was written.
    const after = store.getProblem(problem.id) as Problem;
    expect(after.statement).toBe("The human wrote this whole sentence.");
    expect(after.title).toBe("Human title");
    expect(after.version).toBe(problem.version);
  });

  test("echoing both texts while changing a link keeps authorship human", () => {
    const { store } = openStore();
    const { axis } = seed(store);
    const problem = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "Human sentence.",
      title: "Human title",
    });
    const updated = store.updateProblem({
      id: problem.id,
      authorType: "agent",
      stateConfidence: "inferred",
      statement: problem.statement,
      title: problem.title,
    });
    expect(updated.authorType).toBe("human");
    expect(updated.stateConfidence).toBe("inferred");
  });
});

describe("006 plans — polymorphic ownership", () => {
  test("a topic, an axis and a task plan each read back with the right owner scope", () => {
    const { store } = openStore();
    const { topic, axis } = seed(store);
    const task = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "A task with its own plan.",
    });

    const topicPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "topic", topicId: topic.id },
      summary: "Project plan.",
    });
    const axisPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "Workstream plan.",
    });
    const taskPlan = store.createPlan({
      authorType: "agent",
      owner: { scope: "problem", problemId: task.id },
      summary: "Task plan.",
    });

    expect(store.planForTopic(topic.id)?.plan.owner).toEqual({
      scope: "topic",
      topicId: topic.id,
    });
    expect(store.planForAxis(axis.id)?.plan.owner).toEqual({
      scope: "axis",
      axisId: axis.id,
    });
    expect(store.planForProblem(task.id)?.plan.owner).toEqual({
      scope: "problem",
      problemId: task.id,
    });
    // The legacy axis reader keeps its field and returns only axis-owned plans.
    const axisPlans = store.listPlans(axis.id);
    expect(axisPlans.map((plan) => plan.id)).toEqual([axisPlan.id]);
    expect(axisPlans[0]?.axisId).toBe(axis.id);
    expect(topicPlan.axisId).toBeNull();
    expect(taskPlan.axisId).toBeNull();
  });

  test("a plan's owner is immutable: an echoed mismatch is refused", () => {
    const { store } = openStore();
    const { topic, axis } = seed(store);
    const plan = store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "Workstream plan.",
    });
    const error = caught(() =>
      store.updatePlan({
        authorType: "human",
        id: plan.id,
        owner: { scope: "topic", topicId: topic.id },
        summary: "Trying to move it.",
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect(store.getPlan(plan.id)?.owner).toEqual({ scope: "axis", axisId: axis.id });
  });
});

describe("006 — reconcile containment and owner resolution", () => {
  test("refuses a plan owner that resolves to another topic, before any write", () => {
    const { store } = openStore();
    const a = seed(store, "Topic A");
    const b = seed(store, "Topic B");
    const error = caught(() =>
      store.reconcileTopic({
        plans: [{ axisId: b.axis.id, summary: "Cross-topic plan." }],
        topicId: a.topic.id,
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect(store.listPlansFor({ scope: "axis", axisId: b.axis.id })).toEqual([]);
  });

  test("refuses a step that belongs to another plan (laundering by id)", () => {
    const { store } = openStore();
    const { topic, axis } = seed(store);
    const p1 = store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "First plan.",
    });
    const step = store.createPlanStep({ planId: p1.id, title: "Belongs to plan one" });
    const p2 = store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "Second plan.",
    });

    const error = caught(() =>
      store.reconcileTopic({
        plans: [
          {
            axisId: axis.id,
            planId: p2.id,
            steps: [{ stepId: step.id, title: "Stolen into plan two" }],
            summary: "Second plan.",
          },
        ],
        topicId: topic.id,
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);
    expect(String(error)).toContain("does not belong");
    expect(store.getPlanStep(step.id)?.title).toBe("Belongs to plan one");
  });

  test("a task plan must name an existing task: created in a second reconcile", () => {
    const { store } = openStore();
    const { topic, axis } = seed(store);

    // A task plan cannot reference a task that does not exist yet.
    const error = caught(() =>
      store.reconcileTopic({
        plans: [{ problemId: "no-such-task", summary: "Premature." }],
        topicId: topic.id,
      })
    );
    expect(error instanceof ResearchStoreError).toBe(true);

    // First reconcile creates the task; read its id back.
    const created = store.reconcileTopic({
      problems: [
        { axisId: axis.id, statement: "The task.", title: "Task label" },
      ],
      topicId: topic.id,
    });
    const task = created.problems[0] as Problem;
    expect(task.title).toBe("Task label");

    // Second reconcile attaches the plan to the now-existing task.
    const second = store.reconcileTopic({
      plans: [{ problemId: task.id, summary: "Task's own plan." }],
      topicId: topic.id,
    });
    const plan = second.plans[0];
    expect(plan?.owner).toEqual({ scope: "problem", problemId: task.id });
  });
});

describe("006 — plan_step_id containment", () => {
  test("allows the task's own plan and a same-axis plan; refuses a topic plan and another task's plan", () => {
    const { store } = openStore();
    const { topic, axis } = seed(store);
    const otherAxis = store.createAxis({
      title: "Second axis",
      topicId: topic.id,
    });

    const task = store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: "Task with its own plan.",
    });
    const taskPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "problem", problemId: task.id },
      summary: "Task plan.",
    });
    const taskStep = store.createPlanStep({ planId: taskPlan.id, title: "Task step" });

    const axisPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: axis.id },
      summary: "Axis plan.",
    });
    const axisStep = store.createPlanStep({ planId: axisPlan.id, title: "Axis step" });

    const topicPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "topic", topicId: topic.id },
      summary: "Topic plan.",
    });
    const topicStep = store.createPlanStep({ planId: topicPlan.id, title: "Topic step" });

    const otherAxisPlan = store.createPlan({
      authorType: "human",
      owner: { scope: "axis", axisId: otherAxis.id },
      summary: "Other axis plan.",
    });
    const otherAxisStep = store.createPlanStep({
      planId: otherAxisPlan.id,
      title: "Other axis step",
    });

    // Own task plan step: allowed.
    expect(
      store.updateProblem({
        authorType: "human",
        id: task.id,
        planStepId: taskStep.id,
      }).planStepId
    ).toBe(taskStep.id);
    // Same-axis plan step: allowed (the existing same-axis link).
    expect(
      store.updateProblem({
        authorType: "human",
        id: task.id,
        planStepId: axisStep.id,
      }).planStepId
    ).toBe(axisStep.id);
    // A topic plan step and another axis's step: refused.
    expect(
      caught(() =>
        store.updateProblem({ authorType: "human", id: task.id, planStepId: topicStep.id })
      ) instanceof ResearchStoreError
    ).toBe(true);
    expect(
      caught(() =>
        store.updateProblem({
          authorType: "human",
          id: task.id,
          planStepId: otherAxisStep.id,
        })
      ) instanceof ResearchStoreError
    ).toBe(true);
  });
});

describe("006 — record_activity problemId pairing", () => {
  test("lands evidence for a task, and refuses a mismatch between the task's axis and a named axis", () => {
    const { store } = openStore();
    const a = seed(store, "Topic A");
    const b = seed(store, "Topic B");
    const taskA = store.createProblem({
      axisId: a.axis.id,
      authorType: "human",
      statement: "Task on A.",
    });
    const taskB = store.createProblem({
      axisId: b.axis.id,
      authorType: "human",
      statement: "Task on B.",
    });

    const ok = store.addActivity({
      axisId: a.axis.id,
      problemId: taskA.id,
      summary: "Evidence for task A.",
      topicId: a.topic.id,
    });
    expect(ok.problemId).toBe(taskA.id);

    // A task from another topic with this topic's axis: refused by the pairing guard.
    const crossTopic = caught(() =>
      store.addActivity({
        axisId: a.axis.id,
        problemId: taskB.id,
        summary: "Cross-topic evidence.",
        topicId: a.topic.id,
      })
    );
    expect(crossTopic instanceof ResearchStoreError).toBe(true);
    expect((crossTopic as ResearchStoreError).code).toBe("invalid-input");

    // A task from another topic with no axis: the derived axis fails the topic check.
    const noAxis = caught(() =>
      store.addActivity({
        problemId: taskB.id,
        summary: "No axis named.",
        topicId: a.topic.id,
      })
    );
    expect(noAxis instanceof ResearchStoreError).toBe(true);
  });
});
