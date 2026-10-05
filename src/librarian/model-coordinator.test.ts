/**
 * Construct → discard → recompute coordinator tests (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §3.2, §6, §9).
 *
 * Every generation is an injected **deterministic stub** — no model, no network. The observations are
 * built by the accepted builder from the frozen `semantic-cases-v1` projection, with a labelled synthetic
 * drift to create A/B/C differences, exactly as the accepted evaluator does.
 *
 * The generation seam returns the extracted completion **and** the backend-reported model identity
 * (reviewer disposition D-014). A stub that cannot report a model returns `unknown`; it must never
 * fabricate a `match` from the request.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildObservation, type Observation } from "./assembler";
import { runModelCoordinator, MAX_GENERATIONS, MAX_READS, type GenerationRequest } from "./model-coordinator";
import type { SupportedProjection } from "./prompt";

const CORPUS = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "semantic-cases.json"), "utf8")
) as { semanticCases: Array<{ id: string; projection: SupportedProjection }> };

function projection(id: string): SupportedProjection {
  const found = CORPUS.semanticCases.find((entry) => entry.id === id);
  if (!found) throw new Error(`no such semantic case: ${id}`);
  return found.projection;
}

/** A raw get_topic-shaped result from a frozen projection. */
function rawOf(id: string): Record<string, unknown> {
  const p = projection(id);
  return {
    activity: p.topicActivity,
    axes: [p.axis],
    generatedAt: "2026-09-01T00:00:00.000Z",
    notes: p.topicNotes,
    ok: true,
    topic: p.topic,
  };
}

const DRIFT: Record<string, string> = {
  drift1: "2026-09-29T00:00:00.000Z",
  drift2: "2026-09-30T00:00:00.000Z",
};

/** A labelled synthetic content change to the RETURNED projection (moves the observation digest). */
function drift(raw: Record<string, unknown>, mode: string): Record<string, unknown> {
  const stamp = DRIFT[mode];
  if (!stamp) return raw;
  const clone = JSON.parse(JSON.stringify(raw)) as {
    topic: { updatedAt: string };
    axes: Array<{ updatedAt: string }>;
  };
  clone.topic.updatedAt = stamp;
  for (const axis of clone.axes) axis.updatedAt = stamp;
  return clone as unknown as Record<string, unknown>;
}

function proposalText(id: string): string {
  const axisId = projection(id).subject.axisId;
  return JSON.stringify({
    claimStrength: "inferred",
    conflicts: [],
    evidence_refs: [{ axisId, field: "state", variant: "axis_field" }],
    outcome: "proposal",
    text: "Grounded synopsis over returned rows.",
  });
}

/** A matching structured generation (the backend reports the requested id). */
function matched(text: string) {
  return { completionText: text, modelIdentity: "match" as const, modelReported: "deepseek-v4.1-flash" };
}

type Harness = {
  read: (step: number) => Promise<unknown>;
  observe: (raw: unknown, step: number) => Observation;
  steps: number[];
  generationRequests: GenerationRequest[];
};

function harness(id: string, script: string[]): Harness {
  const steps: number[] = [];
  const generationRequests: GenerationRequest[] = [];
  const limits = projection(id).limits;
  const subject = projection(id).subject;
  const raw = rawOf(id);
  const read = async (step: number): Promise<unknown> => {
    steps.push(step);
    return drift(raw, script[step] ?? "base");
  };
  const observe = (value: unknown): Observation =>
    buildObservation(value, { limits, search: projection(id).search, subject });
  return {
    generationRequests,
    observe,
    read,
    steps,
  };
}

describe("model coordinator — bounded construct/discard/recompute", () => {
  test("A = B delivers the A-candidate with two reads and one generation", async () => {
    const h = harness("F-1", ["base", "base"]);
    let generations = 0;
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async (request) => {
        generations += 1;
        h.generationRequests.push(request);
        return matched(proposalText("F-1"));
      },
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("proposal");
    expect(result.outcome).toBe("proposal");
    expect(result.reads).toBe(2);
    expect(generations).toBe(1);
    expect(h.steps).toEqual([0, 1]);
    expect(result.generations).toHaveLength(1);
    expect(result.generations[0].discarded).toBe(false);
    expect(result.proposal?.basis.digest).toBe(result.digests[0]);
  });

  test("A ≠ B, B = C discards the A-candidate and delivers from B (regenerated BEFORE C)", async () => {
    const h = harness("F-1", ["base", "drift1", "drift1"]);
    let generations = 0;
    const seenFor: string[] = [];
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async (request) => {
        generations += 1;
        seenFor.push(request.step);
        return matched(proposalText("F-1"));
      },
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("proposal");
    expect(result.outcome).toBe("proposal");
    expect(result.reads).toBe(3);
    expect(generations).toBe(2);
    expect(h.steps).toEqual([0, 1, 2]);
    expect(seenFor).toEqual(["A", "B"]);
    expect(result.generations[0].discarded).toBe(true);
    expect(result.generations[1].discarded).toBe(false);
    expect(result.generations[1].observationDigest).toBe(result.digests[1]);
    expect(result.proposal?.basis.digest).toBe(result.digests[1]);
  });

  test("A ≠ B, B ≠ C emits coordinator-owned snapshot_unstable with no further reads or recomputes", async () => {
    const h = harness("F-1", ["base", "drift1", "drift2"]);
    let generations = 0;
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => {
        generations += 1;
        return matched(proposalText("F-1"));
      },
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("proposal");
    expect(result.outcome).toBe("snapshot_unstable");
    expect(result.reads).toBe(3);
    expect(generations).toBe(2);
    expect(h.steps).toEqual([0, 1, 2]);
    expect(result.proposal?.evidence_refs).toEqual([]);
    expect(result.proposal?.conflicts).toEqual([]);
    expect(result.proposal).not.toHaveProperty("text");
    expect(result.proposal).not.toHaveProperty("claimStrength");
  });

  test("enforces the hard bound: never more than three reads and two generations", async () => {
    const h = harness("F-1", ["base", "drift1", "drift2"]);
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => matched(proposalText("F-1")),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(h.steps.length).toBeLessThanOrEqual(MAX_READS);
    expect(result.generations.length).toBeLessThanOrEqual(MAX_GENERATIONS);
    expect(result.reads).toBeLessThanOrEqual(MAX_READS);
  });
});

describe("model coordinator — backend-reported model identity (fail-closed)", () => {
  test("a matching reported model is green and the capture distinguishes requested vs reported", async () => {
    const h = harness("F-1", ["base", "base"]);
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => matched(proposalText("F-1")),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.green).toBe(true);
    expect(result.generations[0].modelRequested).toBe("deepseek-v4.1-flash");
    expect(result.generations[0].modelReported).toBe("deepseek-v4.1-flash");
    expect(result.generations[0].modelIdentity).toBe("match");
  });

  test("a mismatching reported model is non-green, preserves the completion, and delivers no candidate", async () => {
    const h = harness("F-1", ["base", "base"]);
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => ({
        completionText: proposalText("F-1"),
        modelIdentity: "mismatch",
        modelReported: "some-other-model",
      }),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("model_mismatch");
    expect(result.green).toBe(false);
    expect(result.proposal).toBeNull();
    expect(result.error?.reason).toBe("model_identity_mismatch");
    // The exact completion is preserved even though it is not delivered.
    expect(result.generations).toHaveLength(1);
    expect(result.generations[0].modelReported).toBe("some-other-model");
    expect(Buffer.from(result.generations[0].completionBase64, "base64").toString("utf8")).toBe(
      proposalText("F-1")
    );
    // A mismatch is never papered over by a recompute.
    expect(h.steps).toEqual([0]);
  });

  test("an invalid (unusable) reported model is non-green, preserves the completion, and is never admitted", async () => {
    const h = harness("F-1", ["base", "base"]);
    const result = await runModelCoordinator({
      // Even an owner-accepted-unknown disposition must not admit a present-but-unusable id.
      allowUnknownModelIdentity: true,
      caseId: "F-1",
      generate: async () => ({
        completionText: proposalText("F-1"),
        modelIdentity: "invalid",
        modelReported: "unknown",
      }),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("model_mismatch");
    expect(result.green).toBe(false);
    expect(result.proposal).toBeNull();
    expect(result.error?.reason).toBe("model_identity_invalid");
    expect(result.generations).toHaveLength(1);
    expect(result.generations[0].modelIdentity).toBe("invalid");
    expect(result.generations[0].modelReported).toBe("unknown");
    expect(Buffer.from(result.generations[0].completionBase64, "base64").toString("utf8")).toBe(
      proposalText("F-1")
    );
    expect(h.steps).toEqual([0]);
  });

  test("an absent reported model is unknown and non-green by default; an explicit disposition admits it", async () => {
    const h = harness("F-1", ["base", "base"]);
    const absent = () => ({ completionText: proposalText("F-1"), modelIdentity: "unknown" as const, modelReported: "unknown" });
    const refused = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => absent(),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(refused.status).toBe("model_mismatch");
    expect(refused.green).toBe(false);
    expect(refused.error?.reason).toBe("model_identity_unknown");
    expect(refused.generations[0].modelReported).toBe("unknown");

    const h2 = harness("F-1", ["base", "base"]);
    const allowed = await runModelCoordinator({
      allowUnknownModelIdentity: true,
      caseId: "F-1",
      generate: async () => absent(),
      model: "deepseek-v4.1-flash",
      observe: h2.observe,
      read: h2.read,
      repeat: 0,
      seed: 101,
    });
    expect(allowed.status).toBe("proposal");
    expect(allowed.green).toBe(true);
  });
});

describe("model coordinator — fail-closed structural failures", () => {
  test("a model-authored snapshot_unstable is a structural failure, never the coordinator outcome", async () => {
    const h = harness("F-1", ["base", "base"]);
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => matched(JSON.stringify({ outcome: "snapshot_unstable" })),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("malformed");
    expect(result.outcome).toBeNull();
    expect(result.generations[0].parsed).toBe(false);
    expect(result.generations[0].error?.reason).toBe("model_authored_snapshot_unstable");
  });

  test("a malformed discarded A-generation is a recorded structural failure that controls — no B replacement (F-9)", async () => {
    const h = harness("F-1", ["base", "drift1", "drift1"]);
    let calls = 0;
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => {
        calls += 1;
        return matched(calls === 1 ? "not json at all" : proposalText("F-1"));
      },
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    // The invalid A controls: the run is non-green and no replacement is generated from B to mask it.
    expect(result.status).toBe("malformed");
    expect(result.green).toBe(false);
    expect(calls).toBe(1);
    expect(h.steps).toEqual([0, 1]);
    expect(result.generations).toHaveLength(1);
    expect(result.generations[0].parsed).toBe(false);
    expect(result.generations[0].discarded).toBe(true);
    expect(result.generations[0].error?.reason).toBe("not_json");
    expect(result.generations[0].completionSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(result.generations[0].completionBase64, "base64").toString("utf8")).toBe(
      "not json at all"
    );
  });

  test("an unknown citation in the discarded A-generation fails closed against A (F-9, strict contract)", async () => {
    const h = harness("F-1", ["base", "drift1", "drift1"]);
    let calls = 0;
    const unknownCitation = JSON.stringify({
      claimStrength: "inferred",
      conflicts: [],
      evidence_refs: [{ id: "FIX-DOES-NOT-EXIST", variant: "annotation" }],
      outcome: "proposal",
      text: "Cites a row that was never returned.",
    });
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => {
        calls += 1;
        return matched(calls === 1 ? unknownCitation : proposalText("F-1"));
      },
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    // The A payload parsed, but its citation does not resolve against A: the contract refusal is recorded
    // on the discarded generation and controls — it is not masked by a recompute from B.
    expect(result.status).toBe("malformed");
    expect(result.green).toBe(false);
    expect(calls).toBe(1);
    expect(result.generations).toHaveLength(1);
    expect(result.generations[0].parsed).toBe(true);
    expect(result.generations[0].discarded).toBe(true);
    expect(result.generations[0].assessmentError?.reason).toBe("unknown_id");
    expect(result.error?.reason).toBe("unknown_id");
  });

  test("a malformed candidate on the stable path is refused, not coerced", async () => {
    const h = harness("F-1", ["base", "base"]);
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => matched("{}"),
      model: "deepseek-v4.1-flash",
      observe: h.observe,
      read: h.read,
      repeat: 0,
      seed: 101,
    });
    expect(result.status).toBe("malformed");
    expect(result.proposal).toBeNull();
  });

  test("a read failure is reported as read_error and stops the protocol", async () => {
    let reads = 0;
    const result = await runModelCoordinator({
      caseId: "F-1",
      generate: async () => matched(proposalText("F-1")),
      model: "deepseek-v4.1-flash",
      observe: () => {
        throw new Error("should not observe a failed read");
      },
      read: async () => {
        reads += 1;
        throw new Error("injected read failure");
      },
      repeat: 0,
      seed: 101,
    });
    expect(reads).toBe(1);
    expect(result.status).toBe("read_error");
    expect(result.generations).toHaveLength(0);
  });
});
