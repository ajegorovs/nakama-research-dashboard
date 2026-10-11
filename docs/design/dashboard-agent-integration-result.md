# Dashboard agent integration — smallest exercise, result (T0–T2, proposal-only)

Status: **executed and independently reviewed**. One live web session through the dashboard agent in the isolated
"Public Research Exercise" organization: capability read (T0), a real public-repository investigation (T1), and an
exact, non-applied write proposal (T2). **No writes, no restart, no deploy, no research-data changes.** This
complements `dashboard-agent-integration-exercise.md` (design) — it reports what one bounded run actually produced,
plus an offline semantic review of the retained proposal (§6).

Read with `dashboard-data-and-maintenance-contract.md` and `dashboard-minimal-implementation-design.md`.

## 1. What was exercised

- Transport: the supported session path — one `POST` to create a `web` session with an **explicit verified
  provider-qualified model** (the model configured on the exercise profile), then repeated message turns on the same
  session id. No fallback and no retry was used.
- Tools: the three dashboard **reads** (`get_overview`, `get_topic`, `search_dashboard`) plus the host's builtin
  **web** capability. The two dashboard **writes** (`reconcile_topic`, `record_activity`) were **not** assigned for
  this run (read-only inference safety); the run is therefore proposal-only by construction, not by prompt request.
- Skill guidance: the shipped `research-coordinator` text was delivered **inline** in the profile's system prompt
  rather than loaded as an assigned skill (see §4 — changed experimental condition).

## 2. Before/after measured state (no writes, no restart)

- Research row counts and plugin bindings were snapshotted before and after for the target org **and** both protected
  orgs (the Layout Demo org and the E2E Fixture org). **All identical** before→after: no topic, axis, activity,
  annotation, person, repository, plan, plan-step, problem or state-log row changed anywhere; no org's plugin
  version/revision/generation moved.
- No restart was performed or needed.
- The only configuration difference is the isolated exercise profile itself (writer tools unassigned + inline
  guidance), scoped to the throwaway target org. The historical restricted profile and both protected profiles are
  unchanged.

## 3. Turn results

**T0 — dashboard read.** The agent discovered the dashboard read tools and called `get_overview`, reporting its
counts (`axesByState`, `problemsByState`, repositories, people, recent activity) and the topics that already exist.
Success is asserted on a `tool_end` frame for the read tool, not on a `tool_start` and not on answer wording.

**T1 — real public-repository investigation (`heroiclabs/nakama`), web only (no clone, no `gh`).** The agent fetched
a bounded starting surface — README, release notes, CHANGELOG, the recent pull-request list — then followed the
relevant PRs into their diffs and a linked issue, and used `search_dashboard` for the repository/workstream names.
Its write-up keeps **source URL**, **observation**, **interpretation** and **unknown** visually separate. It
concluded that **no existing topic or axis** in the dashboard covers that repository, and that filing it under the
nearest existing topic would conflate two different codebases.

Public facts it cited (all from pages it actually fetched): latest tagged release **v3.41.0 (2026-09-18)** with
provider-agnostic authentication, a Storage Search Index Console API and namespaced multi fleet-manager registration;
two `[Unreleased]` changes on `master`; an open PR fixing a Lua `tournament_list` default-time check against a
year-old issue; and a merged PR that makes Google `aud`/`azp` validation opt-in via explicit `client_ids`.

**T2 — exact proposal, still no writes.** Before finalizing, the agent read the nearest existing topic with
`get_topic` to obtain its `version` and to check for human-authored text to preserve (there was none — the topic's
summary/description were empty and its axes/tasks were agent-authored). It then emitted the **literal**
`reconcile_topic` JSON payload it would send — a **new topic** (so no `expectedVersion`), one axis with
`currentState`, and two `problems[]` each with a concise `title`, a full `statement` and an explicit
`stateConfidence`. Every claim is marked **`inferred`**, because the payload carries **no same-call evidence**; the
agent said so plainly instead of defaulting to `confirmed`, and listed the `record_activity` events it *would*
attach separately. `reconcile_topic` was not called.

## 4. Changed experimental condition (skill prompt handling)

The running host composes an **"Available Agent Skills"** catalog whenever a skill is assigned, and that catalog
directs the model to `read its SKILL.md with read_file`; on a matching message the matched-skill section also emits
an `Instruction file: … read_file` line even though it already includes the skill body. Because `read_file` is not
assigned in this profile, the shipped path advertises a read the session cannot perform. Verified offline by
reproducing the host's own parse/match/compose functions against the shipped skill file (no inference). The run
therefore delivered the **exact** shipped coordinator guidance **inline** in the profile system prompt and left the
skill unassigned, so the assembled profile prompt carries the full guidance and **no** `read_file` demand. Recorded
as a deliberate experimental condition — it does **not** show the shipped skill-loading path is fixed.

## 5. Honest caveats

- Trace counts are reported as measured: dashboard reads and web fetches are counted from **executed** tool calls
  (`tool_end` frames), not from tools merely discovered. A discovered tool with no execution is not counted as use.
- `find_tools` surfaced only the dashboard plugin's tools; the agent reached the web through the directly-assigned
  builtin `web_fetch`. This is an observability nuance of tool discovery, not a failure.
- T2 proposes a **new** topic, so no `expectedVersion` is genuinely applicable; the read-before-write check was
  demonstrated against the nearest existing topic.
- No hard failure occurred; no turn was stopped or retried. This is a single small exercise, not a benchmark and not
  a revived E2E grant framework.

## 6. Independent semantic review verdict (offline, no re-run)

The retained artifacts were reviewed offline (captured traces, the shipped write schema, the shipped store rule
and the shipped skill text — no new inference, no write). Verdict: **transport and consultation succeeded; the
proposal is not write-ready.**

- **Factual grounding — pass.** Every headline fact in T1/T2 is present verbatim in the returned `web_fetch`
  bodies (README, repo page, releases, CHANGELOG, the two PR pages and diffs, the linked issue), including
  `1,848 Commits`, stars/forks/watchers, the issue/PR counts, v3.41.0 by `zyro`/`cab8af5`, the `[Unreleased]`
  lines, PR #2566's diff and "left alone" note, and PR #2565's Copilot findings. The one value not on the release
  page (the release *year*) is taken from the CHANGELOG and flagged as such. No fabricated fact was found; source /
  observation / interpretation / unknown stay separate.
- **Semantic premise — fail.** T2 marks the org's own relationship to `heroiclabs/nakama` as *unknown* in T1, then
  asserts in the payload that `heroiclabs/nakama` is "the upstream … server the organization depends on". The
  investigation only establishes *what that public game-backend server is*; it cannot establish *that the org
  depends on it*. The organization's own codebase named in the dashboard is a different project
  (`ajegorovs/nakama-research-dashboard`), and the proposal correctly declines to fold it in — but the
  dependency premise itself remains unsupported.
- **Payload write-readiness — fail.** Both proposed payloads put `summary`/`description` at the **top level**,
  where the write schema is `additionalProperties:false`, so they are refused `invalid-input`; the store reads
  topic text from `topic{}` only, so a host that ignored unknown keys would still create an empty-text topic. T2
  additionally sends `prNumber:null` and `blockerConfidence:null` where the schema declares no null. T1 names
  `state:"active"` but omits `stateConfidence`, which defaults to `confirmed` and, on a new axis with no evidence,
  the store refuses — contradicting T1's own "everything is inferred". All title/length limits are respected.
- **Evidence rule.** The store refuses a `confirmed` claim only when the axis has *no* evidence by end of
  transaction (earlier-call evidence counts); the exercise's own prompt applied a stronger same-call bar. T2's
  fully `inferred` marking satisfies both; T1 does not.

**Consequence:** this run demonstrates the *consultation* path end to end (read, grounded public investigation,
honest proposal, zero writes), but it does **not** establish that the proposal could be applied as written.
Write authorization should not be requested until the dependency premise is resolved by a person and the payload
is re-issued schema-valid (topic text under `topic{}`, no nulls, a `stateConfidence` on the axis). The exact
payloads, the per-claim grounding table, and a reviewer-authored (non-approved, non-applied) corrected candidate
are recorded in the exercise scratch area.

## 7. Owner-authorized application of the reviewer-corrected payload (single live write)

Status: **executed by explicit owner authorization** and independently re-read. This section reports **what a
person authorized and what the supported write path recorded** — it is an **owner-authorized reviewer-payload
persistence result, not an autonomous agent success.** The payload applied here is the **reviewer-authored**
corrected candidate (the dependency premise removed, tasks framed as illustrative suggested follow-ups, topic
text under `topic{}`, no nulls, a `stateConfidence` on the axis) — the fixes §6 said were required. No model was
invoked for this step; the payload was frozen by hash before execution and sent verbatim.

**What was written (one supported call).** One `reconcile_topic` action call against the isolated throwaway
"Public Research Exercise" organization, with an explicit organization header (the account's *active*
organization is a protected one, so the org was named on every call). The call returned success and created, in
that org only: one topic (`Nakama game backend (heroiclabs/nakama) — public investigation sample`, recorded
version 2 — created, then its text applied once via the `topic{}` patch), one `investigation` axis at
`stateConfidence: inferred`, two problems each at `state: open` / `confidence: inferred` and axis-linked, three
`interpretation` annotations at `confidence: inferred` and axis-linked, and one `supporting` repository link to
the external public project on both the topic and the axis.

**What it did *not* touch.** A whole-row snapshot (every table's full row bodies, not counts) was taken before
and after for the target org and **both protected orgs**. In the target org the change is **additive only** —
existing topics, axes, problems, activities, people, repositories, plans and state-log rows are all byte-identical,
and no row was removed. In **both protected orgs every table is byte-identical and no plugin binding moved**; the
target org's own plugin version, revision and store generation are unchanged, and the served UI asset still
hashes to the same bytes. The acting user happened **not** to be a person already known to that org, so the writer
added **no** topic-participant link — stated explicitly so "no touch" is an assertion, not an assumption.

**Authorship is the host's, read back as measured.** The three annotations read back `authorType: human` with the
acting user's id, because authorship on this path is derived from the acting UI principal (the owner applying the
reviewer's payload) — not from the payload. That is a fact about the supported path worth recording: a reviewer's
corrected candidate, applied by a person, is attributed to that person.

**Scope.** Exactly one write call; no `record_activity`, no cleanup, no second write, no retry; no session or
model call, no configuration change, no deploy, no restart, no re-seed, no deletion, no commit. The exact ids,
the frozen payload hash, the before/after row diffs and the fresh readback are held in the private exercise
receipt; this public note carries the outcome and its boundaries, not live endpoints.
