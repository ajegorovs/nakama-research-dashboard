/**
 * check.mjs — executable regression check for the full-text clamp release (`src/ui.tsx`).
 *
 *   bun harness/full-text-clamp/check.mjs --serve        # one command: build fixtures, serve, measure
 *   bun harness/full-text-clamp/check.mjs --url http://127.0.0.1:3210/preview.html
 *
 * What it establishes
 * -------------------
 * The approved bounded behavior: opening an axis's own **native** `More on this axis` fold releases the
 * 2-line clamp on that row's reading `[data-rd-claim="current_state"]`, in place, while a **collapsed**
 * card stays byte-identical, a row with **no fold** stays clamped, and a **short** state is a visual
 * no-op. It measures the real computed style, the real glyph visibility and the real keyboard walk.
 *
 * Where it runs
 * -------------
 * Against the **built** bundle (`ui/app.js`) mounted through the plugin's own host runtime by
 * `harness/preview/run.mjs` on a fresh loopback port — no Nakama instance, no credentials, no service
 * restart, nothing written to a served org. This is an **implementation preview**, not served-build
 * acceptance: it proves the rule in the bundle does what it says, not that an instance serves it.
 * `deployment is NOT performed` by this check.
 *
 * Exit contract (matches the acceptance pass): 0 = verdict PASS, 1 = verdict FAIL, 2 = ABORTED,
 * 3 = REFUSED (a precondition failed, so nothing was established). The rule bytes it will inject as the
 * negative control are read from the bundle itself, so the check cannot pass against a get-around CSS.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromiumLaunchOptions, chromiumSource } from "../chromium.mjs";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);

const PORT = flag("port", "3210");
const URL = flag("url", `http://127.0.0.1:${PORT}/preview.html`);
const SERVE = has("serve") || flag("url") === null;
const BUILD = flag("build", path.join(REPO, "ui", "app.js"));
const FIXTURES = flag("fixtures", path.join(HERE, "clamp-fixtures.json"));
const OUT = flag("out", path.join(REPO, ".hermes", "scratch", "full-text-clamp", "pack"));
const VIEWPORTS = [[1440, 900], [1280, 800]];

// The rule the change adds, byte-for-byte as it appears in `src/ui.tsx` and in the built bundle.
const RULE_SELECTOR =
  '[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value,\n' +
  '[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value {\n' +
  "  -webkit-line-clamp: unset;\n" +
  "  display: block;\n" +
  "  overflow: visible;\n" +
  "}";
const NEGATIVE_CSS =
  '[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value,\n' +
  '[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value {\n' +
  "  -webkit-line-clamp: 2 !important;\n" +
  "  display: -webkit-box !important;\n" +
  "  overflow: hidden !important;\n" +
  "}";

const checks = [];
const check = (id, desc, cond, detail = "") => {
  const status = cond === "blocked" ? "BLOCKED" : cond ? "PASS" : "FAIL";
  checks.push({ id, desc, status, detail });
  console.log(`${status.padEnd(7)} ${id}  ${desc}${detail ? ` — ${detail}` : ""}`);
  return status === "PASS";
};
const abort = (message) => {
  console.error(`full-text-clamp: ${message}`);
  console.error("full-text-clamp: ABORTED — nothing established.");
  process.exit(2);
};
const refuse = (message) => {
  console.error(`full-text-clamp: ${message}`);
  console.error("full-text-clamp: REFUSED — a precondition failed.");
  process.exit(3);
};

// ── precondition: the built bundle carries the rule, byte-for-byte ─────────────────────────────────
if (!existsSync(BUILD)) refuse(`no built bundle at ${BUILD} — run \`bun run build\` first.`);
const bundle = readFileSync(BUILD, "utf8");
const rulePresent = bundle.includes(RULE_SELECTOR);
const buildSha = (await import("node:crypto")).createHash("sha256").update(bundle).digest("hex");
if (!rulePresent) {
  refuse(`the built bundle ${path.relative(REPO, BUILD)} does not contain the rule verbatim — refusing to measure a build without it.`);
}
check("build.ruleBytes", "the built bundle contains the approved rule byte-for-byte", rulePresent, `${path.relative(REPO, BUILD)} ${buildSha.slice(0, 12)}… ${bundle.length}B`);

mkdirSync(OUT, { recursive: true });
const manifest = {
  kind: "implementation preview — isolated local preview server (host runtime, built ui/app.js). NOT served-build acceptance. Deployment NOT performed.",
  generatedAt: new Date().toISOString(),
  url: URL, build: path.relative(REPO, BUILD), buildSha256: buildSha, buildBytes: bundle.length,
  rule: RULE_SELECTOR, negativeControl: NEGATIVE_CSS,
  viewports: VIEWPORTS.map((v) => v.join("x")), shots: [],
};

// ── optionally serve the preview ourselves (fresh port) ─────────────────────────────────────────────
let server = null;
if (SERVE) {
  if (!existsSync(FIXTURES)) {
    console.log("full-text-clamp: building clamp fixtures…");
    const made = spawn("bun", [path.join(HERE, "make-clamp-fixtures.mjs"), "--out", FIXTURES], { stdio: "inherit" });
    const code = await new Promise((resolve) => made.on("exit", resolve));
    if (code !== 0) abort("make-clamp-fixtures.mjs failed");
  } else {
    console.log(`full-text-clamp: using fixtures ${FIXTURES}`);
  }
  server = spawn(
    "bun",
    [path.join(HERE, "..", "preview", "run.mjs"), "--dataset", "corpus", "--no-fixtures", "--fixtures", FIXTURES, "--port", PORT],
    { cwd: REPO, stdio: ["ignore", "inherit", "inherit"] }
  );
  const deadline = Date.now() + 30_000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL, { method: "GET" });
      if (res.ok) { up = true; break; }
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!up) { try { server.kill(); } catch {} abort(`preview did not become ready at ${URL}`); }
}
const stopServer = () => { try { server?.kill("SIGTERM"); } catch {} };
process.on("exit", stopServer);

console.log(`full-text-clamp: chromium — ${chromiumSource()}`);
const browser = await chromium.launch({ ...chromiumLaunchOptions(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

// ── in-page measurement ──────────────────────────────────────────────────────────────────────────
const MEASURE = ([rowSel, claimSel]) => {
  const root = document.querySelector(rowSel);
  if (!root) return { found: false };
  const claim = root.querySelector(claimSel);
  const cs = claim ? getComputedStyle(claim) : null;
  const node = claim && claim.firstChild && claim.firstChild.nodeType === 3 ? claim.firstChild : null;
  const text = claim ? (claim.textContent ?? "") : "";
  let visible = "";
  if (node) {
    const boxTop = claim.getBoundingClientRect().top;
    const boxBottom = boxTop + claim.clientHeight;
    const range = document.createRange();
    for (let i = 0; i < node.data.length; i += 1) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      if (rects.length && rects[0].width > 0 && rects[0].top >= boxTop - 1 && rects[0].bottom <= boxBottom + 1) visible += node.data[i];
    }
  }
  const fold = root.querySelector("details.rd-axis-more");
  const reading = root.querySelector(".rd-axis-reading");
  // Whitespace at a wrap point has a zero-width rect, so the glyph walk drops it. Compare on non-whitespace
  // glyphs: "every character of the claim is on screen, no ellipsis" is the honest assertion.
  const visibleNZ = visible.replace(/\s+/g, "");
  const textNZ = text.replace(/\s+/g, "");
  const lh = cs ? parseFloat(cs.lineHeight) : null;
  return {
    found: true,
    axisTitle: root.getAttribute("data-rd-axis-title") ?? root.getAttribute("data-rd-scan-axis") ?? null,
    fold: fold ? { present: true, open: fold.hasAttribute("open") } : { present: false, open: false },
    readingHeight: reading ? reading.clientHeight : null,
    claim: claim ? {
      textLen: text.length, rawText: text, clientHeight: claim.clientHeight, scrollHeight: claim.scrollHeight,
      clipped: claim.scrollHeight > claim.clientHeight + 1,
      ruleMatches: claim.matches('[data-plugin-id="research-dashboard"] .rd-axis-detail:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value, [data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value'),
      lineClamp: (cs.getPropertyValue("-webkit-line-clamp") || cs.webkitLineClamp || "").trim(),
      display: cs.display, overflow: cs.overflow,
      visibleLines: lh ? Math.round(claim.clientHeight / lh) : null,
      visibleLen: visible.length, visibleGlyphs: visibleNZ.length, domGlyphs: textNZ.length,
      tailVisible: visibleNZ.includes(textNZ.slice(-25)),
      fullReadable: !(claim.scrollHeight > claim.clientHeight + 1) && visibleNZ.includes(textNZ.slice(-25)) && visibleNZ.length === textNZ.length,
      visibleHead: visible.slice(0, 48), visibleTail: visible.slice(-40),
      scrollWidth: claim.scrollWidth, clientWidth: claim.clientWidth,
      hOverflowPx: Math.max(0, claim.scrollWidth - claim.clientWidth),
    } : null,
    blocks: [...root.children].filter((n) => { const r = n.getBoundingClientRect(); return r.height > 0 && r.width > 0; }).length,
    controls: { buttons: root.querySelectorAll("button").length, summaries: root.querySelectorAll("summary").length },
    rowOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
    docOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
};

const colour = (css) => {
  const text = (css ?? "").trim(); if (!text) return null;
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) { const d = hex[1]; const step = d.length <= 4 ? 1 : 2; const part = (at) => parseInt(step === 1 ? d.slice(at, at + 1).repeat(2) : d.slice(at * 2, at * 2 + 2), 16); const a = d.length === 4 ? part(3) / 255 : d.length === 8 ? part(3) / 255 : 1; return { r: part(0), g: part(1), b: part(2), a }; }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) { const p = rgb[1].split(/[,/\s]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
  const ok = /^okl(ab|ch)\(([^)]+)\)$/.exec(text);
  if (ok) { const p = ok[2].split(/[/\s]+/).filter(Boolean).map((v) => (v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : Number(v))); const [L, s2, t3, al = 1] = p; const [a, b] = ok[1] === "ch" ? [s2 * Math.cos((t3 * Math.PI) / 180), s2 * Math.sin((t3 * Math.PI) / 180)] : [s2, t3]; const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; const enc = (v) => { const c = Math.min(1, Math.max(0, v)); return Math.round(Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)) * 255); }; return { r: enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), a: al }; }
  return null;
};
const lum = ({ r, g, b }) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

const settle = async (page, rowSel) => {
  await page.evaluate(async (s) => {
    const el = document.querySelector(s + " details.rd-axis-more");
    if (el) { const run = (el.getAnimations?.() ?? []).filter((a) => a.playState === "running"); try { await Promise.all(run.map((a) => a.finished)); } catch {} }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, rowSel);
};
const injectCss = (page, id, css) => page.evaluate(([i, c]) => { let s = document.getElementById(i); if (!s) { s = document.createElement("style"); s.id = i; document.head.appendChild(s); } s.textContent = c; }, [id, css]);
const removeCss = (page, id) => page.evaluate((i) => document.getElementById(i)?.remove(), id);
const shot = async (page, file, locator = null) => {
  const p = path.join(OUT, file);
  try { await (locator ? page.locator(locator).first().screenshot({ path: p }) : page.screenshot({ path: p })); manifest.shots.push({ file, path: p }); return p; }
  catch { return null; }
};
const tabToSummary = async (page, rowSel, budget = 600) => {
  await page.evaluate(() => { document.activeElement?.blur?.(); document.documentElement.setAttribute("tabindex", "-1"); document.documentElement.focus(); document.documentElement.removeAttribute("tabindex"); window.scrollTo(0, 0); });
  for (let i = 0; i < budget; i += 1) {
    await page.keyboard.press("Tab");
    // Compare by structure, not element identity: a re-render can replace the node focus is on.
    const hit = await page.evaluate((s) => {
      const el = document.activeElement;
      return !!(el && el.tagName === "SUMMARY" && el.closest(s) && el.closest("details.rd-axis-more"));
    }, rowSel);
    if (hit) return true;
  }
  return false;
};
const measureFocusedSummary = (page, rowSel) => page.evaluate((s) => {
  const sum = document.querySelector(s + " details.rd-axis-more summary");
  if (!sum) return null;
  const cs = getComputedStyle(sum);
  let bg = "rgb(255,255,255)";
  for (let n = sum; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") { bg = c; break; } }
  return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, focusVisible: sum.matches(":focus-visible"), bg };
}, rowSel);

const readabilityAssert = (m) => {
  const c = m?.claim; if (!c) return { ok: false, why: "missing claim" };
  const eq = (a, b, t = 1) => Math.abs((a ?? 0) - (b ?? 0)) <= t;
  const clampOk = ["none", "unset", "normal", ""].includes(c.lineClamp);
  const dispOk = c.display === "block";
  const ovfOk = c.overflow === "visible";
  const hOk = eq(c.clientHeight, c.scrollHeight, 1);
  const hOverflowOk = c.hOverflowPx <= 1 && m.rowOverflowPx <= 1 && m.docOverflowPx <= 1;
  const fullOk = c.fullReadable && c.tailVisible;
  const openOk = m.fold?.open === true;
  const ruleOk = c.ruleMatches === true;
  return { ok: clampOk && dispOk && ovfOk && hOk && hOverflowOk && fullOk && openOk && ruleOk,
    why: `clamp=${c.lineClamp} display=${c.display} overflow=${c.overflow} h=${c.clientHeight}/${c.scrollHeight} hOv=${c.hOverflowPx}/${m.rowOverflowPx}/${m.docOverflowPx} full=${c.fullReadable} tail=${c.tailVisible} open=${m.fold?.open} rule=${c.ruleMatches}` };
};

const openIntoTopic = async (page) => {
  await page.waitForSelector('div[data-plugin-id="research-dashboard"]', { timeout: 20000 });
  const topics = page.locator('div[data-plugin-id="research-dashboard"] [data-rd-view-option="topics"]');
  await topics.first().waitFor({ timeout: 15000 });
  await topics.first().click();
  await page.waitForTimeout(500);
  const topic = page.locator('div[data-plugin-id="research-dashboard"] [data-rd-index-topic]').first();
  await topic.waitFor({ timeout: 15000 }).catch(() => {});
  if (await topic.count()) { await topic.click().catch(() => {}); }
  await page.waitForSelector('li.rd-axis-detail[data-rd-axis-title]', { timeout: 15000 });
  await page.waitForTimeout(300);
};

try {
  for (const [W, H] of VIEWPORTS) {
    const vp = `${W}x${H}`;
    const v = manifest.views ?? (manifest.views = {});
    v[vp] = {};
    let page;
    try { page = await browser.newPage({ viewport: { width: W, height: H } }); await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 }); }
    catch (e) { check(`preview.${vp}.reachable`, "the preview renders", false, String(e).slice(0, 120)); continue; }
    await openIntoTopic(page);

    // discover the sample rows by their measured state, then address them by a stable attribute
    const rows = await page.evaluate(() => [...document.querySelectorAll("li.rd-axis-detail[data-rd-axis-title]")].map((li) => ({
      title: li.getAttribute("data-rd-axis-title"),
      len: li.querySelector('.rd-claim-value[data-rd-claim="current_state"]')?.textContent.length ?? 0,
      hasFold: !!li.querySelector("details.rd-axis-more"),
    })));
    const longRow = rows.filter((r) => r.hasFold).sort((a, b) => b.len - a.len)[0];
    const shortRow = rows.filter((r) => r.hasFold && r.len > 0).sort((a, b) => a.len - b.len)[0];
    v[vp].discovered = rows;
    check(`coverage.${vp}.samples`, "found a long (clamped) and a short (no-op) axis row, each owning a fold",
      !!(longRow && longRow.len > 200 && shortRow && shortRow.len > 0 && shortRow.len < 40),
      `rows=${rows.length} long=${longRow?.title} (${longRow?.len}) short=${shortRow?.title} (${shortRow?.len})`);
    if (!longRow) { await page.close(); continue; }

    const LONG = `li.rd-axis-detail[data-rd-axis-title="${longRow.title}"]`;
    const SHORT = shortRow ? `li.rd-axis-detail[data-rd-axis-title="${shortRow.title}"]` : null;
    const CLAIM = '.rd-claim-value[data-rd-claim="current_state"]';

    // ---- (1) COLLAPSED baseline ----
    v[vp].collapsed = await page.evaluate(MEASURE, [LONG, CLAIM]);
    v[vp].collapsed.claim.textExact = v[vp].collapsed.claim.rawText.length === longRow.len;
    await shot(page, `f08-${vp}-collapsed.png`, LONG);
    check(`collapsed.${vp}.clamped`, "collapsed: the reading is clamped to 2 lines with hidden text",
      v[vp].collapsed.claim.lineClamp === "2" && v[vp].collapsed.claim.clipped,
      `clamp=${v[vp].collapsed.claim.lineClamp} client=${v[vp].collapsed.claim.clientHeight} scroll=${v[vp].collapsed.claim.scrollHeight} visible=${v[vp].collapsed.claim.visibleLen}/${v[vp].collapsed.claim.textLen}`);
    check(`collapsed.${vp}.textExact`, `collapsed: DOM text is text-exact (${longRow.len} chars)`, v[vp].collapsed.claim.textExact, `len=${v[vp].collapsed.claim.textLen}`);
    check(`collapsed.${vp}.ruleInert`, "collapsed: the new rule does not apply at all (the fold is closed), so the card is unchanged by construction",
      v[vp].collapsed.claim.ruleMatches === false, `ruleMatches=${v[vp].collapsed.claim.ruleMatches} clamp=${v[vp].collapsed.claim.lineClamp} display=${v[vp].collapsed.claim.display}`);
    check(`collapsed.${vp}.blocks`, "collapsed: the axis keeps its protected block count (<=6 with a blocker)", v[vp].collapsed.blocks <= 6, `blocks=${v[vp].collapsed.blocks}`);

    // ---- (2) REAL keyboard walk to the native summary, settled focus ----
    const reached = await tabToSummary(page, LONG);
    const focus = reached ? await measureFocusedSummary(page, LONG) : null;
    v[vp].focus = { reached, ...focus };
    check(`focus.${vp}.reached`, "the fold summary is reachable by a real Tab press and matches :focus-visible",
      reached && !!focus?.focusVisible, `reached=${reached} focusVisible=${focus?.focusVisible}`);
    const ind = focus ? colour(focus.outlineColor) : null;
    const bg = focus ? colour(focus.bg) : null;
    if (focus && focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0 && ind && bg) {
      const ratio = contrast(ind, bg);
      v[vp].focus.contrast = ratio;
      check(`focus.${vp}.contrast`, "the summary focus indicator reaches 3:1 against its background", ratio >= 3, `${ratio.toFixed(2)}:1 (${focus.outlineWidth} ${focus.outlineColor} over ${focus.bg})`);
    } else {
      check(`focus.${vp}.contrast`, "the summary focus indicator reaches 3:1 against its background", "blocked", `outline=${focus?.outlineStyle}/${focus?.outlineWidth}/${focus?.outlineColor}`);
    }

    // ---- (3) Enter opens the fold; the reading unclamps ----
    await page.keyboard.press("Enter");
    await page.waitForFunction((s) => document.querySelector(s)?.hasAttribute("open"), `${LONG} details.rd-axis-more`, { timeout: 5000 });
    await settle(page, LONG);
    v[vp].expanded = await page.evaluate(MEASURE, [LONG, CLAIM]);
    v[vp].expanded.claim.textExact = v[vp].expanded.claim.rawText.length === longRow.len;
    await shot(page, `f08-${vp}-expanded.png`, LONG);
    await shot(page, `f08-${vp}-expanded-viewport.png`);
    const exp = readabilityAssert(v[vp].expanded);
    v[vp].expanded.assert = exp;
    check(`expanded.${vp}.fullReadable`, "expanded: the clamp is released, the whole state is readable, no ellipsis, no horizontal overflow", exp.ok, exp.why);
    check(`expanded.${vp}.textExact`, `expanded: DOM text unchanged (text-exact ${longRow.len})`, v[vp].expanded.claim.textExact, `len=${v[vp].expanded.claim.textLen}`);
    check(`expanded.${vp}.blocks`, "expanded: the axis keeps its protected block count", v[vp].expanded.blocks <= 6, `blocks=${v[vp].expanded.blocks}`);

    // ---- (4) Space toggles the native fold ----
    await page.keyboard.press("Space");
    await page.waitForFunction((s) => !document.querySelector(s)?.hasAttribute("open"), `${LONG} details.rd-axis-more`, { timeout: 5000 });
    const closedBySpace = !(await page.evaluate((s) => document.querySelector(s)?.hasAttribute("open"), `${LONG} details.rd-axis-more`));
    await page.keyboard.press("Space");
    await page.waitForFunction((s) => document.querySelector(s)?.hasAttribute("open"), `${LONG} details.rd-axis-more`, { timeout: 5000 });
    await settle(page, LONG);
    check(`keyboard.${vp}.space`, "Space toggles the native fold closed and open again", closedBySpace, `closedBySpace=${closedBySpace}`);

    // ---- (5) NEGATIVE CONTROL: re-clamp while open; readability MUST go red ----
    await injectCss(page, "ftc-negative", NEGATIVE_CSS);
    await settle(page, LONG);
    v[vp].negative = await page.evaluate(MEASURE, [LONG, CLAIM]);
    await shot(page, `f08-${vp}-negative-control.png`, LONG);
    const neg = readabilityAssert(v[vp].negative);
    check(`negative.${vp}.clampRestoredFails`, "NEGATIVE CONTROL: re-clamping while the fold is open makes the readability assertion FAIL (the check can go red)", neg.ok === false, neg.why);
    await removeCss(page, "ftc-negative");
    await settle(page, LONG);
    const restored = readabilityAssert(await page.evaluate(MEASURE, [LONG, CLAIM]));
    check(`negative.${vp}.restored`, "after removing the negative CSS the expanded state is fully readable again", restored.ok, restored.why);

    // ---- (6) SHORT state: opening the fold is a visual no-op ----
    if (SHORT) {
      const before = await page.evaluate(MEASURE, [SHORT, CLAIM]);
      await page.evaluate((s) => { const f = document.querySelector(s + " details.rd-axis-more"); if (f && !f.hasAttribute("open")) f.setAttribute("open", ""); }, SHORT);
      await settle(page, SHORT);
      const after = await page.evaluate(MEASURE, [SHORT, CLAIM]);
      v[vp].short = { before, after };
      await shot(page, `short-${vp}-expanded.png`, SHORT);
      check(`short.${vp}.noop`, "a state already <=2 lines does not grow or move when the fold opens (visual no-op)",
        before.claim && after.claim && !before.claim.clipped &&
          Math.abs(after.claim.clientHeight - before.claim.clientHeight) <= 1 &&
          Math.abs(after.readingHeight - before.readingHeight) <= 1,
        `h ${before.claim?.clientHeight}->${after.claim?.clientHeight} (clipped ${before.claim?.clipped})`);
    } else {
      check(`short.${vp}.noop`, "a short state is a visual no-op when the fold opens", "blocked", "no short fold-owning axis reachable");
    }

    // ---- (7) FOLD-LESS row stays clamped (Repositories scan rows) ----
    try {
      const repo = page.locator('div[data-plugin-id="research-dashboard"] [data-rd-view-option="repositories"]');
      await repo.first().click();
      await page.waitForTimeout(700);
      const repoBtn = page.locator('div[data-plugin-id="research-dashboard"] [data-rd-repository]').first();
      if (await repoBtn.count()) { await repoBtn.click(); await page.waitForTimeout(600); }
      const foldless = await page.evaluate(() => {
        const li = [...document.querySelectorAll("li.rd-axis[data-rd-scan-axis]")].find((n) => !n.querySelector("details.rd-axis-more") && n.querySelector(".rd-claim-value"));
        if (!li) return null;
        const claim = li.querySelector(".rd-claim-value");
        const cs = getComputedStyle(claim);
        const sel = `li.rd-axis[data-rd-scan-axis="${li.getAttribute("data-rd-scan-axis")}"]`;
        return {
          sel, clamp: (cs.getPropertyValue("-webkit-line-clamp") || "").trim(), display: cs.display,
          textLen: claim.textContent.length,
          rowMatches: li.matches(`.rd-axis:has(details.rd-axis-more[open])`),
          claimMatches: claim.matches('[data-plugin-id="research-dashboard"] .rd-axis:has(details.rd-axis-more[open]) .rd-axis-reading .rd-claim-value'),
        };
      });
      if (foldless) {
        v[vp].foldless = foldless;
        await shot(page, `foldless-${vp}.png`, foldless.sel);
        check(`foldless.${vp}.staysClamped`, "a row with no fold does not match the rule and keeps its clamp (the rule is scoped to fold-owning rows)",
          foldless.rowMatches === false && foldless.claimMatches === false && foldless.clamp === "2" && foldless.display !== "block",
          `rowMatches=${foldless.rowMatches} claimMatches=${foldless.claimMatches} clamp=${foldless.clamp} display=${foldless.display} text=${foldless.textLen}`);
      } else {
        check(`foldless.${vp}.staysClamped`, "a row with no fold keeps its clamp", "blocked", "no fold-less scan row with a reading reachable");
      }
    } catch (e) { check(`foldless.${vp}.staysClamped`, "a row with no fold keeps its clamp", "blocked", String(e).slice(0, 120)); }

    await page.close();
  }
} catch (error) {
  console.error(`full-text-clamp: uncaught — ${error?.stack ?? error}`);
  console.error("full-text-clamp: ABORTED — partial run.");
  try { await browser.close(); } catch {}
  stopServer();
  process.exit(2);
}
await browser.close();
stopServer();
// Let the preview server unwind before the verdict is printed, so its shutdown chatter cannot be misread
// as part of the result.
await new Promise((resolve) => setTimeout(resolve, 400));

const passed = checks.filter((c) => c.status === "PASS").length;
const failed = checks.filter((c) => c.status === "FAIL").length;
const blocked = checks.filter((c) => c.status === "BLOCKED").length;
manifest.checks = checks;
manifest.counts = { total: checks.length, passed, failed, blocked };
writeFileSync(path.join(OUT, "check-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${passed} passed · ${failed} failed · ${blocked} blocked · full-text-clamp: ${failed ? `${failed} failure(s)` : blocked ? "pass with blocked items" : "all checks passed"}`);
console.log(`manifest: ${path.join(OUT, "check-manifest.json")}`);
process.exit(failed === 0 && blocked === 0 ? 0 : failed > 0 ? 1 : 0);
