/**
 * montage.mjs — build side-by-side montages: approved prototype (top) vs the running app (bottom).
 * Read-only.   bun harness/fidelity/montage.mjs --fidelity docs/ux-v2/fidelity --out <dir>
 *
 * The running-UI caption carries the review URL and the served build. **Neither is hardcoded**: the URL
 * label comes from `--url-label` (default: the placeholder form, so a committed montage never carries a
 * real host name) and the build from `--build` (get it from `served-build.mjs` at capture time — a build
 * string written into this file would be a lie the moment the next release is minted).
 */
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const FID = flag("fidelity", "docs/ux-v2/fidelity");
const OUT = flag("out", path.join(FID, "side-by-side"));
// Placeholder by default: docs in this tree carry no host/tailnet identifiers (estate AGENTS.md § Doc
// Hygiene). Pass --url-label only for a montage that will not be committed.
const URL_LABEL = flag("url-label", "<box>.<tailnet>.ts.net:3003");
const BUILD = flag("build", null);
// The bottom caption. The sane default names the served review UI; a preview-vs-prototype montage passes
// `--current-label "PREVIEW (host runtime, no instance)"` so the caption does not claim an instance it
// never touched.
const CURRENT_LABEL = flag("current-label", "RUNNING REVIEW UI");
// The bottom caption's right-hand note. Defaults to the review URL + served build; a preview montage passes
// `--current-note` so the caption does not carry a host it never visited.
const CURRENT_NOTE =
  flag("current-note", null) ??
  `http://${URL_LABEL}${BUILD === null ? "" : ` — build ${BUILD}`}`;
// The placeholder is written into HTML, so its angle brackets must be escaped or the browser parses
// `<box>.<tailnet>` as an element and the caption renders a mangled URL.
const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// view name -> [prototype stem, current screenshot]
const PAIRS = [
  ["topics", "topics", "topics.png"],
  ["people", "people", "people.png"],
  ["repositories", "repositories", "repositories.png"],
  ["progress", "progress", "progress.png"],
  /**
   * C3 — the landing is compared against the prototype's Overview. Until C3 the pair pointed at `topics.png`
   * because the Topics index *was* the default screen; now the default screen is the aggregation, so the
   * comparison is like for like (and `topics.png` still gets its own pair above).
   */
  ["overview", "overview", "overview.png"],
];

mkdirSync(OUT, { recursive: true });
const abs = (p) => `file://${path.resolve(p)}`;
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1480, height: 1200 }, deviceScaleFactor: 1 });

for (const [name, protoStem, currentFile] of PAIRS) {
  const proto = path.join(FID, "prototype-1440x900", `${protoStem}-full.png`);
  const current = path.join(FID, "current-1440x900", currentFile);
  if (!existsSync(proto) || !existsSync(current)) {
    console.log(`${name}: MISSING ${!existsSync(proto) ? proto : current}`);
    continue;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#0b0b0c; font:13px/1.4 ui-monospace,monospace; color:#e8e8ea; }
    .cap { padding:10px 16px; background:#18181b; border-bottom:1px solid #2a2a2e;
           display:flex; justify-content:space-between; }
    .cap b { color:#fff } .cap span { color:#9a9aa2 }
    img { display:block; width:1440px; }
    .gap { height:6px; background:#3b3b41; }
  </style></head><body>
    <div class="cap"><b>${name} — APPROVED PROTOTYPE</b><span>docs/ux-v2/contract/prototypes/${protoStem}.html</span></div>
    <img src="${abs(proto)}">
    <div class="gap"></div>
    <div class="cap"><b>${name} — ${CURRENT_LABEL}</b><span>${esc(CURRENT_NOTE)}</span></div>
    <img src="${abs(current)}">
  </body></html>`;
  const file = path.join(OUT, `${name}.html`);
  writeFileSync(file, html);
  await page.goto(`file://${path.resolve(file)}`, { waitUntil: "load" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${name}: montage ${1480}x${h}`);
}
await browser.close();
