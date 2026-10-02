# How the focus measurement works

Reference for `harness/focus-matrix.mjs` (driven by `harness/focus-pass.sh`). Read this before changing the
harness, and keep the properties below if it is ever rewritten — each one exists because its absence produced a
wrong number.

## Shape

- **One real keyboard walk per view.** Rewind the sequential-focus starting point to the top of the document
  (give `document.body` `tabindex="-1"`, focus it, remove the attribute again), then press `Tab`. Starting from
  wherever focus happens to be makes the view's first controls look unreachable, which reads as a defect. The
  tab-stop position at which the plugin is first entered is itself recorded — it is a real fact about the shell.
- **One measurement per class, sampled across views.** On the first sighting of a class in a view: settle the
  element's animations, read the focused computed style, `blur()` **that same element**, settle again, read the
  unfocused render, compare. Comparing a control against a *different* control is what makes focus checks brittle.
- **`data-fm-index` marks every tab stop** as the walk starts, so coverage can be checked without assuming the
  DOM is static.

## Reading the indicator the compositor would paint

The page is the only place with access to the custom properties Tailwind actually paints through, so the
extraction lives in the page and Node only does arithmetic:

1. `outline` — if `outline-style != none` and width > 0.
2. the ring in `--tw-ring-shadow` — the computed `box-shadow` can still show that layer as **fully transparent**,
   so a box-shadow-only reader misses the host's own `Button`s.
3. a non-transparent box-shadow layer that is new relative to the unfocused render.
4. a border/background change — **compared as colours, not strings**: Chromium serialises one value as both
   `oklch(0.922 0 0)` and `oklab(0.922 0 0)`, and a string comparison invents an indicator that is not there.

Colour parsing handles `rgb`/`rgba`, hex, `oklab()`/`oklch()` (Chromium's serialisation of modern colours) and
`color-mix(in oklab, <colour> <pct>%, transparent)` (Tailwind's half-alpha ring).

## Contrast, clipping, order

- **Contrast**: composite the indicator's own alpha over the first non-transparent background found by walking up
  the tree, then take the WCAG 2.1 ratio. 3:1 is the standard behind "not effectively invisible".
- **Clipping**: inflate the element's rect by the indicator's width + offset and test it against every
  scrolling/clipping ancestor **and** the viewport. An outline paints outside the border box, so a check that
  forgets the inflation misses exactly the clipped case it exists to catch.
- **Order**: pairwise `compareDocumentPosition` against the previously focused element — moving backwards is a
  defect; a step whose predecessor is gone is a re-render and is counted, not failed.
- **Mouse-only**: elements whose computed `cursor` is `pointer` but that are not focusable and not inside a real
  control would be reachable by mouse and not by keyboard. Children of controls are excluded (a row's inner
  `span`s inherit `cursor: pointer` from the button around them).

## Indexing: what is not a tab stop

A tab-stop index must exclude what cannot take focus even when the DOM gives it a box: descendants of a closed
`<details>` (Chromium returns a non-zero box for its content, and it cannot take focus) and `tabindex="-1"`
(deliberate non-tab-stop). Scroll containers are included, but they are in the tab order only while they actually
overflow — which changes as the walk scrolls their neighbours, so that count moves between runs.

## The controls themselves

Class names are built from the page's own hooks (`data-rd-*` attributes first, then the plugin's `rd-*` classes,
then a disclosed `summary`'s owner, then a small host-primitive signature). The name is a **label for the
transcript**; no check branches on it, so a renamed class cannot silently weaken an assertion.

## Traps that made this harness lie (all four cost a run)

1. **Mid-transition reads.** A settle that waits on the element's own animations (not a sleep) is mandatory;
   without it the switch measured 2.04:1 while heading for 4.61:1.
2. **Programmatic focus.** `:focus-visible` does not match it, so `el.focus()` inside the harness reported "no
   indicator" for host primitives that do have one under real Tab.
3. **`--tw-ring-shadow` versus `box-shadow`.** See the extraction order above.
4. **Instance arithmetic.** The topics pane re-renders mid-walk and scroll containers come and go, so instance
   counts are reported per view with the page's own reason; **class coverage is what gets asserted**.
