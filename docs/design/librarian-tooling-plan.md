# Librarian agent: fixture control and maintenance plan

## Goal and stage

Make the Nakama librarian able to read and maintain the research fixture through its assigned
plugin tools, with enough explicit control over the facts and relationships the four views display.
Measure instructions, tool reachability, validation and persistence—not general model intelligence.

This is a plan-first draft, based on the closed UI work in PR #9 at
`76d68174b4389aa2cbcfa38e2bbb7ef85995bae2`. Two stages are kept distinct:

- **Source scope — implemented.** The plugin's action/store hardening and its matrix below are done and
  carry their own development checks. This is what the "Current maintenance scope and accepted
  exclusions" section and the control matrix describe. It did not touch a live instance.
- **Live stage — unrun.** Running a real librarian turn (inference, fixture/database writes, installation,
  service restart, deployment) still needs an agreed target, profile and write grant. Source completion
  does not authorize or establish any of it.

## Current source-grounded starting point

- `nakama.plugin.json` exposes five agent tools: `get_overview`, `get_topic`, `search_dashboard`,
  `reconcile_topic`, `record_activity`. Page/admin actions are not automatically agent capabilities.
- `skills/research-coordinator/SKILL.md` supplies the existing dashboard-maintenance guidance.
  The profile must actually have the skill and tools assigned; shipped files do not prove assignment.
- `reconcile_topic` supports topic fields, repositories, people, axes, activities, annotations,
  problems, plans and recorded transitions. The manifest is the model-facing input contract;
  `src/actions.ts` and `src/store.ts` implement the boundary and admission rules.
- The current frozen example is `harness/preview/datasets/environmental-programme-v1.json`.
  It is a read-only preview response packet, **not a writable live database**. The approved facts and
  fixture constraints are in `docs/design/realistic-programme-fixture-spec.md`.
- The merged source checkpoint passed 536 source and 47 harness tests. Those results establish
  backend development checks, not that a deployed librarian can discover and execute the tools.
- Existing optional evaluator/generation modules under `harness/librarian-generation/` and
  `docs/librarian-reconciliation/` are retained inputs, not standing live-execution authorization.
  Do not expand their frozen case registries or reopen historical grants for this workstream.

### Field-to-tool control matrix (source-grounded)

Each row traces a stored fact the fixture/UI displays from its manifest input through the action to the
store method and back out through a supported read. `Support` values: **supported** (public agent path
exists), **read-only**, **missing** (no public writer — see the accepted exclusions), **not needed**.
Classification covers the five exposed tools only; page/admin actions and direct store methods are not
agent capabilities.

| Group | Operation (field) | Support | Guards / omit / clear / version | Trace: manifest input → action → store → readback | Test anchor |
|---|---|---|---|---|---|
| Project | name | supported | Echo of the stored name is dropped (no version bump); a case-insensitive clash is refused; topics carry no authorship column, so text protection is instruction-level | `reconcile_topic.topic.name` → `reconcile_topic` → `applyTopicPatch` → `get_topic`/`get_overview` | actions.test.ts "reconcile_topic is the single write path…" |
| Project | summary, description | supported | Merged with `??`: omitted keeps stored; an empty string is accepted (max 4000, no min). No mechanical text guard | `reconcile_topic.topic.summary\|description` → `applyTopicPatch` | actions.test.ts "read actions" |
| Project | status (lifecycle) | supported | Enum active/paused/completed/archived; a plain field update — topics have no state log | `reconcile_topic.topic.status` → `applyTopicPatch` | actions.test.ts |
| Project | row version | supported | Top-level `expectedVersion` is checked even with no `topic` patch; a newly created topic has no prior version | `reconcile_topic.expectedVersion` → `assertVersion("topic")` | actions-librarian-concurrency A3 |
| Axis | identity id/title | supported | id must exist and belong to this topic; title matched case-insensitively; a new axis requires a title | `axes[].id\|title` → `applyAxisPatch`/`insertAxis` → `findAxisByTitle` | actions-librarian-integrity A1-edge |
| Axis | description (enduring purpose) | supported | Omitted keeps stored; no authorship guard | `axes[].description` → `applyAxisPatch` | store-read-pagination §5 "carries the enduring description" |
| Axis | kind | supported | Enum feature/experiment/test/investigation/maintenance; default feature on create | `axes[].kind` → `insertAxis`/`applyAxisPatch` | actions-librarian-integrity |
| Axis | branch | supported | Omitted keeps stored; empty string clears the branch | `axes[].branch` → `applyAxisPatch` | evidence-page "builds it only from exactly one GitHub repository" |
| Axis | PR (prNumber, prUrl) | supported | `prNumber` omitted keeps stored; both contribute to the evidence line | `axes[].prNumber\|prUrl` → `insertAxis`/`applyAxisPatch` | evidence-page |
| Axis | state (lifecycle) | supported via `transitions[]` | `axes[].state` is refused on an existing axis (an echo of the stored state is accepted, records nothing); a change goes only through `transitions[]`; a no-op is refused; no forbidden-edge table | `axes[].state` / `transitions[].toState` → `applyAxisPatch`/`transitionAxis` → `axisStateHistory` | actions-librarian-integrity A2; actions.test.ts U3 |
| Axis | current reading (currentState) | supported | Text ≤2000; confidence defaults confirmed | `axes[].currentState` → `insertAxis`/`applyAxisPatch` | store-read-pagination §5; actions.test.ts U3 |
| Axis | blocker | supported | Must be nonblank when entering `blocked`; otherwise optional text | `axes[].blocker`, `transitions[].blocker` → `applyAxisPatch`/`transitionAxis` → `assertBlockerPresent` | actions-librarian-integrity A2 |
| Axis | confidences | supported | Enum confirmed/inferred/uncertain; an asserted state or nonblank current-reading/blocker marked `confirmed` requires the axis to carry evidence (branch, PR, activity or note — stored or added in the same call) or the whole call is refused | `axes[].stateConfidence\|currentStateConfidence\|blockerConfidence` → `assertClaimsAreBacked(axisEvidence)` | actions.test.ts U3 |
| Axis | row version | supported | `axes[].expectedVersion` guards an existing axis row; ignored on create; omitted leaves it unchecked | `axes[].expectedVersion` → `assertVersion("axis")` | actions-librarian-concurrency A3 |
| Task | statement (text) | supported | Required on create, optional on update (omitted preserves); human-authored text is refused for an agent, an unchanged echo is not a rewrite; authorship follows the words | `problems[].statement` → `createProblem`/`updateProblem` → `assertTextIsReplaceable` | actions-librarian-omission B2; store-task-plan-text |
| Task | title (short text) | supported | Shares one authorship pair with the statement; `""` clears the title row; omitted preserves | `problems[].title` → `updateProblem`/`writeProblemTitle` | store-task-plan-text "title and mixed-text authorship" |
| Task | axis containment | supported | Create needs axisId/axisTitle; an existing task is verified in-topic and on the named axis before any write | `problems[].axisId\|axisTitle` → `resolveAxisId`/`resolveProblemInTopic` | actions-librarian-integrity A1 |
| Task | plan-step link (planStepId) | supported | Nullable — `null` clears; a named step must belong to the same-axis or task-owned plan | `problems[].planStepId` → `assertPlanStepBelongsToProblem` | store-task-plan-text "plan_step_id containment" |
| Task | person links (personIds) | supported | Replace-set on an existing task; `[]` clears | `problems[].personIds` → `replaceProblemPeople` | actions-librarian-omission B2 |
| Task | repo links (repositoryFullNames) | supported | Replace-set; `[]` clears; full names are registered in the same transaction | `problems[].repositoryFullNames` → `replaceProblemRepositories`/`upsertRepository` | actions-librarian-omission B2 |
| Task | state (lifecycle) | supported via `transitions[]` | `problems[].state` accepted on create only, refused on an existing task; change only through `transitions[]`, no-op refused, history append-only | `problems[].state` / `transitions[]` → `transitionProblem` → `problemStateHistory` | actions-librarian-integrity A2; store-task-plan-text |
| Task | stateConfidence | supported | Enum; no evidence guard on tasks | `problems[].stateConfidence` → `updateProblem`/`createProblem` | store-task-plan-text |
| Task | row version | supported | `problems[].expectedVersion` guards an existing task; ignored on create; omitted leaves it unchecked | `problems[].expectedVersion` → `assertVersion("problem")` | actions-librarian-concurrency A3 |
| Plan | owner | supported | Exactly one of topicId / axisId\|axisTitle / problemId; a topic owner must be this topic; a task owner must name an existing task (create the task, read it back, second reconcile); owner is immutable | `plans[].topicId\|axisId\|axisTitle\|problemId` → `resolveReconcilePlanOwner` → `createPlan`/`updatePlan` + `plan_owners` | store-task-plan-text "polymorphic ownership"; actions-librarian-omission B2 |
| Plan | summary | supported | Required on create and update; a human-authored summary is refused for an agent, an echo is allowed | `plans[].summary` → `updatePlan` → `assertTextIsReplaceable` | store-task-plan-text; actions.test.ts |
| Plan step | step title | supported | Required on create, optional on update (omitted preserves); plan_steps carry no authorship column, so a step title is not mechanically guarded (accepted exclusion) | `plans[].steps[].title` → `createPlanStep`/`updatePlanStep` | actions-librarian-omission B2 |
| Plan step | position | supported | Integer ≥0 (0 is valid) or `null`; omitted preserves | `plans[].steps[].position` → `optionalPosition` | actions-librarian-omission B2 |
| Plan step | step state | supported | Enum pending/active/done/blocked; default pending on create | `plans[].steps[].state` → `updatePlanStep` | actions-librarian-omission B2 |
| Plan step | containment | supported | A named stepId must belong to the plan being written | `plans[].steps[].stepId` → `assertStepBelongsToPlan` | store-task-plan-text "refuses a step that belongs to another plan"; actions-librarian-omission B2 |
| Plan | row version | supported | `plans[].expectedVersion` guards an existing plan; ignored on create; omitted leaves it unchecked | `plans[].expectedVersion` → `assertVersion("plan")` | actions-librarian-concurrency A3 |
| Plan step | row version | not needed | plan_steps have no version column | — | actions-librarian-omission B2 |
| People | identity | supported | Matched on nakamaUserId/githubLogin first, else an unambiguous exact-name match (NOCASE); an ambiguous name is refused; otherwise a row is created | `people[].displayName\|githubLogin\|nakamaUserId` → `resolvePersonForLink` → `upsertPerson` | store.test.ts (registerPerson) |
| People | roles | supported | Relationship-specific role upsert (`topic_people`/`axis_people` ON CONFLICT DO UPDATE) | `people[].role` → reconcile link | ui-people-repositories-v12 |
| People | About (biography) | missing (accepted exclusion) | `people.notes` exists but has no public writer: the manifest `people[]` entry has no `notes` field. Agent biography create/edit/clear is deferred; do not bypass via storage. Unknown-provenance text must be protected | (no path) | actions.test.ts "…deferred biography maintenance" |
| People | links, task personIds | supported | Topic/axis people upsert; task `personIds` is replace-set | `people[]`, `problems[].personIds` | ui-people-partition; actions-librarian-omission B2 |
| People | actor affiliation | supported | Links the actor only if the dashboard already knows them as a person — never invents a row; absence must not fabricate authorship | `context.actor` → reconcile `topic_people` link | actions.test.ts attribution |
| Repo | identity (fullName) | supported | Upsert key; registration inside the transaction | `repositories[].fullName` → `upsertRepository` | actions.test.ts "record_activity … registers the named repository" |
| Repo | metadata (url/description/defaultBranch) | supported | Merged with `??`: omitted keeps stored; no version guard | `repositories[].url\|description\|defaultBranch` → `upsertRepository` | evidence-page branch URL |
| Repo | link relationship | supported | Enum primary/supporting, default supporting; promoting one primary demotes the previous holder; link upsert | `repositories[].relationship` → `linkRepository` | ui-repositories-v1b |
| Repo | shared identity | supported | One repository row reused across owners; primary constrained per parent | `upsertRepository` + `linkRepository` | ui-people-repositories-v12 |
| Repo | unlink | missing (accepted exclusion) | No removal input; empty arrays do not unlink. Task `repositoryFullNames` does replace, and `[]` clears that task's set | — | — |
| Activity | summary | supported | Required | `activities[].summary` / `record_activity.summary` → `insertActivity` | actions.test.ts write actions |
| Activity | source (sourceType/ref/url) | supported | sourceType enum (8 values, default manual in reconcile); ref/url free text | `…sourceType\|sourceRef\|sourceUrl` → `insertActivity` | actions.test.ts |
| Activity | date (occurredAt) | supported | Free text ≤40; defaults to now | `activities[].occurredAt` | store-read-pagination §6 |
| Activity | principal (actor) | supported | Always `context.actor` (+ `profileId`); never read from input; the host strips spoofable keys | `context` → `actorOf` → `insertActivity` | actions.test.ts "identity is never read from input" |
| Activity | context (axis/problem/repo) | supported | Containment: a named problem's own axis and topic must match; a named repository is registered | `activities[].axisId\|problemId\|repositoryFullName` → `resolveAxisId`/`insertActivity` pairing guard | store-task-plan-text "record_activity problemId pairing"; actions-librarian-integrity A1 |
| Activity | readback | read-only | `listActivity`/`activityPage`; `get_topic` activity arrays | `get_topic`/`get_overview` (page-only `list_activity` is not an agent tool) | store-read-pagination §6; actions.test.ts |
| Note | text | supported | Required | `annotations[].text` → `insertAnnotation` | actions.test.ts |
| Note | target (axisId/axisTitle/problemId) | supported | A `note` keeps the topic+axis shape; a claim (`interpretation`/`steering`) must name exactly one target of topic/axis/problem, else invalid-input | `annotations[]` → `resolveProblemInTopic`/`insertAnnotation` | actions.test.ts U4 "a mis-targeted claim" |
| Note | kind | supported | Enum note/interpretation/steering (default note) | `annotations[].kind` | actions.test.ts U4 |
| Note | provenance (confidence) | supported | Enum confirmed/inferred/uncertain; a `note` stores null; a claim carries a value or null | `annotations[].confidence` | actions.test.ts U4 |
| Note | containment | supported | A named problem must belong to this topic and the named axis | → `resolveProblemInTopic` | actions-librarian-integrity A1 |
| Evidence | legacy evidence line | read-only | The capped `axis.evidence` line; `coverage.evidence` states the trimming; the same definition backs the confirmed-claim guard | `get_topic` axis scope → `axisEvidence` | evidence-page "legacy evidence membership matches the page's" |
| Evidence | evidencePage | read-only | Its own `evidenceOffset`/`evidencePageSize` (default 5, max 100); a complete, authoritatively-totaled union of branch, PR, activities and notes, scoped to one axis | `get_topic evidenceOffset/evidencePageSize` → `evidencePage` | evidence-page "get_topic evidencePage" |
| Evidence | task-to-evidence citation | not needed | Outside scope (deferred) | — | — |
| Read | includeArchived | supported | Default false drops archived projects from overview, search, lists and timelines; inventory totals always include archived; reads never mutate | `get_overview`/`search_dashboard.includeArchived` → `getOverview`/`searchDashboard` | actions-archive-filtering |

The coordinator skill documents evidence paging and existing-evidence admission. Guidance changes
do not tighten or relax backend admission. Test anchors below identify relevant suites, not a claim
that every matrix field has an independent action-level regression.

## Procedure and checkpoints

### 1. Establish the live librarian identity without executing a turn

Identify the intended Nakama instance, organization, librarian profile and writable disposable
fixture. Read the current plugin release/revision/generation, profile model/provider binding,
assigned tools, assigned skills and relevant execution/automation settings.

Separate installation, organization enablement, profile assignment, model-facing discovery and
execution allowlists. Inspect the assembled skill prompt/tool schemas where available. Confirm
that skill-loading instructions are compatible with any read-only or tool restrictions. Inventory
web/repository investigation capabilities separately from dashboard maintenance; their availability
does not authorize fetching arbitrary code, executing it or starting collection jobs.

**Checkpoint:** a read-only inventory with explicit verified/unknown entries. Keep operational
identities and endpoints outside public repo docs. If the target is missing or ambiguous, ask—never
choose the first organization/profile or infer identity from an old fixture/preview.

### 2. Complete a field-to-tool control matrix

For each stored fact and relationship the fixture/UI needs, trace:

`authored fact → manifest input → action → store validation → supported read → visible field`.

Inventory create, edit, clear/unlink, lifecycle change and inspect separately. Classify each as:
**supported**, **missing**, **intentionally operator-only**, or **not needed**. Capture the exact
public input and returned identity, author/confidence/version rules, omission semantics and a
positive/negative test. Follow definitions/usages in source; do not equate a direct store method,
preview renderer, generated-fixture shortcut or human API call with an available agent tool.

Use `src/actions.test.ts`, `src/store.test.ts`, `src/store-task-plan-text.test.ts`,
`src/store-read-pagination.test.ts` and `src/evidence-page.test.ts` as existing verification entry
points. Check their actual coverage before adding cases.

**Checkpoint:** owner agreement on the required maintenance set and intentional exclusions.
Sufficient control means reliable supported maintenance, not unrestricted SQL or destructive CRUD.
Do not assume deletion, history erasure, identity merging or global relationship removal is needed.

### 3. Fill only approved boundary and instruction gaps

Prefer additive inputs on the existing five-tool surface over a new universal tool or ontology.
Implement the smallest missing writer/read path, with real action/store tests, containment,
authorship, conflict, no-op and atomic-refusal checks. Preserve IDs, human text and append-only history.

Likely affected paths: `nakama.plugin.json`, `src/actions.ts`, `src/store.ts`, focused `src/*.test.ts`
and `skills/research-coordinator/SKILL.md`. Generated `actions/actions.js`/`ui/app.js` must follow
normal build policy. A migration is not presumed; add one only after a separately agreed schema
requirement, and declare it in the manifest. Keep all service-estate/profile configuration separate
from this public plugin repository. Do not change the accepted UI to hide a writer gap.

**Checkpoint:** the required control matrix is covered by executed action-level tests and truthful
skill guidance. Run `bun run check`, compatible-host `bun run typecheck:host`, and `bun run harness:records`.

### 4. Prepare one bounded real-agent maintenance exercise

Agree the exact target/profile/model, disposable database baseline, prompt, permitted operations,
write budget and cleanup before execution. Reuse an existing guarded path or a small targeted test;
do not build a new general-purpose evaluation framework.

Use one multi-turn librarian session where practical:

1. Discover/use dashboard tools, inspect the fixture and report scoped facts with missing/truncated
   data distinguished. Include full evidence-page retrieval where needed.
2. Propose a source-grounded maintenance change using the actual public schema.
3. Only after the bounded fixture-write grant, apply the agreed change and reread it by stable identity.
4. Exercise agreed refusals: human-authored task text, stale version, wrong parent/plan ownership and
   unsupported state. The fixture must retain prior facts/history and unrelated records.

Choose minimal positive operations from the approved matrix: for example an agent-authored task,
its optional plan, a transition, a scoped note/event and a relationship or biography update if added.
Create/read a task before its task-owned plan where the existing reconciliation order requires it.
Do not describe a two-call dependency as one atomic call, or a human-client write as librarian success.

**Checkpoint:** trace successful dispatched tools, capture actual principal-derived authorship,
compare all intended fields through fresh supported reads, and compare protected canonical rows
before/after. A plausible answer, proposed JSON, tool assignment or unchanged row counts alone is
not proof of consultation, persistence or preservation.

## Acceptance

- Every required fixture-visible field/relationship has a verified agent maintenance path or an
  owner-accepted explicit exclusion; no direct database access used to cover a tool gap.
- Skill guidance matches shipped schemas, lifecycle/authorship rules, pagination and error handling.
- A bounded real librarian exercise demonstrates discovery, supported reads, agreed writes and
  exact persisted readback, while negative cases refuse atomically.
- Target/plugin/profile/model bindings and evidence preservation are measured for that run.
- Public findings contain no credentials, private endpoints or machine identities.
- Report source completion, profile/tool assignment, inference result and production readiness
  separately. Do not mark this draft ready or merge merely because a plan exists.

## Current maintenance scope and accepted exclusions

The owner-approved source scope covers reconciliation containment, recorded lifecycle changes,
existing optional version guards, non-text task/step maintenance, archived result filtering and truthful
evidence-read instructions. The exclusions below were explicitly accepted for this PR; they are not
unresolved implementation promises. These development checks do not establish live librarian acceptance.

- **People About remains human-managed.** Agent biography creation, editing and clearing are deferred;
  the five-tool surface has no supported About writer. Do not bypass this through direct storage or
  overwrite biography through an affiliation update. A future writer needs separately approved stable
  identity, authorship, clear/omit and concurrency semantics plus a declared migration. Existing
  nonempty text of unknown provenance must be protected, not assumed agent-authored.
- **Project/workstream unlinking is deferred.** Existing task-link replacement remains supported.
  A future unlink must target one explicit relationship, never delete a shared identity or infer
  removal from omission. Existing empty project/workstream arrays do not unlink.
- **No additional topic/step authorship migration in this pass.** Preserve known human text by
  instruction where no mechanical guard exists; task text and plan-summary guards remain enforced.
- **No expanded person/repository search or read-pagination machinery without demonstrated need.**
  Existing truncation and missing-page limits must remain explicit.
- **Live acceptance is separately authorized.** No profile reassignment, inference, fixture mutation,
  installation or deployment follows from source completion.

## Decisions still needed

- Which exact live instance, organization, librarian profile and disposable fixture are in scope?
- Which investigation tools should the librarian have beyond the five dashboard tools?
- What bounded write/inference grant and acceptance cases will demonstrate sufficient control?

Scheduled monitoring, unrestricted database access, destructive cleanup, task-to-evidence citations,
new UI design and production deployment are outside this draft's initial scope.
