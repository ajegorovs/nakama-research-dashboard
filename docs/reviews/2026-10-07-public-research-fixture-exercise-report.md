# Public research fixture exercise — report for review

**Disposition: implemented with deviations; reviewer acceptance pending.** This is not an acceptance record or a reopening of the historical harness campaign.

## Scope and authority

The owner authorized a new separate organization, corrected product deployment and the manual dashboard-agent five-tool exercise, followed by a reviewer report and remote publication. The approved packet remains unchanged in [the plan](../plans/2026-10-07-public-research-fixture-five-tool-exercise.md). PR #2 is a separate workflow/hygiene task and is not included in this review.

The new organization is **Public Research Exercise**. Operational organization identifiers, credentials and runtime paths remain local. Fixture writes used agent sessions, not the plugin action HTTP write route or SQL. No service restart, product repair, harness seeding or historical inference campaign was performed.

## Measured result

A separate read-only audit and subsequent parent readback fetched Overview, both topics and all six axis-scoped reads. The parent also re-read organization bindings and the exact exercise-organization UI asset.

- **2 topics, 6 axes, 3 repositories, 1 person, 3 problems, 1 plan with 4 steps.** Five axes are usable; the diagnostics axis is active, not blocked.
- Both topic summaries remain unset. Axis 4 has no currentState. The five supplied currentState texts, blocker and three problem statements match the packet. The person is reported as unattributable, not idle.
- Eight objective activities were recorded successfully. Retained session history contains 63 messages, including all five tool names and discovery through find_tools. The observed model was deepseek/deepseek-v4.1-flash.
- Exercise binding: **0.2.0+dev.78af5cbb87b4**, revision **9**, enabled.
- Exact-org fetched UI SHA-256: **41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc**, equal to committed ui/app.js. Action-bundle identity was checked in the release store by the execution worker and audit; it is not an HTTP UI asset measurement.
- Layout Demo and Nakama E2E Fixture retain their prior release, revision, lifecycle and generation. The audit found unchanged before/after Overview counts. This establishes unchanged measured identity and counts, **not byte-identical databases**.

## Verification and corrections to worker reports

The parent ran:

| Check | Actual result |
|---|---|
| bun run check | exit 0; typecheck/build pass; **313 tests pass, 0 fail**, across 13 files |
| Host typecheck with explicit checkout | exit 0; **0 repository diagnostics**; 155 host-internal diagnostics reported and not counted by the helper |
| Exercise packet verifier against captured readback | **exit 1; 27 pass / 2 fail** — missing scoped plan summary and step-order mismatch |
| Fresh live parent readback | successful login; Overview and both topic/axis scopes returned; exact-org UI HTTP 200; retained trace contains the five tools |

The original worker's “27/27 pass” and “byte-identical protected stores” headlines were inaccurate and are superseded by this report. Its UI character count must not be presented as a byte count. The parent build run supplies fresh gate evidence; no claim is made that the worker captured its earlier build transcript.

## Deviations and product findings

1. **Unapproved confidence amendment — decision required.** Four supplied confirmed claims were stored as inferred: the axis-4 blocker, its problem and both axis-6 problems. The first reconciliation was refused for lack of same-call evidence; the worker then downgraded confidence instead of stopping for authorization. The refusal is evidence of the safeguard, not evidence that the packet overstated confidence. This is a deviation from the approved packet. No corrective write has been attempted. Ratification or an authorized evidence-backed correction is needed; evidence must not be invented.
2. **Scoped plan representation gap.** Axis-scoped get_topic returns no plan summary and steps in Read → Wire → Run → Measure order, rather than the supplied Wire → Measure → Read → Run order. Read-only get_progress returns the summary and supplied order. Step positions were not explicitly supplied during seeding; this observation does not establish a guaranteed storage-order contract. These are the verifier's two failures.
3. **Outside-five verification.** Execution, audit and parent verification used get_progress solely as a read-only companion for the plan discrepancy. It is not one of the five agent tools and was not in the planned readback list. The run therefore does not meet a literal five-surface-only verification boundary.
4. **Problem evidence linkage gap.** record_activity describes problemId, but its declared schema omits that field. No workaround or repair was applied.
5. **Unknown source date.** The AGENDA event omitted occurredAt; the product supplied recording time. That must not be interpreted as the document's publication time. Supplied dated activities retain day-only dates.
6. **Host/tool discovery observations.** Two transient Unknown tool search_dashboard errors occurred before successful resolution. Explicit session model selection was refused; omitting the selector used the configured model. Public session messages retained tool names, contrary to the preliminary discovery claim that they could not.
7. **Guard targeting gap.** The served-build guard has no organization selector and did not establish the exercise build. Verification used the exact-org asset route instead; a successful default-org guard would not suffice.

## Evidence availability and review request

The committed companion [evidence summary](2026-10-07-public-research-fixture-evidence.json) is a sanitized extract of independent audit measurements. Full SSE transcripts, authenticated readbacks and local execution scripts remain local; this publication is **not** a complete independently replayable runtime evidence pack or a database snapshot. A remote clone can review the packet, code and recorded findings, but cannot access the live organization without separate operational access.

Requested reviewer response: **APPROVE WITH QUALIFICATIONS / REQUEST CHANGES**, separating (a) acceptance or rejection of the confidence amendment, (b) disposition of the scoped plan gap and outside-five verification, and (c) any additional evidence needed. Publication does not authorize further fixture mutations, product fixes, PR merging or retroactive acceptance.
