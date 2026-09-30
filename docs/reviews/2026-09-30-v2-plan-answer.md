# External review — answer to the V2 plan delta review (2026-09-30)

**Status:** decisions accepted; the review pass is closed.
**Answers to:** [`2026-09-30-v2-plan-review-request.md`](2026-09-30-v2-plan-review-request.md)
(six questions, each with the SQL we proposed).
**Resulting plan:** [`../V2-PLAN.md`](../V2-PLAN.md) §6–§7. Verbatim below.

---

I agree with the agent's delta-only framing, but I found **one factual error that should be corrected before implementation**.

Nakama **does validate `inputSchema` at runtime**. In current upstream `plugin-service.ts`, `invokePluginAction()` calls `validatePluginJsonInstance(action.inputSchema, cleanedInput)` and returns `invalid_input` on failure. So SQL `CHECK` constraints are still good defense-in-depth, but they are **not the only validation barrier**.

My answers to the six questions:

1. **Confidence:** choose **(b), three columns** now: `state_confidence`, `current_state_confidence`, `blocker_confidence`. Do not add `axis_claims` yet. People assignment probably does not need confidence initially; it can be corrected explicitly.

2. **Multiple repos per development axis:** add `axis_repositories`. I would **drop `development_axes.repository_id`**, rather than keep a duplicated "display default" that needs synchronization. Put a `relationship` on the join row, with exactly one optionally marked `primary`. The UI can select the primary repository from there.

3. **Topic status:** use exactly:
   `active | paused | completed | archived`.
   Do not reuse axis states; topic and axis lifecycle semantics are different. Add SQL `CHECK`s anyway, alongside the already-working Nakama input-schema validation.

4. **Migration collision:** the proposed rename/copy strategy is correct:
   `projects → projects_v1`, `activities → activities_v1`, create clean V2 names, copy, preserve V1 until proven, then drop in 003. Mapping `commit → github_commit`, `document → repo_document`, and backfilling `recorded_at = occurred_at` are sensible.

5. **C9a/C9b split:** accepted. Do **C9a before GitHub evidence integration** so the new dashboard/tool contract can be exercised manually. C9b should explicitly be the later evidence-driven librarian behavior once repo/GitHub access is defined.

6. **Eight tools:** I would **reduce to five now**, rather than intentionally pay two discovery cycles. The librarian's main contract should be compact:
   - `get_overview`
   - `get_topic`
   - `search_dashboard`
   - `reconcile_topic`
   - `record_activity`

   Person/repository registration should be folded into `reconcile_topic` or kept as non-agent UI/admin actions. Eight exposed tools don't buy much for the librarian.

One additional schema suggestion: put `actor_type`, `actor_id`, and source/evidence metadata on changes that matter, but avoid turning every field into a provenance system in V2. The three confidence fields + activities + annotations are enough initially.

So I would tell the implementation agent:

> **Proceed, with four adjustments:** correct the inputSchema-validation assumption; use per-field confidence; add `axis_repositories` and remove the single repo FK; expose only five librarian tools.

The rest of the split and migration plan looks ready to implement.
