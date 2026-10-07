# WP0 — Fresh zero-context validation of the research-fixture methodology (initial)

> **Provenance.** This report was produced against the guide at head
> `e0b25714097cf6d5c5ff5e13599fefcc98b20f84` on branch `docs/research-fixture-methodology`:
> the methodology `docs/plans/research-fixture-methodology.md`, the authoring skill
> `.agents/skills/research-fixture-authoring/SKILL.md`, the findings index
> `docs/reviews/public-research-fixture-findings.md`, and `AGENTS.md`. It records what a
> **zero-context** session measured; the guide was then corrected from it (see §5). It is retained
> as evidence **including its failures** (methodology §9).
>
> **Scope: read-only.** No fixture/domain write, no inference, no deployment/restart, no source
> repair, no commit/push/merge. No LLM/model message was sent for any verification — every read
> was a direct HTTP read or a filesystem/git read.
>
> **Verdict: INCOMPLETE — not a gate pass.** The guide is runnable by a zero-context worker
> **only with an explicit operational handoff**; it is **not runnable from the supplied docs
> alone**, and this report's own first draft misattributed several guide defects to the new
> methodology (corrected in §4). WP0 must be **re-run on the corrected guide** before WP1 output
> is relied on. **Nothing here is promoted to authoritative WP1**: the per-finding reads below are
> representative samples, not the exhaustive verification WP1 owes.
>
> **Sanitization.** Loopback endpoints (`127.0.0.1:…`) are kept verbatim (they identify nobody).
> The target organization's id and name, the account/auth identity behind public-GitHub access,
> and host-specific paths are **withheld** — they live in the local (git-ignored) operational
> handoff. Credentials are referenced by **key name only**; no secret, token or password value
> appears.

## 1. What was validated

The four guide documents above were read **cold** (zero prior project/conversation context).
Representative **WP1 read-only** steps ("verify each finding against exact sources") were then
executed:

- source of truth = the public GitHub sources at the frozen pins, plus the plugin manifest
  committed at the pin;
- read-only dashboard state = the product's read tools, invoked by **direct HTTP read** (no agent
  turn).

WP1 proper is the *authoritative, exhaustive* per-finding verification and was **not** carried
out; this run only proves the steps are executable and asks whether the guide describes them
adequately.

## 2. Environment observed (read-only probes)

| Probe | Observed |
|---|---|
| Branch / HEAD | `docs/research-fixture-methodology` @ `e0b25714097cf6d5c5ff5e13599fefcc98b20f84` (clean) |
| API listener | `127.0.0.1:4399` open — `curl /health` → 200 |
| Dashboard listener | `127.0.0.1:3003` open — `GET /` → 200, `GET /plugins/research-dashboard` → 200 |
| Other store listeners | `4400` / `3005` closed (the fixture *web* unit is absent on this host — matches the handoff note that only the API is up) |
| Public GitHub auth | available (read-only); identity and scopes withheld |
| Organizations on the account (read-only) | three orgs; the **explicit target** org (`org_…`, name withheld) is the one named in the local handoff, never selected as `orgs[0]` |

Credentials were read from the mode-600 env file **in-process** (key names: `NAKAMA_*`,
`DATABASE_URL`, …); no value was printed.

## 3. Step-by-step results (representative)

| # | Step | Result | Exact action / evidence |
|---|---|---|---|
| S1 | Cold read of AGENTS.md, plan, skill, findings | **PASS** | Files present; internally consistent; the three-disposition rule and the F14 split are stated identically in plan §2 and the skill. |
| S2 | Discover the explicit target org (read-only) | **PASS** | An external read-only recon listed 3 orgs; the target org exposes `selectedVersion 0.2.0+dev.…`, a revision, and `enabled`. Never selected `orgs[0]`. |
| S3 | Read-only access to the read tools | **PASS** | Achieved via `POST /v1/plugins/research-dashboard/actions/{get_overview,get_topic,search_dashboard}` with an explicit org header + CSRF. The route is documented in `docs/PLATFORM-CONTEXT.md` (§2) — but that doc is **not** in WP0's stated input set. |
| S4 | Baseline read (`get_overview`) | **PASS** | Returns `counts {topics:2, axes:6, repositories:3, people:1}`, `people[].attributable=false`, `repositories[]`. Matches the packet's expected shape. |
| S5 | Topic-wide + axis-scoped read (`get_topic`) | **PASS** | `get_topic {topicId}` returns `topic`, `axes[]`, `axisCounts`, `counts`, `activity`, `notes`. Axis object carries `plan {plan, steps[]}`, `problems[]`, `evidence[]`, `notes[]`, `repositories[]`. The scoped read (`{axisId, topicId}`) is a supported route. |
| S6 | Search-before-create read (`search_dashboard`) | **PASS** | `{query:"dashboard"}` → `{ok:true, axes:[{matchedFields:[…]}], topics:[], activities:[], annotations:[], truncated}`. |
| S7 | Public source access at the frozen pins | **PASS** | The three pinned repositories resolve on the public remotes (default branches and public descriptions as the packet states). |
| S8 | Verify F12 (null plan positions) | **PASS (verified)** | Fixture readback: the diagnostics axis `plan.steps[]` has 4 steps, each `position: null`. Matches F12 ("verified"). |
| S9 | Verify F14a/b/c against exact source | **PASS (verified, byte-exact)** | Manifest at the pin: `reconcile_topic.activities[].problemId` is declared → **F14a supported**; no title-like new-problem reference exists → **F14b unavailable**; `record_activity.inputSchema.properties` omits `problemId` while its description still advertises "Naming a problemId records the event as evidence" → **F14c schema defect confirmed from exact source**. |
| S10 | Observation-level reproduction of F01/F02/F04/F07/F08/F15 | **PASS (reproduced)** | Reproduced at the observation level from fixture readback (repo with `axisCount 0`; a person with four axes and no infrastructure axes; problems with null `repositoryFullNames` and zero events; a repo with empty `description/url/defaultBranch`; an axis with empty `currentState`; `attributable:false`). **Not** resolved authoritatively — that is WP1. |
| S11 | Served build established **by measurement** | **PARTIAL** | The `served-build-guard.mjs` route is browser-driven and needs a real browser + `NAKAMA_DASHBOARD` + credentials; it is also **not org-aware** (it takes the active org's asset, not the target's). A direct read of the served asset for the explicit org is possible (route below) but a byte-level served-asset digest was **not** produced in this run. |
| S12 | Docs/checkout access to the review records | **PASS** | `docs/reviews/…` and the plan's embedded packet are readable from the clone; the historical record referenced by the plan exists. |

## 4. Attribution corrections to the first draft

The first draft of this report attributed several defects to the **new methodology** by citing
sections that exist in **neither** guide. Corrected here, so the genuine operational gaps are not
lost and the misattribution is not.

- **Nonexistent §12/§15.** The first draft cited "plan §12/§15". The methodology has **§1–§10**;
  the historical five-tool *exercise* plan
  (`docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md`) has **§1–§11**. Neither
  contains a §12 or a §15. The citations are void.
- **"The plan drives the agent through `find_tools`."** That is the **historical exercise plan's**
  Phase 3 ("the agent discovers the five tools and calls them on the next model call"). The **new
  methodology does not describe an agent turn at all** — its §9 supplies a zero-context validator
  with *read-only dashboard access*, and its §8 is "Deferred and out of scope". So the guide is
  **not** committed to an agent-turn path; the missing piece is a **documented non-agent read
  transport**, which is a real gap (§5 D1) but not the one the draft named.
- **"The target org is unresolved / pending."** That is the **historical exercise plan's** Phase 1
  gate (`PENDING`) and §10 open decision — it is about choosing where a **write** lands. The **new
  methodology** §6 gate 1 requires the target be *chosen explicitly and recorded* (it does not say
  pending), and §10 defers only **writes** until an explicit target and owner authorization exist.
  WP0 is **read-only** and needs an *explicit target supplied by handoff*, not the write gate.
  Following the new methodology literally does not strand a zero-context session at an unresolvable
  gate; what it lacks is a statement of **where the target comes from**.

The genuine, non-citation-dependent operational gaps are retained below.

## 5. Material guide defects (as corrected) and their fixes

**D1 — No documented read-only tool access path (material).** The new methodology names the read
tools but no **non-agent** route to them, and WP0/WP1 forbid LLM messages. The route exists
(`POST /v1/plugins/<plugin>/actions/<key>` with an explicit org + CSRF) and is documented in
`docs/PLATFORM-CONTEXT.md` — a doc outside WP0's stated input set.
*Fix applied:* the plan and skill now carry a **"Read-only tool access (no agent turn)"** subsection
naming the three read actions and pointing at `docs/PLATFORM-CONTEXT.md`.

**D2 — Credentials / instance handoff in no supplied artifact (material).** The actual env-file
path and the target org live outside every supplied doc. A zero-context worker must discover the
external fixture workspace to proceed.
*Fix applied:* the plan and skill now carry an **operational capability handoff contract** (§6), and
state that the ids/creds/paths stay out of the public docs by design (they belong to the local,
git-ignored handoff).

**D3 — Target org not derivable from the docs (material; handoff, not gate).** See §4: the
"pending" gate belongs to the historical plan. The real requirement is that WP0's *input contract*
name where the explicit target comes from.
*Fix applied:* the handoff contract requires the explicit org id **and** name, and states that WP0
is read-only and needs the target supplied by handoff, not the write gate.

**D4 — Readback response shapes undocumented (moderate).** Representative verification depends on
shapes the docs never state: `get_overview` nests records (`topics[].topic`, `people[].person`,
`repositories[].repository`); `get_topic` returns each axis's plan at `axes[].plan` (singular),
where `plan` is `{plan:{summary,…}, steps[]}` — i.e. `axes[].plan.plan.summary` and
`axes[].plan.steps[].position` — and axis problems under `problems[]`. A naive reader (and this
worker's first probe) assumed `plans[]`/`activities[]`.
*Fix applied:* the skill now carries a **Readback shapes** table, and distinguishes the Progress
page's own flattened projection (`get_progress` `axes.axes[].plan` = `{summary, steps, stepsDone}`)
from the `get_topic` readback shape.

**D5 — Served-build measurement not exercised (moderate).** The plan requires the served build be
established "by measurement (the served asset, by digest)". The guard is browser-driven and needs
credentials + a cached Chromium; it is **not org-aware**; and the direct asset route is not the
`…/ui/app.js` suffix the first probe guessed (that 404s).
*Fix applied:* the plan and skill now state the guard's exact preconditions and the **exact-org
served-identity recipe** — fetch the actual served asset for the explicit org and hash it, because
the guard's default cannot be trusted for a specific org.

**D6 — Packet vs live fixture not stated (minor).** The docs present the fixture packet as content
to *seed*; the target org is **already seeded** to the expected shape. A fresh verifier may wrongly
expect an empty target.
*Fix applied:* the handoff contract requires the handoff to state whether the target is empty
(baseline seed) or already seeded (verification).

## 6. Operational capability handoff (contract)

WP0/WP1 need read-only capability the committed docs deliberately do not carry. The local
(git-ignored) handoff must state: the instance URLs; the **explicit** target org id **and** name;
the read-only credential source as a **path** plus **key names** (values by reference only); the
fixture **mode** (empty vs already seeded); the exact scoped read transport; the frozen **source
pins**; and **browser support** for the served-build guard. Private paths/ids/credentials belong to
that local handoff only; the committed plan and skill carry the **contract**, not the values.

## 7. Was the guide sufficient?

**Docs alone: NO.** The plan and skill describe *what* to verify and the rules, but not *how* to
reach read-only dashboard state without an agent turn, nor where the credentials and target org
come from. A zero-context worker cannot complete S2–S11 from the docs alone.

**Docs + an explicit operational handoff: PARTIALLY.** With the URLs and org id, this worker reached
the API and the target org, but the **credential source** and the **non-agent read route** had to
be discovered by inspecting an external fixture workspace that no supplied doc references. The URLs
alone were not sufficient.

**Hidden context dependencies (now made explicit by the corrected guide):** the external fixture
workspace path and its mode-600 env file (credential source); the non-agent read route; the
explicit target org id and the fact that it is **pre-seeded**; and the `get_overview` / `get_topic`
response field paths.

## 8. Limitations of this validation

- **Representative only:** F12 and the F14a/b/c split were verified against exact sources; the
  F01/F02/F04/F07/F08/F15 rows were reproduced at the observation level, **not** resolved
  authoritatively (that is WP1).
- No byte-level served-asset digest (S11 partial).
- The "as-of" state shows the org pre-seeded; a baseline-seed WP0 (empty target) was not exercised.
- No agent-turn path was tested by design (no LLM messages permitted for read-only verification).

## 9. Boundaries

- Not an acceptance record and not a re-opening of the first exercise; the historical record and
  its qualified report stand.
- **No finding here is promoted to authoritative WP1.** The verified rows are samples; WP1 owes
  the exhaustive per-finding classification.
- The raw probe scripts and the readback JSON are **local scratch** (git-ignored), not part of the
  clone; the values they carry stay in the local handoff.
