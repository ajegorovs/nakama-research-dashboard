# Implemented data and API contract

The four-view product uses the organization-scoped coordination model. Presentation labels
Project / Workstream / Task map to `topics` / `development_axes` / `problems`; they do not rename
storage. The manifest is the authoritative action schema; the shipped coordinator skill explains
agent use. This document describes existing behavior, not an implementation work order.

## Storage and migration

Migrations 001–006 are declared in `nakama.plugin.json`. The host applies pending migrations at
installation/update and preserves prior store generations. Migration 006 adds polymorphic plan
ownership through `plan_owners`, task titles through `problem_titles`, and task state `blocked`.
Existing IDs, histories, plans and step positions are preserved. Migration replay converges,
including after subsequent writes; migration tests cover this on bun:sqlite. Do not replace
migrations with a new empty store or assume an installation helper's success proves served identity.

## Tasks and plans

- Tasks represent general actionable work, with `open`, `blocked`, `resolved` states.
  Creation may name a state; subsequent state changes use recorded transitions, not a state
  value smuggled into an ordinary task update. Parent blockers do not set child states.
- A task has a concise `title` and full `statement`. The title limit is 300 characters.
- Plans are optional, simple ordered work at project, workstream or task scope. There is no
  checkpoint graph, inherited plan or automatic progress rollup.
- Every plan write resolves exactly one owner inside the reconciled topic. Project ownership
  names that topic; workstream and task owners must belong to it. Updates re-send the owner
  and may not change it. A step update must name a step belonging to that plan.
- Read plans expose their owner while retaining `axisId` compatibility. Render stored step
  positions as stored, including zero; absent positions have no number.
- A task's `plan_step_id` may reference its own plan or its workstream's plan, not a project's,
  sibling task's or another workstream's plan.
- Reconciliation processes plans before tasks. A task-owned plan therefore needs an existing
  task ID: create/read back the task, then create its plan in a second reconciliation.

## Authorship and maintenance

Tasks share one author identity for title and statement. Agents may not change either text
field on a human-authored task, including adding a missing title. Unchanged echoes and non-text
updates preserve stored authorship; permitted text changes attribute the whole row to the caller.
Plans retain their existing authored-summary protection.

Topic summary/description have **no mechanical authorship guard**: topics have no author columns.
Respecting human-authored topic words is an instruction-level obligation, not an enforced
schema guarantee. Per-field authorship, person biography/role extensions and stronger topic
protection require separately scoped schema decisions. See the maintenance contract for sourced
synthesis, conflict handling and post-write readback.

## Tools and containment

Five actions are exposed to agents: `get_overview`, `get_topic`, `search_dashboard`,
`reconcile_topic`, `record_activity`. The other manifest actions support page/admin reads.
New task/plan inputs are additive; the manifest validates input before dispatch.

`record_activity` accepts `problemId`. Every insertion path validates that the problem,
workstream and topic agree, deriving missing parent context where supported. Reconciliation and
collector insertions share this guard; a mismatched supplied context is refused. Task repository
and activity associations are explicit, not automatically inherited from the parent.

`get_topic` accepts optional stable `axisId` for a scoped workstream read. Reject unknown axes
and axes outside the topic. Scoped output includes the axis and its own evidence, history,
notes and problem notes; sibling material is excluded. Coverage declares returned/total,
truncated/absent and `limitScope` (collection, per-source or per-problem). Only `historyLimit`
and `notesLimit` apply to this branch; topic-wide activity/annotation options are ignored there.
The unscoped topic-wide shape remains compatible.

**Public person filter:** `list_activity` uses `personActorId`, not `actorId`. The host strips
reserved top-level `actorId`, so an old caller can get unscoped HTTP-200 results. There is no
compatibility shim. Check returned totals when upgrading. This is a filter over authorized
rows, not access control; acting identity comes from authentication.

## Paging, ordering and projections

The page uses independent numbered task/activity pages, trial size five.
`ScopedPage<T>` is `{ items, offset, limit, total, hasMore }`. Optional `offset`/`pageSize`
inputs on supported reads add page-shaped siblings without replacing legacy array fields.
`get_topic`, `get_progress` and `list_activity` expose the declared page reads; consult their
manifest schemas for exact branch applicability. Scope may be project, workstream, task,
person or repository as supported by the selected route.

- Items and total use the same predicate in one read snapshot.
- Activity orders `occurred_at DESC, id DESC`; tasks order `created_at ASC, id ASC`.
- Offset paging is stable only for an unchanged dataset. Concurrent inserts can shift pages;
  no cursor or snapshot-bound continuity is promised. The UI re-fetches after writes.
- Existing activity/history arrays remain arrays; page fields are additive.
- Project plans, task titles/own plans, enduring workstream descriptions and problems-by-state
  are exposed in the appropriate projections. Search matches task title and statement.
- Counts are not loaded-list lengths. Missing, truncated and absent are distinct states.

## Evidence and known limitations

Progress reads evidence from selected `axis.evidence`, not confidence, activity totals or a
progress score. Asserted confirmed claims require evidence. An unasserted database confidence
default can exist without evidence; do not invent an asserted research claim from it.
The scoped Progress Recent-activity feed replaces the retired in-card axis-history control.

Remaining qualifications: topic authorship is not mechanically protected; offset pages are
not stable under concurrent inserts; person-note input is unavailable through the public
writer; repository-only page-race coverage is not independently established. The canonical
selected-topic instrument currently proves index membership rather than exact selected-ID
equality and needs strengthening if that guarantee is claimed. Prior focus measurements are
not a fresh accessibility audit of future restyling.

## Verification entry points

`bun run check` covers source typing, build, source tests and root harness unit tests.
Additional host typing is `bun run typecheck:host`. Relevant source tests include
`migration-006`, `store-task-plan-text`, `store-read-pagination`, `store-taskpage-snapshot`,
`store-evidence-line` and action tests. Source definitions and tests take precedence over stale
line-number references or historical diagrams. Served identity and persistence require a real
instance; standalone preview proves rendering only. See `docs/DEVELOPMENT.md`.
