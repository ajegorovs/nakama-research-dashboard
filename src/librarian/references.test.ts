/**
 * Typed-reference resolver tests (DESIGN-V1 §5.5; OFFLINE-IMPLEMENTATION-PROPOSAL §8 F-4/F-12/F-15/F-16/F-17).
 *
 * Pure — no database. A hand-built {@link ReadBundle} stands in for what a supported read returned.
 */
import { describe, expect, test } from "bun:test";
import {
  ReferenceResolutionError,
  isHumanSteering,
  resolveReference,
  resolveReferences,
  type ReadBundle,
} from "./references";

function bundle(): ReadBundle {
  const axis = {
    blocker: "waiting on a slot",
    branch: "fixture/clean",
    evidence: [],
    history: [
      {
        axisId: "A1",
        id: "ACT-AXIS-1",
        problemId: null,
        topicId: "T1",
      },
    ],
    id: "A1",
    kind: "feature",
    notes: [
      {
        authorType: "human",
        axisId: "A1",
        id: "NOTE-AXIS-1",
        kind: "steering",
        problemId: null,
        topicId: null,
      },
    ],
    plan: {
      plan: { id: "PLAN-1" },
      steps: [{ id: "STEP-1" }],
    },
    prNumber: 101,
    prUrl: "https://example.com/r/pull/101",
    problems: [
      {
        history: [
          { axisId: null, id: "SL-PROB-1", problemId: "P1" },
        ],
        id: "P1",
        state: "open",
        stateConfidence: "inferred",
        statement: "fixture problem",
      },
    ],
    state: "active",
    stateConfidence: "confirmed",
    stateHistory: [{ axisId: "A1", id: "SL-AXIS-1", problemId: null }],
    topicId: "T1",
    version: 3,
  };
  const topic = { id: "T1" };
  return {
    axis,
    topic,
    topicActivity: [
      { axisId: null, id: "ACT-TOPIC-1", problemId: null, topicId: "T1" },
    ],
    topicNotes: [
      {
        authorType: "human",
        axisId: null,
        id: "NOTE-TOPIC-1",
        kind: "interpretation",
        problemId: null,
        topicId: "T1",
      },
    ],
  } as unknown as ReadBundle;
}

describe("typed reference resolver — positive resolution", () => {
  test("resolves an axis field with its value, role axis", () => {
    const resolved = resolveReference(bundle(), {
      axisId: "A1",
      field: "state",
      variant: "axis_field",
    });
    expect(resolved.role).toBe("axis");
    expect(resolved.value).toBe("active");
    expect(resolved.identity).toBe("axis_field:A1:state");
  });

  test("resolves axis history with role axis", () => {
    const resolved = resolveReference(bundle(), {
      id: "ACT-AXIS-1",
      variant: "activity",
    });
    expect(resolved.role).toBe("axis");
  });

  test("resolves topic-wide activity and notes with role topic", () => {
    expect(
      resolveReference(bundle(), { id: "ACT-TOPIC-1", variant: "activity" }).role
    ).toBe("topic");
    const note = resolveReference(bundle(), {
      id: "NOTE-TOPIC-1",
      variant: "annotation",
    });
    expect(note.role).toBe("topic");
    expect(note.scope.axisId).toBeNull();
  });

  test("resolves a problem field and a problem state-log entry with role problem", () => {
    expect(
      resolveReference(bundle(), {
        field: "state",
        problemId: "P1",
        variant: "problem_field",
      }).role
    ).toBe("problem");
    expect(
      resolveReference(bundle(), { id: "SL-PROB-1", variant: "state_log" }).role
    ).toBe("problem");
  });

  test("resolves a plan step with role axis", () => {
    expect(
      resolveReference(bundle(), { id: "STEP-1", variant: "plan_step" }).role
    ).toBe("axis");
  });

  test("collapses duplicate references to one identity, preserving order", () => {
    const resolved = resolveReferences(bundle(), [
      { axisId: "A1", field: "state", variant: "axis_field" },
      { id: "ACT-AXIS-1", variant: "activity" },
      { axisId: "A1", field: "state", variant: "axis_field" },
    ]);
    expect(resolved.map((entry) => entry.identity)).toEqual([
      "axis_field:A1:state",
      "activity:ACT-AXIS-1",
    ]);
  });
});

describe("typed reference resolver — fail closed", () => {
  test("refuses an unknown id", () => {
    expect(() =>
      resolveReference(bundle(), { id: "NOPE", variant: "activity" })
    ).toThrow(ReferenceResolutionError);
  });

  test("refuses a problem-scoped annotation id absent from the bundle (F-4)", () => {
    try {
      resolveReference(bundle(), {
        id: "NOTE-PROBLEM-1",
        variant: "annotation",
      });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ReferenceResolutionError).reason).toBe("unknown_id");
    }
  });

  test("refuses an axis_field whose axisId is not the subject (scope mismatch)", () => {
    try {
      resolveReference(bundle(), {
        axisId: "OTHER",
        field: "state",
        variant: "axis_field",
      });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ReferenceResolutionError).reason).toBe("scope_mismatch");
    }
  });

  test("refuses a field outside the allowlist", () => {
    try {
      resolveReference(bundle(), {
        axisId: "A1",
        field: "title",
        variant: "axis_field",
      });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ReferenceResolutionError).reason).toBe(
        "field_not_allowlisted"
      );
    }
  });

  test("refuses a display label or a list index as identity (F-15)", () => {
    for (const bad of ["Clean workstream", 0, null]) {
      try {
        resolveReference(bundle(), bad);
        throw new Error("should have refused");
      } catch (error) {
        expect((error as ReferenceResolutionError).reason).toBe(
          "non_typed_reference"
        );
      }
    }
  });

  test("refuses an unknown variant", () => {
    try {
      resolveReference(bundle(), { id: "x", variant: "by_label" });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ReferenceResolutionError).reason).toBe(
        "unsupported_variant"
      );
    }
  });

  test("classifies the returned human steering vocabulary", () => {
    expect(
      isHumanSteering({
        authorType: "human",
        kind: "steering",
      } as never)
    ).toBe(true);
    expect(
      isHumanSteering({ authorType: "agent", kind: "steering" } as never)
    ).toBe(false);
    expect(
      isHumanSteering({ authorType: "human", kind: "note" } as never)
    ).toBe(false);
  });
});

describe("reference resolver — guard-disabled mutants go red", () => {
  test("pristine refuses a scope mismatch; the scope-check mutant resolves it", () => {
    const outOfScope = {
      axisId: "OTHER",
      field: "state",
      variant: "axis_field",
    };
    expect(() => resolveReference(bundle(), outOfScope)).toThrow(
      ReferenceResolutionError
    );
    // Mutant: the guard is removed, so the same citation resolves and the assertion above would fail.
    const mutated = resolveReference(bundle(), outOfScope, {
      disableScopeCheck: true,
    });
    expect(mutated.value).toBe("active");
  });

  test("pristine refuses a non-allowlisted field; the allowlist mutant resolves it", () => {
    const offAllowlist = { axisId: "A1", field: "title", variant: "axis_field" };
    expect(() => resolveReference(bundle(), offAllowlist)).toThrow(
      ReferenceResolutionError
    );
    const mutated = resolveReference(bundle(), offAllowlist, {
      disableFieldAllowlist: true,
    });
    expect(mutated.identity).toBe("axis_field:A1:title");
  });
});
