# Librarian / Reconciliation V1 — semantic-evaluation harness: implementation & verification-remediation report

**Unit:** the **bounded semantic-evaluation harness** for the Librarian / Reconciliation V1 offline semantic
slice, implemented under the owner amendment recorded as **D-013** in
[`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md) (extending the D-011/D-012
envelope). **No model was invoked by this work.** This report records an implementation, the resolution of an
independent verification's findings, and an **offline-only** exercised orchestration. It claims **no** model
result and moves no fixture case off `pending_human_review`.

**Baseline:** repository commit `2df1647cd6b92db1f153979a78e204c44ac37db4` (`main`); the frozen run manifest
pins its own baseline `1a93297d32b0a1293681cbf6cfc8d5200a6fb036`.

## 1. What changed (exact paths)

| Path | Kind | Purpose |
|---|---|---|
| `src/librarian/prompt.ts` | module | Pure prompt builder; canonical JSON now escapes `<` → `\u003c` so stored content cannot close a delimiter. Frozen template SYSTEM text untouched. |
| `src/librarian/model-candidate.ts` | module | Strict payload parser + lossless pre-parse capture; adds `assessmentError` (a contract refusal distinct from a parse failure). |
| `src/librarian/model-coordinator.ts` | module | Construct → discard → recompute coordinator; now **validates the A-generation against A before discarding it** and records a non-green result on refusal (`green` flag). |
| `src/librarian/assembler.ts` | module | Exports the previously-private `assessCandidate` (and its type) so the coordinator validates before delivery. |
| `harness/librarian-generation/run.mjs` | harness | `offline` (default) / `preflight` / `generate`; `generate` is a **real bounded orchestration behind a fail-closed gate**. |
| `harness/librarian-generation/orchestrate.mjs` | harness (new) | The 30+4 schedule and the coordinator wiring over the frozen synthetic projections; lossless exclusive capture; no retry; failure-continue. |
| `harness/librarian-generation/authorization.mjs` | harness (new) | The external-record authorization gate (model/endpoint/calls/manifest/artifact-digests/revision/capture-basename + env flag + token). |
| `harness/librarian-generation/transport_helper.py` | harness | Production-only endpoint allowlist (loopback only under explicit `--self-test`); implemented `generate` path (`run_generate`, guarded POST + decode + lossless capture); record-based gate. |
| `harness/librarian-generation/run-tests.mjs` | harness (new) | Test gate running the JS + Python suites; no new dependency. |
| `harness/librarian-generation/run-offline.test.mjs` | test | 7 tests — frozen digests, 34-call plan, generate refusal, interpreter resolution, gate. |
| `harness/librarian-generation/run-generation.test.mjs` | test (new) | 7 tests — the 34-call end-to-end mock run, per-entry bounds, capture provenance/digests, exclusive write, failure-continue, no-retry, discarded-A controls. |
| `harness/librarian-generation/test_transport_helper.py` | test | 23 tests — guards, gate, generate path (loopback mocks only). |
| `src/librarian/prompt.test.ts`, `model-candidate.test.ts`, `model-coordinator.test.ts` | tests | Delimiter-breakout, Unicode capture, and F-9 fail-closed tests. |
| `package.json` | script | `librarian:semantic-eval` and `librarian:semantic-eval:test`. |
| `.gitignore` | ignore | `harness/librarian-generation/capture/` and `run-authorization.json` (run artifacts / external auth, never committed). |
| `docs/evidence-automation/DECISIONS.md` | record | **D-013** + its update. |

No shipped surface changed: the librarian modules are not imported by `src/actions.ts` or `src/ui.tsx` and are
not part of `bun run build` (the built `actions/`/`ui/` outputs are unchanged).

## 2. Independent-verification findings — resolved at the root

1. **Generation was a refusal-only stub / fell through.** `run.mjs --mode generate` was a stub and the Python
   helper's authorized `generate` fell through to `exit 0` with no output. Now the runner carries a real
   bounded orchestration (`orchestrate.mjs`) and the helper has a real `run_generate`; both are **gated and
   never run for real** — no authorization record exists, so `--mode generate` exits **3**.
2. **F-9 silently dropped an unknown A.** The coordinator now validates the A-generation against A via
   `assessCandidate` **before** discarding it; an unknown citation or refused provenance is a recorded
   structural failure that controls (non-green) and is not masked by a recompute — and **no replacement
   generation from B is issued**. The prior test that accepted the silent drop was corrected.
3. **Prompt delimiters could break out.** Canonical serialization escapes `<` → `\u003c`; a stored note with
   `</returned_evidence>` cannot close the block, and parsing the block restores the original text (a pure
   JSON-string escape). Adds a deliberate-data breakout test and a Unicode capture test.
4. **Allowlist admitted loopback by default.** `assert_url_allowlisted` now refuses loopback unless an explicit
   `allow_loopback` (only the `--self-test` path) is passed; the CLI refusal exits 3, not 0.
5. **Gate coverage.** A single `librarian:semantic-eval:test` invokes the JS and Python suites; no new
   dependency. The proposal's single-script note is superseded by this explicit, justified test-runner script.

## 3. Guarantees implemented

- **Prompt source.** Built only from the captured supported projection + the harness coverage summary
  (`computeCoverage`); no oracle, no supplied candidate, no rubric verdict. Deterministic.
- **Restricted outcomes / coordinator-owned instability.** `snapshot_unstable` is never a model outcome.
- **Lossless pre-parse capture.** encode-as-extracted → base64 + sha256 → *then* parse; malformed output
  preserved in full; no provider envelope, header, account id or credential retained.
- **Bounded construct/discard/recompute.** ≤ 3 reads, ≤ 2 generations; the A-generation is validated before
  discard; `snapshot_unstable` owns the churn path.
- **Validated generation contract.** Every generation's outcome/provenance/citations pass `assessCandidate`
  before any delivery decision; a failure on the stable or churn path is fail-closed and non-green.
- **Orchestration.** Exactly 30 + 4 = 34 scheduled calls, seeds pinned from the manifest, no retry,
  failure-continue, exclusive capture writes.

## 4. Non-generation capability check (historical, NOT re-run here)

The one permitted authenticated `GET /zen/go/v1/models` was performed in the prior non-generation pass (see the
D-013 record): `provider=opencode-go`, `base_url=https://opencode.ai/zen/go/v1`, HTTP **200**, **36** model ids,
`deepseek-v4.1-flash` observed. **Not re-run by this work** (the task did not require a second preflight); the
numbers above are the prior record's, not a new measurement. Seed control and reliable token counting remain
**UNVERIFIED**; backend version and model-artifact hash are **unknown**.

## 5. Gates run (this change; all offline)

- `bun run typecheck` — **PASS** (0 errors).
- `bun run typecheck:host --checkout <nakama-checkout>` (explicit checkout; the default path is absent) —
  **0** diagnostics in this repository; the 155 checkout-internal diagnostics are reported and not counted.
- `bun run build` — succeeds; no tracked shipped output changed.
- `bun test src` — **298 pass / 0 fail** across 13 files.
- `bun run librarian:semantic-eval:test` — **PASS** (7 offline-runner + 7 end-to-end generation + **23** Python
  guard tests).
- `bun harness/librarian-generation/run.mjs --mode offline` — frozen artifacts byte-unchanged; plan
  **30 + 4 = 34**; **0** model calls.
- `bun harness/librarian-generation/run.mjs --mode generate` — **REFUSED** (`authorization_flag_absent`); exit
  **3**; no provider contacted.

## 6. Limitations and boundaries

- **No model result.** No inference was performed; the orchestration is exercised **only** with an in-process
  mock generator. Every fixture case's `semantic.status` remains `pending_human_review`.
- **Human semantic review pending.** The milestone closes green only on a named human's recorded per-case
  verdict against the frozen, hash-pinned rubric.
- **Frozen artifacts byte-unchanged.** The runner verifies the manifest-pinned corpus/rubric/template digests
  on every run; the original structural fixtures are untouched; the run manifest is not edited.
- **Real inference gate closed.** No `run-authorization.json` exists; an authorized run would read the frozen
  synthetic projections only (no live DB) and use the pinned endpoint — but it is never reached here.
- **Preexisting, excluded working-tree change.** `.agents/skills/acceptance-pass/SKILL.md` was already modified
  before this work; it is unrelated, was not touched, and is not part of this change set.
- **Publication.** This report records verified implementation; publication is handled by the parent after independent verification. The frozen v1 manifest describes the historical preparation stage (including its then-unimplemented harness); current implementation status is recorded here, not by editing that immutable artifact.
- **Authorization boundary.** The run gate checks a local record plus matching environment flag/token. It is an operator interlock, not a cryptographic owner signature or a defense against an operator who controls those files and variables.
- **Aggregate bound.** The fixed 30-single-generation plus two-two-generation schedule and coordinator limits bound the run to 34 calls; the scheduler checks per-entry admission and final counts.
