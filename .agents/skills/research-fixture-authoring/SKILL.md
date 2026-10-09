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

> **Status: read-only preflight validated; WP5 executable checks validated (isolated); the narrow
> retained write path (two `reconcile_topic` calls) is now execution-validated; full baseline authoring is
> still not execution-validated.** The read-only WP0 preflight passed at commit `a2e4931`; the **WP5
> executable checks** are **accepted** and validated against an **isolated throwaway store** at commit
> `77c8f5b` (see *Executable checks (WP5)*). The **SCOPE-RETAINED amendment** was executed live on
> 2026-10-08 (two `reconcile_topic` calls — axis 5/6 `primary` links + both consultation problem→repo sets,
> and the axis-4 `currentState`) and **post-write verification passed** (counts/events unchanged, protected
> stores unchanged); that validates **only this narrow path**, not the wider design. The **baseline seed
> authoring path is still not execution-validated** — no full seed has run, so the procedure is **not
> validated end-to-end**. Treat any authoring output beyond the executed retained calls as a proposal to be
> validated. The governing plan is
> [`docs/plans/research-fixture-methodology.md`](../../../docs/plans/research-fixture-methodology.md);
> the WP-G decision/review packet is
> [`docs/plans/wp-g-mutation-gate-decision-packet.md`](../../../docs/plans/wp-g-mutation-gate-decision-packet.md).

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
| **Retained-fixture amendment** | an accepted fixture | the fixture exists; the amendment is **explicitly approved and idempotent** — it may make approved before/after corrections, but never rewrites a published historical acceptance record |

Do not carry empty-start assumptions into an amendment, or an existing-record assumption into a seed.

## Classify every field before writing

Assign each proposed field exactly one disposition:

- **required** — must be present and source-backed; absence is a defect.
- **optional** — may legitimately be absent; leave blank and say so.
- **unavailable** — the model/toolset cannot represent it; record the limitation, never fabricate.

There are exactly **three** field dispositions. **"Supported" is not a fourth one** — it is a
*capability status* reported about a **tool path**, alongside the field's disposition, never in place of
it. A field can be **required** in disposition while riding a **supported** capability: F14a is the
worked case (an existing problem's evidence link is required, and `problemId` supports attaching it).

For each required field, name the **source**. For each unavailable one, name the boundary.

## Evidence rules

1. **No invented evidence.** `confirmed` is refused unless backed in the **same call** by an activity,
   annotation, branch or PR. Keep `inferred` as `inferred`.
2. **Atomic initial evidence.** Put a topic's initial supporting activities **inside the same
   `reconcile_topic` transaction** as the claims they back. `record_activity` is for later arrivals.
3. **Immutable source refs and dates.** Record the public source and the source's **own** date. Never
   substitute the ingestion/recording date for a document's publication date; keep day-only dates day-only;
   quote a pinned commit by its pin. When a document carries **no explicit date**, date it by the **last
   file-touch commit at or before the pin** and record that basis and its precision; a PR or commit event
   carries its **own** event date.
4. **Dedup and versions.** `get_overview` for the baseline, `search_dashboard` per name, and
   `expectedVersion` on **existing versioned mutations** (a fresh create has no version to check); on
   `conflict`, re-read and decide — never overwrite blindly. `truncated` is not `absent`.

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
   from memory). **After** the write, confirm the un-targeted store(s) are unchanged by their **own
   readback measurement** — not by DB file byte identity: a write to the target store can rewrite shared
   SQLite pages without changing any un-targeted content, so byte identity would fire false alarms. This
   check is **post-write**, not a pre-write gate.
5. **Label the run** — baseline seed or amendment — and stage it for the mutation-gate review. A fixture
   write needs **owner authorization**; a green local run is not that authorization.

## Read-only access (no agent turn)

WP0/WP1 verify **read-only with no LLM messages**. The read tools are also reachable by direct
HTTP read — documented in [`docs/PLATFORM-CONTEXT.md`](../../../docs/PLATFORM-CONTEXT.md):

- `POST /v1/plugins/<plugin>/actions/{get_overview,get_topic,search_dashboard}` with body `{input}`.
- Select the organization **explicitly** with `x-org-id: <org id>`; never let a helper pick
  `orgs[0]`. The request is a state-changing verb, so it carries CSRF: `x-csrf-token` = the
  `nakama_csrf` cookie minted at login.
- The route requires **member** role or above (viewers are refused); the plugin layer decides what
  a member may do.
- **No inference, no domain write:** call only the three read actions. `reconcile_topic` and
  `record_activity` are never issued by a read-only verification.

## Readback shapes

The response shapes are not obvious; the readback below is the contract, verified from the action
and store code (`src/actions.ts`, `src/store.ts`).

**Unwrap the action envelope first.** The direct-HTTP action route returns
`{ invocationId, result }` (the host's `InvokePluginActionResponse`); the domain payload
(`{ok, counts, axes, …}`) is under **`result`**. Read every field path below from `result` (e.g.
`result.counts.topics`, `result.axis`), **check the HTTP status and `result.ok`**, and surface a
failure — **never** fall back silently to an empty read when the shape is unexpected or `ok` is false.

| Read | Field paths | Notes |
|---|---|---|
| `get_overview` counts | `counts.{topics,axes,repositories,people}`, `counts.topicsByStatus` | nested records: `topics[].topic`, `people[].person`, `repositories[].repository` — not flat |
| `get_overview` per topic | `topics[].{topic,axes,people,repositories,axisCounts,activityCount,lastActivityAt}` | pages the whole front page in one call |
| `get_topic` topic-wide | `topic`, `axes[]`, `axisCounts`, `activity`, `notes`, `counts` | per axis: `plan`, `problems[]`, `evidence[]`, `history[]`, `notes[]`, `repositories[]` |
| `get_topic` scoped (`axisId`) | `{ ok, axis, axisId, coverage, generatedAt, topic }` — the axis object under **`axis` (singular)**; there is **no `axes` array** | one workstream; `activityLimit`/`activitySinceDays` are ignored under `axisId` |
| **plan**, topic-wide | `axes[].plan` = `{ plan: {…, summary}, steps: [{position, state, title, …}] }` or `null` | summary `axes[].plan.plan.summary`; order `axes[].plan.steps[].position`; `position: null` means unordered (F12) |
| **plan**, scoped (`axisId`) | `axis.plan` = the same shape | summary `axis.plan.plan.summary`; order `axis.plan.steps[].position` |
| `search_dashboard` | `{ok, query, axes[], topics[], activities[], annotations[], truncated, limit}` | a match-field list per hit |

**Distinguish the page-only projection.** The Progress view reads `get_progress`, whose axis rows
carry a **flattened** plan — `axes.axes[].plan` = `{id, summary, steps, stepsDone}`. That is the
page's own projection, **not** the `get_topic` readback shape; a verifier reads `get_topic`.

**Tool schemas are not on the live surface.** `GET /v1/tools` lists the plugin's tools by *name* but
carries **no `inputSchema`**, so it cannot settle any declared-input question (e.g. the F14
`problemId` cases). Read the declaration at its source instead — the manifest `nakama.plugin.json`
and the action definitions in `src/actions.ts` — and do **not** treat `/v1/tools` as the schema
source.

## Served-build identity — exact org, by the actual asset

`harness/served-build-guard.mjs` logs in, lets the page fetch the plugin UI asset, and hashes what
the browser actually received. Two cautions:

- It is **not org-aware**: it navigates to `<dashboard>/plugins/research-dashboard` and takes the
  first `/v1/plugins/ui/` resource the **active** org loads. It never asserts the asset's `orgId`
  equals the target org, so **its default cannot be trusted** for an exact-org identity.
- The route is `GET /v1/plugins/ui/<orgId>/research-dashboard/<asset>`. The page actually fetches the
  plugin **root** asset — `…/research-dashboard/?import&revision=<n>&version=<v>` — and the root, the
  bare `…/research-dashboard/`, and `…/research-dashboard/app.js` all serve **byte-identical**
  content (a legacy `…/ui/app.js` suffix 404s). The route requires member role or above and a
  **valid** path `orgId` (a bogus path org 404s), but a **direct GET does not enforce** that the path
  `orgId` equals the session's active org — the **page** requests the **active org's** asset.
- Preconditions: `NAKAMA_DASHBOARD` set to the **dashboard origin** (not the API port), credentials,
  and a cached Chromium.

**Exact-org recipe — including the active-org selection the earlier wording omitted.** The login
default active org is **not necessarily** the target, so the browser's asset request must be steered
to the target by selecting it as the session's active org. Select the target explicitly with
`POST /v1/auth/active-org`, body
`{"orgId": "<target org id>"}`, CSRF-protected (`x-csrf-token` = the `nakama_csrf` cookie); the
response echoes the new active org (`activeOrgId`). **Assert HTTP 200 and that the returned id is
exactly the target**, and **never** select `orgs[0]`. This changes **session-selection state only**
(read-only against the fixture), **not** a domain mutation; restore the previous selection afterward
if the handoff contract requires it. For pure `x-org-id` read calls (the three read actions) **no
active-org switch is needed** — the header selects the org per request.

Then log in, select the target as the active org (above), load the plugin page, take the actual
`/v1/plugins/ui/<targetOrgId>/…` asset URL the browser fetched (page context carries the real URL),
read it with credentials, hash it, and **assert the URL's `orgId` is the target**. Do **not**
substitute a literal guessed `app.js` path — the
browser's actual fetch is the plugin **root**, and the **sha256 is the authoritative identity**; the
`app.js` path only happens to resolve to the same bytes. Quote that sha256 as the served identity.

## Operational capability handoff (contract)

WP0/WP1 need read-only capability the committed docs deliberately do **not** carry. A local
(git-ignored) handoff supplies it; the docs carry this **contract**, never the values. The handoff
must state:

1. **Instance URLs** — the API base and the dashboard origin (loopback).
2. **Explicit target org** — its **id and name**; never `orgs[0]`.
3. **Read-only credential source** — the env-file **path** and the **key names** used
   (`NAKAMA_EMAIL` / `NAKAMA_PASSWORD`, the CSRF cookie name); values by reference only.
4. **Fixture mode** — whether the target is empty (baseline seed) or **already seeded** to the
   expected shape.
5. **Exact scoped read transport** — the direct-HTTP route above, with explicit org + CSRF, **the
   `{ invocationId, result }` envelope it returns** (unwrapped before field paths), and the
   `POST /v1/auth/active-org` step for the browser exact-org recipe (session selection only, never
   `orgs[0]`).
6. **Source pins** — the frozen public commit pins.
7. **Browser support** — a cached Chromium for the served-build guard; no restarts.

Private paths, org ids and credentials belong to the local handoff only.

## Validation (WP0, before WP1)

WP0 is a fresh zero-context validation before authoritative WP1 research, not merely an access check. The
session is given this skill, the plan, and **no prior conversational or project memory**, but with the
**capabilities the work needs**: an adequate checkout/docs copy, public GitHub access and read-only
dashboard access. It exercises **representative WP1 read-only steps**, reports where the guide was
ambiguous, wrong or missing a step, the guide is corrected from that **report**, and the validation is
re-run on the corrected guide before any reliance. Until this pass is run and recorded, this skill is
*initial / unvalidated*, and any output claiming to follow it must carry that caveat. A passing WP0
report is **not** authorization for the authoritative WP1 run — the owner must authorize WP1 explicitly
after WP0 passes. Neither WP0 nor WP1 is executed by this skill. The initial run is retained as
`docs/reviews/wp0-research-fixture-validation-initial.md`; it was **not a gate pass**, the guide was
corrected from it (see *Read-only access*, *Readback shapes*, *Served-build identity* and
*Operational capability handoff* above). The re-run on that corrected guide is retained as
`docs/reviews/wp0-research-fixture-validation-rerun.md`; it is **also INCOMPLETE — not a gate pass**:
it exposed one **material** readback defect (the scoped `get_topic` axis is under `axis` singular, not
`axes[0]`) that this skill and the plan are now corrected for. The re-run on that corrected guide is
retained as `docs/reviews/wp0-research-fixture-validation-attempt-3.md`; it is **also INCOMPLETE — not a
gate pass**: every representative step succeeded, but two **required-route** transport gaps remained —
the action response is wrapped as `{ invocationId, result }` (readback paths must be rooted at
`result`), and the exact-org recipe did not name the `POST /v1/auth/active-org` selection step. Both
were corrected here and in the plan, and the run repeated. The re-run on that twice-corrected guide is
retained as `docs/reviews/wp0-research-fixture-validation-attempt-4.md`; it is the **latest and
passing** WP0 report — every required read-only path measured clean, the served-asset identity
established by digest at the exact org, and **no material required-route defect**. Its one residual
finding is a **non-blocking rationale wording** correction (a direct GET does not enforce path-org ==
session active org; the page fetches the active org's asset), fixed above with **no recipe change**.
Only a gap on a **required** route blocks; an optional refinement does not.

**This skill's status: the read-only preflight is validated at `a2e4931`; the WP5 executable checks are
validated (isolated) at `77c8f5b`; the **narrow SCOPE-RETAINED amendment write path (two
`reconcile_topic` calls) is execution-validated** (2026-10-08; boundary 22/22 PASS, both transactions
`ok`, post-write 24/24 PASS, protected stores unchanged — see
`docs/reviews/2026-10-08-wp-g-retained-execution-report.md`); the **full baseline seed authoring path is
still not execution-validated** — no full seed has run, so the procedure is not validated end-to-end. A
passing WP0 report is **not** authorization for the authoritative WP1 run — the owner must authorize WP1
explicitly after WP0 passes. Neither WP0 nor WP1 is executed by this skill.

## Executable checks (WP5) — validated (isolated), not an end-to-end validation

The WP5 executable checks are the repo harness at `harness/wp5/`
(`manifest.mjs`, `fixture.mjs`, `checks.mjs`, `run.mjs`, `wp5-checks.test.mjs`). They encode the
**accepted WP3 baseline manifest** and the **accepted WP4 amendment invariants** as executable data and
seed them through the product's own write path (`reconcileTopic`) into an **isolated throwaway temp store**
(`mkdtemp` under `TMPDIR`, removed on dispose) — **never the retained fixture**, nothing inside the repo,
and **no network client** (asserted by the C21 safety guard). Run them:

| Command | What it does |
|---|---|
| `bun run harness:wp5` | the run — **default BLOCKED** (exit 2) while the parameter gates are unapproved; **not green** |
| `bun run harness:wp5 --test-only-decisions` | the **test-only** fully-PASS path (exit 0) — proves a resolved contract can be verified; refused without the `testOnly` label |
| `bun run harness:wp5:test` | the check suite — proves green is reachable and **can go red** |
| `bun run check` | typecheck + build + unit suite |
| `bun run harness:records` | the public-record redaction guard |

**What "validated (isolated)" means — and what it does not.** Measured at `77c8f5b`:
`bun run harness:wp5` → **28 PASS · 0 FAIL · 5 BLOCKED** (exit 2); `--test-only-decisions` → **33 PASS**
(exit 0); `harness:wp5:test` → **38 pass / 0 fail**; `bun run check` → **313 pass / 0 fail**;
`harness:records` green (**267** text files, 123 under `docs/`); `git diff --check` clean. The checks are
**accepted** and validated: each can go **red** on an injected defect and the default run is honestly
**not green**. This validates the **checker**, not a write. **The test store is not the live fixture** — a
green (or BLOCKED) run is **not** evidence about any live service, and the **full baseline authoring path
is still not execution-validated** — only the **narrow retained T1/T2 path** is (see the status above).
**Do not mark the procedure validated end-to-end.**

**Known host-typecheck disclosure.** `bun run typecheck:host` is **not run** here: it needs a Nakama
checkout to resolve the real host types (`bun harness/typecheck-host.mjs --checkout <path>` or
`NAKAMA_CHECKOUT`), and none is present. It is a documented limitation, **not** a pass — do not report it
as green.

**Gate semantics.** The five parameter gates (G01 six axis→repository roles; G02 F08 wording/confidence;
G03 optional blocker restoration; G04 evidence strategy; G05 proposed target) carry **no default**. An
unresolved gate yields **BLOCKED**, never a silent value. The **WP-G** decision/review packet
([`docs/plans/wp-g-mutation-gate-decision-packet.md`](../../../docs/plans/wp-g-mutation-gate-decision-packet.md))
lays out the human choices; **WP-G grants no write authorization**, and no run writes the retained fixture.

## Pitfalls

1. **Confirmed-at-seed.** Requesting `confirmed` claims in the initial reconciliation while scheduling
   their activities for later calls produces refusals and ad-hoc downgrades. Sequence evidence with the
   claim.
2. **Ingestion date as source date.** A document with no explicit date must **not** get the recording
   time. Date it by the **last file-touch commit at or before the pin** and record that basis and its
   precision; never invent a time-of-day.
3. **Null positions.** Relying on the read projection to convey "authored order" is not an ordering
   contract. Encode explicit `position` values.
4. **Problem evidence (F14).** Three distinct cases, not one:
   - **F14a — supported capability.** `reconcile_topic.activities[].problemId` **can** target an
     **existing** problem. The capability is *supported*; the field disposition is **required** where the
     source backs such a link. "Supported" is the capability status, not a fourth disposition.
   - **F14b — unavailable.** There is **no** title-like reference that targets a **newly generated**
     problem in the same `reconcile_topic` call. Record the limitation; do not improvise a workaround.
   - **F14c — schema defect.** `record_activity` omits `problemId` entirely, so that event tool cannot
     target **any** problem. Record the schema defect; do not improvise a workaround.
5. **Attribution (F15), optional accepted limitation.** A person with an empty activity feed and no
   mapped account is reported `attributable=false`, **never** "idle". The account mapping is
   *representable* in the model but is **missing fixture context**, so the disposition is **optional**
   (honest, not a defect) and accepted as a limitation — not fabricated and not read as inactivity.
6. **Designing around a suspect fixture.** Never fold UI design into a fixture whose data linking is under
   review; settle the data first (UI is a separate, deferred track).
7. **`expectedVersion` guards the axis only.** In `reconcileTopic` the optimistic guard is applied to an
   **axis** patch (`src/store.ts` `applyAxisPatch(…, { expectedVersion: axisInput.expectedVersion })`) and
   to a **topic** patch only when an `input.topic` patch is present. **Repositories** (`upsertRepository`)
   and **plans** (`updatePlan` called without `expectedVersion` in the reconcile branch) are **unguarded**,
   and `updatePlanStep` resolves a step by `SELECT … WHERE id = ?` with **no enclosing plan/axis/topic
   ownership check** — a step id from another plan would be silently updated. Before writing metadata or
   plan positions, **read the full current step membership (ids/titles/states/positions) first**, confirm
   every step id belongs to the intended plan, and carry the **stored** topic/repo `relationship` verbatim
   (omitting it defaults to `supporting` and demotes a `primary` link). The store cannot prove ownership
   for you.
8. **Hash conventions — a canonical projection hash is not a raw file hash.** A before/after evidence chain
   must use **one projection reader** and **one algorithm**. Record the **canonical projection hash** —
   `sha256(JSON.stringify(obj))` (compact, UTF-8) — which is exactly what the runner's in-memory `sha(o)`
   computes. A snapshot saved with `JSON.stringify(obj, null, 2)` is **pretty-printed**, so its **raw
   file-bytes sha256** is a *different* value; a chain that mixes a raw file hash, a second runner's reader
   digest, and the canonical projection hash is not one chain. This is how a recorded
   `b9218047 → 535b5f41 → 5b965d6a` progression paired a Phase-B **reader** digest (`535b5f41`) and a **raw
   file hash** (`5b965d6a`) with the Phase-A **canonical** chain; re-deriving offline gave the corrected
   `b9218047 → 5ab8e3e6 → 4fcf2b7a`. Label every superseded value with its schema/algorithm instead of
   dropping it, and re-derive offline from the **retained files** (never a fresh/live measure, never an
   inferred baseline).
