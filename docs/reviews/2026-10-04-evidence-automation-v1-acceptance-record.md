# Evidence Automation V1 — implementation acceptance

## Reviewer verdict (verbatim)

**Reviewer verdict: Accept Evidence Automation V1 implementation. No further technical conditions.**

### Durable ruling (verbatim)

> **Evidence Automation V1 implementation is accepted.** The previously blocking worker-side receipt-verification defect is corrected: the synchronizer now recomputes the server-compatible provenance metadata digest, including summary, requires a valid matching `metadataDigest` on ingest and exact-key readback receipts, and quarantines missing, malformed, or incompatible receipts rather than treating them as delivered. Worker/server canonicalization parity is executable and matches the real isolated-server receipts for both V1 facts. Regression tests cover metadata mismatch and unknown-outcome recovery, and a discriminating negative control proves the guard can fail red when removed. The corrected isolated E2E remains green, including first-insert response loss and new-process readback recovery. No broader design changes are required.

## Accepted scope and before → after

Separate deterministic GitHub synchronizer → host-restricted collector → atomic plugin ingest/provenance/readback → existing Activity model. Canonical identity and enrollment/mapping authority are server-owned. Only `pr.merged` and default-branch `commit.observed`; explicit attribution, no automatic hierarchy, Person creation or interpretation.

Before correction, a receipt with matching identity/payload but incompatible summary metadata could be treated as delivered during unknown-outcome recovery. After correction, the shared ingest/readback verifier requires valid matching `metadataDigest`; missing, malformed or incompatible receipts quarantine. No host/schema/UI redesign accompanied this correction.

## Verification provenance

Parent independently reran: plugin check **177 tests passed**, focused host tests **26 passed**, corrected worker suite **86 passed**, isolated real HTTP/plugin/worker E2E **36/36**, original four negative controls and fifth worker metadata control green (pristine green, mutation red). Parent inspected unchanged-UI preview rendering **6/6**. Plugin host-typecheck: zero plugin diagnostics, with 155 host-source compiler-context diagnostics separately reported, not represented as a clean whole-host typecheck.

Reviewer independently inspected the correction, ran focused packaged-worker regression cases, checked archive integrity and verified **94 hash-manifest payload entries**. Worker/server digests for the actual facts matched:

| Fact | Metadata digest |
|---|---|
| `pr.merged`, PR #69 | `27936ca6eca85acf0fbd2ed278b3ba8c6fd3479b0d4c1e88076c6775a824246f` |
| `commit.observed` | `4db1e001312e28f1ca8a42d9e98e895ead9142cdcf083f8a3340c7556230d0fd` |

Source: public repository `ajegorovs/udv-echo-process`, immutable repository id `1314713700`, PR node `PR_kwDOTlzwZM8AAAABFhh8sw`, distinct non-merge commit `62ff1e52878a62b7415ebac63aa0346e417bfad0`.

## Build/package identity

Reviewed revision-2 archive SHA256: `2f0dd97a50f859246f230c3474c385b07b7ecf5f79097df0d5fc6f8beab284a2`.
Plugin base: `d8f8a7de01a81fcd21df41120279dafeb1054cbb`; host base: `c33b36dd2d3320fe8c6d05cb6138a7adcd270e7e`. Implementation was uncommitted at review; worker was a separate project without git metadata. This record/status closure follows review and is not claimed to be inside the reviewed archive.

UI bundle remains baseline SHA256 `714e55a7f9181bffc0e7ef144c1cfa18fe8c1fcbf3cde10136b030b8fa86179b`. No deployed digest-folder release or instance revision is claimed: validation used disposable infrastructure, not an installed shared instance.

## Boundaries and deviations

- E2E used in-memory host DB, real plugin SQLite/child process, real HTTP and external worker processes. Disposable worker backoff timestamp was time-shifted; no deployed-runtime acceptance claim.
- Render used the isolated preview shell, not the served host web UI. Dashboard UI source/bundle unchanged.
- Earlier pristine negative-control failure was retained and traced to concurrent WAL initialization. Constructor mode switching was corrected without sleeps/retry masking and rebuilt before the final gates.
- Earlier render execution used the original host checkout; its initial generated preview files are now absent. Original bytes/removal mechanism were not independently established. No blanket preservation claim; final rendering is isolated and no host UI source edit is implicated.
- Existing `record_activity` advertised Problem mismatch remains separately recorded, not fixed.
- No production enrollment, real credential setup, scheduling, deployment, existing-service restart, corpus/shared-instance writes, commits, pushes or merge authorized by this acceptance.

## Next boundary

Implementation is reviewer-closed. Commit/push and repository integration require owner authorization. Actual research-Axis enrollment and backfill are later, separate owner decisions.
