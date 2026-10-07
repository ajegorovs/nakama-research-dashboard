# Draft-PR workflow and public-record hygiene — plan

> Commit 1 of this branch. It states the intent; the implementation commits follow.

## Goal

Adopt a plan-first, draft-PR workflow in this repository, and close the public-record hygiene gap that
lets a machine's own filesystem paths into a committed artifact — without changing product behaviour.

## Scope

1. **Workflow policy (`AGENTS.md`).** Add a *Plan-first tasks and draft PRs* section: one branch per
   coherent task off `main`, the plan committed first under `docs/plans/`, the PR opened as a **draft**
   right after the plan commit, local operational detail kept out of the committed plan (it is an
   appendix in the ignored scratch), resume a task from the PR rather than session memory, and merge
   only at the reviewed head once the gates pass.
2. **Storage-mount hygiene class (`harness/redact.mjs`, `harness/test-redact.mjs`).** The public-tree
   guard already detects live endpoints and identity-bearing home paths. Add the third class, a quoted
   **storage mount** (`/mnt/<name>/`), with the same narrowing as the home rule: a concrete segment is
   identity; a placeholder (`<machine-storage>`, `<estate>`, `...`) is kept; a concrete segment a
   product legitimately ships is tolerated only via `PUBLIC_RECORDS_MOUNT_ALLOW`. The rule's own suite
   covers both sides of the narrowing, and the guard scans the whole public tree across all three
   classes.
3. **Remove machine-host defaults from the harness.** `harness/refresh.sh` (estate + Nakama checkout)
   and `harness/typecheck-host.mjs` (`--checkout` / `NAKAMA_CHECKOUT`) no longer default to this
   machine's paths; both are required and the scripts refuse with a clear message. A public repo must
   not carry a machine's own path, and a guessed checkout would silently typecheck the wrong host types.
4. **Redact committed records.** The acceptance records and verification transcripts that quoted their
   screenshot/data paths by absolute machine path are rewritten **presentation-only** to the
   repo-relative form the fixed emitter now writes, and the record prose that described the old state
   is corrected. Documentation describing the guard (`README.md`, `.agents/skills/public-records-hygiene`,
   `docs/ux-v2/DECISIONS.md`) is brought consistent with the whole-tree, three-class scan.
5. **Executor procedure (`dashboard-build-and-serve` skill).** Record that the reinstall/install helpers
   bind the target organization explicitly through `harness/org-selection.mjs` — `--org-id` /
   `--org-name` (or `NAKAMA_ORG_ID` / `NAKAMA_ORG_NAME`), refusing a multi-org account with no selector
   rather than rebinding `orgs[0]`.

## Acceptance criteria

- `bun run harness:records` is green: the rule's unit cases pass and the whole public tree scans clean
  across all three classes (live endpoint, identity-bearing home path, machine storage mount).
- `git diff --check` is clean.
- No tracked file carries a machine's own mount or home path; the guard's suite is shown to go red on a
  planted offence (negative case asserted, not assumed).

## Explicit exclusions

- No product source, build output or behavioural test change: this is policy and record hygiene only.
- The pre-existing uncommitted edit to `.agents/skills/acceptance-pass/SKILL.md` is **not** part of this
  branch — it is a separate change and is left unstaged.
- No history rewrite: corrections live in the tree and the diff, never in a force-push.
