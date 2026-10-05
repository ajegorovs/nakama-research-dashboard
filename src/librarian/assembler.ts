/**
 * Deterministic proposal assembler and bounded A/B/C snapshot driver (DESIGN-V1 §5.2, §7.3; OFFLINE §5).
 *
 * The assembler is **pure**: it is handed a returned {@link Observation} (plain returned rows, digested)
 * and a **supplied, explicitly labelled candidate** — an input fixture, never a model call. It resolves
 * the candidate's typed references fail-closed, validates the structural contract, computes honest
 * per-source coverage, and emits the reply-only proposal object. It performs no read, no write, no NLP,
 * no model call and no provenance inference.
 *
 * ## The distinction this module must not blur (OFFLINE-IMPLEMENTATION-PROPOSAL §7)
 *
 * This is a **deterministic contract evaluator's** builder. It can prove a supplied assessment is
 * well-formed; it cannot prove a reading is semantically useful or faithful, and it is not an NLP truth
 * engine. It checks the structured assessment it is given — it does not parse free text to detect
 * conflict. Structural validity is not semantic validity.
 *
 * ## Snapshot recomputation is bounded and finite (DESIGN-V1 §7.3)
 *
 * A/B compare, then one reconstruct and B/C compare, then `snapshot_unstable` with **no further reads or
 * recomputes** — never a loop. The digest covers a normalized content projection of the selected returned
 * payload, omitting only the transport wrapper (`ok`) and read timing (`generatedAt`); domain timestamps,
 * versions and every evidence field are retained.
 */
import { createHash } from "node:crypto";
import {
  DEFAULT_ANNOTATION_LIMIT,
  DEFAULT_AXIS_HISTORY_LIMIT,
  EVIDENCE_ITEM_LIMIT,
  type Activity,
  type Annotation,
  type AxisDetail,
  type Topic,
  type TopicDetail,
} from "../store";
import {
  isHumanSteering,
  ReferenceResolutionError,
  REFERENCE_VARIANTS,
  resolveReferences,
  type ReadBundle,
  type ResolvedRef,
} from "./references";

export const OUTCOMES = [
  "proposal",
  "abstained",
  "insufficient_evidence",
  "snapshot_unstable",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const CLAIM_STRENGTHS = ["inferred", "uncertain"] as const;
export type ClaimStrength = (typeof CLAIM_STRENGTHS)[number];

export const CONFLICT_REASONS = [
  "human_steering_conflict",
  "human_human_conflict",
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

/** The proposal-only review label. Never the stored `confidence` vocabulary; never persisted. */
export const REVIEW_STATUS = "unreviewed";

/**
 * Fields V1 must never carry (DESIGN-V1 §3.4, §12): no `authority`, no `reasoning_strength`. They are
 * refused on the supplied candidate and absent from every emitted proposal.
 */
export const FORBIDDEN_PROPOSAL_FIELDS = ["authority", "reasoning_strength"] as const;

export type Subject = { topicId: string; axisId: string };

export type CoverageStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type CoverageScope = "axis" | "topic" | "problem" | "query";
export type CoverageEntry = {
  source: string;
  scope: CoverageScope;
  status: CoverageStatus;
  note: string;
};

export type SearchMeta = { truncated: boolean; query: string; limit: number };

/**
 * The normalized content projection the digest is taken over. It carries **every** field a citation can
 * resolve against or the assembler can infer from — the subject axis (with its history, notes, state
 * history, plan and evidence), the topic, the topic-wide notes **and the topic-wide activity**, the
 * search metadata, and the caller options (`subject`, `limits`) — so any change to a citable or
 * inference-used field moves the digest. Only the transport wrapper (`ok`) and the read timing
 * (`generatedAt`) are omitted; domain timestamps inside `axis`/`topic` are retained.
 */
export type SelectedPayload = {
  subject: Subject;
  limits: { historyLimit: number; notesLimit: number };
  topic: Topic;
  axis: AxisDetail;
  topicNotes: Annotation[];
  topicActivity: Activity[];
  search: SearchMeta | null;
};

export type Observation = {
  subject: Subject;
  topic: Topic;
  axis: AxisDetail;
  topicNotes: Annotation[];
  topicActivity: Activity[];
  limits: { historyLimit: number; notesLimit: number };
  search: SearchMeta | null;
  asOf: string;
  digest: string;
  payload: SelectedPayload;
};

export type ProposedConflict = { refs: ResolvedRef[]; reason: ConflictReason };

/** The reply-only proposal object (DESIGN-V1 §5.2). No stored counterpart; never persisted. */
export type Proposal = {
  subject: Subject;
  kind: "interpretation";
  outcome: Outcome;
  text?: string;
  claimStrength?: ClaimStrength;
  reviewStatus: typeof REVIEW_STATUS;
  evidence_refs: ResolvedRef[];
  conflicts: ProposedConflict[];
  coverage: CoverageEntry[];
  /** The explicit, caller-supplied provenance label, echoed verbatim. Never derived. */
  provenance: string;
  basis: { asOf: string; digest: string; reads: number };
};

/** A read that produced no usable payload — reported as a hard error, never as `insufficient_evidence`. */
export class LibrarianReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibrarianReadError";
  }
}

/** A structural refusal of the supplied candidate. `reason` is a stable machine token. */
export class ContractRefusal extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "ContractRefusal";
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Deterministic JSON: object keys sorted recursively; arrays kept in returned order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(",")}}`;
}

/** sha256 over the canonical projection of the selected returned payload. */
export function digestPayload(payload: unknown): string {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

/**
 * A deep, JSON-compatible copy that shares no reference with its source. Returned rows and caller
 * options are JSON values, so a copy is exact; because it shares nothing, a later mutation of the raw
 * read result or the options object cannot reach the observation, its digest or its citable rows.
 */
function snapshot<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Freeze a snapshot and every nested object/array so it cannot be mutated in place after construction. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export type BuildObservationOptions = {
  subject: Subject;
  limits: { historyLimit: number; notesLimit: number };
  search: SearchMeta | null;
  /**
   * Test-only mutant seam. `retainAliases` keeps the read result and the caller options **by
   * reference** instead of deep-snapshotting them (so a post-construction mutation leaks into the
   * observation); `omitTopicActivityFromDigest` drops `topicActivity` from the digest projection. The
   * pristine builder must never be constructed with either — they exist so the guards' red-runs can be
   * demonstrated (the pristine assertion fails under the mutant).
   */
  mutants?: { retainAliases?: boolean; omitTopicActivityFromDigest?: boolean };
};

/**
 * Build the subject observation from a `get_topic` result. The returned rows and the caller options are
 * **deep-snapshotted and frozen** before the digest is taken, so the observation is an immutable,
 * ownership-isolated value: mutating the raw read result or the options afterwards cannot change it, its
 * digest, or the rows its citations resolve against. A failure shape (`ok:false`) or a missing subject
 * axis becomes a hard {@link LibrarianReadError} — never an absence and never `insufficient_evidence`.
 */
export function buildObservation(
  raw: unknown,
  options: BuildObservationOptions
): Observation {
  if (!isRecord(raw)) {
    throw new LibrarianReadError("get_topic returned a non-object result.");
  }
  if (raw.ok === false) {
    throw new LibrarianReadError(
      `get_topic refused the read: ${String(raw.error ?? "unknown error")}`
    );
  }
  const detail = raw as unknown as TopicDetail;
  if (!isRecord(detail.topic) || !Array.isArray(detail.axes)) {
    throw new LibrarianReadError("get_topic result is not a topic detail.");
  }
  const axis = detail.axes.find((row) => row.id === options.subject.axisId);
  if (!axis) {
    throw new LibrarianReadError(
      `get_topic did not return subject axis "${options.subject.axisId}".`
    );
  }
  const isolate = <T,>(value: T): T => {
    if (options.mutants?.retainAliases) {
      return value;
    }
    return deepFreeze(snapshot(value));
  };
  const subject = isolate(options.subject);
  const limits = isolate(options.limits);
  const search = options.search === null ? null : isolate(options.search);
  const topic = isolate(detail.topic);
  const selectedAxis = isolate(axis);
  const topicNotes = isolate(Array.isArray(detail.notes) ? detail.notes : []);
  const topicActivity = isolate(Array.isArray(detail.activity) ? detail.activity : []);
  const payload: SelectedPayload = {
    axis: selectedAxis,
    limits,
    search,
    subject,
    topic,
    topicActivity,
    topicNotes,
  };
  const digestInput = options.mutants?.omitTopicActivityFromDigest
    ? { ...payload, topicActivity: undefined }
    : payload;
  return {
    asOf: String(detail.generatedAt),
    axis: selectedAxis,
    digest: digestPayload(digestInput),
    limits,
    payload,
    search,
    subject,
    topic,
    topicActivity,
    topicNotes,
  };
}

/** The returned rows a citation may resolve against. */
export function bundleOf(observation: Observation): ReadBundle {
  return {
    axis: observation.axis,
    topic: observation.topic,
    topicActivity: observation.topicActivity,
    topicNotes: observation.topicNotes,
  };
}

function lengthCoverage(
  source: string,
  scope: CoverageScope,
  length: number,
  cap: number,
  label: string
): CoverageEntry {
  // Equality with the cap proves nothing: the list may be truncated, or it may be exactly the whole set.
  if (length < cap) {
    return {
      note: `${label}: ${length} item(s) < cap ${cap} — COMPLETE for the query scope.`,
      scope,
      source,
      status: "COMPLETE",
    };
  }
  return {
    note: `${label}: ${length} item(s) equal cap ${cap} — may be truncated; equality proves nothing, so UNKNOWN.`,
    scope,
    source,
    status: "UNKNOWN",
  };
}

/**
 * Per-source coverage derived **only from returned evidence** (DESIGN-V1 §8). A bounded/UNKNOWN source is
 * not reported as known-PARTIAL; PARTIAL is used only for an explicit `truncated` flag.
 */
export function computeCoverage(observation: Observation): CoverageEntry[] {
  const { limits } = observation;
  const entries: CoverageEntry[] = [
    {
      note: `axisEvidence() is capped at EVIDENCE_ITEM_LIMIT=${EVIDENCE_ITEM_LIMIT} with no reported total; it cannot bound completeness alone.`,
      scope: "axis",
      source: "axis_evidence",
      status: "UNKNOWN",
    },
    lengthCoverage(
      "axis_history",
      "axis",
      observation.axis.history.length,
      limits.historyLimit,
      "returned axis history"
    ),
    lengthCoverage(
      "axis_notes",
      "axis",
      observation.axis.notes.length,
      limits.notesLimit,
      "returned axis notes (a bounded list may hide steering beyond the cap)"
    ),
    lengthCoverage(
      "topic_notes",
      "topic",
      observation.topicNotes.length,
      limits.notesLimit,
      "returned topic-wide notes"
    ),
    {
      note: "state_log history is uncapped as returned.",
      scope: "axis",
      source: "axis_state_history",
      status: "COMPLETE",
    },
    {
      note: "ProblemDetail.history is uncapped and genuinely returned.",
      scope: "problem",
      source: "problem_state_history",
      status: "COMPLETE",
    },
    {
      note: "Not returned by get_topic: listAnnotations({axisId}) and listTopicNotes both exclude a problem-targeted claim, so even a COMPLETE axis-notes list proves nothing about it. A coverage limitation, never a fabricated empty projection.",
      scope: "problem",
      source: "problem_scoped_steering",
      status: "UNKNOWN",
    },
    {
      note: "Collector-only (exposeAsTool:false); unreachable from the agent surface.",
      scope: "query",
      source: "external_receipts",
      status: "UNKNOWN",
    },
  ];
  if (observation.search) {
    entries.push({
      note: observation.search.truncated
        ? "search_dashboard returned truncated=true."
        : "search_dashboard returned truncated=false.",
      scope: "query",
      source: "search",
      status: observation.search.truncated ? "PARTIAL" : "COMPLETE",
    });
  }
  return entries;
}

function findAnnotation(
  bundle: ReadBundle,
  id: string
): Annotation | undefined {
  return (
    bundle.axis.notes.find((row) => row.id === id) ??
    bundle.topicNotes.find((row) => row.id === id)
  );
}

function validateConflict(
  bundle: ReadBundle,
  raw: unknown
): ProposedConflict {
  if (!isRecord(raw)) {
    throw new ContractRefusal(
      "malformed_conflict",
      "A conflicts[] entry must be an object with refs[] and a permitted reason."
    );
  }
  const reason = raw.reason;
  if (
    typeof reason !== "string" ||
    !(CONFLICT_REASONS as readonly string[]).includes(reason)
  ) {
    throw new ContractRefusal(
      "unknown_conflict_reason",
      `conflicts[].reason must be one of: ${CONFLICT_REASONS.join(", ")}.`
    );
  }
  const refs = resolveReferences(bundle, raw.refs ?? []);
  const humanRefs = refs.filter((ref) => {
    if (ref.variant !== "annotation" || ref.ref.variant !== "annotation") {
      return false;
    }
    const row = findAnnotation(bundle, ref.ref.id);
    return row !== undefined && isHumanSteering(row);
  });
  if (reason === "human_steering_conflict" && humanRefs.length < 1) {
    throw new ContractRefusal(
      "conflict_ref_not_human_steering",
      "human_steering_conflict must cite at least one returned human interpretation/steering annotation."
    );
  }
  if (reason === "human_human_conflict" && humanRefs.length < 2) {
    throw new ContractRefusal(
      "human_human_conflict_needs_two",
      "human_human_conflict must cite at least two distinct returned human claims."
    );
  }
  return { reason: reason as ConflictReason, refs };
}

export type AssembleContext = { reads: number };

type CandidateAssessment = {
  outcome: Outcome;
  provenance: string;
  evidenceRefs: ResolvedRef[];
  conflicts: ProposedConflict[];
  claimStrength?: ClaimStrength;
  text?: string;
};

/**
 * Validate a supplied candidate structurally against the returned bundle, resolving its typed references
 * fail-closed. A malformed candidate — a forbidden field, a missing or row-derived provenance, an unknown
 * outcome, an unresolved reference, a conflict that contradicts the outcome — throws
 * {@link ContractRefusal} or {@link ReferenceResolutionError}. Shared by the stable
 * {@link assembleProposal} and the churn path {@link buildUnstableProposal} so a malformed candidate is
 * refused on **every** path and never silently dropped.
 */
function assessCandidate(
  observation: Observation,
  candidate: unknown
): CandidateAssessment {
  if (!isRecord(candidate)) {
    throw new ContractRefusal(
      "candidate_not_object",
      "A supplied candidate must be an object."
    );
  }
  const bundle = bundleOf(observation);

  for (const field of FORBIDDEN_PROPOSAL_FIELDS) {
    if (hasOwn(candidate, field)) {
      throw new ContractRefusal(
        "forbidden_field",
        `The ${field} field does not exist in V1 and is refused.`
      );
    }
  }
  if (hasOwn(candidate, "basis") || hasOwn(candidate, "coverage")) {
    throw new ContractRefusal(
      "assembler_owned_field",
      "basis and coverage are assembler-owned and may not be supplied."
    );
  }
  if (hasOwn(candidate, "provenanceFrom")) {
    throw new ContractRefusal(
      "provenance_not_injected",
      "Provenance is an injected, caller-supplied label; it is never derived from author_type, created_at or row order."
    );
  }
  const provenance = candidate.provenance;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    throw new ContractRefusal(
      "provenance_missing",
      "A supplied candidate must carry an explicit, non-empty provenance label."
    );
  }
  if (hasOwn(candidate, "reviewStatus") && candidate.reviewStatus !== REVIEW_STATUS) {
    throw new ContractRefusal(
      "review_status_not_unreviewed",
      `reviewStatus is a proposal-only label and must be "${REVIEW_STATUS}".`
    );
  }

  const outcome = candidate.outcome;
  if (
    typeof outcome !== "string" ||
    !(OUTCOMES as readonly string[]).includes(outcome)
  ) {
    throw new ContractRefusal(
      "unknown_outcome",
      `outcome must be one of: ${OUTCOMES.join(", ")}.`
    );
  }

  if (outcome === "proposal") {
    if (
      typeof candidate.claimStrength !== "string" ||
      !(CLAIM_STRENGTHS as readonly string[]).includes(candidate.claimStrength)
    ) {
      throw new ContractRefusal(
        "claim_strength_required",
        `A proposal must carry claimStrength of ${CLAIM_STRENGTHS.join(" or ")} — never confirmed, never authority.`
      );
    }
    if (typeof candidate.text !== "string" || candidate.text.trim().length === 0) {
      throw new ContractRefusal(
        "text_required",
        "A proposal must carry a non-empty text."
      );
    }
    if (observation.axis.evidence.length === 0) {
      throw new ContractRefusal(
        "proposal_without_evidence",
        "With an empty returned evidence list the outcome may not be proposal."
      );
    }
  } else {
    if (hasOwn(candidate, "claimStrength")) {
      throw new ContractRefusal(
        "claim_strength_on_non_proposal",
        "A non-proposal outcome carries no synthetic claim-strength label."
      );
    }
    if (hasOwn(candidate, "text")) {
      throw new ContractRefusal(
        "withheld_text",
        "A non-proposal outcome must not carry text — no withheld reading may leak."
      );
    }
  }

  const evidenceRefs = resolveReferences(bundle, candidate.evidence_refs ?? []);
  if (outcome === "proposal" && evidenceRefs.length === 0) {
    throw new ContractRefusal(
      "proposal_without_refs",
      "A proposal must cite at least one typed, resolvable evidence reference."
    );
  }

  const conflictsRaw = candidate.conflicts ?? [];
  if (!Array.isArray(conflictsRaw)) {
    throw new ContractRefusal(
      "conflicts_not_array",
      "conflicts must be an array of structured conflicts."
    );
  }
  const conflicts = conflictsRaw.map((entry) =>
    validateConflict(bundle, entry)
  );
  if (conflicts.length > 0 && outcome !== "abstained") {
    throw new ContractRefusal(
      "conflict_without_abstention",
      "A structured conflict requires outcome abstained."
    );
  }
  if (outcome === "abstained" && conflicts.length === 0) {
    throw new ContractRefusal(
      "abstention_without_conflict",
      "An abstention must carry at least one structured conflict."
    );
  }

  if (outcome === "proposal") {
    return {
      claimStrength: candidate.claimStrength as ClaimStrength,
      conflicts,
      evidenceRefs,
      outcome: "proposal",
      provenance,
      text: candidate.text as string,
    };
  }
  return { conflicts, evidenceRefs, outcome: outcome as Outcome, provenance };
}

/**
 * Assemble the proposal from an observation and a supplied candidate, or refuse it. Deterministic and
 * pure. The candidate's provenance is echoed verbatim; nothing is derived from `author_type`,
 * `created_at` or row order.
 */
export function assembleProposal(
  observation: Observation,
  candidate: unknown,
  context: AssembleContext = { reads: 0 }
): Proposal {
  const assessed = assessCandidate(observation, candidate);
  const proposal: Proposal = {
    basis: { asOf: observation.asOf, digest: observation.digest, reads: context.reads },
    conflicts: assessed.conflicts,
    coverage: computeCoverage(observation),
    evidence_refs: assessed.evidenceRefs,
    kind: "interpretation",
    outcome: assessed.outcome,
    provenance: assessed.provenance,
    reviewStatus: REVIEW_STATUS,
    subject: observation.subject,
  };
  if (assessed.outcome === "proposal") {
    proposal.claimStrength = assessed.claimStrength;
    proposal.text = assessed.text;
  }
  return proposal;
}

/**
 * The `snapshot_unstable` shape: **no** text and **no** synthetic claim-strength label. The supplied
 * candidate is validated exactly as the stable path validates it (a malformed candidate — an
 * unresolvable reference, a missing or row-derived provenance, a forbidden field — is a hard refusal on
 * the churn path too, never a silent drop). The unstable shape then carries **no** candidate references:
 * there is no stable reading text to ground them, so the empty set is an intentional design choice, not a
 * dropped-invalid one. No further reads are performed after this shape is reached.
 */
export function buildUnstableProposal(
  observation: Observation,
  candidate: unknown,
  reads: number
): Proposal {
  const assessed = assessCandidate(observation, candidate);
  return {
    basis: { asOf: observation.asOf, digest: observation.digest, reads },
    conflicts: [],
    coverage: computeCoverage(observation),
    evidence_refs: [],
    kind: "interpretation",
    outcome: "snapshot_unstable",
    provenance: assessed.provenance,
    reviewStatus: REVIEW_STATUS,
    subject: observation.subject,
  };
}

export type EvaluationStatus = "proposal" | "refused" | "read_error";
export type EvaluationError = { name: string; reason: string; message: string };
export type EvaluationResult = {
  status: EvaluationStatus;
  proposal: Proposal | null;
  error: EvaluationError | null;
  reads: number;
  digests: string[];
};

export type SnapshotDriverOptions = {
  /** One read per step index (0=A, 1=B, 2=C). Only the needed steps are called. */
  read: (step: number) => Promise<unknown>;
  /** Build (and digest) the observation from one raw read. */
  observe: (raw: unknown, step: number) => Observation;
  candidate: unknown;
};

/**
 * The bounded A/B/C snapshot coordinator (DESIGN-V1 §7.3). The deterministic order is fixed and finite:
 *
 *   1. **construct A** — read step 0 and build (digest) the observation;
 *   2. **construct B** — read step 1 and build the observation, then compare A to B;
 *   3. if A=B deliver the candidate against A/B; if A≠B, A is **discarded** and the observation is
 *      recomputed from B, then C is read and B is compared to C;
 *   4. if B=C deliver against B/C; if B≠C emit `snapshot_unstable` with **no further reads or recomputes**.
 *
 * The supplied candidate is deliberately **not** assembled per snapshot before the compare. In production
 * the candidate is computed from a observation, so a candidate assembled against a stale A could throw —
 * and letting that refusal abort the protocol would let a transient desync defeat the safety rule. The
 * candidate is validated exactly once, against the final stable observation (or, on churn, against B), so a
 * candidate error can never prevent the bounded safety protocol from running to its (finite) end.
 */
export async function assembleWithSnapshotDriver(
  options: SnapshotDriverOptions
): Promise<EvaluationResult> {
  const digests: string[] = [];
  let reads = 0;
  const readStep = async (step: number): Promise<Observation> => {
    reads += 1;
    const raw = await options.read(step);
    const observation = options.observe(raw, step);
    digests.push(observation.digest);
    return observation;
  };

  let first: Observation;
  try {
    first = await readStep(0);
  } catch (error) {
    return readErrorResult(error, reads, digests);
  }
  let second: Observation;
  try {
    second = await readStep(1);
  } catch (error) {
    return readErrorResult(error, reads, digests);
  }

  if (first.digest === second.digest) {
    return finalize(
      () => assembleProposal(first, options.candidate, { reads }),
      reads,
      digests
    );
  }

  let third: Observation;
  try {
    third = await readStep(2);
  } catch (error) {
    return readErrorResult(error, reads, digests);
  }

  if (second.digest === third.digest) {
    return finalize(
      () => assembleProposal(second, options.candidate, { reads }),
      reads,
      digests
    );
  }

  // A malformed candidate is refused on the churn path too — never silently promoted to a
  // `snapshot_unstable` success. No further reads are performed after this point.
  return finalize(
    () => buildUnstableProposal(second, options.candidate, reads),
    reads,
    digests
  );
}

function finalize(
  build: () => Proposal,
  reads: number,
  digests: string[]
): EvaluationResult {
  try {
    return { digests, error: null, proposal: build(), reads, status: "proposal" };
  } catch (error) {
    if (
      error instanceof ReferenceResolutionError ||
      error instanceof ContractRefusal
    ) {
      return {
        digests,
        error: { message: error.message, name: error.name, reason: error.reason },
        proposal: null,
        reads,
        status: "refused",
      };
    }
    throw error;
  }
}

function readErrorResult(
  error: unknown,
  reads: number,
  digests: string[]
): EvaluationResult {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  return {
    digests,
    error: { message, name, reason: "read_error" },
    proposal: null,
    reads,
    status: "read_error",
  };
}

const REF_ROLES = ["axis", "topic", "problem"] as const;
const COVERAGE_STATUSES = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
const COVERAGE_SCOPES = ["axis", "topic", "problem", "query"] as const;

function assertNonEmptyString(
  value: unknown,
  label: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractRefusal(
      "malformed_field",
      `An emitted proposal must carry a non-empty string ${label}.`
    );
  }
}

/**
 * Validate the shape of one emitted resolved reference. Reference **identity resolution** — that a
 * citation names exactly one returned row — is enforced by the assembler against the returned bundle
 * ({@link assembleProposal}/{@link resolveReferences}); this asserts the emitted artifact carries a
 * well-formed typed reference (a permitted variant, a non-empty identity, a role, the typed `ref` and a
 * scope), so a malformed reference can never reach a caller even without the bundle at hand.
 */
function assertResolvedRefShape(value: unknown, label: string): void {
  if (!isRecord(value)) {
    throw new ContractRefusal(
      "malformed_reference",
      `${label} must be a resolved-reference object.`
    );
  }
  if (
    typeof value.variant !== "string" ||
    !(REFERENCE_VARIANTS as readonly string[]).includes(value.variant)
  ) {
    throw new ContractRefusal(
      "malformed_reference",
      `${label}.variant must be a typed reference variant.`
    );
  }
  assertNonEmptyString(value.identity, `${label}.identity`);
  if (
    typeof value.role !== "string" ||
    !(REF_ROLES as readonly string[]).includes(value.role)
  ) {
    throw new ContractRefusal(
      "malformed_reference",
      `${label}.role must be axis, topic or problem.`
    );
  }
  if (!isRecord(value.ref)) {
    throw new ContractRefusal(
      "malformed_reference",
      `${label}.ref must carry the typed reference.`
    );
  }
  if (!isRecord(value.scope)) {
    throw new ContractRefusal(
      "malformed_reference",
      `${label}.scope must be an object.`
    );
  }
  for (const key of ["axisId", "topicId", "problemId"]) {
    const scopeValue = value.scope[key];
    if (scopeValue !== null && typeof scopeValue !== "string") {
      throw new ContractRefusal(
        "malformed_reference",
        `${label}.scope.${key} must be a string or null.`
      );
    }
  }
}

/**
 * Re-assert the structural contract on an already-emitted proposal. The evaluator uses this to confirm the
 * artifact itself (not only the builder) is well-formed: no `authority`/`reasoning_strength`, no text or
 * synthetic claim-strength label on a non-proposal, and well-typed `basis`, `subject`, `provenance`,
 * `evidence_refs`, `conflicts` and `coverage`. It validates the emitted **shape**; reference identity is
 * resolved against the returned bundle by the assembler (this function has no bundle), so it checks that
 * each reference is a well-formed typed reference rather than that it resolved to a specific row.
 */
export function assertProposalShape(proposal: unknown): void {
  if (!isRecord(proposal)) {
    throw new ContractRefusal("proposal_not_object", "A proposal must be an object.");
  }
  for (const field of FORBIDDEN_PROPOSAL_FIELDS) {
    if (hasOwn(proposal, field)) {
      throw new ContractRefusal(
        "forbidden_field",
        `The emitted proposal must not carry ${field}.`
      );
    }
  }
  if (proposal.reviewStatus !== REVIEW_STATUS) {
    throw new ContractRefusal(
      "review_status_not_unreviewed",
      `An emitted proposal must carry reviewStatus ${REVIEW_STATUS}.`
    );
  }
  if (
    typeof proposal.outcome !== "string" ||
    !(OUTCOMES as readonly string[]).includes(proposal.outcome)
  ) {
    throw new ContractRefusal("unknown_outcome", "Emitted outcome is not well-formed.");
  }

  if (!isRecord(proposal.subject)) {
    throw new ContractRefusal("malformed_subject", "An emitted proposal must carry a subject object.");
  }
  assertNonEmptyString(proposal.subject.topicId, "subject.topicId");
  assertNonEmptyString(proposal.subject.axisId, "subject.axisId");

  if (!isRecord(proposal.basis)) {
    throw new ContractRefusal("malformed_basis", "An emitted proposal must carry a basis object.");
  }
  assertNonEmptyString(proposal.basis.asOf, "basis.asOf");
  assertNonEmptyString(proposal.basis.digest, "basis.digest");
  if (typeof proposal.basis.reads !== "number") {
    throw new ContractRefusal("malformed_basis", "An emitted proposal must carry a numeric basis.reads.");
  }

  assertNonEmptyString(proposal.provenance, "provenance");

  if (!Array.isArray(proposal.evidence_refs)) {
    throw new ContractRefusal(
      "malformed_evidence_refs",
      "An emitted proposal must carry an evidence_refs array."
    );
  }
  proposal.evidence_refs.forEach((ref, index) =>
    assertResolvedRefShape(ref, `evidence_refs[${index}]`)
  );

  if (!Array.isArray(proposal.conflicts)) {
    throw new ContractRefusal(
      "malformed_conflicts",
      "An emitted proposal must carry a conflicts array."
    );
  }
  proposal.conflicts.forEach((conflict, index) => {
    const label = `conflicts[${index}]`;
    if (!isRecord(conflict)) {
      throw new ContractRefusal("malformed_conflict", `${label} must be an object.`);
    }
    if (
      typeof conflict.reason !== "string" ||
      !(CONFLICT_REASONS as readonly string[]).includes(conflict.reason)
    ) {
      throw new ContractRefusal(
        "malformed_conflict",
        `${label}.reason must be a permitted conflict reason.`
      );
    }
    if (!Array.isArray(conflict.refs)) {
      throw new ContractRefusal("malformed_conflict", `${label}.refs must be an array.`);
    }
    conflict.refs.forEach((ref, refIndex) =>
      assertResolvedRefShape(ref, `${label}.refs[${refIndex}]`)
    );
  });

  if (!Array.isArray(proposal.coverage)) {
    throw new ContractRefusal(
      "malformed_coverage",
      "An emitted proposal must carry a coverage array."
    );
  }
  proposal.coverage.forEach((entry, index) => {
    const label = `coverage[${index}]`;
    if (!isRecord(entry)) {
      throw new ContractRefusal("malformed_coverage", `${label} must be an object.`);
    }
    assertNonEmptyString(entry.source, `${label}.source`);
    if (
      typeof entry.scope !== "string" ||
      !(COVERAGE_SCOPES as readonly string[]).includes(entry.scope)
    ) {
      throw new ContractRefusal(
        "malformed_coverage",
        `${label}.scope must be axis, topic, problem or query.`
      );
    }
    if (
      typeof entry.status !== "string" ||
      !(COVERAGE_STATUSES as readonly string[]).includes(entry.status)
    ) {
      throw new ContractRefusal(
        "malformed_coverage",
        `${label}.status must be COMPLETE, PARTIAL or UNKNOWN.`
      );
    }
    if (typeof entry.note !== "string") {
      throw new ContractRefusal("malformed_coverage", `${label}.note must be a string.`);
    }
  });

  if (proposal.outcome === "proposal") {
    if (
      typeof proposal.claimStrength !== "string" ||
      !(CLAIM_STRENGTHS as readonly string[]).includes(proposal.claimStrength)
    ) {
      throw new ContractRefusal(
        "claim_strength_required",
        "An emitted proposal must carry a permitted claimStrength."
      );
    }
    if (typeof proposal.text !== "string" || proposal.text.trim().length === 0) {
      throw new ContractRefusal("text_required", "An emitted proposal must carry text.");
    }
  } else {
    if (hasOwn(proposal, "text")) {
      throw new ContractRefusal("withheld_text", "A non-proposal emitted no text.");
    }
    if (hasOwn(proposal, "claimStrength")) {
      throw new ContractRefusal(
        "claim_strength_on_non_proposal",
        "A non-proposal emitted no claim-strength label."
      );
    }
  }
}

/** The documented default caps, mirrored from the store for a self-describing observation. */
export const DEFAULT_LIMITS = {
  historyLimit: DEFAULT_AXIS_HISTORY_LIMIT,
  notesLimit: DEFAULT_ANNOTATION_LIMIT,
} as const;
