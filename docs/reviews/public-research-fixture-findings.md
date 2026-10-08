# Public research fixture — findings and reference index

> **Disposition: sanitized finding set, carried forward. Not an acceptance record, and not a
> re-opening of the first exercise.** The accepted first exercise and its review are the historical
> record (merged PR #3: the plan, the qualified exercise report and the sanitized evidence summary).
> This document restates the *reviewer's* findings against that retained fixture in a public,
> clone-readable form, classifies each one, and states what would settle it. Product interpretation and
> repair are out of scope; the plan is
> [`docs/plans/research-fixture-methodology.md`](../plans/research-fixture-methodology.md).

## How to read a row

- **Class** — the informational disposition of the missing/observed content:
  **required** (must be present and source-backed; absence is a defect), **optional** (may legitimately be
  absent; absence is honest, not a defect), or **unavailable** (the product model or toolset cannot
  represent it; recorded as a stated limitation, never fabricated). These are the only three field
  dispositions; **"supported" is not a fourth** — where a row names a *supported* capability (F14a) it
  states the status of a **tool path**, reported alongside a required/optional/unavailable disposition,
  never replacing it.
- **Status** — what is actually established: *verified* (a measurement or retained record supports it),
  *reviewer hypothesis* (a reviewer causal claim, **not yet independently verified** — the fixture
  exercise itself did not confirm the mechanism), *intentional* (approved to stay as-is),
  *accepted limitation* (a known product/tool boundary), or *deferred* (UI-track, §UI).
- A reviewer's causal claim is **not** evidence of its cause. Where a row says *reviewer hypothesis*, the
  observation may be real while the explanation is unproven; the verification column names what settles it.

## A. Fixture and procedure findings

| ID | Class | Finding (reviewer) | Status | Why it matters (WHY) | How it is settled (HOW) |
|---|---|---|---|---|---|
| F01 | required | The product repository shows no work/axes/activity although axes 5/6 and three commits belong to it | reviewer hypothesis | If repository↔axis/event links are missing, the dashboard under-reports real work | Read the exact records: does the axis name the repo, and are the commit events linked to it? Distinguish a missing link from a UI omission |
| F02 | required | The person carries only four axes, no infrastructure axes | reviewer hypothesis | A person↔axis link set that omits axes misrepresents who did the work | Inspect the person's link set against the six axes; verify the link mechanism (not a display filter) |
| F03 | required | The diagnostics axis has no evidence though an agenda-backed blocker/problem/plan exists | reviewer hypothesis | Evidence-free claims read as unbacked; the agenda may be linked elsewhere | Trace the agenda item's provenance; confirm whether it was recorded against another axis, or genuinely omitted |
| F04 | required | The consultation axis lacks evidence; two problems lack repositories | reviewer hypothesis | Problems without a repository link are unattributable to a source | Inspect the problem records' `repositoryFullNames`; capture the source document/commit |
| F05 | required | An agenda event is dated to the ingestion day rather than its historical source date | reviewer hypothesis | Substituting ingestion for publication dates rewrites history | Use an explicit document date, else the last file-touch commit at/before the pin; retain date basis and precision, not the pin commit date by default |
| F06 | required | Historical research appears "active today" | reviewer hypothesis | Recency that reflects record touches, not research, is misleading | Separate domain activity from record touch; inspect the projection/recency mechanism before labelling it a defect |
| F07 | required (when the public source is available) | Repository factual descriptions (public URL, default branch, README/`about` text) are absent | reviewer hypothesis | Without descriptions a reader cannot tell what a repository is | Harvest the source's own README/`about` text; descriptions must be source text, not paraphrase |
| F07b | optional | Topic descriptions are editorial and may legitimately be absent until a human approves wording | intentional | An absent topic description is honest, not a defect; it is a human claim, not harvested text | Leave blank unless a human authors and approves it (cf. F16) |
| F08 | optional | The diagnostics axis's `currentState` is intentionally absent, though the source could support a conservative factual state | reviewer hypothesis | A blank state can be honest (nothing approved) or a gap (source supports more) | If the source supports a conservative factual state, propose exact candidate wording for approval; otherwise leave blank |
| F09 | required | Repository identity fields are skeletal (public URL, default branch, source docs) | reviewer hypothesis | Skeletal identity metadata weakens provenance | Verify the model supports the fields, then populate from the public source |
| F09b | unavailable | The repository model carries no **pin** field for the repo's source pin | reviewer hypothesis | Without a pin, exact provenance of a repository's content cannot be stated | Require the immutable pin in the seed/evidence manifest; confirm it is unavailable as first-class Repository state, never fabricate a dashboard field |
| F10 | required | Evidence lacks convenient public URLs | reviewer hypothesis | A claim a clone cannot follow is hard to trust | Capture a `sourceUrl` for PR/commit/document records, public only |
| F11 | optional | PR evidence is attributed to the agent, possibly conflating recorder with upstream author | reviewer hypothesis | Misattribution misrepresents authorship | Do not manufacture an account mapping; report the attribution boundary instead |
| F12 | required | Ordered plan steps carry null positions | verified | An authored order that is not encoded cannot be relied on | Encode explicit `position` values on seed; the ordering is then a stored claim, not a projection side-effect |
| F13 | unavailable | Plan provenance is not a first-class visible field | reviewer hypothesis | A plan with no visible source is hard to audit | Confirm the exposed contract; if the model truly lacks the field, record it as a stated model gap (unavailable), not a fabrication |
| F14a | required | Problems have zero linked events though the source supports some (an existing problem) | verified | A problem's evidence cannot be attached through the event tool for an existing problem **[WHY superseded 2026-10-08 — refuted by WP1: existing-problem linkage *is* supported via `reconcile_topic.activities[].problemId`; see §E]** | **Supported capability.** `reconcile_topic.activities[].problemId` targets an **existing** problem; the field is **required** where the source backs such a link. Not a fourth disposition — the capability is *supported*, the field disposition is *required* |
| F14b | unavailable | A newly generated problem cannot be targeted by title in the same call | verified | An initial topic cannot attach evidence to a problem it creates in one transaction | **Unavailable.** No title-like reference targets a newly generated problem in the same `reconcile_topic` call; record the limitation, never a workaround |
| F14c | unavailable | `record_activity` cannot target any problem | verified | A subsequent event cannot be attached to a problem at all | **Schema defect.** `record_activity` omits `problemId` entirely, so it targets no problem; record the schema defect, never a workaround |
| F15 | optional | A person's activity is empty without a mapped account | accepted limitation | Empty activity can read as idleness when it is unattributability | The account mapping is **representable** in the model but **missing fixture context**; an absent mapping is honest, not a defect. Report `attributable=false`, **never** "idle" |
| F16 | optional | Human-approved topic summaries are absent | intentional | A topic summary is a human editorial claim, not harvested text | Preserve as blank unless a human authors it |
| F17 | required | A shorthand overstated a sustained/full-buffer result | reviewer hypothesis | An overstated capability is a false claim | Verify against the source wording; preserve the conservative blocker until the source confirms more |

## B. UI observations and proposals

**Deferred.** These carry forward with the retained fixture but are **not** designed, scheduled or
dispatched in this phase: designing around a fixture whose linking is under review risks fixing the
wrong thing. They are listed so the observation is not lost.

| ID | Kind | Observation / proposal | Status |
|---|---|---|---|
| U01 | Claimed correctness bug | A compact axis label may read a state-confidence field where a current-state-confidence field is meant; aligned fixture values would mask it | reviewer hypothesis (source claim, not exposed by aligned values) |
| U02 | Semantic correctness | Zero-event problems/axes label a creation/update fallback as "last activity" | reviewer hypothesis (recency-fallback mechanism is a code claim) |
| U03 | Presentation | Topic current-state stays line-clamped even with the axis disclosure expanded | observed symptom (CSS cause separately verified) |
| U04 | Duplication | A single problem appears in both the current-problem and open-problems regions of one axis | observed |
| U05 | Information architecture | Whether the Overview's repository presence should be compact topic status plus quiet repo metadata instead of the current repository cards/regions | design proposal only |
| U06 | Graphic proposal | Discrete daily activity bars (7/14/30-day) as the activity readout | design proposal only (the current readout is textual age/count, not a chart) |
| U07 | Visual hierarchy | Pills equate state/confidence/repo/topic/person; repeated inferred/version/history/correct/empty prose adds noise | design proposal only |
| U08 | Density proposal | Nested cards / empty supporting sections compete with the useful plan | design proposal only |
| U09 | Reachability | Missing account/about/activity/axes machinery dominates the person's context | observed |

## C. Reference index

Reviewer-supplied visual references, recorded by **name only** (the capture pack itself is local reviewer
material and is not committed here). A bare filename exists at more than one reference viewport; a
citation must name the viewport it was judged at. The reviewer's **minimum working set** was: the
Overview full view, both topic full views, the dashboard repository top view, and the two reviewer-held
JPGs below.

| Reference (name) | Relates to |
|---|---|
| `overview__overview__full.png` | F07, U05, U06 |
| `topics__topic-1-experimental-research__full.png` | F03, F08, U03, U07 |
| `topics__topic-2-research-infrastructure__full.png` | F04, U03, U07 |
| `repositories__repo-2-nakama-research-dashboard__top.png` | F01 |
| `repositories__repo-1-grablink-full-sequence-acquisi__top.png` | F07, F09 |
| `repositories__repo-3-udv-echo-process__top.png` | F07, F09 |
| `people__person-1__full.png` | F02, F15, U09 |

### Per-reference visual anchors (reviewer-attested)

| Reference | Visible observation |
|---|---|
| `overview__overview__full.png` | Topic activity and Repository activity columns; textual counts/ages; Nakama repository appears inactive while infrastructure topic has events |
| `repositories__repo-2-nakama-research-dashboard__top.png` | No current work / no linked axes / no recorded activity |
| `people__person-1__full.png` | Infrastructure topic present but no corresponding person axes; unmapped account and sparse attributable activity |
| `topics__topic-1-experimental-research__full.png` | Diagnostics says no progress note / no evidence; long current-state text clipped despite expanded disclosure |
| `topics__topic-2-research-infrastructure__full.png` | Consultation axis evidence sparse; repeated pills and low-value metadata |
| `repositories__repo-1-grablink-full-sequence-acquisi__top.png` | Weak/absent repository description and sparse identity context |
| `repositories__repo-3-udv-echo-process__top.png` | Weak/absent repository description and sparse identity context |
| `progress_axes.jpg` | Single Grablink problem shown as current problem and again as open-problem entry; plan surrounded by nested/low-information sections |
| `problems.jpg` | Three problems, sparse repository/evidence context, zero events alongside last activity today |

These anchors preserve observations, not independently established causes or source timestamps.

### Reviewer-attested anchors

Anchors the reviewer's own captures establish, kept distinct from design proposals:

- The **Overview** full view shows two activity regions side by side — a **Topic activity** column and a
  **Repository activity** column — each with **textual** age/count readouts and **no chart graphic**.
  (`overview__overview__full.png`)
- Repository presence **is** on the Overview (the Repository activity region). Removing repository
  cards/regions (U05) and replacing the readout with **discrete daily bars** (U06) are **proposals**,
  never observations of the current UI.

### Reviewer-held references (not in this repo)

Two references were named **verbatim** by the reviewer; they are **reviewer-provided material inspected
externally by the reviewer**. They are **not** in this repo's committed capture pack and were **not**
inspected by the agent that wrote this document — and they are **not absent**: they are held by the
reviewer.

- `progress_axes.jpg`
- `problems.jpg`

Their findings (`F04`/`F14a`, `F05`/`F06`/`U02`, `U04`, `U08`) rest on the **reviewer's** inspection of
those two files. This document does **not** substitute the available PNGs for them and does **not** claim
to have inspected them; those findings remain **reviewer-attested**, with the agent's own inspection
outstanding.

### Nonvisual findings explicitly retained

Some relying observations are **code/mechanism claims** that no screenshot can settle — the confidence
field selection (U01), the recency fallback (F06/U02), and the source-date/description/agenda questions.
The screenshots show at most a **symptom**; the mechanism needs a source read. Treating the symptom as
proof of the mechanism would be a category error, so each is marked *reviewer hypothesis* above.

## D. Boundaries

- No fixture write, source change, service change, research run, deploy or merge was performed to
  produce this document.
- Reviewer summaries are preserved as intentionally blank; no description text is invented.
- Correct the data (or establish that it needs no correction) **before** any redesign decision.

## E. WP1 verification dispositions (appended)

> **Appended, not an amendment.** The §A reviewer findings and their *Status* column are preserved
> **unchanged above**. This section records the **WP1** source-by-source verification (read-only,
> owner-authorized) against the frozen public pins and the current targeted fixture readback. Full
> evidence, source refs and measurement digests are in
> [`wp1-public-research-fixture-verification.md`](wp1-public-research-fixture-verification.md) and
> [`wp1-public-research-fixture-verification-evidence.json`](wp1-public-research-fixture-verification-evidence.json).
> **All 21 rows verified; 0 unresolved.** The *observations* are verified; **one row's causal *WHY* is refuted**
> (F14a — see the note below) and one shorthand was overstated (F17). The *Status* column above was the reviewer's
> pre-verification label; the *WP1* column below is the post-verification disposition. WP1 performs no
> fixture correction and authorizes no WP2+. Fixture-internal record ids are referred to by
> **semantic label**, not raw id prefix; public repo/pin/commit refs are kept. **"Verified" is a
> classification, not a defect headline**: for the optional/absent rows (F07b, F08, F15, F16) it means
> the observed absence or accepted-optional state is established (an honest blank or stated boundary,
> **not** a confirmed defect); a causal mechanism is confirmed only where source/contract supports it.

| ID | Reviewer Status (§A, unchanged) | WP1 disposition | WP1 evidence (pin file:line or readback field) |
|---|---|---|---|
| F01 | reviewer hypothesis | **verified** (fixture data gap, not a UI filter) | dashboard repo `axes:[]`, `activityCount:0`; infra axes `repositories:[]`, event `repositoryId:null`; `store.ts:3405,3413` |
| F02 | reviewer hypothesis | **verified** | person `axes`=4 (experimental only); infra axes `people:[]`; `axis_people` link-set |
| F03 | reviewer hypothesis | **verified** (agenda linked elsewhere) | diagnostics axis `evidence:0`; `docs/AGENDA.md` evidence on the sibling high-rate-optical-acquisition axis |
| F04 | reviewer hypothesis | **verified** | consultation axis `evidence:0`; its two problems `repositories:[]`; source commit `5a62749` on the sibling research-dashboard axis |
| F05 | reviewer hypothesis | **verified** | AGENDA event `occurredAt`==`recordedAt`==2026-10-07T14:32:13.984Z; source commit ts known `2026-09-24T11:33:25+03:00` (`44ba1a4`); day-only `2026-09-24` is chosen precision, not inherent |
| F06 | reviewer hypothesis | **verified** (mechanism; narrowed) | `ui.tsx:4232,4248,4519` label `recencyAt`; fallback `store.ts:5252,5438,5553` vs honest `lastActivityAt` `:5257,5444,5566` |
| F07 | reviewer hypothesis | **verified** | all repos `url/description/defaultBranch:''`; model `store.ts:112–120`; READMEs at pins |
| F07b | intentional | **verified** (absence; intentional) | both topics `description:''`, `summary:''` |
| F08 | reviewer hypothesis | **verified** (absence; candidate deferred to WP4) | diagnostics axis `currentState:''`, `currentStateConfidence:null` |
| F09 | reviewer hypothesis | **verified** (split) | url/branch/description representable but empty; "source docs" has no Repository field |
| F09b | reviewer hypothesis | **verified (unavailable)** | no `pin` on Repository type/DDL/manifest/types |
| F10 | reviewer hypothesis | **verified** (event URL absent/supported; problem provenance not representable) | all event `sourceUrl:''`; model `migrations/002:164`; `Problem` type `store.ts:336–348` has **no `sourceUrl` field**, so problem provenance is a model boundary, not a blank field |
| F11 | reviewer hypothesis | **verified** (boundary) | events `actorType:'agent'` (single recorder actor id withheld); `Activity` no upstream-author field `store.ts:152–170`; author slot only on collector path; upstream authors human (names/emails withheld) |
| F12 | verified | **verified** | diagnostics axis plan 4 steps all `position:null`; model `migrations/004:142` |
| F13 | reviewer hypothesis | **verified (unavailable); narrowed** | `Plan` `store.ts:351–358` has authorship, no content provenance; `plans` DDL `migrations/004:121–133` |
| F14a | verified | **verified** (supported capability, required field) — **original causal WHY superseded/refuted 2026-10-08; see the note below** | manifest `activities[].problemId`; `store.ts:5837,6599–6609`; existing diagnostics-axis problem 0 events |
| F14b | verified | **verified (unavailable)** | no title handle; write order `5806`→`5929`; FK `migrations/004:351`; `PRAGMA foreign_keys` `store.ts:2152` |
| F14c | verified | **verified (schema defect)** | manifest description advertises `problemId`; schema omits it (`additionalProperties:false`); `actions.ts:361–387` drops it |
| F15 | accepted limitation | **verified** (optional/accepted) | `attributable=Boolean(nakamaUserId)` `store.ts:3330`; `lastActivityAt` gated `:3333–3335` |
| F16 | intentional | **verified** (absence; intentional) | both topics `summary:''` |
| F17 | reviewer hypothesis | **verified** (shorthand overstated) | shorthand `five-tool-exercise.md:134`; source AGENDA reports partial 652/1028-frame saves + sustained as future work; blocker `:140` stands |

> **F14a — the observation stands; its original causal WHY does not.** The §A row's *WHY* column reads
> "A problem's evidence cannot be attached through the event tool for an existing problem". WP1 verifies the
> **observation** (the diagnostics-axis problem carries zero linked events) and **refutes that reason**:
> existing-problem linkage **is** supported, through `reconcile_topic.activities[].problemId`
> (`store.ts:5837`, resolved from an existing problem row at `store.ts:6599–6609`) — **only the current fixture
> failed to use it.** **No fixture change is implied or authorized** by this correction; it is a documentation
> correction of a causal sentence, requested by the reviewer and made against the pinned source.
> The plan's own line — "`record_activity` cannot link an event to a problem"
> (`docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md:71`) — remains **correct as written and
> as scoped**: it describes the `record_activity` action boundary (F14c), a *different tool* from
> `reconcile_topic`, and is not the refuted claim.
>
> **Read the counts with that in mind:** "21 verified / 0 refuted" is a statement about the **observations**
> and must not be read as endorsing every historical causal sentence in §A.

An independent read-only **contract-only** cross-check (local, uncommitted) was also re-verified here;
its boundaries are kept and its F14b "not even by id" claim is stated with its pre-existence/FK
precondition rather than as an absolute. **No finding's *observation* in §A was refuted; one row's causal
*WHY* was** (F14a — see the note above). No WP2+ work is performed
or authorized by this section.

## F. External reviewer gate disposition — WP1 (appended 2026-10-08)

> **Appended, not an amendment — and not a verbatim transcript.** §A–§E above are preserved unchanged.
> This section records the **gate disposition** of the external reviewer's WP1 verdict and the
> authorization boundary it leaves in force. The **verdict line is exact**; the two qualifications are
> **summarized** below (no verbatim reviewer message is available to commit) and must not be quoted as
> the reviewer's own words.

**Verdict: APPROVE WP1 WITH TWO NON-BLOCKING DOCUMENTARY QUALIFICATIONS.** Neither qualification
warrants rerunning WP1; both are documentary only — no fixture, product, UI or WP2+ work is implied.

| # | Qualification (source precision · cause vs observation) | How it is applied |
|---|---|---|
| 1 | **F08 — source precision.** The pinned source *does* support a conservative factual `currentState`; whether to **populate** the optional field and the exact **wording** remain an editorial choice for **WP4 / human approval**. | The F08 conclusion now separates **evidence sufficiency** from **editorial choice** (`wp1-public-research-fixture-verification.md` §3; `…-evidence.json` `F08`). The class stays **optional**; not a defect, and not a verified "should be populated". |
| 2 | **F14a — cause vs observation.** The **observation is true**; the original historical ***WHY* is false** (superseded/refuted). Existing-problem linkage **is** supported through `reconcile_topic.activities[].problemId`, and **only the fixture omitted the links**. | The §A row is preserved as history with a **dated supersede tag**; the explicit statement lives in §E above; the `0 refuted` absolutes were corrected to separate refuted **observations** (0) from the refuted **causal *WHY*** (1). |

**Counts after the qualifications:** **21 rows verified as observations**; **0 observations
refuted**; **1 causal *WHY* refuted** (F14a); **0 unresolved** — no material finding is unresolved,
and **no WP1 rerun** is required.

**Authorization boundaries (unchanged by this verdict):**

- **WP2 is prepared but NOT authorized.** The read-only WP2 scope (**F01/F02/F04**) is ready; the
  **owner has not authorized it**, and it has **not been started**.
- **No WP2 research, and no WP3/WP4, fixtures, product or UI change**, is performed or authorized.
- Only the two documentary corrections above are in scope for this verdict; every other work package
  awaits its own explicit owner authorization.

## G. WP2 relationship-delta disposition (appended 2026-10-08)

> **Appended, not an amendment.** §A–§F above are preserved unchanged. This section records the
> **WP2** read-only relationship-delta analysis of the three link findings (**F01, F02, F04**) against
> the current explicitly-targeted fixture readback and the frozen pins. Full evidence is in
> [`wp2-public-research-fixture-relationship-delta.md`](wp2-public-research-fixture-relationship-delta.md)
> and [`wp2-public-research-fixture-relationship-delta-evidence.json`](wp2-public-research-fixture-relationship-delta-evidence.json).
> **WP2 performs no fixture correction and authorizes no WP3+.** Record ids are referred to by
> **semantic label**; public repo/pin/commit refs are kept. **Authorization:** the dispatching brief
> authorized WP2 read-only; §F had recorded WP2 as not yet owner-authorized, and this session treats
> the brief as that authorization.

**Measurement.** Three read actions over direct HTTP at the explicit target org (`x-org-id`, CSRF
`x-csrf-token`), all HTTP 200 / `result.ok: true`; local source digests equal the frozen pin.
Fixture counts: `{topics: 2, axes: 6, repositories: 3, people: 1}`.

**Stored relationships, not projections.** The infra gaps are **absent link rows**, not display
filters. Link tables: `axis_repositories`, `axis_people`, `topic_people`, `topic_repositories`,
`problem_repositories`, `activities.repository_id`, `activities.problem_id`. Event→repository
attribution is **indirect through the axis** (`store.ts:3355-3394`, `:3411-3419`): naming the
repository on the infra axis attributes that axis's existing commit events **without editing any
event row**.

**Before-state (measured).** The infra **topic** already links the Dashboard repository (*primary*),
but both infra axes have `repositories: []` and `people: []`; the consultation axis has **0 events**
and its two problems have `repositories: []`. The person carries the 4 experimental axes only (infra
**topic** membership present with `axes: []`). All three infra commit events (`95ec34e`, `da7996b`,
`5a62749`) are commits of `ajegorovs/nakama-research-dashboard` (git-verified).

**Candidate delta (deduplicated).** Six candidate link-adds, all objects pre-existing — 0 new
repositories, 0 new people, 0 already-present pairs:

| # | Finding | Link | Source |
|---|---|---|---|
| D1 | F01 | axis *Research dashboard and focused retrieval* → repo Dashboard | its 3 commit events are Dashboard commits; topic primary repo |
| D2 | F01 | axis *Agent consultation and automation evidence* → repo Dashboard | its problems' records live in that repo; commit `5a62749`; topic primary repo |
| D3 | F02 | axis *Research dashboard and focused retrieval* → person *Aleksandrs Jegorovs* | the axis's commits are authored by `ajegorovs`; person is a topic member |
| D4 | F02 | axis *Agent consultation and automation evidence* → person *Aleksandrs Jegorovs* | topic membership + recording-commit authorship (weakest candidate) |
| D5 | F04 | problem *N-7 automation completes…* → repo Dashboard | problem describes the dashboard consultation stage, recorded in that repo |
| D6 | F04 | problem *Normal assigned `research-coordinator` skill loading…* → repo Dashboard | same stage records / product-skill-loading subject |

**F04 separately.** Repository omission: both consultation problems have `repositories: []`. Sibling
evidence location: the backing `github_commit 5a62749` is recorded on the **sibling** axis *Research
dashboard and focused retrieval*, not on the consultation axis. Candidate needed relationship:
problem → repository Dashboard (via `problems[].repositoryFullNames`). The **move/duplicate/reassociate
strategy is deliberately not chosen** here.

**Unchanged objects.** Topic→repository links; both topics' person links; the four experimental axes'
repository/people links; the diagnostics problem→Grablink link; the infra commit events
(`repository_id` stays `NULL`); all record versions (v1).

**Limitations carried for WP4 mechanics.** Axis links are additive (`expectedVersion` on the existing
axis); a `nakamaUserId: null` person is reused by `github_login`/`display_name`
(`store.ts:6362-6386`); problem repo links **replace** the set and require the verbatim `statement`
(`store.ts:4845-4848`); problem state changes only via `transitions[]`. F14a evidence links remain a
separate, unused capability. F09b: no first-class repository pin.

**Counts.** `candidate_adds = 6` (2 axis-repo + 2 axis-person + 2 problem-repo); new objects `0`;
duplicates `0`. **This section performs no write and authorizes no WP3/WP4/WP5/WP-G.**

## H. External reviewer gate disposition — WP2 (appended 2026-10-08)

> **Appended, not an amendment — and not a verbatim transcript.** §A–§G above are preserved unchanged.
> This section records the **gate disposition** of the external reviewer's WP2 verdict and the
> authorization boundary it leaves in force. The **verdict line is exact**; the qualifications are
> **summarized** below (no verbatim reviewer message is available to commit) and must not be quoted as
> the reviewer's own words. Full detail is in
> [`wp2-public-research-fixture-relationship-delta.md`](wp2-public-research-fixture-relationship-delta.md) §9
> and [`wp2-public-research-fixture-relationship-delta-evidence.json`](wp2-public-research-fixture-relationship-delta-evidence.json).

**Verdict: ACCEPT the six candidate link-adds (D1–D6), with the qualifications below.**

| # | Qualification | How it is applied |
|---|---|---|
| 1 | **D1/D2 — the axis→repository role is not established.** The chosen value `supporting` is removed; the role is **`null`/undecided**. A fixture default or another fixture link does not establish the semantics, and a `primary` promotion (a one-primary implication read out of the topic link) is likewise not source-established. | Delta `candidate_relationship` is now `null` with status `undecided`; §9.1 states the reasoning; the role is left to **WP4 / human approval**. |
| 2 | **D3/D4 — source-backed enrichments, not a restoration.** The seed packet named the person only on axes 1–4. | §9.2 restates the basis as **source** (not packet); the report is preserved as tested at the original WP2 head. |
| 3 | **Identity basis — exact, API-verified; no author-name equivalence.** The person's `githubLogin` (`ajegorovs`) equals the GitHub `author.login` of each of the three named commits at the frozen dashboard repo. | §9.2 records the three-commit API table and states the git author *name* is **not** the identity. |
| 4 | **D4 — strong chain.** `githubLogin` → `author.login` of `5a62749`, whose tree carries the exact consultation stage/acceptance; the N-7 / assigned-skill material is represented on axis 6. Topic membership is **corroboration, not the primary basis**. | §9.3 states the chain and supersedes the earlier "weakest candidate" label. |
| 5 | **Scope — exact identity/source only.** | The only verification is the GitHub commit API for the three named commits; **no expanded research**, **no inference**. |

**Counts after the qualification:** **six candidate pairs accepted**; **two unresolved role
decisions** (D1, D2); **identity basis confirmed**; **author route proof recorded**; the evidence
(move/duplicate/reassociate) **strategy remains undecided**. No fixture mutation.

**Authorization boundaries (unchanged by this verdict):**

- **WP2 is accepted with the qualifications above** and remains **read-only**; it authors no fixture write.
- **WP3 and WP4 are technically ready but NOT authorized.** They await **explicit owner authorization**;
  no packet design is performed.
- **No WP3/WP4 design or execution, no domain/fixture/product/UI/service change, no inference, no
  merge** is performed or authorized.
- The **move/duplicate/reassociate evidence strategy remains undecided** — not decided by this verdict.

## I. WP3/WP4 design-stage disposition (appended 2026-10-08)

> **Appended, not an amendment.** §A–§H above are preserved unchanged. This section records the **WP3
> baseline-seed design** and the **WP4 retained-fixture amendment design** as **published, design-only**
> artifacts, and the review fixes applied to them. **Neither design is executed or authorized to execute.**

- **WP3 — baseline-seed design** (`docs/plans/public-research-baseline-seed-design.md`): a clean-slate
  build that classifies every field `required`/`optional`/`unavailable`, sequences evidence atomically, and
  carries a source/date/pin manifest. **Resolved:** the seed is a *fresh* build that **encodes the
  WP2-accepted six-pair link set (D1–D6)**; reproducing the defective original packet verbatim is **not a
  valid reading** (D-E is resolved, not open). **Open (human):** the D1/D2 axis→repository **role** stays
  **undecided/blocked** — the schema has no "undecided" value, so those two links are **withheld**, never
  defaulted to `supporting`.
- **WP4 — retained-fixture amendment design**
  (`docs/plans/public-research-retained-fixture-amendment-design.md`): a before/after, classified,
  idempotent amendment plan covering **all 21 §A findings** (F01–F17, including the F07b / F09b /
  F14a / F14b / F14c splits), stating the exposed write path per finding and recording the unsupported
  paths as **BLOCKED** (F05, F10-existing, activity re-point, F14a retro-link — `activities` is
  INSERT-only; **no direct-DB write and no workaround**). The amendment class distinguishes **factual
  correction/enrichment** from **authored optional prose**; only F08's `currentState` wording is optional
  editorial.
- **Repo metadata descriptions are proposed concretely** from the **pinned READMEs** (WP4 §7.2), with the
  as-of-pin vs as-of-read (`about`) variance stated, not silently resolved.
- **Claims re-verified against the pinned source** (`src/store.ts`, `src/actions.ts`, `nakama.plugin.json`,
  `migrations/002`/`004`): plan/steps unchanged-echo does **not** bump the version (`store.ts:5031`), the
  topic/axis patches bump unconditionally (`store.ts:6144`, `:6268`), and the repo-metadata write is
  coupled to a `primary`-demoting link write (`store.ts:6437-6445`, mitigated by carrying the stored role).
- **No write, no WP5 checks, no WP-G, no merge.** Both designs are proposals awaiting explicit owner
  authorization; **WP3/WP4 execution and WP5 are not authorized** by this record.

## J. External reviewer correction on the WP3/WP4 design (appended 2026-10-08)

> **Appended, not an amendment — and not a verbatim transcript.** §A–§I above are preserved unchanged.
> This section records the **gate disposition** of the external reviewer's review of the two design
> documents and the documentation corrections applied in response. The **verdict line is exact**; the
> corrections are **summarized** (no verbatim reviewer message is available to commit) and must not be
> quoted as the reviewer's own words.

**Verdict: REQUEST CHANGES (design-only).** No WP5 is performed or authorized; both designs stay
design-only, and neither is executed. The corrections are documentation only — no fixture, product, UI,
service or deploy change, no inference, no merge.

| # | Correction | Applied in |
|---|---|---|
| 1 | **Guard scope separated.** The `confirmed` guard (`assertClaimsAreBacked`) is **axis-scoped** — `state`/`current_state`/`blocker` only (`store.ts:6790–6798`). Problem `stateConfidence` is a **fixture policy**, **not** store-enforced; the design no longer presents problem claims as guard-backed. | WP3 §5.1–§5.2 |
| 2 | **Concrete 8-event activity manifest.** Exact public `sourceUrl`, `occurredAt`, basis and precision, and axis placement per event: axis 1 = PR #44 + #69, axis 2 = PR #67, axis 3 = PR #1, axis 4 = `docs/AGENDA.md`, axis 5 = commits `95ec34e`/`da7996b`/`5a62749`, axis 6 = none — **8 unique events**. The AGENDA event is **included** (dated `2026-09-24` by file-touch basis), not omitted. | WP3 §3.4, §2.7 |
| 3 | **Explicit confidence, no defaults.** Every non-empty axis claim sets its confidence explicitly; `currentStateConfidence` **inferred** on axes 1–3/5–6, axis 4 `blocker` **confirmed** (the *packet's proposal*, backed same-transaction). The **retained fixture's** measured `blockerConfidence` is `inferred` — **ratified** (see §K); the two are distinct. | WP3 §2.3, §5.3 |
| 4 | **Creation transactions.** Two **creation** transactions plus any explicitly-approved problem-evidence later passes — **not** a guaranteed total of two, and **no** duplicated event to satisfy a policy. | WP3 §5.5 |
| 5 | **All six axis→repository roles unresolved.** The retained `supporting` on axes 1–4 is not an approved role; all six links are withheld pending explicit human approval. | WP3 §9 D-A, §2.3, §8 |
| 6 | **Repository metadata normalized.** Descriptions are the pinned-README opening paragraph with soft-wraps collapsed and **emphasis markers stripped** (words preserved); `defaultBranch` is the **actual GitHub `default_branch` as-of-read**, with the **source branch + pinned revision** carried as **distinct** manifest entries — never inferred from reachability, never conflated with the field. | WP3 §3.3; WP4 §7.2 |
| 7 | **WP4 axis-4 patch re-evaluates the retained `blocker` claim.** Any axis-4 patch is graded by `assertClaimsAreBacked` against the axis's evidence; the *actual retained* `blockerConfidence` is **`inferred`** — **ratified, not a defect** — so an `inferred` blocker needs no evidence. Only a `confirmed` `currentState` **or** an **explicitly separately approved** blocker **restoration** to `confirmed` needs evidence by the transaction's **end** (pre-existing evidence counts). **[superseded 2026-10-08 — the "`confirmed` blocker / no downgrade" framing was wrong; see §K]** | WP4 §8 |
| 8 | **WP4 F12 fixed at positions 1..4.** The 0-based alternative is withdrawn; `1..4` is a **reviewer-accepted design convention** — not a mutation permission and no base-selection gate. | WP4 §7.3, §12 |
| 9 | **Recency vs research (F06 side-effect).** A link/axis touch advances recency but adds no activity; the WP5-to-be invariants assert event counts / event times / `lastActivityAt` unchanged for non-activity changes. | WP4 §11; WP3 §10 |

**Counts after the correction:** the concrete manifest is **8 unique events** across **six axes**
(2/1/1/1/3/0); **six** axis→repository roles unresolved; **no** WP5 check implemented. The
`move`/`duplicate`/`reassociate` evidence strategy remains **undecided**, and no direct-DB workaround is
introduced.

**Authorization boundaries (unchanged):** WP3 and WP4 are **design-only and not authorized to execute**;
WP5 and WP-G are **not authorized**. Each awaits its own explicit owner authorization.

## K. Reviewer narrowing on the WP3/WP4 design — axis-4 confidence, `defaultBranch`, role scope (appended 2026-10-08)

> **Appended, not an amendment — and not a verbatim transcript.** §A–§J above are preserved unchanged
> (the four narrowed rows in §J rows 3/6/7/8 carry dated notes/tags). This section records the
> external reviewer's **narrowing corrections** to the two design documents and the documentation
> corrections applied. **Documentation only:** no fixture write, no product/UI/service change, no deploy,
> no inference, no new research, no merge, no WP5/WP-G. **The WP1 and WP2 records are untouched.**

**Verdict: the WP3/WP4 design corrections are applied (design-only).** Five narrowings:

| # | Reviewer narrowing | Applied in |
|---|---|---|
| 1 | **The retained axis-4 `blockerConfidence = inferred` is RATIFIED — not a defect.** The packet's `confirmed` is the **historical packet value**, never measured as confirmed in the retained fixture. The design must **separate** (a) the actual retained `inferred` (no evidence required, no product guard) from (b) an **optional, proposed-not-approved** *restoration* to `confirmed`. | WP4 §8, §3 (F08 row), §11 inv. 8, §12 item 3; WP3 §2.3, §5.3 |
| 2 | **Evidence-by-transaction-END.** A `confirmed` `currentState` **or** an explicitly-separately-approved blocker **restoration** needs evidence present by the check's transaction end (`assertClaimsAreBacked`); **pre-existing axis evidence counts** (not necessarily same call). Axis 4 carries **zero** evidence, so a **first** `confirmed` needs an **evidence add** unless an earlier explicitly-authorized pass added one. | WP4 §4.3, §8; WP3 §5.1 |
| 3 | **No default downgrade/upgrade.** With the restoration **not** chosen, the retained `inferred` stands unchanged — no default change is introduced. | WP4 §8, §11 |
| 4 | **`defaultBranch` = the actual GitHub `default_branch` as-of-read** (`master`/`master`/`main`). The **source branch the pin is on** and the **pinned revision** are **distinct manifest entries**, never conflated with `defaultBranch`; the historical branch is **not** inferred from reachability. | WP3 §2.1, §3 item 3; WP4 §7.2 |
| 5 | **Roles scope.** WP3 §2.8: **all six** axis→repository roles are unresolved, and the **2 WP2 candidate pairs (D1/D2)** are distinguished as a *subset*, not a smaller rule. WP4 §12/§7.3: the **F12 `0..3` choice is removed**; **`1..4` is a reviewer-accepted design convention** (not a mutation permission; **no** base-selection gate). | WP3 §2.8; WP4 §7.3, §12 |

**Counts after the narrowing:** the retained axis-4 `blockerConfidence` is **`inferred` (ratified)**;
**zero** corrections to the retained confidence; **one optional** restoration item (proposed, not
approved); **six** axis→repository roles unresolved; **F12 base 1..4** design-accepted. The
`move`/`duplicate`/`reassociate` evidence strategy remains **undecided**, and **no** confidence default
(downgrade or upgrade) is introduced.

**Authorization boundaries (unchanged):** WP3 and WP4 remain **design-only and not authorized to
execute**; WP5 and WP-G are **not authorized**. No fixture/domain write, no product/UI/service change,
no inference, no new research, no merge.

## L. WP5 executable-check stage disposition (appended 2026-10-08)

> **Appended, not an amendment.** §A–§K above are preserved unchanged. This section records the **WP5**
> executable-check stage — the checks themselves and their run — as a **read-only** artifact. WP5 authors
> and runs verification checks; it performs **no** fixture write, no `reconcile_topic`/`record_activity`
> against any target, no inference, no service/deploy change and no product/UI edit. **WP-G (the mutation
> gate) is not entered, and no WP3 seed or WP4 amendment is executed or authorized by this record.**

- **WP5 is implemented** as a repo harness at `harness/wp5/` (`manifest.mjs`, `fixture.mjs`, `checks.mjs`,
  `run.mjs`, `wp5-checks.test.mjs`), wired as `bun run harness:wp5` (the run) and
  `bun run harness:wp5:test` (the suite). The checks are **derived from the approved artifacts**: the WP3
  §3.4/§8 baseline manifest and the WP4 §11 amendment invariants, transcribed as executable data —
  **permitted testdata, transcribed from the accepted designs**, never the retained fixture.
- **Isolation.** The run seeds the approved manifest through the product's own write path
  (`reconcileTopic`) into a **fresh private throwaway temp store** (`mkdtemp` under `TMPDIR`, removed on
  dispose); the retained fixture is never opened, nothing is written inside the repository, and **no
  network client exists in the harness** (asserted by the C21 safety guard). `bun:sqlite` does not honour
  an in-memory URI through the store's path seam, so a throwaway temp store — the shipped
  `store.test.ts` pattern — is the honest isolation.
- **What the checks assert (executable, not prose).** Counts **2 topics / 6 axes / 1 person / 3
  repositories / 4 plan steps / 3 problems / 8 unique events**; the activity placement mapping
  **2/1/1/1/3/0**; **explicit confidence with no store default relied on** (state `inferred` on all six;
  `currentStateConfidence` `inferred` where present; axis-4 `blockerConfidence` per the manifest);
  the **`confirmed`-⟹-evidence axis guard** (with a **negative control** and a **pre-existing-evidence**
  case); the **problem-confidence-is-policy-not-guard** distinction; source **dates** (incl. the AGENDA
  event present at `2026-09-24`, ingestion date not substituted) and public **URLs**; repository
  metadata **byte-equal to the normalized pinned-README strings**; plan **positions `1..4`** (no nulls);
  **link-set idempotency**; **version `conflict`** on a stale `expectedVersion`; **no activity
  duplication**; **non-activity preservation** of event count / `occurredAt` / `lastActivityAt` while
  recency may advance; **unsupported activity-update paths blocked**; **untargeted store unchanged by its
  own readback measurement, not DB byte identity**; and the offline **safety guard**.
- **BLOCKED is not green — no default is chosen.** Five parameter gates stay **unresolved** and each
  dependent check reports **BLOCKED**, never a silent default: (G01) all **six** axis→repository roles
  (not only D1/D2), (G02) the F08 axis-4 `currentState` wording/confidence, (G03) the optional axis-4
  blocker restoration, (G04) the F03/F04/F14a evidence strategy, (G05) the explicit target org + owner
  write authorization. A BLOCKED run exits non-zero and is not a verdict.
- **Actual run.** `bun run harness:wp5` → **28 PASS · 0 FAIL · 5 BLOCKED**, aggregate **BLOCKED**
  (exit 2) — the approved baseline is internally consistent, and the run stays **not green** because the
  five approvals are missing. `bun run harness:wp5:test` → **16 pass / 0 fail**, proving green is
  reachable and **can go red** on injected defects (null position, paraphrased description, defaulted
  confidence, unbacked `confirmed`, ingestion-dated event, empty URL, wrong mapping, drifted count), that
  an unresolved gate yields BLOCKED, and that a run over the **real retained-fixture readiness** (the
  committed, sanitized WP1 `fixture_measured` evidence) is **red and blocked — never a fictitious
  green**.
- **Documentation correction.** WP4 §12 renamed **"Approved items"** to **"Design-accepted proposals
  (not mutation approval)"** — those rows are proposals to be validated, not a mutation permission.
- **Boundaries.** No fixture/domain write, no `reconcile_topic`/`record_activity` against a target, no
  inference, no service/deploy/restart, no product/UI change, no WP3/WP4/WP-G execution and no merge. The
  checks are read-only; the six axis→repository roles, the F08 wording, the optional blocker restoration,
  the evidence strategy and the target **remain undecided**, and no role or default is chosen here.
