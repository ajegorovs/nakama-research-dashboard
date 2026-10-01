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
| **U2** Store writers + read models | **the store layer is complete; not yet wired to anything** | `U2-store.md` (semantics, reviewer-approved) · writers, both Progress projections, the Overview recency projection, one scope builder, one recency/stale derivation and the §11 audit all landed · `bun run check` **111 pass · 0 fail · 596 expect() calls** (was 82 · 0 · 472) · 19 acceptance items covered by named tests · **owed by U3**: nothing here is reachable from an action or a page, and `usable` is still absent from `nakama.plugin.json`'s `axes[].state` enum → **the action half is delivered in U3** (`transitions[]`/`problems[]`/`plans[]`, `usable` in the enum); the page half is U4+ |
| **U4** Progress-first vertical slice | **in progress — the data boundary is done; the render is next** | `U4-progress.md`. Finding: `progressAxes`/`progressProblems`/`overviewRecency` existed in the store and **no action exposed them**, so the slice's first half was a read action. `get_progress` returns both Progress projections from one window (read-only, `exposeAsTool: false` — still five tools; host schema validation accepted it on reinstall). Traceability: the payload is deep-equal to the store's own projections, and the field set is pinned (3 · 3 · 16 · 4 · 19 keys + no V1 `scope/approach/progress/nextStep`) so a display-only field must be declared in the test before a component can rely on it. `bun run check` = **0 typecheck · 121 pass · 0 fail · 705 expect()**. Live (`dev.e39055d638ba`, revision 289, generation unchanged): both halves on one window, and the live JSON key set is **byte-for-byte the pinned inventory** — the page can rely on every key. Gap the live read exposed: the dataset has **0 problem rows**, so the Problems subview has nothing to render against → **fixture E is now seeded** (`harness/apply-layout-fixture.mjs`, contract `fixtures.md` §E: one open Problem on two repositories, a person link, an activity, an evidence record, a human-authored steering note, a plan step it sits on, and a second Problem with `planStep = null`), idempotent on re-apply, and **measured to leave the frozen baseline untouched**: fixture pass still **50/0/0** with it present, instance still 2 topics / 7 axes / 2 people / 2 repositories. Seeding it found and fixed a real defect: a claim with two targets (or none) answered **HTTP 500 with no `kind`** instead of a refusal — the JS target check lived only in `addAnnotation`, while the reconcile loop calls `insertAnnotation` directly and died on migration 004's CHECK constraint, a raw `SQLiteError` that escaped `run()`. The check now sits in the single insert path (no caller can skip it), `StoreErrorCode` gained `invalid-input`, and tests pin two-target/none/one-target. `bun run check` = **0 typecheck · 124 pass · 0 fail · 715 expect()** |
| **U3** Action surface + skill | **done — steps 1–10** | Steps 1–8: real typechecking (0 diagnostics, both modes), `usable` in the exposed enum, `transitions[]`/`problems[]`/`plans[]` on `reconcile_topic`, a machine-readable `kind` on every refusal, `get_topic` carrying problems/plan/state history, and the skill stating the new semantics + the retention rule. `bun run check` = **0 typecheck · 117 pass · 0 fail · 654 expect()**. Live: release re-minted (`dev.cc3e078d2bb6`, generation unchanged — U3 adds no migration), the **Axis and Problem** lifecycles proven through the host's action route, corpus **43/0/7** and fixture **50/0/0 at both viewports** on an isolated fixture-only instance. See `U3-surface.md` |
| U5 Overview | not started | — |
| U6 Topics | not started | — |
| U7 Progress | **pulled forward into U4's first vertical slice** (reviewer's reorder: Progress is the only view whose contract depends on the new semantics) | — |
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

`bun run check` unchanged: **82 pass · 0 fail · 472 expect()** — the U1-era figure. U2's store work takes it
to **111 · 0 · 596** (see the U2 row above); the 82 is kept here because it is what that run measured.

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
- **Nothing in this repo typechecked — found in U2, closed as U3's first commit** (`U2-store.md` §7).
  `bun run check` used to be `bun build` + `bun test`: types were stripped, never verified, and the repo had
  no `typescript` dependency and no `tsconfig.json`. It hid a real bug in U2 — a projection dated every axis
  from a property `AxisScan` does not have, so `undefined` became `null` and no axis was ever stale, with
  nothing failing. Now: `typescript` + `@types/bun` + `@types/react`, a committed `tsconfig.json`
  (`strict`, `src/` + `types/`), `types/host.d.ts` for the unpublished host surface, `bun run typecheck`, and
  `bun run typecheck:host` — the same compiler options against the real host types, which is authoritative.
  **0 diagnostics** over 6 files / ~11,900 lines, both modes agreeing; nothing legacy was suppressed or
  excluded. Measured along the way: 427 → 18 → 3 → 0, where the only three that were ever *code* were in a U2
  test file, fixed by making the tests assert what they meant.

  **The baseline moved on purpose, and the counts are not comparable across it.** Before U3's first commit,
  `bun run check` green meant *bundles + tests pass*. It now means **typechecks + bundles + tests pass**. The
  counts are only comparable *after* that commit: 111 · 0 · 596 (U2-era, two-part command) → 117 · 0 · 654
  (U3, three-part command) → 121 · 0 · 705 (U4's Progress data boundary) → **124 · 0 · 715** (U4, after
  Fixture E exposed a claim-targeting refusal that escaped as a server error). Anyone re-running an older
  number against this tree is running a different check.

  U3 also **reran the acceptance passes** (its step 10), so the closing statement above is re-verified:
  corpus **43 · 0 · 7**, fixture **50 · 0 · 0** at both viewports — the fixture run on an **isolated
  fixture-only instance**, which is what the two-dataset rule in the README requires. One earlier fixture run
  on a mixed instance returned 49 · 1 · 0 for the repository-filter check; the cause was the harness deriving
  its baseline from whatever dataset the instance held (`verify-page.mjs:1104`), not a regression, and the
  same check passes with fixture values when the fixture has an instance to itself. The harness coupling is
  still filed for U10 (mixed-instance robustness) but it does **not** block the frozen baseline.

  **Reviewer rulings on step 1** (approved): `harness/*.mjs` stays **outside** the strict program — out of
  scope by decision, recorded as a future hardening item naming the four scripts that decide acceptance
  evidence (replay, install, page verification, migration proof), and *not* `checkJs` in this step, because
  it would broaden the baseline again immediately after stabilizing it. `types/host.d.ts` is a **compatibility
  shim, not the authoritative host API**: `typecheck:host` is the authority, and a disagreement is fixed in the
  shim, never by bending plugin code to a stale local declaration. Any commit touching that file must run
  `typecheck:host` first and name the host revision it checked against. `@types/react@18` stays pinned, with
  the reason (classic JSX runtime + the global `JSX` namespace the host injects) recorded next to the
  dependency policy in the README so nobody upgrades it casually.

  **One unreproduced test flake, recorded rather than smoothed.** A single `bun run check` during U3's step 10
  reported 117 pass / 1 fail; the failing name was not captured (only the tail was). It did not reproduce:
  `bun test src` and `bun run check` were then green twice, and the 50-test concurrency-heavy file that holds
  the timing-sensitive cases (two-writer lock waits, `SQLITE_BUSY` behaviour) passed three times
  consecutively. The observed run was competing with an isolated Nakama server, a vite dev server and two
  Chromium sessions on the same machine, so contention is the likeliest cause. Left as an open observation,
  not a claim that the suite is stable: if it recurs, capture the check name before assuming the same cause.

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
