# U10 — the resolved-problem fallback in Axes mode: removed, and re-measured

**Date:** 2026-10-02 · **Ruling:** option (a) · **Release after:** `0.2.0+dev.5a98360ab6cc`

## The ruling

> "I'd rule for (a): remove `?? axesModeProblems[0]` in Axes mode. In Axes mode, the central Problem card is
> the selected axis's first **open** Problem in projection order. If there are zero open Problems, then there is
> **no Problem card to show** for that axis. The axis itself still remains meaningful and the Activity column
> still follows it… do **not** fall back to a resolved Problem in Axes mode; resolved Problems remain available
> in the **Problems** subview. Do not alter the corpus seeds or reduce the remaining truthful skips."

## The change

`src/ui.tsx`, Axes mode — `shownProblem`:

```diff
-  : (axesModeProblems.filter((row) => row.state === "open")[0] ??
-      axesModeProblems[0] ??
-      null);
+  : (axesModeProblems.filter((row) => row.state === "open")[0] ?? null);
```

and the empty state's text is now accurate to its cause: an axis with resolved problems and none open reads
**"No open problems on this axis."**; only an axis with no problems at all reads "Nothing is recorded against
this axis." (before, the second message covered both cases and was wrong for the first). In `Problems` mode the
card is unchanged — that subview still shows the full inventory, resolved problems included.

## Verification

- `bun run typecheck` clean; `bun run check` → **126 pass · 0 fail · 764 expect()** (no test asserted the old
  fallback, and none asserts the empty text).
- Build → vendor → reinstall on **both** instances (a corpus re-seed was **not** needed: this is a UI change, the
  stores were untouched). Release `0.2.0+dev.5a98360ab6cc`, revision 12 (corpus) / 57 (fixture).
- Byte identity: source `ui/app.js` `7f97ce64c530ab80128f` in the repo build **and** the vendored checkout; the
  two instances serve byte-identical assets on each route (Nakama `ca730ec7fc2b7edb7277`, dashboard
  `c80ada07b81f13e6164a` — the routes serve through the server's own wrapper, which is why they differ from the
  source file; what matters is corpus == fixture on both).

| dataset | before the fix | after |
|---|---|---|
| corpus (both viewports) | 83 · **1** · 22 | **84 · 0 · 22** |
| fixture (both viewports) | 107 · 0 · 0 | 107 · 0 · 0 (unchanged) |

The check that caught it now reads: *"selecting another axis moves the Problem and Activity columns to that
axis — selected 3e5b5f94: problem axis 3e5b5f94, feed axis 3e5b5f94, shown (projection none open), 43 feed rows
vs 43"* — no card, the axis still standing, the Activity column still following it. The subview half of the
ruling is evidenced in the same record: *"the Problems index lists the projection's problems, in the server's
order, with each row's own state, axis, topic and recency — 3 row(s) of 3; order matches; fields match"* (all
three, one of them resolved).

## Why this could only be found with real data

The synthetic fixture has never carried an axis whose problems are all resolved — its axis carries three, two
open. The fallback therefore looked harmless for the whole of U4, and became reachable only when the corpus
acquired a resolved problem and no open one on the same axis (PR #48, closed without merging, on the acquisition
axis). That is the argument for corpus-derived seeds in one line.
