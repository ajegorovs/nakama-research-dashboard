/**
 * Preview entry — mount the plugin's real page against a fixture host, with no Nakama instance.
 *
 * The plugin is a host-injected React module: it exports `apply(ctx)` and gets React, the component
 * library, a stylesheet sink and a data channel from the host. This file supplies those four things
 * and nothing else, so what renders is the plugin's own code against the **host's own** runtime
 * (`@/lib/plugin-runtime`), the host's components (`@nakama/ui`) and the host's stylesheet.
 *
 * The data channel answers from `preview-fixtures.json`, which `make-fixtures.mjs` builds by replaying
 * a committed dataset's action transcript through the real action layer. So the payloads are the
 * server's own, not a mock.
 *
 * Boundaries, stated so nobody reads more into a preview than it is:
 *   - It is a *preview*, not the served page. The served bundle is `ui/app.js` in the org's release;
 *     this mounts the same bundle through a different entry. Judge composition and styling here,
 *     take the record with the acceptance pass (`harness/read-pass.sh`).
 *   - Writes are refused, not simulated. `reconcile_topic` / `record_activity` / `add_annotation`
 *     answer with the plugin's own error path, because a preview that pretends a write landed is
 *     lying about the one thing a read-only instrument cannot check.
 *   - The light theme only (the committed screenshots are light).
 */
import { TooltipProvider } from "@nakama/ui/tooltip";
import { createRoot } from "react-dom/client";
import { activatePlugin } from "@/lib/plugin-runtime";
import fixtures from "./preview-fixtures.json";
import * as plugin from "./preview-plugin";
import "./preview.css";

const PLUGIN_ID = "research-dashboard";
const ORG_ID = "preview";
const WINDOW_DAYS = fixtures.windowDays ?? 14;

/** Actions whose answer is a projection keyed by the window the page asked for. */
const WINDOWED = new Set(["get_overview", "get_progress"]);
/** Actions that change state; the preview refuses them rather than inventing a result. */
const WRITES = new Set([
  "reconcile_topic",
  "record_activity",
  "add_annotation",
]);

/** The page size the plugin's Progress pagers send (`PROGRESS_PAGE_SIZE`), used as pageOf's default. */
const PAGE_SIZE = 5;

/**
 * Slice one scoped page out of a fixture array — the same envelope the store's `ScopedPage<T>` answers
 * (`items` and `total` from one array, `hasMore` from the same arithmetic). The responder applies this
 * per request, so the preview serves the **offset the page asked for** rather than one baked page: the
 * dynamic twin of the backend's `LIMIT ? OFFSET ?`, not a client slice the page would have to fake.
 */
function pageOf<T>(items: T[], offset: number, limit: number) {
  const size = limit > 0 ? limit : PAGE_SIZE;
  const at = offset > 0 ? offset : 0;
  const slice = items.slice(at, at + size);
  return {
    hasMore: at + slice.length < items.length,
    items: slice,
    limit: size,
    offset: at,
    total: items.length,
  };
}

function resolveFixture(action: string, input: unknown) {
  const bag = (input ?? {}) as Record<string, unknown>;
  const responses = fixtures.responses as Record<string, unknown>;
  if (WINDOWED.has(action)) {
    const days =
      typeof bag.activitySinceDays === "number" ? bag.activitySinceDays : WINDOW_DAYS;
    return responses[`${action}:${days}`] ?? responses[`${action}:${WINDOW_DAYS}`];
  }
  if (action === "list_activity") {
    // The scoped activity read (a person by recorded actor, or a repository). The fixture carries the
    // action's own flat array; the seam filters it to the requested scope and cuts the page at the
    // requested offset — the dynamic twin of the backend's `LIMIT ? OFFSET ?`, not one baked page.
    const list = responses["list_activity"] as { activity?: unknown[] } | undefined;
    const all = (list?.activity ?? []) as Array<{
      actorId?: string;
      repositoryId?: string;
      topicId?: string;
      axisId?: string;
    }>;
    const actorId = typeof bag.personActorId === "string" ? bag.personActorId : undefined;
    const repositoryId = typeof bag.repositoryId === "string" ? bag.repositoryId : undefined;
    const offset = typeof bag.offset === "number" ? bag.offset : 0;
    const pageSize = typeof bag.pageSize === "number" ? bag.pageSize : PAGE_SIZE;
    const filtered = all.filter(
      (event) =>
        (actorId === undefined || event.actorId === actorId) &&
        (repositoryId === undefined || event.repositoryId === repositoryId)
    );
    return { activity: filtered, activityPage: pageOf(filtered, offset, pageSize), ok: true };
  }
  if (action === "get_topic") {
    const base = responses[`get_topic:${String(bag.topicId)}`] as
      | {
          activity?: unknown[];
          axes?: Array<{ history?: unknown[]; id: string; problems?: unknown[] }>;
          topic?: unknown;
        }
      | undefined;
    if (!base) {
      return undefined;
    }
    const offset = typeof bag.offset === "number" ? bag.offset : undefined;
    const pageSize = typeof bag.pageSize === "number" ? bag.pageSize : undefined;
    const paged = offset !== undefined || pageSize !== undefined;
    const limit = pageSize ?? PAGE_SIZE;
    const at = offset ?? 0;
    const axisId = typeof bag.axisId === "string" ? bag.axisId : undefined;
    if (axisId) {
      // The scoped workstream read: the axis in full, plus its own task and activity pages. The pages are
      // cut from the topic-wide fixture at *this request's* offset, so the two Progress pagers page for
      // real here exactly as they do against the backend.
      const axis = base.axes?.find((candidate) => candidate.id === axisId);
      if (!axis) {
        return {
          error: `preview: axis '${axisId}' is not in topic '${String(bag.topicId)}'`,
          kind: "invalid-input",
          ok: false,
        };
      }
      // Optional complete evidence pages exported verbatim from real scoped action reads.
      // Never construct a complete page from the legacy capped axis.evidence array.
      const evidencePages = responses[`evidencePages:${axisId}`] as
        Record<string, unknown> | undefined;
      const wantsEvidence = bag.evidenceOffset !== undefined || bag.evidencePageSize !== undefined;
      const evidenceKey = `${bag.evidencePageSize ?? PAGE_SIZE}:${bag.evidenceOffset ?? 0}`;
      if (wantsEvidence && evidencePages && !evidencePages[evidenceKey]) {
        return { ok: false, error: "preview: evidence page not exported", kind: "invalid-input" };
      }
      return {
        axis,
        axisId,
        ok: true,
        ...(wantsEvidence && evidencePages ? { evidencePage: evidencePages[evidenceKey] } : {}),
        topic: base.topic,
        ...(paged
          ? {
              activityPage: pageOf(axis.history ?? [], at, limit),
              problemPage: pageOf(axis.problems ?? [], at, limit),
            }
          : {}),
      };
    }
    // The topic-wide read (Overview/Projects detail) carries no axisId; a paged topic-wide request still
    // answers a topic activity page rather than silently returning the unpaged detail.
    return paged
      ? { ...base, activityPage: pageOf(base.activity ?? [], at, limit) }
      : base;
  }
  return undefined;
}

const host = {
  async call(action: string, input?: unknown) {
    // A minimal record of what the page asked for, so a local check can read the **requested** offsets
    // instead of inferring them from the rendered rows. Preview-only; the served host has no such hook.
    const bag = (input ?? {}) as Record<string, unknown>;
    const sink = (globalThis as { __previewCalls?: unknown[] }).__previewCalls;
    if (Array.isArray(sink)) {
      sink.push({
        action,
        axisId: bag.axisId ?? null,
        evidenceOffset: bag.evidenceOffset ?? null,
        evidencePageSize: bag.evidencePageSize ?? null,
        offset: bag.offset ?? null,
        pageSize: bag.pageSize ?? null,
      });
    }
    /**
     * Opt-in deferred-response hook for the local regression harness. When the page sets
     * `window.__previewDelay` to `(action, bag) => ms`, `call` waits that many milliseconds before it
     * answers, so a race test can force a chosen response to arrive *after* a later one and prove the
     * commit guards drop the stale one. The preview graph never sets it, so a normal preview is unaffected
     * (zero added latency); like `__previewCalls`, it is preview-only — the served host has no such hook.
     */
    const delayHook = (
      globalThis as { __previewDelay?: (a: string, b: Record<string, unknown>) => unknown }
    ).__previewDelay;
    if (typeof delayHook === "function") {
      const ms = Number(delayHook(action, bag));
      if (Number.isFinite(ms) && ms > 0) {
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
    }
    /**
     * Companion opt-in hook: `window.__previewFail` returns a message string to make the matched call
     * reject (after any delay above), so a race test can prove a *stale failure* is not surfaced over the
     * newer read. Preview-only; unset in a normal preview.
     */
    const failHook = (
      globalThis as { __previewFail?: (a: string, b: Record<string, unknown>) => unknown }
    ).__previewFail;
    if (typeof failHook === "function") {
      const message = failHook(action, bag);
      if (typeof message === "string" && message) {
        throw new Error(message);
      }
    }
    const payload = resolveFixture(action, input);
    if (payload !== undefined) {
      // A fresh object each call: the page mutates what it holds, and a shared fixture would let one
      // view's edit leak into the next view's render.
      return structuredClone(payload);
    }
    if (WRITES.has(action)) {
      return { error: `preview: '${action}' is not simulated`, kind: "invalid-input", ok: false };
    }
    throw new Error(
      `preview: no fixture for '${action}' — rebuild with make-fixtures.mjs (dataset '${fixtures.dataset}')`
    );
  },
};

const controller = new AbortController();
const runtime = await activatePlugin(plugin, {
  host,
  orgId: ORG_ID,
  pluginId: PLUGIN_ID,
  signal: controller.signal,
  theme: "light",
});

const Page = runtime.Page;
const root = document.getElementById("root");
if (!root) {
  throw new Error("preview: #root missing from preview.html");
}

createRoot(root).render(
  <TooltipProvider>
    {/* The host's own page wrapper (apps/web/src/components/PluginSurface.tsx). */}
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-6"
        data-plugin-id={PLUGIN_ID}
      >
        <Page />
      </div>
    </div>
  </TooltipProvider>
);
