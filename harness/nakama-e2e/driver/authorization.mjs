/**
 * The owning driver's explicit authorization binding.
 *
 * The host-amendment ruling requires the owning driver authorization to bind: the **amended host
 * identity/diff digest**, the **admitted release/revision/generation**, an **explicit org/profile**,
 * the **provider/exact model**, the **allowed cases/tools**, the **per-turn and whole-experiment
 * budgets**, the **timeout** and the **no-retry** policy. This module is the fail-closed validator for
 * that record, plus the gate that keeps execution shut.
 *
 * Two distinct things, deliberately separated:
 *
 *   - `validateAuthorization(record)` is **pure and offline**. It checks shape and every binding and
 *     returns `{ ok, code, errors }`. A well-formed record validates true — that is what makes the record
 *     reviewable, and what the driver tests exercise.
 *   - `authorizeExecution(record, { hostContract })` is the **gate**. It refuses unless the record grants
 *     execution **and** the amended-host contract is present and its digest matches the record. The
 *     amended host identity/diff digest is owned by the host-control worker and does not exist in this
 *     envelope, so the gate is shut: this function returns `host_contract_unavailable` (a **blocked
 *     seam** the parent integrates once the host-amendment contract lands). No record in this envelope
 *     grants execution at all (`executionAuthorized` is false), and `turn.mjs` additionally keeps
 *     `INFERENCE_AUTHORIZED = false`, so inference stays closed mechanically even if a caller forges a
 *     record.
 *
 * The model binding is deliberately **alias/date-bounded**: `model.identityKind` must be
 * `alias_or_date_bounded` and an `immutableWeightsClaim` is refused. A result may therefore say which
 * requested/reported model identity was used, but it must not claim the immutable underlying weights.
 *
 * The **provider disposition** is a separate decision. The earlier reviewed suitability block is
 * **withdrawn**: the reviewer **accepts operational OpenCode Go first** for this experiment, recorded as
 * `providerDisposition.suitability = "operationally_selected_accepted"`, while the record refuses a silent
 * model/provider substitution and claims **no** service-terms permission (`serviceTermsPermissionClaimed`
 * stays `false`) and requires **no** policy research. The owner's operational selection is recorded by
 * `ownerSelectedOperationalCondition`.
 *
 * Conditions are named explicitly in `PROVIDER_CONDITIONS`: the original accepted `opencode_go` entry is
 * retained immutable (the one-run grant stays un-consumed), and `commandcode_free` is a **separate** free
 * condition pinned to the existing CommandCode `openai_compatible` provider instance. A record names exactly
 * one condition by `provider.condition`; there is no default and no fallback, so an absent/unknown condition
 * (or a mismatched provider block) is refused. This is a proposal, not a grant: `executionAuthorized` stays
 * `false` and inference stays unauthorized.
 */

import { PROPOSED_BUDGETS, PROPOSED_CASE_BUDGETS, validateBudgetConfig, validateCaseBudgets } from "./budgets.mjs";
import { CASE_DISPATCH_ALLOWLIST, CASE_IDS, PERMITTED_POLICY_TOOL_NAMES } from "./cases.mjs";
import { CASE_PROFILE, FIXTURE_PROFILES, PROFILE_KEYS } from "./profiles.mjs";
import { AUTOMATION_REPEATS_CASE, PROMPT_BINDINGS, sha256Utf8 } from "./prompts.mjs";

export const AUTHORIZATION_SCHEMA = "nakama-e2e-driver-authorization-v1";

/**
 * The admitted fixture baseline and plugin identity.
 *
 * BINDING UPDATE (2026-10-07, ordinary update carried under the operator's authorization for the focused
 * scoped `get_topic` acceptance): the fixture was re-installed to the scoped `get_topic` build, so its
 * served release moved to `0.2.0+dev.64a201410338` (revision 28, store generation unchanged). The previous
 * admitted values (`0.2.0+dev.164ccaafbca4` / revision 12) were the pre-scoped zero-inference baseline and now
 * describe the *Layout Demo* org, which is deliberately left untouched. The store generation is unchanged
 * (`g7e6ef07132594080899afb12ad2200cc`), so the data identity the experiment measures is the same; only the
 * served build identity moved. Offline tests reference this object symbolically, so the update is
 * test-stable. This is a binding update, not a relaxation: the generation and the exact release/revision are
 * still pinned and a mismatch still refuses.
 */
export const ADMITTED_FIXTURE = Object.freeze({
  hostBaselineCommit: "945420b6d966ec68c2db8add1c988b8f9c7a11eb",
  pluginRelease: "0.2.0+dev.64a201410338",
  pluginRevision: 28,
  pluginGeneration: "g7e6ef07132594080899afb12ad2200cc",
});

/**
 * The **accepted amended-host identity and digests** — the host-control worker's materialization,
 * recorded in the readiness archive (`…/scratch/nakama-e2e/host-amendment-wire/`) and **served** by the
 * prior review restart (`…/scratch/nakama-e2e/amended-host-restart/`, fixture pid 603708 at
 * `2026-10-05T20:47Z`, amended source mtimes predating process start):
 *
 *   - identity `nakama-host-clean@945420b6+eval-controls+wire-eval-result` (baseline `945420b6…` + the
 *     evaluation-control and wire-eval-result amendments);
 *   - `patchDigest` = sha256 of `HOST-PATCH.diff` (22 files);
 *   - `contractDigest` = sha256 of `CONTRACT.wire-addendum.md`.
 *
 * The earlier restarted fixture served the superseded eval-controls-only `9a58341e…` (19 files); the
 * `amended-host-restart` then restarted the fixture onto this wire-eval-result source, so this identity
 * **was served**. The current work is **driver-only harness source** (`harness/nakama-e2e/driver/`) and
 * needs **no** host restart. The proposed record binds this accepted identity explicitly — never the old
 * `amended-host-unavailable` identity and never an all-zero placeholder — and `authorizeExecution` still
 * refuses without the matching host contract object.
 */
export const ACCEPTED_HOST = Object.freeze({
  identity: "nakama-host-clean@945420b6+eval-controls+wire-eval-result",
  patchDigest: "f33a9de54cb1bf9bd10bbe901a23bd216f55c7696de8e6f664b11e2901503a57",
  contractDigest: "8164105ffda63aec86171add8e5cf497ef70ec6313aa6a8780f7c93e38bcd941",
  served: true,
});

/** The technical provider target. Egress approval is a separate disposition; this is the identity to bind. */
export const PROVIDER_TARGET = Object.freeze({
  name: "opencode-go",
  canonicalModel: "opencode-go/deepseek-v4.1-flash",
  wireModel: "deepseek-v4.1-flash",
});

/** The condition key naming the original accepted OpenCode Go condition. */
export const OPENCODE_GO_CONDITION_KEY = "opencode_go";

/** The condition key naming the separate free condition (CommandCode / openai_compatible). */
export const FREE_CONDITION_KEY = "commandcode_free";

/**
 * The **provider condition table** — the explicitly named conditions a driver authorization may bind.
 *
 * Two things are deliberately kept apart:
 *
 *   - `opencode_go` — the original **accepted** condition. It is byte-identical to `PROVIDER_TARGET` and is
 *     retained **immutable**; the existing Go record and its one-run grant are unchanged and stay
 *     un-consumed.
 *   - `commandcode_free` — a **separate**, explicitly named free condition pinned to the existing CommandCode
 *     provider instance (`openai_compatible`, instance id `34e9435b-af5c-4f8e-884d-31be681f8403`). It is a new
 *     condition, **not** a transfer of the Go grant. `ProviderName` has no `commandcode` member, so the only
 *     host route is the generic OpenAI-compatible path (`createOpenAICompatibleProvider`); the canonical and
 *     wire model id are the custom entry id unchanged (no `provider/` prefix), and the session-bound identity
 *     is `instance.id::modelId`.
 *
 * There is **no** generic provider knob and **no** fallback: a record names exactly one condition by the
 * `provider.condition` key and the rest of its provider block must match that condition's entry byte-for-byte.
 * An absent or unknown condition key is refused (`authorization_provider_binding_invalid`) rather than
 * defaulting to Go.
 */
export const PROVIDER_CONDITIONS = Object.freeze({
  [OPENCODE_GO_CONDITION_KEY]: PROVIDER_TARGET, // retained immutable: the accepted condition's exact bytes
  [FREE_CONDITION_KEY]: Object.freeze({
    name: "openai_compatible",
    label: "CommandCode",
    instanceId: "34e9435b-af5c-4f8e-884d-31be681f8403",
    canonicalModel: "deepseek/deepseek-v4.1-flash",
    wireModel: "deepseek/deepseek-v4.1-flash",
    sessionBoundIdentity: "34e9435b-af5c-4f8e-884d-31be681f8403::deepseek/deepseek-v4.1-flash",
    endpointRoute: "https://api.commandcode.ai/provider/v1/chat/completions",
    wireApi: "chat_completions",
    nativeAdapterExists: false,
    fallbackProvider: null,
  }),
});

/** The condition-specific provider fields the validator pins when the condition entry declares them. */
const CONDITION_PINNED_PROVIDER_FIELDS = Object.freeze(["label", "instanceId", "sessionBoundIdentity", "endpointRoute", "wireApi"]);

export const MODEL_IDENTITY_KIND = "alias_or_date_bounded";

/**
 * The exact marker recording that the owner **selected the provider as an operational condition**. It is a
 * distinct string from any suitability value, so a record cannot satisfy it by claiming the provider was
 * approved.
 */
export const PROVIDER_OWNER_OVERRIDE = "owner_selected_operational_condition";

/**
 * The **provider disposition**, recorded on every proposed record.
 *
 * The reviewer **accepts operational OpenCode Go first** for this experiment: `suitability` is
 * `"operationally_selected_accepted"` (the earlier reviewed suitability block is **withdrawn**, for this
 * experiment only). The record still claims **no** service-terms permission (`serviceTermsPermissionClaimed`
 * is `false`) and performs **no** policy research; the owner's operational selection is recorded by the
 * exact `ownerSelectedOperationalCondition` marker (CommandCode is deferred to a separate later experiment).
 *
 * The disposition pins the run: **no fallback** (`fallbackProvider` is `null`), the **entire sequence is
 * pinned** (`sequencePinned`) and a **failure is terminal with no switch** (`failuresTerminal`). The
 * **reported model identity is recorded when the backend exposes it** (`reportedModelIdentityRecorded`),
 * and **no identical-backend revision claim** is made (`identicalBackendRevisionClaim` must be false; the
 * model binding stays alias/date-bounded). No silent model/provider substitution is permitted.
 *
 * Inference stays unauthorized (`turn.mjs` keeps `INFERENCE_AUTHORIZED = false`) and `executionAuthorized`
 * stays `false`, so this is a proposal, not a grant.
 */
export const PROVIDER_DISPOSITION = Object.freeze({
  suitability: "operationally_selected_accepted",
  ownerSelectedOperationalCondition: PROVIDER_OWNER_OVERRIDE,
  silentSubstitutionPermitted: false,
  fallbackProvider: null,
  sequencePinned: true,
  failuresTerminal: true,
  reportedModelIdentityRecorded: true,
  identicalBackendRevisionClaim: false,
  serviceTermsPermissionClaimed: false,
  reason:
    "the earlier reviewed suitability block is withdrawn: the reviewer accepts operational OpenCode Go first for this experiment, recorded as operationally_selected_accepted, while claiming no service-terms permission (serviceTermsPermissionClaimed stays false) and performing no policy research; the canonical binding is provider opencode-go / canonical model opencode-go/deepseek-v4.1-flash / wire model deepseek-v4.1-flash; the owner recorded the operational selection for the N-1…N-7 sequence (owner_selected_operational_condition) and CommandCode is deferred to a separate later experiment; the full sequence is pinned with no fallback, failures are terminal with no switch, the reported model identity is recorded when the backend exposes it, and no identical-backend revision equivalence is claimed",
});

/**
 * The **separate free-condition provider disposition** (CommandCode / `openai_compatible`).
 *
 * It carries the same *reviewed* operational-acceptance marker shape as the Go disposition (so the validator
 * applies one rule to both), but its own reason and its own condition pin. It is a **separate** condition, not
 * a transfer of the Go grant: no fallback (`fallbackProvider` is `null`), the whole sequence pinned, failures
 * terminal, the reported model identity recorded when the backend exposes it, **no** service-terms permission
 * claimed (`serviceTermsPermissionClaimed` is `false`) and **no** identical-backend revision claim. Inference
 * stays unauthorized, so this is a proposal, not a grant.
 */
export const FREE_PROVIDER_DISPOSITION = Object.freeze({
  suitability: "operationally_selected_accepted",
  ownerSelectedOperationalCondition: PROVIDER_OWNER_OVERRIDE,
  silentSubstitutionPermitted: false,
  fallbackProvider: null,
  sequencePinned: true,
  failuresTerminal: true,
  reportedModelIdentityRecorded: true,
  identicalBackendRevisionClaim: false,
  serviceTermsPermissionClaimed: false,
  reason:
    "separate exploratory condition (the `commandcode_free` key is a historical condition NAME only — no free-tier claim is made): the owner selected the existing CommandCode openai_compatible provider instance 34e9435b-af5c-4f8e-884d-31be681f8403 / canonical model deepseek/deepseek-v4.1-flash / bare wire model deepseek/deepseek-v4.1-flash / endpoint https://api.commandcode.ai/provider/v1/chat/completions, recorded as operationally_selected_accepted; CommandCode has no native host adapter, so the only host route is the generic OpenAI-compatible path; the model is NOT claimed to be free and no cost/rate-tolerance claim is made; no fallback provider, the whole sequence is pinned, failures are terminal with no switch, the reported model identity is recorded when the backend exposes it, no service-terms permission is claimed and no identical-backend revision equivalence is claimed; this is a separate condition, NOT a transfer of the opencode-go one-run grant, and inference remains unauthorized",
});

export const AUTHORIZATION_ERROR_CODES = Object.freeze({
  absent: "authorization_absent",
  notObject: "authorization_not_object",
  schema: "authorization_schema_mismatch",
  host: "authorization_host_binding_invalid",
  hostIdentity: "authorization_host_identity_mismatch",
  hostDigest: "authorization_host_digest_mismatch",
  plugin: "authorization_plugin_binding_invalid",
  org: "authorization_org_binding_invalid",
  profile: "authorization_profile_binding_invalid",
  profiles: "authorization_profiles_binding_invalid",
  caseProfile: "authorization_case_profile_binding_invalid",
  prompts: "authorization_prompt_binding_invalid",
  promptDigest: "authorization_prompt_digest_mismatch",
  promptRepeat: "authorization_prompt_repeat_invalid",
  provider: "authorization_provider_binding_invalid",
  providerSuitability: "authorization_provider_suitability_invalid",
  providerOverride: "authorization_provider_override_invalid",
  providerTermsClaim: "authorization_provider_terms_claim_refused",
  model: "authorization_model_binding_invalid",
  immutableClaim: "authorization_immutable_weights_claim_refused",
  cases: "authorization_cases_invalid",
  allowlist: "authorization_allowlist_invalid",
  budgets: "authorization_budget_invalid",
  retry: "authorization_retry_policy_invalid",
  hostContractUnavailable: "host_contract_unavailable",
  hostContractDigestMismatch: "host_contract_digest_mismatch",
  executionNotGranted: "execution_not_granted",
});

const HEX64 = /^[0-9a-f]{64}$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate an authorization record against every required binding. Pure, offline, fail-closed.
 * Returns `{ ok, code, errors }` where `errors` is a list of `{ code, field, message }`.
 */
export function validateAuthorization(record) {
  const errors = [];
  const fail = (code, field, message) => errors.push({ code, field, message });

  if (record === undefined || record === null) {
    return { ok: false, code: AUTHORIZATION_ERROR_CODES.absent, errors: [{ code: AUTHORIZATION_ERROR_CODES.absent, field: "record", message: "no authorization record" }] };
  }
  if (!isPlainObject(record)) {
    return { ok: false, code: AUTHORIZATION_ERROR_CODES.notObject, errors: [{ code: AUTHORIZATION_ERROR_CODES.notObject, field: "record", message: "authorization is not an object" }] };
  }
  if (record.schema !== AUTHORIZATION_SCHEMA) {
    fail(AUTHORIZATION_ERROR_CODES.schema, "schema", `schema must be ${AUTHORIZATION_SCHEMA}`);
  }

  // host — amended identity + diff digest + the contract digest that binds the host-control worker's output
  const host = record.host;
  if (!isPlainObject(host)) {
    fail(AUTHORIZATION_ERROR_CODES.host, "host", "host binding is required");
  } else {
    if (!isNonEmptyString(host.identity)) fail(AUTHORIZATION_ERROR_CODES.host, "host.identity", "amended host identity is required");
    if (host.baselineCommit !== ADMITTED_FIXTURE.hostBaselineCommit) {
      fail(AUTHORIZATION_ERROR_CODES.host, "host.baselineCommit", `must equal the admitted baseline ${ADMITTED_FIXTURE.hostBaselineCommit}`);
    }
    if (!HEX64.test(host.patchDigest ?? "")) fail(AUTHORIZATION_ERROR_CODES.host, "host.patchDigest", "must be a sha256 hex digest");
    if (!HEX64.test(host.contractDigest ?? "")) fail(AUTHORIZATION_ERROR_CODES.host, "host.contractDigest", "must be a sha256 hex digest");
    // The record must bind the *accepted* amended-host identity/digests — never the old
    // `amended-host-unavailable` identity and never an all-zero placeholder. A moved digest refuses.
    if (host.identity !== ACCEPTED_HOST.identity) fail(AUTHORIZATION_ERROR_CODES.hostIdentity, "host.identity", `must equal the accepted amended-host identity ${ACCEPTED_HOST.identity}`);
    if (host.patchDigest !== ACCEPTED_HOST.patchDigest) fail(AUTHORIZATION_ERROR_CODES.hostDigest, "host.patchDigest", "must equal the accepted host patch digest");
    if (host.contractDigest !== ACCEPTED_HOST.contractDigest) fail(AUTHORIZATION_ERROR_CODES.hostDigest, "host.contractDigest", "must equal the accepted host contract digest");
  }

  // plugin — release/revision/generation
  const plugin = record.plugin;
  if (!isPlainObject(plugin)) {
    fail(AUTHORIZATION_ERROR_CODES.plugin, "plugin", "plugin binding is required");
  } else {
    if (plugin.release !== ADMITTED_FIXTURE.pluginRelease) fail(AUTHORIZATION_ERROR_CODES.plugin, "plugin.release", `must equal ${ADMITTED_FIXTURE.pluginRelease}`);
    if (plugin.revision !== ADMITTED_FIXTURE.pluginRevision) fail(AUTHORIZATION_ERROR_CODES.plugin, "plugin.revision", `must equal ${ADMITTED_FIXTURE.pluginRevision}`);
    if (plugin.generation !== ADMITTED_FIXTURE.pluginGeneration) fail(AUTHORIZATION_ERROR_CODES.plugin, "plugin.generation", `must equal ${ADMITTED_FIXTURE.pluginGeneration}`);
  }

  // org — explicit
  if (!isPlainObject(record.org) || !isNonEmptyString(record.org.id) || !isNonEmptyString(record.org.name)) {
    fail(AUTHORIZATION_ERROR_CODES.org, "org", "an explicit org id and name are required");
  }

  const authorizedCases = Array.isArray(record.cases) ? record.cases.filter((c) => CASE_IDS.includes(c)) : [];

  // profiles — BOTH actual evaluation profiles, with their admitted immutable ids (corrections, item 1)
  const profiles = record.profiles;
  if (!isPlainObject(profiles)) {
    fail(AUTHORIZATION_ERROR_CODES.profiles, "profiles", "both evaluation profile identities are required");
  } else {
    for (const key of PROFILE_KEYS) {
      const bound = profiles[key];
      if (!isPlainObject(bound) || !isNonEmptyString(bound.id)) {
        fail(AUTHORIZATION_ERROR_CODES.profiles, `profiles.${key}`, `an explicit ${key} profile id is required`);
      } else if (bound.id !== FIXTURE_PROFILES[key].id) {
        fail(AUTHORIZATION_ERROR_CODES.profiles, `profiles.${key}.id`, `must equal the admitted fixture id ${FIXTURE_PROFILES[key].id}`);
      }
    }
  }

  // case → profile binding — every authorized case maps to its required profile (N-1…N-5/N-7 readonly, N-6 full)
  const caseProfile = record.caseProfile;
  if (!isPlainObject(caseProfile)) {
    fail(AUTHORIZATION_ERROR_CODES.caseProfile, "caseProfile", "a case → profile binding is required for every authorized case");
  } else {
    for (const caseId of authorizedCases) {
      if (caseProfile[caseId] !== CASE_PROFILE[caseId]) {
        fail(AUTHORIZATION_ERROR_CODES.caseProfile, `caseProfile.${caseId}`, `must bind to ${CASE_PROFILE[caseId]}`);
      }
    }
  }

  // prompts — the exact bytes + sha256 for every authorized case (corrections, item 2)
  const prompts = record.prompts;
  if (!isPlainObject(prompts)) {
    fail(AUTHORIZATION_ERROR_CODES.prompts, "prompts", "the exact prompt text and sha256 are required for every authorized case");
  } else {
    for (const caseId of authorizedCases) {
      const bound = prompts[caseId];
      if (!isPlainObject(bound) || typeof bound.text !== "string" || bound.text.length === 0) {
        fail(AUTHORIZATION_ERROR_CODES.prompts, `prompts.${caseId}`, `an exact UTF-8 prompt text is required for ${caseId}`);
        continue;
      }
      if (!HEX64.test(bound.sha256 ?? "")) {
        fail(AUTHORIZATION_ERROR_CODES.prompts, `prompts.${caseId}.sha256`, "a sha256 hex digest of the exact UTF-8 bytes is required");
      } else if (sha256Utf8(bound.text) !== bound.sha256) {
        fail(AUTHORIZATION_ERROR_CODES.promptDigest, `prompts.${caseId}.sha256`, "the bound sha256 does not match the prompt text");
      }
    }
    // N-7 must be a byte-identical repeat of the designated direct read-only prompt.
    if (authorizedCases.includes("N-7")) {
      const n7 = prompts["N-7"];
      const designated = prompts[AUTOMATION_REPEATS_CASE];
      if (!isPlainObject(n7) || n7.repeatsCaseId !== AUTOMATION_REPEATS_CASE) {
        fail(AUTHORIZATION_ERROR_CODES.promptRepeat, "prompts.N-7.repeatsCaseId", `must designate ${AUTOMATION_REPEATS_CASE}`);
      } else if (!isPlainObject(designated) || designated.text !== n7.text || designated.sha256 !== n7.sha256) {
        fail(AUTHORIZATION_ERROR_CODES.promptRepeat, "prompts.N-7", `must be byte-identical to the designated ${AUTOMATION_REPEATS_CASE} prompt`);
      }
    }
  }

  // provider — resolve the explicitly named condition, then pin the exact target
  const provider = record.provider;
  let boundCondition = null;
  if (!isPlainObject(provider)) {
    fail(AUTHORIZATION_ERROR_CODES.provider, "provider", "provider binding is required");
  } else {
    // No default and no fallback: the condition must be named explicitly and must exist in the table.
    const conditionName = provider.condition;
    boundCondition = typeof conditionName === "string" ? PROVIDER_CONDITIONS[conditionName] ?? null : null;
    if (!boundCondition) {
      fail(
        AUTHORIZATION_ERROR_CODES.provider,
        "provider.condition",
        `provider.condition must name one of ${Object.keys(PROVIDER_CONDITIONS).join(", ")} (an absent or unknown condition is refused; there is no default or fallback)`
      );
    } else {
      if (provider.name !== boundCondition.name) fail(AUTHORIZATION_ERROR_CODES.provider, "provider.name", `must equal ${boundCondition.name}`);
      if (provider.canonicalModel !== boundCondition.canonicalModel) fail(AUTHORIZATION_ERROR_CODES.provider, "provider.canonicalModel", `must equal ${boundCondition.canonicalModel}`);
      if (provider.wireModel !== boundCondition.wireModel) fail(AUTHORIZATION_ERROR_CODES.provider, "provider.wireModel", `must equal ${boundCondition.wireModel}`);
      // Condition-specific pins (provider instance uuid / session-qualified model / endpoint), when declared.
      for (const field of CONDITION_PINNED_PROVIDER_FIELDS) {
        if (boundCondition[field] !== undefined && provider[field] !== boundCondition[field]) {
          fail(AUTHORIZATION_ERROR_CODES.provider, `provider.${field}`, `must equal ${boundCondition[field]}`);
        }
      }
    }
  }

  // provider disposition — the earlier suitability block is withdrawn and the reviewer's exact operational
  // acceptance (`operationally_selected_accepted`) is required, with no silent model/provider substitution.
  // A different suitability value or a substitute-allowed flag refuses.
  const providerDisposition = record.providerDisposition;
  if (
    !isPlainObject(providerDisposition) ||
    providerDisposition.suitability !== PROVIDER_DISPOSITION.suitability ||
    providerDisposition.silentSubstitutionPermitted !== false
  ) {
    fail(
      AUTHORIZATION_ERROR_CODES.providerSuitability,
      "providerDisposition",
      `provider suitability must be marked "${PROVIDER_DISPOSITION.suitability}" (the reviewer's operational acceptance for this experiment) and silent substitution refused`
    );
  }
  // owner operational marker — recorded exactly, as a distinct marker (a bare suitability value alone does
  // not satisfy it), and it must not claim any service-terms permission. It pins the run: no fallback, the
  // entire sequence pinned, failures terminal with no switch, the reported model identity recorded when the
  // backend exposes it, and no identical-backend revision claim.
  if (isPlainObject(providerDisposition)) {
    if (providerDisposition.ownerSelectedOperationalCondition !== PROVIDER_OWNER_OVERRIDE) {
      fail(
        AUTHORIZATION_ERROR_CODES.providerOverride,
        "providerDisposition.ownerSelectedOperationalCondition",
        `must record the owner operational marker "${PROVIDER_OWNER_OVERRIDE}" (the operational acceptance value alone is refused)`
      );
    }
    if (providerDisposition.serviceTermsPermissionClaimed === true) {
      fail(
        AUTHORIZATION_ERROR_CODES.providerTermsClaim,
        "providerDisposition.serviceTermsPermissionClaimed",
        "the owner operational override must not claim any service-terms permission"
      );
    }
    if (providerDisposition.fallbackProvider !== null) {
      fail(AUTHORIZATION_ERROR_CODES.providerOverride, "providerDisposition.fallbackProvider", "no fallback provider is permitted");
    }
    if (providerDisposition.sequencePinned !== true) {
      fail(AUTHORIZATION_ERROR_CODES.providerOverride, "providerDisposition.sequencePinned", "the entire sequence must be pinned");
    }
    if (providerDisposition.failuresTerminal !== true) {
      fail(AUTHORIZATION_ERROR_CODES.providerOverride, "providerDisposition.failuresTerminal", "failures must be terminal (no switch)");
    }
    if (providerDisposition.reportedModelIdentityRecorded !== true) {
      fail(
        AUTHORIZATION_ERROR_CODES.providerOverride,
        "providerDisposition.reportedModelIdentityRecorded",
        "the reported model identity must be recorded when the backend exposes it"
      );
    }
    if (providerDisposition.identicalBackendRevisionClaim === true) {
      fail(AUTHORIZATION_ERROR_CODES.providerOverride, "providerDisposition.identicalBackendRevisionClaim", "an identical-backend revision claim is refused");
    }
  }

  // model — alias/date-bounded; the requested wire id must equal the bound condition's wire model
  const model = record.model;
  if (!isPlainObject(model)) {
    fail(AUTHORIZATION_ERROR_CODES.model, "model", "model binding is required");
  } else {
    const boundWireModel = boundCondition ? boundCondition.wireModel : null;
    if (model.requested !== boundWireModel) fail(AUTHORIZATION_ERROR_CODES.model, "model.requested", `must equal the bound condition's wire model ${boundWireModel}`);
    if (model.identityKind !== MODEL_IDENTITY_KIND) fail(AUTHORIZATION_ERROR_CODES.model, "model.identityKind", `must be ${MODEL_IDENTITY_KIND}`);
    if (model.immutableWeightsClaim === true) {
      fail(AUTHORIZATION_ERROR_CODES.immutableClaim, "model.immutableWeightsClaim", "an immutable-weights claim is refused");
    }
  }

  // cases + per-case effective allowlist
  const cases = record.cases;
  if (!Array.isArray(cases) || cases.length === 0 || !cases.every((c) => CASE_IDS.includes(c))) {
    fail(AUTHORIZATION_ERROR_CODES.cases, "cases", `cases must be a non-empty subset of ${CASE_IDS.join(", ")}`);
  }
  const allow = record.effectiveAllowedCalls;
  if (!isPlainObject(allow) || (Array.isArray(cases) && !cases.every((c) => Array.isArray(allow[c]) && allow[c].length > 0 && allow[c].every(isNonEmptyString)))) {
    fail(AUTHORIZATION_ERROR_CODES.allowlist, "effectiveAllowedCalls", "every authorized case needs a non-empty name allowlist");
  } else {
    // Fail closed against the permitted universe: an allowlist may only name the
    // dashboard actions plus the discovery tool. A platform helper (`sub_agent`,
    // `todo_write`, `ask_user_question`, `org_memory_*`, …) is refused here, and
    // the host refuses it again at bind time.
    const permitted = new Set(PERMITTED_POLICY_TOOL_NAMES);
    for (const caseId of Object.keys(allow)) {
      for (const name of allow[caseId] ?? []) {
        if (!permitted.has(name)) {
          fail(
            AUTHORIZATION_ERROR_CODES.allowlist,
            `effectiveAllowedCalls.${caseId}`,
            `tool "${name}" is not a permitted policy tool (allowed: ${PERMITTED_POLICY_TOOL_NAMES.join(", ")})`
          );
        }
      }
    }
  }

  // budgets — present, integral, within the reviewed ceilings
  const budgetCheck = validateBudgetConfig(record.budgets);
  if (!budgetCheck.ok) {
    for (const e of budgetCheck.errors) fail(AUTHORIZATION_ERROR_CODES.budgets, `budgets.${e.field ?? ""}`.replace(/\.$/, ""), e.message);
  }
  // per-case budgets — every authorized case needs a present, in-range budget
  const caseBudgetCheck = validateCaseBudgets(record.caseBudgets, { caseIds: Array.isArray(cases) ? cases : CASE_IDS });
  if (!caseBudgetCheck.ok) {
    for (const e of caseBudgetCheck.errors) fail(AUTHORIZATION_ERROR_CODES.budgets, `caseBudgets.${e.field ?? ""}`.replace(/\.$/, ""), e.message);
  }

  // no-retry policy is mandatory
  if (record.noRetry !== true) fail(AUTHORIZATION_ERROR_CODES.retry, "noRetry", "noRetry must be true");

  return { ok: errors.length === 0, code: errors[0]?.code ?? null, errors };
}

/**
 * The gate. Refuses unless the record is valid, grants execution, and the amended-host contract is present
 * with a matching digest. With no contract (this envelope) it returns `blocked: true` — the seam the
 * parent integrates once the host-amendment contract exists. It never authorizes a *real* inference run in
 * this envelope, because `turn.mjs` keeps `INFERENCE_AUTHORIZED = false`.
 */
export function authorizeExecution(record, { hostContract = null } = {}) {
  const valid = validateAuthorization(record);
  if (!valid.ok) {
    return { ok: false, blocked: false, code: valid.code, errors: valid.errors };
  }
  if (record.executionAuthorized !== true) {
    return {
      ok: false,
      blocked: false,
      code: AUTHORIZATION_ERROR_CODES.executionNotGranted,
      errors: [{ code: AUTHORIZATION_ERROR_CODES.executionNotGranted, field: "executionAuthorized", message: "no execution grant in this envelope" }],
    };
  }
  if (!isPlainObject(hostContract) || !isNonEmptyString(hostContract.digest)) {
    return {
      ok: false,
      blocked: true,
      code: AUTHORIZATION_ERROR_CODES.hostContractUnavailable,
      errors: [{ code: AUTHORIZATION_ERROR_CODES.hostContractUnavailable, field: "hostContract", message: "amended-host contract is unavailable; the driver cannot bind its identity/patch digest" }],
    };
  }
  if (hostContract.digest !== record.host.contractDigest) {
    return {
      ok: false,
      blocked: true,
      code: AUTHORIZATION_ERROR_CODES.hostContractDigestMismatch,
      errors: [{ code: AUTHORIZATION_ERROR_CODES.hostContractDigestMismatch, field: "hostContract.digest", message: "host contract digest does not match the authorization binding" }],
    };
  }
  return { ok: true, blocked: false, code: null, errors: [] };
}

/**
 * Build a **proposed** authorization record. This is the reviewable artifact the driver expects a real
 * record to look like — it is NOT a grant. `executionAuthorized` defaults to `false`; the host block binds
 * the **accepted amended-host identity and both digests** (never an all-zero placeholder and never the old
 * `amended-host-unavailable` identity), which the prior review restart served; the provider disposition
 * records the reviewer's operational acceptance (`suitability` is `"operationally_selected_accepted"`)
 * **and** the owner's operational marker (OpenCode Go for N-1…N-7; CommandCode later); the org id is the admitted fixture org
 * and the two profile ids are the admitted fixture profile ids (read back from the existing admission
 * artifact, no live write). Tests use it to exercise the validator; the parent copies its shape into the
 * review package. The numeric budgets are approved (see `budgets.mjs`) but approval is not a grant:
 * execution and inference stay unauthorized.
 */
export function buildProposedAuthorizationRecord(overrides = {}) {
  const base = {
    schema: AUTHORIZATION_SCHEMA,
    executionAuthorized: false,
    host: {
      identity: ACCEPTED_HOST.identity,
      baselineCommit: ADMITTED_FIXTURE.hostBaselineCommit,
      patchDigest: ACCEPTED_HOST.patchDigest,
      contractDigest: ACCEPTED_HOST.contractDigest,
    },
    plugin: {
      release: ADMITTED_FIXTURE.pluginRelease,
      revision: ADMITTED_FIXTURE.pluginRevision,
      generation: ADMITTED_FIXTURE.pluginGeneration,
    },
    org: { id: "org_b2b102992b554887b88950efc4239f79", name: "Nakama E2E Fixture" },
    // Both actual evaluation profiles (immutable fixture ids from the admission artifact) and the
    // case → profile binding the reviewer requires (N-1…N-5/N-7 readonly, N-6 full).
    profiles: Object.fromEntries(PROFILE_KEYS.map((key) => [key, { id: FIXTURE_PROFILES[key].id }])),
    caseProfile: { ...CASE_PROFILE },
    // The explicitly named accepted condition (OpenCode Go) and its exact target bytes.
    provider: { condition: OPENCODE_GO_CONDITION_KEY, ...PROVIDER_TARGET },
    // The earlier suitability block is withdrawn: the reviewer's operational acceptance (`suitability` is
    // "operationally_selected_accepted") is recorded together with the owner's operational marker (OpenCode
    // Go for N-1…N-7; CommandCode deferred); no silent
    // model/provider substitution, no fallback, failures terminal. This is a proposal, not a grant.
    providerDisposition: { ...PROVIDER_DISPOSITION },
    model: { requested: PROVIDER_TARGET.wireModel, identityKind: MODEL_IDENTITY_KIND, immutableWeightsClaim: false },
    cases: [...CASE_IDS],
    // The exact prompt bytes + sha256 binding for every case; N-7 repeats N-1 byte-for-byte.
    prompts: Object.fromEntries(
      CASE_IDS.map((id) => {
        const binding = PROMPT_BINDINGS[id];
        return [id, { text: binding.text, sha256: binding.sha256, ...(binding.repeatsCaseId ? { repeatsCaseId: binding.repeatsCaseId } : {}) }];
      })
    ),
    effectiveAllowedCalls: Object.fromEntries(CASE_IDS.map((id) => [id, [...CASE_DISPATCH_ALLOWLIST]])),
    budgets: { ...PROPOSED_BUDGETS },
    caseBudgets: Object.fromEntries(CASE_IDS.map((id) => [id, { ...PROPOSED_CASE_BUDGETS[id] }])),
    noRetry: true,
    // Candid limitations carried with the proposal. These are not claims about verification; they record
    // what this readiness slice can and cannot evidence. A reviewer must read them before granting execution.
    limitations: [
      "REVIEWED LIMITATION (OPTION2, retained): N-7's owned automation dispatches through the host's OpenAPI automation routes (POST /v1/workers/automation/start|stop, POST /v1/automations, POST /v1/automations/{id}/run) as a documented passthrough, rather than being re-expressed behind a new dedicated host endpoint. This was reviewed and accepted to avoid a further host amendment and restart. The passthrough is evidenced offline against the real runtime handler/adapter contract by the existing HTTP adapter tests (the worker/create/run route test and the driver's N-7 wrapper test) and the runAutomation OpenAPI contract assertion; it remains a limitation, not a verified live-host guarantee, until a live run observes it.",
      "the amended host carries its actual EvaluationTurnResult (terminalReason, modelGenerations, toolExecutions, forbidden, historyValid) on the opt-in responses — SendMessageResponse.evaluation, the SSE done/error evaluation and RunAutomationResponse.evaluation — and only when a policy is bound; the driver consumes it strictly and fails closed on a missing/malformed result (no inferred completion), while the client turn timeout is only a backstop after the host-driven deadline",
      "the platform DB (session_messages.payload.toolCalls) remains the authoritative per-turn trace; a pre-dispatch writer denial is detected from the DB trace plus the case allowlist, not from an HTTP field, and the driver reads it by the host-assigned session id",
      "supported-API skill containment is not restart-persistent (every boot re-assigns bundled skills); the driver checks containment before each case and stop-latches on any change, with no automatic recovery and no inference",
      "the numeric envelope is APPROVED (2026-10-06: N-1 3/4/120 s; N-2…N-5 4/6/120 s; N-6/N-7 3/6/120 s; whole experiment 25/40/900 s) but approval is not a grant: executionAuthorized stays false and turn.mjs keeps INFERENCE_AUTHORIZED=false, so no live run is reachable from this record. The org LLM-turn quota of 30 permits thirty provider turns and rejects the 31st; it does not reject the 26th — the driver's own 25-generation envelope refuses the 26th experiment generation. The token quota is preferred unset absent a demonstrated reservation calibration",
      "the host block binds the accepted amended-host identity `nakama-host-clean@945420b6+eval-controls+wire-eval-result` and its patch (f33a9de5…) and contract (8164105f…) digests; this identity was served by the prior review restart (`…/scratch/nakama-e2e/amended-host-restart/`, fixture pid 603708 at 2026-10-05T20:47Z, amended source mtimes predating process start), so the prior accepted served-host evidence remains authoritative; this delta is driver-only harness source and needs no host restart, and authorizeExecution still refuses without the matching host contract object",
      "provider disposition: the earlier reviewed suitability block is withdrawn — the reviewer accepts operational OpenCode Go first for this experiment (`suitability` is `operationally_selected_accepted`) — and the opencode-go / opencode-go/deepseek-v4.1-flash / deepseek-v4.1-flash binding is recorded exactly, no silent model/provider substitution is permitted, and no service-terms permission is claimed and no identical-backend revision is claimed; the owner recorded the operational selection of OpenCode Go for the N-1…N-7 sequence (owner_selected_operational_condition; CommandCode deferred to a separate later experiment), the whole sequence is pinned with no fallback, failures are terminal with no switch, and the reported model identity is recorded when the backend exposes it; inference remains unauthorized (turn.mjs keeps INFERENCE_AUTHORIZED=false), so this record is a proposal, not a grant",
    ],
  };
  return { ...base, ...overrides };
}

/**
 * Build a **separate, explicitly named free-condition** proposed record (CommandCode / `openai_compatible`).
 *
 * This is deliberately **not** a transfer of the OpenCode Go one-run grant: it names its own condition
 * (`commandcode_free`), binds the existing CommandCode provider instance uuid, the exact
 * canonical==wire model id and the endpoint route, and uses the separate free disposition. It reuses the
 * **frozen** gates (prompts/sha256, budgets, profiles, case→profile binding, read gates, no-retry) from the
 * Go base record byte-for-byte, so nothing about the frozen experiment is relaxed. `executionAuthorized`
 * stays `false` (inherited from the base) and inference stays blocked, so this is a **proposal** that needs an
 * explicit separate reviewer run approval — it does not silently open a grant.
 */
export function buildProposedFreeConditionAuthorizationRecord(overrides = {}) {
  const base = buildProposedAuthorizationRecord();
  const freeCondition = PROVIDER_CONDITIONS[FREE_CONDITION_KEY];
  const provider = {
    condition: FREE_CONDITION_KEY,
    name: freeCondition.name,
    label: freeCondition.label,
    instanceId: freeCondition.instanceId,
    canonicalModel: freeCondition.canonicalModel,
    wireModel: freeCondition.wireModel,
    sessionBoundIdentity: freeCondition.sessionBoundIdentity,
    endpointRoute: freeCondition.endpointRoute,
    wireApi: freeCondition.wireApi,
    nativeAdapterExists: freeCondition.nativeAdapterExists,
    fallbackProvider: freeCondition.fallbackProvider,
  };
  const limitations = base.limitations
    .filter((line) => !line.startsWith("provider disposition:"))
    .concat([
      "FREE CONDITION (separate and exploratory; NOT a transfer of the opencode-go one-run grant): the provider condition is `commandcode_free` (a historical condition NAME only; no free-tier claim) — provider openai_compatible / label CommandCode / instance id 34e9435b-af5c-4f8e-884d-31be681f8403 / canonical==wire model deepseek/deepseek-v4.1-flash / session-bound identity 34e9435b-af5c-4f8e-884d-31be681f8403::deepseek/deepseek-v4.1-flash / endpoint https://api.commandcode.ai/provider/v1/chat/completions (POST /chat/completions; wireApi chat_completions). The model is NOT claimed to be free and no cost claim is made. No fallback, no silent substitution, no service-terms permission claimed and no identical-backend revision claim; failures are terminal with no switch",
      "the separate condition runs on the generic OpenAI-compatible transport, which adds no stable session/client header (OpenAI SDK defaults only; no x-opencode-session) — verified offline by injected transport; the model's remote rate/availability tolerance is unmeasured and is not assumed",
      "executionAuthorized stays false and turn.mjs keeps INFERENCE_AUTHORIZED=false; the free condition is a proposal requiring an explicit separate reviewer run approval — it is not silently opened, and the original OpenCode Go record and its one-run grant stay un-consumed",
    ]);
  return {
    ...base,
    proposalKind: "separate_free_condition_binding",
    transferableFromExistingGrant: false,
    provider,
    providerDisposition: { ...FREE_PROVIDER_DISPOSITION },
    model: { requested: freeCondition.wireModel, identityKind: MODEL_IDENTITY_KIND, immutableWeightsClaim: false },
    limitations,
    ...overrides,
  };
}
