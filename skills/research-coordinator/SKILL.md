---
name: research-coordinator
description: Read and update the shared research dashboard (topics, development axes, activity). Use when the user asks about topic status, blockers, or current work, or when something a person said or did needs recording.
include-body-on-match: true
---

The dashboard is the shared record: **topics** are the organizational unit, a topic's **development
axes** are the workstreams running inside it, and activity, annotations, branches and pull requests
are the *evidence* attached to them. Read it before reconstructing state from chat history.

Tools (assign them to the profile alongside this skill) — the whole agent surface, five tools:

- `plugin_research_dashboard__get_overview` — counts by state, every blocked axis with its topic and
  blocker, recently touched topics, recent activity. Start here.
- `plugin_research_dashboard__get_topic` — one topic in full, by `topicId` or `topicName`: fields,
  axes with branch/PR/state/blocker and per-claim confidence, repositories, people, activity,
  annotations. It returns the topic's `version`.
- `plugin_research_dashboard__search_dashboard` — substring search across topics, axes, activity and
  annotations; each hit says which field matched. Use it before creating anything.
- `plugin_research_dashboard__reconcile_topic` — **the single write path** for a topic update.
- `plugin_research_dashboard__record_activity` — one objective event that already happened.

The plugin id's hyphen becomes an underscore in tool names (`plugin_<id>__<key>`, `-` → `_`). They are
discovered through `find_tools` — search by "research" or the action name, then call them on the next
model call.

How to work:

- Every call returns `{ok: true, ...}`, or `{ok: false, error}` when the input cannot be applied
  (unknown id, a blank required field, an axis that belongs to another topic). Check `ok` before
  reading anything else and report the `error` text rather than retrying blindly.
- `reconcile_topic` applies topic fields, axes, repository and person links, activity and annotations
  in **one transaction**: either all of it lands or none of it does. Pass everything one conversation
  established in a single call — do not split a change into several calls, and do not sequence writes
  yourself.
- Put the evidence in the same call as the claim. A claim marked `confirmed` (the default for `state`,
  `currentState`, `blocker`) must be backed by something in that call — a branch, a PR number/URL, an
  activity or an annotation — or the whole update is refused. When nothing could have confirmed it, say
  so with `stateConfidence`/`currentStateConfidence`/`blockerConfidence` set to `inferred`.
- Read `version` from `get_topic` and send it back as `expectedVersion` on the update. If someone else
  changed the topic in between, the call fails with a `conflict: ` error; re-read the topic and decide
  with the fresh state instead of overwriting.
- `record_activity` is for objective events that can be pointed at: a merged pull request, a completed
  run, a commit, a document update. Use the declared `sourceType` values (`github_pr`, `github_commit`,
  `github_issue`, `repo_document`, `group_chat`, `experiment`, `agent_review`, `manual`) and put the
  identifier in `sourceRef` (`PR #72`, commit hash, run id, notebook path).
- A topic's `summary` is an interpretation. Set it only when a human stated that conclusion in this
  conversation; do not turn an activity into a milestone claim on your own.
- Do not create a near-duplicate: `search_dashboard` first, then extend the topic that is already
  there. Never invent activity to fill a gap — a missing record stays missing until someone reports it.
- Identity comes from the session, not from you: the platform records who acted. Do not pass an actor,
  a user id or a database path.

Report back what the dashboard now holds — topic, axis, the recorded entry and its reference — rather
than describing the calls you made.
