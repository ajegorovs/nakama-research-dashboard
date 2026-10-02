# C1 acceptance record — 2026-10-02

Status recorded at the reviewer's direction, and updated when the two open items were closed in the
follow-up session, and again when the regenerated montage was accepted.

## Classification

| aspect | state |
|---|---|
| functional composition | **accepted — closed by the reviewer** |
| write-path acceptance | **accepted — closed by the reviewer** (see § Write-path acceptance) |
| visual fidelity | **accepted — closed by the reviewer**, from the montage of revision 442 on the pushed branch |
| C1 | **accepted** |
| C2 | **unblocked** — People composition refinement on the C1 master/detail grammar rather than a rebuild |

## Reviewer acceptance — visual fidelity, after `73261e0`

**C1 is accepted.** The reviewer inspected `docs/ux-v2/fidelity/side-by-side/topics.png` from
`origin/composition/c1-topics` (revision 442, `0.2.0+dev.aed4d024c37e`) and ruled:

> C1 functional composition: closed. C1 write-path acceptance: closed. C1 visual fidelity: closed.
> **C1: accepted. C2: unblocked.**

All three findings from the previous round were confirmed resolved, as facts visible in the capture
rather than as implemented intentions: the per-view `Topics` heading beneath the shell title with the
recency/read-only hint; the Current Work hierarchy, with history, evidence and correction demoted
behind `More on this axis`; and the bounded rail, which lets Notes and Related repositories participate
in the same first-screen composition as Current Work and Recent activity. The residual differences —
longer real descriptions, host chrome width, the proportional side rail, the 3px blocked accent,
one-line ellipsized tags — were ruled consequences of real data and the host environment: explicitly
**not** composition drift, and explicitly **not** to be compressed toward the prototype pixel-for-pixel.

The corpus 1280×800 result `114 · 0 · 24` was accepted as documented: the extra skip is
viewport-specific and tied to the first-screen assertion at the reference reading size, not a missing
subject and not a regression.

Two carry-forwards were kept, both outside the fidelity verdict:

- **Merge hygiene, not fidelity.** The fixture pair still records revision 410, so it must be re-run at
  both viewports on the final build before the branch is treated as final merge evidence — to cover
  fixture-only subjects (blocked-state treatment, the bare repository, long tags) against the CSS and
  hierarchy changes. § Fixture pair on the final build records the outcome.
- **Two debts stay outside C1 and do not delay C2** unless the locking starts making the composition
  work unreliable: the `--rd-gap` self-reference and the `SQLiteError: database is locked` behaviour.

## Reviewer rulings — 2026-10-02, after `9545bba`

- **Functional acceptance: closed.** The five green runs on one served build are the evidence.
- **Write-path acceptance: closed.** "Re-clicking an already-selected topic must be idempotent; clearing
  `detail` without changing `expandedId` was a genuine C1 product bug."
- **Visual fidelity: pending inspection, and not to be inferred from the capture pipeline.** A correct
  capture is a necessary condition, not the verdict; the reviewer judges the prototype-vs-running
  composition directly from the committed montage.
- **C2 stays blocked until that verdict.** The rework exists because green semantic acceptance had
  previously hidden composition drift, so the shared grammar is not propagated into People before the
  Topics composition is signed off visually.
- **The corpus counts are re-baselined as a *dataset-enrichment* re-baseline** — not a regression and not
  a change to the check inventory: corpus **105 · 0 · 23**, write pass **117 · 0 · 23**, fixture
  **130 · 0 · 0**, at both viewports on revision 410. Earlier numbers stay where they are labelled by era.
- Secondary calls accepted: the branch is pushed so the evidence is durable; the estate `README` change is
  committed separately from an unrelated `AGENDA.md` hunk; and the capture tool's fail-closed behaviour is
  kept as permanent infrastructure rather than treated as throwaway diagnostic code.

## Accepted functional composition

Green with the composition in place — index rail + one persistent detail, the write
affordances folded, the side rail proportional and Current Work dominant.

## Write-path acceptance — resolved

**The write pass now runs to its verdict: `docs/corpus/verify-write.txt`, 117 pass · 0 fail · 23 skip**
on revision 410 (`0.2.0+dev.e7668de0aee1`, served asset sha256 `80b8023a…`). The pass covers the
note write end to end, the stale-correction refusal inside its own axis, the "refused correction wrote
nothing" invariant, and the correction landing with the note that backs it.

### The branch, decided by evidence from both sides

Preconditions honoured first: the harness recorder now parses identity from the **full** response body
and stores `result.topic.id` as a field, and the run was preceded by a row-level wipe plus a full
corpus replay (695 calls), so no earlier run's created topics were in the trace.

What the two instruments then showed, for the topic the pass creates through `reconcile_topic`:

- **harness side** — `get_topic` was requested for the created topic's id and answered
  `{ok: true, topic: {id: <that id>}}`; before this fix that same field read `null` because the
  recorder truncated bodies at 300 chars.
- **page side** — `active: true`, `willCommit: true`, and `render:gate gateOpen: true` with
  `detailTopicId === expandedId === selectedEntryTopicId` for four renders: the detail arrived and the
  render gate opened for the created topic.
- then a `rail:click {sameSelection: true}` and the gate closed again (`detailTopicId: null`) while
  `expandedId` stayed the created topic.

So the three branches this record left open are each excluded: `active` was never false before the
commit, the ids never differed, and the gate was not closed on arrival — it was **cleared afterwards**.

**Root cause.** `selectTopic` cleared `detail` unconditionally. The effect that fetches it runs on
`expandedId`, so clearing it for the *same* id leaves the pane with nothing to re-fetch it: the note
surface and the current/folded split never come back, while the card still renders from the overview
row — an open pane, empty of everything the detail owns. The pass hits it because the topic it creates
sorts first (server order, newest first), so its "select this row" click is a click on the row that was
already selected. That is a reader action, not a harness artifact: re-clicking the selected line is
ordinary.

**Fix.** `selectTopic` returns early when the id is already selected — re-clicking the selected row is
not a change of subject, and it must not drop the conflict notice either. Nothing else changed: the
render gate (`ui.tsx:3890`, `detail.topic.id === selectedEntry.topic.id`) is untouched and the ≥1.25×
main-lane threshold is untouched.

### One dataset note, so the numbers are not read as a regression

The corpus records above read 23 skips where this record previously quoted 34. The delta is
dataset-side, not check-side: the re-seeded corpus derives **3 problem rows and 3 repository-naming
events** from its own material (the seeder prints both), so eleven checks that had no subject are now
exercised. The same eleven lines are present in both records — SKIP before, PASS now. Current records,
all four in one session on one build:

```
corpus   1440x900           105 pass · 0 fail · 23 skip
corpus   1280x800           105 pass · 0 fail · 23 skip
corpus   1440x900  --write  117 pass · 0 fail · 23 skip
fixture  1440x900           130 pass · 0 fail ·  0 skip
fixture  1280x800           130 pass · 0 fail ·  0 skip
```

Served build for all five: revision 410, `0.2.0+dev.e7668de0aee1`, served asset sha256
`80b8023adfd4b8d92e43cf06e9aee7e4d16a106eac65f4ee832c34e0dfd9dace` (the guard verifies this against
the repo's own build before each pass, and `harness/refresh.sh` before that).

## Visual fidelity — capture fixed, montage taken

The capture that produced the previous montage was **invalid**: it screenshotted whichever document
came back, for every view, so all four files were the same 9 KB image of an error page, and it
overwrote the montage input in place. It had been pointed at an origin that serves the API only, whose
answer for a page route is `{"error":"Not found"}`.

`harness/fidelity/capture-current.mjs` replaces it and proves three layers before writing a pixel,
failing closed (exit 3, target untouched) on any of them:

1. prints and fetches the exact page URL — HTTP 200 and an SPA document, or it refuses;
2. fetches the plugin UI asset the browser actually fetched — HTTP 200, non-empty, hashed; the served
   revision/version for the caption come from that asset's own URL rather than from memory;
3. asserts the durable per-view markers the acceptance pass reads (`[data-rd-view]` plus that view's
   own index container; the topic index also requires `[data-rd-index-topic]` and `[data-rd-detail]`).

It also resolves the shared credential helper itself instead of requiring `PROBE_ENV_HELPER`, and was
tested by injecting faults rather than by inspection: the API origin refuses with exit 3 and writes
nothing, and a missing helper exits 2 with a sentence. The montages in
`docs/ux-v2/fidelity/side-by-side/` were regenerated from the verified capture of revision 410;
`topics.png` is the first one whose bottom half is a real rendering of the running UI. Whether it
matches the prototype is the reviewer's call, not this record's.

## C1 refinement pass — information hierarchy (2026-10-02)

The reviewer's verdict on the first verified montage: **macro-composition passed** — ignoring the host's
chrome, the running page reads as *topic index → selected topic detail → Current Work + side rail*, which
was not true before C1 — with **one narrow refinement required** before the grammar propagates into C2, and
no redesign: the page's anatomy is correct, and what remained was an information-hierarchy mismatch inside
the detail. Three items, all in `src/ui.tsx`, no backend change:

1. **a missing per-view heading.** §7 decided on both: the shell title stays *and* each view names itself,
   and the prototype carries a `Topics` heading with a one-line hint. The running page had only the shell
   title, leaving the view's identity to the pressed toolbar button.
2. **Current Work rows too dense at the default reading surface.** The prototype's axis row is state → bold
   axis name → one concise reading → one quiet reference line; the montage's rows showed ten equal-weight
   lines, several of them the same fact twice (confidence in the badge *and* in the state cluster, a
   description *and* a current-state reading competing at the same level).
3. **the Recent activity rail dominating vertically**, so Notes and Related repositories — the rest of the
   topic's context — never reached the first screen at the reference reading size: structurally a rail,
   visually a feed.

### What changed, and what was measured rather than assumed

**§7, in all four views.** Each view renders its own name and the prototype's own hint above the layout it
governs (`ViewHeading`, `data-rd-view-heading` / `data-rd-view-title`); the shell title is untouched. The
heading spans its row — and here the layout's actual mode mattered: `.rd-split` is a **wrapping flex row, not
a grid**, so the `grid-column: 1 / -1` written first was inert, the heading shared the index's line, and the
detail was pushed into a second row. The existing "tops aligned" geometry check caught it (rail 154, detail
226); the declaration is `flex: 0 0 100%`, with `grid-column` kept for safety. Both headings then measure as
intended: the heading occupies 154–175, the index and the detail both top at 187.

**The axis row reads in three levels.** Scan line (state badge + title + kind·v) → the reading, clamped to
two lines, carrying its own confidence → one quiet reference line (entity tags, where the work lives, the
evidence line). The description, the second confidence cluster and "last reviewed" sit behind one disclosure
per axis (`details[data-rd-axis-more]`); History and Correct remain in the row as quiet text controls, so the
write path is one click away and never hidden. Measured on the running page at 1440×900: **5 rendered blocks
per axis** — head 22px, reading 62px, reference line 47–88px, disclosure 17px collapsed, controls 28px —
against the ten equal-weight lines the montage showed. Opening the disclosure grows it from 17px to 74px to
hold a 35px description, so the collapsed height is the summary and nothing else.

Nothing was removed to achieve that, and the check is what proves it: every axis's rendered reading and its
disclosure's description are compared **verbatim against `get_topic`'s own response** (whitespace normalised),
so the screen cannot quietly drift from the payload it claims to show.

**The rail is bounded, and here the reviewer's stated count cap was not sufficient — measured, not argued.**
The rail now leads with the newest four events and states the rest with the treatment the Progress feed
already uses ("4 of 25 shown, newest first" + `Show all 25`, and back). But capping the *count* does not bound
the *height* at this data volume: the corpus's activity rows measure **166px each** (a two-line summary plus a
two-to-three-line tag row), so four of them occupy **664px** of the rail's **~515px** first-screen budget —
Notes and Related repositories would still have fallen below the fold, which was the actual goal. The rail's
two lists are therefore bounded windows (activity 190px, notes 120px, each scrollable, nothing truncated and
nothing dropped), and the remainder treatment stays as the reader's route to the whole list. Measured result
at 1440×900: the three cards begin at **385 / 659 / 875 of 900** — activity, Notes whole, Related
repositories from its title down. If the reviewer prefers the count cap alone, the numbers above are why it
does not reach the stated goal, and the per-event line — not the cap — is what would have to shrink.

### The claims are executable, not just rendered

Ten checks were added (both read passes and the write pass therefore report ten more apiece):

| check | asserts |
|---|---|
| §7, the topics view | view heading `Topics` *and* the shell title `Research overview`, both present |
| §7, all four views | read from the grammar traversal's own snapshots, so the heading cannot be true only on the view the pass opened with |
| the rail leads with the newest few | 4 of 25 shown, remainder attribute 21, the note naming the total |
| the remainder is one control away | 4 rows → 25, and the total the rail reports is unchanged by showing them |
| the rail returns to its lead | 4 rows shown again, so later measurements and screenshots are of the default |
| the three cards in the first screen | card tops < the viewport height at 1440×900; **skipped elsewhere with the reason**, which is why the 1280×800 record reports one more skip than 1440×900 |
| each axis reads in three levels | ≤5 rendered blocks (6 with a blocker), reading, evidence and the state claim all rendered |
| the rest is behind one disclosure | the description is inside the disclosure, once, and the collapsed box is summary-height |
| the disclosure opens onto it | `open`, and the box grows by the description it holds |
| the reading and detail are the payload's words | verbatim against `get_topic`, per axis |

### Records on this build

Revision **442**, `0.2.0+dev.aed4d024c37e`, served asset sha256
`e289d9d8f4ad3b8cb5ea4fd032f07d2976f37ec23718e03eae888364759e4e76` (= repo `ui/app.js`), one served build
throughout:

| record | result |
|---|---|
| corpus 1440×900 | **115 pass · 0 fail · 23 skip** |
| corpus 1280×800 | **114 pass · 0 fail · 24 skip** |
| corpus 1440×900 `--write` | **127 pass · 0 fail · 23 skip** |

The write pass is the one that matters most for this pass's changes, and it holds: *"the correction lands with
its note, and the note is what backs the claim — state parked, evidence true, note kept: true"* — the
correction flow still works with the axis row restructured and the controls demoted. Both guards are
untouched: the render gate at `ui.tsx:3890` and the ≥1.25× main-lane dominance (that geometry check passes
unchanged).

**The fixture pair was not re-run on this build**, and this record does not claim it. The fixture records need
the second instance's own web origin (the dashboard on 3003 proxies the corpus on 4399) and the plugin
installed at this revision into that instance; the pair standing in this document from revision 410 remains
the fixture evidence, labelled by its build. That is the one gap between this pass and a five-record set.

### Instrument faults these runs found — two of them mine

The first 1280×800 attempt **aborted**, and the cause was not composition:

* **The instance, not the page:** `SQLiteError: database is locked` made the action answer HTTP 500 three
  times (16:46:59, 16:47:06, 16:48:12 in the instance log). The page rendered its own banner — *"An unexpected
  server error occurred."* — in its header, `get_topic` never answered, and the detail never landed. The
  re-run on the same build passed with **114 · 0 · 24**. Reported, not fixed: the plugin host runs actions as
  subprocesses and the store does not serialise them, and WAL is not enabled on the plugin's SQLite file.
* **My check read a fallback as if it were the truth.** While the pane is up but its detail has not arrived,
  the rail's total attribute falls back to the index row's own count — **504** on this topic against the
  detail's **25** — so a load failure first read here as "0 of 504 shown", a composition fault where the truth
  was a read that had not arrived. The rail's checks now wait on the rail's own list (not the pane) and read
  the rail, the same discipline the note affordance's check already used.
* **My check clicked a control that was not rendered**, and a Playwright click on a missing control does not
  fail the check — it aborts the whole pass after a 30s locator timeout, which cost a whole run. Every
  interaction now asserts its control exists first; a truncated rail with no control for the rest is a
  recorded FAIL, and a detail that never lands is one FAIL naming the banner plus two skips carrying the same
  reason. An aborted run is a lost record; a named failure is evidence.
* **Chromium boxes content inside a *closed* `<details>`** (content-visibility, not `display: none`), so a
  `getBoundingClientRect()` is not a visibility test there. The disclosure check therefore measures the
  collapsed box against its summary height and asserts DOM containment, instead of testing a rect for zero.
* **A bracket of mine failed once and has passed three times since** — *"the tag traversal wrote nothing … writes
  0 -> 0; payload CHANGED"*. It is not isolated: I have no diff from the failing run, only from a probe whose
  difference was the response envelope's own `invocationId` (which the harness strips, so that probe did not
  explain the harness's failure). The bracket now reads the projection **twice back to back** at the baseline
  and reports the **first differing byte with 60 bytes of context** — so a recurrence says whether the
  traversal or the read itself is responsible. Recorded as an open instrument-stability question, not as a
  resolved one.

### The montage

The store was wiped to zero rows and the corpus replayed before the capture, because the write pass leaves
residue that would have made the montage *misleading* rather than merely different: it creates its own topic
(the store held **2 topics and 4 axes**, not the corpus's 1 and 3) and it corrects an axis, so the Current Work
lane would have shown a **parked** axis where the composition must show the **inferred active** state — the
qualification (C8) is part of what the montage is for. `replay-corpus.mjs` refuses to seed a second copy of an
existing topic by design, which is why the wipe is the documented route (README, "Run the acceptance pass").
`docs/ux-v2/fidelity/side-by-side/topics.png` and its siblings are regenerated from this capture at revision
442; the caption names the served revision and version. Whether the refinement closes the fidelity question is
the reviewer's call, not this record's — and no capture pipeline is evidence of composition on its own.

### Not changed, deliberately

`--rd-gap: var(--rd-gap)` in the theme's spacing vocabulary is self-referential, so every `gap: var(--rd-gap)`
declaration (about twenty rules) is dropped and those rows sit tighter than designed. Repairing it moves
spacing page-wide and would move every geometry figure in the accepted C1 records, so it is **reported here,
not changed** inside this pass; the rules added by this pass use `--rd-gap-block` and `--rd-gap-tight`, which
resolve.

## Hygiene

The throwaway `RD_DIAG` instrumentation is **removed** from the tree, not committed: the page-side
trace and the harness's diagnostic printouts are gone. Two harness changes were kept because they are
permanent fixes rather than instrumentation — the recorder's explicit identity parsing (the truncation
trap above), and `refresh.sh` now taking the same dashboard target the pass uses and refusing when it
does not answer (the guard's `:4399` fallback is the API origin here, which is what made a working
deploy report "the page never fetched a plugin UI asset").

The transcripts and screenshots in this commit are refreshed records of the runs above, not working
scraps. `docs/corpus/transcript/actions.jsonl` is the corpus record those runs were replayed from: it is
a regeneration of the same 695 calls (identical `(action, input)` sequence against the previously
committed one, all HTTP 200 — results differ only by server-minted ids and timestamps). The two
protected invariants — the render gate and the ≥1.25× geometry check — are untouched.

## Fixture pair on the final build (2026-10-02) — merge hygiene, and what it caught

The reviewer kept this outside the fidelity verdict and asked for it before the branch is treated as
final merge evidence: the fixture pair still recorded revision 410, so fixture-only subjects
(blocked-state treatment, the bare repository, long tags) had never been measured against the C1
rework's own CSS and hierarchy. It was the right call — the first run failed two checks, at both
viewports.

**Neither failure was a page defect, and neither could be seen on the corpus.** The corpus has one
topic with three non-terminal axes; the fixture has two topics, six axes on the dense one and two
terminal ones, and it is the only dataset that exercises `completed`/`abandoned` rendering, the bare
repository and the blocked-state colour.

1. `the visible detail carries its own topic's axes and none of another's` failed with the two terminal
   axes reported as missing. The payload carries all six and the pane renders all six: the two sit
   inside the C1 rework's own fold, `<details class="rd-completed-fold">` — **"Completed and abandoned
   work (2)"** — which is collapsed by default, and Chromium hides a closed `<details>`'s content from
   `innerText` (and from a screenshot). The check read rendered text, so it could not see them, and it
   was equally blind to a leak hidden inside a fold. The fold arrived with the C1 rework (`241e28b`),
   *after* the revision-410 evidence — so this was **not** a regression from the hierarchy pass: it is
   the fixture pair never having been run against the rework's own structure.
2. `the axis's fuller detail is one click away, and the disclosure grows to hold it` failed as
   `disclosure 39px holding a 0px description`. That check was added by the hierarchy pass, and its
   assumption was wrong, not the control: every fixture axis carries `description: ''`, and the page
   renders the description element only when there is one (`{axis.description ? … : null}`), so the
   disclosure correctly held the confidence cluster alone. The corpus's non-empty descriptions are
   exactly what made the first version look right.

Both were fixed in the harness, not in the page — no product change was needed or made:

- the axis-presence check reads the DOM now (each card's own `data-rd-axis-title`), requires every own
  axis to be present as a card *or* rendered, requires the fold's stated count to equal the number of
  cards it holds, and detects another topic's axis by DOM presence — so a fold can hide neither a
  missing axis nor a leak;
- the disclosure check measures growth against the **summary** — the collapsed box *is* its summary, so
  `box(closed) == summary(closed)` and `box(open) − summary(open) > 0` — and requires the description
  to be inside only when the payload's own axis has one.

**Result: the fixture pair is green on the final build, and all five records now come from one harness
on one build.**

| record | result on revision 442 |
|---|---|
| fixture 1440×900 | **140 · 0 · 0** (was 130 · 0 · 0 at revision 410 — the ten checks the hierarchy pass added) |
| fixture 1280×800 | **139 · 0 · 1** — the skip is the first-screen rail check at a non-reference viewport, with its reason |
| corpus 1440×900 | **115 · 0 · 23** |
| corpus 1280×800 | **114 · 0 · 24** |
| corpus 1440×900 `--write` | **127 · 0 · 23** |

Both instances were verified to serve the same bytes before these runs: corpus revision 442 and fixture
revision 28, both `0.2.0+dev.aed4d024c37e`, asset sha256
`e289d9d8f4ad3b8cb5ea4fd032f07d2976f37ec23718e03eae888364759e4e76`. The fixture instance had to be given
the build — it was serving `0.2.0+dev.ae3049008d5f` (revision 20) — and the earlier reading that it was
"already serving this build" was an artifact of a guard invocation that sourced the corpus env file
*after* `NAKAMA_URL` had been exported, which silently retargeted the corpus instance. The fixture
instance has its own env file and its own seed admin, so that env file is the way it is addressed.

The revision-410 fixture records are kept beside the new ones as
`docs/layout-fixtures/verify-fixture-read-*.revision-410.txt`: the failing run overwrote the canonical
paths, so both eras are on disk rather than only the newer one.

**One design question this raised, left with the reviewer rather than decided here:** on a topic that
has terminal axes, that fold is closed by default. No corpus could show it, so the macro-composition
review could not have seen it. The fold serves the "one dominant reading surface" goal and states its
count honestly; making terminal work visible by default is a one-line change, and the harness now
asserts the fold's honesty either way.
