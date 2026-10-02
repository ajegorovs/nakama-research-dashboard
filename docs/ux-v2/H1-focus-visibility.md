# H1 — keyboard focus visibility on the merged composition

*Unit H1 of the UX-v2 composition phase. Measured against the merged `main`; one defect found, fixed at the
shared-primitive level, matrix re-run green. Transcripts: `focus-corpus-1440x900.txt`,
`focus-corpus-1280x800.txt`, `focus-fixture-1440x900.txt`, `focus-fixture-1280x800.txt`, and the negative
control `focus-corpus-1440x900-negative-control.txt`.*

## Scope

The reviewer's brief of 2026-10-02 narrowed this to **keyboard focus visibility** — not a general accessibility
redesign:

- the merged composition, at the two reference viewports (1440×900, 1280×800);
- the default landing plus the four navigation destinations;
- tab through the controls a reader can actually reach: shell title/home, view choices, window controls, index
  rows, entity tags, disclosure summaries and folds, the narrow note/correction controls, the archived-topics
  switch, and the repository/topic drill-ins;
- **compare the focused render of each control class against its unfocused render** and require a visible
  distinction — rather than checking for a particular colour or outline token;
- the indicator must not be clipped by an ancestor, must not sit off-screen, and must not be effectively
  invisible against the surface it is drawn on;
- keyboard order must hold through the master/detail layouts;
- non-interactive text and status badges are explicitly *not* required to take focus;
- one regression check: on a subview, keyboard focus reaches the title/home affordance and Enter returns to the
  landing **without losing the reader's window**.

## Method

One real keyboard walk per view, from the top of the document (`harness/focus-matrix.mjs`). Tab moves focus; the
**first sighting of each class** is the one that is measured, so the shared primitives are tested once per class
and then sampled across views, which is the shape the brief asked for.

- **Focused vs unfocused, same element.** For a measured step: settle the element's own animations, read its
  computed style, blur *that same element*, settle again, read the unfocused render. A class is compared against
  itself, not against a neighbouring control.
- **Settle, don't sleep.** The read waits on the element's own running animations (`getAnimations`, then one
  frame). Tailwind's `transition-colors` includes `outline-color`, so an immediate read catches the indicator
  mid-interpolation: the archived-topics switch measured 2.04:1 that way and 4.61:1 once the transition had
  finished. A blanket delay would be the settle-delay this project forbids; waiting for the element's own
  animations measures the render the reader ends up looking at.
- **The indicator is whatever the focused render actually paints**, in the order the compositor would use it:
  an outline; else the ring Tailwind carries in `--tw-ring-shadow` (the computed `box-shadow` can still show that
  layer as transparent); else a non-transparent box-shadow layer that is new here; else a border/background
  change — with colours compared **as colours**, because Chromium serialises the same value as both `oklch()` and
  `oklab()` and a string comparison invents differences that do not exist.
- **Contrast** is computed from the settled indicator colour, alpha-composited over the element's own resolved
  background (walking up for the first non-transparent one), against the WCAG 2.1 non-text ratio of 3:1. That is
  the standard behind "not effectively invisible against the background", not a chosen number.
- **Clipping** inflates the element's rect by the indicator's own width and offset and tests it against every
  scrolling/clipping ancestor, plus the viewport — an outline paints outside the border box, so a rule that is
  right in isolation can still be cut in half by a rail.
- **Order** is checked pairwise with `compareDocumentPosition` rather than against a snapshot: focus moving
  backwards is a defect; a step whose predecessor is gone is counted as a re-render and reported as such.
- **Reachability** has a mouse-side check (an element with `cursor: pointer` that is not inside a real control and
  cannot take focus), and the walk is entered from the shell so the plugin's own first tab stop is a measured fact.
- **Title/home regression:** rewind to the top, Tab until the title holds focus, press Enter, assert the landing
  rendered and that the window the reader had pressed is still pressed.

## What is asserted, and what is only reported

Asserted: per-class indicator presence, per-class contrast, per-class clipping and on-screen position, forward
order in every view, class coverage, no mouse-only control, and the title/home regression.

Reported, not asserted: **instance-level** coverage per view. The topics pane re-renders while the walk moves
through it, so a control count taken before the walk cannot be held against the page. Each view prints
`N indexed, M tab stops walked, K not reached`, each not-reached element with the page's own explanation for it,
and the count of steps that followed a re-render. What remains load-bearing is the class coverage — every class
the page exposes is reached and measured at least once, which is the claim the brief asked for.

## The defect

Before the fix, **every one of the 14 classes painted an indicator, none was clipped and none sat off-screen,
and order and the title/home regression passed — but every indicator measured 2.04–2.11:1**, below the 3:1
non-text minimum. Two sources, both inherited rather than authored by the plugin:

| Where | What was painted | Measured |
|---|---|---|
| the plugin's own controls (tags, index rows, summaries, folds, title, rails) | the browser's default 1px `outline: auto`, in the host's ring colour at half alpha (`color-mix(in oklab, var(--ring) 50%, transparent)`) | 2.04:1 on a card, 2.11:1 on white |
| the host's own `Button`/`Switch` primitives | the host's 3px `ring-ring/50` box-shadow ring | 2.04–2.11:1 |

The cause is a theme decision, not a missing rule: the host paints its ring colour at 50% alpha
(`ring-ring/50`), and the plugin's controls inherited the browser default in that colour. Visibly present, but
faint.

## The fix

One rule, in the plugin's own token block (`src/ui.tsx`), so every control the page draws takes its indicator
from one place instead of from the browser default:

```css
--rd-focus: var(--ring, oklch(0.55 0.15 65));
--rd-focus-width: 2px;
--rd-focus-offset: 2px;

[data-plugin-id="research-dashboard"] :focus-visible:focus-visible {
  outline: var(--rd-focus-width) solid var(--rd-focus);
  outline-offset: var(--rd-focus-offset);
}
```

Three decisions were driven by measurement rather than preference:

- **The theme's own hue at full strength.** `var(--ring)` is the colour the host already chose; the 50% is the
  `ring-ring/50` modifier, not the token. At full alpha it measures **5.02:1** on white and **4.61:1** on the card
  background — the same indicator the rest of the theme would draw, at a legible strength. The fallback is that
  hue for a host that sets no `--ring`.
- **A doubled `:focus-visible`.** The host stylesheet declares its ring colour as an `outline-color` longhand
  *after* the plugin's sheet, so at equal specificity it won the colour while the plugin's declarations won the
  width and offset — measured as a 2px outline in the half-alpha colour, i.e. the very defect. One extra
  pseudo-class settles it without `!important`. (The comment in the stylesheet says this too; the stylesheet is a
  template literal, so it carries no backticks.)
- **`outline`, not a box-shadow ring.** An outline paints outside the border box and moves no layout, so the
  composition geometry the acceptance records carry is untouched.

## Result, after the fix

Every class, both viewports, both datasets: `outline 2px rgb(180, 83, 9)` (the theme's `#b45309` at full alpha),
not clipped, on screen.

| Class | Views reached in | Contrast |
|---|---|---|
| `button[view-option]` (nav) | all five | 5.02:1 |
| `button[window-option]` | all five | 5.02:1 |
| `button[host:switch]` (archived topics) | all five | 4.61:1 |
| `button[host:button-default]` | all five | 5.02:1 |
| `button[host:button-sm]` | overview, topics, repositories, progress | 5.02:1 |
| `button[home].rd-page-title.rd-home` | topics, people, repositories, progress | 5.02:1 |
| `button.rd-index-item` | topics, progress | 4.61:1 |
| `button[index-row-person].rd-index-item` | people | 4.61:1 |
| `button[index-row-repository].rd-index-item` | repositories | 4.61:1 |
| `button[entity-tag].rd-tag` | topics, people, repositories, progress | 5.02:1 |
| `button[entity-tag].rd-tag.rd-tag-compact` | overview, topics, people, repositories | 5.02:1 |
| `summary(in .rd-axis-more)` | topics, people | 5.02:1 |
| `summary(in .rd-completed-fold)` | topics, repositories | 5.02:1 |
| `summary(in .rd-narrow-write)` | topics | 5.02:1 |

Run summaries: corpus 1440×900 **69 passed / 0 failed / 0 skipped** · corpus 1280×800 **69/0/0** · fixture
1440×900 **65/0/0** · fixture 1280×800 **65/0/0**. The check count differs between datasets because the classes a
dataset's views expose differ, not because checks are skipped — nothing is skipped in any run.

Order and reachability, per view (corpus 1440×900): overview 15 indexed / 15 walked / none skipped · topics 41/41
with 4 not reached · people 26/26 with 3 · repositories 28/28 with 1 · progress 67/67 / none. Every view's walk
stays forward; nothing is clickable by mouse without being reachable by keyboard; the plugin's first tab stop is
**tab 38** from the top of the document (the shell chrome precedes it); the title is reachable and Enter returns
to the landing with the reader's window still pressed (`window 14: aria-pressed=true`).

The not-reached instances are the Chromium **focusable-scroller** containers (`ul.rd-activity`, `ul.rd-notes`)
and duplicate instances of classes measured elsewhere in the same run. A scroll container is in the tab order
only while it actually overflows, and that changes as the walk scrolls its neighbours, so this count moves
between runs — which is exactly why it is reported with the page's own reason per element rather than asserted.
It is the reason the class-coverage check, not the instance count, carries the "no class is missed" claim.

## Regression check: the standard pass, re-run on the fix

This is a source change, so the acceptance records were re-taken on the fix's build rather than assumed
unaffected. All four runs are green and **reproduce the merge-time records exactly in check set and verdicts**:

| Record | This build | Superseded record | Differing check descriptions |
|---|---|---|---|
| corpus 1440×900 | 151 pass / 0 fail / 28 skip | 151/0/28 | 0 |
| corpus 1280×800 | 150/0/29 | 150/0/29 | 0 |
| fixture 1440×900 | 180/0/1 | 180/0/1 | 0 |
| fixture 1280×800 | 179/0/2 | 179/0/2 | 0 |

Only the *detail* text differs, and only where a check quotes a dataset-derived value (ids, counts, subject
names) — both datasets have been reseeded since. The superseded copies are kept beside the new ones as
`*.revision-511.txt` (corpus) and `*.revision-112.txt` (fixture), named for the instance revision they were taken
at, following the existing `.revision-410`/`.revision-442` practice.

The refreshed captures move by **0.08–0.35 % of their pixels, in a band at the palette or at one control** — the
frames that carry focus, which is what an ink-only outline predicts — except `docs/screenshots/dashboard.png`,
which moves by 18.7 % across the whole frame: that is the landing shot, whose activity rows and relative dates are
dataset-derived, so it tracks the reseed and the clock rather than this rule. (Measured with a pixel diff against
each file's committed predecessor; the bboxes are in the run notes.) Nothing in the composition *geometry* moved,
and the checks that assert it are unchanged.

## Relation to the parked H1 attempt (`c6852df`)

An earlier H1 check was written against an **intermediate** composition and parked for exactly that reason; it
reported two findings, and this pass either closes or re-scopes both rather than ignoring them:

- *"No visible focus indicator under real Tab on the read-detail control and on an icon button in the shell — the
  theme's focus ring resolves transparent, so the difference is computed but nothing appears."* Same defect class
  as measured here, and closed for everything the page draws: the merged page's controls all paint an indicator,
  and after the fix they paint one at 4.61–5.02:1. Two qualifications the record owes the reader: the **shell's
  own** controls (its icon buttons and chrome) are outside this rule's reach — `[data-plugin-id]` scopes the
  plugin's subtree only, so a host-level icon button remains a host-level item, not something a plugin can fix;
  and the **read-detail control no longer exists** — the composition made the detail persistent (`data-rd-detail-mode="persistent"`,
  the D7 ruling), so the finding is retired *with its subject* rather than silently dropped. The closest surviving
  control, the narrow note/correction disclosure, is measured (`summary(in .rd-narrow-write)`).
- *"The check's own repeat/trap inference is too crude — a wrap-around or a re-rendered node looks identical to a
  repeated stop, so 'N stops / M distinct' cannot assert a trap."* Accepted, and **not** resurrected: this pass
  asserts nothing about traps. It checks forward order pairwise (`compareDocumentPosition`, backwards = defect,
  predecessor gone = re-render, counted), and it asserts class coverage rather than instance arithmetic — which is
  the same insight, applied instead of patched.

The parked additions to `harness/verify-page.mjs` were not merged or copied: this pass is its own module
(`harness/focus-matrix.mjs`) with its own wrapper, so a reader can see what the focus checks are without reading a
2 000-line acceptance file, and `read-pass.sh` gains no focus checks it would have to re-gate.

## Limits, stated

- **The host's translucent ring still paints underneath.** The plugin's outline is drawn over/in the same band as
  the host's 3px `ring-ring/50` box-shadow on the host's own primitives. The record quotes the outline because it
  is the strongest mark and the one the plugin controls; the translucent ring beneath it is not removed (that
  would mean suppressing a host utility the plugin does not own).
- **The measurement is computed style plus geometry, not pixel diffing.** There is no DOM rasteriser in this
  harness, and the brief's criterion — rendered style, visibility, clipping, contrast — is answerable from those;
  the sensitivity of the measure is proven below rather than asserted.
- **A focused snapshot is a snapshot.** The indicator is measured as the settled render of one instance of each
  class in each view it appears in; a class whose only instance is inside a collapsed disclosure is not measured
  in that view (a closed `<details>` is not a visibility boundary for geometry — Chromium returns a non-zero box
  for its content — but its content cannot take focus, so it is excluded from the index).
- **`tabindex="-1"` elements are excluded** from the index as deliberate non-tab-stops, and reported by the
  mouse-only check if they also look clickable.

## Sensitivity: the negative control

`bash harness/focus-pass.sh --dataset corpus --viewport 1440x900 --negative-control` injects CSS that removes
every focus indication and then requires the per-class measure to fail. It does: **10 checks fail** (indicator
presence and contrast, across the classes the walk reaches), and the wrapper exits 0 only because that is the
expected outcome. Without this, "all classes pass" would be equally consistent with a harness that cannot see a
missing indicator at all.

## Build identity

| | |
|---|---|
| release served by both instances | `0.2.0+dev.e507fa4ebc4a` (corpus revision 527, fixture revision 133) |
| `ui/app.js` sha256 | `551a1d3695bf309e58b1c594aa2f71d4b6feadbb0dfc0eb6d7dd0d66c5ab79af` |
| predecessor (merge-time) release | `0.2.0+dev.a4431120a2da` |
| precondition | `harness/served-build-guard.mjs` passes before anything is measured; the wrapper REFUSES (exit 3) otherwise |

The served bytes are the repo's build and the vendored copy — three-way hash comparison is in the guard's own
output, and the guard is what caught the wrong-instance reinstall described below.

## Trap this pass paid for

The corpus env file carries **no `NAKAMA_URL`** (its port is a unit-level choice), so a shell that had earlier
sourced the fixture's env file silently redirected a "corpus" reinstall to the **fixture**: the reinstall reported
success and a new version while the corpus instance kept serving the previous bundle. The served-build guard named
it exactly ("THE INSTANCE IS NOT SERVING THIS BUILD … served `a4431120a2da`"), and `focus-pass.sh` now resolves the
URL from `--dataset`/`--url` and exports it explicitly, so an inherited value cannot win. Every tool that touches
an instance takes its unit, port and env file as one parameter set — the same lesson as the estate's `refresh.sh`
incident, learned one layer up.

## Files

- `harness/focus-matrix.mjs` — the walk, the per-class measurement, the checks (added by this unit).
- `harness/focus-pass.sh` — the wrapper: instance resolution, served-build precondition, exit contract
  (0 verdict / 1 verdict with failures / 2 aborted / 3 refused), redacted header, transcript per dataset+viewport.
- `harness/test-redact.mjs` — the redaction guard, which also scans these transcripts.
- `src/ui.tsx` — the focus token and the one rule.
- `docs/ux-v2/focus-*.txt` — the transcripts this record quotes.
