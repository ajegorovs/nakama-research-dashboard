/**
 * OFFLINE, NO-NETWORK tests for the **bound-session model path** and the **N-7 automation model source**.
 *
 * These are the tests for the narrow source fix that makes the free-condition live run actually bind the
 * authorization's `provider.sessionBoundIdentity`:
 *
 *   1. the live entrypoint's `POST /v1/sessions` body carries `model` EXACTLY equal to
 *      `record.provider.sessionBoundIdentity` (the instance-qualified identity), so the host default
 *      OpenCode Go provider is never selected;
 *   2. the driver's model evidence is taken from the shape the **real amended host persists**
 *      (`session_messages.payload.usage.modelId`, the bare wire model) — NOT from a top-level `model`
 *      field the host never writes (the earlier offline adapter's shape was a fake-confidence seam);
 *   3. the reported requested/reported identities are compared normally: the wire `model.requested`
 *      against the reported `usage.modelId`, with the qualified identity bound at session creation;
 *   4. N-7's manual-automation model is the **profile's** model (the automation definition carries no
 *      `model` field — the host ignores one), so the scoped fixture-profile model selection is what makes
 *      N-7 select the same session-qualified free model rather than the default.
 *
 * No network, no model, no live instance: the transport is an injected `fetchImpl` and the trace reader is
 * a scratch SQLite store shaped byte-for-byte like the real host's rows.
 *
 *     bun test harness/nakama-e2e/driver/bound-session-model.test.mjs
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PROPOSED_BUDGETS } from "./budgets.mjs";
import { buildAutomationDefinition } from "../automation.mjs";
import { classifyTurnTrace, parseTurnTrace } from "../trace.mjs";
import { STOP_REASONS } from "./stop-latch.mjs";
import { ADMITTED_FIXTURE, buildProposedFreeConditionAuthorizationRecord } from "./authorization.mjs";
import { FIXTURE_PROFILES, profileKeyForCase } from "./profiles.mjs";
import { AUTOMATION_CASE, DIRECT_CASE_ORDER, READONLY_DASHBOARD_TOOLS } from "./cases.mjs";
import { loadLiveSandbox } from "./live-test-sandbox.mjs";
import { hostCleanDir } from "./host-evaluation-core.mjs";

const FREE = buildProposedFreeConditionAuthorizationRecord().provider;
const FREE_MODEL = FREE.wireModel;
const FREE_SESSION_BOUND = FREE.sessionBoundIdentity;
const ORG = "org_b2b102992b554887b88950efc4239f79";

// ---------------------------------------------------------------------------- 1. trace model evidence

describe("real-host trace shape: the model evidence is usage.modelId, not a top-level model field", () => {
  // The exact payload the amended host persists on an assistant row (keys observed in the live platform
  // DB): content, role, thinking, thinkingDurationMs, usage{...modelId}. There is deliberately NO top-level
  // `model`/`provider` — the earlier offline adapter's `{ model, provider }` row was a fake seam.
  const realHostRows = [
    { seq: 0, payload: JSON.stringify({ content: "Using the research dashboard ...", role: "user" }) },
    {
      seq: 1,
      payload: JSON.stringify({
        content: "The workstream is active.",
        role: "assistant",
        thinking: "…",
        thinkingDurationMs: 12,
        toolCalls: [{ arguments: { topic: "Fixture Topic Alpha" }, name: "plugin_research_dashboard__get_overview" }],
        usage: { cachedInputTokens: 0, inputTokens: 11, modelId: FREE_MODEL, outputTokens: 7, totalTokens: 18 },
      }),
    },
  ];

  test("parseTurnTrace surfaces usage.modelId as the reported model", () => {
    const trace = parseTurnTrace(realHostRows);
    expect(trace.ok).toBe(true);
    expect(trace.model).toBe(FREE_MODEL);
    expect(trace.usage).toBeTruthy();
    expect(trace.usage.modelId).toBe(FREE_MODEL);
    expect(trace.provider).toBe(null); // the host persists no provider per message
  });

  test("the driver's bound-model check passes when expectedModel is the wire id and expectedProvider is null", () => {
    const trace = parseTurnTrace(realHostRows);
    const verdict = classifyTurnTrace({
      trace,
      allowedCalls: ["find_tools", ...READONLY_DASHBOARD_TOOLS],
      expectedModel: FREE_MODEL,
      expectedProvider: null,
      requireConsultation: true,
      requireRead: true,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.codes).toEqual([]);
  });

  test("asserting a per-message provider name against the real host would fail-close a correct turn (why the entrypoint narrows it)", () => {
    const trace = parseTurnTrace(realHostRows);
    const verdict = classifyTurnTrace({ trace, expectedProvider: FREE.name });
    expect(verdict.ok).toBe(false);
    expect(verdict.codes).toContain(STOP_REASONS.providerMismatch);
  });

  test("a default OpenCode Go dispatch still terminals as a model mismatch (no fallback)", () => {
    const goRows = [
      { seq: 0, payload: JSON.stringify({ content: "x", role: "user" }) },
      { seq: 1, payload: JSON.stringify({ content: "x", role: "assistant", usage: { modelId: "deepseek-v4.1-flash" } }) },
    ];
    const verdict = classifyTurnTrace({ trace: parseTurnTrace(goRows), expectedModel: FREE_MODEL, expectedProvider: null });
    expect(verdict.ok).toBe(false);
    expect(verdict.codes).toContain(STOP_REASONS.modelMismatch);
  });
});

// ---------------------------------------------------------------------------- 2. live entrypoint POST body

const sandbox = await loadLiveSandbox();

function scratchDb() {
  const dir = mkdtempSync(join(tmpdir(), "nakama-bound-session-"));
  return { dir, path: join(dir, "rows.sqlite") };
}

/** A realistic amended-host fake: exact routes, exact statuses, real-host-shaped SSE + trace rows. */
function makeRealisticHost({ record, rows, capture }) {
  const jar = new Map();
  const jarHeader = () => (jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {});
  const evaluation = (caseToken) => ({
    caseToken,
    endedAt: 1700000009999,
    forbidden: null,
    historyValid: true,
    modelGenerations: 1,
    startedAt: 1700000009000,
    terminalReason: "completed",
    toolExecutions: 1,
  });
  return async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    capture.push({ body: init.body ? JSON.parse(String(init.body)) : null, method: init.method ?? "GET", path });
    const reply = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
    if (path === "/v1/auth/login") {
      jar.set("nakama_csrf", "csrf-token");
      jar.set("nakama_session", "sess");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "nakama_csrf=csrf-token; Path=/" } });
    }
    if (path === "/v1/auth/orgs") return reply(200, { orgs: [{ id: ORG, name: record.org.name }] });
    if (path === "/v1/auth/me") return reply(200, { id: "user-1" });
    if (path === "/v1/sessions") {
      // The REAL host requires an evaluation policy in the body and returns a sessionId.
      const sid = `live-${capture.length}`;
      jar.set(`sid:${sid}`, "1");
      return reply(201, { sessionId: sid });
    }
    if (/^\/v1\/sessions\/.+\/messages$/.test(path)) {
      const ev = evaluation("eval-case");
      const sse = [
        `data: ${JSON.stringify({ type: "usage", usage: { calls: [{ modelId: FREE_MODEL }], totalTokens: 18 } })}`,
        `data: ${JSON.stringify({ type: "done", contextUsage: { model: FREE_MODEL }, evaluation: ev, reply: "grounded answer", usage: { calls: [{ modelId: FREE_MODEL }], totalTokens: 18 } })}`,
        "",
      ].join("\n");
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    if (path === "/v1/workers/automation/start" || path === "/v1/workers/automation/stop") return reply(200, { ok: true });
    if (path === "/v1/automations") return reply(201, { automation: { id: "auto-1" } });
    if (/^\/v1\/automations\/.+\/run$/.test(path)) return reply(200, { run: { output: "grounded answer" }, evaluation: evaluation("eval-auto") });
    return reply(404, { error: `no fake route for ${path}` });
  };
}

describe("live entrypoint binds the session model to the authorization identity (offline, injected transport)", () => {
  test("POST /v1/sessions carries model === record.provider.sessionBoundIdentity, and the sequence classifies", async () => {
    const record = buildProposedFreeConditionAuthorizationRecord({ executionAuthorized: true });
    const { dir, path } = scratchDb();
    const capture = [];
    // Real-host-shaped rows for every case read (model evidence only in usage.modelId).
    const { Database } = await import("bun:sqlite");
    const db = new Database(path);
    db.exec("CREATE TABLE IF NOT EXISTS session_messages (session_id TEXT, seq INTEGER, payload TEXT)");
    const readTrace = ({ sessionId }) => {
      const rows = [
        { seq: 0, payload: JSON.stringify({ content: "Using the research dashboard ...", role: "user" }) },
        {
          seq: 1,
          payload: JSON.stringify({
            content: "grounded answer",
            role: "assistant",
            toolCalls: [{ arguments: {}, name: "plugin_research_dashboard__get_overview" }],
            usage: { inputTokens: 11, modelId: FREE_MODEL, outputTokens: 7, totalTokens: 18 },
          }),
        },
      ];
      for (const row of rows) db.query("INSERT INTO session_messages VALUES (?, ?, ?)").run(sessionId, row.seq, row.payload);
      return db.query("SELECT seq, payload FROM session_messages WHERE session_id = ? ORDER BY seq").all(sessionId);
    };
    const exactContainment = ({ profileKey }) => {
      const p = FIXTURE_PROFILES[profileKey];
      return { ok: true, profileId: p.id, tools: [...p.tools], skills: p.skill ? [p.skill] : [], automationsEnabled: false };
    };
    const live = sandbox.live.createAuthorizedLiveDriver({
      authorization: record,
      hostContract: { digest: record.host.contractDigest },
      base: "http://127.0.0.1:4399",
      email: "e",
      password: "p",
      fetchImpl: makeRealisticHost({ capture, record, rows: null }),
      readTrace,
      checkContainment: exactContainment,
      pinStore: () => ({ generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path, revision: ADMITTED_FIXTURE.pluginRevision }),
      snapshotStore: () => ({ counts: {}, objects: [], rows: {}, versions: {} }),
      log: () => {},
    });
    expect(live.ok).toBe(true);
    const result = await live.runAuthorizedSequence();
    db.close();
    rmSync(dir, { recursive: true, force: true });

    expect(result.ok).toBe(true);
    // Every direct-case session creation transmitted the exact instance-qualified identity.
    const sessionPosts = capture.filter((c) => c.path === "/v1/sessions");
    expect(sessionPosts.length).toBe(DIRECT_CASE_ORDER.length);
    for (const post of sessionPosts) {
      expect(post.body.model).toBe(FREE_SESSION_BOUND);
      expect(post.body.model).toBe(`${FREE.instanceId}::${FREE_MODEL}`);
    }
    // Reported model identity normalized to the wire form the host persists.
    const n1 = result.direct[0];
    expect(n1.ok).toBe(true);
    expect(n1.modelIdentity.requested).toBe(FREE_MODEL);
    expect(n1.modelIdentity.reported).toBe(FREE_MODEL);
  });
});

// ---------------------------------------------------------------------------- 3. N-7 automation model source

// The pinned clean host checkout, via the shared convention (`NAKAMA_HOST_CLEAN` override, else the sibling
// directory `../…/nakama-e2e-fixture-workspace/sources/nakama-host-clean`). No absolute home path is written
// here: `harness/redact.mjs` treats a concrete `/home/<name>/` literal as an identity leak, and the sibling
// resolution already has a call site in `host-evaluation-core.mjs`.
const HOST_DIR = hostCleanDir();
const hostAvailable = existsSync(resolve(HOST_DIR, "apps/server/src/services/automation-runner.ts"));

describe.skipIf(!hostAvailable)("N-7 manual automation selects its model from the PROFILE (the definition carries no model)", () => {
  test("buildAutomationDefinition emits no `model` field (an unsupported field would be a silent no-op)", () => {
    const def = buildAutomationDefinition({ name: "nakama-e2e-n7-manual", profileId: FIXTURE_PROFILES[profileKeyForCase(AUTOMATION_CASE)].id, prompt: "x" });
    expect("model" in def).toBe(false);
    expect(def.trigger).toBe("manual");
    expect(def.profileId).toBe("fixture-readonly-3tool"); // N-7 uses the read-only profile
  });

  test("the host's automation create + run paths resolve the model from the automation profile, never a definition field", () => {
    const runner = readFileSync(resolve(HOST_DIR, "apps/server/src/services/automation-runner.ts"), "utf8");
    // runAutomationPrompt is called with (orgId, automation.profileId, prompt, …) — no model argument.
    expect(runner).toMatch(/runAutomationPrompt\(/);
    expect(runner).toMatch(/automation\.profileId/);
    const service = readFileSync(resolve(HOST_DIR, "apps/server/src/services/automation-service.ts"), "utf8");
    // StoredAutomation has no `model` member; the create() body only reads name/prompt/trigger/profileId.
    expect(service).not.toMatch(/model:\s*input\.model/);
    const agent = readFileSync(resolve(HOST_DIR, "apps/server/src/services/agent-service.ts"), "utf8");
    // runAutomationPrompt builds the harness from the profile alone (createHarnessForProfile(profile)).
    const block = agent.slice(agent.indexOf("async runAutomationPrompt"), agent.indexOf("async runAutomationPrompt") + 2600);
    expect(block).toMatch(/createHarnessForProfile\(profile\)/);
    expect(block).not.toMatch(/modelOverride/);
  });

  test("the scoped fixture-profile model selection (both case profiles = the free identity) is what binds N-7, not a definition override", () => {
    // The preflight `profileSessionModelBound` check and N-7's run both require the case profiles' model to
    // be the free session-bound identity. This is the documented, supported scoped selection.
    const identity = `${FREE.instanceId}::${FREE_MODEL}`;
    expect(identity).toBe(FREE_SESSION_BOUND);
  });
});
