# Librarian / Reconciliation V1 — offline evaluator & fixture implementation proposal

**Status: PROPOSAL only — NOT authorized, NOT implemented.** This document is an **authorization envelope**:
it proposes a bounded, **offline-only** first implementation step and asks for a separate authorization. It
changes no code, no migration, no bundle, no schema and no test; it performs no live, deployed or
credentialled access, no mutation, no persistence, no scheduling and no monitoring, and it reopens no
R-series validation. The design it implements is approved with amendments —
[`DESIGN-V1.md`](DESIGN-V1.md), ruling **D-008**, with this envelope's scope corrections recorded as **D-009**,
both in [`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md).

**This proposal adds no implicit live step.** Every deliverable below is offline, deterministic and
fixture-driven. The single real-Axis read permitted by **D3** is a **separate, later authorization**; nothing
here performs it, and no later stage is reachable from this envelope without its own approval.

## 1. What is being asked, and what is not

- **Asked:** authorization to implement and run one bounded, offline evaluation slice — a committed synthetic
  fixture, a deterministic contract evaluator, and an isolated zero-mutation instrumentation harness — with
  no runtime, tool, bundle, schema or product-surface change.
- **Not asked, and not implied:** live/deployed access; reading a real Axis; reading the production database
  at all; any mutation, persistence or new tool/table/column; any schedule, daemon, poll or monitor; any
  reopening of the R-series validation or of an accepted UX-v2/evidence-automation unit.
- **Separate from the document corrections.** The corrections made alongside this proposal (the D-008 design
  ruling, the D-006 alignment, the D-009 offline-envelope scope corrections and the DESIGN-V1 amendments) are
  approved documentation and stand on their own. **This
  proposal is a separate authorization request**; approving the document corrections does not approve it, and
  approving it does not authorize implementation until that authorization is explicitly given.

## 2. Scope boundaries

| In scope (offline) | Out of scope |
|---|---|
| A committed, synthetic, labelled, deterministic fixture dataset | Any real research, real database row, or live endpoint |
| A pure typed-reference grammar + fail-closed resolver | Any change to `src/actions.ts`, `src/ui.tsx`, bundles or the manifest |
| A deterministic proposal **assembler** + bounded A/B/C snapshot driver | Any new tool, table, column, or persisted record |
| An offline evaluator over the fixture | Any mutation path, auto-confirmation or approval workflow |
| An isolated DB-snapshot instrumentation harness | Scheduling, daemons, polling, or authenticated monitoring |
| Contract tests run by `bun test` | Wiring the offline module into the shipped build or exported tools |

**No runtime change.** The new code is a self-contained offline module: it is **not** imported by
`src/actions.ts` or `src/ui.tsx`, is **not** part of `bun run build`, and adds nothing to the agent tool
surface. `get_overview`/`get_topic`/`search_dashboard` remain the only reads and `exposeAsTool` is unchanged.

## 3. Outcome goals

1. **The proposal contract is executable and fails closed.** Every `evidence_ref` resolves to exactly one
   returned element under the §5.5 grammar, or the proposal is refused.
2. **Adversarial semantic branches are exercised**, not only a happy path (§8).
3. **Zero mutation is proven by an independent instrument**, never by the librarian's own word (§9).
4. **The evaluator is honestly scoped:** a deterministic contract evaluator is proven unable to certify
   generative semantic usefulness, and the semantic evaluation is specified as a *separate, human-reviewed*
   procedure (§7).

## 4. Protected invariants

- **No field named `authority`; no field named `reasoning_strength`.** `claimStrength ∈ {inferred,
  uncertain}`, never `confirmed`; `reviewStatus` is `unreviewed`; `outcome ∈ {proposal, abstained,
  insufficient_evidence, snapshot_unstable}`.
- **One Axis, proposal-only, reply-only.** No batch, no multi-axis, no persistence.
- **Reads only through the approved projections, via a closed read boundary.** The core receives read results
  only through a **read-boundary adapter** that dispatches the three approved read actions
  (`get_topic`/`get_overview`/`search_dashboard`) through the **existing action entry point**
  (`run(input, context)`, `src/actions.ts:216`) and **never hands the core a `ResearchStore` handle** — so no
  write method is reachable by construction, and any action key outside the closed allowlist is **denied
  before dispatch**. The adapter builds a `Context` (`PluginExecutionContext & { actionKey; databasePath;
  actor }`, `src/actions.ts:55-57`) whose `databasePath` is the **offline fixture DB** — never a live database
  — and calls `run`; `run` constructs its own `ResearchStore` from that path and closes it in a `finally`
  (`src/actions.ts:216-239`), so the store is **never retained or passed to the core** — the adapter returns
  only the read result. The fixture DB itself is built from the shipped migrations on the **store-owned side,
  outside the core**.
- **Human-steering authority is a precedence rule, not a field.** No resolution of human–human disagreement
  by recency, `confidence` or `author_type`.
- **The instrument is never the librarian's input.** The DB-snapshot harness is separate from, and invisible
  to, the code under test.
- **A backed unit test is not a usefulness claim.** Passing contract tests certifies structure, never that
  the generated reading is semantically good (§7).

## 5. Proposed changed paths (future — none written now)

Paths below are **proposals**, grounded in the current tree (`src/*.test.ts` use a temp SQLite DB built from
`migrations/` and `new ResearchStore(path)`, `src/store.test.ts:23-51`; Bun is the only toolchain). Every
**new** path listed here does not exist yet; the sole entry touching an existing file is the one-line
`package.json` script, and `package.json` itself **does** exist.

| Proposed path | Kind | Purpose | Runtime impact |
|---|---|---|---|
| `src/librarian/references.ts` | new module | Typed reference grammar + fail-closed resolver (§5.5) | none — not imported by actions/ui |
| `src/librarian/read-boundary.ts` | new module | Closed read boundary: dispatches the three read actions through `run` (`src/actions.ts:216`), denies any other key before dispatch, never hands a `ResearchStore` to the core | none — not imported by actions/ui |
| `src/librarian/assembler.ts` | new module | Deterministic proposal **assembler** + bounded A/B/C snapshot driver (pure; read boundary injected). Renamed from the earlier working name `proposal.ts` so it is not confused with the proposal *document* it consumes. | none |
| `src/librarian/fixtures/candidate-inputs.json` | new data | **Supplied, explicitly labelled candidate outputs + conflict assessments** (§7) — the assembler/evaluator input; contains **no** expected outcomes | none |
| `src/librarian/fixtures/evaluation-dataset.json` | new data | Committed synthetic labelled fixture (§8), deterministic | none |
| `src/librarian/fixtures/expected-outcomes.json` | new data | Oracle expected outcomes (pending human review) + cited support (§7) — **the oracle; never read by the assembler**; the evaluator compares only after assembly | none |
| `src/librarian/fixtures/README.md` | new doc | Fixture provenance: synthetic, no real research | none |
| `src/librarian/evaluate.ts` | new offline CLI | Replays the fixture through the assembler; emits an artifact | none — offline entry |
| `src/librarian/references.test.ts`, `assembler.test.ts`, `evaluate.test.ts`, `read-boundary.test.ts` | new tests | Contract evaluator over the fixture; negative controls; the F-14/F-15 mutant red-run and write-denial-before-dispatch | none |
| `harness/librarian-db-snapshot.mjs` | new harness | Isolated authoritative before/after DB-snapshot compare (§9) | none — test/instrumentation only |
| `package.json` (one script) | edit | Add a `librarian:evaluate` script | none at runtime |
| `docs/librarian-reconciliation/OFFLINE-EVALUATION-REPORT.md` | new doc | The evaluator's committed evidence record | none |

**Dependencies:** none new. Bun (pinned) and the existing `ResearchStore`, `migrations/` and `bun:sqlite` are
sufficient. No `node_modules` step beyond `bun install`.

> **Implementation disposition (as built — see `OFFLINE-EVALUATION-REPORT.md`; a recorded disposition, NOT a
> reviewer-approved deviation).** The bounded A/B/C driver that was built selects the stable observation and
> validates **one supplied constant candidate** against it — the A observation when A = B, or the B
> observation on churn (A ≠ B, B = C) — and never against a stale A. It does **not** construct a candidate
> per read and does **not** regenerate a candidate from B; there is **no model** and no candidate factory in
> the offline slice. The ≤3-read bound and the stable digest are preserved. This is the disposition of the
> implemented offline contract slice — an **implementation specialization** of `DESIGN-V1.md` §7.3, **not**
> a reviewer-approved change to that section's general construct/recompute protocol. Reusing the code with
> a runtime- or model-constructed candidate still requires that protocol, under its own future
> authorization. The supplied candidates are structural test inputs: a structural pass over them does not
> establish semantic usefulness or faithfulness.

## 6. Deliverables

1. `references.ts` + `assembler.ts` implementing §5.2 and §5.5 of the design — pure, and read-boundary-injected so the core is never handed a store handle.
2. A committed synthetic fixture (§8) with provenance: `candidate-inputs.json` (supplied candidates, the assembler's input) kept **separate** from `expected-outcomes.json` (the oracle, pending human review) — the oracle is **never read by the assembler**.
3. An offline evaluator that replays the fixture and writes an evidence artifact.
4. Contract tests that pass on the fixture and on negative controls.
5. `harness/librarian-db-snapshot.mjs` proving zero mutation from an isolated vantage.
6. `OFFLINE-EVALUATION-REPORT.md` recording the exact run: fixture digest, evaluator version, contract-test
   results, snapshot equality, and the **separate** semantic-evaluation status (§7).

## 7. Evaluator design — the distinction that must not be blurred

This request authorizes **one program of work only**, and a green run of it says nothing about the other.

**(a) Deterministic contract evaluator — the whole of this request (contract-evaluator only).** A pure
function that checks the *structural* contract over **supplied, explicitly labelled candidate outputs and
conflict assessments** — inputs the fixture hands it, not free text it must interpret. The candidate output
and its conflict/semantic assessment are **injected parameters carrying an explicit, caller-supplied
provenance label**; the evaluator derives no provenance from `author_type`, row order or recency, and it
makes **no model or NLP call** — a supplied semantic assessment is an input it checks, never a "discovery" it
makes. It checks that every
reference is a typed reference that resolves (or the proposal is refused as a **hard error**, never
`insufficient_evidence`); that `claimStrength`/`reviewStatus`/`outcome` are well-formed and `claimStrength` is
present only for `outcome = proposal`; that `conflicts[]` carry a permitted `reason`; that a withheld reading
emits no `text`; that the snapshot recomputation is bounded; and that no `authority` or `reasoning_strength`
field exists. It is **decidable and exhaustive over the fixture**.

> **A deterministic contract evaluator can prove a supplied assessment is well-formed — it cannot prove a
> reading is semantically useful or faithful, and it is not an NLP truth engine.** It does not parse free text
> to detect semantic conflict; it checks the **structured assessment it is given**. Structural validity is not
> semantic validity.

**(b) Reasoning evaluation — specified here, run only under its own authorization.** Judging whether a
generated reading is *good* requires human review against recorded expectations, with the model's output
**recorded** so the judgement is auditable:

- Each fixture case carries a proposed **expected outcome / oracle** (the `outcome` a careful reader would
  reach, and, where `outcome = proposal`, the reading's **cited support** — the typed refs a faithful reading
  must rest on) in `expected-outcomes.json`. This is an **oracle awaiting human review**: the fixture does
  **not** assert it has already been reviewed, and the semantic gate is not satisfied by its mere presence.
- The semantic check is performed by a **human reviewer** comparing the recorded model output against the
  expected outcome and cited support — not by the deterministic evaluator, which **cannot self-certify
  reasoning and cannot catch an undeclared conflict** the supplied assessment does not name.
- The fixture's candidate outputs and conflict labels are **synthetic test inputs**, never model outputs. **No
  model is invoked anywhere in this envelope.** A **candidate factory / injected seam** is planned so a later,
  separately authorized stage can feed the **actual, recorded** model output through the same contract; that
  seam is inert here and makes no model call.
- If a model is ever invoked, **its exact output is recorded** in the evaluation report, with the model and
  run named; a reviewer must be able to reproduce and inspect it.
- **No canned or pre-written output is presented as the model's reasoning.** If a later slice is run without a
  model, the report says so; it does not paste a hand-written reading as though a model produced it.

This distinction is a **deliverable boundary**: the contract evaluator may be marked green by machine over
the supplied fixture assessments; the semantic evaluation is a **future gate** that may only be marked green
by a named human review with recorded evidence — and it is outside this request.

## 8. Adversarial fixture matrix

The committed fixture is **synthetic, labelled and deterministic** (fixed ids, fixed timestamps, no real
research, no live data), and **exercises adversarial semantic branches — not only a happy path.** Each row is
a labelled case with an expected `outcome`:

| # | Branch | Expected outcome / assertion |
|---|---|---|
| F-1 | Clean happy path: axis with branch + PR evidence, no competing steering | `proposal`; refs resolve; coverage stated |
| F-2 | Human steering that **conflicts** with the machine reading | `abstained` + `conflicts:[{reason:"human_steering_conflict"}]`; no competing `text` |
| F-3 | Two human notes that **disagree with each other** | `abstained` + `conflicts:[{reason:"human_human_conflict"}]`; no recency/confidence resolution |
| F-4 | **Problem-scoped** steering claim (canonical target = problem; `axis_id`/`topic_id` null) — **not returned by `get_topic`** | reported as an explicit **coverage limitation** (UNKNOWN for problem-scoped steering, §5.1/§8), **not** as a returned or fabricated empty projection; a citation to that problem-scoped annotation id **fails closed** (absent from the bundle) |
| F-5 | Empty evidence list | `insufficient_evidence`; no `confirmed`, no text |
| F-6 | `UNKNOWN` coverage (returned list length equals the cap) | not reported as COMPLETE or proven PARTIAL |
| F-7 | Explicit `truncated` flag present | coverage PARTIAL |
| F-8 | **Snapshot stable** (A = B) | `proposal` |
| F-9 | **Snapshot changes once** (A ≠ B, B = C) | delivered against B/C |
| F-10 | **Snapshot churns** (A ≠ B, B ≠ C) | `snapshot_unstable`; no further reads/recomputes |
| F-11 | **Read failure** (injected store error) | hard error — never `insufficient_evidence`, never absence |
| F-12 | **Invalid reference** (unknown id / scope mismatch / ambiguous / label-as-identity) | proposal refused (resolver fails closed) |
| F-13 | **Spoofed actor/author token** attempting to mint provenance | refused; provenance not mintable |
| F-14 | **Rejection case:** a write attempt from the read-only context (denied before dispatch) | refused; the attempt is demonstrated |
| F-15 | **Rejection case:** a citation by display label or list index | refused |
| F-16 | **Topic-wide** human steering (`axisId` null, `topicId` = the subject's topic) | read for the axis under `subject.topicId`, cited with role `topic`; never dropped as out-of-scope |
| F-17 | **Problem state-history** entry genuinely returned (`ProblemDetail.history`, `StateLogEntry[]`, `src/store.ts:1246-1253,2490`) | cited with role `problem` for a problem-specific statement/conflict; never whole-axis steering; the resolver must not require an `axisId`. A problem-scoped **annotation** is the separate F-4 case — not returned, so not citable |
| F-18 | **UNKNOWN steering coverage** (returned notes equal the cap) | no blocker change inferred; evidence-limited synopsis or reasoned abstention; never asserts "no steering exists" |
| F-19 | **Structurally valid, semantically bad**: a supplied candidate passes every structural contract check (refs resolve, `claimStrength`/`reviewStatus`/`outcome` well-formed, no `authority`/`reasoning_strength`) but its semantic expectation is a **rejection** | the deterministic evaluator **passes F-19 structurally** — proving structural validity is not semantic validity; the **semantic** rejection is recorded in `expected-outcomes.json` as **pending human review**; the fixture does **not** claim a model produced the candidate or that any review occurred |
| F-20 | **Provenance is injected, never derived**: a supplied candidate carries an explicit injected provenance label | the evaluator echoes the injected provenance verbatim and derives none from `author_type`, `created_at` or row order |

**F-14/F-15 are rejection cases, not mutant proof.** A suite that refuses a bad input has shown it *can*
refuse that input, not that its guard is wired to the code under test. Mutant proof is separate and required:
the **pristine fixture must pass**, and an **injected mutant that disables the read-only allowlist (F-14) or
the reference-scope check (F-15) must fail acceptance**. A suite that still passes with the guard removed
proves nothing and is rejected.

## 9. Zero-mutation proof — the isolated instrument

The librarian's runtime surface is **read-only by construction** (a surface property). Proof that **zero
rows changed** is **separate and authoritative**, and comes from `harness/librarian-db-snapshot.mjs`, an
**isolated instrumentation harness**:

- it snapshots the fixture database **before and after** a librarian run — the run executed through the
  read-boundary adapter over the existing action dispatch (`run(input, context)` with the fixture
  `databasePath`, §4, §10) — and compares a **canonical logical projection**, **not** raw bytes: the schema,
  each **user table's row count and its rows in a canonical sorted order (canonical content)**, read
  logically. It compares **nothing** that moves without a logical change — **never** the SQLite file bytes,
  WAL/journal, page layout, freelist or `-wal`/`-shm` sidecars;
- it may **seed a temporary fixture** into a scratch/offline database to arrange the pre-state, but the
  **product rows under evaluation are never changed** by the run; the before/after comparison is over the
  same logical tables the product reads;
- it is a **test/instrumentation artifact** and must **never** be an input the librarian reads — it observes
  from outside;
- it demonstrates the F-14 write attempt is **refused before dispatch**, and M-3/M-4 (zero row change, no
  `version` move, no `state_log` row) from its own measurement, not from the code's self-report;
- at the test layer it also **mutates the guard** — allowlist off, then scope check off — and requires the
  suite to go **red**, so a passing pristine run is not mistaken for proof (F-14/F-15 mutant proof, §8).

The read boundary and the snapshot harness are **two different artifacts**; neither substitutes for the
other.

## 10. Test approach & isolation

- **Bun only**; the existing `bun test src` runner; new tests live beside the new module and are run by
  `bun test`.
- **Existing store/helpers, isolated — but never injected into the core.** The fixture harness builds a
  temporary SQLite DB from the shipped migrations and may use `ResearchStore` only to seed it, then closes
  that seeding handle. The closed adapter invokes the existing `run(input, context)` with the fixture
  `databasePath`; `run` owns and closes its store. Neither the adapter nor the core retains a separate
  `ResearchStore` instance. Only the three allowed read actions can reach dispatch. No new DB engine or
  shipped runtime change.
- **Pure core, inert candidate seam.** The resolver and assembler are pure/injected so they can be unit-tested
  without a database; the evaluator feeds them **supplied, explicitly labelled candidate outputs** from
  `candidate-inputs.json` through a candidate-factory seam, carrying an **explicit injected provenance
  label** — **no model is invoked** in this envelope. The oracle `expected-outcomes.json` is **never read by
  the assembler/builder path**; the evaluator opens it **only** to compare after assembly.
- **Writes denied before dispatch, and mutant-proven.** The closed allowlist refuses any non-read action key
  before it reaches the store; the test asserts the denial and the **F-14/F-15 mutant red-run** (§8). A suite
  that cannot go red proves nothing by passing (`AGENTS.md`, keyboard-focus rule).

## 11. Verification gates (proposed; each currently absent)

These gates do **not exist yet**; they are the commands a future implementation run would execute. Existing
commands are marked as such.

| Gate | Command (planned unless marked) | Passes when |
|---|---|---|
| Types | `bun run typecheck` *(exists)* | compiles, includes the new module |
| Contract tests | `bun test src/librarian` | all F-1…F-20 assertions hold, incl. the F-14/F-15 mutant red-run |
| Full suite | `bun run check` *(exists)* | typecheck + build + tests green; **build output byte-identical** (no runtime change) |
| Offline evaluator | `bun run librarian:evaluate` | fixture digest recorded; artifact written |
| Zero-mutation | `bun harness/librarian-db-snapshot.mjs --force-write-attempt` | before/after **canonical logical** snapshots equal; write refused |
| Public hygiene | `bun run harness:records` *(exists)* | no live endpoint / identity-shaped text in the new committed files |
| Semantic evaluation | human review vs `expected-outcomes.json` *(manual)* | recorded model output matches expected outcome + cited support |

## 12. Non-goals

No live/deployed/credentialled access; no real-Axis read (separate authorization, D3); no mutation,
persistence, approval workflow or auto-confirmation; no new tool, table, column or schema; no schedule, poll,
daemon or monitor; no change to `src/actions.ts`, `src/ui.tsx`, the bundles or the manifest; no reopening of
the R-series validation or any accepted unit; no fabricated research.

## 13. OWNER authorization request

> Authorize the bounded, offline implementation of the Librarian / Reconciliation V1 evaluator slice: the
> synthetic fixture (`candidate-inputs.json` separate from the `expected-outcomes.json` oracle), typed-reference
> resolver, proposal **assembler**, offline contract evaluator, contract tests, isolated canonical-logical
> DB-snapshot harness and evidence report described above — with no runtime, tool, bundle, schema, persistence,
> schedule or live-access change, and with the real-Axis read held for a separate authorization. Problem-scoped
> steering is treated as a coverage limitation, never a fabricated projection. No canned output is to be
> presented as model reasoning, and a deterministic pass is not a claim of semantic usefulness.

Approval of the base design is recorded (**D-008**), and the **offline-envelope scope corrections** —
including the rename of the builder to `assembler.ts`, the separation of candidate inputs from the oracle, the
coverage-limitation treatment of problem-scoped steering, and canonical logical DB snapshots — are recorded as
**D-009**. Both are the **reviewer's rulings on the documents**, which authorize **no implementation**. **This
request is separate and is its own owner decision**: implementation requires the **owner's explicit
authorization**, which the design approval and the envelope ruling do not grant and do not imply. Until that
authorization is explicitly given, nothing described here is implemented.
