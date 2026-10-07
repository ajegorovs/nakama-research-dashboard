# Research-fixture methodology

> **Status: methodology proposal.** Nothing here executes a fixture write, a source change, a service
> change, a research run or a UI change. It defines *how* a future fixture session is scoped, seeded,
> verified and reconciled. The sanitized review evidence it responds to is
> [`docs/reviews/public-research-fixture-findings.md`](../reviews/public-research-fixture-findings.md);
> the contributor procedure is the skill `.agents/skills/research-fixture-authoring/`.

## 1. Provenance and what is preserved

This methodology builds on the **accepted first exercise** (merged PR #3): the plan
`docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md`, the qualified exercise report
`docs/reviews/2026-10-07-public-research-fixture-exercise-report.md`, and the sanitized evidence summary
`docs/reviews/2026-10-07-public-research-fixture-evidence.json`. **Those records remain the historical
record and are not superseded, amended or re-litigated here.** The earlier acceptance history — including
the ratification of the four inferred claims, the withdrawal of the false missing-summary finding, and
the acceptance of the page-only verification qualification — stands.

The first exercise exposed interacting packet, procedure, execution and product-contract weaknesses;
no single root cause is established for all findings. One established sequencing defect requested confirmed
claims in the initial reconciliation while scheduling supporting activities for later calls. Future research
must distinguish missing instructions, workload decomposition, worker deviations and backend limitations.
This methodology addresses that investigation as a **separate track**, as the PR #3 closeout states.

## 2. Informational blocks — required / optional / unavailable

Every field a fixture proposes is assigned exactly one disposition *before* any write. This is the
methodology's central rule: **silence must never be mistaken for coverage, and absence must never be
papered over with invention.**

| Disposition | Meaning | Absence is | Handling |
|---|---|---|---|
| **required** | must be present and source-backed | a defect | block the write until sourced, or record an explicit open finding |
| **optional** | may legitimately be absent | honest, not a defect | leave blank; state that it is deliberately unset |
| **unavailable** | the product model or toolset cannot represent it | a stated limitation | record the limitation; **never** fabricate a workaround |

Worked examples from the retained fixture: the human-approved topic summaries are **optional** (blank by
design); a plan step's `position` is **required** (its absence is the F12 defect); a first-class visible
plan-provenance field is **unavailable** if the exposed contract lacks it (F13); linking an event to a
problem is **unavailable** in the current event tool (F14).

## 3. Per-issue discipline — WHY and HOW

Every finding is carried with two things, so it is actionable and auditable:

- **WHY** — the claim the finding would change if it were true (the consequence, not the symptom).
- **HOW** — the *exact source* that would settle it and the *exact readback* that would confirm the fix.
  A hypothesis is never promoted to a fact by assertion; a reviewer's causal claim is recorded as a
  hypothesis until a measurement or a retained record supports it.

The full per-issue WHY/HOW table is in the findings document (§A). The methodology requires every future
finding to be written in the same shape.

## 4. Evidence rules (non-negotiable)

1. **No invented evidence.** A `confirmed` claim is refused unless it is backed in the **same call** by an
   activity, annotation, branch or PR. Where the packet says `inferred`, write `inferred`. Where a field
   is absent, leave it absent — do not synthesise a plausible value.
2. **Atomic initial evidence.** A topic's initial supporting activities belong **inside the same
   `reconcile_topic` transaction** as the claims they back. `record_activity` is for events that *arrive
   afterwards*, not for manufacturing the evidence an initial claim needs. (This is the sequencing rule
   the first packet violated.)
3. **Immutable source references and dates.** Record the **public source** (repo, PR/commit ref, document
   path) and the **source's own date**. Never substitute the ingestion/recording date for a document's
   publication date; day-only source dates stay day-only and no time-of-day is invented. A pinned commit
   is quoted by its pin; the pin is authoritative, not the moment it was read.
4. **Dedup / version-aware reconciliation.** Search before create (`get_overview` for the baseline,
   `search_dashboard` for each topic/axis name), pass `expectedVersion` on every `reconcile_topic`, and on
   `conflict` re-read and decide again — **never** overwrite blindly. `truncated` is not `absent`: page a
   truncated read rather than treating it as empty.

## 5. Retained-fixture amendment vs baseline seed

These are **two different mutation programs** and must not be conflated:

- **Baseline seed** — builds a *fresh* fixture from an empty target. The full required/optional/
  unavailable assignment and all evidence rules (§2–§4) apply from the first write, because nothing can be
  assumed to exist.
- **Retained-fixture amendment** — corrects or enriches an *existing, accepted* fixture (the one PR #3
  retained). An amendment is **explicitly approved and idempotent**: it re-reads the current version,
  adds only what sources support, and may correct existing links, dates or positions only through an
  approved before/after delta. Do not duplicate events to simulate corrections. Preserve stronger human
  steering and historical acceptance records; those constraints do not prohibit authorized fixture edits.
  A correction to a published acceptance record lives in a **new document**, not in a force-push.

A session must state which program it is running before its first write, and must not carry a baseline
seed's empty-start assumptions into an amendment (or vice versa).

## 6. Gates before any mutation

No fixture write proceeds until **all** of these hold. A gate that cannot be met stops the session and is
reported, not worked around.

1. **Explicit target chosen.** The organization/instance that will host the write is selected explicitly
   and recorded; a helper that could bind a default target is not used. Both un-targeted stores are
   confirmed unchanged after.
2. **Served build established.** The serving build is verified by measurement (the served asset, by
   digest), not by a reinstall's own output.
3. **Every proposed field classified.** Each field carries a required/optional/unavailable disposition
   (§2) and, if required, a source.
4. **Evidence is atomic and same-transaction** (§4.2).
5. **Dedup pass done and versions captured** (§4.4).
6. **Source refs and dates are immutable and public** (§4.3); nothing private is committed.
7. **Public-record hygiene** applied to anything the run would publish — labels, never live endpoints.

## 7. Staged research work packages (ready to dispatch)

Each package below is **independently dispatchable** to a subagent: it has one objective, read-only or
write scope stated up front, its own inputs, a concrete output artifact, and its own gate. They are
ordered; a later package must not start before its predecessor's gate passes. No package writes a fixture
until **WP-G** (the mutation gate review) is accepted.

| ID | Objective | Scope | Inputs | Output | Gate to pass before the next |
|---|---|---|---|---|---|
| **WP1** | Verify each finding against exact sources | read-only | findings doc §A; the public source pins | per-finding verified / refuted / unresolved, with the exact source cited | every F-row is classified; unresolved rows are named, not guessed |
| **WP2** | Reconcile retained-fixture links (F01, F02, F04, F14) | read-only | WP1 output; current fixture readback | a link-delta proposal: what is missing, with sources | delta is source-backed and deduped |
| **WP3** | Design the baseline-seed packet | design only | WP1–WP2; §2–§4 of this doc | a seed packet with every field classified and evidence sequenced atomically | packet passes the §6 gates on paper |
| **WP4** | Design the retained-fixture amendment packet | design only | WP2; §5 | an approved, idempotent before/after amendment plan | amendment preserves historical evidence and explicitly approves fixture corrections |
| **WP5** | Author reconciliation/verification checks | read-only | WP3–WP4 | executable checks for the seed/amendment invariants | a green run can go red (negative control present) |
| **WP6** | Fresh zero-context guide validation (§9) | read-only | this doc + the authoring skill | a validation report from an agent given only the guide | the guide is executable with no prior context |
| **WP-G** | Mutation gate review | review | WP1–WP6 | an accept/reject of any write authorization | **owner authorization required before any write** |

UI work is **not** in this package set (see §8).

## 8. Deferred and out of scope

- **UI — deferred.** The UI observations (U01–U09) are carried in the findings document but are neither
  designed nor dispatched now. Designing an interface around a fixture whose data linking is under review
  risks fixing the wrong thing; the data is settled first.
- **Ingestion/enrichment pipeline — separate project.** The knowledge-base ingestion pipeline is a
  separate project by repository scope; it is not grown into this repo and is out of scope here.
- **Unresolved reviewer references.** `progress_axes.jpg` and `problems.jpg` were cited but not supplied.
  They stay explicitly unresolved; their findings remain provisional and must not be silently dropped or
  substituted with other images.
- **Product repairs.** Findings are recorded, not fixed, in this phase.

## 9. Validation of this guide — fresh zero-context

A procedure is not trustworthy until someone who did not write it can run it. Before any package's output
is relied on:

1. An agent with **zero prior context** is given the authoring skill and this document — and nothing else.
2. It attempts a package (WP1 is the natural first) and reports where the guide was ambiguous, wrong or
   missing a step.
3. The guide is corrected from that report; the validation is re-run on the corrected guide.
4. The validation report is retained as evidence, including the failures.

The authoring skill is marked **initial / unvalidated** until this pass has been run and recorded.

## 10. Boundaries

- This is a plan; it performs no write and makes no acceptance claim.
- It does not reopen or amend any earlier acceptance record.
- Where a capability is unavailable, the methodology records the limitation rather than inventing a
  path around it.
- Until an explicit target and owner authorization exist, no fixture is written.
