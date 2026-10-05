# Durable semantic-evaluation evidence packs

This directory holds the **durable** evidence packs of the Librarian / Reconciliation V1 semantic
evaluation. A pack is written here by the exporter
[`harness/librarian-generation/export-pack.mjs`](../../../harness/librarian-generation/export-pack.mjs)
from one completed local (git-ignored) capture directory, and is meant to be committed so a reviewer with
only a clone can read the exact evidence.

No pack is committed yet: **no genuine inference has been performed**, so there is no run to publish.
A pack for a run appears here as `semantic-runs/<runId>/` only after that run has executed under an
explicit owner authorization and been exported once.

## Layout of one pack

| File | What it is |
|---|---|
| `run-manifest.json` | The pack's binding: `packSchema` (`librarian-semantic-eval-pack-v1`), the sha256 of the **frozen** run manifest, the frozen corpus/rubric/template digests, the implementation revision, the requested and reported model ids, the decoding parameters, the predeclared seeds, the requested/actual backend version (both `unknown`), the hygiene scan result, and the honest call counts. Written **last**, as the pack's completion marker. |
| `calls.json` | One entry per scheduled call: the exact request messages (`system`, `user`) and their exact UTF-8 bytes/digests, the exact completion bytes (`completionBase64` + sha256), the requested vs reported model identity, provenance, observation/prompt digests, and any structural failure. |

## Rules the exporter enforces

- **Once, exclusively.** A pack directory is created whole and never merged into or overwritten; a second
  export to the same path refuses.
- **Exact evidence.** The completion and prompt payloads are copied byte-exact. Sanitization is a
  whitelist of the record's structural fields; it never alters, normalizes or truncates a completion or a
  prompt.
- **No credentials or envelopes.** The provider envelope is never captured, and the whitelist drops
  unknown fields. The local `run-authorization.json` (a token) is never read or exported.
- **Honest counts.** A run whose captured call count does not equal the expected plan count is written
  labelled **non-green** and does not claim a complete count.
- **Strict integrity, fail-closed.** Before writing anything the exporter **recomputes** every binding — a
  strict canonical base64 round-trip, the completion length and sha256, the request/prompt/observation digests
  against the frozen prompt builder, the exact `(caseId, step, repeat, seed)` set against the 34-call plan, and
  the frozen corpus/rubric/template digests. It then **re-derives the completion outcome** from the exact
  completion bytes: the payload is re-parsed with the frozen parser and the parsed candidate re-assessed
  against the frozen observation, so a self-consistent forged `parsed:true` over a malformed,
  `snapshot_unstable`, forbidden-field, unknown-citation or unresolved-conflict payload is refused, and the
  recomputed outcomes (never the record's claimed ones) govern green. The injected provenance is recomputed
  from the slot, `discarded` from the frozen schedule, and a `modelIdentity` of `match` is accepted only when
  the recorded reported id equals the requested id. The schedule manifest is read **from disk** (a
  caller-supplied manifest argument is accepted only when canonically identical). Any inconsistency, schedule
  violation or **missing** frozen artifact refuses with a fixed error and writes **no partial pack**. `green` is
  computed by the exporter and requires the run report to **agree** — a fabricated green is non-green.
- **Report-only hygiene.** Decoded completions and request text are scanned for identity/secret shapes; a
  finding is recorded, never used to alter the evidence (the public synthetic corpus carries no live secret).
- **Verified claims are proof-bound.** A `verified` capability claim in an authorization record must name a
  non-secret JSON proof under `harness/librarian-generation/capability-proofs/` whose bytes, identity fields and
  evidence file bind it; the third-party egress `artifactDigest` must equal the frozen corpus digest. No proof
  exists today, so every `verified` route refuses.

The local staging directory `harness/librarian-generation/capture/` is git-ignored; only the exported,
sanitized pack under this tree is durable.
