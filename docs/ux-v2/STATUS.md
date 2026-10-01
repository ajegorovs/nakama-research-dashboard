# Status — UX v2

**Live page.** Updated as each chunk lands; every number is a run's own summary line, and every claim
here should be checkable with `README.md` § "Run the acceptance pass".

Last updated at the end of **U1**; **U2** is under way, with its semantics pinned in `U2-store.md` before
any view reads them.

## Where things stand

| Chunk | State | Evidence |
|---|---|---|
| **U0** Contract, baseline, runnable pass | **done** | `contract/` published verbatim · `BASELINE.md` · the pass moved in-repo and reproduces from a *fresh clone* on a *pristine checkout* (measured below) · PR #1 merged, tagged `pre-ux-v2` · three harness defects found by that run and fixed |
| **U1** Migration 004 (`usable`, state log, Problems, Plans) | **done** | `migrations/004-ux-v2-model.sql` · design note + truth table in `U1-migration.md` (§3.2, §4, §1a, §1b) · `harness/test-004.mjs`: **79 checks, 0 failed**, including the crash-after-COMMIT re-run · applied to the dev instance by the host's own applier — new generation `g9e344…`, ledger 001–004 · both acceptance passes green afterwards, plus the `abandoned` fixture axis and a check that every state the payload carries renders as itself |
| **U2** Store writers + read models | **in progress — the writers are done** | `U2-store.md` (semantics, reviewer-approved) · writers and the problem/plan/state-history read models landed · `bun run check` **104 pass · 0 fail · 552 expect() calls** (was 82 · 0 · 472; +22 tests in `store-ux-v2.test.ts`) · **owed**: the one stale derivation, the visible-set helper, the Overview recency projection, both Progress projections, and the §11 audit of every projection |
| U3 Action surface + skill | not started | — |
| U4 Five tabs + canonical navigation | not started | — |
| U5 Overview | not started | — |
| U6 Topics | not started | — |
| U7 Progress | not started | — |
| U8 People + Repositories | not started | — |
| U9 Primitives + density | not started | — |
| U10 Fixtures A–J + new checks | not started | — |
| U11 Screenshots, docs, handoff | not started | — |

## U1 in one screen

**What 004 changes.** `development_axes.state` gains `usable` (the enum is the union of the implementation's
six states and the contract's six — seven, and no existing row is mapped onto the new one); `state_log`
becomes append-only history for axes *and* problems, seeded with one provenance row per existing axis
(`origin='migration'`, `from_state NULL`, `observed_at NULL`); `problems`, `plans`, `plan_steps`,
`problem_repositories`, `problem_people` are created, with plans optional and nothing backfilled;
`annotations` gains `problem_id` + `kind` + a nullable `confidence`, so interpretation and steering are
*claims* that can never be overwritten by later automation. The truth table is `U1-migration.md` §3.2 and
the schema is §6.

**What running it proved** (`U1-migration.md` §1a, each found by a test failing on the host's own engine,
bun:sqlite 3.53.2):

- `DROP TABLE` of a parent with foreign-key enforcement ON silently cascade-deletes every child row — so
  `PRAGMA foreign_keys = OFF` in the migration is load-bearing, not decorative.
- a plain `BEFORE DELETE … RAISE(ABORT)` on the log also fires for foreign-key cascades, which would have
  made `deleteAxis` throw for every axis — the trigger carries a `WHEN EXISTS (subject)` guard instead.
- `ALTER TABLE … RENAME TO` re-parses the schema, so the *second* execution failed until
  `PRAGMA legacy_alter_table = ON` was added — the re-runnability requirement caught this, and nothing else
  would have.

**How it was applied** (worth knowing, because it is not a boot action): the host runs plugin migrations
only during an install/enable/update cycle, and a pending migration makes it build a **new database
generation**, leaving the previous one in place untouched. For this checkout that cycle is
`bun harness/update-plugin.mjs --env-file … --data-root …`, which drives
`POST /v1/plugins/official/research-dashboard/reinstall`, after `./vendor/vendor-into-nakama.sh <checkout>`
(the instance reads the vendored copy, not this working tree).

## What the pass says right now

**Baseline (U0), measured from a clone of this repository on a pristine upstream checkout (0.4.35), against
instances the run started itself from empty data roots — one per dataset, never shared:**

| Dataset | Viewport | Result |
|---|---|---|
| corpus (695-call replay) | 1440×900 | 42 pass · 0 fail · 7 skip |
| corpus | 1280×800 | 42 · 0 · 7 |
| fixture (applied) | 1440×900 | 49 · 0 · 0 |
| fixture | 1280×800 | 49 · 0 · 0 |

`bun run check` unchanged: **82 pass · 0 fail · 472 expect()**.

**After 004, on the migrated dev instance** (generation `g9e344…`, plugin version `0.2.0+dev.d5b23ff08253`,
same estate instance the baseline numbers came from, dashboard `http://100.122.4.42:3003`):

| Dataset | Viewport | Result | Conditions |
|---|---|---|---|
| corpus | 1440×900 | 43 · 0 · 7 | migrated generation, corpus `695`-call replay re-applied after the fixture run |
| corpus | 1280×800 | 43 · 0 · 7 | same |
| fixture | 1440×900 | 50 · 0 · 0 | **fixture-only instance** (plugin rows wiped first) |
| fixture | 1280×800 | 50 · 0 · 0 | same |

Both counts are one higher than the baseline because U1 added one check — *"every axis state the payload
carries reaches the page as that state"* — which asserts exactly what the new `abandoned` axis exists to
make assertable: on the fixture it reports `states [blocked, active, draft, parked, completed, abandoned]`
and nothing unrendered; on the corpus, `states [active, completed]`. It is the difference between the
seventh state being *on screen* and being *covered*.

Data after migrating, before any wipe: 1 topic, 3 axes (2 `active`, 1 `completed`), 694 activities, 7
annotations — byte-identical to the pre-004 fingerprint — plus 3 bootstrap rows in `state_log`. Ledger:
`001`, `002`, `003`, `004`.

One measurement that did **not** match, and what it means: with the fixture applied *on top of* the corpus
data (3 topics, 9 axes), the fixture pass is 48 · 1 · 0. The failing check is
`verify-page.mjs:1088` — it requires the filtered view to name exactly one topic, hard-coded to
`CORPUS.topic`, which in fixture mode is the fixture's topic; with the corpus topic still present, the
filtered view names that instead. It is a harness assumption, not a plugin or migration regression:
fixture-only, the same checks are 50 · 0 · 0. Recorded rather than smoothed over, because a reader
comparing the two tables would otherwise wonder which number to trust.

## Open

- **Nothing writes `state_log` yet.** That lands in U2/U3 with the transition writer. Consequence today:
  after a wipe and re-seed, the log is empty and newly created axes have no history — the bootstrap is a
  migration-time event, and a wipe takes its rows with the axes it described. The bootstrap itself is proven
  by `harness/test-004.mjs`, not by inspecting the running instance.
- **`usable` is reachable in the database but not writable through the action surface.**
  `nakama.plugin.json`'s `axes[].state` enum still lists the six original states; U3 has to add `usable`
  there, and to the skill, for the state to be first-class end to end.
- **The fixture pass needs a single-dataset instance** (see the 48 · 1 · 0 note). Either the check becomes
  dataset-aware or the recipe documents "wipe before applying the fixture"; U10 owns fixtures, so it is
  parked there with this evidence.
- **D3 is a deliberate relaxation**, still to be delivered with U3: the corpus gains one owner-authored
  problem statement, and `docs/corpus/README.md` must say so — a reader who knows the corpus's "nobody chose
  its state" claim should see exactly where it stops being true. (004 creates no problems: the table is
  empty, which is why the corpus's numbers are unchanged.)
- **The plugin is confirmed on upstream 0.4.35** — newer than this estate's deployment (0.4.31).
- **`abandoned` now has page-level coverage.** It is in the layout fixture (the crowded card), and the
  passes above assert it reaches the page as its own state — which is what the fixture axis exists for. The
  remaining A–J fixtures are U10's.
- **The retention boundary is a documented product rule, not fixed behaviour** (`U1-migration.md` §1b):
  completing, parking and abandoning are the ordinary ways a line of work stops; **deleting an axis or a
  problem is destructive cleanup**, and it takes that entity's history with it. Making history survive
  deletion is its own schema decision — tombstoning, or detached historical subjects — deliberately not
  smuggled into 004. U3's skill update must state the rule in the librarian's own words.
- **An observed ordering, recorded for U7:** with the fixture's six states on one card, the detail renders
  `blocked · abandoned · active · completed · parked · draft` — `abandoned` second, not last. The contract
  states no axis order (its only ordering rule is "Problem before Activity before secondary support
  material" inside a Problem, `contract/interaction-spec.md:261`), so nothing is violated today; ordering
  becomes a requirement when Progress is built, and the fixture is now where to pin it.
- **A harness defect is recorded rather than fixed:** `verify-page.mjs:1088` requires the filtered view to
  name exactly one topic and hard-codes the corpus's topic, so the fixture pass reports **48 · 1 · 0** when
  run on an instance that also holds the corpus. The frozen protocol isolates the datasets, so it is not a
  migration failure — it is a page check that should assert the *selected* topic rather than assume there is
  exactly one. U10's, with this evidence.

## What a reviewer can usefully do at this point

- Re-run `bun harness/test-004.mjs --db <your pre-004 database>` and check the checks themselves: the
  interesting ones are the invalid combinations (axis row with a problem state, both ids NULL, both set, a
  duplicate bootstrap) and the re-run. If a check is asserting something weaker than it claims, that is the
  finding worth reporting.
- Read `U1-migration.md` §6 against the contract one more time for columns that should have stayed claims —
  the test for a column is written down there, and it is the cheapest place to catch one.
- Run the acceptance pass from a clone (README § "Run the acceptance pass") and say where the recipe had to
  be guessed; U0's version of that exercise found four defects, and 004 added two operations to the recipe
  (vendor, then reinstall).
