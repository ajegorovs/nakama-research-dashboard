# U12 — full-text clamp release — final acceptance record (2026-10-09)

**Status: reviewer-accepted at the served-runtime stage.** This record covers what was measured, and only that.
**No merge authorization has been requested or granted for this closeout.** This records the absence of a merge
grant; it is not — and is not to be read as — an owner refusal. No denial is asserted or implied.

Unit / implementation record: [`../ux-v2/U12-fulltext-clamp-release.md`](../ux-v2/U12-fulltext-clamp-release.md).
Machine detail: [`2026-10-09-u12-served-measurement-evidence.json`](./2026-10-09-u12-served-measurement-evidence.json).
Standing decision: [`DECISIONS.md` §17](../ux-v2/DECISIONS.md).

## 1. Verdict (reviewer, quoted verbatim)

> Verdict: U12 SERVED-RUNTIME ACCEPTED. The deployment and live behavior are sufficiently evidenced to close the
> runtime gate. I would require only documentary closeout corrections before treating PR #6 itself as merge-ready.

**Provenance (stated, not hidden).** This is the reviewer's verdict, relayed by the owner from the review message;
the review was made against the served measurement at `c0d5541…`. The full reviewer text is **present in the
project conversation**, and the excerpt above is copied from it **verbatim**. The source is retrievable; these
tokens are **not** reconstructed, paraphrased or invented. The verdict accepts the **served runtime measurement**
and closes the runtime gate; it is **not** source approval and **not** a merge grant, and it asks only for
documentary closeout corrections before PR #6 itself is treated as merge-ready.

## 2. What was accepted (measured)

| Item | Value |
|---|---|
| target | the named target organization only (dataset label `public research exercise`) |
| release / revision | `0.2.0+dev.a5f76a608db2` / 17 (`enabled`) |
| served `ui/app.js` sha256 | `f6e6b8f3cec9476ad55be4f7067eb116690ae0b26c03cd98c58b654cb9024548` |
| served bytes | 155,420 (raw Buffer — not the string's UTF-16 code-unit count) |
| served runtime | **28 pass · 0 fail · 2 blocked** (1440×900 and 1280×800) |

Measured observations (real browser session against the served target org; the subject axis's `currentState` is
the source-approved **411-char** constant, character-exact):

- **collapsed** — clamp `2`, clipped, 411-char text-exact; the new rule a **non-match** (fold closed).
- **expanded** — clamp `none`, `display:block`, `overflow:visible`, `client==scroll` (117/117 at 1440×900,
  156/156 at 1280×800), whole state visible, no ellipsis, no horizontal overflow.
- **focus** — the fold summary reached by a real `Tab`, `:focus-visible`, **4.61:1** (≥ 3:1).
- **keyboard** — `Enter` opens the fold; `Space` toggles it.
- **negative control** — re-clamping while open makes the readability assertion **go red**, then restores on
  removal; the check proves it can fail.
- **fold-less row** — the Repositories scan row stays clamped (`2`).
- **People long linked-axis** — the existing 144-char linked-axis reading releases (`clamp none`, `block`,
  `59/59`).

## 3. Coverage passed, and what was not (boundaries)

- **Coverage passed.** Both reference viewports, the collapsed/expanded states, keyboard reach and toggling, the
  focus ratio, the negative control, the fold-less control row and the People long-reading case are all measured
  and passed on the served target org.
- **Two blocked items — reported unreached, not counted as passes.** They are the **People short (≤40-char)
  linked-axis reading class**: no such reading exists in the target org, so the class is reported **unreached** at
  both viewports. No fixture, row or data was **manufactured** to force the served short case green.
- **The synthetic short class is covered separately.** The offline executable check
  (`harness/full-text-clamp/check.mjs`, mounted against the built bundle) covers the short-reading no-op case
  (**46 checks · 46 pass · 0 fail · 0 blocked**) — a preview measurement, not a served one.
- **Representative visual review, both viewports.** The reviewer/owner's visual acceptance material is the **new
  implementation captures on the served target org** at both reference viewports. The pack holds **12** PNGs
  (enumerated programmatically): 8 F08 (collapsed / expanded / expanded-viewport / negative-control ×
  1440×900 and 1280×800), 2 People expanded (both viewports) and 2 fold-less (both viewports). Where the
  pre-deploy captures were overwritten by the post-deploy run, the pre-deploy expanded-clamped geometry is
  preserved numerically in the pre-deploy runtime record.

## 4. Evidence, and the screenshot limitation

- **Committed evidence.** [`2026-10-09-u12-served-measurement-evidence.json`](./2026-10-09-u12-served-measurement-evidence.json)
  is the machine record: dataset **labels** only — no live endpoint, org id, hostname or machine path.
- **The served screenshots are not committed.** They live only in a **git-ignored scratch pack** (generated,
  rebuildable, never tracked). **A reader with only a clone cannot open them.** The acceptance is therefore
  grounded in the committed JSON measurement and the transcripts, not in image files, and this record **does not
  claim** a clone can view the captures.
- **No screenshot was published for this closeout**, and no canonical screenshot or acceptance transcript was
  overwritten.
- **Provenance holds by reference.** The served asset hash and byte length here match the committed
  `ui/app.js` under the build-identity rule (`AGENTS.md` → *Build → vendor → serve*); the deployment reached only
  the named target org, and the two other organizations on the instance served the **previous** bytes at
  unchanged revisions.

## 5. Product boundaries (unchanged by this acceptance)

- **Only fold-owning rows unclamp** — the Topics axis-detail card (**where U03 lives**) and the People axis rows.
  Rows with **no fold** — the Repositories `AxisScanItem` scan rows and the transient pre-detail `AxisItem`
  fallback — **stay clamped**; extending the fold there is out of this bounded scope.
- **The rule adds no JSX, state, hook, node, control or fact.** `textContent` is identical collapsed and
  expanded — the clamp was always a visual clip. A collapsed card's computed behavior is unchanged (the rule is a
  non-match while `[open]` is absent); no screenshot byte-equality is claimed.
- **`:has()`** requires a modern host Chromium (≥ 105); the harness' cached Chromium qualifies.
- **Read-only apart from one org-explicit reinstall.** No service restart, no migration/manifest/payload change,
  no fixture reseed, no reconcile; the presentation-only negative control injects and removes one `<style>`.
- **Deployment identity.** The generic org-unaware `served-build-guard.mjs` is **not** the evidence here (on a
  multi-org account it measures whatever org the session resolves); the org-explicit served-asset fetch and the
  served runtime session are.

## 6. Verification at record time (this machine, this tree)

| Gate | Result |
|---|---|
| committed `ui/app.js` (raw bytes) | sha256 `f6e6b8f3…` · **155,420 B** |
| committed `actions/actions.js` | sha256 `06831505…` — byte-unchanged |
| committed served evidence JSON | present; labels only (no endpoint/id/path) |
| `git diff --check` | clean (no whitespace errors) |
| public-record guard | `bun run harness:records` — **all checks passed**, 278 text files scanned (131 under `docs/`), 2 excluded by path; 0 endpoint offences, 0 identity-bearing home paths |
| markdown links | all relative links in the touched docs resolve (one pre-existing, unrelated break in `docs/corpus/README.md` is left as-is) |

Nothing in this closeout is a code change: the working tree changes are documentation only (this record,
`U12-fulltext-clamp-release.md`, `DECISIONS.md`), so no source, bundle, harness or migration rebuild is required
and no existing gate is reopened.

## 7. Merge disposition

The reviewer's verdict closes the **runtime measurement** stage and returns only documentary closeout corrections.
This acceptance does **not** authorize or perform a merge. The documentation closeout is committed and pushed to the
draft pull request. **No merge authorization has been requested or granted for this closeout**; the **merge remains
owner-gated** — the record neither asserts nor implies an owner refusal.
