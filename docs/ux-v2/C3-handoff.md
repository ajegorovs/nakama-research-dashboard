# C3 handoff — C3 accepted 2026-10-02; state at the close of the unit

For whoever picks up next (agent or reviewer). Everything below was verified on this build, not carried over
from an earlier session's notes.

## Where C3 stands

**Accepted.** The reviewer closed functional acceptance, geometry/interaction acceptance and visual fidelity on
the pushed fixture landing montage: **C3: accepted**, and **C5 is unblocked** (not started). The verdict, the
eight rulings, the two later rulings and the full record are in `docs/ux-v2/C3-overview.md`.

**Build under test: revision 91 / `0.2.0+dev.4dfdb691c706`**, one asset, sha256
`58f01bf1b56c2bf78c78be9096c3462f83be501a7a3923f80bf9915e7c46c554`. Both instances serve those exact bytes —
re-verified at the close of this session by hashing the asset each one actually returns (the fixture reports
revision 91, the corpus revision 495; one asset, two instance counters).

| Record | Result | Checks |
|---|---|---|
| fixture · 1440x900 | `all checks passed; 1 skipped` | 165 |
| fixture · 1280x800 | `all checks passed; 2 skipped` | 165 |
| fixture · `--write` | `all checks passed; 1 skipped` | 177 |
| corpus · 1440x900 | `all checks passed; 26 skipped` | 163 |
| corpus · 1280x800 | `all checks passed; 27 skipped` | 163 |
| corpus · `--write` | `all checks passed; 26 skipped` | 175 |
| `bun run check` | `126 pass, 0 fail` | — |

The corpus write record is the canonical write item (`docs/corpus/verify-write.txt`, generated 21:12:17 on this
asset); the fixture write record corroborates it on the other dataset, same asset. The earlier corpus write runs
aborted on a harness-navigation defect, not on the page — the write section's rail-row click had no index to find
once a reload lands on the landing — and `3f60da9` carries the correction. **A commit message from that session
says the corpus write item is open; the record committed beside it is green.** Git history is not rewritten to
fix prose, so the correction lives here and in `C3-overview.md`.

## What the closure changed

1. **`harness/dataset-identity.mjs` (new) + `harness/test-dataset-identity.mjs` (new).** The identity rule used
   to be inline in a 5,900-line browser script, so the behaviour that protects every record could only be
   exercised by mutating an instance. It now distinguishes **three** things — corpus, fixture, and the
   acceptance-write residue a `--write` pass leaves (`ui-check <n>`) — and the pass refuses with a truthful
   diagnosis plus a re-seed hint. Residue refuses in either direction; an **empty** store refuses too. Asserted
   by `bun run harness:identity` (82 checks) and exercised end to end by injecting residue through
   `reconcile_topic` on the fixture (fixture run → exit 3, `REFUSED`, committed record untouched).
2. **`wipe-plugin-rows.py` requires an explicit target.** `--data-root` and `--org` have no defaults. The
   instance-targeting mistake it was built to survive had already happened: with the *fixture* env sourced it
   emptied the **corpus** data root, and the fixture re-seed that followed restored only the fixture.
3. **The corpus was replayed.** It had been left empty by that wipe and was restored this session through
   `harness/replay-corpus.mjs` (695/695 calls accepted, 70.5 s) and asserted at the documented baseline.

## Current instance state (verified, not assumed)

- **Corpus** `127.0.0.1:4399` / Vite `:3003`: `1 topic / 3 axes / 1 person / 1 repository / 694 activities`
  (`UDV Echo Process`), replayed this session. A clean corpus read pass on this state: `all checks passed;
  26 skipped`, identity `observed corpus markers …`.
- **Fixture** `127.0.0.1:4400` / Vite `:3005`: `2 topics / 7 axes / 2 people / 3 repositories / 9 activities`,
  re-seeded after the residue injection. A clean fixture read pass: `all checks passed; 1 skipped`, identity
  `observed fixture markers only`.
- Both verification reads ran with `--transcript`/`--shots` pointed at scratch, so **no committed record was
  touched**: `git status` on `docs/` is clean.

## Traps that cost time, so they do not cost it again

- **The shell opens on the landing now (C3), not on Topics.** Every check and every capture must navigate
  explicitly. Two harness paths had the old assumption (the read pass graded Topics by inheritance; the write
  section reloads and then clicked a rail row) — both fixed, and the fix is what the aborted corpus write runs
  were waiting for.
- **A block that moves shared state must restore the value it read.** The interaction block moves the window,
  the view and the selection. A hard-coded restore of `14` against the pass's `30` had every later check reading
  the topic through a narrower window and presented as a content fault; and it must not re-click the row that is
  already pressed, which does not hold the selection here and leaves an empty pane that aborts the next check on
  a 30 s locator timeout.
- **Never kill a harness chain that ends in wipe → replay.** A stop in that tail leaves the instance empty or
  half-seeded, which reads as a dataset of missing subjects and skips checks that would have run. Restore by
  wipe → replay → assert (`corpus 1 topic / 3 axes / 1 person / 1 repository / 694 activities`). **To see which
  store an instance is actually serving, read `org_plugins.database_generation`** in
  `<data-root>/data/sqlite/nakama.sqlite` and match it to the `g*.sqlite` under `orgs/<org>/plugins/<plugin>/db/`
  — a data root holds several generations, and the active one is not the one with the rows just because an older
  file has them. That is how the empty corpus was found this session: the documented baseline sat in an older
  generation file while the active one held nothing, so the instance looked healthy and was empty.
- **`wipe-plugin-rows.py` now has no default target.** Always pass `--data-root` and `--org` — corpus
  `…/nakama-dev` + `org_1c8fcc96…`, fixture `…/nakama-fixture` + `org_706c5500…`. It prints the target it
  resolved, and the dry run lists every count it would zero.
- **The served-build guard wants the Vite origin, not the API origin.** Pointed at `:4399`/`:4400` it reports
  *"the page never fetched a plugin UI asset — is the plugin enabled?"*, which reads like a disabled plugin or a
  digest mismatch. The corpus target is `http://$(tailscale ip -4 | head -1):3003`; the fixture's is
  `http://127.0.0.1:3005` (its Vite is loopback-only). Credentials come from each instance's own env file —
  `compose/nakama/.env`, `compose/nakama/.env.fixture` — and are never printed.
- **A dataset identity is not "everything that is not the fixture".** Three kinds, one gate, and the write
  pass's own `ui-check <n>` subject is residue rather than a corpus marker — see `harness/dataset-identity.mjs`.
  A name that merely starts with `ui-check` (say "ui-check policy review") is corpus data; the test pins that
  boundary.
- **`.env` vs `tailscale ip -4`.** The corpus dashboard is reached at `http://$(tailscale ip -4 | head -1):3003`
  in the pass commands; the `.env` value does not answer for a capture from this host.

## Files worth opening first

- `docs/ux-v2/C3-overview.md` — charter, gaps, the eight rulings, the two later rulings, the records table, the
  acceptance verdicts and the write-record evidence.
- `harness/dataset-identity.mjs` + `harness/test-dataset-identity.mjs` — the identity rule and its cases.
- `harness/verify-page.mjs` — the acceptance pass; the C3 block, the interaction block and the two navigation
  fixes are all commented with why.
- `harness/fidelity/capture-current.mjs` / `montage.mjs` — the landing capture (mount gate waits on the landing;
  refuses if a view container is already on screen) and the overview montage pair the visual gate read.
- `docs/corpus/verify-write.txt`, `docs/layout-fixtures/verify-fixture-write.txt` — the write records.
