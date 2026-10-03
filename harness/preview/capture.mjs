/**
 * capture.mjs — screenshot the *preview* page across the same views at the same viewport the fidelity
 * montage compares, so `harness/fidelity/montage.mjs` can build a preview-vs-prototype montage with no
 * instance anywhere.
 *
 * The preview (`harness/preview/run.mjs`) serves `ui/app.js` through the host's own activation path. This
 * captures it exactly like `harness/fidelity/capture-current.mjs` captures a served UI — same five views
 * (`overview`, `topics`, `people`, `repositories`, `progress`), same 1440x900 clip, same scratch-then-move
 * discipline — but against `http://127.0.0.1:<port>/preview.html`, with no login and no credentials.
 *
 * Before each view is photographed it *selects a representative subject* — the row whose rendered detail is
 * most populated — by clicking the page's own controls. That is an instrument step, not the app's default:
 * the page still opens on the projection's own first row, and `--no-select` photographs exactly that. The
 * selection exists because the first row is not always the composition the montage compares (see below).
 *
 * It fails closed: nothing is written unless the page mounted and every view rendered its own container,
 * and — where the dataset carries a populated subject — unless the representative selection actually left
 * that populated detail on screen.
 *
 * It also hashes the built bundle it captured, because a preview screenshot is only meaningful next to the
 * bundle it shows (see the montage caption).
 *
 *   bun harness/preview/capture.mjs                          # expects the preview on :3010
 *   bun harness/preview/capture.mjs --url http://127.0.0.1:3011/preview.html \
 *     --viewport 1440x900 --out docs/ux-v2/fidelity/preview/current-1440x900 --full
 *   bun harness/preview/capture.mjs --no-select               # photograph the app's own landing
 */
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);

const URL = (flag("url", `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 3010}/preview.html`)).replace(/\/+$/, "");
const VIEWPORT = (flag("viewport", "1440x900")).split("x").map(Number);
const OUT = flag("out", "docs/ux-v2/fidelity/preview/current-1440x900");
const FULL = has("full");
// Selection is instrumentation, not the app's default: `--no-select` photographs the page's own landing
// (the projection's first row in each view) and skips the representative-row step entirely.
const NO_SELECT = has("no-select");
// Same order as capture-current: the landing is captured first, before any view control is pressed.
const VIEWS = ["overview", "topics", "people", "repositories", "progress"];
const PLUGIN_ROOT = 'div[data-plugin-id="research-dashboard"]';

// The durable markers each view must carry before it is captured — the attributes the acceptance pass
// reads, so a build that lost one cannot be photographed under its name.
const VIEW_MARKERS = {
  overview: [
    "[data-rd-landing]",
    '[data-rd-landing-column="topics"]',
    '[data-rd-landing-column="repositories"]',
    '[data-rd-home="current"]',
  ],
  people: ['[data-rd-view="people"]', "[data-rd-people]", '[data-rd-view-heading="people"]'],
  progress: ['[data-rd-view="progress"]', "[data-rd-progress-index]", "[data-rd-progress-detail]", '[data-rd-view-heading="progress"]'],
  repositories: ['[data-rd-view="repositories"]', "[data-rd-repositories]", '[data-rd-view-heading="repositories"]'],
  topics: ['[data-rd-view="topics"]', "[data-rd-topic-index]", "[data-rd-index-topic]", "[data-rd-detail]", '[data-rd-view-heading="topics"]'],
};

// ── representative selection — a preview instrument step, not the app's default ─────────────────────
// The page opens each view on the projection's own first row, and that default is the right thing for a
// reader. It is not always the composition this montage exists to compare. The fixture's repository index
// opens on a repository that no topic and no axis names — it draws an empty detail — while a populated
// repository sits in the same list. The corpus's axis index is ordered by attention and opens on a
// completed axis with no open problem, while the axis that carries its problems is the next row. So the
// capture *selects* the representative row — the one whose rendered detail is most populated — before it
// photographs. It only clicks the page's own controls and reads the markers the page already renders: no
// id, name or payload is known to this script, and nothing is written. `--no-select` skips it and
// photographs the app's own landing, which is how the default stays the default.
const SELECTABLE = new Set(["repositories", "progress"]);

/** Compare two score arrays, most-significant first. */
const compareScores = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/** Read numeric marker values rendered inside the plugin, keyed by their data-rd attribute name. */
const readMarkers = (page, attributes) =>
  page.evaluate(
    ({ root, names }) =>
      Object.fromEntries(
        names.map((name) => {
          const element = document.querySelector(`${root} [${name}]`);
          return [name, element ? Number(element.getAttribute(name)) || 0 : 0];
        })
      ),
    { names: attributes, root: PLUGIN_ROOT }
  );

/** The attribute value of the first plugin element carrying `attribute`, or null when there is none. */
const readMarkerText = (page, attribute) =>
  page
    .locator(`${PLUGIN_ROOT} [${attribute}]`)
    .first()
    .getAttribute(attribute)
    .catch(() => null);

/**
 * Repositories: pick the index row whose detail draws the most work — current axes first, then any axes,
 * then activity, then topics. The row is clicked through its own button, so the selection is exactly the
 * one a reader would make; the loop ends on the representative, not on the last row it happened to try.
 */
async function selectRepository(page) {
  const rows = page.locator(`${PLUGIN_ROOT} [data-rd-repositories] [data-rd-repository-id]`);
  const candidates = await rows.count();
  const detail = async () => {
    const markers = await readMarkers(page, [
      "data-rd-repository-current",
      "data-rd-repository-axes",
      "data-rd-repository-activity",
      "data-rd-repository-topics",
    ]);
    return {
      activity: markers["data-rd-repository-activity"],
      axes: markers["data-rd-repository-axes"],
      current: markers["data-rd-repository-current"],
      name: await readMarkerText(page, "data-rd-repository-panel"),
      topics: markers["data-rd-repository-topics"],
    };
  };
  const key = (score) => [score.current, score.axes, score.activity, score.topics];
  const hasWork = (score) => key(score).some((value) => value > 0);

  let best = null;
  let bestKey = null;
  let anyWork = false;
  for (let index = 0; index < candidates; index += 1) {
    const button = rows.nth(index);
    const name = await button.getAttribute("data-rd-repository");
    await button.click();
    await page
      .waitForFunction(
        ({ expected, selector }) =>
          document.querySelector(selector)?.getAttribute("data-rd-repository-panel") === expected,
        { expected: name, selector: `${PLUGIN_ROOT} [data-rd-repository-panel]` },
        { timeout: 5000 }
      )
      .catch(() => {});
    const score = await detail();
    if (hasWork(score)) anyWork = true;
    if (bestKey === null || compareScores(key(score), bestKey) > 0) {
      best = { name, score };
      bestKey = key(score);
    }
  }
  if (best !== null) {
    await page.locator(`${PLUGIN_ROOT} [data-rd-repository="${best.name}"]`).first().click();
    await page.waitForTimeout(150);
  }
  const score = await detail();
  return { anyWork, candidates, chosen: score.name, populated: hasWork(score), score };
}

/**
 * Progress: first pick the axis whose index row advertises the most open problems (then problems, then
 * activity) — the row the projection ordered first is not always the one with something to read. Then,
 * within that axis, pick the open problem whose rendered detail carries the most support — repositories,
 * evidence, steering, and the plan step it sits on. Every step is a click on the page's own control, so
 * the reading surface is reached exactly as a reader reaches it.
 */
async function selectProgress(page) {
  const axes = page.locator(`${PLUGIN_ROOT} [data-rd-progress-index] [data-rd-index-axis]`);
  const axisRows = await axes.evaluateAll((nodes) =>
    nodes.map((node) => ({
      activity: Number(node.getAttribute("data-rd-index-activity") ?? 0) || 0,
      id: node.getAttribute("data-rd-index-axis"),
      open: Number(node.getAttribute("data-rd-index-open-problems") ?? 0) || 0,
      problems: Number(node.getAttribute("data-rd-index-problems") ?? 0) || 0,
    }))
  );
  const anyOpen = axisRows.some((row) => row.open > 0);
  let axis = axisRows[0] ?? null;
  for (const row of axisRows) {
    if (axis === null) {
      axis = row;
    } else if (compareScores([row.open, row.problems, row.activity], [axis.open, axis.problems, axis.activity]) > 0) {
      axis = row;
    }
  }
  if (axis !== null) {
    await page.locator(`${PLUGIN_ROOT} [data-rd-index-axis="${axis.id}"]`).first().click();
    await page
      .waitForFunction(
        ({ expected, selector }) =>
          document.querySelector(selector)?.getAttribute("data-rd-progress-detail-axis") === expected,
        { expected: axis.id, selector: `${PLUGIN_ROOT} [data-rd-progress-detail]` },
        { timeout: 5000 }
      )
      .catch(() => {});
    await page.waitForTimeout(150);
  }

  const detail = async () => {
    const markers = await readMarkers(page, [
      "data-rd-progress-repositories",
      "data-rd-progress-evidence",
    ]);
    return {
      evidence: markers["data-rd-progress-evidence"],
      planStep: (await page.locator(`${PLUGIN_ROOT} [data-rd-plan-step-shown]`).count()) > 0 ? 1 : 0,
      repositories: markers["data-rd-progress-repositories"],
      shown: await readMarkerText(page, "data-rd-progress-problem-shown"),
      steering: await page.locator(`${PLUGIN_ROOT} [data-rd-progress-steering] [data-rd-steering]`).count(),
    };
  };
  const key = (score) => [score.repositories, score.evidence, score.steering, score.planStep];
  const hasSupport = (score) => key(score).some((value) => value > 0);

  const choices = page.locator(`${PLUGIN_ROOT} [data-rd-progress-problems] [data-rd-problem-choice]`);
  const candidates = await choices.count();
  let best = null;
  let bestKey = null;
  let anySupport = false;
  for (let index = 0; index < candidates; index += 1) {
    const button = choices.nth(index);
    const id = await button.getAttribute("data-rd-problem-choice");
    await button.click();
    await page
      .waitForFunction(
        ({ expected, selector }) =>
          document.querySelector(selector)?.getAttribute("data-rd-progress-problem-shown") === expected,
        { expected: id, selector: `${PLUGIN_ROOT} [data-rd-progress-problem-shown]` },
        { timeout: 5000 }
      )
      .catch(() => {});
    const score = await detail();
    if (hasSupport(score)) anySupport = true;
    if (bestKey === null || compareScores(key(score), bestKey) > 0) {
      best = { id, score };
      bestKey = key(score);
    }
  }
  if (best !== null) {
    await page.locator(`${PLUGIN_ROOT} [data-rd-problem-choice="${best.id}"]`).first().click();
    await page.waitForTimeout(150);
  }
  const score = await detail();
  return {
    anyOpen,
    anySupport,
    axisCandidates: axisRows.length,
    axisId: axis?.id ?? null,
    axisOpen: axis?.open ?? 0,
    candidates,
    chosen: score.shown,
    populated: hasSupport(score),
    score,
  };
}

let scratchDir = null;
const refuse = (why) => {
  if (scratchDir !== null) rmSync(scratchDir, { force: true, recursive: true });
  console.error(`preview-capture: REFUSED — ${why}`);
  console.error(`preview-capture: nothing was written; ${OUT} is untouched`);
  process.exit(3);
};

// Prove the preview is answering before opening a browser — a wrong port reads as "the page did not mount",
// which sends the reader after the wrong fault.
const answer = await fetch(URL, { headers: { accept: "text/html" } }).catch((error) => {
  refuse(`the preview URL did not answer (${error.message}) — is \`bun run preview\` running?`);
});
if (!answer.ok) {
  refuse(`${URL} answered HTTP ${answer.status} — is \`bun run preview\` running on this port?`);
}

const bundlePath = path.join(REPO, "ui", "app.js");
const bundleBytes = existsSync(bundlePath) ? readFileSync(bundlePath) : null;
const bundle = bundleBytes
  ? {
      bytes: bundleBytes.length,
      path: path.relative(REPO, bundlePath),
      sha256: createHash("sha256").update(bundleBytes).digest("hex"),
    }
  : null;

console.log(`preview-capture: url ${URL}`);
console.log(`preview-capture: browser ${chromiumLaunchOptions().executablePath ?? "(playwright default)"}`);
if (bundle) console.log(`preview-capture: bundle ${bundle.path} — ${bundle.bytes} bytes, sha256 ${bundle.sha256}`);

const browser = await chromium.launch(chromiumLaunchOptions());
try {
  const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  await page.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
  const mounted = await page
    .waitForSelector(`${PLUGIN_ROOT} [data-rd-landing]`, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 160));
    refuse(`the preview mounted no landing on ${URL} — body starts: ${body}`);
  }

  const scratch = `${OUT}.capture-${process.pid}`;
  mkdirSync(scratch, { recursive: true });
  scratchDir = scratch;

  const shots = [];
  for (const view of VIEWS) {
    if (view !== "overview") {
      const control = page.locator(`${PLUGIN_ROOT} [data-rd-view-option="${view}"]`);
      if ((await control.count()) === 0) {
        refuse(`no control for view ${view} — the capture would record another view under its name`);
      }
      await control.first().click();
      const switched = await page
        .waitForSelector(`${PLUGIN_ROOT} [data-rd-view="${view}"]`, { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (!switched) refuse(`view ${view} never rendered its container ([data-rd-view="${view}"])`);
    } else {
      const alreadyInView = await page.locator(`${PLUGIN_ROOT} [data-rd-view]`).count();
      if (alreadyInView > 0) refuse("the overview shot would record a view that was already selected");
    }
    // Representative selection — instrumentation, not the default (see the header). It runs before the
    // markers are re-checked, so what is verified and photographed is the state the selection left behind.
    if (!NO_SELECT && SELECTABLE.has(view)) {
      if (view === "repositories") {
        const result = await selectRepository(page);
        if (result.candidates === 0) refuse("repositories view rendered no repository row to select");
        if (result.anyWork && !result.populated) {
          refuse(
            `the selected repository (${result.chosen}) draws no work, though a populated repository is on the page`
          );
        }
        console.log(
          `preview-capture: repositories — selected '${result.chosen}' ` +
            `(${result.populated ? "populated detail" : "no repository in this dataset carries work"}; ${result.candidates} candidate(s))`
        );
      } else {
        const result = await selectProgress(page);
        if (result.axisCandidates === 0) refuse("progress view rendered no axis row to select");
        if (result.anyOpen && result.axisOpen === 0) {
          refuse(
            "the selected progress axis shows no open problem, though an axis with open problems is on the page"
          );
        }
        if (result.candidates > 0 && !result.chosen) {
          refuse("progress shows no problem after selection, though the selected axis lists problems");
        }
        if (result.candidates > 0 && result.anySupport && !result.populated) {
          refuse(
            `the selected problem (${result.chosen}) carries no repository, evidence or steering, though a supported problem is on the page`
          );
        }
        console.log(
          `preview-capture: progress — selected axis '${result.axisId}' (${result.axisOpen} open problem(s)), ` +
            `problem '${result.chosen}' (${result.populated ? "supported detail" : "no problem in this dataset carries support"})`
        );
      }
    }
    const markers = VIEW_MARKERS[view].map((selector) => `${PLUGIN_ROOT} ${selector}`);
    const present = await page.evaluate(
      (selectors) => selectors.map((selector) => [selector, document.querySelector(selector) !== null]),
      markers
    );
    const missing = present.filter(([, ok]) => !ok).map(([selector]) => selector);
    if (missing.length > 0) refuse(`view ${view} is missing its durable markers: ${missing.join(", ")}`);
    console.log(`preview-capture: view ${view} — markers ok (${present.length}/${markers.length})`);
    // The host wrapper is the scrolling element (overflow-auto), not window. Clicking a lower
    // problem scrolls that pane; reset it so a viewport capture starts at the page heading.
    await page.locator(PLUGIN_ROOT).evaluate((root) => { root.scrollTop = 0; });
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.scrollTop === 0,
      PLUGIN_ROOT
    );
    // Fonts settle a beat after mount; screenshot after the layout is stable rather than mid-swap.
    await page.waitForTimeout(300);
    const file = path.join(scratch, `${view}.png`);
    await page.screenshot({ path: file, clip: { height: VIEWPORT[1], width: VIEWPORT[0], x: 0, y: 0 } });
    shots.push(file);
    if (FULL) {
      const full = path.join(scratch, `${view}-full.png`);
      await page.screenshot({ fullPage: true, path: full });
      shots.push(full);
    }
  }

  mkdirSync(OUT, { recursive: true });
  for (const file of shots) renameSync(file, path.join(OUT, path.basename(file)));
  rmSync(scratch, { force: true, recursive: true });
  console.log(`preview-capture: wrote ${shots.length} screenshot(s) to ${OUT}`);
  console.log(
    JSON.stringify(
      { bundle, capturedAt: new Date().toISOString(), capturedViews: VIEWS, url: URL, viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}` },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
