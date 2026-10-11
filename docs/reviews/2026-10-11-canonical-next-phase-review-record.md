# Canonical next-phase review record — isolated-served validation (documentary)

**Date:** 2026-10-11
**Subject:** the bounded, local, isolated-served validation of the plugin-owned `list_activity` public
filter rename (`actorId` → `personActorId`), the five canonical-instrument corrections, and the People
inner-split geometry — the review packet `dashboard-isolated-served-review-2026-10-11`.
**Public-record hygiene:** this record carries labels, not live endpoints or private ids.

## Verdict

> Reviewer verdict: ACCEPTED FOR NEXT PHASE — NOT PRODUCTION ACCEPTANCE.

**Verbatim boundary.** That sentence is the reviewer's decision, quoted **exactly**. The reviewer's **full
written response was provided to the requester** and is **not reproduced here** (hygiene/length); this
record carries the decision verbatim plus the reviewer's **authoritative qualifications** as they bear on the
next phase. Nothing here is fabricated or reconstructed.

## Reviewer qualifications (authoritative)

- The **canonical-instrument corrections were accepted as instrument/dataset-shape corrections**, with one
  explicit qualification: correction **#3 is NARROWER than the assertion it replaced — NOT equivalent**. The
  loosened assertion ("every `get_topic` target ∈ the index's topics") only shows the request **belongs to
  the index**; it does **not** catch a **wrong but valid topic** being read while a different topic is
  selected. A **follow-up is required** to restore the selected-identity guarantee.
- The next phase the decision accepts is a **canonical served acceptance** decision — **explicitly NOT a
  production stage** and **not production acceptance**.
- Note on an earlier imprecision: an earlier statement that the corrections were *"none weakened to pass"* is
  **replaced** by the precise accepted-narrow-guarantee + follow-up statement above (see the corrections
  section).

## What the decision does — and does not — authorise

- It accepts proceeding to the **next phase**: a **canonical served acceptance** decision, taken separately,
  elsewhere. This is **explicitly NOT a production stage**.
- It is **NOT production acceptance**. Nothing here authorises a deployment, a **shared-host write**, an
  instance restart, a merge, a push or a tag.
- The evidence is a **bounded, local, isolated-served validation** on an owned throwaway instance. The
  served passes are **not reproducible** from the packet alone — they need a compatible external host
  checkout (packet §9). No compatible host is bundled and none is claimed.

## Facts the decision rests on (from the run; labels only)

- **Public filter renamed** `actorId` → `personActorId` (`src/actions.ts` `list_activity`,
  `nakama.plugin.json` `inputSchema`, `src/ui.tsx` People-rail scope). The internal store scope field stays
  `actorId` (`src/store.ts` unchanged); auth-principal and host-mirror uses are kept. The host strips a
  top-level `actorId` (`SPOOFABLE_INPUT_KEYS`), so before the rename the person filter was always
  `undefined` on a served host and the person rail returned the whole window.
- **Served-layer read-back (the fix, read off the served org, not derived):** unscoped total = 16;
  person A = 16; person B = 0; a bogus `personActorId` = 0; the old reserved `actorId` = 16 (silently
  unscoped). A and B are now distinct.
- **Five canonical assertions corrected** (`harness/verify-page.mjs`) — instrument/dataset-shape
  corrections **accepted by the reviewer**, with one qualification. Correction **#3** ("reads only that
  topic") was **loosened** from "every `get_topic` == `topicId`" to "every `get_topic` target ∈ the index's
  topics": the reviewer ruled this **narrower, not equivalent** — the request only has to *belong to the
  index*, so it **does not catch a wrong but valid topic read while a different topic is selected**. That
  weaker guarantee is **accepted for this phase** with a **follow-up required** (the selected-identity
  assertion, tracked in the plan §3.5). Canonical pass moved `93 PASS / 5 FAIL / 79 SKIP (exit 1)` →
  `99 / 0 / 78 (exit 0)` at both reference viewports.
- **People inner-split geometry** corrected: rail floor `minmax(250px,0.6fr)` → `minmax(min(250px,37.5%),
  0.6fr)`. Served canonical C2 measured lane 304.25 / rail 189.75 = **1.60×** at 1280.
- **Coverage is not comprehensive, and says so.** The canonical SKIP set is **78 = 34 retired / 39 absent
  / 4 relocated / 1 covered-elsewhere** (the last class was labelled `instrument_missing` before this
  pass's documentary rename — see that record's companion note). **39 checks have no subject in this
  dataset.** The class judgments are the harness's own reason-text classifier, i.e. instrument judgment,
  not machine truth.

## Documentary corrections applied in this pass (no execution, no product/source change)

This record accompanies three documentary corrections; none of them changes a count, an assertion or
product behaviour:

1. **Public-API migration note** placed prominently in `README.md` (*Upgrading: the `list_activity` person
   filter is now `personActorId`*), with a one-paragraph boundary pointer in
   `docs/design/dashboard-minimal-implementation-design.md` §12.5. It states: the key was renamed with no
   shim; old callers are **silently unscoped** (the host strips the key before the plugin runs); **verify
   totals** after upgrading because a `200` proves nothing about scoping; the filtered view is **not
   access control**; and authentication/security are unchanged.
2. **Geometry comment corrected** in `harness/canonical-served/people-lane-rail-regression.mjs`: the
   doc-comment said the corrected floor was `min(…,34%)`; it is `min(…,37.5%)`, the value that actually
   ships in `src/ui.tsx` (comment drift, no functional impact).
3. **Skip-class label renamed** `instrument_missing` → `covered_elsewhere` in the live classifier
   (`harness/canonical-served/skip-audit.mjs` label string and doc comment) only. No counts and no
   assertion logic changed; the single subject in this class ("paging the rail's window is composition
   only") is asserted **inside** the paging check above it, so it is real coverage, not a gap. **The label
   rename explains the old label; the historical transcripts and archives that carry
   `instrument_missing` are preserved immutable and are not rewritten.**

## Boundaries (stated, not implied)

- **Historical archives and transcripts are untouched.** No superseded record, montage or archived packet
  was rewritten; a correction lives in this document and in the amended current docs, not in a rewrite of
  the past.
- **No execution.** No instance was started or written, no shared host was deployed to, nothing was
  committed, pushed, tagged, merged or force-pushed.
- **Reviewer qualification retained:** the acceptance is *for the next phase* — a **canonical served
  acceptance** decision, **explicitly not a production stage** — and is **not** production acceptance.
  Correction **#3** is accepted only as a **narrower guarantee**, with a **follow-up required** to restore
  the selected-identity assertion.
