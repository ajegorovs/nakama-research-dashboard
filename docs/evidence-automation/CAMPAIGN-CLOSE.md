# P1C — campaign close record (2026-10-05)

Status: **P1C closed with qualified acceptance. No R9 authorized or requested.** This record
closes the P1B/P1C validation campaign, states the eventual-monitor contract, lists the carried
limits and points to the standing decisions in [`DECISIONS.md`](DECISIONS.md). It is a
bookkeeping/records close, not a new controlled run.

## What was validated

The cumulative P1B/P1C campaign validated Evidence Automation V1's **transport, discovery,
identity, delivery, replay, provenance, authorization, caching, served-build guard, hard-stop and
containment** mechanisms. No loss-of-event defect was demonstrated.

## What was not achieved

No single pristine controlled run closed green. The one authorized R8 live unit stopped after PR
#5 merged because the first bounded post-merge observation did not produce the expected PR fact,
and the preserved phase diagnostic was insufficiently phase-local to prove the exact internal
failure mode. "Qualified acceptance" carries that result as a known limit rather than claiming a
clean closure. The full ruling is in [`DECISIONS.md`](DECISIONS.md) (D-001).

## Eventual-monitor contract

> An upstream-eligible fact remains discoverable until it is observed exactly once. Monitoring may
> require a later poll, because upstream visibility is asynchronous.

Stated as intent, not as a proven visibility bound (see D-002, D-003).

## Carried limits

1. Asynchronous upstream visibility — the eventual-monitor window bound is unknown.
2. Production eventual-monitor semantics — undeveloped and not authorized.
3. Harness phase diagnostics — the archived R8 failure mode is not retro-provable; bookkeeping was
   corrected offline for future observations only.

## Records and immutability

The campaign archives (R2→R8 plus the Evidence Automation review packages) are **immutable and were
not overwritten or re-created**. A point-in-time sha256 index was measured on 2026-10-05 and is
held with the close package; it confirms, among others, the last R8 archive
`P1C-R8-served-guard-live-stop-20261005T023011Z.zip`
(sha256 `7d2ecc2890386b3f54fc4e9002298c8680f47abeb03f6110feaad938dc3504e6`). Because this is a
measurement at a point in time, it is not a re-attestation that every archive was originally
produced by the bytes it now holds; no archive was re-zipped.

## Product integration

The accepted production changes integrated with this close:

- **Dashboard plugin** — the shared activity line's **actor attribution** now distinguishes a
  recorded `system` actor (collector/automation) from an unmapped human/agent and from the event's
  source type, with discriminating source unit tests. Typecheck and the full plugin suite are
  green; the built UI bundle matches its source byte-for-byte.
- **Documentation separation** — product-facing docs describe product semantics only; the R1→R8
  driver is retained as a historical validation harness and is not shipped as product
  architecture (D-005).
- **External synchronizer — bounded discovery.** The worker's bounded discovery path (merged PRs
  plus default-branch direct commits for **one** enrolled repository) is an accepted P1C
  production change. It is finite and manually started, and **one-shot by default**; it is
  deliberately **not** a scheduler, daemon or periodic authenticated production monitor — the
  periodic eventual monitor is deferred and unauthorized (D-003). The attempt observer in the
  worker's `github_source.py` is a default-absent, side-effect-free **optional diagnostic seam**
  (retained so a future offline observation can be phase-local, D-004); it is neither product
  monitoring nor the shipped R1→R8 driver architecture.

The accepted integration is recorded as **immutable committed implementation points** in
[`INTEGRATION-BASELINE.md`](INTEGRATION-BASELINE.md): the dashboard plugin's actor-attribution
change at `b34b2525f5bde0bba383c64b350b29a3d742125c` (established `main`, owner-authorized) and the
bounded-discovery synchronizer at `89e4f301ba52788cb98cca8fd4085510b1040f20`. Dashboard publication
of this record is owner-authorized. The synchronizer repository is **local-only** (no configured
remote), so its archive is available for local transfer — it is not push-published and has not
already been transferred. The historical plugin/host/worker implementation points (`c03a99d…`,
`945420b6…`, `7c41e55…`) and the qualified acceptance (D-001) are preserved unchanged.

## Boundaries

**Historical campaign and offline-correction scope** — no R9, no monitor, no live GitHub request,
no service operation, no credential read, no scheduling, no corpus/fixture write, no deployment, no
commit/push. The campaign itself and the D-004 bookkeeping correction were offline: neither made a
live action or a commit.

**Current owner-authorized integration** — the accepted production changes are committed as the two
immutable points above: dashboard actor attribution `b34b2525f5bde0bba383c64b350b29a3d742125c` and
synchronizer bounded discovery `89e4f301ba52788cb98cca8fd4085510b1040f20`. The Nakama host tree is
untouched (no new host commit, no upstream push). Dashboard publication is owner-authorized, and the
local-only synchronizer archive is available for local transfer (not push-published, not already
transferred). No live action was taken: no live GitHub request, service operation, credential read,
scheduling, corpus/fixture write or deployment.
