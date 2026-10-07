/**
 * The **authorized focused `get_topic`-scope live entrypoint** — the single supported route to a focused,
 * single-direct-turn acceptance run of the scoped `get_topic` (`axisId`) feature.
 *
 * ## Why this module exists
 *
 * `live.mjs` exposes only the fixed canonical sequence (`createAuthorizedLiveDriver`) and the N-7-only
 * continuation (`createAuthorizedN7ContinuationDriver`); neither can run an ad-hoc focused prompt. This is
 * the MINIMAL separate entry the focused condition needs. It adds no case to the frozen N-1…N-7 registry
 * and edits no frozen prompt.
 *
 * ## The gates run first (standard mint/interlock, before session creation)
 *
 * `createAuthorizedFocusedDriver(options)` runs exactly the standard owning gates, in `mintLiveGrant`
 * (`authorizeExecution` then `assertInferenceAuthorized`), **before** a single adapter, login, session,
 * containment read, pin or provider call is built. A refusal returns with **zero HTTP**. Only on success
 * does it compose a minimal live runtime and return an object exposing **only** `runFocusedTurn()` — no
 * `runCase`, no `runSequence`, no `runAuthorizedSequence`, no `runAutomationCase`. The turn is single-shot
 * per grant (the shared grant run token is claimed), so no owning instance can re-run it, and there is no
 * retry and no fallback.
 *
 * `INFERENCE_AUTHORIZED` stays `false` in this tree, so gate 2 always refuses and the real route is shut;
 * the positive path is exercised only against an isolated copied source (`live-test-sandbox.mjs`).
 */
import { canonicalSnapshot, pinActiveStoreIdentity } from "../snapshot.mjs";
import { createDriver } from "./driver.mjs";
import { FOCUSED_CASE_SLOT, FOCUSED_PROMPT, FOCUSED_PROMPT_SHA256, assertFocusedBinding } from "./focused.mjs";
import { localDeriveConversationToken } from "./host-session.mjs";
import { LIVE_CRITICAL_KEYS, LIVE_ERROR_CODES, assertAuthorizedPin } from "./live.mjs";
import { claimGrantRunToken, mintLiveGrant } from "./live-grant.mjs";
import { createHttpAuth, createHttpSessionFactory } from "./http-adapters.mjs";
import { profileKeyForCase } from "./profiles.mjs";
import { createStopLatch } from "./stop-latch.mjs";

/** Refusal codes owned by the focused entry (the two gates reuse the shared vocabulary). */
export const FOCUSED_LIVE_ERROR_CODES = Object.freeze({
  criticalOverride: "focused_live_critical_value_override_refused",
  grantRequired: "focused_live_dispatch_grant_required",
  bindingRefused: "focused_live_binding_refused",
  alreadyInvoked: "focused_live_already_invoked",
});

function focusedRefusal({ code, blocked = false, phase = "gate", failures = [], gate = null }) {
  return { ok: false, granted: false, live: true, focused: true, phase, code, blocked, failures, gate };
}

function criticalOverride(options) {
  const present = LIVE_CRITICAL_KEYS.filter((key) => options[key] !== undefined);
  return present.length > 0 ? present.join(", ") : null;
}

/** Compose the focused runtime **from a minted grant**. Not exported (no ungated live route by composition). */
function buildFocusedRuntime(options = {}) {
  const {
    grant = null,
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
    deriveToken = localDeriveConversationToken,
    log = () => {},
  } = options;

  // Authorization-owned values come only from the grant's frozen clone — never from a caller-supplied record.
  const authorization = grant?.authorization ?? null;
  const expectedOrgId = options.expectedOrgId ?? authorization?.org?.id ?? null;
  const expectedOrgName = options.expectedOrgName ?? authorization?.org?.name ?? null;
  const expectedModel = authorization?.model?.requested ?? null;
  // Provider identity is enforced at session creation by the record's session-bound model; the host resolves a
  // session's provider from `modelOverride ?? profile.model ?? default`. expectedProvider stays null.
  const expectedProvider = null;
  const sessionModel = authorization?.provider?.sessionBoundIdentity ?? authorization?.model?.requested ?? null;
  const budgets = authorization?.budgets ?? null;

  const latch = createStopLatch();
  const httpAuth = createHttpAuth({ allowNonLoopback, base, email, expectedOrgId, expectedOrgName, fetchImpl, password });
  const directSessionFactory = createHttpSessionFactory({ auth: httpAuth, fetchImpl, liveGrant: grant, model: sessionModel });

  // Pre-pin binding: every pin (before and after) must be the authorized identity, not merely stable.
  const wrappedPinStore = (pinArgs) => {
    const pin = pinStore(pinArgs);
    const check = assertAuthorizedPin({ pin, authorization });
    if (!check.ok) throw new Error(`${LIVE_ERROR_CODES.pinMismatch}: ${check.failures.join("; ")}`);
    return pin;
  };

  const driver = createDriver({
    authorization,
    budgets,
    checkContainment,
    createHostSession: ({ caseId, ...rest }) => directSessionFactory({ caseId, ...rest }),
    deriveToken,
    expectedModel,
    expectedProvider,
    latch,
    log,
    pinOptions,
    pinStore: wrappedPinStore,
    readTrace,
    snapshotStore,
  });

  return { httpAuth, driver, latch, authorization, grant };
}

/**
 * The gated focused live entrypoint. Runs both gates inside `mintLiveGrant` before anything is constructed;
 * on success returns an object exposing **only** `runFocusedTurn()`.
 */
export function createAuthorizedFocusedDriver(options = {}) {
  const override = criticalOverride(options);
  if (override) {
    return focusedRefusal({
      code: FOCUSED_LIVE_ERROR_CODES.criticalOverride,
      phase: "gate",
      failures: [`caller values are refused for authorization-owned fields: ${override}`],
    });
  }
  const { authorization = null, hostContract = null, ...seams } = options;

  // Both owning gates run inside the mint, before any adapter is built. A refusal returns with zero HTTP.
  const minted = mintLiveGrant({ authorization, hostContract: hostContract ?? null });
  if (!minted.ok) {
    return focusedRefusal({
      blocked: minted.blocked === true,
      code: minted.code,
      failures: minted.failures,
      gate: minted.gate ?? null,
      phase: "gate",
    });
  }

  const runtime = buildFocusedRuntime({ grant: minted.grant, ...seams });

  async function runFocusedTurn() {
    // Single-shot per grant, shared with the other owning entrypoints: the grant run token is claimed here.
    const token = claimGrantRunToken(minted.grant);
    if (!token.ok) {
      return { ok: false, granted: true, focused: true, code: FOCUSED_LIVE_ERROR_CODES.alreadyInvoked, failures: ["the focused turn is single-shot per grant; its run token was already consumed"] };
    }
    // The focused binding is re-asserted here, BEFORE any login or session creation (defence in depth on top
    // of the mint's own validation). The focused prompt is the frozen condition's exact bytes.
    const binding = assertFocusedBinding({ authorization: runtime.authorization });
    if (!binding.ok) {
      return { ok: false, granted: true, focused: true, code: FOCUSED_LIVE_ERROR_CODES.bindingRefused, failures: binding.failures };
    }
    if (!runtime.httpAuth.loggedIn) await runtime.httpAuth.login();
    const result = await runtime.driver.runCase({ caseId: FOCUSED_CASE_SLOT, prompt: FOCUSED_PROMPT });
    return { ...result, granted: true, focused: true, latch: runtime.latch.snapshot() };
  }

  return {
    ok: true,
    granted: true,
    live: true,
    focused: true,
    grant: minted.grant,
    caseSlot: FOCUSED_CASE_SLOT,
    condition: "focused_get_topic_scope",
    promptSha256: FOCUSED_PROMPT_SHA256,
    runFocusedTurn,
    latch: runtime.latch,
  };
}
