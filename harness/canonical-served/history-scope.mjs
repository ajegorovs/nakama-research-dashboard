#!/usr/bin/env bun
/**
 * history-scope.mjs — the served READ-ONLY probe for requirement #24, re-pointed to the current surface.
 *
 * Requirement #24 asked for "a per-axis history that expands inside its own axis". The four-tab pivot
 * **retired** that per-axis disclosure; the substance now lives on the Progress view's **Recent activity**
 * feed (`ul.rd-feed[data-rd-progress-feed]`), which renders the SELECTED workstream's own events
 * (`axis.history`). This is the **migrated** presentation **approved** in `docs/ux-v2/DECISIONS.md` §19 —
 * NOT the retired in-card expandable form (the decision says so explicitly, and the historical form is
 * retained in the record, not rewritten). This probe asserts that approved presentation, read-only:
 *
 *   1. the Progress activity feed for a selected workstream equals that workstream's OWN scoped history —
 *      same events, same order (date + summary), **across every page of the feed** (page size 5), by id,
 *      from `get_topic { axisId }` → `history`; and
 *   2. it EXCLUDES the sibling workstreams' history (no sibling event appears).
 *
 * STABLE-ID BOUNDARY: the feed rows carry the caller's marker `li[data-rd-feed-event]`, whose value is the
 * event's own stable id (`data-rd-feed-event={item.id}` in `src/ui.tsx`). The order assertion below is made
 * on that id DIRECTLY: the rendered rows are compared to the projection's own scoped history by exact id,
 * date and summary, in order, across every page — so identity is asserted against the DOM the reader sees,
 * not inferred from (date + summary) nor resting on the projection's own uniqueness alone.
 *
 * The target organization is supplied **explicitly** (`--org-id` / `--org-name`, or `NAKAMA_ORG_ID` /
 * `NAKAMA_ORG_NAME`), resolved **exactly** against `/v1/auth/orgs` with the shared resolver (never
 * `orgs[0]`), and the session's active org is set by `POST /v1/auth/active-org` and read back (`activeOrgId`).
 *
 *   NAKAMA_ORG_ID=<id> NAKAMA_VIEWPORT=1440x900 bun harness/canonical-served/history-scope.mjs
 *
 * Read-only: it issues only `get_overview` / `get_progress` / `get_topic` reads and never writes. Exit 0
 * only when every check passes; exit 1 on a failed assertion; exit 2 on a fault.
 */
import { existsSync, readdirSync } from "node:fs";

import { parseOrgSelector, selectOrgId } from "../org-selection.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0)))
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) { console.error("history-scope: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
// The target organization is named explicitly (never `orgs[0]`): a flag wins over its env variable.
const SELECTOR = parseOrgSelector();
if (!SELECTOR.orgId && !SELECTOR.orgName) {
  console.error("history-scope: name the target organization explicitly with --org-id (or --org-name, or NAKAMA_ORG_ID / NAKAMA_ORG_NAME); refusing to guess");
  process.exit(2);
}
const READ_SET = new Set(["get_overview", "get_progress", "get_topic", "list_activity", "list_topics"]);
const actionCalls = [];
const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
page.on("request", (req) => { const m = req.url().match(/\/actions\/([^/?]+)/); if (m) actionCalls.push(m[1]); });
await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
const status = await page.evaluate(async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status, [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]);
if (status !== 200) { console.error(`history-scope: login failed (${status})`); process.exit(2); }
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });

// Resolve the target organization EXACTLY (the shared resolver refuses a foreign/ambiguous selector), then
// select it as the session's active org and read the host's own echo back — the supported browser contract.
const orgList = await page.evaluate(async () => (await fetch("/v1/auth/orgs", { credentials: "include" })).json());
const selection = selectOrgId(orgList?.orgs, SELECTOR);
if (!selection.ok) { console.error(`history-scope: ${selection.message}`); process.exit(2); }
const TARGET_ORG = selection.id;
const switched = await page.evaluate(async (orgId) => {
  const cookie = (n) => document.cookie.split("; ").find((e) => e.startsWith(`${n}=`))?.slice(n.length + 1) ?? "";
  const res = await fetch("/v1/auth/active-org", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-csrf-token": cookie("nakama_csrf") }, body: JSON.stringify({ orgId }) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, activeOrgId: body.activeOrgId ?? null };
}, TARGET_ORG);
if (switched.status !== 200 || switched.activeOrgId !== TARGET_ORG) {
  console.error(`history-scope: active-org switch did not confirm the target (HTTP ${switched.status}, activeOrgId ${JSON.stringify(switched.activeOrgId)} vs ${JSON.stringify(TARGET_ORG)})`);
  process.exit(2);
}
console.log(`history-scope: target organization ${TARGET_ORG} (matched by ${selection.matchedBy}); session active org confirmed ${switched.activeOrgId}`);

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writes = () => actionCalls.filter((k) => !READ_SET.has(k)).length;

// Read the projection (overview + progress) and ONE scoped workstream history, all through the page's own
// authenticated session. The chosen workstream is the one with the MOST events (so #24's subject is real,
// not vacuous), together with its sibling histories for the exclusion half.
const payload = await page.evaluate(async ({ pluginId, orgId }) => {
  const cookie = (n) => document.cookie.split("; ").find((e) => e.startsWith(`${n}=`))?.slice(n.length + 1) ?? "";
  const call = async (key, input) => (await fetch(`/v1/plugins/${pluginId}/actions/${key}`, { body: JSON.stringify({ input }), credentials: "include", headers: { "content-type": "application/json", "x-csrf-token": cookie("nakama_csrf"), "x-org-id": orgId }, method: "POST" }).then((r) => r.json())).result;
  const overview = await call("get_overview", { activitySinceDays: 0 });
  const progress = await call("get_progress", { activitySinceDays: 0 });
  const buckets = progress?.activity?.byAxis ?? [];
  // The workstream with the most events in the projection, and its topic (from the overview index).
  const ranked = [...buckets].sort((a, b) => (b.events?.length ?? 0) - (a.events?.length ?? 0));
  const chosen = ranked[0] ?? null;
  let topic = null;
  for (const t of overview?.topics ?? []) {
    if ((t.axes ?? []).some((a) => a.id === chosen?.axisId)) topic = t.topic;
  }
  const scoped = chosen && topic ? await call("get_topic", { topicId: topic.id, axisId: chosen.axisId, historyLimit: 100 }) : null;
  // Siblings = the other axes of the same topic, with their own histories.
  const siblingAxes = (overview?.topics ?? []).find((t) => t.topic?.id === topic?.id)?.axes ?? [];
  const siblings = [];
  for (const a of siblingAxes) {
    if (a.id === chosen?.axisId) continue;
    const s = await call("get_topic", { topicId: topic.id, axisId: a.id, historyLimit: 100 });
    siblings.push({ axisId: a.id, title: a.title, history: (s?.axis?.history ?? []).map((e) => ({ id: e.id, occurredAt: e.occurredAt, summary: e.summary })) });
  }
  return {
    chosen: chosen ? { axisId: chosen.axisId, events: (chosen.events ?? []).map((e) => ({ id: e.id, occurredAt: e.occurredAt, summary: e.summary })) } : null,
    topicId: topic?.id ?? null,
    ownHistory: (scoped?.axis?.history ?? []).map((e) => ({ id: e.id, occurredAt: e.occurredAt, summary: e.summary })),
    ownTitle: scoped?.axis?.title ?? chosen?.axisId ?? null,
    siblings,
  };
}, { pluginId: PLUGIN_ID, orgId: TARGET_ORG });

const key = (e) => `${String(e.occurredAt ?? "").slice(0, 10)}|${e.summary}`;
const own = payload.ownHistory;
const sibIds = new Set(payload.siblings.flatMap((s) => s.history.map((e) => e.id)));
const sibKeys = new Set(payload.siblings.flatMap((s) => s.history.map(key)));

check(
  "the selected workstream carries its own history in the projection (the #24 subject is real, not vacuous)",
  own.length > 0,
  `${own.length} scoped event(s) on ${JSON.stringify(payload.ownTitle)}; ${payload.siblings.length} sibling workstream(s)`
);
// The projection's own event ids are the stable identity and the DOM now carries them (see the
// STABLE-ID BOUNDARY note); this asserts the projection's ids are well-formed (unique/stable) so the
// id-by-id DOM comparison below has a sound identity to check against.
check(
  "the projection's own scoped history ids are stable and unique (no id collision)",
  own.length === new Set(own.map((e) => e.id)).size,
  `${own.length} event(s); ${new Set(own.map((e) => e.id)).size} distinct id(s)`
);

try {
  // Drive the served page: Progress view, select the chosen workstream, read the rendered Recent-activity
  // feed — paging through EVERY page (page size 5) so the whole history is compared, not one screen of it.
  await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="progress"]', { timeout: 20000 });
  await page.locator('div[data-plugin-id] [data-rd-view-option="progress"]').first().click();
  await page.waitForSelector(`div[data-plugin-id] [data-rd-index-axis="${payload.chosen.axisId}"]`, { timeout: 15000 });
  await page.locator(`div[data-plugin-id] [data-rd-index-axis="${payload.chosen.axisId}"]`).first().click();
  await page.waitForSelector("div[data-plugin-id] .rd-progress-activity ul.rd-feed", { timeout: 15000 });
  await sleep(500);

  const readFeed = () =>
    page.evaluate(() => {
      const feed = document.querySelector('div[data-plugin-id] .rd-progress-activity ul.rd-feed');
      const rows = [...(feed?.querySelectorAll('li[data-rd-feed-event]') ?? [])].map((li) => ({
        id: li.getAttribute("data-rd-feed-event") ?? "",
        date: (li.querySelector(".rd-cluster .rd-strong")?.previousElementSibling?.textContent ?? "").trim(),
        summary: (li.querySelector(".rd-strong")?.textContent ?? "").trim(),
      }));
      const pager = document.querySelector('div[data-plugin-id] .rd-progress-activity .rd-pager[data-rd-pager="Activity"]');
      const next = [...(pager?.querySelectorAll("button") ?? [])].find((b) => /next/i.test(b.textContent ?? ""));
      return {
        rows,
        total: Number(feed?.getAttribute("data-rd-progress-feed") ?? -1),
        range: pager?.querySelector("[data-rd-pager-range]")?.getAttribute("data-rd-pager-range") ?? null,
        hasNext: !!(next && !next.disabled),
      };
    });

  // Collect every page in render order (bounded so a broken pager cannot loop forever).
  const renderedPages = [];
  for (let i = 0; i < 12; i += 1) {
    const pageRead = await readFeed();
    renderedPages.push(pageRead);
    if (!pageRead.hasNext) break;
    const advanced = await page.evaluate(() => {
      const pager = document.querySelector('div[data-plugin-id] .rd-progress-activity .rd-pager[data-rd-pager="Activity"]');
      const next = [...(pager?.querySelectorAll("button") ?? [])].find((b) => /next/i.test(b.textContent ?? ""));
      if (!next || next.disabled) return false;
      next.click();
      return true;
    });
    if (!advanced) break;
    await sleep(400);
  }
  await page.locator('div[data-plugin-id] [data-rd-view-option="topics"]').first().click().catch(() => {});

  const first = renderedPages[0];
  const renderedRows = renderedPages.flatMap((p) => p.rows);
  const ownKeys = own.map((e) => ({ id: e.id, date: String(e.occurredAt ?? "").slice(0, 10), summary: e.summary }));

  // The rendered feed — every page, in order — equals the workstream's OWN scoped history by exact id,
  // date and summary, in order: identity asserted against the DOM, not inferred from (date + summary).
  check(
    "every page of the workstream's rendered history equals its own scoped history by id (and date/summary), in order",
    renderedRows.length === ownKeys.length && JSON.stringify(renderedRows) === JSON.stringify(ownKeys),
    `rendered ${renderedRows.length} row(s) over ${renderedPages.length} page(s) vs own ${own.length}; first page range ${first.range}; first rendered ${JSON.stringify(renderedRows[0])} vs own ${JSON.stringify(ownKeys[0])}`
  );
  check(
    "the rendered feed states the workstream's own event total",
    first.total === own.length,
    `feed total ${first.total} vs own scoped history ${own.length}`
  );
  // Exclusion: no sibling workstream's event appears in the selected workstream's feed (any page), by id
  // (the DOM's stable identity) with the (date + summary) key kept as a secondary handle.
  const leaks = renderedRows.filter((r) => sibIds.has(r.id) || sibKeys.has(`${r.date}|${r.summary}`));
  check(
    "the selected workstream's history excludes its sibling workstreams' events",
    leaks.length === 0,
    `${leaks.length} sibling event(s) leaked${leaks.length ? `: ${JSON.stringify(leaks)}` : ""}; ${sibIds.size} sibling event id(s) in scope`
  );
} catch (error) {
  await browser.close();
  console.error(`history-scope: fault — ${error.message}`);
  process.exit(2);
}
await browser.close();
check("the whole traversal was read-only", writes() === 0, `write action(s): ${writes()}`);

const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ probe: "history-scope", label: "the DECISIONS.md §19 approved migrated presentation (the scoped Progress Recent-activity feed) — NOT the retired in-card per-axis disclosure", targetOrg: TARGET_ORG, viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, stableIdsInDom: true, checks }, null, 2));
console.log(fails.length === 0 ? "history-scope: PASS" : `history-scope: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
