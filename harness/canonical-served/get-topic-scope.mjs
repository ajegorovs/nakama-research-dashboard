#!/usr/bin/env bun
/**
 * get-topic-scope.mjs — the reviewer's required follow-up (§3.5): the **interaction-scoped `get_topic`**
 * assertion that restores the selected-identity guarantee canonical correction #3 narrowed.
 *
 * Correction #3 was loosened from "every `get_topic` == `topicId`" to "every `get_topic` target ∈ the
 * index's topics". That weaker form only shows a request *belongs to the index*; it does NOT catch a
 * **wrong-but-valid** topic being read while a DIFFERENT topic is selected. This harness asserts the
 * stronger property directly:
 *
 *   every `get_topic` request's target equals the **project the served DOM had SELECTED at the instant
 *   the request was issued** — its `topicId` is that selected project.
 *
 * The comparison basis is the **request-time** selection, NOT the settle-time state:
 *   - READ_SELECTED is evaluated inside the `page.route` handler, so the selected identity is the one
 *     live when THIS request was issued (the Progress view's `data-rd-return-project`, or the Projects
 *     view's `data-rd-detail` resolved through the index's own name→id map).
 *   - the assertion then compares each request to that per-request captured id. A request that reads the
 *     settle-time project but NOT the request-time project is a deviation — this is the case the old
 *     `step.expectedTopic` (settled) comparison could not name.
 *
 * Explicit, actor-bounded transition allowances (each named, so the allowance is never a silent hole):
 *   - T1 **boot/navigation**: a request issued while the page had NO selected project yet (before any
 *     selection has committed) that reads the step's own expected project. Boot reads happen before the
 *     DOM reflects a selection; they are in scope only when they target the expected project.
 *   - T2 **pagination**: a paged read (`offset > 0`) of the step's expected project — the selected
 *     project's own paging is always in scope.
 *   - The dev React StrictMode double-invoke carries the request-time selected identity, so it never
 *     trips the assertion on its own.
 * Every other request must equal the request-time selected project. A request that misses it and is a
 * member of the index is a **wrong-but-valid** deviation (the case correction #3 could not catch); a
 * request that misses it and is not in the index is `not-selected`.
 *
 * Oracle (positive + mutant, in one process):
 *   - POSITIVE — the unmodified page always reads the project it has selected. Expect **0 deviations**.
 *   - MUTANT   — the harness forces the page's workstream read for the selected project to carry an
 *               **OTHER VALID project's id** while the DOM still shows the selected project. The SAME
 *               assertion must go **RED** (≥1 valid deviation), and that deviation must NOT be explained
 *               by a transition allowance.
 *
 * Read-only. Exit 0 only when the positive run has 0 deviations AND the mutant run has ≥1; exit 1 on a
 * mismatch; exit 2 on a setup fault. Credentials come from the environment; never printed.
 */
import { existsSync, readdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0)))
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) { console.error("get-topic-scope: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
const EMAIL = process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_DEV_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read the selected identity from the served DOM, live, at request time.
 *  - `topicId`        : the Progress detail's selected project (`data-rd-return-project`), once it renders.
 *  - `activeTopicName`: the ACTIVE index row's project name (`[data-rd-index-axis|data-rd-index-topic]
 *                       [aria-pressed="true"]`). This reflects the reader's click **immediately** (React
 *                       commits the pressed state before the read effect fires), so it is the request-time
 *                       selection even while the detail — and thus `data-rd-return-project` — is still
 *                       loading. Resolved to an id via the index's own name→id map.
 *  - `detailName`     : the Projects detail's selected label (`data-rd-detail`). */
const READ_SELECTED = () => {
  const root = document.querySelector("div[data-plugin-id]");
  if (!root) return { axisId: null, topicId: null, detailName: null, activeTopicName: null };
  const active = root.querySelector(
    '[data-rd-index-axis][aria-pressed="true"],[data-rd-index-topic][aria-pressed="true"]'
  );
  return {
    axisId: root.querySelector("[data-rd-progress-detail-axis]")?.getAttribute("data-rd-progress-detail-axis") || null,
    topicId: root.querySelector("[data-rd-return-project]")?.getAttribute("data-rd-return-project") || null,
    detailName: root.querySelector("[data-rd-detail]")?.getAttribute("data-rd-detail") || null,
    activeTopicName: active?.getAttribute("data-rd-index-topic") || null,
  };
};

/** Run one pass. `mutantTopicId` non-null forces workstream reads onto that (other valid) project. */
async function runPass({ mutantTopicId = null, label = "positive" }) {
  const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  const requests = [];
  // The projection's own project set (id↔name), read from the page's OWN get_overview response,
  // which carries the host's csrf/org context — never a hand-built request. Declared before the route
  // handler so the request-time resolution can use it once it is populated (boot reads see {}).
  const overviewTopics = [];
  let nameToId = {};
  page.on("response", async (res) => {
    if (!/\/actions\/get_overview/.test(res.url())) return;
    try {
      const body = await res.json();
      const payload = body?.result ?? body;
      for (const t of payload?.topics ?? []) {
        const id = t.topic?.id ?? t.id; const name = t.topic?.name ?? t.name;
        if (id && name && !overviewTopics.some((x) => x.id === id)) overviewTopics.push({ id, name });
      }
    } catch {}
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (!/\/actions\/get_topic/.test(req.url())) return route.continue();
    let input = {};
    try { input = JSON.parse(req.postData() ?? "{}").input ?? {}; } catch {}
    let selected = null;
    try { selected = await page.evaluate(READ_SELECTED); } catch {}
    // Resolve the project selected AT REQUEST TIME: the detail's own id if rendered, else the ACTIVE
    // index row's name (immediate on click), else the Projects detail's label — each mapped to an id
    // from the index's own set. This is the request-time basis, not the settle-time project.
    const name = selected?.activeTopicName ?? selected?.detailName ?? null;
    const reqSelTopic = selected?.topicId ?? (name ? nameToId[name] ?? null : null);
    const record = { ...(selected ?? {}), reqSelTopic: reqSelTopic ?? null };
    if (mutantTopicId && input.axisId !== undefined) {
      const sent = { ...input, topicId: mutantTopicId };
      requests.push({ sent, selected: record });
      return route.continue({ postData: JSON.stringify({ input: sent }) });
    }
    requests.push({ sent: input, selected: record });
    return route.continue();
  });
  await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status, [EMAIL, PASSWORD]);
  if (status !== 200) { await browser.close(); throw new Error(`login failed (${status})`); }
  await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });

  const topics = overviewTopics;
  if (topics.length < 2) { await browser.close(); throw new Error(`need >=2 projects; got ${topics.length}`); }
  nameToId = Object.fromEntries(topics.map((t) => [t.name, t.id]));
  const validIds = topics.map((t) => t.id);
  const map = { ...nameToId };

  const steps = [];
  const project = (r) => ({ topicId: r.sent.topicId ?? null, axisId: r.sent.axisId ?? null, offset: r.sent.offset ?? null, domSelTopic: r.selected?.reqSelTopic ?? null, domSelName: r.selected?.detailName ?? null, domSelAxis: r.selected?.axisId ?? null });
  try {
    await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="progress"]', { timeout: 20000 });
    await page.locator('div[data-plugin-id] [data-rd-view-option="progress"]').first().click();
    await page.waitForSelector("div[data-plugin-id] [data-rd-index-axis]", { timeout: 15000 });
    await sleep(400);
    const rows = page.locator("div[data-plugin-id] [data-rd-index-axis]");
    const n = await rows.count();
    if (n === 0) throw new Error("no workstream rows in the Progress index");
    for (let i = 0; i < n; i += 1) {
      const meta = await rows.nth(i).evaluate((e) => ({ axis: e.getAttribute("data-rd-index-axis"), topicName: e.getAttribute("data-rd-index-topic") }));
      requests.length = 0;
      await rows.nth(i).click();
      await page.waitForFunction((axis) => document.querySelector("div[data-plugin-id] [data-rd-progress-detail-axis]")?.getAttribute("data-rd-progress-detail-axis") === axis, meta.axis, { timeout: 10000 }).catch(() => {});
      await sleep(500);
      const sel = await page.evaluate(READ_SELECTED);
      steps.push({ scope: "progress", label: `${meta.topicName} / ${meta.axis}`, expectedTopic: map[meta.topicName] ?? null, expectedAxis: meta.axis, selectedAtSettle: sel, requests: requests.map(project) });
    }

    await page.locator('div[data-plugin-id] [data-rd-view-option="topics"]').first().click();
    await page.waitForSelector("div[data-plugin-id] [data-rd-index-topic]", { timeout: 15000 });
    await sleep(400);
    const cards = page.locator("div[data-plugin-id] [data-rd-index-topic]");
    const cn = await cards.count();
    for (let i = 0; i < cn; i += 1) {
      const cardName = await cards.nth(i).evaluate((e) => e.getAttribute("data-rd-index-topic"));
      requests.length = 0;
      await cards.nth(i).click();
      await sleep(600);
      const sel = await page.evaluate(READ_SELECTED);
      steps.push({ scope: "topics", label: cardName, expectedTopic: nameToId[cardName] ?? null, expectedAxis: null, selectedAtSettle: sel, requests: requests.map(project) });
    }
  } catch (e) {
    await browser.close();
    throw new Error(`setup fault during ${label}: ${e.message}`);
  }
  await browser.close();
  return { label, topics, validIds, steps };
}

/** Evaluate the interaction-scope assertion over one pass's captured requests, comparing each request
 *  to the project selected AT REQUEST TIME (never the settle-time project). */
function evaluate(pass) {
  const valid = new Set(pass.validIds);
  const deviations = [];
  const allowances = { boot: 0, pagination: 0, requestTimeMatch: 0 };
  let observed = 0;
  for (const step of pass.steps) {
    for (const r of step.requests) {
      observed += 1;
      if (r.topicId === null) continue; // unscoped read: not a project target
      const reqSel = r.domSelTopic;
      const paged = (r.offset ?? 0) > 0;
      // Actor-bounded, explicitly named allowances (never a silent pass):
      const t1Boot = reqSel === null && r.topicId === step.expectedTopic;
      const t2Paged = paged && r.topicId === step.expectedTopic;
      const matchesReqTime = reqSel !== null && r.topicId === reqSel;
      if (matchesReqTime) { allowances.requestTimeMatch += 1; continue; }
      if (t1Boot) { allowances.boot += 1; continue; }
      if (t2Paged) { allowances.pagination += 1; continue; }
      deviations.push({ step: step.label, scope: step.scope, sentTopic: r.topicId, selectedAtRequest: reqSel, selectedAtSettle: step.expectedTopic, axisId: r.axisId, offset: r.offset, reason: valid.has(r.topicId) ? "other-valid-project" : "not-selected" });
    }
  }
  return { observed, deviations, validDeviations: deviations.filter((d) => d.reason === "other-valid-project"), allowances };
}

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };

let positive, mutant, posEval, mutEval;
try {
  positive = await runPass({ label: "positive" });
  posEval = evaluate(positive);
  // The mutant forces the workstream read onto a project DIFFERENT from the one selected.
  const firstSelected = positive.steps.find((s) => s.scope === "progress")?.expectedTopic ?? positive.validIds[0];
  const otherId = positive.validIds.find((id) => id !== firstSelected) ?? positive.validIds[0];
  mutant = await runPass({ mutantTopicId: otherId, label: "mutant" });
  mutEval = evaluate(mutant);
} catch (e) {
  console.error(`get-topic-scope: setup fault — ${e.message}`);
  process.exit(2);
}

const capturedReqTime = positive.steps.reduce((n, s) => n + s.requests.filter((r) => r.domSelTopic !== null).length, 0);
check("positive: the served page issued get_topic requests", posEval.observed > 0, `observed=${posEval.observed}`);
check(
  "positive: the request-time selected project was captured for the observed reads (comparison basis is request-time, not settle-time)",
  capturedReqTime > 0,
  `request-time captured=${capturedReqTime}; allowances ${JSON.stringify(posEval.allowances)}`
);
check("positive: every get_topic targets the project selected at REQUEST time (0 deviations)", posEval.deviations.length === 0, `deviations=${JSON.stringify(posEval.deviations.slice(0, 4))} allowances=${JSON.stringify(posEval.allowances)}`);
check("mutant: the SAME assertion goes RED on a request for an OTHER VALID project", mutEval.validDeviations.length > 0, `validDeviations=${JSON.stringify(mutEval.validDeviations.slice(0, 3))}`);
check("mutant: the deviation is a genuine wrong-but-valid project (a member of the index), not a fabricated id, and not explained by a transition allowance", mutEval.validDeviations.length > 0 && mutEval.validDeviations.every((d) => d.reason === "other-valid-project" && d.selectedAtRequest !== null && d.sentTopic !== d.selectedAtRequest), `reasons=${JSON.stringify([...new Set(mutEval.deviations.map((d) => d.reason))])}`);

const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, projects: positive.topics, positive: { observed: posEval.observed, deviations: posEval.deviations, allowances: posEval.allowances }, mutant: { observed: mutEval.observed, deviations: mutEval.deviations, allowances: mutEval.allowances }, checks }, null, 2));
console.log(fails.length === 0 ? "get-topic-scope: PASS" : `get-topic-scope: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
