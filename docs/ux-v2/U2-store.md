# U2 — the store layer

**What this chunk is.** The runtime half of the U1 schema: the writers that create and update Problems,
Plans and their links, the writer that moves an axis or a problem between states, and the read models the
redesigned views will read. It is *not* the action surface (U3) and not the page (U4+): nothing here is
reachable from the UI or from an agent until U3 wires it.

**Why it comes before the visual rework.** U4 onward redesigns five views. If the views are built first,
each one invents its own answers to "what is stale?", "what is in scope?", "whose words are these?" — and
the same question gets two answers in two panels. So the semantics land here, once, with tests, and the
views read them.

Status: **design fixed, implementation in flight.** Numbers are added when the tests are run; nothing in
this file is a measurement until it says so.

## 1. Transitions: one writer, one refusal

`transitionAxis(axisId, toState, {origin, actorId, observedAt?, note?})` and
`transitionProblem(problemId, toState, {origin, actorId, observedAt?})`.

| Request | Result |
|---|---|
| axis, `toState` **equals** the current state | **refused, nothing written** — `no-op: …` |
| axis, `toState` is another one of the seven | accepted: one appended `state_log` row **and** the axis's `state` updated, `version` bumped, `updated_at` touched — one transaction |
| axis, `toState` outside the seven | refused, nothing written (`ResearchStoreError`) |
| problem, `toState` equals the current state | refused, nothing written — `no-op: …` |
| problem, `open → resolved` | accepted; one appended row |
| problem, `resolved → open` (a reopen) | accepted; history keeps both, the `resolved` row is not replaced |
| axis, `usable → active` (a reopen) | accepted; the `usable` row stays in history |
| either, unknown id | refused ("Axis not found." / "Problem not found.") |
| either, `origin` outside `human|agent` | refused — `migration` is the migration's word, never a writer's |

Two invariants this table is really about:

- **Reopening is not a special case.** It is a transition *to* `active` (axis) or `open` (problem) from a
  state that had stopped. Because the log is append-only, the earlier closed/usable state is *preserved*
  rather than overwritten — the U1 charter's requirement, now exercised by a writer instead of only by the
  schema.
- **A no-op is the writer's job, not the database's.** No CHECK can see another row's current state, so
  the writer reads it and refuses. That boundary was stated at U1 and is asserted here: a refused no-op
  leaves the log row count and the subject row byte-identical.

### There is no prohibition table, and that is deliberate

The contract names three reopenings (`usable → active`, `parked → active`, `completed → active`); it does
not enumerate forbidden transitions. So the rule implemented is: **any transition that actually changes
the state is accepted; only non-changes are refused.** Inventing prohibitions would encode assumptions the
contract does not make — the same discipline that kept `blocked`/`parked` out of the Problem lifecycle.

The one consequence worth a decision: **`abandoned → active` is therefore allowed today.** Nothing in the
contract says `abandoned` is terminal, and if it is meant to be terminal that is a real rule which deserves
its own evidence rather than a prohibition I chose at a keyboard. Flagged for the reviewer; the code
carries the same note where the rule would live.

## 2. Human-authored text is never rewritten by automation

Rule, at field level rather than row level:

- *Authored text*: `problems.statement`, `plans.summary`, `plan_steps.title`, `annotations.text`.
- An **agent**-origin update that would change authored text on a row whose `author_type = 'human'` is
  **refused** (`human-authored: …`), and nothing is written.
- An agent may still change what is *machine-owned*: state (through the transition writer, as an appended
  row), repository/person links, plan-step state, and it may always add new rows.
- A **human**-origin update may edit human text — a person correcting their own words is not automation.

That is the contract's requirement — a human's words must not be silently replaced by later automation —
expressed as a refusal the caller can see, rather than a silent non-write.

## 3. Traceability: what every new row carries

| Row | Carries |
|---|---|
| `problems`, `plans` | `author_type` (`human|agent`), `author_id`, `created_at`, `updated_at`, `version` |
| `plan_steps` | `created_at`, `updated_at` (not authored text — a step's title is a plan's own structure) |
| `state_log` | `axis_id` xor `problem_id`, `from_state`, `to_state`, `origin` (`human|agent`, never `migration` from a writer), `actor_id`, `recorded_at` (always now), `observed_at` (**nullable — when the state was observed is often unknown, and that is not the same fact as when the ledger learned it**) |
| `annotations` | `kind`, `confidence` (NULL when there is no claim), `author_type`, `author_id`, `created_at` |
| `activities` | the new `problem_id` link, plus the existing actor/source fields |

## 4. The read models, and the two rules that keep them honest

Read models added: an axis's open problems; a repository's affected problems; a problem's parent
axis/topic, evidence and resolution/reopen history; a plan with its steps; an axis's state history; the
Overview recency projection (topic and repository cards); the two Progress projections. Plus the fields the
five redesigned views will read for Problems and Plans.

- **One stale derivation, used by every view.** `stale` is derived from recency and nothing else, it is
  never stored, and it is a *different fact* from `blocked`. A test asserts stale ≠ blocked: a blocked axis
  with recent activity is current-but-blocked, a quiet axis is stale, and neither term may stand in for the
  other.
- **One visible-set helper.** Archived rows and the activity window are resolved once per call, in a
  shared helper, and every read model reads *that* — not its own copy of the filter. Two copies drift the
  moment one gains a rule, and then two panels answer "what is in scope?" differently.

### §11 audit: a confidence exists only where there is a claim

Every projection is checked for the same failure: a `*_confidence` field filled from a column default
reports `confirmed` for a row nobody has said anything about — and if that projection is also the agent's
payload, the wrong fact reaches the model, not just the screen. An entity with no claim reports `null`,
the views render nothing for it, and a test asserts that a never-claimed entity is `null` rather than
`confirmed`.

## 5. Acceptance — the tests that define this chunk

Alongside keeping every existing test green:

1. a valid transition appends exactly one row with the right `from_state`/`to_state`/`origin`/`actor_id`,
   and leaves `state` updated and `version` bumped;
2. a no-op transition writes **nothing** — log count and subject row unchanged;
3. an invalid state name is a fixable error, not a crash, and nothing is written;
4. reopenings (`usable → active`, `parked → active`, `completed → active`) keep the prior state in history;
5. a problem's `resolved → open` reopen shows both rows in its history;
6. an agent update to human-authored text is refused, and the text is unchanged;
7. every new write carries its author/origin fields (traceability is asserted, not assumed);
8. the annotation target rule: a new `interpretation`/`steering` annotation with two targets is refused; a
   legacy-shaped `note` with two targets still inserts (the U1 preservation rule, now enforced on the write
   path as well);
9. a problem with no repository, no plan step and no activity is still meaningful;
10. a plan with unordered steps returns `position = null` rather than a synthesized order;
11. stale ≠ blocked;
12. an entity with no claim reports `null`, not `confirmed`.

**Seeding discipline.** These tests seed the *common* shape, not the convenient one: an activity that names
its problem and lets its axis and repository be implied by the problem's links — because that is what the
writers actually produce, and a fixture that fills in every foreign key exercises the easy path and hides
the real one.

## 6. What U2 deliberately leaves open

- **The action surface** (U3): no action key creates a problem or performs a transition yet, so nothing
  here is reachable from the UI or an agent. In particular `usable` is still absent from
  `nakama.plugin.json`'s `axes[].state` enum, which is U3's first change.
- **`abandoned`'s terminality** (§1) — allowed today, flagged rather than decided.
- **Whether history must survive entity deletion** — the U1 retention boundary, unchanged: this chunk
  writes history, it does not make history outlive its subject.
- **Ordering and layout** of anything rendered — U4 onward.
