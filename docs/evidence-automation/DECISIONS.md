# Evidence Automation — standing decisions

Standing, dated record of product and validation decisions. The first entry closes the P1B/P1C
validation campaign. Nothing here authorizes a commit, push, deployment, service restart,
enrollment, credential, scheduling or corpus/fixture write; those remain separately
owner-authorized.

---

## D-001 — 2026-10-05 · P1C closed with qualified acceptance

**Decision.** P1C is closed with **qualified acceptance**. No R9 is authorized or requested.

**Ruling (verbatim):**

> P1C is closed with qualified acceptance; no R9 is authorized or requested. R8 itself did not
> achieve controlled single-run closure: it stopped after PR #5 merged because the first bounded
> post-merge observation did not produce the expected PR fact, and the preserved phase diagnostic
> is insufficiently phase-local to prove the exact internal failure mode. Nevertheless, the
> cumulative P1B/P1C evidence is sufficient to validate Evidence Automation V1's transport,
> discovery, identity, delivery, replay, provenance, authorization, caching, served-build guard,
> hard-stop and containment mechanisms. Remaining uncertainty concerns asynchronous upstream
> visibility and validation-harness phase diagnostics, not a demonstrated loss-of-event defect.
> Correct the diagnostic bookkeeping offline, archive the campaign, integrate the accepted
> production changes, and move the product roadmap forward rather than manufacturing further
> synthetic closure runs.

**What "qualified acceptance" means.** The cumulative P1B/P1C validation established the
transport, discovery, identity, delivery, replay, provenance, authorization, caching,
served-build guard, hard-stop and containment mechanisms. It did **not** produce a single pristine
green controlled run, and the archived R8 phase diagnostic cannot prove its own internal failure
mode. No loss-of-event defect was demonstrated. The disposition is therefore *accepted, with the
single-run closure result and the phase-diagnostic quality carried as known limits* — not a clean
closure claim.

**Live-run record (immutable, historical).** The one authorized R8 unit stopped at the `after_pr`
observation after PR #5 merged. The archived record is
`P1C-R8-served-guard-live-stop-20261005T023011Z.zip`,
sha256 `7d2ecc2890386b3f54fc4e9002298c8680f47abeb03f6110feaad938dc3504e6`. No further synthetic
closure run is authorized or wanted.

---

## D-002 — 2026-10-05 · Eventual-monitor contract (durable wording)

> An upstream-eligible fact remains discoverable until it is observed exactly once. Monitoring may
> require a later poll, because upstream visibility is asynchronous.

This is a precise statement of the **intended** contract. It is **not** a claim that the
visibility bound or the mechanism is proven; see D-003.1.

---

## D-003 — 2026-10-05 · Unresolved limits carried out of P1C

1. **Asynchronous upstream visibility — bound unknown.** The eventual-monitor window that would
   guarantee a post-merge fact is observed is not established. The R8 stop is consistent with a
   visibility lag, not a lost event.
2. **Production eventual-monitor semantics undeveloped.** No periodic, authenticated production
   GitHub monitor exists or is authorized; its operational semantics (cadence, authorization,
   failure policy, separation from the read-only validation harness) are a future,
   separately-authorized decision.
3. **Harness phase diagnostics — historical gap.** The validation harness's failure diagnostics
   were not phase-local, so the archived R8 failure mode cannot be proven from the preserved
   evidence. The bookkeeping was corrected **offline** for any future observation (D-004); the
   historical cause is not recoverable.

---

## D-004 — 2026-10-05 · Validation diagnostics must be phase-local (offline correction)

The R8 live stop persisted a failure snapshot whose outer `phase` was `after_pr` while its inner
last attempt and request count were inherited from `after_feature` — a run-scoped, not
phase-scoped, capture. The corrected contract, implemented in the offline validation harness:

- the attempt observer is reset/bound to the phase **before** the anonymous visibility check and
  the worker invocation;
- each phase owns a fresh, immutable trace of its own attempts, meta, stage, request counts,
  observation outcome and start/end; nothing is inherited across phases;
- a phase that fails at its prefilter before the worker runs records `workerNotRun` with zero
  worker requests — explicit absence, never a stale value;
- attempt records are frozen and persisted snapshots are deep copies, so a later request cannot
  mutate a persisted snapshot;
- failure capture happens before abstraction and records the observation outcome, the phase's own
  trace, the error type/message, the exact failed phase and the phase epoch.

Regression tests assert each of these. This corrects **bookkeeping only**; it is not a
re-attestation of the archived R8 result and does not retro-prove the historical failure mode.

---

## D-005 — 2026-10-05 · Product semantics vs historical validation harness

Product-facing documentation (`CONTRACT.md`, `STATUS.md`, `INTEGRATION-BASELINE.md`, the worker's
`README.md`) describes the **product semantics only**: the deterministic synchronizer, the
host-enforced ingest-only collector identity, the atomic plugin ingest/provenance/readback
contract, and the accepted implementation points. The R1→R8 driver — phase gates, dynamic budget,
external-IO guard, sealed-driver diagnostics, served-build guard wiring, budget-guard framework —
is a **historical validation harness**, not part of the product architecture, and is not shipped
with the product. Its records are retained for traceability, clearly separated from the product
semantics.

---

## D-006 — 2026-10-05 · Product roadmap — Librarian / Reconciliation V1 (design only, NOT implemented)

The first bounded slice of this direction is now scoped as a **design proposal only** in
[`../librarian-reconciliation/DESIGN-V1.md`](../librarian-reconciliation/DESIGN-V1.md): one existing
Axis, observe its deterministic stored evidence, deliver a current-work interpretation as a
**proposal** with evidence references, an explicit `claimStrength` (`inferred`/`uncertain`) and
coverage, and **no authoritative mutation**. Axis selection and any human-confirmation step remain
separately gated.

Recorded as direction, not scope; **no part of this is implemented** and nothing here is
authorized by the retired validation campaign.

- **Deterministic stored facts + agent proposals.** The reconciliation surface is built on stored,
  deterministic facts; an agent contributes *proposals*, never silent mutations.
- **Axis / Problem association.** Reconciliation operates over the existing Axis/Problem
  association; it does not invent hierarchy.
- **Current-work blocker summaries.** A summary surface states what currently blocks work, with
  facts and proposals clearly distinguished.
- **Claim strength vs. human-steering authority (separated).** A proposal carries a **claim strength**
  (`inferred` | `uncertain`) — the strength of its own claim, **never** authority, **never** the stored
  `confidence` vocabulary and **never** `confirmed`. **Human-steering authority is a separate precedence
  rule**, stated explicitly: a human's steering outranks the machine's reading and is never inferred from
  provenance (`author_type`), stored `confidence`, `created_at` or row order. No field named `authority` is
  introduced. Aligned by **D-008** to the approved-with-amendments design
  [`../librarian-reconciliation/DESIGN-V1.md`](../librarian-reconciliation/DESIGN-V1.md).
- **Operationalization = future period.** Any operational lifetime implies periodic,
  **separately authorized** authenticated production GitHub reads. That is not scheduled now and
  is a distinct owner decision.
- **Event-driven, no fabricated research.** Usefulness is expected to be natural and event-driven;
  no research is fabricated to justify the feature.

---

## D-007 — 2026-10-05 · P1C integration accepted (durable ruling)

**Decision.** P1C integration is **accepted**. The closeout and the accepted implementation points are
the current state; no R-series validation is reopened. The ruling is recorded verbatim below.

**Ruling (verbatim):**

> P1C integration accepted. Dashboard actor attribution at `b34b252…` and synchronizer bounded discovery
> at `89e4f301…` match the accepted production scope. Historical implementation baselines are preserved.
> The closeout accurately records qualified acceptance, the unknown asynchronous-visibility bound,
> deferred/unauthorized periodic monitoring, and the separation of R-series validation tooling from
> product architecture. No R-series validation should be reopened. Two stale current-state sentences in
> `INTEGRATION-BASELINE.md` and `STATUS.md` should be corrected for handoff clarity; these
> documentation-only corrections do not block the next milestone.

**What this adds.** The two named stale sentences are corrected in this same change:
[`INTEGRATION-BASELINE.md`](INTEGRATION-BASELINE.md) (the "next pilot scope" line now records the pilot
as historical and names the current direction) and [`STATUS.md`](STATUS.md) (the generic
commit/push/integration line narrows to **further** operations). These are documentation-only and add no
review cycle. The accepted points themselves — plugin actor attribution
`b34b2525f5bde0bba383c64b350b29a3d742125c`, synchronizer bounded discovery
`89e4f301ba52788cb98cca8fd4085510b1040f20` — and the historical baselines are unchanged.

---

## D-008 — 2026-10-05 · Librarian / Reconciliation V1 design approved with amendments (durable ruling)

**Decision.** The Librarian / Reconciliation V1 design is **approved with amendments**. The amendments
have been incorporated into [`../librarian-reconciliation/DESIGN-V1.md`](../librarian-reconciliation/DESIGN-V1.md);
D-006 is aligned to the claim-strength / authority distinction they require. This ruling authorizes **no**
implementation, live access, mutation, persistence, scheduling or monitoring, and reopens no R-series
validation. The ruling is recorded verbatim below.

**Ruling (verbatim):**

> Librarian/Reconciliation V1 design is approved with amendments. D1 reply-only delivery is approved;
> persistence and confirmation workflows remain deferred. D2 conflict reporting with abstention is approved,
> including mandatory abstention on unresolved human–human disagreement. D3 committed offline evaluation
> data first, followed by separately authorized supported reads of one real Axis, is approved. Before
> implementation, rename the proposal's `authority` field so `inferred/uncertain` denotes claim strength
> rather than authority; align standing decision D-006 with that distinction; omit uncalibrated model
> reasoning strength from V1; define typed resolvable evidence references and structured abstention/conflict
> outcomes; bound snapshot recomputation; and distinguish the librarian's read-only runtime surface from
> authoritative isolated-test verification of zero mutation. The offline fixture should exercise adversarial
> semantic branches, not only a happy path. These amendments do not alter the approved one-Axis,
> proposal-only architecture.

**How each amendment lands (see the design doc for detail).**

- **`authority` → `claimStrength` (`inferred`/`uncertain`).** The proposal field is renamed so the label
  denotes the strength of the proposal's own claim, not authority over anything; a proposal has no authority.
  DESIGN-V1 §3.4, §4, §5.2.
- **D-006 aligned.** D-006's "human steering authority" bullet is rewritten to separate **claim strength**
  from the **human-steering precedence rule**; see its updated bullet above.
- **No uncalibrated model reasoning strength.** The `reasoning_strength` field is omitted from V1 entirely;
  no `authority` field is added.
- **Typed resolvable evidence references.** A small finite reference grammar (`axis_field`/`problem_field`/
  `activity`/`annotation`/`state_log`/`plan_step`) grounded in real stored ids and real exposed field names,
  with a **fail-closed** resolver (unknown ids, scope mismatches and ambiguous variants are
  refused; identical references are deduplicated; display labels and list indices are never citation
  identity). DESIGN-V1 §5.5.
- **Structured abstention / conflict outcomes.** An `outcome` (`proposal`/`abstained`/
  `insufficient_evidence`/`snapshot_unstable`) plus structured `conflicts[]` (`refs` + `reason`
  `human_steering_conflict`/`human_human_conflict`); a withheld reading emits no competing text. DESIGN-V1
  §5.2, §7.
- **Bounded snapshot recomputation.** A construct→compare (A/B), one reconstruct→compare (B/C), then
  `snapshot_unstable` with no further reads or recomputes — never a loop. DESIGN-V1 §7.3.
- **Read-only runtime surface vs. authoritative verification.** The librarian's runtime allowlist is a
  *surface* property; proof of **zero mutation** comes only from an **isolated DB-snapshot instrumentation
  harness** that is never an input the librarian reads. DESIGN-V1 §7, §9.

**Offline fixture.** The committed evaluation fixture must exercise **adversarial semantic branches**, not
only a happy path. The bounded, offline, proposal-only implementation plan — not itself authorizing
implementation — is [`../librarian-reconciliation/OFFLINE-IMPLEMENTATION-PROPOSAL.md`](../librarian-reconciliation/OFFLINE-IMPLEMENTATION-PROPOSAL.md).
No implementation is authorized by this entry; a separate authorization request would carry it.

**Superseded in part by D-009.** D-009 corrects the offline-envelope assumptions this entry's proposal made
about problem-scoped steering (it is **not** returned by supported reads) and renames/moves some planned
paths. The D-008 verbatim ruling above is preserved unchanged as the historical design ruling; D-009 owns the
later, bounded envelope corrections.

---

## D-009 — 2026-10-05 · Librarian / Reconciliation V1 offline envelope approved with scope corrections (durable ruling)

**Decision.** The offline contract-evaluator envelope
([`../librarian-reconciliation/OFFLINE-IMPLEMENTATION-PROPOSAL.md`](../librarian-reconciliation/OFFLINE-IMPLEMENTATION-PROPOSAL.md))
is **approved with scope corrections**. The corrections have been incorporated into that proposal and into
[`../librarian-reconciliation/DESIGN-V1.md`](../librarian-reconciliation/DESIGN-V1.md). This ruling authorizes
**no** implementation, live access, model reasoning evaluation, mutation, persistence, monitoring or
R-series work. The ruling is recorded verbatim below.

**Ruling (verbatim):**

> Librarian/Reconciliation V1 offline contract-evaluator proposal is approved with scope corrections. The
> synthetic adversarial corpus, typed-reference resolver, structured proposal contract, bounded A/B/C snapshot
> coordinator, closed read adapter, discriminating negative controls and isolated zero-mutation harness are an
> appropriate first implementation slice. Before implementation, correct the assumption that problem-scoped
> steering annotations are returned by current supported reads; they are not exposed through `get_topic`, so
> their absence is an explicit coverage limitation and F-4/F-17 must not fabricate that projection. Keep
> problem state-history coverage where it is genuinely returned. Treat supplied semantic assessments as inputs,
> not discoveries of the deterministic evaluator; keep candidate inputs independent from the expected oracle;
> and use canonical logical DB snapshots for non-mutation proof. These are bounded corrections, not a new
> design decision. Live Axis access, model reasoning evaluation, persistence, mutation, monitoring and
> R-series work remain excluded.

**Canonical source verification of the correction.** An `interpretation`/`steering` annotation carries exactly
one canonical target — topic **or** axis **or** problem — enforced by the one-canonical-target CHECK
(`migrations/004-ux-v2-model.sql:302-324`). `listAnnotations({ axisId })` matches only rows whose `axis_id`
is that axis, and `listTopicNotes` matches `topic_id = ? AND axis_id IS NULL` (`src/store.ts:2261-2286,2357-2371`);
a problem-scoped claim (`axis_id` NULL, `topic_id` NULL) is therefore returned by **neither** projection and
is **not exposed through `get_topic`**. What a problem *does* genuinely return is its state history
(`ProblemDetail.history`, `StateLogEntry[]`, `src/store.ts:1246-1253,2490`), and that coverage is kept.
Problem-scoped steering is assembled only by the page-only Progress projection
(`ProgressProblemRow.steering`, `src/store.ts:5104-5134,5330,1464,534`), which is `get_progress`
(`exposeAsTool: false`) and unreachable from the agent surface.

**How each correction lands.**

- **Problem-scoped steering is a coverage limitation, not a projection.** DESIGN-V1 §5.1/§5.5/§8 and the
  fixture matrix F-4/F-17 are corrected: V1 neither receives nor fabricates a problem-scoped steering
  projection, and a citation to a problem-scoped annotation id is refused (absent from the bundle).
- **Problem state-history kept where returned.** `ProblemDetail.history` remains a citable, returned source
  (typed role `problem`).
- **Supplied assessments are inputs, not discoveries.** The deterministic evaluator checks supplied, injected
  candidate/conflict assessments; it does not parse free text or "discover" semantics. Provenance is injected
  explicitly. OFFLINE-IMPLEMENTATION-PROPOSAL §7.
- **Candidate inputs separated from the oracle.** Supplied candidates live in `candidate-inputs.json`; the
  expected oracle in `expected-outcomes.json` is **never read** by the builder/assembler — the evaluator
  compares only after assembly. OFFLINE-IMPLEMENTATION-PROPOSAL §5, §7.
- **Canonical logical DB snapshots.** Zero-mutation proof compares canonical logical content (schema, user
  tables' row counts and rows in a canonical sorted order), never SQLite/WAL bytes. OFFLINE-IMPLEMENTATION-PROPOSAL
  §9.
- **Renames (planned paths only).** The builder module `proposal.ts` is renamed `assembler.ts` so it is not
  confused with the proposal document it consumes. No real file exists yet.

---

## D-010 — 2026-10-05 · Librarian / Reconciliation V1 offline contract-evaluator slice accepted (durable ruling)

**Decision.** The Librarian / Reconciliation V1 **offline contract-evaluator slice** at
`afd0dc793e6f031afe2e84d78fb0ce52c4ae93eb` is **accepted** — a **structural (contract) acceptance only**.
The ruling is recorded **verbatim** below; the disposition notes that follow are this record's, not additions
to the ruling. The slice's own evidence is
[`../librarian-reconciliation/OFFLINE-EVALUATION-REPORT.md`](../librarian-reconciliation/OFFLINE-EVALUATION-REPORT.md);
the concise acceptance record is
[`../reviews/2026-10-05-librarian-offline-acceptance-record.md`](../reviews/2026-10-05-librarian-offline-acceptance-record.md).

**Ruling (verbatim):**

> Librarian/Reconciliation V1 offline contract-evaluator slice accepted. The implementation at `afd0dc7` is
> faithful to the owner-authorized offline envelope. Typed citation resolution, structured proposal
> validation, supported-read isolation, finite snapshot comparison, independent synthetic candidate/oracle
> inputs, adversarial structural fixtures, discriminating negative controls, and authoritative
> logical-database non-mutation verification are accepted. The shipped dashboard/product surfaces remain
> unchanged. The supplied constant-candidate snapshot specialization is accepted **only for this structural
> offline evaluator** and does not replace the approved model-driven candidate reconstruction protocol.
> Structural acceptance establishes neither semantic usefulness nor conflict-discovery capability.
> Problem-scoped steering annotations remain a known supported-read coverage limitation. No live Axis access,
> model reasoning evaluation, persistence, mutation, monitoring, deployment, or P1C/R-series work is
> authorized by this acceptance.

**Disposition (this record's — not the ruling's).**

- **Structural only.** Acceptance certifies the contract evaluator's structure over supplied synthetic
  candidates and the isolated zero-mutation proof. It is **not** a claim of semantic usefulness, semantic
  faithfulness, or conflict-discovery capability, and it does not move any fixture case's
  `semantic.status` off `pending_human_review`.
- **Constant-candidate specialization.** The supplied **constant** candidate — validated exactly once against
  the final stable observation and **never regenerated** — is accepted **only** as this offline structural
  evaluator (the disclosed specialization of DESIGN-V1 §7.3, `OFFLINE-IMPLEMENTATION-PROPOSAL` §5). It does
  **not** replace the approved model-driven candidate **construct → discard → recompute** protocol; reusing
  the code with a model- or runtime-constructed candidate still requires that protocol under its own future
  authorization.
- **F-19 remains a validator limit, not a model result.** F-19 (a structurally valid supplied candidate whose
  oracle verdict is `reject`) demonstrates that a structural pass is not semantic validity. It is **not**
  evidence that a model produces semantically bad output, and no later evaluation may present it as a model
  semantic failure example.
- **Problem-scoped steering.** It remains a known supported-read coverage limitation (UNKNOWN; a citation to a
  problem-scoped annotation id fails closed). It is neither returned nor fabricated.
- **Excluded (no authorization by this acceptance).** Live/deployed/credentialled access; reading a real Axis;
  model reasoning evaluation (preparation of a bounded proposal for it is a **documentation-only** action, not
  its authorization); persistence, mutation, approval workflow; scheduling, daemons, polling, monitoring;
  deployment or service restart; any reopening of P1C or the R-series validation.

---

## D-011 — 2026-10-05 · Librarian / Reconciliation V1 offline model semantic-evaluation proposal approved with amendments (durable ruling)

**Decision.** The Librarian / Reconciliation V1 **offline model semantic-evaluation proposal**
([`../librarian-reconciliation/OFFLINE-SEMANTIC-EVALUATION-PROPOSAL.md`](../librarian-reconciliation/OFFLINE-SEMANTIC-EVALUATION-PROPOSAL.md))
is **approved with amendments**. The amendments have been incorporated into that proposal and are **binding on
the first run**. This ruling approves the **envelope**: it selects **no** backend, authorizes **no**
dependency, and authorizes **no** model invocation. The owner must still **select the inference backend**
(local is the stated default; external egress is separately authorized) and give an explicit **execution
go-ahead** before anything runs. The ruling is recorded **verbatim** below; the disposition notes that follow
are this record's, not additions to the ruling.

**Ruling (verbatim):**

> Librarian/Reconciliation V1 offline model semantic-evaluation proposal approved with amendments. Use an
> explicitly owner-selected local inference backend by default; external egress remains separately authorized.
> Before execution, restrict model-generated outcomes so `snapshot_unstable` is coordinator-owned; freeze and
> hash the human semantic rubric before any model output exists; define a lossless pre-parse capture artifact
> with immutable prompt/model/run provenance; and enforce an endpoint/redirect/timeout/size transport boundary.
> The model should receive deterministic coverage metadata together with supported returned evidence, with
> stored content explicitly treated as data rather than instructions. For the first run, use the ten semantic
> cases with three predeclared repeats each plus one model-driven F-9 and F-10 reconstruction exercise, for a
> hard maximum of 34 inference calls and no automatic retries. The semantic milestone closes green only if
> every required recorded semantic repeat passes the structural contract and the named human review. Real-Axis
> access, persistence, mutation, monitoring, deployment and P1C/R-series work remain excluded.

**How each amendment lands (see the proposal for detail).**

- **Local inference is the default; external egress is separately authorized.** §2 states the local,
  owner-owned server as the default transport and keeps any external/API backend behind its **own** explicit
  authorization and stated egress scope. No specific server, model, port or path is named or inferred.
- **`snapshot_unstable` is coordinator-owned.** §3.2/§3.3 restrict the **model's** outcome set to
  `proposal` / `abstained` / `insufficient_evidence`; `snapshot_unstable` is emitted **only** by the
  construct/recompute coordinator on **B ≠ C**, and a model payload carrying it is an invalid payload
  (structural failure), never accepted.
- **The human semantic rubric is frozen and hashed before any output.** §8 plans
  `docs/librarian-reconciliation/semantic-rubric-v1.md`, committed and **sha256-hash-pinned (with its repo
  commit) before the first inference call**; per-case PASS criteria are **checkable conditions, not prose**;
  a later edit is a new version, never an in-place change.
- **Lossless pre-parse capture with immutable provenance.** §4 decodes and extracts the completion **content**
  from the **transient** HTTP response, then **UTF-8 encodes it exactly as extracted (unnormalised)** and
  records those exact bytes **base64-encoded, with a sha256 over those exact bytes computed before any
  parse**. The captured bytes are the extracted completion, **not** the raw provider envelope or wire body;
  the raw body is **not** kept as a separate artifact, and no `extracted text == wire bytes` equivalence is
  claimed. **No complete provider response** and **no account metadata** is retained; provenance pins the repo
  commit, prompt template, the exact prompt/request bytes digest, the **frozen fixture file digests** (not only
  the projection digest), the projection digest, and the model identifier plus the **available local artifact
  hash — or an explicit `unknown`** where none exists.
- **Transport boundary: endpoint / redirect / timeout / size.** §5 pins the exact origin, path and model;
  **refuses redirects** (preferred `redirect: "error"`, no fallback — a redirect is a hard transport failure);
  enforces a **finite timeout** and **request/response byte caps** as a backstop. The concrete proposed
  defaults — **token caps prompt ≤ 8000 / completion ≤ 1000 (tokens)**, **request ≤ 256 KiB / response ≤
  64 KiB**, **timeout 120 s** — are **labelled proposed and NOT authorized**.
- **Deterministic coverage metadata; stored content is data.** §5 passes the model the supported returned
  evidence together with a **deterministic coverage summary computed from the API's own semantics (never the
  oracle)**; the delivered `basis`/`coverage` stay **assembler-owned** (the model may not author them); and
  stored content is **quoted data with no prompt authority**.
- **The first-run budget.** §9 fixes the call set: ten semantic cases × three predeclared repeats (**30**)
  with **three predetermined seeds and no replacement seeds** plus one model-driven **F-9** and **F-10**
  reconstruction exercise, two calls each (**4**) — **hard maximum 34 inference calls, no automatic retries**;
  a failed repeat is recorded **failed** and does **not** cancel the case's other predeclared repeats; `F-8`
  is deterministic and contributes no calls.
- **Green is structural AND human.** §8: the milestone closes green **only if every required recorded semantic
  repeat passes both the structural contract and the named human review**; a **FAIL**, **`cannot_review`**,
  **refused** or **malformed** output is **non-green**.
- **Exclusions unchanged.** Real-Axis access, persistence, mutation, monitoring, deployment and P1C/R-series
  work remain excluded.

**Open owner selections carried with this ruling (not decided here).** Backend selection (S-1); explicit
execution authorization; the named human reviewer (a **stable public handle**, independent of the implementer
and of generation); approval of the frozen `semantic-rubric-v1`; the frozen transport/token defaults; and the
**unresolved injection-case budget disposition** — a requested **semantic-only** injection check that is
**not** a change to the original structural fixtures and **not** an increase beyond the 34-call cap. The
proposal recommends a **within-budget** variant (one eligible case, e.g. a new deterministic `F-18`
semantic-only projection preserving subject/domain facts and the coverage limitation, frozen separately,
over its three repeats) but leaves the disposition **open** for the
owner.

**No execution authorized.** No backend is selected; no dependency is approved; no model is invoked; no
credential is read; no other profile is modified. Approving D-011 does not approve a run.

---

## D-012 — 2026-10-05 · Librarian / Reconciliation V1 semantic-evaluation *preparation* authorized (owner ruling; distinct from backend selection and execution)

**Decision.** The owner authorizes **preparation only** for the Librarian / Reconciliation V1 offline model
semantic evaluation: authoring the human semantic rubric and the textual prompt template (for **freeze at the
finalization commit**), preparing the `F-18` semantics-only injection projection, and drafting the
non-executing preparation run manifest. This ruling is the **owner's** and is **distinct** from the D-011
reviewer ruling: it adds no backend and no call. Preparation is **discovery/preparation, not implementation**:
no adapter, coordinator, prompt builder or other executable module is authorized, and nothing here is
implemented or run.

**Recording of the authorization (owner-provided; summarized, not a verbatim D-011-style ruling).** The owner
(authorized handle supplied by the requester) directed that preparation artifacts be produced now, without any
model execution. The named human reviewer carried by these artifacts is the stable public handle
**`ajegorovs`** (owner-provided), **independent of the implementer** and of the generation harness; the
reviewer identity may be substituted by the owner before the run.

**What this ruling approves.** The preparation artifacts, as drafted at the preparation commit:
`docs/librarian-reconciliation/semantic-rubric-v1.md`, `docs/librarian-reconciliation/prompt-template-v1.md`,
`src/librarian/fixtures/semantic-cases.json` (`semantic-cases-v1`), and
`harness/librarian-generation/run-manifest.json` (preparation form). The owner **adopts the within-budget
injection disposition**: the new `F-18-inj` semantic-only projection replaces the `F-18` prompt across that
slot's three predeclared repeats — preserving the `F-18` subject/domain facts and the UNKNOWN coverage
limitation, with the instruction-like text living in the stored note content, the original structural
fixtures byte-unchanged, and **zero** calls beyond the 34-call cap.

The owner likewise **adopts the companion within-budget genuine-conflict disposition**: a new `F-2-conflict`
semantic-only projection replaces the `F-2` prompt across that slot's three predeclared repeats — **preserving
the `F-2` subject and machine domain facts** (`state=blocked`, `blocker="waiting on a synthetic fixture slot"`,
confidences `inferred`, `branch=fixture/contested`, `prNumber=202`) and changing **only** the stored text of the
one returned human `steering` annotation (`FIX-ANN-STEER-CONTESTED`) so the human claim now **genuinely
competes** with the machine reading. The base `F-2` projection is retained but drives no calls; the original
structural fixtures stay byte-unchanged, and the variant adds **zero** calls beyond the 34-call cap. Its
purpose is to exercise the genuine **human–machine conflict** capability that no base-corpus case could
exercise: a returned human claim must be recognised (`outcome=abstained`, a `human_steering_conflict` citing
the returned annotation, with no withheld text), while a conflict on base `F-2` remains a hallucinated
contradiction. The prepared corpus artifact `semantic-cases-v1` therefore carries **both** adopted
within-budget variants (`F-18-inj` and `F-2-conflict`), each cross-referenced by the frozen rubric and the
preparation manifest; their exact projection digests are recorded in the corpus and recomputed with the
repository's own `digestPayload`.

The owner also **approves the first-run budgets** recorded in the preparation manifest: hard maximum **34**
calls; **prompt ≤ 8000 / completion ≤ 1000 tokens**; **request ≤ 256 KiB / response ≤ 64 KiB**; **120 s**
timeout; **redirects refused**; **no retries**. These are **approved**, not merely proposed. Whether the
selected backend supports a caller-supplied **seed** and exposes a **reliable token counter** is
**UNVERIFIED at preparation**; the run must disclose that (falling back to the independent byte caps and
recording an unavailable seed) and **stop before execution** if unsupported.

**Disposition (this record's — not a ruling).**

- **Preparation, not execution.** This ruling authorizes **zero** inference. It does **not** select a backend
  (S-1 remains **OPEN**), does **not** authorize execution (**OPEN**), does **not** read a credential, and
  modifies no other profile. The owner must still name the inference backend and give an explicit go-ahead,
  and the rubric/corpus/template hashes must be pinned at the finalization commit, before any run.
- **Backend identity is intentionally absent from public artifacts.** No model, endpoint, port or path is
  named here or in any committed preparation artifact; the exact endpoint/config stays outside this public
  repo and is referenced only by a masked public label plus a future local binding digest. Preparation
  supplies the shape of the identity field, not its value.
- **Exclusions unchanged.** Real-Axis access, persistence, mutation, monitoring, deployment and P1C/R-series
  work remain excluded (D-008/D-009/D-010/D-011).

---

## D-013 — 2026-10-05 · Librarian / Reconciliation V1 semantic-evaluation *harness implementation and preflight* authorized (owner amendment; no generation)

**Decision.** The owner approves an implementation amendment to the D-011/D-012 envelope: the bounded
semantic-evaluation **harness** may be implemented, and **non-generation** capability checks may be run —
against the frozen preparation artifacts — **without authorizing any model invocation**. This record adds
**no** backend selection beyond the D-012 preparation choice and **no** execution authorization. Inference
remains unauthorized: the runner refuses generation absent a separate explicit authorization that is **not**
granted now.

**What was implemented (offline, non-shipped).**

- `src/librarian/prompt.ts` — the pure prompt builder: renders the frozen `prompt-template-v1` text verbatim
  from a captured supported projection plus the harness-computed coverage summary (the same API-semantics
  `computeCoverage` the accepted assembler uses). Returned evidence and coverage are rendered as canonical
  JSON; the builder is a deterministic function of the projection and never reads the oracle, a supplied
  candidate or a rubric verdict.
- `src/librarian/model-candidate.ts` — the strict model-payload parser and the lossless pre-parse capture
  boundary. The model's outcome set is restricted to `proposal` / `abstained` / `insufficient_evidence`;
  a model-authored `snapshot_unstable` is a structural failure; forbidden and harness/assembler-owned fields
  are refused; the trusted `provenance` label is injected **outside** the model's text. Capture order is
  fixed: encode exactly as extracted → base64 + sha256 → **then** parse; a malformed completion is preserved
  in full.
- `src/librarian/model-coordinator.ts` — the DESIGN-V1 §7.3 construct → **discard** → recompute coordinator
  over the generation seam, with hard bounds (**≤ 3 reads, ≤ 2 generations**): read A → generate A → read B;
  if A = B deliver; if A ≠ B discard the A-candidate (captured, shape-checked) and regenerate from B
  **before** reading C; if B = C deliver, else emit **coordinator-owned** `snapshot_unstable`.
- `harness/librarian-generation/run.mjs` — the offline adapter orchestration: `offline` (default; verify the
  frozen artifacts are byte-unchanged, enumerate the exact 34-call plan, render every prompt — no network) and
  `preflight` (non-generation capability check). `generate` is refused without an explicit authorization.
- `harness/librarian-generation/transport_helper.py` — the **Hermes-backed, credential-isolated** Python
  transport helper (owner amendment: the harness uses the already-installed Hermes runtime). It resolves the
  backend through `hermes_cli.runtime_provider.resolve_runtime_provider(requested="opencode-go",
  target_model="deepseek-v4.1-flash")`, verifies provider/base URL/model against the pinned identity before
  any request (a resolver default cannot redirect), and holds the credential only in memory: it is never
  printed, logged, copied, written to a file or exported. Transport guards: redirects refused, finite 120 s
  timeout, request ≤ 256 KiB / decompressed response ≤ 64 KiB, no retry, no fallback host, exact-endpoint
  allowlist. Exceptions are fixed secret-free codes. `x-opencode-session` carries a deterministic synthetic
  run-affinity value (no provider/account identifier is committed). Local mock endpoints are reachable only
  under `--self-test` and only on loopback, so runtime input cannot be arbitrary.
- Tests: `prompt.test.ts`, `model-candidate.test.ts`, `model-coordinator.test.ts` (deterministic stubs only),
  `harness/librarian-generation/run-offline.test.mjs`, and `harness/librarian-generation/test_transport_helper.py`
  (23 guard tests over local mocked HTTP).

**Runtime dependency (documented, not portable).** The transport helper is **not** self-contained: it
**requires the already-installed Hermes runtime** and imports its existing modules
(`hermes_cli.runtime_provider`) and the already-present `httpx` (0.28.1). **No new dependency was installed**
and nothing was added to `package.json` dependencies; the interpreter is resolved from the actual `hermes`
executable, never from a hardcoded install path or hash. On a machine without an installed Hermes the helper
is unusable by design.

**Non-generation capability check actually performed (`preflight`).** The pinned runtime resolved to
`provider=opencode-go`, `base_url=https://opencode.ai/zen/go/v1`, `api_mode=chat_completions`,
credential source `env:OPENCODE_GO_API_KEY`. The one permitted authenticated GET —
`https://opencode.ai/zen/go/v1/models` (indicated by the provider source: "live GET /zen/go/v1/models") —
returned HTTP 200 with **36** model ids; the requested model `deepseek-v4.1-flash` was **observed in the
list**. No usage/account endpoint was read; no chats, completions or tokenize call was made; capability
output is sanitized to model ids and support flags and carries **no** account data and **no** provider
envelope. Seed control and reliable token counting remain **UNVERIFIED**; backend version and model artifact
hash are **unknown** — the run must disclose these and must not claim them. Model presence in the list is
observed; absence would not have been proof of a missing model.

**What this amendment does NOT authorize.** No model inference; no real-Axis read; no production-database
read; no persistence, mutation, approval workflow, schedule, daemon or monitor; no deployment or service
restart; no reopening of P1C/R-series; no change to any shipped surface. The runner refuses generation
without an explicit authorization that does not exist now. The `generate` path is implemented but unexercised.

**Frozen artifacts unchanged.** The execution gate for a real run stays closed: `inferenceAuthorized` remains
false, the frozen rubric/template/corpus and the original structural fixtures are byte-unchanged, and no
capture of model output was produced. Human semantic review remains pending; no model results are claimed.

**D-013 update — independent-verification findings resolved at the root (2026-10-05).** An independent
verification of the harness raised findings that were resolved in the implementation, not merely documented:

- **The `generate` path is no longer a refusal-only stub.** `run.mjs` now carries a real, bounded orchestration
  (`harness/librarian-generation/orchestrate.mjs`) behind a fail-closed gate (`authorization.mjs`): the exact
  30 semantic repetitions + 4 reconstruction calls (34) are scheduled, the accepted construct → discard →
  recompute coordinator is wired to a reader over the **frozen synthetic projections** (no live DB), each
  generation is captured losslessly (base64 + sha256 + provenance + observation/prompt digests) and written
  exclusively, and a failed repeat is recorded and does not cancel the others — **no retry**. The gate stays
  **shut**: no `run-authorization.json` record exists, so `--mode generate` exits 3 without contacting a
  provider. The orchestration is exercised end to end **only** with an in-process mock generator
  (`run-generation.test.mjs`), never a real model.
- **The Python helper's `generate` mode is implemented, not a fall-through.** `transport_helper.py` now has
  `run_generate` (guarded POST, decode/extract, lossless base64 + sha256 capture; the provider envelope is
  never returned) reached only **after** the gate. The gate validates an external authorization record against
  the pinned model/endpoint, the 34-call scope, the manifest digest and the corpus/rubric/template digests,
  plus the env flag and token.
- **F-9 fail-closed fix (rubric §6/§8).** The coordinator now validates the A-generation against A **before**
  discarding it, through the strict `assessCandidate` contract — including unknown citations and refused
  provenance. An invalid discarded A is a recorded structural failure that **controls** (non-green) and is
  **not** masked by a recompute; no replacement generation is issued from B. The prior test that silently
  dropped an unknown A was corrected at the root.
- **Prompt delimiter safety (rubric §5).** Canonical serialization escapes `<` to `\u003c`, so a stored note
  containing `</returned_evidence>` (or a forged `<coverage>` block) cannot break out of the delimited block;
  the frozen template text is untouched and parsing the block restores the original content.
- **Allowlist.** `assert_url_allowlisted` refuses loopback by default and admits it only when the explicit
  `--self-test` option is passed; production reaches only the pinned endpoints.
- **Gate coverage.** `librarian:semantic-eval:test` (`harness/librarian-generation/run-tests.mjs`) runs the
  offline-runner/authorization tests, the end-to-end mock orchestration tests and the Python guard tests — no
  new dependency.

**Status.** The harness is **integrated and complete for the offline, non-generation envelope only**: its
orchestration is exercised exclusively against offline mocks and the real inference gate remains closed. No
genuine inference was performed; the historical non-generation capability check (§ above) is the only network
call made by this work, and no measurement is re-claimed or invented here.

**Scope note (preexisting working-tree change).** `.agents/skills/acceptance-pass/SKILL.md` was already
modified in the working tree **before** this harness work (an unrelated reviewer-remote note); this change did
not touch it and does not include it. It differs from `HEAD` but is excluded from this change set; no
independent-verification finding attributes a skill edit to this run, and none occurred.

---

## D-014 — 2026-10-05 · Semantic-evaluation harness reviewer disposition (bounded corrections) — implementation-ready, **execution still stopped**

**Decision.** The reviewer's disposition of the semantic-evaluation harness is recorded here **verbatim** and
its four bounded corrections are implemented in the harness (not merely documented). This entry **amends
nothing** in D-012 (or D-011/D-013): the preparation authorization, the frozen preparation artifacts and the
"no execution" intent are unchanged. The four corrections are **executable-now** code changes; they do **not**
authorize a run.

**Ruling (verbatim):**

> Semantic-evaluation harness implementation is technically sound but not yet finally accepted for external
> execution. The bounded coordinator, mock-tested 34-call schedule, strict candidate validation, prompt
> isolation, transport guards, credential isolation, no-retry behavior, and offline verification are accepted
> in principle. Before execution-readiness can be accepted, make model-output evidence durably preserve the
> approved prompt/run provenance; distinguish the backend-reported model identity from the requested model;
> and make the explicit owner disposition of unverified seed/token capabilities and third-party egress part of
> the executable authorization gate. Also make inability to determine the implementation revision fail closed.
> These are bounded corrections and do not require another architecture/design cycle.

**Owner disposition NOT granted (unchanged).** The owner has **not** granted a capability waiver and has
**not** granted third-party inference. No `capabilityDispositions` block and no `thirdPartyEgress` approval
exist in any committed artifact; the gate is a **required** structure that is absent, so the generation path
stays shut. `inferenceAuthorized` remains false and no model output exists. The unverified capabilities
(`seedControl`, `promptTokenCounting`) remain UNVERIFIED; backend version and model-artifact hash remain
unknown.

**How each correction lands (executable, not prose).**

1. **Durable prompt/run provenance — the evidence-pack exporter.**
   `harness/librarian-generation/export-pack.mjs` turns one completed local (git-ignored) capture directory
   into a single durable, public-source pack under `docs/librarian-reconciliation/semantic-runs/<runId>/`
   (`run-manifest.json`, written **last**; `calls.json`). Each call carries the **exact** request messages
   (`system`/`user` verbatim), their exact UTF-8 bytes and digests, and the **exact** completion bytes
   (base64 + sha256). Sanitization is a **whitelist** of structural fields and never alters a completion or a
   prompt; the provider envelope, headers, account ids and the local `run-authorization.json` token are never
   read or carried. The pack binds the sha256 of the **frozen** run manifest, the frozen corpus/rubric/template
   digests, the implementation revision, the requested/reported model ids, the decoding parameters
   (`temperature 0`, `top_p 1`, `max_tokens 1000`) and the predeclared seeds (`101/202/303`). Export is
   **exclusive and once-only** (an existing pack directory is refused, never merged). A run whose captured
   count does not equal the plan count is written **non-green** and does not claim a complete count. A
   report-only hygiene scan flags identity/secret shapes in the decoded data without ever altering it. Code
   and CLI: `bun run librarian:semantic-eval:export`; the authorized `generate` path exports automatically.
   The frozen v1 manifest is **not** edited.
2. **Requested vs backend-reported model identity.** The Python transport now decodes the **reported** model
   id from the provider response (`_decode_envelope`); an absent id is recorded `unknown`, and a
   present-but-unusable (non-string/over-long/control-char) id fails closed (`model_identity_invalid`). The
   capture records `modelRequested`, `modelReported` and a `modelIdentity` verdict; the JS seam propagates the
   real reported value and never fabricates a match from the request. A **mismatch** is always non-green and a
   bare **unknown** is non-green unless an explicit prior owner disposition
   (`capabilityDispositions.modelIdentity = "owner_accepted_unknown"`) admits it. On either, the exact
   completion is preserved and **no candidate is delivered**.
3. **Capability + third-party egress in the gate.** Both the JS gate
   (`authorization.mjs`, `loadAuthorization`) and the Python gate (`transport_helper.generation_authorized`)
   now **independently** require, in the external record: a `capabilityDispositions` block (mandatory
   `seedControl` and `promptTokenCounting`; an unverified claim is a plain string, a `verified` claim must be
   an object with sha256 `proofDigest` + `artifactDigest`, so it cannot be fabricated from prose) and a
   `thirdPartyEgress` approval (exact `origin`/`baseUrl`/`model`, `syntheticOnly: true`, the 34-call scope, a
   sha256 artifact digest, and no credential/user/account field). A direct call to either gate cannot bypass
   the other's requirement — the helper refuses generation before any network I/O, and the runner refuses
   before spawning the helper.
4. **Revision fail-closed.** The JS gate no longer skips the revision check when `git rev-parse HEAD` cannot be
   resolved: an unresolvable revision now **refuses** (`authorization_revision_unavailable`), and the recorded
   revision must match. The Python gate performs the same resolution itself and refuses on a mismatch or an
   unresolvable revision; a caller cannot inject a revision (production never passes one).

**Versioned runtime manifest / global immutable binding.** The durable pack's `run-manifest.json` is the
versioned **runtime** manifest (`packSchema` `librarian-semantic-eval-pack-v1`); it binds the implementation's
current revision digest, the frozen corpus/template digests and the global immutable frozen-manifest sha, and
records `requestedBackendVersion`/`backendVersion`/`modelArtifactHash` as `unknown`. The frozen preparation
manifest remains byte-unchanged; its historical "HARNESS NOT IMPLEMENTED" status is a preparation-time record,
and the current implementation status lives in the implementation report and here — not by editing a frozen
artifact.

**Execution remains stopped.** The harness is now **executable** for the four corrections and is exercised
**only** with offline mocks; no provider was contacted, no model was invoked, no capture of model output was
produced, and every fixture case's `semantic.status` remains `pending_human_review`. A real run still requires
(separately, and not granted): an owner record carrying the capability dispositions and the third-party egress
approval, the env flag + token, a matching revision, and the explicit go-ahead.

---

### D-014 supplement — 2026-10-05 · independent-verification remediation (root fixes; **verified** now requires a bound proof)

**What this is.** A second independent verification of the D-014 implementation raised findings that are
**resolved at the root** (code, not prose) in the same offline envelope. The D-014 ruling above is preserved
**verbatim** and unchanged; this supplement records the remediation only. It amends nothing in D-012/D-013 and
authorizes **no** run.

**Findings and root fixes.**

1. **The durable pack trusted its inputs.** `export-pack.mjs` copied `completionBase64`/`completionBytes`/
   `completionSha256` without recomputation, used Node's permissive `Buffer.from` for base64, and took the run
   report's `green` at face value. It now performs **strict integrity prevalidation before any output write**
   and refuses (fixed `PackIntegrityError`, **no partial pack**) on: a non-canonical base64 (strict
   decode→encode round-trip), a decoded length ≠ `completionBytes`, a sha256 ≠ `completionSha256`, a request
   whose canonical encoding does not hash to `promptDigest`, a request/prompt/observation that does not equal
   what the **frozen prompt builder** renders for the frozen projection (recomputed by the same executor
   helpers, not copied), a duplicate or unexpected `(caseId, step, repeat, seed)` against the exact 34-call
   plan, and a **missing or mismatched** frozen artifact. `green` is now computed by the exporter and the
   report's verdict must **agree** — a fabricated green on an incomplete run is fail-closed non-green. An
   incomplete run is still written non-green; only an inconsistent/unverifiable run refuses to write. A
   failure record is permitted without completion bytes **only** with a typed error field, so a missing
   completion can never be a silent success.
2. **A present-but-unusable model field destroyed the completion.** The Python transport raised *after*
   extracting the completion, so an invalid `model` lost the evidence. `_decode_envelope` now returns the
   **content first** and a classified identity (`present`/`absent`/`invalid`) that never echoes the unusable
   value; `run_generate` records `modelIdentity: "invalid"`, `modelReported: "unknown"`,
   `modelIdentityError: "model_identity_invalid"`, `success: false` **while preserving the completion bytes
   losslessly** (base64 + sha256). The coordinator treats `invalid` as fail-closed (delivering no candidate),
   and an `owner_accepted_unknown` disposition does **not** admit it. A missing completion is still a hard
   failure.
3. **A `verified` capability claim and the third-party egress digest could be fabricated.** A `verified`
   disposition was validated only as two 64-hex strings, and the egress `artifactDigest` accepted any 64-hex
   value. Both gates (JS and Python, **independently**) now require a `verified` claim to name a bounded,
   non-secret JSON proof under `harness/librarian-generation/capability-proofs/` whose own bytes hash to the
   recorded `proofDigest`, whose identity fields match the pinned provider/endpoint/model, and whose
   `artifactDigest` equals the **frozen corpus** artifact digest; it must also bind an evidence file (inside
   the proof directory) by `evidenceSha256`. Proof paths are resolved fail-closed (absolute / `..` / symlink /
   non-file / over-large are refused before any read), so a malicious record can never read an arbitrary
   credential file. The egress `artifactDigest` must equal the frozen corpus digest too. This is an **operator
   interlock**, not a cryptographic owner signature: it detects inconsistency and unbound/forged digests and
   assumes nothing. **No proof artifact exists today, so every `verified` route refuses**; the plain-string
   unverified routes (`unverified_owner_accepted`, `unavailable_byte_cap_only`) are unchanged.

4. **The exporter still trusted the recorded structural outcome of a completion.** Even after the prevalidation
   above, `export-pack.mjs` copied each record's `parsed`/`error`/`assessmentError` and its `discarded`/
   `provenance`/`modelIdentity` fields without recomputation. An **independent offline probe** demonstrated the
   gap: a valid 34-call mock capture with a (false) report `green` remained **green** after one completion was
   replaced by a self-consistent forged record — its `completionBase64`/`completionBytes`/`completionSha256`
   recomputed so only the *recorded outcome* lied — whose text was either malformed non-JSON or a
   `{outcome:"snapshot_unstable",…}` payload, with `parsed` forced `true`. The exporter now **re-derives** the
   structural outcome from the **exact completion bytes**: it decodes them (strict base64 **and** strict UTF-8
   round-trip), re-runs the frozen `parseModelPayload`, and re-assesses the parsed candidate with
   `assessCandidate` against the exact frozen observation the coordinator used (no semantic rubric is
   evaluated). The record's claimed `parsed`/`error`/`assessmentError` must equal the recomputation or the pack
   is refused (no partial output); a forged `parsed:true`, a fabricated clean assessment over an unknown
   citation or an unresolved conflict reference, and a non-UTF-8 byte string are all refusals. The injected
   `provenance` is recomputed from the slot's `(caseId, step, repeat, seed)`, `discarded` from the frozen
   schedule (an A-generation is discarded only on a churn slot), and a `modelIdentity` of `match` is accepted
   **only** when the recorded reported id equals the requested id (the real provider cannot be cryptographically
   proven here, but a non-matching string can be caught). The recomputed outcomes — never the record's — now
   govern the exporter's own `green`: a completion that failed to parse or was contract-refused is counted and
   forces non-green. The schedule manifest is consumed **from disk** at `manifestPath`; a caller-supplied
   `manifest` argument is accepted only when canonically identical to the on-disk manifest
   (`manifest_argument_mismatch` otherwise), so a manipulated argument cannot diverge from the artifact whose
   sha256 the pack binds. Legitimate failure captures — a typed error with no completion, or a self-consistent
   malformed completion carrying its **true** parse error — are still exported, labelled non-green. Both probe
   variants and the surrounding forgeries (invalid syntax, `snapshot_unstable`, forbidden fields, unknown/
   conflict references, forged match, non-UTF-8, manifest-argument tamper) are covered by offline negative
   tests; this finding is **resolved**.

**No owner waiver. No execution.** The owner has granted **no** capability waiver and **no** third-party
inference; no `run-authorization.json` record and no capability proof were created; no model was invoked and
no capture of model output was produced. `inferenceAuthorized` remains false, the frozen manifest/rubric/
template/corpus remain byte-unchanged, and `run.mjs --mode generate` still exits **3**.

**Verified counts (programmatic, current; earlier numbers labelled historical).** `bun test src` — historical
298 → **304 pass / 0 fail** (13 files). Harness — historical 7 + 7 + 23 = 37 → **23 offline + 33 generation +
45 Python = 101 pass / 0 fail**. `bun run typecheck` — **PASS** (0 errors). `run.mjs --mode offline` — frozen
artifacts byte-unchanged, plan **30 + 4 = 34**, 0 model calls. `run.mjs --mode generate` — **REFUSED**
(`authorization_flag_absent`), exit 3. Full detail in the implementation report's verification table.
