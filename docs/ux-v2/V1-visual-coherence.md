# V1 — the visual-coherence pass

**Unit:** V1. Its own acceptance record, separate from UX-v2 composition acceptance (which closed at
`ux-v2-composition-complete`). Nothing here revises C1–C5.

**Status:** Phase 2 complete and committed; **at the visual checkpoint**. Phase 3 has not started.

**Measured build:** `ui/app.js` sha256 `6febf4168c5b6912…`, in the commit that carries this document
(`git log -1 -- docs/ux-v2/V1-visual-coherence.md`), served to the preview harness (`harness/preview/`, host
runtime, no instance). The digest is quoted rather than a short hash because a hash inside its own commit is
self-referential and moves on every amend.

## What this pass is

The composition phase made the product *structure* coherent. Reading all ten montages at once (corpus +
crowded fixture × five views) showed that the **visual system** was not: index rows, detail headers,
axis/work rows, activity feeds, recency and section headings had each been built once per tab, and the same
conceptual element therefore had several spellings. V1 is that pass: repair the spacing system, extract the
one primitive the drift actually needs, then work the rows with montages in hand.

## Before measurements

| What | Measured before | After |
|---|---|---|
| `--rd-gap` computed value | `""` (declared `var(--rd-gap)` — a self-reference) | `8px` |
| rules reading it | 11, all dropping | 11, all applying |
| `.rd-view-title` vs shell `.rd-page-title` | 14px vs **16px** — the brand outranked the view | 23px vs 16px |
| Axis representations | 4 (`AxisItem`, `AxisScanItem`, `PersonAxisRow`, `AxisDetailCard`) disagreeing on class vocabulary (`.rd-axis-secondary` vs `.rd-axis-reading`) | 4 adopters, one grammar |
| People's section label | `CURRENT INVOLVEMENT` over a list containing completed axes | `INVOLVEMENT`, terminal axes last |
| index rail / dominance (protected) | 240px, problem/activity 1.67× | **unchanged** |

The dead token was masked rather than obvious: sites carrying a literal value
(`.rd-current-work > .rd-axes { gap: 18px }`) hid it, which is why the page read as *dense* instead of
*broken*. That is the whole reason the first fix is this one.

## What changed

1. **The spacing token is real again** (`--rd-gap` = 8px). 8px is the *repaired intended* value, not a tuned
   one: contexts wanting a tighter or looser step take `gap-tight`/`gap-block` after the montages are read,
   rather than being hand-adjusted on top of a repair.
2. **The view's name is the page-level type step** (`--rd-title-view`, 23px), with the hint on its own line at
   the metadata step. No second token for the entity title — that is the host's own `--rd-title`, and a token
   nothing reads is the bloat this pass exists to remove.
3. **`AxisRow`/`AxisHead`** — the one genuine extraction. `head · reading · blocker · references · disclosure`, presentational props, no projection type, no per-caller
conditional, every `data-rd-*` hook the caller's. The reading is a **slot, not a field**: `AxisScan` carries no current state, so "no blocker
   recorded" stays the caller's truthful sentence rather than prose the primitive invents.
4. **People's section is `Involvement`**, axes stably partitioned non-terminal-first, each keeping its state
   badge. One section, no `Current | Completed` sub-navigation.

Verified by attribute set rather than by eye — **192 `data-rd-*` names before, 192 after, none lost, none
invented** (`harness/verify-page.mjs` reads them, and some are the only way a check can tell which projection
is on screen).

## The attribute gate — and what it does and does not mean

The refactor's gate was **"rendered attribute inventory before = rendered attribute inventory after"**
(192 → 192). A sweep of the harness afterwards found 12 names it selects that the source no longer renders.
**That is not automatically drift** — the first pass over it labelled them "stale", which is wrong and is
corrected here so nobody acts on it:

| Category | Meaning | Action |
|---|---|---|
| **positive selector** | the element must exist; absence is a failure | the hook must be rendered |
| **negative selector** | the element must **not** exist; its absence *is* the assertion | **leave it unrendered** |
| **rendered unasserted hook** | DOM/CSS/debug contract, no executable coverage yet | keep it; not disposable |

Traced to the `check(…)` that consumes each read:

- **Negative selectors (9) — leave exactly as they are:** `data-rd-progress-empty`, `-events`, `-event`,
  `-filters`, `-axis`, `-topic`, `data-rd-progress-summary`, `data-rd-detail-counts`, `data-rd-edit-open`,
  `data-rd-topic-editor`. Each is consumed by an assertion of the form `=== 0` — *"C4: the retired window-wide
  feed is gone — not moved, and with nothing of it left behind"*, *"the topic detail offers no broad edit
  control (D7: Topics is read-first)"*, *"N count strip(s) in the detail"*. **Re-adding any of these
  attributes would fail the acceptance pass.**
- **Still-valid indirect contract — leave:** `data-rd-topic-card` is half of `served-build.mjs`'s
  `[data-rd-topic-card], .rd-topic-card` build fingerprint, and the class half is live on the landing cards
  (`src/ui.tsx:3355,3459`). Half a live selector is not a cleanup.
- **Genuinely dead — fixed:** `data-rd-topic` in `focus-matrix.mjs`, below.

The corollary is why 192 → 192 is the stronger gate: the **41 unasserted hooks** are still CSS, screenshot,
debug and future-coverage contracts, and absence from the harness does not make them disposable.

### The one confirmed leftover, fixed (`28e73c2`, harness-only)

`focus-matrix.mjs` labelled a control class by `data-rd-topic` — unrendered since the card was retired —
instead of the live `data-rd-index-topic` on the Topics index buttons. It could never match, so the Topics
rail was the **only** index rail whose rows fell through to the class fallback and were reported in the H1
focus record as a bare `button.rd-index-item`. The committed corpus record shows `index-row-person` ×27 and
`index-row-repository` ×27 — and `topic-row` ×0. Measured on the corpus preview, with the hook chain read out
of the harness itself: the retired hook matched **0** instances, the live one matches **4**, and unlabelled
`rd-index-item` instances fall **6 → 2**. No UI source change; a label cannot affect what the pass measures.

**Stated boundaries of that fix:**

- **The focus pass has not been re-run** — including `--negative-control`. It needs a served instance, and
  this machine has neither an instance nor the estate's env file. It is on the Phase-4 list and rides that
  run.
- The **2 remaining** unlabelled `rd-index-item` instances are the Progress rail's (`data-rd-index-axis` is
  not in this chain). That rail was never in the chain, so labelling it is a new decision rather than a
  repair — left alone deliberately.
- The **41 unasserted hooks were not touched.**

## Boundaries

- **The frozen contract is untouched** (`docs/ux-v2/contract/`, byte-unchanged). Its omission of `AxisRow` is
  historical fact, and the rule lands in `DECISIONS.md` §14.3 instead.
- **The preview is a visual instrument, not evidence.** These montages are renders against the host runtime
  with no instance; the served-instance acceptance pass (§Phase 4) is what closes V1.
- **Rehearsed and rejected:** moving the Progress index pill beside its title (DECISIONS §14.5). Rendered,
  measured, reverted — see that entry for why.
- **Host-owned controls** (the plugin's toolbar chrome) are outside this pass, as in H1.

## Reproducing the montages

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run preview:fidelity                          # corpus
bun run preview:fidelity -- --dataset fixture      # crowded fixture
# → docs/ux-v2/fidelity/preview/<dataset>/side-by-side/<view>.png
```

Generated output: `docs/ux-v2/fidelity/preview/` is **not tracked** (policy set 2026-10-03, AGENTS.md §*What is
tracked*) — a montage is rebuilt from the source, never committed.

## At the checkpoint (what Phase 3 inherits)

Phase 3 is the row-by-row pass over twelve observed rows, split **V1-A** (coherence-critical: the ones the
review's own table names) and **V1-B** (polish). It is expected to shrink: several spacing complaints were
symptoms of the dead token, and the axis rows are now one grammar. It starts after the visual checkpoint, and
only the items that survive it get executed.
