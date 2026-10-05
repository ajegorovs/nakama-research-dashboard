/**
 * DESIGN-V1 §7.3 construct → discard → recompute coordinator over the model generation seam
 * (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §3.2, §6, §9, §10).
 *
 * The accepted `assembleWithSnapshotDriver` holds the candidate constant; a model-driven run cannot, so
 * this coordinator makes the candidate a function of an observation and implements the approved protocol
 * exactly, under hard bounds:
 *
 *   1. **read A** and build (digest) the observation; **generate** the candidate from A;
 *   2. **read B**, compare A to B;
 *   3. if **A = B** → deliver the A-candidate against A/B;
 *      if **A ≠ B** → **discard** the A-candidate (captured and shape-checked, never silently dropped)
 *      and **regenerate from B BEFORE reading C**;
 *   4. **read C**, compare B to C;
 *   5. if **B = C** → deliver the B-candidate against B/C;
 *      if **B ≠ C** → emit **coordinator-owned** `snapshot_unstable` with **no further reads or
 *      generations**.
 *
 * Hard bounds: **at most 3 reads and at most 2 generations**, enforced, never a loop. `snapshot_unstable`
 * is **never** a model outcome: a model payload carrying it is a structural failure (see
 * `model-candidate.ts`). This module is **not** shipped and adds nothing to the product surface.
 */
import {
  assessCandidate,
  assembleProposal,
  buildUnstableProposal,
  buildObservation,
  ContractRefusal,
  type EvaluationError,
  type Observation,
  type Proposal,
} from "./assembler";
import { ReferenceResolutionError } from "./references";
import {
  captureGeneration,
  type GenerateResult,
  type GenerationCapture,
} from "./model-candidate";
import { renderPrompt, type RenderedPrompt, type SupportedProjection } from "./prompt";

export const MAX_READS = 3;
export const MAX_GENERATIONS = 2;

export type CoordinatorStatus =
  | "proposal"
  | "refused"
  | "read_error"
  | "generation_error"
  | "malformed";

export type GenerationRequest = {
  step: "A" | "B";
  observation: Observation;
  prompt: RenderedPrompt;
  caseId: string;
  repeat: number;
  seed: number | null;
  provenance: string;
};

/** The generation seam. Returns the **extracted completion text**, exactly as extracted (unnormalised). */
export type GenerationFn = (request: GenerationRequest) => Promise<string>;

export type CoordinatorOptions = {
  caseId: string;
  repeat: number;
  /** One predetermined seed for this repeat (fixed before the run), or `null` if unavailable. */
  seed: number | null;
  /** The model identifier exactly as the backend reports it (recorded, never derived). */
  model: string;
  /** One read per step index (0=A, 1=B, 2=C). Only the needed steps are called. */
  read: (step: number) => Promise<unknown>;
  /** Build (and digest) the observation from one raw read. */
  observe: (raw: unknown, step: number) => Observation;
  generate: GenerationFn;
  /** Test-only: overrides the injected provenance composition. Mock metadata is never committed. */
  provenanceFor?: (step: "A" | "B", repeat: number, seed: number | null) => string;
};

export type CoordinatorResult = {
  status: CoordinatorStatus;
  outcome: string | null;
  proposal: Proposal | null;
  generations: GenerationCapture[];
  reads: number;
  digests: string[];
  error: EvaluationError | null;
  /**
   * `true` only when a proposal was delivered and **every** recorded generation passed the strict
   * contract (parse **and** assessment). A recorded generation failure — including a discarded
   * A-generation refused before the recompute — controls: it keeps the result non-green and is never
   * masked by a later generation.
   */
  green: boolean;
};

function defaultProvenance(caseId: string, step: "A" | "B", repeat: number, seed: number | null): string {
  return `librarian-semantic-eval/${caseId}/${step}/r${repeat}/s${seed ?? "unavailable"}`;
}

function asProjection(observation: Observation): SupportedProjection {
  return observation as unknown as SupportedProjection;
}

/**
 * Run the bounded construct/discard/recompute protocol. Pure with respect to its injected seams: it
 * performs no read, no write and no model call of its own; it never reads the oracle.
 */
export async function runModelCoordinator(
  options: CoordinatorOptions
): Promise<CoordinatorResult> {
  const digests: string[] = [];
  const generations: GenerationCapture[] = [];
  let reads = 0;

  const provenance = (step: "A" | "B", seed: number | null): string =>
    (options.provenanceFor ?? ((s, r, sd) => defaultProvenance(options.caseId, s, r, sd)))(
      step,
      options.repeat,
      seed
    );

  const readStep = async (step: number): Promise<Observation> => {
    if (reads >= MAX_READS) {
      throw new Error(`read bound exceeded (>${MAX_READS})`);
    }
    reads += 1;
    const raw = await options.read(step);
    const observation = options.observe(raw, step);
    digests.push(observation.digest);
    return observation;
  };

  const generate = async (step: "A" | "B", observation: Observation) => {
    if (generations.length >= MAX_GENERATIONS) {
      throw new Error(`generation bound exceeded (>${MAX_GENERATIONS})`);
    }
    const prompt = renderPrompt(asProjection(observation));
    const prov = provenance(step, options.seed);
    const completionText = await options.generate({
      caseId: options.caseId,
      observation,
      prompt,
      provenance: prov,
      repeat: options.repeat,
      seed: options.seed,
      step,
    });
    const result = captureGeneration({
      caseId: options.caseId,
      completionText,
      model: options.model,
      observationDigest: observation.digest,
      promptDigest: prompt.requestDigest,
      provenance: prov,
      repeat: options.repeat,
      seed: options.seed,
      step,
    });
    generations.push(result.capture);
    return result;
  };

  // 1. read A and generate from A.
  let first: Observation;
  try {
    first = await readStep(0);
  } catch (error) {
    return readError(error, reads, digests, generations);
  }
  let firstGeneration;
  try {
    firstGeneration = await generate("A", first);
  } catch (error) {
    return generationError(error, reads, digests, generations);
  }

  // 2. read B, compare A to B.
  let second: Observation;
  try {
    second = await readStep(1);
  } catch (error) {
    return readError(error, reads, digests, generations);
  }

  if (first.digest === second.digest) {
    return finalize(first, firstGeneration.candidate, firstGeneration.capture, reads, digests, generations);
  }

  // 3. A ≠ B: validate the A-built candidate against A **before** discarding it. A parse failure (already
  // recorded) or a strict-contract refusal (an unresolved/unknown citation, a refused provenance) is a
  // recorded structural failure that controls the run — it is never masked by a recompute, and no
  // replacement generation from B is issued to hide it.
  const aFailure = validateGeneration(first, firstGeneration);
  firstGeneration.capture.discarded = true;
  if (aFailure) {
    return malformedResult(firstGeneration.capture, reads, digests, generations);
  }

  let secondGeneration;
  try {
    secondGeneration = await generate("B", second);
  } catch (error) {
    return generationError(error, reads, digests, generations);
  }

  // 4. read C, compare B to C.
  let third: Observation;
  try {
    third = await readStep(2);
  } catch (error) {
    return readError(error, reads, digests, generations);
  }

  // 5. B = C → deliver from B; B ≠ C → coordinator-owned snapshot_unstable.
  if (second.digest === third.digest) {
    return finalize(second, secondGeneration.candidate, secondGeneration.capture, reads, digests, generations);
  }
  if (secondGeneration.candidate === null) {
    // Churn plus a malformed B-generation: record the structural failure; never mask it as a clean
    // coordinator outcome.
    return malformedResult(secondGeneration.capture, reads, digests, generations);
  }
  try {
    const proposal = buildUnstableProposal(second, secondGeneration.candidate, reads);
    return {
      digests,
      error: null,
      generations,
      green: true,
      outcome: proposal.outcome,
      proposal,
      reads,
      status: "proposal",
    };
  } catch (error) {
    return refusedOrThrow(error, reads, digests, generations);
  }
}

function finalize(
  observation: Observation,
  candidate: Record<string, unknown> | null,
  capture: GenerationCapture,
  reads: number,
  digests: string[],
  generations: GenerationCapture[]
): CoordinatorResult {
  if (candidate === null) {
    return malformedResult(capture, reads, digests, generations);
  }
  try {
    const proposal = assembleProposal(observation, candidate, { reads });
    return {
      digests,
      error: null,
      generations,
      green: true,
      outcome: proposal.outcome,
      proposal,
      reads,
      status: "proposal",
    };
  } catch (error) {
    return refusedOrThrow(error, reads, digests, generations);
  }
}

/**
 * Validate one generation against the observation it was built from. Returns `true` when the generation
 * is a recorded structural failure: either the payload never parsed (`capture.error`), or the parsed
 * candidate is refused by the strict contract (an unresolved/unknown citation, a scope mismatch, a
 * refused provenance) — in which case `capture.assessmentError` is set. The candidate is never repaired
 * and never silently dropped.
 */
function validateGeneration(
  observation: Observation,
  generation: GenerateResult
): boolean {
  if (generation.candidate === null) {
    return generation.capture.error !== null;
  }
  try {
    assessCandidate(observation, generation.candidate);
    return false;
  } catch (error) {
    if (error instanceof ReferenceResolutionError || error instanceof ContractRefusal) {
      generation.capture.assessmentError = { message: error.message, reason: error.reason };
      return true;
    }
    throw error;
  }
}

function refusedOrThrow(
  error: unknown,
  reads: number,
  digests: string[],
  generations: GenerationCapture[]
): CoordinatorResult {
  if (error instanceof ReferenceResolutionError || error instanceof ContractRefusal) {
    return {
      digests,
      error: { message: error.message, name: error.name, reason: error.reason },
      generations,
      green: false,
      outcome: null,
      proposal: null,
      reads,
      status: "refused",
    };
  }
  throw error;
}

function malformedResult(
  capture: GenerationCapture,
  reads: number,
  digests: string[],
  generations: GenerationCapture[]
): CoordinatorResult {
  const failure = capture.assessmentError ?? capture.error;
  return {
    digests,
    error: {
      message: failure?.message ?? "The model payload was structurally invalid.",
      name: "ModelPayloadError",
      reason: failure?.reason ?? "structural_failure",
    },
    generations,
    green: false,
    outcome: null,
    proposal: null,
    reads,
    status: "malformed",
  };
}

function readError(
  error: unknown,
  reads: number,
  digests: string[],
  generations: GenerationCapture[]
): CoordinatorResult {
  return {
    digests,
    error: {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Error",
      reason: "read_error",
    },
    generations,
    green: false,
    outcome: null,
    proposal: null,
    reads,
    status: "read_error",
  };
}

function generationError(
  error: unknown,
  reads: number,
  digests: string[],
  generations: GenerationCapture[]
): CoordinatorResult {
  return {
    digests,
    error: {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Error",
      reason: "generation_error",
    },
    generations,
    green: false,
    outcome: null,
    proposal: null,
    reads,
    status: "generation_error",
  };
}

/** Re-exported so a caller can build observations with the accepted builder. */
export { buildObservation };
