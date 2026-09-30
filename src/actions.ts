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
  ResearchStore,
  ResearchStoreError,
  SOURCE_TYPES,
  TOPIC_STATUSES,
  type ActorType,
  type Axis,
  type ReconcileTopicInput,
  type SourceType,
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

function optionalText(value: unknown, field: string, max: number): string | undefined {
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
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new BusinessRuleError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
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
function resolveAxis(store: ResearchStore, topic: Topic, input: Input): Axis | null {
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

export async function run(input: Input, context: Context): Promise<unknown> {
  if (!context.databasePath) {
    throw new Error("Research dashboard database is unavailable.");
  }

  const store = new ResearchStore(context.databasePath);
  try {
    return await dispatch(input, context, store);
  } catch (error) {
    if (error instanceof BusinessRuleError || error instanceof ResearchStoreError) {
      return { error: error.message, ok: false };
    }
    throw error;
  } finally {
    store.close();
  }
}

async function dispatch(input: Input, context: Context, store: ResearchStore): Promise<unknown> {
  switch (context.actionKey) {
    case "get_overview": {
      return {
        ok: true,
        ...store.getOverview({
          activitySinceDays: optionalInt(input.activitySinceDays, "activitySinceDays", 1, 365),
          limit: optionalInt(input.limit, "limit", 1, 50),
        }),
      };
    }

    case "get_topic": {
      const topic = requireTopic(store, input);
      const includeAnnotations = input.includeAnnotations !== false;
      return {
        ok: true,
        activity: store.listActivity({
          limit: optionalInt(input.activityLimit, "activityLimit", 1, 100),
          sinceDays: optionalInt(input.activitySinceDays, "activitySinceDays", 1, 365),
          topicId: topic.id,
        }),
        annotations: includeAnnotations ? store.listAnnotations({ topicId: topic.id }) : [],
        axes: store.listAxes(topic.id).map((axis) => ({
          ...axis,
          people: store.listAxisPeople(axis.id),
          repositories: store.listAxisRepositories(axis.id),
        })),
        people: store.listTopicPeople(topic.id),
        repositories: store.listTopicRepositories(topic.id),
        topic,
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
        ...store.reconcileTopic({ ...(input as ReconcileTopicInput), actor: actorOf(context) }),
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
        // Registering the named repository happens inside the store's transaction: still one step.
        repositoryFullName: optionalText(input.repositoryFullName, "repositoryFullName", 200),
        sourceRef: optionalText(input.sourceRef, "sourceRef", 200),
        sourceType: optionalEnum<SourceType>(input.sourceType, SOURCE_TYPES, "sourceType"),
        sourceUrl: optionalText(input.sourceUrl, "sourceUrl", 500),
        summary: requiredText(input.summary, "summary", 1000),
        topicId: topic.id,
      });
      return { activity, ok: true, topic: store.getTopic(topic.id) };
    }

    case "list_topics": {
      return {
        ok: true,
        topics: store.listTopics(optionalEnum<TopicStatus>(input.status, TOPIC_STATUSES, "status")),
      };
    }

    case "list_activity": {
      return {
        ok: true,
        activity: store.listActivity({
          axisId: optionalText(input.axisId, "axisId", 100),
          limit: optionalInt(input.limit, "limit", 1, 100),
          sinceDays: optionalInt(input.sinceDays, "sinceDays", 1, 365),
          topicId: optionalText(input.topicId, "topicId", 100),
        }),
      };
    }

    case "add_annotation": {
      const actor = actorOf(context);
      const topicId = optionalText(input.topicId, "topicId", 100);
      const axisId = optionalText(input.axisId, "axisId", 100);
      if (!topicId && !axisId) {
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
