/**
 * Typed evidence-reference grammar and its fail-closed resolver (DESIGN-V1 §5.5).
 *
 * A citation is a **typed reference to a returned row or field** — never free text, never a display
 * label, a list index or a title. Each variant carries a **real stored id** or a **real exposed field
 * name** (checked against an allowlist), so a reference either resolves to exactly one returned element
 * or the resolver **fails closed**.
 *
 * The resolver is pure: it is handed a {@link ReadBundle} of already-returned rows — a plain value —
 * never a `ResearchStore` handle and never a database path. It performs no read and no write of its own;
 * it decides whether a supplied citation resolves against what a supported projection genuinely returned.
 *
 * ## Fail-closed, never a silent drop
 *
 * An unknown id, a scope mismatch, an ambiguous or untyped variant, or a field outside the allowlist is a
 * **hard error** (`ReferenceResolutionError`), not a dangling citation and not `insufficient_evidence`.
 * `insufficient_evidence` is reserved for a genuinely empty returned evidence list (see the assembler).
 *
 * ## Problem-scoped steering is not a projection (OFFLINE-IMPLEMENTATION-PROPOSAL §9, D-009)
 *
 * `get_topic` returns no problem-scoped annotation list: `listAnnotations({ axisId })` matches only rows
 * whose `axis_id` is the subject axis and `listTopicNotes` matches `topic_id = ? AND axis_id IS NULL`
 * (`src/store.ts:2261-2286,2357-2371`). A problem-scoped `interpretation`/`steering` claim has both ids
 * NULL, so it is returned by neither projection. Its id is therefore **absent from the bundle** and the
 * resolver **refuses** a citation to it — it does not fabricate a projection it cannot read. What a
 * problem *does* genuinely return is its state history (`ProblemDetail.history`, `StateLogEntry[]`), and
 * that is citable with role `problem`.
 */
import type {
  Activity,
  Annotation,
  Axis,
  AxisDetail,
  PlanStep,
  ProblemDetail,
  StateLogEntry,
  Topic,
} from "../store";

/** The exposed axis field names a citation may name (DESIGN-V1 §5.5, `Axis`). */
export const AXIS_FIELD_ALLOWLIST = [
  "state",
  "kind",
  "branch",
  "prNumber",
  "prUrl",
  "currentState",
  "blocker",
  "stateConfidence",
  "currentStateConfidence",
  "blockerConfidence",
  "version",
] as const;

/** The exposed problem field names a citation may name (DESIGN-V1 §5.5, `Problem`). */
export const PROBLEM_FIELD_ALLOWLIST = [
  "state",
  "stateConfidence",
  "statement",
] as const;

export type AxisField = (typeof AXIS_FIELD_ALLOWLIST)[number];
export type ProblemField = (typeof PROBLEM_FIELD_ALLOWLIST)[number];

export const REFERENCE_VARIANTS = [
  "axis_field",
  "problem_field",
  "activity",
  "annotation",
  "state_log",
  "plan_step",
] as const;
export type ReferenceVariant = (typeof REFERENCE_VARIANTS)[number];

/** How a resolved reference places a row in the subject's scope (DESIGN-V1 §5.5). */
export type RefRole = "axis" | "topic" | "problem";

export type EvidenceRef =
  | { variant: "axis_field"; axisId: string; field: string }
  | { variant: "problem_field"; problemId: string; field: string }
  | { variant: "activity"; id: string }
  | { variant: "annotation"; id: string }
  | { variant: "state_log"; id: string }
  | { variant: "plan_step"; id: string };

/** The row's own target fields, read from the row — never assumed from the citation. */
export type ResolvedScope = {
  axisId: string | null;
  topicId: string | null;
  problemId: string | null;
};

/**
 * A citation that resolved to exactly one returned element. `identity` is the canonical key used to
 * collapse duplicates; `value` is present for field references.
 */
export type ResolvedRef = {
  variant: ReferenceVariant;
  role: RefRole;
  identity: string;
  ref: EvidenceRef;
  value?: string | number | null;
  scope: ResolvedScope;
};

/**
 * The returned rows a subject's citations may resolve against. Every field is a value a supported read
 * genuinely returned; `topicNotes` is `get_topic`'s topic-level note list and carries no problem-scoped
 * steering.
 */
export type ReadBundle = {
  topic: Topic;
  axis: AxisDetail;
  /** `get_topic` `notes` (topic-wide; `topic_id = ? AND axis_id IS NULL`). */
  topicNotes: Annotation[];
  /** `get_topic` `activity` (topic-level; axis-linked rows included). */
  topicActivity: Activity[];
};

/**
 * A fail-closed resolver refusal. `reason` is a stable machine token; the message says what was refused.
 */
export class ReferenceResolutionError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "ReferenceResolutionError";
    this.reason = reason;
  }
}

export type ResolveOptions = {
  /**
   * Test-only mutant seam: bypass the scope check so an out-of-scope `axis_field` resolves anyway. The
   * pristine resolver must refuse it; this exists so the guard's red-run can be demonstrated.
   */
  disableScopeCheck?: boolean;
  /** Test-only mutant seam: bypass the field allowlist. */
  disableFieldAllowlist?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReferenceResolutionError(
      "malformed_reference",
      `A typed reference must carry a non-empty string ${field}.`
    );
  }
  return value;
}

function assertVariant(value: unknown): ReferenceVariant {
  if (
    typeof value !== "string" ||
    !(REFERENCE_VARIANTS as readonly string[]).includes(value)
  ) {
    throw new ReferenceResolutionError(
      "unsupported_variant",
      "A citation's variant must be one of the typed reference variants; a label, index or unknown variant is refused."
    );
  }
  return value as ReferenceVariant;
}

function fieldValue(
  record: Record<string, unknown>,
  field: string
): string | number | null {
  const value = record[field];
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  // `prNumber` is the only numeric field and may be null.
  return null;
}

/**
 * Resolve one supplied citation against the returned bundle, or refuse it. Throws
 * {@link ReferenceResolutionError}; there is no "partial" or "dangling" result.
 */
export function resolveReference(
  bundle: ReadBundle,
  ref: unknown,
  options: ResolveOptions = {}
): ResolvedRef {
  if (!isRecord(ref)) {
    throw new ReferenceResolutionError(
      "non_typed_reference",
      "A citation must be a typed reference object — a display label or a list index is not citation identity."
    );
  }
  const variant = assertVariant(ref.variant);
  const subjectAxisId = bundle.axis.id;
  const topicId = bundle.topic.id;

  switch (variant) {
    case "axis_field": {
      const axisId = requireId(ref.axisId, "axisId");
      if (axisId !== subjectAxisId && !options.disableScopeCheck) {
        throw new ReferenceResolutionError(
          "scope_mismatch",
          `axis_field cites axis "${axisId}", which is not the subject axis.`
        );
      }
      const field = requireId(ref.field, "field");
      if (
        !options.disableFieldAllowlist &&
        !(AXIS_FIELD_ALLOWLIST as readonly string[]).includes(field)
      ) {
        throw new ReferenceResolutionError(
          "field_not_allowlisted",
          `axis_field "${field}" is not an exposed axis field.`
        );
      }
      return {
        identity: `axis_field:${axisId}:${field}`,
        ref: { variant, axisId, field },
        role: "axis",
        scope: { axisId: subjectAxisId, topicId, problemId: null },
        value: fieldValue(
          bundle.axis as unknown as Record<string, unknown>,
          field
        ),
        variant,
      };
    }

    case "problem_field": {
      const problemId = requireId(ref.problemId, "problemId");
      const problem = bundle.axis.problems.find((row) => row.id === problemId);
      if (!problem) {
        throw new ReferenceResolutionError(
          "unknown_id",
          `problem_field cites problem "${problemId}", which is not among the subject axis's returned problems.`
        );
      }
      const field = requireId(ref.field, "field");
      if (
        !options.disableFieldAllowlist &&
        !(PROBLEM_FIELD_ALLOWLIST as readonly string[]).includes(field)
      ) {
        throw new ReferenceResolutionError(
          "field_not_allowlisted",
          `problem_field "${field}" is not an exposed problem field.`
        );
      }
      return {
        identity: `problem_field:${problemId}:${field}`,
        ref: { variant, problemId, field },
        role: "problem",
        scope: { axisId: subjectAxisId, topicId, problemId },
        value: fieldValue(
          problem as unknown as Record<string, unknown>,
          field
        ),
        variant,
      };
    }

    case "activity": {
      const id = requireId(ref.id, "id");
      const axisRow = bundle.axis.history.find((row) => row.id === id);
      if (axisRow) {
        return {
          identity: `activity:${id}`,
          ref: { variant, id },
          role: "axis",
          scope: {
            axisId: axisRow.axisId,
            topicId: axisRow.topicId,
            problemId: axisRow.problemId,
          },
          variant,
        };
      }
      const topicRow = bundle.topicActivity.find(
        (row) =>
          row.id === id && row.axisId === null && row.topicId === topicId
      );
      if (topicRow) {
        return {
          identity: `activity:${id}`,
          ref: { variant, id },
          role: "topic",
          scope: {
            axisId: topicRow.axisId,
            topicId: topicRow.topicId,
            problemId: topicRow.problemId,
          },
          variant,
        };
      }
      throw new ReferenceResolutionError(
        "unknown_id",
        `activity "${id}" is not among the returned rows for this subject.`
      );
    }

    case "annotation": {
      const id = requireId(ref.id, "id");
      const axisRow = bundle.axis.notes.find((row) => row.id === id);
      if (axisRow) {
        return {
          identity: `annotation:${id}`,
          ref: { variant, id },
          role: "axis",
          scope: {
            axisId: axisRow.axisId,
            topicId: axisRow.topicId,
            problemId: axisRow.problemId,
          },
          variant,
        };
      }
      const topicRow = bundle.topicNotes.find(
        (row) =>
          row.id === id &&
          row.axisId === null &&
          row.topicId === topicId &&
          row.problemId === null
      );
      if (topicRow) {
        return {
          identity: `annotation:${id}`,
          ref: { variant, id },
          role: "topic",
          scope: {
            axisId: topicRow.axisId,
            topicId: topicRow.topicId,
            problemId: topicRow.problemId,
          },
          variant,
        };
      }
      throw new ReferenceResolutionError(
        "unknown_id",
        `annotation "${id}" is not among the returned rows for this subject (problem-scoped steering is not returned by get_topic).`
      );
    }

    case "state_log": {
      const id = requireId(ref.id, "id");
      const axisRow = bundle.axis.stateHistory.find((row) => row.id === id);
      if (axisRow) {
        return {
          identity: `state_log:${id}`,
          ref: { variant, id },
          role: "axis",
          scope: {
            axisId: axisRow.axisId,
            topicId,
            problemId: axisRow.problemId,
          },
          variant,
        };
      }
      for (const problem of bundle.axis.problems) {
        const row = problem.history.find((entry) => entry.id === id);
        if (row) {
          return {
            identity: `state_log:${id}`,
            ref: { variant, id },
            role: "problem",
            scope: { axisId: subjectAxisId, topicId, problemId: problem.id },
            variant,
          };
        }
      }
      throw new ReferenceResolutionError(
        "unknown_id",
        `state_log "${id}" is not among the returned state-history rows for this subject.`
      );
    }

    case "plan_step": {
      const id = requireId(ref.id, "id");
      const step = bundle.axis.plan?.steps.find((row) => row.id === id);
      if (!step) {
        throw new ReferenceResolutionError(
          "unknown_id",
          `plan_step "${id}" is not among the subject axis's returned plan steps.`
        );
      }
      return {
        identity: `plan_step:${id}`,
        ref: { variant, id },
        role: "axis",
        scope: { axisId: subjectAxisId, topicId, problemId: null },
        variant,
      };
    }
  }
}

/**
 * Resolve a list of citations, collapsing references that canonicalise to the same identity to one and
 * preserving first-occurrence order. Throws on the first unresolvable citation.
 */
export function resolveReferences(
  bundle: ReadBundle,
  refs: unknown,
  options: ResolveOptions = {}
): ResolvedRef[] {
  if (!Array.isArray(refs)) {
    throw new ReferenceResolutionError(
      "refs_not_array",
      "evidence_refs must be an array of typed references."
    );
  }
  const out: ResolvedRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const resolved = resolveReference(bundle, ref, options);
    if (seen.has(resolved.identity)) {
      continue;
    }
    seen.add(resolved.identity);
    out.push(resolved);
  }
  return out;
}

/** A returned human `interpretation`/`steering` claim — the vocabulary the precedence rule speaks of. */
export function isHumanSteering(row: Annotation): boolean {
  return (
    row.authorType === "human" &&
    (row.kind === "interpretation" || row.kind === "steering")
  );
}

/** A row type the resolver can return, kept narrow for diagnostics. */
export type ResolvableRow =
  | Axis
  | ProblemDetail
  | Activity
  | Annotation
  | StateLogEntry
  | PlanStep;
