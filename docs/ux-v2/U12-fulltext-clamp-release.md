# U12 — full-text clamp release on the axis reading (implementation preview, 2026-10-09)

> **Status: implemented + regression-tested; served-build acceptance NOT closed.** The change lands the
> owner-approved behavior into the source and the committed bundle, with an executable browser check that
> measures the **built** bundle. **No deploy, no vendor, no reinstall, no restart, no fixture write, no served
> run** was performed — that is a separate decision. The two comparison screenshots this record names are the
> **new implementation captures** the owner reviews before any final approval; the earlier transient preview
> (`.hermes/scratch/preview-clamp/`) was the pack the owner visually accepted to authorize implementation.

The product decision is [`DECISIONS.md` §17](DECISIONS.md). This unit doc is its implementation-preview record.

## What changed

One CSS rule in the plugin stylesheet (`src/ui.tsx`), added directly after the existing `.rd-axis-reading
.rd-claim-value` clamp. The base clamp is untouched; the rule is keyed on the axis fold's own **native**
`[open]` state and scoped to the row that **owns** the fold:

```css
[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value,
[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value {
  -webkit-line-clamp: unset; display: block; overflow: visible;
}
```

No JSX, no React state, no new `data-rd-*` hook, no new DOM node, no new control, no new fact. `textContent`
is identical collapsed and expanded — the clamp was always a visual clip.

**Committed build output regenerated:** `ui/app.js` (sha256 `f6e6b8f3cec9476ad55be4f7067eb116690ae0b26c03cd98c58b654cb9024548`,
155,239 B). `actions/actions.js` is **byte-unchanged** (`068315050565bce4b416211164e8a8e5e00c0692bc0912f7702f7c869f27a2e0`).
No migration, manifest or payload change.

## The executable assertion

`harness/full-text-clamp/check.mjs` — `bun run harness:fulltext`.

- It mounts the built `ui/app.js` through the plugin's own host runtime (`harness/preview/run.mjs`) on a fresh
  loopback port — **no Nakama instance, no credentials, no service restart, nothing written to a served org.**
- **Refuses** (exit 3) unless the built bundle contains the approved rule **byte-for-byte**; **aborts** (exit 2)
  on an unreachable preview; exits 0/1 as a verdict. Same contract as the acceptance pass.
- It builds a preview payload from the **committed corpus transcript** (replayed through the real action
  layer) with the **F08 subject** patched in verbatim — the axis title and the 411-char `currentState` from the
  approved design (`.hermes/scratch/full-text-access-design.md` §1) — and its state promoted to `active` so the
  fold is a live control (the corpus axis was `completed`, i.e. inside the closed "completed" fold). A public
  blocker sentence is added to a repository axis so the fold-less scan row has a reading.

**Result: 31 checks · 31 PASS · 0 FAIL · 0 BLOCKED, at 1440×900 and 1280×800.**

| Assertion | 1440×900 | 1280×800 |
|---|---|---|
| rule present in built bundle, byte-for-byte | PASS | PASS |
| collapsed: clamp `2`, clipped, 411-char text-exact | client 39 < scroll 98, visible 201/411 | client 39 < scroll 98, visible 169/411 |
| collapsed: the new rule is **inert** (`ruleMatches=false`) → card unchanged | PASS | PASS |
| fold summary reached by a **real Tab** press, `:focus-visible` | PASS | PASS |
| summarised focus indicator ≥ **3:1** (settled render) | **4.61:1** (`2px rgb(180,83,9)` on `oklch(0.97 0 0)`) | **4.61:1** |
| **Enter** opens the fold | PASS | PASS |
| expanded: clamp `none`, `display:block`, `overflow:visible`, `client==scroll` | 98/98 | 98/98 |
| expanded: whole 411-char state readable, **no ellipsis**, tail visible | PASS | PASS |
| expanded: no horizontal overflow (claim / row / document) | 0 / 0 / 0 | 0 / 0 / 0 |
| expanded: DOM text still 411-char text-exact | PASS | PASS |
| **Space** toggles the native fold closed then open | PASS | PASS |
| **NEGATIVE CONTROL:** re-clamp while open → readability assertion **FAILS (red)** | PASS | PASS |
| after removing the negative CSS: expanded fully readable again | PASS | PASS |
| short state (16 chars): opening the fold is a visual **no-op** | 20 → 20 px | 20 → 20 px |
| fold-less row (Repositories `AxisScanItem`): does **not** match the rule, keeps clamp `2` | PASS (144-char blocker) | PASS |

The negative control is the proof that a green run can go red: with the fold open, injecting
`-webkit-line-clamp:2; display:-webkit-box; overflow:hidden !important` collapses the reading back to
`client 39 < scroll 98` and the readability assertion fails.

### New implementation captures (for the owner's visual review, before final approval)

Written by the check to `.hermes/scratch/full-text-clamp/pack/` (generated, git-ignored, rebuilt on demand):

- `f08-1440x900-collapsed.png` · `f08-1440x900-expanded.png` · `f08-1440x900-expanded-viewport.png` · `f08-1440x900-negative-control.png`
- `f08-1280x800-collapsed.png` · `f08-1280x800-expanded.png` · `f08-1280x800-expanded-viewport.png` · `f08-1280x800-negative-control.png`
- `short-1440x900-expanded.png` · `short-1280x800-expanded.png` · `foldless-1440x900.png` · `foldless-1280x800.png`
- `check-manifest.json` (every check with its measured detail, and the build sha256 it measured)

## Boundaries (stated, not implied)

- **Not served-build acceptance.** The measurements are of the **built bundle** through the host runtime, not
  of a served release. Whatever an instance serves is unchanged until a deploy/reinstall, which this record
  does **not** perform and does **not** authorize.
- **Coverage boundary, by design.** Only fold-owning rows unclamp: the Topics axis detail card and the People
  axis rows. Rows with no fold — the Repositories scan rows and the transient pre-detail `AxisItem` fallback —
  stay clamped. Extending the fold to those rows is out of this bounded scope.
- **`sampled` etymology.** The check samples exactly the dataset it mounts (one topic, three axes, one
  repository). It reports its sample coverage rather than implying a whole-estate sweep.
- **`:has()`** requires a modern host Chromium (≥105); the harness' cached Chromium qualifies.
- **Public payloads only.** The check mounts a corpus-derived preview payload; it writes nothing to any store
  and reads nothing from a live org.
