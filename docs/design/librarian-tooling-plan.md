# Librarian agent: fixture control and maintenance plan

## Goal and stage

Make the Nakama librarian able to read and maintain the research fixture through its assigned
plugin tools, with enough explicit control over the facts and relationships the four views display.
Measure instructions, tool reachability, validation and persistence—not general model intelligence.

This is a **plan-first draft**, based on the closed UI work in PR #9 at
`76d68174b4389aa2cbcfa38e2bbb7ef85995bae2`. Creating this PR authorizes preparation only:
no agent inference, fixture/database writes, installation, service restart or deployment.
Implementation and a bounded live exercise require an agreed control matrix and exact target.

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

### Initial control findings—not the completed audit

| Surface | Present public path | What must be checked |
|---|---|---|
| Project name, summary, description and status | `reconcile_topic.topic`; `get_topic` | Readback, version conflicts; topic text protection is instruction-level, not mechanical. |
| Workstream identity, purpose, current reading, blocker and confidence | `reconcile_topic.axes`; scoped `get_topic` | Existing-ID updates, backed/inferred claims and separation of enduring purpose from current reading. |
| Task title/body, state and relationships | `reconcile_topic.problems` and `transitions` | Stable IDs, agent-vs-human text protection, explicit blocked state and exact parent scope. |
| Project/workstream/task plans and step states | `reconcile_topic.plans`; owner-bearing reads | Creation order, existing owner/step IDs, positions including zero, update/reorder/removal coverage and ownership guards. |
| Repository description/URL/default branch and links | Repository inputs at topic/workstream scope; task repository references | Correct shared identity, primary/supporting constraints, link replacement/removal semantics and complete readback. |
| People identities, roles and links | `people`, workstream `people`, task `personIds` | Shared identity matching, relationship-specific roles and project-only affiliations; absence must not fabricate authorship. |
| People About text | Store has person notes; public people inputs lack a notes field | **Confirmed public-writer gap** for a field displayed in the fixture. Decide the minimal safe authoring/update policy before adding it. |
| Activity and annotations | `record_activity`, reconciliation arrays and scoped reads | Dates, actual source refs/URLs, task/workstream containment, append vs correction semantics and recoverable complete reads. |
| Supporting evidence | Scoped `get_topic.evidenceOffset/evidencePageSize` | Complete pages and totals; recorded support is not claim-specific proof. Task-to-evidence citations remain deferred. |

The coordinator skill also needs review: it omits the new evidence-paging inputs, and its
same-call-only backing wording is stronger than the existing-evidence admission rule. Correct
instructions against actual behavior; do not tighten/relax writer rules to satisfy prose.

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

## Decisions still needed

- Which exact live instance, organization, librarian profile and disposable fixture are in scope?
- Is ordinary maintenance enough, or are explicit unlink/reorder/correction operations required?
- What is the intended authorship/update policy for People About text and shared person metadata?
- Which investigation tools should the librarian have beyond the five dashboard tools?
- What bounded write/inference grant and acceptance cases will demonstrate sufficient control?

Scheduled monitoring, unrestricted database access, destructive cleanup, task-to-evidence citations,
new UI design and production deployment are outside this draft's initial scope.
