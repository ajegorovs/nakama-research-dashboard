/**
 * chromium.mjs — find a Chromium the `playwright-core` driver can launch, on whatever machine this is.
 *
 * Why this exists: `playwright-core` is a *driver* and asks for its own pinned browser revision (1.63
 * wants rev 1243), while a machine commonly carries something else — a different cached revision (this
 * one has 1234), or a distro Chromium, or nothing at all. The old harness resolved only the driver's own
 * layout (`chrome-linux/chrome`) and then fell back to `undefined`, which makes the driver try to
 * **download** its pinned rev — a network step on a fresh box, and a failure where the network is closed.
 * Resolution here never downloads and never hardcodes a user's home: it looks, in order, at
 *
 *   1. `$CHROMIUM_EXECUTABLE` / `$PLAYWRIGHT_CHROMIUM_EXECUTABLE` — an explicit override;
 *   2. the Playwright cache (`$PLAYWRIGHT_BROWSERS_PATH` or `~/.cache/ms-playwright`), **whichever**
 *      `chromium*` revision is present — the directory name is not assumed to match the driver's;
 *   3. a system chromium/chrome on `$PATH`, then the usual absolute locations.
 *
 * `resolveChromium()` returns a path or `null`; callers pass `chromiumLaunchOptions()` straight to
 * `chromium.launch()`.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const isExecutableFile = (candidate) => {
  try {
    return statSync(candidate).isFile() && (statSync(candidate).mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

/** Layouts to probe inside each `chromium*` cache entry, newest rev first is irrelevant — first hit wins. */
const CACHE_LAYOUTS = [
  ["chrome-linux64", "chrome"],
  ["chrome-linux", "chrome"],
  ["chrome-linux64", "headless_shell"],
  ["chrome-linux", "headless_shell"],
  ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
  ["chrome-darwin", "Chromium.app", "Contents", "MacOS", "Chromium"],
  ["chrome-win", "chrome.exe"],
];

const cacheRoots = () => {
  const roots = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) roots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  roots.push(path.join(homedir(), ".cache", "ms-playwright"));
  return roots;
};

const cachedCandidates = () => {
  const found = [];
  for (const root of cacheRoots()) {
    if (!existsSync(root)) continue;
    let entries = [];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.startsWith("chromium")) continue;
      for (const rel of CACHE_LAYOUTS) {
        const candidate = path.join(root, entry, ...rel);
        if (isExecutableFile(candidate)) found.push(candidate);
      }
    }
  }
  return found;
};

const onPath = (name) => {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
};

export function resolveChromium() {
  for (const key of ["CHROMIUM_EXECUTABLE", "PLAYWRIGHT_CHROMIUM_EXECUTABLE"]) {
    const value = process.env[key];
    if (value && isExecutableFile(value)) return value;
  }
  const cached = cachedCandidates();
  if (cached.length > 0) return cached[0];
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const hit = onPath(name);
    if (hit) return hit;
  }
  for (const candidate of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
  ]) {
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

/** Options for `chromium.launch()`; the explicit path is omitted only when nothing was found. */
export function chromiumLaunchOptions(extra = {}) {
  const executablePath = resolveChromium();
  return executablePath ? { executablePath, ...extra } : { ...extra };
}

/** One line naming where the browser will come from, for the caller to print. */
export function chromiumSource() {
  return resolveChromium() ?? "(playwright-core default — it may try to download its pinned revision)";
}
