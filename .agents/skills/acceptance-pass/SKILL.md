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
4. **Archive the record you are superseding** as `*.revision-<n>.txt` named for the instance
   revision it was taken at (e.g. `verify-read.txt.revision-511.txt`). It belongs to the tag that carries that
   build, not to the tip, which keeps one canonical record per dataset and viewport. Completion: the old
   record is readable in history (`git show <tag>:<path>`).
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

## Verification

- The transcript's summary line states passed/failed/skipped, and the header names dataset and viewport.
- The guard green for that instance, and the build identity recorded alongside.
- Archived superseded records present, screenshots and transcripts staged together.
