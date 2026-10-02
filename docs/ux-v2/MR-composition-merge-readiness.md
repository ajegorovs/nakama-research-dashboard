# Composition-phase merge readiness — `composition/c1-topics` → `main` (2026-10-02)

**Branch:** `composition/c1-topics` · **Default branch:** `main` · **Build under test:** revision 511 (corpus) /
`0.2.0+dev.a4431120a2da`, served asset sha256
`82e64e29fbca3069c7b30cbdef0ea4a0c67031cbcb18dff0c34abd44e36d9523`.

**Status: every item of the charter executed. Nothing in this phase changes product code.** It answers one
question — *does the evidence validate this branch as one integrated change against `main`, not merely unit by
unit?* — and it is the phase the reviewer requested after C5 closed the composition sequence
(`docs/reviews/2026-10-02-c5-acceptance-record.md`).

**No merge has been performed.** `main` is untouched; the merge is the next action and it is not this phase's
to take.

## Charter (reviewer, 2026-10-02, verbatim)

> I would now start a **composition-phase merge-readiness pass**, rather than another visual unit. Because
> `composition/c1-topics` is 35 commits ahead of `main`, I want the final evidence to validate the branch as one
> integrated change, not merely rely on the per-unit records.
>
> Use the final C5 code build and verify:
>
> - clean branch and exact ahead/behind state against `main`;
> - frozen `docs/ux-v2/contract/` remains byte-unchanged;
> - `bun run check`, `typecheck:host`, identity tests, doc hygiene;
> - corpus and fixture read acceptance at 1440×900 and 1280×800;
> - **one final write pass on the final build** — fixture is sufficient as the canonical write-path run if
>   corpus locking makes the corpus run unreliable; label which dataset supplied it;
> - reseed after the write so both instances end clean;
> - served asset digest matches the repo build on both instances;
> - final montages/captures are on that same asset;
> - clean-clone install/vendor/reinstall smoke path;
> - diff/estate inspection for generated junk, credentials, machine-specific paths, stale docs, and accidental
>   changes outside the phase;
> - explicit check that H1 remains intentionally parked rather than accidentally omitted.
>
> The SQLite `SQLITE_BUSY_RECOVERY` issue remains a genuine runtime/infrastructure debt. Do not hide it with
> sleeps during merge readiness. If it occurs, record the lost run separately and take acceptance from a clean
> run/fixture where appropriate.

> One minor housekeeping point: since `f73e430` is documentation-only over the C5 implementation and the release
> digest is unchanged, there is no need to manufacture a new plugin build simply to make the commit SHA equal
> the evidence commit. Just state precisely that the tested bundle corresponds to the C5 implementation tree and
> that the later commit changes documentation only.

## 1. Branch state

| Check | Result |
|---|---|
| working tree | **clean** at the end of this phase (the phase's own records are committed with it) |
| ahead / behind `main` | `git rev-list --left-right --count origin/main...HEAD` → **0 behind / 35 ahead** |
| branch HEAD | `f73e430` (== `origin/composition/c1-topics`) |
| `main` HEAD | `e09c1d6` |
| composition commits | 35; implementation commit `c1b2059`, and `f73e430` on top is **documentation-only** |

**The tested bundle and the commit, stated precisely** (the reviewer's housekeeping point): the release digest
is computed over the manifest's folders (`actions`, `migrations`, `ui`, `skills`), so the bundle under test is
the C5 **implementation tree**; both commits after the implementation are documentation-only and do not change
those bytes. No build was manufactured to make a SHA equal an evidence SHA — the correspondence claimed here is
**tree → digest**, not SHA → SHA.

## 2. Frozen contract

`git diff --name-only origin/main HEAD -- docs/ux-v2/contract/` → **0 files**. The contract directory is
**byte-unchanged** across the whole composition phase (diffed against `main` itself, not merely against the
merge base).

## 3. Gates

| Gate | Result |
|---|---|
| `bun run check` | **126 pass / 0 fail**, 764 `expect()` calls, 4 files |
| `bun run typecheck:host` | **0 diagnostics** against the real host types (155 diagnostics inside the checkout's own sources are reported and not counted — the host compiles those with its own config) |
| `bun run harness:identity` | **82 / 82** |
| committed bundle == source | after `bun run check` (which builds) the worktree shows **no** modification to `ui/app.js` or `actions/actions.js` — the committed build output is exactly what the sources produce; independently re-verified in the clean clone (§9) |
| doc hygiene (estate) | `python3 scripts/doc-hygiene-check.py` → **137 files, 0 violations** |
| doc hygiene (this repo) | every changed file scanned for `/home/<user>/`, hostnames, account emails and tailnet names → **no hit**; the only identifier class present is the tailnet IP inside record headers, which the estate's *Endpoint addressing & IP storage* item governs and which is deliberately not hand-fixed |

## 4. The diff, inspected

`git diff --stat origin/main..HEAD` = **178 files, +11799 −3029**.

| Top dir | Files | Notes |
|---|---|---|
| `docs/ux-v2/` | 78 | unit docs, the contract (unchanged), fidelity captures' HTML, this phase's doc |
| `docs/layout-fixtures/` | 42 | fixture records (incl. two `.revision-410` pre-baseline records) and fixture screenshots |
| `docs/screenshots/` | 35 | review-UI captures |
| `docs/corpus/` | 7 | corpus records, incl. the two `.revision-442` pre-baseline records |
| `harness/` | 10 | `verify-page.mjs`, `read-pass.sh`, `refresh.sh`, `served-build-guard.mjs`, `dataset-identity.mjs` + its test, the installers, `fidelity/` (4) |
| `src/` | **1** | **`ui.tsx`** — the entire composition phase is UI-layer: no store, no action, no migration, no skill change |
| build/config | 3 | `ui/app.js` (committed bundle), `package.json`, `README.md` |

- **No unrelated files:** no `.env*`, no `node_modules`, no logs, no `.DS_Store`, no absolute home paths.
- **No credentials, no machine-specific paths** in any added line:
  `git diff origin/main..HEAD | grep -cE '(BEGIN … PRIVATE KEY|ghp_…|sk-…|/home/[a-z]+/|/Users/[a-z]+/|node_modules/|\.DS_Store)'`
  → **0**.
- **Generated classes are accounted for, not junk:** `docs/corpus/transcript/actions.jsonl` (the replayed call
  transcript) and the `.revision-442` / `.revision-410` records are named in `docs/ux-v2/BASELINE.md`,
  `docs/reviews/2026-10-02-c1-acceptance-record.md` and `C2-people.md`; the screenshots and montages are the
  visual-gate evidence the units' records point at.
- **Nothing outside the phase:** no `actions/`, no `migrations/`, no `skills/`, no `types/` change at all.

## 5. Read acceptance, both datasets, both viewports

Every record below carries the served revision in its header and was taken behind the served-build guard, on the
asset named at the top of this document:

| dataset | viewport | record | result |
|---|---|---|---|
| fixture | 1440×900 | `docs/layout-fixtures/verify-fixture-read-1440x900.txt` | 180 pass / 0 fail / 1 skip |
| fixture | 1280×800 | `docs/layout-fixtures/verify-fixture-read-1280x800.txt` | 179 pass / 0 fail / 2 skip |
| corpus | 1440×900 | `docs/corpus/verify-read.txt` | 151 pass / 0 fail / 28 skip |
| corpus | 1280×800 | `docs/corpus/verify-read-1280x800.txt` | 150 pass / 0 fail / 29 skip |

Every skip is a dataset with no subject for that check, each carrying its reason. The corpus records were not
re-taken in this phase because the corpus instance was never written to in it (the write pass ran on the fixture,
§6) and its dataset is byte-for-byte the one those records were taken against.

## 6. The final write pass, on the final build

**Dataset: fixture — the canonical write-path run for this phase** (the reviewer allowed this where corpus
locking makes the corpus run unreliable; the corpus lock debt is live, §8). Record:
`docs/layout-fixtures/verify-fixture-write.txt`.

| Check | Result |
|---|---|
| verdict | **write pass: all checks passed; 1 skipped for want of a subject in this corpus** |
| checks | **192 pass / 0 fail / 1 skip** (193) |

## 7. Reseed after the write, both instances clean

The write pass leaves its own `ui-check <n>` subject on the instance — and the identity gate proved it does, by
refusing to let the next fixture run measure it:

> `identity: expected fixture · 3 topic(s) (2 fixture-named, 1 write residue) · 3 of 3 repository(ies) under fixture/ · observed the fixture plus acceptance-write residue (ui-check 64598)`
> `REFUSED  the write pass's own subject is still on the instance — wipe its rows and re-apply the dataset you mean to measure …`

Reseed, using the hardened wipe (explicit target only) and the fixture seeder:

| Step | Result |
|---|---|
| wipe, dry run | target `--data-root /mnt/otrais/data/nakama-fixture --org org_706c…`; active generation `g4ccd1f76…`; would zero 3 topics / 3 repositories / 8 axes / 9 activities / … |
| wipe, applied | `foreign_key_check: clean`, `integrity_check: ok`, **all 16 plugin tables at 0 rows** |
| re-apply the fixture seed | `now: 2 topics, 7 axes, 2 people, 3 repositories, 1 blocked` — the documented fixture shape |
| post-reseed read, fixture 1440×900 | **`identity: expected fixture · 2 topic(s) (2 fixture-named, 0 write residue) · observed fixture markers only`**; **180 pass / 0 fail / 1 skip** — identical to the acceptance record |

Record: `docs/layout-fixtures/verify-fixture-read-post-write-1440x900.txt` (23:09:06). The cited acceptance
records above are deliberately **not** overwritten by this verification run.

## 8. Served digest on both instances, and the montages

| Instance | Served | Digest |
|---|---|---|
| corpus (review UI, tailnet `:3003`) | revision **511**, `0.2.0+dev.a4431120a2da` | `82e64e29…` |
| fixture (`127.0.0.1:3005`) | revision **112**, `0.2.0+dev.a4431120a2da` | `82e64e29…` |

Both serve the repo build, byte-identical to each other and to the committed bundle (§9). The fixture's revision
moved 107 → 112 without any byte change: the smoke's install path (§9) re-stamps the release, and the tool says
so itself — *"the version did not change — the vendored bytes are identical to the release already installed"*.
The C5 records quote revision 107 because that was the release at the time they were taken; the asset is the
same one.

Montages and captures are on this asset: the capture tool prints the asset it fetched and its sha256, and the
three regenerated sets (fixture first-screen, fixture-tall, review UI) all record `82e64e29…` — the same digest
the guards report.

**The SQLite lock, recorded not masked.** The C5 unit's first corpus 1440×900 attempt was lost to
`500 SQLiteError: database is locked` (`SQLITE_BUSY_RECOVERY`, requestId `aa21cc5e`). It stays recorded in the C5
acceptance record and in the estate's `AGENDA.md`. This phase added **no** sleep, settle delay, or retry that
would hide it: the harness change it produced makes a lost read **fail a check** instead of aborting a run.

## 9. Clean-clone install / vendor / reinstall smoke

Cloned from the **public GitHub remote** (the reviewer's own path), not from the local working tree:

| Step | Result |
|---|---|
| `git clone --branch composition/c1-topics https://github.com/ajegorovs/nakama-research-dashboard.git` | HEAD **`f73e430`**, branch `composition/c1-topics`, **0 dirty files** |
| `bun install --frozen-lockfile` | 10 packages |
| `bun run check` in the clone | **126 pass / 0 fail**, and afterwards the clone is still **0 dirty files** — the committed bundle is exactly what a fresh checkout builds |
| digest folders, clone vs vendored checkout | `actions` **0**, `migrations` **0**, `ui` **0**, `skills` **0** differing; manifest identical — `ui/app.js` = `82e64e29…`, `actions/actions.js` = `4e5a8be3…`, `nakama.plugin.json` = `f3e48311…` |
| `vendor/vendor-into-nakama.sh <checkout>` from the clone | vendored; the vendored tree copies `docs/` too, so its whole-tree hash moves with the phase's records — the **digest folders** are the build identity and they are byte-identical (row above) |
| `bun harness/reinstall-plugin.mjs --env-file .env.fixture` (from the clone) | `0.2.0+dev.a4431120a2da -> 0.2.0+dev.a4431120a2da (revision 112, lifecycleState enabled)`, with the tool's own note that the bytes are identical |
| served-build guard, fixture, after the install | OK — revision 112, digest `82e64e29…` (unchanged) |

## 10. H1 remains intentionally parked

`origin/h1-keyboard-focus` = `c6852df`, **1 commit ahead of `main`**, and
`git merge-base --is-ancestor origin/h1-keyboard-focus HEAD` **fails** — it is not part of this branch. The
parking reason (focus visibility is to be validated against the *final* composition) is stated in
`docs/ux-v2/fidelity/REVIEW-PACKET.md` §6 and in the H1 commit message. Parked, not omitted.

## 11. What remains

1. **The reviewer's verdict on this phase** — the evidence above is the deliverable.
2. **The merge itself** (`main` ← `composition/c1-topics`, 35 commits, fast-forwardable in the sense that
   `main` is 0 ahead): not performed, and not this phase's to take.
3. H1's focus-visibility validation, after the merge, against the merged composition.
4. The estate's own reconciliation of the same facts (`services/nakama/HANDOFF-UX-V2.md`,
   `PLAN-UX-V2.md`, `REPOS.md`) — the estate has no remote by design, so those edits are local-only.
