/**
 * Action entrypoint. Every declared action in `nakama.plugin.json` points at this
 * bundle; the host tells us which one ran through `context.actionKey`.
 *
 * Organization identity, actor role and the database path come from the host and are
 * never read from `input` (the host strips spoofed copies of those keys).
 *
 * Result shape: `{ ok: true, ... }` on success, `{ ok: false, error }` for a rule the
 * caller can fix. Errors from plugin code reach the caller as an unhelpful generic
 * server error, so anything a user or agent could act on is returned, not thrown.
 *
 * ---------------------------------------------------------------------------------------
 * C2 BRIDGE — this is still the generation-1 action surface (five keys, `project` shapes,
 * the three-value status vocabulary), re-pointed at the generation-2 store so the plugin
 * keeps building and the dev instance keeps serving across the schema migration. A "project"
 * here *is* a gen-2 **topic**; the status vocabulary is mapped at this boundary
 * (`done` ⇄ `completed`) because the manifest still enforces gen 1's enum on input.
 *
 * Chunk C3 replaces this file with the real surface — five exposed tools, `reconcile_topic`,
 * provenance, `context.actor` attribution — and chunk C8 redesigns the UI. Nothing else in
 * the plugin depends on the gen-1 shapes, so deleting them is a one-file change.
 * ---------------------------------------------------------------------------------------
 */
import type { PluginExecutionContext } from "@nakama/core";
import {
  DEFAULT_ACTIVITY_LIMIT,
  MAX_ACTIVITY_LIMIT,
  ResearchStore,
  ResearchStoreError,
  type ActorType,
  type SourceType,
  type Topic,
  type TopicStatus,
} from "./store";

type Context = PluginExecutionContext & {
  actionKey: string;
  host(request: Record<string, unknown>): Promise<unknown>;
  /** Present when the caller is an agent tool call rather than a human using the page. */
  profileId?: string;
};

type Input = {
  projectId?: string;
  name?: string;
  description?: string;
  status?: string;
  summary?: string;
  sourceType?: string;
  sourceRef?: string;
  occurredAt?: string;
  limit?: number;
};

/** Gen-1 shapes, kept so the existing page keeps rendering until C8. */
type LegacyProject = {
  id: string;
  name: string;
  description: string;
  status: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

type LegacyActivity = {
  id: string;
  projectId: string;
  sourceType: string;
  sourceRef: string;
  summary: string;
  occurredAt: string;
};

const LEGACY_STATUS_TO_TOPIC: Record<string, TopicStatus> = {
  active: "active",
  done: "completed",
  paused: "paused",
};

const TOPIC_STATUS_TO_LEGACY: Record<TopicStatus, string> = {
  active: "active",
  archived: "archived",
  completed: "done",
  paused: "paused",
};

/** Caller-fixable input problem; converted into a structured result below. */
class BusinessRuleError extends Error {}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BusinessRuleError(`${field} is required.`);
  }
  return value.trim();
}

function optionalStatus(value: unknown): TopicStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !(value in LEGACY_STATUS_TO_TOPIC)) {
    throw new BusinessRuleError("status must be one of: active, paused, done.");
  }
  return LEGACY_STATUS_TO_TOPIC[value];
}

function activityLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_ACTIVITY_LIMIT);
}

/**
 * Who is acting. `profileId` is present on agent tool calls, so the two callers can be told apart
 * without guessing; an unknown actor is left as `unknown` rather than assumed to be a person (F6).
 */
function actorOf(context: Context): { id: string; type: ActorType } {
  const id = context.actor?.id ?? "";
  if (context.profileId) {
    return { id, type: "agent" };
  }
  return id ? { id, type: "human" } : { id: "", type: "unknown" };
}

function toLegacyProject(topic: Topic): LegacyProject {
  return {
    createdAt: topic.createdAt,
    description: topic.description,
    id: topic.id,
    name: topic.name,
    status: TOPIC_STATUS_TO_LEGACY[topic.status],
    summary: topic.summary,
    updatedAt: topic.updatedAt,
  };
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
      return { error: error.message, ok: false };
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
    case "list_projects": {
      const status = optionalStatus(input.status);
      return {
        ok: true,
        projects: store.listTopics(status).map(toLegacyProject),
      };
    }
    case "create_project": {
      const topic = store.createTopic({
        description: input.description ?? "",
        name: required(input.name, "name"),
        status: optionalStatus(input.status),
      });
      return { ok: true, project: toLegacyProject(topic) };
    }
    case "update_project": {
      const topicId = required(input.projectId, "projectId");
      const topic = store.updateTopic(topicId, {
        description: input.description,
        name: input.name,
        status: optionalStatus(input.status),
        summary: input.summary,
      });
      return { ok: true, project: toLegacyProject(topic) };
    }
    case "list_activity": {
      const topicId = input.projectId
        ? required(input.projectId, "projectId")
        : undefined;
      return {
        activity: store
          .listActivity({ limit: activityLimit(input.limit), topicId })
          .map((activity) => ({
            id: activity.id,
            occurredAt: activity.occurredAt,
            projectId: activity.topicId ?? "",
            sourceRef: activity.sourceRef,
            sourceType: activity.sourceType,
            summary: activity.summary,
          })),
        ok: true,
      };
    }
    case "add_activity": {
      const topicId = required(input.projectId, "projectId");
      const actor = actorOf(context);
      const activity = store.addActivity({
        actorId: actor.id,
        actorType: actor.type,
        occurredAt: input.occurredAt,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType as SourceType | undefined,
        summary: required(input.summary, "summary"),
        topicId,
      });
      const topic = store.getTopic(topicId);
      return {
        activity: {
          id: activity.id,
          occurredAt: activity.occurredAt,
          projectId: activity.topicId ?? "",
          sourceRef: activity.sourceRef,
          sourceType: activity.sourceType,
          summary: activity.summary,
        } satisfies LegacyActivity,
        ok: true,
        project: topic ? toLegacyProject(topic) : null,
      };
    }
    default:
      throw new Error(`Unsupported action: ${context.actionKey}`);
  }
}
