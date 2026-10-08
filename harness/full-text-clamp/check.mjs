/**
 * check.mjs — executable regression check for the full-text clamp release (`src/ui.tsx`).
 *
 *   bun harness/full-text-clamp/check.mjs --serve        # one command: regenerate fixtures, serve, measure
 *   bun harness/full-text-clamp/check.mjs --url http://127.0.0.1:3210/preview.html
 *   bun harness/full-text-clamp/check.mjs --preflight    # the non-browser preconditions only (bytes,
 *                                                         # fixture canon, fresh-port identity/liveness)
 *
 * What it establishes
 * -------------------
 * The approved bounded behavior: opening an axis's own **native** `More on this axis` fold releases the
 * 2-line clamp on that row's reading `[data-rd-claim="current_state"]`, in place, while a **collapsed**
 * card's computed behavior is unchanged (the rule is a non-match while `[open]` is absent), a row with
 * **no fold** stays clamped, and a **short** state is a visual no-op. It measures the real computed
 * style, the real glyph visibility and the real keyboard walk.
 *
 * Where it runs
 * -------------
 * Against the **built** bundle (`ui/app.js`) mounted through the plugin's own host runtime by
 * `harness/preview/run.mjs` on a **fresh ephemeral loopback port** — no Nakama instance, no credentials,
 * no service restart, nothing written to a served org. This is an **implementation preview**, not
 * served-build acceptance: it proves the rule in the bundle does what it says, not that an instance
 * serves it. `deployment is NOT performed` by this check.
 *
 * Build size is the file's **byte** length
 * ----------------------------------------
 * `ui/app.js` is decoded to a string only to search it verbatim; the sha256 and the reported size are
 * taken from the raw **Buffer**, so `buildBytes` is the file's byte length, never the string's UTF-16
 * code-unit count (the two differ: 155420 bytes vs 155239 code units).
 *
 * Which server it measured
 * ------------------------
 * The run allocates an ephemeral port (`bind 127.0.0.1:0`, then release), so the child re-binds it. That
 * release is a known race: another process can take the port in between. The check closes it by passing
 * a random **run token** to the child, which serves its identity (token + the bundle sha256/bytes) at
 * `/preview-identity.json`; readiness requires that a responder echo **exactly this run's** token and
 * sha. A stale or foreign responder is **refused**, not measured; a child that exits before readiness
 * (e.g. the port is occupied and Vite's `strictPort` fails) **aborts immediately**, it does not poll.
 *
 * Exit contract (matches the acceptance pass): 0 = verdict PASS, 1 = verdict FAIL, 2 = ABORTED,
 * 3 = REFUSED (a precondition failed, so nothing was established). The rule bytes it will inject as the
 * negative control are read from the bundle itself, so the check cannot pass against a get-around CSS.
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { chromiumLaunchOptions, chromiumSource } from "../chromium.mjs";
import { F08_STATE, F08_TITLE, SHORT_STATE } from "./make-clamp-fixtures.mjs";
import { AXES } from "../wp5/manifest.mjs";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const explicitUrl = flag("url");
const explicitPort = flag("port");
const SERVE = has("serve") || explicitUrl === null;
const PREFLIGHT = has("preflight");
const BUILD = flag("build", path.join(REPO, "ui", "app.js"));
// A caller-owned payload (`--fixtures <path>`) is trusted and NOT regenerated; the harness's own generated
// fixture is rebuilt on **every** self-served run, even when one already exists, so it can never measure a
// stale payload. The generated file is git-ignored and rebuilt on demand (see the repo's `.gitignore`).
const FIXTURES_EXPLICIT = flag("fixtures") !== null;
const FIXTURES = flag("fixtures", path.join(HERE, "clamp-fixtures.json"));
const OUT = flag("out", path.join(REPO, ".hermes", "scratch", "full-text-clamp", "pack"));
const VIEWPORTS = [[1440, 900], [1280, 800]];
// A per-run nonce, so the identity the child serves cannot be forged by a leftover responder.
const RUN_TOKEN = randomBytes(16).toString("hex");

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
const refuse = (message) => {
  console.error(`full-text-clamp: ${message}`);
  console.error("full-text-clamp: REFUSED — a precondition failed.");
  process.exit(3);
};
const abort = (message) => {
  console.error(`full-text-clamp: ${message}`);
  console.error("full-text-clamp: ABORTED — nothing established.");
  process.exit(2);
};

/** Allocate an ephemeral loopback port: bind 127.0.0.1:0, read the port, release it. The gap between the
 *  release and the child's re-bind is the race the run token closes. */
const ephemeralPort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

let PORT = explicitPort;
if (SERVE && PORT == null) PORT = String(await ephemeralPort());
const URL = explicitUrl ?? `http://127.0.0.1:${PORT}/preview.html`;
// Identity is only meaningful against a server we start (or one whose identity URL the caller names).
const IDENTITY_URL = flag("identity", SERVE ? `http://127.0.0.1:${PORT}/preview-identity.json` : null);

// ── precondition: the built bundle carries the rule, byte-for-byte; size is bytes, not code units ──
if (!existsSync(BUILD)) refuse(`no built bundle at ${BUILD} — run \`bun run build\` first.`);
const bundleBuf = readFileSync(BUILD);
const bundle = bundleBuf.toString("utf8"); // decode for the verbatim search only
const buildSha = createHash("sha256").update(bundleBuf).digest("hex");
const buildBytes = bundleBuf.length; // the file's byte length (what the OS/disk reports)
const buildFileBytes = statSync(BUILD).size;
const buildCodeUnits = bundle.length; // the UTF-16 code-unit count — deliberately NOT what we report
const rulePresent = bundle.includes(RULE_SELECTOR);
if (!rulePresent) {
  refuse(`the built bundle ${path.relative(REPO, BUILD)} does not contain the rule verbatim — refusing to measure a build without it.`);
}
check("build.ruleBytes", "the built bundle contains the approved rule byte-for-byte", rulePresent, `${path.relative(REPO, BUILD)} ${buildSha.slice(0, 12)}… ${buildBytes}B`);
check(
  "build.bytesExact",
  "buildBytes is the file's byte length (Buffer / on-disk size), not its UTF-16 code-unit count",
  typeof buildBytes === "number" && buildBytes === buildFileBytes && buildBytes > 0,
  `bytes=${buildBytes} onDisk=${buildFileBytes} utf16Units=${buildCodeUnits}${buildBytes !== buildCodeUnits ? " (the two differ — bytes, not code units, was reported)" : ""}`
);

// ── F08 subject: one shared constant, cross-checked against the WP5 manifest (no duplicate canon) ──
const manifestF08Title = AXES.find((a) => a.n === 4)?.title;
check(
  "f08.canonTitle",
  "the F08 title is the shared WP5 manifest's axis-4 title (single source, no duplicate)",
  manifestF08Title === F08_TITLE,
  `manifest='${manifestF08Title}' imported='${F08_TITLE}'`
);
check("f08.canonLength", "the shared F08 currentState constant is the approved 411-char subject", F08_STATE.length === 411, `len=${F08_STATE.length}`);

mkdirSync(OUT, { recursive: true });
const manifest = {
  kind: "implementation preview — isolated local preview server (host runtime, built ui/app.js). NOT served-build acceptance. Deployment NOT performed.",
  generatedAt: new Date().toISOString(),
  url: URL, build: path.relative(REPO, BUILD), buildSha256: buildSha, buildBytes,
  runToken: RUN_TOKEN, port: PORT,
  rule: RULE_SELECTOR, negativeControl: NEGATIVE_CSS,
  viewports: VIEWPORTS.map((v) => v.join("x")), shots: [],
};

// ── fixtures: regenerate the generated payload every self-served run; verify it carries the F08 canon ──
if (SERVE) {
  if (FIXTURES_EXPLICIT) {
    if (!existsSync(FIXTURES)) refuse(`caller-supplied fixtures do not exist at ${FIXTURES}.`);
    console.log(`full-text-clamp: using caller-supplied fixtures ${FIXTURES} (not regenerated — the caller owns the payload).`);
  } else {
    const preexisting = existsSync(FIXTURES);
    if (preexisting) rmSync(FIXTURES, { force: true });
    console.log(`full-text-clamp: regenerating clamp fixtures (preexisting=${preexisting})…`);
    const made = spawn("bun", [path.join(HERE, "make-clamp-fixtures.mjs"), "--out", FIXTURES], { stdio: "inherit" });
    const code = await new Promise((resolve) => made.on("exit", resolve));
    if (code !== 0) abort("make-clamp-fixtures.mjs failed");
    check(
      "fixtures.regenerated",
      "a self-served run regenerates the generated fixture even when a stale one already existed",
      existsSync(FIXTURES),
      `preexisting=${preexisting} → rebuilt ${path.relative(REPO, FIXTURES)}`
    );
  }
}

// The mounted payload must carry the F08 subject row at its exact title and the exact 411-char constant.
const fixtureCarriesF08 = (file) => {
  if (!existsSync(file)) return { axisPresent: false, currentState: null };
  let payload;
  try {
    payload = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { axisPresent: false, currentState: null };
  }
  const topicKey = Object.keys(payload.responses ?? {}).find((k) => k.startsWith("get_topic:"));
  const topic = topicKey ? payload.responses[topicKey] : null;
  const axis = (topic?.axes ?? []).find((a) => a.title === F08_TITLE);
  return { axisPresent: !!axis, currentState: axis?.currentState ?? null, axisCount: topic?.axes?.length ?? 0 };
};
if (existsSync(FIXTURES)) {
  const fx = fixtureCarriesF08(FIXTURES);
  check("fixtures.f08TitleExact", "the mounted fixture carries the F08 subject row at its exact title", fx.axisPresent, `expected='${F08_TITLE}'`);
  check(
    "fixtures.f08StateExact",
    `the F08 row's currentState is the shared constant, text-exact (${F08_STATE.length} chars)`,
    fx.currentState === F08_STATE,
    `len=${fx.currentState === null ? "(absent)" : fx.currentState.length} expected=${F08_STATE.length}`
  );
}

// ── serve the preview ourselves (fresh ephemeral port) and prove the responder is THIS child ─────────
let server = null;
let childExit = null;
let stopping = false;
const stopServer = () => {
  stopping = true;
  try {
    server?.kill("SIGTERM");
  } catch {
    /* already gone */
  }
};

if (SERVE) {
  server = spawn(
    "bun",
    [path.join(HERE, "..", "preview", "run.mjs"), "--dataset", "corpus", "--no-fixtures", "--fixtures", FIXTURES, "--port", PORT, "--run-token", RUN_TOKEN],
    { cwd: REPO, stdio: ["ignore", "inherit", "inherit"] }
  );
  server.on("exit", (code, signal) => {
    // 143 / SIGTERM after we asked it to stop is our own intentional shutdown; anything else, and
    // anything before readiness, is an unexpected exit and is reported as such (never hidden).
    if (childExit === null) childExit = { code, signal, intentional: stopping };
  });
  process.on("exit", stopServer);
}

let identity = null;
if (IDENTITY_URL) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    // Liveness first: a child that exited (bad port, missing checkout, Vite strictPort collision) can
    // never become ready — fail immediately instead of polling out the whole deadline.
    if (SERVE && childExit) {
      stopServer();
      const how = childExit.signal ? `signal ${childExit.signal}` : `exit code ${childExit.code}`;
      abort(`the preview child exited before readiness (${how}) — nothing is served at ${URL}.`);
    }
    try {
      const res = await fetch(IDENTITY_URL, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json();
        if (body.token === RUN_TOKEN && body.buildSha256 === buildSha && body.buildBytes === buildBytes) {
          identity = body;
          break;
        }
        stopServer();
        refuse(
          `a responder at ${IDENTITY_URL} is not this run's preview child — its identity does not match ` +
            `(token '${String(body.token).slice(0, 8)}…' vs '${RUN_TOKEN.slice(0, 8)}…', ` +
            `sha '${String(body.buildSha256).slice(0, 12)}…' vs '${buildSha.slice(0, 12)}…'). ` +
            `Refusing to measure an unknown responder.`
        );
      }
    } catch {
      /* not up yet, or not ours yet */
    }
    await sleep(400);
  }
  if (!identity) {
    stopServer();
    abort(`the preview did not establish its identity at ${IDENTITY_URL} within 30s.`);
  }
  check(
    "serve.identity",
    "readiness is this run's own preview child: the served identity echoes the run token and the built bundle sha/bytes",
    identity.token === RUN_TOKEN && identity.buildSha256 === buildSha && identity.buildBytes === buildBytes,
    `token=${RUN_TOKEN.slice(0, 8)}… sha=${buildSha.slice(0, 12)}… bytes=${identity.buildBytes}`
  );
} else {
  check("serve.identity", "a served identity was established for the measured build", "blocked", `no identity endpoint (measured an existing --url: ${URL})`);
}

if (PREFLIGHT) {
  // The non-browser preconditions only (bytes, fixture canon, fresh-port identity/liveness). Used by the
  // integrity suite to exercise the guards cheaply; it does not measure geometry.
  stopServer();
  await sleep(200);
  manifest.childExit = childExit ?? null;
  const p = checks.filter((c) => c.status === "PASS").length;
  const f = checks.filter((c) => c.status === "FAIL").length;
  const b = checks.filter((c) => c.status === "BLOCKED").length;
  manifest.checks = checks;
  manifest.counts = { total: checks.length, passed: p, failed: f, blocked: b };
  writeFileSync(path.join(OUT, "preflight-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${p} passed · ${f} failed · ${b} blocked · full-text-clamp (preflight)`);
  process.exit(f > 0 ? 1 : 0);
}

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

    // The F08 subject is addressed by its exact title and constant — NOT by "the longest row". A row is
    // discovered only to prove the subject is present and text-exact, independently of any geometry.
    const rows = await page.evaluate(() => [...document.querySelectorAll("li.rd-axis-detail[data-rd-axis-title]")].map((li) => ({
      title: li.getAttribute("data-rd-axis-title"),
      len: li.querySelector('.rd-claim-value[data-rd-claim="current_state"]')?.textContent.length ?? 0,
      hasFold: !!li.querySelector("details.rd-axis-more"),
    })));
    v[vp].discovered = rows;
    const f08Row = rows.find((r) => r.title === F08_TITLE);
    const longest = [...rows].sort((a, b) => b.len - a.len)[0];
    check(`f08.${vp}.rowTitleExact`, "the F08 subject row is present by its exact title", !!f08Row, `expected '${F08_TITLE}' among ${rows.length} rows`);
    check(
      `f08.${vp}.locatedByTitle`,
      "the F08 subject is located by its exact title/constant, not by being the longest row",
      !!f08Row,
      `f08=${f08Row?.len} longest='${longest?.title}' (${longest?.len})${longest && longest.title !== F08_TITLE ? " — a longer row exists and is not the subject" : ""}`
    );
    check(`coverage.${vp}.samples`, "the F08 (fold-owning) subject and the short no-op state are both present", !!(f08Row && f08Row.hasFold && rows.some((r) => r.hasFold && r.len === SHORT_STATE.length)), `rows=${rows.length}`);
    if (!f08Row) { await page.close(); continue; }

    const LONG = `li.rd-axis-detail[data-rd-axis-title="${f08Row.title}"]`;
    // Independent of geometry: the F08 row's DOM text must BE the shared 411-char constant.
    const f08StateText = await page.evaluate((s) => document.querySelector(s + ' .rd-claim-value[data-rd-claim="current_state"]')?.textContent ?? null, LONG);
    check(`f08.${vp}.stateExact`, `the F08 row's currentState text is the shared 411-char constant, character-exact`, typeof f08StateText === "string" && f08StateText === F08_STATE, `len=${f08StateText?.length ?? "(absent)"} expected=${F08_STATE.length}`);

    // The short no-op row is addressed by its explicit fixture state, not "the shortest".
    const shortRow = rows.filter((r) => r.hasFold).find((r) => r.len === SHORT_STATE.length);
    const SHORT = shortRow ? `li.rd-axis-detail[data-rd-axis-title="${shortRow.title}"]` : null;
    const CLAIM = '.rd-claim-value[data-rd-claim="current_state"]';

    // ---- (1) COLLAPSED baseline ----
    v[vp].collapsed = await page.evaluate(MEASURE, [LONG, CLAIM]);
    v[vp].collapsed.claim.textExact = v[vp].collapsed.claim.rawText.length === f08Row.len;
    await shot(page, `f08-${vp}-collapsed.png`, LONG);
    check(`collapsed.${vp}.clamped`, "collapsed: the reading is clamped to 2 lines with hidden text",
      v[vp].collapsed.claim.lineClamp === "2" && v[vp].collapsed.claim.clipped,
      `clamp=${v[vp].collapsed.claim.lineClamp} client=${v[vp].collapsed.claim.clientHeight} scroll=${v[vp].collapsed.claim.scrollHeight} visible=${v[vp].collapsed.claim.visibleLen}/${v[vp].collapsed.claim.textLen}`);
    check(`collapsed.${vp}.textExact`, `collapsed: DOM text is text-exact (${f08Row.len} chars)`, v[vp].collapsed.claim.textExact, `len=${v[vp].collapsed.claim.textLen}`);
    check(`collapsed.${vp}.ruleInert`, "collapsed: the new rule is a non-match (the fold is closed), so the computed collapsed behavior is unchanged",
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
    v[vp].expanded.claim.textExact = v[vp].expanded.claim.rawText.length === f08Row.len;
    await shot(page, `f08-${vp}-expanded.png`, LONG);
    await shot(page, `f08-${vp}-expanded-viewport.png`);
    const exp = readabilityAssert(v[vp].expanded);
    v[vp].expanded.assert = exp;
    check(`expanded.${vp}.fullReadable`, "expanded: the clamp is released, the whole state is readable, no ellipsis, no horizontal overflow", exp.ok, exp.why);
    check(`expanded.${vp}.textExact`, `expanded: DOM text unchanged (text-exact ${f08Row.len})`, v[vp].expanded.claim.textExact, `len=${v[vp].expanded.claim.textLen}`);
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
      const shortText = await page.evaluate((s) => document.querySelector(s + ' .rd-claim-value[data-rd-claim="current_state"]')?.textContent ?? null, SHORT);
      check(`short.${vp}.exact`, `the short no-op row carries the explicit fixture state (${JSON.stringify(SHORT_STATE)})`, shortText === SHORT_STATE, `len=${shortText?.length ?? "(absent)"} expected=${SHORT_STATE.length}`);
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
await sleep(400);
manifest.childExit = childExit ?? null;
if (childExit) {
  const how = childExit.signal ? `signal ${childExit.signal}` : `code ${childExit.code}`;
  console.log(`full-text-clamp: preview child exited (${how}) — ${childExit.intentional ? "intentional shutdown (we stopped it)" : "UNEXPECTED"}${childExit.code === 143 || childExit.signal === "SIGTERM" ? " [143/SIGTERM = teardown, not a failure]" : ""}.`);
} else if (SERVE) {
  console.log("full-text-clamp: preview child had not reported its exit at teardown (stopped with the check).");
}

const passed = checks.filter((c) => c.status === "PASS").length;
const failed = checks.filter((c) => c.status === "FAIL").length;
const blocked = checks.filter((c) => c.status === "BLOCKED").length;
manifest.checks = checks;
manifest.counts = { total: checks.length, passed, failed, blocked };
writeFileSync(path.join(OUT, "check-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${passed} passed · ${failed} failed · ${blocked} blocked · full-text-clamp: ${failed ? `${failed} failure(s)` : blocked ? "pass with blocked items" : "all checks passed"}`);
console.log(`manifest: ${path.join(OUT, "check-manifest.json")}`);
process.exit(failed === 0 && blocked === 0 ? 0 : failed > 0 ? 1 : 0);
