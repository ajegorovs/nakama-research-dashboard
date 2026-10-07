/**
 * The owning driver's **authorized live entrypoint** — the only supported route to a live run.
 *
 * ## Why this module exists
 *
 * The owning driver (`driver.mjs`) is deliberately transport-agnostic: it performs no I/O and takes
 * injected ports, so it can be exercised end-to-end offline. That flexibility is a **testing** property
 * and it is retained (`createDriver` is labelled offline-only). But it also means the exported low-level
 * `createDriver` and the exported HTTP transport constructors could previously be composed into a live
 * run that never consulted `authorizeExecution` or `assertInferenceAuthorized` — the HTTP turn path
 * ignored both gates. That composition is now closed: the HTTP transport constructors refuse to build
 * without a live grant (`live-grant.mjs`), and a grant is minted only here, after both gates pass.
 *
 * ## The entrypoint
 *
 * `createAuthorizedLiveDriver({ authorization, hostContract, ...seams })`:
 *
 *   1. `authorizeExecution(authorization, { hostContract })` must return `ok` — a valid record that
 *      grants execution AND a host contract whose digest matches the record's binding;
 *   2. `assertInferenceAuthorized({ executionAuthorized: authorization.executionAuthorized })` must
 *      return normally;
 *   3. only then is a live grant minted and the live adapters composed.
 *
 * Both gates run **before any login, session create/bind, turn or provider call**, and a refusal returns
 * without constructing a single adapter — zero HTTP.
 *
 * ## What the live route fixes (reviewer findings)
 *
 *   - **Exact canonical sequence only.** The direct order is `N-1 … N-6` then the single downstream
 *     `N-7`; the entrypoint never accepts caller-supplied `cases`/`prompts`/`sessions`, so the order
 *     cannot be shortened, reordered, duplicated or substituted. It is single-shot: a second invocation
 *     is refused, failures are attempted once and never retried.
 *   - **No standalone N-7.** The returned object exposes only `runAuthorizedSequence`; there is no
 *     standalone automation method, so N-7 cannot run before the direct cases.
 *   - **Critical values come from the authorization alone** — provider/canonical model, the whole-
 *     experiment and per-case budgets, and the profile/case-profile bindings are derived from the record;
 *     a caller passing any of those (or an override of the model/provider/expected identity) is refused
 *     rather than silently honoured.
 *   - **Pre-pin is bound, not merely stable.** Before each case's inference the pinned store identity must
 *     equal the authorization's admitted plugin revision/generation (12 / `g7e6ef07…`); a mismatch latches
 *     the case before the turn. The existing before/after immutability proof then still runs.
 *
 * ## Boundary
 *
 * `executionAuthorized` is `false` on every record in this envelope and `turn.mjs` keeps
 * `INFERENCE_AUTHORIZED = false`, so gate 2 always refuses and the real live route is shut. No host,
 * fixture, key, live configuration or network is touched here. The gates live **inside the mint**
 * (`live-grant.mjs` `mintLiveGrant`), so there is no ungated production grant factory and no open test
 * seam that mints one; the positive gate path is exercised only against an isolated copied source
 * (`live-test-sandbox.mjs`, which flips `INFERENCE_AUTHORIZED` in the **copy** and never in this repo).
 */
import { buildAutomationDefinition } from "../automation.mjs";
import { canonicalSnapshot, pinActiveStoreIdentity } from "../snapshot.mjs";
import { withTemporaryAutomationEnabled } from "./automation-eligibility.mjs";
import { runN7OnlyContinuation } from "./n7-continuation.mjs";
import { AUTHORIZATION_ERROR_CODES } from "./authorization.mjs";
import { AUTOMATION_CASE, CASE_IDS, DIRECT_CASE_ORDER } from "./cases.mjs";
import { createDriver } from "./driver.mjs";
import { localDeriveConversationToken } from "./host-session.mjs";
import { claimGrantRunToken, isLiveGrant, mintLiveGrant } from "./live-grant.mjs";
import {
  createHttpAuth,
  createHttpAutomationApi,
  createHttpAutomationSessionFactory,
  createHttpProfileEligibilityApi,
  createHttpSessionFactory,
} from "./http-adapters.mjs";
import { profileKeyForCase } from "./profiles.mjs";
import { createStopLatch } from "./stop-latch.mjs";

export const LIVE_ERROR_CODES = Object.freeze({
  // The two gate refusals reuse the authorization vocabulary, so there is one code per condition.
  notGranted: AUTHORIZATION_ERROR_CODES.executionNotGranted,
  contractUnavailable: AUTHORIZATION_ERROR_CODES.hostContractUnavailable,
  contractDigestMismatch: AUTHORIZATION_ERROR_CODES.hostContractDigestMismatch,
  inferenceBlocked: "live_inference_not_authorized",
  criticalOverride: "live_critical_value_override_refused",
  grantRequired: "live_dispatch_grant_required",
  sequenceOverride: "live_sequence_override_refused",
  sequenceAlreadyInvoked: "live_sequence_already_invoked",
  pinMismatch: "live_prepin_not_authorized_identity",
});

/**
 * Authorization-owned values a caller must never supply in parallel. Passing a non-`undefined` value for
 * any of these is refused before the gates run, so the entrypoint has a single source of truth.
 */
export const LIVE_CRITICAL_KEYS = Object.freeze([
  "budgets",
  "caseBudgets",
  "profiles",
  "caseProfile",
  "provider",
  "providerDisposition",
  "model",
  "cases",
  "prompts",
  "expectedModel",
  "expectedProvider",
  "turnDeadlineMs",
]);

function liveRefusal({ code, blocked = false, phase = "gate", failures = [], gate = null }) {
  return { ok: false, granted: false, live: true, phase, code, blocked, failures, gate };
}

function criticalOverride(options) {
  const present = LIVE_CRITICAL_KEYS.filter((key) => options[key] !== undefined);
  return present.length > 0 ? present.join(", ") : null;
}

/**
 * The pre-pin **binding** check: the identity read before a case must equal the authorization's admitted
 * plugin revision/generation. Pure and offline. Returns `{ ok, code, failures }`.
 */
export function assertAuthorizedPin({ pin, authorization } = {}) {
  const failures = [];
  const revision = authorization?.plugin?.revision;
  const generation = authorization?.plugin?.generation;
  if (!pin || typeof pin !== "object") {
    failures.push("no pinned store identity was read");
  } else {
    if (pin.revision !== revision) failures.push(`pin.revision ${JSON.stringify(pin.revision)} != authorized ${JSON.stringify(revision)}`);
    if (pin.generation !== generation) failures.push(`pin.generation ${JSON.stringify(pin.generation)} != authorized ${JSON.stringify(generation)}`);
  }
  return { ok: failures.length === 0, code: failures.length > 0 ? LIVE_ERROR_CODES.pinMismatch : null, failures };
}

/**
 * Compose the live runtime **from a minted grant** — deliberately **not exported**, so it is not reachable
 * as a live route by module composition. Production code goes through `createAuthorizedLiveDriver` (or the
 * N-7 continuation entrypoint), which runs both gates inside `mintLiveGrant` before calling this. Every
 * authorization-owned value is read from the grant's frozen `authorization` (never from a caller-supplied
 * record), so a caller cannot pair a grant with an ungranted record.
 *
 * Returns a refusal object (`{ refusal }`) when no grant is present, otherwise the shared runtime
 * (`{ httpAuth, driver, latch, automationDefinitionFor, authorization, grant }`).
 */
function buildLiveRuntime(options = {}) {
  const {
    grant = null,
    // Environment seams only (transport / environment), never authorization-owned values.
    fetchImpl = globalThis.fetch,
    base,
    email,
    password,
    allowNonLoopback = false,
    pinStore = pinActiveStoreIdentity,
    pinOptions = {},
    snapshotStore = canonicalSnapshot,
    readTrace = null,
    checkContainment = null,
    automationName = "nakama-e2e-n7-manual",
    deriveToken = localDeriveConversationToken,
    makeAutomationEligibility = null,
    log = () => {},
  } = options;
  if (!isLiveGrant(grant)) {
    return {
      refusal: liveRefusal({
        code: LIVE_ERROR_CODES.grantRequired,
        phase: "dispatch",
        failures: ["a live grant minted by an authorized entrypoint is required; the raw transports are offline-only"],
      }),
    };
  }

  // Authorization-owned values come from the grant's frozen clone — never from a caller-supplied record.
  const authorization = grant.authorization ?? null;
  const expectedOrgId = options.expectedOrgId ?? authorization?.org?.id ?? null;
  const expectedOrgName = options.expectedOrgName ?? authorization?.org?.name ?? null;

  // Derive every authorization-owned value from the record — never from the caller.
  const expectedModel = authorization?.model?.requested ?? null;
  // Provider identity evidence: the amended host persists no per-message provider field — an assistant
  // `session_messages.payload` carries only `usage.modelId` (the bare wire model id), so no authoritative
  // provider-name evidence exists in the DB trace. The session's provider is instead enforced *at session
  // creation* by the bound session `model` override (the record's `provider.sessionBoundIdentity`): the host
  // resolves a session's provider from `modelOverride ?? profile.model ?? default`, so binding the
  // instance-qualified identity selects the authorized instance. A default-provider dispatch still
  // terminally fails the wire-model check (`expectedModel`). expectedProvider stays null.
  const expectedProvider = null;
  const sessionModel = authorization?.provider?.sessionBoundIdentity ?? authorization?.model?.requested ?? null;
  const budgets = authorization?.budgets ?? null;
  const prompts = Object.fromEntries(CASE_IDS.map((id) => [id, authorization?.prompts?.[id]?.text ?? null]));

  const latch = createStopLatch();
  const httpAuth = createHttpAuth({ allowNonLoopback, base, email, expectedOrgId, expectedOrgName, fetchImpl, password });
  const directSessionFactory = createHttpSessionFactory({ auth: httpAuth, fetchImpl, liveGrant: grant, model: sessionModel });
  const automationSessionFactory = createHttpAutomationSessionFactory({ auth: httpAuth, fetchImpl, liveGrant: grant, model: sessionModel });
  const automationApi = createHttpAutomationApi({ auth: httpAuth, fetchImpl, liveGrant: grant });

  // The scoped-automation-eligibility seam (N-7 only). Built from the live http auth so it can read/write the
  // ONE profile's `automationsEnabled` through the supported route; it never touches read-only tool policy.
  const withAutomationEligibility =
    typeof makeAutomationEligibility === "function" ? makeAutomationEligibility({ httpAuth, grant, log }) : null;

  // Pre-pin binding: every pin (before and after) must be the authorized identity, not merely stable.
  const wrappedPinStore = (pinArgs) => {
    const pin = pinStore(pinArgs);
    const check = assertAuthorizedPin({ pin, authorization });
    if (!check.ok) throw new Error(`${LIVE_ERROR_CODES.pinMismatch}: ${check.failures.join("; ")}`);
    return pin;
  };

  const driver = createDriver({
    automationApi,
    authorization,
    budgets,
    checkContainment,
    createHostSession: ({ caseId, ...rest }) =>
      caseId === AUTOMATION_CASE ? automationSessionFactory({ caseId, ...rest }) : directSessionFactory({ caseId, ...rest }),
    deriveToken,
    expectedModel,
    expectedProvider,
    latch,
    log,
    pinOptions,
    pinStore: wrappedPinStore,
    readTrace,
    snapshotStore,
    withAutomationEligibility,
  });

  const automationDefinitionFor = () => {
    if (!Array.isArray(authorization?.cases) || !authorization.cases.includes(AUTOMATION_CASE)) return null;
    const prompt = authorization.prompts?.[AUTOMATION_CASE]?.text;
    const profileId = authorization.profiles?.[profileKeyForCase(AUTOMATION_CASE)]?.id;
    if (typeof prompt !== "string" || typeof profileId !== "string") return null;
    return buildAutomationDefinition({ name: automationName, prompt, profileId });
  };

  return { httpAuth, driver, latch, automationDefinitionFor, authorization, grant, prompts };
}

/**
 * Compose the **canonical-sequence** live driver from a minted grant. Deliberately **not exported** (see
 * `live.test.mjs`: `liveModule.composeLiveDriver` must be undefined). Exposes only `runAuthorizedSequence`.
 */
function composeLiveDriver(options = {}) {
  const runtime = buildLiveRuntime(options);
  if (runtime.refusal) return runtime.refusal;
  const { httpAuth, driver, latch, automationDefinitionFor, grant, prompts } = runtime;
  const cases = [...DIRECT_CASE_ORDER];

  async function runAuthorizedSequence(...args) {
    const override = args.find(
      (arg) => arg && typeof arg === "object" && ("cases" in arg || "prompts" in arg || "sessions" in arg || "runAutomation" in arg)
    );
    if (override) {
      return { ok: false, granted: false, code: LIVE_ERROR_CODES.sequenceOverride, failures: ["the live sequence is fixed: caller cases/prompts/sessions are refused"] };
    }
    // Single-shot **per grant**: the shared run token is claimed here, so any extra owning instance built
    // from the same grant cannot re-run the canonical sequence (not merely a per-object flag).
    const token = claimGrantRunToken(grant);
    if (!token.ok) {
      return { ok: false, granted: false, code: LIVE_ERROR_CODES.sequenceAlreadyInvoked, failures: ["the live sequence is single-shot per grant; its run token was already consumed"] };
    }

    if (!httpAuth.loggedIn) await httpAuth.login();
    const run = await driver.runSequence({ automationDefinition: automationDefinitionFor(), cases, prompts, runAutomation: true, sessions: {} });
    const automationOk = run.automation ? run.automation.ok === true : false;
    return {
      ok: run.directOk === true && automationOk,
      granted: true,
      directOk: run.directOk,
      direct: run.direct,
      automation: run.automation,
      latch: run.latch,
    };
  }

  return {
    ok: true,
    granted: true,
    live: true,
    grant,
    sequence: [...CASE_IDS],
    directCases: [...cases],
    automationCase: AUTOMATION_CASE,
    runAuthorizedSequence,
    latch,
  };
}

/**
 * The **scoped-automation-eligibility seam** for the N-7 wrapper: read the one profile, require it to start
 * desired-off with the exact read-only surface, enable `automationsEnabled` for ONLY the install+run window
 * and restore the exact prior value in a `finally` (re-reading to prove the restore). A refusal or a failed
 * restore throws, so the driver's wrapper records a terminal result and never continues.
 */
function makeLiveEligibilitySeam({ httpAuth, liveGrant, fetchImpl = globalThis.fetch, log = () => {} }) {
  const eligibilityApi = createHttpProfileEligibilityApi({ auth: httpAuth, fetchImpl, liveGrant });
  return async ({ profileId, run }) => {
    const window = await withTemporaryAutomationEnabled({
      profileId,
      read: (pid) => eligibilityApi.read(pid),
      write: (pid, patch) => eligibilityApi.write(pid, patch),
      run,
      log,
    });
    if (!window.ok) {
      throw Object.assign(new Error(`${N7_LIVE_ERROR_CODES.eligibilityRefused}: ${(window.failures ?? []).join("; ")}`), { code: window.code });
    }
    if (window.runError) throw new Error(`automation run failed inside the eligibility window: ${window.runError}`);
    return window.ran;
  };
}

/** The scoped-live N-7 continuation route's own refusal codes. */
export const N7_LIVE_ERROR_CODES = Object.freeze({
  eligibilityRefused: "n7_eligibility_refused",
});

/**
 * The **authorized N-7-only continuation entrypoint** — the single supported route that runs the manual
 * automation wrapper ALONE, bound to *preserved* direct evidence (an immutable digest), WITHOUT replaying
 * N-1…N-6.
 *
 * It runs both owning gates **first**, inside `mintLiveGrant` (`authorizeExecution` then
 * `assertInferenceAuthorized`), before any login, session, containment read, profile write or provider call;
 * a refusal returns with zero I/O. On success it composes the runtime, mints a grant and returns an object
 * that exposes **only** `runN7Continuation({ directEvidence, expectedDigest })` — no direct-case runner, no
 * `runCase`, no `runAutomationCase` — and a single-shot per-grant run token. The continuation itself binds
 * the digest + model/prompt/plugin/org/profile identities and re-runs the existing `assertTurnAuthorized` /
 * `verifyPromptBinding` guards before the one turn. The eligibility seam enables the profile's
 * `automationsEnabled` for the install+run window only and restores it exactly in a `finally`.
 */
export function createAuthorizedN7ContinuationDriver(options = {}) {
  const override = criticalOverride(options);
  if (override) {
    return liveRefusal({
      code: LIVE_ERROR_CODES.criticalOverride,
      phase: "gate",
      failures: [`caller values are refused for authorization-owned fields: ${override}`],
    });
  }
  const { authorization = null, hostContract = null, ...seams } = options;

  // Both gates run inside the mint (GATE 1 authorizeExecution; GATE 2 assertInferenceAuthorized). A refusal
  // returns here with no adapter built — zero HTTP, no session, no write, no provider call.
  const minted = mintLiveGrant({ authorization, hostContract: hostContract ?? null });
  if (!minted.ok) {
    return liveRefusal({
      blocked: minted.blocked === true,
      code: minted.code,
      failures: minted.failures,
      gate: minted.gate ?? null,
      phase: "gate",
    });
  }

  const runtime = buildLiveRuntime({
    grant: minted.grant,
    ...seams,
    makeAutomationEligibility: ({ httpAuth }) =>
      makeLiveEligibilitySeam({ httpAuth, liveGrant: minted.grant, fetchImpl: seams.fetchImpl ?? globalThis.fetch, log: seams.log }),
  });
  if (runtime.refusal) return runtime.refusal;
  const { httpAuth, driver, latch, automationDefinitionFor, authorization: boundAuthorization } = runtime;

  async function runN7Continuation({ directEvidence, expectedDigest } = {}) {
    // Single-shot per grant, shared with the canonical entrypoint: the run token is claimed here.
    const token = claimGrantRunToken(minted.grant);
    if (!token.ok) {
      return { ok: false, granted: true, code: LIVE_ERROR_CODES.sequenceAlreadyInvoked, failures: ["the N-7 continuation is single-shot per grant; its run token was already consumed"] };
    }
    if (!httpAuth.loggedIn) await httpAuth.login();
    // The continuation binds the digest + identities and re-runs the existing N-7 guards, then delegates the
    // single measured turn to the driver's own wrapper (which re-checks exact containment and applies the
    // scoped-eligibility window). The automation definition is built here from the authorization (never
    // supplied by a caller) and the digest-bound direct results are passed through untouched.
    const result = await runN7OnlyContinuation({
      authorization: boundAuthorization,
      directEvidence,
      expectedDigest,
      runAutomationCase: (args) => driver.runAutomationCase({ ...args, automationDefinition: automationDefinitionFor() }),
      log: seams.log,
    });
    return { ...result, granted: true, latch: latch.snapshot() };
  }

  return {
    ok: true,
    granted: true,
    live: true,
    grant: minted.grant,
    sequence: [AUTOMATION_CASE],
    automationCase: AUTOMATION_CASE,
    runN7Continuation,
    latch,
  };
}

/**
 * The gated live entrypoint. Runs both gates (execution authorization, then the inference interlock)
 * before anything is constructed; on success mints the live grant and composes the live driver. On any
 * refusal it returns a result object and performs **no** I/O.
 */
export function createAuthorizedLiveDriver(options = {}) {
  const override = criticalOverride(options);
  if (override) {
    return liveRefusal({
      code: LIVE_ERROR_CODES.criticalOverride,
      phase: "gate",
      failures: [`caller values are refused for authorization-owned fields: ${override}`],
    });
  }
  const { authorization = null, hostContract = null, ...seams } = options;

  // Both gates run **inside the mint** (GATE 1 authorizeExecution, GATE 2 assertInferenceAuthorized); a
  // grant is registered only when both pass. A refusal returns here with no adapter built — zero HTTP.
  const minted = mintLiveGrant({ authorization, hostContract: hostContract ?? null });
  if (!minted.ok) {
    return liveRefusal({
      blocked: minted.blocked === true,
      code: minted.code,
      failures: minted.failures,
      gate: minted.gate ?? null,
      phase: "gate",
    });
  }

  return composeLiveDriver({ grant: minted.grant, ...seams });
}

/**
 * Convenience: gate, compose and run the canonical N-1…N-7 sequence once. In this envelope the gates
 * always refuse (inference is not authorized), so this returns the gate refusal and performs no I/O.
 */
export async function runAuthorizedSequence(options = {}) {
  const live = createAuthorizedLiveDriver(options);
  if (!live.ok) return live;
  return live.runAuthorizedSequence();
}
