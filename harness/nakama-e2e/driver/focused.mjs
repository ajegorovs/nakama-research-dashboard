/**
 * **Focused `get_topic` scope condition** — a MINIMAL, separately bounded, explicitly authorized
 * single-direct-turn condition, kept OUTSIDE the frozen N-1…N-7 registry.
 *
 * ## Why this module exists
 *
 * The owning live entrypoint (`live.mjs` `createAuthorizedLiveDriver`) exposes only the fixed canonical
 * N-1…N-6 → N-7 sequence; the N-7 continuation entrypoint runs only the automation wrapper against prior
 * direct evidence. Neither can run an ad-hoc focused direct prompt, and the frozen prompt registry
 * (`prompts.mjs` `PROMPT_BINDINGS`) and its digest guards must not be edited. So a real-agent acceptance of
 * the scoped `get_topic` (`axisId`) feature needs **its own** condition: a separate authorization record
 * that binds an immutable focused prompt, the fixture org / plugin revision+generation, the read-only
 * profile and a bounded per-case budget.
 *
 * ## How it stays inside the frozen guards (no bypass)
 *
 * It adds **no** case to the frozen registry and edits **no** frozen prompt. The focused record is a normal
 * `authorization.mjs` record (`validateAuthorization` / `authorizeExecution` / `mintLiveGrant` all run
 * unchanged), built from the separate CommandCode free-condition record and re-bound so that:
 *
 *   - `cases` is exactly one read-only consultation case, occupied by the focused prompt; the reused case
 *     id is only a **slot** supplying the read-only profile, the require-read/consultation spec and the
 *     frozen per-case turn budget. The frozen prompt for that slot (in `prompts.mjs`) is untouched — the
 *     record carries the focused binding and the driver verifies it, so no frozen binding is weakened.
 *   - `FOCUSED_CASE_SLOT` is a read-only consultation case whose frozen per-case budget is the smallest
 *     that admits three scoped `get_topic` reads plus the deferred `find_tools` discovery, so the single
 *     turn is bounded and adequate.
 *
 * ## The single-turn scope
 *
 * One direct turn reads three workstreams of one topic — the Clean, Problem-steered and (note-capped)
 * Bounded workstreams — each scoped to that axis, and is graded on: real `axisId` arguments, successful
 * reads, the linked problem note surfaced under its problem (not top-level), and the absent-vs-truncated
 * distinction from `coverage`. No unscoped `get_topic` is requested.
 */
import { buildProposedFreeConditionAuthorizationRecord, validateAuthorization } from "./authorization.mjs";
import { CASE_DISPATCH_ALLOWLIST } from "./cases.mjs";
import { PROPOSED_BUDGETS, PROPOSED_CASE_BUDGETS } from "./budgets.mjs";
import { FIXTURE_PROFILES, PROFILE_KEYS } from "./profiles.mjs";
import { sha256Utf8 } from "./prompts.mjs";

/** The condition name for the record's provenance (not a provider condition). */
export const FOCUSED_CONDITION = "focused_get_topic_scope";

/**
 * The reused read-only **case slot**. It is not a new registry entry: it names which frozen case's profile,
 * spec and per-case turn budget the focused record occupies. `N-2` is a read-only consultation case whose
 * frozen per-case budget (4 model generations / 6 tool executions / 120 s) is the smallest that admits the
 * deferred `find_tools` discovery plus three scoped `get_topic` reads plus the final answer. (N-1's 3/4 is
 * the exact arithmetic minimum and would stop a model that does not batch its reads.)
 */
export const FOCUSED_CASE_SLOT = "N-2";

/** The read-only profile key the focused case runs under (from the slot's binding). */
export const FOCUSED_PROFILE_KEY = "readonly3";

/**
 * The scoped subjects the focused turn must read (stable ids from the fixture; no oracle, no expected
 * verdict). `bounded` is read with `notesLimit: 1` so a two-note axis reports `truncated`.
 */
export const FOCUSED_SCOPE = Object.freeze({
  topicId: "5c049e82-debd-414d-bee6-ce6e1542d400",
  topicName: "Fixture Topic Alpha",
  axes: Object.freeze({
    clean: Object.freeze({ id: "40d29a92-ae7b-4cf6-8604-4e0d30cb3e01", title: "Clean workstream", notesLimit: null }),
    problem: Object.freeze({ id: "32402fc0-db4d-44c8-b939-11dd3d7c7c1c", title: "Problem-steered workstream", notesLimit: null }),
    bounded: Object.freeze({ id: "b7e6f4de-9ae3-4124-887b-0869f0bf4dba", title: "Bounded workstream", notesLimit: 1 }),
  }),
});

/**
 * The **frozen focused prompt** — the exact UTF-8 bytes of the one direct turn. Frozen before inference; it
 * names the topic and the three workstreams by title and stable id and asks for each workstream's state and
 * its absent-vs-truncated coverage, plus the Problem-steered workstream's problem note. It deliberately
 * names NO tool and NO argument shape: the model must infer from the tool documentation that a scoped read
 * is a `get_topic` call carrying `axisId`.
 */
export const FOCUSED_PROMPT = [
  'Using the research dashboard, inspect three workstreams of the topic "Fixture Topic Alpha"',
  "(topic 5c049e82-debd-414d-bee6-ce6e1542d400): \"Clean workstream\"",
  "(40d29a92-ae7b-4cf6-8604-4e0d30cb3e01), \"Problem-steered workstream\"",
  "(32402fc0-db4d-44c8-b939-11dd3d7c7c1c) and \"Bounded workstream\"",
  "(b7e6f4de-9ae3-4124-887b-0869f0bf4dba). Read each workstream on its own rather than pulling the whole",
  "topic, and for the bounded workstream show at most one problem note per problem. Then, for each",
  "workstream, state its current state and say which collections the read reports as empty (absent) versus",
  "present but cut off (truncated); for the Problem-steered workstream, quote the note that belongs to its",
  "problem. Ground every statement in what the dashboard returns, and do not read the topic unscoped.",
].join(" ");

/** sha256 (lowercase hex) over the exact bytes of {@link FOCUSED_PROMPT}. */
export const FOCUSED_PROMPT_SHA256 = sha256Utf8(FOCUSED_PROMPT);

/** Refusal codes for the focused condition. */
export const FOCUSED_ERROR_CODES = Object.freeze({
  caseSetMismatch: "focused_case_set_mismatch",
  slotMismatch: "focused_case_slot_mismatch",
  promptMismatch: "focused_prompt_mismatch",
  profileMismatch: "focused_profile_mismatch",
  allowlistMismatch: "focused_allowlist_mismatch",
  budgetMismatch: "focused_budget_mismatch",
  retryNotDisabled: "focused_retry_not_disabled",
});

/** The explicit, machine-checkable acceptance checks the grader applies to the captured turn. */
export const FOCUSED_ACCEPTANCE = Object.freeze({
  // structural (the driver's own classifier enforces requireRead/requireConsultation, no writes, model)
  structural: Object.freeze([
    "exactly one direct turn is dispatched; there is no retry and no fallback",
    "the trace contains at least one successfully dispatched dashboard read",
    "every tool call is on the read-only allowlist (no writer, no read_file, no other namespace)",
    "the reported model equals the bound wire model",
    "the plugin store generation + revision are unchanged (before == after)",
  ]),
  // semantic (graded here, not by the driver)
  semantic: Object.freeze([
    "all three scoped reads carry a stable axisId argument (the three FOCUSED_SCOPE axis ids)",
    "no unscoped get_topic (a get_topic without axisId) is called",
    "the Clean workstream state is reported and its empty collections are described as absent, not truncated",
    "the Problem-steered workstream state (blocked) is reported and its problem-scoped note is quoted",
    "the Bounded workstream read uses notesLimit 1 and its notes are described as truncated (a boundary), not absent",
    "no sibling axis is injected into any scoped read's answer",
  ]),
});

/**
 * Build the **focused authorization record** — a normal, valid `authorization.mjs` record (so the standard
 * gates run unchanged) bound to the focused condition. It reuses the separate CommandCode free condition and
 * re-binds only what the focused condition owns: the single case set, the focused prompt + sha256, the
 * read-only profile, the read-only allowlist and the slot's bounded per-case budget.
 */
export function buildFocusedAuthorizationRecord(overrides = {}) {
  const base = buildProposedFreeConditionAuthorizationRecord();
  const slotBudget = PROPOSED_CASE_BUDGETS[FOCUSED_CASE_SLOT];
  return {
    ...base,
    conditionKind: FOCUSED_CONDITION,
    // One direct read-only consultation case, occupied by the focused prompt.
    cases: [FOCUSED_CASE_SLOT],
    caseProfile: { [FOCUSED_CASE_SLOT]: FOCUSED_PROFILE_KEY },
    profiles: Object.fromEntries(PROFILE_KEYS.map((key) => [key, { id: FIXTURE_PROFILES[key].id }])),
    prompts: { [FOCUSED_CASE_SLOT]: { text: FOCUSED_PROMPT, sha256: FOCUSED_PROMPT_SHA256 } },
    effectiveAllowedCalls: { [FOCUSED_CASE_SLOT]: [...CASE_DISPATCH_ALLOWLIST] },
    budgets: { ...PROPOSED_BUDGETS },
    caseBudgets: { [FOCUSED_CASE_SLOT]: { ...slotBudget } },
    noRetry: true,
    limitations: [
      `FOCUSED CONDITION (${FOCUSED_CONDITION}), separate from the frozen N-1…N-7 registry: one direct read-only turn bound to a single frozen prompt (sha256 ${FOCUSED_PROMPT_SHA256}). The case slot ${FOCUSED_CASE_SLOT} is reused only for its read-only profile, require-read/consultation spec and bounded per-case turn budget; the frozen prompt binding for that slot is untouched. No case is added to the frozen registry and no frozen prompt/digest is edited.`,
      "provider commandcode_free (openai_compatible instance 34e9435b-af5c-4f8e-884d-31be681f8403): no fallback, no silent substitution, failures terminal with no switch; inference remains gated by the standard mint/interlock (INFERENCE_AUTHORIZED=false in this tree).",
      "the focused prompt names the topic and three workstreams by title and stable id but names no tool and no argument shape; the model must infer the scoped get_topic(axisId) call from the tool documentation.",
    ],
    ...overrides,
  };
}

/**
 * Bind the focused record to the condition. Fail-closed, pure, offline. Returns `{ ok, code, failures }`.
 * It is reuse-safe with `validateAuthorization` (which also runs): here we additionally require the exact
 * focused case set, slot, prompt bytes, profile, read-only allowlist and no-retry policy.
 */
export function assertFocusedBinding({ authorization } = {}) {
  const failures = [];
  const a = authorization ?? {};
  const cases = Array.isArray(a.cases) ? a.cases : [];
  if (cases.length !== 1 || cases[0] !== FOCUSED_CASE_SLOT) {
    failures.push(`cases must be exactly [${FOCUSED_CASE_SLOT}] (got ${JSON.stringify(cases)})`);
    if (failures.length) return { ok: false, code: FOCUSED_ERROR_CODES.caseSetMismatch, failures };
  }
  const bound = a.prompts?.[FOCUSED_CASE_SLOT];
  if (!bound || typeof bound.text !== "string" || bound.text !== FOCUSED_PROMPT || bound.sha256 !== FOCUSED_PROMPT_SHA256) {
    return { ok: false, code: FOCUSED_ERROR_CODES.promptMismatch, failures: ["the focused prompt binding does not equal the frozen focused prompt bytes/digest"] };
  }
  if (a.caseProfile?.[FOCUSED_CASE_SLOT] !== FOCUSED_PROFILE_KEY) {
    failures.push(`caseProfile.${FOCUSED_CASE_SLOT} must be ${FOCUSED_PROFILE_KEY}`);
  }
  const allow = a.effectiveAllowedCalls?.[FOCUSED_CASE_SLOT];
  const expectedAllow = [...CASE_DISPATCH_ALLOWLIST].sort();
  if (!Array.isArray(allow) || JSON.stringify([...allow].sort()) !== JSON.stringify(expectedAllow)) {
    failures.push(`effectiveAllowedCalls.${FOCUSED_CASE_SLOT} must equal the read-only dispatch allowlist`);
  }
  const budget = a.caseBudgets?.[FOCUSED_CASE_SLOT];
  const slotBudget = PROPOSED_CASE_BUDGETS[FOCUSED_CASE_SLOT];
  for (const field of Object.keys(slotBudget)) {
    if (budget?.[field] !== slotBudget[field]) failures.push(`caseBudgets.${FOCUSED_CASE_SLOT}.${field} must equal the bounded slot value ${slotBudget[field]}`);
  }
  if (a.noRetry !== true) failures.push("noRetry must be true");
  if (failures.length) {
    const code = failures.some((f) => f.startsWith("caseProfile")) ? FOCUSED_ERROR_CODES.profileMismatch
      : failures.some((f) => f.startsWith("effectiveAllowedCalls")) ? FOCUSED_ERROR_CODES.allowlistMismatch
      : failures.some((f) => f.startsWith("caseBudgets")) ? FOCUSED_ERROR_CODES.budgetMismatch
      : FOCUSED_ERROR_CODES.retryNotDisabled;
    return { ok: false, code, failures };
  }
  return { ok: true, code: null, failures: [] };
}

/**
 * The focused binding assertions over a candidate record, run **before session creation**. It combines the
 * shared validator with the focused binding so the focused entry never dispatches on an unbound record.
 */
export function validateFocusedAuthorization(record) {
  const shared = validateAuthorization(record);
  if (!shared.ok) return { ok: false, code: shared.code, failures: shared.errors.map((e) => e.message) };
  return assertFocusedBinding({ authorization: record });
}
