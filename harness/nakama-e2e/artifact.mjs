/**
 * The Nakama semantic seed artifact: load, guard against oracle/verdict/model content, and turn into
 * reconcile_topic payloads.
 *
 * The artifact (`seed-artifact.json`) is a **distinct** seed: it is derived from the accepted FIX-*
 * facts but expressed in the supported `reconcile_topic` input vocabulary, not as a SQLite row dump.
 * It carries no oracle, no expected outcome/verdict, no candidate output and no model/provider metadata.
 * `assertOracleFree` enforces that mechanically so a future edit cannot smuggle one back in.
 *
 * Live ids are assigned by the host; the artifact keeps `sourceId` on every fact only so the seeder can
 * persist a source->live id mapping (see seed.mjs) and the readback can validate the live projection.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SEED_ARTIFACT_PATH = join(HERE, "seed-artifact.json");

/**
 * Key names that must never appear anywhere in the artifact. These are the offline evaluator's
 * oracle/verdict/candidate/model vocabulary (semantic-cases.json / expected-outcomes.json), which the
 * Nakama seed must be free of: a case is judged by humans later, not carried in the seed.
 */
export const FORBIDDEN_KEYS = new Set([
  "expected",
  "expectedOutcomes",
  "expectedModelBehaviour",
  "expect",
  "verdict",
  "candidate",
  "candidates",
  "candidateContract",
  "model",
  "modelInvoked",
  "modelId",
  "provider",
  "projection",
  "projectionDigest",
  "semantic",
  "oracle",
  "outcome",
  "digestSource",
  "citedSupport",
  "rubric",
]);

/** Every forbidden key path present in `value`. Empty means the artifact is oracle-free. */
export function findForbiddenKeys(value, path = "$") {
  const found = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...findForbiddenKeys(item, `${path}[${i}]`)));
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) found.push(`${path}.${key}`);
      found.push(...findForbiddenKeys(child, `${path}.${key}`));
    }
  }
  return found;
}

export class SeedArtifactError extends Error {
  constructor(message) {
    super(message);
    this.name = "SeedArtifactError";
  }
}

/** Throw if the artifact contains any oracle/verdict/candidate/model key. */
export function assertOracleFree(artifact) {
  const forbidden = findForbiddenKeys(artifact);
  if (forbidden.length > 0) {
    throw new SeedArtifactError(
      `seed artifact carries forbidden oracle/verdict/model keys: ${forbidden.join(", ")}`
    );
  }
  return artifact;
}

export function loadSeedArtifact(path = SEED_ARTIFACT_PATH) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  if (artifact?.artifactId !== "nakama-semantic-seed-v1") {
    throw new SeedArtifactError(`unexpected artifactId: ${artifact?.artifactId}`);
  }
  return assertOracleFree(artifact);
}

/** Every sourceId the artifact declares, grouped by kind, for mapping completeness checks. */
export function listSourceIds(artifact) {
  const ids = { topics: [], axes: [], activities: [], annotations: [], problems: [] };
  for (const topic of artifact.topics) {
    ids.topics.push(topic.sourceId);
    for (const a of topic.activities) ids.activities.push(a.sourceId);
    for (const a of topic.annotations) ids.annotations.push(a.sourceId);
    for (const axis of topic.axes) {
      ids.axes.push(axis.sourceId);
      for (const a of axis.activities) ids.activities.push(a.sourceId);
      for (const a of axis.annotations) ids.annotations.push(a.sourceId);
      for (const a of axis.problemScopedActivities ?? []) ids.activities.push(a.sourceId);
      for (const p of axis.problems) ids.problems.push(p.sourceId);
    }
  }
  return ids;
}

/** The text a note seeds, after applying the active variant (if it is that variant's target). */
export function effectiveNoteText(artifact, annotation, activeVariants) {
  for (const [variantId, variant] of Object.entries(artifact.variants ?? {})) {
    if (activeVariants.includes(variantId) && variant.replacesNote === annotation.sourceId) {
      return variant.text;
    }
  }
  return annotation.text;
}

function withoutUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}

function plainActivity(activity, axisTitle) {
  return withoutUndefined({
    axisTitle,
    occurredAt: activity.occurredAt,
    repositoryFullName: activity.repositoryFullName,
    sourceRef: activity.sourceRef,
    sourceType: activity.sourceType,
    sourceUrl: activity.sourceUrl,
    summary: activity.summary,
  });
}

function plainAnnotation(artifact, annotation, axisTitle, activeVariants) {
  return withoutUndefined({
    axisTitle,
    confidence: annotation.confidence,
    kind: annotation.kind,
    text: effectiveNoteText(artifact, annotation, activeVariants),
  });
}

/**
 * Build the phase-1 reconcile payloads (topic, repositories, axes, plans, non-problem activities and
 * annotations, problems). Every problem is created here so phase 2 can name its live id.
 *
 * Returns `[{ topicSourceId, topicName, input, itemIds }]` where `itemIds` records the sourceIds of the
 * activities/annotations/problems **in the order the store processes them** (activities, then
 * annotations, then problems), so a response's ordered id arrays map straight back to source ids.
 */
export function buildMainInputs(artifact, { variants = artifact.defaultVariants } = {}) {
  const calls = [];
  for (const topic of artifact.topics) {
    const activities = [];
    const annotations = [];
    const problems = [];
    const axes = [];
    const plans = [];
    const activityIds = [];
    const annotationIds = [];
    const problemIds = [];

    for (const a of topic.activities) { activities.push(plainActivity(a, undefined)); activityIds.push(a.sourceId); }
    for (const a of topic.annotations) {
      if (a.problemSourceId) continue;
      annotations.push(plainAnnotation(artifact, a, undefined, variants)); annotationIds.push(a.sourceId);
    }

    for (const axis of topic.axes) {
      axes.push(withoutUndefined({
        title: axis.title, description: axis.description, kind: axis.kind, state: axis.state,
        branch: axis.branch, prNumber: axis.prNumber, prUrl: axis.prUrl,
        currentState: axis.currentState, blocker: axis.blocker,
        stateConfidence: axis.stateConfidence, currentStateConfidence: axis.currentStateConfidence,
        blockerConfidence: axis.blockerConfidence,
      }));
      for (const a of axis.activities) { activities.push(plainActivity(a, axis.title)); activityIds.push(a.sourceId); }
      for (const a of axis.annotations) {
        if (a.problemSourceId) continue;
        annotations.push(plainAnnotation(artifact, a, axis.title, variants)); annotationIds.push(a.sourceId);
      }
      for (const p of axis.problems) {
        problems.push(withoutUndefined({
          axisTitle: axis.title, statement: p.statement, state: p.state, stateConfidence: p.stateConfidence,
        }));
        problemIds.push(p.sourceId);
      }
      for (const pl of axis.plans ?? []) {
        plans.push(withoutUndefined({
          axisTitle: axis.title, summary: pl.summary,
          steps: (pl.steps ?? []).map((s) => withoutUndefined({ title: s.title, position: s.position, state: s.state })),
        }));
      }
    }

    calls.push({
      topicSourceId: topic.sourceId,
      topicName: topic.name,
      input: withoutUndefined({
        topicName: topic.name,
        topic: topic.topic,
        repositories: topic.repositories.map((r) => withoutUndefined({
          fullName: r.fullName, url: r.url, description: r.description, defaultBranch: r.defaultBranch,
        })),
        axes, activities, annotations, problems, plans,
      }),
      itemIds: { activities: activityIds, annotations: annotationIds, problems: problemIds },
    });
  }
  return calls;
}

/**
 * Build the phase-2 reconcile payloads: the facts that name a problem (`problemId`), which can only be
 * sent after the problem exists. `mapping.problems[sourceId]` supplies the live problem id.
 */
export function buildProblemRefInputs(artifact, mapping, { variants = artifact.defaultVariants } = {}) {
  const calls = [];
  for (const topic of artifact.topics) {
    const activities = [];
    const annotations = [];
    const activityIds = [];
    const annotationIds = [];
    for (const axis of topic.axes) {
      for (const a of axis.problemScopedActivities ?? []) {
        const problemId = mapping.problems[a.problemSourceId];
        if (!problemId) throw new SeedArtifactError(`no live problem id for ${a.problemSourceId}`);
        activities.push(withoutUndefined({
          problemId, occurredAt: a.occurredAt, repositoryFullName: a.repositoryFullName,
          sourceRef: a.sourceRef, sourceType: a.sourceType, sourceUrl: a.sourceUrl, summary: a.summary,
        }));
        activityIds.push(a.sourceId);
      }
      for (const a of axis.annotations) {
        if (!a.problemSourceId) continue;
        const problemId = mapping.problems[a.problemSourceId];
        if (!problemId) throw new SeedArtifactError(`no live problem id for ${a.problemSourceId}`);
        annotations.push(withoutUndefined({
          problemId, confidence: a.confidence, kind: a.kind,
          text: effectiveNoteText(artifact, a, variants),
        }));
        annotationIds.push(a.sourceId);
      }
    }
    if (activities.length || annotations.length) {
      calls.push({
        topicSourceId: topic.sourceId,
        topicName: topic.name,
        input: { topicName: topic.name, activities, annotations },
        itemIds: { activities: activityIds, annotations: annotationIds },
      });
    }
  }
  return calls;
}
