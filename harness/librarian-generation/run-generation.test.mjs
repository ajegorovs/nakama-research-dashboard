#!/usr/bin/env bun
/**
 * End-to-end mock tests for the gated generation orchestration (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §9, §10;
 * reviewer disposition D-014).
 *
 * These exercise the **real** schedule + coordinator + lossless-capture path end to end with an
 * in-process mock `generate` seam — no model, no provider, no network. They prove the 34-call plan is
 * executed with the correct per-entry read/generation bounds, that every generation is captured with its
 * provenance, request messages and digests, that the backend-reported model identity is recorded and
 * fail-closed, that captures are written exclusively (never overwritten), that there are no retries, and
 * that a failed repeat is recorded and does not cancel the others. The final suite exports a durable pack
 * from a mock run and verifies its binding — labelled a mock, carrying no semantic result.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSchedule, executeSchedule } from "./orchestrate.mjs";
import { exportPack, PackIntegrityError } from "./export-pack.mjs";
import { ModelPayloadError, parseModelPayload } from "../../src/librarian/model-candidate.ts";

const HERE = import.meta.dir;
const REPO = join(HERE, "..", "..");
const MANIFEST_PATH = join(HERE, "run-manifest.json");
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const CORPUS = JSON.parse(
  readFileSync(join(REPO, "src", "librarian", "fixtures", "semantic-cases.json"), "utf8")
);

const tempDirs = [];
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { force: true, recursive: true });
});

/** A mock generator that returns a structurally valid payload for the observation it is handed. */
function mockProposalText(request) {
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

/** A matching structured generation (the backend reports the pinned requested id). */
function mockGenerate(request) {
  return {
    completionText: mockProposalText(request),
    modelIdentity: "match",
    modelReported: MANIFEST.identity.model,
  };
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
    const captureDir = freshDir("librarian-e2e-");
    let calls = 0;
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => {
        calls += 1;
        return mockGenerate(request);
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
    const captureDir = freshDir("librarian-e2e-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
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

  test("captures bind each generation to its provenance, request messages and digests", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-e2e-");
    await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
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
      expect(record.modelRequested).toBe(MANIFEST.identity.model);
      expect(record.modelReported).toBe(MANIFEST.identity.model);
      expect(record.modelIdentity).toBe("match");
      expect(typeof record.requestSystem).toBe("string");
      expect(typeof record.requestUser).toBe("string");
      expect(record.implementationRevision).toBe("test-revision");
      // The extracted completion round-trips from its captured bytes — no envelope is retained.
      const decoded = Buffer.from(record.completionBase64, "base64").toString("utf8");
      expect(JSON.parse(decoded).outcome).toBeDefined();
      expect(record).not.toHaveProperty("choices");
    }
  });

  test("a mismatching reported model is non-green and delivers no candidate", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS).filter((entry) => entry.caseId === "F-1").slice(0, 1);
    const captureDir = freshDir("librarian-e2e-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => ({
        completionText: mockProposalText(request),
        modelIdentity: "mismatch",
        modelReported: "some-other-model",
      }),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    expect(report.entries[0].green).toBe(false);
    expect(report.entries[0].status).toBe("model_mismatch");
    // The completion is still captured (evidence preserved) but no proposal is delivered.
    expect(report.captureCount).toBe(1);
    const record = JSON.parse(
      readFileSync(join(captureDir, readdirSync(captureDir).find((n) => n.startsWith("capture__"))), "utf8")
    );
    expect(record.modelReported).toBe("some-other-model");
  });

  test("an absent reported model is unknown and non-green by default", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS).filter((entry) => entry.caseId === "F-1").slice(0, 1);
    const captureDir = freshDir("librarian-e2e-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => ({
        completionText: mockProposalText(request),
        modelIdentity: "unknown",
        modelReported: "unknown",
      }),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    expect(report.entries[0].green).toBe(false);
    expect(report.entries[0].status).toBe("model_mismatch");
  });

  test("never overwrites an existing capture (exclusive write)", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-e2e-");
    await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    let threw = false;
    try {
      await executeSchedule({
        captureDir,
        corpus: CORPUS,
        generate: async (request) => mockGenerate(request),
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
    const captureDir = freshDir("librarian-e2e-");
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
        return mockGenerate(request);
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
    const captureDir = freshDir("librarian-e2e-");
    let calls = 0;
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => {
        calls += 1;
        return {
          completionText: calls === 1 ? "not json at all" : mockProposalText(request),
          modelIdentity: "match",
          modelReported: MANIFEST.identity.model,
        };
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

describe("evidence pack — durable export from a mock run (no semantic result)", () => {
  test("export is exclusive, binds the frozen manifest/artifacts/revision, and preserves exact bytes", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-e2e-capture-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "mock-revision",
      runId: "mock-run",
      schedule,
    });
    expect(report.green).toBe(true);
    const packDir = join(freshDir("librarian-e2e-pack-"), "mock-run");
    // Mirror the real runner: the run report is persisted beside the captures before export.
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const result = exportPack({
      captureDir,
      manifest: MANIFEST,
      manifestPath: MANIFEST_PATH,
      mock: true,
      now: "2026-10-05T00:00:00.000Z",
      packDir,
      repo: REPO,
      runId: "mock-run",
    });
    expect(result.written).toBe(true);
    expect(result.green).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.counts).toEqual({
      assessedFailures: 0,
      captured: 34,
      expected: 34,
      failed: 0,
      matchesPlan: true,
      parseFailures: 0,
      totalCalls: 34,
    });

    const packManifest = JSON.parse(readFileSync(join(packDir, "run-manifest.json"), "utf8"));
    expect(packManifest.mock).toBe(true);
    expect(packManifest.note).toContain("MOCK RUN");
    expect(packManifest.packSchema).toBe("librarian-semantic-eval-pack-v1");
    expect(packManifest.requestedModel).toBe(MANIFEST.identity.model);
    expect(packManifest.reportedModels).toEqual([MANIFEST.identity.model]);
    expect(packManifest.modelIdentityCounts.match).toBe(34);
    expect(packManifest.implementationRevision).toBe("mock-revision");
    expect(packManifest.frozenManifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(packManifest.frozenArtifacts.corpus.matchesFrozen).toBe(true);
    expect(packManifest.frozenArtifacts.rubric.matchesFrozen).toBe(true);
    expect(packManifest.frozenArtifacts.promptTemplate.matchesFrozen).toBe(true);
    expect(packManifest.decodingParameters.temperature).toBe(0);
    expect(packManifest.decodingParameters.top_p).toBe(1);
    expect(packManifest.decodingParameters.max_tokens).toBe(1000);
    expect(packManifest.seeds).toEqual(MANIFEST.seeds.semanticPredeclared);
    expect(packManifest.backendVersion).toBe("unknown");

    const calls = JSON.parse(readFileSync(join(packDir, "calls.json"), "utf8"));
    expect(calls).toHaveLength(34);
    for (const call of calls) {
      expect(call.modelRequested).toBe(MANIFEST.identity.model);
      expect(call.modelReported).toBe(MANIFEST.identity.model);
      expect(call.request.messages).toHaveLength(2);
      expect(call.request.messages[0].role).toBe("system");
      expect(call.request.messages[1].role).toBe("user");
      // The request bytes round-trip exactly and match the recorded digest.
      const bytes = Buffer.from(call.request.requestBase64, "base64").toString("utf8");
      expect(bytes).toBe(`${call.request.messages[0].content}\n${call.request.messages[1].content}`);
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(call.request.requestSha256);
      expect(call.request.requestSha256).toBe(call.promptDigest);
      // The completion bytes round-trip exactly.
      const decoded = Buffer.from(call.completionBase64, "base64").toString("utf8");
      expect(JSON.parse(decoded).outcome).toBeDefined();
      // No provider envelope, header or credential field is carried.
      expect(call).not.toHaveProperty("choices");
      expect(call).not.toHaveProperty("headers");
      expect(call).not.toHaveProperty("token");
    }

    // Exclusive: a second export to the same directory refuses.
    let threw = false;
    try {
      exportPack({ captureDir, manifest: MANIFEST, manifestPath: MANIFEST_PATH, packDir, repo: REPO, runId: "mock-run" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("a run missing expected calls is non-green and does not claim a complete count", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS).filter((entry) => entry.caseId === "F-1").slice(0, 1);
    const captureDir = freshDir("librarian-e2e-capture-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const packDir = join(freshDir("librarian-e2e-pack-"), "partial");
    const result = exportPack({ captureDir, manifest: MANIFEST, manifestPath: MANIFEST_PATH, packDir, repo: REPO, runId: "partial" });
    expect(result.complete).toBe(false);
    expect(result.green).toBe(false);
    expect(result.counts.matchesPlan).toBe(false);
    expect(result.counts.captured).toBe(1);
    expect(result.counts.expected).toBe(34);
    const packManifest = JSON.parse(readFileSync(join(packDir, "run-manifest.json"), "utf8"));
    expect(packManifest.green).toBe(false);
    expect(packManifest.complete).toBe(false);
    expect(packManifest.counts.matchesPlan).toBe(false);
  });
});

describe("evidence pack — strict integrity prevalidation (no partial output)", () => {
  /** Write a full, valid 34-call mock capture directory; optionally mutate it in place. */
  async function buildCaptureDir(mutate) {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-integrity-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "test-revision",
      runId: "integrity-run",
      schedule,
    });
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    if (mutate) mutate(captureDir);
    return captureDir;
  }

  const captureNames = (dir) => readdirSync(dir).filter((name) => name.startsWith("capture__"));
  const readCapture = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const writeCapture = (dir, name, record) =>
    writeFileSync(join(dir, name), `${JSON.stringify(record, null, 2)}\n`);

  function attemptExport(captureDir, overrides = {}) {
    const packDir = join(freshDir("librarian-integrity-pack-"), "pack");
    let error = null;
    let result = null;
    try {
      result = exportPack({
        captureDir,
        corpus: CORPUS,
        manifest: MANIFEST,
        manifestPath: MANIFEST_PATH,
        mock: true,
        packDir,
        repo: REPO,
        runId: "integrity-run",
        ...overrides,
      });
    } catch (caught) {
      error = caught;
    }
    return { error, result, packDir };
  }

  test("a valid mock run passes integrity and its own green agrees with the report", async () => {
    const captureDir = await buildCaptureDir();
    const { error, result } = attemptExport(captureDir);
    expect(error).toBeNull();
    expect(result.written).toBe(true);
    expect(result.green).toBe(true);
    const packManifest = JSON.parse(readFileSync(join(result.path, "run-manifest.json"), "utf8"));
    expect(packManifest.integrity.ok).toBe(true);
    expect(packManifest.integrity.reportGreenAgrees).toBe(true);
    expect(packManifest.integrity.structuralGreen).toBe(true);
  });

  test("a tampered completion sha256 refuses with no pack output", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      const name = captureNames(dir)[0];
      const record = readCapture(dir, name);
      record.completionSha256 = "0".repeat(64);
      writeCapture(dir, name, record);
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("completion_sha256_mismatch");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a tampered completion length refuses (length != decoded bytes)", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      const name = captureNames(dir)[0];
      const record = readCapture(dir, name);
      record.completionBytes = record.completionBytes + 1;
      writeCapture(dir, name, record);
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("completion_length_mismatch");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a non-canonical base64 completion refuses (Buffer.from is not trusted)", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      const name = captureNames(dir)[0];
      const record = readCapture(dir, name);
      record.completionBase64 = `${record.completionBase64}!!`;
      writeCapture(dir, name, record);
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("completion_base64_not_canonical");
    expect(existsSync(packDir)).toBe(false);
  });

  test("all 34 captures with mismatched request system content refuse", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      for (const name of captureNames(dir)) {
        const record = readCapture(dir, name);
        record.requestSystem = "TAMPERED SYSTEM";
        writeCapture(dir, name, record);
      }
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toMatch(/^(request_prompt_digest_mismatch|request_system_mismatch|prompt_digest_mismatch)$/);
    expect(error.failures.length).toBeGreaterThanOrEqual(34);
    expect(existsSync(packDir)).toBe(false);
  });

  test("a mismatched prompt digest refuses", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      const name = captureNames(dir)[0];
      const record = readCapture(dir, name);
      record.promptDigest = "f".repeat(64);
      writeCapture(dir, name, record);
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("request_prompt_digest_mismatch");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a duplicated call refuses (schedule invariant)", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      const name = captureNames(dir)[0];
      const record = readCapture(dir, name);
      // A distinct filename carrying the same (caseId, step, repeat, seed): a duplicate call.
      writeCapture(dir, "capture__F-1__A__r0__s101__copy.json", record);
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("call_key_duplicate");
    expect(existsSync(packDir)).toBe(false);
  });

  test("an unexpected call (not on the frozen schedule) refuses", async () => {
    const captureDir = await buildCaptureDir((dir) => {
      const name = captureNames(dir)[0];
      const record = readCapture(dir, name);
      record.caseId = "F-99";
      writeCapture(dir, name, record);
    });
    const { error, packDir } = attemptExport(captureDir);
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("call_key_unexpected");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a missing frozen artifact refuses (fail-closed, no green, no output)", async () => {
    const captureDir = await buildCaptureDir();
    // A doctored manifest is written to scratch and passed as the on-disk manifest path: the exporter
    // always reads the manifest from disk, so the mutation must be on disk to be exercised.
    const scratch = join(freshDir("librarian-manifest-"), "run-manifest.json");
    const brokenManifest = JSON.parse(JSON.stringify(MANIFEST));
    brokenManifest.artifacts.rubric.path = "docs/librarian-reconciliation/does-not-exist.md";
    writeFileSync(scratch, `${JSON.stringify(brokenManifest, null, 2)}\n`);
    const { error, packDir } = attemptExport(captureDir, { manifest: brokenManifest, manifestPath: scratch });
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("frozen_artifact_missing");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a frozen artifact whose digest no longer matches refuses", async () => {
    const captureDir = await buildCaptureDir();
    const scratch = join(freshDir("librarian-manifest-"), "run-manifest.json");
    const brokenManifest = JSON.parse(JSON.stringify(MANIFEST));
    brokenManifest.artifacts.rubric.digest = "0".repeat(64);
    writeFileSync(scratch, `${JSON.stringify(brokenManifest, null, 2)}\n`);
    const { error } = attemptExport(captureDir, { manifest: brokenManifest, manifestPath: scratch });
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("frozen_artifact_digest_mismatch");
  });

  test("a caller-supplied manifest that differs from the on-disk manifest refuses", async () => {
    const captureDir = await buildCaptureDir();
    // The manifest argument is manipulated while the on-disk frozen manifest is untouched: refused.
    const brokenManifest = JSON.parse(JSON.stringify(MANIFEST));
    brokenManifest.callPlan.hardMaximumCalls = 999;
    const { error, packDir } = attemptExport(captureDir, { manifest: brokenManifest });
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("manifest_argument_mismatch");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a fabricated green report does not upgrade an incomplete run to green", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS).filter((entry) => entry.caseId === "F-1").slice(0, 1);
    const captureDir = freshDir("librarian-integrity-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    // The report lies: it claims green though only 1 of 34 calls was captured.
    report.green = true;
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const packDir = join(freshDir("librarian-integrity-pack-"), "pack");
    const result = exportPack({
      captureDir,
      corpus: CORPUS,
      manifest: MANIFEST,
      manifestPath: MANIFEST_PATH,
      packDir,
      repo: REPO,
      runId: "liar",
    });
    expect(result.green).toBe(false);
    expect(result.complete).toBe(false);
    const packManifest = JSON.parse(readFileSync(join(packDir, "run-manifest.json"), "utf8"));
    expect(packManifest.integrity.reportGreen).toBe(true);
    expect(packManifest.integrity.structuralGreen).toBe(false);
    expect(packManifest.integrity.reportGreenAgrees).toBe(false);
  });
});

describe("evidence pack — rederived completion parse + contract (no trusted record outcome)", () => {
  /** Overwrite a record's completion with `text` and recompute its base64/length/sha256 so the tamper is
   * byte-exact and self-consistent — only the *recorded* `parsed`/`error`/`assessmentError` are false. */
  function forgeCompletion(record, text) {
    const bytes = Buffer.from(text, "utf8");
    record.completionBase64 = bytes.toString("base64");
    record.completionBytes = bytes.length;
    record.completionSha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    return record;
  }

  /** Write a full, valid 34-call mock capture directory, tamper one completion, and attempt an export. */
  async function tamperedExport(text, extra = {}) {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-rederive-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "test-revision",
      runId: "rederive-run",
      schedule,
    });
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const name = readdirSync(captureDir).filter((n) => n.startsWith("capture__"))[0];
    const path = join(captureDir, name);
    const record = JSON.parse(readFileSync(path, "utf8"));
    forgeCompletion(record, text);
    record.parsed = true; // fabricated clean parse
    record.error = null;
    record.assessmentError = null;
    Object.assign(record, extra);
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);

    const packDir = join(freshDir("librarian-rederive-pack-"), "pack");
    let error = null;
    let result = null;
    try {
      result = exportPack({
        captureDir,
        corpus: CORPUS,
        manifest: MANIFEST,
        manifestPath: MANIFEST_PATH,
        mock: true,
        packDir,
        repo: REPO,
        runId: "rederive-run",
      });
    } catch (caught) {
      error = caught;
    }
    return { captureDir, error, packDir, result };
  }

  // Both standalone probes (the critical one: a valid 34-call mock, report green, one completion replaced
  // by a self-consistent forged record with `parsed:true`) plus the other structural forgeries.
  const forgedVariants = [
    {
      label: "non-JSON completion",
      text: "this is not json at all",
      reason: /^completion_(parsed_mismatch|error_mismatch)$/,
    },
    {
      label: "invalid JSON syntax",
      text: '{"outcome": "proposal", ',
      reason: /^completion_(parsed_mismatch|error_mismatch)$/,
    },
    {
      label: "model-authored snapshot_unstable with forbidden fields",
      text: JSON.stringify({ outcome: "snapshot_unstable", authority: "trusted", basis: "forged" }),
      reason: /^completion_(parsed_mismatch|error_mismatch)$/,
    },
    {
      label: "forbidden authority/reasoning_strength fields",
      text: JSON.stringify({
        outcome: "proposal",
        claimStrength: "inferred",
        text: "forged",
        evidence_refs: [{ axisId: "x", field: "state", variant: "axis_field" }],
        authority: "trusted",
      }),
      reason: /^completion_(parsed_mismatch|error_mismatch)$/,
    },
    {
      label: "unknown citation (parses, contract refuses)",
      text: JSON.stringify({
        outcome: "proposal",
        claimStrength: "inferred",
        text: "forged",
        conflicts: [],
        evidence_refs: [{ variant: "activity", id: "no-such-activity" }],
      }),
      reason: /^completion_assessment_(mismatch|unreproducible)$/,
    },
    {
      label: "conflict with an unresolvable reference",
      text: JSON.stringify({
        outcome: "abstained",
        evidence_refs: [],
        conflicts: [{ reason: "human_steering_conflict", refs: [{ variant: "annotation", id: "no-such-note" }] }],
      }),
      reason: /^completion_assessment_(mismatch|unreproducible)$/,
    },
  ];

  for (const variant of forgedVariants) {
    test(`a self-consistent forged \`parsed:true\` on a ${variant.label} refuses with no output`, async () => {
      const { error, packDir } = await tamperedExport(variant.text);
      expect(error, variant.label).toBeInstanceOf(PackIntegrityError);
      expect(error.reason, variant.label).toMatch(variant.reason);
      expect(existsSync(packDir), variant.label).toBe(false);
    });
  }

  test("a forged `match` verdict over a differing reported id refuses", async () => {
    const { error, packDir } = await tamperedExport(
      JSON.stringify({
        outcome: "proposal",
        claimStrength: "inferred",
        text: "forged",
        conflicts: [],
        evidence_refs: [{ axisId: "x", field: "state", variant: "axis_field" }],
      }),
      { modelReported: "some-other-model", modelIdentity: "match" }
    );
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("model_identity_fabricated_match");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a completion whose bytes are not valid UTF-8 refuses", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-rederive-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      schedule,
    });
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const name = readdirSync(captureDir).filter((n) => n.startsWith("capture__"))[0];
    const path = join(captureDir, name);
    const record = JSON.parse(readFileSync(path, "utf8"));
    const bytes = Buffer.from([0xff, 0xfe, 0xfd]);
    record.completionBase64 = bytes.toString("base64");
    record.completionBytes = bytes.length;
    record.completionSha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    record.parsed = true;
    record.error = null;
    record.assessmentError = null;
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
    const packDir = join(freshDir("librarian-rederive-pack-"), "pack");
    let error = null;
    try {
      exportPack({ captureDir, corpus: CORPUS, manifest: MANIFEST, manifestPath: MANIFEST_PATH, packDir, repo: REPO, runId: "rederive-run" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PackIntegrityError);
    expect(error.reason).toBe("completion_not_utf8");
    expect(existsSync(packDir)).toBe(false);
  });

  test("a self-consistent malformed completion carrying its TRUE parse error is written non-green, not refused", async () => {
    // A legitimate failed capture: the record reproduces the parser's own failure exactly. It must be
    // exported (evidence preserved) and labelled non-green — never refused and never a fabricated success.
    let trueError = null;
    try {
      parseModelPayload("not json at all");
    } catch (caught) {
      if (caught instanceof ModelPayloadError) trueError = { message: caught.message, reason: caught.reason };
    }
    expect(trueError).not.toBeNull();

    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-rederive-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => mockGenerate(request),
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "test-revision",
      runId: "failed-run",
      schedule,
    });
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const name = readdirSync(captureDir).filter((n) => n.startsWith("capture__"))[0];
    const path = join(captureDir, name);
    const record = JSON.parse(readFileSync(path, "utf8"));
    forgeCompletion(record, "not json at all");
    record.parsed = false;
    record.error = trueError;
    record.assessmentError = null;
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);

    const packDir = join(freshDir("librarian-rederive-pack-"), "pack");
    const result = exportPack({
      captureDir,
      corpus: CORPUS,
      manifest: MANIFEST,
      manifestPath: MANIFEST_PATH,
      packDir,
      repo: REPO,
      runId: "failed-run",
    });
    expect(result.written).toBe(true);
    expect(result.green).toBe(false);
  });

  test("a legitimate typed generation failure (no completion) is written non-green, not refused", async () => {
    const schedule = buildSchedule(MANIFEST, CORPUS);
    const captureDir = freshDir("librarian-rederive-");
    const report = await executeSchedule({
      captureDir,
      corpus: CORPUS,
      generate: async (request) => {
        if (request.caseId === "F-1" && request.seed === 101) throw new Error("injected generation failure");
        return mockGenerate(request);
      },
      manifest: MANIFEST,
      model: MANIFEST.identity.model,
      revision: "test-revision",
      runId: "failure-run",
      schedule,
    });
    writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const packDir = join(freshDir("librarian-rederive-pack-"), "pack");
    const result = exportPack({
      captureDir,
      corpus: CORPUS,
      manifest: MANIFEST,
      manifestPath: MANIFEST_PATH,
      packDir,
      repo: REPO,
      runId: "failure-run",
    });
    expect(result.written).toBe(true);
    expect(result.green).toBe(false);
    expect(result.counts.failed).toBe(1);
    const packManifest = JSON.parse(readFileSync(join(packDir, "run-manifest.json"), "utf8"));
    expect(packManifest.integrity.ok).toBe(true);
    expect(packManifest.green).toBe(false);
  });
});
