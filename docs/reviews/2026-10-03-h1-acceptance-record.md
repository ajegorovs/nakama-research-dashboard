# H1 acceptance record — keyboard focus visibility (2026-10-03)

**Unit:** H1, the last open item of the UX-v2 composition phase, taken against the **merged** composition
rather than the branch it was parked on. **Build judged:** revision 527 / `0.2.0+dev.e507fa4ebc4a` (corpus
instance; fixture revision 133 on the same release), served `ui/app.js` sha256
`551a1d3695bf309e58b1c594aa2f71d4b6feadbb0dfc0eb6d7dd0d66c5ab79af`.

This is the review trail for the verdict below. The unit's own doc is
[`../ux-v2/H1-focus-visibility.md`](../ux-v2/H1-focus-visibility.md); the standing decision it produces is
[`../ux-v2/DECISIONS.md`](../ux-v2/DECISIONS.md) §12; the runnable pass is `harness/focus-pass.sh`
(`bun run harness:focus`).

## The verdict (reviewer, 2026-10-03, verbatim)

> H1 is accepted.
>
> The result is exactly what this parked item was meant to establish: the final merged composition was
> keyboard-reachable and structurally sound, but the actual focus indicator failed the quantitative visibility
> threshold. Fixing that once at the plugin token/shared-control level was the right response.
>
> The post-fix evidence is strong enough to close it:
>
> - all 14 control classes have visible focus treatment;
> - nothing is clipped or off-screen;
> - keyboard order and the shell-title/home regression pass;
> - measured focus contrast is now about **4.61:1–5.02:1**, comfortably above the 3:1 non-text threshold you were
>   enforcing;
> - the negative control forces 10 failures, so the harness is demonstrably sensitive;
> - both datasets and both reference viewports pass;
> - the four main acceptance records retain the same check descriptions, so the focus fix did not perturb C1–C5
>   semantics;
> - the host-shell icon issue is correctly out of plugin scope, and the retired read-detail finding no longer has
>   a subject after D7.
>
> I would record the classification as:
>
> **H1 keyboard-focus validation: closed.**
> **H1 product defect: fixed in one shared focus rule.**
> **Composition C1–C5 regression check: clean.**
> **UX-v2 composition phase: complete.**

## Classification

| aspect | verdict |
|---|---|
| keyboard focus validation (14 control classes, both datasets, both reference viewports) | **accepted — closed by the reviewer** |
| the product defect (indicator below the 3:1 non-text minimum) | **fixed in one shared focus rule** |
| regression check against the four standard records | **clean — identical check descriptions and verdicts** |
| host-shell controls (the shell's own chrome and icon buttons) | **out of plugin scope — recorded, not closed** |
| SQLite `SQLITE_BUSY_RECOVERY` runtime/store debt | **open, deliberately separate from phase closure** |

## The defect, and what was measured

The parked item's question was whether the merged composition's focus treatment is *visible*, not whether
controls exist. Measured answer, before the fix: every one of the 14 classes **did** paint an indicator, none was
clipped, none sat off-screen, and keyboard order plus the title/home regression passed — but every indicator
measured **2.04–2.11:1**, below the 3:1 non-text minimum. Two sources, one root cause:

| source | what it painted | measured |
|---|---|---|
| the plugin's own controls (tags, index rows, disclosures, folds, the notes/activity lists, the page title) | the browser's 1px default outline in the host's ring colour at half alpha | 2.04–2.11:1 |
| the host primitives it renders (view/window choices, toolbar buttons, the archived-topics switch) | the host's 3px `ring-ring/50` ring — the computed `box-shadow` still shows that layer as transparent | 2.04:1 |

## The fix

One rule in the plugin's own token block — every control the page draws gets its indicator from one place:

```css
--rd-focus: var(--ring, oklch(0.55 0.15 65));
--rd-focus-width: 2px;
--rd-focus-offset: 2px;
[data-plugin-id="research-dashboard"] :focus-visible:focus-visible {
  outline: var(--rd-focus-width) solid var(--rd-focus);
  outline-offset: var(--rd-focus-offset);
}
```

The theme's own hue at **full** strength (the 50 % is the `ring-ring/50` modifier, not the token), 2px wide,
offset clear of the control's own edge. The doubled `:focus-visible` is deliberate and was named with
`CSS.getMatchedStylesForNode` rather than guessed: the host's base layer declares `outline-color` as a longhand
after this sheet, so at equal specificity it won the *colour* while this rule won width and offset. No
`!important`. Measured after: **4.61:1** on the muted card, **5.02:1** on white, nothing clipped, both datasets at
both reference viewports.

## Evidence

| evidence | result |
|---|---|
| focus pass, corpus 1440×900 / 1280×800 | **69 pass · 0 fail · 0 skip** (per view) |
| focus pass, fixture 1440×900 / 1280×800 | **65 pass · 0 fail · 0 skip** (per view) |
| control classes measured | 14, each with a visible indicator and 3:1+ contrast |
| negative control (CSS removing every indication, `--negative-control`) | **10 checks fail** — the measure can see a removed indicator |
| order | no step moves focus backwards; the walk enters the plugin from the shell (tab stop 38 from the top) |
| mouse-only reachability | nothing clickable by mouse is unreachable by keyboard |
| title/home regression | reachable by Tab, and Enter returns to the landing with the window preserved |
| standard pass re-run on this build | 151/0/28 · 150/0/29 (corpus), 180/0/1 · 179/0/2 (fixture) — **0 differing check descriptions** vs the merge-time records |
| gates | `bun run check` 126/0 · `harness:identity` 82/82 · `harness:records` clean |
| served-build guard | OK on both instances (corpus revision 527, fixture 133) |

Transcripts: `../ux-v2/focus-{corpus,fixture}-{1440x900,1280x800}.txt`, the negative control as
`../ux-v2/focus-corpus-1440x900-negative-control.txt`. Superseded standard records are kept beside the new ones
as `*.revision-511.txt` (corpus) and `*.revision-112.txt` (fixture).

## Boundaries and what stays open

- **The shell's own controls are outside this rule.** `[data-plugin-id]` scopes the plugin's subtree; the host's
  chrome and icon buttons — including the "icon button in the shell" the parked attempt flagged — are a host-level
  item that a plugin cannot close. Recorded as such rather than dropped.
- **The retired finding has no subject.** The parked attempt's "read-detail control" no longer exists: D7 made the
  detail persistent, so the closest surviving control (the narrow note/correction disclosure) is what gets
  measured.
- **Instance counts are reported, class coverage is asserted.** Whether a scroll container is in the tab order
  depends on whether it currently overflows, and the topics pane re-renders while a walk passes through it; the
  per-view counts and the page's own reason per unreached element are in each transcript.
- **The host's translucent ring still paints underneath** on the host's own primitives. The plugin's outline is
  the strongest mark and is what the record quotes; suppressing a host utility the plugin does not own is not the
  fix.
- **SQLite `SQLITE_BUSY_RECOVERY` / `database is locked` stays open** as a separate runtime/store item
  (`AGENDA.md`), unmasked and not a reason to hold the phase open.
