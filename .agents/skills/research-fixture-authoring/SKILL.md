---
name: research-fixture-authoring
description: Use when seeding, amending or verifying a research fixture.
version: 0.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [nakama, fixture, research-dashboard, evidence, provenance, records]
    category: software-development
    related_skills: [dashboard-build-and-serve, acceptance-pass, public-records-hygiene]
---

# Research-fixture authoring

> **Status: initial, unvalidated procedure (v0.1.0).** Written from the post-mortem of a first fixture
> exercise, but **not yet run end-to-end by a zero-context session**. Treat it as a proposal to be
> validated (see *Validation*) before its output is relied on. The governing plan is
> [`docs/plans/research-fixture-methodology.md`](../../../docs/plans/research-fixture-methodology.md).

## When to Use

- You are about to seed a **fresh** research fixture (topics → development axes → evidence).
- You are about to **amend** an existing, accepted fixture.
- You are verifying either of the above against its source.

## The one rule

**Content is easy; evidence, ordering and provenance are the hard part.** The first exercise's deviations
(a confidence/evidence sequencing flaw, null plan positions, an unsupported problem-evidence link, a
substituted source date) all came from seeding content without that discipline. Author the discipline
first.

## Program: pick one, state it before writing

| Program | Target | Assumption |
|---|---|---|
| **Baseline seed** | a fresh, empty target | nothing exists; every required field must be sourced from the first write |
| **Retained-fixture amendment** | an accepted fixture | the fixture exists; the amendment is **append-only and idempotent**, never rewriting an accepted record |

Do not carry empty-start assumptions into an amendment, or an existing-record assumption into a seed.

## Classify every field before writing

Assign each proposed field exactly one disposition:

- **required** — must be present and source-backed; absence is a defect.
- **optional** — may legitimately be absent; leave blank and say so.
- **unavailable** — the model/toolset cannot represent it; record the limitation, never fabricate.

For each required field, name the **source**. For each unavailable one, name the boundary.

## Evidence rules

1. **No invented evidence.** `confirmed` is refused unless backed in the **same call** by an activity,
   annotation, branch or PR. Keep `inferred` as `inferred`.
2. **Atomic initial evidence.** Put a topic's initial supporting activities **inside the same
   `reconcile_topic` transaction** as the claims they back. `record_activity` is for later arrivals.
3. **Immutable source refs and dates.** Record the public source and the source's **own** date. Never
   substitute the ingestion/recording date for a document's publication date; keep day-only dates day-only;
   quote a pinned commit by its pin.
4. **Dedup and versions.** `get_overview` for the baseline, `search_dashboard` per name, and
   `expectedVersion` on every write; on `conflict`, re-read and decide — never overwrite blindly.
   `truncated` is not `absent`.

## Procedure

1. **Classify** every field (§above) and list its source. Unclassified field ⇒ stop.
2. **Check the gates** (plan §6): explicit target chosen and recorded; served build established by
   measurement; dedup pass done; versions captured; source refs/dates immutable and public; hygiene
   applied.
3. **Seed or amend** through the product's own write path only — never SQL, never a harness seeder for a
   manual fixture:
   - search-before-create, then one atomic `reconcile_topic` per topic carrying the initial evidence;
   - `record_activity` per *subsequent* event;
   - clean up on any `truncated` read by paging, not by assuming empty.
4. **Read back and reconcile.** Re-read topic-wide and axis-scoped; check counts programmatically (never
   from memory); confirm no un-targeted store changed.
5. **Label the run** — baseline seed or amendment — and stage it for the mutation-gate review. A fixture
   write needs **owner authorization**; a green local run is not that authorization.

## Validation (required before trusting this skill)

A fresh, **zero-context** session is given this skill and the plan and nothing else, attempts one work
package, and reports ambiguity/gaps. Fix the skill from that report and re-run. Until then this skill is
*initial*, and any output claiming to follow it must carry that caveat.

## Pitfalls

1. **Confirmed-at-seed.** Requesting `confirmed` claims in the initial reconciliation while scheduling
   their activities for later calls produces refusals and ad-hoc downgrades. Sequence evidence with the
   claim.
2. **Ingestion date as source date.** A document with no supplied date gets the recording time, which is
   **not** its publication date. Omit rather than substitute; report the precision limit.
3. **Null positions.** Relying on the read projection to convey "authored order" is not an ordering
   contract. Encode explicit `position` values.
4. **Problem evidence.** The event tool advertises a problem link it cannot carry. Record the limitation;
   do not improvise a workaround.
5. **Attribution.** A person with no mapped account is `attributable=false`, **not** "idle".
6. **Designing around a suspect fixture.** Never fold UI design into a fixture whose data linking is under
   review; settle the data first (UI is a separate, deferred track).
