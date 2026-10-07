# Public research fixture exercise — report for review

**Disposition: fixture retained as a useful qualified product exercise; amended review record awaiting approval.** This is not an acceptance record or a reopening of the historical harness campaign.

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
| Corrected packet verifier against retained raw-faithful readback | **exit 1; 29 pass / 1 fail** — summary PASS at axis.plan.plan.summary; authored-order comparison remains failed, not a guaranteed product ordering contract |
| Fresh live parent readback | successful login; Overview and both topic/axis scopes returned; exact-org UI HTTP 200; retained trace contains the five tools |

The original worker's “27/27 pass” and “byte-identical protected stores” headlines were inaccurate and are superseded by this report. Its UI character count must not be presented as a byte count. The parent build run supplies fresh gate evidence; no claim is made that the worker captured its earlier build transcript.

## Deviations and product findings

1. **Confidence amendment — RATIFIED WITH PROCESS FINDING.** The reviewer ratifies the four resulting inferred values (axis-4 blocker, its problem and both axis-6 problems) as the fixture’s current state. The worker was not authorized to downgrade them after refusal; that governance deviation remains and is not retroactively authorized. The approved packet/write sequence was not executable as written: it requested confirmed claims in the initial reconciliation but scheduled supporting activities for later record_activity calls, while the product requires same-transaction evidence. Future seeds must resolve confidence/evidence sequencing before writing. No corrective fixture write is required or authorized.
2. **Verifier correction and unpositioned ordering.** The retained raw scoped response contains the supplied summary at `axis.plan.plan.summary`; steps are at `axis.plan.steps`. The prior missing-summary finding was a verifier/capture-path error and is withdrawn, not a product omission. get_progress intentionally uses the flattened `axis.plan.summary`. The seed did not encode the supplied step order using available `position` fields; positions are null. Scoped get_topic returned Read → Wire → Run → Measure, while get_progress returned Wire → Measure → Read → Run for the same stored steps. Membership and summary match. This is a cross-projection consistency observation, not proof that scoped get_topic alone violated a guaranteed ordering contract. The authored-packet order comparison remains a failed check; no fixture correction is authorized.
3. **Outside-five verification — ACCEPTED QUALIFICATION.** This was **five-agent-tool execution, with verification supplemented by the page-only get_progress projection**. The supplementary read was used only during subsequent read-only verification, not substituted for one of the five agent tools in the manual agent write exercise. No rerun is required.
4. **Problem evidence linkage gap.** record_activity describes problemId, but its declared schema omits that field. No workaround or repair was applied.
5. **Unknown source date.** The AGENDA event omitted occurredAt; the product supplied recording time. That must not be interpreted as the document's publication time. Supplied dated activities retain day-only dates.
6. **Host/tool discovery observations.** Two transient Unknown tool search_dashboard errors occurred before successful resolution. Explicit session model selection was refused; omitting the selector used the configured model. Public session messages retained tool names, contrary to the preliminary discovery claim that they could not.
7. **Guard targeting gap.** The served-build guard has no organization selector and did not establish the exercise build. Verification used the exact-org asset route instead; a successful default-org guard would not suffice.

## Evidence availability and review request

The committed companion [evidence summary](2026-10-07-public-research-fixture-evidence.json) is a sanitized extract of independent audit measurements. Full SSE transcripts, authenticated readbacks and local execution scripts remain local; this publication is **not** a complete independently replayable runtime evidence pack or a database snapshot. A remote clone can review the packet, code and recorded findings, but cannot access the live organization without separate operational access.

## Reviewer assessment and amendment scope

Reviewer verdict: **REQUEST CHANGES — fixture retained; review record needs correction before approval.** The populated fixture was accepted as a useful qualified product exercise; the four inferred values were ratified with a process finding and supplementary page-only verification accepted. This amendment inspects retained evidence offline, corrects the verifier’s nested summary path, preserves the remaining authored-order mismatch, and does not reseed or mutate the fixture. The earlier 27-pass/2-fail result is historical and superseded: one failure was an incorrect summary lookup. The corrected verifier adds a separate step-membership check and coverage of the nested summary, yielding **29 pass / 1 fail**, exit 1. The remaining failure is explicitly an authored-packet comparison, not a product-contract failure.

Requested reviewer response: **APPROVE WITH QUALIFICATIONS / REQUEST CHANGES** on this amended record. The confidence ratification and outside-five qualification are already resolved and are not re-opened. Product findings may be carried forward separately, but no product repair is included in PR #3. No new inference, live readback, fixture write, deployment or service restart was performed for this amendment. PR #3 remains draft; publication does not authorize merging.
