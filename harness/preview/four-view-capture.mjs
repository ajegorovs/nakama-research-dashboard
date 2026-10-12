#!/usr/bin/env bun
/**
 * four-view-capture.mjs — capture the preview page's four views without a Nakama instance.
 *
 * WHY THIS EXISTS. `harness/preview/capture.mjs` cannot run against the current build: it waits for
 * `[data-rd-landing]`, an attribute `src/ui.tsx` no longer renders (the page title is
 * `[data-rd-home="current"]`), so it times out at mount and REFUSES before its view loop — and its
 * view list opens with the retired `overview` tab. `harness/fidelity/README.md` says the same of the
 * whole `harness/fidelity/` pack. That left no verified instance-free capture path for the four-view
 * product; the served path (`harness/canonical-served/capture-states.mjs`, `harness/read-pass.sh`)
 * needs a running seeded instance and credentials. This is the adaptation the preview scope note
 * asked for ("a separately verified small capture harness"), verified against `fixture` and `scale`.
 *
 * WHAT IT REUSES from `capture.mjs`, in spirit: the *selection discipline* (a subject is chosen by
 * clicking the page's own controls and scored off markers the page already renders — no id, name or
 * payload is known to this script), the active-tab assertion, the durable-marker assertion, the
 * scroller reset before a viewport capture, and the bundle hash beside the shots.
 *
 * WHAT IT CORRECTS in it. Three stale assumptions: it reads `data-rd-index-activity` (no longer
 * rendered — the Progress index carries no activity count at all, so a representative is found by
 * *loading* candidates); it mounts under the retired `overview` marker; and its second pass over the
 * views takes the DEFAULT first row in People and Repositories, because a view's own selection is
 * component-local state that resets when its tab unmounts — so here each tall detail frame is shot
 * immediately after its representative is chosen.
 *
 * WHAT IT IS NOT. Not the served page: it mounts the same bundle through a different entry, light
 * theme, writes refused by the preview host. Judge composition, density and styling here; take the
 * served record with the acceptance pass. It measures the *preview build*, so it is not a
 * production-readiness signal.
 *
 * FAILURE POLICY. A state the dataset cannot show is RECORDED as unreachable with its reason — never
 * fabricated, never fatal. A *structural* failure (the page did not mount, a tab did not become
 * active, a view container or the selected detail is missing) is fatal: a photograph taken under a
 * wrong label is worse than no photograph.
 *
 *   # 1. serve one dataset (one at a time — a single shared fixtures.json)
 *   bun harness/preview/run.mjs --dataset fixture --port 3011
 *   # 2. capture, in a second shell
 *   bun harness/preview/four-view-capture.mjs --dataset fixture \
 *     --url http://127.0.0.1:3011/preview.html --out .hermes/scratch/ui-baseline/fixture
 *
 * Default `--out` is under the git-ignored `.hermes/scratch/`: these are working shots, and AGENTS.md
 * keeps generated captures out of the tree. The committed packs belong to the served pass.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";

const REPO = path.resolve(import.meta.dir, "../..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const URL = flag("url", `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 3010}/preview.html`).replace(/\/+$/, "");
const DATASET = flag("dataset", "unknown");
if (args.includes("--help")) {
  console.log(
    "four-view-capture.mjs [--url <preview url>] [--dataset <name>] [--out <dir>]\n" +
      "  --url      the running preview (default http://127.0.0.1:<PREVIEW_PORT|3010>/preview.html)\n" +
      "  --dataset  the dataset being served; provenance only (default: unknown)\n" +
      "  --out      where the shots and capture-report.json land\n" +
      "             (default .hermes/scratch/ui-baseline/<dataset>, which is git-ignored)"
  );
  process.exit(0);
}
const OUT = path.resolve(REPO, flag("out", `.hermes/scratch/ui-baseline/${DATASET}`));
const VIEWPORTS = [
  { h: 900, w: 1440 },
  { h: 800, w: 1280 },
];
/** Taller than any viewport: the wrapper is h-screen + inner overflow-auto, so height is how the
 *  rest of a detail stack is reached at the same width (wrapping is a function of width only). */
const TALL = 2600;
const VIEWS = ["topics", "progress", "people", "repositories"];
const PLUGIN = 'div[data-plugin-id="research-dashboard"]';
const SETTLE = 350;

const shots = [];
const unreachable = [];
const notes = [];
const state = {};

const refuse = (why) => {
  console.error(`four-view-capture: REFUSED — ${why}`);
  process.exit(3);
};
const record = (why) => unreachable.push(why);

/** Click the element in `selector` whose `attr` equals `value`, without CSS-escaping the value. */
async function clickByAttr(page, selector, attr, value) {
  const index = await page.evaluate(
    ({ attr, selector, value }) =>
      [...document.querySelectorAll(selector)].findIndex(
        (node) => node.getAttribute(attr) === value
      ),
    { attr, selector, value }
  );
  if (index < 0) return false;
  await page.locator(selector).nth(index).click();
  return true;
}

/** Every `attr` of every element matching `selector`, as objects. */
const readAttrs = (page, selector, attrs) =>
  page.evaluate(
    ({ attrs, selector }) =>
      [...document.querySelectorAll(selector)].map((node) =>
        Object.fromEntries(attrs.map((a) => [a, node.getAttribute(a)]))
      ),
    { attrs, selector }
  );

const waitFor = (page, selector, timeout = 15000) =>
  page
    .waitForSelector(selector, { timeout })
    .then(() => true)
    .catch(() => false);

/** The host wrapper is the scroller; reset it so a capture starts at the page heading. */
async function resetScroll(page) {
  await page.locator(PLUGIN).evaluate((root) => {
    root.scrollTop = 0;
  });
  await page
    .waitForFunction((selector) => document.querySelector(selector)?.scrollTop === 0, PLUGIN)
    .catch(() => {});
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready ?? null).catch(() => {});
  await page.waitForTimeout(SETTLE);
}

/**
 * The Recent-activity list now lives inside a native `<details data-rd-progress-activity>` that is
 * collapsed by default, so its pager controls are not actionable until the fold is opened. Open it with a
 * real click on its own summary — and never toggle a fold that is already open (a second capture pass must
 * not close it).
 */
async function openProgressActivity(page) {
  const details = page.locator(`${PLUGIN} [data-rd-progress-activity]`).first();
  if ((await details.count()) === 0) return false;
  if ((await details.evaluate((el) => el.open === true)) === false) {
    await details.locator("summary").first().click();
    await page.waitForTimeout(200);
  }
  return true;
}

/**
 * Horizontal-overflow probe: every element inside the plugin whose content is wider than its own
 * box, plus the page-level and wrapper-level readings. Eyeballing a screenshot finds clipped text;
 * this names the element that overflows and by how much.
 */
const overflowProbe = (page) =>
  page.evaluate((plugin) => {
    const label = (el) => {
      const attrs = [...el.attributes]
        .filter((a) => a.name.startsWith("data-rd-"))
        .map((a) => `[${a.name}="${a.value.slice(0, 48)}"]`)
        .join("");
      return `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(/\s+/).slice(0, 3).join(".")}` : ""}${attrs}`;
    };
    const offenders = [];
    const benign = [];
    for (const el of document.querySelectorAll(`${plugin} *`)) {
      if (el.offsetParent === null && el.getClientRects().length === 0) continue;
      const over = el.scrollWidth - el.clientWidth;
      if (over > 1 && el.clientWidth > 0) {
        const style = getComputedStyle(el);
        // A single-line ellipsis clamp is *designed* to hide overflow behind a `title`; it is not a
        // defect. Only report it separately so an intentional truncation is never read as breakage.
        const clamped = style.textOverflow === "ellipsis" || style.whiteSpace === "nowrap";
        const entry = {
          clamped,
          clientWidth: el.clientWidth,
          label: label(el),
          over,
          scrollWidth: el.scrollWidth,
          text: (el.textContent ?? "").trim().slice(0, 70),
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
        };
        (clamped ? benign : offenders).push(entry);
      }
    }
    offenders.sort((a, b) => b.over - a.over);
    benign.sort((a, b) => b.over - a.over);
    const root = document.querySelector(plugin);
    return {
      benignClamps: benign.slice(0, 6),
      benignClampCount: benign.length,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      offenders: offenders.slice(0, 12),
      offenderCount: offenders.length,
      wrapperOverflow: root ? root.scrollWidth - root.clientWidth : null,
    };
  }, PLUGIN);

async function shoot(page, name, height, notesFor = null) {
  const width = page.viewportSize().width;
  await page.setViewportSize({ height, width });
  await resetScroll(page);
  await settle(page);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ clip: { height, width, x: 0, y: 0 }, path: file });
  shots.push({ file: path.relative(REPO, file), name, notes: notesFor, viewport: `${width}x${height}` });
  console.log(`four-view-capture: wrote ${path.basename(file)} (${width}x${height})`);
}

/** Open a view, verify it really became the active tab, and return whether its container rendered. */
async function openView(page, view) {
  const control = page.locator(`${PLUGIN} [data-rd-view-option="${view}"]`);
  if ((await control.count()) === 0) refuse(`no control for view '${view}'`);
  await control.first().click();
  const active = await page
    .waitForFunction(
      ({ root, wanted }) =>
        document.querySelector(`${root} [data-rd-view-option="${wanted}"]`)?.getAttribute(
          "aria-pressed"
        ) === "true",
      { root: PLUGIN, wanted: view },
      { timeout: 10000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!active) refuse(`view '${view}' never became the active tab (aria-pressed)`);
  const rendered = await waitFor(page, `${PLUGIN} [data-rd-view="${view}"]`, 10000);
  if (!rendered) refuse(`view '${view}' never rendered [data-rd-view="${view}"]`);
}

/** Click index rows one at a time and keep the one whose detail scores highest. Capped: `scale` has
 *  62 workstreams and the score is only used to pick a representative, not to rank the dataset. */
async function pickRepresentative(page, { cap = 14, rows, score }) {
  const count = await page.locator(rows).count();
  let best = null;
  const tried = Math.min(count, cap);
  for (let index = 0; index < tried; index += 1) {
    await page.locator(rows).nth(index).click();
    await page.waitForTimeout(120);
    const value = await score(page);
    if (best === null || value.key > best.key) best = { index, key: value.key, label: value.label };
  }
  if (best !== null) await page.locator(rows).nth(best.index).click();
  return { best, candidates: count, tried };
}

async function main() {
  const answer = await fetch(URL, { headers: { accept: "text/html" } }).catch((error) =>
    refuse(`the preview URL did not answer (${error.message}) — is the preview running?`)
  );
  if (!answer.ok) refuse(`${URL} answered HTTP ${answer.status}`);

  const bundlePath = path.join(REPO, "ui", "app.js");
  if (!existsSync(bundlePath)) refuse(`no built bundle at ${bundlePath}`);
  const bundleBytes = readFileSync(bundlePath);
  const bundle = {
    bytes: bundleBytes.length,
    sha256: createHash("sha256").update(bundleBytes).digest("hex"),
  };
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: REPO }).stdout.toString().trim();

  mkdirSync(OUT, { recursive: true });
  console.log(`four-view-capture: url ${URL}`);
  console.log(`four-view-capture: dataset '${DATASET}' · commit ${commit.slice(0, 7)} · bundle ${bundle.sha256}`);
  console.log(`four-view-capture: browser ${chromiumLaunchOptions().executablePath ?? "(playwright default)"}`);

  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { height: viewport.h, width: viewport.w } });
      await page.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
      if (!(await waitFor(page, `${PLUGIN} [data-rd-view-option="topics"]`, 25000))) {
        const body = await page.evaluate(() => document.body.innerText.slice(0, 160));
        refuse(`the preview did not mount on ${URL} — body starts: ${body}`);
      }

      // ── Projects: the project whose index row advertises the most current workstreams ──────────
      await openView(page, "topics");
      const projects = await pickRepresentative(page, {
        rows: `${PLUGIN} [data-rd-index-topic]`,
        score: async (p) => {
          const current = await readAttrs(p, `${PLUGIN} [data-rd-index-current]`, ["data-rd-index-current"]);
          const value = Number(current[0]?.["data-rd-index-current"] ?? 0) || 0;
          return { key: value, label: `${value} current workstream(s)` };
        },
      });
      const topicName = await page
        .locator(`${PLUGIN} [data-rd-index-topic]`)
        .nth(projects.best?.index ?? 0)
        .getAttribute("data-rd-index-topic");
      const topicLoaded = await waitFor(page, `${PLUGIN} [data-rd-detail="${topicName}"]`, 5000);
      if (!topicLoaded) refuse(`the selected project '${topicName}' never rendered its detail`);
      await shoot(page, `projects-${viewport.w}x${viewport.h}`, viewport.h, {
        selection: topicName,
        ...(await overflowProbe(page)),
      });
      if (viewport.w === 1440) {
        await shoot(page, "projects-detail-tall-1440", TALL, { selection: topicName });
      }

      // ── Progress: the workstream carrying the most recorded activity ───────────────────────────
      await openView(page, "progress");
      const axisRows = await readAttrs(page, `${PLUGIN} [data-rd-progress-index] [data-rd-index-axis]`, [
        "data-rd-index-axis",
        "data-rd-index-open-problems",
        "data-rd-index-problems",
        "data-rd-index-recency",
        "data-rd-index-state",
      ]);
      state.axisRows = axisRows.length;
      state.axisStates = axisRows.reduce((acc, row) => {
        acc[row["data-rd-index-state"]] = (acc[row["data-rd-index-state"]] ?? 0) + 1;
        return acc;
      }, {});
      state.maxIndexProblems = axisRows.reduce(
        (max, row) => Math.max(max, Number(row["data-rd-index-problems"] ?? 0) || 0),
        0
      );
      // Does the page disclose that the workstream index is capped? `MAX_ROLLUP_LIMIT` is 50 and the
      // `scale` dataset declares 62 workstreams, so the reader sees fewer rows than the dataset holds.
      state.indexDisclosure = await page.evaluate((plugin) => {
        const root = document.querySelector(`${plugin} [data-rd-view="progress"]`);
        const text = root?.innerText ?? "";
        return {
          mentionsCap: /truncat|showing|first \d+|of \d+ workstream/i.test(text),
          renderedRows: document.querySelectorAll(`${plugin} [data-rd-index-axis]`).length,
        };
      }, PLUGIN);
      // The index row does NOT carry an activity count (the legacy `data-rd-index-activity` this
      // harness first assumed no longer exists). The only honest source for "how much activity does
      // this workstream have" is the selected workstream's own `data-rd-progress-activity-total`, so
      // candidates are scored by *loading* them — clicking the page's own rows, as a reader would.
      const candidates = axisRows.slice(0, 14);
      let chosen = null;
      for (const row of candidates) {
        const id = row["data-rd-index-axis"];
        if (!(await clickByAttr(page, `${PLUGIN} [data-rd-index-axis]`, "data-rd-index-axis", id))) continue;
        if (!(await waitFor(page, `${PLUGIN} [data-rd-context-panel="${id}"]`, 6000))) continue;
        const loaded = await readProgressState(page);
        const key = (loaded.activityTotal ?? 0) * 100 + (loaded.taskTotal ?? 0);
        if (chosen === null || key > chosen.key) chosen = { id, key, loaded };
      }
      state.progressCandidatesScanned = candidates.length;
      if (chosen === null) {
        record("progress: no workstream row could be selected, so no workstream could be captured");
      } else {
        await clickByAttr(page, `${PLUGIN} [data-rd-index-axis]`, "data-rd-index-axis", chosen.id);
        await waitFor(page, `${PLUGIN} [data-rd-context-panel="${chosen.id}"]`, 8000);
        state.progress = await readProgressState(page);
        await shoot(page, `progress-${viewport.w}x${viewport.h}`, viewport.h, {
          selection: chosen.id,
          ...(await overflowProbe(page)),
        });
        if (viewport.w === 1440) {
          await shoot(page, "progress-detail-tall-1440", TALL, {
            selection: chosen.id,
            taskTotal: state.progress.taskTotal,
            activityTotal: state.progress.activityTotal,
            ...(await overflowProbe(page)),
          });
        }
      }

      // ── People: the person whose detail draws the most work ───────────────────────────────────
      await openView(page, "people");
      await pickRepresentative(page, {
        cap: 10,
        rows: `${PLUGIN} [data-rd-person-id]`,
        score: async (p) => {
          const text = await p.locator(`${PLUGIN} [data-rd-person-panel]`).first().innerText().catch(() => "");
          return { key: text.length, label: `${text.length} chars of detail` };
        },
      });
      const personName = await page
        .locator(`${PLUGIN} [data-rd-person-panel]`)
        .first()
        .getAttribute("data-rd-person-panel")
        .catch(() => null);
      if (!personName) record("people: no person detail rendered, so no person could be selected");
      await shoot(page, `people-${viewport.w}x${viewport.h}`, viewport.h, {
        selection: personName,
        ...(await overflowProbe(page)),
      });
      if (viewport.w === 1440) {
        // Photographed immediately, while the representative selection is still on screen: the view's
        // own selection is local state that resets when its tab unmounts, so a second pass over the
        // views would photograph the DEFAULT first row under the representative's name.
        await shoot(page, "people-detail-tall-1440", TALL, {
          selection: await page
            .locator(`${PLUGIN} [data-rd-person-panel]`)
            .first()
            .getAttribute("data-rd-person-panel")
            .catch(() => null),
        });
      }

      // ── Repositories: the repository whose detail draws the most work ─────────────────────────
      await openView(page, "repositories");
      await pickRepresentative(page, {
        rows: `${PLUGIN} [data-rd-repositories] [data-rd-repository-id]`,
        score: async (p) => {
          const markers = await readAttrs(p, `${PLUGIN} [data-rd-repository-panel]`, [
            "data-rd-repository-panel",
          ]);
          const counts = await p.evaluate((plugin) => {
            const at = (name) => {
              const el = document.querySelector(`${plugin} [${name}]`);
              return el ? Number(el.getAttribute(name)) || 0 : 0;
            };
            return [
              at("data-rd-repository-current"),
              at("data-rd-repository-axes"),
              at("data-rd-repository-activity"),
              at("data-rd-repository-topics"),
            ];
          }, PLUGIN);
          return { key: counts[0] * 1000 + counts[1] * 100 + counts[2] * 10 + counts[3], label: markers[0]?.["data-rd-repository-panel"] ?? "?" };
        },
      });
      const repoName = await page
        .locator(`${PLUGIN} [data-rd-repository-panel]`)
        .first()
        .getAttribute("data-rd-repository-panel")
        .catch(() => null);
      if (!repoName) record("repositories: no repository detail rendered");
      await shoot(page, `repositories-${viewport.w}x${viewport.h}`, viewport.h, {
        selection: repoName,
        ...(await overflowProbe(page)),
      });
      if (viewport.w === 1440) {
        await shoot(page, "repositories-detail-tall-1440", TALL, {
          selection: await page
            .locator(`${PLUGIN} [data-rd-repository-panel]`)
            .first()
            .getAttribute("data-rd-repository-panel")
            .catch(() => null),
        });
      }

      if (viewport.w === 1440) {
        // ── Progress state extras, at 1440 only ─────────────────────────────────────────────────
        await openView(page, "progress");
        const extras = await progressExtras(page);
        state.progressExtras = extras;
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    bundle,
    capturedAt: new Date().toISOString(),
    commit,
    dataset: DATASET,
    shots,
    state,
    unreachable,
    url: URL,
    views: VIEWS,
    viewports: VIEWPORTS.map((v) => `${v.w}x${v.h}`),
  };
  writeFileSync(path.join(OUT, "capture-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\ncapture: ${shots.length} screenshot(s) → ${path.relative(REPO, OUT)}`);
  if (unreachable.length > 0) {
    console.log(`four-view-capture: ${unreachable.length} unreachable state(s):`);
    for (const item of unreachable) console.log(`  - ${item}`);
  }
  console.log(JSON.stringify({ bundle, commit, dataset: DATASET, shots: shots.length, state }, null, 2));
}

/** The selected workstream's own counts and both pagers' ranges — the evidence for pager visibility. */
async function readProgressState(page) {
  return page.evaluate((plugin) => {
    const num = (selector, attr) => {
      const el = document.querySelector(`${plugin} ${selector}`);
      return el ? Number(el.getAttribute(attr)) || 0 : null;
    };
    const text = (selector) => document.querySelector(`${plugin} ${selector}`)?.textContent?.trim() ?? null;
    const pager = (label) => {
      const root = document.querySelector(`${plugin} [data-rd-pager="${label}"]`);
      if (!root) return null;
      return {
        buttons: root.querySelectorAll(".rd-pager-btn").length,
        multPage: root.querySelector(".rd-pager-switch") !== null,
        range: root.querySelector("[data-rd-pager-range]")?.getAttribute("data-rd-pager-range") ?? null,
        text: root.querySelector("[data-rd-pager-range]")?.textContent?.trim() ?? null,
      };
    };
    // The evidence is now a native `<details>` (collapsed by default) OUTSIDE the context panel; its body —
    // including the explicit no-evidence sentence when there is none — is hidden while the fold is closed.
    // Read `textContent` (which includes hidden descendants), never `innerText` (which would be empty).
    const evidenceDetails = document.querySelector(`${plugin} [data-rd-axis-evidence]`);
    return {
      activityPager: pager("Activity"),
      activityTotal: num("[data-rd-progress-activity-total]", "data-rd-progress-activity-total"),
      blocker: text("[data-rd-axis-blocker]"),
      evidence: evidenceDetails ? (evidenceDetails.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160) : null,
      evidenceSummary: evidenceDetails?.querySelector("summary")?.textContent?.trim() ?? null,
      hasEvidence: evidenceDetails?.getAttribute("data-rd-has-evidence") ?? null,
      feedEmpty: document.querySelector(`${plugin} [data-rd-progress-feed-empty]`) !== null,
      // The plan count is read off the SCOPED plan's own step marker (`data-rd-scoped-plan-step`,
      // rendered by `ScopedPlan`); the retired `data-rd-plan-step-shown` no longer exists.
      planSteps: document.querySelectorAll(`${plugin} [data-rd-scoped-plan-step]`).length,
      state: document.querySelector(`${plugin} [data-rd-index-axis][aria-pressed="true"]`)?.getAttribute("data-rd-index-state") ?? null,
      taskCards: document.querySelectorAll(`${plugin} [data-rd-task-card]`).length,
      tasksEmpty: document.querySelector(`${plugin} [data-rd-progress-tasks-empty]`) !== null,
      taskTotal: num("[data-rd-progress-tasks]", "data-rd-progress-tasks"),
      tasksPager: pager("Tasks"),
      title: text("[data-rd-progress-detail-title]"),
    };
  }, PLUGIN);
}

/**
 * The Progress states the handoff names beyond the populated workstream: a multi-page activity pager
 * (with the task pager visible beside it, so the two independent pagers read as independent), a
 * blocked workstream with its blocker sentence, and a workstream with nothing behind it.
 */
async function progressExtras(page) {
  const out = {};
  const axisRows = await readAttrs(page, `${PLUGIN} [data-rd-progress-index] [data-rd-index-axis]`, [
    "data-rd-index-activity",
    "data-rd-index-axis",
    "data-rd-index-problems",
    "data-rd-index-state",
  ]);

  // 1. Activity pager on its second page.
  const activity = state.progress?.activityPager;
  if (activity?.multPage) {
    // The pager sits inside the collapsed activity disclosure; open it (a real click on its summary)
    // before the Next control is reachable.
    await openProgressActivity(page);
    const next = page.locator(`${PLUGIN} [data-rd-pager="Activity"] .rd-pager-btn`, { hasText: "Next" });
    if ((await next.count()) > 0) {
      await next.first().click();
      await page.waitForTimeout(300);
      out.activityPage2 = await readProgressState(page);
      await shoot(page, "progress-activity-page2-1440", 1500, {
        note: "Activity pager on page 2; the Tasks pager beside it is unchanged (independent paging)",
      });
    } else {
      record("progress: the activity pager reported more than one page but drew no Next control");
    }
  } else {
    record(
      `progress: the activity pager reached one page only (${activity?.text ?? "no pager"}); ` +
        "the multi-page state needs more than five recorded events on one workstream"
    );
  }

  // 2. Blocked workstream.
  const blocked = axisRows.find((row) => row["data-rd-index-state"] === "blocked");
  if (blocked) {
    await clickByAttr(page, `${PLUGIN} [data-rd-index-axis]`, "data-rd-index-axis", blocked["data-rd-index-axis"]);
    await waitFor(page, `${PLUGIN} [data-rd-context-panel="${blocked["data-rd-index-axis"]}"]`, 8000);
    out.blocked = await readProgressState(page);
    await shoot(page, "progress-blocked-1440", 1500, { selection: blocked["data-rd-index-axis"] });
  } else {
    record("progress: no workstream carries state 'blocked' in this dataset");
  }

  // 3. Workstream with nothing behind it: both the task list and the activity feed empty. The index
  //    advertises the task count (`data-rd-index-problems`) but carries NO activity count at all, so
  //    the candidate has to be loaded and read — an index-only predicate accepts a workstream that
  //    still has recorded events (which it did, on the first run).
  const emptyCandidates = axisRows
    .filter((row) => (Number(row["data-rd-index-problems"] ?? 0) || 0) === 0)
    .slice(0, 20);
  let empty = null;
  for (const row of emptyCandidates) {
    const id = row["data-rd-index-axis"];
    if (!(await clickByAttr(page, `${PLUGIN} [data-rd-index-axis]`, "data-rd-index-axis", id))) continue;
    if (!(await waitFor(page, `${PLUGIN} [data-rd-context-panel="${id}"]`, 6000))) continue;
    const loaded = await readProgressState(page);
    if ((loaded.taskTotal ?? 0) === 0 && (loaded.activityTotal ?? 0) === 0) {
      empty = { id, loaded };
      break;
    }
  }
  if (empty) {
    out.empty = empty.loaded;
    await shoot(page, "progress-empty-1440", 1500, { selection: empty.id });
  } else {
    record(
      `progress: no workstream has BOTH zero tasks and zero recorded events — ${emptyCandidates.length} ` +
        "zero-task candidate(s) were loaded and each still carried activity"
    );
  }

  // The ceiling on any workstream's task list, recorded so the pager boundary is a measurement.
  out.maxIndexProblems = axisRows.reduce(
    (max, row) => Math.max(max, Number(row["data-rd-index-problems"] ?? 0) || 0),
    0
  );
  return out;
}

await main();
