#!/usr/bin/env bun
/**
 * Durable evidence-pack exporter for the Librarian semantic evaluation (reviewer disposition D-014).
 *
 * A real run writes its lossless captures to the **local, gitignored** `harness/librarian-generation/capture/<runId>/`
 * staging directory. This exporter turns one completed local capture directory into a **single, durable,
 * public-source** evidence pack under `docs/librarian-reconciliation/semantic-runs/<runId>/`, which a
 * reviewer with only a clone can read. It is generated **once, exclusively**: it refuses to reuse an
 * existing pack directory, and it writes its binding `run-manifest.json` **last**, after every call
 * record has been assembled, so a partial pack is never presented as complete.
 *
 * ## Strict integrity prevalidation (before any output write)
 *
 * The exporter does not trust the run report, the capture filenames or the recorded digests. Before it
 * creates the pack directory it **recomputes every binding** and refuses (throwing a fixed
 * {@link PackIntegrityError}) on any inconsistency, leaving **no partial pack output**:
 *
 *   - **Canonical base64.** `completionBase64` must be canonical strict base64 — a decode/encode
 *     round-trip equal to the recorded text (Node's `Buffer.from` is permissive and is not trusted),
 *     its decoded **length** must equal `completionBytes`, and its sha256 must equal `completionSha256`.
 *     The bytes must also round-trip as strict UTF-8.
 *   - **Rederived completion outcome.** The completion bytes are **re-parsed** through the frozen
 *     `parseModelPayload` and the parsed candidate is **re-assessed** through `assessCandidate` against
 *     the exact frozen observation the coordinator would have used. The record's claimed `parsed`/`error`/
 *     `assessmentError` are never trusted — they must equal the recomputation, so a self-consistent forged
 *     `parsed:true` over a malformed, `snapshot_unstable`, forbidden-field, unknown-citation or
 *     unresolved-conflict payload is refused. The recomputed outcomes (not the record's) govern `green`.
 *     No semantic rubric is evaluated — only the deterministic parse and structural contract.
 *   - **Rederived run metadata.** The injected `provenance` is recomputed from the slot's
 *     `(caseId, step, repeat, seed)` and must match; `discarded` is recomputed from the frozen schedule
 *     (an A-generation is discarded only on a churn slot); and a `modelIdentity` of `match` is accepted
 *     only when the recorded backend-reported id equals the requested id.
 *   - **Immutable manifest.** The schedule/manifest is read **from disk** at `manifestPath`. A
 *     caller-supplied `manifest` is never consumed directly: it is accepted only when canonically
 *     identical to the on-disk manifest, so a manipulated argument cannot diverge from the artifact whose
 *     sha256 the pack binds.
 *   - **Request / prompt.** The recorded `requestSystem`/`requestUser` are canonical-encoded and their
 *     sha256 must equal the recorded `promptDigest`; the system message must be the frozen template; and
 *     the whole request (system + user), the prompt digest and the observation digest must equal what the
 *     **frozen prompt builder** produces for that case/step from the frozen projection — recomputed here,
 *     not copied.
 *   - **Schedule / call set.** Every captured call must match exactly one expected `(caseId, step,
 *     repeat, seed)` from the frozen manifest plan (the same `expectedCalls` the executor runs); a
 *     duplicate or unexpected call is an integrity failure.
 *   - **Frozen baseline.** Each declared corpus/rubric/template artifact must exist and hash to its
 *     frozen digest, the corpus's own declared projection digests must recompute, and the frozen manifest
 *     must be present. A **missing** frozen file is a hard failure (never silently non-green).
 *
 * An **incomplete** run (fewer captured calls than the plan, or a recorded failure) is still written,
 * labelled non-green; only an **inconsistent** or **unverifiable** run refuses to write.
 *
 * Guarantees:
 *   - **Exact evidence.** The exact prompt messages, their UTF-8 bytes and digests, and the exact
 *     completion bytes (base64 + sha256) are copied verbatim. The exporter never normalizes, truncates or
 *     "sanitizes" a completion or a prompt — that would destroy the evidence. Sanitization is a
 *     **whitelist** of the record's structural fields; the completion/prompt payloads pass through byte-exact.
 *   - **No credentials, envelopes or account data.** The provider envelope is never captured, and the
 *     whitelist drops any unknown field. A `run-authorization.json` (token) is never read or exported.
 *   - **Global immutable binding.** `run-manifest.json` binds the sha256 of the frozen run manifest, the
 *     frozen corpus/rubric/template digests, the implementation revision, the requested/reported model
 *     identity, the decoding parameters and the predeclared seeds.
 *   - **Honest counts, own green.** `green` is computed here from the structural integrity, the plan
 *     completeness, the failure count and the frozen baseline — it is never inherited from the report. If
 *     the report's `green` disagrees with this own calculation the pack is non-green (fail-closed).
 *   - **Hygiene scan (report-only).** The decoded completions and request text are scanned for
 *     identity/secret-shaped tokens. A finding is **recorded**, never used to alter the evidence.
 *
 * It ships nothing: it is not imported by `src/actions.ts` or `src/ui.tsx` and is not part of `bun run build`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assessCandidate,
  ContractRefusal,
  digestPayload,
} from "../../src/librarian/assembler.ts";
import {
  ModelPayloadError,
  parseModelPayload,
  toCandidateInput,
} from "../../src/librarian/model-candidate.ts";
import { SYSTEM_MESSAGE } from "../../src/librarian/prompt.ts";
import { ReferenceResolutionError } from "../../src/librarian/references.ts";
import { expectedCalls, expectedRequest, observationForRead } from "./orchestrate.mjs";

export const PACK_SCHEMA = "librarian-semantic-eval-pack-v1";
export const PACKS_ROOT_REL = "docs/librarian-reconciliation/semantic-runs";

/** A fixed, machine-readable integrity refusal. Thrown **before** any pack output is written. */
export class PackIntegrityError extends Error {
  constructor(reason, failures = []) {
    super(`exportPack: integrity failure (${reason})`);
    this.name = "PackIntegrityError";
    this.reason = reason;
    this.failures = failures;
  }
}

/** The only per-call fields copied out of a local capture record. Everything else is dropped. */
const CALL_FIELDS = [
  "caseId",
  "repeat",
  "step",
  "seed",
  "provenance",
  "implementationRevision",
  "runId",
  "modelRequested",
  "modelReported",
  "modelIdentity",
  "observationDigest",
  "promptDigest",
  "completionBase64",
  "completionBytes",
  "completionSha256",
  "parsed",
  "discarded",
  "error",
  "assessmentError",
];

/** Report-only secret/identity shapes. A match is recorded; it never mutates the evidence. */
const HYGIENE_PATTERNS = [
  ["bearer_token", /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/],
  ["openai_key", /\bsk-[A-Za-z0-9]{16,}\b/],
  ["github_token", /\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{20,}\b/],
  ["aws_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["assigned_secret", /(?:api[_-]?key|secret|password|passwd|token|authorization)\s*["'`]?\s*[:=]\s*["'`]?[A-Za-z0-9._~+/=-]{8,}/i],
  ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];

/** Canonical, strict base64: length a multiple of four and an exact decode→encode round-trip. */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function strictBase64Decode(value) {
  if (typeof value !== "string" || value.length % 4 !== 0 || !BASE64_RE.test(value)) return null;
  const buffer = Buffer.from(value, "base64");
  return buffer.toString("base64") === value ? buffer : null;
}

/**
 * Decode completion bytes as strict UTF-8: a decode→encode round-trip must reproduce the exact bytes. The
 * completion is recorded as the UTF-8 encoding of the extracted text, so a byte string that does not
 * round-trip was not produced by the capture seam and is refused rather than silently replacement-decoded.
 */
function strictUtf8Decode(bytes) {
  const text = bytes.toString("utf8");
  return Buffer.from(text, "utf8").equals(bytes) ? text : null;
}

/** The injected provenance label the harness mints for one scheduled slot (mirrors the coordinator's default). */
function expectedProvenanceLabel(caseId, step, repeat, seed) {
  return `librarian-semantic-eval/${caseId}/${step}/r${repeat}/s${seed ?? "unavailable"}`;
}

/**
 * Derive the model-identity verdict from the two recorded ids alone. A `match` is claimed **only** when
 * the backend-reported id is a non-empty string equal to the requested id; a capture that reported no
 * usable id (`unknown`) or a different id is never a match. The transport's own `invalid` classification
 * cannot be re-derived from strings (it records an unusable field as `unknown`), so it too is a non-match.
 */
function deriveModelIdentity(record) {
  const requested = record.modelRequested;
  const reported = record.modelReported;
  if (typeof reported !== "string" || reported.length === 0 || reported === "unknown") return "unknown";
  if (reported === requested) return "match";
  return "mismatch";
}

/**
 * Re-run the strict parse and the structural contract on the **exact** completion bytes, against the
 * frozen observation the coordinator would have assessed it against. The recorded `parsed`/`error`/
 * `assessmentError` are never trusted: they are compared to this recomputation. No semantic rubric is
 * evaluated here — only the deterministic parse and contract (citation resolution, outcome shape).
 */
function deriveStructuralOutcome(exactText, observation, provenance) {
  let payload;
  try {
    payload = parseModelPayload(exactText);
  } catch (error) {
    const parseError =
      error instanceof ModelPayloadError
        ? { message: error.message, reason: error.reason }
        : { message: error instanceof Error ? error.message : String(error), reason: "unexpected_parser_error" };
    return { assessmentError: null, error: parseError, parsed: false };
  }
  const candidate = toCandidateInput(payload, provenance);
  try {
    assessCandidate(observation, candidate);
    return { assessmentError: null, error: null, parsed: true };
  } catch (error) {
    if (error instanceof ReferenceResolutionError || error instanceof ContractRefusal) {
      return { assessmentError: { message: error.message, reason: error.reason }, error: null, parsed: true };
    }
    throw error;
  }
}

/**
 * Compare a record's recorded structural outcome to the rederived one and add a fixed failure per
 * divergence. A `parsed:true` record whose bytes do not parse, a parse error that does not reproduce, a
 * contract refusal that does not reproduce, and a forged clean assessment over an unresolvable citation
 * are all integrity failures. A generation the coordinator never assessed (a non-match identity) is not
 * required to carry an assessment outcome.
 */
function compareStructuralOutcome(record, derived, fail) {
  if (record.parsed !== derived.parsed) {
    fail("completion_parsed_mismatch", `recorded parsed=${record.parsed}, rederived ${derived.parsed}`);
    return;
  }
  if (!derived.parsed) {
    const recorded = record.error;
    if (
      !isRecord(recorded) ||
      recorded.reason !== derived.error.reason ||
      recorded.message !== derived.error.message
    ) {
      fail("completion_error_mismatch", `rederived ${derived.error.reason}`);
    }
    return;
  }
  if (record.error !== null && record.error !== undefined) {
    fail("completion_error_unexpected", "a parsed completion carries no parse error");
  }
  const recorded = isRecord(record.assessmentError) ? record.assessmentError : null;
  const assessed = deriveModelIdentity(record) === "match";
  if (derived.assessmentError && assessed) {
    if (
      !recorded ||
      recorded.reason !== derived.assessmentError.reason ||
      recorded.message !== derived.assessmentError.message
    ) {
      fail("completion_assessment_mismatch", `rederived ${derived.assessmentError.reason}`);
    }
  } else if (recorded) {
    fail("completion_assessment_unreproducible", `recorded ${recorded.reason}`);
  }
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Scan one decoded string for identity/secret shapes. Returns stable pattern labels only (never the match). */
export function hygieneFindings(text) {
  const found = [];
  for (const [label, pattern] of HYGIENE_PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  return found;
}

/** The exact request block for one call: the messages verbatim plus their UTF-8 bytes and digests. */
function requestBlock(record) {
  const system = typeof record.requestSystem === "string" ? record.requestSystem : "";
  const user = typeof record.requestUser === "string" ? record.requestUser : "";
  const assembled = `${system}\n${user}`;
  const bytes = Buffer.from(assembled, "utf8");
  return {
    decoding: "utf-8",
    messages: [
      { content: system, role: "system" },
      { content: user, role: "user" },
    ],
    requestBase64: bytes.toString("base64"),
    requestBytes: bytes.length,
    requestSha256: sha256Bytes(bytes),
    systemSha256: sha256Text(system),
    userSha256: sha256Text(user),
  };
}

/** The stable identity of one scheduled call. */
function callKey(call) {
  return `${call.caseId}|${call.step}|r${call.repeat}|s${call.seed ?? "unavailable"}`;
}

/** Build one durable call entry from a local capture file (completion) or error file (failed call). */
export function callEntry(record, kind) {
  const entry = { kind };
  for (const field of CALL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) entry[field] = record[field];
  }
  entry.request = requestBlock(record);
  const findings = [];
  if (kind === "completion") {
    const decoded = Buffer.from(String(record.completionBase64 ?? ""), "base64").toString("utf8");
    findings.push(...hygieneFindings(decoded).map((label) => ({ label, where: "completion" })));
  }
  for (const message of entry.request.messages) {
    findings.push(...hygieneFindings(message.content).map((label) => ({ label, where: `request.${message.role}` })));
  }
  entry.hygieneFindings = findings;
  return entry;
}

/**
 * Recompute and verify every binding for one captured record, adding a fixed reason code per
 * inconsistency. Returns the list of failures (empty == consistent).
 */
function validateCall(record, expected, manifest, corpus, hasStepB) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail, key: callKey(record) });
  const isCompletion = Object.prototype.hasOwnProperty.call(record, "completionBase64");

  // Structural identity against the expected schedule slot.
  if (record.caseId !== expected.caseId) fail("call_case_id_mismatch", `${record.caseId} != ${expected.caseId}`);
  if (record.step !== expected.step) fail("call_step_mismatch", `${record.step} != ${expected.step}`);
  if (record.repeat !== expected.repeat) fail("call_repeat_mismatch", `${record.repeat} != ${expected.repeat}`);
  if ((record.seed ?? null) !== (expected.seed ?? null)) fail("call_seed_mismatch", `${record.seed} != ${expected.seed}`);
  if (record.modelRequested !== manifest.identity.model) fail("model_requested_mismatch", String(record.modelRequested));

  // The provenance label is run metadata the harness mints from the slot (never model-authored). Recompute
  // it from the frozen slot and refuse a record whose label does not match the formula — a forged or
  // misattributed generation cannot claim another run's label.
  const provenance = expectedProvenanceLabel(expected.caseId, expected.step, expected.repeat, expected.seed ?? null);
  if (record.provenance !== provenance) fail("provenance_mismatch", String(record.provenance));

  // A `match` verdict may be claimed only when the recorded backend-reported id equals the requested id;
  // a fabricated match over a differing/absent id is refused (a response that carried no model is never a
  // match — the real provider cannot be cryptographically proven here, but a non-matching string can be).
  const derivedIdentity = deriveModelIdentity(record);
  if (!["match", "mismatch", "unknown", "invalid"].includes(record.modelIdentity)) {
    fail("model_identity_verdict_invalid", String(record.modelIdentity));
  } else if (record.modelIdentity === "match" && derivedIdentity !== "match") {
    fail("model_identity_fabricated_match", `reported ${record.modelReported} != requested ${record.modelRequested}`);
  } else if (record.modelIdentity !== "match" && derivedIdentity === "match") {
    fail("model_identity_understated", `reported ${record.modelReported} == requested but verdict is ${record.modelIdentity}`);
  }

  const hasRequestText = typeof record.requestSystem === "string" && typeof record.requestUser === "string";
  const request = requestBlock(record);
  if ((isCompletion || hasRequestText) && (request.messages[0].role !== "system" || request.messages[1].role !== "user")) {
    fail("request_roles_invalid", "expected system -> user");
  }

  // The recorded prompt digest must equal the canonical request bytes digest. A failure record that
  // carries no request text has no request bytes to hash, so this exact-bytes check applies only when the
  // request messages were captured (a completion, or a failure record that did capture them).
  if ((isCompletion || hasRequestText) && record.promptDigest !== request.requestSha256) {
    fail("request_prompt_digest_mismatch", String(record.promptDigest));
  }

  // The whole request must equal what the frozen prompt builder renders for this case/step.
  let rendered = null;
  try {
    rendered = expectedRequest(expected.caseId, expected.step, manifest, corpus);
  } catch (error) {
    fail("request_render_failed", error instanceof Error ? error.message : String(error));
  }
  if (rendered) {
    if (record.promptDigest !== rendered.requestDigest) fail("prompt_digest_mismatch", String(record.promptDigest));
    if (isCompletion) {
      if (record.requestSystem !== rendered.system) fail("request_system_mismatch", "system text differs");
      if (record.requestUser !== rendered.user) fail("request_user_mismatch", "user text differs");
      if (record.requestSystem !== SYSTEM_MESSAGE) fail("request_template_mismatch", "system is not the frozen template");
    }
    const observation = observationForRead(expected.caseId, expected.step === "B" ? 1 : 0, manifest, corpus);
    if (record.observationDigest !== observation.digest) fail("observation_digest_mismatch", String(record.observationDigest));
  }

  if (isCompletion) {
    // `discarded` is derived from the frozen schedule: only an A-generation on a churn slot (a B step is
    // scheduled for the same slot) is discarded, and every generation — discarded or not — is assessed.
    const expectedDiscarded = expected.step === "A" && hasStepB;
    if (record.discarded !== expectedDiscarded) fail("discarded_mismatch", `recorded ${record.discarded}`);

    const decoded = strictBase64Decode(record.completionBase64);
    if (!decoded) {
      fail("completion_base64_not_canonical", "not strict canonical base64");
    } else {
      if (decoded.length !== record.completionBytes) {
        fail("completion_length_mismatch", `${decoded.length} != ${record.completionBytes}`);
      }
      if (sha256Bytes(decoded) !== record.completionSha256) {
        fail("completion_sha256_mismatch", String(record.completionSha256));
      }
      const exactText = strictUtf8Decode(decoded);
      if (exactText === null) {
        fail("completion_not_utf8", "the completion bytes are not valid UTF-8");
      } else if (rendered) {
        // Re-run the exact parse and structural contract from the completion bytes and compare the
        // recorded structural outcome (`parsed`/`error`/`assessmentError`) to the recomputation. The
        // record's claimed outcome is never trusted; the rederived one governs.
        const observation = observationForRead(expected.caseId, expected.step === "B" ? 1 : 0, manifest, corpus);
        const derived = deriveStructuralOutcome(exactText, observation, provenance);
        compareStructuralOutcome(record, derived, fail);
      }
    }
  } else {
    // A failure is permitted without completion bytes, but only with a typed, known error shape.
    if (!isRecord(record.error) || typeof record.error.reason !== "string" || record.error.reason.length === 0) {
      fail("failure_missing_error", "failure record without a typed error");
    }
  }
  return failures;
}

/** Recompute the corpus's own declared projection digests (frozen-baseline internal consistency). */
function validateProjectionDigests(manifest, corpus) {
  const failures = [];
  const check = (label, projection, declared) => {
    if (typeof projection === "undefined") return;
    const actual = digestPayload(projection);
    if (actual !== declared) failures.push({ code: "projection_digest_mismatch", detail: label, key: label });
  };
  for (const entry of corpus.semanticCases ?? []) check(entry.id, entry.projection, entry.projectionDigest);
  check("F-2-conflict", corpus.conflictVariant?.projection, corpus.conflictVariant?.projectionDigest);
  check("F-18-inj", corpus.injectionVariant?.projection, corpus.injectionVariant?.projectionDigest);
  return failures;
}

/** Recompute the frozen artifact digests. A missing file is a hard failure (never silently non-green). */
function validateFrozenArtifacts(manifest, repo) {
  const failures = [];
  const frozen = {};
  for (const key of ["corpus", "rubric", "promptTemplate"]) {
    const entry = manifest.artifacts[key];
    const path = join(repo, entry.path);
    if (!existsSync(path)) {
      failures.push({ code: "frozen_artifact_missing", detail: entry.path, key });
      frozen[key] = { artifactId: entry.artifactId, digest: entry.digest, matchesFrozen: null, path: entry.path };
      continue;
    }
    const actual = sha256File(path);
    const matches = actual === entry.digest;
    if (!matches) failures.push({ code: "frozen_artifact_digest_mismatch", detail: `${entry.path} ${actual}`, key });
    frozen[key] = { artifactId: entry.artifactId, digest: entry.digest, matchesFrozen: matches, path: entry.path };
  }
  return { failures, frozen };
}

/**
 * Export one local capture directory into a durable pack directory.
 *
 * `captureDir` is the run's local (gitignored) staging directory; `packDir` is the destination under
 * `docs/librarian-reconciliation/semantic-runs/<runId>/`.
 *
 * Throws {@link PackIntegrityError} — before creating any output — when a record is inconsistent, the
 * call set violates the frozen plan, or a frozen artifact is missing/mismatched. Throws on an existing
 * pack directory (exclusive). Returns `{ green, complete, counts, path, ... }`; a run that is merely
 * incomplete (fewer calls, a recorded failure) is still written, labelled non-green.
 */
export function exportPack({
  captureDir,
  packDir,
  manifestPath,
  manifest: suppliedManifest,
  repo,
  runId,
  corpus,
  mock = false,
  now = new Date().toISOString(),
}) {
  if (!existsSync(captureDir)) throw new Error(`exportPack: capture directory not found: ${captureDir}`);
  const reportPath = join(captureDir, "report.json");
  if (!existsSync(reportPath)) {
    // Never present a partial pack as complete: refuse to write without the run report.
    return { green: false, complete: false, reason: "run_report_absent", written: false };
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  // The immutable schedule/manifest is the artifact **on disk** at `manifestPath`: the pack binds its
  // sha256 and every expectation is derived from it. A caller-supplied `manifest` is never consumed
  // directly — it is accepted only when it is canonically identical to the on-disk manifest, so a
  // manipulated argument cannot diverge from the artifact whose digest the pack records.
  const integrityFailures = [];
  let manifest = null;
  if (!manifestPath || !existsSync(manifestPath)) {
    integrityFailures.push({ code: "frozen_manifest_absent", detail: String(manifestPath), key: "manifest" });
  } else {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (suppliedManifest !== undefined && digestPayload(suppliedManifest) !== digestPayload(manifest)) {
      integrityFailures.push({
        code: "manifest_argument_mismatch",
        detail: "the caller-supplied manifest differs from the on-disk frozen manifest",
        key: "manifest",
      });
    }
  }
  if (!manifest) {
    throw new PackIntegrityError(integrityFailures[0].code, integrityFailures);
  }

  const frozenCorpus = corpus ?? JSON.parse(readFileSync(join(repo, manifest.artifacts.corpus.path), "utf8"));

  const names = readdirSync(captureDir).sort();
  const completionFiles = names.filter((name) => name.startsWith("capture__") && name.endsWith(".json"));
  const errorFiles = names.filter((name) => name.startsWith("error__") && name.endsWith(".json"));

  const rawRecords = [];
  for (const name of completionFiles) {
    rawRecords.push({ kind: "completion", record: JSON.parse(readFileSync(join(captureDir, name), "utf8")) });
  }
  for (const name of errorFiles) {
    rawRecords.push({ kind: "failure", record: JSON.parse(readFileSync(join(captureDir, name), "utf8")) });
  }

  // ---- Integrity prevalidation: recompute every binding BEFORE any output write. ----
  const expected = expectedCalls(manifest, frozenCorpus);
  const expectedByKey = new Map(expected.map((call) => [callKey(call), call]));
  // Which steps are scheduled for each (caseId, repeat, seed) slot: a scheduled B step marks the slot as
  // a churn slot, so its A-generation is the discarded one.
  const stepsBySlot = new Map();
  for (const call of expected) {
    const slotKey = `${call.caseId}|r${call.repeat}|s${call.seed ?? "unavailable"}`;
    if (!stepsBySlot.has(slotKey)) stepsBySlot.set(slotKey, new Set());
    stepsBySlot.get(slotKey).add(call.step);
  }

  const seen = new Map();
  for (const { record } of rawRecords) {
    const key = callKey(record);
    if (seen.has(key)) {
      integrityFailures.push({ code: "call_key_duplicate", detail: key, key });
    } else {
      seen.set(key, true);
    }
    const slot = expectedByKey.get(key);
    if (!slot) {
      integrityFailures.push({ code: "call_key_unexpected", detail: key, key });
    } else {
      const slotKey = `${slot.caseId}|r${slot.repeat}|s${slot.seed ?? "unavailable"}`;
      const hasStepB = stepsBySlot.get(slotKey)?.has("B") ?? false;
      integrityFailures.push(...validateCall(record, slot, manifest, frozenCorpus, hasStepB));
    }
  }
  integrityFailures.push(...validateProjectionDigests(manifest, frozenCorpus));
  const frozenResult = validateFrozenArtifacts(manifest, repo);
  integrityFailures.push(...frozenResult.failures);

  if (integrityFailures.length > 0) {
    throw new PackIntegrityError(integrityFailures[0].code, integrityFailures);
  }

  // ---- Assemble the durable records (whitelist; payloads byte-exact). ----
  const calls = rawRecords.map(({ kind, record }) => callEntry(record, kind));
  // Deterministic order: by provenance.
  calls.sort((a, b) => String(a.provenance).localeCompare(String(b.provenance)));

  const expectedCount = manifest.callPlan.hardMaximumCalls;
  const captured = calls.length;
  const failed = calls.filter((call) => call.kind === "failure").length;
  const complete = captured === expectedCount;
  // A completion that did not parse, carried a parse error, or was refused by the structural contract is
  // a non-green outcome. These fields were rederived from the exact completion bytes during integrity
  // prevalidation (a divergence refused the pack), so the recomputed truth — not a trusted record — now
  // governs the exporter's own green.
  const completions = calls.filter((call) => call.kind === "completion");
  const parseFailures = completions.filter((call) => call.parsed !== true || call.error != null).length;
  const assessmentFailures = completions.filter((call) => call.assessmentError != null).length;
  const identityCounts = { match: 0, mismatch: 0, unknown: 0, invalid: 0 };
  const reportedModels = new Set();
  for (const call of completions) {
    if (call.modelIdentity in identityCounts) identityCounts[call.modelIdentity] += 1;
    if (call.modelReported) reportedModels.add(call.modelReported);
  }
  const findings = calls.flatMap((call) =>
    call.hygieneFindings.map((finding) => ({ ...finding, provenance: call.provenance }))
  );

  const frozen = frozenResult.frozen;
  const frozenOk = Object.values(frozen).every((entry) => entry.matchesFrozen === true);

  // Own green calculation: structural integrity + complete plan + zero failures + zero structural
  // completion failures + frozen baseline + every completion call's backend-reported identity a match.
  // The report's verdict is **never** inherited: agreement is required, and a report that claims green
  // when this calculation does not is itself fail-closed.
  const allCompletionIdentityMatch = completions.every((call) => call.modelIdentity === "match");
  const structuralGreen =
    complete &&
    failed === 0 &&
    parseFailures === 0 &&
    assessmentFailures === 0 &&
    frozenOk &&
    allCompletionIdentityMatch;
  const reportGreen = report.green === true;
  const reportGreenAgrees = reportGreen === structuralGreen;
  const green = structuralGreen && reportGreen && reportGreenAgrees;

  const packManifest = {
    backendVersion: "unknown",
    complete,
    counts: {
      assessedFailures: assessmentFailures,
      captured,
      expected: expectedCount,
      failed,
      matchesPlan: complete,
      parseFailures,
      totalCalls: report.totalCalls ?? null,
    },
    decodingParameters: manifest.decodingParameters,
    decodeMetadata: {
      captureOrder: "encode-as-extracted -> base64 + sha256 -> then parse",
      completionEncoding: "utf-8",
      requestEncoding: "utf-8",
      tokensSanitized: false,
    },
    frozenManifest: {
      artifactId: manifest.artifactId,
      manifestVersion: manifest.manifestVersion,
      path: manifestPath ? manifestPath.replace(`${repo}/`, "") : null,
      sha256: manifestPath && existsSync(manifestPath) ? sha256File(manifestPath) : null,
    },
    frozenArtifacts: frozen,
    generatedAt: now,
    green,
    hygiene: { findings, scanned: true },
    implementationRevision: report.revision ?? "unknown",
    integrity: {
      ok: true,
      checked: true,
      expectedCalls: expectedCount,
      capturedCalls: captured,
      completionAssessmentFailures: assessmentFailures,
      completionParseFailures: parseFailures,
      frozenManifestSha256Required: true,
      reportGreen,
      reportGreenAgrees,
      structuralGreen,
    },
    mock,
    modelArtifactHash: "unknown",
    modelIdentityCounts: identityCounts,
    packSchema: PACK_SCHEMA,
    requestedBackendVersion: "unknown",
    requestedModel: manifest.identity.model,
    reportedModels: [...reportedModels].sort(),
    runId,
    seedPolicy: manifest.seeds.semanticPolicy,
    seeds: manifest.seeds.semanticPredeclared,
    transportBudgets: manifest.transportBudgetsApproved,
  };
  if (mock) {
    packManifest.note = "MOCK RUN — no genuine model output. Produced by an in-process mock generator for testing; carries no semantic result.";
  }

  // Exclusive, once-only: never merge into or overwrite an existing pack directory.
  if (existsSync(packDir)) throw new Error(`exportPack: pack directory already exists (refusing to overwrite): ${packDir}`);
  mkdirSync(packDir, { recursive: false });
  // Write the call records first, the binding manifest LAST (the completion marker of the pack).
  writeFileSync(join(packDir, "calls.json"), `${JSON.stringify(calls, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  writeFileSync(join(packDir, "run-manifest.json"), `${JSON.stringify(packManifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  return {
    calls: captured,
    complete,
    counts: packManifest.counts,
    findings,
    green,
    path: packDir,
    written: true,
  };
}

/** Resolve the durable pack directory for a run id under the repository's `docs/` tree. */
export function packDirFor(repo, runId) {
  return resolve(repo, PACKS_ROOT_REL, runId);
}

/**
 * CLI: export one local capture directory into a durable pack.
 *
 *   bun harness/librarian-generation/export-pack.mjs --capture <dir> --run-id <id> [--out <dir>] [--mock]
 *
 * Without `--out` the pack is written to `docs/librarian-reconciliation/semantic-runs/<runId>/`. Exit 0
 * only when the pack is green; exit 1 when it is written but non-green (incomplete or failed); exit 2 on
 * a usage error; exit 3 on an integrity refusal (nothing written).
 */
export async function main(argv) {
  const flag = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const captureDir = flag("--capture");
  const runId = flag("--run-id");
  if (!captureDir || !runId) {
    console.error("usage: export-pack.mjs --capture <dir> --run-id <id> [--out <dir>] [--mock]");
    return 2;
  }
  const repo = resolve(import.meta.dir, "..", "..");
  const manifestPath = join(import.meta.dir, "run-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const packDir = flag("--out") ? resolve(flag("--out")) : packDirFor(repo, runId);
  let result;
  try {
    result = exportPack({
      captureDir: resolve(captureDir),
      manifest,
      manifestPath,
      mock: argv.includes("--mock"),
      packDir,
      repo,
      runId,
    });
  } catch (error) {
    if (error instanceof PackIntegrityError) {
      console.error(`export: integrity failure — ${error.reason} (nothing written)`);
      for (const failure of error.failures.slice(0, 10)) console.error(`  - ${failure.code}: ${failure.detail}`);
      return 3;
    }
    throw error;
  }
  if (!result.written) {
    console.error(`export: not written — ${result.reason}`);
    return 1;
  }
  console.log(
    `export: ${result.counts.captured}/${result.counts.expected} calls; green=${result.green}; ` +
      `complete=${result.complete}; findings=${result.findings.length}; dir=${result.path}`
  );
  return result.green ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
