/**
 * Offline integration tests for the **live-HTTP** owning-driver adapters.
 *
 * **Disjoint** from `driver.test.mjs`. No network, no model, no live instance: an injected `fetchImpl`
 * emulates the amended host's exact served routes and response shapes (taken from the pinned checkout —
 * `sessions.ts`, `automations.ts`, `workers.ts`, `shared.ts`, `org-middleware.ts`), and the turns it
 * produces are persisted into a real scratch SQLite `session_messages` store so the driver reads them
 * back through the **real** `readSessionMessages`. Nothing here asserts an invented response shape: the
 * emulator reproduces `{ sessionId }` / `{ reply, usage }` / the `tool_start`/`tool_end`/`chunk`/`done`
 * SSE events / `{ ok: true }` / `{ automation }` / `{ run }` byte-for-byte in shape, and refuses a body
 * the host would refuse (missing `channel`, wrong `scope.orgId`, a non-permitted tool).
 *
 *     bun test harness/nakama-e2e/driver/http-adapters.test.mjs
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROPOSED_BUDGETS } from "./budgets.mjs";
import { createStopLatch, STOP_REASONS } from "./stop-latch.mjs";
import { assertHostSession, buildEvaluationBinding, dispatchLogFromResult, isDefaultInert, localDeriveConversationToken } from "./host-session.mjs";
import { ADMITTED_FIXTURE, ACCEPTED_HOST, buildProposedAuthorizationRecord } from "./authorization.mjs";
import { AUTOMATION_CASE, CASE_IDS, PERMITTED_POLICY_TOOL_NAMES, READONLY_DASHBOARD_TOOLS } from "./cases.mjs";
import { FIXTURE_PROFILES } from "./profiles.mjs";
import { PROMPT_BINDINGS } from "./prompts.mjs";
import { createDriver } from "./driver.mjs";
import { createSessionStore, createTraceReader } from "./adapters.mjs";
import { INFERENCE_AUTHORIZED } from "../turn.mjs";
import { buildAutomationDefinition, runOwnedAutomation } from "../automation.mjs";
import { loadLiveSandbox } from "./live-test-sandbox.mjs";

// The dispatch guard requires a live grant on every transport constructor. These are offline adapter tests
// (injected `fetchImpl`, no network): the adapters and the grant both come from an isolated COPIED source
// sandbox whose `INFERENCE_AUTHORIZED` is flipped in the copy only, so the grant is minted by the copied,
// still-gated `mintLiveGrant` (authorizeExecution + assertInferenceAuthorized) and its identity-tracked
// WeakSet matches the copied adapters. There is no ungated production grant factory to import.
const sandbox = await loadLiveSandbox();
afterAll(() => sandbox.cleanup());
const {
  HTTP_ADAPTER_CODES,
  HOST_HTTP_CONTRACT,
  HttpAdapterError,
  createHttpAuth,
  createHttpAutomationApi,
  createHttpAutomationSessionFactory,
  createHttpSessionFactory,
} = sandbox.adapters;
const LIVE_GRANT = (() => {
  const minted = sandbox.liveGrant.mintLiveGrant({
    authorization: buildProposedAuthorizationRecord({ executionAuthorized: true }),
    hostContract: { digest: ACCEPTED_HOST.contractDigest },
  });
  if (!minted.ok) throw new Error(`live sandbox mint refused: ${minted.code}`);
  return minted.grant;
})();

const ORG = "org_fixture";
const ORG_NAME = "Fixture Org";
const PROFILE = "profile_readonly";
const BASE = "http://127.0.0.1:4399";
const PERMITTED = new Set(PERMITTED_POLICY_TOOL_NAMES);

const scratch = mkdtempSync(join(tmpdir(), "nakama-http-adapter-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let dbSeq = 0;
function freshStore() {
  dbSeq += 1;
  return createSessionStore(join(scratch, `http-session-${dbSeq}.sqlite`));
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sseBody = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

/** The wire `EvaluationTurnResult` the amended host emits on an opt-in turn. */
function wireEvaluation({
  caseToken,
  toolExecutions,
  terminalReason = "completed",
  forbidden = null,
  modelGenerations = 1,
  historyValid = true,
  malformed = false,
}) {
  return {
    caseToken,
    endedAt: Date.now(),
    forbidden,
    historyValid,
    modelGenerations,
    startedAt: Date.now(),
    terminalReason: malformed ? "not-a-terminal-reason" : terminalReason,
    toolExecutions,
  };
}

/**
 * The amended host's served routes, emulated exactly (method + path + status + body shape). `plan`
 * decides a turn's calls/answer; a `hang` plan never resolves until the request signal aborts, which is
 * how the real stream route behaves before its deadline fires. Completed turns are written into the
 * scratch platform store so the real trace reader sees them.
 */
function createRouteHost({
  plan = () => ({ answer: "ok", calls: [] }),
  store = null,
  // The amended host emits the wire `EvaluationTurnResult` on a bound turn. These two knobs build the
  // negative cases the adapter must fail closed on.
  omitEvaluation = false,
  malformEvaluation = false,
} = {}) {
  const state = { sessions: new Map(), automations: new Map(), calls: [], sessionSeq: 0, autoSeq: 0, worker: null };
  const sessionsLog = [];
  const turns = [];

  const fetchImpl = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const headers = init.headers ?? {};
    state.calls.push({ method, path: pathname, body, headers, hasSignal: Boolean(init.signal) });

    if (pathname === HOST_HTTP_CONTRACT.login.path && method === "POST") {
      const h = new Headers();
      h.append("set-cookie", "nakama_session=session-token; Path=/; HttpOnly");
      h.append("set-cookie", "nakama_csrf=csrf-token; Path=/");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    }
    if (pathname === HOST_HTTP_CONTRACT.orgs.path) return jsonResponse({ orgs: [{ id: ORG, name: ORG_NAME }] });
    if (pathname === HOST_HTTP_CONTRACT.me.path) return jsonResponse({ email: "admin@example.com", id: "user_admin" });

    if (pathname === HOST_HTTP_CONTRACT.createSession.path && method === "POST") {
      if (!body?.channel) return jsonResponse({ error: "Invalid session request." }, 400);
      if (body.evaluation) {
        if (body.evaluation.scope.orgId !== ORG) {
          return jsonResponse({ error: "Evaluation policy scope.orgId does not match the active organization." }, 400);
        }
        for (const tool of body.evaluation.allowedTools ?? []) {
          if (!PERMITTED.has(tool)) return jsonResponse({ error: `tool "${tool}" is not a permitted policy tool` }, 400);
        }
      }
      const sessionId = `sess-${++state.sessionSeq}`;
      state.sessions.set(sessionId, { evaluation: body.evaluation ?? null });
      sessionsLog.push({ sessionId, body });
      return jsonResponse({ sessionId }, 201);
    }

    let match = pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/);
    if (match && method === "POST") {
      const sessionId = decodeURIComponent(match[1]);
      if (!state.sessions.has(sessionId)) return jsonResponse({ error: "Session not found" }, 404);
      const turn = plan(sessionId, body?.message) ?? { answer: "ok", calls: [] };
      if (turn.hang) {
        return await new Promise((_resolve, reject) => {
          if (init.signal?.aborted) return reject(init.signal.reason ?? new Error("aborted"));
          init.signal?.addEventListener("abort", () => reject(init.signal.reason ?? new Error("aborted")), { once: true });
        });
      }
      if (turn.status && turn.status >= 400) return jsonResponse({ error: turn.error ?? "refused" }, turn.status);
      const toolCalls = (turn.calls ?? []).map((call) => ({ arguments: call.arguments ?? null, name: call.name }));
      if (store) {
        store.append(sessionId, {
          content: turn.answer ?? "",
          model: "deepseek-v4.1-flash",
          provider: "opencode-go",
          role: "assistant",
          toolCalls,
          usage: { total_tokens: 19 },
        });
      }
      const usage = {
        cachedInputTokens: 0,
        calls: [{ inputTokens: 12, modelId: "deepseek-v4.1-flash", outputTokens: 7, totalTokens: 19 }],
        estimated: false,
        inputTokens: 12,
        outputTokens: 7,
        totalTokens: 19,
      };
      const evaluation = omitEvaluation
        ? undefined
        : wireEvaluation({
            caseToken: state.sessions.get(sessionId)?.evaluation?.conversationToken ?? "eval-httpcase01",
            forbidden: turn.forbidden ?? null,
            malformed: malformEvaluation,
            modelGenerations: turn.modelGenerations ?? 1,
            terminalReason: turn.terminalReason ?? "completed",
            toolExecutions: toolCalls.length,
          });
      if (String(headers.accept ?? "").includes("text/event-stream")) {
        const events = [];
        for (const call of toolCalls) {
          const id = `tc-${call.name}`;
          events.push({ input: call.arguments ?? {}, tool: call.name, toolCallId: id, type: "tool_start" });
          events.push({ result: { ok: true }, tool: call.name, toolCallId: id, type: "tool_end" });
        }
        events.push({ delta: (turn.answer ?? "").slice(0, 4), type: "chunk" });
        events.push({ reply: turn.answer ?? "", type: "done", usage, ...(evaluation ? { evaluation } : {}) });
        turns.push({ events, sessionId });
        return new Response(sseBody(events), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
      }
      return jsonResponse({ reply: turn.answer ?? "", usage, ...(evaluation ? { evaluation } : {}) });
    }

    match = pathname.match(/^\/v1\/workers\/automation\/(start|stop)$/);
    if (match && method === "POST") {
      state.worker = match[1];
      return jsonResponse({ ok: true });
    }

    if (pathname === HOST_HTTP_CONTRACT.createAutomation.path && method === "POST") {
      const id = `auto-${++state.autoSeq}`;
      state.automations.set(id, body);
      return jsonResponse({ automation: { id, ...body } }, 201);
    }
    match = pathname.match(/^\/v1\/automations\/([^/]+)\/run$/);
    if (match && method === "POST") {
      const automationId = decodeURIComponent(match[1]);
      if (!state.automations.has(automationId)) return jsonResponse({ error: "Automation not found" }, 404);
      if (body?.evaluation && body.evaluation.scope.automationId !== automationId) {
        return jsonResponse({ error: "Evaluation policy scope does not match the automation's org/profile." }, 400);
      }
      const runTurn = plan(automationId, body?.message) ?? { answer: "automation output", calls: [] };
      const runToolCalls = (runTurn.calls ?? []).map((call) => ({ arguments: call.arguments ?? null, name: call.name }));
      if (store) {
        store.append(automationId, {
          content: runTurn.answer,
          model: "deepseek-v4.1-flash",
          provider: "opencode-go",
          role: "assistant",
          toolCalls: runToolCalls,
          usage: { total_tokens: 5 },
        });
      }
      const wireEval = omitEvaluation
        ? undefined
        : wireEvaluation({
            caseToken: body?.evaluation?.conversationToken ?? "eval-httpcase01",
            malformed: malformEvaluation,
            toolExecutions: runToolCalls.length,
          });
      turns.push({ automationId, evaluation: body?.evaluation ?? null });
      return jsonResponse({
        run: { id: `run-${automationId}`, output: runTurn.answer },
        ...(wireEval ? { evaluation: wireEval } : {}),
      });
    }

    return jsonResponse({ error: `unhandled ${method} ${pathname}` }, 404);
  };

  return { fetchImpl, sessionsLog, state, turns };
}

/** `{ caseId, org }` authorization over the fixture identity (profiles/prompts come from the defaults). */
function makeAuth(cases = CASE_IDS) {
  return buildProposedAuthorizationRecord({
    cases,
    org: { id: ORG, name: ORG_NAME },
  });
}

/** The exact containment readback for a profile key, as the host-control worker would report it. */
function containmentFor(profileKey) {
  const profile = FIXTURE_PROFILES[profileKey];
  return { ok: true, profileId: profile.id, tools: [...profile.tools], skills: profile.skill ? [profile.skill] : [], automationsEnabled: false };
}

const STABLE_PIN = { generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path: join(scratch, "store.sqlite"), revision: ADMITTED_FIXTURE.pluginRevision };
const STABLE_SNAPSHOT = { counts: { development_axes: 8 }, objects: [], rows: {}, versions: {} };
const NAMESPACED_READ = (caseId) => () => ({ answer: `answer ${caseId}`, calls: [{ arguments: { caseId }, name: "plugin_research_dashboard__get_overview" }] });
const binding = (caseId, extra = {}) =>
  buildEvaluationBinding({
    allowedTools: READONLY_DASHBOARD_TOOLS,
    caseId,
    limits: { modelGenerationLimit: 4, toolCallLimit: 6, turnDeadlineMs: 1_000 },
    scope: { orgId: ORG, profileId: PROFILE, ...extra },
  });

async function loggedInAuth(host) {
  const auth = createHttpAuth({
    expectedOrgId: ORG,
    expectedOrgName: ORG_NAME,
    fetchImpl: host.fetchImpl,
    base: BASE,
  });
  await auth.login();
  return auth;
}

// ------------------------------------------------------------------ auth identity

describe("http auth identity", () => {
  test("a non-loopback base and a missing explicit org are refused", () => {
    const host = createRouteHost();
    expect(() => createHttpAuth({ base: "https://example.com", expectedOrgId: ORG, fetchImpl: host.fetchImpl }))
      .toThrow(HttpAdapterError);
    try {
      createHttpAuth({ base: "https://example.com", expectedOrgId: ORG, fetchImpl: host.fetchImpl });
    } catch (error) {
      expect(error.code).toBe(HTTP_ADAPTER_CODES.loopback);
    }
    expect(() => createHttpAuth({ base: BASE, fetchImpl: host.fetchImpl })).toThrow(HttpAdapterError);
  });

  test("login resolves the named org and carries cookie + csrf + x-org-id, with no retry", async () => {
    const host = createRouteHost();
    const auth = await loggedInAuth(host);
    expect(auth.orgId).toBe(ORG);
    expect(auth.actorId).toBe("user_admin");
    const headers = auth.headers();
    expect(headers["x-org-id"]).toBe(ORG);
    expect(headers["x-csrf-token"]).toBe("csrf-token");
    expect(headers.cookie).toContain("nakama_session=session-token");
    expect(host.state.calls.filter((c) => c.path === "/v1/auth/login").length).toBe(1);
  });

  test("an account that is not a member of the expected org is refused", async () => {
    const host = createRouteHost();
    const auth = createHttpAuth({ base: BASE, expectedOrgId: "org_other", fetchImpl: host.fetchImpl });
    await expect(auth.login()).rejects.toMatchObject({ code: HTTP_ADAPTER_CODES.orgMismatch });
  });
});

// ------------------------------------------------------------------ host session contract over HTTP

describe("http host session contract", () => {
  test("the adapter is admitted by the real contract surface and is inert before binding", async () => {
    const host = createRouteHost();
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, caseId: "N-2", fetchImpl: host.fetchImpl })();
    expect(assertHostSession(session).ok).toBe(true);
    expect(isDefaultInert(session)).toBe(true);
  });

  test("binding creates the session with the exact evaluation body and exposes the token", async () => {
    const host = createRouteHost({ plan: NAMESPACED_READ("N-2") });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl })();
    const policy = binding("N-2");
    session.bindEvaluationPolicy(policy);
    expect(session.getEvaluationToken()).toBe(policy.conversationToken);
    expect(session.getEvaluationResult()).toBeNull();

    await session.send({ message: "go" });
    const created = host.sessionsLog[0];
    expect(created.body.channel).toBe("web");
    expect(created.body.profileId).toBe(PROFILE);
    expect(created.body.evaluation).toEqual(policy);
    const createCall = host.state.calls.find((c) => c.path === "/v1/sessions");
    expect(createCall.headers["x-org-id"]).toBe(ORG);
  });

  test("a streamed turn materializes the observed trace (tool events, usage, model) and the reply", async () => {
    const host = createRouteHost({ plan: NAMESPACED_READ("N-2") });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl })();
    session.bindEvaluationPolicy(binding("N-2"));
    const chunks = [];
    const reply = await session.sendStream({ message: "go" }, { onChunk: (delta) => chunks.push(delta) });
    expect(reply).toBe("answer N-2");
    const result = session.getEvaluationResult();
    expect(result.terminalReason).toBe("completed");
    expect(result.caseToken).toBe(binding("N-2").conversationToken);
    expect(result.toolExecutions).toBe(1);
    expect(result.modelEvidence).toBe("deepseek-v4.1-flash");
    // The wire now carries the host's actual result: real counters, real history flag.
    expect(result.forbidden).toBeNull();
    expect(result.modelGenerations).toBe(1);
    expect(result.historyValid).toBe(true);
    expect(result.observedVia).toBe("http");
    const observed = session.observations[0].observed;
    expect(observed.toolCalls[0].name).toBe("plugin_research_dashboard__get_overview");
    expect(observed.usage.totalTokens).toBe(19);
    expect(chunks.join("")).toContain("answ");
  });

  test("the non-streaming route returns the host's JSON reply shape", async () => {
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1") });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl, useStream: false })();
    session.bindEvaluationPolicy(binding("N-1"));
    const reply = await session.send({ message: "go" });
    expect(reply).toBe("answer N-1");
    const result = session.getEvaluationResult();
    expect(result.terminalReason).toBe("completed");
    expect(result.toolExecutions).toBe(1);
    expect(result.modelGenerations).toBe(1);
    expect(result.httpStatus).toBe(200);
  });

  test("a transport failure is surfaced as an unknown outcome and is never retried", async () => {
    const auth = await loggedInAuth(createRouteHost());
    let sendAttempts = 0;
    // Build a session against a create-capable host, then swap in the failing transport.
    const createHost = createRouteHost({ plan: NAMESPACED_READ("N-1") });
    const failing = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: (url, init) => (new URL(url).pathname.endsWith("/messages") ? (sendAttempts += 1, Promise.reject(new Error("socket closed after send"))) : createHost.fetchImpl(url, init)) })();
    failing.bindEvaluationPolicy(binding("N-1"));
    await expect(failing.send({ message: "go" })).rejects.toMatchObject({ code: HTTP_ADAPTER_CODES.transportUnknown });
    expect(sendAttempts).toBe(1);
  });

  test("the turn deadline aborts the request, reports a timeout result, and does not throw", async () => {
    const host = createRouteHost({ plan: () => ({ hang: true }) });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl, turnDeadlineMs: 30 })();
    session.bindEvaluationPolicy({ ...binding("N-1"), limits: { modelGenerationLimit: 3, toolCallLimit: 4, turnDeadlineMs: 30 } });
    const reply = await session.send({ message: "go" });
    expect(reply).toBe("Stopped because the evaluation turn deadline was exceeded.");
    const result = session.getEvaluationResult();
    expect(result.terminalReason).toBe("turn-deadline-exceeded");
    // A client-side backstop has no wire counters, so they stay explicitly null, never a fabricated zero.
    expect(result.observedVia).toBe("http-client-terminal");
    expect(result.modelGenerations).toBeNull();
    expect(host.state.calls.filter((c) => c.path.endsWith("/messages")).length).toBe(1);
  });

  test("a 2xx turn with no wire evaluation fails closed (no inferred completion)", async () => {
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1"), omitEvaluation: true });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl })();
    session.bindEvaluationPolicy(binding("N-1"));
    await expect(session.send({ message: "go" })).rejects.toMatchObject({ code: HTTP_ADAPTER_CODES.evaluationAbsent });
    expect(session.getEvaluationResult()).toBeNull();
  });

  test("a malformed wire evaluation fails closed", async () => {
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1"), malformEvaluation: true });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl })();
    session.bindEvaluationPolicy(binding("N-1"));
    await expect(session.send({ message: "go" })).rejects.toMatchObject({ code: HTTP_ADAPTER_CODES.evaluationMalformed });
  });

  test("a forbidden call on the wire reaches the driver's dispatch log", async () => {
    const host = createRouteHost({
      plan: () => ({
        answer: "Stopped because a forbidden tool call was attempted.",
        calls: [],
        forbidden: {
          arguments: "{}",
          at: 1,
          policyReason: "forbidden-tool",
          reason: "tool not in evaluation allowlist",
          tool: "plugin_research_dashboard__reconcile_topic",
        },
        terminalReason: "forbidden-tool",
      }),
    });
    const auth = await loggedInAuth(host);
    const session = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl })();
    session.bindEvaluationPolicy(binding("N-6", {}));
    await session.sendStream({ message: "go" }, {});
    const result = session.getEvaluationResult();
    expect(result.terminalReason).toBe("forbidden-tool");
    expect(result.forbidden.tool).toBe("plugin_research_dashboard__reconcile_topic");
    const log = dispatchLogFromResult(result);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ dispatched: false, name: "plugin_research_dashboard__reconcile_topic", policyReason: "forbidden-tool" });
  });
});

// ------------------------------------------------------------------ driver end-to-end over HTTP

describe("driver over the live-HTTP adapter", () => {
  test("N-1 runs end-to-end and the trace is read back from the real platform store", async () => {
    const store = freshStore();
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1"), store });
    const auth = await loggedInAuth(host);
    const driver = createDriver({
      authorization: makeAuth(["N-1"]),
      budgets: PROPOSED_BUDGETS,
      checkContainment: ({ profileKey }) => containmentFor(profileKey),
      createHostSession: createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl }),
      latch: createStopLatch(),
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const result = await driver.runCase({ caseId: "N-1", prompt: PROMPT_BINDINGS["N-1"].text, sessionId: "label-s1" });
    expect(result.ok).toBe(true);
    expect(result.trace.calls[0].name).toBe("plugin_research_dashboard__get_overview");
    expect(result.modelIdentity.reported).toBe("deepseek-v4.1-flash");
    expect(result.evaluation.terminalReason).toBe("completed");
    expect(result.containment).toMatchObject({ contained: true });
  });

  test("the sequence runs N-1 over HTTP and reads the host-assigned session id", async () => {
    const store = freshStore();
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1"), store });
    const auth = await loggedInAuth(host);
    const driver = createDriver({
      authorization: makeAuth(["N-1"]),
      budgets: PROPOSED_BUDGETS,
      checkContainment: ({ profileKey }) => containmentFor(profileKey),
      createHostSession: createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl }),
      latch: createStopLatch(),
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const run = await driver.runSequence({ cases: ["N-1"], prompts: { "N-1": PROMPT_BINDINGS["N-1"].text }, runAutomation: false, sessions: { "N-1": "label" } });
    expect(run.directOk).toBe(true);
    // The trace read followed the id the host created, not the caller's label.
    expect(host.sessionsLog[0].sessionId).toBe("sess-1");
    expect(store.count()).toBe(1);
  });

  test("a changed containment stops the case before any host call, with no recovery", async () => {
    const store = freshStore();
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1"), store });
    const auth = await loggedInAuth(host);
    const callsBefore = host.state.calls.length;
    const latch = createStopLatch();
    const driver = createDriver({
      authorization: makeAuth(["N-1"]),
      budgets: PROPOSED_BUDGETS,
      checkContainment: () => ({ ok: false, detail: "skill containment regressed" }),
      createHostSession: createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl }),
      latch,
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const result = await driver.runCase({ caseId: "N-1", prompt: PROMPT_BINDINGS["N-1"].text, sessionId: "s" });
    expect(result.codes).toContain(STOP_REASONS.containmentChanged);
    expect(latch.stopped).toBe(true);
    expect(latch.history).toHaveLength(1);
    expect(host.state.calls.length).toBe(callsBefore);
    expect(store.count()).toBe(0);
  });

  test("a throwing containment check is fail-closed", async () => {
    const host = createRouteHost({ plan: NAMESPACED_READ("N-1"), store: freshStore() });
    const auth = await loggedInAuth(host);
    const driver = createDriver({
      authorization: makeAuth(["N-1"]),
      budgets: PROPOSED_BUDGETS,
      checkContainment: () => { throw new Error("containment unreadable"); },
      createHostSession: createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl }),
      latch: createStopLatch(),
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: () => [],
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    expect((await driver.runCase({ caseId: "N-1", prompt: PROMPT_BINDINGS["N-1"].text, sessionId: "s" })).codes).toContain(STOP_REASONS.containmentChanged);
  });
});

// ------------------------------------------------------------------ N-7 automation over HTTP

describe("N-7 owned manual automation over HTTP", () => {
  test("the automation api speaks the real worker / create / run routes and stops the worker", async () => {
    const host = createRouteHost();
    const auth = await loggedInAuth(host);
    const api = createHttpAutomationApi({ auth, liveGrant: LIVE_GRANT, fetchImpl: host.fetchImpl });
    const definition = buildAutomationDefinition({ name: "n", profileId: PROFILE, prompt: "p" });
    const result = await runOwnedAutomation({ api, definition, directValidated: true, allowPlatformWrite: true });
    expect(result.ok).toBe(true);
    expect(result.started).toBe(true);
    expect(result.stopped).toBe(true);
    expect(host.state.worker).toBe("stop");
    const paths = host.state.calls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toContain("POST /v1/workers/automation/start");
    expect(paths).toContain("POST /v1/workers/automation/stop");
    expect(paths).toContain("POST /v1/automations");
    expect(paths.some((p) => p.startsWith("POST /v1/automations/auto-1/run"))).toBe(true);
  });

  test("the driver's N-7 wrapper runs the automation route and reads its trace", async () => {
    const store = freshStore();
    // Both cases consult a read: N-7 repeats N-1's frozen prompt, so the plan keys off the message.
    const hostWithPlan = createRouteHost({
      plan: (sid, message) => (sid === "auto-1" || message === PROMPT_BINDINGS["N-7"].text ? { answer: "automation output", calls: [{ arguments: {}, name: "get_overview" }] } : { answer: "direct output", calls: [{ arguments: {}, name: "get_overview" }] }),
      store,
    });
    const auth = await loggedInAuth(hostWithPlan);
    const direct = createHttpSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: hostWithPlan.fetchImpl });
    const automation = createHttpAutomationSessionFactory({ auth, liveGrant: LIVE_GRANT, fetchImpl: hostWithPlan.fetchImpl });
    const worker = { start: 0, stop: 0 };
    const api = {
      ...createHttpAutomationApi({ auth, liveGrant: LIVE_GRANT, fetchImpl: hostWithPlan.fetchImpl }),
      startWorker: async () => { worker.start += 1; return { ok: true }; },
      stopWorker: async () => { worker.stop += 1; return { ok: true }; },
    };
    const containmentFor = (profileKey) => ({ ok: true, profileId: FIXTURE_PROFILES[profileKey].id, tools: [...FIXTURE_PROFILES[profileKey].tools], skills: FIXTURE_PROFILES[profileKey].skill ? [FIXTURE_PROFILES[profileKey].skill] : [], automationsEnabled: false });
    const driver = createDriver({
      authorization: makeAuth(["N-1", AUTOMATION_CASE]),
      automationApi: api,
      budgets: PROPOSED_BUDGETS,
      checkContainment: ({ profileKey }) => containmentFor(profileKey),
      createHostSession: ({ caseId, sessionId, automationId }) =>
        caseId === AUTOMATION_CASE
          ? automation({ caseId, sessionId, automationId })
          : direct({ caseId, sessionId }),
      latch: createStopLatch(),
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const run = await driver.runSequence({
      automationDefinition: buildAutomationDefinition({ name: "n", profileId: PROFILE, prompt: PROMPT_BINDINGS["N-7"].text }),
      cases: ["N-1"],
      prompts: { "N-1": PROMPT_BINDINGS["N-1"].text, [AUTOMATION_CASE]: PROMPT_BINDINGS["N-7"].text },
      sessions: { "N-1": "s1", [AUTOMATION_CASE]: "s7" },
    });
    expect(run.directOk).toBe(true);
    expect(run.automation.ok).toBe(true);
    expect(worker.start).toBe(1);
    expect(worker.stop).toBe(1);
    expect(run.automation.evaluation.terminalReason).toBe("completed");
    expect(run.automation.trace.answer).toBe("automation output");
    expect(run.automation.outputComparison.repeatsCaseId).toBe("N-1");
  });
});

// ------------------------------------------------------------------ inference stays shut

describe("inference authorization", () => {
  test("the HTTP adapter does not authorize inference; the interlock is still false", () => {
    expect(INFERENCE_AUTHORIZED).toBe(false);
    // The contract the adapter speaks is exactly the routes above.
    expect(HOST_HTTP_CONTRACT.createSession.path).toBe("/v1/sessions");
    expect(HOST_HTTP_CONTRACT.runAutomation.path).toBe("/v1/automations/{automationId}/run");
  });

  test("every live transport is offline-only: it refuses without a live grant, before any call", async () => {
    const host = createRouteHost();
    const auth = await loggedInAuth(host);
    const callsBefore = host.state.calls.length;
    for (const build of [
      () => createHttpSessionFactory({ auth, fetchImpl: host.fetchImpl }),
      () => createHttpAutomationSessionFactory({ auth, fetchImpl: host.fetchImpl }),
      () => createHttpAutomationApi({ auth, fetchImpl: host.fetchImpl }),
    ]) {
      let error = null;
      try { build(); } catch (e) { error = e; }
      expect(error?.code).toBe(HTTP_ADAPTER_CODES.liveGrantRequired);
    }
    // A structurally-identical plain object is not a minted grant.
    expect(() => createHttpSessionFactory({ auth, liveGrant: { kind: "nakama-e2e-live-grant" }, fetchImpl: host.fetchImpl })).toThrow(HttpAdapterError);
    expect(host.state.calls.length).toBe(callsBefore);
  });

  test("the proposed record carries candid HTTP-boundary limitations and stays ungranted", () => {
    const record = buildProposedAuthorizationRecord();
    expect(record.executionAuthorized).toBe(false);
    expect(record.limitations.length).toBeGreaterThan(0);
    const limitations = record.limitations.join(" ").toLowerCase();
    expect(limitations).toContain("fails closed");
    expect(limitations).toContain("restart-persistent");
  });
});
