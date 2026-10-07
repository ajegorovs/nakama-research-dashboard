/**
 * The owning Nakama E2E driver: the atomic measured-experiment sequence.
 *
 * Replaces the blocked `turn.mjs` / `automation.mjs` scaffolds with an owning orchestrator whose single
 * unit of work is **one atomic experiment** for one case. The ordered sequence is fixed by the
 * host-amendment ruling and is not configurable:
 *
 *   bind identity/authorization  →  pin store + snapshot (before)
 *     →  exact authorized prompt (no substitution)
 *     →  arm host-control policy + turn-scoped deadline
 *     →  one turn
 *     →  full ordered trace (calls, arguments, answer, model + usage evidence)
 *     →  pin store + snapshot (after) and compare
 *     →  classify
 *
 * Any forbidden call, missing/malformed trace, mutation, identity/model mismatch, timeout or unknown
 * transport outcome **latches the sequence stop**; there are no retries and no replacement cases. The
 * driver does **not** itself perform I/O: every side-effecting step is an injected port, so the whole
 * sequence is exercised offline with local adapters while the default ports stay blocked (`turn.mjs`
 * keeps `INFERENCE_AUTHORIZED = false`; a real run additionally needs the amended-host contract, which is
 * absent — see `authorization.mjs` `authorizeExecution`).
 *
 * OFFLINE-ONLY. `createDriver` is the flexible, transport-agnostic composition used by the offline tests
 * and by the live entrypoint internally; it is **not** an authorized live route. It does not itself
 * consult `authorizeExecution`/`assertInferenceAuthorized`, and its `runSequence({ cases })` is
 * configurable, so a caller must not wire it to a live transport directly. The live transports
 * (`http-adapters.mjs`) refuse to build without a live grant, and a grant can only be minted by
 * `live-grant.mjs` `mintLiveGrant`, which **itself** runs both gates (called by `live.mjs`
 * `createAuthorizedLiveDriver`); that entrypoint derives every authorization-owned value from the record's
 * frozen clone and enforces the exact canonical N-1…N-6 → N-7 single-shot sequence with a bound pre-pin. A
 * real run goes through that entrypoint — never through this module plus a raw factory.
 */
import { assertIdentityPinned, assertNoLogicalMutation, canonicalSnapshot, pinActiveStoreIdentity } from "../snapshot.mjs";
import { classifyTurnTrace, parseTurnTrace } from "../trace.mjs";
import { createBudgetTracker } from "./budgets.mjs";
import { caseBudgetFor } from "./budgets.mjs";
import { assertContainmentExact } from "./containment.mjs";
import { FIXTURE_PROFILES, profileKeyForCase } from "./profiles.mjs";
import { PROMPT_BINDINGS, verifyPromptBinding } from "./prompts.mjs";
import {
  assertHostSession,
  buildEvaluationBinding,
  dispatchLogFromResult,
  isDefaultInert,
  localDeriveConversationToken,
} from "./host-session.mjs";
import { STOP_REASONS } from "./stop-latch.mjs";
import { assertTurnAuthorized } from "../turn.mjs";
import { runOwnedAutomation } from "../automation.mjs";
import { AUTOMATION_CASE, CASE_SPECS, DIRECT_CASE_ORDER } from "./cases.mjs";

/** Result of one atomic experiment. Always carries the evidence, pass or terminal. */
function experimentResult({ caseId, spec, ok, codes = [], failures = [], extra = {} }) {
  return {
    caseId,
    phase: spec?.phase ?? null,
    tier: spec?.tier ?? null,
    semanticScored: spec?.semanticScored ?? false,
    ok,
    terminal: !ok,
    codes,
    failures,
    ...extra,
  };
}

/**
 * Build a driver over injected ports. Required ports:
 *
 *   - `authorization` — a validated authorization record (see `authorization.mjs`);
 *   - `createHostSession({ caseId, sessionId })` — builds a fresh host `AgentChatSession` for one case, on
 *     which the case's policy is bound (see `host-session.mjs`); binding is single-shot, so one session per
 *     case matches the host contract;
 *   - `readTrace`     — `async ({ sessionId }) => rows` over the platform DB;
 *   - `pinStore`, `snapshotStore`, `pinOptions` — the store identity/snapshot seams;
 *   - `latch`         — a stop latch (`createStopLatch`);
 *   - `budgets`       — the whole-experiment budget configuration.
 *
 * Optional: `automationApi` (the owned-worker seam for N-7), `checkContainment` (a per-case containment
 * read — fail-closed; a live run must supply it), `expectedModel`, `expectedProvider`,
 * `turnDeadlineMs` (defaults to the case budget's `deadlineMs`), `deriveToken` (the host's
 * `deriveConversationToken`), `log`.
 */
export function createDriver({
  authorization,
  createHostSession,
  readTrace,
  pinStore = pinActiveStoreIdentity,
  snapshotStore = canonicalSnapshot,
  pinOptions = {},
  latch,
  budgets,
  automationApi = null,
  // Optional scoped-automation-eligibility seam for the N-7 wrapper only. When supplied, the owned
  // automation (definition install + single run) executes inside `withAutomationEligibility({ caseId,
  // profileKey, profileId, log, run })`, which is expected to scope any profile-flag enable to that window
  // and restore it exactly. It is applied AFTER the driver's containment gate (which still requires the
  // profile desired-off) and never touches read-only tool policy. Absent, the wrapper runs unchanged.
  withAutomationEligibility = null,
  expectedModel = authorization?.model?.requested ?? null,
  expectedProvider = authorization?.provider?.name ?? null,
  turnDeadlineMs = null,
  checkContainment = null,
  deriveToken = localDeriveConversationToken,
  log = () => {},
} = {}) {
  if (!latch) throw new Error("createDriver: a stop latch is required");
  if (!budgets) throw new Error("createDriver: budgets are required");
  const budgetTracker = createBudgetTracker(budgets);

  /**
   * Containment gate — **required and exact** (reviewer corrections, "Containment after restart"). Before
   * every case the driver re-reads containment through the injected `checkContainment` port and compares it
   * against the case's **authorized profile's exact expected state** (profile id, exactly its assigned
   * plugin tools, exactly the one assigned skill, worker desired-off). Fail-closed: a missing port, a port
   * that throws, a port reporting `ok:false`, or any observed drift latches the sequence. There is **no
   * automatic re-application and no repair-and-continue** — recovery is an explicit, separately-authorized
   * act the parent performs, so an absent port is itself a terminal refusal, never `"unchecked"`.
   *
   * Returns `{ ok, profileId }` on success; otherwise `{ ok:false, reason }` (and latches).
   */
  function gateContainment({ caseId, profileKey, profileId }) {
    if (typeof checkContainment !== "function") {
      const reason = "no containment port supplied: exact containment is required before every case (fail closed)";
      latch.stop(STOP_REASONS.containmentChanged, reason);
      return { ok: false, reason };
    }
    let observed;
    try {
      observed = checkContainment({ caseId, profileId, profileKey });
    } catch (error) {
      observed = { ok: false, detail: `containment check threw: ${error?.message ?? error}` };
    }
    if (!observed || observed.ok === false) {
      const reason = observed?.detail ?? observed?.reason ?? "containment could not be verified";
      latch.stop(STOP_REASONS.containmentChanged, reason);
      return { ok: false, reason };
    }
    const check = assertContainmentExact({ observed, profileKey });
    if (!check.ok) {
      const reason = `containment is not the expected exact state for ${profileKey}: ${check.failures.join("; ")}`;
      latch.stop(STOP_REASONS.containmentChanged, reason);
      return { ok: false, reason, code: check.code };
    }
    return { ok: true, contained: true, profileId, profileKey };
  }

  /** The measured core of one case: everything between the pre-pin and the classification. */
  async function measureTurn({ caseId, spec, prompt, sessionId, hostSession, profileId }) {
    const allowedCalls = authorization?.effectiveAllowedCalls?.[caseId] ?? null;

    // 1. Pre-pin + pre-snapshot: the identity the experiment is handed, before anything moves.
    let pinBefore;
    let snapBefore;
    try {
      pinBefore = pinStore(pinOptions);
      snapBefore = snapshotStore(pinBefore.path);
    } catch (error) {
      return { pre: false, codes: [STOP_REASONS.identityMismatch], failures: [`pre-pin failed: ${error.message}`] };
    }

    // 2. Build and bind the case's evaluation policy. Default-inert is required before binding.
    if (!isDefaultInert(hostSession)) {
      return { pre: true, pinBefore, codes: [STOP_REASONS.hostControlAbsent], failures: ["host policy was not inert before the case"] };
    }
    const caseBudget = caseBudgetFor(caseId);
    const binding = buildEvaluationBinding({
      caseId,
      scope: {
        orgId: authorization?.org?.id ?? "",
        profileId: profileId ?? authorization?.profiles?.[profileKeyForCase(caseId)]?.id ?? "",
        ...(caseId === AUTOMATION_CASE && sessionId ? { automationId: sessionId } : {}),
      },
      allowedTools: allowedCalls,
      limits: {
        modelGenerationLimit: caseBudget.modelGenerations,
        toolCallLimit: caseBudget.toolCalls,
        turnDeadlineMs: turnDeadlineMs ?? caseBudget.deadlineMs,
      },
      deriveToken,
    });
    try {
      hostSession.bindEvaluationPolicy(binding);
    } catch (error) {
      return { pre: true, pinBefore, codes: [STOP_REASONS.hostControlAbsent], failures: [`could not bind policy: ${error.message}`] };
    }

    // 3. One turn under the host's own turn-scoped deadline (armed by the bound policy). Budgets are read
    //    back from the host's terminal result rather than pre-charged, so the counters reflect what ran.
    budgetTracker.startTurn();
    let abortReason = null;
    let transportError = null;
    try {
      await hostSession.send({ message: prompt });
    } catch (error) {
      transportError = error?.message ?? String(error);
    }
    const evaluation = hostSession.getEvaluationResult();
    let budgetExceeded = false;
    try {
      budgetTracker.consumeGeneration(evaluation?.modelGenerations ?? 0);
    } catch {
      budgetExceeded = true;
    }
    const dispatchLog = dispatchLogFromResult(evaluation);
    try {
      budgetTracker.consumeTools(evaluation?.toolExecutions ?? 0);
    } catch {
      budgetExceeded = true;
    }
    if (evaluation) {
      if (evaluation.terminalReason === "turn-deadline-exceeded") abortReason = "turn_deadline_exceeded";
      else if (
        evaluation.terminalReason === "tool-call-budget-exhausted" ||
        evaluation.terminalReason === "model-generation-budget-exhausted"
      ) {
        budgetExceeded = true;
      }
    }

    const usage = {
      identity: { pinBefore, pinAfter: null },
      modelIdentity: {
        requested: authorization?.model?.requested ?? null,
        reported: null,
        identityKind: authorization?.model?.identityKind ?? null,
        immutableWeightsClaim: false,
      },
      evaluation: evaluation ?? null,
      dispatchLog,
      budget: budgetTracker.snapshot(),
    };

    // 4. Unknown transport outcome latches — the request may or may not have been applied.
    if (transportError) {
      return {
        pre: true,
        pinBefore,
        codes: [STOP_REASONS.unknownTransport],
        failures: [`transport outcome unknown: ${transportError}`],
        forced: "unknown_transport",
        extra: usage,
      };
    }

    // 5. Read the full ordered trace from the platform DB (read-only). A live HTTP host session knows the
    //    id it created (the driver's caller-supplied id is only a label), so the read addresses the real id.
    let rows = null;
    let readError = null;
    const traceSessionId = typeof hostSession.sessionId === "string" && hostSession.sessionId.length > 0 ? hostSession.sessionId : sessionId;
    try {
      rows = await readTrace({ sessionId: traceSessionId, caseId });
    } catch (error) {
      readError = error?.message ?? String(error);
    }
    const trace = readError ? { ok: false, reason: "malformed_trace" } : parseTurnTrace(rows);
    usage.modelIdentity.reported = trace.ok ? trace.model : null;

    // 6. Post-pin + post-snapshot and compare.
    let mutationCodes = [];
    let mutationFailures = [];
    try {
      const pinAfter = pinStore(pinOptions);
      const snapAfter = snapshotStore(pinAfter.path);
      const pinned = assertIdentityPinned(pinBefore, pinAfter);
      if (!pinned.ok) {
        mutationCodes.push(STOP_REASONS.identityMismatch);
        mutationFailures.push(...pinned.failures);
      }
      const unchanged = assertNoLogicalMutation({ before: snapBefore, after: snapAfter, pinBefore, pinAfter });
      if (!unchanged.ok) {
        mutationCodes.push(STOP_REASONS.mutation);
        mutationFailures.push(...unchanged.failures);
      }
      usage.identity.pinAfter = pinAfter;
    } catch (error) {
      mutationCodes.push(STOP_REASONS.identityMismatch);
      mutationFailures.push(`post-pin failed: ${error.message}`);
    }

    // 7. Classify the trace, then fold in mutation/transport causes. Any failure is terminal.
    const verdict = classifyTurnTrace({
      trace,
      allowedCalls,
      dispatchLog,
      requireConsultation: spec.requireConsultation,
      requireRead: spec.requireRead,
      expectedModel,
      expectedProvider,
      abortReason,
      budgetExceeded,
    });
    const codes = [...new Set([...mutationCodes, ...verdict.codes])];
    const failures = [...mutationFailures, ...verdict.failures.map((f) => f.message)];

    usage.trace = {
      calls: trace.ok ? trace.calls : [],
      callsWithArgs: trace.ok ? trace.callsWithArgs : [],
      answer: trace.ok ? trace.answer : null,
      usage: trace.ok ? trace.usage : null,
      model: trace.ok ? trace.model : null,
      provider: trace.ok ? trace.provider : null,
      traceReason: trace.reason ?? null,
    };

    if (codes.length > 0) {
      return { pre: true, pinBefore, codes, failures, extra: usage };
    }
    return { pre: true, pinBefore, codes: [], failures: [], extra: usage };
  }

  /** Run one case as an atomic experiment. Latches the sequence on any terminal failure. */
  async function runCase({ caseId, prompt, sessionId }) {
    const spec = CASE_SPECS[caseId];
    if (!spec) return experimentResult({ caseId, spec: null, ok: false, codes: [STOP_REASONS.authorizationRefused], failures: [`unknown case ${caseId}`] });
    if (latch.stopped) {
      return experimentResult({ caseId, spec, ok: false, codes: [latch.reason], failures: ["sequence already latched"], extra: { skipped: true } });
    }

    const authorized = assertTurnAuthorized({ authorization, caseId });
    if (!authorized.ok) {
      latch.stop(STOP_REASONS.authorizationRefused, authorized.message);
      return experimentResult({ caseId, spec, ok: false, codes: [STOP_REASONS.authorizationRefused], failures: [authorized.message] });
    }

    // Prompt binding (corrections, item 2): the caller's prompt must match the authorization's exact
    // bytes/digest. Verified BEFORE any session is created; even a one-byte difference refuses, and the
    // authorized bytes are what is actually sent (the caller's string is never substituted on mismatch).
    const promptCheck = verifyPromptBinding({ authorization, caseId, prompt });
    if (!promptCheck.ok) {
      latch.stop(STOP_REASONS.promptMismatch, promptCheck.code);
      return experimentResult({
        caseId,
        spec,
        ok: false,
        codes: [STOP_REASONS.promptMismatch],
        failures: [`prompt binding refused (${promptCheck.code})`],
        extra: { prompt: promptCheck },
      });
    }

    // The case's authorized profile: session, evaluation policy scope and containment all use this one id.
    const profileKey = profileKeyForCase(caseId);
    const profileId = FIXTURE_PROFILES[profileKey].id;

    // Exact containment (required) is re-checked before every case and latches on any drift; no repair.
    const containment = gateContainment({ caseId, profileKey, profileId });
    if (containment.ok === false) {
      return experimentResult({ caseId, spec, ok: false, codes: [STOP_REASONS.containmentChanged], failures: [containment.reason], extra: { containment, profileKey, profileId } });
    }

    let hostSession;
    try {
      hostSession = createHostSession({ caseId, profileId, profileKey, sessionId });
    } catch (error) {
      latch.stop(STOP_REASONS.hostControlAbsent, error?.message ?? String(error));
      return experimentResult({ caseId, spec, ok: false, codes: [STOP_REASONS.hostControlAbsent], failures: [`host session factory failed: ${error?.message ?? error}`] });
    }
    const hc = assertHostSession(hostSession);
    if (!hc.ok) {
      latch.stop(STOP_REASONS.hostControlAbsent, hc.code);
      return experimentResult({ caseId, spec, ok: false, codes: [STOP_REASONS.hostControlAbsent], failures: hc.failures, extra: { containment } });
    }

    log(`driver: ${caseId} (${spec.phase}/${spec.tier}/${profileKey})`);
    const measured = await measureTurn({ caseId, spec, prompt, sessionId, hostSession, profileId });
    if (measured.codes.length > 0) {
      latch.stop(measured.codes[0], measured.failures[0] ?? "");
      return experimentResult({ caseId, spec, ok: false, codes: measured.codes, failures: measured.failures, extra: { ...(measured.extra ?? {}), containment, profileKey, profileId } });
    }
    return experimentResult({ caseId, spec, ok: true, extra: { evaluation: measured.extra.evaluation, identity: measured.extra.identity, modelIdentity: measured.extra.modelIdentity, trace: measured.extra.trace, dispatchLog: measured.extra.dispatchLog, budget: measured.extra.budget, containment, profileKey, profileId } });
  }

  /**
   * Run the direct sequence (N-1 smoke → N-2…N-6) and, only if every direct case passed, the single
   * downstream N-7 automation. N-7's failure is returned in `automation` and **never erases** the direct
   * results: the caller gets `direct` (with its own latch view) regardless.
   */
  async function runSequence({ prompts = {}, sessions = {}, cases = DIRECT_CASE_ORDER, runAutomation = true, automationDefinition = null } = {}) {
    const direct = [];
    for (const caseId of cases) {
      direct.push(await runCase({ caseId, prompt: prompts[caseId], sessionId: sessions[caseId] }));
      if (latch.stopped) break;
    }
    const directOk = direct.length === cases.length && direct.every((r) => r.ok);

    let automation = null;
    if (runAutomation && authorization?.cases?.includes(AUTOMATION_CASE)) {
      if (!directOk) {
        automation = { caseId: AUTOMATION_CASE, ok: false, terminal: true, skipped: true, codes: [STOP_REASONS.automationFailure], failures: ["N-7 skipped: direct cases did not all pass"] };
      } else {
        automation = await runAutomationCase({
          automationDefinition,
          prompt: prompts[AUTOMATION_CASE],
          sessionId: sessions[AUTOMATION_CASE],
          directResults: new Map(direct.map((r) => [r.caseId, r])),
        });
      }
    }
    return { direct, directOk, automation, latch: latch.snapshot() };
  }

  /** The N-7 wrapper: owned worker start/stop around exactly one measured manual automation. */
  async function runAutomationCase({ automationDefinition, prompt, sessionId, directResults = new Map() }) {
    const spec = CASE_SPECS[AUTOMATION_CASE];
    if (!automationApi) {
      return experimentResult({ caseId: AUTOMATION_CASE, spec, ok: false, codes: [STOP_REASONS.hostControlAbsent], failures: ["no automation worker seam supplied"] });
    }
    // N-7 repeats a designated direct read-only case byte-for-byte; its prompt is that case's prompt and
    // its prompt binding (and therefore its digest) is the same. The direct case's result is retained for
    // the wrapper's output comparison.
    const repeatsCaseId = PROMPT_BINDINGS[AUTOMATION_CASE].repeatsCaseId ?? null;
    const profileKey = profileKeyForCase(AUTOMATION_CASE);
    const profileId = FIXTURE_PROFILES[profileKey].id;
    // Exact containment (required) is re-checked before the automation case too (the worker start is a
    // side effect); the port must report the profile desired-off before the wrapper raises the worker.
    const containment = gateContainment({ caseId: AUTOMATION_CASE, profileKey, profileId });
    if (containment.ok === false) {
      return experimentResult({ caseId: AUTOMATION_CASE, spec, ok: false, codes: [STOP_REASONS.containmentChanged], failures: [containment.reason], extra: { containment, profileKey, profileId } });
    }
    let measured = null;
    const runOwned = () => runOwnedAutomation({
      api: automationApi,
      definition: automationDefinition,
      directValidated: true,
      allowPlatformWrite: true,
      log,
      run: async (automationId) => {
        let hostSession;
        try {
          // A live automation session is addressed by the id `createDefinition` just returned (the
          // definition is created inside this wrapper, so the caller cannot know it in advance); the
          // HTTP automation adapter runs `POST /v1/automations/{automationId}/run` from scope.automationId.
          hostSession = createHostSession({ caseId: AUTOMATION_CASE, profileId, profileKey, sessionId: automationId ?? sessionId, automationId });
        } catch (error) {
          return { ok: false, detail: `host session factory failed: ${error?.message ?? error}` };
        }
        const hc = assertHostSession(hostSession);
        if (!hc.ok) return { ok: false, detail: hc.failures[0] ?? "no host session" };
        measured = await measureTurn({ caseId: AUTOMATION_CASE, spec, prompt, sessionId: automationId ?? sessionId, hostSession, profileId });
        if (measured.codes.length > 0) return { ok: false, detail: measured.failures[0] ?? "measured turn failed" };
        return { ok: true, automationId };
      },
    });
    // Scoped automation eligibility (optional seam): run the install + single run inside the injected
    // window (which enables the profile's `automationsEnabled` for ONLY this window and restores it in a
    // `finally`). A refusal here (including a failed restore) is terminal; the wrapper is never re-run.
    let result;
    try {
      result = typeof withAutomationEligibility === "function"
        ? await withAutomationEligibility({ caseId: AUTOMATION_CASE, log, profileId, profileKey, run: runOwned })
        : await runOwned();
    } catch (error) {
      return experimentResult({
        caseId: AUTOMATION_CASE,
        spec,
        ok: false,
        codes: [STOP_REASONS.automationFailure],
        failures: [`automation eligibility window failed: ${error?.message ?? error}`],
        extra: { containment, profileKey, profileId },
      });
    }
    // Output comparison (corrections, item 2): retain the designated direct case's answer beside the
    // automation's, so the reviewer can judge preservation. This is recorded, not silently scored — N-7
    // stays a separately classified automation-wrapper result.
    const directAnswer = repeatsCaseId ? directResults.get(repeatsCaseId)?.trace?.answer ?? null : null;
    const outputComparison = {
      repeatsCaseId,
      directAnswer,
      automationAnswer: measured?.extra?.trace?.answer ?? null,
      matched: directAnswer !== null && measured?.extra?.trace?.answer !== undefined && directAnswer === measured?.extra?.trace?.answer,
    };
    if (!result.ok || (measured && measured.codes.length > 0)) {
      const codes = measured?.codes?.length ? measured.codes : [STOP_REASONS.automationFailure];
      const failures = measured?.failures?.length ? measured.failures : [result.detail ?? "automation failed"];
      return experimentResult({ caseId: AUTOMATION_CASE, spec, ok: false, codes, failures, extra: { automation: result, workerStopped: result.stopped, containment, profileKey, profileId, outputComparison } });
    }
    return experimentResult({ caseId: AUTOMATION_CASE, spec, ok: true, extra: { automation: result, workerStopped: result.stopped, evaluation: measured.extra.evaluation, identity: measured.extra.identity, modelIdentity: measured.extra.modelIdentity, trace: measured.extra.trace, dispatchLog: measured.extra.dispatchLog, budget: measured.extra.budget, containment, profileKey, profileId, outputComparison } });
  }

  return { runCase, runSequence, runAutomationCase, budgetTracker, latch };
}
