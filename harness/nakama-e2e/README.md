# `harness/nakama-e2e` — bounded Nakama-native Librarian E2E harness

Offline-testable machinery for running the N-1…N-7 semantic matrix through the **real** Nakama agent/tool
loop on an isolated fixture. This slice builds and validates everything up to the first model turn and
**stops there**: no inference is authorized or performed here.

It has no product dependencies: nothing under `src/`, `nakama.plugin.json`, `migrations/` or
`.agents/skills/` is touched by it.

## Layout

| File | Responsibility |
|---|---|
| `seed-artifact.json` | The **distinct** oracle-free seed: the accepted FIX-* facts expressed in the supported `reconcile_topic` vocabulary, including the adopted `F-2-conflict` and `F-18-inj` note texts. No expected outcome/verdict, no candidate output, no model metadata. |
| `artifact.mjs` | Loads/guards the artifact (`assertOracleFree`) and builds the two-phase reconcile payloads + variant substitution. |
| `limits.mjs` | The traced `reconcile_topic`/`get_topic`/`record_activity` input limits and a fail-closed validator (see `API-LIMITS.md`). |
| `client.mjs` | Small bounded HTTP client (cookie+CSRF login, per-org header, 429/503 retry). Refuses an out-of-contract write before sending. |
| `seed.mjs` | Seeds the artifact through the **authenticated human** `reconcile_topic` action and persists a source-id → live-id mapping; duplicate guard fails closed. |
| `readback.mjs` | Validates the live `get_topic` projection against the semantic conditions each N-case needs (never byte-equality). |
| `snapshot.mjs` | Logical plugin-store snapshot, pinning **generation + revision**, failing closed on change; positive control mutates a scratch **copy** only. |
| `trace.mjs` | Reads and validates the real tool-call trace from the platform DB (`session_messages.payload.toolCalls`); absent/empty/malformed fails consultation. Also materializes the **full ordered** per-turn trace (calls, arguments, answer, model + usage evidence) and classifies it terminally for the owning driver. |
| `turn.mjs` | Agent/model turn driver and the inference interlock — **default blocked**; also the driver's request builder and default (blocked) turn port. |
| `automation.mjs` | Manual-automation definition (pure); install/run gated — run also requires direct validation (N-7 downstream); and the owning driver's owned-worker N-7 wrapper. |
| `driver/budgets.mjs` | Proposed exact **per-case** + whole-experiment budgets, a fail-closed validator against reviewed ceilings, and separate provider-generation / batch tool counters. |
| `driver/stop-latch.mjs` | The sequence-wide stop latch (first cause wins; never reopens). |
| `driver/host-session.mjs` | The **real** host evaluation-session contract (`bindEvaluationPolicy` / `getEvaluationResult` / `getEvaluationToken` / `send` / `sendStream`) the driver binds against, plus an offline scripted session whose policy decisions delegate to the pinned host's own guard. |
| `driver/host-evaluation-core.mjs` | Loads the pinned host's own `@nakama/core` evaluation guard/validator from the clean host checkout for the offline tests. |
| `driver/authorization.mjs` | The explicit authorization binding (host/plugin/org/profile/provider/model/cases/allowlist/per-case+whole-experiment budgets/no-retry) and the execution gate (shut). |
| `driver/cases.mjs` | The N-1…N-7 case table (smoke / read-only / writers / automation tiers). |
| `driver/driver.mjs` | The owning driver: the atomic measured-experiment sequence and the sequence runner. |
| `driver/adapters.mjs` | Real in-process adapter seams (scratch SQLite session store + real trace reader + guard-backed host-session port) for the offline driver tests. |
| `driver/http-adapters.mjs` | The **live-HTTP** adapter seams: the amended host's own routes (`POST /v1/sessions` with `evaluation`, `POST /v1/sessions/:id/messages` incl. the SSE turn, `POST /v1/automations/:id/run`, the owned worker start/stop, automation create) with explicit scoped auth (cookie + `x-csrf-token` + `x-org-id`), no retry, and a turn deadline that aborts. |
| `driver/driver.test.mjs` | Offline driver tests (55 cases), disjoint from the two existing suites. |
| `driver/http-adapters.test.mjs` | Offline injected-`fetch` integration tests (20 cases) that drive the live-HTTP adapters against a source-faithful emulation of the host's served routes, over a real scratch SQLite store. |
| `fixture-run.mjs` | Fixture-worker entry: **pre-seed pin → seed → mapping → readback → re-pin**. **Dry-run by default**; never runs a model turn. |
| `nakama-e2e.test.mjs` | Offline tests of every seam (79 cases), including the fixture-run pin-before-seed ordering. |

## Run the tests (offline)

```bash
bun test harness/nakama-e2e
```

or via the runner that mirrors the `librarian-generation` convention:

```bash
bun harness/nakama-e2e/run-tests.mjs
```

No network, no model, no live instance. **Proposed** `package.json` script (not added — `package.json` is
out of scope for this slice): `"harness:e2e": "bun test harness/nakama-e2e"`.

## Inference is blocked

`turn.mjs` exports `assertInferenceAuthorized` and `INFERENCE_AUTHORIZED = false`; `runAgentTurn` and
`runAutomation` throw `InferenceBlockedError` before any transport call, and `installAutomation` throws
unless an explicit `allowPlatformWrite: true` is passed. There is no authorization record in this
envelope, so the gates are shut. A test asserts the guarded functions throw **and** that an injected
transport is never called.

## Owning driver (`driver/`)

The blocked `turn.mjs`/`automation.mjs` scaffolds are replaced by an owning driver whose single unit of
work is **one atomic measured experiment**. `driver/driver.mjs` runs the fixed sequence, and every
side-effecting step is an injected port, so the whole thing is exercised offline by `driver/driver.test.mjs`
against a **real** adapter seam (a scratch SQLite `session_messages` store read back through the real
`readSessionMessages`). Nothing in this slice contacts a provider.

Sequence for one case:

1. **bind** — the case must be in the authorization's case set and carry a non-empty effective allowlist;
2. **pin + snapshot before** — plugin store generation + revision and the logical snapshot;
3. **bind** — the host evaluation policy is built from the case's effective allowlist + per-case budget, and
   bound to a fresh host session for the case (`bindEvaluationPolicy`; binding is single-shot, so one session
   per case matches the host contract). Default-inert is required first (`getEvaluationToken()` /
   `getEvaluationResult()` both `null`); the host arms the turn-scoped deadline from the policy's
   `turnDeadlineMs`;
4. **exact prompt** — the prompt bound by the authorization, sent unchanged;
5. **one turn**;
6. **full ordered trace** — calls + arguments + answer + model + usage evidence, read from the platform DB;
7. **pin + snapshot after** — compared for identity and logical equality;
8. **classify** — terminal on any forbidden call, missing/malformed trace, mutation, identity/model
   mismatch, timeout or unknown transport outcome.

A terminal failure **latches the sequence** (`driver/stop-latch.mjs`); there are no retries and no
replacement cases. N-7 runs only downstream of direct success, starts the owned worker, invokes exactly
one manual definition/run and stops the worker in a `finally`; its failure **never erases** the direct-case
evidence. The N-7 wrapper deliberately does **not** treat `definition.readOnly` as a security boundary.

Budgets (`driver/budgets.mjs`): provider-generation and individual-tool counters are separate; a tool batch
of N consumes N and executes **none** if it would exceed the remainder; per-turn and whole-experiment
limits are both enforced. `PROPOSED_CASE_BUDGETS` carries an exact per-case budget grounded in the host's
real turn resolution: a deferred-tool consultation needs at least three generations (`find_tools` →
resolved read → answer), so `perTurnModelCalls: 1` is **not** a bound — it stops every consultation case at
`model-generation-budget-exhausted`. The exact numbers are **proposed, not approved** — they await the
readiness review the host-amendment ruling defers them to. `validateBudgetConfig` / `validateCaseBudgets`
refuse a missing field, a non-integer, a non-positive value or anything above the reviewed ceiling, so a
caller cannot widen a bound silently.

## The host evaluation contract the driver binds

The amended-host contract (`.hermes/scratch/nakama-e2e/host-amendment/CONTRACT.md`) fixes the supported
binding as the **in-process agent session** and the **automation caller argument** — there is no
`assertDefaultInert` / `armPolicy` / `preDispatchBatch` API. `driver/host-session.mjs` encodes the real
surface (`HOST_SESSION_REQUIRED_METHODS`) and refuses a session missing any of it:

- `bindEvaluationPolicy(policy)` — bind the case's policy (single-shot; validated, scope-checked by the
  host);
- `getEvaluationToken()` / `getEvaluationResult()` — the stable pseudonymous conversation token and the
  terminal `EvaluationTurnResult` (`terminalReason`, `modelGenerations`, `toolExecutions`, `forbidden`,
  `historyValid`); both `null` before binding is the default-inert proof;
- `send` / `sendStream` — the turn; the host enforces the model-generation budget before each dispatch, the
  whole-batch tool admission (`admitToolBatch`) before any sibling, and the turn-scoped deadline it armed at
  turn start.

The driver derives its dispatch log from the host's `forbidden` record and reads consumption back from the
terminal result. The offline tests inject the **pinned host's own** `createEvaluationTurnGuard` (loaded from
the clean host checkout by `driver/host-evaluation-core.mjs`) so they exercise the real guard, not a parallel
re-implementation. The end-to-end agent assembly (send, sendStream, automation channel, stable token with an
injected provider) and the HTTP route bindings are exercised in the host checkout's own tests
(`packages/agent/src/chat-evaluation-wiring.test.ts`, `apps/server/src/http/routes/sessions.evaluation.test.ts`,
`automations.evaluation.test.ts`).

The authorization (`driver/authorization.mjs`) still binds the amended host **identity + patch digest +
contract digest**: `authorizeExecution` returns `host_contract_unavailable` (blocked) until the contract is
present and its digest matches. The model binding is alias/date-bounded (`immutableWeightsClaim` refused), so
a result names the requested/reported identity without claiming immutable weights. The amended-host identity
is the **accepted served** one (`nakama-host-clean@945420b6+eval-controls+wire-eval-result`, patch
`f33a9de5…`, contract `8164105f…`); this delta is **driver-only harness source** and needs no host restart.

**Provider disposition (2026-10-06).** The earlier reviewed suitability block is **withdrawn**: the reviewer
**accepts operational OpenCode Go first** for the N-1…N-7 experiment, recorded as
`providerDisposition.suitability = "operationally_selected_accepted"`, with the canonical binding
`opencode-go` / `opencode-go/deepseek-v4.1-flash` / wire `deepseek-v4.1-flash`. The record claims **no**
service-terms permission (`serviceTermsPermissionClaimed` stays `false`), performs **no** policy research,
permits **no** fallback and **no** silent substitution, pins the **entire** sequence, makes failures
**terminal with no switch**, records the **reported model identity when the backend exposes it**, and claims
**no identical-backend revision equivalence**. `executionAuthorized` stays `false` and `turn.mjs` keeps
`INFERENCE_AUTHORIZED = false`.

**Prompt finalization (2026-10-06).** `driver/prompts.mjs` carries the **reviewer-specified final texts**
(N-1…N-7), frozen **before inference** (`PROMPT_DISPOSITION = "reviewer_specified_frozen_before_inference"`);
N-1/N-6 are unchanged and N-7 is a byte-identical repeat of N-1. The authorization binds the exact UTF-8 bytes
and their sha256 for every case, and the driver recomputes/verifies the binding **before session creation** — a
one-byte difference refuses for every case. N-4 is deliberately conservative: the hidden problem-scoped-steering
projection limitation is not independently discoverable from the bounded read, so the prompt asks what the
retrieved information establishes and does not establish rather than presupposing a coverage limitation.

## The live-HTTP adapter (`driver/http-adapters.mjs`)

The driver performs no I/O — `createHostSession` and `automationApi` are injected ports. `driver/adapters.mjs`
is the in-process seam the offline tests use; `driver/http-adapters.mjs` is the **live** seam: it binds the
driver to the amended host's actual served routes, so a real run (once the authorization, provider/model and
containment prerequisites are separately approved) does not go through a stand-in. Routes, methods, statuses
and response shapes are taken from the pinned checkout, not invented:

| Interaction | Route (host source) |
|---|---|
| explicit scoped auth | `POST /v1/auth/login` → cookies, `GET /v1/auth/orgs`, `GET /v1/auth/me`; the org header is `x-org-id` (`org-middleware.ts:10`) with `x-csrf-token` |
| create + bind policy | `POST /v1/sessions` body `{ channel, profileId, model?, evaluation }` → **201** `{ sessionId }` (`sessions.ts:606`) |
| one turn | `POST /v1/sessions/:id/messages`, JSON `{ reply, usage? }` or `text/event-stream` (`tool_start`/`tool_end`/`chunk`/`usage`/`done`/`error`, `shared.ts:575-644`) |
| N-7 run | `POST /v1/automations/:id/run` body `{ evaluation }` → `{ run }` (`automations.ts:428`) |
| N-7 worker | `POST /v1/workers/automation/{start\|stop}` → `{ ok: true }` (`workers.ts:195`); definition via `POST /v1/automations` |

The adapter enforces the same two properties as `client.mjs`: **no retry** (a failed turn has an unknown
applied outcome, so it is surfaced and latched, never replayed) and a **turn-scoped deadline that aborts**
the request (`AbortSignal.timeout(policy.limits.turnDeadlineMs)`), reporting `turn-deadline-exceeded` rather
than a throw. `createHttpAuth` requires an explicit `expectedOrgId` the account is actually a member of and
refuses a non-loopback base — a stray ambient URL cannot aim a run at the corpus.

### Candid limitations (the HTTP boundary cannot see these)

- **The host's `EvaluationTurnResult` is not on the wire.** `terminalReason`, `modelGenerations`,
  `forbidden` and `historyValid` are in-process values; no session/messages or automation/run response
  carries them. The adapter reports what the served surface actually provides and sets the rest `null` —
  it never fabricates a `forbidden` record or a generation count. The authoritative trace remains the
  platform DB (`trace.mjs`), read independently; a pre-dispatch writer denial is therefore detected from
  the DB trace + allowlist, not from an HTTP field. Budget/lateness evidence the boundary cannot see is
  **absent, not zero**.
- **The turn id is host-assigned.** The driver reads the DB trace by `hostSession.sessionId` (the id the
  host returned), not by the caller's label; the JSON (non-stream) route yields no tool events, so use the
  streamed route when the observed call list matters.
- **A live run must supply the containment port** (below); it is not inferred.

## Containment gate (skill containment is not restart-persistent)

Every boot re-assigns the default bundled skills (`ensureBundledSkillsAssigned`,
`apps/server/src/index.ts:470`), so a supported-API skill unassignment does **not** survive a restart (see
the readiness report §5). The driver therefore takes an optional `checkContainment({ caseId })` port and
re-checks it **before every case** (direct and N-7). A port that throws, or returns anything other than
`{ ok: true }`, stop-latches with `containment_changed` — fail-closed, and with **no automatic recovery and
no inference**: the gate only observes; re-applying containment is an explicit, separately-authorized act.
A live run must supply the port (absence is recorded as `containment: null` in the case evidence).

## What the no-write proof measures

`snapshot.mjs` compares two `canonicalSnapshot`s (schema objects + per-table row count + canonical-sorted
rows + a `development_axes`/`problems` version map) of the plugin store, and separately asserts the store
identity did not move:

- **Plugin store only.** Platform writes are expected and are *not* part of this proof — they are read
  separately from the platform DB (`trace.mjs`).
- **Generation + revision are pinned.** `pinStoreIdentity` reads the generation filename and the served
  revision (`org_plugins`); `assertNoLogicalMutation` fails if either moved, even when the rows match.
- **The positive control never touches the live store.** `positiveControlMutation` copies the DB (plus
  WAL/SHM) into a scratch directory and edits the copy, proving the comparator can go red without mutating
  the fixture under test.

## Operational instructions for the parent / fixture worker

Prerequisites the harness assumes (owned elsewhere, not created here):

1. An isolated fixture instance with a `data-root`, `org`, and profile; loopback API; the plugin
   installed+enabled. The harness only needs the store path convention
   `<data-root>/orgs/<org>/plugins/<pluginId>/db/<generation>.sqlite` and the platform DB at
   `<data-root>/data/sqlite/nakama.sqlite`.
2. Credentials reachable by name from an env file: `NAKAMA_SEED_ADMIN_EMAIL` / `NAKAMA_SEED_ADMIN_PASSWORD`
   (or `NAKAMA_EMAIL` / `NAKAMA_PASSWORD`). The harness never prints them.
3. The approved provider/model remains a **separate** presentation before any model turn.

Then:

```bash
# dry run — prints the plan, touches nothing
bun harness/nakama-e2e/fixture-run.mjs

# seed + read back (fixture worker, once the fixture exists). Every target flag is EXPLICIT: there is no
# default base, org or store path, so a stray ambient NAKAMA_URL cannot aim this at the corpus.
bun harness/nakama-e2e/fixture-run.mjs --execute \
  --base http://127.0.0.1:<fixture port> \
  --expected-org <fixture org id> --expected-org-name <fixture org name> \
  --env-file <instance env file> \
  --data-root <NAKAMA_CONFIG_DIR> --platform-db <platform sqlite path> \
  --out <scratch>/nakama-e2e/mapping.json
```

`--env-file` supplies the credentials (by key name; never printed). `--data-root` and `--platform-db` name
the fixture's local store; they may instead come from `NAKAMA_CONFIG_DIR` and `DATABASE_URL` in the loaded
env. The run's order is fixed and fails closed at each step:

1. **login** with an explicit expected org (the account must be a member; the name is checked when given);
2. **empty-store confirmation** — a fixture that already holds topics is refused (no force override);
3. **pin the store identity before the seed** — generation + served revision + lifecycle, read from the
   platform DB; absent/malformed/non-enabled all refuse;
4. **mapping output writable** — the `--out` parent is created and checked before anything is mutated;
5. **seed** through the authenticated-human `reconcile_topic` action (an expected mutation; a failure stops
   the run — no reseed, no reset, no retry);
6. **persist the source→live mapping**, then **read back** each N-case projection through `get_topic`;
7. **re-pin** across the read-only readback and fail if the generation or revision moved.

The run writes the source→live mapping to `--out` (keep it outside the repo). `mapping.json` is what the
readback, the snapshot identity check and a later turn-trace validation all address the fixture by; a run
without it cannot be tied back to the seeded rows.

After seeding, the readback validates each N-case projection. Then, and only then, would a direct agent
turn follow — which this slice does not enable.

## Boundaries honoured by this slice

- No product `src/`, manifest, schema or shipped-skill change; `package.json` untouched.
- No git state-changing command; no commit.
- No credentials/provider-config read, no live HTTP, no install, no service operation performed to build
  or test this slice.
- The seed artifact is derived from the accepted FIX-* facts and is deliberately free of the offline
  evaluator's oracle/verdict/candidate/model vocabulary.
