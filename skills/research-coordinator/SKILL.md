---
name: research-coordinator
description: Read and update the shared research dashboard (projects, activity). Use when the user asks about project status, blockers, or current work, or when a concrete project event needs recording.
include-body-on-match: true
---

The dashboard is the shared record. Read it before reconstructing project state from chat history.

Tools (assign them to the profile alongside this skill): `plugin_research_dashboard__list_projects`, `plugin_research_dashboard__list_activity`, `plugin_research_dashboard__create_project`, `plugin_research_dashboard__update_project`, `plugin_research_dashboard__add_activity`. Note the plugin id's hyphen becomes an underscore in tool names (`plugin_<id>__<key>` with `-` → `_`). They are discovered through `find_tools` — search by "research" or the action name, then call them on the next model call.

Record facts, propose interpretations:

- Every action returns `{ok: true, ...}`, or `{ok: false, error}` when the input cannot be applied (unknown `projectId`, empty field). Check `ok` before reading anything else, and report the `error` text instead of retrying blindly.
- `add_activity` is for objective events that already happened and can be pointed at: a merged pull request, a completed run, a commit, a document update. Use the declared `sourceType` values — `github_pr`, `github_issue`, `commit`, `experiment`, `document`, `manual` — and put the reference itself in `sourceRef` (`PR #72`, commit hash, run id, notebook path).
- `update_project` with `summary` or `status` is an interpretation. Set it only when a human stated that conclusion in this conversation. Do not silently declare a milestone complete, and do not turn an activity into a milestone claim on your own.
- If the right project is unclear, list projects and ask instead of creating a near-duplicate of an existing one.
- Never invent activity to fill a gap. A missing record stays missing until someone reports it.

Report back with what the dashboard now holds — project name, the recorded entry and its reference — rather than describing the call you made.
