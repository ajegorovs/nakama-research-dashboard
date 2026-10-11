// Reviewer-corrections regression — a deterministic browser harness for R1–R4.
//
// It drives the plugin's real page in a real browser (the local preview: the plugin bundle mounted through
// the host's own runtime against a labelled derived fixture) and asserts the corrected behaviour of each
// dashboard-production-port review finding:
//
//   R1  stored plan positions render as stored (1..4), a 0 renders "0", an unnumbered step renders none.
//   R2  the Project card's open-task count equals the Progress rail's open count under mixed states
//       (open + blocked + resolved) — a blocked task is not "open".
//   R3  the person/repo activity feed is identity-safe: switching scope resets the page (offset 10 → 0),
//       the rows are the new scope's, and going back also starts at 0.
//   R4  scoped reads commit only for the newest request: A-slow/B-fast keeps B; offset-5-slow/offset-10-
//       fast keeps offset 10; a stale failure does not raise an error over the newer read.
//
// It also writes a JSON result and captures the numbering/count-scope pages at 1280×800 and 1440×900.
//
// Preconditions: the preview is running against this repo's bundle with the derived fixture:
//   bun harness/reviewer-corrections/build-fixture.mjs
//   bun harness/preview/run.mjs --dataset corpus --no-fixtures --fixtures harness/reviewer-corrections/fixtures-corrections.json --keep
//   PREVIEW_URL=http://127.0.0.1:3010/preview.html bun harness/reviewer-corrections/regression.mjs
//
// Before/after: run against the pre-fix bundle for red, the fixed bundle for green (same script). To flip
// the bundle, `bun harness/reviewer-corrections/defix.mjs before` then `bun run build`, and `… after` to
// restore. Exit 1 on any failure.
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const URL = process.env.PREVIEW_URL ?? "http://127.0.0.1:3010/preview.html";
const HERE = import.meta.dir;
const SHOTS = path.join(HERE, "shots");
mkdirSync(SHOTS, { recursive: true });

const AXIS_A = "957aca52-9d2d-41cd-838e-ba0ddb7dd194";
const AXIS_B = "57ab60bf-d8fb-4f0c-87b5-927542267d46";
const PERSON_A = "d4e4584d-05f3-4006-9d4a-ea59d5bf4717";
const PERSON_B = "person-b-0001";
const TOPIC_NAME = "UDV Echo Process";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ detail, name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch(chromiumLaunchOptions());
let page;

const goto = async () => {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-rd-view-option="progress"]', { timeout: 30000 });
  await page.waitForTimeout(300);
};
const nav = async (view) => {
  await page.click(`[data-rd-view-option="${view}"]`);
  await page.waitForTimeout(350);
};
const selectAxis = async (id) => {
  await page.click(`[data-rd-index-axis="${id}"]`);
};
const clearCalls = () => page.evaluate(() => { globalThis.__previewCalls = []; });
const calls = () =>
  page.evaluate(() => (globalThis.__previewCalls ?? []).map((c) => ({ ...c })));
const setDelay = (fn) => page.evaluate((src) => { globalThis.__previewDelay = eval(src); }, fn);
const setFail = (fn) => page.evaluate((src) => { globalThis.__previewFail = eval(src); }, fn);
const clearHooks = () =>
  page.evaluate(() => { globalThis.__previewDelay = undefined; globalThis.__previewFail = undefined; });

const readPlan = (label) =>
  page.evaluate((lbl) => {
    const plan = [...document.querySelectorAll(".rd-scoped-plan")].find(
      (p) => (p.querySelector("summary")?.textContent || "").trim() === lbl
    );
    if (!plan) return null;
    return [...plan.querySelectorAll(".rd-plan-step")].map((li) => ({
      num: (li.querySelector(".rd-cluster > .rd-meta")?.textContent || "").trim(),
      position: li.getAttribute("data-rd-scoped-plan-position"),
    }));
  }, label);

const readTaskCards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-rd-task-card]")].map((el) => el.getAttribute("data-rd-task-card"))
  );
const contextPanel = () => page.getAttribute("[data-rd-context-panel]", "data-rd-context-panel");
const pagerCurrent = (label) =>
  page.evaluate((lbl) => {
    const pager = document.querySelector(`[data-rd-pager="${lbl}"]`);
    return pager?.querySelector('button[aria-current="page"]')?.textContent?.trim() ?? null;
  }, label);
const activityInfo = () =>
  page.evaluate(() => {
    const ul = document.querySelector("[data-rd-person-activity]");
    return {
      shown: Number(document.querySelector("[data-rd-activity-shown]")?.getAttribute("data-rd-activity-shown") ?? "0"),
      total: Number(ul?.getAttribute("data-rd-person-activity") ?? "-1"),
    };
  });

// ── R1: stored positions render as stored ────────────────────────────────────────────────────────
async function checkR1(viewportKey) {
  await goto();
  await nav("progress");
  await selectAxis(AXIS_A);
  await page.waitForSelector(`[data-rd-context-panel="${AXIS_A}"]`, { timeout: 15000 });
  await page.waitForTimeout(400);

  const ws = await readPlan("Workstream plan");
  const expected = [
    { num: "1.", position: "1" },
    { num: "2.", position: "2" },
    { num: "3.", position: "3" },
    { num: "4.", position: "4" },
    { num: "0.", position: "0" },
    { num: "", position: "" },
  ];
  check(
    `R1 [${viewportKey}] Workstream plan renders stored positions directly (1..4, 0, none)`,
    JSON.stringify(ws) === JSON.stringify(expected),
    `got=${JSON.stringify(ws)}`
  );

  const task = await readPlan("Task plan");
  check(
    `R1 [${viewportKey}] Task plan renders stored positions directly (1..2)`,
    JSON.stringify(task) === JSON.stringify([
      { num: "1.", position: "1" },
      { num: "2.", position: "2" },
    ]),
    `got=${JSON.stringify(task)}`
  );
  await page.screenshot({ path: path.join(SHOTS, `r1-numbering-${viewportKey}.png`) });
}

// ── R2: Project open count == Progress open count under mixed states ─────────────────────────────
async function checkR2(viewportKey) {
  await goto();
  await nav("progress");
  const railOpen = Number(
    (await page.getAttribute(`[data-rd-index-axis="${AXIS_A}"]`, "data-rd-index-open-problems")) ?? "-1"
  );

  await nav("topics");
  await page.click(`[data-rd-index-topic="${TOPIC_NAME}"]`);
  await page.waitForSelector(`[data-rd-work-card="${AXIS_A}"]`, { timeout: 15000 });
  await page.waitForTimeout(400);
  const card = await page.evaluate((id) => {
    const el = document.querySelector(`[data-rd-work-card="${id}"]`);
    const counts = [...el.querySelectorAll(".rd-count")].map((c) => c.textContent.trim());
    const open = counts.find((t) => /open task/.test(t)) ?? null;
    const blocked = el.querySelector(".rd-blocked-pill")?.textContent?.trim() ?? null;
    return { blocked, open };
  }, AXIS_A);
  const openCount = card.open ? Number((card.open.match(/(\d+)/) || [])[1]) : -1;

  check(
    `R2 [${viewportKey}] Project card open count equals Progress rail open count (1)`,
    railOpen === 1 && openCount === 1,
    `rail=${railOpen} card=${openCount} (${card.open})`
  );
  check(
    `R2 [${viewportKey}] blocked is counted separately, not as open`,
    card.blocked !== null && /(^|\D)1(\D|$)/.test(card.blocked),
    `card-blocked=${card.blocked}`
  );
  await page.screenshot({ path: path.join(SHOTS, `r2-count-scope-${viewportKey}.png`) });
}

// ── R3: person-scoped activity feed is identity-safe ─────────────────────────────────────────────
async function checkR3() {
  await goto();
  await nav("people");
  await page.click(`[data-rd-person-id="${PERSON_A}"]`);
  await page.waitForSelector("[data-rd-person-activity]", { timeout: 15000 });
  await page.waitForTimeout(400);
  const a0 = await activityInfo();
  check(`R3 person A shows its own 12 activities at offset 0`, a0.total === 12, `total=${a0.total}`);

  // Page A to offset 10.
  await clearCalls();
  await page.click('[data-rd-pager="Activity"] button:has-text("3")');
  await page.waitForTimeout(500);
  const aCalls = await calls();
  const aAt10 = aCalls.find((c) => c.action === "list_activity" && c.offset === 10);
  const aAfter = await activityInfo();
  check(
    `R3 person A page 3 requests offset 10 and shows the remainder`,
    aAt10?.axisId === null && aAt10?.offset === 10 && aAfter.shown === 2 && aAfter.total === 12,
    `call=${JSON.stringify(aAt10)} shown=${aAfter.shown}`
  );

  // Switch to B: must reset to B's own offset 0, never carry A's offset 10 — and must not flash A's rows.
  // R3b (the immediate-render guarantee the stable `key={entry.person.id}` pays for): hold B's own read open
  // and sample the feed while it is in flight. A keyed remount renders an empty feed (total 0, no rows);
  // reusing the element would show A's 12-total / 2-row page under B's identity for that frame.
  await clearCalls();
  await setDelay("((a, b) => (a === 'list_activity' && Number(b.offset) === 0) ? 700 : 0)");
  await page.click(`[data-rd-person-id="${PERSON_B}"]`);
  await page.waitForTimeout(200);
  const flash = await page.evaluate(() => {
    const ul = document.querySelector("[data-rd-person-activity]");
    return {
      rows: ul ? ul.querySelectorAll("li").length : -1,
      total: Number(ul?.getAttribute("data-rd-person-activity") ?? "-1"),
    };
  });
  check(
    `R3b switching to person B shows no transient rows from A while B's read is in flight`,
    flash.total === 0 && flash.rows === 0,
    `total=${flash.total} rows=${flash.rows}`
  );
  await page.waitForTimeout(700);
  await clearHooks();
  const bCalls = await calls();
  const bAt0 = bCalls.find((c) => c.action === "list_activity" && c.offset === 0);
  const bAt10 = bCalls.find((c) => c.action === "list_activity" && c.offset === 10);
  const bInfo = await activityInfo();
  check(
    `R3 switching to person B resets to offset 0 (and never requests offset 10)`,
    !!bAt0 && !bAt10 && bInfo.total === 2 && bInfo.shown === 2,
    `at0=${!!bAt0} at10=${!!bAt10} total=${bInfo.total} shown=${bInfo.shown}`
  );

  // Back to A: also starts at 0, not the page left behind.
  await clearCalls();
  await page.click(`[data-rd-person-id="${PERSON_A}"]`);
  await page.waitForTimeout(700);
  const backCalls = await calls();
  const backAt0 = backCalls.find((c) => c.action === "list_activity" && c.offset === 0);
  check(
    `R3 going back to person A starts at offset 0 again`,
    !!backAt0,
    `at0=${!!backAt0}`
  );
}

// ── R4: scoped reads commit only for the newest request ──────────────────────────────────────────
async function checkR4() {
  // (a) A-slow / B-fast selection race.
  await goto();
  await nav("progress");
  await setDelay(
    "((a, b) => (a === 'get_topic' && b.axisId === '" + AXIS_A + "') ? 900 : 0)"
  );
  await selectAxis(AXIS_A);
  await selectAxis(AXIS_B);
  await page.waitForTimeout(1500);
  const raceA = await contextPanel();
  check(
    `R4 A-slow/B-fast: the newer selection A→B keeps B's workstream`,
    raceA === AXIS_B,
    `context-panel=${raceA}`
  );
  await clearHooks();

  // (b) offset-5-slow / offset-10-fast rapid pager race.
  await goto();
  await nav("progress");
  await selectAxis(AXIS_A);
  await page.waitForSelector(`[data-rd-context-panel="${AXIS_A}"]`, { timeout: 15000 });
  await page.waitForTimeout(300);
  await setDelay(
    "((a, b) => (a === 'get_topic' && b.axisId === '" + AXIS_A + "' && b.offset === 5) ? 900 : 0)"
  );
  await clearCalls();
  await page.click('[data-rd-pager="Tasks"] button:has-text("2")');
  await page.click('[data-rd-pager="Tasks"] button:has-text("3")');
  await page.waitForTimeout(1500);
  const cards = (await readTaskCards()).sort();
  const range = await page.getAttribute('[data-rd-pager="Tasks"] [data-rd-pager-range]', "data-rd-pager-range");
  check(
    `R4 offset-5-slow/offset-10-fast: the newest task page (offset 10) is committed`,
    JSON.stringify(cards) === JSON.stringify(["task-resolved-8", "task-resolved-9"]) && range === "11-12",
    `cards=${JSON.stringify(cards)} range=${range}`
  );
  await clearHooks();

  // (c) stale failure must not raise an error over the newer read.
  await goto();
  await nav("progress");
  await setDelay(
    "((a, b) => (a === 'get_topic' && b.axisId === '" + AXIS_A + "') ? 700 : 0)"
  );
  await setFail("((a, b) => (a === 'get_topic' && b.axisId === '" + AXIS_A + "') ? 'preview: synthetic stale failure' : false)");
  await selectAxis(AXIS_A);
  await selectAxis(AXIS_B);
  await page.waitForTimeout(1400);
  const errText = await page.evaluate(() => document.querySelector("p.rd-error")?.textContent?.trim() ?? "");
  const panel = await contextPanel();
  check(
    `R4 a stale failure does not surface an error over the newer read`,
    errText === "" && panel === AXIS_B,
    `error="${errText}" panel=${panel}`
  );
  await clearHooks();
}

for (const vp of [{ h: 800, key: "1280x800", w: 1280 }, { h: 900, key: "1440x900", w: 1440 }]) {
  page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await checkR1(vp.key);
  await checkR2(vp.key);
  if (vp.w === 1280) {
    await checkR3();
    await checkR4();
  }
  await page.close();
}
await browser.close();

writeFileSync(path.join(HERE, "result.json"), JSON.stringify({ checks, url: URL }, null, 1));
const fails = checks.filter((c) => !c.ok);
console.log(`\n=== reviewer-corrections regression: ${checks.length - fails.length}/${checks.length} checks passed ===`);
if (fails.length) {
  console.log("FAILURES:\n" + fails.map((f) => " - " + f.name + " :: " + f.detail).join("\n"));
}
process.exitCode = fails.length ? 1 : 0;
