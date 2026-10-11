# Documentation map

## Current entry points

| Need | Read |
|---|---|
| Product, build, installation and preview | [Repository README](../README.md) |
| Completed rework/hardening stage and evidence boundaries | [Stage closeout](reviews/2026-10-11-dashboard-rework-stage-closeout.md) |
| Contributor procedures and preservation rules | [AGENTS.md](../AGENTS.md), plus `.agents/skills/` |
| Current dashboard information architecture | [Pivot agreement](design/dashboard-information-architecture-pivot.md) |
| Data ownership and maintenance semantics | [Data contract](design/dashboard-data-and-maintenance-contract.md) |
| Implementation design for that agreement | [Minimal implementation design](design/dashboard-minimal-implementation-design.md) |
| Standing product decisions, with dated supersessions | [DECISIONS](ux-v2/DECISIONS.md) |
| UI iteration without a hosted instance | [Preview guide](../harness/preview/README.md) |
| Accepted evidence-automation scope | [Evidence automation status](evidence-automation/STATUS.md) |

The rework/hardening stage is closed; UI restyling has not started. Installation is not production
acceptance. Historical counts, revisions and open-task wording below do not override the stage closeout.

## Historical material — retained, not a current work queue

- `PLATFORM-CONTEXT.md`, `OPEN-QUESTIONS.md` and `V2-PLAN.md`: initial platform reconnaissance,
  questions and model-rework plan. Many statements describe earlier source/host versions.
- `ux-v2/`: earlier composition/model units, frozen contract, baseline and measurements.
  `ux-v2/STATUS.md` is a historical phase ledger, not the current project status.
- `design/dashboard-production-ui-port.md` and `dashboard-production-ui-review.md`: port checklist
  and review rounds; subsequent acceptance is summarized in the stage closeout.
- `design/dashboard-final-bounded-acceptance.md`: chronological preparation and acceptance record;
  preserve earlier figures and read later addenda with their build identities.
- `reviews/`: dated verdicts and execution records. A later summary does not rewrite the original verdict.
- `plans/`: fixture/mutation designs and authorization packets. They are not standing execution grants.
- `corpus/`, `layout-fixtures/`, `screenshots/` and `ux-v2/fidelity/`: datasets and recorded captures.
  Each measures its recorded build; old screenshots do not show today's product.
- `librarian-reconciliation/` and `evidence-automation/`: separate capability work. Their scoped
  acceptance does not imply provider readiness, scheduling or production deployment.

## Retention rules

Frozen `ux-v2/contract/` files, final acceptance records, raw transcripts, dataset provenance and
approved prototypes are not rewritten during documentation cleanup. Earlier source descriptions
are labelled historical rather than silently updated into claims about measurements never taken.
Current instructions live in the root README, contributor procedures and relevant tooling guides.

For superseded instructions removed from the root README, `git show 8421f72:README.md` recovers
its pre-cleanup text. No published history is rewritten.
