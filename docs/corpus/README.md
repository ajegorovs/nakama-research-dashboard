# Public corpus — input and provenance

This directory contains the frozen public-repository snapshot and action transcript consumed by
`harness/replay-corpus.mjs` and the standalone preview. It is not live research data and does not
refresh itself. The snapshot identity and counts are in `summary.json`; classification rules and
judgment calls are in [AXIS-RULE.md](AXIS-RULE.md). No unpublished work belongs here.

Replay uses the plugin action surface, not direct production database edits. Run it only against
an explicitly selected disposable/authorized instance; consult the acceptance contributor procedure.
For UI inspection without a live instance, use `--dataset corpus` in the preview guide.

## Files here

| File | What it is |
|---|---|
| `AXIS-RULE.md` | the axis rule, the resulting per-axis and per-week counts, and every judgement call |
| `commits.jsonl` | one row per commit: SHA, subject, date, week, files, axis **and the reason** |
| `pulls.json` | the 69 PRs: state, numbers, merge topology where there is one |
| `branches.json` | the 47 branches grouped by family |
| `identities.json` | the three identities as opaque keys with commit counts — no names, no addresses |
| `summary.json` | the counts above in machine-readable form, and the hygiene note |
| `transcript/actions.jsonl` | the 695 action calls that populated the dashboard (the C11 spec) |
| `verify-read.txt` | the harness's read pass over this corpus, verbatim |

## Evidence boundaries

Committed transcripts and screenshots measure their recorded builds, not automatically the current
four-view product. Current verification boundaries are in `docs/DEVELOPMENT.md`. This snapshot
cannot cover every layout state; use the separate synthetic layout fixture for supported edge states.
Do not mix corpus and fixture stores or reseed retained research as a cleanup shortcut.
