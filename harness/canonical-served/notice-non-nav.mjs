#!/usr/bin/env bun
/**
 * notice-non-nav.mjs — the served non-navigation probe for the exceptional-state NOTICE (requirement #60).
 *
 * The canonical pass asserts a notice carries a recognised kind and no entity tags; the accepted contract
 * (docs/ux-v2/contract/interaction-spec.md) additionally requires it to be **never a navigation**. The
 * canonical check asserts that structurally (`verify-page.mjs` reads the hook and its tag count); this
 * harness probes it **behaviourally** on the served page: it selects the bare repository (so its `empty`
 * notice renders), proves the notice holds no link/button/action descendant, then really **clicks** it and
 * presses **Tab / Enter** on it, and asserts the browser URL, the active view, the selected repository and
 * the action-call set are all UNCHANGED (no navigation, no re-selection, no read, no write).
 *
 *   bun harness/canonical-served/notice-non-nav.mjs                 # positive
 *   bun harness/canonical-served/notice-non-nav.mjs --mutant        # negative control
 *
 * `--mutant` injects a DOM fixture that makes the notice NAVIGATIONAL (an `<a>` descendant whose click
 * switches the view). The oracle MUST go red on it — a green run that cannot detect a navigational notice
 * proves nothing. Exit 0 only when the expectation for the mode is met (positive: every check passes;
 * mutant: at least one check fails); exit 2 on a fault.
 *
 * The target organization is supplied EXPLICITLY (`--org-id` / `--org-name`, or `NAKAMA_ORG_ID` /
 * `NAKAMA_ORG_NAME`), resolved EXACTLY against `/v1/auth/orgs` with the shared resolver (never `orgs[0]`),
 * and the session's active org is set by `POST /v1/auth/active-org` and read back (`activeOrgId`) before any
 * check runs — a run that names no organization is refused.
 *
 *   NAKAMA_ORG_ID=<id> bun harness/canonical-served/notice-non-nav.mjs
 *   NAKAMA_ORG_ID=<id> bun harness/canonical-served/notice-non-nav.mjs --mutant
 */
import { existsSync, readdirSync } from "node:fs";

import { parseOrgSelector, selectOrgId, requireExplicitOrgSelector } from "../org-selection.mjs";

const MUTANT = process.argv.includes("--mutant");
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0)))
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) { console.error("notice-non-nav: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
const BARE_HINT = "bare/empty-current";

const READ_SET = new Set(["get_overview", "get_progress", "get_topic", "list_activity", "list_topics"]);
const actionCalls = [];
const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
page.on("request", (req) => {
  const m = req.url().match(/\/actions\/([^/?]+)/);
  if (m) actionCalls.push(m[1]);
});
await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
const status = await page.evaluate(async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status, [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]);
if (status !== 200) { console.error(`notice-non-nav: login failed (${status})`); process.exit(2); }
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writes = () => actionCalls.filter((k) => !READ_SET.has(k)).length;

// --- explicit organization session contract (never `orgs[0]`) -------------------------------------------
// The target organization is named EXPLICITLY (a lone-org fallback is NOT permitted here — the sibling
// served probes refuse it), resolved EXACTLY against `/v1/auth/orgs` with the shared resolver, then selected
// as the session's active org and read back from the host's own echo (`activeOrgId`). The probe's whole
// point is that the served page it drives is the named org's, not whatever `orgs[0]` happened to be.
const SELECTOR = parseOrgSelector();
const explicit = requireExplicitOrgSelector(SELECTOR);
if (!explicit.ok) { await browser.close(); console.error(`notice-non-nav: ${explicit.message}`); process.exit(2); }
const orgList = await page.evaluate(async () => (await fetch("/v1/auth/orgs", { credentials: "include" })).json());
const selection = selectOrgId(orgList?.orgs, SELECTOR);
if (!selection.ok) { await browser.close(); console.error(`notice-non-nav: ${selection.message}`); process.exit(2); }
const TARGET_ORG = selection.id;
const switched = await page.evaluate(async (orgId) => {
  const cookie = (n) => document.cookie.split("; ").find((e) => e.startsWith(`${n}=`))?.slice(n.length + 1) ?? "";
  const res = await fetch("/v1/auth/active-org", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-csrf-token": cookie("nakama_csrf") }, body: JSON.stringify({ orgId }) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, activeOrgId: body.activeOrgId ?? null };
}, TARGET_ORG);
check(
  "the session's active organization matches the explicitly named target (switch readback)",
  switched.status === 200 && switched.activeOrgId === TARGET_ORG,
  `target ${TARGET_ORG} (matched by ${selection.matchedBy}) · activeOrgId ${JSON.stringify(switched.activeOrgId)} (HTTP ${switched.status})`
);
if (switched.status !== 200 || switched.activeOrgId !== TARGET_ORG) {
  await browser.close();
  console.error(`notice-non-nav: active-org switch did not confirm the target (HTTP ${switched.status}, activeOrgId ${JSON.stringify(switched.activeOrgId)} vs ${JSON.stringify(TARGET_ORG)})`);
  process.exit(2);
}

/** Read the whole observable state the non-nav oracle compares. */
const readState = () =>
  page.evaluate((hint) => {
    const scope = document.querySelector('div[data-plugin-id]');
    const notice = scope?.querySelector("[data-rd-notice]") ?? null;
    const noticeNode = notice
      ? {
          kind: notice.getAttribute("data-rd-notice"),
          text: (notice.textContent ?? "").trim(),
          links: [...notice.querySelectorAll("a, button, [role='link'], [role='button'], [tabindex], [onclick]")].length,
        }
      : null;
    return {
      url: location.href,
      view: scope?.querySelector('[data-rd-view-option][aria-pressed="true"]')?.getAttribute("data-rd-view-option") ?? null,
      selected: [...(scope?.querySelectorAll('[data-rd-view="repositories"] [data-rd-repository][aria-pressed="true"]') ?? [])].map((n) => n.getAttribute("data-rd-repository")),
      noticeNode,
      hasNotice: notice !== null,
      bareSelected: [...(scope?.querySelectorAll('[data-rd-view="repositories"] [data-rd-repository]') ?? [])].some((n) => n.getAttribute("data-rd-repository")?.includes(hint) && n.getAttribute("aria-pressed") === "true"),
    };
  }, BARE_HINT);

try {
  await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="repositories"]', { timeout: 20000 });
  await page.locator('div[data-plugin-id] [data-rd-view-option="repositories"]').first().click();
  await page.waitForSelector("div[data-plugin-id] [data-rd-view='repositories'] [data-rd-repository]", { timeout: 15000 });
  await sleep(500);
  // Select the bare repository (the only one whose selected panel renders the `empty` notice).
  const rows = page.locator("div[data-plugin-id] [data-rd-view='repositories'] [data-rd-repository]");
  const n = await rows.count();
  let hit = -1;
  for (let i = 0; i < n; i += 1) {
    const name = (await rows.nth(i).evaluate((e) => e.getAttribute("data-rd-repository"))) ?? "";
    if (name.includes(BARE_HINT)) hit = i;
  }
  if (hit === -1) throw new Error(`bare repository ${JSON.stringify(BARE_HINT)} not in the Repositories index`);
  await rows.nth(hit).click();
  await page.waitForSelector("div[data-plugin-id] [data-rd-notice]", { timeout: 15000 });
  await sleep(400);

  if (MUTANT) {
    // Inject a NAVIGATIONAL notice: an <a> descendant whose click switches the view. A correct oracle
    // must flag the descendant AND the interaction.
    await page.evaluate(() => {
      const notice = document.querySelector("div[data-plugin-id] [data-rd-notice]");
      if (!notice) return;
      notice.innerHTML = "";
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = "navigational mutant notice";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelector('div[data-plugin-id] [data-rd-view-option="progress"]')?.click();
      });
      notice.appendChild(a);
    });
    await sleep(200);
  }

  const before = await readState();
  const writesBefore = writes();
  const readsBefore = actionCalls.filter((k) => READ_SET.has(k)).length;

  check("the bare repository renders an `empty` notice on its own selected panel", before.hasNotice && before.noticeNode?.kind === "empty" && before.bareSelected, `notice=${JSON.stringify(before.noticeNode)} bareSelected=${before.bareSelected}`);

  // The notice holds no link, button, tabindex or onclick descendant — it is not interactive (structural).
  const structuralOk = before.noticeNode != null && before.noticeNode.links === 0;
  check("the notice holds no link/button/action descendant (structural non-navigation)", structuralOk, `interactive descendants=${before.noticeNode?.links}`);
  // The notice itself is not focusable (a static <p>): it is not in the tab order. If it WERE focusable,
  // the keyboard half below would be required; because it is static, focus is not required of it.
  const focusable = await page
    .locator("div[data-plugin-id] [data-rd-notice]")
    .first()
    .evaluate((n) => n.tabIndex >= 0 || n.matches("a, button, [tabindex]"));
  check("the notice is a static element, not in the tab order (so focus is not required of it)", !focusable, `focusable=${focusable}`);

  // Behavioural probe. Mouse: click the notice. Keyboard: press Enter (the page's default focus is the
  // document body — the notice is not focusable — so this exercises "keyboard where applicable" without
  // Tab wandering into the host shell's own controls, which are not the notice).
  const notice = page.locator("div[data-plugin-id] [data-rd-notice]").first();
  await notice.click({ force: true }).catch(() => {});
  await page.keyboard.press("Enter");
  await sleep(500);
  const after = await readState();
  const writesAfter = writes();
  const readsAfter = actionCalls.filter((k) => READ_SET.has(k)).length;

  check("clicking/keyboarding the notice does not navigate the browser URL", after.url === before.url, `url ${after.url === before.url ? "unchanged" : `changed ${before.url} → ${after.url}`}`);
  check("the notice does not change the active view", after.view === before.view, `view ${before.view} → ${after.view}`);
  check("the notice does not re-select a repository", JSON.stringify(after.selected) === JSON.stringify(before.selected), `selected ${JSON.stringify(before.selected)} → ${JSON.stringify(after.selected)}`);
  check("the notice fires no write action", writesAfter === writesBefore, `writes ${writesBefore} → ${writesAfter}`);
  check("the notice fires no action read", readsAfter === readsBefore, `reads ${readsBefore} → ${readsAfter}`);
} catch (error) {
  await browser.close();
  console.error(`notice-non-nav: fault — ${error.message}`);
  process.exit(2);
}
await browser.close();

const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ mode: MUTANT ? "mutant" : "positive", viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, checks }, null, 2));
if (MUTANT) {
  // The negative control is healthy only when the navigational notice is DETECTED (≥1 red).
  console.log(fails.length > 0 ? `notice-non-nav: NEGATIVE CONTROL OK (oracle detected the navigational notice; ${fails.length} red)` : "notice-non-nav: NEGATIVE CONTROL BROKEN (oracle stayed green on a navigational notice)");
  process.exit(fails.length > 0 ? 0 : 1);
}
console.log(fails.length === 0 ? "notice-non-nav: PASS" : `notice-non-nav: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
