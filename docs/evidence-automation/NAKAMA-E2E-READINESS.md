# Nakama E2E inference-readiness gate

## Admitted baseline and authorization

Reviewer verdict: **APPROVE WITH CHANGES**. The reviewer accepts `f134fab0dabb1f9259765a8445ee4f6d663632a6` as the zero-inference preparation checkpoint: **the measurement fixture is admitted; the inference runner is not**. No redo, reseed or rollback is required. The admitted fixture remains on host `945420b6d966ec68c2db8add1c988b8f9c7a11eb`, built plugin `eba605fc779558a34755e8c5dd55e1e42742c1a8`, release `0.2.0+dev.164ccaafbca4`, revision 12, generation `g7e6ef07132594080899afb12ad2200cc`.

The reviewer authorizes bounded inference-readiness preparation, not the smoke. The owner approves OpenCode Go subscription with exact `deepseek-v4.1-flash` and synthetic-data egress when the later inference envelope is approved. No fallback/substitution and no inferred authorization from delegation. Provider configuration/discovery may not generate. Credentials must enter through a secure local mechanism, never chat, logs, repository or review archives. API keys have not been requested or configured at this point.

**Provider and prompt finalization (2026-10-06).** The reviewer **withdraws the earlier suitability block** and **accepts operational OpenCode Go first** for the N-1…N-7 sequence — bound exactly `opencode-go` / `opencode-go/deepseek-v4.1-flash` / wire `deepseek-v4.1-flash` — recorded as `providerDisposition.suitability = "operationally_selected_accepted"`, with **CommandCode deferred to a separate, later experiment**. No service-terms permission is claimed (`serviceTermsPermissionClaimed` stays `false`) and **no policy research** is performed. The owner's selection is recorded by the exact operational marker (`owner_selected_operational_condition`). The whole sequence is pinned with **no fallback**, failures are **terminal with no switch**, the **reported model identity is recorded when the backend exposes it** (no identical-backend revision equivalence claimed), and `executionAuthorized` / `INFERENCE_AUTHORIZED` remain **false** — a proposal, not authorization to run. The N-1…N-7 prompt texts are **reviewer-finalized, frozen before any inference** (`reviewer_specified_frozen_before_inference`; N-1/N-6 unchanged, N-7 an exact byte repeat of N-1); the authorization binds the exact UTF-8 bytes + sha256 and a one-byte difference refuses **before session creation**.

## Required closure before requesting inference

1. Stop the exact owned fixture automation worker persistently and verify it cannot be resurrected for N-1 through N-6. N-7 starts only the owned worker after direct success, permits one manual definition/run, then stops it again.
2. Remove inherited file/web capabilities through supported profile APIs where possible. If residual capabilities cannot be removed, disclose and mechanically sandbox workspace/secrets/egress; post-hoc trace failure is not prevention of side effects. Positive tool-call allowlisting must cover every observed tool, including platform helpers, not only dashboard writers.
3. Replace blocked turn/automation scaffolds with an owning driver. Explicit authorization binds host/plugin baselines, org/profile, provider/model, cases and total budget; no constant flip.
4. Treat each user turn as an atomic measured experiment: identities/pins/snapshot before; exact prompt; answer, ordered trace/arguments and model/usage evidence after; stable pins and logical store comparison. Any missing/malformed trace, disallowed tool, mutation, identity movement, provider mismatch or unknown transport outcome latches a sequence-wide stop. No retries or replacement experiments.
5. Verify enforceable server-side model-generation, individual-tool-call and elapsed-time bounds, including non-streamed automation; a client deadline does not stop an ongoing server generation. Return real host gaps before inference rather than inventing a proxy or weakening the budget.
6. Smoke establishes actual live trace shape before semantic scoring. N-7 stays downstream. `readOnly:true` is not an automation security boundary without source/API proof.
7. Pin requested/reported model identities where exposed; disclose an alias/date-bounded result, not immutable underlying weights.

## Current source findings — not a readiness verdict

The source audit identifies a 100-iteration loop, 200,000-output-token turn threshold, interactive SSE cancellation/deadlines and an org quota hook. These are different units: loop iterations do not necessarily bound individual tool calls; token thresholds may overshoot within a reply; non-streamed automation calls `session.send` without the SSE deadline. A focused audit is checking actual provider retries, tool batching, quota behavior and N-7 cancellation before choosing executable limits.

Supported profile unassignment can remove default file/web tools, but platform todo/question/org-memory groups are injected when a profile has tools. Automation tools have a per-profile flag. Exact effective capabilities require live readback and source tracing, not a nominal three/five assignment count.

Native `opencode_go` configuration and generic OpenAI-compatible transport must be compared for exact model-ID mapping, stable session headers and supported discovery. The public Go docs list `deepseek-v4.1-flash` at `https://opencode.ai/zen/go/v1/chat/completions` and require client identification plus a stable `x-opencode-session`. Public documentation is not authenticated account-availability proof. See https://opencode.ai/docs/go/ .

## Work status

Both delegated jobs completed. Supported fixture APIs stopped the owned automation worker and persisted desired-off; removed six inherited builtins and seven irrelevant skills from each profile; and set profile automation tools off. Parent API readback confirms three/five assigned plugin tools, only research-coordinator, automation disabled, unchanged revision/generation, zero providers and zero sessions/model usage/automation runs. Parent readback confirms persistent worker desired-off; the worker reported PM2 stopped and the process dead. No restart-resurrection experiment was performed. Platform-injected helpers remain, so assignment counts are not total effective capability counts.

The focused source audit found no cumulative individual-tool-call ceiling and no whole-turn cancellation deadline for non-streamed automation. Native OpenCode Go also lacks the documented stable session/client headers and retains the host-prefixed model ID in the wire request. The parent inspected the provider construction/header builder, tool-batch executor and automation send seam to confirm these findings. No authenticated provider request was made; remote tolerance is unknown, not assumed.

Execution-control engineering is therefore blocked pending a bounded host-amendment review. No provider is configured, no owning inference driver is admitted and no inference is authorized. The admitted fixture was not rebuilt, reseeded or rolled back. A top-of-loop elapsed-time check alone would not fix an in-flight hung request: any amendment needs a whole-turn AbortSignal propagated into provider and tool execution, including automation, with deterministic cancellation tests. Post-hoc positive trace allowlisting also cannot prevent residual helper side effects; proposed host pre-dispatch enforcement must be reviewed if needed. The next handoff requests those amendments, not model execution.

## ADDENDUM — wire-evidence closure (latest amended source identity)

The bounded host amendment landed and the last wire-evidence gap is now closed at the **source** level: the
host's actual `EvaluationTurnResult` is carried on the opt-in responses/SSE (`SendMessageResponse.evaluation`,
the SSE `done`/`error` `evaluation`, `RunAutomationResponse.evaluation`), only when a policy is bound, and the
owning driver consumes it strictly (missing/malformed → hard fail closed, never an inferred completion). The
whole-turn deadline stays host-driven; the client timeout is only a backstop. Offline handler-assembly tests
with injected providers/tools cover the JSON reply, the SSE `done` event, a forbidden call and a hung/deadline
abort (see the archive below).

**Identity / served status.** Latest amended identity:
`nakama-host-clean@945420b6+eval-controls+wire-eval-result`, `patchDigest f33a9de5…` (22 files),
`contractDigest 8164105f…`. The earlier restarted fixture served the superseded eval-controls-only
`9a58341e…` (19 files); the **prior review restart then restarted the fixture onto this wire-eval-result
source** (`amended-host-restart`, fixture pid 603708 at `2026-10-05T20:47Z`, amended source mtimes predating
process start), so this identity **was served** and the prior accepted served-host evidence remains
authoritative. The current revision is **driver-only harness source** (`harness/nakama-e2e/driver/`) and
needs **no** host restart (containment is still rechecked before every case). `executionAuthorized` remains
**false** and `INFERENCE_AUTHORIZED` remains **false**. Full (sanitized) record and raw evidence:
`~/.hermes/cache/scratch/nakama-e2e/host-amendment-wire/` (`REPORT.md`, `HOST-PATCH.diff`,
`host-changed-files.txt`, `AUTHORIZATION-RECORD.proposed.json`, `STALE-old-restart-evidence.md`,
`CONTRACT.wire-addendum.md`, test transcripts).
