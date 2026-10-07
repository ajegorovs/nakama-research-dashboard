# WP1 — Source-by-source verification of the public-research fixture findings

> **Status: WP1 executed, read-only, owner-authorized.** This record verifies each finding in
> [`public-research-fixture-findings.md`](public-research-fixture-findings.md) §A against the **frozen
> public source pins** and the **current explicitly-targeted fixture readback**. It **sources** every
> disposition; it does **not** correct the fixture, design an amendment (WP4), seed a baseline (WP3),
> design UI, repair or deploy the product, or authorize WP2+. No prior WP0 conclusion is used as an
> answer: each finding is independently re-derived from source, contract and readback.
>
> **Scope: read-only.** No fixture/domain write, no inference, no `reconcile_topic`/`record_activity`,
> no service start/stop/restart, no vendor/reinstall/deploy, no product/UI edit, no merge. The only
> non-read call made was the session-selection `POST /v1/auth/active-org` (selection-state only, no
> domain mutation), used to steer the served-asset measurement. Each read used the three read actions
> over direct HTTP, a git/`git show` read of a pin, or a credentialed `GET` of the UI asset. No LLM
> message was sent for any verification.
>
> **Sanitization.** Loopback endpoints (`127.0.0.1:…`) are kept verbatim (they identify nobody). The
> target organization's id and name, the auth identities behind the reads, and host-specific absolute
> paths are **withheld** (`<targetOrg>`, key-name-only credentials, repo-relative/scratch labels).
> Public GitHub owner/repo slugs, public commit/PR refs and the frozen pins are public and kept.

## Result summary

| Metric | Count |
|---|---|
| Findings verified (source and/or readback supports the claim) | **21** |
| Findings refuted (source contradicts the claim) | **0** |
| Findings unresolved (source cannot settle) | **0** |
| Rows carried (F01–F17, incl. splits F07b, F09b, F14a/F14b/F14c) | **21** |

All 21 rows are **verified**. Several are verified with a **narrowed or split** reading (F06, F09,
F11, F13, F14b) and are stated as such below; a reviewer's causal label is confirmed only where the
code/contract supports it. **No row is a product repair**: the dispositions remain as the ledger
states, now source-backed.

## 1. Inputs and frozen pins

- Findings ledger: `docs/reviews/public-research-fixture-findings.md` (§A rows F01–F17).
- Pinned public sources (read at the exact SHA, `git show <sha>:<path>`):

| Source | Repo | Pin | Pin date |
|---|---|---|---|
| UDV (primary) | `ajegorovs/udv-echo-process` | `841964d41f8dc73e55d78303e79ed4098c00d700` | 2026-09-28 |
| Grablink (supporting) | `ajegorovs/Grablink-Full-sequence-acquisition` | `e6f83b2f5a45a961044b107f2628b046d41c3ab2` | 2026-09-24 |
| Dashboard (this product) | `ajegorovs/nakama-research-dashboard` | `95ec34e5d24240c7ac92c384cff5d5658ebb8761` | 2026-10-07 |

- Product contract read at the pin: `src/actions.ts`, `src/store.ts`, `nakama.plugin.json`,
  `migrations/001–005`. **No `src/`, `nakama.plugin.json` or `ui/` path differs between the frozen pin
  and HEAD** (`git diff 95ec34e…HEAD` touches only `docs/` and `.agents/skills/`), so every line
  reference below is valid at the pin and at HEAD; the committed `ui/app.js` digest equals the served
  digest (§6).
- Current fixture readback: the three read actions (`get_overview`, `get_topic` topic-wide and scoped,
  `search_dashboard`) against `<targetOrg>`, unwrapped from `{invocationId, result}`; `result.ok` true
  in every call. Baseline confirmed: `counts {topics:2, axes:6, repositories:3, people:1}`,
  `topicsByStatus {active:2}`, one person `attributable:false`.
- **Source dates use file history at/before the pin, not the pin's blanket date.** The one document
  with no explicit date (`docs/AGENDA.md`) is dated by its last file-touch commit at/before the pin
  (`44ba1a4`, 2026-09-24T11:33:25+03:00) — see F05.

## 2. Current fixture records (measured)

Two topics: **Research infrastructure / team management** (`99495a7c…`, 2 axes) and **Experimental
research** (`09743acc…`, 4 axes). Six axes:

| Axis | Topic | repos | evidence | problems | plan | currentState |
|---|---|---|---|---|---|---|
| Research dashboard and focused retrieval (`e5850ea7…`) | infra | **[]** | 3 commits | 0 | none | present |
| Agent consultation and automation evidence (`02e0b505…`) | infra | **[]** | **0** | 2 (**no repos**) | none | present |
| High-rate optical acquisition (`77835376…`) | experimental | Grablink | AGENDA + PR#1 | 0 | none | present |
| UDV sparse-analysis validation (`937c7417…`) | experimental | UDV | PR#67 | 0 | none | present |
| UDV acquisition automation (`39b9cd3a…`) | experimental | UDV | PR#69, PR#44 | 0 | none | present |
| Grablink diagnostics and sustained-rate validation (`601021c8…`) | experimental | Grablink | **0** | 1 (repo-linked) | 4 steps, **all `position:null`** | **absent (`""`)** |

Repositories (`get_overview`): Grablink — 2 axis links, 2 events; **nakama-research-dashboard — 0 axis
links, 0 events, `lastActivityAt:null`**; UDV — 2 axis links, 3 events. Every repository has
`url:''`, `description:''`, `defaultBranch:''`. Every recorded event has `sourceUrl:''`,
`actorType:'agent'`, `actorId:'user_admin'`, `repositoryId:null`. Person: `nakamaUserId:null`,
`attributable:false`, 4 axes, `recentActivity:[]`.

## 3. Per-finding verification

Each row: **verdict** — observation and/or mechanism, with the exact evidence (source file:line at the
pin, or the readback field).

| ID | Verdict | Evidence |
|---|---|---|
| **F01** | **verified** (fixture data gap, not a UI filter) | Overview: dashboard repository `axes:[]`, `axisCounts` all 0, `activityCount:0`, `lastActivityAt:null`; yet infra axes `e5850ea7`/`02e0b505` exist and `e5850ea7` carries three commit events (`95ec34e`, `da7996b`, `5a62749`). Those axes have `repositories:[]` and every event has `repositoryId:null`. The repo↔axis link (`axis_repositories`) and activity↔repo link are absent at the data layer: `store.ts:3405,3413` derive repository activity from those links, so the repository view under-reports real work because the links are missing — the axis does **not** name the repo, and the commit events are **not** linked to it. |
| **F02** | **verified** | Person `axes` = exactly the 4 experimental axes (`601021c8`, `77835376`, `937c7417`, `39b9cd3a`); the 2 infra axes are absent, and those axes' `people` is empty. The person **is** linked to the infra *topic* (`topic_people`) but not to its axes (`axis_people`) — a stored link-set, not a display filter. |
| **F03** | **verified** (provenance: agenda linked elsewhere) | Diagnostics axis `601021c8`: `evidence:0`, `history:0`, while a blocker, one problem (`0d586e71`) and a 4-step plan exist. The agenda item (`docs/AGENDA.md`, `sourceType:repo_document`) is recorded as evidence on the **sibling** axis `77835376`, not here. The content is not omitted; its evidence is attached to another axis. |
| **F04** | **verified** | Consultation axis `02e0b505`: `evidence:0`; its two problems (`49ee4cf1`, `ef92b518`) both have `repositories:[]`. The source that would back them exists at the pin (dashboard commit `5a62749` / the `docs/reviews/2026-10-07-agent-consultation-…` records) and is recorded on sibling axis `e5850ea7`, not on this axis or its problems. |
| **F05** | **verified** | The AGENDA event (`180d7453`, axis `77835376`) has `occurredAt:2026-10-07T14:32:13.984Z`, **identical to `recordedAt`** (ingestion), with a full time-of-day. `docs/AGENDA.md` carries no explicit date; its last file-touch commit at/before the pin `e6f83b2` is `44ba1a4` @ **2026-09-24T11:33:25+03:00** (`blob 80992992…`). The historical source date is 2026-09-24 (day-only); the fixture substituted the ingestion day. |
| **F06** | **verified** (mechanism; narrowed) | The projection carries both an honest `lastActivityAt = newestOf(eventTimes)` — **null** with no events (`store.ts:5257,5444,5566`) — and a `recencyAt` that **falls back to the record's own touch** when there are no events: `recencyAt = newestOf([...times, createdAt])` (`store.ts:5252`, overview card), `newestOf([...times, scan.updatedAt])` (`store.ts:5438`, axis), `newestOf([...times, problem.createdAt])` (`store.ts:5553`, problem). The UI labels that fallback **as activity**: `ui.tsx:4232` and `:4248` `` `last activity ${describeAge(problem.recencyAt)}` `` and `ui.tsx:4519` `<RecencyLabel at={activeAxis.recencyAt} prefix="last activity " />`. So "active today" is **record touch**, not research. The AGENDA ingestion date (F05) also contributes recency for the Experimental topic/Grablink. Distinct from `lastActivityAt`, which is honest. |
| **F07** | **verified** | All three repositories return `url:''`, `defaultBranch:''`, `description:''`. The model supports the fields (`store.ts:112–120`; `migrations/002…:41–48` `url`, `description`, `default_branch`). The public source text **is** available at the pins (Grablink `README.md`, UDV `README.md` `blob 7b1f484b…`, dashboard `README.md`), so the absence is a defect against an available source, not an inherent limit. |
| **F07b** | **verified** (absence; intentional) | Both topics return `description:''` and `summary:''`. Consistent with the ledger's "intentional / human claim" disposition. |
| **F08** | **verified** (absence); candidate wording deferred | Diagnostics axis `601021c8` `currentState:''` (empty) and `currentStateConfidence:null`; the other five axes carry a `currentState`. The model supports the field. Whether the source supports a *conservative factual* candidate state is a **proposal** (the AGENDA describes partial live capture), left to WP4 — not a verification of correctness. |
| **F09** | **verified** (split) | Repository identity is skeletal: `url`/`defaultBranch`/`description` are representable (`store.ts:112–120`) but empty. **However** the finding's "source docs" component has **no Repository field** at all — it is not representable as repository state (a PR/commit `sourceUrl` lives on the *activity*, not the repo). So: url/branch/description = skeletal-but-representable (required, correctable); "source docs" = not a Repository field. |
| **F09b** | **verified (unavailable)** | No `pin` field exists on the `Repository` type (`store.ts:112–120`), the `repositories` DDL (`migrations/002…:41`), the manifest `repositories[]` schema, or `types/`. The external-evidence enrollment model (`migrations/005…`) holds `repository_node_id`/`default_branch` but **no commit pin**. First-class repository pin is genuinely unavailable; must be carried in the seed/evidence manifest. |
| **F10** | **verified** | Every recorded event (and each problem) returns `sourceUrl:''`. The model supports it (`migrations/002…:164` `activities.source_url`; `migrations/004…:362`; manifest `activities[].sourceUrl`; `record_activity.sourceUrl`). The records are public (repos and PRs resolve), so a public URL is available and required. |
| **F11** | **verified** (boundary) | Every PR/commit event is stored `actorType:'agent'`, `actorId:'user_admin'`; problems are `authorType:'agent'`. `Activity` has **no upstream-author field** (`store.ts:152–170`). The upstream authors are human (Grablink PR#1 commit author `aleksandrs jegorovs <aleksandrs.jegorovs@lu.lv>`; UDV PR#44/67/69 by `ajegorovs`). The model distinguishes recorder from author **only on the external collector ingest path** (`ingest_github_activity` records `actorType:'system'` and a separate `ExternalAuthor`; `manage_external_enrollment`), which is **not** one of the five agent tools. The manual write path therefore attributes to the recorder; no account mapping is manufactured. |
| **F12** | **verified** | Axis `601021c8`'s plan has 4 steps, every `position:null`. The model supports explicit ordering (`migrations/004…:142` `plan_steps.position INTEGER` nullable; manifest `plans[].steps[].position`), and `migrations/004…:118–119` states NULL means "no ordering, and no ordering is synthesized". The seed did not encode the authored order. |
| **F13** | **verified (unavailable); narrowed** | `Plan = {id, axisId, summary, authorType, authorId, version, createdAt, updatedAt}` (`store.ts:351–358`) and the `plans` DDL (`migrations/004…:121–133`) carry **authorship** (`authorType` human|agent, `authorId`) but **no content provenance/source**. The exposed plan object (`get_topic` `axis.plan.plan`) has the same fields; the write schema (`plans[]`) accepts only `planId/axisId/axisTitle/summary/steps`. The limitation is narrower than "a plan is unattributable": a plan's **authorship is first-class**; the **source document of its content** is not. |
| **F14a** | **verified** (supported capability, required field) | `reconcile_topic.activities[].problemId` is declared (manifest `activities` item, `additionalProperties:false`) and forwarded (`store.ts:5837`) and resolved from an **existing** problem row (`store.ts:6599–6609`). The existing problem `0d586e71` has **zero** linked events (axis `evidence:0`, `history:0`). The capability is supported; the field is required where the source backs the link. Not a fourth disposition. |
| **F14b** | **verified (unavailable)** | There is **no title/name handle** for a problem anywhere in the schema: problems are created by `statement` (manifest `problems[]` `required:["statement"]`); the only problem reference on an activity is the **id** `problemId`. Inside one `reconcile_topic` transaction the write order is **activities (`store.ts:5806`) before problems (`store.ts:5929`)**, `activities.problem_id` is a real FK (`migrations/004…:351` `REFERENCES problems (id)`), and FK enforcement is on (`store.ts:2152` `PRAGMA foreign_keys = ON`) — the store's own comment (`store.ts:6590–6596`) says the reference happens "in a second pass" because "the problems [do not] exist in a single call". So no handle exists, and the id handle requires the problem to pre-exist; a same-call reference is not possible (and would fail/roll the transaction back). |
| **F14c** | **verified (schema defect)** | `record_activity` **advertises** the field — manifest description: *"Naming a problemId records the event as evidence for that problem…"* — but the declared `inputSchema` **omits** `problemId` with `additionalProperties:false`, and dispatch (`actions.ts:361–387`) never reads `input.problemId`. The store *does* support it (`addActivity`), so the defect is precisely at the **action boundary**: `record_activity` cannot target **any** problem. |
| **F15** | **verified** (optional/accepted limitation) | Person `nakamaUserId:null` → `attributable = Boolean(person.nakamaUserId)` = **false** (`store.ts:3330`); `lastActivityAt` is gated on `nakamaUserId` (`store.ts:3333–3335`) → **null**; `recentActivity:[]`. The mapping is representable (`Person.nakamaUserId`), the fixture context is missing. The UI renders the missing-link fact, never "idle". |
| **F16** | **verified** (absence; intentional) | Both topics `summary:''`. Consistent with "human editorial claim, blank by design". |
| **F17** | **verified** (shorthand overstated) | The shorthand is the packet line "…`sustained full-buffer complete`; disk cycle open." (`docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md:134`). The **source** (`Grablink docs/AGENDA.md` @ pin) reports a 351 FPS preview and a **manual `Stop & Save` writing partial sequences (652, 1028 frames)**, and lists "Run a sustained 300–350 FPS capture and measure dropped frames" as **future work** ("the largest remaining item"). The source does **not** confirm a sustained/full-buffer completion, so the shorthand overstates; the conservative blocker (`…five-tool-exercise.md:140`) is the source-supported claim and stands. |

## 4. Independent cross-check — incorporated, with disagreements/boundaries

An independent read-only **contract-only** cross-check was supplied and read before consolidation
(`.hermes/scratch/wp1-contract-crosscheck.md`, local, not committed). Its source claims were
**re-verified here against the pin myself**, not accepted on assertion:

- **F06** — confirmed exactly: `store.ts:5252/5438/5553` (fallback) vs `:5257/5444/5566` (honest
  `lastActivityAt`), and `ui.tsx:4232/4248/4519` (the label). The cross-check's key boundary is kept:
  **`lastActivityAt` is honest (null with no events); the *recency fallback* is what is mislabeled as
  activity.** This report does not conflate the two.
- **F09** — confirmed: the cross-check's "source docs is not a Repository field" is accepted and is
  reflected as a **split** verdict (url/branch/description representable; source docs not).
- **F11** — confirmed: upstream authors exist only on the **collector ingest path**; the **manual
  agent path has no upstream-author field**. The attribute-to-recorder conflation is real for the
  fixture's write path; the boundary is that the concept exists elsewhere but is not on the tool
  surface used.
- **F13** — confirmed and narrowed: plan **authorship** is first-class; **content provenance** is
  unavailable.
- **F14b** — confirmed: the cross-check's FK/rollback reasoning is **verified** (`store.ts:2152`,
  `migrations/004…:351`, write order `5806`→`5929`). Phrased conservatively: there is no title-like
  handle at all, and the sole id handle requires the problem to pre-exist, so a same-call reference is
  not possible — the store's own comment says the reference is completed in a later pass.
- **F14a/F14c/F15** — confirmed.
- **Cross-check limits carried forward:** it was **source-only** (no live instance) and did **not**
  re-measure the served asset. This WP1 report **adds** the live fixture readback and a served-asset
  measurement (§6), so F01–F05, F07, F08, F10, F12, F16, F17 rest on the readback as well.

No cross-check claim was found to be wrong; one (F14b's "not even by id") is retained but stated with
its pre-existence/FK precondition rather than as an absolute.

## 5. Partial-evidence limits (honest)

- **Reviewer-held images were not inspected.** `progress_axes.jpg` and `problems.jpg` are reviewer
  material, not in this repo; findings resting partly on them (F04/F14a, F05/F06, and the deferred
  U-rows) are verified here from **records and contract**, not by re-inspecting those images. The rows
  that lean on a code mechanism (F06, F13) confirm the mechanism, not a screenshot.
- **UI observations U01–U09 are out of WP1 scope** (deferred) and are **not** verified here.
- **Viewer-refusal (role < member) was not tested** — no viewer credential was available; member
  access was used throughout.
- **Pins were read at their exact SHAs.** `docs/AGENDA.md` is dated by file history at/before the pin
  (F05); other records carry their own event dates.
- This report **records** dispositions; it performs **no** fixture correction, no link delta (WP2), no
  packet (WP3/WP4), and no product/UI repair.

## 6. Measurement digests

**Current fixture readback** (raw, local): `readback.json` sha256
`f823676ca28818abbec38d07b9951af34cab3bb84dc5bec895bad360f301c226`.

**Served-asset identity (re-measured, exact `<targetOrg>`).** After login, `POST /v1/auth/active-org`
`{orgId:<targetOrg>}` returned HTTP 200 and echoed `activeOrgId == <targetOrg>` (selection-state only).
`GET /v1/plugins/ui/<targetOrg>/research-dashboard/app.js` and the root both returned HTTP 200,
**154598 bytes**, sha256
`41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc`, **equal to the committed
`ui/app.js`** — so the served bytes match the pin's product exactly.

**Pinned source digests** (sha256 of the files read at the pin):

| File | sha256 |
|---|---|
| `src/actions.ts` | `9964d4a52e4b00c0b836f5d8beebc22d3298e045163cfb1e5cc9e8494c32b25b` |
| `src/store.ts` | `80015d89af5ed180b89dcbd1be84ca58672c5fb74d43fbef7146b40b8bb39b40` |
| `nakama.plugin.json` | `e3f2fdb5af5a5743f93fe11c6cd1d97981c9f3fe230906c94ffcfb70ad0be3e2` |
| `migrations/004-ux-v2-model.sql` | `46b830612d6b7f52cd661e30155779d6dd455dff2cbecb6386c4861cd301587e` |

## 7. Boundaries

- **Read-only.** No fixture/domain write, no inference, no `reconcile_topic`/`record_activity`, no
  service change, no deploy, no product/UI repair, no merge. The one `active-org` call is
  session-selection only.
- **This is WP1 verification, not authorization for WP2+.** It performs no link-delta reconciliation
  (WP2), no packet design (WP3/WP4), and no write gate (WP-G); those require their own authorization.
- The ledger is preserved; WP1 dispositions and proof references are **appended** to
  `public-research-fixture-findings.md`, distinguishing the reviewer's original status from the WP1
  disposition.
