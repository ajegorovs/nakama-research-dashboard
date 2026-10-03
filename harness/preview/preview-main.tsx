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

function resolveFixture(action: string, input: unknown) {
  const bag = (input ?? {}) as Record<string, unknown>;
  const responses = fixtures.responses as Record<string, unknown>;
  if (WINDOWED.has(action)) {
    const days =
      typeof bag.activitySinceDays === "number" ? bag.activitySinceDays : WINDOW_DAYS;
    return responses[`${action}:${days}`] ?? responses[`${action}:${WINDOW_DAYS}`];
  }
  if (action === "get_topic") {
    return responses[`get_topic:${String(bag.topicId)}`];
  }
  return undefined;
}

const host = {
  async call(action: string, input?: unknown) {
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
