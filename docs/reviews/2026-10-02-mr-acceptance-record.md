# Merge-readiness acceptance record — composition phase (`composition/c1-topics`)

**Recorded:** 2026-10-02 · **Reviewer verdicts given on:** the merge-readiness evidence
(`docs/ux-v2/MR-composition-merge-readiness.md`) and the redaction fix it produced
(`harness/redact.mjs`, `harness/redact-url.mjs`, `harness/test-redact.mjs`).

This record exists so the phase's acceptances are not only implied by a commit that changed the code under review.
The reviewer's words are quoted; everything outside a quote is the project's own summary and says so.

## Sequence

1. The merge-readiness pass was executed and handed over for review.
2. The reviewer returned **"Merge readiness: conditionally accepted"** with one blocker and one bookkeeping
   correction — the blocker being a **privacy regression**: the records still carried the live tailnet endpoint in
   their transcript headers, and the emitters that wrote them (`read-pass.sh`'s header, the palette check's PASS
   detail) would have re-created it on the next pass.
3. Both conditions were closed: the records redacted in place (presentation only), both emitters moved behind one
   rule with a whole-tree guard, and the branch-count wording stated as a self-reference. The residual history
   exposure was reported with its commit count rather than papered over.
4. The reviewer then returned the ruling below, which includes one further documentation correction.

## The `.home` correction (the reviewer's last catch, and it was right)

> `harness/redact.mjs` deliberately **does not treat `.home` as a private suffix**. `MR-composition-merge-readiness.md`
> §11 currently says the private suffix list includes `.home`. … the MR document should match the implementation and
> say the suffixes are `.ts.net`, `.local`, `.internal`, `.lan`, with `.home` explicitly excluded for that reason.

Correct, and corrected in three places that repeated the error — the merge-readiness doc §11, `DECISIONS.md` §11 and
the estate's `HANDOFF-UX-V2.md`. The implementation was always the narrower list: `.home` would collide with
ordinary code (`process.env.HOME`, `landing.home`), and a guard that flags ordinary code teaches its reader to
ignore it. **Documentation-only: no acceptance value changed, nothing was re-run for it.**

## Final ruling (verbatim)

> Both merge-readiness conditions are substantively closed, and the branch is ready to merge after one tiny
> documentation correction. … I verified the branch is currently **38 ahead / 0 behind** `main`, and the redaction
> implementation itself does what the agent described. The emitter fix is real, centralized, and guarded; the
> current tree is clean of the leaked endpoint.
>
> **Composition C1–C5: accepted.**
> **Merge-readiness: accepted.**
> **Endpoint-redaction blocker: closed.**
> **History rewrite: not required; do not rewrite.**
> **`main` may be fast-forwarded to the composition branch after the `.home` wording fix.**
>
> After merge, the next task should be the parked **H1 keyboard-focus visibility validation against the merged
> composition**, followed by whatever final release/tagging or cleanup you want for the UX-v2 composition phase.

## The history question, decided rather than left open

The reviewer's reasoning, recorded because it settles a question that will otherwise be re-raised:

> I also agree with the decision **not to rewrite history**. The exposure has already happened in a public branch,
> so rewriting now cannot guarantee erasure from caches/clones/forks, while it would invalidate 38 commit hashes and
> complicate the evidence trail. The important thing is that `main` has never contained it, the current branch tip
> is clean, and future emitters are fixed.

So: the identifier stays in the branch's history by **decision**, the tree and every future pass are clean, and
`main` is verified to have never carried it. `DECISIONS.md` §11 already states the general form of this rule
(history is reported, never rewritten to satisfy a scrub) — this record is the specific instance.

## What this authorizes, and what it does not

- **Authorized:** the fast-forward of `main` to this branch.
- **Not implied:** a rewrite of any kind, a new build (the redaction work touches no product code, so the tested
  bundle still corresponds to the C5 implementation commit `c1b2059`), or any re-run of product acceptance.
- **Parked, and next:** H1's keyboard-focus visibility validation — against the *merged* composition, since that is
  the tree it will ship on.
