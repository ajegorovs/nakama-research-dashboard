# C1 acceptance record — 2026-10-02

Status recorded at the reviewer's direction, and updated when the two open items were closed in the
follow-up session.

## Classification

| aspect | state |
|---|---|
| functional composition | **accepted** |
| write-path acceptance | **accepted** (2026-10-02, follow-up session — see § Write-path acceptance) |
| visual fidelity | capture fixed, first trustworthy montage taken; **sign-off is the reviewer's** |
| C2 | unblocked once the reviewer rules on the two items above |

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
