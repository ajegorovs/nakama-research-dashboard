/**
 * Action entrypoint — the generation-2 surface.
 *
 * Every declared action in `nakama.plugin.json` points at this bundle; the host says which one ran
 * through `context.actionKey`.
 *
 * Five of those actions are the agent's contract (`exposeAsTool: true`): `get_overview`, `get_topic`,
 * `search_dashboard`, `reconcile_topic`, `record_activity`. The other three exist for the page and for
 * admin work and are deliberately not tools, so the agent's tool discovery stays one `find_tools`
 * search (D4). They are still ordinary HTTP actions — `exposeAsTool` governs the tool registry, not
 * access.
 *
 * ## Who validates what
 *
 * - The **host** validates input shape against the declared schema, recursively, before this file runs;
 *   a violation never reaches us and surfaces as `HTTP 400 {"error":"invalid_input"}`.
 * - This file validates what needs the database (unknown id, an axis belonging to another topic, no
 *   owner given) and returns `{ ok: false, error }` for it — the shape a caller can act on.
 * - A stale `expectedVersion` throws `ResearchStoreConflictError`, whose message keeps the `conflict: `
 *   prefix, so a caller can tell "re-read and retry" from "your input was wrong".
 * - Anything else is a bug and is re-thrown rather than swallowed: a hidden exception is how a real
 *   failure becomes a silent no-op, and the caller deserves the generic 500 that says so.
 *
 * ## Provenance
 *
 * The acting identity is **always** `context.actor` (plus `profileId`, which is present on agent tool
 * calls and tells a machine apart from a person). Nothing here reads identity, org, or a database path
 * from `input` — the host strips spoofed copies of those keys, and `reconcile_topic` applies the actor
 * to its payload last, so even a surviving spoof cannot overwrite it.
 *
 * ## Transactions
 *
 * None are opened here. `reconcile_topic` is a single call into `store.reconcileTopic()`, which owns the
 * one transaction the whole update needs; every other write maps to one atomic store method. A caller
 * that finds itself sequencing two writes should be using `reconcile_topic` instead.
 */
import type { PluginExecutionContext } from "@nakama/core";
import {
  type ActorType,
  type Axis,
  DEFAULT_ACTIVITY_WINDOW_DAYS,
  EXTERNAL_EVENT_KINDS,
  type ExternalEvidenceEnvelopeV1,
  type ExternalEventKind,
  type ReconcileTopicInput,
  ResearchStore,
  ResearchStoreConflictError,
  ResearchStoreError,
  SOURCE_TYPES,
  type SourceType,
  TOPIC_STATUSES,
  type Topic,
  type TopicStatus,
} from "./store";

type Context = PluginExecutionContext & {
  actionKey: string;
  host(request: Record<string, unknown>): Promise<unknown>;
  /** Present when the caller is an agent tool call rather than a person using the page. */
  profileId?: string;
};

type Input = Record<string, unknown>;

/** Caller-fixable input problem; converted into a structured result in `run`. */
class BusinessRuleError extends Error {}

function optionalText(
  value: unknown,
  field: string,
  max: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BusinessRuleError(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > max) {
    throw new BusinessRuleError(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = optionalText(value, field, max);
  if (text === undefined) {
    throw new BusinessRuleError(`${field} is required.`);
  }
  return text;
}

function optionalInt(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BusinessRuleError(`${field} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new BusinessRuleError(`${field} must be between ${min} and ${max}.`);
  }
  return value;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new BusinessRuleError(
      `${field} must be one of: ${allowed.join(", ")}.`
    );
  }
  return value as T;
}

/**
 * The optional paging inputs, read in one place so every page-shaped read validates them identically.
 *
 * Returns `null` when **neither** `offset` nor `pageSize` was sent: the caller then returns exactly the
 * shape it always has, and the new `*Page` sibling is absent. The page sibling appears only when paging was
 * asked for, so an existing caller's payload gains no key it did not request. `offset` is bounded (a
 * non-negative integer); `pageSize` is bounded to the store's page range — both refused at the boundary,
 * not silently clamped.
 */
function readPaging(input: Input): { limit?: number; offset?: number } | null {
  const offset = optionalInt(input.offset, "offset", 0, 1_000_000);
  const pageSize = optionalInt(input.pageSize, "pageSize", 1, 100);
  if (offset === undefined && pageSize === undefined) {
    return null;
  }
  return { limit: pageSize, offset };
}

/**
 * Who is acting. `profileId` is present on agent tool calls, so a machine and a person can be told
 * apart without guessing; an unrecognised actor stays `unknown` rather than being assumed human (F6).
 */
function actorOf(context: Context): { id: string; type: ActorType } {
  const id = context.actor?.id ?? "";
  if (context.profileId) {
    return { id, type: "agent" };
  }
  return id ? { id, type: "human" } : { id: "", type: "unknown" };
}

/** The topic a call refers to, by id or (case-insensitive) name. A missing one is a fixable rule. */
function requireTopic(store: ResearchStore, input: Input): Topic {
  const topicId = optionalText(input.topicId, "topicId", 100);
  if (topicId) {
    const topic = store.getTopic(topicId);
    if (!topic) {
      throw new BusinessRuleError("Topic not found.");
    }
    return topic;
  }
  const topicName = optionalText(input.topicName, "topicName", 120);
  if (topicName) {
    const topic = store.getTopicByName(topicName);
    if (!topic) {
      throw new BusinessRuleError(
        `No topic named "${topicName}". Find the right one with search_dashboard.`
      );
    }
    return topic;
  }
  throw new BusinessRuleError("topicId or topicName is required.");
}

/** The axis a call refers to, if any. A named axis must belong to the resolved topic. */
function resolveAxis(
  store: ResearchStore,
  topic: Topic,
  input: Input
): Axis | null {
  const axisId = optionalText(input.axisId, "axisId", 100);
  if (axisId) {
    const axis = store.getAxis(axisId);
    if (!axis) {
      throw new BusinessRuleError("Axis not found.");
    }
    if (axis.topicId !== topic.id) {
      throw new BusinessRuleError("Axis does not belong to this topic.");
    }
    return axis;
  }
  const axisTitle = optionalText(input.axisTitle, "axisTitle", 160);
  if (axisTitle) {
    const axis = store.findAxisByTitle(topic.id, axisTitle);
    if (!axis) {
      throw new BusinessRuleError(`No axis "${axisTitle}" in this topic.`);
    }
    return axis;
  }
  return null;
}

/**
 * The refusal vocabulary, carried across the action boundary.
 *
 * A caller that gets one generic "business error" back cannot tell a conflict it should re-read from a no-op
 * it should not retry, or an agent rewriting a human's sentence from a state name that simply does not exist.
 * The message keeps its prefix for humans; `kind` is the same fact in a form a program can act on.
 *
 * `invalid-input` is the honest default for every other caller-fixable rule: it says "your input, not the
 * world" without inventing a category the store did not name.
 */
function refusalKind(error: Error): string {
  if (error instanceof ResearchStoreConflictError) {
    return "conflict";
  }
  if (error instanceof ResearchStoreError && error.code) {
    return error.code;
  }
  return "invalid-input";
}

export async function run(input: Input, context: Context): Promise<unknown> {
  if (!context.databasePath) {
    throw new Error("Research dashboard database is unavailable.");
  }

  const store = new ResearchStore(context.databasePath);
  try {
    return await dispatch(input, context, store);
  } catch (error) {
    if (
      error instanceof BusinessRuleError ||
      error instanceof ResearchStoreError
    ) {
      return {
        error: error.message,
        kind: refusalKind(error),
        ok: false,
      };
    }
    throw error;
  } finally {
    store.close();
  }
}

async function dispatch(
  input: Input,
  context: Context,
  store: ResearchStore
): Promise<unknown> {
  switch (context.actionKey) {
    case "get_overview": {
      return {
        ok: true,
        ...store.getOverview({
          // 0 is "all time"; the window is a query parameter, never stored state.
          activitySinceDays: optionalInt(
            input.activitySinceDays,
            "activitySinceDays",
            0,
            365
          ),
          includeArchived: input.includeArchived === true,
          limit: optionalInt(input.limit, "limit", 1, 50),
        }),
      };
    }

    case "get_progress": {
      // Both Progress projections from **one scope**. The Axes subview renders the axis index *and* the
      // open problems behind it, so a single call keeps both halves describing the same window; asking
      // twice would let them disagree. `activitySinceDays` is a query parameter, never stored state.
      const options = {
        activitySinceDays: optionalInt(input.activitySinceDays, "activitySinceDays", 0, 365),
        includeArchived: input.includeArchived === true,
        limit: optionalInt(input.limit, "limit", 1, 50),
      };
      // Paging is opt-in: only an `offset`/`pageSize` input adds the page siblings, so a caller that sends
      // neither gets the arrays exactly as before. The page siblings carry the **same** scope as the arrays
      // beside them: the same archived-topic rule (`includeArchived`) and the same effective activity window
      // (the caller's `activitySinceDays`, or the rollups' 14-day default when none was sent). Without this a
      // page would surface archived topics and out-of-window events the `problems`/`activity` arrays hide.
      const paging = readPaging(input);
      const effectiveSinceDays =
        options.activitySinceDays ?? DEFAULT_ACTIVITY_WINDOW_DAYS;
      return {
        ok: true,
        // Handed over exactly as the store computes them. Every field the Progress view renders is one of
        // these projection fields, so the view derives nothing and holds no display-only state of its own.
        // `activity` is the Activity column's half: already grouped by axis and put in the index's order, so
        // the page never filters a flat list to decide what belongs to the axis the reader selected.
        activity: store.progressActivity(options),
        axes: store.progressAxes(options),
        problems: store.progressProblems(options),
        ...(paging
          ? {
              activityPage: store.activityPage(
                {
                  includeArchived: options.includeArchived,
                  sinceDays: effectiveSinceDays,
                },
                paging
              ),
              problemPage: store.problemPage(
                { includeArchived: options.includeArchived },
                paging
              ),
            }
          : {}),
      };
    }

    case "get_topic": {
      const topic = requireTopic(store, input);
      // A stable axis id scopes the read to **one workstream**: the axis in full (state and confidence,
      // evidence, its own history and notes, its plan, its problems with their problem-scoped notes),
      // plus explicit per-collection coverage. Sibling axes are never built, so their notes cannot leak
      // into the answer. The axis is resolved (and validated against this topic) at the action
      // boundary; omitted, the read is the topic-wide detail it has always been.
      //
      // Scoped option applicability: with `axisId` present the read is bounded by `historyLimit` and
      // `notesLimit` only. `includeAnnotations`, `activityLimit` and `activitySinceDays` apply to the
      // topic-wide branch and are **ignored** here — a scoped workstream carries its own whole history
      // and is not filtered by a topic-wide annotation toggle or activity window. They are accepted by
      // the schema but have no effect under `axisId`; do not read their presence as support.
      const scopedAxis = resolveAxis(store, topic, input);
      if (scopedAxis) {
        const paging = readPaging(input);
        return {
          ok: true,
          ...store.getAxisWorkstream(topic.id, scopedAxis.id, {
            historyLimit: optionalInt(input.historyLimit, "historyLimit", 1, 100),
            notesLimit: optionalInt(input.notesLimit, "notesLimit", 1, 100),
          }),
          // The page siblings for a workstream: its own activity and its own tasks, each scoped to this
          // axis id, added only when paging was requested. The task page is **enriched** (`taskPage`), so
          // the visible cards render each task's own plan, links and provenance from the page itself — the
          // full `axis.problems` array stays beside it for compatibility, but the pager reads the page.
          ...(paging
            ? {
                activityPage: store.activityPage({ axisId: scopedAxis.id }, paging),
                problemPage: store.taskPage({ axisId: scopedAxis.id }, paging),
              }
            : {}),
        };
      }
      const includeAnnotations = input.includeAnnotations !== false;
      // The detail view is one call by contract: full axis metadata with each axis's own history,
      // notes and evidence, plus the topic's own log and notes (C5).
      const detail = store.getTopicDetail(topic.id, {
        activityLimit: optionalInt(
          input.activityLimit,
          "activityLimit",
          1,
          100
        ),
        activitySinceDays: optionalInt(
          input.activitySinceDays,
          "activitySinceDays",
          1,
          365
        ),
        historyLimit: optionalInt(input.historyLimit, "historyLimit", 1, 100),
        notesLimit: optionalInt(input.notesLimit, "notesLimit", 1, 100),
      });
      const paging = readPaging(input);
      return {
        ...detail,
        // The topic-level note list, under the name it has always had. `notes` is the same list; a note
        // that belongs to an axis is under that axis, so nothing is lost by the split.
        annotations: includeAnnotations ? detail.notes : [],
        axes: includeAnnotations
          ? detail.axes
          : detail.axes.map((axis) => ({ ...axis, notes: [] })),
        // The topic's own activity page, added only when paging was requested.
        ...(paging
          ? { activityPage: store.activityPage({ topicId: topic.id }, paging) }
          : {}),
        ok: true,
      };
    }

    case "search_dashboard": {
      return {
        ok: true,
        ...store.searchDashboard({
          includeArchived: input.includeArchived === true,
          limit: optionalInt(input.limit, "limit", 1, 50),
          query: requiredText(input.query, "query", 200),
        }),
      };
    }

    case "reconcile_topic": {
      // One call, one transaction: the payload is applied whole or not at all.
      return {
        ok: true,
        ...store.reconcileTopic({
          ...(input as ReconcileTopicInput),
          actor: actorOf(context),
        }),
      };
    }

    case "record_activity": {
      const actor = actorOf(context);
      const topic = requireTopic(store, input);
      const axis = resolveAxis(store, topic, input);
      const activity = store.addActivity({
        actorId: actor.id,
        actorType: actor.type,
        axisId: axis?.id,
        occurredAt: optionalText(input.occurredAt, "occurredAt", 40),
        // The advertised problem link. Resolved and validated inside `addActivity` (the problem must
        // exist, and — when an axis is also named — its own axis must equal that axis), so a cross-topic
        // or cross-axis mismatch is refused before any write.
        problemId: optionalText(input.problemId, "problemId", 100),
        // Registering the named repository happens inside the store's transaction: still one step.
        repositoryFullName: optionalText(
          input.repositoryFullName,
          "repositoryFullName",
          200
        ),
        sourceRef: optionalText(input.sourceRef, "sourceRef", 200),
        sourceType: optionalEnum<SourceType>(
          input.sourceType,
          SOURCE_TYPES,
          "sourceType"
        ),
        sourceUrl: optionalText(input.sourceUrl, "sourceUrl", 500),
        summary: requiredText(input.summary, "summary", 1000),
        topicId: topic.id,
      });
      return { activity, ok: true, topic: store.getTopic(topic.id) };
    }

    // ------------------------------------------------------ external evidence
    // These four are the collector's contract. They are not agent tools (a human or an agent must never
    // ingest external evidence by hand), and the host enforces that only a trusted collector principal can
    // reach them. The ingest path never reads an identity, a target or an "explicit" flag from `input`:
    // enrollment decides the target, the server derives the canonical identity, and the actor is `system`.
    case "ingest_github_activity": {
      const envelope = input.envelope as ExternalEvidenceEnvelopeV1 | undefined;
      if (!envelope || typeof envelope !== "object") {
        throw new BusinessRuleError("envelope is required.");
      }
      return store.ingestExternalEvidence({
        // Host-derived actor id; the store records actorType `system` and never the GitHub author.
        collectorId: context.actor?.id ?? "",
        envelope,
        orgId: context.orgId,
      });
    }

    case "read_ingest_receipt": {
      const eventKind = optionalEnum<ExternalEventKind>(
        input.eventKind,
        EXTERNAL_EVENT_KINDS,
        "eventKind"
      );
      if (!eventKind) {
        throw new BusinessRuleError(
          `eventKind must be one of: ${EXTERNAL_EVENT_KINDS.join(", ")}.`
        );
      }
      const receipt = store.readExternalReceipt({
        eventKind,
        objectId: requiredText(input.objectId, "objectId", 200),
        orgId: context.orgId,
        providerHost: requiredText(input.providerHost, "providerHost", 120),
        repositoryId: requiredText(input.repositoryId, "repositoryId", 120),
      });
      return receipt
        ? { ok: true, receipt, status: "found" }
        : { ok: false, receipt: null, status: "not_found" };
    }

    case "manage_external_enrollment": {
      const operation = requiredText(input.operation, "operation", 20);
      const actor = actorOf(context);
      if (operation === "enroll") {
        return {
          enrollment: store.enrollExternalRepository({
            axisId: requiredText(input.axisId, "axisId", 100),
            createdBy: actor.id,
            orgId: context.orgId,
            provider: "github",
            providerHost: requiredText(input.providerHost, "providerHost", 120),
            repositoryFullName: optionalText(
              input.repositoryFullName,
              "repositoryFullName",
              200
            ),
            repositoryId: requiredText(input.repositoryId, "repositoryId", 120),
            repositoryNodeId: optionalText(
              input.repositoryNodeId,
              "repositoryNodeId",
              120
            ),
            defaultBranch: optionalText(
              input.defaultBranch,
              "defaultBranch",
              255
            ),
            topicId: requiredText(input.topicId, "topicId", 100),
          }),
          ok: true,
        };
      }
      if (operation === "map") {
        const objectKind = optionalEnum(
          input.objectKind,
          ["pr", "commit", "issue"] as const,
          "objectKind"
        );
        if (!objectKind) {
          throw new BusinessRuleError("objectKind must be one of: pr, commit, issue.");
        }
        return {
          mapping: store.setExternalObjectMapping({
            createdBy: actor.id,
            enrollmentId: requiredText(input.enrollmentId, "enrollmentId", 100),
            objectId: requiredText(input.objectId, "objectId", 200),
            objectKind,
            orgId: context.orgId,
            problemId: requiredText(input.problemId, "problemId", 100),
          }),
          ok: true,
        };
      }
      throw new BusinessRuleError("operation must be enroll or map.");
    }

    case "list_external_enrollment": {
      return {
        enrollments: store.listExternalEnrollments(context.orgId),
        ok: true,
      };
    }

    case "list_topics": {
      return {
        ok: true,
        topics: store.listTopics(
          optionalEnum<TopicStatus>(input.status, TOPIC_STATUSES, "status")
        ),
      };
    }

    case "list_activity": {
      const options = {
        // The public filter key is `personActorId`, **not** `actorId`. `actorId` is in the host's
        // reserved/spoofable input set (`SPOOFABLE_INPUT_KEYS`, `plugin-service.ts`), so the host strips
        // any top-level `actorId` before schema validation and before this code runs — a caller's
        // `actorId` is silently dropped, the filter falls to `undefined`, and the read returns the whole
        // window. Reading it here would therefore be dead code that silently looks unscoped. The store's
        // own scope field stays named `actorId` (it is internal, below the host boundary, and not affected
        // by the stripper); only the *public* input key is renamed. There is no compatibility fallback:
        // the host strip makes old `actorId` callers indistinguishable from unscoped ones, so a fallback
        // could not work and must not pretend to.
        actorId: optionalText(input.personActorId, "personActorId", 100),
        axisId: optionalText(input.axisId, "axisId", 100),
        limit: optionalInt(input.limit, "limit", 1, 100),
        repositoryId: optionalText(input.repositoryId, "repositoryId", 100),
        sinceDays: optionalInt(input.sinceDays, "sinceDays", 1, 365),
        topicId: optionalText(input.topicId, "topicId", 100),
      };
      const paging = readPaging(input);
      return {
        activity: store.listActivity(options),
        // The page sibling, added only when paging was requested; `activity` keeps its array. The page
        // carries the **same** scope as the array: a project, workstream, person (recorded actor) or
        // repository, so a person's or a repository's rail pages at the backend rather than slicing.
        ...(paging
          ? {
              activityPage: store.activityPage(
                {
                  actorId: options.actorId,
                  axisId: options.axisId,
                  repositoryId: options.repositoryId,
                  sinceDays: options.sinceDays,
                  topicId: options.topicId,
                },
                paging
              ),
            }
          : {}),
        ok: true,
      };
    }

    case "add_annotation": {
      const actor = actorOf(context);
      const topicId = optionalText(input.topicId, "topicId", 100);
      const axisId = optionalText(input.axisId, "axisId", 100);
      if (!(topicId || axisId)) {
        throw new BusinessRuleError("topicId or axisId is required.");
      }
      return {
        annotation: store.addAnnotation({
          authorId: actor.id,
          // An annotation always comes from a session: a tool call is the machine, anything else is the
          // person using the page.
          authorType: actor.type === "agent" ? "agent" : "human",
          axisId,
          text: requiredText(input.text, "text", 2000),
          topicId,
        }),
        ok: true,
      };
    }

    default:
      throw new Error(`Unsupported action: ${context.actionKey}`);
  }
}
