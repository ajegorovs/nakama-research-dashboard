/**
 * Model candidate factory seam + strict parse / structural-failure boundary
 * (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §3.2, §3.3, §4, §10).
 *
 * This module turns one model completion into either a wrapped `CandidateInput` (the accepted
 * assembler's input) or a recorded **structural failure**. It never repairs, coerces or silently drops a
 * malformed payload. It is **not** shipped: it is not imported by `src/actions.ts` or `src/ui.tsx`, and it
 * is not part of `bun run build`.
 *
 * ## Lossless pre-parse capture (the fixed order)
 *
 * A generation is captured to an immutable record **before any parse is attempted**. The order is fixed:
 *
 *   read response → decode/extract completion content → UTF-8 encode **exactly as extracted**
 *   (unnormalised: no trim, no re-serialisation, no newline/whitespace normalisation) → base64 + sha256
 *   over those exact bytes → **then** parse.
 *
 * The captured bytes are the adapter's extracted completion, **not** the provider envelope or wire body.
 * A malformed completion is preserved in full even when parsing fails. The provider envelope is never a
 * separate field.
 *
 * ## What the model may and may not produce
 *
 * The model's outcome set is restricted (D-011) to `proposal` / `abstained` / `insufficient_evidence`.
 * `snapshot_unstable` is **coordinator-owned**: a payload that carries it is an **invalid payload →
 * structural failure**, never accepted. The harness injects the trusted, non-semantic `provenance` label
 * **outside** the model's text; the model never mints provenance, and `basis`/`coverage` stay
 * assembler-owned and are refused as model input.
 */
import { createHash } from "node:crypto";
import {
  CONFLICT_REASONS,
  type ConflictReason,
} from "./assembler";
import {
  REFERENCE_VARIANTS,
  AXIS_FIELD_ALLOWLIST,
  PROBLEM_FIELD_ALLOWLIST,
  type ReferenceVariant,
} from "./references";

/** The three outcomes a **model** may emit. `snapshot_unstable` is deliberately absent (coordinator-owned). */
export const MODEL_OUTCOMES = [
  "proposal",
  "abstained",
  "insufficient_evidence",
] as const;
export type ModelOutcome = (typeof MODEL_OUTCOMES)[number];

/** Fields V1 must never carry as model input, plus harness/assembler-owned fields refused as input. */
export const REFUSED_MODEL_FIELDS = [
  "authority",
  "reasoning_strength",
  "basis",
  "coverage",
  "provenance",
  "provenanceFrom",
  "reviewStatus",
  "kind",
  "subject",
] as const;

const OUTCOME_KEYS = new Set([
  "outcome",
  "claimStrength",
  "text",
  "evidence_refs",
  "conflicts",
]);

/** A strict, fail-closed refusal of a model payload. `reason` is a stable machine token. */
export class ModelPayloadError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "ModelPayloadError";
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** The model's semantic payload — the model-authored subset of the accepted `CandidateInput`. */
export type ModelPayload = {
  outcome: ModelOutcome;
  claimStrength?: "inferred" | "uncertain";
  text?: string;
  evidence_refs: unknown[];
  conflicts: Array<{ reason: ConflictReason; refs: unknown[] }>;
};

/** Assert a citation is a well-formed typed reference shape (identity resolution is the assembler's job). */
function assertTypedRef(raw: unknown, label: string): void {
  if (!isRecord(raw)) {
    throw new ModelPayloadError("malformed_reference", `${label} must be a typed reference object.`);
  }
  const variant = raw.variant;
  if (
    typeof variant !== "string" ||
    !(REFERENCE_VARIANTS as readonly string[]).includes(variant)
  ) {
    throw new ModelPayloadError(
      "unsupported_variant",
      `${label}.variant must be one of ${REFERENCE_VARIANTS.join(", ")}.`
    );
  }
  const v = variant as ReferenceVariant;
  const requireString = (key: string): void => {
    if (typeof raw[key] !== "string" || (raw[key] as string).trim().length === 0) {
      throw new ModelPayloadError("malformed_reference", `${label}.${key} must be a non-empty string.`);
    }
  };
  switch (v) {
    case "axis_field":
      requireString("axisId");
      requireString("field");
      if (!(AXIS_FIELD_ALLOWLIST as readonly string[]).includes(raw.field as string)) {
        throw new ModelPayloadError("field_not_allowlisted", `${label}.field "${String(raw.field)}" is not an exposed axis field.`);
      }
      return;
    case "problem_field":
      requireString("problemId");
      requireString("field");
      if (!(PROBLEM_FIELD_ALLOWLIST as readonly string[]).includes(raw.field as string)) {
        throw new ModelPayloadError("field_not_allowlisted", `${label}.field "${String(raw.field)}" is not an exposed problem field.`);
      }
      return;
    case "activity":
    case "annotation":
    case "state_log":
    case "plan_step":
      requireString("id");
      return;
  }
}

/**
 * Strictly parse one extracted completion into the model semantic payload, or throw
 * {@link ModelPayloadError}. The payload must be a single JSON object carrying only permitted keys. A
 * `snapshot_unstable` outcome, a forbidden/owned field, or a shape contradiction is a hard refusal.
 */
export function parseModelPayload(rawText: string): ModelPayload {
  if (typeof rawText !== "string") {
    throw new ModelPayloadError("not_text", "The extracted completion must be text.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ModelPayloadError(
      "not_json",
      "The extracted completion is not a single JSON value (no surrounding prose is tolerated)."
    );
  }
  if (!isRecord(parsed)) {
    throw new ModelPayloadError("not_object", "The model payload must be a JSON object.");
  }
  for (const field of REFUSED_MODEL_FIELDS) {
    if (hasOwn(parsed, field)) {
      throw new ModelPayloadError(
        field === "authority" || field === "reasoning_strength" ? "forbidden_field" : "owned_field",
        `The ${field} field is not a permitted model input and is refused.`
      );
    }
  }
  for (const key of Object.keys(parsed)) {
    if (!OUTCOME_KEYS.has(key)) {
      throw new ModelPayloadError("unknown_field", `The model payload carries an unknown field "${key}".`);
    }
  }

  const outcome = parsed.outcome;
  if (outcome === "snapshot_unstable") {
    throw new ModelPayloadError(
      "model_authored_snapshot_unstable",
      "snapshot_unstable is coordinator-owned and is never a model outcome."
    );
  }
  if (typeof outcome !== "string" || !(MODEL_OUTCOMES as readonly string[]).includes(outcome)) {
    throw new ModelPayloadError(
      "unknown_outcome",
      `outcome must be one of ${MODEL_OUTCOMES.join(", ")}.`
    );
  }
  const modelOutcome = outcome as ModelOutcome;

  const conflictsRaw = parsed.conflicts ?? [];
  if (!Array.isArray(conflictsRaw)) {
    throw new ModelPayloadError("conflicts_not_array", "conflicts must be an array.");
  }
  const conflicts = conflictsRaw.map((entry, index) => {
    const label = `conflicts[${index}]`;
    if (!isRecord(entry)) {
      throw new ModelPayloadError("malformed_conflict", `${label} must be an object.`);
    }
    const reason = entry.reason;
    if (typeof reason !== "string" || !(CONFLICT_REASONS as readonly string[]).includes(reason)) {
      throw new ModelPayloadError("unknown_conflict_reason", `${label}.reason must be a permitted conflict reason.`);
    }
    const refsRaw = entry.refs ?? [];
    if (!Array.isArray(refsRaw)) {
      throw new ModelPayloadError("malformed_conflict", `${label}.refs must be an array.`);
    }
    refsRaw.forEach((ref, refIndex) => assertTypedRef(ref, `${label}.refs[${refIndex}]`));
    return { reason: reason as ConflictReason, refs: refsRaw };
  });

  const evidenceRaw = parsed.evidence_refs ?? [];
  if (!Array.isArray(evidenceRaw)) {
    throw new ModelPayloadError("evidence_refs_not_array", "evidence_refs must be an array.");
  }
  evidenceRaw.forEach((ref, index) => assertTypedRef(ref, `evidence_refs[${index}]`));

  if (modelOutcome === "proposal") {
    const claimStrength = parsed.claimStrength;
    if (claimStrength !== "inferred" && claimStrength !== "uncertain") {
      throw new ModelPayloadError(
        "claim_strength_required",
        "A proposal must carry claimStrength of inferred or uncertain."
      );
    }
    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
      throw new ModelPayloadError("text_required", "A proposal must carry a non-empty text.");
    }
    if (evidenceRaw.length === 0) {
      throw new ModelPayloadError("proposal_without_refs", "A proposal must cite at least one typed reference.");
    }
    if (conflicts.length > 0) {
      throw new ModelPayloadError("conflict_without_abstention", "A structured conflict requires outcome abstained.");
    }
    return {
      claimStrength,
      conflicts,
      evidence_refs: evidenceRaw,
      outcome: modelOutcome,
      text: parsed.text,
    };
  }

  if (hasOwn(parsed, "text")) {
    throw new ModelPayloadError("withheld_text", "A non-proposal outcome must not carry text.");
  }
  if (hasOwn(parsed, "claimStrength")) {
    throw new ModelPayloadError("claim_strength_on_non_proposal", "A non-proposal outcome carries no claim-strength.");
  }
  if (modelOutcome === "abstained") {
    if (conflicts.length === 0) {
      throw new ModelPayloadError("abstention_without_conflict", "An abstention must carry at least one conflict.");
    }
    return { conflicts, evidence_refs: evidenceRaw, outcome: modelOutcome };
  }
  // insufficient_evidence
  if (conflicts.length > 0) {
    throw new ModelPayloadError("conflict_without_abstention", "A conflict may appear only with outcome abstained.");
  }
  return { conflicts, evidence_refs: evidenceRaw, outcome: modelOutcome };
}

/**
 * Wrap a parsed model payload in the accepted `CandidateInput` by **injecting** the trusted, non-semantic
 * provenance label outside the model's text. The model's payload is copied, never mutated; the injector
 * supplies only `provenance` (run metadata), never an assembler-owned field.
 */
export function toCandidateInput(
  payload: ModelPayload,
  provenance: string
): Record<string, unknown> {
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    throw new ModelPayloadError("provenance_missing", "An injected provenance label is required.");
  }
  const candidate: Record<string, unknown> = {
    conflicts: payload.conflicts,
    evidence_refs: payload.evidence_refs,
    outcome: payload.outcome,
    provenance,
  };
  if (payload.outcome === "proposal") {
    candidate.claimStrength = payload.claimStrength;
    candidate.text = payload.text;
  }
  return candidate;
}

/**
 * A lossless, immutable per-generation capture. The completion bytes are the extracted completion,
 * UTF-8 encoded exactly as extracted, recorded base64 + sha256 **before** any parse. Provenance is
 * injected run metadata; the provider envelope, headers, credentials and account ids are never retained.
 */
export type GenerationCapture = {
  caseId: string;
  repeat: number;
  step: "A" | "B";
  seed: number | null;
  model: string;
  observationDigest: string;
  promptDigest: string;
  provenance: string;
  completionBytes: number;
  completionSha256: string;
  completionBase64: string;
  parsed: boolean;
  payload: ModelPayload | null;
  /** The parser error recorded verbatim on a structural failure; `null` when the payload parsed. */
  error: { reason: string; message: string } | null;
  /**
   * The strict-contract assessment error recorded when the parsed candidate was validated against the
   * observation it was built from (resolving its citations fail-closed) and refused; `null` when it was
   * never assessed or the assessment passed. Distinct from `error` (a parse failure): a payload can parse
   * yet cite an unknown id, which the contract refuses.
   */
  assessmentError: { reason: string; message: string } | null;
  discarded: boolean;
};

export type GenerateResult = {
  capture: GenerationCapture;
  /** The wrapped `CandidateInput` when the payload parsed, else `null` (a structural failure). */
  candidate: Record<string, unknown> | null;
};

/**
 * Capture then parse one extracted completion. The capture is taken first and is complete whether or not
 * parsing succeeds, so a malformed output is preserved in full. The fixed order is enforced here.
 */
export function captureGeneration(args: {
  completionText: string;
  caseId: string;
  repeat: number;
  step: "A" | "B";
  seed: number | null;
  model: string;
  observationDigest: string;
  promptDigest: string;
  provenance: string;
}): GenerateResult {
  const bytes = Buffer.from(args.completionText, "utf8");
  const base = {
    assessmentError: null as { reason: string; message: string } | null,
    caseId: args.caseId,
    completionBase64: bytes.toString("base64"),
    completionBytes: bytes.length,
    completionSha256: createHash("sha256").update(bytes).digest("hex"),
    discarded: false,
    model: args.model,
    observationDigest: args.observationDigest,
    promptDigest: args.promptDigest,
    provenance: args.provenance,
    repeat: args.repeat,
    seed: args.seed,
    step: args.step,
  };
  try {
    const payload = parseModelPayload(args.completionText);
    return {
      candidate: toCandidateInput(payload, args.provenance),
      capture: { ...base, error: null, parsed: true, payload },
    };
  } catch (error) {
    const payloadError =
      error instanceof ModelPayloadError
        ? error
        : new ModelPayloadError("unexpected_parser_error", (error as Error).message);
    return {
      candidate: null,
      capture: {
        ...base,
        error: { message: payloadError.message, reason: payloadError.reason },
        parsed: false,
        payload: null,
      },
    };
  }
}
