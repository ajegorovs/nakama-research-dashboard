/**
 * Seed the semantic fixture into a live Nakama org **through the supported reconcile_topic action**, as
 * the authenticated human session the client already holds. No raw SQLite write, no forged actor: the
 * host derives the author from the session (`context.actor`, `context.profileId`), which is exactly what
 * the F-2-conflict and F-18-inj notes need — and why the F-3 pair of disagreeing notes legitimately ends
 * up authored by the same human rather than two invented actors.
 *
 * The seeder persists a **source-id -> live-id mapping** (sourceId is the artifact's FIX-* label; the live
 * id is whatever the host assigned) so the readback can address the seeded rows and so a later re-run can
 * be checked against the same fixture.
 *
 * It **fails closed on a duplicate**: a fixture topic that already exists refuses the seed, and there is
 * no override flag — re-seeding onto a live fixture would double every append-only row (activities,
 * annotations, problems, plans). A second copy means a fresh org/data root, not a forced overwrite.
 *
 * Every reconcile response is validated in full before the next mutation: the returned id arrays must have
 * exactly the length of the arrays sent, and every id must be a non-empty string. A short, reordered or
 * malformed response stops the run with a `SeedError` (never a raw `TypeError`, never a warning that lets
 * the run report success), because a positional mapping against a short response would silently
 * mis-address the fixture.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildMainInputs, buildProblemRefInputs, listSourceIds } from "./artifact.mjs";

export class SeedError extends Error {
  constructor(message) {
    super(message);
    this.name = "SeedError";
  }
}

function requireOk(step, response) {
  if (response.status !== 200 || response.result?.ok !== true) {
    const detail = JSON.stringify(response.result ?? response.body ?? {}).slice(0, 400);
    throw new SeedError(`${step}: HTTP ${response.status} ${detail}`);
  }
  return response.result;
}

/** Refuse a response whose id array length does not equal what was sent (L2: never map by position onto a short list). */
function requireCount(step, label, got, want) {
  if (got !== want) {
    throw new SeedError(
      `${step}: the response carried ${got} ${label} id(s) for ${want} sent — refusing to continue ` +
        "(the source->live mapping would be incomplete or mis-addressed)"
    );
  }
}

/** Refuse a missing/non-string id (L1: a malformed 200 must read as a SeedError, not a dereference TypeError). */
function requireId(step, label, id) {
  if (typeof id !== "string" || id.length === 0) {
    throw new SeedError(`${step}: the response carried no usable ${label} id`);
  }
  return id;
}

/** A fresh, empty mapping skeleton. */
export function emptyMapping(variants) {
  return { topics: {}, axes: {}, activities: {}, annotations: {}, problems: {}, variantTargets: {}, variants };
}

/**
 * Seed the artifact. Returns `{ mapping, calls, warnings }`; `warnings` is always `[]` on return because an
 * incomplete mapping throws first.
 *
 * `client` may be any object exposing `action(key, input)` and `listTopics()` (seed.mjs never touches the
 * network itself), so the whole flow is exercised offline with a fake in the tests.
 */
export async function seedSemanticFixture({
  artifact,
  client,
  variants = artifact.defaultVariants,
  onEvent = () => {},
} = {}) {
  // Duplicate guard, fail closed: if the subject cannot be read, refuse rather than risk a second copy.
  const listed = await client.listTopics();
  if (listed.status !== 200 || !Array.isArray(listed.result?.topics)) {
    throw new SeedError("could not list topics — the already-seeded guard cannot run, refusing to seed");
  }
  const wanted = new Set(artifact.topics.map((t) => t.name.toLowerCase()));
  const clash = listed.result.topics.find((t) => wanted.has(String(t.name ?? "").toLowerCase()));
  if (clash) {
    throw new SeedError(
      `fixture topic "${clash.name}" already exists (${clash.id}); refusing a second copy — seed a fresh org/data root`
    );
  }

  const mapping = emptyMapping(variants);
  const calls = [];

  for (const call of buildMainInputs(artifact, { variants })) {
    const step = `reconcile_topic(${call.topicName})`;
    onEvent({ phase: "main", topic: call.topicSourceId });
    const result = requireOk(step, await client.action("reconcile_topic", call.input));

    const axisCount = (call.input.axes ?? []).length;
    requireCount(step, "axis", result.axes?.length ?? 0, axisCount);
    requireCount(step, "recorded activity", result.recorded?.activities?.length ?? 0, call.itemIds.activities.length);
    requireCount(step, "recorded annotation", result.recorded?.annotations?.length ?? 0, call.itemIds.annotations.length);
    requireCount(step, "problem", result.problems?.length ?? 0, call.itemIds.problems.length);

    mapping.topics[call.topicSourceId] = requireId(step, "topic", result.topic?.id);
    const topic = artifact.topics.find((t) => t.sourceId === call.topicSourceId);
    topic.axes.forEach((axis, i) => {
      mapping.axes[axis.sourceId] = requireId(step, `axis[${i}]`, result.axes[i]?.id);
    });
    call.itemIds.activities.forEach((id, i) => {
      mapping.activities[id] = requireId(step, `activity[${i}]`, result.recorded.activities[i]);
    });
    call.itemIds.annotations.forEach((id, i) => {
      mapping.annotations[id] = requireId(step, `annotation[${i}]`, result.recorded.annotations[i]);
    });
    call.itemIds.problems.forEach((id, i) => {
      mapping.problems[id] = requireId(step, `problem[${i}]`, result.problems[i]?.id);
    });
    calls.push({ phase: "main", topicSourceId: call.topicSourceId, input: call.input, result });
  }

  // Every variant's replaced note must have landed, so the readback can address the variant text by id.
  for (const [variantId, variant] of Object.entries(artifact.variants ?? {})) {
    if (!variants.includes(variantId)) continue;
    mapping.variantTargets[variantId] = requireId(
      `variant ${variantId}`,
      "replaced note",
      mapping.annotations[variant.replacesNote]
    );
  }

  for (const call of buildProblemRefInputs(artifact, mapping, { variants })) {
    const step = `reconcile_topic(${call.topicName}) problem refs`;
    onEvent({ phase: "problem-refs", topic: call.topicSourceId });
    const result = requireOk(step, await client.action("reconcile_topic", call.input));
    requireCount(step, "recorded activity", result.recorded?.activities?.length ?? 0, call.itemIds.activities.length);
    requireCount(step, "recorded annotation", result.recorded?.annotations?.length ?? 0, call.itemIds.annotations.length);
    call.itemIds.activities.forEach((id, i) => {
      mapping.activities[id] = requireId(step, `activity[${i}]`, result.recorded.activities[i]);
    });
    call.itemIds.annotations.forEach((id, i) => {
      mapping.annotations[id] = requireId(step, `annotation[${i}]`, result.recorded.annotations[i]);
    });
    calls.push({ phase: "problem-refs", topicSourceId: call.topicSourceId, input: call.input, result });
  }

  // The expected-id boundary: every artifact sourceId has a live id and no two sourceIds share one.
  const boundary = assertIdBoundary(artifact, mapping);
  if (boundary.length > 0) {
    throw new SeedError(`the source->live mapping is not complete; refusing to report success:\n  ${boundary.join("\n  ")}`);
  }
  return { mapping, calls, warnings: [] };
}

/** Every artifact sourceId must have a live id; anything unmapped is returned as a warning (not hidden). */
export function assertMappingComplete(artifact, mapping) {
  const ids = listSourceIds(artifact);
  const warnings = [];
  for (const kind of ["topics", "axes", "activities", "annotations", "problems"]) {
    for (const sourceId of ids[kind]) {
      if (!mapping[kind][sourceId]) warnings.push(`${kind}: ${sourceId} has no live id`);
    }
  }
  return warnings;
}

/**
 * The expected-id boundary: no missing ids (see `assertMappingComplete`) and no two sourceIds sharing one
 * live id. A duplicate live id would mean two artifact facts address the same store row — a positional or
 * replayed-response artefact, not a valid seed.
 */
export function assertIdBoundary(artifact, mapping) {
  const problems = assertMappingComplete(artifact, mapping);
  const seen = new Map();
  for (const kind of ["topics", "axes", "activities", "annotations", "problems"]) {
    for (const [sourceId, liveId] of Object.entries(mapping[kind] ?? {})) {
      if (!liveId) continue;
      const key = `${kind}:${liveId}`;
      if (seen.has(key)) problems.push(`duplicate live ${kind} id ${liveId} for ${seen.get(key)} and ${sourceId}`);
      else seen.set(key, sourceId);
    }
  }
  return problems;
}

/** Persist the mapping as JSON (runtime evidence; written outside the repo by the fixture worker). */
export function writeMapping(path, mapping) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
  return path;
}
