/**
 * Offline regression for the **authorized N-7-only continuation entrypoint** (`live.mjs`
 * `createAuthorizedN7ContinuationDriver`) and its scoped-automation-eligibility wiring.
 *
 * Two halves, like `live.test.mjs`:
 *
 *   - the **real** repository tree is asserted shut: the interlock keeps `INFERENCE_AUTHORIZED = false`, so
 *     even a granted record + matching host contract refuses at the mint with **zero HTTP** (no login, no
 *     session, no containment read, no profile write, no provider call);
 *   - the **positive** path is exercised against an isolated **copied source** (`live-test-sandbox.mjs`,
 *     which flips the const in the copy only). Every transport is an injected offline emulator — no network.
 *
 * The emulated host enforces the real `automationsEnabled` rule (`POST /v1/automations` and the run route
 * refuse with `"Automations are disabled for this profile."` when the flag is false), so the tests prove the
 * scoped-eligibility window is what enables the single install+run, and that it is **restored in a finally**
 * — including when the turn throws and when the restore write itself fails (a red control).
 *
 *   bun test harness/nakama-e2e/driver/n7-live.test.mjs
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ACCEPTED_HOST, buildProposedAuthorizationRecord } from "./authorization.mjs";
import { AUTOMATION_CASE, DIRECT_CASE_ORDER } from "./cases.mjs";
import { FIXTURE_PROFILES } from "./profiles.mjs";
import { createSessionStore, createTraceReader } from "./adapters.mjs";
import { ADMITTED_FIXTURE } from "./authorization.mjs";
import { INFERENCE_AUTHORIZED } from "../turn.mjs";
import { N7_LIVE_ERROR_CODES, createAuthorizedN7ContinuationDriver } from "./live.mjs";
import { directEvidenceDigest, sha256Utf8 } from "./n7-continuation.mjs";
import { loadLiveSandbox } from "./live-test-sandbox.mjs";

const sandbox = await loadLiveSandbox();
afterAll(() => sandbox.cleanup());

const scratch = mkdtempSync(join(tmpdir(), "nakama-n7-live-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let dbSeq = 0;
const freshStore = () => createSessionStore(join(scratch, `n7-session-${(dbSeq += 1)}.sqlite`));

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sseBody = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
const grantedAuth = (overrides = {}) => buildProposedAuthorizationRecord({ executionAuthorized: true, ...overrides });
const MATCHING_CONTRACT = { digest: ACCEPTED_HOST.contractDigest };
const noHttp = () => { throw new Error("no HTTP must occur on this path"); };

const MODEL = grantedAuth().model.requested;
const TOOLS = FIXTURE_PROFILES.readonly3.tools.map((name) => `plugin_research_dashboard__${name}`);

/** Digest-bound preserved direct evidence (shape-identical to the immutable preserved artifact). */
function directEvidence() {
  return DIRECT_CASE_ORDER.map((id) => ({
    caseId: id,
    ok: true,
    evaluation: { terminalReason: "completed", forbidden: null, modelGenerations: 3, toolExecutions: 3 },
    trace: { answer: `grounded answer for ${id}`, model: MODEL, calls: [{ name: "find_tools" }, { name: `plugin_research_dashboard__get_topic` }] },
  }));
}

function wireEvaluation({ caseToken, toolExecutions, terminalReason = "completed" }) {
  return { caseToken, endedAt: Date.now(), forbidden: null, historyValid: true, modelGenerations: 1, startedAt: Date.now(), terminalReason, toolExecutions };
}

/**
 * The amended host's served routes, emulated, with the real `automationsEnabled` rule enforced and the
 * eligibility profile read/write routes modelled. Options let a test inject red-control behaviour.
 */
function createRouteHost({ store = null, org, profile = {}, failRestoreWrite = false, runThrows = false } = {}) {
  const state = {
    calls: [],
    automations: new Map(),
    autoSeq: 0,
    worker: null,
    automationsEnabled: profile.automationsEnabled === true,
    tools: profile.tools ?? TOOLS,
    skills: profile.skills ?? [],
    installAttempts: 0,
    runAttempts: 0,
  };
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    state.calls.push({ method, path: pathname });

    if (pathname === "/v1/auth/login" && method === "POST") {
      const h = new Headers();
      h.append("set-cookie", "nakama_session=session-token; Path=/; HttpOnly");
      h.append("set-cookie", "nakama_csrf=csrf-token; Path=/");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    }
    if (pathname === "/v1/auth/orgs") return jsonResponse({ orgs: [{ id: org.id, name: org.name }] });
    if (pathname === "/v1/auth/me") return jsonResponse({ id: "user_admin" });

    // Profiles: the eligibility read plus the supported `automationsEnabled` write.
    let match = pathname.match(/^\/v1\/profiles\/([^/]+)\/tools$/);
    if (match && method === "GET") return jsonResponse({ tools: state.tools.map((name) => ({ name })) });
    match = pathname.match(/^\/v1\/profiles\/([^/]+)$/);
    if (match && method === "GET") {
      return jsonResponse({ profile: { id: decodeURIComponent(match[1]), skills: state.skills.map((name) => ({ name })), automationsEnabled: state.automationsEnabled, model: MODEL } });
    }
    if (match && method === "PUT") {
      if (body?.automationsEnabled === false && failRestoreWrite) return jsonResponse({ error: "restore write refused" }, 500);
      if (typeof body?.automationsEnabled === "boolean") state.automationsEnabled = body.automationsEnabled;
      return jsonResponse({ profile: { id: decodeURIComponent(match[1]), automationsEnabled: state.automationsEnabled } });
    }

    match = pathname.match(/^\/v1\/workers\/automation\/(start|stop)$/);
    if (match && method === "POST") { state.worker = match[1]; return jsonResponse({ ok: true }); }

    if (pathname === "/v1/automations" && method === "POST") {
      state.installAttempts += 1;
      if (!state.automationsEnabled) return jsonResponse({ error: "Automations are disabled for this profile." }, 403);
      const id = `auto-${++state.autoSeq}`;
      state.automations.set(id, body);
      return jsonResponse({ automation: { id, ...body } }, 201);
    }
    match = pathname.match(/^\/v1\/automations\/([^/]+)\/run$/);
    if (match && method === "POST") {
      state.runAttempts += 1;
      if (!state.automationsEnabled) return jsonResponse({ error: "Automations are disabled for this profile." }, 403);
      if (runThrows) return jsonResponse({ error: "provider blew up" }, 502);
      const automationId = decodeURIComponent(match[1]);
      const toolCalls = [{ arguments: {}, name: "get_topic" }, { arguments: {}, name: "get_overview" }];
      store?.append(automationId, { content: "N-7 grounded answer", model: MODEL, provider: "openai_compatible", role: "assistant", toolCalls, usage: { total_tokens: 7 } });
      return jsonResponse({ run: { id: `run-${automationId}`, output: "N-7 grounded answer" }, evaluation: wireEvaluation({ caseToken: body?.evaluation?.conversationToken ?? "eval-n7", toolExecutions: toolCalls.length }) });
    }
    return jsonResponse({ error: `unhandled ${method} ${pathname}` }, 404);
  };
  return { fetchImpl, state };
}

const STABLE_PIN = { generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path: join(scratch, "store.sqlite"), revision: ADMITTED_FIXTURE.pluginRevision };
const STABLE_SNAPSHOT = { counts: { development_axes: 8 }, objects: [], rows: {}, versions: {} };
const exactContainment = (profileKey) => ({ ok: true, profileId: FIXTURE_PROFILES[profileKey].id, tools: [...FIXTURE_PROFILES[profileKey].tools], skills: FIXTURE_PROFILES[profileKey].skill ? [FIXTURE_PROFILES[profileKey].skill] : [], automationsEnabled: false });

function sandboxN7({ authorization = grantedAuth(), hostContract = MATCHING_CONTRACT, ...seams } = {}) {
  const live = sandbox.live.createAuthorizedN7ContinuationDriver({ authorization, hostContract, ...seams });
  if (!live.ok) throw new Error(`sandbox N-7 entrypoint refused: ${live.code}`);
  return live;
}
function seamsFor(host, store, overrides = {}) {
  return {
    base: "http://127.0.0.1:4399",
    checkContainment: ({ profileKey }) => exactContainment(profileKey),
    email: "admin@example.com",
    fetchImpl: host.fetchImpl,
    password: "x",
    pinStore: () => ({ ...STABLE_PIN }),
    readTrace: createTraceReader(store.path),
    snapshotStore: () => STABLE_SNAPSHOT,
    ...overrides,
  };
}

// ------------------------------------------------------------------ gates: shut before any I/O

describe("N-7 continuation entrypoint: both gates run inside the mint, before any I/O", () => {
  test("a granted record + matching contract is still shut by the interlock, with zero HTTP", () => {
    expect(INFERENCE_AUTHORIZED).toBe(false);
    const result = createAuthorizedN7ContinuationDriver({ authorization: grantedAuth(), fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("live_inference_not_authorized");
    expect(result.blocked).toBe(true);
  });

  test("an ungranted record refuses at the execution gate, with zero HTTP", () => {
    const result = createAuthorizedN7ContinuationDriver({ authorization: buildProposedAuthorizationRecord(), fetchImpl: noHttp });
    expect(result.code).toBe("execution_not_granted");
    expect(result.blocked).toBe(false);
  });

  test("a caller value for an authorization-owned field is refused", () => {
    const result = createAuthorizedN7ContinuationDriver({ authorization: grantedAuth(), budgets: { any: 1 }, fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.code).toBe("live_critical_value_override_refused");
  });

  test("the gate refusal happens before any adapter: no login/session/containment/pin call", () => {
    let pinned = 0;
    let contained = 0;
    const result = createAuthorizedN7ContinuationDriver({
      authorization: buildProposedAuthorizationRecord(),
      checkContainment: () => { contained += 1; return { ok: true }; },
      fetchImpl: noHttp,
      pinStore: () => { pinned += 1; return { ...STABLE_PIN }; },
    });
    expect(result.code).toBe("execution_not_granted");
    expect(pinned).toBe(0);
    expect(contained).toBe(0);
  });
});

// ------------------------------------------------------------------ positive continuation on the copy

describe("N-7 continuation (sandbox): binds preserved evidence, runs ONE wrapper, restores eligibility", () => {
  test("exposes only runN7Continuation — no direct-case runner, no sequence route", () => {
    const host = createRouteHost({ org: grantedAuth().org });
    const live = sandboxN7(seamsFor(host, freshStore()));
    expect(typeof live.runN7Continuation).toBe("function");
    expect(live.runCase).toBeUndefined();
    expect(live.runAuthorizedSequence).toBeUndefined();
    expect(live.runAutomationCase).toBeUndefined();
    expect(live.sequence).toEqual([AUTOMATION_CASE]);
    expect(host.state.calls.length).toBe(0); // composition performs zero HTTP
  });

  test("runs the single N-7 wrapper, consults the dashboard, and restores automationsEnabled in a finally", async () => {
    const store = freshStore();
    const evidence = directEvidence();
    const host = createRouteHost({ org: grantedAuth().org, store });
    const live = sandboxN7(seamsFor(host, store));

    const result = await live.runN7Continuation({ directEvidence: evidence, expectedDigest: directEvidenceDigest(evidence) });

    expect(result.ok).toBe(true);
    expect(result.delegated).toBe(true);
    expect(result.replayedDirectCases).toEqual([]);
    expect(result.automation.ok).toBe(true);
    // The dashboard was actually consulted inside the automation turn.
    expect(result.automation.trace.calls.map((c) => c.name)).toContain("get_topic");
    // Exactly one install + one run, the worker started and stopped, and the flag is restored.
    expect(host.state.installAttempts).toBe(1);
    expect(host.state.runAttempts).toBe(1);
    expect(host.state.worker).toBe("stop");
    expect(host.state.automationsEnabled).toBe(false);
    // The single-shot run token was consumed → a second invocation is refused with zero further HTTP.
    const callsAfter = host.state.calls.length;
    const second = await live.runN7Continuation({ directEvidence: evidence, expectedDigest: directEvidenceDigest(evidence) });
    expect(second.code).toBe("live_sequence_already_invoked");
    expect(host.state.calls.length).toBe(callsAfter);
  });

  test("an evidence digest mismatch refuses BEFORE any eligibility write or install", async () => {
    const store = freshStore();
    const host = createRouteHost({ org: grantedAuth().org, store });
    const live = sandboxN7(seamsFor(host, store));
    const result = await live.runN7Continuation({ directEvidence: directEvidence(), expectedDigest: "0".repeat(64) });
    expect(result.ok).toBe(false);
    expect(result.delegated).toBe(false);
    expect(host.state.installAttempts).toBe(0);
    expect(host.state.calls.some((c) => c.path === "/v1/automations")).toBe(false);
  });
});

// ------------------------------------------------------------------ red controls

describe("N-7 continuation red controls: scoped eligibility never silently continues", () => {
  test("RED: a turn that fails still restores automationsEnabled (finally) and reports a failure", async () => {
    const store = freshStore();
    const evidence = directEvidence();
    const host = createRouteHost({ org: grantedAuth().org, store, runThrows: true });
    const live = sandboxN7(seamsFor(host, store));
    const result = await live.runN7Continuation({ directEvidence: evidence, expectedDigest: directEvidenceDigest(evidence) });
    expect(result.ok).toBe(false);
    expect(host.state.automationsEnabled).toBe(false); // restored despite the run failure
    expect(host.state.worker).toBe("stop");
  });

  test("RED: a failed restore write surfaces a terminal failure (no success is claimed)", async () => {
    const store = freshStore();
    const evidence = directEvidence();
    const host = createRouteHost({ org: grantedAuth().org, store, failRestoreWrite: true });
    const live = sandboxN7(seamsFor(host, store));
    const result = await live.runN7Continuation({ directEvidence: evidence, expectedDigest: directEvidenceDigest(evidence) });
    expect(result.ok).toBe(false);
    expect(host.state.automationsEnabled).toBe(true); // the restore genuinely failed — and it is surfaced
    expect((result.automation?.failures ?? []).join(" ")).toMatch(/eligibility_restore_failed/);
  });

  test("RED: containment requires the profile desired-off, so a drifted tool set refuses before any install", async () => {
    const store = freshStore();
    const evidence = directEvidence();
    const host = createRouteHost({ org: grantedAuth().org, store, profile: { tools: [...TOOLS, "plugin_research_dashboard__reconcile_topic"] } });
    const live = sandboxN7(seamsFor(host, store));
    const result = await live.runN7Continuation({ directEvidence: evidence, expectedDigest: directEvidenceDigest(evidence) });
    expect(result.ok).toBe(false);
    expect(host.state.installAttempts).toBe(0);
    // The eligibility read-only-surface guard would also refuse; either way no install happens.
    expect(host.state.calls.some((c) => c.path === "/v1/automations")).toBe(false);
  });

  test("a tampered authorization (non-repeat N-7 prompt) is refused at the mint, before any HTTP", () => {
    const evidence = directEvidence();
    const auth = grantedAuth();
    auth.prompts[AUTOMATION_CASE] = { text: "a different prompt", sha256: sha256Utf8("a different prompt") };
    const result = createAuthorizedN7ContinuationDriver({ authorization: auth, fetchImpl: noHttp, hostContract: MATCHING_CONTRACT });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("authorization_prompt_repeat_invalid");
    expect(typeof result.runN7Continuation).toBe("undefined");
    expect(directEvidenceDigest(evidence)).toMatch(/^[0-9a-f]{64}$/);
  });
});
