/**
 * Bounded generation orchestration for the Librarian semantic evaluation
 * (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §5, §9, §10).
 *
 * This module is the **executable schedule** behind `run.mjs --mode generate`. It wires the
 * model-driven construct/discard/recompute coordinator to a reader over the **frozen synthetic**
 * projections (never a live database) and to a `generate` seam. It is exercised end-to-end with an
 * in-process mock generator only; the real generate seam (the Python transport helper) is reached
 * solely through the owner-authorization gate and is never run in this envelope.
 *
 * Guarantees:
 *   - the schedule is exactly the manifest's 30 semantic repetitions + 4 reconstruction calls = 34;
 *   - **no retry** anywhere and **failure-continue**: a failed repeat is recorded and the remaining
 *     repeats still run;
 *   - each generation is captured losslessly (base64 + sha256, provenance, observation/prompt digests)
 *     and written **exclusively** (never overwriting an existing capture);
 *   - the run is green only if every call completed and every result is green.
 *
 * It ships nothing: it is not imported by `src/actions.ts` or `src/ui.tsx` and is not part of
 * `bun run build`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildObservation } from "../../src/librarian/assembler.ts";
import { runModelCoordinator } from "../../src/librarian/model-coordinator.ts";
import { renderPrompt } from "../../src/librarian/prompt.ts";

const DRIFT = {
  drift1: "2026-09-29T00:00:00.000Z",
  drift2: "2026-09-30T00:00:00.000Z",
};

/**
 * The reconstruction exercise (F-9/F-10) reuses the clean subject `FIX-TOPIC-ALPHA` / `FIX-AXIS-CLEAN`
 * — the same subject the accepted structural fixture uses for those snapshot scripts — so it is driven by
 * the frozen `F-1` projection.
 */
export const RECONSTRUCTION_PROJECTION_CASE = "F-1";

/** The frozen synthetic projection one scheduled entry shows the model (variant slots substituted). */
export function projectionFor(caseId, plan, corpus) {
  for (const entry of plan.reconstructionExercise ?? []) {
    if (entry.id === caseId) {
      const base = corpus.semanticCases.find((c) => c.id === RECONSTRUCTION_PROJECTION_CASE);
      if (!base) throw new Error(`no base projection for reconstruction case ${caseId}`);
      return base.projection;
    }
  }
  if (caseId === plan.conflictVariant?.replacesCaseSlot) return corpus.conflictVariant.projection;
  if (caseId === plan.injectionVariant?.replacesCaseSlot) return corpus.injectionVariant.projection;
  const found = corpus.semanticCases.find((entry) => entry.id === caseId);
  if (!found) throw new Error(`schedule references an unknown semantic case: ${caseId}`);
  return found.projection;
}

function rawOf(projection) {
  return {
    activity: projection.topicActivity,
    axes: [projection.axis],
    generatedAt: "2026-09-01T00:00:00.000Z",
    notes: projection.topicNotes,
    ok: true,
    topic: projection.topic,
  };
}

/** A labelled synthetic content change to the returned projection, so the observation digest moves. */
function drift(raw, mode) {
  const stamp = DRIFT[mode];
  if (!stamp) return raw;
  const clone = JSON.parse(JSON.stringify(raw));
  clone.topic.updatedAt = stamp;
  for (const axis of clone.axes) axis.updatedAt = stamp;
  return clone;
}

/**
 * Build the exact call plan from the frozen manifest. Returns the ordered schedule: ten semantic cases
 * × three predeclared repeats (A = B, one generation each) followed by the F-9/F-10 reconstruction
 * exercise (two generations each). The call total is asserted against the manifest's hard maximum.
 */
export function buildSchedule(manifest, corpus) {
  const plan = manifest.callPlan;
  const entries = [];
  let index = 0;
  for (const caseId of plan.semanticCases) {
    if (projectionFor(caseId, plan, corpus) === undefined) throw new Error(`no projection for ${caseId}`);
    for (const seed of manifest.seeds.semanticPredeclared) {
      entries.push({
        caseId,
        index: index++,
        kind: "semantic",
        repeat: entries.filter((e) => e.caseId === caseId).length,
        script: ["base", "base"],
        seed,
      });
    }
  }
  plan.reconstructionExercise.forEach((entry, indexInExercise) => {
    entries.push({
      caseId: entry.id,
      index: index++,
      kind: "reconstruction",
      repeat: 0,
      script: entry.snapshotScript,
      seed: manifest.seeds.coordinatorControlSeeds[indexInExercise] ?? null,
    });
  });
  const expectedEntries = plan.semanticCases.length * plan.repeatsPerSemanticCase + plan.reconstructionExercise.length;
  if (entries.length !== expectedEntries) {
    throw new Error(`schedule entry count ${entries.length} does not match the manifest plan ${expectedEntries}`);
  }
  // Each semantic slot is A = B (one generation); each reconstruction slot runs the two-generation
  // protocol. The potential total must not exceed the manifest's hard maximum.
  const potentialCalls =
    plan.semanticCases.length * plan.repeatsPerSemanticCase + plan.reconstructionCalls;
  if (potentialCalls > plan.hardMaximumCalls) {
    throw new Error(`schedule exposes ${potentialCalls} potential calls > hard maximum ${plan.hardMaximumCalls}`);
  }
  return entries;
}

function createHarness(entry, projection) {
  const observedSteps = [];
  const raw = rawOf(projection);
  return {
    observedSteps,
    observe: (value) =>
      buildObservation(value, { limits: projection.limits, search: projection.search, subject: projection.subject }),
    read: async (step) => {
      observedSteps.push(step);
      return drift(raw, entry.script[step] ?? "base");
    },
  };
}

/** Write one capture to disk exclusively — an existing file is never overwritten. */
function writeCapture(captureDir, name, payload) {
  const path = join(captureDir, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return path;
}

/**
 * Execute the schedule against an injected `generate` seam. Pure with respect to the outside world
 * except for the capture writes: the reader reads the frozen projections and nothing else. No retry;
 * a per-entry failure is recorded and the run continues to the next entry.
 */
export async function executeSchedule({
  schedule,
  corpus,
  manifest,
  model,
  generate,
  captureDir,
  revision = "unknown",
  runId,
} = {}) {
  const plan = manifest.callPlan;
  const entries = [];
  let totalCalls = 0;
  let expectedCalls = 0;

  for (const entry of schedule) {
    const projection = projectionFor(entry.caseId, plan, corpus);
    const harness = createHarness(entry, projection);
    let calls = 0;
    let result;
    let thrown = null;
    const failureCaptures = [];
    const generateSeam = async (request) => {
      calls += 1;
      try {
        return await generate(request);
      } catch (error) {
        // A failed call has no completion, but its failure must still be captured — never lost. The
        // record is written exclusively (same no-overwrite rule as a completion capture).
        const message = error instanceof Error ? error.message : String(error);
        const name =
          `error__${entry.caseId}__${request.step}__r${entry.repeat}` +
          `__s${entry.seed ?? "unavailable"}.json`;
        const path = writeCapture(captureDir, name, {
          caseId: entry.caseId,
          error: { message, reason: "generation_failure" },
          implementationRevision: revision,
          model,
          observationDigest: request.observation.digest,
          promptDigest: request.prompt.requestDigest,
          provenance: request.provenance,
          repeat: entry.repeat,
          runId,
          seed: entry.seed,
          step: request.step,
        });
        failureCaptures.push({ path, step: request.step });
        throw error;
      }
    };
    try {
      result = await runModelCoordinator({
        caseId: entry.caseId,
        generate: generateSeam,
        model,
        observe: harness.observe,
        read: harness.read,
        repeat: entry.repeat,
        seed: entry.seed,
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }

    totalCalls += calls;
    expectedCalls += result ? result.generations.length : 0;
    if (calls > plan.hardMaximumCalls) {
      throw new Error(`entry ${entry.caseId} exceeded the hard maximum call budget`);
    }

    const captures = [];
    const generations = result?.generations ?? [];
    for (const generation of generations) {
      const name =
        `capture__${entry.caseId}__${generation.step}__r${entry.repeat}` +
        `__s${entry.seed ?? "unavailable"}.json`;
      const record = {
        ...generation,
        implementationRevision: revision,
        runId,
      };
      const path = writeCapture(captureDir, name, record);
      captures.push({ path, sha256: generation.completionSha256, step: generation.step });
    }

    entries.push({
      calls,
      caseId: entry.caseId,
      captures,
      expectedOutcome: entry.script,
      failures: failureCaptures,
      green: result ? result.green : false,
      kind: entry.kind,
      outcome: result?.outcome ?? null,
      reads: result?.reads ?? 0,
      repeat: entry.repeat,
      seed: entry.seed,
      status: result?.status ?? "thrown",
      steps: harness.observedSteps,
      thrown,
    });
  }

  const allGreen = entries.every((entry) => entry.green && entry.thrown === null);
  const countsMatch = totalCalls === plan.hardMaximumCalls && totalCalls === expectedCalls;
  return {
    captureBasename: captureDir,
    captureCount: entries.reduce((sum, entry) => sum + entry.captures.length, 0),
    countsMatch,
    entries,
    green: allGreen && countsMatch,
    hardMaximumCalls: plan.hardMaximumCalls,
    model,
    revision,
    runId,
    scheduleEntries: schedule.length,
    totalCalls,
  };
}

export { renderPrompt };
