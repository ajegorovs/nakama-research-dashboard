# Decisions after the contract — post-contract clarifications

The contract in `docs/ux-v2/contract/` is **frozen and published verbatim**; nothing here edits it. This file
carries the decisions taken *after* it that a reader needs in order to read it correctly. Each entry says what
was decided, what it supersedes, and where the work lands.

## 1. Topics editing controls — the checklist's wording is the intended final behavior (2026-10-02)

> **Post-contract clarification — Topics editing controls.** The later UX review supersedes earlier language
> that retained broad `Add Topic` / `Edit Fields` controls. **Topics is primarily a read/navigation surface:**
> structural changes normally go through the librarian, and narrow note/correction/steering affordances are
> acceptable. The acceptance-checklist wording — *"Broad Add Topic / Edit Fields controls are absent"* —
> **represents the final intended behavior**, so it stands as written.

- **Superseded by this decision:** the `layout-rework-brief.md` toolbar list (which counts `Add topic` among the
  grouped controls) and any interaction-spec language that reads as requiring a broad edit entry point on
  Topics.
- **Not superseded:** the read/edit **mode** boundary — `Read topic` as the topic-level disclosure control and
  `Edit fields` as the way into editing, one control per piece of state. That is a separate requirement (D1) and
  stays.
- **Where the work lands:** **U6 (Topics refinement)**. The merged build is a usable UX-v2 baseline; removing
  the broad controls is polish, not a reason to reopen the merge. Raised in the U11 contract audit §10.

## 2. Deployment status is stated, not implied (2026-10-02)

There is **no always-on deployed dashboard service** today. The project is merged, installable and
reproducible from a clone; "production deployed" would be inaccurate. This restates D6 (dev instance only until
v2 is proven; the Docker deployment is out of scope) and is kept explicit in `services/nakama/HANDOFF-UX-V2.md`
and the estate's service README so no reader infers a live service from the acceptance records.
