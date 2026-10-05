# Evidence Automation V1 — scoped product documentation

Status: **implementation accepted; reviewer-closed.** The coupled plugin/host foundation,
external synchronizer and isolated validation slice are accepted, including the bounded worker
metadata-digest receipt correction. See the [acceptance record](../reviews/2026-10-04-evidence-automation-v1-acceptance-record.md)
for the final ruling, verification provenance and boundaries.

**Further operations** — production enrollment/backfill, credentials, scheduling, deployment,
existing-service restart and research-corpus writes — remain separately owner-authorized. Commit/push and
integration of the accepted production changes were owner-authorized and are done
([`DECISIONS.md`](DECISIONS.md) D-007). Publication of this record is owner-authorized.

## Post-campaign addendum (2026-10-05)

The P1B/P1C validation campaign is closed with qualified acceptance; no R9 is authorized. See
[`DECISIONS.md`](DECISIONS.md) (standing decisions, D-001…D-006) and
[`CAMPAIGN-CLOSE.md`](CAMPAIGN-CLOSE.md) (the close record).

- **Actor attribution (accepted production change).** The shared activity line now states a
  recorded `system` actor (collector/automation) distinctly from an unmapped human/agent and never
  derives it from the event's source type (immutable point
  `b34b2525f5bde0bba383c64b350b29a3d742125c`). Source unit tests pin the decision
  (`src/ui-attribution.test.ts`), the plugin typecheck and full suite are green, and the built UI
  bundle matches its source byte-for-byte (`ui/app.js` sha256
  `41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc`, measured 2026-10-05). This
  **supersedes** the wave-4 "no UI change" statement below, which was accurate for that wave.
- **Product vs validation harness.** This document and `CONTRACT.md` / `INTEGRATION-BASELINE.md`
  describe **product semantics only**. The R1→R8 driver (phase gates, dynamic budget, external-IO
  guard, sealed-driver diagnostics, served-build guard wiring, budget-guard framework) is a
  **historical validation harness**, not product architecture, and is not shipped (D-005).
- **Bounded-discovery worker integration (accepted; explicitly not monitoring).** The P1C
  bounded discovery path — finite, manually started and one-shot by default, for one enrolled
  repository — is an accepted production change to the external synchronizer. It is deliberately
  **not** a scheduler, daemon or periodic authenticated production monitor; periodic
  eventual-monitor semantics remain deferred and unauthorized (D-003). Its integration is
  committed as the immutable synchronizer point
  `89e4f301ba52788cb98cca8fd4085510b1040f20` (local-only: the synchronizer repo has no remote, so
  its archive is available for local transfer, never a push — not already transferred). Dashboard
  publication of this record is owner-authorized. The worker's
  `github_source.py` attempt observer is a default-absent, side-effect-free **optional diagnostic
  seam** (retained so a future offline observation can be phase-local, D-004) — not product
  monitoring and not part of the shipped R1→R8 driver architecture.

## Reviewer ruling (verbatim)

> **Evidence Automation V1 design is approved with amendments.** Use a separate deterministic GitHub synchronizer and a minimal atomic plugin ingest/provenance contract; existing general-purpose actions are not sufficient for reliable production ingestion. Canonical external identity and mapping authority are server-owned and independently validated. V1 attribution is explicit-only and corrections are append-only; no heuristic classification or automatic hierarchy/state mutation is permitted. Production ingestion requires a host-enforced ingest-only collector identity; a broad member API key is not approved for real writes. `ajegorovs/udv-echo-process` is approved as the first real source, but the first write validation must target an isolated controlled fixture Axis with one real merged PR and one distinct default-branch commit, no historical backfill, issues, interpretation or scheduling. After replay/crash/idempotency/security E2E acceptance, actual research-Axis enrollment and backfill become separate owner decisions.

Recorded with status **implementation underway / not accepted** (the ruling's own wording is preserved above;
only the leading note and the status line are this document's addition).

## What this wave implements

- **Plugin** (`nakama-research-dashboard`): migration `005-external-evidence`, store methods
  `enrollExternalRepository`, `setExternalObjectMapping`, `ingestExternalEvidence`, `readExternalReceipt`
  and lookups, four collector/admin actions, and a regression suite they cannot be built without.
- **Identity and validation hardening**: the ingest path requires and validates every allowlisted semantic
  field (full merge/tree/parent SHAs, valid PR node id, positive PR number, consistent event timestamps),
  cross-checks `objectId`/`objectNumber` against the payload, and refuses anything malformed as a structured
  `rejected` — never a thrown 500. It enforces a default-branch assertion against the server-owned
  enrollment's approved branch (the worker asserts the observed branch and the server checks it against the
  enrollment; V1 performs no upstream provider fetch), refuses padded semantic fields rather than silently
  normalizing them, and compares provenance metadata and resolved attribution (Axis and Problem)
  on replay, so an incompatible source author/event time/source URL/summary/mapping is a conflict rather than
  a silent replay.
- **Host** (`nakama`): an org-scoped `collector` API-key scope, a deny-by-default capability gate, the
  collector ingest/readback routes, admin-only enrollment routes, and unit tests for the denial matrix.

The external-worker contract this freezes is in [`CONTRACT.md`](CONTRACT.md).

## Wave 4 validation coverage (the corrected slice)

The wave-4 E2E (`<host>/apps/server/src/testing/evidence-e2e/run.ts`) runs the loss/recovery scenario **first,
on a fresh outbox and an empty Axis** rather than as a replay on already-inserted rows:

- the **first** commit response is dropped *after* the host committed (count `0 → 1`), the worker parks
  `unknown_outcome`, then a **new OS process** resolves it by exact-key readback with the count unchanged and
  no duplicate row (L1, L1b, L1c, L2, L2b); the remaining PR fact is delivered afterwards (count `1 → 2`);
- **replay** returns the same receipt exactly (identical `activityId`/`recordedAt`/`observedAt`/
  `payloadDigest`/`metadataDigest`) and leaves the Activity rows byte-identical — no insert, no recency touch
  (C1, C1r, C1n);
- a changed **metadata** field and a changed **payload** field each conflict with the right reason
  (`identity_metadata_mismatch`, `identity_payload_mismatch`, both HTTP 409) (C2, C2b);
- a caller-named target without an approved mapping is refused (`object_mapping_mismatch`, 400) (C5);
- the collector principal is denied on the admin `reconcile_topic` action and the admin enrollment route, in
  addition to the wrong-plugin and generic-route denials (S4, S5, S1–S3);
- an **actor-spoof** request that stuffs `actorId`/`actorType` at the top level and inside `input` cannot
  rewrite the receipt or mint a human actor: the service principal stays `system` (S6).

**Executable negative controls** prove each guard's test *can go red*: `negative-controls.ts` stages a
disposable copy of the guard source, removes exactly the check under test, and asserts the focused test flips
from green to red — for identity uniqueness, replay, mapping and the host collector security boundary
(4/4 demonstrated).

The render pass (`harness/preview/e2e-render.mjs`) is now **portable**: no machine-specific default, an
explicit/`NAKAMA_CHECKOUT` checkout, an ephemeral port, a scratch workspace (the committed
`harness/preview/fixtures.json` is never overwritten), a populated-DOM readiness check instead of a swallowed
timeout, and a served-vs-committed bundle hash check. It remains the **preview shell**, not the served host web
app.

### Portable run commands

```
# plugin gates (from the plugin checkout)
bun run check            # typecheck + build + bun test src
bun run typecheck:host -- --checkout <nakama checkout>
bun run harness:records  # public-tree redaction / home-path hygiene

# host E2E + negative controls (from the host checkout; both trees are required inputs)
EVIDENCE_PLUGIN_DIR=<plugin checkout> EVIDENCE_WORKER_DIR=<worker checkout> \
  bun run apps/server/src/testing/evidence-e2e/run.ts
EVIDENCE_PLUGIN_DIR=<plugin checkout> EVIDENCE_HOST_DIR=<host checkout> \
  bun run apps/server/src/testing/evidence-e2e/negative-controls.ts

# render against the E2E's captured payload (from the plugin checkout; explicit checkout, ephemeral port)
bun harness/preview/e2e-render.mjs --payload <artifact>/render-payload.json \
  --checkout <nakama checkout> --out <dir>
```

## What this wave does not do

- No synchronizer, polling, cursor/outbox or GitHub retrieval **inside the plugin**: those live out-of-repo
  in `github-evidence-synchronizer` (wave 2).
- No integration slice against a **shared or live** instance: wave 3 ran an isolated, disposable slice (real
  host auth/HTTP transport, a locally built official plugin release invoked as a child process, and the
  external Python synchronizer over the pinned public fixtures) with two facts and a simulated
  response-loss/readback recovery. It did not touch any shared instance, corpus or research Axis, and no
  served-host UI render is claimed (the render used the isolated preview shell).
- No enrollment, no collector credentials, no writes to any live or shared-fixture instance.
- No UI change: the committed `ui/app.js` is byte-identical to the baseline
  (`sha256 714e55a7f9181bffc0e7ef144c1cfa18fe8c1fcbf3cde10136b030b8fa86179b`).

## Separately recorded defect — `record_activity` Problem mismatch

The `record_activity` action's manifest description advertises a `problemId` ("Naming a problemId records the
event as evidence for that problem"), but the declared `inputSchema` does not include `problemId`, and the
action's `dispatch` case does not read it. The store method `addActivity` *does* accept a `problemId`, so the
gap is between the advertised action and the store capability, not in the store itself.

This is a **pre-existing** defect in the general coordination surface. It is recorded here, not fixed:
changing the public `record_activity` contract is outside this package's approved scope, and the amendment
says so explicitly ("Existing record_activity contract unchanged; its advertised Problem support mismatch is a
separately recorded defect, not a fix in this package"). The evidence ingest path does not depend on it — it
resolves the optional Problem from a server-owned enrollment mapping, never through `record_activity`.

## Boundaries and limitations

- The `collector` capability is enforced **host-side**. A collector key is a service principal: the host
  restricts it to the ingest/readback routes and the plugin records the actor as `system`. The plugin action
  itself does not re-derive the caller's identity from any input, and the generic plugin action route refuses
  the collector-only keys.
- Platform administrators with no org role are not accepted by the enrollment routes (the plugin actor role
  becomes `viewer`); an org admin is the intended enrollment caller. This is a known boundary, not a bug
  claimed fixed.
- The plugin database is per-organization today; `org_id` is nevertheless carried on the enrollment, mapping
  and receipt rows and is part of every uniqueness constraint, so a future shared generation cannot silently
  collapse two organizations' facts.
- Only `pr.merged` and `commit.observed` are accepted. Open PRs, issues, lifecycle transitions, snapshot
  revisions and corrections are out of V1 scope and are refused, not guessed at.
- No historical-database adoption: rows without an external key are never deduped or rewritten.
