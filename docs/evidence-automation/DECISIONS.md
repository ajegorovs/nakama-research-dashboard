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
