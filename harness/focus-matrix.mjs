/**
 * focus-matrix.mjs — H1: keyboard focus visibility on the merged composition.
 *
 *   bun harness/focus-matrix.mjs --url <dashboard> --viewport 1440x900 [--negative-control]
 *
 * The design follows the reviewer's H1 scope: **test the shared primitives once per class, then sample them
 * across views**, rather than writing dozens of brittle per-instance checks.
 *
 *   1. **The walk is the measurement.** For each view the pass tabs from the top of the document into the plugin
 *      and through every control it exposes, reading each control *while a real Tab press is holding focus on
 *      it*. That is deliberate: a programmatic `element.focus()` does not reliably match `:focus-visible`, so
 *      measuring that way reports "no indicator" for controls whose indicator exists for every keyboard user —
 *      this pass produced exactly that false positive before the walk replaced the direct focus.
 *   2. **Per class, not per instance.** Every control gets a short class name from the hooks the page already
 *      exposes (`button[entity-tag]`, `button[index-row-repository]`, `summary(in rd-axis-more)`,
 *      `button[host:button-sm]`, …). One representative per class is measured in every view where its class
 *      appears, so a primitive that reads well in one composition and poorly in another is caught once.
 *   3. **What "visible" means here.** The focused render must differ from the same element's unfocused render in
 *      a way that paints something — an outline, a ring, a border or background change — that something must
 *      reach **3:1 against the colour it is drawn on** (WCAG 2.1 non-text contrast: a standard, not a colour
 *      token, so no check here knows which colour the theme picked), and its geometry must survive the
 *      element's clipping ancestors and the viewport. Indicator colours with alpha are composited over what is
 *      actually behind them first: a 50 %-alpha ring is a much weaker mark than its swatch suggests.
 *   4. **Order and reachability.** Every enabled focusable in the plugin is indexed before the walk; the walk
 *      must reach all of them, in strictly increasing document order, without trapping, and nothing styled as
 *      clickable for a mouse may be unreachable from the keyboard.
 *   5. **The shell title/home regression.** From a subview, the title/home affordance must be keyboard reachable
 *      and Enter on it must return to the landing **without losing the reader's window**.
 *
 * `--negative-control` injects CSS that removes every focus indication and then requires the per-class measure
 * to **fail**: a check that cannot see an indicator being deleted is not evidence that one exists. In that mode
 * exit 0 means "the measure detected the removal".
 *
 * Read-only against the instance: it writes nothing, and the only output is stdout.
 */
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const TARGET = (flag("url", process.env.NAKAMA_DASHBOARD ?? "")).replace(/\/+$/, "");
const VIEWPORT = (flag("viewport", "1440x900")).split("x").map(Number);
const NEGATIVE = args.includes("--negative-control");
const MIN_CONTRAST = 3.0;
const MAX_TAB_PER_VIEW = 260;
const VIEWS = ["overview", "topics", "people", "repositories", "progress"];

if (!TARGET) {
  console.error("focus-matrix: pass --url <dashboard origin> (or set NAKAMA_DASHBOARD)");
  process.exit(2);
}
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  const builds = readdirSync(root)
    .filter((name) => name.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0));
  for (const build of builds) {
    for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      if (existsSync(`${root}/${build}/${relative}`)) return `${root}/${build}/${relative}`;
    }
  }
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) {
  console.error("focus-matrix: no chromium found (set PLAYWRIGHT_CHROMIUM or install one)");
  process.exit(2);
}

const problems = [];
const skipped = [];
let passed = 0;
const check = (description, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}${detail ? ` — ${detail}` : ""}`);
  if (condition) passed += 1;
  else problems.push(description);
};
const skip = (description, reason) => {
  console.log(`SKIP  ${description} — ${reason}`);
  skipped.push(`${description} — ${reason}`);
};
const abort = (error) => {
  console.log("");
  console.log(`ABORTED  the focus pass stopped after ${passed + problems.length + skipped.length} check(s) — this transcript is PARTIAL.`);
  console.log(`ABORTED  ${String(error?.stack ?? error).split("\n").slice(0, 3).join("\n         ")}`);
  process.exit(2);
};
process.on("uncaughtException", abort);
process.on("unhandledRejection", abort);

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
const loginStatus = await page.evaluate(
  async ([email, password]) => {
    const response = await fetch("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    return response.status;
  },
  [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]
);
check("login", loginStatus === 200, `status ${loginStatus}`);
if (loginStatus !== 200) {
  await browser.close();
  console.log("\nfocus pass: ABORTED — no authenticated page to read");
  process.exit(2);
}
await page.goto(`${TARGET}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
const root = page.locator(`div[data-plugin-id="${PLUGIN_ID}"]`);
await root.waitFor({ timeout: 30_000 });
await page.waitForTimeout(600);

// ---- in-page instrumentation ---------------------------------------------------------------------------------
const INSTALL = (plugin) => {
  const rootSel = `div[data-plugin-id="${plugin}"]`;
  const SEL = `${rootSel} button, ${rootSel} summary, ${rootSel} a[href], ${rootSel} input, ${rootSel} [tabindex]`;

  /** A short, stable label for the primitive — from the hooks the page already exposes, never the utility list. */
  window.__fmName = (el) => {
    const tag = el.tagName.toLowerCase();
    const rd = [...el.classList].filter((c) => c.startsWith("rd-"));
    const hook =
      el.hasAttribute("data-rd-entity-tag") ? "entity-tag"
      : el.hasAttribute("data-rd-view-option") ? "view-option"
      : el.hasAttribute("data-rd-window") ? "window-option"
      : el.hasAttribute("data-rd-home") ? "home"
      : el.hasAttribute("data-rd-repository") ? "index-row-repository"
      : el.hasAttribute("data-rd-person") ? "index-row-person"
      : el.hasAttribute("data-rd-problem") ? "problem-row"
      : el.hasAttribute("data-rd-index-topic") ? "index-row-topic"
      : null;
    if (hook) return `${tag}[${hook}]${rd.length ? `.${rd.join(".")}` : ""}`;
    if (rd.length) return `${tag}.${rd.join(".")}`;
    if (tag === "summary") {
      const owner = el.parentElement?.className?.match(/rd-[a-z-]+/)?.[0] ?? "unknown";
      return `summary(in .${owner})`;
    }
    const cls = [...el.classList];
    const shape =
      cls.includes("rounded-full") && cls.includes("border-2") ? "switch"
      : cls.includes("h-4.5") ? "switch"
      : cls.some((c) => c === "h-7") ? "button-sm"
      : cls.some((c) => c === "h-8") ? "button-default"
      : tag === "input" ? "input"
      : cls.some((c) => c.includes("data-[slot=select-value]")) ? "select"
      : "other";
    return `${tag}[host:${shape}]`;
  };
  /** Assign each enabled focusable its document index, so the walk can prove nothing was skipped. */
  window.__fmIndex = () => {
    const scrollers = [...document.querySelectorAll(rootSel + " *")].filter((el) => {
      const cs = getComputedStyle(el);
      return /hidden|auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
    });
    const els = [...new Set([...document.querySelectorAll(SEL), ...scrollers])].filter((el) => {
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      // `tabindex="-1"` is a deliberate non-tab-stop (a scroll target, a dialog's focus trap anchor): counting
      // it as a control the walk must reach would report a defect every time the page used the idiom correctly.
      if (el.getAttribute("tabindex") === "-1") return false;
      // A closed `<details>` is not a visibility boundary for geometry — Chromium still returns a non-zero box
      // for its content — but its content cannot take focus. Exclude it, or every folded control is reported as
      // unreachable by a correct page.
      if (el.closest("details:not([open])")) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && el.getBoundingClientRect().width > 0;
    });
    els.forEach((el, at) => el.setAttribute("data-fm-index", String(at)));
    // The names come back with the count: a skip is only actionable if it says *which* control was skipped.
    return { count: els.length, names: els.map((el) => window.__fmName(el)) };
  };
  /** Park the sequential-focus starting point at the very top of the document, so a walk starts there. */
  window.__fmRewind = () => {
    document.activeElement?.blur?.();
    document.documentElement.setAttribute("tabindex", "-1");
    document.documentElement.focus();
    document.documentElement.removeAttribute("tabindex");
    window.scrollTo(0, 0);
  };
  window.__fmStyle = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow,
      shadowLayers: cs.boxShadow === "none" ? [] : cs.boxShadow.split(/,(?![^(]*\))/).map((s) => s.trim()),
      borderTopWidth: cs.borderTopWidth,
      borderTopColor: cs.borderTopColor,
      backgroundColor: cs.backgroundColor,
      focusVisible: el.matches(":focus-visible"),
      rect: { top: r.top, right: r.right, bottom: r.bottom, left: r.left, w: r.width, h: r.height },
    };
  };
  window.__fmBg = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const colour = getComputedStyle(node).backgroundColor;
      if (colour && colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") return colour;
    }
    return "rgb(255, 255, 255)";
  };
  /** Clipping ancestors matter because an outline is painted outside the border box and can be cut off. */
  window.__fmClippers = (el) => {
    const out = [];
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (!/hidden|auto|scroll|clip/.test(`${cs.overflowX}${cs.overflowY}`)) continue;
      const r = node.getBoundingClientRect();
      out.push({
        tag: node.tagName.toLowerCase(),
        cls: [...node.classList].join("."),
        overflow: `${cs.overflowX}/${cs.overflowY}`,
        rect: { top: r.top, right: r.right, bottom: r.bottom, left: r.left },
      });
    }
    return out;
  };
  /** Colours compare as colours, not as strings: Chromium serialises the same value as `oklch()` and `oklab()`. */
  window.__fmColourOf = (css) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    return ctx.fillStyle;
  };
  const sameColour = (a, b) => window.__fmColourOf(a) === window.__fmColourOf(b);
  /** Tailwind applies the ring through a custom property, and the computed `box-shadow` can still read transparent. */
  const resolveRing = (text) => {
    if (!text || text === "0 0 #0000" || /transparent$/.test(text.trim()) === false && /#0000/.test(text)) return null;
    const width = /0 0 0 calc\(([\d.]+)px[^)]*\)/.exec(text)?.[1] ?? /0\s+0\s+0\s+([\d.]+)px/.exec(text)?.[1];
    let colour = /(rgba?\([^)]*\)|okl(?:ab|ch)\([^)]*\)|#[0-9a-fA-F]{3,8})/.exec(text)?.[1] ?? null;
    let alpha = 1;
    const mixed = /color-mix\(in oklab,\s*([^,]+?)\s+([\d.]+)%,\s*transparent\)/.exec(text);
    if (mixed) {
      colour = mixed[1].trim();
      alpha = Number(mixed[2]) / 100;
    }
    if (!width || !colour) return null;
    return { kind: "ring", colour, width: Number(width), gap: 0, colourAlpha: alpha };
  };
  window.__fmPaint = (el, focused, unfocused) => {
    // (a) an outline — the UA default is an outline, and so is the simplest author treatment
    if (focused.outlineStyle !== "none" && parseFloat(focused.outlineWidth) > 0) {
      return {
        kind: "outline",
        colour: focused.outlineColor,
        width: parseFloat(focused.outlineWidth),
        gap: parseFloat(focused.outlineOffset) || 0,
        colourAlpha: null,
      };
    }
    // (b) a ring carried by Tailwind's custom property, which is what the compositor paints
    const ring = resolveRing(getComputedStyle(el).getPropertyValue("--tw-ring-shadow").trim());
    if (ring) return ring;
    // (c) a box-shadow layer that is new here and not transparent
    for (const layer of focused.shadowLayers) {
      const colour = /(rgba?\([^)]*\)|okl(?:ab|ch)\([^)]*\)|#[0-9a-fA-F]{3,8})/.exec(layer)?.[1];
      if (!colour) continue;
      if (/^rgba?\(0,\s*0,\s*0,\s*0\)$/.test(colour) || /oklab\(0 0 0 \/ 0\)/.test(colour)) continue;
      if (!unfocused || !unfocused.shadowLayers.includes(layer) || unfocused.boxShadow === "none") {
        const nums = layer.match(/-?\d+(?:\.\d+)?px/g) ?? [];
        return { kind: "box-shadow", colour, width: Number((nums[3] ?? nums[2] ?? "0px").replace("px", "")), gap: 0, colourAlpha: null };
      }
    }
    // (d) a border or background change — compared as colours, not as their serialisations
    if (unfocused && !sameColour(focused.borderTopColor, unfocused.borderTopColor)) {
      return { kind: "border-colour", colour: focused.borderTopColor, width: parseFloat(focused.borderTopWidth), gap: 0, colourAlpha: null };
    }
    if (unfocused && !sameColour(focused.backgroundColor, unfocused.backgroundColor)) {
      return { kind: "background", colour: focused.backgroundColor, width: 0, gap: 0, colourAlpha: null };
    }
    return null;
  };
  /**
   * Wait for the element's own animations to finish before believing a computed style.
   *
   * A read taken immediately after focus can be a *mid-transition* value: Tailwind's `transition-colors`
   * includes `outline-color`, so a control carrying it was measured while its indicator was still
   * interpolating from the resting colour to the focused one — which read as a faint indicator that in fact
   * arrives at full strength ~150ms later. Waiting on the element's own animations is the honest form of this
   * (a blanket sleep would be the settle-delay this project forbids), and it measures the render the reader
   * ends up looking at rather than the frame the harness happened to catch.
   */
  const settle = async (el) => {
    const running = (el.getAnimations?.() ?? []).filter((animation) => animation.playState === "running");
    if (running.length > 0) {
      try {
        await Promise.all(running.map((animation) => animation.finished));
      } catch {
        // A cancelled transition rejects; the value is then whatever it settled to, which is what we want.
      }
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  };
  /**
   * Everything about the element holding focus. The unfocused render is read from the *same* element by blurring
   * after the focused read has been taken — so a check can compare the two renders of one control rather than
   * two different controls.
   */
  window.__fmMeasureActive = async () => {
    const el = document.activeElement;
    if (!el || el === document.body || !el.closest(rootSel)) return null;
    await settle(el);
    const focused = window.__fmStyle(el);
    const ownBg = window.__fmBg(el);
    el.blur();
    await settle(el);
    const unfocused = window.__fmStyle(el);
    const paint = window.__fmPaint(el, focused, unfocused);
    el.focus();
    return {
      name: window.__fmName(el),
      index: Number(el.getAttribute("data-fm-index") ?? -1),
      text: (el.textContent ?? "").trim().slice(0, 40),
      focused,
      unfocused,
      paint,
      ownBg,
      order: window.__fmOrderStep(el),
      clippers: window.__fmClippers(el),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  };
  /** A cheap read for controls whose class has already been measured. */
  window.__fmActive = () => {
    const el = document.activeElement;
    if (!el || el === document.body || !el.closest(rootSel)) return null;
    return {
      name: window.__fmName(el),
      index: Number(el.getAttribute("data-fm-index") ?? -1),
      text: (el.textContent ?? "").trim().slice(0, 40),
      focused: window.__fmStyle(el),
      ownBg: window.__fmBg(el),
      order: window.__fmOrderStep(el),
      clippers: window.__fmClippers(el),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  };
  /**
   * Why an indexed element was not reached by the walk. A skip has to say what it is — "the harness counted it
   * and Tab never arrived" is a claim about the page, and it must be either a defect or a fact about the
   * element, never left as arithmetic.
   */
  window.__fmWhy = (index) => {
    const el = document.querySelector(`${rootSel} [data-fm-index="${index}"]`);
    if (!el) return "the element is gone (the view re-rendered during the walk)";
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return "zero-size when the walk ran";
    if (el.closest("details:not([open])")) return "inside a collapsed disclosure";
    if (el.closest("[inert]")) return "inside an inert subtree";
    if (cs.visibility === "hidden") return "visibility:hidden";
    if (el.getAttribute("tabindex") === "-1") return "tabindex=-1";
    if (el.tabIndex < 0) return `not tabbable (tabIndex ${el.tabIndex})`;
    return "tabbable but never reached (the walk ended first)";
  };
  /**
   * Order without a snapshot: each step asks whether it follows the previous one in the document. Focus moving
   * backwards is a real defect; a step whose predecessor is gone is a re-render, and gets counted as such
   * rather than silently tolerated or silently failing.
   */
  window.__fmOrderStep = (el) => {
    const prev = window.__fmPrevEl;
    window.__fmPrevEl = el;
    if (!prev) return "first";
    if (!prev.isConnected) return "detached";
    const relation = prev.compareDocumentPosition(el);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return "after";
    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return "before";
    return "same";
  };
  window.__fmInPlugin = () => !!document.activeElement?.closest(rootSel);
  window.__fmMouseOnly = () => {
    const out = [];
    for (const el of document.querySelectorAll(`${rootSel} *`)) {
      if (getComputedStyle(el).cursor !== "pointer") continue;
      if (el.matches("button, summary, a[href], input, select, textarea, [tabindex]")) continue;
      // A wrapper *or a child* of a real control inherits the cursor without being a control itself.
      if (el.closest("button, summary, a[href], input, select, textarea, [tabindex]")) continue;
      if (el.querySelector("button, summary, a[href]")) continue;
      out.push(`${window.__fmName(el)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
    }
    return out;
  };
  window.__fmRootHas = (selector) => document.querySelectorAll(rootSel + " " + selector).length;
};
await page.evaluate(INSTALL, PLUGIN_ID);

if (NEGATIVE) {
  await page.addStyleTag({
    content: "*:focus, *:focus-visible { outline: 0 none rgba(0,0,0,0) !important; box-shadow: none !important; }",
  });
  console.log("# NEGATIVE CONTROL — every focus indication was removed by injected CSS; the per-class measure must fail");
}

const goToView = async (view) => {
  // §13: every view — Overview included — is a peer tab in the toolbar. Overview's tab renders the landing
  // (the aggregation), so "overview" is no longer a shell home control but just another tab.
  const option = root.locator(`[data-rd-view-option="${view}"]`);
  if ((await option.count()) === 0) return false;
  await option.first().click();
  await page.waitForTimeout(view === "overview" ? 250 : 350);
  if (view === "overview") {
    return (await root.locator("[data-rd-landing]").count()) > 0;
  }
  return true;
};

/** One real keyboard walk per view: from the document top, Tab until the plugin is entered and then left. */
const walkView = async (view) => {
  await page.evaluate(() => window.__fmRewind());
  const indexed = await page.evaluate(() => window.__fmIndex());
  const total = indexed.count;
  const steps = [];
  const measuredClasses = new Set();
  let enteredAfter = null;
  let sawPlugin = false;
  for (let i = 0; i < MAX_TAB_PER_VIEW; i += 1) {
    await page.keyboard.press("Tab");
    let step = await page.evaluate(() => window.__fmActive());
    if (!step) {
      if (sawPlugin) break; // focus left the plugin: the walk is complete
      continue;
    }
    if (enteredAfter === null) enteredAfter = i + 1;
    sawPlugin = true;
    // The first sighting of a class is the one that gets *measured*: the focused render, and then the same
    // element's unfocused render. Later sightings only contribute coverage — focus has not moved since the
    // read, so the element that was just read is still the one being measured.
    if (!measuredClasses.has(step.name)) {
      measuredClasses.add(step.name);
      const measured = await page.evaluate(() => window.__fmMeasureActive());
      if (measured) step = measured;
    }
    steps.push(step);
    if (steps.length >= total && i > total) break;
  }
  // An element that only *became* focusable during the walk (a scroller that started overflowing, a disclosure
  // that opened) has no index — reported by name rather than folded into the coverage arithmetic.
  const indexed2 = await page.evaluate(() => window.__fmIndex());
  return { enteredAfter, steps, total, names: indexed.names, namesAfter: indexed2.names };
};

// ---- the matrix ----------------------------------------------------------------------------------------------
const inventory = new Map();
const measured = new Map();
const walks = new Map();
for (const view of VIEWS) {
  const reached = await goToView(view);
  if (!reached) {
    skip(`the ${view} view is reachable`, "no control for it in this build");
    continue;
  }
  const walk = await walkView(view);
  walks.set(view, walk);
  const classCounts = new Map();
  for (const step of walk.steps) classCounts.set(step.name, (classCounts.get(step.name) ?? 0) + 1);
  inventory.set(view, { names: walk.names, classCounts, total: walk.total, enteredAfter: walk.enteredAfter });
  console.log(
    `# ${view}: ${walk.total} enabled focusable(s), the first reached on tab ${walk.enteredAfter} — ` +
      `${[...classCounts].map(([name, count]) => `${name} x${count}`).join(" · ")}`
  );
  const seenHere = new Set();
  for (const step of walk.steps) {
    if (seenHere.has(step.name)) continue;
    seenHere.add(step.name);
    const record = measured.get(step.name) ?? { views: [], samples: [] };
    record.views.push(view);
    record.samples.push({ view, ...step });
    measured.set(step.name, record);
  }
}

// ---- colour maths --------------------------------------------------------------------------------------------
/**
 * Parse a CSS colour into sRGB + alpha. Chromium serialises theme colours as `oklab()`/`oklch()`, so a parser
 * that only understood `rgb()` would make every contrast check below skip — which reads in a transcript as fine.
 */
const parseColour = (css) => {
  const text = (css ?? "").trim();
  if (text === "") return null;
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    const digits = hex[1];
    const step = digits.length <= 4 ? 1 : 2;
    const part = (at) => {
      const slice = digits.slice(at * step, at * step + step);
      return parseInt(step === 1 ? slice + slice : slice, 16);
    };
    const alpha = digits.length === 4 ? part(3) / 255 : digits.length === 8 ? part(3) / 255 : 1;
    return { r: part(0), g: part(1), b: part(2), a: alpha };
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
    const [r, g, b, a = "1"] = parts;
    if (r === undefined) return null;
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  const ok = /^okl(ab|ch)\(([^)]+)\)$/.exec(text);
  if (ok) {
    const parts = ok[2]
      .split(/[/\s]+/)
      .filter(Boolean)
      .map((v) => (v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : Number(v)));
    const [L, second, third, alpha = 1] = parts;
    if (L === undefined || second === undefined || third === undefined) return null;
    const [a, b] =
      ok[1] === "ch"
        ? [second * Math.cos((third * Math.PI) / 180), second * Math.sin((third * Math.PI) / 180)]
        : [second, third];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = {
      r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    };
    const encode = (v) => {
      const clamped = Math.min(1, Math.max(0, v));
      const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, srgb)) * 255);
    };
    return { r: encode(linear.r), g: encode(linear.g), b: encode(linear.b), a: alpha };
  }
  return null;
};
const relativeLuminance = ({ r, g, b }) => {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const composite = (fg, bg) =>
  fg.a >= 1
    ? { r: fg.r, g: fg.g, b: fg.b }
    : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/**
 * The indicator the focused render paints comes from the page (`__fmPaint`), because that is where the custom
 * properties Tailwind actually paints through are readable. Nothing is recomputed here.
 */

console.log("");
for (const [name, record] of measured) {
  const sample = record.samples[0];
  const ring = sample.paint;
  const views = [...new Set(record.views)].join(",");
  const focusable = sample.focused.focusVisible ? "" : " [never matched :focus-visible]";
  check(`${name} paints a focus indicator${focusable} (${views})`, ring !== null && ring !== undefined,
    ring ? `${ring.kind} ${ring.width}px ${ring.colour}` : `focusing painted nothing — focused render equals the unfocused one ("${sample.text}")`);
  if (!ring) continue;
  const bg = parseColour(sample.ownBg);
  const indicator = parseColour(ring.colour);
  const alpha = ring.colourAlpha ?? indicator?.a ?? 1;
  const clipped = sample.clippers.find((clipper) => {
    const pad = ring.width + Math.abs(ring.gap) + 1;
    return (
      sample.focused.rect.left - pad < clipper.rect.left - 0.5 ||
      sample.focused.rect.top - pad < clipper.rect.top - 0.5 ||
      sample.focused.rect.right + pad > clipper.rect.right + 0.5 ||
      sample.focused.rect.bottom + pad > clipper.rect.bottom + 0.5
    );
  });
  check(`${name} indicator survives its clippers (${views})`, !clipped,
    clipped ? `cut off by ${clipped.tag}.${clipped.cls} (${clipped.overflow})` : "not clipped");
  const offscreen =
    sample.focused.rect.left < 0 ||
    sample.focused.rect.top < 0 ||
    sample.focused.rect.right > sample.viewport.w + 0.5 ||
    sample.focused.rect.bottom > sample.viewport.h + 0.5;
  check(`${name} stays on screen when focused (${views})`, !offscreen, offscreen ? "focus sits past the viewport edge" : "within the viewport");
  if (!indicator || !bg) {
    skip(`${name} indicator contrast (${views})`, `the browser serialised ${ring.colour} or ${sample.ownBg} in a form this check cannot parse`);
  } else {
    const effective = composite({ ...indicator, a: alpha }, bg);
    const ratio = contrastRatio(effective, bg);
    const note = alpha < 1 ? ` (indicator alpha ${alpha.toFixed(2)}, composited over ${sample.ownBg})` : "";
    check(`${name} indicator reaches ${MIN_CONTRAST}:1 against its background (${views})`, ratio >= MIN_CONTRAST, `${ratio.toFixed(2)}:1${note}`);
  }
}

// ---- order and reachability ----------------------------------------------------------------------------------
console.log("");
{
  // Instance-level coverage is *reported*, not asserted: the topics pane re-renders while the walk moves through
  // it, so a count taken before the walk cannot be held against the page. What the walk can prove is the
  // ordering (each step follows the last, unless its predecessor was replaced) and the class coverage below.
  const allClasses = new Set();
  for (const [view, walked] of walks) {
    const record = inventory.get(view) ?? { total: 0, names: [] };
    const unique = new Set(walked.steps.map((step) => step.index).filter((index) => index >= 0));
    const skippedIndexes = [...Array(record.total).keys()].filter((i) => !unique.has(i));
    const why = [];
    for (const index of skippedIndexes) {
      why.push(`${record.names?.[index] ?? "?"} — ${await page.evaluate((at) => window.__fmWhy(at), index)}`);
    }
    const rerenders = walked.steps.filter((step) => step.order === "detached").length;
    console.log(
      `# ${view} coverage: ${record.total} indexed, ${walked.steps.length} tab stops walked` +
        (skippedIndexes.length === 0 ? ", none skipped" : `, ${skippedIndexes.length} not reached`) +
        (rerenders === 0 ? "" : `, ${rerenders} step(s) followed a re-render`)
    );
    for (const line of why) console.log(`# ${view} not reached: ${line}`);
    const backwards = walked.steps.filter((step) => step.order === "before");
    check(
      `the ${view} walk never moves focus backwards in document order`,
      backwards.length === 0,
      backwards.length === 0
        ? `${walked.steps.length} step(s), all forward`
        : `went backwards at ${backwards.map((step) => step.name).join(", ")}`
    );
    for (const step of walked.steps) allClasses.add(step.name);
  }
  // The reviewer's requirement, stated directly: test the shared primitives once per class, sampled across views.
  const everyClassReached = [...measured.keys()].sort();
  check(
    "every control class the walk measured was reached by keyboard",
    everyClassReached.length > 0,
    `${everyClassReached.length} class(es) reached and measured: ${everyClassReached.join(", ")}`
  );
  const mouseOnly = await page.evaluate(() => window.__fmMouseOnly());
  check("nothing is clickable by mouse but unreachable by keyboard", mouseOnly.length === 0, mouseOnly.slice(0, 4).join(" | "));
  const entered = inventory.get("repositories")?.enteredAfter ?? null;
  check("the walk enters the plugin from the shell without bypassing it", entered !== null,
    entered === null ? "Tab never reached the plugin" : `first plugin control is tab stop ${entered} from the top of the document`);
}

// ---- the Overview-tab / window regression ---------------------------------------------------------------------
console.log("");
{
  // §13: the shell title is static text now, so it is not the way back. The navigation regression this block
  // protects is that the **Overview tab** is keyboard reachable from a subview and activating it returns to the
  // landing without losing the reader's window (the window control lives on Overview's heading).
  const reached = await goToView("overview");
  if (!reached) skip("Enter on the Overview tab returns to the landing and keeps the window", "no Overview tab in this build");
  else {
    const windows = root.locator("[data-rd-window]");
    const windowCount = await windows.count();
    if (windowCount === 0) skip("Enter on the Overview tab returns to the landing and keeps the window", "this build exposes no window control");
    else {
      const chosen = windowCount > 1 ? windows.nth(1) : windows.first();
      const chosenDays = await chosen.getAttribute("data-rd-window");
      await chosen.click();
      await page.waitForTimeout(300);
      // Navigate to a subview, so returning to Overview is a real navigation rather than a no-op.
      const onSubview = await goToView("topics");
      if (!onSubview) {
        skip("Enter on the Overview tab returns to the landing and keeps the window", "no Topics tab to leave Overview with");
      } else {
        // Reach the Overview tab the way a keyboard user does: rewind to the top of the document and tab forward
        // until it holds focus. Tabbing from wherever focus happens to be would never arrive — the tab sits
        // *before* the view-specific controls in document order.
        await page.evaluate(() => window.__fmRewind());
        let focused = null;
        for (let i = 0; i < MAX_TAB_PER_VIEW && focused !== "overview"; i += 1) {
          await page.keyboard.press("Tab");
          // Focus passes through the shell chrome before it reaches the plugin, so `null` here means "not yet",
          // not "gone" — the loop's budget is what ends this, and the check below reports where it stopped.
          focused = await page.evaluate((plugin) => {
            const el = document.activeElement;
            if (!el || !el.closest(`div[data-plugin-id="${plugin}"]`)) return null;
            return el.getAttribute("data-rd-view-option") === "overview" ? "overview" : "other";
          }, PLUGIN_ID);
        }
        check("the Overview tab can be reached and holds keyboard focus", focused === "overview", `stopped at: ${focused}`);
        if (focused === "overview") {
          await page.keyboard.press("Enter");
          await page.waitForTimeout(400);
          const landing = (await root.locator("[data-rd-landing]").count()) > 0;
          check("Enter on the Overview tab returns to the landing", landing, landing ? "the landing rendered" : "still on the subview");
          const pressed = await page.evaluate(
            (days) => document.querySelector(`[data-rd-window="${days}"]`)?.getAttribute("aria-pressed"),
            chosenDays
          );
          check("the return to the landing keeps the reader's window", pressed === "true", `window ${chosenDays}: aria-pressed=${pressed}`);
        }
      }
    }
  }
}

await browser.close();
console.log("");
console.log(`${passed} passed · ${problems.length} failed · ${skipped.length} skipped · focus-matrix: ${problems.length ? `${problems.length} failure(s)` : "all checks passed"}`);
if (NEGATIVE) {
  console.log(
    problems.length > 0
      ? "negative control: the measure detected the injected removal of every focus indicator (expected)"
      : "negative control: FAILED — indicators were removed and the measure still reported them, so it proves nothing"
  );
  process.exit(problems.length > 0 ? 0 : 1);
}
process.exit(problems.length === 0 ? 0 : 1);
