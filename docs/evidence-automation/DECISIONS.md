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

Recorded as direction, not scope; **no part of this is implemented** and nothing here is
authorized by the retired validation campaign.

- **Deterministic stored facts + agent proposals.** The reconciliation surface is built on stored,
  deterministic facts; an agent contributes *proposals*, never silent mutations.
- **Axis / Problem association.** Reconciliation operates over the existing Axis/Problem
  association; it does not invent hierarchy.
- **Current-work blocker summaries.** A summary surface states what currently blocks work, with
  facts and proposals clearly distinguished.
- **Human steering authority.** Every association carries an explicit authority:
  `confirmed` or `inferred`; human steering is authoritative and is stated, not omitted.
- **Operationalization = future period.** Any operational lifetime implies periodic,
  **separately authorized** authenticated production GitHub reads. That is not scheduled now and
  is a distinct owner decision.
- **Event-driven, no fabricated research.** Usefulness is expected to be natural and event-driven;
  no research is fabricated to justify the feature.
