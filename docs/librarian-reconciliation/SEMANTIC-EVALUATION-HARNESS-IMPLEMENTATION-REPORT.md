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

Counts below are **current** (this change, re-derived programmatically). Where an earlier revision reported a
different number it is shown as **historical**, not carried forward.

<!-- verification-table:start (numeric, programmatic) -->
| Gate | Historical | Current | Command |
|---|---|---|---|
| `bun run typecheck` | PASS | **PASS** (0 errors) | `bun run typecheck` |
| `bun run typecheck:host --checkout <nakama-checkout>` | 0 in-repo | **0** diagnostics in this repository (explicit checkout; the default path is absent) | `bun run typecheck:host --checkout <path>` |
| `src` unit tests | 298 pass | **304 pass / 0 fail** (13 files) | `bun test src` |
| harness — offline runner + authorization + proof binding | 7 pass | **23 pass / 0 fail** | `bun test harness/librarian-generation/run-offline.test.mjs` |
| harness — end-to-end mock orchestration + pack integrity | 7 pass | **33 pass / 0 fail** | `bun test harness/librarian-generation/run-generation.test.mjs` |
| harness — Python transport guards + gate + proof + invalid-model | 23 pass | **45 pass / 0 fail** | `python3 -m unittest harness.librarian-generation.test_transport_helper` |
| harness aggregate (`librarian:semantic-eval:test`) | 37 pass | **PASS** (23 + 33 + 45 = **101**) | `bun run librarian:semantic-eval:test` |
| `run.mjs --mode offline` | PASS | **PASS** — frozen artifacts byte-unchanged; plan 30 + 4 = 34; 0 model calls | `bun harness/librarian-generation/run.mjs --mode offline` |
| `run.mjs --mode generate` | exit 3 | **REFUSED** (`authorization_flag_absent`); exit **3**; no provider contacted | `bun harness/librarian-generation/run.mjs --mode generate` |
<!-- verification-table:end -->

- **No new dependency.** The Python helper runs under the interpreter resolved from the actual `hermes`
  executable (`$(dirname "$(realpath "$(command -v hermes)")")/python3`); no `package.json` dependency was added.

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

## 7. Reviewer-disposition corrections (D-014) — implemented, still offline-only

The reviewer disposition recorded as **D-014** in [`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md)
raised four bounded corrections; all four are implemented in code and exercised with offline mocks only.

1. **Durable evidence pack.** `harness/librarian-generation/export-pack.mjs` exports one completed local
   capture directory into a durable, public-source pack under
   `docs/librarian-reconciliation/semantic-runs/<runId>/`. Each call preserves the **exact** request messages
   and the **exact** completion bytes; the pack binds the frozen manifest sha, the frozen corpus/rubric/template
   digests, the implementation revision, the requested/reported model ids, the decoding parameters and the
   seeds. Export is exclusive/once-only; a count short of the plan is written non-green and does not claim
   completeness. The provider envelope, headers, account ids and the auth token are never carried.
2. **Reported vs requested model.** The Python transport decodes the backend-reported model id
   (`model_identity_invalid` on a present-but-unusable value; `unknown` on absence), and the capture records
   `modelRequested`/`modelReported`/`modelIdentity`. A mismatch is always non-green; a bare unknown is
   non-green unless an explicit disposition admits it; on either, the completion is preserved and no candidate
   is delivered.
3. **Capability + egress gate (JS and Python, independent).** Both gates now require a mandatory
   `capabilityDispositions` block (`seedControl`, `promptTokenCounting`; `verified` needs a sha256 proof +
   artifact digest) and a mandatory `thirdPartyEgress` approval (exact origin/base/model, synthetic-only, the
   34-call scope, an artifact digest, no credential/account field).
4. **Revision fail-closed.** An unresolvable `HEAD` refuses (`authorization_revision_unavailable`); a recorded
   revision must match; the Python gate resolves `HEAD` itself and refuses a caller-injected revision.

**Independent-verification remediation (root fixes on top of D-014, still offline-only).**

5. **Strict pack integrity prevalidation.** `export-pack.mjs` no longer trusts the run report or the recorded
   digests. Before it creates any output it recomputes every binding and **refuses** (fixed
   `PackIntegrityError`, **no partial pack**) on any inconsistency: an **inconsistent unverified record**
   (non-canonical base64 — a strict decode→encode round-trip, not Node's permissive `Buffer.from`; a decoded
   length ≠ `completionBytes`; a sha256 ≠ `completionSha256`), a **request/prompt inconsistency** (the recorded
   `requestSystem`/`requestUser` re-canonicalized must hash to `promptDigest`, the system message must be the
   frozen template, and the whole request + prompt digest + observation digest must equal what the **frozen
   prompt builder** renders for that case/step from the frozen projection — recomputed via the same
   `expectedRequest`/`observationForRead` the executor uses, never copied), a **schedule violation** (a
   duplicate or unexpected `(caseId, step, repeat, seed)`, checked against the exact 34-call plan), or a
   **frozen-baseline failure** (a missing or mismatched corpus/rubric/template artifact, a corpus projection
   digest that does not recompute, or an absent frozen manifest). `green` is now computed **here** from
   structural integrity + plan completeness + zero failures + the frozen baseline + every completion's
   backend identity a match, and requires the report's verdict to **agree** — a fabricated `green: true` on an
   incomplete run is fail-closed non-green (the report's value is never inherited). A merely **incomplete**
   run (fewer calls, a recorded failure) is still written non-green; only an inconsistent/unverifiable run
   refuses to write. A permitted **failure** record (no completion bytes) must carry a typed error field; a
   `parsed:false` completion must carry a typed parse error — a missing completion can never be a silent
   success. **Independent-probe remediation (the last exporter integrity finding).** A standalone offline
   probe demonstrated the residual gap: a valid 34-call mock with a false report `green` stayed green after
   one completion was replaced by a self-consistent forged record (`base64`/length/`sha256` recomputed) whose
   text was a malformed non-JSON value or a `{outcome:"snapshot_unstable",…}` payload and whose recorded
   `parsed` was forced `true`. The exporter no longer trusts the recorded structural outcome: it
   **re-derives** it from the exact completion bytes by re-running the frozen `parseModelPayload` and
   `assessCandidate` against the frozen observation (no semantic rubric is evaluated), and refuses — with no
   partial pack — on any divergence: a forged `parsed:true`, a fabricated clean assessment over an unknown
   citation or an unresolved conflict reference, a non-UTF-8 byte string, a `match` verdict whose reported id
   does not equal the requested id, or a provenance/`discarded` mismatch. The recomputed outcomes — not the
   record's — govern the exporter's own `green` (a completion that failed to parse or was contract-refused is
   counted and forces non-green). The schedule manifest is read **from disk**: a caller-supplied `manifest`
   argument is accepted only when canonically identical to the on-disk manifest (`manifest_argument_mismatch`
   otherwise). Legitimate failure captures (a typed error with no completion, or a self-consistent malformed
   completion carrying its **true** parse error) are still exported, labelled non-green. Both probe variants
   and the surrounding forgeries are covered by the offline negative tests; the finding is **resolved**.
6. **Invalid-model completion preservation.** The Python transport no longer raises after extracting the
   completion. `_decode_envelope` returns the **content first** and a **classified identity**
   (`present`/`absent`/`invalid`) that never echoes the unusable value. A present-but-unusable `model` field
   (non-string, over-long, control characters) is classified `invalid` with the fixed code
   `model_identity_invalid`; `run_generate` then records `modelIdentity: "invalid"`, `modelReported:
   "unknown"`, `modelIdentityError: "model_identity_invalid"`, `success: false` — the completion bytes are
   still captured **base64 + sha256, byte-exact and lossless** — and the coordinator keeps the entry
   non-green and delivers **no candidate** (an `owner_accepted_unknown` disposition does **not** admit
   `invalid`). A missing completion is still a hard `completion_missing` failure. `ModelIdentity` gains the
   `invalid` verdict end to end (transport → `run.mjs` seam → capture → coordinator, reason
   `model_identity_invalid`). A dedicated test proves an invalid field preserves a `PRECIOUS…` completion
   byte-for-byte.
7. **Capability proof ↔ artifact binding, and an egress artifact-digest binding (JS and Python,
   independent).** A `verified` capability claim is no longer a bare sha. Both gates now require it to name a
   bounded, non-secret JSON proof under the dedicated `harness/librarian-generation/capability-proofs/`
   directory whose own bytes hash to the recorded `proofDigest`, whose `schema`/`status`/`capability` and
   `provider`/`endpoint`/`model` match the pinned identity, and whose recorded `artifactDigest` equals the
   **frozen corpus** artifact digest; it must also name an evidence file (inside the proof directory) whose
   bytes hash to the recorded `evidenceSha256`. Proof paths are resolved **fail-closed**: an absolute path, a
   `..` traversal, a symlink, a non-file or an over-large file is refused before any read, so a malicious
   record can never point the gate at an arbitrary (credential) file. The mandatory `thirdPartyEgress`
   `artifactDigest` must now equal the frozen corpus artifact digest too — an arbitrary 64-hex value is
   refused. This is an **operator interlock**, not a cryptographic owner signature or a blind attestation: it
   detects inconsistency and unbound/forged digests and **assumes nothing** — no proof exists today, so every
   `verified` route refuses, and the plain-string unverified routes are unchanged. Tests cover a genuine
   consistent proof (authorizes), a `..` traversal, an absolute path, a symlink, an absent proof, a
   wrong-model/wrong-endpoint/wrong-capability proof, a malformed proof, an unbound `artifactDigest`, a
   `proofDigest` mismatch and an evidence mismatch.

**Still no execution.** The owner has granted no capability waiver and no third-party inference; no
authorization record exists, so the gate is shut. `run.mjs --mode generate` exits **3** without contacting a
provider, and the mock orchestration is exercised only in-process.
