# U12 — full-text clamp release on the axis reading (implementation preview, 2026-10-09)

> **Status: implemented + regression-tested; served-build runtime measured (read-only) and reviewer-accepted —**
> **`SERVE · RUNTIME — ACCEPTED`; merge owner-gated (not merged).** The acceptance record is
> [`../reviews/2026-10-09-u12-acceptance-record.md`](../reviews/2026-10-09-u12-acceptance-record.md).
> The change lands the owner-approved behavior into the source and the committed bundle, with an executable browser
> check that measures the **built** bundle. **No deploy, no vendor, no reinstall, no restart, no fixture write, no
> served run** was performed *by this record* — that was a separate, owner-authorized act. See
> [Served-build deployment and read-only served runtime verification](#served-build-deployment-and-read-only-served-runtime-verification-2026-10-09)
> at the end for that measurement, and `docs/reviews/2026-10-09-u12-served-measurement-evidence.json`. The two
> comparison screenshots this record names are the **new implementation captures** the owner reviews before any
> final approval; the earlier transient preview (`.hermes/scratch/preview-clamp/`) was the pack the owner visually
> accepted to authorize implementation.

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
**155,420 B** — the file's byte length, read from the raw Buffer, not the string's 155,239 UTF-16
code-unit count). `actions/actions.js` is **byte-unchanged** (`068315050565bce4b416211164e8a8e5e00c0692bc0912f7702f7c869f27a2e0`).
No migration, manifest or payload change.

## The executable assertion

`harness/full-text-clamp/check.mjs` — `bun run harness:fulltext`.

- It mounts the built `ui/app.js` through the plugin's own host runtime (`harness/preview/run.mjs`) on a
  **fresh ephemeral loopback port** (bind `127.0.0.1:0`, released, re-bound by the child) — **no Nakama
  instance, no credentials, no service restart, nothing written to a served org.** Because that release is a
  known bind→serve race, the check passes a per-run **run token** to the child, whose generated Vite config
  **captures it at config load** (that server's startup) together with the boot bundle's sha256 and byte
  length, and serves it from an **in-memory** middleware at `/preview-identity.json` — no static token file
  is written or served, and nothing is read from disk on a request, so the responder keeps the identity of
  the process that booted it. Readiness requires the responder to echo **exactly this run's** token and sha,
  so a stale or foreign responder is **refused** (exit 3), and a child that exits before readiness **aborts
  immediately** (exit 2) rather than polling.
- **Refuses** (exit 3) unless the built bundle contains the approved rule **byte-for-byte**; **aborts** (exit 2)
  on an unreachable preview; exits 0/1 as a verdict. Same contract as the acceptance pass.
- It **regenerates the generated fixture on every self-served run**, even when one already exists, and it
  reports the build size as the file's **byte** length (`155420`), never the string's UTF-16 code-unit count
  (`155239`) — the two differ and the check asserts they do.
- It builds a preview payload from the **committed corpus transcript** (replayed through the real action
  layer) with the **F08 subject** patched in verbatim — the axis title and the 411-char `currentState` from
  the **shared constant** (`make-clamp-fixtures.mjs` exports `F08_TITLE`/`F08_STATE`; the check imports them
  and cross-checks the title against the WP5 manifest's axis-4 title, so the builder, the checker and the
  approved baseline cannot disagree). The subject row is addressed by its **exact title and the 411-char
  constant, independently of geometry** — never by "the longest row". Its state is promoted to `active` so
  the fold is a live control (the corpus axis was `completed`, i.e. inside the closed "completed" fold). A
  public blocker sentence is added to a repository axis so the fold-less scan row has a reading.

**Result: 46 checks · 46 PASS · 0 FAIL · 0 BLOCKED, at 1440×900 and 1280×800.**

| Assertion | 1440×900 | 1280×800 |
|---|---|---|
| build size is the file's **byte** length (155420), not the UTF-16 code-unit count (155239) | PASS | PASS |
| F08 row located by **exact title + the 411-char constant**, independent of geometry (not "the longest") | PASS | PASS |
| mounted fixture **regenerated** this run; served identity echoes this run's **token + build sha/bytes** | PASS | PASS |
| rule present in built bundle, byte-for-byte | PASS | PASS |
| collapsed: clamp `2`, clipped, 411-char text-exact | client 39 < scroll 98, visible 201/411 | client 39 < scroll 98, visible 169/411 |
| collapsed: the new rule is a **non-match** (`ruleMatches=false`) → computed collapsed behavior unchanged | PASS | PASS |
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
| short no-op row carries the **explicit** fixture state (`no progress note`) | PASS | PASS |
| short state (16 chars): opening the fold is a visual **no-op** | 20 → 20 px | 20 → 20 px |
| fold-less row (Repositories `AxisScanItem`): does **not** match the rule, keeps clamp `2` | PASS (144-char blocker) | PASS |

The negative control is the proof that a green run can go red: with the fold open, injecting
`-webkit-line-clamp:2; display:-webkit-box; overflow:hidden !important` collapses the reading back to
`client 39 < scroll 98` and the readability assertion fails.

**The check's own guards can go red too** — `harness/full-text-clamp/integrity.test.mjs`
(`bun run harness:fulltext:test`, **7 cases · 7 pass**): a default run reports the byte length (not the
code-unit count); a stale pre-existing fixture is overwritten and measured; a fixture with a **wrong F08
title** fails (exit 1); one with a **wrong F08 length/text** fails (exit 1); an **occupied fixed port**
fails (the child exits before readiness, exit 2); a **foreign responder** whose identity does not echo
this run's token/sha is **refused** (exit 3); and — the runtime-identity race — a **stale Vite on the same
webroot** keeps its captured-at-startup identity after a newer run rewrites the shared generated files, so
a check with a new token pointed at the occupied port is **refused against the OLD token** (exit 3) and the
newer child that cannot take the port **does not pass**. That case runs against an **isolated sandbox
checkout**, never the live one.

### New implementation captures (for the owner's visual review, before final approval)

Written by the check to `.hermes/scratch/full-text-clamp/pack/` (generated, git-ignored, rebuilt on demand):

- `f08-1440x900-collapsed.png` · `f08-1440x900-expanded.png` · `f08-1440x900-expanded-viewport.png` · `f08-1440x900-negative-control.png`
- `f08-1280x800-collapsed.png` · `f08-1280x800-expanded.png` · `f08-1280x800-expanded-viewport.png` · `f08-1280x800-negative-control.png`
- `short-1440x900-expanded.png` · `short-1280x800-expanded.png` · `foldless-1440x900.png` · `foldless-1280x800.png`
- `check-manifest.json` (every check with its measured detail, and the build sha256 it measured)

## Boundaries (stated, not implied)

- **Not served-build acceptance at this record's stage.** The measurements are of the **built bundle** through the
  host runtime, not of a served release. Whatever an instance serves was unchanged until a deploy/reinstall, which
  this record did **not** perform and does **not** authorize. **Deployment was pending at this stage**; no
  live/served run backs the implementation-preview numbers here. That pending state was then closed by a
  **separate, owner-authorized** deployment whose read-only served runtime measurement is recorded in the
  [served section](#served-build-deployment-and-read-only-served-runtime-verification-2026-10-09) below and
  accepted in [`../reviews/2026-10-09-u12-acceptance-record.md`](../reviews/2026-10-09-u12-acceptance-record.md);
  this boundary is left as its stage statement, not rewritten.
- **The payload is a synthetic preview, not live data.** The check mounts a corpus-derived preview payload
  with the **F08 candidate** subject patched in (the 411-char wording is the approved design's *candidate*,
  carried as a shared constant — never an instance's live row). The viewer sees the rule's behavior on that
  subject, not a claim about any org's stored state.
- **Repeatable green, provably able to go red.** The check allocates a **fresh ephemeral port** per run,
  proves the responder is its own child by echoing a per-run token and the build sha/bytes **captured at
  startup from an in-memory endpoint** (no static token file), **regenerates** its generated fixture every
  run and reports the **byte** length (never UTF-16 units). Its own guards are exercised by
  `harness/full-text-clamp/integrity.test.mjs` (7 cases), including the same-webroot stale-Vite race.
- **Coverage boundary, by design.** Only fold-owning rows unclamp: the Topics axis detail card and the People
  axis rows. Rows with no fold — the Repositories scan rows and the transient pre-detail `AxisItem` fallback —
  stay clamped. Extending the fold to those rows is out of this bounded scope.
- **`sampled` etymology.** The check samples exactly the dataset it mounts (one topic, three axes, one
  repository). It reports its sample coverage rather than implying a whole-estate sweep.
- **`:has()`** requires a modern host Chromium (≥105); the harness' cached Chromium qualifies.
- **Public payloads only.** The check mounts a corpus-derived preview payload; it writes nothing to any store
  and reads nothing from a live org.

## Served-build deployment and read-only served runtime verification (2026-10-09)

Owner-authorized deployment of the accepted implementation to the **named target organization only**, plus a
read-only verification of what a real browser session receives. This section is a **measurement**, not source
approval: the outcome is recorded as *served measured pass — awaiting review; not source approval; no merge*.
Full machine detail is in
[`docs/reviews/2026-10-09-u12-served-measurement-evidence.json`](../reviews/2026-10-09-u12-served-measurement-evidence.json).

**Deployment.** The accepted build was re-derived from the isolated checkout (source head `4638f75`):
`bun run check` green (typecheck + build + 313 tests), `typecheck:host` green against the checkout the review
units run from, and a reproducible `ui/app.js`
(sha256 `f6e6b8f3cec9476ad55be4f7067eb116690ae0b26c03cd98c58b654cb9024548`, **155,420 B**). The tree was vendored
into that checkout and `reinstall-plugin.mjs` was run with the **target organization named explicitly**
(`--org-id`, no `orgs[0]` fallback) and the instance URL taken as one coherent parameter set. The target org's
release moved `0.2.0+dev.78af5cbb87b4` → `0.2.0+dev.a5f76a608db2` (revision 9 → 17, `enabled`). **No service
restart was required or performed** — the reinstall snapshots the vendored tree and the running instance served
the new release without one.

**The served bytes, authoritatively.** The asset URL the browser actually fetched *while logged into the target
org* carries revision **17** / version **0.2.0+dev.a5f76a608db2**, and its raw **Buffer** sha256 is
`f6e6b8f3…` at **155,420 B** — the build this record quotes. The two other organizations on the same instance
(`layout demo`, `nakama e2e fixture`) were verified to still serve the **previous** bytes
(`41e61ef5…`, 154,598 B) at unchanged revisions: the change reached only the named target. The generic
`served-build-guard.mjs` is **org-unaware** on a multi-org account (it measures whatever org the session
resolves), so its output is not the deployment evidence here — the org-explicit fetch and the served runtime
session are.

**Product data unchanged.** The release binding moved; no data did. Each org's canonical overview + search
projection is byte-identical before and after (excluding the volatile `generatedAt`), the target store generation
is unchanged, and the counts are identical (target: 2 topics / 6 axes / 3 repositories / 1 person). No reseed, no
reconcile, no fixture mutation.

**Served runtime (real UI, both reference viewports).** Against the served target org, the subject topic
`Experimental research` and the axis **`Grablink diagnostics and sustained-rate validation`** (located by its
exact title; the axis's `currentState` is the source-approved **411-char** constant, character-exact):

| Observation | Before deploy (served) | After deploy (served) |
|---|---|---|
| collapsed reading | clamp `2`, clipped, 411-char text-exact | unchanged: clamp `2`, clipped, text-exact |
| collapsed rule | non-match (fold closed) | non-match (fold closed) |
| **expanded reading** | **clamp `2`, `display:flow-root`, `overflow:hidden`, clipped — the defect** | **clamp `none`, `display:block`, `overflow:visible`, `client==scroll`, whole state visible, no ellipsis** |
| summary focus | reached by a real `Tab`, `:focus-visible`, **4.61:1** | **4.61:1** |
| `Enter` / `Space` | opens / toggles the native fold | opens / toggles |
| negative control (re-clamp while open) | — | readability **goes red**, then restores on removal |
| fold-less Repositories scan row | stays clamped (`2`) | stays clamped (`2`) |
| People linked-axis disclosure | — | existing long linked-axis reading releases (`clamp none`, `block`, `59/59`) |

Served-runtime result: **28 pass · 0 fail · 2 blocked** (1440×900 and 1280×800). The two blocked items are the
**People short-sample class** — the target org has no short (≤40-char) linked-axis reading, so that class is
reported **unreached**, not counted as a pass. The served screenshots are in the harness scratch pack
(`.hermes/scratch/full-text-clamp/`-style, git-ignored), not in the tracked tree; they are the material for the
owner's visual review.

**Boundaries.** Deployment and verification were read-only apart from the single reinstall that updates the
target org's release binding; nothing was restarted, no migration/manifest/payload changed, and no canonical
acceptance record or screenshot was overwritten. **This section grants no source approval and authorizes no
merge** — it records the served measurement for the owner's review.
