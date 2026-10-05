# Librarian / Reconciliation V1 — semantic-evaluation harness acceptance record (2026-10-05)

**Unit:** the **bounded semantic-evaluation harness** for the Librarian / Reconciliation V1 offline semantic
slice, implemented under the owner amendment **D-013** and remediated under **D-014** (extending the
D-011/D-012 envelope). Taken at `main` `d3fe088694618498a2ad708752f98538d479168f`.

**Status: ACCEPTED — implementation-complete for the approved synthetic model-evaluation envelope.**
**Structural/implementation acceptance only; not semantic acceptance. No genuine inference has occurred.**
The reviewer's verdict is the acceptance and is reproduced **verbatim** below. This record is the durable
acceptance pointer; the harness's own detailed, already-measured evidence is
[`../librarian-reconciliation/SEMANTIC-EVALUATION-HARNESS-IMPLEMENTATION-REPORT.md`](../librarian-reconciliation/SEMANTIC-EVALUATION-HARNESS-IMPLEMENTATION-REPORT.md),
which this record does **not** re-take or re-word. The ruling is also recorded as **D-015** in
[`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md).

## The verdict (reviewer, 2026-10-05, verbatim)

> **D-014 remediation accepted.** The semantic-evaluation harness at `d3fe088` is implementation-complete for
> the approved synthetic model-evaluation envelope. The bounded construct/discard/recompute coordinator, frozen
> prompt/corpus/rubric binding, lossless model-output capture, strict durable evidence-pack export, independent
> requested/reported model identity handling, credential-isolated transport, third-party egress/capability
> authorization gates, revision pinning, no-retry 34-call schedule, and fail-closed structural validation are
> accepted. Offline/mock verification does not constitute semantic acceptance. No genuine inference has yet
> occurred.

## Classification

| aspect | verdict |
|---|---|
| semantic-evaluation harness at `d3fe088` (this unit) | **accepted — implementation-complete for the approved synthetic envelope** |
| bounded construct/discard/recompute coordinator | **accepted** |
| frozen prompt / corpus / rubric binding | **accepted** |
| lossless model-output capture | **accepted** |
| strict durable evidence-pack export | **accepted** |
| independent requested/reported model identity handling | **accepted** |
| credential-isolated transport | **accepted** |
| third-party egress / capability authorization gates | **accepted** (as a required, fail-closed gate) |
| revision pinning + no-retry 34-call schedule | **accepted** |
| fail-closed structural validation | **accepted** |
| semantic usefulness / conflict-discovery capability | **NOT established** — offline/mock verification is not a semantic claim |
| genuine inference | **none has occurred** |
| shipped dashboard/product surfaces | **unchanged** |
| execution (backend selection, run go-ahead) | **still stopped — not authorized** |

## Implementation identity accepted

`d3fe088694618498a2ad708752f98538d479168f` (`main`) — the commit the ruling names (`d3fe088`). Recording this
acceptance changes **no** code, test, manifest, `package.json` or shipped surface: this record and D-015 are
**documentation only**.

## Measured counts — quoted, not re-derived

This acceptance re-runs **no** gate. The counts below are the ones already measured and recorded by the harness
work (D-014 supplement; implementation report §5), quoted so a reviewer sees them without opening the report.
They are **prior measurements, not a new run**; this record makes no rerun claim.

| | value |
|---|---|
| revision | `d3fe088694618498a2ad708752f98538d479168f` (`main`) |
| `bun test src` | **304 pass / 0 fail** (13 files) — prior measurement |
| harness aggregate `librarian:semantic-eval:test` | **101 pass / 0 fail** (23 offline + 33 generation + 45 Python) — prior measurement |
| `bun run typecheck` | PASS (0 errors) — prior measurement |
| `run.mjs --mode generate` | REFUSED (`authorization_flag_absent`), exit 3; no provider contacted |
| `run.mjs --mode offline` | frozen artifacts byte-unchanged; plan 34; 0 model calls |

## Model identity — match, fail-closed; no unknown disposition granted

A delivered candidate requires the backend-**reported** model id to **equal** the requested id
(`modelIdentity = match`). A **mismatch** is always non-green. A bare **unknown** is non-green **unless** an
explicit prior owner disposition `capabilityDispositions.modelIdentity = "owner_accepted_unknown"` admits it —
and **no such owner disposition is granted**. A present-but-unusable id is classified `invalid`, admitted by no
disposition; the completion is preserved byte-exact and no candidate is delivered.

## Capability + third-party egress — gate required, absent in practice; no proof exists

The executable gate **requires** a `capabilityDispositions` block (mandatory `seedControl`,
`promptTokenCounting`) and a `thirdPartyEgress` approval. **Neither exists** in any committed artifact. No
genuine capability is **verified** and **no capability-proof artifact exists** under
`harness/librarian-generation/capability-proofs/`, so every `verified` route refuses. `seedControl` and
`promptTokenCounting` remain **UNVERIFIED**; backend version and model-artifact hash remain **unknown**.

## Frozen artifacts unchanged

The frozen run manifest, the synthetic corpus, the semantic rubric and the prompt template — and the original
structural fixtures — are **byte-unchanged**. No frozen artifact is edited by, for, or as part of this
acceptance; the frozen manifest is not rewritten to carry a new status.

## Boundaries — what this acceptance does and does not cover

- **No semantic claim.** Every fixture case's `semantic.status` remains `pending_human_review`; the acceptance
  is implementation/structural only.
- **No model.** No provider was contacted, no model was invoked, no model output was captured, no
  `run-authorization.json` exists, and the runner still exits 3 before any network I/O.
- **No capability waiver, no third-party egress.** Both are required by the gate and both are absent.
- **No product/runtime change.** The librarian modules are not imported by `src/actions.ts` or `src/ui.tsx`,
  are not part of `bun run build`, and add nothing to the agent tool surface.
- **No live access.** No live/deployed/credentialled access, no real-Axis read, no mutation, persistence,
  monitoring, deployment or service restart; no reopening of P1C/R-series.
- **Operator interlock, not a signature.** The gate is an interlock over local files/environment, not a
  cryptographic owner signature.

## Still required before any genuine run (separately, and not granted)

An owner-provided external authorization record carrying the `capabilityDispositions` block (`seedControl` and
`promptTokenCounting`, a `verified` claim needing a bound proof that does not exist today) and the
`thirdPartyEgress` approval (exact origin/base URL/model, synthetic-only, the 34-call scope, a bound artifact
digest, no credential/account field); the matching environment flag + token; a matching implementation
revision; and the explicit execution go-ahead.

## Scope note (preexisting working-tree change preserved)

`.agents/skills/acceptance-pass/SKILL.md` was already dirty in the working tree before this documentation work
(sha256 `36b9ae968d5e929483744b090b6994b1a305ed87dab22cfe186ba00e7cc8eb05`). It is unrelated, was **not**
touched by this change, and is excluded from this record's change set.
