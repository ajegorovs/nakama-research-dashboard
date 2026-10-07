/**
 * Offline tests for the owning Nakama E2E driver.
 *
 * **Disjoint** from the existing `nakama-e2e.test.mjs` / `snapshot-hardening.test.mjs` (owned elsewhere;
 * not edited here). No network, no model, no live instance, no new dependency: the turn seam is the host
 * **evaluation session** contract whose policy decisions run through the **pinned host's own**
 * `createEvaluationTurnGuard`, over a scratch SQLite session store, and the default (unamended-host) path is
 * asserted blocked.
 *
 *     bun test harness/nakama-e2e/driver
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { BUDGET_MAXIMA, BudgetExceededError, PROPOSED_BUDGETS, PROPOSED_CASE_BUDGETS, caseBudgetFor, createBudgetTracker, validateBudgetConfig, validateCaseBudgets } from "./budgets.mjs";
import { createStopLatch, SequenceLatchedError, STOP_REASONS } from "./stop-latch.mjs";
import { assertHostSession, buildEvaluationBinding, dispatchLogFromResult, localDeriveConversationToken } from "./host-session.mjs";
import { hostEvaluationCoreAvailable, loadHostEvaluationCore } from "./host-evaluation-core.mjs";
import {
  ACCEPTED_HOST,
  ADMITTED_FIXTURE,
  AUTHORIZATION_ERROR_CODES,
  authorizeExecution,
  buildProposedAuthorizationRecord,
  PROVIDER_DISPOSITION,
  PROVIDER_OWNER_OVERRIDE,
  validateAuthorization,
} from "./authorization.mjs";
import { AUTOMATION_CASE, CASE_IDS, CASE_SPECS, READONLY_DASHBOARD_TOOLS, toolsForCase } from "./cases.mjs";
import { FIXTURE_PROFILES, profileKeyForCase } from "./profiles.mjs";
import { PROMPT_BINDINGS, PROMPT_DISPOSITION, sha256Utf8, verifyPromptBinding } from "./prompts.mjs";
import { loadSeedArtifact } from "../artifact.mjs";
import { assertContainmentExact } from "./containment.mjs";
import { classifyTurnTrace, parseTurnTrace } from "../trace.mjs";
import { createAuthorizedTurnPort, InferenceBlockedError } from "../turn.mjs";
import { AutomationBlockedError, buildAutomationDefinition, runOwnedAutomation } from "../automation.mjs";
import { createDriver } from "./driver.mjs";
import { createHostSessionPort, createSessionStore, createTraceReader } from "./adapters.mjs";

// The pinned host's real guard engine. Tests that need it are skipped only if the host checkout is absent.
const hostCore = hostEvaluationCoreAvailable() ? await loadHostEvaluationCore() : null;
const withHostCore = hostCore ? describe : describe.skip;
const createGuard = hostCore?.createEvaluationTurnGuard;

const scratch = mkdtempSync(join(tmpdir(), "nakama-driver-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let dbSeq = 0;
function freshStore() {
  dbSeq += 1;
  return createSessionStore(join(scratch, `session-${dbSeq}.sqlite`));
}

/** A well-formed authorization with the given cases and a read-only effective allowlist. */
function makeAuth(cases = CASE_IDS, overrides = {}) {
  const allow = Object.fromEntries(cases.map((c) => [c, [...READONLY_DASHBOARD_TOOLS]]));
  return buildProposedAuthorizationRecord({ cases, effectiveAllowedCalls: allow, ...overrides });
}

const STABLE_PIN = { generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path: join(scratch, "store.sqlite"), revision: ADMITTED_FIXTURE.pluginRevision };
const STABLE_SNAPSHOT = { counts: { development_axes: 8 }, objects: [], rows: {}, versions: {} };

/** The exact containment readback a conformant fixture would report for a case's profile. */
function exactContainment(profileKey) {
  const profile = FIXTURE_PROFILES[profileKey];
  return { ok: true, profileId: profile.id, tools: [...profile.tools], skills: profile.skill ? [profile.skill] : [], automationsEnabled: false };
}

/** Build a driver over the real host-session seam (guard-backed), one fresh session per case. */
function makeDriver({ plan, auth = makeAuth(), mutate = false, turnDeadlineMs = null, containment = null } = {}) {
  const store = freshStore();
  const latch = createStopLatch();
  let snapCalls = 0;
  const snapshotStore = () => {
    snapCalls += 1;
    if (mutate && snapCalls >= 2) return { ...STABLE_SNAPSHOT, counts: { development_axes: 9 } };
    return STABLE_SNAPSHOT;
  };
  const driver = createDriver({
    authorization: auth,
    budgets: PROPOSED_BUDGETS,
    checkContainment: containment ?? (({ profileKey }) => exactContainment(profileKey)),
    createHostSession: ({ caseId, sessionId }) => createHostSessionPort({ caseId, createGuard, plan, sessionId, store }),
    latch,
    pinOptions: {},
    pinStore: () => ({ ...STABLE_PIN }),
    readTrace: createTraceReader(store.path),
    snapshotStore,
    turnDeadlineMs,
  });
  return { driver, latch, store };
}

/** The frozen authorized prompt for a case (what a caller must send). */
const proposedPrompt = (caseId) => PROMPT_BINDINGS[caseId].text;

const readPlan = (caseId) => () => ({ calls: [{ arguments: { caseId }, name: "get_overview" }], answer: `answer for ${caseId}` });

// ------------------------------------------------------------------ budgets

describe("budgets", () => {
  test("the proposed configuration and per-case budgets are valid", () => {
    expect(validateBudgetConfig(PROPOSED_BUDGETS).ok).toBe(true);
    expect(Object.keys(PROPOSED_BUDGETS).sort()).toEqual(Object.keys(BUDGET_MAXIMA).sort());
    expect(validateCaseBudgets(PROPOSED_CASE_BUDGETS, { caseIds: CASE_IDS }).ok).toBe(true);
  });

  test("a consultation case is budgeted for the discovery loop (>= 3 generations), not 1", () => {
    expect(caseBudgetFor("N-2").modelGenerations).toBeGreaterThanOrEqual(3);
    expect(caseBudgetFor("N-2").toolCalls).toBeGreaterThanOrEqual(2);
    expect(Object.values(PROPOSED_CASE_BUDGETS).every((b) => b.modelGenerations >= 3)).toBe(true);
  });

  test("a missing field, a non-integer and an above-ceiling value are refused", () => {
    expect(validateBudgetConfig({ ...PROPOSED_BUDGETS, perTurnToolCalls: undefined }).code).toBe("budget_missing_field");
    expect(validateBudgetConfig({ ...PROPOSED_BUDGETS, perTurnTimeoutMs: 1.5 }).code).toBe("budget_not_integer");
    expect(validateBudgetConfig({ ...PROPOSED_BUDGETS, perTurnToolCalls: 99 }).code).toBe("budget_above_reviewed_ceiling");
    expect(validateCaseBudgets({ ...PROPOSED_CASE_BUDGETS, "N-2": { ...PROPOSED_CASE_BUDGETS["N-2"], modelGenerations: 99 } }, { caseIds: CASE_IDS }).code).toBe("budget_above_reviewed_ceiling");
  });

  test("provider-generation and tool counters are separate and the batch rule executes none", () => {
    const tracker = createBudgetTracker({ ...PROPOSED_BUDGETS, perTurnModelCalls: 2, perTurnToolCalls: 3, totalModelCalls: 4, totalToolCalls: 6 });
    tracker.startTurn();
    expect(tracker.consumeGeneration(1).turnModel).toBe(1);
    expect(tracker.consumeGeneration(1).turnModel).toBe(2);
    expect(() => tracker.consumeGeneration(1)).toThrow(BudgetExceededError);
    tracker.startTurn();
    expect(tracker.consumeTools(3).turnTools).toBe(3);
    // A batch of 2 no longer fits the per-turn remainder (3): it must consume none and throw.
    expect(() => tracker.consumeTools(2)).toThrow(BudgetExceededError);
    expect(tracker.snapshot().turnTools).toBe(3);
  });

  test("the wall-clock ceiling is measured from the experiment start", () => {
    const tracker = createBudgetTracker({ ...PROPOSED_BUDGETS, totalWallClockMs: 5000 }, { now: () => 1000 });
    expect(tracker.elapsedExceeded(4999)).toBe(false);
    expect(tracker.elapsedExceeded(7000)).toBe(true);
  });
});

// ------------------------------------------------------------------ stop latch

describe("stop latch", () => {
  test("the first stop wins and never reopens", () => {
    const latch = createStopLatch();
    latch.stop(STOP_REASONS.timeout, "first");
    latch.stop(STOP_REASONS.mutation, "second");
    expect(latch.stopped).toBe(true);
    expect(latch.reason).toBe(STOP_REASONS.timeout);
    expect(latch.history.length).toBe(2);
    expect(() => latch.assertOpen()).toThrow(SequenceLatchedError);
  });
});

// ------------------------------------------------------------------ host session contract

describe("host session contract", () => {
  test("absent and ill-formed host sessions are refused; a real one is admitted", () => {
    expect(assertHostSession(null).code).toBe("host_session_absent");
    expect(assertHostSession({}).code).toBe("host_session_illformed");
    const session = createHostSessionPort({ createGuard, plan: readPlan("N-1"), store: freshStore() });
    expect(assertHostSession(session).ok).toBe(true);
  });

  test("the local case-token derivation is byte-identical to the host's deriveConversationToken", () => {
    if (!hostCore) return;
    expect(localDeriveConversationToken("N-2")).toBe(hostCore.deriveConversationToken("N-2"));
    expect(localDeriveConversationToken("private-case-seed")).toMatch(/^eval-[0-9a-f]{24}$/);
  });

  withHostCore("a bound policy is inert before binding and enforces the real guard", () => {
    test("default inert, then an allowed call completes and the token is stable", async () => {
      const session = createHostSessionPort({ caseId: "N-2", createGuard, plan: readPlan("N-2"), store: freshStore() });
      expect(session.getEvaluationToken()).toBeNull();
      expect(session.getEvaluationResult()).toBeNull();
      const binding = buildEvaluationBinding({
        allowedTools: READONLY_DASHBOARD_TOOLS,
        caseId: "N-2",
        limits: { modelGenerationLimit: 4, toolCallLimit: 6, turnDeadlineMs: 1000 },
        scope: { orgId: "o", profileId: "p" },
      });
      session.bindEvaluationPolicy(binding);
      expect(session.getEvaluationToken()).toBe(binding.conversationToken);
      await session.send({ message: "go" });
      const result = session.getEvaluationResult();
      expect(result.terminalReason).toBe("completed");
      expect(result.modelGenerations).toBe(2);
      expect(result.toolExecutions).toBe(1);
      expect(result.caseToken).toBe(binding.conversationToken);
      expect(dispatchLogFromResult(result)).toEqual([]);
    });

    test("a forbidden call executes nothing and is observed via the host's forbidden record", async () => {
      const session = createHostSessionPort({
        caseId: "N-6",
        createGuard,
        plan: () => ({ answer: "x", calls: [{ arguments: {}, name: "reconcile_topic" }] }),
        store: freshStore(),
      });
      session.bindEvaluationPolicy(
        buildEvaluationBinding({
          allowedTools: READONLY_DASHBOARD_TOOLS,
          caseId: "N-6",
          limits: { modelGenerationLimit: 3, toolCallLimit: 6, turnDeadlineMs: 1000 },
          scope: { orgId: "o", profileId: "p" },
        })
      );
      await session.send({ message: "go" });
      const result = session.getEvaluationResult();
      expect(result.terminalReason).toBe("forbidden-tool");
      expect(result.forbidden.tool).toBe("reconcile_topic");
      expect(result.forbidden.policyReason).toBe("forbidden-tool");
      const log = dispatchLogFromResult(result);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ dispatched: false, name: "reconcile_topic" });
    });
  });
});

// ------------------------------------------------------------------ authorization binding

describe("authorization binding", () => {
  test("a proposed record validates against every binding", () => {
    expect(validateAuthorization(makeAuth()).ok).toBe(true);
  });

  test("an immutable-weights claim, a retry policy or a moved plugin identity is refused", () => {
    const withClaim = buildProposedAuthorizationRecord({ model: { identityKind: "alias_or_date_bounded", immutableWeightsClaim: true, requested: "deepseek-v4.1-flash" } });
    expect(validateAuthorization(withClaim).code).toBe(AUTHORIZATION_ERROR_CODES.immutableClaim);
    expect(validateAuthorization({ ...makeAuth(), noRetry: false }).code).toBe(AUTHORIZATION_ERROR_CODES.retry);
    expect(validateAuthorization({ ...makeAuth(), plugin: { ...ADMITTED_FIXTURE, revision: 11 } }).code).toBe(AUTHORIZATION_ERROR_CODES.plugin);
  });

  test("execution is shut: not granted, and blocked without the amended-host contract", () => {
    expect(authorizeExecution(makeAuth()).code).toBe(AUTHORIZATION_ERROR_CODES.executionNotGranted);
    const granted = { ...makeAuth(), executionAuthorized: true };
    const blocked = authorizeExecution(granted);
    expect(blocked.blocked).toBe(true);
    expect(blocked.code).toBe(AUTHORIZATION_ERROR_CODES.hostContractUnavailable);
    const contract = { digest: granted.host.contractDigest };
    expect(authorizeExecution(granted, { hostContract: contract }).ok).toBe(true);
  });

  test("fail-closed: an allowlist naming a platform helper is refused", () => {
    const base = buildProposedAuthorizationRecord();
    const record = buildProposedAuthorizationRecord({
      effectiveAllowedCalls: { ...base.effectiveAllowedCalls, "N-2": ["find_tools", "sub_agent"] },
    });
    const check = validateAuthorization(record);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(AUTHORIZATION_ERROR_CODES.allowlist);
  });
});

// ------------------------------------------------------------------ trace materialization

describe("full ordered trace", () => {
  test("materializes calls with arguments, the answer and model/usage evidence", () => {
    const trace = parseTurnTrace([
      { payload: JSON.stringify({ content: "hi", role: "user" }), seq: 1 },
      { payload: JSON.stringify({ content: "first", role: "assistant", toolCalls: [{ arguments: { a: 1 }, name: "get_overview" }] }), seq: 2 },
      { payload: JSON.stringify({ content: "final", model: "deepseek-v4.1-flash", provider: "opencode-go", role: "assistant", toolCalls: [{ args: { topicId: "t" }, name: "get_topic" }], usage: { total_tokens: 5 } }), seq: 3 },
    ]);
    expect(trace.ok).toBe(true);
    expect(trace.calls.map((c) => c.name)).toEqual(["get_overview", "get_topic"]);
    expect(trace.callsWithArgs[1]).toEqual({ arguments: { topicId: "t" }, name: "get_topic" });
    expect(trace.answer).toBe("final");
    expect(trace.usage.total_tokens).toBe(5);
    expect(trace.model).toBe("deepseek-v4.1-flash");
  });

  test("a malformed payload fails closed", () => {
    const trace = parseTurnTrace([{ payload: "{not json", seq: 1 }]);
    expect(trace.ok).toBe(false);
    expect(trace.reason).toBe("malformed_trace");
  });

  test("classify is terminal on a forbidden call, a writer denial, a timeout and an empty consultation", () => {
    const good = parseTurnTrace([{ payload: { content: "x", model: "m", provider: "p", role: "assistant", usage: {} }, seq: 1 }]);
    expect(classifyTurnTrace({ allowedCalls: ["get_overview"], requireConsultation: true, trace: good }).codes).toContain(STOP_REASONS.emptyTrace);
    const forb = parseTurnTrace([{ payload: { content: "x", model: "m", provider: "p", role: "assistant", toolCalls: [{ name: "get_progress" }], usage: {} }, seq: 1 }]);
    expect(classifyTurnTrace({ allowedCalls: ["get_overview"], trace: forb }).codes).toContain(STOP_REASONS.forbiddenToolCall);
    const writerDenied = classifyTurnTrace({ allowedCalls: ["get_overview"], dispatchLog: [{ dispatched: false, name: "reconcile_topic", reason: "not_allowlisted" }], trace: forb });
    expect(writerDenied.codes).toContain(STOP_REASONS.writerDispatchDenied);
    expect(classifyTurnTrace({ abortReason: "turn_deadline_exceeded", allowedCalls: ["get_overview"], trace: good }).codes).toContain(STOP_REASONS.timeout);
  });

  test("classify matches a namespaced plugin call to its canonical allowlist entry", () => {
    const namespaced = parseTurnTrace([{ payload: { content: "x", model: "m", provider: "p", role: "assistant", toolCalls: [{ name: "plugin_research_dashboard__get_overview" }], usage: {} }, seq: 1 }]);
    const verdict = classifyTurnTrace({ allowedCalls: ["get_overview"], trace: namespaced });
    expect(verdict.codes).not.toContain(STOP_REASONS.forbiddenToolCall);
  });
});

// ------------------------------------------------------------------ driver: atomic experiment

describe("driver: atomic experiment", () => {
  test("N-1 smoke passes with a real guarded turn and preserves the evaluation result", async () => {
    const { driver } = makeDriver({ plan: readPlan("N-1") });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s1" });
    expect(result.ok).toBe(true);
    expect(result.semanticScored).toBe(false);
    expect(result.trace.calls[0].name).toBe("get_overview");
    expect(result.modelIdentity.reported).toBe("deepseek-v4.1-flash");
    expect(result.evaluation.terminalReason).toBe("completed");
    expect(result.evaluation.caseToken).toMatch(/^eval-[0-9a-f]{24}$/);
    expect(result.identity.pinBefore.revision).toBe(ADMITTED_FIXTURE.pluginRevision);
  });

  test("a consultation case with no tool call is terminal empty_trace and latches", async () => {
    const { driver, latch } = makeDriver({ plan: () => ({ answer: "no tools", calls: [] }) });
    const result = await driver.runCase({ caseId: "N-2", prompt: proposedPrompt("N-2"), sessionId: "s2" });
    expect(result.ok).toBe(false);
    expect(result.codes).toContain(STOP_REASONS.emptyTrace);
    expect(latch.stopped).toBe(true);
  });

  test("a forbidden tool call is terminal, and a hung turn aborts on the policy deadline writing nothing", async () => {
    const forbidden = makeDriver({ plan: (c) => (c.caseId === "N-2" ? { answer: "x", calls: [{ name: "get_progress" }] } : readPlan("N-1")()) });
    const r1 = await forbidden.driver.runCase({ caseId: "N-2", prompt: proposedPrompt("N-2"), sessionId: "s" });
    expect(r1.codes).toContain(STOP_REASONS.forbiddenToolCall);

    const hung = makeDriver({ plan: () => ({ hang: true }), turnDeadlineMs: 30 });
    const r2 = await hung.driver.runCase({ caseId: "N-2", prompt: proposedPrompt("N-2"), sessionId: "s" });
    expect(r2.codes).toContain(STOP_REASONS.timeout);
    expect(hung.store.count()).toBe(0);
  });

  test("N-6 keeps the writers visible but a writer dispatch is denied and terminally fails", async () => {
    // The dispatch allowlist never includes a writer; only the profile makes them visible.
    expect(toolsForCase("N-6")).toEqual(["find_tools", ...READONLY_DASHBOARD_TOOLS]);
    expect(toolsForCase("N-6")).not.toContain("reconcile_topic");
    expect(toolsForCase("N-6")).not.toContain("record_activity");
    const { driver, store } = makeDriver({ plan: () => ({ answer: "x", calls: [{ arguments: {}, name: "reconcile_topic" }] }) });
    const result = await driver.runCase({ caseId: "N-6", prompt: proposedPrompt("N-6"), sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.writerDispatchDenied);
    expect(store.count()).toBe(0);
  });

  test("a logical mutation across the turn is terminal", async () => {
    const { driver } = makeDriver({ mutate: true, plan: readPlan("N-1") });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.mutation);
  });

  test("an unknown transport outcome latches without a retry", async () => {
    const store = freshStore();
    const failingSession = {
      async send() { throw new Error("socket closed after send"); },
      async sendStream() { throw new Error("socket closed after send"); },
      bindEvaluationPolicy() {},
      getEvaluationResult() { return null; },
      getEvaluationToken() { return null; },
    };
    const driver = createDriver({
      authorization: makeAuth(), budgets: PROPOSED_BUDGETS, createHostSession: () => failingSession,
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.unknownTransport);
  });

  test("an absent host session blocks the driver", async () => {
    const store = freshStore();
    const driver = createDriver({
      authorization: makeAuth(), budgets: PROPOSED_BUDGETS, createHostSession: () => null,
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.hostControlAbsent);
  });

  test("the default turn port is blocked before any I/O", async () => {
    const port = createAuthorizedTurnPort({ client: { post() { throw new Error("must not be called"); } }, sessionId: "s" });
    await expect(port({ prompt: "p" })).rejects.toBeInstanceOf(InferenceBlockedError);
  });
});

// ------------------------------------------------------------------ driver: sequence + N-7

describe("driver: sequence and downstream automation", () => {
  test("a terminal case stops the sequence; later cases are skipped, not replaced", async () => {
    const auth = makeAuth(["N-1", "N-2"]);
    const { driver, latch } = makeDriver({ auth, plan: (c) => (c.caseId === "N-2" ? { answer: "x", calls: [] } : readPlan("N-1")()) });
    const run = await driver.runSequence({ cases: ["N-1", "N-2"], prompts: { "N-1": proposedPrompt("N-1"), "N-2": proposedPrompt("N-2") }, runAutomation: false, sessions: { "N-1": "s1", "N-2": "s2" } });
    expect(run.direct.length).toBe(2);
    expect(run.direct[0].ok).toBe(true);
    expect(run.direct[1].ok).toBe(false);
    expect(run.directOk).toBe(false);
    expect(latch.stopped).toBe(true);
  });

  test("N-7 runs only downstream of direct success, starts and stops the owned worker", async () => {
    const auth = makeAuth(["N-1", AUTOMATION_CASE]);
    const worker = { runs: 0, start: 0, stop: 0 };
    const automationApi = {
      createDefinition: async (def) => ({ def, id: "auto-1", ok: true }),
      runOnce: async () => { worker.runs += 1; return { ok: true }; },
      startWorker: async () => { worker.start += 1; return { ok: true }; },
      stopWorker: async () => { worker.stop += 1; return { ok: true }; },
    };
    const definition = { name: "n", profileId: "prof", prompt: "p", readOnly: false, trigger: "manual" };
    const store = freshStore();
    const driver = createDriver({
      authorization: auth, automationApi, budgets: PROPOSED_BUDGETS,
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      createHostSession: ({ caseId, sessionId }) => createHostSessionPort({ caseId, createGuard, plan: readPlan(caseId), sessionId, store }),
      latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path), snapshotStore: () => STABLE_SNAPSHOT,
    });
    const run = await driver.runSequence({
      automationDefinition: definition, cases: ["N-1"],
      prompts: { "N-1": proposedPrompt("N-1"), [AUTOMATION_CASE]: proposedPrompt(AUTOMATION_CASE) },
      sessions: { "N-1": "s1", [AUTOMATION_CASE]: "s7" },
    });
    expect(run.direct[0].ok).toBe(true);
    expect(run.automation.ok).toBe(true);
    expect(run.automation.workerStopped).toBe(true);
    expect(run.automation.outputComparison.repeatsCaseId).toBe("N-1");
    expect(worker.start).toBe(1);
    expect(worker.stop).toBe(1);
  });

  test("an N-7 failure does not erase valid direct-case evidence", async () => {
    const auth = makeAuth(["N-1", AUTOMATION_CASE]);
    const automationApi = {
      createDefinition: async () => ({ id: "auto-1", ok: true }), runOnce: async () => ({ ok: true }),
      startWorker: async () => ({ ok: true }), stopWorker: async () => ({ ok: true }),
    };
    const definition = { name: "n", profileId: "prof", prompt: "p", readOnly: true, trigger: "manual" };
    const store = freshStore();
    const driver = createDriver({
      authorization: auth, automationApi, budgets: PROPOSED_BUDGETS,
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      createHostSession: ({ caseId, sessionId }) =>
        createHostSessionPort({
          caseId, createGuard, sessionId, store,
          plan: (c) => (c.caseId === AUTOMATION_CASE ? { answer: "x", calls: [{ arguments: {}, name: "reconcile_topic" }] } : readPlan("N-1")()),
        }),
      latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path), snapshotStore: () => STABLE_SNAPSHOT,
    });
    const run = await driver.runSequence({
      automationDefinition: definition, cases: ["N-1"],
      prompts: { "N-1": proposedPrompt("N-1"), [AUTOMATION_CASE]: proposedPrompt(AUTOMATION_CASE) },
      sessions: { "N-1": "s1", [AUTOMATION_CASE]: "s7" },
    });
    expect(run.direct[0].ok).toBe(true);
    expect(run.automation.ok).toBe(false);
    expect(run.direct[0].trace.calls[0].name).toBe("get_overview");
  });

  test("the N-7 wrapper refuses to run before direct validation", async () => {
    await expect(runOwnedAutomation({ api: { createDefinition() {}, runOnce() {}, startWorker() {}, stopWorker() {} }, definition: buildAutomationDefinition({ name: "n", profileId: "prof", prompt: "p" }) }))
      .rejects.toBeInstanceOf(AutomationBlockedError);
  });
});

// ------------------------------------------------------------------ corrected bindings: profiles + prompts

describe("authorization: case-specific profile bindings (correction 1)", () => {
  test("the proposed record binds BOTH actual profiles and every case → profile id", () => {
    const record = buildProposedAuthorizationRecord();
    expect(record.profiles.readonly3.id).toBe("fixture-readonly-3tool");
    expect(record.profiles.full5.id).toBe("fixture-full-5tool");
    expect(record.caseProfile["N-6"]).toBe("full5");
    for (const id of ["N-1", "N-2", "N-3", "N-4", "N-5", "N-7"]) expect(record.caseProfile[id]).toBe("readonly3");
    expect(validateAuthorization(record).ok).toBe(true);
  });

  test("a single profile, a moved profile id or a wrong case binding is refused", () => {
    const base = buildProposedAuthorizationRecord();
    const { profiles, caseProfile, ...singleProfile } = base;
    expect(validateAuthorization(singleProfile).code).toBe(AUTHORIZATION_ERROR_CODES.profiles);
    expect(validateAuthorization({ ...base, profiles: { ...base.profiles, full5: { id: "fixture-other" } } }).code).toBe(AUTHORIZATION_ERROR_CODES.profiles);
    expect(validateAuthorization({ ...base, caseProfile: { ...base.caseProfile, "N-6": "readonly3" } }).code).toBe(AUTHORIZATION_ERROR_CODES.caseProfile);
  });

  test("N-6 exposes the five-tool profile while writers stay non-dispatchable", () => {
    const record = buildProposedAuthorizationRecord();
    expect(FIXTURE_PROFILES[record.caseProfile["N-6"]].tools).toContain("reconcile_topic");
    expect(FIXTURE_PROFILES[record.caseProfile["N-6"]].tools).toContain("record_activity");
    expect(toolsForCase("N-6")).not.toContain("reconcile_topic");
  });
});

describe("authorization: exact prompt binding (correction 2)", () => {
  test("the record binds the exact UTF-8 bytes and sha256 for every case", () => {
    const record = buildProposedAuthorizationRecord();
    for (const caseId of CASE_IDS) {
      expect(record.prompts[caseId].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.prompts[caseId].sha256).toBe(PROMPT_BINDINGS[caseId].sha256);
    }
    expect(validateAuthorization(record).ok).toBe(true);
  });

  test("N-7 repeats the designated direct prompt byte-for-byte and records which case", () => {
    expect(PROMPT_BINDINGS["N-7"].repeatsCaseId).toBe("N-1");
    expect(PROMPT_BINDINGS["N-7"].text).toBe(PROMPT_BINDINGS["N-1"].text);
    expect(PROMPT_BINDINGS["N-7"].sha256).toBe(PROMPT_BINDINGS["N-1"].sha256);
  });

  test("every frozen prompt recomputes to its bound sha256 over the exact UTF-8 bytes", () => {
    const record = buildProposedAuthorizationRecord();
    for (const caseId of CASE_IDS) {
      const binding = PROMPT_BINDINGS[caseId];
      // Recompute the digest over the exact UTF-8 bytes (no trim, no normalisation) and require an exact match.
      expect(sha256Utf8(binding.text)).toBe(binding.sha256);
      expect(record.prompts[caseId].sha256).toBe(binding.sha256);
      expect(record.prompts[caseId].text).toBe(binding.text);
    }
    // N-7 is an exact byte repeat of the designated N-1, so their recomputed digests are identical.
    expect(sha256Utf8(PROMPT_BINDINGS["N-7"].text)).toBe(sha256Utf8(PROMPT_BINDINGS["N-1"].text));
  });

  test("verifyPromptBinding refuses a one-byte change and an empty prompt", () => {
    const record = buildProposedAuthorizationRecord();
    const ok = verifyPromptBinding({ authorization: record, caseId: "N-2", prompt: PROMPT_BINDINGS["N-2"].text });
    expect(ok.ok).toBe(true);
    // A single appended byte, a single substituted byte and a trimmed copy each refuse.
    expect(verifyPromptBinding({ authorization: record, caseId: "N-2", prompt: `${PROMPT_BINDINGS["N-2"].text} ` }).code).toBe("prompt_digest_mismatch");
    expect(verifyPromptBinding({ authorization: record, caseId: "N-2", prompt: PROMPT_BINDINGS["N-2"].text.slice(1) }).code).toBe("prompt_digest_mismatch");
    expect(verifyPromptBinding({ authorization: record, caseId: "N-2", prompt: PROMPT_BINDINGS["N-2"].text.replace("status", "state") }).code).toBe("prompt_digest_mismatch");
    expect(verifyPromptBinding({ authorization: record, caseId: "N-2", prompt: "" }).code).toBe("prompt_empty");
  });

  test("a record whose prompt digest or N-7 repeat is wrong is refused", () => {
    const base = buildProposedAuthorizationRecord();
    const badDigest = { ...base, prompts: { ...base.prompts, "N-3": { ...base.prompts["N-3"], sha256: "0".repeat(64) } } };
    expect(validateAuthorization(badDigest).code).toBe(AUTHORIZATION_ERROR_CODES.promptDigest);
    const badRepeat = { ...base, prompts: { ...base.prompts, "N-7": { ...base.prompts["N-7"], text: "different", sha256: PROMPT_BINDINGS["N-7"].sha256 } } };
    expect([AUTHORIZATION_ERROR_CODES.promptDigest, AUTHORIZATION_ERROR_CODES.promptRepeat]).toContain(validateAuthorization(badRepeat).code);
  });

  test("the driver refuses a caller prompt that differs by one byte BEFORE creating a session", async () => {
    let factoryCalls = 0;
    const store = freshStore();
    const driver = createDriver({
      authorization: buildProposedAuthorizationRecord({ cases: ["N-2"] }),
      budgets: PROPOSED_BUDGETS,
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      createHostSession: () => { factoryCalls += 1; return createHostSessionPort({ caseId: "N-2", createGuard, plan: readPlan("N-2"), store }); },
      latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path), snapshotStore: () => STABLE_SNAPSHOT,
    });
    const result = await driver.runCase({ caseId: "N-2", prompt: `${PROMPT_BINDINGS["N-2"].text}!`, sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.promptMismatch);
    expect(factoryCalls).toBe(0);
    expect(store.count()).toBe(0);
  });

  test("a caller prompt that differs by one byte refuses for EVERY case BEFORE any session is created", async () => {
    for (const caseId of CASE_IDS) {
      let factoryCalls = 0;
      const store = freshStore();
      const auth = buildProposedAuthorizationRecord({ cases: [caseId] });
      const driver = createDriver({
        authorization: auth,
        budgets: PROPOSED_BUDGETS,
        checkContainment: ({ profileKey }) => exactContainment(profileKey),
        createHostSession: () => { factoryCalls += 1; return createHostSessionPort({ caseId, createGuard, plan: readPlan(caseId), store }); },
        latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path), snapshotStore: () => STABLE_SNAPSHOT,
      });
      // The digest is recomputed over the exact UTF-8 bytes; a one-byte change must refuse before session creation.
      expect(verifyPromptBinding({ authorization: auth, caseId, prompt: `${PROMPT_BINDINGS[caseId].text} ` }).code).toBe("prompt_digest_mismatch");
      expect(verifyPromptBinding({ authorization: auth, caseId, prompt: PROMPT_BINDINGS[caseId].text.slice(1) }).code).toBe("prompt_digest_mismatch");
      const result = await driver.runCase({ caseId, prompt: `${PROMPT_BINDINGS[caseId].text}!`, sessionId: `s-${caseId}` });
      expect(result.codes).toContain(STOP_REASONS.promptMismatch);
      expect(factoryCalls).toBe(0);
      expect(store.count()).toBe(0);
    }
  });
});

// ------------------------------------------------------------------ corrected consultation: read required

describe("driver: a successful dashboard read is required (correction 3)", () => {
  test("a readless trace (find_tools only) is terminal readless_trace", async () => {
    const auth = buildProposedAuthorizationRecord({ cases: ["N-1"] });
    const { driver, latch } = makeDriver({ auth, plan: () => ({ calls: [{ name: "find_tools" }], answer: "no read" }) });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(result.ok).toBe(false);
    expect(result.codes).toContain(STOP_REASONS.readlessTrace);
    expect(latch.stopped).toBe(true);
  });

  test("a read whose dispatch failed is terminal failed_read", async () => {
    const auth = buildProposedAuthorizationRecord({ cases: ["N-1"] });
    const { driver } = makeDriver({ auth, plan: () => ({ calls: [{ name: "get_overview" }], answer: "read failed", failRead: true }) });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(result.ok).toBe(false);
    expect(result.codes).toContain(STOP_REASONS.failedRead);
  });

  test("N-1 stays a structural smoke but now requires consultation; N-6/N-7 require a read too", () => {
    expect(CASE_SPECS["N-1"].semanticScored).toBe(false);
    expect(CASE_SPECS["N-1"].requireConsultation).toBe(true);
    expect(CASE_SPECS["N-1"].requireRead).toBe(true);
    expect(CASE_SPECS["N-6"].requireRead).toBe(true);
    expect(CASE_SPECS["N-7"].requireRead).toBe(true);
  });
});

// ------------------------------------------------------------------ exact containment (required)

describe("driver: exact containment is required and fail-closed", () => {
  test("an absent containment port is a terminal refusal, never 'unchecked'", async () => {
    const store = freshStore();
    const driver = createDriver({
      authorization: makeAuth(["N-1"]),
      budgets: PROPOSED_BUDGETS,
      createHostSession: () => createHostSessionPort({ caseId: "N-1", createGuard, plan: readPlan("N-1"), store }),
      latch: createStopLatch(), pinStore: () => ({ ...STABLE_PIN }), readTrace: createTraceReader(store.path), snapshotStore: () => STABLE_SNAPSHOT,
    });
    const result = await driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.containmentChanged);
  });

  test("drift (an extra tool, a wrong profile id) latches with no repair", async () => {
    const extra = makeDriver({ containment: ({ profileKey }) => ({ ...exactContainment(profileKey), tools: [...FIXTURE_PROFILES[profileKey].tools, "write_file"] }) });
    const r1 = await extra.driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(r1.codes).toContain(STOP_REASONS.containmentChanged);
    expect(extra.latch.stopped).toBe(true);

    const wrong = makeDriver({ containment: ({ profileKey }) => ({ ...exactContainment(profileKey), profileId: "fixture-other" }) });
    const r2 = await wrong.driver.runCase({ caseId: "N-1", prompt: proposedPrompt("N-1"), sessionId: "s" });
    expect(r2.codes).toContain(STOP_REASONS.containmentChanged);
  });

  test("the comparator itself refuses a missing tool, an extra skill and an enabled worker", () => {
    const good = exactContainment("readonly3");
    expect(assertContainmentExact({ observed: good, profileKey: "readonly3" }).ok).toBe(true);
    expect(assertContainmentExact({ observed: { ...good, tools: ["get_overview", "get_topic"] }, profileKey: "readonly3" }).ok).toBe(false);
    expect(assertContainmentExact({ observed: { ...good, skills: ["research-coordinator", "save-artifact"] }, profileKey: "readonly3" }).ok).toBe(false);
    expect(assertContainmentExact({ observed: { ...good, automationsEnabled: true }, profileKey: "readonly3" }).ok).toBe(false);
  });

  test("each case's session/policy/containment use the same authorized profile", async () => {
    const seen = [];
    const { driver } = makeDriver({
      plan: readPlan("N-6"),
      auth: makeAuth(CASE_IDS),
      containment: ({ caseId, profileKey, profileId }) => { seen.push({ caseId, profileKey, profileId }); return exactContainment(profileKey); },
    });
    const result = await driver.runCase({ caseId: "N-6", prompt: proposedPrompt("N-6"), sessionId: "s" });
    expect(result.profileKey).toBe("full5");
    expect(result.profileId).toBe("fixture-full-5tool");
    expect(seen[0]).toEqual({ caseId: "N-6", profileKey: "full5", profileId: "fixture-full-5tool" });
    expect(result.evaluation.caseToken).toMatch(/^eval-/);
  });
});


// ------------------------------------------------------------------ accepted host identity + provider disposition

describe("authorization: accepted host identity and provider disposition (reviewer correction)", () => {
  test("the proposed record binds the accepted amended-host identity and both digests, never an all-zero placeholder", () => {
    const record = buildProposedAuthorizationRecord();
    expect(record.host.identity).toBe("nakama-host-clean@945420b6+eval-controls+wire-eval-result");
    expect(record.host.identity).toBe(ACCEPTED_HOST.identity);
    expect(record.host.identity).not.toBe("amended-host-unavailable");
    expect(record.host.patchDigest).toBe("f33a9de54cb1bf9bd10bbe901a23bd216f55c7696de8e6f664b11e2901503a57");
    expect(record.host.contractDigest).toBe("8164105ffda63aec86171add8e5cf497ef70ec6313aa6a8780f7c93e38bcd941");
    expect(record.host.patchDigest).not.toBe("0".repeat(64));
    expect(record.host.contractDigest).not.toBe("0".repeat(64));
    expect(record.executionAuthorized).toBe(false);
    expect(validateAuthorization(record).ok).toBe(true);
  });

  test("the old unavailable identity or any moved/zero digest is refused", () => {
    const base = buildProposedAuthorizationRecord();
    expect(validateAuthorization({ ...base, host: { ...base.host, identity: "amended-host-unavailable" } }).code).toBe(AUTHORIZATION_ERROR_CODES.hostIdentity);
    expect(validateAuthorization({ ...base, host: { ...base.host, patchDigest: "0".repeat(64) } }).code).toBe(AUTHORIZATION_ERROR_CODES.hostDigest);
    expect(validateAuthorization({ ...base, host: { ...base.host, contractDigest: "0".repeat(64) } }).code).toBe(AUTHORIZATION_ERROR_CODES.hostDigest);
    // The previously-served eval-controls-only digest is not the accepted wire-eval-result digest.
    expect(validateAuthorization({ ...base, host: { ...base.host, patchDigest: "9a58341e62bbe30dc8671ec8930c36fc71f350f199b99f59e69ba354a6a5995c" } }).code).toBe(AUTHORIZATION_ERROR_CODES.hostDigest);
  });

  test("the earlier suitability block is withdrawn; the reviewer's operational acceptance is recorded, not an approval", () => {
    const record = buildProposedAuthorizationRecord();
    expect(record.provider.name).toBe("opencode-go");
    expect(record.providerDisposition).toEqual(PROVIDER_DISPOSITION);
    // The earlier suitability block is withdrawn and the reviewer's exact operational acceptance is required;
    // it never becomes a service-terms claim.
    expect(record.providerDisposition.suitability).toBe("operationally_selected_accepted");
    expect(record.providerDisposition.silentSubstitutionPermitted).toBe(false);
    // The owner's operational selection of OpenCode Go is recorded by its exact marker.
    expect(record.providerDisposition.ownerSelectedOperationalCondition).toBe(PROVIDER_OWNER_OVERRIDE);
    expect(record.providerDisposition.ownerSelectedOperationalCondition).not.toBe("approved");
    expect(record.providerDisposition.serviceTermsPermissionClaimed).toBe(false);
    expect(validateAuthorization(record).ok).toBe(true);
    // The withdrawn "blocked" value and a bare "approved" value are both refused.
    expect(validateAuthorization({ ...record, providerDisposition: { ...record.providerDisposition, suitability: "blocked" } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerSuitability);
    expect(validateAuthorization({ ...record, providerDisposition: { ...record.providerDisposition, suitability: "approved" } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerSuitability);
    expect(validateAuthorization({ ...record, providerDisposition: { ...record.providerDisposition, silentSubstitutionPermitted: true } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerSuitability);
    // The exact provider binding is still enforced: a silent swap of the provider name is refused.
    expect(validateAuthorization({ ...record, provider: { ...record.provider, name: "other-provider" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
  });

  test("the owner operational override pins the sequence: no fallback, failures terminal, override exact", () => {
    const d = buildProposedAuthorizationRecord().providerDisposition;
    expect(d.fallbackProvider).toBe(null);
    expect(d.sequencePinned).toBe(true);
    expect(d.failuresTerminal).toBe(true);
    expect(d.reportedModelIdentityRecorded).toBe(true);
    expect(d.identicalBackendRevisionClaim).toBe(false);
    const record = buildProposedAuthorizationRecord();
    // A fallback provider is refused — the whole sequence is pinned to the one binding.
    expect(validateAuthorization({ ...record, providerDisposition: { ...d, fallbackProvider: { name: "commandcode" } } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerOverride);
    // A missing marker is refused: a bare operational-acceptance value alone does not record it.
    expect(validateAuthorization({ ...record, providerDisposition: { suitability: "operationally_selected_accepted", silentSubstitutionPermitted: false } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerOverride);
    // A claim of any service-terms permission is refused (the override is operational only).
    expect(validateAuthorization({ ...record, providerDisposition: { ...d, serviceTermsPermissionClaimed: true } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerTermsClaim);
    // An identical-backend revision claim is refused — the reported identity is not a weights claim.
    expect(validateAuthorization({ ...record, providerDisposition: { ...d, identicalBackendRevisionClaim: true } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerOverride);
  });

  test("a provider or model swap is refused and a failure is terminal with no retry", () => {
    const record = buildProposedAuthorizationRecord();
    // A switched provider name or wire model refuses; the exact binding is enforced, not a default.
    expect(validateAuthorization({ ...record, provider: { ...record.provider, name: "commandcode" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
    expect(validateAuthorization({ ...record, provider: { ...record.provider, wireModel: "gpt-6-luna" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
    // A switched requested model (host-prefixed or another model id) refuses at the model binding.
    expect(validateAuthorization({ ...record, model: { ...record.model, requested: "opencode-go/deepseek-v4.1-flash" } }).code).toBe(AUTHORIZATION_ERROR_CODES.model);
    expect(validateAuthorization({ ...record, model: { ...record.model, requested: "gpt-6-astra" } }).code).toBe(AUTHORIZATION_ERROR_CODES.model);
    // noRetry is mandatory: a failure is terminal and is never retried or replaced.
    expect(validateAuthorization({ ...record, noRetry: false }).code).toBe(AUTHORIZATION_ERROR_CODES.retry);
  });
});

// ------------------------------------------------------------------ prompt subjects exist in the admitted artifacts

describe("prompts: subjects exist in the admitted fixture artifacts (no guess)", () => {
  const seed = loadSeedArtifact();
  // The live fixture workspace is a sibling of this repo; derive the path (or override by env) rather than
  // hard-code a user's home path, which would leak a local identity into this public tree.
  const READBACK_PATH =
    process.env.NAKAMA_FIXTURE_READBACK ??
    join(dirname(join(import.meta.dir, "..", "..", "..")), "nakama-e2e-fixture-workspace", "evidence", "parent-readback.json");
  const readback = existsSync(READBACK_PATH) ? JSON.parse(readFileSync(READBACK_PATH, "utf8")) : null;
  const subjects = (caseId) => [...PROMPT_BINDINGS[caseId].text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);

  test("the prompts are recorded as reviewer-specified, frozen before inference", () => {
    expect(PROMPT_DISPOSITION).toBe("reviewer_specified_frozen_before_inference");
  });

  test("every quoted subject is a real seeded axis under a real seeded topic", () => {
    const topicByName = new Map(seed.topics.map((t) => [t.name, t]));
    for (const caseId of CASE_IDS) {
      const quoted = subjects(caseId);
      expect(quoted.length).toBe(2);
      const [axisTitle, topicTitle] = quoted;
      const topic = topicByName.get(topicTitle);
      expect(topic).toBeDefined();
      expect(topic.axes.map((a) => a.title)).toContain(axisTitle);
    }
  });

  test("the prompt's case-to-axis mapping agrees with the admitted fixture readback", () => {
    if (!readback) return; // the live fixture workspace is absent from this checkout
    const topicByName = new Map(seed.topics.map((t) => [t.name, t]));
    const axisBySourceId = new Map();
    for (const t of seed.topics) for (const a of t.axes) axisBySourceId.set(a.sourceId, { title: a.title });
    for (const caseId of ["N-1", "N-2", "N-3", "N-4", "N-5"]) {
      const row = readback.cases?.[caseId];
      expect(row).toBeDefined();
      const [axisTitle, topicTitle] = subjects(caseId);
      expect(axisBySourceId.get(row.axisSourceId)?.title).toBe(axisTitle);
      expect(topicByName.get(topicTitle)?.sourceId).toBe(row.topicSourceId);
    }
  });
});
