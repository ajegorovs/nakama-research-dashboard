/**
 * Offline tests for the **authorized live entrypoint** (`live.mjs`) and the live dispatch guard.
 *
 * Two halves, deliberately separated:
 *
 *   - the **real** repository tree is asserted shut: `INFERENCE_AUTHORIZED` and `executionAuthorized` both
 *     stay `false`, `createAuthorizedLiveDriver` refuses at both gates, and — crucially — `mintLiveGrant`
 *     **itself** runs the gates and refuses, so importing it cannot mint authority. Nothing dispatches.
 *   - the **positive** path is exercised against an isolated **copied source** (`live-test-sandbox.mjs`),
 *     which flips `INFERENCE_AUTHORIZED` in the copy and never in this repository. The grant the positive
 *     tests use is minted by the copied, still-gated `mintLiveGrant`; every transport is an injected offline
 *     emulator (no network).
 *
 *     bun test harness/nakama-e2e/driver/live.test.mjs
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ACCEPTED_HOST, AUTHORIZATION_ERROR_CODES, ADMITTED_FIXTURE, buildProposedAuthorizationRecord } from "./authorization.mjs";
import { AUTOMATION_CASE, CASE_IDS, DIRECT_CASE_ORDER } from "./cases.mjs";
import { FIXTURE_PROFILES } from "./profiles.mjs";
import { createSessionStore, createTraceReader } from "./adapters.mjs";
import { STOP_REASONS } from "./stop-latch.mjs";
import { INFERENCE_AUTHORIZED } from "../turn.mjs";
import { LIVE_ERROR_CODES, assertAuthorizedPin, createAuthorizedLiveDriver, runAuthorizedSequence } from "./live.mjs";
import * as liveModule from "./live.mjs";
import { LIVE_GRANT_ERROR_CODES, isLiveGrant, mintLiveGrant } from "./live-grant.mjs";
import { HTTP_ADAPTER_CODES, createHttpAutomationApi, createHttpSessionFactory } from "./http-adapters.mjs";
import { loadLiveSandbox } from "./live-test-sandbox.mjs";

// The positive path runs against an isolated copied source (see the module docstring). Loading it here is the
// ONLY place inference is authorised, and only inside the copy.
const sandbox = await loadLiveSandbox();
afterAll(() => sandbox.cleanup());

const scratch = mkdtempSync(join(tmpdir(), "nakama-live-entrypoint-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let dbSeq = 0;
function freshStore() {
  dbSeq += 1;
  return createSessionStore(join(scratch, `live-session-${dbSeq}.sqlite`));
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sseBody = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

/** Build the granted authorization the tests gate on (a valid record; `executionAuthorized: true`). */
function grantedAuth(overrides = {}) {
  return buildProposedAuthorizationRecord({ executionAuthorized: true, ...overrides });
}
/** The contract whose digest matches the accepted amended-host binding — the gate's second condition. */
const MATCHING_CONTRACT = { digest: ACCEPTED_HOST.contractDigest };
/** A fetch spy that fails the test if the entrypoint ever dispatches. */
const noHttp = () => {
  throw new Error("no HTTP must occur on this path");
};

function wireEvaluation({ caseToken, toolExecutions, terminalReason = "completed" }) {
  return { caseToken, endedAt: Date.now(), forbidden: null, historyValid: true, modelGenerations: 1, startedAt: Date.now(), terminalReason, toolExecutions };
}

/** The amended host's served routes, emulated exactly (injected `fetchImpl`; no network). */
function createRouteHost({ plan = () => ({ answer: "ok", calls: [] }), store = null, org }) {
  const state = { sessions: new Map(), automations: new Map(), calls: [], sessionSeq: 0, autoSeq: 0, worker: null };
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const headers = init.headers ?? {};
    state.calls.push({ method, path: pathname });

    if (pathname === "/v1/auth/login" && method === "POST") {
      const h = new Headers();
      h.append("set-cookie", "nakama_session=session-token; Path=/; HttpOnly");
      h.append("set-cookie", "nakama_csrf=csrf-token; Path=/");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    }
    if (pathname === "/v1/auth/orgs") return jsonResponse({ orgs: [{ id: org.id, name: org.name }] });
    if (pathname === "/v1/auth/me") return jsonResponse({ id: "user_admin" });

    if (pathname === "/v1/sessions" && method === "POST") {
      const sessionId = `sess-${++state.sessionSeq}`;
      state.sessions.set(sessionId, { evaluation: body?.evaluation ?? null });
      return jsonResponse({ sessionId }, 201);
    }

    let match = pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/);
    if (match && method === "POST") {
      const sessionId = decodeURIComponent(match[1]);
      const turn = plan(sessionId, body?.message) ?? { answer: "ok", calls: [] };
      const toolCalls = (turn.calls ?? []).map((call) => ({ arguments: call.arguments ?? null, name: call.name }));
      if (store) {
        store.append(sessionId, { content: turn.answer ?? "", model: "deepseek-v4.1-flash", provider: "opencode-go", role: "assistant", toolCalls, usage: { total_tokens: 19 } });
      }
      const usage = { calls: [{ modelId: "deepseek-v4.1-flash" }], totalTokens: 19 };
      const evaluation = wireEvaluation({ caseToken: state.sessions.get(sessionId)?.evaluation?.conversationToken ?? "eval-case01", toolExecutions: toolCalls.length });
      if (String(headers.accept ?? "").includes("text/event-stream")) {
        const events = [];
        for (const call of toolCalls) {
          events.push({ input: call.arguments ?? {}, tool: call.name, toolCallId: `tc-${call.name}`, type: "tool_start" });
          events.push({ result: { ok: true }, tool: call.name, toolCallId: `tc-${call.name}`, type: "tool_end" });
        }
        events.push({ reply: turn.answer ?? "", type: "done", usage, evaluation });
        return new Response(sseBody(events), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
      }
      return jsonResponse({ reply: turn.answer ?? "", usage, evaluation });
    }

    match = pathname.match(/^\/v1\/workers\/automation\/(start|stop)$/);
    if (match && method === "POST") {
      state.worker = match[1];
      return jsonResponse({ ok: true });
    }
    if (pathname === "/v1/automations" && method === "POST") {
      const id = `auto-${++state.autoSeq}`;
      state.automations.set(id, body);
      return jsonResponse({ automation: { id, ...body } }, 201);
    }
    match = pathname.match(/^\/v1\/automations\/([^/]+)\/run$/);
    if (match && method === "POST") {
      const automationId = decodeURIComponent(match[1]);
      const turn = plan(automationId, body?.message) ?? { answer: "automation output", calls: [] };
      const runToolCalls = (turn.calls ?? []).map((call) => ({ arguments: call.arguments ?? null, name: call.name }));
      if (store) {
        store.append(automationId, { content: turn.answer ?? "", model: "deepseek-v4.1-flash", provider: "opencode-go", role: "assistant", toolCalls: runToolCalls, usage: { total_tokens: 5 } });
      }
      const evaluation = wireEvaluation({ caseToken: body?.evaluation?.conversationToken ?? "eval-auto01", toolExecutions: runToolCalls.length });
      return jsonResponse({ run: { id: `run-${automationId}`, output: turn.answer ?? "" }, evaluation });
    }

    return jsonResponse({ error: `unhandled ${method} ${pathname}` }, 404);
  };
  return { fetchImpl, state };
}

const STABLE_PIN = { generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path: join(scratch, "store.sqlite"), revision: ADMITTED_FIXTURE.pluginRevision };
const STABLE_SNAPSHOT = { counts: { development_axes: 8 }, objects: [], rows: {}, versions: {} };
const exactContainment = (profileKey) => ({ ok: true, profileId: FIXTURE_PROFILES[profileKey].id, tools: [...FIXTURE_PROFILES[profileKey].tools], skills: FIXTURE_PROFILES[profileKey].skill ? [FIXTURE_PROFILES[profileKey].skill] : [], automationsEnabled: false });
const readPlan = (caseId) => () => ({ answer: `answer ${caseId}`, calls: [{ arguments: { caseId }, name: "get_overview" }] });

/** Compose the positive path through the COPIED, still-gated entrypoint (inference authorised in the copy). */
function sandboxLive({ authorization = grantedAuth(), hostContract = MATCHING_CONTRACT, ...seams } = {}) {
  const live = sandbox.live.createAuthorizedLiveDriver({ authorization, hostContract, ...seams });
  if (!live.ok) throw new Error(`sandbox entrypoint refused: ${live.code}`);
  return live;
}

/** Mint a grant through the COPIED gated mint (runs authorizeExecution + assertInferenceAuthorized). */
function sandboxGrant({ authorization = grantedAuth(), hostContract = MATCHING_CONTRACT } = {}) {
  const minted = sandbox.liveGrant.mintLiveGrant({ authorization, hostContract });
  if (!minted.ok) throw new Error(`sandbox mint refused: ${minted.code}`);
  return minted.grant;
}

// ------------------------------------------------------------------ gates: shut before any I/O

describe("live entrypoint: both gates run inside the mint, before any I/O", () => {
  test("an ungranted record refuses at the execution gate with zero HTTP", () => {
    const result = createAuthorizedLiveDriver({ authorization: buildProposedAuthorizationRecord(), fetchImpl: noHttp });
    expect(result.ok).toBe(false);
    expect(result.granted).toBe(false);
    expect(result.code).toBe(LIVE_ERROR_CODES.notGranted);
    expect(result.blocked).toBe(false);
  });

  test("a granted record with no host contract is blocked, with zero HTTP", () => {
    const result = createAuthorizedLiveDriver({ authorization: grantedAuth(), fetchImpl: noHttp });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(LIVE_ERROR_CODES.contractUnavailable);
    expect(result.blocked).toBe(true);
  });

  test("a granted record with a mismatched host contract is blocked, with zero HTTP", () => {
    const result = createAuthorizedLiveDriver({ authorization: grantedAuth(), fetchImpl: noHttp, hostContract: { digest: "0".repeat(64) } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(LIVE_ERROR_CODES.contractDigestMismatch);
    expect(result.blocked).toBe(true);
  });

  test("even a fully granted record + matching contract is shut by the inference interlock (INFERENCE_AUTHORIZED false)", () => {
    expect(INFERENCE_AUTHORIZED).toBe(false);
    const result = createAuthorizedLiveDriver({ authorization: grantedAuth(), fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(LIVE_ERROR_CODES.inferenceBlocked);
    expect(result.blocked).toBe(true);
    // The convenience route refuses the same way and performs no I/O.
    return runAuthorizedSequence({ authorization: grantedAuth(), fetchImpl: noHttp, hostContract: MATCHING_CONTRACT }).then((r) => {
      expect(r.code).toBe(LIVE_ERROR_CODES.inferenceBlocked);
    });
  });

  test("the gate refusal happens before any adapter: no login/session/pin/containment call", () => {
    let pinned = 0;
    let contained = 0;
    const result = createAuthorizedLiveDriver({
      authorization: buildProposedAuthorizationRecord(),
      checkContainment: () => { contained += 1; return { ok: true }; },
      fetchImpl: noHttp,
      pinStore: () => { pinned += 1; return { ...STABLE_PIN }; },
    });
    expect(result.code).toBe(LIVE_ERROR_CODES.notGranted);
    expect(pinned).toBe(0);
    expect(contained).toBe(0);
  });

  test("a caller value for an authorization-owned field is refused", () => {
    const result = createAuthorizedLiveDriver({ authorization: grantedAuth(), budgets: { any: 1 }, fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.code).toBe(LIVE_ERROR_CODES.criticalOverride);
  });
});

// ------------------------------------------------------------------ the mint is gated; the bypass is closed

describe("live grant: the mint itself runs both gates (no unconditional export)", () => {
  test("mintLiveGrant refuses an ungranted record (execution gate), with no grant registered", () => {
    const minted = mintLiveGrant({ authorization: buildProposedAuthorizationRecord() });
    expect(minted.ok).toBe(false);
    expect(minted.code).toBe(AUTHORIZATION_ERROR_CODES.executionNotGranted);
    expect(minted.blocked).toBe(false);
    expect(isLiveGrant(minted.grant)).toBe(false);
  });

  test("mintLiveGrant refuses a granted record without a matching host contract (blocked seam)", () => {
    expect(mintLiveGrant({ authorization: grantedAuth() }).code).toBe(AUTHORIZATION_ERROR_CODES.hostContractUnavailable);
    expect(mintLiveGrant({ authorization: grantedAuth(), hostContract: { digest: "0".repeat(64) } }).code).toBe(AUTHORIZATION_ERROR_CODES.hostContractDigestMismatch);
  });

  test("mintLiveGrant refuses even a fully granted record + matching contract: the inference interlock (INFERENCE_AUTHORIZED false) is inside the mint", () => {
    const minted = mintLiveGrant({ authorization: grantedAuth(), hostContract: MATCHING_CONTRACT });
    expect(minted.ok).toBe(false);
    expect(minted.code).toBe(LIVE_GRANT_ERROR_CODES.inferenceBlocked);
    expect(minted.blocked).toBe(true);
    expect(isLiveGrant(minted.grant)).toBe(false);
  });

  test("the old bypass composition is impossible: composeLiveDriver is not exported and a plain object is not a grant", () => {
    expect(liveModule.composeLiveDriver).toBeUndefined();
    expect("composeLiveDriver" in liveModule).toBe(false);
    expect(isLiveGrant({ kind: "nakama-e2e-live-grant" })).toBe(false);
    // mintLiveGrant with no record never yields a grant to compose with.
    expect(isLiveGrant(mintLiveGrant().grant)).toBe(false);
  });

  test("the removed test-only support module does not ship (no ungated grant export)", () => {
    expect(existsSync(new URL("./live-test-support.mjs", import.meta.url))).toBe(false);
  });
});

// ------------------------------------------------------------------ pre-pin binding

describe("live entrypoint: pre-pin is bound to the authorized identity", () => {
  test("assertAuthorizedPin requires the authorized revision and generation", () => {
    const auth = grantedAuth();
    expect(assertAuthorizedPin({ authorization: auth, pin: STABLE_PIN }).ok).toBe(true);
    expect(assertAuthorizedPin({ authorization: auth, pin: { ...STABLE_PIN, revision: 11 } }).code).toBe(LIVE_ERROR_CODES.pinMismatch);
    expect(assertAuthorizedPin({ authorization: auth, pin: { ...STABLE_PIN, generation: "g0" } }).code).toBe(LIVE_ERROR_CODES.pinMismatch);
  });

  test("a wrong pre-pin latches the case before inference (zero trace rows, zero /messages calls)", async () => {
    const store = freshStore();
    const host = createRouteHost({ plan: readPlan("N-1"), store, org: grantedAuth().org });
    const live = sandboxLive({
      base: "http://127.0.0.1:4399",
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      email: "admin@example.com",
      fetchImpl: host.fetchImpl,
      password: "x",
      pinStore: () => ({ ...STABLE_PIN, revision: 11 }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const run = await live.runAuthorizedSequence();
    expect(run.ok).toBe(false);
    expect(run.direct[0].codes).toContain(STOP_REASONS.identityMismatch);
    expect(store.count()).toBe(0);
    expect(host.state.calls.some((c) => c.path.endsWith("/messages"))).toBe(false);
  });
});

// ------------------------------------------------------------------ canonical sequence

describe("live entrypoint: exact canonical sequence, single-shot per grant", () => {
  test("the sequence is fixed N-1…N-6 then N-7 and caller cases/prompts/sessions are refused", async () => {
    const store = freshStore();
    const auth = grantedAuth();
    const host = createRouteHost({ plan: () => ({ answer: "ok", calls: [{ arguments: {}, name: "get_overview" }] }), store, org: auth.org });
    const live = sandboxLive({
      base: "http://127.0.0.1:4399",
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      email: "admin@example.com",
      fetchImpl: host.fetchImpl,
      password: "x",
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    expect(live.directCases).toEqual(DIRECT_CASE_ORDER);
    expect(live.sequence).toEqual(CASE_IDS);
    // No standalone N-7 route on the live object.
    expect(live.runAutomationCase).toBeUndefined();
    expect(live.runCase).toBeUndefined();

    // Shortening / reordering / duplicating / substituting, and a premature N-7-only run, are all refused
    // before any call.
    for (const bad of [
      { cases: ["N-1"] },
      { cases: ["N-7"] },
      { cases: ["N-2", "N-1", "N-3", "N-4", "N-5", "N-6"] },
      { cases: [...DIRECT_CASE_ORDER, "N-1"] },
      { prompts: { "N-1": "substituted" } },
      { sessions: { "N-1": "s" } },
      { runAutomation: false },
    ]) {
      const refused = await live.runAuthorizedSequence(bad);
      expect(refused.code).toBe(LIVE_ERROR_CODES.sequenceOverride);
      expect(refused.direct).toBeUndefined();
    }
    expect(host.state.calls.some((c) => c.path === "/v1/auth/login")).toBe(false);
  });

  test("a full positive run proves all six direct cases then N-7 in the same run", async () => {
    const store = freshStore();
    const auth = grantedAuth();
    const host = createRouteHost({ plan: readPlan("direct"), store, org: auth.org });
    const live = sandboxLive({
      base: "http://127.0.0.1:4399",
      checkContainment: ({ profileKey }) => exactContainment(profileKey),
      email: "admin@example.com",
      fetchImpl: host.fetchImpl,
      password: "x",
      pinStore: () => ({ ...STABLE_PIN }),
      readTrace: createTraceReader(store.path),
      snapshotStore: () => STABLE_SNAPSHOT,
    });
    const run = await live.runAuthorizedSequence();
    expect(run.directOk).toBe(true);
    expect(run.direct.map((r) => r.caseId)).toEqual(DIRECT_CASE_ORDER);
    expect(run.direct.every((r) => r.ok)).toBe(true);
    expect(run.automation.ok).toBe(true);
    expect(run.ok).toBe(true);
    // The owned worker started and stopped exactly once around the single manual run.
    expect(host.state.worker).toBe("stop");

    // The grant's shared run token was consumed by the first run…
    expect(sandbox.liveGrant.claimGrantRunToken(live.grant).code).toBe(LIVE_GRANT_ERROR_CODES.alreadyRun);
    // …so a second invocation is refused.
    const second = await live.runAuthorizedSequence();
    expect(second.code).toBe(LIVE_ERROR_CODES.sequenceAlreadyInvoked);
  });
});

// ------------------------------------------------------------------ immutable authorized snapshot

describe("live grant: the authorized snapshot is frozen, not a mutable handle", () => {
  test("the grant carries a deep-frozen clone of the authorization and host contract", () => {
    const authorization = grantedAuth();
    const grant = sandboxGrant({ authorization, hostContract: MATCHING_CONTRACT });
    expect(Object.isFrozen(grant)).toBe(true);
    expect(Object.isFrozen(grant.authorization)).toBe(true);
    expect(Object.isFrozen(grant.authorization.host)).toBe(true);
    expect(Object.isFrozen(grant.authorization.budgets)).toBe(true);
    expect(Object.isFrozen(grant.hostContract)).toBe(true);
    // A mutation after the gates passed is refused (strict mode throws on a frozen object).
    expect(() => { grant.authorization.executionAuthorized = false; }).toThrow();
    expect(() => { grant.authorization.host.contractDigest = "0".repeat(64); }).toThrow();
    // The caller's original record is a different object: the grant holds a clone, not a handle.
    expect(grant.authorization).not.toBe(authorization);
  });
});

// ------------------------------------------------------------------ dispatch guard

describe("live dispatch guard: raw transports are offline-only", () => {
  test("the transport constructors refuse without a minted live grant, and a plain object is not a grant", () => {
    const auth = grantedAuth();
    const host = createRouteHost({ org: auth.org });
    for (const build of [
      () => createHttpSessionFactory({ auth, fetchImpl: host.fetchImpl }),
      () => createHttpSessionFactory({ auth, fetchImpl: host.fetchImpl, liveGrant: { kind: "nakama-e2e-live-grant" } }),
      () => createHttpAutomationApi({ auth, fetchImpl: host.fetchImpl }),
    ]) {
      let error = null;
      try { build(); } catch (e) { error = e; }
      expect(error?.code).toBe(HTTP_ADAPTER_CODES.liveGrantRequired);
    }
    expect(host.state.calls.length).toBe(0);
  });
});
