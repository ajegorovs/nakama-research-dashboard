# C3 handoff — session state at 2026-10-02, ~21:30 EEST

For whoever picks up next (agent or reviewer). Everything below was verified on this build, not carried over
from an earlier session's notes.

## Where C3 stands

**Built, committed, pushed.** Branch `composition/c1-topics`, commit `3f60da9`
(`75fb1d3..3f60da9`) on `origin`; estate docs committed locally as `746e3f4` (the estate repo has no remote).

**Build under test: revision 91 / `0.2.0+dev.4dfdb691c706`**, one asset, sha256
`58f01bf1b56c2bf78c78be9096c3462f83be501a7a3923f80bf9915e7c46c554`, served by both instances (the corpus
reports revision 495 serving the *same* bytes). The served-build guard runs before every pass.

| Record | Result | Checks |
|---|---|---|
| fixture · 1440x900 | `all checks passed; 1 skipped` | 165 |
| fixture · 1280x800 | `all checks passed; 2 skipped` | 165 |
| corpus · 1440x900 | `all checks passed; 26 skipped` | 163 |
| corpus · 1280x800 | `all checks passed; 27 skipped` | 163 |
| fixture · `--write` | `all checks passed; 1 skipped` | 177 |
| corpus · `--write` | **open — instance-level, see below** | — |
| `bun run check` | `126 pass, 0 fail` | — |

Charter, field mapping, the three payload gaps, the reviewer's eight rulings and the full record:
`docs/ux-v2/C3-overview.md`. The reviewer's rulings were implemented as given; ruling 8 (stale target) turned
out to need no new behaviour — the existing `seq` sequencing already lands on the entity asked for last, and a
check now pins it (it skips on the single-topic corpus with its reason).

## What is open

1. **The corpus `--write` record.** The write itself returns 200 (store afterwards: `topics=2,
   development_axes=4`); the reads that follow it lose the SQLite lock, and the detail stays on
   `Loading this topic` with no banner. Instance log in that window: `SQLiteError: database is locked` →
   `POST 500` at 21:12:14 (`requestId bb37106e-…`, 73ms) and 21:13:04 (`requestId 50b5fff9-…`, 61ms). The
   fixture write pass completes on the same host despite logging the same `SQLITE_BUSY_RECOVERY` →
   `POST 500` at 21:20:03, so this is about the corpus's read volume against unserialised action subprocesses.
   **Awaiting the reviewer's ruling**: accept the fixture write record as the gate's write item, or ask for
   something else. Do not waive it by re-running until green.
2. **The visual gate.** Subject: `docs/ux-v2/fidelity/fixture-tall/side-by-side/overview.png` (tall viewport,
   whole composition) and `docs/ux-v2/fidelity/fixture/side-by-side/overview.png`. Captured against this build.
3. **A ruling on dataset identity vs. the write pass.** The write pass creates a topic named `ui-check <n>`,
   which does not match the fixture's naming; the identity gate reads identity from naming, so one fixture write
   run makes that instance report *BOTH fixture and corpus markers* and refuses every later fixture run at check
   2. The fixture record above was taken once and the instance had to be re-seeded afterwards.
4. **C5 (Repositories convergence) has not been started.**

## Traps that cost time in this session, so they do not cost it again

- **The shell opens on the landing now (C3), not on Topics.** Every check and every capture must navigate
  explicitly. Two harness paths had the old assumption: the read pass graded Topics by inheritance, and the
  write section reloads with `page.goto` and then clicked a rail row. Both fixed. A harness that grades a
  screen it did not ask for is not trustworthy for the next unit either.
- **A block that moves shared state must restore the value it read.** The C3 interaction block moves the window,
  the view and the selection. A hard-coded restore of `14` against the pass's `30` had every later check reading
  the topic through a narrower window — the frames still rendered, so it presented as a content fault. It also
  must not re-click the row that is already pressed: that re-click does not hold the selection here, and the
  empty pane aborted the next check on a 30s timeout.
- **Never kill a harness chain that ends in wipe → replay.** A stop in that tail leaves the corpus empty or
  half-seeded (once 134 activities of 694), which reads as a corpus of missing subjects and skips checks that
  would have run. If a kill does land there: wipe, replay, then assert the counts against the documented
  baseline — corpus 1 topic / 3 axes / 1 person / 1 repository / 694 activities.
- **`wipe-plugin-rows.py` defaults to `/mnt/otrais/data/nakama-dev`.** With the *fixture* env sourced it still
  wipes the dev root. Pass `--data-root /mnt/otrais/data/nakama-fixture --org
  org_706c5500c03644d29e0a6e22b8865066` explicitly.
- **`.env` vs `tailscale ip -4`.** The corpus dashboard is reached at `http://$(tailscale ip -4 | head -1):3003`
  in the pass commands; the `.env` value does not answer for the capture from this host.

## Current instance state

Corpus: 1 topic / 3 axes / 1 person / 1 repository / 694 activities (documented baseline). Fixture: 2 topics /
7 axes / 2 people / 3 repositories / 9 activities (the documented fixture), re-seeded and green at 1440 after
the identity condition above was cleared.

## Files worth opening first

- `docs/ux-v2/C3-overview.md` — charter, gaps, rulings, records, the evidence for everything above.
- `harness/verify-page.mjs` — the acceptance pass; the C3 block, the interaction block, and the two navigation
  fixes are all commented with why.
- `harness/fidelity/capture-current.mjs` / `montage.mjs` — the landing capture (mount gate waits on the
  landing; refuses if a view container is already on screen) and the overview montage pair.
- `docs/layout-fixtures/verify-fixture-write.txt` — the fixture write record.
