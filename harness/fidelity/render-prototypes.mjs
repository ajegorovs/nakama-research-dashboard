/**
 * render-prototypes.mjs — render the approved prototypes at a given viewport, for like-for-like comparison
 * with the running app. Read-only: opens local files, screenshots.
 *   bun harness/fidelity/render-prototypes.mjs --dir docs/ux-v2/contract/prototypes --out <dir> --viewport 1440x900
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const DIR = flag("dir", "docs/ux-v2/contract/prototypes");
const OUT = flag("out", "/tmp/prototypes");
const VIEWPORT = (flag("viewport", "1440x900")).split("x").map(Number);

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

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: cachedChromium() ?? undefined });
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
const pages = readdirSync(DIR).filter((name) => name.endsWith(".html")).sort();
for (const name of pages) {
  const stem = name.replace(/\.html$/, "");
  await page.goto(`file://${path.resolve(DIR, name)}`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${stem}-viewport.png`) });
  await page.screenshot({ path: path.join(OUT, `${stem}-full.png`), fullPage: true });
  const size = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    title: document.title,
  }));
  console.log(`${stem}: ${size.w}x${size.h} title="${size.title}"`);
}
await browser.close();
