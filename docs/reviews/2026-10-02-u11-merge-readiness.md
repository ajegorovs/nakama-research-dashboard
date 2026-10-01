# U11 — merge readiness: the evidence bundle, and the merge

**Date:** 2026-10-02 · **Reviewer ask:** *"Proceed to U11 / merge-readiness with estate wiring, exact-build
verification, final clean acceptance, documentation reconciliation, and merge-plan execution."* · **Candidate:**
`ux-v2` head · **Full record:** `docs/ux-v2/U11-merge-readiness.md`

**No product code in this chunk.** It answers *does the evidence point at the exact commit we are about to
merge?* — and then merges.

## What was verified, and how

1. **Estate wiring — the non-obvious answer.** The estate's always-on Nakama (`100.x:4310`,
   `ghcr.io/ahmadrosid/nakama:latest`) is the **vendor's test instance**: its data root carries no plugin
   records at all, so the research dashboard was never installed there. The plugin is served from the
   **vendored artifact** in the Nakama checkout (`packages/plugins/research-dashboard/`) plus the isolated
   acceptance instances. There is **no always-on estate service serving this plugin** — recorded so no reader has
   to reconstruct it.
2. **Exact-build identity.** Every file in the four digest folders (`actions` 1, `migrations` 4, `ui` 1,
   `skills` 1) is **byte-identical** between the candidate build and the vendored checkout; the served bytes are
   identical on both instances on each route (web `c80ada07b81f13e6164a`, Nakama `ca730ec7fc2b7edb7277`);
   vendoring is idempotent; nothing stale sits in the vendored tree. Two honest qualifications: a **fresh
   install publishes the packaged `0.2.0`** rather than a `+dev.<digest>` release (same tree bytes), and each
   serving route *wraps* the asset — so the claim is "both instances serve the same bytes, from a source
   byte-identical to the candidate build", not "served bytes equal the source file".
3. **Merge diff, by class.** 88 files, +23237 −510: 62 docs, 10 harness, 6 src, 6 build/config, 4 other. No
   `.env`, no `node_modules`, no logs/tmp, no absolute home paths; and after `bun run check` the worktree is
   **clean**, which is how "the committed bundle is current" is established rather than assumed.
4. **Final acceptance from the candidate**, on stores re-seeded from scratch: corpus **84 · 0 · 22**, fixture
   **107 · 0 · 0**, both viewports, exit 0.
5. **Clean-clone reproduction** (the U0 lesson): a fresh clone reproduces `bun install` → `bun run check`
   (126 · 0 · 764) → vendor → fresh instance → install → seed → pass, with **identical verdict sequences**
   (`56d284c3d9` corpus, `49e7652baa` fixture) — and it found its own recipe gap, which is what it is for: a
   fresh store has no user, so the install fails `HTTP 401` unless the instance is started with the env file's
   `NAKAMA_SEED_ADMIN_*` values exported.
6. **Docs reconciled**: `README.md` now carries the transcript contract (the four exits and which two are
   archived, the identity guard, and the known time-relative `Recent: N events`), `STATUS.md`'s U10 row is
   closed with its final records and U11 is stated, `docs/layout-rework-brief.md` is marked historical with its
   counts labelled as the baseline, and `docs/ux-v2/U11-merge-readiness.md` holds the bundle.

## Merge

`main` (`9b48f99`) is the merge base and `ux-v2` is 42 ahead / 0 behind, so this is a **fast-forward**: the
merge commit is the candidate commit. The annotated `pre-ux-v2` tag already dereferences to `9b48f99`, giving a
reference point and a one-command rollback. Sequence: evidence committed on `ux-v2` → tag `ux-v2-complete` →
`git merge --ff-only ux-v2` → push `main` + tag → verify `git ls-remote origin main` equals the candidate.

## Deliberately not done

The 22 corpus skips stay (each with its reason); `Recent: N events` stays time-relative (a projection design
question, not merge hardening); the pre-pivot screenshot set is kept; U5/U6/U8/U9 are labelled *remaining
refinement*, not pending.
