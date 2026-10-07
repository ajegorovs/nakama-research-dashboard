/**
 * Offline tests for the **separate free-model condition** in the owning driver authorization.
 *
 * Disjoint from `driver.test.mjs` / `http-adapters.test.mjs` (owned elsewhere; asserted unchanged). No
 * network, no model, no live instance, no new dependency, no host edit: the provider wire is exercised by an
 * **injected transport** (the pinned host's own `createOpenAICompatibleProvider` with `globalThis.fetch`
 * replaced by a local capture and a dummy key), and the driver run seam is the pinned host's own evaluation
 * guard over a scratch SQLite store.
 *
 * The subject is the **free** condition only — the original OpenCode Go condition is asserted **immutable**
 * and its one-run grant **un-consumed**. Inference stays closed (`INFERENCE_AUTHORIZED = false`).
 *
 *     bun test harness/nakama-e2e/driver/free-condition.test.mjs
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PROPOSED_BUDGETS } from "./budgets.mjs";
import { createStopLatch, STOP_REASONS } from "./stop-latch.mjs";
import { hostCleanDir, hostEvaluationCoreAvailable, loadHostEvaluationCore } from "./host-evaluation-core.mjs";
import {
  ACCEPTED_HOST,
  ADMITTED_FIXTURE,
  AUTHORIZATION_ERROR_CODES,
  authorizeExecution,
  buildProposedAuthorizationRecord,
  buildProposedFreeConditionAuthorizationRecord,
  FREE_CONDITION_KEY,
  FREE_PROVIDER_DISPOSITION,
  OPENCODE_GO_CONDITION_KEY,
  PROVIDER_CONDITIONS,
  PROVIDER_DISPOSITION,
  PROVIDER_TARGET,
  validateAuthorization,
} from "./authorization.mjs";
import { CASE_IDS, CASE_SPECS, READONLY_DASHBOARD_TOOLS } from "./cases.mjs";
import { FIXTURE_PROFILES } from "./profiles.mjs";
import { PROMPT_BINDINGS } from "./prompts.mjs";
import { createSessionStore, createHostSessionPort, createTraceReader } from "./adapters.mjs";
import { createDriver } from "./driver.mjs";
import { InferenceBlockedError, INFERENCE_AUTHORIZED, assertInferenceAuthorized } from "../turn.mjs";
import { LIVE_GRANT_ERROR_CODES, mintLiveGrant } from "./live-grant.mjs";

const hostCore = hostEvaluationCoreAvailable() ? await loadHostEvaluationCore() : null;
const withHostCore = hostCore ? describe : describe.skip;
const createGuard = hostCore?.createEvaluationTurnGuard;

const FREE = PROVIDER_CONDITIONS[FREE_CONDITION_KEY];
const FREE_INSTANCE_ID = "34e9435b-af5c-4f8e-884d-31be681f8403";
const FREE_MODEL = "deepseek/deepseek-v4.1-flash";
const FREE_ENDPOINT = "https://api.commandcode.ai/provider/v1/chat/completions";

// ------------------------------------------------------------------ condition table

describe("free condition: the condition table is explicit and keeps OpenCode Go immutable", () => {
  test("the Go entry is the original accepted target, retained byte-for-byte and frozen", () => {
    expect(PROVIDER_CONDITIONS[OPENCODE_GO_CONDITION_KEY]).toBe(PROVIDER_TARGET);
    expect(PROVIDER_TARGET.name).toBe("opencode-go");
    expect(PROVIDER_TARGET.canonicalModel).toBe("opencode-go/deepseek-v4.1-flash");
    expect(PROVIDER_TARGET.wireModel).toBe("deepseek-v4.1-flash");
    expect(Object.isFrozen(PROVIDER_TARGET)).toBe(true);
    expect(Object.isFrozen(PROVIDER_CONDITIONS)).toBe(true);
  });

  test("the free entry is separately named and pins the CommandCode instance, model and endpoint", () => {
    expect(OPENCODE_GO_CONDITION_KEY).toBe("opencode_go");
    expect(FREE_CONDITION_KEY).toBe("commandcode_free");
    expect(FREE.name).toBe("openai_compatible");
    expect(FREE.label).toBe("CommandCode");
    expect(FREE.instanceId).toBe(FREE_INSTANCE_ID);
    expect(FREE.canonicalModel).toBe(FREE_MODEL);
    expect(FREE.wireModel).toBe(FREE_MODEL);
    expect(FREE.canonicalModel).toBe(FREE.wireModel); // openai_compatible: bare id, no provider/ prefix
    expect(FREE.sessionBoundIdentity).toBe(`${FREE_INSTANCE_ID}::${FREE_MODEL}`);
    expect(FREE.endpointRoute).toBe(FREE_ENDPOINT);
    expect(FREE.wireApi).toBe("chat_completions");
    expect(FREE.nativeAdapterExists).toBe(false);
    expect(FREE.fallbackProvider).toBe(null);
    expect(Object.isFrozen(FREE)).toBe(true);
  });
});

// ------------------------------------------------------------------ free record validates / binds exactly

describe("free condition: the proposed record validates and binds the exact identity", () => {
  test("a free-condition proposal validates against every binding, with the gate closed", () => {
    const record = buildProposedFreeConditionAuthorizationRecord();
    expect(validateAuthorization(record).ok).toBe(true);
    expect(record.provider.condition).toBe(FREE_CONDITION_KEY);
    expect(record.provider.name).toBe("openai_compatible");
    expect(record.provider.label).toBe("CommandCode");
    expect(record.provider.instanceId).toBe(FREE_INSTANCE_ID);
    expect(record.provider.canonicalModel).toBe(FREE_MODEL);
    expect(record.provider.wireModel).toBe(FREE_MODEL);
    expect(record.provider.sessionBoundIdentity).toBe(`${FREE_INSTANCE_ID}::${FREE_MODEL}`);
    expect(record.provider.endpointRoute).toBe(FREE_ENDPOINT);
    expect(record.model.requested).toBe(FREE_MODEL);
    // It is exploratory and separate — never a transfer of the Go grant — and execution stays shut.
    expect(record.proposalKind).toBe("separate_free_condition_binding");
    expect(record.transferableFromExistingGrant).toBe(false);
    expect(record.executionAuthorized).toBe(false);
    expect(record.providerDisposition).toEqual(FREE_PROVIDER_DISPOSITION);
    expect(record.providerDisposition.fallbackProvider).toBe(null);
    expect(record.providerDisposition.serviceTermsPermissionClaimed).toBe(false);
  });

  test("the record binds the factual admitted fixture org name (not the stale placeholder)", () => {
    // The live fixture org (id org_b2b102992b554887b88950efc4239f79) is named "Nakama E2E Fixture"
    // (verified live via GET /v1/auth/orgs). The record must bind that factual name so the live owner's
    // explicit org-name check (http-adapters createHttpAuth) admits the login; the stale "fixture-org"
    // placeholder must never return.
    const record = buildProposedFreeConditionAuthorizationRecord();
    expect(record.org.id).toBe("org_b2b102992b554887b88950efc4239f79");
    expect(record.org.name).toBe("Nakama E2E Fixture");
    expect(record.org.name).not.toBe("fixture-org");
    const go = buildProposedAuthorizationRecord();
    expect(go.org.name).toBe("Nakama E2E Fixture");
    expect(validateAuthorization(record).ok).toBe(true);
  });

  test("the free disposition is separate from the Go disposition and records the same pin flags", () => {
    expect(FREE_PROVIDER_DISPOSITION).not.toBe(PROVIDER_DISPOSITION);
    expect(FREE_PROVIDER_DISPOSITION.reason).not.toBe(PROVIDER_DISPOSITION.reason);
    expect(FREE_PROVIDER_DISPOSITION.suitability).toBe(PROVIDER_DISPOSITION.suitability);
    expect(FREE_PROVIDER_DISPOSITION.ownerSelectedOperationalCondition).toBe(PROVIDER_DISPOSITION.ownerSelectedOperationalCondition);
    expect(FREE_PROVIDER_DISPOSITION.sequencePinned).toBe(true);
    expect(FREE_PROVIDER_DISPOSITION.failuresTerminal).toBe(true);
    expect(FREE_PROVIDER_DISPOSITION.identicalBackendRevisionClaim).toBe(false);
  });
});

// ------------------------------------------------------------------ no default / no fallback

describe("free condition: there is no default and no fallback", () => {
  test("an absent or unknown condition is refused (never silently Go)", () => {
    const free = buildProposedFreeConditionAuthorizationRecord();
    const { condition, ...withoutCondition } = free.provider;
    expect(condition).toBe(FREE_CONDITION_KEY);
    expect(validateAuthorization({ ...free, provider: withoutCondition }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
    expect(validateAuthorization({ ...free, provider: { ...free.provider, condition: "nope" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
    // A record cannot become Go by naming the Go condition while keeping the free target.
    expect(validateAuthorization({ ...free, provider: { ...free.provider, condition: OPENCODE_GO_CONDITION_KEY } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
  });

  test("the Go record and the free record refuse each other's target (no cross-condition fallback)", () => {
    const go = buildProposedAuthorizationRecord();
    const free = buildProposedFreeConditionAuthorizationRecord();
    expect(go.provider.condition).toBe(OPENCODE_GO_CONDITION_KEY);
    // A record whose condition key and provider target disagree is refused — either at the provider block
    // (the condition names a different target) or at the model binding (the wire id belongs to the other
    // condition). It never silently validates.
    const swapCodes = [AUTHORIZATION_ERROR_CODES.provider, AUTHORIZATION_ERROR_CODES.model];
    expect(swapCodes).toContain(validateAuthorization({ ...go, provider: { ...free.provider } }).code);
    expect(swapCodes).toContain(validateAuthorization({ ...free, provider: { ...go.provider } }).code);
    // A moved instance uuid, wire model or endpoint under the free condition is refused.
    expect(validateAuthorization({ ...free, provider: { ...free.provider, instanceId: "00000000-0000-0000-0000-000000000000" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
    expect(validateAuthorization({ ...free, provider: { ...free.provider, wireModel: "deepseek-v4.1-flash" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
    expect(validateAuthorization({ ...free, provider: { ...free.provider, endpointRoute: "https://example.invalid/v1/chat/completions" } }).code).toBe(AUTHORIZATION_ERROR_CODES.provider);
  });

  test("a fallback, a substitution or a service-terms claim on the free condition is refused", () => {
    const free = buildProposedFreeConditionAuthorizationRecord();
    expect(validateAuthorization({ ...free, providerDisposition: { ...free.providerDisposition, fallbackProvider: { name: "opencode-go" } } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerOverride);
    expect(validateAuthorization({ ...free, providerDisposition: { ...free.providerDisposition, suitability: "approved" } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerSuitability);
    expect(validateAuthorization({ ...free, providerDisposition: { ...free.providerDisposition, serviceTermsPermissionClaimed: true } }).code).toBe(AUTHORIZATION_ERROR_CODES.providerTermsClaim);
  });
});

// ------------------------------------------------------------------ Go immutable + grant unconsumed

describe("free condition: the original Go condition is immutable and its grant stays un-consumed", () => {
  test("the Go record still validates unchanged and needs no live run", () => {
    const go = buildProposedAuthorizationRecord();
    expect(validateAuthorization(go).ok).toBe(true);
    expect(go.provider).toEqual({ condition: OPENCODE_GO_CONDITION_KEY, ...PROVIDER_TARGET });
    expect(go.model.requested).toBe(PROVIDER_TARGET.wireModel);
    expect(go.host).toEqual({
      baselineCommit: ADMITTED_FIXTURE.hostBaselineCommit,
      contractDigest: ACCEPTED_HOST.contractDigest,
      identity: ACCEPTED_HOST.identity,
      patchDigest: ACCEPTED_HOST.patchDigest,
    });
  });

  test("the Go one-run grant is not consumed and execution stays shut for both conditions", () => {
    const go = buildProposedAuthorizationRecord();
    const free = buildProposedFreeConditionAuthorizationRecord();
    // Ungranted records are refused with the explicit not-granted code (no run token claimed anywhere).
    expect(authorizeExecution(go).code).toBe(AUTHORIZATION_ERROR_CODES.executionNotGranted);
    expect(authorizeExecution(free).code).toBe(AUTHORIZATION_ERROR_CODES.executionNotGranted);
    // Even a forged grant flag cannot open either condition: the host contract seam is absent.
    const forgedGo = authorizeExecution({ ...go, executionAuthorized: true });
    expect(forgedGo.blocked).toBe(true);
    expect(forgedGo.code).toBe(AUTHORIZATION_ERROR_CODES.hostContractUnavailable);
    const forgedFree = authorizeExecution({ ...free, executionAuthorized: true });
    expect(forgedFree.blocked).toBe(true);
    expect(forgedFree.code).toBe(AUTHORIZATION_ERROR_CODES.hostContractUnavailable);
  });
});

// ------------------------------------------------------------------ frozen gates retained, inference closed

describe("free condition: the frozen gates are retained and inference stays closed", () => {
  test("the free record reuses the frozen prompts/budgets/profiles/allowlists byte-for-byte", () => {
    const go = buildProposedAuthorizationRecord();
    const free = buildProposedFreeConditionAuthorizationRecord();
    expect(free.cases).toEqual(go.cases);
    expect(free.prompts).toEqual(go.prompts);
    expect(free.budgets).toEqual(PROPOSED_BUDGETS);
    expect(free.caseBudgets).toEqual(go.caseBudgets);
    expect(free.profiles).toEqual(go.profiles);
    expect(free.caseProfile).toEqual(go.caseProfile);
    expect(free.effectiveAllowedCalls).toEqual(go.effectiveAllowedCalls);
    expect(free.noRetry).toBe(true);
    // Read gate retained for every case that requires a dashboard read.
    for (const caseId of ["N-1", "N-6", "N-7"]) expect(CASE_SPECS[caseId].requireRead).toBe(true);
    expect(Object.keys(free.prompts).sort()).toEqual([...CASE_IDS].sort());
    for (const caseId of CASE_IDS) expect(free.prompts[caseId].sha256).toBe(PROMPT_BINDINGS[caseId].sha256);
    // Profiles are the admitted fixture ids, unchanged.
    expect(free.profiles.readonly3.id).toBe(FIXTURE_PROFILES.readonly3.id);
    expect(free.profiles.full5.id).toBe(FIXTURE_PROFILES.full5.id);
    expect(free.effectiveAllowedCalls["N-1"]).toEqual(go.effectiveAllowedCalls["N-1"]);
    expect(free.effectiveAllowedCalls["N-1"]).toEqual(expect.arrayContaining([...READONLY_DASHBOARD_TOOLS]));
  });

  test("inference is blocked and the free condition cannot mint a grant", () => {
    expect(INFERENCE_AUTHORIZED).toBe(false);
    expect(() => assertInferenceAuthorized({ executionAuthorized: true })).toThrow(InferenceBlockedError);
    const free = buildProposedFreeConditionAuthorizationRecord({ executionAuthorized: true });
    expect(validateAuthorization(free).ok).toBe(true);
    const minted = mintLiveGrant({ authorization: free, hostContract: { digest: free.host.contractDigest } });
    expect(minted.ok).toBe(false);
    expect(minted.granted).toBe(false);
    expect(minted.blocked).toBe(true);
    expect(minted.code).toBe(LIVE_GRANT_ERROR_CODES.inferenceBlocked);
  });
});

// ------------------------------------------------------------------ exact reported model rules (offline driver)

const FREE_SESSION_MODEL = { model: FREE_MODEL, provider: "openai_compatible" };
const scratchRoot = existsSync(tmpdir()) ? mkdtempSync(join(tmpdir(), "nakama-free-condition-")) : null;
afterAll(() => { if (scratchRoot) rmSync(scratchRoot, { recursive: true, force: true }); });

let dbSeq = 0;
function freshStore() {
  dbSeq += 1;
  return createSessionStore(join(scratchRoot, `free-${dbSeq}.sqlite`));
}
const STABLE_PIN = { generation: ADMITTED_FIXTURE.pluginGeneration, lifecycleState: "enabled", path: join(scratchRoot, "store.sqlite"), revision: ADMITTED_FIXTURE.pluginRevision };
const STABLE_SNAPSHOT = { counts: { development_axes: 8 }, objects: [], rows: {}, versions: {} };
const exactContainment = (profileKey) => {
  const profile = FIXTURE_PROFILES[profileKey];
  return { ok: true, profileId: profile.id, tools: [...profile.tools], skills: profile.skill ? [profile.skill] : [], automationsEnabled: false };
};
const freeAuth = ({ cases = ["N-1"], overrides = {} } = {}) => {
  const allow = Object.fromEntries(cases.map((c) => [c, [...READONLY_DASHBOARD_TOOLS]]));
  return buildProposedFreeConditionAuthorizationRecord({ cases, effectiveAllowedCalls: allow, ...overrides });
};
function makeFreeDriver({ plan, auth = freeAuth(), sessionModel = FREE_SESSION_MODEL, turnDeadlineMs = null } = {}) {
  const store = freshStore();
  const latch = createStopLatch();
  const driver = createDriver({
    authorization: auth,
    budgets: PROPOSED_BUDGETS,
    checkContainment: ({ profileKey }) => exactContainment(profileKey),
    createHostSession: ({ caseId, sessionId }) => createHostSessionPort({ caseId, createGuard, plan, sessionId, store, ...sessionModel }),
    latch,
    pinOptions: {},
    pinStore: () => ({ ...STABLE_PIN }),
    readTrace: createTraceReader(store.path),
    snapshotStore: () => STABLE_SNAPSHOT,
    turnDeadlineMs,
  });
  return { driver, latch, store };
}
const readPlan = (caseId) => () => ({ calls: [{ arguments: { caseId }, name: "get_overview" }], answer: `answer for ${caseId}` });

withHostCore("free condition: exact reported model/provider rules over the offline driver", () => {
  test("the free condition derives expectedModel/expectedProvider from the record and passes when reported", async () => {
    const auth = freeAuth();
    const { driver } = makeFreeDriver({ auth, plan: readPlan("N-1") });
    const result = await driver.runCase({ caseId: "N-1", prompt: PROMPT_BINDINGS["N-1"].text, sessionId: "f1" });
    expect(result.ok).toBe(true);
    expect(result.modelIdentity.requested).toBe(FREE_MODEL);
    expect(result.modelIdentity.reported).toBe(FREE_MODEL);
    expect(result.modelIdentity.identityKind).toBe("alias_or_date_bounded");
    expect(result.modelIdentity.immutableWeightsClaim).toBe(false);
  });

  test("a Go-model or wrong-provider report under the free binding is a terminal mismatch (no fallback)", async () => {
    const wrong = makeFreeDriver({ plan: readPlan("N-1"), sessionModel: { model: PROVIDER_TARGET.wireModel, provider: "openai_compatible" } });
    const r1 = await wrong.driver.runCase({ caseId: "N-1", prompt: PROMPT_BINDINGS["N-1"].text, sessionId: "f2" });
    expect(r1.ok).toBe(false);
    expect(r1.codes).toContain(STOP_REASONS.modelMismatch);

    const badProvider = makeFreeDriver({ plan: readPlan("N-1"), sessionModel: { model: FREE_MODEL, provider: "opencode-go" } });
    const r2 = await badProvider.driver.runCase({ caseId: "N-1", prompt: PROMPT_BINDINGS["N-1"].text, sessionId: "f3" });
    expect(r2.ok).toBe(false);
    expect(r2.codes).toContain(STOP_REASONS.providerMismatch);
  });
});

// ------------------------------------------------------------------ injected transport + source resolution

const providerModule = resolve(hostCleanDir(), "apps/server/src/providers/openai-compatible/index.ts");
const compatibleModelsModule = resolve(hostCleanDir(), "apps/server/src/providers/compatible-models.ts");
const transportAvailable = existsSync(providerModule) && existsSync(compatibleModelsModule);
const withTransport = transportAvailable ? describe : describe.skip;

withTransport("free condition: injected transport and actual source resolution (offline, no network)", () => {
  test("the free route POSTs the bare free model to the pinned endpoint, with no session header", async () => {
    const { createOpenAICompatibleProvider } = await import(providerModule);
    const captured = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const headers = new Headers(init.headers ?? {});
      const headerKeys = [];
      for (const [k, v] of headers.entries()) headerKeys.push(k.toLowerCase() === "authorization" ? "<redacted>" : k.toLowerCase());
      captured.push({ body: init.body ? JSON.parse(String(init.body)) : null, headerKeys, method: init.method ?? "GET", url: String(url) });
      return new Response(
        JSON.stringify({ choices: [{ finish_reason: "stop", index: 0, message: { content: "ok", role: "assistant" } }], created: 0, id: "x", model: FREE_MODEL, object: "chat.completion", usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    try {
      const provider = createOpenAICompatibleProvider({
        apiKey: "dummy-key-not-a-secret",
        baseUrl: "https://api.commandcode.ai/provider/v1",
        displayName: "CommandCode",
        model: FREE_MODEL,
        supportsThinking: false,
      });
      await provider.generateChat({ messages: [{ content: "ping", role: "user" }], model: FREE_MODEL, system: "s" });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url).toBe(FREE_ENDPOINT);
    expect(captured[0].body.model).toBe(FREE_MODEL);
    // The generic OpenAI-compatible transport adds no stable Nakama session/client header.
    expect(captured[0].headerKeys.some((k) => k.includes("session"))).toBe(false);
    expect(captured[0].headerKeys).not.toContain("x-opencode-session");
  });

  test("the free model id resolves unchanged from the provider instance (canonical == wire, no prefix)", async () => {
    const { getModelsForProviderInstance } = await import(compatibleModelsModule);
    const instance = {
      customModels: [{ default: true, id: FREE_MODEL, name: "DeepSeek V4.1 Flash" }],
      id: FREE_INSTANCE_ID,
      label: "CommandCode",
      type: "openai_compatible",
    };
    const catalog = getModelsForProviderInstance(instance, FREE_MODEL);
    const entry = catalog.find((m) => m.id === FREE_MODEL);
    expect(entry).toBeDefined();
    expect(entry.id).toBe(FREE.canonicalModel); // custom entry id unchanged, no provider/ prefix
    expect(entry.providerId).toBe(FREE_INSTANCE_ID);
    expect(entry.providerLabel).toBe("CommandCode");
    expect(FREE.wireModel).toBe(entry.id);
  });
});
