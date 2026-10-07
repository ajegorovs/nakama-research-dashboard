/**
 * The live-dispatch capability grant — **gated at the mint**.
 *
 * Every live HTTP transport constructor in `http-adapters.mjs` refuses to build unless it is handed a grant
 * minted here (`isLiveGrant`). A grant is **only** produced by `mintLiveGrant`, and `mintLiveGrant` is not an
 * unconditional capability factory: it runs the two owning gates itself, in order, before it registers a
 * grant —
 *
 *   1. `authorizeExecution(authorization, { hostContract })` must return `ok` (a valid record that grants
 *      execution **and** a host contract whose digest matches the record's binding);
 *   2. `assertInferenceAuthorized({ executionAuthorized })` must return normally (`turn.mjs` keeps
 *      `INFERENCE_AUTHORIZED = false`, so this always refuses in this envelope).
 *
 * A refusal is returned as a plain `{ ok:false, … }` result and **no** grant is registered, so an importer
 * of `mintLiveGrant` cannot mint authority by itself: the hard gates are inside the mint, not merely
 * documented around it. Because the grant is identity-tracked in a module-private `WeakSet`, a
 * structurally-identical plain object is never accepted as a grant.
 *
 * The grant carries a **deep-frozen clone** of the authorization and host contract it was minted against, so
 * a caller cannot mutate the record after the gates passed (no TOCTOU window on the authorized values). It
 * also carries a single **run token**: the first authorized sequence claims it, and any later owning
 * instance built from the same grant cannot re-run the canonical sequence (`claimGrantRunToken`).
 *
 * The raw transport is therefore not a live-dispatch route by itself: an accidental composition of the
 * exported low-level `createDriver` with an unguarded HTTP factory fails closed before any login, session
 * create/bind, turn or provider call, and there is **no** open test seam that mints an ungated grant — the
 * positive path is exercised only against an isolated copied source (see `live-test-sandbox.mjs`).
 */
import { authorizeExecution } from "./authorization.mjs";
import { assertInferenceAuthorized } from "../turn.mjs";

const liveGrants = new WeakSet();
const consumedGrants = new WeakSet();

/** Refusal code the transport constructors raise when a live grant is absent or not one of ours. */
export const LIVE_GRANT_REFUSAL = "live_dispatch_not_authorized";

/** Refusal codes produced by the gated mint itself. */
export const LIVE_GRANT_ERROR_CODES = Object.freeze({
  inferenceBlocked: "live_inference_not_authorized",
  alreadyRun: "live_grant_already_consumed",
});

/** Recursively freeze a value so the authorized snapshot cannot change after the gates were consulted. */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Mint a live grant **only after both owning gates pass**. The record and host contract are re-read from
 * frozen clones, never from the caller's (possibly later-mutated) objects.
 *
 * Returns `{ ok:true, granted:true, grant }` on success, or a gate refusal
 * `{ ok:false, granted:false, blocked, code, failures, gate }` with **no** grant registered.
 */
export function mintLiveGrant({ authorization = null, hostContract = null, binding = {} } = {}) {
  // GATE 1 — execution authorization (pure, offline).
  const gate = authorizeExecution(authorization, { hostContract });
  if (!gate.ok) {
    return {
      ok: false,
      granted: false,
      blocked: gate.blocked === true,
      code: gate.code,
      failures: (gate.errors ?? []).map((e) => e.message),
      gate,
    };
  }

  // GATE 2 — the inference interlock. Hard stop in this envelope (INFERENCE_AUTHORIZED = false).
  try {
    assertInferenceAuthorized({ executionAuthorized: authorization?.executionAuthorized === true });
  } catch (error) {
    return {
      ok: false,
      granted: false,
      blocked: true,
      code: LIVE_GRANT_ERROR_CODES.inferenceBlocked,
      failures: [error?.message ?? String(error)],
    };
  }

  // Both gates passed. Register a frozen grant over frozen clones of the authorized values.
  const grant = deepFreeze({
    ...binding,
    kind: "nakama-e2e-live-grant",
    mintedAt: Date.now(),
    authorization: deepFreeze(structuredClone(authorization)),
    hostContract: hostContract ? deepFreeze(structuredClone(hostContract)) : null,
  });
  liveGrants.add(grant);
  return { ok: true, granted: true, grant };
}

/** True only for an object actually minted by a gate-passing `mintLiveGrant`. */
export function isLiveGrant(value) {
  return typeof value === "object" && value !== null && liveGrants.has(value);
}

/**
 * The grant's single run token. The first authorized owning sequence claims it; a second claim (any extra
 * owning instance built from the same grant) is refused, so the canonical sequence is single-shot **per
 * grant**, not merely per object.
 */
export function claimGrantRunToken(grant) {
  if (!isLiveGrant(grant)) return { ok: false, code: LIVE_GRANT_REFUSAL };
  if (consumedGrants.has(grant)) return { ok: false, code: LIVE_GRANT_ERROR_CODES.alreadyRun };
  consumedGrants.add(grant);
  return { ok: true };
}
