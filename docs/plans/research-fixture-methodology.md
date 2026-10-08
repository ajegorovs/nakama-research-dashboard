# Research-fixture methodology

> **Status: methodology proposal.** Nothing here executes a fixture write, a source change, a service
> change, a research run or a UI change. It defines *how* a future fixture session is scoped, seeded,
> verified and reconciled. The sanitized review evidence it responds to is
> [`docs/reviews/public-research-fixture-findings.md`](../reviews/public-research-fixture-findings.md);
> the contributor procedure is the skill `.agents/skills/research-fixture-authoring/`.

## 1. Provenance and what is preserved

This methodology builds on the **accepted first exercise** (merged PR #3): the plan
`docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md`, the qualified exercise report
`docs/reviews/2026-10-07-public-research-fixture-exercise-report.md`, and the sanitized evidence summary
`docs/reviews/2026-10-07-public-research-fixture-evidence.json`. **Those records remain the historical
record and are not superseded, amended or re-litigated here.** The earlier acceptance history — including
the ratification of the four inferred claims, the withdrawal of the false missing-summary finding, and
the acceptance of the page-only verification qualification — stands.

The first exercise exposed interacting packet, procedure, execution and product-contract weaknesses;
no single root cause is established for all findings. One established sequencing defect requested confirmed
claims in the initial reconciliation while scheduling supporting activities for later calls. Future research
must distinguish missing instructions, workload decomposition, worker deviations and backend limitations.
This methodology addresses that investigation as a **separate track**, as the PR #3 closeout states.

## 2. Informational blocks — required / optional / unavailable

Every field a fixture proposes is assigned exactly one disposition *before* any write. This is the
methodology's central rule: **silence must never be mistaken for coverage, and absence must never be
papered over with invention.**

| Disposition | Meaning | Absence is | Handling |
|---|---|---|---|
| **required** | must be present and source-backed | a defect | block the write until sourced, or record an explicit open finding |
| **optional** | may legitimately be absent | honest, not a defect | leave blank; state that it is deliberately unset |
| **unavailable** | the product model or toolset cannot represent it | a stated limitation | record the limitation; **never** fabricate a workaround |

These are exactly **three field dispositions**. **"Supported" is not a fourth one** — it is a *capability
status* reported about a **tool path**, alongside the field's disposition, never in place of it. The
F14a case below is the worked example: its field disposition is **required** while its capability is
**supported**.

Worked examples from the retained fixture: repository factual descriptions are **required when the public
source is available** (F07); topic descriptions and human-approved summaries are **optional** (F07b, F16 —
blank by design); an axis's deliberately-absent `currentState` is **optional** (F08); a plan step's
`position` is **required** (its absence is the F12 defect); a first-class visible plan-provenance field is
**unavailable** if the exposed contract lacks it (F13); a repository **pin** field is **unavailable** if
the repository model does not carry it (F09b); a person with no mapped account is an **optional**
accepted limitation (F15 — the mapping is *representable*, the fixture context is *missing*; report
`attributable=false`, never "idle"); and problem evidence splits three ways (F14): targeting an
**existing** problem through `reconcile_topic.activities[].problemId` is a **required** field on a
**supported** capability (F14a), targeting a **newly generated** problem by title in the same call is
**unavailable** (F14b), and `record_activity` omitting `problemId` entirely is a **schema defect** (F14c).

## 3. Per-issue discipline — WHY and HOW

Every finding is carried with two things, so it is actionable and auditable:

- **WHY** — the claim the finding would change if it were true (the consequence, not the symptom).
- **HOW** — the *exact source* that would settle it and the *exact readback* that would confirm the fix.
  A hypothesis is never promoted to a fact by assertion; a reviewer's causal claim is recorded as a
  hypothesis until a measurement or a retained record supports it.

The full per-issue WHY/HOW table is in the findings document (§A). The methodology requires every future
finding to be written in the same shape.

## 4. Evidence rules (non-negotiable)

1. **No invented evidence.** A `confirmed` claim is refused unless it is backed in the **same call** by an
   activity, annotation, branch or PR. Where the packet says `inferred`, write `inferred`. Where a field
   is absent, leave it absent — do not synthesise a plausible value.
2. **Atomic initial evidence.** A topic's initial supporting activities belong **inside the same
   `reconcile_topic` transaction** as the claims they back. `record_activity` is for events that *arrive
   afterwards*, not for manufacturing the evidence an initial claim needs. (This is the sequencing rule
   the first packet violated.)
3. **Immutable source references and dates.** Record the **public source** (repo, PR/commit ref, document
   path) and the **source's own date**. Never substitute the ingestion/recording date for a document's
   publication date; day-only source dates stay day-only and no time-of-day is invented. A pinned commit
   is quoted by its pin; the pin is authoritative, not the moment it was read. When a document carries
   **no explicit date**, date it by the **last file-touch commit at or before the pin**, recording that
   basis and its precision; a PR or commit event carries its **own** event date.
4. **Dedup / version-aware reconciliation.** Search before create (`get_overview` for the baseline,
   `search_dashboard` for each topic/axis name), pass `expectedVersion` on **existing versioned
   mutations** (a fresh create has no version to check), and on `conflict` re-read and decide again —
   **never** overwrite blindly. `truncated` is not `absent`: page a truncated read rather than treating it
   as empty.

## 5. Retained-fixture amendment vs baseline seed

These are **two different mutation programs** and must not be conflated:

- **Baseline seed** — builds a *fresh* fixture from an empty target. The full required/optional/
  unavailable assignment and all evidence rules (§2–§4) apply from the first write, because nothing can be
  assumed to exist.
- **Retained-fixture amendment** — corrects or enriches an *existing, accepted* fixture (the one PR #3
  retained). An amendment is **explicitly approved and idempotent**: it re-reads the current version,
  adds only what sources support, and may correct existing links, dates or positions only through an
  approved before/after delta. Do not duplicate events to simulate corrections. Preserve stronger human
  steering and historical acceptance records; those constraints do not prohibit authorized fixture edits.
  A correction to a published acceptance record lives in a **new document**, not in a force-push.

A session must state which program it is running before its first write, and must not carry a baseline
seed's empty-start assumptions into an amendment (or vice versa).

## 6. Gates around a mutation

No fixture write proceeds until **all** of these pre-write gates hold. A gate that cannot be met stops
the session and is reported, not worked around.

1. **Explicit target chosen.** The organization/instance that will host the write is selected explicitly
   and recorded; a helper that could bind a default target is not used.
2. **Served build established.** The serving build is verified by measurement (the served asset, by
   digest), not by a reinstall's own output.
3. **Every proposed field classified.** Each field carries a required/optional/unavailable disposition
   (§2) and, if required, a source.
4. **Evidence is atomic and same-transaction** (§4.2).
5. **Dedup pass done and versions captured** (§4.4).
6. **Source refs and dates are immutable and public** (§4.3); nothing private is committed.
7. **Public-record hygiene** applied to anything the run would publish — labels, never live endpoints.

### Post-write readback (after the mutation, not a pre-write gate)

Once the write has run, confirm the **un-targeted store(s) are unchanged** — and do it **by their own
readback measurement**, not by DB file byte identity. A write to the target store can legitimately
rewrite shared SQLite pages without altering any un-targeted content, so a byte-identity comparison
would fire false alarms; evidence for this check is limited to measurements. This check is a **post-write
readback**, deliberately not one of the pre-write gates above (the state it inspects exists only after
the mutation).

## 7. Staged research work packages (ready to dispatch)

Each package below is **independently dispatchable** to a subagent: it has one objective, read-only or
write scope stated up front, its own inputs, a concrete output artifact, and its own gate. They are
ordered; a later package must not start before its predecessor's gate passes. No package writes a fixture
until **WP-G** (the mutation gate review) is accepted.

| ID | Objective | Scope | Inputs | Output | Gate to pass before the next |
|---|---|---|---|---|---|
| **WP0** | Fresh zero-context methodology/skill validation (§9) | read-only | this doc; the authoring skill; the local operational capability handoff (§11); a clone of the public sources and their pins | a validation report exercising representative read-only steps with no prior conversational/project memory, adequate checkout/docs, public GitHub and read-only dashboard access | guide gaps are corrected and the fresh validation passes before WP1 output is relied on — **and a passing report is not permission for WP1: explicit owner authorization is required after WP0** |
| **WP1** | Verify each finding against exact sources | read-only | findings doc §A; the public source pins | per-finding verified / refuted / unresolved, with the exact source cited | every F-row is classified; unresolved rows are named, not guessed |
| **WP2** | Reconcile retained-fixture links (F01, F02, F04) | read-only | WP1 output; current fixture readback | a link-delta proposal: what is missing, with sources | delta is source-backed and deduped |
| **WP3** | Design the baseline-seed packet | design only | WP1–WP2; §2–§4 of this doc | a seed packet with every field classified and evidence sequenced atomically | packet passes the §6 gates on paper |
| **WP4** | Design the retained-fixture amendment packet covering **every verified correctable fixture finding** — evidence links, source dates, identity metadata, `currentState`, public URLs, plan `position`s and wording — not only relationships | design only | WP1, WP2, §5 | an approved, idempotent before/after amendment plan with a delta per correctable finding | amendment preserves historical evidence and explicitly approves each fixture correction |
| **WP5** | Author reconciliation/verification checks | read-only | WP3–WP4 | executable checks for the seed/amendment invariants | a green run can go red (negative control present) |
| **WP-G** | Mutation gate review | review | WP0–WP5 | an accept/reject of any write authorization | **owner authorization required before any write** |

F14 is deliberately **not** in WP2's link-delta: it splits three ways. **F14a** —
`reconcile_topic.activities[].problemId` **can** target an **existing** problem: a *supported* capability
whose field disposition is **required** where the source backs the link. **F14b** — there is **no**
title-like reference for a **newly generated** problem in the same call (**unavailable**). **F14c** —
`record_activity` omits `problemId` entirely, a **schema defect** that leaves that event tool unable to
target **any** problem. Verify all three boundaries in WP1 and retain the product finding rather than
implying relationship enrichment repairs the contract. "Supported" here is a capability status, not a
fourth field disposition.

UI work is **not** in this package set (see §8).

## 8. Deferred and out of scope

- **UI — deferred.** The UI observations (U01–U09) are carried in the findings document but are neither
  designed nor dispatched now. Designing an interface around a fixture whose data linking is under review
  risks fixing the wrong thing; the data is settled first.
- **Ingestion/enrichment pipeline — separate project.** The knowledge-base ingestion pipeline is a
  separate project by repository scope; it is not grown into this repo and is out of scope here.
- **Reviewer-held references.** `progress_axes.jpg` and `problems.jpg` are reviewer-provided material,
  inspected externally by the reviewer and not committed here. They are **not** absent; this methodology
  does not claim to have inspected them, and the findings resting on them remain reviewer-attested — not
  silently dropped or substituted with other images.
- **Product repairs.** Findings are recorded, not fixed, in this phase.

## 9. Validation of this guide — fresh zero-context

A procedure is not trustworthy until someone who did not write it can run it. This validation is WP0
and must pass before WP1 output is relied on:

1. An agent with **zero prior context** is given the authoring skill, this document, and **adequate
   access** to checkout/docs, public GitHub sources/pins and read-only dashboard state. No prior
   conversational/project memory is supplied; necessary source access is not withheld.
2. It attempts representative WP1 read-only steps as preflight validation (not the authoritative WP1
   run) and reports where the guide was ambiguous, wrong or missing a step.
3. The guide is corrected from that report; the validation is re-run on the corrected guide.
4. The validation report is retained as evidence, including the failures.
5. **A passing WP0 is not authorization for WP1.** A green WP0 report says only that the guide is
   runnable; it is **not** automatic permission to run the authoritative WP1 research. The owner must
   explicitly authorize WP1 *after* WP0 passes. Neither WP0 nor WP1 is executed by this plan.

The initial WP0 run is retained as [`docs/reviews/wp0-research-fixture-validation-initial.md`](../reviews/wp0-research-fixture-validation-initial.md).
It is **not a gate pass**: representative read-only probes succeeded, but the guide was not runnable
from the supplied docs alone, so the guide was corrected (§11) and the run repeated. The re-run on
that corrected guide is retained as
[`docs/reviews/wp0-research-fixture-validation-rerun.md`](../reviews/wp0-research-fixture-validation-rerun.md);
it is **also INCOMPLETE — not a gate pass**: it exposed one **material** readback defect (the scoped
`get_topic` axis is under `axis` singular, not `axes[0]`) that §11 and the authoring skill are now
corrected for. The re-run on that corrected guide is retained as
[`docs/reviews/wp0-research-fixture-validation-attempt-3.md`](../reviews/wp0-research-fixture-validation-attempt-3.md);
it is **also INCOMPLETE — not a gate pass**: every representative step succeeded and the served
identity was established by measurement, but two **required-route** transport gaps remained — the
direct-HTTP action response is wrapped as `{ invocationId, result }` (the readback tables gave the
field paths at the top level), and the browser exact-org recipe did not name how to set the session's
active org. Both were corrected in §11 and the authoring skill, and the run repeated.

The re-run on that twice-corrected guide is retained as
[`docs/reviews/wp0-research-fixture-validation-attempt-4.md`](../reviews/wp0-research-fixture-validation-attempt-4.md);
it is the **latest and passing** WP0 report: every required read-only path measured clean, the
served-asset identity established by byte-level digest at the exact target org, and **no material
required-route defect**. Its one residual finding is a **non-blocking rationale wording** correction —
a direct GET does not enforce path-org == session active org; the **page** fetches the active org's
asset — corrected in §11, the authoring skill and the local handoff, with **no functional change to
the recipe**. **The authoring skill's read-only preflight is now validated at `a2e4931`; the WP5
executable checks are validated (isolated) at `77c8f5b`; and the narrow SCOPE-RETAINED amendment write
path (two `reconcile_topic` calls, T1 + T2) is execution-validated (2026-10-08 — boundary 22/22 PASS,
post-write 24/24 PASS, protected stores unchanged; see
[`docs/reviews/2026-10-08-wp-g-retained-execution-report.md`](../reviews/2026-10-08-wp-g-retained-execution-report.md)).
The full baseline seed authoring path is still not execution-validated** — no full seed has been
exercised, so the procedure is not validated end-to-end. **A passing WP0 is not permission for WP1: the
owner must explicitly authorize the authoritative WP1 research after WP0 passes.** Neither WP0 nor WP1
is executed by this plan.

Only a gap on a **required** route blocks the gate. A missing or wrong step that a zero-context
session needs to complete a required transport — the action-response envelope, the explicit
active-org selection, and the actual served-asset check — is **material** and keeps WP0 INCOMPLETE;
an **optional** refinement (clearer wording, a convenience that does not change a required read)
does not. The final re-run is scoped to exactly those required checks: the read transport and its
`{ invocationId, result }` unwrap, the explicit active-org selection (no `orgs[0]`), and the actual
served-asset path/digest assertion.

## 10. Boundaries

- This is a plan; it performs no write and makes no acceptance claim.
- It executes **neither WP0 nor WP1**: a passing WP0 report is not permission for the authoritative WP1
  run, which needs explicit owner authorization.
- It does not reopen or amend any earlier acceptance record.
- Where a capability is unavailable, the methodology records the limitation rather than inventing a
  path around it.
- Until an explicit target and owner authorization exist, no fixture is written.

## 11. Operational capability handoff and read-only access

The committed docs deliberately carry **no live endpoint, org id, path or secret**. A zero-context
WP0/WP1 session nonetheless needs read-only capability, so it is supplied by an **explicit
operational capability handoff** — a **local, git-ignored** file (private paths, ids and credentials
belong there, never here). This section states the contract; the values live in the handoff.

**The handoff must state:**

1. **Instance URLs** — the API base and the dashboard origin (loopback).
2. **Explicit target org** — its **id and name**; never a helper's `orgs[0]` default.
3. **Read-only credential source** — the mode-600 env file's **path** and the **key names** used
   (`NAKAMA_EMAIL` / `NAKAMA_PASSWORD`, the CSRF cookie name); values by reference only.
4. **Fixture mode** — whether the target is empty (baseline seed) or **already seeded** to the
   expected shape.
5. **Exact scoped read transport** — the direct-HTTP read route below.
6. **Source pins** — the frozen public commit pins.
7. **Browser support** — a cached Chromium for the served-build guard; no restarts.

**Read-only tool access (no agent turn).** WP0/WP1 verify read-only with no LLM messages. The read
tools are reachable by direct HTTP as documented in [`docs/PLATFORM-CONTEXT.md`](../PLATFORM-CONTEXT.md):

- `POST /v1/plugins/research-dashboard/actions/{get_overview,get_topic,search_dashboard}` with body
  `{input}`;
- org selected **explicitly** with `x-org-id`, and CSRF carried as `x-csrf-token` = the
  `nakama_csrf` cookie; the route requires member role or above (viewers refused);
- only the three read actions are called — **no inference, no `reconcile_topic`/`record_activity`**.

**The action response is wrapped — unwrap `result` first.** The route returns
`{ invocationId, result }` (`InvokePluginActionResponse` in the host contract); the domain payload
(`{ ok, counts, axes, … }`) is under **`result`**, not at the top level. Read every documented field
path from `result` (e.g. `result.counts.topics`, `result.axis`), **check the HTTP status and
`result.ok`**, and surface a failure — **never** fall back silently to an empty read when the shape
is unexpected or `ok` is false.

**Served-build identity — exact org, by the actual asset.** `harness/served-build-guard.mjs` is
browser-driven and **not org-aware** (it hashes whatever the active org served), so it cannot be
trusted as the default for a specific org. The route is
`GET /v1/plugins/ui/<orgId>/research-dashboard/<asset>`; the page actually fetches the plugin **root**
asset (`…/research-dashboard/?import&revision=…&version=…`), and the root, the bare
`…/research-dashboard/` and `…/research-dashboard/app.js` serve **byte-identical** content (a legacy
`…/ui/app.js` suffix 404s). The route gates on auth and a **valid** path `orgId` (a bogus path org
404s), but a **direct GET does not enforce** that the path `orgId` equals the session's active org —
what the **page** requests is the **active org's** asset, which is why the explicit selection step
below is what steers the browser to the target org.

**Selecting the target as the session's active org (the step the recipe used to omit).** The login
default active org is **not necessarily** the target. Select it explicitly with
`POST /v1/auth/active-org`, body `{"orgId": "<target org id>"}`, CSRF-protected
(`x-csrf-token` = the `nakama_csrf` cookie). The response echoes the new active org (`activeOrgId`):
**assert HTTP 200 and that the returned id is exactly the target** and **never** select `orgs[0]`.
Only then load the plugin page — the page fetches the **active** org's asset, so this selection is
what makes the browser fetch the target org's bytes — and take the asset URL the browser actually
fetched, asserting its `orgId` is the target before hashing. This changes **session selection state
only** (read-only against the fixture), **not** a domain mutation; restore the previous selection
afterward if the handoff contract requires it. For pure `x-org-id` read calls (the three read actions
above) **no active-org switch is needed** — the header selects the org per request.

The exact-org recipe: log in, select the target as the active org (above), load the plugin page, take the actual
`/v1/plugins/ui/<targetOrgId>/…` asset URL the browser fetched — the **sha256 digest is the
authoritative identity**, not a literal guessed `app.js` path — read it with credentials, hash it,
and assert the URL's `orgId` is the target.

**Tool input schemas are not read from the live surface.** `GET /v1/tools` lists the plugin tools by
name but carries **no `inputSchema`**; declared inputs (the F14 `problemId` question in particular)
are settled from the manifest `nakama.plugin.json` and the action definitions in `src/actions.ts`,
never inferred from a tool-discovery listing.

The readback field paths (`get_overview` nested records; topic-wide `get_topic`
`axes[].plan.plan.summary` / `axes[].plan.steps[].position`; scoped `get_topic` the axis under
**`axis` (singular)** with `axis.plan.plan.summary` / `axis.plan.steps[].position`; the
`get_progress` page-only projection) are tabulated in the authoring skill's **Readback shapes**
section.
