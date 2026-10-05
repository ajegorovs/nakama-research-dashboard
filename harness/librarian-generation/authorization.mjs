/**
 * Fail-closed run-authorization gate for the Librarian semantic evaluation generation path
 * (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §9, §10).
 *
 * Generation is refused unless **all** of an explicit external authorization **record** (a separate
 * file, never an in-place edit of the frozen manifest), the matching environment token and flag, and a
 * set of pinned digests agree. Any missing or mismatched component yields `authorized: false` with a
 * fixed reason code. No run authorization exists in this envelope, so the gate is shut.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const AUTHORIZED_CALL_SCOPE = 34;

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** The current repository revision, or `null` if it cannot be resolved. */
export function currentRevision(repo) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Evaluate the authorization gate. Returns `{ authorized, reason }`.
 *
 * `env` defaults to the process environment; `revision` defaults to the repository HEAD. The record must
 * carry a matching token, pin the model and the pinned endpoint, scope the run to exactly 34 calls, and
 * pin the manifest digest, the corpus/rubric/template digests, the implementation revision and a capture
 * basename.
 */
export function loadAuthorization({
  recordPath,
  manifestPath,
  manifest,
  repo,
  env = process.env,
  revision,
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
  if (!record || record.authorized !== true) return { authorized: false, reason: "authorization_record_not_authorized" };
  if (record.token !== token) return { authorized: false, reason: "authorization_token_mismatch" };
  if (record.model !== manifest.identity.model) return { authorized: false, reason: "authorization_model_mismatch" };

  const scope = record.scope && typeof record.scope === "object" ? record.scope : {};
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
  const artifacts = record.artifacts && typeof record.artifacts === "object" ? record.artifacts : {};
  for (const key of ["corpus", "rubric", "promptTemplate"]) {
    const expected = manifest.artifacts?.[key]?.digest;
    if (!expected || artifacts[key] !== expected) return { authorized: false, reason: "authorization_artifact_mismatch" };
  }
  const head = revision ?? currentRevision(repo);
  if (head && record.implementationRevision !== head) {
    return { authorized: false, reason: "authorization_revision_mismatch" };
  }
  return { authorized: true, reason: "authorized", record };
}
