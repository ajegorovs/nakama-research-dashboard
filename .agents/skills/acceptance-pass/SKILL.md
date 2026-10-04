---
name: acceptance-pass
description: Run the acceptance pass; commit its transcript as evidence.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [nakama, acceptance, transcripts, datasets, evidence, records]
    category: software-development
    related_skills: [dashboard-build-and-serve, public-records-hygiene, keyboard-focus-pass]
---

# Acceptance pass

The pass drives a real browser against a served instance and writes a transcript that is **committed as
evidence**. This skill covers its contract, the two datasets, and the bookkeeping that keeps a record
trustworthy a month later.

## When to Use

- A change reaches the page and you need to know whether it broke the composition.
- You are taking or re-taking a committed record (any `docs/corpus/*.txt`, `docs/layout-fixtures/*.txt`).
- A record exists and you need to know which build, dataset and viewport it speaks for.

## Prerequisites

- The instance is serving the build you intend to judge — **check with the guard first**
  (`dashboard-build-and-serve`). The pass refuses (exit 3) if it is not.
- Credentials from the instance's env file, by key name: `NAKAMA_SEED_ADMIN_EMAIL` / `NAKAMA_SEED_ADMIN_PASSWORD`.
- The reference viewports: **1440×900** and **1280×800**, both taken for every unit.

## The contract (read this before trusting a transcript)

| Exit | Meaning | What happens to the committed record |
|---|---|---|
| `0` | passed | replaced by this run's transcript |
| `1` | **failed** — a verdict | replaced; the failures *are* the record |
| `2` | ABORTED (the run did not establish anything) | **untouched** |
| `3` | REFUSED (wrong dataset, wrong build, empty store) | **untouched** |

A red run is a result and gets committed; only an aborted or refused run leaves the old record alone. Never
overwrite a good record with an aborted run's transcript by hand.

## Procedure

1. **Confirm what is served.** Guard green, and note the release and sha256 — the record quotes them.
2. **Run the pass for the dataset and viewport you mean.** The default is corpus; the fixture needs its own
   invocation:

   ```bash
   bun run harness:read                                        # corpus, default viewport
   bash harness/read-pass.sh --dataset fixture --viewport 1280x800
   ```

3. **Read the failure list, not the count.** Failures name the check and the measured value; a skip names what
   it could not reach and why.
4. **Archive the record you are superseding** as `*.revision-<n>.txt` named for the instance revision it was
   taken at (e.g. `verify-read.txt.revision-511.txt`). It belongs to the tag that carries that build, **not to the
   tip**, which keeps one canonical record per dataset and viewport. Two traps: (a) **not every record header
   names a revision** — the focus transcripts carry `(release, revision n)`, but the read transcripts carry only a
   dashboard and a timestamp; a corpus name like `revision-527` can therefore come from the sibling focus record,
   not from the read file's own header, so never claim a header source you did not check. (b) If the archived copy
   is **byte-identical to the tag's canonical path** (verify with sha256), the tag already preserves it and it must
   not sit untracked at the tip — move it out of the working tree (an estate backup), do not delete it and do not
   add it to the tip. Completion: the superseded record is readable in history (`git show <tag>:<path>`).
5. **When the fix is a source change, re-take every record it could reach** — and compare the *check
   descriptions and verdicts*, not the raw lines: detail text legitimately moves with the dataset (ids, counts,
   subject names), so "0 differing check descriptions" is the regression claim worth making.
6. **Commit the transcripts, the archived copies and the screenshots together**, with the build identity in the
   message.

## The two datasets

- **Corpus** — the real research corpus, served by the corpus instance (its dashboard binds the tailnet address).
  Replayed with `bun run harness:seed`. This is the "does it survive real data" pass.
- **Fixture** — the layout fixture, served by the fixture instance (loopback). Small and deliberate: a crowded
  card, a second topic, terminal work. After a reseed it is `2 topics / 7 axes / 2 people / 3 repositories`.
- **The write pass runs on the fixture and mutates it**, leaving its own `ui-check` residue. It is the canonical
  record of the composition *inside a write pass*; label it canonical, and re-seed before the next ordinary
  fixture run.
- **Never mix them.** The transcript path encodes dataset and viewport so a fixture run cannot land in a corpus
  record, and the identity classifier refuses a store that does not match the requested dataset.

## Quick Reference

| Task | Command |
| --- | --- |
| read pass, corpus | `bun run harness:read` |
| read pass, fixture | `bun run harness:fixture` |
| write pass (mutates fixture) | `bun run harness:write` |
| keyboard-focus pass | `bun run harness:focus` |
| dataset-identity classifier | `bun run harness:identity` |
| replay the corpus | `bun run harness:seed` |

## Pitfalls

1. **A store that is not the dataset you asked for gets refused — do not work around it.** Read the refusal: an
   empty store, a write-residue store and the wrong instance all produce it, and each has its own remedy.
2. **A runtime failure (SQLite lock, 500) is not a product failure.** Record the lost run separately and re-run;
   do not add sleeps to make it pass. That debt is tracked separately and is not closed by a green suite.
3. **The pass republishes the screenshots.** A run can therefore show screenshot changes that are not yours to
   own — check before staging, and remember a pass that republished them makes that part of the run.
4. **A skip is not a pass.** Gaps that are written down are honest; gaps that are silently counted as passes are
   the thing this contract exists to prevent.
5. **Exit codes are easy to lose in a pipeline.** `bash read-pass.sh … | tail` reports `tail`'s status; capture
   the pass's own exit code when it decides whether a record is replaced.
6. **A red read pass can be the instrument, not the page — establish a view's readiness before reading
   it or clicking its controls.** Three verified prerequisites, each a wait on the page's *own* markers
   (`page.waitForFunction`), never a blanket sleep:
   - **A control inside a `<details>` disclosure is not in the accessibility tree until its ancestor is open.**
     The per-axis `History` button (read pass) and the write pass's `Correct` button both live inside
     `details[data-rd-axis-more]`; clicking one without opening it makes the locator wait 30 s and the run
     aborts (exit 2). Open it with `expandAxisDisclosure(card)` first — the helper exists for exactly this
     and must have a call site before any control inside the disclosure is clicked.
   - **Entering a view triggers its data after the container appears.** The Topics index renders ~1.5 s after
     `[data-rd-view="topics"]`, so a read taken on the container alone reports "0 index rows" and every check
     downstream of it cascades red. Wait with `waitForTopicsReady()` (rows + selected row + detail pane +
     summary claim), `waitForLandingReady()` (landing cards + names) and `waitForRepositoriesReady()` (rows,
     optionally a named panel).
   - **A window change replaces the landing cards while `get_overview` refetches**, so a card's name read
     mid-refetch is `null`. Wait for the cards again before reading one.
   The assertions still run and still report what they see; the wait only removes the race. Confirm against a
   direct probe before recording a product failure.
7. **A committed record may predate the harness that would re-take it.** Check `git log -1` for the record
   against `git log -1` for `harness/verify-page.mjs`; if the harness moved after the record, the record is not
   a reproduction of the current check set. Re-taking it then needs the harness change first — do not paper over
   the mismatch by editing the record. A readiness/disclosure repair *is* a harness change, so records taken
   before it do not speak for the repaired check set.
8. **A composition rule can be a *rule* the reviewer owns, not a product defect — encode the ruled condition,
   and read the component's own container, not the viewport.** A check that demanded "three columns at every
   width" failed a correct 634 px band; the ruling made the band **container-responsive** (three columns at
   ≥720 px available, two permitted at 480–719, one permitted below 480, order preserved). The replacement
   reads the band's *own* `getBoundingClientRect().width`, branches on the ruled thresholds, and asserts the
   required condition plus no-clipping/overlap and reachability-by-ordinary-scroll — never a fixed count. Before
   asserting a threshold, measure the component across widths and compare its real switch points with the rule;
   align the component to the rule **openly** (recorded) or report the mismatch, and never quietly loosen or
   tighten the assertion to make a run pass. The reachability half must scroll the scroller that actually
   scrolls (the host port *or* the document viewport) — see `keyboard-focus-pass` pitfall 8.
   **Two ruled thresholds cannot both be exact under one equal-gutter auto-fit basis** (720 = 3·M + 2·g and
   480 = 2·M + g would need g = 0). An auto-fit basis tuned so the third-column switch lands at 720 leaves the
   second-column switch off the 480 floor (measured ~471 px — a *real* mismatch where the rule reads "below 480 →
   one column", not a permitted tolerance). Write the breakpoints **explicitly** with container queries on the
   pane (`container-type: inline-size`; the pane's content box must equal the box the assertion measures — verify
   it, or every threshold is off by the padding), cap each branch at the band's own card count so conditional
   sections stay natural, and **prove the switch points on the served page** at 479/480 and 719/720 (band width set
   directly on the container), not merely at the reference widths (634/794).
9. **An emitted transcript line can carry trailing whitespace — trim at the emitter, and assert the canonical
   records.** A `PASS`/`FAIL`/`SKIP` line is printed from one place in `verify-page.mjs` (the `emitLine` call
   inside `check()`/`skip()`), but several checks build their `detail` from rendered text via `text.slice(0, N)`,
   so a cut landing on a space leaves a trailing blank in a **committed public** transcript (a reviewer flagged
   exactly this on the fixture read records). Trim at the emitter — presentation-only, it cannot move a
   description, condition, detail value or verdict — and keep an executable assertion that the canonical read
   records carry no trailing whitespace (`harness/test-redact.mjs`, run by `harness:records`), so a regression
   fails a gate rather than waiting for a reviewer. Do not hand-edit a committed transcript to hide it: fix the
   emitter and regenerate the record; a write-pass record that still carries the old detail is regenerated only by
   a write run (which mutates the fixture) and is a stated boundary, not an exemption.

## Verification

- The transcript's summary line states passed/failed/skipped, and the header names dataset and viewport.
- The guard green for that instance, and the build identity recorded alongside.
- Archived superseded records present, screenshots and transcripts staged together.
