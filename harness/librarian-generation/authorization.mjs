/**
 * Fail-closed run-authorization gate for the Librarian semantic evaluation generation path
 * (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §9, §10; reviewer disposition D-014).
 *
 * Generation is refused unless **all** of an explicit external authorization **record** (a separate
 * file, never an in-place edit of the frozen manifest), the matching environment token and flag, and a
 * set of pinned digests agree. Any missing or mismatched component yields `authorized: false` with a
 * fixed reason code. No run authorization exists in this envelope, so the gate is shut.
 *
 * The gate additionally requires, in the record:
 *
 *   - **`capabilityDispositions`** — the explicit owner disposition of the two capabilities that are
 *     UNVERIFIED at preparation (`seedControl`, `promptTokenCounting`). An unverified acceptance is a
 *     plain string; a `verified` claim must be an object carrying a `proofDigest` and an
 *     `artifactDigest` (both sha256 hex), so a "verified" claim cannot be fabricated from prose.
 *   - **`thirdPartyEgress`** — the explicit owner approval of synthetic-only third-party egress, with the
 *     exact `origin`, `baseUrl` and `model`, `syntheticOnly: true`, the 34-call scope, an artifact digest,
 *     and no credential/user/account field.
 *   - **a resolvable implementation revision** — if `git rev-parse HEAD` cannot be resolved the gate
 *     **refuses** (it does not skip the check), and the recorded revision must equal it.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";

export const AUTHORIZED_CALL_SCOPE = 34;

const HEX64 = /^[0-9a-f]{64}$/;

/** A verified capability claim is bound to a bounded, non-secret proof artifact under this directory. */
export const CAPABILITY_PROOF_SCHEMA = "librarian-capability-proof-v1";
export const PROOF_FILE_MAX_BYTES = 65536;
export const DEFAULT_PROOF_DIR = join(import.meta.dir, "capability-proofs");

/** The plain (unverified) dispositions an owner may record for each capability. */
export const UNVERIFIED_CAPABILITY_DISPOSITIONS = {
  promptTokenCounting: ["unavailable_byte_cap_only"],
  seedControl: ["unverified_owner_accepted"],
};

/** Optional capability dispositions that gate a fail-closed default. */
export const OPTIONAL_CAPABILITY_DISPOSITIONS = {
  // Accept an unknown backend-reported model identity; a mismatch is still always non-green.
  modelIdentity: ["owner_accepted_unknown"],
};

/** Fields a `thirdPartyEgress` block must never carry (credentials / account identity). */
export const FORBIDDEN_EGRESS_FIELDS = [
  "apiKey",
  "authorization",
  "credential",
  "credentialValue",
  "headers",
  "org",
  "orgId",
  "requestId",
  "token",
  "user",
  "userId",
];

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The current repository revision, or `null` if it cannot be resolved. */
export function currentRevision(repo) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Resolve one proof artifact path under the dedicated proof directory, refusing anything outside it.
 *
 * A record is untrusted input: an absolute path, a `..` traversal, a symlink, a non-file, or an
 * over-large file is **refused** before it is read, so a malicious record can never point the gate at an
 * arbitrary (credential) file. Returns `{ path }` or `{ error }` with a fixed code.
 */
function resolveProofPath(proofDir, rel) {
  if (typeof rel !== "string" || rel.trim().length === 0) return { error: "authorization_capability_proof_missing" };
  if (isAbsolute(rel) || rel.startsWith("~")) return { error: "authorization_capability_proof_path_refused" };
  const normalized = normalize(rel);
  if (normalized.startsWith("..") || isAbsolute(normalized)) {
    return { error: "authorization_capability_proof_path_refused" };
  }
  let realBase;
  try {
    realBase = realpathSync(proofDir);
  } catch {
    return { error: "authorization_capability_proof_missing" };
  }
  const full = join(realBase, normalized);
  let link;
  try {
    link = lstatSync(full);
  } catch {
    return { error: "authorization_capability_proof_missing" };
  }
  if (link.isSymbolicLink() || !link.isFile()) return { error: "authorization_capability_proof_path_refused" };
  if (link.size > PROOF_FILE_MAX_BYTES) return { error: "authorization_capability_proof_path_refused" };
  let real;
  try {
    real = realpathSync(full);
  } catch {
    return { error: "authorization_capability_proof_missing" };
  }
  if (!real.startsWith(realBase + sep)) return { error: "authorization_capability_proof_path_refused" };
  return { path: real };
}

/**
 * Mechanically validate one `verified` capability claim against its bound proof artifact.
 *
 * A `verified` claim is **not** prose and is **not** a bare sha: it must name a bounded, non-secret JSON
 * proof under the proof directory whose own bytes hash to the recorded `proofDigest`, whose capability
 * matches, whose provider/endpoint/model match the pinned identity, whose `status` is `verified`, and
 * whose recorded `artifactDigest` equals the **frozen corpus** artifact digest. It must also name an
 * evidence file (inside the proof directory) whose bytes hash to the recorded `evidenceSha256`. This is an
 * **operator interlock**, not a cryptographic owner signature or an attestation the harness can trust
 * blindly: it detects inconsistency and unbound/forged digests, and it assumes nothing — no proof exists
 * today, so every `verified` route refuses.
 */
export function checkCapabilityProof(disposition, capability, context) {
  if (context?.manifest === undefined) return "authorization_capability_proof_malformed";
  const manifest = context.manifest;
  const proofDir = context.proofDir ?? DEFAULT_PROOF_DIR;
  const resolved = resolveProofPath(proofDir, disposition.proofPath);
  if (resolved.error) return resolved.error;
  if (hashFile(resolved.path) !== disposition.proofDigest) return "authorization_capability_proof_digest_mismatch";
  let proof;
  try {
    proof = JSON.parse(readFileSync(resolved.path, "utf8"));
  } catch {
    return "authorization_capability_proof_malformed";
  }
  if (typeof proof !== "object" || proof === null || Array.isArray(proof)) return "authorization_capability_proof_malformed";
  if (proof.schema !== CAPABILITY_PROOF_SCHEMA) return "authorization_capability_proof_malformed";
  if (proof.status !== "verified") return "authorization_capability_proof_mismatch";
  if (proof.capability !== capability) return "authorization_capability_proof_mismatch";
  if (proof.provider !== manifest.identity.provider) return "authorization_capability_proof_mismatch";
  if (proof.endpoint !== manifest.identity.baseUrl) return "authorization_capability_proof_mismatch";
  if (proof.model !== manifest.identity.model) return "authorization_capability_proof_mismatch";
  if (typeof proof.timestamp !== "string" || proof.timestamp.trim().length === 0) {
    return "authorization_capability_proof_malformed";
  }
  if (typeof proof.evidenceSha256 !== "string" || !HEX64.test(proof.evidenceSha256)) {
    return "authorization_capability_proof_malformed";
  }
  // The verified claim's artifact digest must bind to the frozen corpus artifact, not an arbitrary sha.
  if (disposition.artifactDigest !== manifest.artifacts?.corpus?.digest) {
    return "authorization_capability_proof_mismatch";
  }
  const evidence = resolveProofPath(proofDir, proof.evidencePath);
  if (evidence.error) return "authorization_capability_proof_evidence_mismatch";
  if (hashFile(evidence.path) !== proof.evidenceSha256) {
    return "authorization_capability_proof_evidence_mismatch";
  }
  return null;
}

/**
 * Validate one capability disposition. Returns `null` when valid, else a fixed reason code. A plain
 * string must be one of `allowedStrings`; an object claims `verified` and must carry sha256
 * `proofDigest`, `artifactDigest` and a `proofPath`, and must pass the mechanical proof validation above
 * — a verified claim is never accepted from prose or an unbound digest.
 */
function checkDisposition(value, allowedStrings, capability, context) {
  if (typeof value === "string") {
    return allowedStrings.includes(value) ? null : "authorization_capability_disposition_invalid";
  }
  if (isRecord(value)) {
    if (value.status !== "verified") return "authorization_capability_disposition_invalid";
    if (typeof value.proofDigest !== "string" || !HEX64.test(value.proofDigest)) {
      return "authorization_capability_disposition_unverifiable";
    }
    if (typeof value.artifactDigest !== "string" || !HEX64.test(value.artifactDigest)) {
      return "authorization_capability_disposition_unverifiable";
    }
    if (typeof value.proofPath !== "string" || value.proofPath.trim().length === 0) {
      return "authorization_capability_disposition_unverifiable";
    }
    return checkCapabilityProof(value, capability, context);
  }
  return "authorization_capability_disposition_invalid";
}

/**
 * Validate the mandatory `capabilityDispositions` block. Both `seedControl` and `promptTokenCounting`
 * are required; an unknown disposition fails closed.
 */
export function checkCapabilityDispositions(dispositions, context) {
  if (!isRecord(dispositions)) return "authorization_capability_dispositions_absent";
  for (const [name, allowed] of Object.entries(UNVERIFIED_CAPABILITY_DISPOSITIONS)) {
    if (!Object.prototype.hasOwnProperty.call(dispositions, name)) {
      return "authorization_capability_dispositions_absent";
    }
    const reason = checkDisposition(dispositions[name], allowed, name, context);
    if (reason) return reason;
  }
  for (const [name, allowed] of Object.entries(OPTIONAL_CAPABILITY_DISPOSITIONS)) {
    if (Object.prototype.hasOwnProperty.call(dispositions, name)) {
      const reason = checkDisposition(dispositions[name], allowed, name, context);
      if (reason) return reason;
    }
  }
  return null;
}

/**
 * Validate the mandatory `thirdPartyEgress` approval block against the pinned identity. The scope must
 * name the exact origin/base URL/model, be synthetic-only, cover the 34-call budget, carry the **frozen
 * corpus** artifact digest (not an arbitrary 64-hex value), and carry no credential/account field.
 */
export function checkThirdPartyEgress(egress, manifest) {
  if (!isRecord(egress)) return "authorization_third_party_egress_absent";
  for (const field of FORBIDDEN_EGRESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(egress, field)) {
      return "authorization_third_party_egress_credential_field_present";
    }
  }
  if (egress.approved !== true) return "authorization_third_party_egress_not_approved";
  if (egress.syntheticOnly !== true) return "authorization_third_party_egress_not_synthetic_only";
  if (egress.origin !== manifest.identity.origin) return "authorization_third_party_egress_mismatch";
  if (egress.baseUrl !== manifest.identity.baseUrl) return "authorization_third_party_egress_mismatch";
  if (egress.model !== manifest.identity.model) return "authorization_third_party_egress_mismatch";
  if (egress.calls !== AUTHORIZED_CALL_SCOPE) return "authorization_third_party_egress_mismatch";
  if (typeof egress.artifactDigest !== "string" || !HEX64.test(egress.artifactDigest)) {
    return "authorization_third_party_egress_artifact_digest_invalid";
  }
  // The egress artifact digest must bind to the frozen corpus artifact — never an arbitrary 64-hex value.
  if (egress.artifactDigest !== manifest.artifacts?.corpus?.digest) {
    return "authorization_third_party_egress_mismatch";
  }
  return null;
}

/**
 * Evaluate the authorization gate. Returns `{ authorized, reason }`.
 *
 * `env` defaults to the process environment; the repository revision is resolved from `repo` unless a
 * test seam supplies `revision` (production never injects one). The record must carry a matching token,
 * pin the model and the pinned endpoint, scope the run to exactly 34 calls, pin the manifest digest, the
 * corpus/rubric/template digests, a capture basename, the capability dispositions, the third-party
 * egress approval, and a resolvable implementation revision.
 */
export function loadAuthorization({
  recordPath,
  manifestPath,
  manifest,
  repo,
  env = process.env,
  revision,
  proofDir = DEFAULT_PROOF_DIR,
} = {}) {
  if (env.LIBRARIAN_SEMANTIC_RUN_AUTHORIZED !== "1") return { authorized: false, reason: "authorization_flag_absent" };
  const token = env.LIBRARIAN_SEMANTIC_RUN_TOKEN || "";
  if (!token) return { authorized: false, reason: "authorization_token_absent" };
  if (!recordPath || !existsSync(recordPath)) return { authorized: false, reason: "authorization_record_absent" };
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
  } catch {
    return { authorized: false, reason: "authorization_record_unreadable" };
  }
  if (!isRecord(record) || record.authorized !== true) {
    return { authorized: false, reason: "authorization_record_not_authorized" };
  }
  if (record.token !== token) return { authorized: false, reason: "authorization_token_mismatch" };
  if (record.model !== manifest.identity.model) return { authorized: false, reason: "authorization_model_mismatch" };

  const scope = isRecord(record.scope) ? record.scope : {};
  if (scope.endpoint !== manifest.identity.baseUrl) return { authorized: false, reason: "authorization_scope_mismatch" };
  if (scope.model !== manifest.identity.model) return { authorized: false, reason: "authorization_scope_mismatch" };
  if (scope.calls !== AUTHORIZED_CALL_SCOPE || scope.calls !== manifest.callPlan.hardMaximumCalls) {
    return { authorized: false, reason: "authorization_scope_mismatch" };
  }
  if (typeof record.captureBasename !== "string" || record.captureBasename.trim().length === 0) {
    return { authorized: false, reason: "authorization_capture_basename_absent" };
  }
  if (record.manifestDigest !== sha256File(manifestPath)) {
    return { authorized: false, reason: "authorization_manifest_mismatch" };
  }
  const artifacts = isRecord(record.artifacts) ? record.artifacts : {};
  for (const key of ["corpus", "rubric", "promptTemplate"]) {
    const expected = manifest.artifacts?.[key]?.digest;
    if (!expected || artifacts[key] !== expected) return { authorized: false, reason: "authorization_artifact_mismatch" };
  }

  // The explicit owner disposition of the unverified capabilities (mandatory).
  const capabilityReason = checkCapabilityDispositions(record.capabilityDispositions, { manifest, proofDir });
  if (capabilityReason) return { authorized: false, reason: capabilityReason };

  // The explicit owner approval of synthetic-only third-party egress (mandatory).
  const egressReason = checkThirdPartyEgress(record.thirdPartyEgress, manifest);
  if (egressReason) return { authorized: false, reason: egressReason };

  // Revision: fail closed when it cannot be determined — never skip the check.
  const reported = record.implementationRevision;
  if (typeof reported !== "string" || reported.trim().length === 0) {
    return { authorized: false, reason: "authorization_revision_unavailable" };
  }
  const head = revision ?? currentRevision(repo);
  if (!head) return { authorized: false, reason: "authorization_revision_unavailable" };
  if (reported !== head) return { authorized: false, reason: "authorization_revision_mismatch" };

  return { authorized: true, reason: "authorized", record };
}
