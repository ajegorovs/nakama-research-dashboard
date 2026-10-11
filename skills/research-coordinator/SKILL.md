---
name: research-coordinator
description: Read and update the shared research dashboard (topics, development axes, activity). Use when the user asks about topic status, blockers, or current work, or when something a person said or did needs recording.
include-body-on-match: true
---

The dashboard is the shared record: **topics** are the organizational unit, a topic's **development
axes** are the workstreams running inside it, **problems** (tasks) are the general actionable work inside
it — each `open`, `blocked` or `resolved` — and **plans** are optional ordered step lists owned by a
topic, an axis or a task. Activity, annotations, branches and pull requests are the *evidence* attached to
them. Read it before reconstructing state from chat history.

Tools (assign them to the profile alongside this skill) — the whole agent surface, five tools:

- `plugin_research_dashboard__get_overview` — the one read that answers "where does the group stand":
  counts by state — workstreams (`axesByState`) and tasks (`problemsByState`, so the open/blocked task
  counts come from stored state, not a page) — every blocked axis with its topic and blocker, recently
  touched topics, recent activity, plus three rollups over the same window — `people` (who is on what, and
  only the activity attributable to their own account), `repositories` (what each codebase carries and what
  is happening in it) and `timeline` (what changed in the window, grouped topic → axis → event). Start
  here, and prefer it to asking several narrow questions.
- `plugin_research_dashboard__get_topic` — one topic in full, by `topicId` or `topicName`: fields,
  axes with branch/PR/state/blocker and per-claim confidence, repositories, people, activity,
  annotations. It returns the topic's `version`. Pass `axisId` to scope the read to **one workstream**
  instead: you then get `axis` (that axis in full, its problems each with their own problem-scoped
  `notes`) and `coverage` — per-collection `{limit, limitScope, returned, total, truncated, absent}`.
  `limitScope` says what `limit` bounds: `collection` (the returned count never exceeds the limit)
  for `history`/`notes`, but `per-source` for `evidence` and `per-problem` for `problemNotes`, where
  `returned` is a sum and can exceed `limit`. Read `truncated` (rows exist beyond what was returned),
  not the `returned <= limit` assumption, and never read an empty collection (`absent`) as omitted.
  Under `axisId` only `historyLimit` and `notesLimit` apply; `includeAnnotations`, `activityLimit`
  and `activitySinceDays` are ignored. Sibling axes are
  not returned; an `axisId` that is unknown or belongs to another topic is refused.
- `plugin_research_dashboard__search_dashboard` — substring search across topics, axes, tasks
  (`statement` and `title`), activity and annotations; each hit says which field matched. Use it before
  creating anything.
- `plugin_research_dashboard__reconcile_topic` — **the single write path** for a topic update.
- `plugin_research_dashboard__record_activity` — one objective event that already happened.

The plugin id's hyphen becomes an underscore in tool names (`plugin_<id>__<key>`, `-` → `_`). They are
discovered through `find_tools` — search by "research" or the action name, then call them on the next
model call.

How to work:

- Every call returns `{ok: true, ...}`, or `{ok: false, error, kind}` when the input cannot be applied.
  Check `ok` before reading anything else. Read `kind` before deciding what to do, and report the `error`
  text rather than retrying blindly:

  | `kind` | what it means | what to do |
  |---|---|---|
  | `conflict` | someone else wrote to the row since you read it | re-read, then decide again with the fresh state |
  | `no-op` | the record is already in that state | nothing — do **not** retry; say it is already so |
  | `invalid-state` | that state name does not exist | fix the name; the axis and problem vocabularies differ |
  | `human-authored` | an agent may not replace words a person wrote | stop and ask the person to edit the text |
  | `invalid-input` | every other fixable rule (unknown id, blank field, a claim with no evidence) | fix the input and retry |

  A refusal writes nothing at all — no partial update, no history row.
- `reconcile_topic` applies topic fields, axes, repository and person links, `problems`, `plans` (with
  their steps) and `transitions` in **one transaction**: either all of it lands or none of it does. Pass
  everything one conversation established in a single call — do not split a change into several calls,
  and do not sequence writes yourself.
- **States are recorded, not typed in.** An axis has one of `active`, `usable`, `draft`, `blocked`,
  `parked`, `completed`, `abandoned`; a task is `open`, `blocked` or `resolved`. `usable` is not a softer
  `completed`: it means the work is operationally relevant and still has acknowledged gaps. A blocked
  workstream and a blocked task are **different facts**: a workstream blocked on something external is not
  a task being blocked, and vice versa — say *why* something is blocked in its body or a note rather than
  leaving the state to carry the reason. To change a state that already exists, send a `transitions` entry
  (`{subject, toState, …}`) — never a `state` field on the update, which is refused because it would leave
  the change unrecorded. Every change between two different states is allowed and appended to the history,
  reopening included; a change that would not change anything is refused as `no-op`. The task's history
  keeps what it was, so reopening `open → resolved → open` still shows it was once resolved.
- **A problem is a real record, not a status note** — and a task is general actionable work. Raise one —
  `problems: [{axisTitle, statement, …}]`. It is meaningful without a repository, a plan step or a single
  activity — do not attach evidence that does not exist in order to make it look supported, and do not
  invent a plan for it. Problems are distinct from annotations: an annotation is context or a claim about
  the record, a problem is actionable work. Mark a problem's state with `stateConfidence`, and link the
  repository it concerns with `repositoryFullNames` when there is one. Its `title` is concise, distinct
  text you author — see the text rule below.
- **A plan is optional and belongs to one owner.** Send
  `plans: [{topicId|axisTitle|problemId, summary, steps: [{title, state}]}]` only when the conversation
  established one; an axis without a plan is normal. Exactly one owner: a project (`topicId`), a
  workstream (`axisId`/`axisTitle`) or a task (`problemId`). Keep it a **simple ordered step list — no
  rollups**. A task's plan is **created after the task exists**: `plans` are applied before `problems` in
  one call, so create the task, read its id back, then attach its plan in a later call. A step's state is
  `pending`, `active`, `done` or `blocked`.
- **A state change is not a rewrite.** A topic's `summary` is a concise orientation and its `description`
  is the full purpose; a task's `statement` is the full text and its `title` is a concise label distinct
  from it. You **may draft and maintain** a topic's `summary`/`description` and a task's `title` from
  sources you actually read — but read the record first (`get_topic`), send it back with `expectedVersion`,
  and **preserve any known human edit**: never overwrite words a person wrote or corrected; propose the
  change instead. For a **task**, the store enforces this: if a person wrote or
  edited its text, an agent's attempt to change the `statement` or the `title` is refused `human-authored`
  — change the state, the links or a plan step instead, or ask the person. Repeating the text back
  unchanged while updating the fields around it is allowed and does not make the words yours. For a
  **topic**, there is **no mechanical guard** (the topic table carries no author) — the never-overwrite
  rule there is instruction-level only, so hold to it deliberately.
- **History is permanent while its subject exists.** Every recorded state change is kept, and nothing
  removes a history row: correcting a mistaken transition means recording the next one, not erasing the
  last. Deleting an axis or a problem takes its history with it, so deletion is destructive cleanup for
  records that should never have existed — never a way to tidy up a state you did not mean. Nothing in
  this surface deletes: if a record is wrong, say so, record the corrected state, and let a person decide
  about deletion.
- **Read before you infer.** A topic's annotations and corrections are human notes, and they are part of
  the record: read them together with the activity before deciding that an axis is stale, finished or
  blocked. A human annotation outranks your inference — if your reading of the work disagrees with one,
  record the disagreement as a new annotation or an `inferred` claim and say so in your reply. Never
  overwrite it and never treat it as silently out of date.
- **Reconcile, do not recreate.** Pass the axis's `id` (or its exact existing title) with the fields that
  changed: a workstream already on the topic is the same axis, not a new one. A parallel axis for the same
  workstream, or a second topic for the same direction, splits the record — that is the failure this write
  path exists to prevent.
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
  identifier in `sourceRef` (`PR #72`, commit hash, run id, notebook path). Name a `problemId` to record
  the event as **evidence for that task** (the task's axis must be the axis you are recording against).
- A topic's `summary` is an interpretation you may draft and maintain from sources you actually read — but
  never overwrite words a person wrote or corrected. Because the topic table carries no author, that bound
  is **instruction-level only** (unlike a task's text, which the store guards): hold to it deliberately,
  and when unsure, propose the change rather than applying it.
- Do not create a near-duplicate: `search_dashboard` first, then extend the topic that is already
  there. Never invent activity to fill a gap — a missing record stays missing until someone reports it.
- Identity comes from the session, not from you: the platform records who acted. Do not pass an actor,
  a user id or a database path.

Report back what the dashboard now holds — topic, axis, the recorded entry and its reference — rather
than describing the calls you made.
