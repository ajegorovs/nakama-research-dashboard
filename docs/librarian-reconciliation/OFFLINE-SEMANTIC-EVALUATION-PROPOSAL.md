# Librarian / Reconciliation V1 — offline **model** semantic-evaluation proposal

**Status: PROPOSAL only — NOT authorized, NOT implemented.** This document is an **authorization envelope**:
it proposes one bounded next slice — a **model-driven** semantic evaluation of the accepted offline contract
evaluator's subject — and asks for a **separate owner authorization**. It changes no code, no migration, no
bundle, no schema and no test; it performs no live, deployed or credentialled access, no model invocation, no
mutation, no persistence and no monitoring, and it reopens no P1C/R-series work. It configures nothing.

It builds on the accepted structural slice ([`OFFLINE-EVALUATION-REPORT.md`](OFFLINE-EVALUATION-REPORT.md),
reviewer ruling **D-010**, [`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md)) and
the approved design ([`DESIGN-V1.md`](DESIGN-V1.md) §7.3, ruling **D-008**), with the offline-envelope scope
corrections of **D-009**. The accepted slice is structural: it proves the **contract** over **supplied**,
labelled candidates and proves **zero mutation**; it establishes **neither semantic usefulness nor
conflict-discovery capability** (D-010).

This is the first slice that would invoke a **model** at all. **D3** commits offline evaluation data first and
a supported read of one real Axis as a **separate, later owner decision**; it does **not** itself authorize
that read, nothing here performs it, and no later stage is reachable from this envelope without its own
approval.

## 1. What is being asked, and what is not

- **Asked:** authorization for **one envelope** — (a) to implement an **offline generation adapter** that turns
  a captured supported projection into a model prompt, invokes an **owner-approved** inference backend with
  hard budgets, and **captures** each model output with its full provenance; (b) to run a **bounded number of
  model executions** over a **frozen synthetic** corpus; (c) to pass the captured outputs through the
  accepted contract evaluator (plus the model-driven construct/recompute coordinator this slice adds); and
  (d) to record a **named human semantic-review checkpoint**.
- **Not asked, and not implied:** live/deployed/credentialled access; reading a real Axis; reading any
  production database; any mutation, persistence, approval workflow or new tool/table/column; any schedule,
  daemon, poll or monitor; any reopening of an accepted UX-v2/evidence-automation unit or of the R-series.
- **No silent model-judge.** The semantic verdict is a **named human's**, recorded with evidence. There is no
  automatic LLM judge and no machine-green semantic gate.
- **Separate from the accepted structural slice.** The structural acceptance (D-010) stands on its own; this
  proposal is a **new, separate authorization request**. Approving D-010 does not approve this, and approving
  this authorizes nothing until the owner explicitly says so.

## 2. What "offline" means here — stated, not implied

The accepted slice's candidates are **synthetic** and its evaluator is **deterministic**. In this proposal
**"offline" means the evaluation data is synthetic, frozen and non-production — it does not by itself mean the
inference transport is network-free.** A model has to be invoked somewhere, and that is the point of the
slice. Two transports are possible, and only the owner may choose between them:

- **Local inference (recommended default).** An already-installed, owner-owned local model server reachable on
  the operator's own host (loopback) or their local network — no third-party account and no per-token cost. It
  is the default because it keeps the slice inside the owner's own estate and needs no new commercial
  relationship. A local server is still an HTTP endpoint: "local" is a property of who owns and reaches the
  endpoint, not of the protocol.
- **An approved external/API backend.** A remote model API sends traffic **beyond the owner's estate** to a
  third party, entailing network egress and an account/credential. It requires **explicit owner
  authorization**, a named backend, and a stated egress scope. It is **not** proposed by default. Not every
  HTTP call is third-party: an owner-local server is not, and the two transports are distinguished by endpoint
  ownership and reach, never by the protocol.

Whichever is chosen, the **prompt consumes only the captured supported projection** (§5) — never a live read,
never a real database, never the oracle.

## 3. Current state — the offline evaluator versus the model seam (source-grounded inventory)

This section states precisely what exists today, so the proposal does not pretend the accepted constant-candidate
driver can be reused unchanged for a model-driven run. That would be false.

### 3.1 What the accepted slice actually does

- **`src/librarian/evaluate.ts`** replays cases from `candidate-inputs.json`; for each case it builds the
  bounded read (`get_topic`, optionally `search_dashboard`) through the closed read boundary and calls
  `assembleWithSnapshotDriver`. The **candidate is a fixed field of the fixture case** (`testCase.candidate`) —
  it is **not** produced by anything at run time.
- **`src/librarian/assembler.ts`** `assembleWithSnapshotDriver` performs the bounded **A/B/C** compare: read A,
  read B, compare; if A≠B, discard A and read C, compare B=C; if B≠C emit `snapshot_unstable` with no further
  reads. The **supplied constant candidate is validated exactly once** against the final stable observation
  (A when A=B, B on churn) and is **never constructed, regenerated or recomputed**. There is **no candidate
  factory and no model call** (`assembler.ts` docstring; `OFFLINE-IMPLEMENTATION-PROPOSAL.md` §5 disposition).
- **`src/librarian/references.ts`** is the fail-closed typed-reference resolver. **`read-boundary.ts`** is the
  closed, allowlisted read adapter (dispatches only `get_topic`/`get_overview`/`search_dashboard` through
  `run(input, context)`; the core never sees a `ResearchStore`).
- **`src/librarian/fixtures/*.json`** are the frozen synthetic inputs. `candidate-inputs.json` (the assembler's
  input) and `expected-outcomes.json` (the oracle) are **independent**; the oracle is opened only after
  assembly.
- **`harness/librarian-db-snapshot.mjs`** is the isolated canonical-logical zero-mutation instrument.

### 3.2 The seam the model must occupy — and why reuse is not adequate

DESIGN-V1 §7.3's approved protocol is **construct from A; on A≠B discard the A-built candidate and
recompute from B, before reading C**. The accepted slice deliberately does **not** do this: it holds the
candidate constant. A model-driven run **requires** the construct/recompute protocol, because the candidate is
now a function of an observation. Therefore this slice must add, at minimum:

1. a **candidate factory / generation seam**: `observation → candidate` (a model call with a captured prompt),
2. a **construct/recompute coordinator** implementing §7.3 exactly — generate the candidate from **A**; read
   **B**; if **A≠B**, **discard** the A-candidate and **regenerate from B** **before** reading **C**; if **B=C**
   deliver, else `snapshot_unstable`,
3. a **capture layer** recording each model output and its provenance (§4), and
4. a **parse / structural-failure boundary**: a model output that does not form a valid candidate is a
   **structural failure**, recorded and surfaced — **never repaired, coerced or silently accepted**.

The accepted code's pure pieces (references, coverage, proposal-shape validation, the read boundary, the
snapshot harness) are reused; the **driver and candidate source are new**. This proposal does not claim the
constant driver is adequate.

### 3.3 The candidate / oracle contract (exact — reuse, not reinvention)

The object the accepted `assessCandidate` validates (`assembler.ts`) is the **accepted `CandidateInput`** — the
assembler's input wrapper — so the structural contract is unchanged. It has two layers, and the distinction
matters: a harness-injected, **non-semantic** outer layer and the **model-generated semantic payload**. Only
the semantic payload is the model's output; `provenance` is trusted run metadata injected by the harness, not
text the model produces. The accepted `CandidateInput` (what `assessCandidate` consumes), matching
`candidate-inputs.json`, is:

```jsonc
{
  "provenance": "<injected, non-empty provenance label>",   // harness-injected trusted run metadata; NOT model-generated, NOT row-derived
  "outcome": "proposal" | "abstained" | "insufficient_evidence" | "snapshot_unstable",
  "claimStrength": "inferred" | "uncertain",                // present ONLY when outcome = "proposal"
  "text": "<non-empty reading>",                            // present ONLY when outcome = "proposal"
  "evidence_refs": [ <typed reference>, … ],                // ≥1 and resolvable when outcome = "proposal"
  "conflicts": [ { "reason": <reason>, "refs": [ <typed reference>, … ] }, … ]
}
```

- **Model-generated semantic payload vs accepted `CandidateInput`.** The model produces only the semantic
  payload — `outcome`, `claimStrength` (proposal only), `text` (proposal only), `evidence_refs` and
  `conflicts`. The harness wraps that payload in the accepted `CandidateInput`, **injecting** the trusted,
  non-semantic `provenance` label (run/model/prompt identity) **outside the model's text**. The model is
  **never required to mint provenance**, and provenance is **not** scored as a semantic property. The
  assembler still requires a non-empty injected `provenance` and still refuses `provenanceFrom` and any
  row-derived provenance.
- **Forbidden fields (refused):** `authority`, `reasoning_strength`. **Assembler-owned fields (refused as
  input):** `basis`, `coverage`. **Refused:** `provenanceFrom` (provenance is injected, not mintable),
  `reviewStatus` other than `unreviewed`.
- **Outcomes:** `proposal`, `abstained`, `insufficient_evidence`, `snapshot_unstable`.
- **Claim strengths:** `inferred`, `uncertain` — never `confirmed`, never authority.
- **Conflict reasons:** `human_steering_conflict`, `human_human_conflict`. A conflict requires
  `outcome = abstained`; an abstention requires ≥1 conflict.
- **Reference variants:** `axis_field` (`axisId`+`field`), `problem_field` (`problemId`+`field`), `activity`
  (`id`), `annotation` (`id`), `state_log` (`id`), `plan_step` (`id`). Field allowlists: axis —
  `state, kind, branch, prNumber, prUrl, currentState, blocker, stateConfidence, currentStateConfidence,
  blockerConfidence, version`; problem — `state, stateConfidence, statement`.
- **Oracle boundary.** The oracle (expected outcome + cited support, `pending_human_review`) is **never** in
  the prompt and **never** an input to generation. Generation sees only the captured supported projection.

## 4. Capture contract (exact model outputs and provenance, retained pre-parse)

Every model execution is captured to a **committed evidence artifact** — never a live endpoint, never a
secret. For each `(case, run)` the capture records:

- **Raw model output, byte-exact, retained before any parse.** The **original malformed output is kept** even
  when parsing fails. It is not discarded and not rewritten.
- **Raw request input digest(s):** a sha256 over the exact prompt/request bytes sent (and the exact projection
  the prompt was built from).
- **Provenance:** backend + model **name and version** (as the backend reports it), the **exact prompt text**,
  the **run name**, and a **run id**; plus any **decoding parameters** (temperature, top-p, seed, max tokens)
  and the **system/user wording** as sent.
- **Parse result:** the parsed candidate **if and only if** it parsed; otherwise the **parser error** recorded
  verbatim — a **structural failure**, never a repaired candidate.
- **Structural result:** the accepted evaluator's outcome over the parsed candidate (status, outcome, reads,
  digests, refusals) — reused unchanged.
- **Repeatability data:** the parameters above plus the per-case repeat index (§8). No elaborate benchmark
  framework is required; the capture file is the record.

**No secrets, ever.** No token, password, API key, account id, endpoint credential or environment value is
written into any committed artifact, prompt, transcript or digest. Backend credentials, if any, live only in
the estate's env files (outside this repo) and are referenced **by key name**, never by value.

**Disposition — the semantic payload is the model's; provenance is injected run metadata.** Unlike the
accepted slice's supplied candidates (which carry a hand-authored semantic payload and an injected provenance
label), the model-driven slice captures the **model's own** semantic payload (`outcome`, `claimStrength`,
`text`, `evidence_refs`, `conflicts`) and the **model's own** conflict discoveries. The captured `provenance`
is trusted **run/model/prompt metadata** injected by the harness **outside the model's text** — non-semantic,
never minted by the model, and never scored as a semantic property. The harness must **not** inject a conflict
label or a reading.

## 5. Generation adapter and isolation

- **Prompt source.** The prompt is built **only** from the captured supported projection (the frozen fixture
  rows a supported read would return), digest-stamped as in §4. It contains no live data and no oracle.
- **Model capability surface.** The model is given **no tools, no database access and no retrieval
  capability**; the only capability in scope is the single approved inference call it is invoked through. It
  is a text-in/structured-text-out call: any tool use, retrieval, or file/DB access is out of scope by
  construction. The one network call an approved remote backend entails is the inference transport itself
  (§2) — it is not an additional capability granted to the model's reasoning.
- **Adapter location and shipping.** The generation adapter is an **offline harness** — it is **not** imported
  by `src/actions.ts` or `src/ui.tsx`, is **not** part of `bun run build`, and adds nothing to the agent tool
  surface. It ships nothing to the product.
- **No new dependency or runtime — default to zero, shipped and dev-only alike.** The slice introduces **no
  new shipped runtime surface** and **no new dependency at all**: the generation adapter uses the **already
  installed Bun runtime's built-in `fetch`** (and `bun:sqlite` / the existing harness), so no client library,
  SDK or other dev-only dependency is added or assumed. If a specific backend genuinely required one, it could
  not be selected here — that would be its own separately justified decision. This document selects no
  dependency.

## 6. Synthetic adversarial corpus — exact case inventory and eligibility

The corpus is the **frozen** synthetic fixture (`dataset id librarian-fixture-v1`; seed: 2 topics, 8 axes, 9
annotations, 4 activities, 1 problem, 9 state-log rows, 1 plan/1 step). It carries **21 cases**, programmatically
enumerated and cross-checked between `candidate-inputs.json` and `expected-outcomes.json` (both list the same
21 — this is 21, not 20; `F-5b` is a distinct case and is **not** merged into `F-5`):

`F-1`, `F-2`, `F-3`, `F-4`, `F-5`, `F-5b`, `F-6`, `F-7`, `F-8`, `F-9`, `F-10`, `F-11`, `F-12`, `F-13`, `F-14`,
`F-15`, `F-16`, `F-17`, `F-18`, `F-19`, `F-20`.

**Eligibility — distinguish transport/rejection guard tests from semantic cases.** Only cases whose *whole
point* is a model reading are **semantic-eligible**. The rest are **guard tests** that a model-driven run must
keep green but that do **not** exercise model reasoning; running a model on them is unnecessary and is not
required.

| Class | Cases | Why | Model needed? |
|---|---|---|---|
| **Transport / rejection guards** | `F-11` (injected read failure), `F-14` (write denied before dispatch), `F-5b` (proposal on empty evidence refused) | assert the mechanical guard/refusal path, not a reading | **no** — keep as deterministic guards |
| **Reference / provenance refusals** | `F-12` (unknown id), `F-13` (spoofed provenance), `F-15` (label/index not identity) | assert the fail-closed resolver/mint rules on malformed *citations* | **no** (a model may still be run to see it produce a refusable citation, but that is not required) |
| **Snapshot mechanics** | `F-8` (A=B), `F-9` (A≠B, B=C), `F-10` (churn) | assert the bounded A/B/C coordinator, independent of the candidate's source | **partly** — F-9/F-10 drive the construct/recompute path the model now sits in |
| **Semantic cases** | `F-1`, `F-2`, `F-3`, `F-4`, `F-5`, `F-6`, `F-7`, `F-16`, `F-17`, `F-18` | the reading, its grounding, scope, coverage and conflict behaviour are what a model must get right | **yes** |
| **Supplied-candidate oracle cases** | `F-19` (structural pass ≠ semantic validity), `F-20` (provenance echoed verbatim) | encode properties of the **supplied** fixture candidate and its oracle, not a model reading | **no** — the oracle is authored for supplied candidates and cannot be the rubric for fresh output |

**F-19/F-20 are supplied-candidate oracle cases, not model examples.** The oracle in `expected-outcomes.json`
is authored for the **supplied** fixture candidates: F-19 (a structurally valid candidate the oracle rejects)
shows a structural pass is not semantic validity, and F-20 (an injected provenance label) shows the evaluator
echoes provenance verbatim. It is a reference for those supplied candidates and **cannot be expected to serve
as the semantic rubric for freshly generated model outputs**. This slice does **not** require the model to
reproduce a "semantically bad" output for F-19 nor F-20's injected label, and no result may be presented as
"the model failed F-19". A model-produced candidate for any case is judged by the **independently derived
rubric** in §8, never by the oracle's supplied-candidate verdict.

## 7. Reasoning gate — what the model must demonstrate

The semantic review (§8) judges whether the model, on the semantic-eligible cases, demonstrates:

- **Human–machine conflict.** Where a returned human `interpretation`/`steering` claim competes with the
  machine reading, the model recognises it, chooses `outcome = abstained`, emits a
  `human_steering_conflict` conflict citing the human claim, and **withholds** competing text (`F-2`).
- **Human–human conflict.** Where two returned human claims disagree, the model recognises the
  `human_human_conflict`, abstains, and does **not** resolve by recency, `confidence` or `author_type`
  (`F-3`).
- **Scope correctness.** It submits the **properly scoped typed reference** for each claim — an `axis_field`
  for axis-scoped evidence, an `activity`/`annotation` for topic-wide steering (`F-16`), a `state_log` for
  problem state-history (`F-17`) — never a reference that spans scope (e.g. whole-axis steering drawn from a
  problem-scoped row). The **resolver owns the resolved `role`/`scope`**: the reference grammar has no `role`
  field, so the model never submits `axis`/`topic`/`problem` as an input role — those are derived by
  `references.ts` from the returned row.
- **Honest coverage and abstention under unavailability.** Where coverage is UNKNOWN — including the
  **problem-scoped steering** coverage limitation — the model offers an evidence-limited synopsis or abstains,
  and **never asserts that no steering exists** and **never invents a problem-scoped claim** (`F-4`, `F-6`,
  `F-7`, `F-18`). A problem-scoped annotation is **not in the returned projection**, so the model is never
  required to cite — or invent — one; if such a citation is submitted, the resolver fails it closed (`F-4`).

## 8. Semantic rubric and the human-review checkpoint

- **A pre-defined, independently derived rubric** scores each semantic-eligible case **PASS** or **FAIL**, each
  with **per-case evidence** (the captured output, the cited refs, the coverage, and the reviewer's note). The
  rubric's expectations are derived from **what the captured supported projection visibly returns** — the same
  evidence the model sees. The oracle's fixed vocabulary (`expected-outcomes.json`
  `semantic.verdict`/`note`: `accept`, `accept_abstention`, `accept_refusal`, `accept_evidence_limited`,
  `reject`) is a reference, not a substitute: it is authored for the **supplied** candidates and does not
  automatically fit freshly generated output. The rubric is fixed **before** the run. The oracle itself — the
  hidden expected annotations — is **never exposed** to the model and **never** placed in the prompt; only the
  visible projection is.
- **The semantic verdict is a named human's responsibility.** No automatic LLM judge silently decides
  PASS/FAIL; if any assisted triage is ever used, it is a **recorded aid**, never the verdict, and the named
  reviewer owns the final call. A `cannot_review` outcome is allowed and recorded, never coerced to PASS/FAIL.
- **The oracle is immutable and stays `pending_human_review`.** The original `expected-outcomes.json` is a
  frozen artifact; its `semantic.status` is **never** modified. A human verdict is recorded in a **new,
  separate** review record (the §10 review doc), which references the frozen oracle — it does not edit it.
- **Repeatability.** Generation is non-deterministic; the rubric records the decoding parameters and a small
  fixed number of repeats per case (§8), and a case is judged on the **recorded set**, not a single lucky
  sample. The repeat count, seed policy and any observed variance are stated in the review record. No
  benchmark infrastructure beyond the capture file is required.

## 9. Budgets — bounded, fail-closed, no substitute provider

- **Invocation budget:** a hard cap on model invocations per case and per run, fixed before the run.
- **Token budget:** a hard cap on prompt and completion tokens per invocation.
- **Attempt cap:** a bounded number of attempts per case; on exhaustion the case is recorded as a
  generation failure, **never retried unboundedly**.
- **Generation errors terminate.** A backend/model/generation error ends that case's attempts and is recorded
  as a **generation failure**; the slice does **not** silently **substitute another provider or model**.
- **Read budget unchanged.** The bounded ≤3-read A/B/C discipline and no-further-reads-after-`snapshot_unstable`
  rule are preserved; the model adds construction attempts to the bounded protocol, not reads.

## 10. Exact planned paths and gates (planned, NOT existing)

Grounded in the current tree. **Every `new` path below does not exist yet**; the **single** planned edit is
`package.json` (one script). The review and run-report docs below are new files, not edits; no currently
tracked doc is modified by this proposal. No shipped action/store/ui/manifest/migration/bundle changes.

| Planned path | Kind | Purpose | Runtime impact |
|---|---|---|---|
| `src/librarian/prompt.ts` | new module | Pure prompt builder from a captured supported projection | none — not imported by actions/ui |
| `src/librarian/model-candidate.ts` | new module | Candidate factory seam + parse/structural-failure boundary (observation → candidate, captured) | none |
| `src/librarian/model-coordinator.ts` | new module | DESIGN-V1 §7.3 construct → discard → recompute coordinator over the generation seam | none |
| `harness/librarian-generation/run.mjs` | new harness | Offline generation adapter: invoke the approved backend under budgets, capture raw output + provenance | none — not shipped, not in build |
| `src/librarian/fixtures/semantic-cases.json` | new data | Frozen generation inputs (subject + captured projection per eligible case); oracle stays separate | none |
| `docs/librarian-reconciliation/semantic-review/<date>-<run>.md` | new doc | The named-human semantic-review checkpoint record | none |
| `docs/librarian-reconciliation/OFFLINE-SEMANTIC-EVALUATION-RUN-REPORT.md` | new doc | The run's evidence report (results, capture pointer, gates) | none |
| `package.json` (one script) | edit | Add a `librarian:semantic-eval` script | none at runtime |

**Planned gates (existing commands marked `*(exists)*`; `*(new)*` entries do not exist yet):**

| Gate | Command | Passes when |
|---|---|---|
| Types | `bun run typecheck` *(exists)* | compiles with the new modules |
| Full suite | `bun run check` *(exists)* | green; **build output byte-identical** (no shipped change) |
| Unit / contract tests | `bun test src/librarian` *(exists)* | existing unit and contract tests stay green, incl. the in-suite fixture invocation and negative controls — **this does not itself enumerate the 21 fixture cases** |
| Fixture structural evaluation | `bun run librarian:evaluate` *(exists)* | all **21** fixture cases structurally pass (F-1…F-20 plus `F-5b`); new model-candidate structural failures added as the seam lands |
| Generation capture | `bun run librarian:semantic-eval` *(new)* | every execution captured with raw output pre-parse + request digest + provenance; budgets respected; parse failures recorded as structural failures |
| Zero-mutation | `bun harness/librarian-db-snapshot.mjs --force-write-attempt` *(exists)* | logical snapshots equal; control write detected |
| Public hygiene | `bun run harness:records` *(exists)* | no live endpoint, home path, or secret in any committed capture |
| Semantic review | named human vs the fixed rubric *(manual)* | per-case PASS/FAIL or cannot_review in a separate record; original oracle remains immutable |

## 11. Decisions for the reviewer (the two or three that are genuinely the owner's)

These are the decisions this proposal cannot make for the owner. No other operational questions are posed.

- **S-1 — Model backend and execution budget.** Choose **local, already-installed owner inference (recommended
  default; no third-party egress, no paid/remote account)** **versus an explicitly approved external/API
  backend (third-party egress + account/credential, owner-authorized)**. With the choice, fix the **invocation
  cap, token cap and attempt cap** (§9). No backend is selected or inferred here; the current chat model does **not**
  imply an authorized evaluation backend. Actual backend discovery, if needed, is a **future, separately
  authorized** read of a **non-secret** config document — **no credential is read now**, and **no other
  profile is modified**.
- **S-2 — Human review role and gates.** Name the **reviewer role** (a specific named human, independent of
  the implementer), approve the **fixed semantic rubric** (§8), and confirm the **acceptance checkpoint**: the
  slice closes green **only** on the named human's recorded per-case verdict — never on a machine or an LLM
  judge.
- **S-3 — Repeatability and corpus scope.** Confirm the **semantic-eligible corpus** (§6) and the
  **repeat policy** — how many generations per case and the seed/parameter logging (§8) — that bound the run.

## 12. Authorization request (one envelope)

> Authorize one bounded envelope: implement the offline generation adapter, prompt builder, candidate
> factory and the DESIGN-V1 §7.3 construct/discard/recompute coordinator; run a **bounded** number of model
> executions with the S-1 caps against the **frozen synthetic** corpus; **capture** every raw model output
> (pre-parse, malformed retained), its request-input digest, and its model/prompt/run provenance; pass the
> parsed candidates through the accepted contract evaluator and the isolated zero-mutation harness; and
> record a **named human semantic-review checkpoint** against the fixed S-2 rubric — all with **no shipped
> runtime, tool, bundle, schema, persistence, schedule or live-access change**. The **real Axis is
> explicitly excluded**: it remains the separately authorized real-Axis read under D3's later, distinct owner
> decision. Any external/API backend requires the explicit S-1 authorization and egress scope. No secret is ever written to an artifact;
> no other profile is modified.

Approval of the base design (**D-008**), the offline-envelope corrections (**D-009**), and the structural
acceptance (**D-010**) authorize **no** model evaluation. This request is its own owner decision; until that
authorization is explicitly given, nothing described here is implemented and no model is invoked.

## 13. Non-goals

No live/deployed/credentialled access; no real-Axis read (D3 commits offline data first; the real-Axis read is a separate, later owner decision); no production DB read;
no mutation, persistence, approval workflow or auto-confirmation; no new tool, table, column or schema; no
schedule, poll, daemon or monitor; no change to `src/actions.ts`, `src/ui.tsx`, the bundles or the manifest;
no new shipped dependency or runtime; no automatic LLM semantic judge; no reopening of P1C/R-series or any
accepted unit; no fabricated research; no secret in any artifact. Archiving the structural report is optional
— this proposal document is the durable deliverable.
