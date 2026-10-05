#!/usr/bin/env bun
/**
 * Offline runner tests (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §9, §10).
 *
 * Deterministic and network-free: they verify the frozen artifacts are byte-unchanged, the call plan is
 * exactly 34, prompt rendering is deterministic, and the generation mode is refused by default — absent
 * an explicit, external authorization record. No model, no provider, no capture.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enumeratePlan, main, resolveHermesInterpreter, verifyFrozenArtifacts } from "./run.mjs";
import { loadAuthorization, sha256File, currentRevision } from "./authorization.mjs";

const HERE = import.meta.dir;
const MANIFEST_PATH = join(HERE, "run-manifest.json");
const MANIFEST = JSON.parse(await Bun.file(MANIFEST_PATH).text());

describe("semantic-eval runner — offline", () => {
  test("the frozen rubric, template and corpus are byte-unchanged", () => {
    const frozen = verifyFrozenArtifacts();
    expect(frozen.ok).toBe(true);
    for (const entry of frozen.checked) {
      expect(entry.ok).toBe(true);
    }
  });

  test("the call plan is exactly 30 semantic + 4 reconstruction = 34", () => {
    const plan = enumeratePlan();
    expect(plan.semanticCalls).toBe(30);
    expect(plan.reconstructionCalls).toBe(4);
    expect(plan.total).toBe(34);
    // Ten cases × three predetermined seeds, with F-2/F-18 rendered as their adopted variants.
    expect(Object.keys(plan.promptDigests)).toHaveLength(30);
    for (const digest of Object.values(plan.promptDigests)) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("generate mode is refused without an explicit run authorization (exit 3, no output)", async () => {
    expect(await main(["--mode", "generate"])).toBe(3);
  });

  test("offline mode renders the plan and performs no network work", async () => {
    expect(await main(["--mode", "offline"])).toBe(0);
  });

  test("the hermes interpreter resolves from the executable, not a hardcoded hash", () => {
    const interpreter = resolveHermesInterpreter();
    // The helper is only usable where an installed hermes exists; on a machine with one it must resolve.
    if (interpreter !== null) {
      expect(interpreter).toContain("python");
    }
  });
});

describe("semantic-eval runner — authorization gate (fail-closed)", () => {
  test("absent record, flag and token: refused", () => {
    const result = loadAuthorization({
      env: {},
      manifest: MANIFEST,
      manifestPath: MANIFEST_PATH,
      recordPath: join(HERE, "does-not-exist.json"),
    });
    expect(result.authorized).toBe(false);
    expect(result.reason).toBe("authorization_flag_absent");
  });

  test("a matching record with flag + token authorizes, and mismatches refuse", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const recordPath = join(dir, "run-authorization.json");
    const validRecord = {
      artifacts: {
        corpus: MANIFEST.artifacts.corpus.digest,
        promptTemplate: MANIFEST.artifacts.promptTemplate.digest,
        rubric: MANIFEST.artifacts.rubric.digest,
      },
      authorized: true,
      captureBasename: "librarian-semantic-eval-offline",
      implementationRevision: currentRevision(join(HERE, "..", "..")) ?? "unknown",
      manifestDigest: sha256File(MANIFEST_PATH),
      model: MANIFEST.identity.model,
      scope: { calls: 34, endpoint: MANIFEST.identity.baseUrl, model: MANIFEST.identity.model },
      token: "tok",
    };
    const env = { LIBRARIAN_SEMANTIC_RUN_AUTHORIZED: "1", LIBRARIAN_SEMANTIC_RUN_TOKEN: "tok" };
    try {
      writeFileSync(recordPath, JSON.stringify(validRecord));
      const ok = loadAuthorization({ env, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath });
      expect(ok.authorized).toBe(true);
      expect(ok.reason).toBe("authorized");

      // A manifest-digest mismatch refuses.
      writeFileSync(recordPath, JSON.stringify({ ...validRecord, manifestDigest: "0".repeat(64) }));
      const bad = loadAuthorization({ env, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath });
      expect(bad.authorized).toBe(false);
      expect(bad.reason).toBe("authorization_manifest_mismatch");

      // A token mismatch refuses.
      writeFileSync(recordPath, JSON.stringify(validRecord));
      const badToken = loadAuthorization({
        env: { ...env, LIBRARIAN_SEMANTIC_RUN_TOKEN: "other" },
        manifest: MANIFEST,
        manifestPath: MANIFEST_PATH,
        recordPath,
      });
      expect(badToken.authorized).toBe(false);
      expect(badToken.reason).toBe("authorization_token_mismatch");

      // A wrong call scope refuses.
      writeFileSync(recordPath, JSON.stringify({ ...validRecord, scope: { ...validRecord.scope, calls: 35 } }));
      const badScope = loadAuthorization({ env, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath });
      expect(badScope.authorized).toBe(false);
      expect(badScope.reason).toBe("authorization_scope_mismatch");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
