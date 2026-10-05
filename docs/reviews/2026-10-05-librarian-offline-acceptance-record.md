# Librarian / Reconciliation V1 — offline contract-evaluator slice acceptance record (2026-10-05)

**Unit:** the Librarian / Reconciliation V1 **offline contract-evaluator slice** — a committed synthetic
fixture, a deterministic contract evaluator, a fail-closed typed-reference resolver, a closed read boundary,
contract tests, and an isolated canonical-logical DB-snapshot harness. Taken at `main`
`afd0dc793e6f031afe2e84d78fb0ce52c4ae93eb`.

**Status: ACCEPTED — structural (contract) acceptance only.** The reviewer's verdict is the acceptance and is
reproduced **verbatim** below. This record is the durable acceptance pointer; the slice's own detailed,
already-measured evidence is [`OFFLINE-EVALUATION-REPORT.md`](../librarian-reconciliation/OFFLINE-EVALUATION-REPORT.md),
which this record does **not** re-take or re-word. The ruling is also recorded as **D-010** in
[`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md). Preparation of a bounded,
model-driven semantic-evaluation proposal is separate and documentation-only; it authorizes nothing and is
[`OFFLINE-SEMANTIC-EVALUATION-PROPOSAL.md`](../librarian-reconciliation/OFFLINE-SEMANTIC-EVALUATION-PROPOSAL.md).

## The verdict (reviewer, 2026-10-05, verbatim)

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

## Classification

| aspect | verdict |
|---|---|
| offline contract-evaluator slice (this unit) | **accepted — structural acceptance only** |
| typed citation resolution + structured proposal validation | **accepted** |
| supported-read isolation + closed read boundary | **accepted** |
| finite A/B/C snapshot comparison (≤3 reads) | **accepted** |
| independent synthetic candidate / oracle inputs | **accepted** |
| adversarial structural fixtures + discriminating negative controls | **accepted** |
| authoritative logical-DB non-mutation verification | **accepted** |
| supplied constant-candidate specialization | **accepted, scoped** — offline structural evaluator only; does **not** replace the model-driven construct/recompute protocol |
| semantic usefulness / conflict-discovery capability | **NOT established** — structural acceptance is not a semantic claim |
| problem-scoped steering annotations | **known supported-read coverage limitation** (UNKNOWN; not fabricated) |
| shipped dashboard/product surfaces | **unchanged** |
| live Axis, model reasoning evaluation, persistence, mutation, monitoring, deployment, P1C/R-series | **excluded — not authorized** |

## Measured at acceptance (the build the verdict speaks for)

The verdict is the reviewer's; the identity and counts below are what the run it ruled on measured, quoted
from [`OFFLINE-EVALUATION-REPORT.md`](../librarian-reconciliation/OFFLINE-EVALUATION-REPORT.md) §10 (the
parent's independent rerun) — this record does not re-run the gates and adds no new test claims.

| | value |
|---|---|
| revision | `afd0dc793e6f031afe2e84d78fb0ce52c4ae93eb` (`main`) |
| fixture dataset id | `librarian-fixture-v1` |
| evaluator cases | **21** structural PASS — `F-1`…`F-20` plus `F-5b` (enumerated below) |
| librarian contract tests | 90 pass / 0 fail across 4 files |
| full suite (`bun run check`) | 271 pass / 0 fail across 10 files |
| zero-mutation (pristine) | logical snapshots equal; control write detected (exit 0) |
| allowlist mutant (negative control) | write reached dispatch → red-run (exit 1) |
| frozen product sha256 | identical to report §5 for all seven frozen paths (unchanged) |

**Fixture case IDs (enumerated, both `candidate-inputs.json` and `expected-outcomes.json` — programmatically
compared, same 21):** `F-1`, `F-2`, `F-3`, `F-4`, `F-5`, `F-5b`, `F-6`, `F-7`, `F-8`, `F-9`, `F-10`, `F-11`,
`F-12`, `F-13`, `F-14`, `F-15`, `F-16`, `F-17`, `F-18`, `F-19`, `F-20`. `F-5b` is a distinct case (a proposal
on an empty-evidence axis, refused), not part of `F-5`; the count is **21**, not 20.

## Boundaries — what this acceptance does and does not cover

- **No verification of semantic quality.** Every fixture case's `semantic.status` remains
  `pending_human_review`; the acceptance is structural only.
- **No model.** The slice invokes no model, has no candidate factory, and its supplied candidates carry
  injected provenance labels. F-19 remains a **validator limit** (structural pass over a supplied candidate
  whose oracle verdict is `reject`) — it is not, and must not be presented as, a model semantic-bad-output
  demonstration.
- **Constant-candidate specialization is scoped.** The bounded A/B/C driver validated one supplied constant
  candidate exactly once against the stable observation and never regenerated it; the model-driven
  construct → discard → recompute protocol of DESIGN-V1 §7.3 still requires its own authorization.
- **No product/runtime change.** The librarian module is not imported by `src/actions.ts` or `src/ui.tsx`, is
  not part of `bun run build`, and adds nothing to the agent tool surface. The frozen product sha256 values
  are unchanged (report §5).
- **No live access.** No live, deployed or credentialled access, no real-Axis read, no mutation, persistence,
  monitoring, deployment or service restart; no reopening of P1C/R-series.
- **Publication scope.** Owner authorization covers publication of this documentation; it does not authorize the proposed model evaluation.

## Semantic evaluation — separate and still pending

Semantic usefulness and conflict discovery are **not** covered by this acceptance and remain a separate,
human-reviewed procedure. A bounded, source-grounded proposal for that procedure — implementation and
bounded model executions under one authorization envelope, real Axis excluded — is
[`OFFLINE-SEMANTIC-EVALUATION-PROPOSAL.md`](../librarian-reconciliation/OFFLINE-SEMANTIC-EVALUATION-PROPOSAL.md);
it is a proposal only and authorizes nothing.
