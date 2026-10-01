# Layout fixtures — the states the real corpus cannot show

The canonical dataset for this dashboard is `docs/corpus/`: a real public repository's history, seeded
through the plugin's own action surface. Its value is that nobody chose its state. Its limit is that a
real repository does not contain every state a layout has to survive — and the ones it lacks are the
layout-critical ones.

Measured, on the same 43-check read pass:

| dataset | result |
|---|---|
| `docs/corpus/` (real) | 36 passed · 0 failed · **7 skipped** |
| `docs/layout-fixtures/` (this directory) | **43 passed · 0 failed · 0 skipped** |

Both at 1440×900 and 1280×800. The seven skips are not harmless: they are the blocked state, the
hidden-axis case, the evidence-free claim, and the two people cases. A redesign can look excellent on
the corpus and regress exactly those.

(Those two figures are the numbers as first measured, on a 43-check pass. Checks have been added since —
U1's "every axis state the payload carries reaches the page as that state", then U4's window check, then six
with U4's step-2 composition (the three-column Progress layout and its selection, compared against
`get_progress`'s own answer), then five with step 3 (the optional Plan section: its silent absence, the stored
positions, the plan ↔ problem link both ways, and the unordered-plan discriminator) — so the same fixture pass
now reports **62**, at both viewports, with nothing failing. The transcripts in this directory are the record;
read a run's own summary line rather than a number in a document.)

**Rule: the corpus stays canonical.** This directory is a *second* dataset, applied to the instance
instead of the corpus and never mixed into `docs/corpus/`. Every file here is labelled synthetic.

## What it covers

| State | Check that skips on the corpus | What the fixture supplies |
|---|---|---|
| Blocked axis with a reason | "the blocked axis shows its blocker text" | one axis `state: blocked`, `blockerConfidence: confirmed` |
| Attention styling | "a topic with a blocked axis is visually distinct" | the blocked axis sits on the first card |
| A card that hides axes | "a card offers to expand when it hides axes" | 6 axes on one topic (`LEAD_AXES` is 3, so 3 are hidden) |
| The seventh axis state | "every axis state the payload carries reaches the page as that state" | one axis `state: abandoned` — the only state neither the corpus nor the earlier fixture reached. Without a subject, "the page renders `abandoned`" is untestable: a missing badge and a correct badge look the same in an assertion |
| Evidence-free claim | "an axis with no evidence says so and shows no confirmed claim" | an axis with no activity, no branch, no document — `evidence 0`, `conf [inferred]` |
| An axis that states no progress | "an axis that states no progress carries no confidence for it" | the same axis, with no current-state claim at all |
| One person, several topics | "one person on several topics shows each topic with its own axes underneath" | `Fixture Alpha`, attributable, 2 topics / 4 axes |
| A person with no mapped account | "a person filter that matches nothing attributable says so…" | `Fixture Zeta`, `attributable=false`, 1 topic |

## Contents

- `screenshots/1440x900/`, `screenshots/1280x800/` — the six views, captured from the fixture state.
- `verify-fixture-read-*.txt` — the harness transcript for each capture, verbatim.

## Reproducing it

Apply the fixture to a checkout's instance (it wipes nothing itself — apply it to an empty or
throwaway instance so the two datasets do not mix):

```bash
node harness/apply-layout-fixture.mjs --env-file /tmp/nakama-review.env
```

It prints what it wrote and the resulting rollup, and exits non-zero if any write was refused — a
fixture that silently fails to apply is worse than none.

Capture, from the repository root (see the README's "Run the acceptance pass" for the instance, the web
dev server and the credentials file):

```bash
bun run harness:fixture                                            # 1440x900
bun run harness:fixture -- --viewport 1280x800
```

The run writes its transcript into this directory and its screenshots under `screenshots/<viewport>/`.

Then put the instance back the way you found it — use a second instance (or a fresh `NAKAMA_CONFIG_DIR`)
rather than wiping the corpus one, or wipe at row level and re-seed `docs/corpus/`.

## Caveats

- **Synthetic by construction.** It proves the states *render*; it says nothing about whether they are
  representative, or about density under a realistic load. The corpus is the density reference.
- **The names are ordered on purpose.** `Fixture Alpha` and `Fixture Zeta` are alphabetical so that the
  person-first view selects the multi-topic person first; the same for the newest activity. That is a
  fixture convenience, not a naming convention for real data.
- **Not a substitute for the corpus.** If a claim can be checked against the real dataset, check it
  there.
- **`Fixture Alpha` carries the dev instance's own actor id** (`user_admin`, the same id the corpus
  transcript shows). That is what makes the person *attributable*; no personal account is referenced.
