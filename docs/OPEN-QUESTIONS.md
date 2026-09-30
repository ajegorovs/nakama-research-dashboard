# Open questions — what we want the reviewer to weigh in on

Five areas. Each has: what is **settled** (platform constraints we cannot wish away), what is
genuinely **open**, and the questions we want answered. `PLATFORM-CONTEXT.md` carries the evidence
behind every settled claim.

---

## 1. UI layout — how far can it be redone?

**Settled.** One page per plugin; React module inside the host's React tree; arbitrary CSS scoped to
`[data-plugin-id]`; the host's component library available plus anything you bundle; no sidebar entry
in v0.4.31 (command palette only); the host shell cannot be restyled; plugin pages are invisible to
org viewers.

**Settled (2026-09-30, at C6).** One page with internal views is the model, and the views are cheaper than
expected: `get_overview` carries all three, so switching is not a second query. The people view is
**person-first** — the page answers "what is each person working on", not "which topics contain this
name" — with factual involvement only (no workload scoring, percentages, utilization or ranking). See the
C6 status in [`V2-PLAN.md`](V2-PLAN.md) §6.

**Open.** Which host components to keep for visual consistency vs. bringing our own, whether the detail
pane should become a route (client-side routing inside the page is ours to implement), and whether a
chat-side card (`tool:<actionKey>` renderer) is a better home for activity review than the page.

**Questions.** Is "one page + internal views" acceptable, or does the layout you want need surfaces
the platform does not offer? Should the page be optimised for scanning (many projects, little detail)
or for depth (one project, full history)? Do we keep host components (native look, less code) or own
the look entirely?

## 2. Extra functionality — where does it belong?

**Settled.** Three extension surfaces exist: actions (also agent tools), the page, and chat tool
renderers. Actions run in a fresh child process per call; anything they persist goes in the plugin's
per-org SQLite; expensive work in a request path is therefore a bad idea. Interpretive data
(`projects.summary`) is currently human-entered only.

**Open.** Candidate directions, none implemented: a **review queue** (proposals that must be approved
before touching status/summary), **GitHub ingestion** (pull via an automation + a tool vs. push via
webhook — push has no proven inbound surface, see issue 7), **per-user views/filters** (the actor id
is available but nothing uses it), **reporting** (a read-only API other services could call), file
attachments or links for evidence.

**Questions.** Which of these are actually wanted, and which are over-engineering for a research
group? Should interpretations ever be written by the agent without a human approving, or is the
review queue mandatory? Is the plugin the right place for GitHub polling, or should that live in an
automation prompt plus an existing GitHub tool/MCP?

## 3. Multi-user — what does "works across multiple users" mean for us?

**Settled.** Data is org-shared (one SQLite per org); the actor `{id, role}` is available to plugin
code but unused today; **viewers cannot load plugin pages at all**; org admins manage people, while
profiles/tools/skills are provisioned by a platform admin; the plugin has no concurrency handling
(no WAL, no busy timeout, no transactions) and each action call is a separate process.

**Open.** Whether we want per-user private state (drafts, personal notes) alongside the shared board,
whether some members should be read-only *inside* the page (the platform gives no read-only role that
can still see it), and what happens with simultaneous writers — plausible for a group of researchers
all updating projects after a meeting.

**Questions.** Do multiple users mean *many readers, few writers* or *everyone writes*? Do we need
per-user views, or is one shared board correct? Should the store move to WAL + busy timeout (or
serialise writes in the plugin) before more than a handful of people use it? Do we need an audit trail
of who changed what — nothing records that today?

## 4. Service delivery — how would this be provided to the group?

**Settled.** The stock deployment is one container with a bind-mounted data root, tailnet-only
exposure, login required, no Docker socket. Bundled plugins require a **custom image built from the
upstream tree plus this plugin** (the package-registry path means publishing publicly — currently
ruled out). The agent half needs an OpenAI-compatible provider; provider config is
platform-admin-only, and the global default cannot be switched through the API.

**Open.** Whether to ship a custom image at all (vs. keeping a dev instance), where it should be
exposed (tailnet-only is the current posture), what the backup story is for the data root (which
contains provider keys in plaintext), what the resource footprint looks like for a small group, and
who is expected to operate it.

**Questions.** Is a private, tailnet-only instance for the group the target, or does this need to be
reachable more widely? Acceptable to run a fork-derived image and rebuild it on upstream changes? Who
holds the operator role — and is "one team instance" the model, or one org per project/person? What
backup/restore expectation should we design for?

## 5. Keeping the plugin updated

**Settled.** Releases are immutable; reinstall mints `+dev.<digest>` per org and preserves data;
migrations are forward-only; a bundled plugin's bytes come from the server tree, so an update means
new image + reinstall per org. The plugin currently exists in four places: the **repo**, the **in-tree
dev copy**, the org's **selected release**, and the org's **materialized skill row**.

**Open.** How to keep those four from drifting (today the repo is canonical by convention only), and
how much process to add for a small group.

**Questions.** Is "edit the repo, sync to the instance, reinstall" an acceptable operator workflow, or
do we want the instance regenerated from the repo by a script (drift becomes impossible)? Do we want
CI on the repo (`bun run check`, failing on a dirty tree) so a stale committed bundle cannot land? Is
the in-tree copy needed at all, or should the server tree always be produced by the vendor script?

---

## What a useful review would cover

1. **Correctness/robustness of the existing plugin** — start with the review table in `README.md`.
2. **A verdict per area above**: keep as is / change / out of scope, with reasons.
3. **Any assumption in `PLATFORM-CONTEXT.md` you can falsify** — it is marked up as verified vs
   unverified deliberately; treat the unverified list as a work queue, not as fact.
