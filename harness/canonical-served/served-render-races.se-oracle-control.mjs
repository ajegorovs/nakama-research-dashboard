#!/usr/bin/env bun
/**
 * served-render-races.se-oracle-control.mjs — an ORACLE-SENSITIVITY control for the SE (stale-error)
 * check, run entirely in an isolated browser context against the served instance.
 *
 * WHY this exists and what it is NOT. The SE check asks whether a held stale read that FAILS, released
 * after the newer read committed, raises an error over it. Its guard is the SAME request-generation guard
 * (`active && !ctx.signal.aborted`) that gates the SUCCESS path (`setPage`) — the failure path does not
 * commit state through that branch, so removing the guard (the success-path mutant) CANNOT make SE go red.
 * A product mutation therefore cannot counter-prove SE. What this control proves instead is narrower and
 * stated as such: the SE ORACLE can SEE an error — `state().errorText`, the detector the SE assertion
 * reads, flips true when an error string is present on the page. That is **oracle sensitivity**, NOT proof
 * that the product needs a new guard.
 *
 * The error is injected into the ISOLATED, throwaway browser page's own DOM (a synthetic marker added
 * after load). Nothing is written to the product, the served instance, the repo or any durable state; the
 * injection lives only in this browser context and dies with it.
 *
 * Exit 0 when the oracle is shown sensitive (baseline false -> injection flips it true); exit 2 on a setup
 * fault; exit 1 if the oracle does NOT flip (it would then be unable to detect any error).
 */
import { existsSync, readdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root)
    .filter((n) => n.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0))) {
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"])
      if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  }
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) {
  console.error("se-oracle-control: no chromium");
  process.exit(2);
}
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
const EMAIL = process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_DEV_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The SE detector the races check reads, verbatim: an error is present when the page text matches this
 *  vocabulary. Kept byte-identical to `state().errorText` in served-render-races.mjs so the control tests
 *  the SAME oracle the SE assertion uses. */
const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("div[data-plugin-id]");
    const body = (root?.textContent || "").toLowerCase();
    return { errorText: /error|failed|something went wrong|could not|unavailable/.test(body) };
  });

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
let exit = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  const page = await ctx.newPage();
  await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(
    async ([email, password]) => {
      const r = await fetch("/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      return r.status;
    },
    [EMAIL, PASSWORD]
  );
  if (status !== 200) throw new Error(`login failed (${status})`);
  await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
  await page.waitForSelector('div[data-plugin-id]', { timeout: 20000 });
  await sleep(400);

  const baseline = await state(page);
  console.log(`baseline errorText=${baseline.errorText} (the real page, no error present)`);

  // Inject a SYNTHETIC error marker into this isolated page's plugin root only. It never leaves this
  // browser context; it is a control, not a product change.
  const injected = await page.evaluate(() => {
    const root = document.querySelector("div[data-plugin-id]");
    if (!root) return false;
    const marker = document.createElement("div");
    marker.setAttribute("data-rd-se-oracle-control", "synthetic-marker");
    marker.textContent = "Something went wrong (synthetic oracle-control marker)";
    root.appendChild(marker);
    return true;
  });
  if (!injected) throw new Error("plugin root not found for injection");
  const afterInjection = await state(page);
  console.log(`after synthetic marker errorText=${afterInjection.errorText}`);

  const sensitive = baseline.errorText === false && afterInjection.errorText === true;
  console.log(
    `se-oracle-control: ${sensitive ? "PASS" : "FAIL"} — the SE error oracle is ${sensitive ? "sensitive to" : "BLIND to"} a present error (oracle sensitivity, NOT a product-guard proof)`
  );
  if (!sensitive) exit = 1;
  await ctx.close();
} catch (error) {
  console.error(`se-oracle-control: setup fault — ${error.message}`);
  exit = 2;
}
await browser.close();
process.exit(exit);
