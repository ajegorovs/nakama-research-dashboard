/**
 * Strict model-payload parser and lossless-capture tests (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §3.3, §4).
 *
 * No model, no network: every completion is a fixed string. The capture order is "encode → b64+sha256 →
 * then parse", and a malformed completion must be preserved in full.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  ModelPayloadError,
  captureGeneration,
  parseModelPayload,
  toCandidateInput,
} from "./model-candidate";

const PROVENANCE = "librarian-semantic-eval/F-1/A/r0/s101";

function proposal(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    claimStrength: "inferred",
    conflicts: [],
    evidence_refs: [{ axisId: "FIX-AXIS-CLEAN", field: "state", variant: "axis_field" }],
    outcome: "proposal",
    text: "Grounded synopsis over the returned rows.",
    ...overrides,
  });
}

describe("model-candidate — strict parse of the permitted outcomes", () => {
  test("parses a proposal and injects provenance outside the model text", () => {
    const payload = parseModelPayload(proposal());
    expect(payload.outcome).toBe("proposal");
    const candidate = toCandidateInput(payload, PROVENANCE);
    expect(candidate.provenance).toBe(PROVENANCE);
    expect(candidate.outcome).toBe("proposal");
    expect(candidate).not.toHaveProperty("basis");
    expect(candidate).not.toHaveProperty("coverage");
    expect(candidate).not.toHaveProperty("reviewStatus");
    // The payload object itself is not mutated by injection.
    expect(payload).not.toHaveProperty("provenance");
  });

  test("parses abstained with a human_steering_conflict and insufficient_evidence", () => {
    const abstained = parseModelPayload(
      JSON.stringify({
        conflicts: [
          {
            reason: "human_steering_conflict",
            refs: [{ id: "FIX-ANN-STEER-CONTESTED", variant: "annotation" }],
          },
        ],
        outcome: "abstained",
      })
    );
    expect(abstained.outcome).toBe("abstained");
    const insufficient = parseModelPayload(JSON.stringify({ outcome: "insufficient_evidence" }));
    expect(insufficient.outcome).toBe("insufficient_evidence");
  });
});

describe("model-candidate — fail-closed refusals", () => {
  const refusing = (text: string, reason: string): void => {
    expect(() => parseModelPayload(text)).toThrow(ModelPayloadError);
    try {
      parseModelPayload(text);
    } catch (error) {
      expect((error as ModelPayloadError).reason).toBe(reason);
    }
  };

  test("refuses a model-authored snapshot_unstable", () => {
    refusing(JSON.stringify({ outcome: "snapshot_unstable" }), "model_authored_snapshot_unstable");
  });

  test("refuses forbidden and harness/assembler-owned fields", () => {
    refusing(proposal({ authority: "x" }), "forbidden_field");
    refusing(proposal({ reasoning_strength: 3 }), "forbidden_field");
    refusing(proposal({ basis: {} }), "owned_field");
    refusing(proposal({ coverage: [] }), "owned_field");
    refusing(proposal({ provenance: "row" }), "owned_field");
    refusing(proposal({ provenanceFrom: "author_type" }), "owned_field");
  });

  test("refuses surrounding prose and shape contradictions", () => {
    refusing(`here is the object: ${proposal()}`, "not_json");
    refusing(proposal({ text: "" }), "text_required");
    refusing(proposal({ claimStrength: "confirmed" }), "claim_strength_required");
    refusing(JSON.stringify({ outcome: "insufficient_evidence", text: "x" }), "withheld_text");
    refusing(
      JSON.stringify({ conflicts: [], outcome: "abstained" }),
      "abstention_without_conflict"
    );
    refusing(proposal({ evidence_refs: [] }), "proposal_without_refs");
    refusing(
      proposal({ evidence_refs: [{ variant: "axis_field", axisId: "A", field: "nope" }] }),
      "field_not_allowlisted"
    );
  });
});

describe("model-candidate — lossless pre-parse capture", () => {
  const base = {
    caseId: "F-1",
    modelIdentity: "match" as const,
    modelReported: "deepseek-v4.1-flash",
    modelRequested: "deepseek-v4.1-flash",
    observationDigest: "obs",
    promptDigest: "prompt",
    provenance: PROVENANCE,
    repeat: 0,
    requestSystem: "SYSTEM-TEXT",
    requestUser: "USER-TEXT",
    seed: 101 as number | null,
    step: "A" as const,
  };

  test("captures exact completion bytes (b64 + sha256) before parse — malformed preserved", () => {
    const malformed = '{ "outcome": "proposal", "text": "unterminated\n';
    const result = captureGeneration({ ...base, completionText: malformed });
    const bytes = Buffer.from(malformed, "utf8");
    expect(result.capture.parsed).toBe(false);
    expect(result.candidate).toBeNull();
    expect(result.capture.completionBase64).toBe(bytes.toString("base64"));
    expect(result.capture.completionSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(Buffer.from(result.capture.completionBase64, "base64").toString("utf8")).toBe(malformed);
    expect(result.capture.error?.reason).toBe("not_json");
  });

  test("preserves unnormalised bytes exactly — no trim, no newline normalisation", () => {
    const raw = '\n  {"outcome":"insufficient_evidence"}  \n';
    const result = captureGeneration({ ...base, completionText: raw });
    expect(result.capture.parsed).toBe(true);
    expect(Buffer.from(result.capture.completionBase64, "base64").toString("utf8")).toBe(raw);
  });

  test("captures Unicode (multibyte + astral) completions byte-exactly", () => {
    const raw = JSON.stringify({
      claimStrength: "inferred",
      conflicts: [],
      evidence_refs: [{ axisId: "FIX-AXIS-CLEAN", field: "state", variant: "axis_field" }],
      outcome: "proposal",
      text: "Résumé — 状態は活性 🚀 — \u2028 line separator",
    });
    const result = captureGeneration({ ...base, completionText: raw });
    const bytes = Buffer.from(raw, "utf8");
    expect(Buffer.from(result.capture.completionBase64, "base64")).toEqual(bytes);
    expect(result.capture.completionSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(result.capture.completionBytes).toBe(bytes.length);
    expect(result.capture.parsed).toBe(true);
  });

  test("records a model-authored snapshot_unstable as a structural failure with full capture", () => {
    const text = JSON.stringify({ outcome: "snapshot_unstable" });
    const result = captureGeneration({ ...base, completionText: text });
    expect(result.capture.parsed).toBe(false);
    expect(result.candidate).toBeNull();
    expect(result.capture.error?.reason).toBe("model_authored_snapshot_unstable");
    expect(result.capture.completionSha256).toBe(
      createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
    );
  });

  test("capture binds the generation to its observation and prompt digests", () => {
    const result = captureGeneration({ ...base, completionText: proposal() });
    expect(result.capture.observationDigest).toBe("obs");
    expect(result.capture.promptDigest).toBe("prompt");
    expect(result.capture.provenance).toBe(PROVENANCE);
    expect(result.capture.seed).toBe(101);
    expect(result.capture.step).toBe("A");
    expect(result.capture.discarded).toBe(false);
  });

  test("records the requested and reported model identity as distinct fields", () => {
    const matched = captureGeneration({ ...base, completionText: proposal() });
    expect(matched.capture.modelRequested).toBe("deepseek-v4.1-flash");
    expect(matched.capture.modelReported).toBe("deepseek-v4.1-flash");
    expect(matched.capture.modelIdentity).toBe("match");

    const mismatched = captureGeneration({
      ...base,
      completionText: proposal(),
      modelIdentity: "mismatch",
      modelReported: "some-other-model",
    });
    expect(mismatched.capture.modelRequested).toBe("deepseek-v4.1-flash");
    expect(mismatched.capture.modelReported).toBe("some-other-model");
    expect(mismatched.capture.modelIdentity).toBe("mismatch");

    // An absent reported id is recorded as the explicit `unknown`, never fabricated from the request.
    const unknown = captureGeneration({ ...base, completionText: proposal(), modelIdentity: "unknown", modelReported: "" });
    expect(unknown.capture.modelReported).toBe("unknown");
    expect(unknown.capture.modelIdentity).toBe("unknown");
  });

  test("preserves the exact request messages for the durable pack", () => {
    const result = captureGeneration({ ...base, completionText: proposal() });
    expect(result.capture.requestSystem).toBe("SYSTEM-TEXT");
    expect(result.capture.requestUser).toBe("USER-TEXT");
  });
});
