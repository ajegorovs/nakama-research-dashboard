#!/usr/bin/env bun
/**
 * active-project-triangle.mjs — served-UI assertion for the ACTIVE synthetic project's plan-ownership
 * triangle and its independent task pagination.
 *
 * The canonical API read-back (`seed-synthetic.mjs`) proves the three scoped plans and the >=12-task page
 * exist; this harness proves the SERVED PAGE RENDERS them: an active, separately-labelled synthetic project
 * whose Progress workstream carries a **workstream-owned** plan AND a **task-owned** plan that is its own
 * (never the axis plan), and whose task list pages independently at offsets 0 / 5 / 10.
 *
 * It asserts the exact rendered titles, the scoped-plan distinction (sibling-no-inheritance) and the three
 * task pages' own ranges/counts — reading the ACTUAL `get_topic` request offsets off the network, not a
 * guessed selector. Read-only. Exit 0 only when every check passes; exit 1 on any FAIL; exit 2 on a fault.
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
if (!EXECUTABLE) { console.error("active-project-triangle: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);

const offsets = [];
const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
await page.route("**/*", async (route) => {
  const req = route.request();
  if (/\/actions\/get_topic/.test(req.url())) {
    try { const i = JSON.parse(req.postData() ?? "{}").input ?? {}; if (i.offset !== undefined) offsets.push(i.offset); } catch {}
  }
  return route.continue();
});
await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
const status = await page.evaluate(async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status, [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]);
if (status !== 200) { console.error(`active-project-triangle: login failed (${status})`); process.exit(2); }
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readTri = () => page.evaluate(() => {
  const root = document.querySelector("div[data-plugin-id]");
  const plans = [...root.querySelectorAll(".rd-scoped-plan")].map((p) => ({
    summary: (p.querySelector("summary")?.textContent || "").trim(),
    steps: [...p.querySelectorAll(".rd-plan-step")].map((li) => ((li.querySelector(".rd-plan-step .rd-strong")?.textContent) || (li.querySelector(".rd-strong")?.textContent) || "").trim()),
    positions: [...p.querySelectorAll(".rd-plan-step")].map((li) => li.getAttribute("data-rd-scoped-plan-position")),
  }));
  const tasks = [...root.querySelectorAll("[data-rd-task-card]")].map((t) => t.getAttribute("data-rd-task-card"));
  const pager = root.querySelector('[data-rd-pager="Tasks"]');
  return {
    plans,
    taskCount: tasks.length,
    taskIds: tasks,
    range: pager?.querySelector("[data-rd-pager-range]")?.getAttribute("data-rd-pager-range") ?? null,
    pages: [...(pager?.querySelectorAll(".rd-pager-btn") ?? [])].map((b) => b.textContent.trim()).filter((t) => /^\d+$/.test(t)),
  };
});

const indexText = (el) => el.evaluate((n) => (n.textContent || "").replace(/\s+/g, " ").trim());

try {
  await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="progress"]', { timeout: 20000 });
  await page.locator('div[data-plugin-id] [data-rd-view-option="progress"]').first().click();
  await page.waitForSelector("div[data-plugin-id] [data-rd-index-axis]", { timeout: 15000 });
  await sleep(500);
  const rows = page.locator("div[data-plugin-id] [data-rd-index-axis]");
  const count = await rows.count();
  let target = -1;
  for (let i = 0; i < count; i += 1) if (/Paged Workstream/.test(await indexText(rows.nth(i)))) target = i;
  if (target === -1) throw new Error("the ACTIVE project's 'Paged Workstream' axis is not in the Progress index");
  await rows.nth(target).click();
  await page.waitForSelector("div[data-plugin-id] .rd-scoped-plan", { timeout: 15000 });
  await sleep(600);

  const tri = await readTri();
  const wsPlan = tri.plans.find((p) => p.summary === "Workstream plan");
  const taskPlan = tri.plans.find((p) => p.summary === "Task plan");

  check(
    "the ACTIVE project renders its workstream-owned plan with its exact stored titles/positions",
    wsPlan && eq(wsPlan.steps, ["[synthetics] paged ws step 1", "[synthetics] paged ws step 2"]) && eq(wsPlan.positions, ["1", "2"]),
    JSON.stringify(wsPlan)
  );
  check(
    "the ACTIVE project renders the task-owned plan with its exact stored titles/positions",
    taskPlan && eq(taskPlan.steps, ["[synthetics] task step 1", "[synthetics] task step 2", "[synthetics] task step 3"]) && eq(taskPlan.positions, ["1", "2", "3"]),
    JSON.stringify(taskPlan)
  );
  check(
    "sibling-no-inheritance: the task-owned plan is NOT the workstream-owned plan",
    !!wsPlan && !!taskPlan && !eq(wsPlan.steps, taskPlan.steps),
    `workstream=${JSON.stringify(wsPlan?.steps)} task=${JSON.stringify(taskPlan?.steps)}`
  );
  check(
    "the ACTIVE project carries a >=12-task set paginated independently (pages 1..3, page size 5)",
    tri.taskCount === 5 && eq(tri.pages, ["1", "2", "3"]) && tri.range === "1-5",
    `cards=${tri.taskCount} pages=${JSON.stringify(tri.pages)} range=${JSON.stringify(tri.range)}`
  );

  // Independent pagination at offsets 0 / 5 / 10 — the request offsets are read off the network.
  offsets.length = 0;
  const pageAll = new Set(tri.taskIds);
  const pageBtn = (label) => page.locator('div[data-plugin-id] [data-rd-pager="Tasks"] .rd-pager-btn', { hasText: new RegExp(`^${label}$`) }).first();
  await pageBtn("2").click();
  await page.waitForFunction(() => document.querySelector('div[data-plugin-id] [data-rd-pager="Tasks"] [data-rd-pager-range]')?.getAttribute("data-rd-pager-range") === "6-10", null, { timeout: 10000 }).catch(() => {});
  await sleep(400);
  const p2 = await readTri();
  await pageBtn("3").click();
  await page.waitForFunction(() => document.querySelector('div[data-plugin-id] [data-rd-pager="Tasks"] [data-rd-pager-range]')?.getAttribute("data-rd-pager-range") === "11-13", null, { timeout: 10000 }).catch(() => {});
  await sleep(400);
  const p3 = await readTri();

  check("task page 2 is its own backend page (offset 5, range 6-10, 5 rows)", p2.range === "6-10" && p2.taskCount === 5, `range=${JSON.stringify(p2.range)} cards=${p2.taskCount}`);
  check("task page 3 is its own backend page (offset 10, range 11-13, 3 rows)", p3.range === "11-13" && p3.taskCount === 3, `range=${JSON.stringify(p3.range)} cards=${p3.taskCount}`);
  check("the three task pages together carry 13 distinct tasks (no overlap)", new Set([...pageAll, ...p2.taskIds, ...p3.taskIds]).size === 13, `distinct=${new Set([...pageAll, ...p2.taskIds, ...p3.taskIds]).size}`);
  check("the served page requested get_topic at offsets 5 then 10 for the paging", offsets.includes(5) && offsets.includes(10), `offsets=${JSON.stringify(offsets)}`);

  // ── §3.6 project-OWN plan, served: the ACTIVE project's Projects detail renders the project-owned plan
  //        (get_topic.plan) with its exact stored titles/positions, distinct from the workstream- and
  //        task-owned plans (its own axis/task separation, no inheritance either way). ──
  await page.locator('div[data-plugin-id] [data-rd-view-option="topics"]').first().click();
  await page.waitForSelector("div[data-plugin-id] [data-rd-index-topic]", { timeout: 15000 });
  await sleep(500);
  const projCards = page.locator("div[data-plugin-id] [data-rd-index-topic]");
  const pcCount = await projCards.count();
  let projIdx = -1;
  for (let i = 0; i < pcCount; i += 1) {
    if (/ACTIVE Project Triangle/.test((await projCards.nth(i).evaluate((e) => e.getAttribute("data-rd-index-topic"))) || "")) projIdx = i;
  }
  if (projIdx === -1) throw new Error("the ACTIVE project triangle's project card is not in the Projects index");
  await projCards.nth(projIdx).click();
  await page.waitForFunction(() => [...document.querySelectorAll('div[data-plugin-id] .rd-scoped-plan')].some((p) => (p.querySelector("summary")?.textContent || "").trim() === "Project plan"), null, { timeout: 15000 }).catch(() => {});
  await sleep(600);
  const projectPlan = await page.evaluate(() => {
    const root = document.querySelector("div[data-plugin-id]");
    const plan = [...root.querySelectorAll(".rd-scoped-plan")].find((p) => (p.querySelector("summary")?.textContent || "").trim() === "Project plan");
    if (!plan) return null;
    return {
      steps: [...plan.querySelectorAll(".rd-plan-step")].map((li) => ((li.querySelector(".rd-strong")?.textContent) || "").trim()),
      positions: [...plan.querySelectorAll(".rd-plan-step")].map((li) => li.getAttribute("data-rd-scoped-plan-position")),
    };
  });
  check(
    "the ACTIVE project renders its PROJECT-owned plan with its exact stored titles/positions",
    projectPlan && eq(projectPlan.steps, ["[synthetics] project step 1", "[synthetics] project step 2"]) && eq(projectPlan.positions, ["1", "2"]),
    JSON.stringify(projectPlan)
  );
  check(
    "the PROJECT-owned plan is distinct from the workstream- and task-owned plans (no inheritance either way)",
    !!projectPlan && !!wsPlan && !!taskPlan && !eq(projectPlan.steps, wsPlan.steps) && !eq(projectPlan.steps, taskPlan.steps),
    `project=${JSON.stringify(projectPlan?.steps)} ws=${JSON.stringify(wsPlan?.steps)} task=${JSON.stringify(taskPlan?.steps)}`
  );
} catch (error) {
  await browser.close();
  console.error(`active-project-triangle: fault — ${error.message}`);
  process.exit(2);
}
await browser.close();
const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, checks }, null, 2));
console.log(fails.length === 0 ? "active-project-triangle: PASS" : `active-project-triangle: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
