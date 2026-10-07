# Agent consultation and focused retrieval — stage report

**Repository:** `nakama-research-dashboard` (`f134fab0dabb1f9259765a8445ee4f6d663632a6`, working tree **dirty**, uncommitted)
**Date:** 2026-10-07 · **Scope:** provider failures → harness fixes → bounded direct/automation runs → the scoped `get_topic` product feature → one real-agent acceptance
**Stage boundary:** no commit, push, merge, host restart or product-UI edit. Fixture deployments did occur during the stage; compiling this report performed no deployment or inference. This page is written for a reader with only a clone; it carries labels, synthetic fixture identifiers and build hashes, never live endpoints, hostnames or machine paths.

> **Reading note on evidence.** Every measured value below is quoted from a preserved artifact; the exact absolute locations and SHA-256 digests live in the **local** evidence index under `.hermes/scratch/stage-review/` (git-ignored). Claims that are a reviewer's *subjective* judgement are labelled as such; the harness's own verdict is *structural*, and the two are kept apart throughout.

**See also:** [product decision §16 (`get_topic` scoping)](../ux-v2/DECISIONS.md) · [harness README](../../harness/nakama-e2e/README.md) · [evidence-automation decisions](../evidence-automation/DECISIONS.md) · [contributor guidance (`AGENTS.md`)](../../AGENTS.md).

---

## 1. Executive summary

**Stage close: QUALIFIED.** The stage did what it set out to do — the agent-consultation blocker was diagnosed from host source and worked around without touching the host, the retargeted provider produced a real, grounded, multi-tool dashboard consultation, and the new scoped-`get_topic` product feature passed a real model-in-the-loop acceptance. It is qualified, not clean, because three things are honestly open: the N-7 automation trace is unpersisted (host succeeded, harness could not read it), the public-record guard — red at first draft on a **pre-existing** identity-bearing path — is now **green** (§10), and the work is **uncommitted** with no merge gate run to completion.

**Five distinct live invocations were dispatched across the stage** (never retried, never replayed, never fallen back):

| # | Condition | Invocations | Host model generations | Host tool executions | Outcome |
|---|---|---|---|---|---|
| 1 | Ling/CommandCode (historical) | 1 sequence | 2 | 1 | terminal provider **HTTP 429** |
| 2 | DeepSeek/CommandCode (first attempt) | 1 sequence | 1 | 0 | model called **forbidden `read_file`** → refused pre-dispatch |
| 3 | Skillfix (deepseek, direct N-1…N-6) | 1 sequence | 19 | 17 | N-1…N-6 **structurally ok**; N-7 install refused |
| 4 | N-7-only live continuation | 1 automation | *unknown* | *unknown* | host **SUCCESS**, harness `missing_trace` |
| 5 | Focused scoped `get_topic` | 1 direct turn | 3 | 5 | **accepted** (structural + subjective) |

Counters are the host's own `EvaluationTurnResult` for each invocation (or the run's recorded aggregate); **no retry, fallback, replay, provider switch or API restart occurred in any invocation**. Invocation 4's generation/tool counts are recorded as **unknown (null)** — not assumed — because the host does not persist automation traces.

**What is proven:** the skill-loading/evaluation-dispatch contradiction is real and source-proven; delivering guidance through the profile `systemPrompt` with the skill unassigned removes it *for these fixture profiles* (a fixture-scoped workaround, §4.3 — **not** a verified host fix); the retargeted model consults the dashboard with real `find_tools` + `get_topic` calls and grounded answers; the scoped read works model-in-the-loop with stable `axisId`s and correct absent-vs-truncated separation.

**What is *not* proven:** N-7's answer is grounded but its tool-call order and generation count were never captured (an unpersisted ephemeral session), so N-7 consultation is *evidenced by grounded content*, not by a tool trace — the host `SUCCESS` is a run status, **not** a proven tool path; the automation wrapper's driver classification is `missing_trace`, not a semantic verdict; and the semantic judgment of the direct answers is a subjective agent review, **not** a formal score.

---

## 2. Objectives and non-goals

**Objectives**
1. Explain why a real agent could not consult the research dashboard in the fixture evaluation, and fix the harness/fixture (not the host) so it can.
2. Retarget the evaluation to a working provider/model after the free-condition provider failed, without substituting silently.
3. Run a bounded, guarded, single-shot agent sequence (direct cases + the N-7 automation wrapper) and account honestly for what each returned.
4. Implement, test and deploy the scoped-`get_topic` product change (`axisId` + per-collection `coverage`), preserving the legacy topic-wide contract byte-shape, with **no UI change**.
5. Run **one** real-agent acceptance of the scoped read and grade it against explicit checks.

**Non-goals (stated, and honoured)**
- No product-UI edit; no commit, push, merge or release; no host restart or host source change.
- No replay or forging of preserved direct evidence; no standalone N-7 under the *existing* contract (it cannot); no live N-7 under a *new, unreviewed* route without a fresh authorization.
- No growth of an ad-hoc evaluation framework inside the plugin repo; no evidence-ingestion pipeline.
- No inference during the offline stages (semantic review, corrective record, contract finding, deployment read-backs).

---

## 3. Chronological run ledger

### 3.1 Distinct live invocations

**Invocation 1 — Ling/CommandCode (historical; `nakama-ling-commandcode-next-run-20261006T131654Z`).**
Condition `commandcode_free` (a historical name only — the model is not claimed free); provider `openai_compatible` instance, wire model `inclusionai/ling-3.1-flash:free`. **One** sequence invocation, improved provider-error capture, no availability probe. N-1 dispatched once → CommandCode answered **HTTP 429 `rate_limit_error`** ("Upstream model provider is temporarily unavailable"), host `terminalReason: provider-error`, `modelGenerations 2`, `toolExecutions 1`, **no ordered trace persisted** (`empty_trace`) → zero semantic evidence. N-7 skipped; grant consumed. The 429 is **read from the host runtime log** by byte-offset window (window sha256 `4bd44068…`), not derived. A pre-existing **ERRATUM** retracts the label `providerDispatchAttempts` (≠ generations). **Chronology scope (corrected — §10):** this entry is the **later** `next-run` package. Two **earlier, separate** Ling packages exist and are *not* collapsed into it — `nakama-ling-commandcode-bound-session-run` (2026-10-06 13:10–13:17: N-1 `modelGenerations 3` / `toolExecutions 3`, `provider-error`, `empty_trace`; the package the standalone ERRATUM speaks for) and `nakama-ling-commandcode-fresh-process-run` (2026-10-06 11:50: preflight mismatch, **no inference dispatched**). The three carry different counters and are distinct artifacts; the evidence index (§local `.hermes/scratch/stage-review/`) now indexes all three.

**Invocation 2 — DeepSeek/CommandCode, first attempt (`nakama-deepseek-commandcode-next-run-20261006T210251Z`).**
Same harness, model repinned to `deepseek/deepseek-v4.1-flash` via the supported `PUT /v1/profiles/:id` (readback confirmed). **One** sequence invocation. The model **reached the model** (unlike invocation 1) and answered with `modelGenerations 1`, `toolExecutions 0`, `terminalReason: forbidden-tool`: its first act was to call **`read_file` on its own SKILL.md**, which the evaluation allowlist (`EVALUATION_PERMITTED_TOOL_NAMES`) refuses **pre-dispatch**. N-2…N-6 did not run; N-7 skipped; grant consumed. No provider error (`available:false`, honest absence). This is the fault the fix downstream targets.

**Invocation 3 — Skillfix, direct N-1…N-6 (`nakama-skillfix-commandcode-20261006T221129Z/run`).**
Fix applied (guidance delivered via profile `systemPrompt`; the deliberately-named `research-coordinator` skill **unassigned**, so containment expects `skills: []`). **One** fresh bounded sequence, no retry/fallback/model/provider switch, **no host/API restart**. Result: `directOk true`; **N-1…N-6 structurally ok** (real model turns, real dashboard reads via `find_tools` + `get_topic`, zero forbidden calls, **zero `read_file` attempts**, no store mutation). Per-case (gen / tool-exec): N-1 3/3, N-2 3/2, N-3 3/3, N-4 3/3, N-5 4/3, N-6 3/3 → **19 generations / 17 tool executions**. **N-7 was refused** at definition install with *"Automations are disabled for this profile"* (a pre-existing fixture gap) — a refused install, **no inference**.

**Invocation 4 — N-7-only live continuation (`nakama-n7-live-20261007/run`).**
The existing contract cannot run N-7 alone (it exposes only `runAuthorizedSequence`), and binding preserved direct successes would require a broader source change; a narrowly-scoped, digest-bound N-7-only continuation was written and offline-tested, then run **once** live (the scoped temporary-automationsEnabled window opened and restored in a `finally`). The definition **installed**, the owned worker started and stopped once, exactly one install and one run. **Host outcome: SUCCESS** — automation run `status: completed`, `error: null`, 2185-char grounded answer over ~8.7 s; the org's provider turn counter advanced at the run's completion. **But the harness classified it `missing_trace`**: the host's automation run uses an **ephemeral in-memory agent session** that persists no trace rows, and the harness's trace-read addresses the automation id. Consequence: **tool names and generation counts for N-7 were NOT captured** (recorded `null`, not guessed). The direct cases were **not** replayed (`replayedDirectCases: []`); the preserved direct evidence was bound by immutable digest.

**Invocation 5 — Focused scoped `get_topic` acceptance (`nakama-focused-live-20261007/run`).**
Condition `focused_get_topic_scope`, one guarded direct turn, model wire id `deepseek/deepseek-v4.1-flash`, `noRetry: true`. Result: `terminalReason: completed`, **`modelGenerations 3`, `toolExecutions 5`, `forbidden: null`**, driver `ok: true`. The model called `find_tools ×2` then exactly **three `get_topic` reads each carrying a stable `axisId`** (the third with `notesLimit: 1`), made **no unscoped `get_topic`**, and grounded an answer separating `absent` from `truncated`. Store snapshot hash identical before/after. **Accepted** (see §6).

### 3.2 Offline stages (no inference)

| Stage | Artifact(s) | What it establishes |
|---|---|---|
| Semantic review | `SEMANTIC-REVIEW.md` | **Subjective** independent agent review of the invocation-3 answers; not a human reviewer verdict; N-2…N-6 "strong pass", no factual error found |
| Corrective record | `CORRECTIVE-RECORD.md` | Corrects three overclaims in the invocation-3 report (see §4.6) |
| N-7 contract finding | `CONTRACT-FINDING.md` | Source-proves the existing contract cannot run N-7 alone |
| Deployment + read-backs | fixture `evidence/get-topic-scope-20261007/*.json` | Pre/post serialized action calls for the scoped read; no inference |
| Independent implementation review | `get-topic-review-20261007/REVIEW.md` | Runs the real suites, reads the source; PASS with one semantics note |

---

## 4. Root causes, fixes and the safety model

### 4.1 Root cause A — the skill composer emits an **unconditional** `read_file` directive
Source-proven offline (not asserted). The pinned host skill composer emits, for **every** skill it discovers for a profile, a `read_file` loading directive in two places: the skills-catalog line (always in the system prompt) and the `location` line of the matched-skills prompt (always emitted, **even when the body is included**). `include-body-on-match: true` controls only the body and the `loading` line, **not** the `location` line or the catalog line. The evaluation allowlist is a **positive name allowlist** that excludes `read_file` and validates pre-dispatch, so the directive terminally fails the case. An offline regression reproduces the defect and proves no `read_file` appears when no skill is assigned.

### 4.2 Root cause B — contradictory state between delivery and dispatch
The fixture delivered the coordinator guidance as an **assigned skill** while the evaluation refused the tool the skill's own loading directive demanded. The fix is at the fixture, not the host.

### 4.3 Fix (fixture-scoped, supported API, no host edit, no restart)
- Deliver the coordinator's full guidance through each fixture profile's **`systemPrompt`** (`PUT /v1/profiles/:id`) — the normal host context the model always receives — including the `find_tools` discovery path and an explicit instruction not to call `read_file`.
- **Unassign** the skill from both fixture profiles so the composer emits neither contradictory directive; `read_file` **stays blocked** (read-only safety preserved and widened).
- Containment's expected skill set becomes empty (`skills: []`), documented; plugin revision/generation, org, provider/model, tool sets, worker desired-off and the demo store are unchanged.
- **What the shipped skill body could not fix (disclosed):** the product skill body already carries the loading instruction; the contradiction originates in the composer, so *no skill-body edit can remove it*. The standing, permanent fix is a one-line **host** change (make the `location`/catalog `read_file` directive conditional on the body not being included), which needs a host restart and is out of scope here. The delivered workaround is the profile-`systemPrompt` + `skills: []` path above.

### 4.4 Fix — the N-7 continuation route
Added a narrowly-scoped, digest-bound N-7-only continuation (`n7-continuation.mjs` + a live entrypoint) that binds preserved direct evidence by an **immutable sha256 digest** of its normalized rows, re-checks model / per-case prompt digests / plugin revision+generation / org / N-7 profile binding, re-runs the **existing** guards, then delegates the single turn to the driver's own `runAutomationCase`; it exposes **no** direct-case runner. Offline tests (11) prove the gates shut with zero HTTP on the real tree, the sandbox positive run binds the digest and restores the flag in a `finally`, a second invocation is refused, and red controls fail closed.

### 4.5 Fix — the focused scoped-topic route
The live entrypoints were fixed, digest-bound sequences with **no seam for an ad-hoc prompt**. A new, separately-tested, gated single-case live entry was authored for the scoped read: it re-asserts the frozen prompt's sha256 and the plugin pin before login, runs both owning gates before any HTTP, spawns a fresh child after the on-disk interlock flip, and reverts the flip in a `finally`. It **reused the driver's case slot named "N-2"** as a container for one bounded turn — it is **not** the frozen historical N-2 (the "Contested workstream" case): no case was added to the frozen N-1…N-7 registry and no frozen prompt/digest was edited.

### 4.6 Corrections to known overclaims (all preserved originals unchanged)
1. **"N-1…N-6 all PASSED" conflated structural and semantic verdicts.** The driver's `ok` is *structural* (consultation present, ≥1 dispatched read, all calls allowlisted, model matches, store unchanged); it does **not** score answer content. The `semanticScored` flag is a **case label, not a scoring result**. Semantic quality is a *separate, subjective* assessment, reported in `SEMANTIC-REVIEW.md`; it was not part of the run and cannot be inferred from a structural pass.
2. **"sessions 5→12 / messages 9→56" is an unsupported baseline.** The preserved pre-flight read records **6 / 14** and the post-run read **12 / 56**, so the run's own delta is **+6 sessions / +42 messages (6→12, 14→56)**. The report's before-values match no preserved artifact.
3. **N-7 attribution** (install refused because `automationsEnabled: false`) is **confirmed from host source** (a 403 throw in the automation service), i.e. *diagnosed*, not inferred.
4. **Coverage `limit` semantics imprecision** (from the independent review): `coverage.limit` is a collection cap only for `history`/`notes`; for `evidence` it caps each **source** and for `problemNotes` each **problem**, so `returned` can exceed `limit`. `absent`/`total`/`truncated` are all correct. This is the drift the `limitScope` field later names explicitly (§6).
5. **A readback helper targeted `orgs[0]`** and therefore reported the wrong org on a multi-org account; the run's own readback pins the org id and is correct. Any helper meaning "the fixture org" must pin the org id.
6. **"Layout Demo untouched" is imprecise.** The build **identity** (`selectedVersion`) was restored exactly, but `rev` is a monotonic per-org counter and **moved 12→20** during the mis-deploy/restore cycle (§7). The bytes are restored; the revision counter is not "untouched".

### 4.7 Safety and authorization model (unchanged, upheld)
- **Owning gates run before session creation**, inside the grant mint (`authorizeExecution` → `assertInferenceAuthorized`); a refusal performs **zero HTTP**.
- **Fresh-process discipline:** no turn-transitive module is imported before the on-disk interlock flip; the guarded child is spawned fresh afterwards; the flip is reverted in a `finally` and the interlock sha restored to its original value.
- **Single-shot per grant**; the run token is claimed once; retries/fallbacks/replays are refused by contract, not merely unused.
- **Exact containment** rechecked before every case and after each run; the plugin store snapshot hash and counts are compared before/after; the worker is desired-off and stopped.
- **The API and UI processes were never restarted** in any invocation (same pids throughout).
- **Sanitisation:** no credential values, keys, cookies or `Authorization` headers anywhere; key names/booleans only; endpoints loopback or synthetic `example.com`.

---

## 5. The product change — scoped `get_topic`

### 5.1 Contract (`docs/ux-v2/DECISIONS.md` §16)
`get_topic` gains an **optional stable `axisId`**:
- **Absent** → the topic-wide detail, **byte-shape unchanged**: no new top-level key, and problem objects still carry **no** `notes`. `axisTitle` is deliberately not accepted — the scoped read names a stable id. (A latent `axisTitle` branch exists at the boundary but is unreachable through the schema's `additionalProperties: false`.)
- **Present** → the read is a **workstream**: `{ ok, generatedAt, topic, axisId, axis, coverage }`. `axis` is that axis in full — state and confidence, evidence, its own history and notes, its plan, and its problems each with their own problem-scoped `notes`. **Sibling axes are never built**, so another axis's note cannot leak into the answer, and a problem-scoped note is not duplicated into the axis's note list.
- **Coverage is explicit per collection:** `coverage.<evidence|history|notes|problemNotes>` = `{ limit, limitScope, returned, total, truncated, absent }`. `limitScope` names what `limit` bounds — `collection` for `history`/`notes` (`returned <= limit`), **`per-source`** for `evidence` (`EVIDENCE_ITEM_LIMIT` caps each source; `returned` is a bounded sum that can exceed `limit`), **`per-problem`** for `problemNotes` (`notesLimit` caps each problem; `returned` is a sum). `absent` (empty) and `truncated` (`total > returned`) are separate facts, so a missing row is never read as an omitted one. The `notes` total **excludes** problem-scoped notes (counted under `problemNotes`).
- **Scoped option applicability (explicit):** under `axisId` **only `historyLimit` and `notesLimit` apply**; `includeAnnotations`, `activityLimit` and `activitySinceDays` are accepted by the schema but **ignored** (no effect) — documented, not silently implied supported.
- **Validation:** the action boundary resolves the axis and refuses an unknown id (`Axis not found.`) or one belonging to another topic (`Axis does not belong to this topic.`), both `invalid-input`; the store repeats the check as a public seam.

### 5.2 Landed surface
`src/store.ts` (`getAxisWorkstream`, `collectionCoverage`, coverage types), `src/actions.ts` (the `axisId` branch + `resolveAxis`), `nakama.plugin.json` (the `axisId` input + model-facing description), the shipped `skills/research-coordinator/SKILL.md`, and harness `API-LIMITS.md`/`limits.mjs`; with action tests. **UI unchanged** (`ui/app.js` sha256 `41e61ef5…`, identical pre/post).

### 5.3 Tests and live checks
- Current (re-run for this report on the dirty tree): **`bun test src` → 312 pass / 0 fail** (1602 expects, 13 files); **`bun test harness/nakama-e2e` → 262 pass / 0 fail** (1007 expects, 11 files); `bun run typecheck` clean.
- Fresh `bun build ./src/actions.ts` sha256 equals the committed bundle `actions/actions.js` (`25900ac1…`) → built output in sync with `src` and with the served fixture bundle.
- Live serialized action calls (the same host action boundary a tool call uses) confirm: scoped keys; the problem-scoped steering note surfaced under its problem; an empty axis reports all collections `absent: true`; an unknown/foreign axis refused; `notesLimit: 1` on a 2-note axis → `{limit:1, returned:1, total:2, truncated:true}`; the unscoped read keeps its legacy keys and its problems carry no `notes`.
- **Host typecheck nuance:** `bun run typecheck:host` reports diagnostics by file origin — only files **in this repository** fail the run; diagnostics inside the host checkout's own files are counted and printed but do not fail (they are an artifact of applying the plugin's compiler settings to host sources). The recorded run showed **0 repository diagnostics**; "0 diagnostics" is therefore a *scoped* claim, not a statement that the host checkout is diagnostic-free.

### 5.4 Acceptance — the three verdicts kept distinct
- **Structural (driver):** invocation 5 `ok: true`, `codes: []` — a dashboard read was dispatched, every call allowlisted, the bound model reported, the store unchanged.
- **Subjective (semantic):** invocation 3's answers were reviewed by an independent **agent** against fixture ground truth and judged strong (no factual error), labelled subjective — an agent judgment, not a human reviewer verdict.
- **Explicit acceptance (invocation 5):** graded against per-check criteria (S1–S5 structural, M1–M6 semantic-behavioural), all pass.

**Acceptance scope and disclosures:**
- The acceptance used a **scoped prompt that supplied the topic and the three axis ids explicitly** — the model was *not* asked to discover the ids. It is an acceptance of the *scoped read behaviour*, not of id discovery.
- **Wording-vs-mechanism discrepancy (disclosed):** the prompt's bounded clause read *"show at most one problem note per problem"*, but the observed cap landed on the **axis's own `notes` collection** (`notesLimit: 1` on a 2-note axis → `truncated: true`), not on problem-scoped notes. The model handled it correctly; the prompt wording is looser than the mechanism it exercised.
- Excerpts (verbatim, sanitized): the Clean workstream reported `notes` **absent (empty)** with *"Nothing is truncated here"*; the Problem-steered workstream reported `blocked` (inferred) and quoted its problem-scoped note *"Synthetic problem-scoped steering that get_topic never returns."*; the Bounded workstream reported `notes` **"present but truncated — returned 1 of 2"**, closing with *"the only truncation across the three is the Bounded workstream's `notes`."*
- **Model error vs technical boundary:** none of either — no wrong-tool call, no bad axis id, no unscoped read, no absent/truncated confusion; no guard, budget, deadline or containment gate fired.

---

## 6. Deployment incident — the wrong org was rebound first

`harness/reinstall-plugin.mjs` resolves the target org as **`orgs[0]`**. On this multi-org account `orgs[0]` is the **Layout Demo** organization, not the fixture organization, so the first reinstall rebound **Layout Demo** to the new build.

**Containment and recovery:** Layout Demo was restored — via a reinstall against the old git-HEAD bytes — to its original release identity, and both organizations ended `enabled`. The fixture org was then bound through a **separate helper that pins the org id explicitly** (`x-org-id`), not the `orgs[0]` script. **Standing correction:** any live run against a *named* org must pass the org explicitly; `orgs[0]` is a latent mis-deployment trap. (See §4.6 item 6 on the "untouched" imprecision: bytes restored, revision counter moved.)

**Fixed (2026-10-07 — §10).** The helper no longer resolves `orgs[0]`: `harness/reinstall-plugin.mjs`, `install-plugin.mjs` and `update-plugin.mjs` resolve the target organization through `harness/org-selection.mjs`, honouring `--org-id` / `--org-name` (or `NAKAMA_ORG_ID` / `NAKAMA_ORG_NAME`), refusing a multi-org account with no selector **and** a foreign/unavailable id or a conflicting id+name **before any mutating request**, while a single-org account keeps its legacy fallback. `harness/org-selection.test.mjs` proves a refusal performs **no reinstall request** against a loopback stub, and that an explicit selector pins `x-org-id` to the named org.

---

## 7. Current state

- **Working tree:** dirty, uncommitted — modified: `src/actions.ts`, `src/store.ts`, `src/actions.test.ts`, `nakama.plugin.json`, `actions/actions.js`, `skills/research-coordinator/SKILL.md`, harness `turn.mjs`/`trace.mjs`/`automation.mjs`/`limits.mjs`/`nakama-e2e.test.mjs`/`README.md`/`API-LIMITS.md`, the two `DECISIONS.md`, `.agents/skills/acceptance-pass/SKILL.md`; untracked: `harness/nakama-e2e/driver/`, `docs/evidence-automation/NAKAMA-E2E-HOST-AMENDMENT.md`, `NAKAMA-E2E-READINESS.md`. The 2026-10-07 prepublication cleanup (§10) adds `harness/org-selection.mjs`, `harness/org-selection.test.mjs` and this report's acceptance record, and edits `harness/reinstall-plugin.mjs` / `install-plugin.mjs` / `update-plugin.mjs`, `harness/nakama-e2e/driver/bound-session-model.test.mjs` and `README.md`.
- **Served build (fixture org):** `0.2.0+dev.64a201410338`, revision **28**, store generation unchanged; `actions/actions.js` sha256 `25900ac1…`; `ui/app.js` sha256 `41e61ef5…`. Layout Demo on the restored `0.2.0+dev.164ccaafbca4`, revision 20.
- **Tests:** `src` 312 pass / 0 fail; `harness/nakama-e2e` 262 pass / 0 fail; `typecheck` clean; `typecheck:host` 0 repository diagnostics (scoped claim).
- **Records guard:** `bun run harness:records` → **green** (§10): 0 endpoint offences and 0 identity-bearing home paths across the scanned tree. The pre-existing literal in `harness/nakama-e2e/driver/bound-session-model.test.mjs` was removed by routing the host-checkout path through the repo's own `hostCleanDir()` convention (`NAKAMA_HOST_CLEAN` override, sibling-directory default) instead of a hard-coded home path — the emitter/consumer convention, not a weakened guard. **No clean-release claim is made while the tree is uncommitted** (see §8).
- **No live changes:** API and UI processes not restarted; worker desired-off; interlock closed; plugin store unchanged across every run.

---

## 8. Outstanding issues, ranked · reviewer decision checklist

**Outstanding issues (ranked)**
1. **N-7 trace is not persisted.** The host's automation run uses an ephemeral in-memory session; the harness cannot read a tool trace. N-7's consultation is evidenced only by grounded content — an answer, not proof of a tool path. Capturing it needs a host-side trace sink or a second invocation (neither performed).
2. ~~**Public-record guard is red** on a pre-existing identity-bearing path (untracked test file).~~ — **resolved** (§10): the guard is green; the identity-bearing literal was sanitized via the repo's `hostCleanDir()` convention, not by relaxing the rule.
3. **Work is uncommitted; no merge gate run to completion.** `bun run check` passes but nothing is committed; the stage cannot be called released.
4. **`coverage.limit` semantics** are named by `limitScope` now, but the field name still reads like a collection cap for two of four collections; a consumer must read `limitScope`.
5. ~~**`orgs[0]` reinstall trap** remains in the shipped helper (mitigated by an explicit-org helper, not fixed).~~ — **fixed** (§10): explicit org selection in `reinstall-plugin.mjs` / `install-plugin.mjs` / `update-plugin.mjs` via `harness/org-selection.mjs`, with offline tests.
6. **`axisTitle` latent branch** at the `get_topic` boundary is unreachable via the schema — a latent path, not a defect.
7. **Profile guidance narrower than the tool doc:** the delivered `systemPrompt` (1602 chars) names the tools but never mentions `axisId`/`coverage`; the scoped capability is discoverable only through the tool description. Retained deliberately (a change of experimental condition is its own authorized act).

**Reviewer decision checklist**
- [ ] Accept the skill-loading root cause and the fixture-scoped fix (no host edit/restart) as sufficient for the stage.
- [ ] Accept N-7 as **qualified**: host SUCCESS, harness `missing_trace`, counts recorded as unknown — not as a semantic failure, and not as proven tool-level consultation.
- [ ] Accept the scoped-`get_topic` contract, including the `limitScope` field and the explicit ignored-options list, and the byte-shape-preserved legacy branch.
- [ ] Accept the focused acceptance **with its stated scope** (ids supplied; prompt-wording vs mechanism disclosed).
- [ ] Decide on the pre-existing records-guard failure: leave (report it) or fix the emitter/path in a separate, scoped change.
- [ ] Decide whether to commit the stage, and whether to run any further stage (publication, host-side trace sink, guidance-widening) — each as its own authorized act.

**Stage close recommendation:** close the stage **qualified** — the product change and the agent-consultation path are proven; N-7's trace, the guard, and the uncommitted state are recorded, not closed.

---

## 9. Next UI/product suggestions (grounded; **not implemented**)

1. **Widen the delivered guidance to match the shipped skill** (deliver the current `skills/research-coordinator` body — which already documents `axisId` + `coverage` — into each fixture profile's `systemPrompt`), as its own small authorized step with an offline-coherence check and exact readback. *Surface: profile guidance, not product code.*
2. **Give `evidence`/`problemNotes` a truthful effective cap or a doc-only clarification** of `limitScope`; note the type comments are erased by the build, so a runtime change mints a new served digest and needs a deliberate rebind.
3. **Host-side automation trace sink** so a future N-7 run can be graded on tool path, not just grounded content.
4. ~~**Fix the `orgs[0]` reinstall helper** to require or infer the org id explicitly.~~ — **done** (§10): `harness/org-selection.mjs` + explicit selectors in the three helpers, with offline tests.

These are hypotheses for later scope; only item 4 is applied (in §10); none of the others is applied here.

---

*Evidence index (locations, SHA-256, machine-readable ledger): `.hermes/scratch/stage-review/` (git-ignored, local). Derived from the preserved run artifacts of the five invocations and the offline stages; no product or harness source was modified in producing this report.*

---

## 10. Prepublication corrections and cleanup (2026-10-07)

**This section is appended.** The report above is not rewritten to hide its first draft: each correction quotes
the prior wording and states the change. The reviewer's decision and the corrections it required are recorded
separately in [`2026-10-07-agent-consultation-and-focused-retrieval-acceptance-record.md`](./2026-10-07-agent-consultation-and-focused-retrieval-acceptance-record.md).

### 10.1 Corrections

| # | Prior (quoted) | Corrected |
|---|---|---|
| C1 | §3.1 presented the Ling `next-run` package (`2 generations / 1 tool execution`, this report's invocation 1) as *the* Ling invocation. | §3.1 now scopes **three distinct** Ling packages (§10.2); none is collapsed. |
| C2 | §5.4: invocation-3 answers "reviewed by a human". | "reviewed by an independent **agent**" — a subjective agent judgment, never a human reviewer verdict (§3.2 already said so). |
| C3 | §1 "What is proven" read as a general fix; N-7 `SUCCESS` sat next to "consultation". | Narrowed: the profile-`systemPrompt` workaround is **fixture-scoped** (§4.3), the host fix is **unverified**; N-7 `SUCCESS` is a run status with the tool path **unproven** and counts **unknown** (null); the semantic verdict is **not formal**. |
| C4 | §6 / §8 item 5 / §9 item 4: "`orgs[0]` reinstall trap remains". | **Fixed** (§10.3). |
| C5 | §7 / §8 item 2: public-record guard red. | **Green** (§10.4). |

### 10.2 Chronology evidence — the three Ling packages (distinct)

Located on the local filesystem and hashed (not from session recall); absolute paths + SHA-256 in the local
ledger (`.hermes/scratch/stage-review/`):

| Package | Recorded | N-1 host counters | Terminal | Trace |
|---|---|---|---|---|
| `nakama-ling-commandcode-fresh-process-run` | 2026-10-06 11:50 | — (no dispatch) | preflight mismatch | — |
| `nakama-ling-commandcode-bound-session-run` | 2026-10-06 13:10–13:17 | **3 gen / 3 tool** | `provider-error` | `empty_trace` |
| `nakama-ling-commandcode-next-run-20261006T131654Z` | 2026-10-06 16:16–16:21 | **2 gen / 1 tool** | `provider-error` | `empty_trace` |

The standalone `nakama-ling-commandcode-historical-ERRATUM.md` (and the sealed copy in the bound-session
package) speaks for the **bound-session** package (`3/3`); the report's invocation 1 cites the **next-run**
package (`2/1`). The earlier review's "3gen/3tool" and this report's "2gen/1tool" are therefore **both correct
and different packages** — now shown as such. Inventory is **bounded**: only these three Ling packages were
found on the local filesystem; the earlier packages carry no independent reviewer citation.

### 10.3 The `orgs[0]` fix

`harness/org-selection.mjs` (pure `selectOrgId` + `parseOrgSelector`) is used by `reinstall-plugin.mjs`,
`install-plugin.mjs` and `update-plugin.mjs`. A named org (`--org-id`/`--org-name`, `NAKAMA_ORG_ID`/
`NAKAMA_ORG_NAME`) is honoured and must exist; a multi-org account with no selector, a foreign/unavailable
selector, an ambiguous name, and a conflicting id+name are each refused **before any mutating request**; a
single-org account keeps its legacy fallback. `harness/org-selection.test.mjs` drives the **real** reinstall
script against a loopback stub and proves a refusal issues **no reinstall request**.

### 10.4 Records guard

`bun run harness:records` → all checks passed: 0 endpoint offences, 0 identity-bearing home paths, 244 text
files scanned (2 excluded by path). The literal in `harness/nakama-e2e/driver/bound-session-model.test.mjs` was
replaced by `hostCleanDir()` (the existing `NAKAMA_HOST_CLEAN` / sibling-directory convention) — the rule was
**not** relaxed.

### 10.5 Files changed by this cleanup

**New:** `harness/org-selection.mjs`, `harness/org-selection.test.mjs`, `docs/reviews/2026-10-07-agent-consultation-and-focused-retrieval-acceptance-record.md`.
**Edited:** `harness/reinstall-plugin.mjs`, `harness/install-plugin.mjs`, `harness/update-plugin.mjs`,
`harness/nakama-e2e/driver/bound-session-model.test.mjs`, `README.md`,
`.agents/skills/dashboard-build-and-serve/SKILL.md`, and this report.
**Not** changed: `AGENTS.md` (needs owner approval), `ui/app.js`, `actions/actions.js` (rebuild byte-identical).

Diffstat — tracked files, whole dirty tree (stage + cleanup); new files are untracked:

```
 .agents/skills/acceptance-pass/SKILL.md            |   2 +
 .agents/skills/dashboard-build-and-serve/SKILL.md  |   2 +-
 README.md                                          |  10 +-
 actions/actions.js                                 |  81 +++++-
 docs/evidence-automation/DECISIONS.md              | 112 +++++++
 docs/ux-v2/DECISIONS.md                            |  45 +++
 harness/install-plugin.mjs                         |  15 +-
 harness/nakama-e2e/API-LIMITS.md                   |  23 +-
 harness/nakama-e2e/README.md                       | 151 +++++++++-
 harness/nakama-e2e/automation.mjs                  | 118 ++++++++
 harness/nakama-e2e/limits.mjs                      |   3 +-
 harness/nakama-e2e/nakama-e2e.test.mjs             |   8 +
 harness/nakama-e2e/trace.mjs                       | 200 +++++++++++++-
 harness/nakama-e2e/turn.mjs                        |  68 ++++
 harness/reinstall-plugin.mjs                       |  22 +-
 harness/update-plugin.mjs                          |  15 +-
 nakama.plugin.json                                 |   7 +-
 skills/research-coordinator/SKILL.md               |  11 +-
 src/actions.test.ts                                | 319 ++++++++++++++++++++++
 src/actions.ts                                     |  21 ++
 src/store.ts                                       | 219 +++++++++++++
 21 files changed, 1425 insertions(+), 27 deletions(-)
```

### 10.6 Intended coherent commit grouping (proposal — nothing staged, committed or pushed)

1. **product** — `src/*`, `nakama.plugin.json`, `actions/actions.js`, `skills/research-coordinator/SKILL.md`, `docs/ux-v2/DECISIONS.md`.
2. **harness / e2e** — `harness/nakama-e2e/*`, `docs/evidence-automation/*`, `.agents/skills/acceptance-pass/SKILL.md`.
3. **org-selection safety** — `harness/org-selection.mjs`, `harness/org-selection.test.mjs`, `harness/{install,reinstall,update}-plugin.mjs`, `README.md`, `.agents/skills/dashboard-build-and-serve/SKILL.md`.
4. **records / docs** — `docs/reviews/2026-10-07-*`.

### 10.7 Publication blockers

- The tree is **uncommitted**; no merge gate run to completion.
- Commit / merge / push and publication require an **owner** grant; the reviewer's `REQUEST CHANGES` is not one.
- The `AGENTS.md` org-selector note awaits owner approval.

### 10.8 Verification (this machine, this tree)

`bun run check` → 312 src pass / 0 fail; `bun run build` output byte-identical to the committed
`actions/actions.js` (`25900ac1…`) and `ui/app.js` (`41e61ef5…`); `bun test harness/nakama-e2e` → 262 pass /
0 fail; `bun test harness/org-selection.test.mjs` → 17 pass / 0 fail; `bun run typecheck:host --checkout <host
checkout>` → 0 repository diagnostics; `bun run harness:records` → all checks passed.

---

## 11. Publication preparation executed (2026-10-07, local — appended)

**This section is appended after the stage close and does not rewrite it.** Sections 1–10 describe the stage at
its close, when the working tree was **uncommitted**; that historical state stands. On 2026-10-07 the
reviewer-requested, non-inference cleanup was closed into three **local** implementation commits on `main`,
followed by this durable-docs commit. **No push, fetch, merge, tag, force-move, restart, deployment or
product-UI edit was performed**; publication remains pending an owner grant.

**Local implementation commits (immutable):**

| Group | Commit | Contents |
|---|---|---|
| product | `75d35459d50ac687aaf28499d68d3778434f7c1b` | `src/actions.ts`, `src/store.ts`, `src/actions.test.ts`, `nakama.plugin.json`, `actions/actions.js`, `skills/research-coordinator/SKILL.md`, `docs/ux-v2/DECISIONS.md` §16 |
| harness / e2e | `88a5dd05af8ae22f4e33b909e625a378afe4063a` | `harness/nakama-e2e/*` (including the new `driver/` subtree), `docs/evidence-automation/*` |
| org-selection safety | `59f4d6b65e35587839b4b5f09de680a5b7c3affe` | `harness/org-selection.mjs`, `harness/org-selection.test.mjs`, `harness/{install,reinstall,update}-plugin.mjs`, `README.md`, `AGENTS.md`, `.agents/skills/dashboard-build-and-serve/SKILL.md` |

**Two grouping deviations from §10.6, both source-grounded.**

1. **`.agents/skills/acceptance-pass/SKILL.md` is excluded**, not committed. It was already dirty before the
   stage (sha256 `36b9ae96…`) and the earlier harness acceptance (D-015, already committed) records it as
   **unrelated and excluded**; §10.6 listed it in the harness group in error. It is left as the only residual
   working-tree change.
2. **`AGENTS.md` is included** in the org-selection group. Its build-loop org-selector note was applied under
   **owner approval** on 2026-10-07 through the ordinary approval path, which supersedes §10.5 ("**Not**
   changed: `AGENTS.md`") and §10.7 ("awaits owner approval") as of execution.

**Attribution correction to §10.5 / the local evidence index.** `harness/nakama-e2e/driver/bound-session-model.test.mjs`
was described as **edited**; the whole `harness/nakama-e2e/driver/` directory is **new to git** (`git log --all`
shows no history for it), so that file is **added**, not edited.

**Records-guard count at execution time.** The guard reports **245** text files scanned (was 244 at §10.4 record
time); the extra file is this stage's own acceptance record, present in the tree at execution.

**Publication (2026-10-07, appended).** `main` was subsequently **pushed** at `5a62749`; the reviewer returned
**APPROVE — QUALIFIED CLOSURE / PUBLICATION ACCEPTED**, superseding the stage-close `REQUEST CHANGES`, and one
bounded, offline correction (the scoped axis-note `problem_id IS NULL` pre-`LIMIT` filter) followed — it does
**not** invalidate this stage's live acceptance and required **no new inference**. Recorded in full in the
[acceptance record](./2026-10-07-agent-consultation-and-focused-retrieval-acceptance-record.md) §9; §11's
"publication remains pending" sentence describes the pre-publication moment only.
