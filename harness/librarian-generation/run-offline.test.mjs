#!/usr/bin/env bun
/**
 * Offline runner tests (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §9, §10; reviewer disposition D-014).
 *
 * Deterministic and network-free: they verify the frozen artifacts are byte-unchanged, the call plan is
 * exactly 34, prompt rendering is deterministic, and the generation mode is refused by default — absent
 * an explicit, external authorization record. The authorization gate is exercised for the mandatory
 * capability dispositions, the mandatory third-party egress approval, and the fail-closed revision
 * resolution. No model, no provider, no capture.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enumeratePlan, main, resolveHermesInterpreter, verifyFrozenArtifacts } from "./run.mjs";
import { loadAuthorization, sha256File, currentRevision } from "./authorization.mjs";

const HERE = import.meta.dir;
const MANIFEST_PATH = join(HERE, "run-manifest.json");
const MANIFEST = JSON.parse(await Bun.file(MANIFEST_PATH).text());
const REPO = join(HERE, "..", "..");

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

function baseRecord(overrides = {}) {
  return {
    artifacts: {
      corpus: MANIFEST.artifacts.corpus.digest,
      promptTemplate: MANIFEST.artifacts.promptTemplate.digest,
      rubric: MANIFEST.artifacts.rubric.digest,
    },
    authorized: true,
    capabilityDispositions: {
      promptTokenCounting: "unavailable_byte_cap_only",
      seedControl: "unverified_owner_accepted",
    },
    captureBasename: "librarian-semantic-eval-offline",
    implementationRevision: currentRevision(REPO) ?? "unknown",
    manifestDigest: sha256File(MANIFEST_PATH),
    model: MANIFEST.identity.model,
    scope: { calls: 34, endpoint: MANIFEST.identity.baseUrl, model: MANIFEST.identity.model },
    thirdPartyEgress: {
      approved: true,
      // The egress approval must bind to the frozen corpus artifact digest, not an arbitrary 64-hex value.
      artifactDigest: MANIFEST.artifacts.corpus.digest,
      baseUrl: MANIFEST.identity.baseUrl,
      calls: 34,
      model: MANIFEST.identity.model,
      origin: MANIFEST.identity.origin,
      syntheticOnly: true,
    },
    token: "tok",
    ...overrides,
  };
}

const ENV = { LIBRARIAN_SEMANTIC_RUN_AUTHORIZED: "1", LIBRARIAN_SEMANTIC_RUN_TOKEN: "tok" };

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

  test("a fully matching record authorizes", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const recordPath = join(dir, "run-authorization.json");
    try {
      writeFileSync(recordPath, JSON.stringify(baseRecord()));
      const ok = loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO });
      expect(ok.authorized).toBe(true);
      expect(ok.reason).toBe("authorized");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("mismatches refuse with a fixed reason", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const recordPath = join(dir, "run-authorization.json");
    const check = (record, env = ENV) => {
      writeFileSync(recordPath, JSON.stringify(record));
      return loadAuthorization({ env, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO });
    };
    try {
      expect(check(baseRecord({ manifestDigest: "0".repeat(64) })).reason).toBe("authorization_manifest_mismatch");
      expect(
        check(baseRecord(), { ...ENV, LIBRARIAN_SEMANTIC_RUN_TOKEN: "other" }).reason
      ).toBe("authorization_token_mismatch");
      expect(check(baseRecord({ scope: { ...baseRecord().scope, calls: 35 } })).reason).toBe("authorization_scope_mismatch");
      expect(check(baseRecord({ model: "other-model" })).reason).toBe("authorization_model_mismatch");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("a missing capability disposition refuses (no silent default)", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const recordPath = join(dir, "run-authorization.json");
    try {
      writeFileSync(recordPath, JSON.stringify(baseRecord({ capabilityDispositions: undefined })));
      const r = loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO });
      expect(r.authorized).toBe(false);
      expect(r.reason).toBe("authorization_capability_dispositions_absent");
      // A partial block also refuses.
      writeFileSync(recordPath, JSON.stringify(baseRecord({ capabilityDispositions: { seedControl: "unverified_owner_accepted" } })));
      expect(loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO }).reason).toBe(
        "authorization_capability_dispositions_absent"
      );
      // A `verified` claim without a proof digest is unverifiable, not accepted.
      writeFileSync(recordPath, JSON.stringify(baseRecord({ capabilityDispositions: { seedControl: { status: "verified" }, promptTokenCounting: "unavailable_byte_cap_only" } })));
      expect(loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO }).reason).toBe(
        "authorization_capability_disposition_unverifiable"
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("a missing or bad third-party egress approval refuses", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const recordPath = join(dir, "run-authorization.json");
    const load = () => loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO });
    const check = (egress) => {
      writeFileSync(recordPath, JSON.stringify(baseRecord({ thirdPartyEgress: egress })));
      return load().reason;
    };
    try {
      writeFileSync(recordPath, JSON.stringify(baseRecord({ thirdPartyEgress: undefined })));
      expect(load().reason).toBe("authorization_third_party_egress_absent");
      expect(check({ ...baseRecord().thirdPartyEgress, approved: false })).toBe("authorization_third_party_egress_not_approved");
      expect(check({ ...baseRecord().thirdPartyEgress, syntheticOnly: false })).toBe("authorization_third_party_egress_not_synthetic_only");
      expect(check({ ...baseRecord().thirdPartyEgress, baseUrl: "https://evil.example.com" })).toBe("authorization_third_party_egress_mismatch");
      expect(check({ ...baseRecord().thirdPartyEgress, calls: 33 })).toBe("authorization_third_party_egress_mismatch");
      expect(check({ ...baseRecord().thirdPartyEgress, artifactDigest: "nothex" })).toBe("authorization_third_party_egress_artifact_digest_invalid");
      // An arbitrary 64-hex value that does not bind to the frozen corpus artifact is refused.
      expect(check({ ...baseRecord().thirdPartyEgress, artifactDigest: "a".repeat(64) })).toBe("authorization_third_party_egress_mismatch");
      expect(check({ ...baseRecord().thirdPartyEgress, token: "secret" })).toBe("authorization_third_party_egress_credential_field_present");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("an unresolvable revision fails closed (hostile/absent git cwd), and a mismatch refuses", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const recordPath = join(dir, "run-authorization.json");
    try {
      writeFileSync(recordPath, JSON.stringify(baseRecord()));
      // A record whose revision cannot be resolved against a non-git repo is refused, not skipped.
      const unavailable = loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: dir });
      expect(unavailable.authorized).toBe(false);
      expect(unavailable.reason).toBe("authorization_revision_unavailable");
      // A recorded revision that does not match the resolved HEAD refuses.
      const mismatch = loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO, revision: "deadbeef" });
      expect(mismatch.authorized).toBe(false);
      expect(mismatch.reason).toBe("authorization_revision_mismatch");
      // A record with no revision at all is unavailable.
      writeFileSync(recordPath, JSON.stringify(baseRecord({ implementationRevision: "" })));
      expect(loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, repo: REPO }).reason).toBe(
        "authorization_revision_unavailable"
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe("semantic-eval runner — verified capability proof binding (fail-closed)", () => {
  /** Build a genuine proof directory (proof + evidence file); mutations model a forged/unbound claim. */
  function setupProof(mutateProof, mutateDisposition) {
    const proofDir = mkdtempSync(join(tmpdir(), "librarian-proof-"));
    const evidencePath = "seed-evidence.json";
    writeFileSync(join(proofDir, evidencePath), JSON.stringify({ capability: "seedControl", note: "synthetic" }));
    const proof = {
      schema: "librarian-capability-proof-v1",
      capability: "seedControl",
      status: "verified",
      provider: MANIFEST.identity.provider,
      endpoint: MANIFEST.identity.baseUrl,
      model: MANIFEST.identity.model,
      timestamp: "2026-10-05T00:00:00.000Z",
      evidencePath,
      evidenceSha256: sha256File(join(proofDir, evidencePath)),
    };
    if (mutateProof) mutateProof(proof, proofDir);
    const proofPath = "seed-proof.json";
    writeFileSync(join(proofDir, proofPath), JSON.stringify(proof));
    const disposition = {
      status: "verified",
      artifactDigest: MANIFEST.artifacts.corpus.digest,
      proofDigest: sha256File(join(proofDir, proofPath)),
      proofPath,
    };
    if (mutateDisposition) mutateDisposition(disposition, proof, proofDir);
    return { disposition, proofDir };
  }

  function loadWith(disposition, proofDir, dir) {
    const recordPath = join(dir, "run-authorization.json");
    writeFileSync(
      recordPath,
      JSON.stringify(
        baseRecord({
          capabilityDispositions: { promptTokenCounting: "unavailable_byte_cap_only", seedControl: disposition },
        })
      )
    );
    return loadAuthorization({ env: ENV, manifest: MANIFEST, manifestPath: MANIFEST_PATH, recordPath, proofDir, repo: REPO });
  }

  function run(mutateProof, mutateDisposition) {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const { disposition, proofDir } = setupProof(mutateProof, mutateDisposition);
    try {
      return loadWith(disposition, proofDir, dir);
    } finally {
      rmSync(dir, { force: true, recursive: true });
      rmSync(proofDir, { force: true, recursive: true });
    }
  }

  test("a genuine, fully consistent proof authorizes (the mechanism is not always-refuse)", () => {
    expect(run().authorized).toBe(true);
  });

  test("an absent proof file refuses (proof_missing)", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const emptyProofDir = mkdtempSync(join(tmpdir(), "librarian-proof-empty-"));
    const { disposition } = setupProof();
    try {
      writeFileSync(
        join(dir, "run-authorization.json"),
        JSON.stringify(
          baseRecord({
            capabilityDispositions: { promptTokenCounting: "unavailable_byte_cap_only", seedControl: disposition },
          })
        )
      );
      const result = loadAuthorization({
        env: ENV,
        manifest: MANIFEST,
        manifestPath: MANIFEST_PATH,
        recordPath: join(dir, "run-authorization.json"),
        proofDir: emptyProofDir,
        repo: REPO,
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe("authorization_capability_proof_missing");
    } finally {
      rmSync(dir, { force: true, recursive: true });
      rmSync(emptyProofDir, { force: true, recursive: true });
    }
  });

  test("a `..` traversal proof path is refused before any read", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const { disposition, proofDir } = setupProof();
    disposition.proofPath = "../../etc/passwd";
    try {
      expect(loadWith(disposition, proofDir, dir).reason).toBe("authorization_capability_proof_path_refused");
    } finally {
      rmSync(dir, { force: true, recursive: true });
      rmSync(proofDir, { force: true, recursive: true });
    }
  });

  test("an absolute proof path is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const { disposition, proofDir } = setupProof();
    disposition.proofPath = join(proofDir, "seed-proof.json");
    try {
      expect(loadWith(disposition, proofDir, dir).reason).toBe("authorization_capability_proof_path_refused");
    } finally {
      rmSync(dir, { force: true, recursive: true });
      rmSync(proofDir, { force: true, recursive: true });
    }
  });

  test("a symlinked proof file is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "librarian-auth-"));
    const { disposition, proofDir } = setupProof();
    const target = join(dir, "outside.json");
    writeFileSync(target, JSON.stringify({ note: "outside" }));
    symlinkSync(target, join(proofDir, "link.json"));
    disposition.proofPath = "link.json";
    try {
      expect(loadWith(disposition, proofDir, dir).reason).toBe("authorization_capability_proof_path_refused");
    } finally {
      rmSync(dir, { force: true, recursive: true });
      rmSync(proofDir, { force: true, recursive: true });
    }
  });

  test("a proof bound to a different model is refused", () => {
    expect(run((proof) => { proof.model = "some-other-model"; }).reason).toBe("authorization_capability_proof_mismatch");
  });

  test("a proof bound to a different endpoint is refused", () => {
    expect(run((proof) => { proof.endpoint = "https://evil.example.com"; }).reason).toBe("authorization_capability_proof_mismatch");
  });

  test("a proof for a different capability is refused", () => {
    expect(run((proof) => { proof.capability = "promptTokenCounting"; }).reason).toBe("authorization_capability_proof_mismatch");
  });

  test("a malformed proof (wrong schema) is refused", () => {
    expect(run((proof) => { proof.schema = "not-a-proof"; }).reason).toBe("authorization_capability_proof_malformed");
  });

  test("a proof whose own bytes do not hash to the recorded proofDigest is refused", () => {
    expect(run(null, (disposition) => { disposition.proofDigest = "c".repeat(64); }).reason).toBe(
      "authorization_capability_proof_digest_mismatch"
    );
  });

  test("a verified claim whose artifactDigest is not the frozen corpus digest is refused", () => {
    expect(run(null, (disposition) => { disposition.artifactDigest = "b".repeat(64); }).reason).toBe(
      "authorization_capability_proof_mismatch"
    );
  });

  test("a proof whose evidence file does not match evidenceSha256 is refused", () => {
    expect(run((proof) => { proof.evidenceSha256 = "0".repeat(64); }).reason).toBe(
      "authorization_capability_proof_evidence_mismatch"
    );
  });
});
