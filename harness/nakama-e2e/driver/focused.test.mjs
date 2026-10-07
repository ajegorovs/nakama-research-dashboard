/**
 * Offline tests for the **focused `get_topic`-scope condition** (`focused.mjs`) and its authorized live
 * entrypoint (`focused-live.mjs`).
 *
 * Two halves, the same separation `live.test.mjs` uses:
 *
 *   - the **real** repository tree is asserted shut: `INFERENCE_AUTHORIZED` stays `false`, so the focused
 *     entry refuses at the inference gate no matter how valid the record is, and a refusal performs zero
 *     HTTP.
 *   - the **positive** path runs against an isolated **copied** source (`live-test-sandbox.mjs`), whose copy
 *     flips the interlock; every transport is an injected offline emulator (no network, no model).
 *
 * The conditioned entry is exercised end-to-end (compose → one turn → platform-DB trace → classify), and
 * each negative binds one specific guard: prompt mutation, budget, retry, profile, allowlist, case-set,
 * pre-pin identity and single-shot.
 *
 *   bun test harness/nakama-e2e/driver/focused.test.mjs
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ACCEPTED_HOST,
  ADMITTED_FIXTURE,
  AUTHORIZATION_ERROR_CODES,
  FREE_CONDITION_KEY,
  PROVIDER_CONDITIONS,
} from "./authorization.mjs";
import { PROPOSED_CASE_BUDGETS } from "./budgets.mjs";
import { CASE_DISPATCH_ALLOWLIST } from "./cases.mjs";
import { FIXTURE_PROFILES } from "./profiles.mjs";
import { sha256Utf8 } from "./prompts.mjs";
import { createSessionStore, createTraceReader } from "./adapters.mjs";
import { STOP_REASONS } from "./stop-latch.mjs";
import { INFERENCE_AUTHORIZED } from "../turn.mjs";
import { LIVE_ERROR_CODES } from "./live.mjs";
import { LIVE_GRANT_ERROR_CODES } from "./live-grant.mjs";
import { HTTP_ADAPTER_CODES, createHttpSessionFactory } from "./http-adapters.mjs";
import { loadLiveSandbox } from "./live-test-sandbox.mjs";
import {
  FOCUSED_CASE_SLOT,
  FOCUSED_ERROR_CODES,
  FOCUSED_PROFILE_KEY,
  FOCUSED_PROMPT,
  FOCUSED_PROMPT_SHA256,
  FOCUSED_SCOPE,
  assertFocusedBinding,
  buildFocusedAuthorizationRecord,
  validateFocusedAuthorization,
} from "./focused.mjs";
import * as focusedLiveModule from "./focused-live.mjs";
import { FOCUSED_LIVE_ERROR_CODES, createAuthorizedFocusedDriver } from "./focused-live.mjs";

const sandbox = await loadLiveSandbox();
afterAll(() => sandbox.cleanup());

const scratch = mkdtempSync(join(tmpdir(), "nakama-focused-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let dbSeq = 0;
const freshStore = () => createSessionStore(join(scratch, `focused-session-${++dbSeq}.sqlite`));

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sseBody = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
const noHttp = () => { throw new Error("no HTTP must occur on this path"); };
const FOCUSED_WIRE_MODEL = PROVIDER_CONDITIONS[FREE_CONDITION_KEY].wireModel;

/** A valid focused record that grants execution. */
const grantedFocus = (overrides = {}) => buildFocusedAuthorizationRecord({ executionAuthorized: true, ...overrides });
const MATCHING_CONTRACT = { digest: ACCEPTED_HOST.contractDigest };

const STABLE_PIN = { generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path: join(scratch, "store.sqlite"), revision: ADMITTED_FIXTURE.pluginRevision };
const STABLE_SNAPSHOT = { counts: { development_axes: 8 }, objects: [], rows: {}, versions: {} };
const exactContainment = (profileKey) => ({ ok: true, profileId: FIXTURE_PROFILES[profileKey].id, tools: [...FIXTURE_PROFILES[profileKey].tools], skills: [], automationsEnabled: false });

function wireEvaluation({ caseToken, toolExecutions, terminalReason = "completed" }) {
  return { caseToken, endedAt: Date.now(), forbidden: null, historyValid: true, modelGenerations: 1, startedAt: Date.now(), terminalReason, toolExecutions };
}

/** The host's served routes, emulated exactly (injected `fetchImpl`; no network). */
function createRouteHost({ plan = () => ({ answer: "ok", calls: [] }), store = null, org }) {
  const state = { sessions: new Map(), calls: [], sessionSeq: 0 };
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

    const match = pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/);
    if (match && method === "POST") {
      const sessionId = decodeURIComponent(match[1]);
      const turn = plan(sessionId, body?.message) ?? { answer: "ok", calls: [] };
      const toolCalls = (turn.calls ?? []).map((call) => ({ arguments: call.arguments ?? null, name: call.name }));
      if (store) {
        store.append(sessionId, { content: turn.answer ?? "", model: FOCUSED_WIRE_MODEL, role: "assistant", toolCalls, usage: { total_tokens: 19 } });
      }
      const usage = { calls: [{ modelId: FOCUSED_WIRE_MODEL }], totalTokens: 19 };
      const evaluation = wireEvaluation({ caseToken: state.sessions.get(sessionId)?.evaluation?.conversationToken ?? "eval-focused1", toolExecutions: toolCalls.length });
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
    return jsonResponse({ error: `unhandled ${method} ${pathname}` }, 404);
  };
  return { fetchImpl, state };
}

/** The three scoped reads the focused turn is graded on (discovery + one batched generation of scoped reads). */
const SCOPED_READS = [
  { name: "find_tools", arguments: { query: "get_topic" } },
  { name: "get_topic", arguments: { topicId: FOCUSED_SCOPE.topicId, axisId: FOCUSED_SCOPE.axes.clean.id } },
  { name: "get_topic", arguments: { topicId: FOCUSED_SCOPE.topicId, axisId: FOCUSED_SCOPE.axes.problem.id } },
  { name: "get_topic", arguments: { topicId: FOCUSED_SCOPE.topicId, axisId: FOCUSED_SCOPE.axes.bounded.id, notesLimit: 1 } },
];
const scopedPlan = () => ({ answer: "clean: state active, notes absent; problem: state blocked, problem note quoted; bounded: notes truncated at 1.", calls: SCOPED_READS });

const MATCHING_SEAMS = (host, store) => ({
  base: "http://127.0.0.1:4399",
  checkContainment: ({ profileKey }) => exactContainment(profileKey),
  email: "admin@example.com",
  fetchImpl: host.fetchImpl,
  password: "x",
  pinStore: () => ({ ...STABLE_PIN }),
  readTrace: createTraceReader(store.path),
  snapshotStore: () => STABLE_SNAPSHOT,
});

const sandboxFocused = ({ authorization = grantedFocus(), hostContract = MATCHING_CONTRACT, ...seams } = {}) => {
  const live = sandbox.focusedLive.createAuthorizedFocusedDriver({ authorization, hostContract, ...seams });
  if (!live.ok) throw new Error(`sandbox focused entrypoint refused: ${live.code}`);
  return live;
};

// ------------------------------------------------------------------ the frozen focused prompt

describe("focused condition: the prompt, scope and ids are frozen and self-consistent", () => {
  test("the prompt digest is the sha256 of the exact bytes, and the scope carries three stable axis ids", () => {
    expect(sha256Utf8(FOCUSED_PROMPT)).toBe(FOCUSED_PROMPT_SHA256);
    expect(FOCUSED_PROMPT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const ids = Object.values(FOCUSED_SCOPE.axes).map((a) => a.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(FOCUSED_PROMPT).toContain(id);
    expect(FOCUSED_PROMPT).toContain(FOCUSED_SCOPE.topicId);
    // It names no tool and no argument shape — the model must infer the scoped call from the tool doc.
    expect(FOCUSED_PROMPT).not.toMatch(/get_topic\(|axisId\s*[:=]|find_tools/);
  });
});

// ------------------------------------------------------------------ the record and binding

describe("focused condition: buildFocusedAuthorizationRecord + validateFocusedAuthorization", () => {
  test("the built record validates and binds exactly the focused slot, prompt, profile, allowlist and budget", () => {
    const record = grantedFocus();
    expect(validateFocusedAuthorization(record).ok).toBe(true);
    expect(record.cases).toEqual([FOCUSED_CASE_SLOT]);
    expect(record.caseProfile[FOCUSED_CASE_SLOT]).toBe(FOCUSED_PROFILE_KEY);
    expect(record.prompts[FOCUSED_CASE_SLOT].sha256).toBe(FOCUSED_PROMPT_SHA256);
    expect([...record.effectiveAllowedCalls[FOCUSED_CASE_SLOT]].sort()).toEqual([...CASE_DISPATCH_ALLOWLIST].sort());
    expect(record.caseBudgets[FOCUSED_CASE_SLOT]).toEqual(PROPOSED_CASE_BUDGETS[FOCUSED_CASE_SLOT]);
    expect(record.noRetry).toBe(true);
    // The frozen per-case budgets for the other N-* cases are untouched.
    expect(Object.keys(PROPOSED_CASE_BUDGETS)).toEqual(["N-1", "N-2", "N-3", "N-4", "N-5", "N-6", "N-7"]);
  });

  test("a prompt-byte mutation (sha recomputed) is refused by the focused binding", () => {
    const mutated = `${FOCUSED_PROMPT} extra`;
    const record = grantedFocus({ prompts: { [FOCUSED_CASE_SLOT]: { text: mutated, sha256: sha256Utf8(mutated) } } });
    const check = validateFocusedAuthorization(record);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(FOCUSED_ERROR_CODES.promptMismatch);
  });

  test("a widened per-case budget is refused (reviewed ceiling)", () => {
    const record = grantedFocus({ caseBudgets: { [FOCUSED_CASE_SLOT]: { ...PROPOSED_CASE_BUDGETS[FOCUSED_CASE_SLOT], modelGenerations: 99 } } });
    expect(validateFocusedAuthorization(record).ok).toBe(false);
  });

  test("an in-range but non-slot per-case budget is refused by the focused binding", () => {
    const record = grantedFocus({ caseBudgets: { [FOCUSED_CASE_SLOT]: { ...PROPOSED_CASE_BUDGETS[FOCUSED_CASE_SLOT], toolCalls: 5 } } });
    const check = validateFocusedAuthorization(record);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(FOCUSED_ERROR_CODES.budgetMismatch);
  });

  test("noRetry=false is refused (retry disabled)", () => {
    expect(validateFocusedAuthorization(grantedFocus({ noRetry: false })).ok).toBe(false);
  });

  test("a profile mismatch is refused", () => {
    const record = grantedFocus({ caseProfile: { [FOCUSED_CASE_SLOT]: "full5" } });
    expect(validateFocusedAuthorization(record).ok).toBe(false);
  });

  test("a writer in the allowlist is refused by the focused binding", () => {
    const record = grantedFocus({ effectiveAllowedCalls: { [FOCUSED_CASE_SLOT]: [...CASE_DISPATCH_ALLOWLIST, "reconcile_topic"] } });
    const check = validateFocusedAuthorization(record);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(FOCUSED_ERROR_CODES.allowlistMismatch);
  });

  test("a case set other than the focused slot is refused", () => {
    const record = { ...grantedFocus(), cases: ["N-1"], prompts: { "N-1": { text: FOCUSED_PROMPT, sha256: FOCUSED_PROMPT_SHA256 } } };
    expect(assertFocusedBinding({ authorization: record }).code).toBe(FOCUSED_ERROR_CODES.caseSetMismatch);
  });
});

// ------------------------------------------------------------------ gates shut in this tree

describe("focused entrypoint: both gates run inside the mint, before any I/O", () => {
  test("an ungranted record refuses at the execution gate with zero HTTP", () => {
    const result = createAuthorizedFocusedDriver({ authorization: buildFocusedAuthorizationRecord(), fetchImpl: noHttp });
    expect(result.ok).toBe(false);
    expect(result.granted).toBe(false);
    expect(result.code).toBe(AUTHORIZATION_ERROR_CODES.executionNotGranted);
    expect(result.blocked).toBe(false);
  });

  test("a granted record with no host contract is blocked, with zero HTTP", () => {
    const result = createAuthorizedFocusedDriver({ authorization: grantedFocus(), fetchImpl: noHttp });
    expect(result.code).toBe(LIVE_ERROR_CODES.contractUnavailable);
    expect(result.blocked).toBe(true);
  });

  test("a granted record with a mismatched host contract is blocked, with zero HTTP", () => {
    const result = createAuthorizedFocusedDriver({ authorization: grantedFocus(), fetchImpl: noHttp, hostContract: { digest: "0".repeat(64) } });
    expect(result.code).toBe(LIVE_ERROR_CODES.contractDigestMismatch);
    expect(result.blocked).toBe(true);
  });

  test("even a fully granted record + matching contract is shut by the interlock (INFERENCE_AUTHORIZED false)", () => {
    expect(INFERENCE_AUTHORIZED).toBe(false);
    const result = createAuthorizedFocusedDriver({ authorization: grantedFocus(), fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.code).toBe(LIVE_ERROR_CODES.inferenceBlocked);
    expect(result.blocked).toBe(true);
  });

  test("a caller value for an authorization-owned field is refused", () => {
    const result = createAuthorizedFocusedDriver({ authorization: grantedFocus(), fetchImpl: noHttp, hostContract: MATCHING_CONTRACT, budgets: { any: 1 } });
    expect(result.code).toBe(FOCUSED_LIVE_ERROR_CODES.criticalOverride);
  });

  test("the gate refusal happens before any adapter: no pin/containment/session call", () => {
    let pinned = 0;
    let contained = 0;
    const result = createAuthorizedFocusedDriver({
      authorization: buildFocusedAuthorizationRecord(),
      checkContainment: () => { contained += 1; return { ok: true }; },
      fetchImpl: noHttp,
      pinStore: () => { pinned += 1; return { ...STABLE_PIN }; },
    });
    expect(result.code).toBe(AUTHORIZATION_ERROR_CODES.executionNotGranted);
    expect(pinned).toBe(0);
    expect(contained).toBe(0);
  });

  test("no ungated composer is exported", () => {
    expect(focusedLiveModule.buildFocusedRuntime).toBeUndefined();
  });
});

// ------------------------------------------------------------------ positive path (copied, flipped source)

describe("focused entrypoint: one bounded direct turn, single-shot", () => {
  test("composes and exposes only runFocusedTurn", () => {
    const store = freshStore();
    const record = grantedFocus();
    const host = createRouteHost({ plan: scopedPlan, store, org: record.org });
    const live = sandboxFocused({ ...MATCHING_SEAMS(host, store) });
    expect(typeof live.runFocusedTurn).toBe("function");
    expect(live.runCase).toBeUndefined();
    expect(live.runSequence).toBeUndefined();
    expect(live.runAuthorizedSequence).toBeUndefined();
    expect(live.caseSlot).toBe(FOCUSED_CASE_SLOT);
    expect(live.promptSha256).toBe(FOCUSED_PROMPT_SHA256);
  });

  test("one turn dispatches exactly three axisId-scoped reads and passes the structural classifier", async () => {
    const store = freshStore();
    const record = grantedFocus();
    const host = createRouteHost({ plan: scopedPlan, store, org: record.org });
    const live = sandboxFocused({ ...MATCHING_SEAMS(host, store) });
    const run = await live.runFocusedTurn();
    expect(run.ok).toBe(true);
    expect(run.caseId).toBe(FOCUSED_CASE_SLOT);
    expect(run.terminal).toBe(false);
    // Structural pass: a read was dispatched, all calls allowlisted, the bound model reported.
    expect(run.trace.calls.map((c) => c.name)).toContain("find_tools");
    const axisArgs = run.trace.calls.filter((c) => (c.name ?? "").includes("get_topic")).map((c) => c.args?.axisId);
    expect(axisArgs.filter(Boolean).sort()).toEqual(Object.values(FOCUSED_SCOPE.axes).map((a) => a.id).sort());
    // Exactly one session created and one turn posted (no retry).
    expect(host.state.calls.filter((c) => c.path === "/v1/sessions").length).toBe(1);
    expect(host.state.calls.filter((c) => c.path.endsWith("/messages")).length).toBe(1);
    expect(store.count()).toBe(1);
  });

  test("the focused turn is single-shot per grant", async () => {
    const store = freshStore();
    const record = grantedFocus();
    const host = createRouteHost({ plan: scopedPlan, store, org: record.org });
    const live = sandboxFocused({ ...MATCHING_SEAMS(host, store) });
    expect((await live.runFocusedTurn()).ok).toBe(true);
    expect(sandbox.liveGrant.claimGrantRunToken(live.grant).code).toBe(LIVE_GRANT_ERROR_CODES.alreadyRun);
    const second = await live.runFocusedTurn();
    expect(second.code).toBe(FOCUSED_LIVE_ERROR_CODES.alreadyInvoked);
    expect(host.state.calls.filter((c) => c.path === "/v1/sessions").length).toBe(1);
  });

  test("a prompt-byte mutation is refused before any session is created", async () => {
    const store = freshStore();
    const mutated = `${FOCUSED_PROMPT} (tampered)`;
    const record = grantedFocus({ prompts: { [FOCUSED_CASE_SLOT]: { text: mutated, sha256: sha256Utf8(mutated) } } });
    const host = createRouteHost({ plan: scopedPlan, store, org: record.org });
    const live = sandboxFocused({ authorization: record, ...MATCHING_SEAMS(host, store) });
    const run = await live.runFocusedTurn();
    expect(run.ok).toBe(false);
    expect(run.code).toBe(FOCUSED_LIVE_ERROR_CODES.bindingRefused);
    expect(host.state.calls.some((c) => c.path === "/v1/sessions")).toBe(false);
    expect(host.state.calls.some((c) => c.path.endsWith("/messages"))).toBe(false);
    expect(store.count()).toBe(0);
  });

  test("instrumented: mutation through the standard validator never dispatches", async () => {
    // A record whose prompt text was changed WITHOUT recomputing the sha fails the standard validator, so
    // the mint refuses and no transport is built.
    const record = grantedFocus({ prompts: { [FOCUSED_CASE_SLOT]: { text: `${FOCUSED_PROMPT} x`, sha256: FOCUSED_PROMPT_SHA256 } } });
    const result = createAuthorizedFocusedDriver({ authorization: record, fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.ok).toBe(false);
  });

  test("a wrong pre-pin latches the case before the turn (zero trace rows, zero /messages calls)", async () => {
    const store = freshStore();
    const record = grantedFocus();
    const host = createRouteHost({ plan: scopedPlan, store, org: record.org });
    const live = sandboxFocused({ ...MATCHING_SEAMS(host, store), pinStore: () => ({ ...STABLE_PIN, revision: ADMITTED_FIXTURE.pluginRevision + 1 }) });
    const run = await live.runFocusedTurn();
    expect(run.ok).toBe(false);
    expect(run.codes).toContain(STOP_REASONS.identityMismatch);
    expect(store.count()).toBe(0);
    expect(host.state.calls.some((c) => c.path.endsWith("/messages"))).toBe(false);
  });
});

// ------------------------------------------------------------------ dispatch guard

describe("focused dispatch guard: raw transports are offline-only", () => {
  test("the transport constructor refuses without a minted live grant", () => {
    const record = grantedFocus();
    const host = createRouteHost({ org: record.org });
    let error = null;
    try { createHttpSessionFactory({ auth: { headers: () => ({}) }, fetchImpl: host.fetchImpl }); } catch (e) { error = e; }
    expect(error?.code).toBe(HTTP_ADAPTER_CODES.liveGrantRequired);
    expect(host.state.calls.length).toBe(0);
  });
});
