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

**Resolved (reviewer, 2026-10-01):** the bootstrap row is

```
from_state  = NULL            -- nothing preceded it in the log
to_state    = <the axis's current state>
origin      = 'migration'
observed_at = NULL            -- when it happened is unknown
recorded_at = <migration time, NOT NULL>   -- when the ledger learned it
```

`recorded_at` is the bookkeeping timestamp and stays `NOT NULL`; the pair of nullable/`NOT NULL` timestamps
is what keeps "when we learned this" separate from "when it was observed". The row is additionally
**unique per axis** at the database level:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS axis_state_log_one_bootstrap
  ON axis_state_log(axis_id) WHERE origin = 'migration';
```

so a re-run cannot produce a second bootstrap row for the same axis even if the insert guard were wrong.

**Coverage gap, stated rather than hidden:** the fixture's crowded card exercises five of the six old
states; `abandoned` is exercised by neither dataset. Identity-preserving mappings are low-risk, but
"low-risk" is not "covered" — U1 therefore adds an `abandoned` axis to the fixture so all seven states
have executable coverage before U1 is called done.

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
  point: silent rewriting becomes a deliberate, reviewable act. State corrections are represented by
  another appended record, never by mutating history.
- **nonsense transitions are refused twice over.** The bootstrap row is unique per axis by partial index
  (§3.2). Ordinary transitions are written by the store (U2/U3) and must reject a no-op
  (`from_state = to_state`) and a repeat of the axis's current state before inserting — the DB cannot
  distinguish those from a legitimate move without knowing the axis's current state, so this belongs in
  the one place that does: the transition writer, with a test that a repeated transition inserts nothing.
- **reopen cycles are ordinary rows.** `usable → active` (reopen) and `completed → active` (reopen) are
  two inserts; the prior state survives because nothing is ever updated. `D4`'s full reopen set
  (`usable`/`parked`/`completed` → `active`) is representable without further schema.
- **current state stays denormalised** in `development_axes.state` — the read model and every existing
  action keep working unchanged; the log is history, not the source of truth for "now".
- **bootstrap rows never masquerade as activity.** The log is a new table that nothing reads yet, so no
  current view can leak them — but the obligation is recorded here because U2/U3 own the read paths: any
  activity or history feed must filter `origin = 'migration'` (or render it explicitly as provenance, e.g.
  "state history begins here"), never present a bootstrap row as a change somebody or something made. The
  passes get a check for it in U10.

## 4. The table rebuild — and why the whole file must be re-runnable

`development_axes` is the parent of `axis_repositories`, `axis_people` and `activities` (all with
`REFERENCES development_axes(id)`), so the rebuild is the risky step and needs to be spelled out:

```sql
PRAGMA foreign_keys = OFF;          -- before BEGIN: the pragma is a no-op inside a transaction
BEGIN IMMEDIATE;

-- New tables: IF NOT EXISTS, because the file must survive being run twice (see below).
CREATE TABLE IF NOT EXISTS axis_state_log ( … );
CREATE UNIQUE INDEX IF NOT EXISTS axis_state_log_one_bootstrap …;
CREATE TRIGGER IF NOT EXISTS axis_state_log_no_update …;
CREATE TRIGGER IF NOT EXISTS axis_state_log_no_delete …;

-- The rebuild. Every statement is repeatable: the scratch table is dropped first, the copy is by
-- column name, the bootstrap insert is guarded, and the partial index backs the guard up.
DROP TABLE IF EXISTS development_axes_new;
CREATE TABLE development_axes_new ( …same columns, CHECK (…) with seven states… );
INSERT INTO development_axes_new (<every column, by name>) SELECT <same order> FROM development_axes;
DROP TABLE development_axes;
ALTER TABLE development_axes_new RENAME TO development_axes;
CREATE INDEX IF NOT EXISTS …;       -- whatever indexes/settled triggers the old table had

INSERT INTO axis_state_log (id, org_id, axis_id, from_state, to_state, origin, reason,
                            actor_type, actor_id, observed_at, recorded_at)
SELECT …, NULL, d.state, 'migration', 'state history begins at migration 004',
       'system', '', NULL, <migration timestamp>
  FROM development_axes d
 WHERE NOT EXISTS (SELECT 1 FROM axis_state_log l
                    WHERE l.axis_id = d.id AND l.origin = 'migration');

COMMIT;
```

Why this shape:

- **`_new` never gets children pointing at it.** Children reference `development_axes` by name; between
  `DROP` and `RENAME` that name is briefly absent, which is legal with foreign keys OFF and is exactly the
  window 002's header already assumes. (Renaming the *old* table aside — 002's `projects → projects_v1`
  trick — would drag the children's clauses along with it and leave them pointing at the discarded copy.)
- **columns are copied by name, not `SELECT *`** — a positional copy is how a rebuild silently swaps two
  fields.
- **the bootstrap insert is guarded** twice: `WHERE NOT EXISTS` on `origin = 'migration'` per axis, and the
  partial unique index from §3.2.

### 4.1 The re-run case the reviewer named — crash *after* COMMIT, *before* the host ledger row

This is the sharp one, and it is *not* the case migration 002's header describes. The host writes its
ledger row (`INSERT INTO _nakama_plugin_migrations …`) **after** `db.exec` returns. If the process dies in
that interval — the transaction is committed, the ledger says 004 was never applied — then on the next boot
the host re-runs **the entire file**, not just part of it.

002 could not survive that: a re-run hits "table already exists" and the plugin is stuck, because the
database has already changed but the host believes it has not. 004 therefore has to be re-runnable *as a
whole*:

| Statement class | Why the second run is safe |
|---|---|
| `CREATE TABLE` / `CREATE INDEX` / `CREATE TRIGGER` for the new tables | all `IF NOT EXISTS` |
| the rebuild's scratch table | `DROP TABLE IF EXISTS development_axes_new` first |
| the copy into `_new` | the source is the already-rebuilt `development_axes`, whose values are identical, so the rebuild is a no-op in effect |
| `DROP TABLE development_axes` / `RENAME` | repeatable; the second run rebuilds from a table that already has the new CHECK |
| the bootstrap insert | guarded by `WHERE NOT EXISTS` **and** the partial unique index |

The end state after one run and after two runs must be identical, and that is an explicit test (§5.2)
rather than an argument. This is also why 004 must not use `INSERT INTO … SELECT *`-style positional copies
anywhere, and why the rebuild carries no data transformation: an operation that is safe to repeat is one
that does not accumulate.

The cost of this choice is honest to state: the file is more defensive than 002, and a reader who assumes
"the host runs each migration once" will find the guards redundant. The redundancy is the point — it is the
only thing standing between a crash at the wrong moment and a plugin that will not start.

## 5. Preservation proof, failure safety, rollback

### 5.1 Proof #1 (snapshot → migrate → snapshot), with the reviewer's four additions

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

004 is developed and tested **against a copy of that snapshot**, and proof #1 is the comparison. Row counts
alone would not be evidence, so the check is five-part:

1. **Every pre-existing row, by identity.** The script is extended in U1 to dump every row of every
   pre-existing table keyed by primary key with all its column values, so the comparison is
   `(id → value tuple)` before/after, not "3 axes then 3 axes". A rebuild that swapped two columns, or that
   silently reset a `state_confidence`, would pass a count check and must fail this one.
2. **The resulting schema, not just the data.** `PRAGMA foreign_key_list(axis_repositories)`,
   `…(axis_people)`, `…(activities)` must still name `development_axes` as the parent with the same
   `on_delete`/`on_update` behaviour — the rebuild is exactly the operation that can quietly drop a
   referring clause, and nothing in a row count would notice.
3. **`PRAGMA foreign_key_check` on a connection where FK enforcement is ON.** The migration runs with
   foreign keys off (the host sets no pragmas), so the check has to be a *separate*, explicit verification
   afterwards — otherwise the migration's own assumption is the only thing testing it.
4. **The state log**: exactly one `origin='migration'` row per axis, `from_state IS NULL`,
   `observed_at IS NULL`, `recorded_at` non-null, and every `to_state` equal to the axis's live state.
5. **Schema hash** before/after, with the expected difference (the new CHECK plus the new tables) called
   out rather than ignored — an unexplained hash change is a finding, not noise.

### 5.2 Proofs #4 and #5 — including the crash-after-commit case

- **Partial failure (#4):** 004 is one `BEGIN IMMEDIATE … COMMIT` block. Fault-inject by running a copy of
  the file truncated just before `COMMIT` and confirm the database is unchanged — the failure leaves
  nothing half-done.
- **Idempotence (#5), ordinary:** execute 004's SQL twice against the same scratch database and confirm
  `axis_state_log` still holds one row per axis and that the second run's end state equals the first's.
- **Idempotence (#5), the ledger-lag case the reviewer named:** simulate a crash *after* the transaction
  commits but *before* the host writes `_nakama_plugin_migrations`. Concretely: run 004, then
  **delete its ledger row** (leaving the migrated database), then let the host's applier run 004 again —
  the real code path, not a hand-run of the SQL. The plugin must come up, the data must be unchanged, and
  the log must not gain a second bootstrap row. This is the case 002 would fail, and it is the reason the
  whole file is guarded in §4.

### 5.3 Rollback (#6)

Rollback is a **file restore**, because the ledger lives inside the same SQLite file as the data:

1. stop the API process (or the org's plugin execution);
2. restore the pre-004 snapshot over the org's plugin database path;
3. start it again — the ledger now lists 001–003 only, and the plugin re-applies 004 on boot.

So rollback leaves the system in a state the forward path is *designed* to migrate from, rather than in a
hand-repaired intermediate. The estate keeps the snapshot under `/mnt/otrais/data/nakama-dev/backups/`
(estate path, not recorded in this repository's docs); for a clone, `pre004-snapshot.py` works on any
plugin database and takes seconds.

**"File restore", defined operationally** (the reviewer's caveat, and it matters — a casual copy is not a
rollback):

1. **Stop the API process** that owns the plugin database. Restoring under a live writer is not recovery,
   it is corruption with extra steps.
2. **Restore a known-consistent snapshot**, not a raw file copy. The supported artifact is the one
   `pre004-snapshot.py` produces, because it is written with SQLite's `VACUUM INTO`: that opens a read
   transaction on the source and writes a complete, self-contained database, so nothing can be split
   between a `.sqlite` file and a `-wal`/`-shm` sidecar. A plain `cp` of the `.sqlite` while WAL holds
   committed pages loses data — if somebody must copy by hand instead, they checkpoint first
   (`PRAGMA wal_checkpoint(TRUNCATE)`) and stop the writer.
3. **Start it again.** The restored file's ledger lists 001–003, so the plugin re-applies 004 on boot —
   the same path a fresh install takes.

The same rule applies in the other direction: the pre-004 snapshot used as *input* to the U1 tests is a
`VACUUM INTO` artifact for the same reason. Copying the live dev database by hand for testing would test a
database that never existed.

### 5.4 The evidence bundle

Proof #1 is a comparison, so both halves and the transcript that connects them are kept together:

| Artifact | What it is |
|---|---|
| `research-dashboard-pre-004-<stamp>.sqlite` | the consistent pre-004 snapshot (`VACUUM INTO`) |
| `pre-004-fingerprint-<stamp>.json` | row counts, per-identity dump, schema hash, column distributions |
| `post-004-fingerprint-<stamp>.json` | the same, after |
| `004-migration-transcript-<stamp>.txt` | the run: statements executed, the FK-definition check, `foreign_key_check` output, the log's bootstrap rows, the second-run and ledger-lag results |
| `pre-004-0001-0003.schema.sql` | `sqlite_master` before, so the schema change is reviewable as a diff rather than described |

The bundle goes with the U1 handoff; the fingerprints are the part a reviewer can re-derive from the two
snapshots without trusting this note.

## 6. Problem and Plan — **not yet specified here** (the next review gate)

The charter is explicit: do not encode assumptions about these two into 004, and stop and bring the
schema back if the design is ambiguous. It is, in places — the contract describes them as UX entities, and
the fields it names are not all field names.

So §6 is deliberately empty in this revision, and the reviewer has set its acceptance criterion for me:
**separate the minimum durable schema from what can stay a claim or an annotation.** The Progress mockup is
a rendering of a design, not a table description, and the failure mode to avoid is turning every concept
visible in it into a column.

The test a proposed field has to pass before it earns a column:

| Question | If "no" |
|---|---|
| does the contract require it to survive a reload? | it is derived state — compute it in the view |
| can it be derived from rows that already exist, or from the state log? | do not store it; a second copy of a fact is a second thing to keep true |
| does anything *write* it — a human, or an action? | it is decoration; it belongs to the renderer, not the database |
| would losing it lose information that cannot be reconstructed from the log or the activities? | it is a cache, and caches do not go in migrations |

What is *decided* already, because the charter states it and it constrains the schema:

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

The field inventory that fills this section is being extracted from the contract package *with line
references*, so that every proposed column can be traced to a sentence in `contract/` — or be visible as an
invention, which is the point of writing it down.

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

### Reviewer's additions (second review, 2026-10-01)

| Requirement | Where it is answered |
|---|---|
| the bootstrap row keeps a non-null bookkeeping timestamp, separate from when the state was observed | §3.2 — `recorded_at` NOT NULL vs `observed_at` NULL |
| the bootstrap has an explicit uniqueness/idempotence guard, not merely "004 normally runs once" | §3.2 (partial unique index) + §4 (guarded insert) |
| ordinary transition insertion must also prevent accidental duplicate transitions | §3.3 — the transition writer, with a test that a repeat inserts nothing |
| verify the resulting **schema**, specifically that the three referring tables still declare their foreign keys | §5.1 item 2 |
| run `foreign_key_check` under a connection where FK enforcement is **enabled** | §5.1 item 3 |
| compare all old `development_axes` values by stable identity, not aggregate counts | §5.1 item 1 |
| bootstrap rows must not enter ordinary activity feeds as user/repository activity | §3.3 |
| keep the pre-004 snapshot, the post-004 fingerprint and the migration transcript as one evidence bundle | §5.4 |
| the crash *after* COMMIT / *before* the ledger row is an explicit rerun test | §5.2 |
| define "file restore" operationally — stopped writer, consistent snapshot, WAL | §5.3 |
| an `abandoned` fixture, so all seven reachable states have executable coverage before U1 closes | §3.2, plus the fixture work inside U1 |
