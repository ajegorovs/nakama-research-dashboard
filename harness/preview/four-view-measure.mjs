#!/usr/bin/env bun
/**
 * four-view-measure.mjs — the geometry behind what a screenshot only *shows*.
 *
 * A screenshot proves that something is clipped, mis-sized, stranded or repeating; it cannot say which
 * element owns the clipping, by how many pixels, or whether the same shape recurs across views. This
 * asks the live preview page directly, so a finding can be stated as a measurement with an owner
 * instead of an impression. Paired with `four-view-capture.mjs`: the shots are the record, these are
 * the claims behind them.
 *
 * The questions, one per class of finding:
 *   1. Which elements are their own vertical scroll container, what caps them, and how much content do
 *      they hide? — the "how many nested scrollers does one screen have" question, and the cause of a
 *      rail that shows fewer rows than it holds.
 *   2. Is a list rail uniform, or does one row's state badge make it grow? — row heights tallied
 *      *with* the row's state, so a taller row is attributed rather than guessed.
 *   3. Is the last row of a rail sliced through by its container's bottom edge?
 *   4. How do the two Progress pagers present themselves side by side — a control group, or a bare
 *      caption where a group would be?
 *   5. What does the detail's side card actually contain around its separators, and what does the
 *      Progress view say in its own words about the size of the workstream index it draws?
 *
 * READ-ONLY. Exit 2 on a fault (no chromium, the page did not mount), matching
 * `harness/canonical-served/capture-states.mjs`. It changes nothing and writes nothing:
 *
 *   bun harness/preview/four-view-measure.mjs [preview url]
 *   # default url http://127.0.0.1:<PREVIEW_PORT|3010>/preview.html
 */
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";

const URL = (process.argv[2] ?? `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 3010}/preview.html`).replace(
  /\/+$/,
  ""
);
const PLUGIN = 'div[data-plugin-id="research-dashboard"]';
const VIEWS = [
  { detail: "[data-rd-detail]", list: "[data-rd-topic-index]", row: "[data-rd-index-topic]", view: "topics" },
  {
    detail: "[data-rd-progress-detail]",
    list: "[data-rd-progress-index]",
    row: "[data-rd-index-axis]",
    view: "progress",
  },
  { detail: "[data-rd-person-panel]", list: "[data-rd-people]", row: "[data-rd-person-id]", view: "people" },
  {
    detail: "[data-rd-repository-panel]",
    list: "[data-rd-repositories]",
    row: "[data-rd-repository-id]",
    view: "repositories",
  },
];

const fault = (why) => {
  console.error(`four-view-measure: ${why}`);
  process.exit(2);
};

const launch = chromiumLaunchOptions();
if (!launch.executablePath) fault("no chromium found — set CHROMIUM_EXECUTABLE or install one");

const browser = await chromium.launch(launch);
const report = { url: URL };
try {
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  await page.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
  const mounted = await page
    .waitForSelector(`${PLUGIN} [data-rd-view-option="topics"]`, { timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) fault(`the preview did not mount on ${URL} — is it running on this port?`);

  const rail = {};
  const heights = {};
  let sideCards = null;

  for (const spec of VIEWS) {
    await page.locator(`${PLUGIN} [data-rd-view-option="${spec.view}"]`).click();
    await page.waitForSelector(`${PLUGIN} [data-rd-view="${spec.view}"]`, { timeout: 10000 });
    await page.waitForTimeout(300);

    // 1/2/3 — the list rail's own box, its row heights, and whether the last row is cut by the bottom
    //       edge. `lastRowBottom > listBottom` is a row visibly sliced through by its container.
    rail[spec.view] = await page.evaluate(
      ({ detail, list, plugin, row }) => {
        const el = (selector) => document.querySelector(`${plugin} ${selector}`);
        const box = (node) => {
          if (!node) return null;
          const style = getComputedStyle(node);
          return {
            clientHeight: node.clientHeight,
            clientWidth: node.clientWidth,
            maxHeight: style.maxHeight,
            overflowY: style.overflowY,
            scrollHeight: node.scrollHeight,
            whiteSpace: style.whiteSpace,
          };
        };
        const listEl = el(list);
        const rows = [...document.querySelectorAll(`${plugin} ${row}`)];
        const railRect = listEl?.getBoundingClientRect() ?? null;
        const lastRect = rows.at(-1)?.getBoundingClientRect() ?? null;
        return {
          detail: box(el(detail)),
          index: box(listEl),
          lastRow: railRect && lastRect
            ? {
                lastRowBottom: Math.round(lastRect.bottom),
                listBottom: Math.round(railRect.bottom),
                slicedThrough: Math.round(lastRect.bottom) > Math.round(railRect.bottom) + 1,
              }
            : null,
          rowCount: rows.length,
          wrapper: box(el("")),
        };
      },
      { detail: spec.detail, list: spec.list, plugin: PLUGIN, row: spec.row }
    );

    // 2 — row heights tallied alongside the row's own state, so "this row is taller" names why.
    heights[spec.view] = await page.evaluate(
      ({ plugin, row }) => {
        const rows = [...document.querySelectorAll(`${plugin} ${row}`)];
        const tally = new Map();
        for (const node of rows) {
          const key = `${Math.round(node.getBoundingClientRect().height)}px · ${node.getAttribute(
            `data-rd-index-state`
          )}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
        return {
          distinctHeights: [...new Set(rows.map((n) => Math.round(n.getBoundingClientRect().height)))].sort(
            (a, b) => a - b
          ),
          tallest: rows
            .map((node) => ({
              height: Math.round(node.getBoundingClientRect().height),
              state: node.getAttribute("data-rd-index-state"),
              text: node.innerText.replace(/\s+/g, " ").trim().slice(0, 60),
            }))
            .sort((a, b) => b.height - a.height)
            .slice(0, 4),
          tally: Object.fromEntries([...tally].sort()),
          uniform: new Set(rows.map((n) => Math.round(n.getBoundingClientRect().height))).size === 1,
        };
      },
      { plugin: PLUGIN, row: spec.row }
    );

    if (spec.view === "repositories") {
      // 5 — the detail's side cards, verbatim: the separator that wraps badly lives in this HTML.
      sideCards = await page.evaluate(
        (plugin) =>
          [...document.querySelectorAll(`${plugin} .rd-side-card`)].map((card) => ({
            html: card.innerHTML.replace(/\s+/g, " ").trim().slice(0, 700),
            text: card.innerText.replace(/\s+/g, " ").trim(),
          })),
        PLUGIN
      );
    }

  }

  // ── Progress-specific readings, taken with Progress mounted. These are view-specific: read after the
  //    loop above has moved to another tab they describe whichever view was opened last — an "Activity"
  //    pager belonging to a repository panel would be reported as the Progress activity pager.
  await page.locator(`${PLUGIN} [data-rd-view-option="progress"]`).click();
  await page.waitForSelector(`${PLUGIN} [data-rd-view="progress"]`, { timeout: 10000 });
  // Choose the workstream carrying the most activity and tasks — the same subject the capture tool
  // photographs, so these measurements describe the shots. "Has a plan" is not enough: the first
  // workstream with a plan can still carry no events, and then there is no pager to measure.
  const clickAxis = (id) =>
    page.evaluate(
      ({ id, plugin }) => {
        const node = [...document.querySelectorAll(`${plugin} [data-rd-index-axis]`)].find(
          (n) => n.getAttribute("data-rd-index-axis") === id
        );
        if (!node) return false;
        node.click();
        return true;
      },
      { id, plugin: PLUGIN }
    );
  const axisIds = await page.evaluate(
    (plugin) =>
      [...document.querySelectorAll(`${plugin} [data-rd-index-axis]`)].map((n) =>
        n.getAttribute("data-rd-index-axis")
      ),
    PLUGIN
  );
  let representative = null;
  for (const id of axisIds.slice(0, 14)) {
    if (!(await clickAxis(id))) continue;
    await page.waitForSelector(`${PLUGIN} [data-rd-context-panel="${id}"]`, { timeout: 6000 }).catch(() => {});
    const key = await page.evaluate((plugin) => {
      const at = (selector, attr) => {
        const el = document.querySelector(`${plugin} ${selector}`);
        return el ? Number(el.getAttribute(attr)) || 0 : 0;
      };
      return (
        at("[data-rd-progress-activity-total]", "data-rd-progress-activity-total") * 100 +
        at("[data-rd-progress-tasks]", "data-rd-progress-tasks")
      );
    }, PLUGIN);
    if (representative === null || key > representative.key) representative = { id, key };
  }
  if (representative) {
    await clickAxis(representative.id);
    await page
      .waitForSelector(`${PLUGIN} [data-rd-context-panel="${representative.id}"]`, { timeout: 8000 })
      .catch(() => {});
  }
  await page.waitForTimeout(300);
  report.progressSelection = representative?.id ?? null;

  // 1 — every vertical scroll container inside the plugin on the Progress screen, with its cap.
  report.scrollers = await page.evaluate((plugin) => {
    const found = [];
    for (const node of document.querySelectorAll(`${plugin} *`)) {
      const style = getComputedStyle(node);
      if (!/auto|scroll/.test(style.overflowY)) continue;
      found.push({
        cap: style.maxHeight === "none" ? `height ${style.height}` : `max-height ${style.maxHeight}`,
        class: String(node.className).split(/\s+/).slice(0, 3).join("."),
        clientHeight: node.clientHeight,
        hiddenPx: node.scrollHeight - node.clientHeight,
        scrollHeight: node.scrollHeight,
      });
    }
    const root = document.querySelector(plugin);
    return {
      page: root
        ? {
            clientHeight: root.clientHeight,
            hiddenPx: root.scrollHeight - root.clientHeight,
            scrollHeight: root.scrollHeight,
          }
        : null,
      pluginScrollers: found,
    };
  }, PLUGIN);

  // 4 — the two Progress pagers side by side, plus the activity feed's own clamp.
  report.progressPagers = await page.evaluate((plugin) => {
    const pager = (label) => {
      const root = document.querySelector(`${plugin} [data-rd-pager="${label}"]`);
      if (!root) return null;
      const style = getComputedStyle(root);
      return {
        buttons: [...root.querySelectorAll(".rd-pager-btn")].map((b) => b.textContent.trim()),
        html: root.innerHTML.replace(/\s+/g, " ").trim().slice(0, 500),
        justifyContent: style.justifyContent,
        multPage: root.querySelector(".rd-pager-switch") !== null,
        range: root.querySelector("[data-rd-pager-range]")?.textContent?.trim() ?? null,
        switchPresent: root.querySelector(".rd-pager-switch") !== null,
        text: root.innerText.replace(/\s+/g, " ").trim(),
      };
    };
    const feed = document.querySelector(`${plugin} .rd-progress-activity .rd-feed`);
    return {
      activity: pager("Activity"),
      activityFeedScroll: feed
        ? {
            clientHeight: feed.clientHeight,
            contentClipped: feed.scrollHeight - feed.clientHeight,
            maxHeightRule: getComputedStyle(feed).maxHeight,
            overflowY: getComputedStyle(feed).overflowY,
            scrollHeight: feed.scrollHeight,
          }
        : null,
      tasks: pager("Tasks"),
    };
  }, PLUGIN);

  // 5 — what the Progress view says in its own words about the workstream index it draws. Read off the
  //     page rather than inferred from a regex, so a claim about disclosure is the page's text.
  report.progressDisclosures = await page.evaluate((plugin) => {
    const index = document.querySelector(`${plugin} [data-rd-progress-index]`);
    return {
      headingText: document.querySelector(`${plugin} [data-rd-view-heading="progress"]`)?.innerText ?? null,
      indexAttrs: index
        ? Object.fromEntries([...index.attributes].map((a) => [a.name, a.value]))
        : null,
      noticeText: [
        ...document.querySelectorAll(
          `${plugin} [data-rd-view="progress"] li.rd-muted, ${plugin} [data-rd-view="progress"] p.rd-muted`
        ),
      ]
        .map((el) => el.innerText.trim())
        .filter(Boolean),
      rowCount: document.querySelectorAll(`${plugin} [data-rd-index-axis]`).length,
      rowTitles: [...document.querySelectorAll(`${plugin} [data-rd-index-axis]`)]
        .slice(0, 3)
        .map((el) => el.innerText.replace(/\s+/g, " ").trim()),
    };
  }, PLUGIN);

  report.railScroll = await page.evaluate((plugin) => {
    const out = {};
    for (const sel of ["[data-rd-topic-index]", "[data-rd-progress-index]", "[data-rd-people]", "[data-rd-repositories]"]) {
      const node = document.querySelector(`${plugin} ${sel}`);
      if (!node) continue;
      out[sel] = {
        clientHeight: node.clientHeight,
        difference: node.scrollHeight - node.clientHeight,
        overflowY: getComputedStyle(node).overflowY,
        scrollHeight: node.scrollHeight,
      };
    }
    return out;
  }, PLUGIN);

  report.rails = rail;
  report.rowHeights = heights;
  report.repositoriesSideCards = sideCards;
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
