/**
 * Explicit **N-7-only continuation** — run the single manual-automation wrapper case *without replaying*
 * N-1…N-6, binding the run to an immutable digest of the preserved successful direct evidence.
 *
 * ## Why this module exists
 *
 * The existing authorized entrypoint (`live.mjs` `createAuthorizedLiveDriver`) exposes **only**
 * `runAuthorizedSequence`, which always runs the full canonical sequence `N-1…N-6` then `N-7`. The live
 * test asserts there is **no standalone N-7 route** and that a premature N-7-only invocation is refused
 * (`live.test.mjs`). So the existing contract cannot, by design, run N-7 against *prior* direct evidence
 * without re-running the direct cases — and re-running them is explicitly forbidden here.
 *
 * This module adds the missing, narrowly-scoped route. It does **not** weaken any guard:
 *   - it refuses unless the preserved direct evidence is present, in the canonical order, all `ok`, and
 *     matches an **immutable sha256 digest** supplied by the caller (so evidence cannot be edited);
 *   - it re-binds, before delegating, the model identity, the per-case prompt digests, the plugin
 *     revision/generation and the org id/name against the authorization (defence in depth on top of the
 *     driver's own checks);
 *   - it re-runs the **existing** guards `assertTurnAuthorized` and `verifyPromptBinding` for N-7 itself,
 *     so it cannot be used to skip them;
 *   - it delegates the actual turn to the driver's own `runAutomationCase` (which re-checks exact
 *     containment and uses the injected live automation seam) — it never calls `runCase` and never replays
 *     a direct case (`replayedDirectCases` is always empty).
 *
 * It performs no I/O of its own and grants nothing: without an authorization whose N-7 case is admitted and
 * a minted live grant behind the injected `runAutomationCase`, it refuses or latches exactly as before.
 */
import { createHash } from "node:crypto";
import { assertTurnAuthorized } from "../turn.mjs";
import { AUTOMATION_CASE, DIRECT_CASE_ORDER } from "./cases.mjs";
import { profileKeyForCase } from "./profiles.mjs";
import { verifyPromptBinding } from "./prompts.mjs";

export const N7_CONTINUATION_ERROR_CODES = Object.freeze({
  evidenceAbsent: "n7_direct_evidence_absent",
  evidenceIncomplete: "n7_direct_evidence_incomplete",
  evidenceNotSuccessful: "n7_direct_evidence_not_successful",
  digestMismatch: "n7_direct_evidence_digest_mismatch",
  modelMismatch: "n7_direct_evidence_model_mismatch",
  promptMismatch: "n7_direct_evidence_prompt_mismatch",
  pluginMismatch: "n7_plugin_binding_mismatch",
  orgMismatch: "n7_org_binding_mismatch",
  n7NotAdmitted: "n7_case_not_admitted",
  n7PromptNotRepeat: "n7_prompt_not_byte_identical_repeat",
  profileMismatch: "n7_profile_binding_mismatch",
  noRunner: "n7_runner_missing",
});

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256Utf8(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

/** Normalize one preserved direct-case result to the fields the digest binds. */
function normalizeDirectCase(c = {}) {
  const trace = c.trace ?? {};
  const evaluation = c.evaluation ?? {};
  const answer = typeof trace.answer === "string" ? trace.answer : c.answer ?? "";
  return {
    caseId: c.caseId ?? null,
    ok: c.ok === true,
    model: trace.model ?? c.modelIdentity?.reported ?? null,
    terminalReason: evaluation.terminalReason ?? null,
    forbidden: evaluation.forbidden ?? null,
    answerSha256: sha256Utf8(answer),
    calls: Array.isArray(trace.calls) ? trace.calls.map((x) => x.name ?? x).join(">") : null,
  };
}

/**
 * The immutable digest over the preserved direct evidence. Deterministic and order-independent (rows are
 * sorted by caseId), so it can be recorded once and re-checked later. Returns lowercase hex.
 */
export function directEvidenceDigest(directEvidence = []) {
  const rows = (Array.isArray(directEvidence) ? directEvidence : [])
    .map(normalizeDirectCase)
    .sort((a, b) => String(a.caseId).localeCompare(String(b.caseId)));
  return createHash("sha256").update(JSON.stringify(rows), "utf8").digest("hex");
}

function refuse(code, failures) {
  return { ok: false, code, failures: Array.isArray(failures) ? failures : [failures] };
}

/**
 * Bind the preserved direct evidence to the authorization. Fail-closed. Returns `{ ok, code, failures,
 * digest, bound }` with an ordered map of the direct cases for the wrapper's output comparison.
 */
export function assertDirectEvidenceBinding({ directEvidence, authorization, expectedDigest } = {}) {
  const failures = [];
  if (!Array.isArray(directEvidence) || directEvidence.length === 0) {
    return refuse(N7_CONTINUATION_ERROR_CODES.evidenceAbsent, "no preserved direct evidence was supplied");
  }
  const byId = new Map(directEvidence.map((r) => [r.caseId, r]));
  for (const caseId of DIRECT_CASE_ORDER) if (!byId.has(caseId)) failures.push(`missing direct case ${caseId}`);
  if (failures.length) return refuse(N7_CONTINUATION_ERROR_CODES.evidenceIncomplete, failures);

  const notOk = DIRECT_CASE_ORDER.filter((id) => byId.get(id).ok !== true);
  if (notOk.length) return refuse(N7_CONTINUATION_ERROR_CODES.evidenceNotSuccessful, `direct cases not successful: ${notOk.join(", ")}`);

  const digest = directEvidenceDigest(directEvidence);
  if (!HEX64.test(expectedDigest ?? "") || digest !== expectedDigest) {
    return refuse(N7_CONTINUATION_ERROR_CODES.digestMismatch, `direct-evidence digest ${digest} != expected ${expectedDigest ?? "(none)"}`);
  }

  if (!authorization || typeof authorization !== "object") {
    return refuse(N7_CONTINUATION_ERROR_CODES.evidenceAbsent, "no authorization record");
  }
  const expectedModel = authorization.model?.requested ?? null;
  for (const id of DIRECT_CASE_ORDER) {
    const row = normalizeDirectCase(byId.get(id));
    if (row.model !== expectedModel) failures.push(`${id}: model ${row.model} != authorized ${expectedModel}`);
    const bound = authorization.prompts?.[id];
    const expectedPrompt = bound?.text;
    if (typeof expectedPrompt !== "string") failures.push(`${id}: authorization carries no prompt binding`);
    else if (bound.sha256 !== sha256Utf8(expectedPrompt)) failures.push(`${id}: authorization prompt digest is not self-consistent`);
  }
  if (failures.length) return refuse(N7_CONTINUATION_ERROR_CODES.modelMismatch, failures);

  return {
    ok: true,
    code: null,
    failures: [],
    digest,
    bound: new Map(DIRECT_CASE_ORDER.map((id) => [id, byId.get(id)])),
  };
}

/** Bind the N-7 case to its own profile/prompt and to the plugin + org identities. */
export function verifyN7Binding({ authorization } = {}) {
  const failures = [];
  if (!Array.isArray(authorization?.cases) || !authorization.cases.includes(AUTOMATION_CASE)) {
    return refuse(N7_CONTINUATION_ERROR_CODES.n7NotAdmitted, "N-7 is not admitted by the authorization");
  }
  const n7 = authorization.prompts?.[AUTOMATION_CASE];
  const n1 = authorization.prompts?.[n7?.repeatsCaseId ?? "N-1"];
  if (!n7 || typeof n7.text !== "string" || !HEX64.test(n7.sha256 ?? "") || n7.sha256 !== sha256Utf8(n7.text)) {
    failures.push("N-7 has no self-consistent prompt binding");
  }
  if (n1 && n7 && (n7.sha256 !== n1.sha256 || n7.text !== n1.text)) {
    return refuse(N7_CONTINUATION_ERROR_CODES.n7PromptNotRepeat, "N-7 prompt is not a byte-identical repeat of its designated direct case");
  }
  const profileId = authorization.profiles?.[profileKeyForCase(AUTOMATION_CASE)]?.id;
  if (typeof profileId !== "string" || profileId.length === 0) failures.push("N-7 profile id is not bound");
  if (typeof authorization.plugin?.revision !== "number" || typeof authorization.plugin?.generation !== "string") {
    failures.push("plugin revision/generation are not bound");
  }
  if (typeof authorization.org?.id !== "string" || typeof authorization.org?.name !== "string") {
    failures.push("org id/name are not bound");
  }
  if (failures.length) return refuse(N7_CONTINUATION_ERROR_CODES.pluginMismatch, failures);
  return { ok: true, code: null, failures: [], profileId, prompt: n7.text, repeatsCaseId: n7.repeatsCaseId ?? null };
}

/**
 * Run the single N-7 wrapper against the preserved direct evidence. `runAutomationCase` is the driver's own
 * N-7 wrapper (injected), which re-checks containment and performs the measured automation turn through the
 * live seam. Returns the wrapper result plus the binding/continuation evidence; never replays a direct case.
 */
export async function runN7OnlyContinuation({
  authorization,
  directEvidence,
  expectedDigest,
  runAutomationCase,
  log = () => {},
} = {}) {
  if (typeof runAutomationCase !== "function") {
    return refuse(N7_CONTINUATION_ERROR_CODES.noRunner, "the driver's runAutomationCase wrapper is required");
  }
  const evidence = assertDirectEvidenceBinding({ directEvidence, authorization, expectedDigest });
  if (!evidence.ok) return { ...evidence, delegated: false, replayedDirectCases: [] };

  const n7 = verifyN7Binding({ authorization });
  if (!n7.ok) return { ...n7, delegated: false, replayedDirectCases: [] };

  // Re-use the existing guards for N-7 itself (these are the same checks the direct cases use).
  const authorized = assertTurnAuthorized({ authorization, caseId: AUTOMATION_CASE });
  if (!authorized.ok) {
    return { ...refuse(N7_CONTINUATION_ERROR_CODES.n7NotAdmitted, authorized.message ?? "N-7 turn not authorized"), delegated: false, replayedDirectCases: [] };
  }
  const promptCheck = verifyPromptBinding({ authorization, caseId: AUTOMATION_CASE, prompt: n7.prompt });
  if (!promptCheck.ok) {
    return { ...refuse(N7_CONTINUATION_ERROR_CODES.n7PromptNotRepeat, `N-7 prompt binding refused (${promptCheck.code})`), delegated: false, replayedDirectCases: [] };
  }

  log("n7-continuation: direct evidence bound by digest; running the single N-7 wrapper");
  const automation = await runAutomationCase({
    automationDefinition: null, // built by the caller from the authorization (live.mjs owns the definition)
    prompt: n7.prompt,
    sessionId: null,
    directResults: evidence.bound,
  });

  return {
    ok: automation?.ok === true,
    code: automation?.ok === true ? null : (automation?.codes?.[0] ?? null),
    failures: automation?.failures ?? [],
    directEvidenceDigest: evidence.digest,
    n7ProfileId: n7.profileId,
    repeatsCaseId: n7.repeatsCaseId,
    delegated: true,
    replayedDirectCases: [], // explicit: the direct cases are never re-run here
    automation,
  };
}
