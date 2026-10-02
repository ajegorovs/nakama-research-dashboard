---
name: keyboard-focus-pass
description: Measure keyboard focus visibility, per control class.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [accessibility, focus, contrast, keyboard, acceptance]
    category: software-development
    related_skills: [acceptance-pass, dashboard-build-and-serve, public-records-hygiene]
---

# Keyboard focus pass

Focus visibility is a **product rule** here, not styling detail (`docs/ux-v2/DECISIONS.md` §12): one indicator
for every control the page draws, from one rule in the plugin's token block, judged by what the render achieves.
This skill is how to run and interpret the measurement — and how to keep it from lying to you.

## When to Use

- You changed the stylesheet, a shared control, or anything that can take focus.
- A phase-level review asks whether the page is keyboard-reachable and visibly so.
- You are tempted to add `element.focus()` to a check, or a sleep before reading a computed style — both are wrong
  here, and this skill says why.

## The rule being enforced

- One indicator for every control, from one rule scoped to the plugin root (the theme's hue at **full** alpha,
  2px, offset clear of the control's own edge). The host's own `ring-ring/50` ring is half-alpha and does not meet
  the bar by itself, which is why the plugin does not rely on it.
- The standard is the **rendered outcome**, not a token: the WCAG 2.1 non-text minimum of **3:1** against the
  surface the indicator is drawn on. It currently measures **4.61:1** on the muted card and **5.02:1** on white.
- Per control class, **one** measurement sampled across views — tags, index rows, disclosure summaries, folds,
  window/view controls, switch, notes/activity scrollers, the page title. Not dozens of per-instance checks.

## How to run

```bash
bun run harness:focus                                  # corpus, default viewport
bash harness/focus-pass.sh --dataset fixture --viewport 1280x800
bash harness/focus-pass.sh --dataset corpus --viewport 1440x900 --negative-control
```

The wrapper resolves the instance from `--dataset`, runs the **served-build guard as a precondition** (refusing,
exit 3, rather than recording), and writes a transcript per dataset and viewport into `docs/ux-v2/`. Transcripts
are committed like any other record (`acceptance-pass` for the contract and archiving).

The `--negative-control` run injects CSS that removes every focus indication and **requires the per-class checks
to fail**. A green run only means something next to a negative control that goes red; run it in the same review as
the pass itself.

## What it asserts, and what it only reports

- **Asserted:** every control class reached and measured has an indicator, that indicator survives its clipping
  ancestors and sits on screen, it reaches 3:1 against its own background, no step moves focus backwards in
  document order, nothing is clickable by mouse but unreachable by keyboard, and the shell title is reachable by
  Tab with Enter returning to the landing without losing the reader's window.
- **Reported, not asserted:** per-view instance counts. Scroll containers are in the tab order only while they
  overflow, and the topics pane re-renders while a walk passes through it, so the count moves between identical
  runs. The transcript prints the page's own reason per unreached element.

## Pitfalls

1. **A computed style read at the instant of focus is a mid-transition value.** Tailwind's `transition-colors`
   includes `outline-color`, so one control read **2.04:1** immediately and **4.61:1** once its own animations had
   finished — the instrument looked like the defect. Wait on the element's own animations
   (`getAnimations()` → await the running ones → one frame), before *and* after the `blur()`. Never a blanket
   sleep: this project forbids settle delays for state reads.
2. **`element.focus()` measures a state no keyboard user sees** — `:focus-visible` deliberately does not match a
   programmatic focus. Drive real `Tab` presses from the top of the document.
3. **Equal specificity loses only the colour.** The host's base layer declares `outline-color` as a longhand after
   the plugin's sheet, so a plain rule wins width and offset and loses the colour, leaving a faint indicator that
   *looks* like the rule did nothing. Name the winner with CDP `CSS.getMatchedStylesForNode` instead of guessing,
   and fix it with one extra `:focus-visible` rather than `!important`.
4. **A closed `<details>` returns a non-zero box but cannot take focus**, and `tabindex="-1"` is not a tab stop.
   Indexing either reports a correct page as unreachable.
5. **A walk that stops at the first step outside the plugin misreports what comes later.** Say so in the record
   rather than counting it as coverage.

## Verification

- Pass green at both reference viewports on both datasets, with the served build named in the transcript.
- The negative control forces failures (currently 10), proving the measure can see a removed indicator.
- Class coverage listed in the transcript, with unreached instances explained rather than dropped.
