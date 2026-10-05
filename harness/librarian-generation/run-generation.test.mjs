#!/usr/bin/env bun
/**
 * End-to-end mock tests for the gated generation orchestration (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §9, §10).
 *
 * These exercise the **real** schedule + coordinator + lossless-capture path end to end with an
 * in-process mock `generate` seam — no model, no provider, no network. They prove the 34-call plan is
 * executed with the correct per-entry read/generation bounds, that every generation is captured with its
 * provenance and digests, that captures are written exclusively (never overwritten), that there are no
 * retries, and that a failed repeat is recorded and does not cancel the others.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSchedule, executeSchedule } from "./orchestrate.mjs";

const HERE = import.meta.dir;
const REPO = join(HERE, "..", "..");
const MANIFEST = JSON.parse(readFileSync(join(HERE, "run-manifest.json"), "utf8"));
const CORPUS = JSON.parse(
  readFileSync(join(REPO, "src", "librarian", "fixtures", "semantic-cases.json"), "utf8")
);

const tempDirs = [];
function freshCaptureDir() {
  const dir = mkdtempSync(join(tmpdir(), "librarian-e2e-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { force: true, recursive: true });
});

/** A mock generator that returns a structurally valid payload for the observation it is handed. */
function mockProposal(request) {
  const axisId = request.observation.subject.axisId;
  if (request.observation.axis.evidence.length === 0) {
    return JSON.stringify({ outcome: "insufficient_evidence" });
  }
  return JSON.stringify({
    claimStrength: "inferred",
    conflicts: [],
    evidence_refs: [{ axisId, field: "state", variant: "axis_field" }],
    outcome: "proposal",
    text: `Mock grounded synopsis for ${request.caseId}.`,
  });
}

describe("generation orchestration — 34-call end-to-end (mock, no inference)", () => {
  test("builds the exact schedule: 10 semantic cases × 3 repeats + F-9 + F-10", () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    // 30 semantic repetitions + 2 reconstruction entries = 32 entries; 34 inference calls.
    expect(schedule).toHaveLength(32);
    expect(schedule.filter((entry) => entry.kind === "semantic")).toHaveLength(30);
    expect(schedule.filter((entry) => entry.kind === "reconstruction").map((entry) => entry.caseId)).toEqual([
      "F-9",
      "F-10",
    ]);
    // The variant slots are substituted across all three repeats.
    const f2 = schedule.filter((entry) => entry.caseId === "F-2");
    expect(f2).toHaveLength(3);
    expect(f2.map((entry) => entry.seed)).toEqual(MANIFEST.seeds.semanticPredeclared);
  });

  test("executes exactly 34 calls, captures all of them, and is green", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshCaptureDir();
    let calls = 0;
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => {
        calls += 1;
        return mockProposal(request);
      },
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "test-revision",
      runId: "test-run",
      schedule,
    });
    expect(calls).toBe(34);
    expect(report.totalCalls).toBe(34);
    expect(report.hardMaximumCalls).toBe(34);
    expect(report.countsMatch).toBe(true);
    expect(report.green).toBe(true);
    expect(report.captureCount).toBe(34);
    expect(report.entries).toHaveLength(32);
    for (const entry of report.entries) {
      expect(entry.green).toBe(true);
      expect(entry.status).toBe("proposal");
    }
    const files = readdirSync(captureDir).filter((name) => name.startsWith("capture__"));
    expect(files).toHaveLength(34);
  });

  test("enforces the per-entry read/generation bounds (semantic A=B: 2 reads, 1 gen; F-9/F-10: 3 reads, 2 gens)", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshCaptureDir();
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockProposal(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    for (const entry of report.entries) {
      if (entry.kind === "semantic") {
        expect(entry.reads).toBe(2);
        expect(entry.calls).toBe(1);
        expect(entry.steps).toEqual([0, 1]);
      } else {
        expect(entry.reads).toBe(3);
        expect(entry.calls).toBe(2);
        expect(entry.steps).toEqual([0, 1, 2]);
      }
    }
  });

  test("captures bind each generation to its provenance, observation and prompt digests", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshCaptureDir();
    await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockProposal(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "test-revision",
      runId: "test-run",
      schedule,
    });
    const files = readdirSync(captureDir).filter((name) => name.startsWith("capture__"));
    for (const name of files) {
      const record = JSON.parse(readFileSync(join(captureDir, name), "utf8"));
      expect(record.provenance).toMatch(/^librarian-semantic-eval\//);
      expect(record.observationDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(record.promptDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(record.completionSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.parsed).toBe(true);
      // Only the reconstruction exercise's A-generation is discarded; semantic A = B is delivered.
      const isReconstructionA = (record.caseId === "F-9" || record.caseId === "F-10") && record.step === "A";
      expect(record.discarded).toBe(isReconstructionA);
      expect(record.model).toBe(MANIFEST.identity.model);
      expect(record.implementationRevision).toBe("test-revision");
      // The extracted completion round-trips from its captured bytes — no envelope is retained.
      const decoded = Buffer.from(record.completionBase64, "base64").toString("utf8");
      expect(JSON.parse(decoded).outcome).toBeDefined();
      expect(record).not.toHaveProperty("choices");
    }
  });

  test("never overwrites an existing capture (exclusive write)", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshCaptureDir();
    await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockProposal(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    let threw = false;
    try {
      await executeSchedule({
        captureDir,
        corpus: CORPUS,
        generate: async (request) => mockProposal(request),
        manifest: MANIFEST,
        model: MANIFEST.identity.model,
        schedule,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("generation orchestration — failure continue, no retry", () => {
  test("a failed repeat is recorded, is not retried, and does not cancel the others", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshCaptureDir();
    const callsByKey = new Map();
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => {
        const key = `${request.caseId}/s${request.seed}/${request.step}`;
        callsByKey.set(key, (callsByKey.get(key) ?? 0) + 1);
        // Fail exactly one semantic repeat's single call.
        if (request.caseId === "F-1" && request.seed === 101) {
          throw new Error("injected generation failure");
        }
        return mockProposal(request);
      },
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    // No retry: the failing call was attempted exactly once.
    expect(callsByKey.get("F-1/s101/A")).toBe(1);
    // Failure continue: every schedule entry still ran and the other repeats are green.
    expect(report.entries).toHaveLength(32);
    const failed = report.entries.filter((entry) => !entry.green);
    expect(failed).toHaveLength(1);
    expect(failed[0].caseId).toBe("F-1");
    expect(failed[0].status).toBe("generation_error");
    expect(failed[0].failures).toHaveLength(1);
    // The failed call left a captured error artifact, not just a report entry.
    const errorFiles = readdirSync(captureDir).filter((name) => name.startsWith("error__"));
    expect(errorFiles).toHaveLength(1);
    expect(report.entries.filter((entry) => entry.green)).toHaveLength(31);
    // The recorded failure controls: the run is not green and the count does not match.
    expect(report.green).toBe(false);
    expect(report.countsMatch).toBe(false);
  });

  test("a malformed discarded A-generation on the reconstruction path controls (non-green)", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS).filter((entry) => entry.caseId === "F-9");
    const captureDir = freshCaptureDir();
    let calls = 0;
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => {
        calls += 1;
        return calls === 1 ? "not json at all" : mockProposal(request);
      },
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    expect(calls).toBe(1); // no B replacement generation
    expect(report.entries[0].green).toBe(false);
    expect(report.entries[0].status).toBe("malformed");
    expect(report.captureCount).toBe(1);
  });
});
