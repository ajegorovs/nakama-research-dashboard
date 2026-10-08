# F08 — supplemental visual verification + served-asset **bytecount erratum**

> **Status: SUPPLEMENTAL / READ-ONLY / DOCS-ONLY.** This is an appended, public, sanitized record. It
> **supersedes the provisional observation** in
> [`2026-10-08-wp-g-retained-execution-report.md`](2026-10-08-wp-g-retained-execution-report.md) §7 (where the
> F08 text "was not conclusively reached") with a completed read-only visual measurement, and it carries an
> **erratum** for the served-asset byte figure quoted in that report §3 and in
> [`2026-10-08-wp-g-retained-execution-evidence.json`](2026-10-08-wp-g-retained-execution-evidence.json).
> **The original report and its evidence JSON are preserved unchanged** — the correction lives here, not in a
> rewrite (project rule: published history is not rewritten; a correction is a document).
>
> **No live fixture read or write.** This supplement performs **no** new fixture read, no `reconcile_topic` /
> no `record_activity`, no inference, no service/deploy/restart, no product/UI/harness/source change, and no
> merge. It re-derives the bytecount from the **already-existing** local assets only. Public labels and
> sanitized references only; no live org id, topic/axis/problem id, host name or host path.

---

## 0. Provenance (what was measured, when, against which build)

| Item | Value |
|---|---|
| Visual measurement taken | **2026-10-08T20:04:23Z** (recorded in the read-only verification JSON) |
| Supplement authored | **2026-10-08** (this document) |
| Dashboard origin | `http://127.0.0.1:3003` (loopback — kept verbatim; identifies nobody) |
| Plugin | `research-dashboard` |
| Target org | **label** `Public Research Exercise` *(exact fixture id held in the local git-ignored handoff; it is **not** published here)* |
| Build of record (org-aware, browser-actually-served) | release **`0.2.0+dev.78af5cbb87b4`**, revision **`9`** |
| `ui/app.js` identity | sha256 **`41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc`**, **154598** bytes |
| Local repo asset | `ui/app.js`, same sha256 and byte length (byte-equal) |

**Served-build guard trap (recorded, not the build of record).** The `served-build-guard` is **not
org-aware**; its non-org-aware reading was a *different* store's release `…164ccaafbca4`, revision `20` — a
**different release/revision that nonetheless serves the same `ui/app.js` sha256**. That is the trap: the sha
alone does not identify a release. The build of record is the **org-aware, browser-actually-served** pair
above (`0.2.0+dev.78af5cbb87b4` rev `9`).

---

## 1. F08 visual verification — result (subject: the diagnostics axis-4 `currentState`)

The diagnostics-axis `currentState` (F08) was populated at `currentStateConfidence: inferred` with the exact
**411-character** §3.1 string. Where it stands visually:

| Check | Result |
|---|---|
| DOM presence of the 411-char `currentState` | **PRESENT** |
| DOM text byte-exact vs the bundle §3.1 string | **EXACT** — 411 chars, `exact: true` |
| Visual full-text readability | **✘ CLIPPED to 2 lines** |

Measured geometry of the reading box (computed style `display:flow-root`, `-webkit-line-clamp:2`,
`overflow:hidden`, `line-height:19.5px`):

```
actual height    clientHeight 39px
content height   scrollHeight 117px      (§content ≈ 6 lines)
visible          2 lines  (= 39 / 19.5)
visible chars    153
hidden chars     258                      (tail clause hidden, e.g. the `core/CaptureStats … no production
                                           code calls it.` sentence)
```

The axis's **"More on this axis"** disclosure was opened with a **real click**: the box **remains clamped**
after disclosure — `claimStillClamped: true`, `visibleChars: 153`, `hiddenChars: 258`,
`fullTextBecameVisuallyReadable: **false**`. The disclosure shows evidence / description / state + the
History / Correct controls, **not** the full state text; the only in-place path to the full string is the
edit form.

**Parent native-vision confirmation.** Independent native visual inspection (vision) of the expanded shot
confirms the current-state sentence is truncated **mid-word**: it ends `…a 2000-fram…`.

**Classification.** DOM presence ✔ / exact payload ✔ / **visual full-text readability ✘ (2-line clamp)**.
This is the **expected existing behaviour of the shared axis-reading grammar**
(`-webkit-line-clamp: 2; overflow: hidden`), **not a regression introduced by the F08 write** and **not a
defect in the write**. The text genuinely reaches the DOM; the reader simply cannot see all of it in place.
**No product/UI fix is made or proposed by this supplement** — it is an observational record.

One representative sanitized shot is committed as final supplement evidence (not a montage):
[`../screenshots/f08-axis4-expanded.png`](../screenshots/f08-axis4-expanded.png)
— sha256 `7de278a7a5c8d798b461faf17d929a2c342468b62dabf8e4fbf2bda7a514b9b3`, 31246 bytes, 497×359, the
**plugin axis card only** (no browser chrome). It carries **public labels only** — the public GitHub slug
`ajegorovs/Grablink-Full-sequence-acquisition` and the person `Aleksandrs Jegorovs`, both already public in
this repo's `docs/plans/`. No live org id, no axis id, no host name, no URL, no image URL and no credential
appears in it.

---

## 2. Erratum — served-asset bytecount **154417** vs **154598** (same sha256)

**The discrepancy.** The execution report §3 and its evidence JSON quote the served `ui/app.js` as
**`154417` bytes** for sha256 `41e61ef5…`. The fresh F08 measurement and this repo's own `ui/app.js` are
**`154598` bytes** for the **same** sha256. Identical content cannot have two different byte lengths, so one
figure is not a byte count.

**Root cause — proven, not inferred (+ = "char count mislabeled as bytes").**

- The runner fetched the asset with `await assetRes.text()`, which yields a **JavaScript string**, and the
  check used that string's `.length`
  (`.hermes/scratch/wpg-exec-a.mjs`, `servedAssetSha` check: `… && assetText.length === 154417`, recorded into
  the evidence JSON as `"servedAssetBytes": 154417`).
- A JavaScript string's `.length` counts **UTF-16 code units (characters)**, **not bytes**. So `154417` is the
  **character count** of the fetched asset text, recorded under a **"bytes"** label.
- The sha256 was computed over the same string, which is why the **sha is identical** on both sides.

**Arithmetic (measured with a tool, over the actual repo asset `ui/app.js`):**

```
repo ui/app.js
  bytes (file / UTF-8 encode) .......... 154598
  sha256 ............................... 41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc
  UTF-8 code points .................... 154417
  UTF-16 code units (JS .length) ....... 154417     (BMP-only file: code points == UTF-16 units)
  non-ASCII code points ................ 119        57 two-byte + 62 three-byte
  extra bytes from multibyte ........... 181        (57×1 + 62×2)
  check 154417 + 181 = 154598 .......... ✔
```

**Conclusion.** `154417` is the asset's **character count** (a JS string `.length`), **mislabeled as bytes**;
the **actual repo/served asset is `154598` bytes**. The sha256 `41e61ef5…` was and is the same on both
figures (it was taken over the same bytes). **No content discrepancy exists and no served asset needs
re-measuring** — the sha is unchanged and the byte length is now stated correctly. The corrected figure is
stated here; the execution report and its evidence JSON are **left unchanged** as published history.

---

## 3. Boundaries

- **Read-only.** No new fixture read and no fixture/domain write; no new browser run for this supplement (the
  existing read-only JSON + local asset + committed screenshot are the evidence). No service/deploy/restart.
- **No product/UI/harness/source change and no bug fix.** The F08 clamp is existing shared-grammar CSS,
  observed, not altered. **No canonical screenshot was overwritten**; this supplement adds one **new**
  sanitized shot.
- **Grant status unchanged.** The retained write grant stays **CONSUMED**; **SCOPE-BASELINE remains
  unselected / NOT authorized**. No further retained write (F02/F07/F09/F12, any evidence add) is authorized.
- **Hygiene.** Public labels / sanitized references only. The exact org id, the axis/topic/problem ids and the
  raw envelopes stay in the local git-ignored operational records.

## 4. Links

- Superseded provisional observation:
  [`2026-10-08-wp-g-retained-execution-report.md`](2026-10-08-wp-g-retained-execution-report.md) §7 (preserved unchanged).
- Evidence JSON (byte figure erratum, preserved unchanged):
  [`2026-10-08-wp-g-retained-execution-evidence.json`](2026-10-08-wp-g-retained-execution-evidence.json).
- Ledger entry for this supplement:
  [`public-research-fixture-findings.md`](public-research-fixture-findings.md) §W.
- Representative sanitized shot: [`../screenshots/f08-axis4-expanded.png`](../screenshots/f08-axis4-expanded.png).
