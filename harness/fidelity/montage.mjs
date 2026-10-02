/**
 * montage.mjs — build side-by-side montages: approved prototype (top) vs the running app (bottom).
 * Read-only.   bun harness/fidelity/montage.mjs --fidelity docs/ux-v2/fidelity --out <dir>
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const FID = flag("fidelity", "docs/ux-v2/fidelity");
const OUT = flag("out", path.join(FID, "side-by-side"));

const cachedChromium = () => {
  const root = path.join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("chromium")) continue;
    for (const candidate of [
      path.join(root, entry, "chrome-linux", "chrome"),
      path.join(root, entry, "chrome-linux", "headless_shell"),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
};

// view name -> [prototype stem, current screenshot]
const PAIRS = [
  ["topics", "topics", "topics.png"],
  ["people", "people", "people.png"],
  ["repositories", "repositories", "repositories.png"],
  ["progress", "progress", "progress.png"],
  ["overview-vs-default", "overview", "topics.png"],
];

mkdirSync(OUT, { recursive: true });
const abs = (p) => `file://${path.resolve(p)}`;
const browser = await chromium.launch({ executablePath: cachedChromium() ?? undefined });
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
    <div class="cap"><b>${name} — RUNNING REVIEW UI</b><span>http://smi-alex-516-pc.tail63f186.ts.net:3003 — build 0.2.0+dev.ae3049008d5f</span></div>
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
