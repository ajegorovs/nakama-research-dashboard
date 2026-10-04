# V1 — the visual-coherence pass — final acceptance record (2026-10-04)

**Unit:** V1, the visual-coherence pass. This is V1's own acceptance record, separate from the UX-v2
composition acceptance (which closed at `ux-v2-composition-complete`) and from the repository-hygiene record. It
carries the reviewer's final verdict **verbatim** and the one publication-hygiene condition the verdict left
before publication. Nothing here revises C1–C5, H1 or the V1 unit doc's landed items.

**Status: V1 is ACCEPTED, subject only to the publication-hygiene condition recorded below.** The reviewer's
ruling is the acceptance; the condition is a generated-transcript whitespace repair at the emitter, not a product
or visual change. V1 is marked **closed** only once that condition is clean, which the §*Publication condition*
measurements below establish. No product, projection, activity-scope or frozen-contract change was made to close
it. **A second, independent hygiene defect in the same generated records — the canonical read transcripts quoted
their screenshots by absolute path, carrying the local username and directory layout — was found after the first
condition was closed and is repaired at the emitter in §*Publication condition (second)*; it likewise changes no
verdict and no visual measurement.**

## The verdict (reviewer, 2026-10-04, verbatim)

> V1 is accepted, subject only to publication hygiene. The visual-coherence pass has satisfied its
> served-instance acceptance criteria on the authorized fresh local corpus and fixture instances. All four
> canonical read passes and all four focus passes are green; the focus negative control detects the expected
> failures; Progress title equality and the previously open navigation/activity checks pass; the approved
> responsive geometry rules are implemented and measured; and the focus-clipping defect is corrected without
> weakening the shared indicator. The remaining People metadata density and long Repository-name wrapping are
> accepted non-blocking follow-ups. Before publication, correct the two generated fixture transcript lines with
> trailing whitespace at the emitter and regenerate the affected canonical record(s). No further product or
> visual changes are required for V1 acceptance.

## Classification

| aspect | verdict |
|---|---|
| V1 product / visual acceptance | **accepted — closed by the reviewer** |
| served-instance read passes (corpus + fixture, both viewports) | **accepted — all four green** |
| keyboard-focus passes + negative control | **accepted — all four green; control detects expected failures** |
| Progress title-equality reconciliation | **accepted — passes on all four served runs** |
| navigation / activity checks | **accepted — pass** |
| approved responsive geometry rules (rail, support band) | **accepted — implemented and measured** |
| focus-clipping defect | **accepted — corrected without weakening the shared indicator** |
| publication hygiene (fixture transcript trailing whitespace) | **the sole remaining condition — this record closes it** |
| People metadata density | **non-blocking follow-up** (DECISIONS §14.6 / §14.8) |
| long Repository-name wrapping | **non-blocking follow-up** (DECISIONS §14.6 / §14.8) |

## Measured at acceptance (the build and instances the verdict speaks for)

The verdict is the reviewer's; the identity below is what the run it ruled on measured.

| | value |
|---|---|
| release | `0.2.0+dev.30e1f1190226` |
| served `ui/app.js` sha256 | `3b63f1fb2a3f7f1222280fb5ab53243651566b72ca9718e59149445f43219bac` |
| Nakama checkout | v0.4.31 (`c33b36dd2d3320fe8c6d05cb6138a7adcd270e7e`) |
| corpus instance revision | 52 |
| fixture instance revision | 36 |
| datasets | corpus, fixture |
| viewports | 1440×900, 1280×800 |

**Read passes:** corpus 1440×900 and 1280×800 **153 pass / 0 fail / 27 skip**; fixture 1440×900 and 1280×800
**180 pass / 0 fail / 2 skip**. **Focus passes:** corpus 1440×900 **60·0·0**, corpus 1280×800 **64·0·0**,
fixture 1440×900 **60·0·0**, fixture 1280×800 **60·0·0**; corpus 1440×900 `--negative-control` **behaved** (10
checks failed once indication was removed). The skips are honest gaps: corpus 27 (no problem / plan /
bare-repository subject for those negative cases), fixture 2 — nothing is counted as a pass for want of a subject.
The measurements are those recorded in [`V1-visual-coherence.md`](../ux-v2/V1-visual-coherence.md) §*Post-audit
correction* and the local estate's `RESULTS.md`; this record does not re-take or re-word them.

**Provenance — a new local instance, not the historical estate.** The historical services estate is absent on this
host (no mount, no units); the corpus/fixture instances exercised here are the reviewer-authorized **fresh local
estate** fallback, built outside the public repository. Their revisions (52 / 36) are **new-instance** revisions,
not continuity with the historical estate's records, and no number here is presented as reproducing them. The
estate path and its four units are recorded in the local operator README outside this repo; loopback is the only
address in this public record (corpus API `127.0.0.1:4399` / web `127.0.0.1:3003`, fixture API `127.0.0.1:4400`
/ web `127.0.0.1:3005`).

## Publication condition — fixture transcript trailing whitespace, fixed at the emitter

The verdict's one condition: two generated fixture transcript lines carry trailing whitespace; correct it **at the
emitter** and regenerate the affected canonical record(s), changing no product or visual behaviour.

**Root cause.** A `PASS`/`FAIL`/`SKIP` line is emitted by one place — `console.log` inside `check()` (and
`skip()`) in `harness/verify-page.mjs`. Several checks build their `detail` from rendered text via
`text.slice(0, 200)` (line 11's counts line is `render.text.slice(0, 200)`; line 28's is
`blockedCard.text.slice(0, 200)`), and `replace(/\s+/g, " ")` collapses whitespace but leaves a trailing space
when the 200-char cut lands on one. The check description and verdict are unaffected; only the emitted line's last
character is a space. The corpus transcripts' detail slices happen to end on a non-space, which is why only the
fixture records were flagged.

**Fix — emitter-only, presentation-only.** The emitter trims trailing spaces/tabs from the line it prints; no
check description, condition or detail value is changed, and no verdict can move.

**Exact emitter diff** (`harness/verify-page.mjs`; the `ageWords` and readiness hunks in the same working diff
are earlier, unrelated uncommitted work and are not part of this condition):

```diff
@@ const problems = []; @@
 const problems = [];
 const skipped = [];
 let passed = 0;
+// A transcript is a committed public artifact, so an emitted line must not carry trailing whitespace. Several
+// checks build their `detail` from rendered text via `text.slice(0, N)`; `replace(/\s+/g, " ")` collapses runs
+// but leaves a trailing space when the cut lands on one. Trim at the one place a line is emitted — a
+// presentation-only change: it cannot alter a check description, a condition or a verdict, only the last
+// character the transcript prints.
+const emitLine = (line) => console.log(line.replace(/[ \t]+$/, ""));
 const check = (description, condition, detail = "") => {
-  console.log(`${condition ? "PASS" : "FAIL"}  ${description}${detail ? ` — ${detail}` : ""}`);
+  emitLine(`${condition ? "PASS" : "FAIL"}  ${description}${detail ? ` — ${detail}` : ""}`);
   if (condition) {
     passed += 1;
   } else {
@@ const skip = (description, reason) => { @@
 const skip = (description, reason) => {
-  console.log(`SKIP  ${description} — ${reason}`);
+  emitLine(`SKIP  ${description} — ${reason}`);
   skipped.push(`${description} — ${reason}`);
 };
```

**Regeneration.** Only the two affected canonical fixture read records were re-taken, against the **unchanged**
served build (guard green, sha `3b63f1fb…`, fixture revision 36 — same bytes, no rebuild, no reinstall):

Against the unchanged served build (guard green before the runs: sha `3b63f1fb…`, fixture revision 36):

| run | exit | verdict | transcript sha256 |
|---|---|---|---|
| fixture 1440×900 | 0 | 180 pass / 0 fail / 2 skip | `a696bf6600ef2a4746250851e7f7e272bd09a69d1791e7be4827dd5520d89222` |
| fixture 1280×800 | 0 | 180 pass / 0 fail / 2 skip | `e8c61398a8986e866bc312c0843727653be72b70d5dc03c1d4332fa29a80cdda` |

Both runs republished the seven canonical fixture screenshots in the **same measured run** (`published:`
lines, one read pass per viewport); no other canonical record and no build byte was touched. Trailing-whitespace
lines: **2 → 0** in each file.

> **These two fixture digests are superseded.** The second hygiene repair below re-took all four canonical read
> records, so the tip's current digests are the four in §*Publication condition (second)*.

**Normalized comparison.** Pre/post check descriptions and verdicts were compared with **whitespace normalized to
a single space and trailing whitespace stripped** — the rule the verdict's condition is about. Zero semantic
changes are expected and required.

Comparing each pre-fix copy with its regenerated record, normalizing every whitespace run to a single space and
stripping trailing whitespace, over all 204 lines of each file:

- **Check descriptions and verdicts: 0 differences** once the three header lines are excluded (the header's
  `# generated:` timestamp is the only non-check line that differs, and it must).
- **Raw diffs are exactly two classes, both non-semantic:** lines 11 and 28 are the trailing-space trim
  (`a.rstrip() == b.rstrip()` — the fix itself); lines 186/187 carry the rendered age `2 days ago → 3 days ago`,
  which is the page's own time-relative vocabulary moving with the wall clock between the earlier and this run,
  not the emitter. No check description, condition, measured value or verdict moved.
- **Verdict tally identical:** `180 PASS / 0 FAIL / 2 SKIP` before and after, in both viewports; the same two
  skips, with the same reasons.

**Integrity.** The source/build integrity gate and the public-record guard were re-run; the served UI sha must be
unchanged.

| gate | result |
|---|---|
| `git diff --check` | **clean** (exit 0) — no whitespace error introduced |
| `node --check harness/verify-page.mjs` · `harness/test-redact.mjs` | **OK** — emitter and guard parse |
| `bun run harness:records` | **green** — 174 text files scanned, no live endpoint; the new assertion **the canonical read records carry no trailing whitespace** PASSes. It was **red on the pre-fix records**, naming exactly `verify-fixture-read-1440x900.txt:11,28` and `verify-fixture-read-1280x800.txt:11,28` — the guard can go red. |
| `bun run harness:identity` | **green** — 82 checks |
| `bun run typecheck` | **green** — 0 diagnostics |
| `bun run test` | **green** — 126 pass / 0 fail / 764 `expect()` |
| served-build guard, corpus | **OK** — sha `3b63f1fb…`, revision 52 (unchanged) |
| served-build guard, fixture | **OK** — sha `3b63f1fb…`, revision 36 (unchanged) |
| `ui/app.js` sha256 | **unchanged** — `3b63f1fb2a3f7f1222280fb5ab53243651566b72ca9718e59149445f43219bac` |
| `src/ui.tsx` sha256 | **unchanged** — `b5b14e0012d85aa28c229670170853a118665bc26b1cc24ea34d501c75f69e36` |

The executable regression ships in the existing suite rather than a new one: `harness/test-redact.mjs`
(`bun run harness:records`) now asserts the four canonical read records carry no trailing whitespace, by the read
pass's own transcript naming.

## Publication condition (second) — identity-bearing screenshot paths in the canonical read records, fixed at the emitter

The verdict's publication condition (above) was met by the whitespace repair. A second, independent hygiene defect
in the same generated records surfaced afterwards: **every canonical read transcript quoted its screenshots by
absolute path** — `/home/<user>/…/docs/screenshots/…` — so the record carried the local username and the machine's
directory layout into a public repository. Like the first condition, it changes no verdict and no visual
measurement.

**Root cause.** `harness/verify-page.mjs` prints each shot it produced (`console.log("<name> screenshot:", shot)`)
from the same `OUT` directory `read-pass.sh` passes as `$REPO/docs/…`, which is absolute. The endpoint rule in
`harness/redact.mjs` covered hosts, not filesystem paths, so neither emitter nor guard touched them.

**Fix — emitter-only, presentation-only.** `harness/redact.mjs` gains `pathLabel(file, repoRoot)`: a path inside the
repository becomes repo-relative (a reader with a clone resolves the same file, so the artifact linkage survives),
and a path outside it becomes `<scratch>/<basename>` — the shot's name kept, the machine hidden. The seven
screenshot lines in `verify-page.mjs` route through it; the shots themselves are still written to the same absolute
`OUT`. No check description, condition, measured value or verdict is touched.

**Regression.** `harness/test-redact.mjs` (`bun run harness:records`) gains `unredactedHomePaths()` and a second
tree assertion: no committed text file carries an identity-bearing home path. The predicate is narrowed exactly as
the endpoint rule is — `/home/<user>/` (angle brackets) and the documented placeholder `/home/user/…` are not
offences, asserted as unit cases beside the positives — so the guard goes red on a real leak without flagging the
repo's own prose about the rule. The scan is also restricted to the **public tree** (git-tracked plus untracked,
not-ignored files), so the derived, never-committed preview packs cannot present the pass's own throwaway build as
a leak (the scanned-file count is therefore 159 now, not the 174 the earlier endpoint-only filesystem walk
reported).

**Regeneration.** All four canonical read records were re-taken against the **unchanged** served build — both
served-build guards green before the runs (sha `3b63f1fb…`, corpus revision 52, fixture revision 36), no rebuild,
no reinstall, `ui/app.js` byte-stable:

| run | exit | verdict | transcript sha256 |
|---|---|---|---|
| corpus 1440×900 | 0 | 153 pass / 0 fail / 27 skip | `9c9ab5e000fec27c6d60565cc878de6526410c7780ace8f172e6e41da647f7cb` |
| corpus 1280×800 | 0 | 153 pass / 0 fail / 27 skip | `7a1b892ec017e7a45ccc1e0501a2ca9868c20892c6e2f3a13fbfa21aa4cf4d3e` |
| fixture 1440×900 | 0 | 180 pass / 0 fail / 2 skip | `fd283d0f6faee48407a7b809979874ef7c94d6bffac4a01b217b454fc41ee756` |
| fixture 1280×800 | 0 | 180 pass / 0 fail / 2 skip | `dbe2631abafd2a52cbbbabeedf6a399273b3318f9054c8d7183df5cf0a2b1caa` |

Each run republished its seven canonical screenshots as a side effect; those **binary** re-captures were reverted,
so the repair is a **text-only** change (records, emitter, guard, this record). The records now quote their shots
repo-relative (e.g. `docs/screenshots/research-dashboard-read.png`) and hold no home path, username or hostname;
the transcript header keeps loopback verbatim (`http://127.0.0.1:3003` / `:3005`).

**Normalized comparison.** Pre/post check descriptions and verdicts were compared with whitespace normalized to a
single space and trailing whitespace stripped, over every line of each file:

- **Verdict tally identical** in all four (`153/0/27`, `153/0/27`, `180/0/2`, `180/0/2`); the same skips, with the
  same reasons.
- **Raw diffs are exactly two classes, both non-semantic.** The header's `# generated:` timestamp (it must differ),
  and the seven screenshot lines, which move from the absolute `/home/<user>/…` form to the repo-relative label. In
  the two **corpus** records one further line differs: the Overview topic card's own window count, `346 → 322
  events`, which is the corpus 14-day window moving with the wall clock between the earlier run and this one — not
  the emitter; the check compares the render against the payload's own count and passes in both. No check
  description, condition or verdict moved.

**Integrity.**

| gate | result |
|---|---|
| `node --check harness/redact.mjs` · `harness/verify-page.mjs` · `harness/test-redact.mjs` | **OK** — all three parse |
| `bun run harness:records` | **green** — 159 text files scanned, no live endpoint **and no identity-bearing home path**; the home-path assertion was **red on the pre-fix records**, naming exactly the four canonical read records (each `/home/<user>/`) — the guard can go red |
| `bun run harness:identity` | **green** — 82 checks |
| `bun run typecheck` | **green** — 0 diagnostics |
| `bun run typecheck:host` | **green** — 0 diagnostics in this repo and `types/` (155 host-only, reported and not counted) |
| `bun run check` | **green** — typecheck + build + 126 pass / 0 fail / 764 `expect()` |
| `git diff --check` | **clean** (exit 0) |
| served-build guard, corpus | **OK** — sha `3b63f1fb…`, revision 52 (unchanged) |
| served-build guard, fixture | **OK** — sha `3b63f1fb…`, revision 36 (unchanged) |
| `ui/app.js` sha256 | **unchanged** — `3b63f1fb2a3f7f1222280fb5ab53243651566b72ca9718e59149445f43219bac` |
| `src/ui.tsx` sha256 | **unchanged** — `b5b14e0012d85aa28c229670170853a118665bc26b1cc24ea34d501c75f69e36` |

## Boundaries — what this record does and does not cover

- **No product or visual change.** The only `src/`-reachable change is none; the emitter is harness-only
  (`harness/verify-page.mjs`), and `bun run build` is byte-stable, so the served `ui/app.js` sha is unchanged.
- **No commit, push, tag, restart, kill, seed, or UI source write.** The work is left uncommitted for the parent,
  as the owner directed; the handed-over preview on `127.0.0.1:3010` and the four estate units were reused, not
  restarted.
- **The write-pass records are a stated, non-blocking boundary.** `docs/layout-fixtures/verify-fixture-write.txt`,
  `docs/layout-fixtures/verify-fixture-read-post-write-1440x900.txt` and `docs/corpus/verify-write.txt` carry the
  same emitter detail's trailing space from runs taken before this fix, and they quote their shots by a
  machine-specific mount path (`/mnt/<estate>/…`) for the same reason — the pre-fix emitter printed the absolute
  `OUT`. They are regenerated only by a **write pass, which mutates the fixture** (and is out of both conditions'
  scope); the emitter fix means the next write run is clean, and the home-path guard's public-tree predicate is
  scoped to home roots, so the mount path is stated here rather than silently exempted. They are not hand-edited —
  a committed transcript is a measurement, not prose.
- **The two non-blocking follow-ups are untouched**, per the verdict: People metadata density and long
  Repository-name wrapping (DECISIONS §14.6 / §14.8).
- **Tier B cleanup is not started here.** The owner's stated order (close V1 → Tier B) leaves Tier B to a
  separately-reviewed spec; nothing in Tier B's scope was touched.
