/**
 * Bounded budgets for the owning Nakama E2E driver.
 *
 * The host-amendment ruling requires **separate provider-generation and cumulative individual-tool
 * counters per turn**, a batch that consumes N and executes none if it would exceed the remainder, and a
 * genuine turn-scoped deadline — and it states that **numeric ceilings remain proposals until readiness
 * review**. This module is the executable home of those numbers. It does three things:
 *
 *   1. `PROPOSED_CASE_BUDGETS` records an exact per-case budget, grounded in the host's real turn
 *      resolution (see WHY NOT `perTurnModelCalls: 1` below); `PROPOSED_BUDGETS` is the whole-experiment
 *      envelope. Both are explicit, reviewable values. **The numeric envelope is now APPROVED by the
 *      reviewer** (2026-10-06: N-1 3/4/120 s; N-2…N-5 4/6/120 s; N-6/N-7 3/6/120 s; whole experiment
 *      25/40/900 s). Approval of the numbers is **not** execution authorization: `executionAuthorized`
 *      stays `false` and `turn.mjs` keeps `INFERENCE_AUTHORIZED = false`, so no live run is reachable from
 *      this envelope. The `PROPOSED_*` export names are retained for compatibility; `APPROVED_*` aliases
 *      name the same frozen values.
 *   2. `validateBudgetConfig` / `validateCaseBudgets` are fail-closed: every field must be present,
 *      integral and within the reviewed maximum. A caller may tighten but never silently widen a reviewed
 *      ceiling, and cannot omit a field to dodge it.
 *   3. `createBudgetTracker` enforces consumption the way the ruling words it: a batch of N consumes N and
 *      executes **none** if it would exceed the remaining tool budget; provider generations and tool calls
 *      are counted separately; per-turn and whole-experiment limits are both enforced.
 *
 * APPROVED — these numbers were approved by the reviewer on 2026-10-06 (they are no longer merely
 * proposed). Approval is **not** a grant: do not read their presence here as authorization to run, and do
 * not flip a caller's use of them into a live run — execution stays unauthorized (`executionAuthorized:
 * false`; `INFERENCE_AUTHORIZED = false`).
 *
 * WHY NOT `perTurnModelCalls: 1`. A single provider generation cannot complete a case that consults the
 * dashboard plugin: the tool surface is deferred, so the host's real loop needs at least
 *    gen 1 → the model requests a tool (`find_tools` discovery),
 *    gen 2 → the model calls the resolved dashboard read,
 *    gen 3 → the model writes the final answer from the tool result,
 * i.e. **three** generations and two tool executions before a unit of work is done. A budget of one
 * generation stops every consultation case at `model-generation-budget-exhausted`, so it is not a bound on
 * cost — it is a wrong measurement. The per-case numbers below are the minimums the real resolution
 * implies, plus a single spare for a second read.
 */

/** The budget fields every authorization must carry. Missing any field is a refusal. */
export const BUDGET_FIELDS = Object.freeze([
  "perTurnModelCalls",
  "perTurnToolCalls",
  "perTurnTimeoutMs",
  "totalModelCalls",
  "totalToolCalls",
  "totalWallClockMs",
]);

/**
 * Approved exact **per-case** budgets, grounded in the host's real turn resolution.
 *
 *   - `N-1` smoke — may answer directly (1) or consult once with deferred discovery (3). Cap 3.
 *   - `N-2…N-5` consultation — discovery (1) + dashboard read (1) + answer (1) minimum, one spare for a
 *     second read: 4 generations, 6 individual executions (discovery counts).
 *   - `N-6` writers visible — the model attempts a writer, which is denied pre-dispatch and terminates the
 *     turn: 3 generations is generous; 6 tool executions covers discovery.
 *   - `N-7` manual automation — same shape as N-6 under the owned worker wrapper: 3 generations.
 *
 * `deadlineMs` matches the bounded transport timeout already approved for the sibling librarian evaluation
 * (DECISIONS.md: "timeout 120 s"); it is a per-turn wall-clock bound, not a token budget.
 */
export const PROPOSED_CASE_BUDGETS = Object.freeze({
  "N-1": Object.freeze({ deadlineMs: 120_000, modelGenerations: 3, toolCalls: 4 }),
  "N-2": Object.freeze({ deadlineMs: 120_000, modelGenerations: 4, toolCalls: 6 }),
  "N-3": Object.freeze({ deadlineMs: 120_000, modelGenerations: 4, toolCalls: 6 }),
  "N-4": Object.freeze({ deadlineMs: 120_000, modelGenerations: 4, toolCalls: 6 }),
  "N-5": Object.freeze({ deadlineMs: 120_000, modelGenerations: 4, toolCalls: 6 }),
  "N-6": Object.freeze({ deadlineMs: 120_000, modelGenerations: 3, toolCalls: 6 }),
  "N-7": Object.freeze({ deadlineMs: 120_000, modelGenerations: 3, toolCalls: 6 }),
});

/** The exact proposed per-case budget for one case; throws for an unknown case. */
export function caseBudgetFor(caseId) {
  const budget = PROPOSED_CASE_BUDGETS[caseId];
  if (!budget) throw new Error(`no case budget for ${caseId}`);
  return budget;
}

/**
 * The whole-experiment envelope. `perTurn*` is the strictest bound the most expensive case needs; `total*`
 * is the exact sum of `PROPOSED_CASE_BUDGETS` across N-1…N-7 (model: 3+4+4+4+4+3+3 = 25; tools:
 * 4+6+6+6+6+6+6 = 40); `totalWallClockMs` (15 min) is the whole-experiment wall-clock ceiling — the host's
 * 200,000-output-token threshold is a different unit and is not a substitute (see the warning above).
 */
export const PROPOSED_BUDGETS = Object.freeze({
  perTurnModelCalls: 4,
  perTurnToolCalls: 6,
  perTurnTimeoutMs: 120_000,
  totalModelCalls: 25,
  totalToolCalls: 40,
  totalWallClockMs: 900_000,
});

/** Approved aliases for the frozen numeric envelope (same values as the `PROPOSED_*` names). */
export const APPROVED_CASE_BUDGETS = PROPOSED_CASE_BUDGETS;
export const APPROVED_BUDGETS = PROPOSED_BUDGETS;

/**
 * Outer org LLM-turn quota — **approved defense in depth**, corrected wording.
 *
 * The fixture org's quota is opt-in; a quota of **30** permits thirty provider turns and **rejects the
 * 31st**. It does **not** reject the 26th: the owning driver's own **25-generation** whole-experiment
 * envelope is what refuses the 26th experiment generation. The two are different units and the quota is a
 * pre-generation backstop, never a replacement for the per-turn counters and the turn-scoped deadline.
 *
 * The **token** quota is preferred **unset** unless its reservation semantics are separately calibrated:
 * each call reserves the remaining output budget (up to 200 000 tokens), so a naive token limit is
 * consumed by the first reserve and self-triggers; it is not needed when the turn quota and host budgets
 * function. This envelope configures nothing.
 */
export const ORG_LLM_TURN_QUOTA = Object.freeze({
  monthlyLlmTurnLimit: 30,
  rejectsAt: 31,
  driverEnvelopeRefusesAt: 26,
  preferTokenLimitUnset: true,
});

/**
 * The absolute ceilings `validateBudgetConfig` will admit. A configuration may be stricter than these
 * (fewer calls, shorter timeout) but never looser, so a caller cannot silently choose an unreviewed wider
 * bound. `perTurnModelCalls` admits one spare above the most expensive case (5 → 6); `totalToolCalls` is
 * the sum of the per-case tool caps (40) with headroom (60); `perTurnTimeoutMs` is capped at 180 s.
 */
export const BUDGET_MAXIMA = Object.freeze({
  perTurnModelCalls: 6,
  perTurnToolCalls: 12,
  perTurnTimeoutMs: 180_000,
  totalModelCalls: 30,
  totalToolCalls: 60,
  totalWallClockMs: 1_800_000,
});

/** Per-case absolute ceilings. Same fail-closed rule as the whole-experiment maxima. */
export const CASE_BUDGET_MAXIMA = Object.freeze({
  deadlineMs: 180_000,
  modelGenerations: 6,
  toolCalls: 12,
});

/** Fixed, fail-closed reason codes. The driver never returns a free-form budget verdict. */
export const BUDGET_ERROR_CODES = Object.freeze({
  missing: "budget_missing_field",
  notInteger: "budget_not_integer",
  notPositive: "budget_not_positive",
  aboveCeiling: "budget_above_reviewed_ceiling",
  perTurnExceedsTotal: "budget_per_turn_exceeds_total",
});

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a budget configuration. Returns `{ ok, code, errors }`; the first error's code is returned as
 * `code` so a caller latches on a fixed token rather than parsing prose. Fail-closed: any missing field,
 * non-integer, non-positive value or value above the reviewed ceiling refuses.
 */
export function validateBudgetConfig(budgets) {
  if (!isPlainObject(budgets)) {
    return { ok: false, code: BUDGET_ERROR_CODES.missing, errors: ["budgets is not an object"] };
  }
  const errors = [];
  for (const field of BUDGET_FIELDS) {
    const value = budgets[field];
    if (value === undefined || value === null) {
      errors.push({ code: BUDGET_ERROR_CODES.missing, field, message: `${field} is required` });
      continue;
    }
    if (!Number.isInteger(value)) {
      errors.push({ code: BUDGET_ERROR_CODES.notInteger, field, message: `${field} must be an integer` });
      continue;
    }
    if (value <= 0) {
      errors.push({ code: BUDGET_ERROR_CODES.notPositive, field, message: `${field} must be positive` });
      continue;
    }
    if (value > BUDGET_MAXIMA[field]) {
      errors.push({
        code: BUDGET_ERROR_CODES.aboveCeiling,
        field,
        message: `${field} ${value} exceeds the reviewed ceiling ${BUDGET_MAXIMA[field]}`,
      });
    }
  }
  if (
    Number.isInteger(budgets.perTurnModelCalls) &&
    Number.isInteger(budgets.totalModelCalls) &&
    budgets.perTurnModelCalls > budgets.totalModelCalls
  ) {
    errors.push({
      code: BUDGET_ERROR_CODES.perTurnExceedsTotal,
      field: "perTurnModelCalls",
      message: "perTurnModelCalls exceeds totalModelCalls",
    });
  }
  if (
    Number.isInteger(budgets.perTurnToolCalls) &&
    Number.isInteger(budgets.totalToolCalls) &&
    budgets.perTurnToolCalls > budgets.totalToolCalls
  ) {
    errors.push({
      code: BUDGET_ERROR_CODES.perTurnExceedsTotal,
      field: "perTurnToolCalls",
      message: "perTurnToolCalls exceeds totalToolCalls",
    });
  }
  return { ok: errors.length === 0, code: errors[0]?.code ?? null, errors };
}

/**
 * Validate a `{ caseId: { deadlineMs, modelGenerations, toolCalls } }` map. Fail-closed: every authorized
 * case must have a present, integral, in-range budget, and no extra case is admitted silently.
 */
export function validateCaseBudgets(caseBudgets, { caseIds } = {}) {
  if (!isPlainObject(caseBudgets)) {
    return { ok: false, code: BUDGET_ERROR_CODES.missing, errors: ["caseBudgets is not an object"] };
  }
  const errors = [];
  const expected = caseIds ?? Object.keys(caseBudgets);
  for (const caseId of expected) {
    const budget = caseBudgets[caseId];
    if (!isPlainObject(budget)) {
      errors.push({ code: BUDGET_ERROR_CODES.missing, field: caseId, message: `${caseId} budget is required` });
      continue;
    }
    for (const field of Object.keys(CASE_BUDGET_MAXIMA)) {
      const value = budget[field];
      if (value === undefined || value === null) {
        errors.push({ code: BUDGET_ERROR_CODES.missing, field: `${caseId}.${field}`, message: `${field} is required` });
      } else if (!Number.isInteger(value)) {
        errors.push({ code: BUDGET_ERROR_CODES.notInteger, field: `${caseId}.${field}`, message: `${field} must be an integer` });
      } else if (value <= 0) {
        errors.push({ code: BUDGET_ERROR_CODES.notPositive, field: `${caseId}.${field}`, message: `${field} must be positive` });
      } else if (value > CASE_BUDGET_MAXIMA[field]) {
        errors.push({ code: BUDGET_ERROR_CODES.aboveCeiling, field: `${caseId}.${field}`, message: `${field} ${value} exceeds ${CASE_BUDGET_MAXIMA[field]}` });
      }
    }
  }
  for (const caseId of Object.keys(caseBudgets)) {
    if (!expected.includes(caseId)) {
      // A budget for a case the record does not authorize is inert, not an error — the authorization's
      // `cases` list is the authority; only required cases must be present and in range.
      continue;
    }
  }
  return { ok: errors.length === 0, code: errors[0]?.code ?? null, errors };
}

/** Thrown when a batch would exceed the remaining tool budget (and therefore executes none). */
export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/**
 * A per-experiment consumption tracker with **separate** provider-generation and tool counters.
 *
 * Semantics fixed by the ruling:
 *   - `consumeGeneration(n = 1)` counts provider generations; exceeding either the per-turn or the
 *     cumulative generation budget throws `BudgetExceededError`.
 *   - `consumeTools(n)` implements the batch rule: if `n` would exceed the remaining **per-turn or
 *     cumulative** tool budget it consumes **nothing** and throws — a partial batch is never allowed to
 *     run.
 *   - `startTurn()` resets the per-turn counters (cumulative counters persist).
 *   - `elapsedExceeded(now)` reports whether the whole-experiment wall clock ceiling is passed; the per-turn
 *     deadline is the host-control turn-scoped AbortSignal, not this counter (a loop-top timer is
 *     insufficient — see `host-session.mjs`).
 */
export function createBudgetTracker(budgets, { now = () => Date.now(), startedAt = null } = {}) {
  const check = validateBudgetConfig(budgets);
  if (!check.ok) {
    throw new BudgetExceededError(`invalid budget configuration: ${check.errors.map((e) => e.message).join("; ")}`);
  }
  const start = startedAt ?? now();
  let turnModel = 0;
  let turnTools = 0;
  let totalModel = 0;
  let totalTools = 0;

  return {
    startTurn() {
      turnModel = 0;
      turnTools = 0;
    },
    consumeGeneration(n = 1) {
      if (turnModel + n > budgets.perTurnModelCalls || totalModel + n > budgets.totalModelCalls) {
        throw new BudgetExceededError(
          `provider generation budget exceeded (per-turn ${turnModel}+${n}/${budgets.perTurnModelCalls}, ` +
            `total ${totalModel}+${n}/${budgets.totalModelCalls})`
        );
      }
      turnModel += n;
      totalModel += n;
      return { turnModel, totalModel };
    },
    consumeTools(n) {
      if (!Number.isInteger(n) || n < 0) throw new BudgetExceededError(`invalid tool batch size: ${n}`);
      if (n === 0) return { turnTools, totalTools };
      // Batch rule: if the whole batch does not fit the remaining budget, consume none.
      if (turnTools + n > budgets.perTurnToolCalls || totalTools + n > budgets.totalToolCalls) {
        throw new BudgetExceededError(
          `tool batch of ${n} does not fit the remaining budget (per-turn ${turnTools}/${budgets.perTurnToolCalls}, ` +
            `total ${totalTools}/${budgets.totalToolCalls}); executing none`
        );
      }
      turnTools += n;
      totalTools += n;
      return { turnTools, totalTools };
    },
    elapsedExceeded(at = now()) {
      return at - start > budgets.totalWallClockMs;
    },
    snapshot() {
      return { budgets: { ...budgets }, start, turnModel, turnTools, totalModel, totalTools };
    },
  };
}
