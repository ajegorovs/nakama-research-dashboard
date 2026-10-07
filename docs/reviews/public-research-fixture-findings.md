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
| F14a | required | Problems have zero linked events though the source supports some (an existing problem) | verified | A problem's evidence cannot be attached through the event tool for an existing problem | **Supported capability.** `reconcile_topic.activities[].problemId` targets an **existing** problem; the field is **required** where the source backs such a link. Not a fourth disposition — the capability is *supported*, the field disposition is *required* |
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
