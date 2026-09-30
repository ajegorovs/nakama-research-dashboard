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
 */
import type { PluginExecutionContext } from "@nakama/core";
import {
  DEFAULT_ACTIVITY_LIMIT,
  isProjectStatus,
  MAX_ACTIVITY_LIMIT,
  type ProjectStatus,
  ResearchStore,
  ResearchStoreError,
} from "./store";

type Context = PluginExecutionContext & {
  actionKey: string;
  host(request: Record<string, unknown>): Promise<unknown>;
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

/** Caller-fixable input problem; converted into a structured result below. */
class BusinessRuleError extends Error {}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BusinessRuleError(`${field} is required.`);
  }
  return value.trim();
}

function optionalStatus(value: unknown): ProjectStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isProjectStatus(value)) {
    throw new BusinessRuleError("status must be one of: active, paused, done.");
  }
  return value;
}

function activityLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_ACTIVITY_LIMIT);
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
      return { ok: true, projects: store.listProjects(status) };
    }
    case "create_project": {
      const project = store.createProject({
        description: input.description ?? "",
        name: required(input.name, "name"),
        status: optionalStatus(input.status),
      });
      return { ok: true, project };
    }
    case "update_project": {
      const projectId = required(input.projectId, "projectId");
      const project = store.updateProject(projectId, {
        description: input.description,
        name: input.name,
        status: optionalStatus(input.status),
        summary: input.summary,
      });
      return { ok: true, project };
    }
    case "list_activity": {
      const projectId = input.projectId
        ? required(input.projectId, "projectId")
        : undefined;
      return {
        activity: store.listActivity(projectId, activityLimit(input.limit)),
        ok: true,
      };
    }
    case "add_activity": {
      const projectId = required(input.projectId, "projectId");
      const activity = store.addActivity({
        occurredAt: input.occurredAt,
        projectId,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        summary: required(input.summary, "summary"),
      });
      return { activity, ok: true, project: store.getProject(projectId) };
    }
    default:
      throw new Error(`Unsupported action: ${context.actionKey}`);
  }
}
