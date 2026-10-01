# U1 — migration 004: the design note

**Status: proposed, nothing executed.** This is the artifact to review *before* 004 exists: the schema, the
truth table, the safety argument and the rollback. Line references are to files in this repository.

Read with `docs/ux-v2/STATUS.md` (chunk state) and `docs/ux-v2/README.md` (chunk map). The reviewer's U1
charter is summarised in §7; anything in it that this note does not answer is a gap, not an oversight to
assume away.

---

## 1. What 004 is, and what it is not

It is a **semantic** migration: the axis state vocabulary gains `usable`, state history becomes a
first-class append-only record, and two new entities (Problem, Plan) arrive. It is *not* a redesign of the
existing dataset: every row that exists today keeps its identity, its relationships and its meaning, and
nothing that can be expressed in the old model is re-expressed in the new one.

Concretely, the invariant 004 must preserve:

| Preserved | How it is checked (proof #1) |
|---|---|
| every table's row count | fingerprint before/after (`scripts/pre004-snapshot.py` in the estate tree) |
| every axis's `state` string | identity map, §3.2 |
| every relationship (`axis_repositories`, `axis_people`, `topic_*`) | row counts + `PRAGMA foreign_key_check` |
| provenance columns (`source_type`, `actor_type`, confidence triplets) | their distributions, unchanged |

## 2. What the host does with a migration (the failure model 004 must live inside)

From `apps/server/src/services/plugin-service.ts` (`applyPluginMigrations`), and confirmed by the header
of `migrations/002-coordination-model.sql`:

- each unapplied migration is run as `db.exec(sql)` on a connection that **sets no pragmas** — foreign
  keys are **OFF** — and with **no surrounding transaction**;
- the checksum ledger row is written **after** the exec returns, keyed by migration id;
- an already-applied id is skipped; a changed checksum on an applied id is a hard `checksum_mismatch`
  refusal.

Two consequences 004 inherits, exactly as 002 did:

1. **004 must wrap itself in `BEGIN IMMEDIATE … COMMIT`.** Without it, a failure part-way through leaves a
   half-migrated database that a re-run cannot repair (the re-run would hit "table already exists").
2. **Never edit an applied migration** — after 004 ships, its SQL is frozen.

## 3. The state model

### 3.1 The enum

Today (`migrations/002-coordination-model.sql:100-101`):

```sql
state TEXT NOT NULL DEFAULT 'active'
  CHECK (state IN ('active', 'draft', 'blocked', 'parked', 'completed', 'abandoned'))
```

After 004: the same six, **plus `usable`** — seven. SQLite cannot alter a `CHECK`, so the column's
constraint changes only by rebuilding the table (§4).

`usable` is not a synonym for the others: `completed` means the work is finished, `parked` means
deliberately set aside, `abandoned` means given up on, `usable` means *it works well enough to build on
and is expected to change*. It is the state a reviewer is most likely to care about, because it is the one
that says "depend on this, but do not freeze it".

### 3.2 The truth table (the thing to review)

Old value → new value. This is the identity map, deliberately: **no existing row is reinterpreted, and no
existing row becomes `usable`.** `usable` is reachable only by a *new* transition, after 004.

| Old state (002 enum) | In this corpus | After 004 | Interpreted as | Bootstrap state-log row |
|---|---|---|---|---|
| `active` | 2 axes | `active` | unchanged | `from NULL → to 'active'`, origin `migration` |
| `draft` | 0 | `draft` | unchanged | `NULL → 'draft'`, `migration` |
| `blocked` | 0 | `blocked` | unchanged | `NULL → 'blocked'`, `migration` |
| `parked` | 0 | `parked` | unchanged | `NULL → 'parked'`, `migration` |
| `completed` | 1 axis | `completed` | unchanged | `NULL → 'completed'`, `migration` |
| `abandoned` | 0 | `abandoned` | unchanged | `NULL → 'abandoned'`, `migration` |
| — | — | `usable` *(new)* | reachable only by a new transition | — |
| `NULL` / unknown | 0 (column is `NOT NULL DEFAULT 'active'`) | — | cannot occur | — |

Two things this table deliberately does **not** do:

- it does not map any old state onto `usable`, even though "active but usable" might look attractive for
  the two `active` axes — that would be the silent reinterpretation the charter forbids;
- it does not pretend the bootstrap row is a transition. The first row per axis has **no `from_state`**:
  nothing is known about what preceded it *in the log*, and inventing a self-transition
  (`active → active`) would read as an observed event that never happened.

**Open decision for review:** whether the bootstrap row should carry `from_state = NULL` (proposed) or
`from_state = to_state` (reads as a no-op but keeps the column non-null). The proposal is `NULL`, with
`origin = 'migration'` and `observed_at = NULL` carrying the "this is provenance, not history" meaning.

### 3.3 The log

```sql
CREATE TABLE axis_state_log (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  axis_id      TEXT NOT NULL REFERENCES development_axes(id),
  from_state   TEXT,                 -- NULL on the migration bootstrap row
  to_state     TEXT NOT NULL,
  origin       TEXT NOT NULL CHECK (origin IN ('observed', 'inferred', 'migration')),
  reason       TEXT NOT NULL DEFAULT '',
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('human', 'agent', 'system')),
  actor_id     TEXT NOT NULL DEFAULT '',
  observed_at  TEXT,                 -- NULL unless somebody actually saw it happen
  recorded_at  TEXT NOT NULL
);
```

- **append-only is enforced, not merely intended**: `BEFORE UPDATE` and `BEFORE DELETE` triggers raise
  `ABORT`. A future migration that must repair a log row has to drop the trigger explicitly — which is the
  point: silent rewriting becomes a deliberate, reviewable act.
- **reopen cycles are ordinary rows.** `usable → active` (reopen) and `completed → active` (reopen) are
  two inserts; the prior state survives because nothing is ever updated. `D4`'s full reopen set
  (`usable`/`parked`/`completed` → `active`) is representable without further schema.
- **current state stays denormalised** in `development_axes.state` — the read model and every existing
  action keep working unchanged; the log is history, not the source of truth for "now".

## 4. The table rebuild

`development_axes` is the parent of `axis_repositories`, `axis_people` and `activities` (all with
`REFERENCES development_axes(id)`), so the rebuild is the risky step and needs to be spelled out:

```sql
PRAGMA foreign_keys = OFF;          -- before BEGIN: the pragma is a no-op inside a transaction
BEGIN IMMEDIATE;
CREATE TABLE development_axes_new ( …same columns, CHECK (…) with seven states… );
INSERT INTO development_axes_new SELECT <every column, by name> FROM development_axes;
DROP TABLE development_axes;
ALTER TABLE development_axes_new RENAME TO development_axes;
-- recreate indexes/triggers the old table had
INSERT INTO axis_state_log (…SELECT from development_axes with origin='migration'…);
COMMIT;
```

Why this shape:

- **`_new` never gets children pointing at it.** Children reference `development_axes` by name; between
  `DROP` and `RENAME` that name is briefly absent, which is legal with foreign keys OFF and is exactly the
  window 002's header already assumes. (Renaming the *old* table aside — 002's `projects → projects_v1`
  trick — would drag the children's clauses along with it and leave them pointing at the discarded copy.)
- **columns are copied by name, not `SELECT *`** — a positional copy is how a rebuild silently swaps two
  fields.
- **the bootstrap insert is guarded** (`WHERE NOT EXISTS (SELECT 1 FROM axis_state_log WHERE
  axis_id = … AND origin = 'migration')`) so that a database restored from a backup, or a manual re-run,
  cannot double the log. Proof #5 tests exactly this by executing 004 twice on a scratch copy.

## 5. Preservation proof, failure safety, rollback

### 5.1 Proof #1 (snapshot → migrate → snapshot)

The pre-004 state of the real dev database is already captured: snapshot
`research-dashboard-pre-004-20261001-111421.sqlite` plus a fingerprint
(`pre-004-fingerprint-20261001-111421.json`) in the estate's backup directory, taken by
`services/nakama/scripts/pre004-snapshot.py`, which records every table's row count, the schema hash and
the distributions of the check-constrained columns:

```
topics=1  development_axes=3  axis_repositories=3  axis_people=3  people=1  repositories=1
activities=694  annotations=7  topic_repositories=1  topic_people=1
development_axes.state        {active: 2, completed: 1}
development_axes.state_confidence {confirmed: 2, inferred: 1}
activities.source_type        {github_commit: 625, github_pr: 69}
```

004 is then developed and tested **against a copy of that snapshot**, and the same script re-run on the
result: identical counts, identical `state` values, `PRAGMA foreign_key_check` empty, and the log
containing exactly one `origin='migration'` row per axis.

### 5.2 Proofs #4 and #5

- **Partial failure (#4):** 004 is one `BEGIN IMMEDIATE … COMMIT` block. The test is to fault-inject: run a
  copy of the file truncated just before `COMMIT` and confirm the database is byte-identical (modulo
  SQLite's own header) to the pre-state — i.e. the failure leaves nothing half-done.
- **Idempotence (#5):** execute the migration SQL twice against the same scratch database and confirm
  `axis_state_log` still holds one row per axis. The host's ledger already skips applied migrations; this
  proves the SQL is safe even without that protection (restores from backup, manual surgery).

### 5.3 Rollback (#6)

Rollback is a **file restore**, because the ledger lives inside the same SQLite file as the data:

1. stop the API process (or the org's plugin execution);
2. restore the pre-004 snapshot over the org's plugin database path;
3. start it again — the ledger now lists 001–003 only, and the plugin re-applies 004 on boot.

So rollback leaves the system in a state the forward path is *designed* to migrate from, rather than in a
hand-repaired intermediate. The estate keeps the snapshot under `/mnt/otrais/data/nakama-dev/backups/`
(estate path, not recorded in this repository's docs); for a clone, `pre004-snapshot.py` works on any
plugin database and takes seconds.

## 6. Problem and Plan — **not yet specified here**

The charter is explicit: do not encode assumptions about these two into 004, and stop and bring the
schema back if the design is ambiguous. It is, in places — the contract describes them as UX entities, and
the fields it names are not all field names.

So §6 is deliberately empty in this revision. What is *decided* already, because the charter states it and
it constrains the schema:

| Decided | Consequence for the schema |
|---|---|
| Problems are children of an axis (§5 of the charter) | `problems.axis_id` is NOT NULL → an axis is required, a repository is not |
| a Problem may reference one or many repositories | a join table (`problem_repositories`), not a column |
| a Problem is meaningful with no repository, PR or artifact | no NOT NULL repository link, no required PR column |
| repository links are evidence, not parentage | repositories never become the parent of an axis or a problem |
| owner-authored vs librarian-inferred must be distinguishable | an `origin`-style column on Problem (and on Plans), mirroring `annotations.author_type` |
| Plans are optional | `plans.axis_id`/`problem_id` nullable, and no backfill: zero plans is a valid v2 database |
| confidence applies to claims, not existence | confidence lives on claim-like fields (`state_confidence`, a problem's *description* provenance), never on "this row exists" |
| human text is never silently rewritten | agent-authored edits are separate rows/columns, not overwrites of a human's text |

## 7. The charter, item by item

| Charter item | Where this note answers it |
|---|---|
| 1 `usable` first-class, distinct | §3.1 |
| 2 no rewrite, no reinterpretation of existing rows | §3.2 truth table, identity map |
| 3 append-only history, reopen cycles representable | §3.3 + triggers |
| 4 reopening preserves the prior state | §3.3: rows are never updated |
| 5 Problems are children of an axis, many repositories | §6 |
| 6 Plans optional | §6 |
| 7 a Problem is meaningful without an artifact | §6 |
| 8 repositories are evidence links | §6 |
| 9 owner-authored vs inferred distinguishable | §6 |
| 10 confidence on claims, not existence | §6 |
| 11 human text never silently rewritten | §6 (+ trigger discipline in §3.3) |
| proof 1 preservation | §5.1 |
| proof 2 valid state, no reinterpretation | §3.2 |
| proof 3 deterministic bootstrap, marked as provenance | §3.2, §3.3 (`origin='migration'`, `observed_at NULL`) |
| proof 4 partial-failure safety | §2, §5.2 |
| proof 5 no duplicated log rows | §4 (guarded insert), §5.2 |
| proof 6 rollback documented before merge | §5.3 |
| proof 7 corpus **and** fixture passes green after | not yet — it is the last step of U1, before any U2 work |
| truth table published | §3.2 |
