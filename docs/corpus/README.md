# The real corpus — review pack

The dashboard in this repository used to render a **neutral demo dataset** (`Signal Processing`,
`Acquisition Automation`, `Researcher A`), because decision **D6** (2026-09-30) required that a public
repo never carry the group's own unpublished work. That constraint still holds; the *placeholders*
have been retired in favour of a **real but public** corpus:

> **`ajegorovs/udv-echo-process`** — a public repository, single contributor, real research code.
> Nothing in this directory comes from the group's unpublished work, and no live URL is needed to
> review it: everything is committed here, and the screenshots are in `../screenshots/`. Because the
> corpus is itself public, republishing its history here discloses nothing a clone of that repository
> would not already give — it only makes the dashboard's rendering of it reviewable.

Hand-typed data is the author's *choice of state*, which hides exactly what a layout review has to
see: an axis whose state is inferred with no document behind it, an axis with work but no PR, a
person with no mapped account, an empty window. This corpus is not shaped by us, so those states are
the repository's own. **No row was hand-typed:** the dashboard was populated through the plugin's own
action surface, and the call transcript is kept verbatim beside this note.

## The corpus, in numbers

Measured from the clone at `head = 841964d` (2026-09-28):

| | |
|---|---|
| commits | **625** — 2026-07-28 → 2026-09-28, plus 71 merge commits |
| pull requests | **69** — 66 merged · 2 open (#68, #70) · 1 closed-unmerged (#48); PR window 09-17 → 09-28 |
| branches | **47** (docs 19 · feat 15 · acquire 5 · analysis 4 · data 1 · fix 1 · 2 ungrouped) |
| identities | **3** — all the same human, so attribution is a handle, not a roster |
| axes | acquisition **301** · signal analysis **249** · documentation + agent skills **75** commits |

One topic (`UDV Echo Process`), three axes, one person, one repository — that is the whole corpus.
It is deliberately **one topic**: the shape the overview has to survive is a topic carrying several
axes of different kinds, not a list of many topics.

## How it got into the dashboard

`../corpus/transcript/actions.jsonl` is the verbatim transcript: **695 accepted action calls** —
694 × `record_activity` (one per commit and per PR) and 1 × `reconcile_topic` (the topic, its three
axes, its notes and its links). Two further derived calls (U10, *What the replay derives* below) carry the
three unmerged pull requests as problems and the events that name them; every one of the 694 published rows
still comes from the transcript, and the transcript itself is unchanged. They were replayed in 76 s at ~0.09 s per call, so the *complete*
history is recorded rather than a sample: sampling would have been a judgement call we did not need
to make. Each call is the plugin's own write path, so reconcile, idempotency and conflict semantics
were exercised rather than bypassed.

Everything else in this directory is derived from the same capture: `commits.jsonl` (per commit: SHA,
subject, date, ISO week, files touched, axis and **the reason for that axis**), `pulls.json`,
`branches.json`, `summary.json`, `identities.json`.

**Re-seeding it on another instance:** `bun harness/replay-corpus.mjs --env-file <env>` replays the same
695 calls (about 75 s) and refuses if the topic is already there. It also installs the plugin into the fresh
store first, and derives the two things listed under *What the replay derives* below. It rewrites the one call that names the
contributor's platform account to the id of the account it logs in as, so the dataset's attribution
follows the instance instead of depending on which one seeded it.

## What the replay derives, and why (U10)

The transcript is verbatim and stays verbatim. Two things the dashboard shows are *derived* by
`../harness/replay-corpus.mjs` from the material's own contents, and the replay prints both counts:

| derived | from | why it is corpus-derived, not authored |
|---|---|---|
| each event's repository — **694 of 694** | the event's own `sourceUrl` (`.../udv-echo-process/commit/<sha>`, `.../pull/<n>`) | the event *is* from that repository, and the axes declare the same one as primary. `record_activity` has always accepted `repositoryFullName`; the replay simply never passed it, so no dataset could exercise the Activity-column repository tag |
| **3 problems** | the three pull requests that never merged: **#68** and **#70 open**, **#48 closed, unmerged** | the statement is the PR's own subject line, the axis is the axis this corpus already assigned that PR, the repository is the PR's own. A merged PR is finished work, not a problem. #48's `resolved` state is an **explicit inference** (`stateConfidence: inferred`) — the same habit this corpus already documents for its axis states |

The three problems' own events are recorded through the topic write path, because `reconcile_topic`'s
`activities[]` carry `problemId` and `record_activity`'s schema does not — so each event stays **one**
row while also naming its problem. Nothing is hand-typed: the two derived calls are the 696th and 697th,
and the created problems' ids are read back from the projection and matched on the PR's own subject line
rather than assumed.

### The one failing check — a finding, not a seeded defect

`selecting another axis moves the Problem and Activity columns to that axis` fails on this dataset
because the page and the projection disagree about an axis that has a **resolved** problem and no open
one (the acquisition axis, from PR #48): the column's own count attribute says `0` and its heading reads
`Open problems (0)`, yet it renders a problem card. In `src/ui.tsx`, Axes mode resolves the column's
problem as `axesModeProblems.filter((row) => row.state === "open")[0] ?? axesModeProblems[0] ?? null`, so
a resolved problem is shown when nothing is open. The accepted step-6 rule is *"the Problem column shows
the projection's first open problem, under the projection's own count"* — the check encodes that rule and
the page deviates from it. No dataset could exercise the case until this pass (it needs a corpus with a
resolved problem and no open one on the same axis). It is left **unfixed and recorded**: changing the page
is product design, and this pass is data/harness work. For the reviewer: (a) dropping the
`?? axesModeProblems[0]` fallback restores the accepted rule and turns this record green; (b) keeping the
fallback means the check must expect a resolved problem for a resolved-only axis *and* the heading must
stop saying `Open problems`.

## Attribution and hygiene

Attribution is **handle-only** (`ajegorovs`), and the three commit identities are reduced to opaque
keys (`identities.json`: key + commit count + first/last seen) because all three are the same person
— the full identity adds no information the handle does not carry.

**No email address, personal name, hostname, tailnet name or local path appears anywhere in this
directory.** Verified two ways, because the screenshots can only render what the store holds:

- every file here was swept for email-shaped strings and for this estate's identifiers;
- the **live payload** the page reads (`get_overview` + `get_topic`) and **all four SQLite stores**
  behind it — 8 201 text values, the superset of anything a view can display — were swept the same
  way. The only at-sign outside the corpus's own text is a version specifier in a real commit subject
  (`marimo-inspect@v0.2.0`), and the only platform value is the development instance's own actor id
  `user_admin`, which `transcript/actions.jsonl` carries on every call because that transcript is a
  byte-exact record of the writes rather than a cleaned-up narrative. It is the dev server's admin
  user, not a personal account.

## The axis rule — the one judgement that had to be made

Three axes, chosen by the owner: **acquisition · signal analysis · documentation + agent skills**.
Branch prefixes do *not* map onto them (`feat/` carries both acquisition and analysis work, and 29 of
the 69 PRs are `docs/*` documenting other threads), so the rule is scope-first, then the **subject's
words**, then the paths touched. It is written out in [`AXIS-RULE.md`](AXIS-RULE.md), which also lists
**every judgement call: 9 of 625 commits**, each with its reason, so a reader can disagree with a
specific assignment instead of having to trust the rule. One genuine tie (a BDD commit touching one
acquisition and one analysis file) is published as a tie rather than force-assigned.

## What this corpus cannot exercise

Seven of the harness's checks have no subject here. They are reported as **SKIP with a reason**, never
as passes — a harness that prints PASS for a state it never rendered stops meaning anything:

| State the check needs | Why this corpus has none |
|---|---|
| an axis in `blocked` | the repository records no blocked axis |
| the attention styling for a blocked topic card | as above |
| a card that hides axes (`All n axes`) | the topic leads with exactly 3 axes and `LEAD_AXES` is 3 — nothing is hidden |
| an axis with no evidence on record | all three axes carry commits |
| the bare "no progress note" wording | as above |
| one person involved in two or more topics | one topic, one person |
| a person filter matching nothing attributable | the single person maps to a platform account |

If the review needs those states on screen, they are reachable two ways: a topic with ≥4 axes (the
card then hides some and offers the expander), and the harness's own `--write` pass, which creates a
fixture topic and drives the write path — but its screenshots are not published here, because they
would mix fixture data into a real-corpus pack.

## The screenshots

`../screenshots/` holds six captures of the same corpus, all from the **read pass** (no writes), at a
1440×900 viewport:

| File | View |
|---|---|
| `dashboard.png` | overview — the default screen |
| `dashboard-detail.png` | one topic opened: full detail, per-axis metadata, notes, activity |
| `dashboard-people.png` | People — person-first index and panel |
| `dashboard-repositories.png` | Repositories — repository-first panel |
| `dashboard-progress.png` | Progress — the window grouped topic → axis → event |
| `navigation.png` | how a member reaches the page: command palette → **Plugins → Research** |

They are produced by the page harness (in the services tree, `services/nakama/scripts/verify-read.sh`,
which wraps `verify-page.mjs`), and the pass that produced them is kept here verbatim as
[`verify-read.txt`](verify-read.txt) — with `verify-read-1280x800.txt` for the narrow viewport:
**83 checks passed, 1 failed, 22 skipped** at both viewports, re-measured at U10's corpus-coverage pass
(2026-10-02) on a **corpus-only instance** (its own empty data root, this corpus seeded into it by the
committed 695-call replay); the step-7 record was **64 · 0 · 32**, step-6 **56 · 0 · 30**, step-5
**52 · 0 · 26**. The single failure is a finding rather than a seeded defect — *The one failing check*
below. The 22 skips are the states this corpus cannot honestly exercise; each prints its reason, and every
one of them is classified **rung 3** (left skipped) under the provenance rule in
[`../ux-v2/U10-harness.md`](U10-harness.md) §4, because activating them would mean inventing a blocked
axis, a second repository, a plan, or a problem with nothing behind it. The harness reads the corpus from
the same payload the page reads, so it holds for any dataset rather than being a snapshot of this one.


**One caveat on `dashboard-detail.png`, and it is a finding rather than an artifact choice:** the
capture shows the topic with its **editor open**. A collapsed card offers an expander only when it
hides axes, and this topic leads with all three, so the read-only expanded state is *unreachable* —
the only route into a topic's axes is `Edit fields`. Reading a topic and editing it are the same
screen here, and that image is 4828 px tall, which is also worth a look.

## What to look at

Observations, not verdicts — the layout judgement is the review's to make:

- **The toolbar.** Ten controls in one row (4 view tabs · 4 window buttons · archived toggle ·
  Refresh), with a topic-name input and its button on a second row beneath. The window buttons and
  the view tabs are visually identical, and the count line sits alone at the far right of the second
  row.
- **The card.** One topic card uses the top ~75% of the plugin root at this viewport, and the bottom
  quarter is empty. Inside it, each axis is four stacked small-text lines: badge row, title, a
  `repo · branch · PR` line, and a sentence of state reasoning.
- **The detail.** 3 axes + 2 topic notes + 25 activity rows = one long scroll, with the correction
  form and the fields at the top and the per-axis history behind `History (n)`.
- **Inference on screen.** `Docs & agent skills` renders `ACTIVE · INFERRED`, with the sentence that
  explains why below it — the one state here that is a conclusion rather than a record.

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

## Not verified here

- The corpus is a **snapshot** of a repository that is still moving; the clone's HEAD is recorded
  above, and nothing here re-reads it.
- The seed's write path is exercised by the transcript, and the harness's **write** pass was run
  against this corpus as well: **49 checks passed · 0 failed · 7 skipped** (the same skips), on the
  43-check pass of that time. Its screenshots are not published and the store was wiped and re-seeded
  from this bundle afterwards, so what the published images rest on is the **read** pass above —
  **73 · 0 · 33** as re-measured in U10 §1 (the U4 step-7 propagation pass read 72 · 0 · 33) on a corpus-only instance (the step-7 record was 64 · 0 · 32, the step-6 one 56 · 0 · 30,
  the step-5 record 52 · 0 · 26).
  The 36 · 0 · 7 and 43 figures
  still readable elsewhere in this document belong to that earlier 43-check pass, taken against the
  shared dev instance (the one that also carries the layout fixture), and are superseded.
- Captured at two viewports: `docs/screenshots/` (1440×900) and `docs/screenshots/1280x800/` (the same
  six views; the harness's `NAKAMA_VIEWPORT` selects one). Nothing is claimed for narrower widths — there
  is no mobile target.
- **The states this corpus does not have are covered by a second, synthetic dataset** —
  [`docs/layout-fixtures/`](../layout-fixtures/README.md): its pass reports **107 · 0 · 0** at both
  viewports against **73 · 0 · 33** here, with each skip becoming an exercised case. The requirements for
  the rework are in
  [`docs/layout-rework-brief.md`](../layout-rework-brief.md).
