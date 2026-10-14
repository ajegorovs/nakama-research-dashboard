# Environmental monitoring programme — realistic screenshot fixture specification

Status: **proposed for review; specification only**. No records, generator, clock override or screenshots are created by this document. Generation and screenshot publication require subsequent authorization.

## 1. Purpose and boundaries

Create one moderately populated, wholly fictional programme for ordinary visual inspection of Projects, Progress, People and Repositories. Use the accepted UI and the refinements agreed during owner review, not the frozen prototype's obsolete interactions. Keep the existing corpus, layout, scale and regression datasets unchanged. This is not exhaustive state coverage, scientific evidence or production acceptance.

A librarian will author the eventual records from a canonical fictional source packet. Freeze the reviewed packet and record text; never regenerate prose nondeterministically during screenshot runs. All observations, people and outcomes below are invented. Display a single fixture-level notice: “Fictional environmental-monitoring programme · screenshot fixture”. Place it as a small preview-only fixed-position badge in an otherwise unused outer viewport corner, outside the dashboard layout flow, not a banner or production component. Keep it visible in ordinary captures, with no pointer interception or overlap with dashboard controls/content; adapt its corner if the capture geometry requires it. Verify unchanged dashboard bounding boxes with and without it. If no unobstructed placement exists, stop for a placement decision rather than shift the accepted layout. The manifest and image captions must independently identify the fixture. Source records additionally identify themselves as fictional.

## 2. Inspected implementation contracts

Inspection target: this candidate checkout, base `05f3e4ebbdbc33f089a1b7fc7e197ee04b4070c4`, with uncommitted owner-approved UI corrections. Line references describe the inspected source and may move with later edits.

| Contract | Actual behavior / consequence | Source |
|---|---|---|
| Vocabulary | Project status: active, paused, completed, archived. Workstream: active, draft, blocked, parked, usable, completed, abandoned. Task: open, blocked, resolved. Plan step: pending, active, done, blocked. Plans themselves have no state. Confidence: confirmed, inferred, uncertain. | `src/store.ts:34–91`; migrations 004 and 006 |
| Relationships | Project→workstream→task containment; explicit project/workstream/task repository and person associations. Project–repository relationship is primary or supporting. | migrations 002, 004, 006 |
| Text / ownership | Task short title is separate from statement. Plans have exactly one explicit project/workstream/task owner, not inherited ownership. | `migrations/006-task-plan-text.sql:72–88,149–155` |
| Evidence | Asserted confirmed workstream state, nonempty current reading and blocker must be backed by axisEvidence. It includes structural references, activities and annotations; this mechanical guard does not establish scientific validity. | `src/store.ts:2817`; `src/store.ts:7611–7640` |
| Pagers | UI page size 5. Backend pages carry items, offset, limit, total and hasMore. Tasks sort created_at ASC, id ASC; activities occurred_at DESC, id DESC. | `src/store.ts:575–606,2596–2652,5009–5047`; `PROGRESS_PAGE_SIZE` in `src/ui.tsx` |
| Bounds | Rollups cap at 50; ordinary activity reads default 25/max 100; evidence previews are capped. Keep this fixture beneath rollup caps and validate authoritative totals rather than capped lengths. | `src/store.ts:575–606` |
| Activity association | An axis implies its owning project; a task implies axis and project. The supported addActivity writer requires a project, axis or task: a repository alone is not sufficient. | `src/store.ts:4175–4219` |
| Scoped activity | Page predicates compare stored topic_id, axis_id, problem_id, actor_id and repository_id directly. Optional predicates combine with AND. | `src/store.ts:2596–2649` |
| Repository recency | Related repository rollup activity includes directly named repository events and events on linked axes, deduplicated by event ID. Its bottom activity feed is directly repository-scoped, not that union. | `src/store.ts:3700–3721`; `PagedActivityFeed` repository call in `src/ui.tsx` |
| Person activity | A mapped person account must equal activity.actor_id. Membership, mention, task ownership or participation alone does not attribute an event. | `src/store.ts:3536–3666` |
| Clock | Store uses Date.now()/new Date; browser relative ages also use Date.now. No existing reference-clock injection was found. Current UI scopeWindow=0 means all-time reads. | `src/store.ts:652–656,3369–3372`; `describeAge` and `scopeWindow` in `src/ui.tsx` |
| Preview | Fixtures must come from the real migrations/actions/read models, not handwritten response JSON. Existing preview freezes projections and slices scoped pages. | `harness/preview/README.md:111–155`; `harness/preview/make-fixtures.mjs`; `harness/preview/preview-main.tsx` |

Observation Schema is **active**. Although usable is supported, output readiness belongs in its current reading; no extra workstream is added merely to show that state.

### Exact inspected source fingerprint

SHA-256 of raw file bytes, not generated bundle or base-commit identity. Contract revalidation is mandatory if any listed file changes before generation. The feasibility script/report must bind to these hashes too.

| File | SHA-256 |
|---|---|
| `src/store.ts` | `8209de152ab4f05d150a4c584b51d765ff98cd821f2b14ef05c17860c3e6bbda` |
| `src/actions.ts` | `dba075ebaece57f43242114c95121ca7ad579ce8a61da04e648d71ae651adbee` |
| `src/ui.tsx` | `fdadf8b71f652521fa6141ced6f8e2741e5bf6442e229f33a1633e290a19d844` |
| `nakama.plugin.json` | `13f8cfd98b4b7c74bc30ba9d857e46daf23c892abebe1495122877e7bdeec402` |
| `migrations/001-research.sql` | `78d5d2f49b06b6e91981b41a2661689cbd6421d3b86de5ec697534a39e91fcaf` |
| `migrations/002-coordination-model.sql` | `adba7a10debbe85b60742d4f0f82370cfa9822eea67e73f994be2cbe3b165790` |
| `migrations/003-drop-legacy.sql` | `e91f537fa012b7d9ac455ac761daf7419d9b675956a032a4d8e7a4b9bcecca03` |
| `migrations/004-ux-v2-model.sql` | `46b830612d6b7f52cd661e30155779d6dd455dff2cbecb6386c4861cd301587e` |
| `migrations/005-external-evidence.sql` | `bd6617c8bc231749841ae03cf4d498d39feb67e2cdfe2e3531867b187d9fb081` |
| `migrations/006-task-plan-text.sql` | `97e9c81c585fcf14408550e93db6967130d704e34e38cf53800778f62c078328` |
| `harness/preview/make-fixtures.mjs` | `306d2fb3937ad084b77052d89a86bea4592f2e8103e7b796ce8469c25256a230` |
| `harness/preview/preview-main.tsx` | `dc2c56e46d46fde272df7ad3754e53106079df6ee48580c942d79bf6f262a870` |
| `harness/preview/run.mjs` | `27a264de47111dad0a4c2754b92383b22e85c70ad409d8ccbb0bf547c96b1bb5` |

## 3. Canonical identities and projects

Keys below are logical fixture identities, not freshly generated database records. Version name: `environmental-programme-v1`. Later generation must map every key to a stable UUID, using UUIDv5 with the standard URL namespace and name `https://fixtures.example/environmental-programme/v1/<kind>/<key>`. This is an identity namespace, not an external evidence link. If a supported action mints IDs, deterministic fixture-process ID allocation or a stable frozen mapping must be demonstrated; do not claim determinism merely because names match. No direct SQL bypass of write guards.

| Key | Project | Status | Purpose |
|---|---|---|---|
| RW | RiverWatch | active | Develop low-cost stations for continuous river-water monitoring. |
| AT | AirTrack | active | Build portable air-quality monitors for neighbourhood surveys. |
| OO | Open Observatory | active | Publish and compare environmental observations through shared formats and tools. |

All project summaries are concise. Retain a distinct short description while that real field remains in the UI; this fixture does not authorize its removal.

### Repositories: direct project associations

Organization label: `fieldlab-example`. No real GitHub accounts, PRs, commits or URLs. Set repository external URL empty and default branch `main`; the branch field is descriptive, not manufactured scientific evidence.

| Key | Repository | Explicit project relationships |
|---|---|---|
| FW | station-firmware | RW primary; AT supporting |
| RC | river-calibration | RW supporting |
| AV | air-validation | AT supporting |
| OS | observation-schema | OO primary; RW supporting; AT supporting |
| OP | observatory-platform | OO supporting; RW supporting |

Single-primary limitation: migration 002 (`topic_repositories_one_primary`) permits at most one primary repository per project. The supported link writer demotes an existing primary when another is assigned; therefore insertion order cannot be allowed to settle an ambiguous relationship. Owner decision: **OO observation-schema primary; observatory-platform supporting**. Both remain explicitly linked. This supersedes the original dual-primary table, without changing production constraints. Validate the final relationships, not just their counts.

Thus RW has four direct repositories, AT three, OO two. These counts are acceptance expectations derived from the table, not narrative numbers to put into responses.

### People and project affiliations

| Key | Person | Role | Direct workstreams | Explicit project-only affiliation |
|---|---|---|---|---|
| MC | Maya Chen | Instrumentation engineer | RW-CAL, AT-EVAL | OO — instrumentation adviser |
| LD | Leon Duarte | Embedded engineer | RW-INT, AT-MOB | none |
| PN | Priya Nair | Data engineer | RW-PILOT, OO-SCHEMA | none |
| SO | Samira Okafor | Research scientist | AT-VAL, OO-QUALITY | RW — scientific adviser |
| JB | Jonas Berg | Programme coordinator | RW-PILOT, OO-EXPLORER | AT — programme coordinator |

Explicit topic_people links include every person's direct-work projects and the three project-only affiliations. Roles remain recorded relationship facts; do not infer maintainership. Each person has one fixed synthetic mapped account key `account-<person-key>`. Attribute events through that mapping, never by copying events to participants. Short About notes describe responsibilities only, with no live identity/contact details.

## 4. Workstreams, tasks and plans

| Key | Project / workstream | State | Kind | Explicit repositories | People | Tasks open / blocked / resolved | Workstream plan |
|---|---|---|---|---|---|---|---|
| RW-CAL | RW / Sensor calibration | completed | experiment | RC, OS | MC | 0 / 0 / 2 | none |
| RW-INT | RW / Field-station integration | active | feature | FW, OS | LD | 4 / 0 / 3 | five steps |
| RW-PILOT | RW / Pilot deployment | blocked | test | FW, OP | PN, JB | 2 / 1 / 1 | four steps |
| AT-EVAL | AT / Particle-sensor evaluation | active | experiment | AV | MC | 3 / 0 / 1 | three steps |
| AT-MOB | AT / Mobile sampling | active | feature | FW, OS | LD | 2 / 0 / 1 | none |
| AT-VAL | AT / Measurement validation | active | test | AV, OS | SO | 2 / 0 / 1 | three steps |
| OO-SCHEMA | OO / Observation schema | active | feature | OS | PN | 2 / 0 / 1 | four steps |
| OO-QUALITY | OO / Data quality | active | investigation | OS, OP | SO | 3 / 0 / 0 | three steps |
| OO-EXPLORER | OO / Public explorer | draft | feature | OP | JB | 2 / 0 / 0 | none |

Totals: **3 projects, 9 workstreams, 5 repositories, 5 people, 31 tasks, 6 workstream plans**. Workstream states: six active, one blocked, one completed, one draft. Task states: 20 open, 1 blocked, 10 resolved. The blocked task is explicit; parent blockage never automatically blocks its children.

### Task intent and stable order

Task keys are `<workstream-key>-T01` onward. Created timestamps increase by one minute within each workstream; ordering is authored, not whatever the librarian returns. Parenthesized task states below follow the table above.

| Workstream | Ordered tasks |
|---|---|
| RW-CAL | Verify reference-solution repeatability (resolved); publish calibration procedure (resolved) |
| RW-INT | Confirm acquisition timing (resolved); verify buffering (resolved); verify restart recovery (resolved); integrate schema payload (open); validate drift flags (open); run overnight bench trial (open); document station setup (open) |
| RW-PILOT | Prepare deployment checklist (resolved); obtain site-access approval (blocked); confirm installation window (open); run acceptance visit (open) |
| AT-EVAL | Establish reference baseline (resolved); compare low-concentration response (open); evaluate humidity sensitivity (open); summarize instrument selection (open) |
| AT-MOB | Verify battery budget (resolved); prepare enclosure trial (open); confirm route protocol (open) |
| AT-VAL | Assemble reference sample (resolved); reconcile timestamp offsets (open); compare repeated traverses (open) |
| OO-SCHEMA | Publish pilot schema (resolved); review instrument metadata (open); validate cross-project examples (open) |
| OO-QUALITY | Define missing-value rules (open); review drift screening (open); document review thresholds (open) |
| OO-EXPLORER | Identify pilot audience (open); agree minimum explorer scope (open) |

Task statements are substantive requested work, not title repetitions. Explicit task_people/task_repositories are recorded only when relevant: default to the named workstream people and relevant subset of its repositories, but materialize those links intentionally rather than implement inheritance. The site-access task has JB and no repository; integration T04 has LD+PN and FW+OS. Parent person rollups must not be expanded merely because a person supports a task.

### Plan intent

| Owner | Ordered step titles and states |
|---|---|
| RW-INT | Acquisition checks — done; buffering/restart checks — done; schema integration — active; overnight trial — pending; setup handoff — pending |
| RW-PILOT | Readiness review — done; access approval — blocked; installation — pending; acceptance visit — pending |
| AT-EVAL | Reference baseline — done; comparative trials — active; instrument decision — pending |
| AT-VAL | Assemble sample — done; align measurements — active; compare traverses — pending |
| OO-SCHEMA | Pilot format — done; instrument metadata — active; example validation — pending; compatibility review — pending |
| OO-QUALITY | Define rules — active; review pilot samples — pending; document limits — pending |

Stored positions are explicitly 1-based here; preserve them literally. One additional task-owned two-step plan on RW-INT-T04: map payload fields (active), validate restart sample (pending). This gives **7 plans total**, six workstream-owned and one task-owned; no project plan. No automatic task↔step linkage: only RW-PILOT-T02→access-approval step and RW-INT-T04→schema-integration step are explicitly linked, with valid same-workstream containment. A step reference is distinct from owning a task plan.

### Explicit historical transition schedule

All times below are UTC. Create projects/repos/people and workstreams at `2026-09-23T09:00:00.000Z`; create each workstream's tasks from `09:30:00Z` onward in T01… order with one-minute spacing. Initial task states are open; initial RW-CAL and RW-PILOT workstream states are active; OO-EXPLORER starts draft, others active. OO-QUALITY starts inferred active. Create the seven plans at `2026-09-23T10:00:00Z`; all steps initially pending. Initial claims require fictional source-backed annotations in the later packet (one short axis note per confirmed initial workstream, explicitly distinguished from activity); the six active historical states cannot be unsupported merely because their first activities arrive later. These bootstrap notes are evidence, not extra events. Retain the inferred interpretation specified below separately.

For each dated verification event: store the event at 12:10Z, then apply the supporting task/step/workstream transition at 12:11Z. Where the axis/task state-log writer supports observedAt, set it to 12:00Z (the fictional occurrence); recordedAt is the replay write time. Plan steps have no state-log/observedAt column: preserve their update time and the canonical source/operation schedule, without inventing ledger fields. No transition alone implies activity.

| Date / source event | Task transitions | Workstream / plan-step transitions |
|---|---|---|
| Sep 24 / E01 | RW-CAL-T01 open→resolved | none |
| Sep 26 / E02 | RW-CAL-T02 open→resolved | RW-CAL active→completed |
| Sep 27 / E03 | OO-SCHEMA-T01 open→resolved | OO-SCHEMA step 1 pending→done; step 2 pending→active |
| Sep 29 / E05 | RW-INT-T01 open→resolved | RW-INT step 1 pending→done; step 2 pending→active |
| Sep 30 / E06 | RW-INT-T02 open→resolved | none: restart verification is still outstanding |
| Oct 1 / E07 | RW-INT-T03 open→resolved | RW-INT step 2 active→done; step 3 pending→active; task-owned RW-INT-T04 plan step 1 pending→active |
| Oct 5 / E11 | RW-PILOT-T01 open→resolved | RW-PILOT step 1 pending→done |
| Oct 6 / E12 | AT-EVAL-T01 open→resolved | AT-EVAL step 1 pending→done; step 2 pending→active |
| Oct 7 / E13 | AT-MOB-T01 open→resolved | none |
| Oct 8 / E14 | RW-PILOT-T02 open→blocked | RW-PILOT active→blocked; step 2 pending→blocked |
| Oct 10 / E18 | AT-VAL-T01 open→resolved | AT-VAL step 1 pending→done; step 2 pending→active |
| Oct 10 / E19 workshop packet | none | OO-QUALITY step 1 pending→active; state remains inferred active, no axis activity created |

All other tasks remain open and other steps pending. E16 and E21 describe partial trials, so they do not resolve the outstanding comparison or cross-project validation tasks. Reviewed/current-reading refreshes occur at the final snapshot time, with occurrence dates retained in sources; they are not extra lifecycle transitions.

Canonical replay order is timestamp ascending, then explicit operation phase (entity creation → link creation → evidence note → activity recording → state/task updates → plan-step updates), then logical key ascending within a phase. Dependencies take precedence over lexical order and must be declared in the packet. Events with equal occurrence timestamps replay by event key ascending; feed ordering is nevertheless the store's occurredAt DESC, id DESC, not event-key order. Generate and freeze the full operation schedule before replay.

## 5. Canonical fictional history

Reference clock: **2026-10-14T09:00:00.000Z**, timezone **UTC**. Event timestamps use the dates below at **12:00:00.000Z**; a later recording timestamp is fixed at occurrence + 10 minutes. These are events, not state-log counts. Source packet keys equal event keys, with literal prefix `Fictional fixture source:` in sourceRef. Source type defaults to manual; designated experiment/report events use supported experiment/repo_document types, never fake github_commit or github_pr identities.

Repository events cannot be repository-only through the supported writer. Rows called repository engineering below also name one explicit project and no axis. They appear in that project's history, but do not propagate to the other projects sharing the repository.

| Event | Date | Fictional observation / decision | Project | Axis | Repository | Actor | Source type |
|---|---|---|---|---|---|---|---|
| E01 | Sep 24 | Reference-solution repeatability accepted | RW | RW-CAL | RC | MC | experiment |
| E02 | Sep 26 | Calibration procedure published; bounded calibration work closed | RW | RW-CAL | RC | MC | repo_document |
| E03 | Sep 27 | Pilot observation format published for integration | OO | OO-SCHEMA | OS | PN | repo_document |
| E04 | Sep 28 | Programme pilot responsibilities agreed | RW | — | — | JB | manual |
| E05 | Sep 29 | Acquisition timing checks passed | RW | RW-INT | — | LD | experiment |
| E06 | Sep 30 | Buffering trial completed without lost samples | RW | RW-INT | — | LD | experiment |
| E07 | Oct 1 | Restart recovery verified on bench station | RW | RW-INT | — | LD | experiment |
| E08 | Oct 2 | Firmware buffering/restart report published | RW | — | FW | LD | repo_document |
| E09 | Oct 3 | Schema mapping gaps identified in integration sample | RW | RW-INT | — | PN | manual |
| E10 | Oct 4 | Integration review agrees next trial sequence | RW | RW-INT | — | LD | manual |
| E11 | Oct 5 | Maya and Jonas review field readiness; Jonas records conclusions | RW | RW-PILOT | — | JB | manual |
| E12 | Oct 6 | Particle reference baseline recorded | AT | AT-EVAL | AV | MC | experiment |
| E13 | Oct 7 | Battery-budget check accepted | AT | AT-MOB | FW | LD | experiment |
| E14 | Oct 8 | Site-access request submitted; approval now gates installation | RW | RW-PILOT | — | JB | manual |
| E15 | Oct 8 | Shared instrument metadata proposal published | OO | — | OS | PN | repo_document |
| E16 | Oct 9 | Initial low-concentration comparison completed; extended comparison and humidity trials remain outstanding | AT | AT-EVAL | — | MC | experiment |
| E17 | Oct 9 | Field-ready checklist published | RW | — | OP | PN | repo_document |
| E18 | Oct 10 | Reference samples assembled for traverse comparison | AT | AT-VAL | AV | SO | experiment |
| E19 | Oct 10 | Pilot-data quality workshop records open questions | OO | — | — | SO | manual |
| E20 | Oct 11 | Payload mapping review completed; implementation remains open | RW | RW-INT | — | LD | manual |
| E21 | Oct 11 | Initial pilot schema examples checked; full cross-project validation remains outstanding | OO | OO-SCHEMA | OS | PN | experiment |
| E22 | Oct 12 | Access approval remains outstanding; deployment stays blocked | RW | RW-PILOT | — | JB | manual |
| E23 | Oct 12 | Observation sample catalogue published | OO | — | OP | SO | repo_document |
| E24 | Oct 13 | Explorer audience and scope discussion opened | OO | OO-EXPLORER | — | JB | manual |
| E25 | Oct 13 | Public pilot update summarizes remaining dependencies | RW | — | — | JB | manual |

Exactly **25 activities**: RW 15, AT 4, OO 6. RW-INT has **six** activities (E05,E06,E07,E09,E10,E20), sufficient for two pages. Do not add records merely for symmetry. Its seven tasks page 5+2; its six activities page 5+1. Independent page state must be verified. OO-QUALITY is active with no axis-linked activity: its current reading is qualified and based on the workshop source, not invented recency.

The recording actor is not necessarily every participant. E11 mentions Maya but is attributed only to Jonas. E09 is attributed to Priya despite Leon owning the workstream. Such records must be supported by the fictional source packet, not inferred from membership.

## 6. Confidence, evidence and chronology

All workstream state assertions are confirmed except OO-QUALITY state/current reading, which are **inferred** from E19 plus one agent-authored interpretation: a work package is underway, but no direct execution report has been recorded. Do not relabel E19 as axis activity merely to make the axis look recent. Add an axis-targeted interpretation (`kind=interpretation`, confidence=inferred) citing the fictional workshop source. The axis still has no activity.

Confirmed readings/states/blocker assertions must have genuine fixture-local backing on their own axis before reconciliation completes. The blocked pilot's E14/E22 support the blocker; completed calibration's E01/E02 support closure. Each remaining confirmed axis has at least one axis event above. A shared repository's branch name alone must not substitute for source-grounded support. No fabricated structural PR evidence.

Evidence packet contains 25 small immutable fictional source records, one per event, with participant/recorder distinction, scope, occurrence time and concise observation. These are not 25 new activities or mandatory 25 annotations. Annotations comprise eight short initial source-backed workstream notes (one for each initially confirmed axis) and the one inferred OO-QUALITY interpretation: nine total. No steering annotations or external-evidence receipt/enrollment rows are required. Source URL is empty unless a real, verified local fixture viewer exists later. Evidence text explicitly says fictional. Migration 005's upstream-ingest path is outside this fixture; do not forge its server-owned receipts.

Use lifecycle writes in historical order. RW-PILOT becomes blocked on Oct 8; calibration closes Sep 26. State-log transitions are separate from activities: don't count them as extra events or assume a transition automatically creates an activity. All task/step states at the reference clock must agree with narrative outcomes, with no future completion claims.

## 7. Cross-view expected appearances and exclusions

“Projects” means selected project's activity feed; “Progress” means selected workstream's activity feed; “People” means actor-scoped activity, not membership cards; “Repositories direct” means bottom activity feed. Repository related recency/rollup is a different projection.

| Representative event | Projects | Progress | People | Repositories direct / related |
|---|---|---|---|---|
| E08: RW + FW, no axis, LD | RW yes; AT/OO no, despite shared FW | absent from every workstream and axis-linked Progress activity | Leon yes; Maya no | FW direct yes; unrelated repos no; FW related yes |
| E11: RW-PILOT, no repository, JB; Maya mentioned | RW yes | Pilot yes; Integration no | Jonas yes; Maya no | all direct repository feeds no; FW and OP related recency can include it through the pilot's explicit links |
| E09: RW-INT, no repository, PN | RW yes | Integration yes; Schema no | Priya yes; Leon no | FW/OS related yes; FW/OS direct no |
| E15: OO + OS, no axis, PN | OO yes; RW/AT no | absent from Schema and other workstream feeds | Priya yes | OS direct yes; associated projects do not acquire a duplicate event |
| E18: AT-VAL + AV, SO | AT yes; RW/OO no | Measurement validation yes | Samira yes; Maya no | AV direct yes; OS related yes through AT-VAL; OS direct no |
| E19: OO project workshop, SO | OO yes | Data quality no | Samira yes | all direct feeds no; no axis means no axis-based repository propagation |
| E24: OO-EXPLORER, JB | OO yes | Public explorer yes | Jonas yes | OP related yes; OP direct no |

Annotation on OO-QUALITY appears as axis evidence/interpretation, not as an activity in any of these feeds. Membership cards and activity attribution can differ legitimately.

Validation oracles for direct repository feeds: FW={E08,E13}; RC={E01,E02}; AV={E12,E18}; OS={E03,E15,E21}; OP={E17,E23}. All five repositories have ordinary direct activity without artificial pagination. Actor totals: MC=4; LD=7; PN=5; SO=3; JB=6. Maya's primary screenshot has two direct workstreams, three project affiliations, one project-only affiliation and four attributable events. Repository OS supports three explicit projects and six explicit workstreams. Compute every related-recency result from the actual read model; don't substitute the direct-feed totals for related history.

### Exact hero pagination oracle

RW-INT activity, newest first: page 1 **E20 → E10 → E09 → E07 → E06**; page 2 **E05**. Task page 1 **RW-INT-T01 → T02 → T03 → T04 → T05**; page 2 **RW-INT-T06 → T07**, using each fully qualified key in the actual manifest. Offset 0/5, pageSize 5, totals 6/7. Changing one pager must preserve the other's offset and selected identity.

For the other primary selections, expected newest-first feeds are:
- RiverWatch: E25,E22,E20,E17,E14,E11,E10,E09,E08,E07,E06,E05,E04,E02,E01 (pages 5+5+5).
- Maya: E16,E12,E02,E01 (one page).
- observation-schema direct activity: E21,E15,E03 (one page).

No equal timestamps occur within these individual hero feeds. Other ties are resolved by stored id DESC; the identity oracle must calculate UUID order rather than assume alphabetical logical keys.

## 8. Clock isolation and windows

Use a deterministic fixture-only replay clock: advance it through the declared historical action timestamps (each event recording at occurrence + 10 minutes), then fix it at the reference clock for all final reads. Freeze browser Date.now at that reference clock. Create each entity before its first event/task and replay all write families in timestamp order; the canonical transcript must explicitly specify creation, update and review times rather than relying on invocation wall time. Use fixture-local acting contexts matching the synthetic actor mappings where the authenticated action boundary owns attribution; an input actor label must never be assumed to override the acting context. Current production code has no injection seam; this specification does **not** authorize modifying it. Future implementation must demonstrate a disposable fixture-process clock and preview-only browser initialization before plugin activation, with real timers able to run. Do not freeze/pause event-loop timers or use a production global/config override. Any preview initialization is confined to generated preview files or the capture context and must be absent from installed UI/actions bundles. Clock setup is an explicit generation prerequisite, not already implemented capability.

Timezone: UTC for writes, fixture process and browser context. Browser locale: **en-US**. Account for both Date.now and no-argument new Date, plus any SQL defaults/triggers, generated previews and runtime date utilities; a Date.now-only patch is not proof of clock control. Use canonical ISO UTC Z strings; no locale-dependent parsing. At reference time, positive sinceDays uses a rolling duration `now - N*86400000`, inclusive lower boundary; 0 means all time. There is no calendar-week filter. Do not infer a UI window selector: the current four-view page requests all time. If auxiliary 7/14/30-day projections are exported, compute their expected IDs under the same clock and record them separately from screenshot scope. Staleness and relative labels use that fixed clock; unchanged data captured later must produce unchanged labels.

No future occurredAt, observedAt, recordedAt, createdAt, updatedAt or reviewedAt. Measured store limitation: the activity writer accepts a future occurredAt; a separate disposable guard probe demonstrated this. Therefore the fixture verifier must enforce chronology by scanning every stored timestamp, including occurrence/observation ≤ recording time, rather than claiming a production refusal that does not exist. Dates refer to fictional occurrence, not when the generator happened to run. A write timestamp must not masquerade as an observation timestamp. Preserve the existing UI's formatting; the fixture timezone controls environment, not product date-style policy.

## 9. Authored information density

Prompt guidance, not hard UI limits: project summaries typically 20–35 words; retained descriptions 60–90; workstream readings usually 30–60 with one integration reading around 70–80; enduring purposes 40–70; person/repository notes 20–40; tasks varied 15–50-word statements with short titles; activity summaries 12–25. Prefer concrete facts and next actions, not repeated boilerplate. Include no deliberately huge names, pathological wrapping, huge evidence lists or synthetic filler. Some natural prose will exceed the inline excerpt threshold; that is acceptable ordinary content. Freeze final authored strings in version control only after generation approval and public-record checks.

## 10. Capture manifest design

Required primary selections: Projects RW; Progress RW-INT; People MC; Repositories OS. Alternatives: Progress RW-PILOT; People SO; Repositories FW. Use stable logical keys resolved to fixed IDs, not first-list-item selection.

Manifest fields: fixture name/version; canonical source hash; action transcript hash; frozen projection hash; source HEAD plus dirty source/bundle SHA and raw browser-fetched asset SHA; browser version; fixed reference clock; UTC timezone; theme; viewport; active view; selected key and ID; task/activity offsets/pageSize/range/total; full-text expansion state; task-plan and completed-work disclosure state; actual host scroller position; capture dimensions; screenshot filename/hash; page/console/resource errors. No credentials or identity tokens.

Capture light theme at 1440×900 and 1280×800 for the four primary selections. Use purpose excerpts collapsed, task/activity page 1, historical folds closed by default. Add a same-width tall/scrolled detail capture per primary view where needed; distinguish host-scroller coverage from document fullPage. For RW-INT, add task page 2 with activity page 1, then task page 1 with activity page 2. Alternatives are supplemental ordinary states, not replacements for primary captures. Record actual states idempotently and wait for the real view/selection, fonts and element animations before capturing. Do not refresh published screenshots at this specification stage.

### Mandatory pre-generation feasibility gate

Before authoring the full fictional packet, replay a minimal disposable project, workstream, task, activity and plan through the real action layer in two fresh migrated stores. Include plan-step and task/workstream updates. Assert semantic action success, complete canonical row/read equality, deterministic IDs (including hidden state-log/owner rows), and fixed creation/update/occurrence/recorded timestamps. Inspect all SQLite timestamp/default/trigger expressions and every runtime identifier/clock source. Never compare just final counts or rename random IDs after generation.

Test the writer's actual acting context and confirmed-evidence guards. A fixture-only isolated process may control clock/ID providers; it must not write production files, suppress checks or disable constraints to obtain equality. Repeat in fresh processes, not just two stores sharing a mutated singleton. Preserve the executable probe, source fingerprints and actual output under scratch; summarize PASS or the exact blocker here. No full records or new clock plumbing are authorized by the feasibility test itself. If product changes are necessary, report the separate decision and stop.

### Feasibility result — bounded PASS

The parent independently reran the disposable probe with Bun. Two fresh subprocesses produced exact raw equality across 22 table snapshots and six supported reads, with no ID/time normalization; conflict, no-op and append-only guard outcomes agreed. Tables for people/repositories/links were empty in this minimal experiment; it is not full relationship coverage. Confirmed-evidence validation remains a full-generator acceptance requirement, not proven by the conflict/no-op checks.

Mechanism: fixture-process `setSystemTime` from `bun:test` covers `new Date()` and `Date.now()`; an isolated `globalThis.crypto.randomUUID` override installed before dynamic action imports provides deterministic allocations. No product injection seam is required on the exercised paths. The probe used counter UUIDs, not the final logical-key UUIDv5 mapping; the canonical generator must implement and validate that mapping (including hidden IDs) and historical clock advancement before claiming full-fixture reproducibility. No persisted-row rewrite or validation bypass is permitted.

SQLite limitation: migration 004's native `strftime(...,'now')` is not controlled by the JavaScript clock. It inserts zero bootstrap rows when migrations run on an empty store. **All migrations must complete on an empty disposable store before any fixture record is created.** Migrating a populated store is outside this mechanism and would leak OS time.

Probe: `.hermes/scratch/fixture-determinism/determinism.mjs` relative to the protected original checkout's scratch root, not the candidate's nested scratch. Executable SHA-256: `be249ca1099752f6889bcce9475aa621e94acebd130ceb5f97572925f7b71ad4`. Reports: `determinism-report.json` and `determinism-report.md` in that directory. These are local executable evidence, not shipped product dependencies. Browser clock/notice isolation and full dataset coverage are still future gates. The earlier uncontrolled probe's failure does not establish that production modifications are necessary; this controlled experiment supersedes that conclusion.

## 11. Generation and validation acceptance criteria (future work)

1. Approval of this specification precedes canonical fictional source authoring and record generation. No live org, shared retained research, existing fixture or owner preview is mutated.
2. Apply declared migrations 001–006 in a disposable store; use actual action paths and supported projections. Resolve stable IDs and map generated dependencies without bypassing assertions. Build complete scoped paged reads; never hand-author API success responses.
3. Validate schema/FKs, stable identity uniqueness, containment, explicit links, mapped actors, all state vocabularies, plan XOR ownership, task/step containment and evidence guards. Validate source packets substantively as well as mechanically.
4. Assert 3/9/5/5/31/25 entity/activity totals; six workstream plans plus one task plan; three explicit project-only affiliations. Count annotations/state-log rows separately. Check the task distribution and all memberships against canonical tables.
5. Assert the appearance/exclusion matrix and exact event IDs for all direct feeds. Read every page; compare ordered concatenated IDs with independently expected canonical IDs, zero duplicates, correct totals and sibling exclusions. Check related repository recency separately.
6. RW-INT task pages must be 5+2 and activity pages 5+1, independently controlled. Verify same-entity prose expansion survives pagination and resets appropriately on identity change. No insertions occur during paged screenshot capture.
7. Check inferred state/reading and confirmed pilot/calibration provenance. No false GitHub links, upstream receipts, invented attribution or qualified scientific claims presented as real evidence.
8. Generate twice in fresh isolated fixture processes using the same packet, clock and ID map; require canonical transcript/projection equality. Operational manifests may differ in build/run metadata; don't use those fields to excuse content drift. Clock leakage into production is a failed gate.
9. Capture all four views from that single frozen projection, with explicit hero identity and actual fetched build. Inspect normal and supplemental captures for missing facts, overflow and readable hierarchy; do not call a passed build screenshot acceptance.
10. Deliver generated fixture/captures for owner review before screenshot publication, commit or deployment. Existing scale/regression fixtures continue to cover extreme cases.

## 12. Decisions requested

Approve the canonical memberships, task/plan distribution, 25-event timeline and capture selections. Approve preview-only fixed-clock requirements as a prerequisite for later generation—not as authorization to change production. There are no outstanding requests for additional entities or states. If supported writers cannot achieve deterministic IDs/clock isolation, report that blocker before generating a misleading fixture.
