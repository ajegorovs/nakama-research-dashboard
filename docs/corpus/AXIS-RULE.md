# The axis rule — how each commit was assigned to one of the three axes

Corpus: `ajegorovs/udv-echo-process`. Three axes, chosen by the owner: **acquisition**, **signal analysis**, and
**documentation + agent skills**. A commit belongs to exactly one of them.

## The rule (deterministic, and auditable from this bundle)

The repository is disciplined about conventional commits, so the subject's `scope` is the
primary signal; when the scope settles nothing, the words of the **subject** decide, and only
then the paths the commit touched.

- scope in `agenda, agent, agents, skill, skills` → **docs+skills**
- scope in `acquire, device, instrument, live, tools, udop, verify` → **acquisition**
- scope in `analysis, decision, notebook, notebooks, reports, sparse, spectral, stage2` → **analysis**
- else: words counted in the **subject only** (acquisition vs analysis vs documentation),
  because a file name is not an intent — an early commit titled `gitignore` that happens to add
  `UDV_Data_Analysis_Echo.nb` is not analysis work;
- else: a majority vote over the paths touched (a `data*` directory or the flat pre-package
  parser scripts = acquisition; `src/udv_echo_process/{models,process,provenance,storage}`,
  `notebooks/`, `reports/`, `examples/` = analysis; `docs/`, `.agents/` = docs+skills; tests and
  root metadata are ignored);
- a tie, or nothing at all, falls back to **docs+skills** and is listed below as a judgement call.

Documentation that records a specific workstream belongs to *that* workstream (a record of the
acquisition work is part of the acquisition axis); the docs+skills axis is the documentation
*practice* and the repo-local agent skills.

## What it produced

| Axis | commits |
|---|---|
| acquisition | 301 |
| analysis | 249 |
| docs+skills | 75 |

| ISO week | acquisition | analysis | docs+skills |
|---|---|---|---|
| 2026-W40 | 3 | 35 | 2 |
| 2026-W39 | 50 | 117 | 20 |
| 2026-W38 | 233 | 58 | 27 |
| 2026-W37 | 4 | 38 | 23 |
| 2026-W34 | 1 | 1 | 0 |
| 2026-W31 | 10 | 0 | 3 |

**Judgement calls: 9 of 625 commits** (no scope and no decisive word —
every one of them is listed here so the reader can disagree with a specific assignment instead
of having to trust the rule):

| sha | date | subject | → axis | why |
|---|---|---|---|---|
| `4be942366` | 2026-07-28 | 'Add __pycache__ to .gitignore' | docs+skills | paths:none->fallback |
| `f4bc32f16` | 2026-07-28 | 'Update README and AGENTS to reflect current architecture' | docs+skills | paths:none->fallback |
| `72d45a8fe` | 2026-09-07 | 'P3: ruff formatter/linter — config + format sweep (src/tests)' | docs+skills | paths:tie(acquisition=2=analysis)->fallback |
| `5ec133b62` | 2026-09-11 | 'chore: gitignore .hermes/ (agent working artifacts, never repo documentation)' | docs+skills | paths:none->fallback |
| `1e0a1ab1f` | 2026-09-17 | "chore(examples): keep the machine's store directory out of the shipped definition" | docs+skills | paths:tie(analysis=1=docs+skills)->fallback |
| `7fff78d87` | 2026-09-19 | 'feat(bdd): expose sweep metadata words' | docs+skills | paths:tie(acquisition=1=analysis)->fallback |
| `f43f35763` | 2026-09-20 | 'docs(matrix): decide the first measured augmentation' | docs+skills | paths:tie(analysis=2=docs+skills)->fallback |
| `82ae49974` | 2026-09-20 | 'fix(design): align repeated-measurement semantics with WP4 rows' | docs+skills | paths:tie(analysis=1=docs+skills)->fallback |
| `ba51fe157` | 2026-09-25 | "docs(dop3000): the second sitting's report, read within its own floors" | docs+skills | paths:tie(analysis=1=docs+skills)->fallback |

## Pull requests

A merged PR inherits the axis of the majority of its own commits (read from the merge
topology). Branch name is *not* used: `feat/` carries both acquisition and analysis work.

| PR state | count |
|---|---|
| CLOSED | 1 |
| MERGED | 66 |
| OPEN | 2 |
