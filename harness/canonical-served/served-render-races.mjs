#!/usr/bin/env bun
/**
 * served-render-races.mjs — the immediate-render and read-race guarantees, exercised against the SERVED
 * browser (not the preview) with real request interception and **explicit release gates**.
 *
 * The preview harness (`harness/reviewer-corrections/regression.mjs`) proves these against a responder
 * seam (`window.__previewDelay`/`__previewFail`). That seam does not exist on a served page, so this
 * harness drives the same guarantees through the network layer instead: it intercepts the plugin's own
 * `list_activity` requests with Playwright `page.route`, **parks** the ones a check is about (the route is
 * held open, never a timer), and **releases** them explicitly once the check's precondition is observed.
 *
 * INDEPENDENCE (the root-cause fix): every check runs on its **own fresh browser context and page**.
 * The previous revision reset state *inside one long-lived page*, which relies on the very scope-reset
 * behaviour the mutant removes — so under the mutant the reset could not run, the `waitFor` timed out,
 * and the check was recorded as a "setup fault" relabelled as a FAIL. A check whose setup depends on the
 * code under test cannot prove whether that code is present. Here each check opens a fresh context (the
 * login session is reused from a captured storage state — the credentials are the generated isolated-env
 * pair), navigates fresh, warms its subject, and closes the context when done; **all held routes are
 * drained/closed per check**, so no retained DOM and no parked request can leak from one check to the
 * next. Setup that genuinely cannot run (a subject absent from the dataset, a login failure) is reported
 * as an **ABORT (exit 2)** — never counted as a red behaviour check.
 *
 * WHAT MAKES THIS ABLE TO GO RED (the gap earlier revisions had):
 *   - every held request is a real, parked request whose **actual input scope** (personActorId /
 *     repositoryId, offset) is recorded and asserted — not a guessed predicate and not `|| true`;
 *   - the checks assert the **feed's own rows / total / pager page**, not only the panel name — the old
 *     stale-rows defect (the previous scope's rows left under the new identity) shows B's name but A's
 *     rows, so a name-only check passed it;
 *   - the expected rows for a subject are the **exact rows of that subject's own `list_activity`
 *     response** (the public payload), not a retained render — so a mutant that never resets cannot make
 *     the oracle agree with its own stale DOM;
 *   - there are **no fixed-sleep gates and no skips**: a check that cannot find its subject is a setup
 *     ABORT, so a green verdict means every guarantee was actually exercised.
 *
 * It asserts, read-only, at the requested width:
 *   IR  immediate render — switching scope renders the new scope's panel at once with **no rows of any
 *       other scope** while that scope's read is still held open; the exact new rows/total land only on
 *       release.
 *   SR  selection race — a held read for the previous scope, released only AFTER the new scope's read has
 *       committed, must not overwrite the new scope's pane (exact rows / total / page stand).
 *   PR  page race — a held newer page request (offset 5), released only AFTER the older page (offset 0)
 *       has committed, must not overwrite it (exact offset-0 rows / page stand).
 *   SE  stale error — a held offset-5 read that FAILS, released only AFTER the offset-0 read has
 *       committed, must not raise an error over the committed content or replace it.
 *
 * Both scope kinds are exercised: a **person** (People rail, scope `personActorId`) and a **repository**
 * (Repositories rail, scope `repositoryId`). The two subjects of each kind are auto-identified from a real
 * response read-back (not hard-coded): A is the subject with a multi-page feed, B the other.
 *
 * Credentials come from the environment; the served URL from NAKAMA_DASHBOARD. Never prints credentials.
 * Exit 0 only when every check passes; exit 1 on any behaviour FAIL with all checks exercised; exit 2 on a
 * setup abort (the run established nothing about the removed guards).
 */
import { existsSync, readdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root)
    .filter((n) => n.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0))) {
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"])
      if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  }
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) {
  console.error("served-render-races: no chromium");
  process.exit(2);
}
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1280x800").split("x").map(Number);
const EMAIL = process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_DEV_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";
/** The scope key the plugin's PagedActivityFeed sends for each rail: a person is `personActorId`, a repo is `repositoryId`. */
const keyOf = (isPerson) => (isPerson ? "personActorId" : "repositoryId");
const PAGE_SIZE = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, label, ms = 12000) => {
  const t = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - t > ms) throw new Error(`waitFor timeout: ${label}`);
    await sleep(50);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The panel renders `date + summary + sourceType + " note · …"` truncated to 48 chars, so the rebuilt row
 *  is the panel row's own prefix. Compare the panel row against the rebuilt oracle at the oracle's length. */
const eqRows = (dom, exp) => dom.length === exp.length && exp.every((r, i) => dom[i].slice(0, r.length) === r);

/** The rendered row text for an activity item, rebuilt from the public payload (matches the DOM's own
 *  `date + summary + sourceType`, whitespace-collapsed and truncated the way the panel truncates it). */
const rowText = (item) =>
  `${(item.occurredAt ?? "").slice(0, 10)}${item.summary ?? ""}${item.sourceType ?? ""}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

// ── login once, capture the session storage state so each fresh context is already authenticated ─────
let loginState;
{
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  const page = await ctx.newPage();
  await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(
    async ([email, password]) => {
      const r = await fetch("/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      return r.status;
    },
    [EMAIL, PASSWORD]
  );
  if (status !== 200) {
    console.error(`served-render-races: login failed (${status})`);
    process.exit(2);
  }
  loginState = await ctx.storageState();
  await ctx.close();
}

// ── per-page interception with an explicit hold/release gate ──────────────────────────────────────────
// A held request is NOT merely parked and later `continue()`d: `route.continue` resolves as soon as the
// request is re-issued, which is BEFORE the browser has processed the response, so a fixed sleep is the
// only way to approximate "the obsolete render had its chance". Here, on hold we **`route.fetch()`** the
// response (obtaining its real body) and later **`route.fulfill({ response })`** it — the fulfil promise
// resolves once the controlled payload is actually delivered, so the release is a real completion
// rendezvous. After release the check waits for the response event AND a next-paint gate, so a
// deterministic read follows the delivered bytes instead of a guessed delay.
function makeNet(page) {
  const net = { held: [], hits: [], responses: [], holdMatcher: null };
  page.route("**/*", async (route) => {
    const req = route.request();
    if (!/\/actions\/list_activity/.test(req.url())) return route.continue();
    let input = {};
    try {
      input = JSON.parse(req.postData() ?? "{}").input ?? {};
    } catch {}
    net.hits.push(input);
    const m = net.holdMatcher;
    if (m && m(input)) {
      // Park the route: the request is held open, never a timer. The RELEASE (below) replays it against
      // the REAL server with `route.continue()`, so the obsolete response the check is about is the actual
      // network bytes the server returns for that request — not a re-synthesised payload. (Releasing by
      // `route.fulfill({ response })` from an earlier `route.fetch()` delivered NOTHING to the page — the
      // obsolete response never reached the UI, so SR/PR/SE "passed" without ever being exercised: that was
      // the async-oracle gap. `continue()` is the real completion.)
      return new Promise((resolve) => net.held.push({ input, route, resolve }));
    }
    return route.continue();
  });
  page.on("response", async (res) => {
    if (!/\/actions\/list_activity/.test(res.url())) return;
    try {
      const input = JSON.parse(res.request().postData() ?? "{}").input ?? {};
      const body = await res.json();
      const ap = body?.result?.activityPage ?? null;
      net.responses.push({
        input,
        total: ap?.total ?? null,
        items: (ap?.items ?? []).map(rowText),
        status: res.status(),
      });
    } catch {}
  });
  return net;
}
/** Drain and close every held route for a page (release is never left parked across a check boundary). */
const drainNet = async (net) => {
  net.holdMatcher = null;
  for (;;) {
    const h = net.held.shift();
    if (!h) break;
    try {
      await h.route.abort();
    } catch {}
    h.resolve();
  }
};
const pendingFor = (net, pred) => net.held.some((h) => pred(h.input));
const releaseAll = async (net, pred, { fail = false } = {}) => {
  let n = 0;
  for (;;) {
    const idx = net.held.findIndex((h) => pred(h.input));
    if (idx === -1) break;
    const [h] = net.held.splice(idx, 1);
    try {
      if (fail) await h.route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      else await h.route.continue(); // real completion: the obsolete request runs against the real server
    } catch {}
    h.resolve();
    n += 1;
  }
  return n;
};
/** Wait for the page to paint after a delivery: two animation frames cover a React commit + paint. */
const nextPaint = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))
  );
/** Deterministic settle: poll `state(page)` until two consecutive reads agree (bounded), so a read follows
 *  the delivered bytes and the browser's own commit rather than a fixed sleep. */
const settleStable = async (page, ms = 5000) => {
  const t0 = Date.now();
  let prev = null;
  for (;;) {
    const s = JSON.stringify(await state(page));
    if (prev === s && Date.now() - t0 > 400) return true;
    if (Date.now() - t0 > ms) return false;
    prev = s;
    await page.waitForTimeout(120);
  }
};

/** Open a fresh context+page (already authenticated), navigate fresh, run `fn`, then drain + close. */
async function withPage(fn) {
  const ctx = await browser.newContext({
    viewport: { width: VIEWPORT[0], height: VIEWPORT[1] },
    storageState: loginState,
  });
  const page = await ctx.newPage();
  const net = makeNet(page);
  try {
    await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
    return await fn(page, net);
  } finally {
    await drainNet(net);
    await ctx.close().catch(() => {});
  }
}

const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("div[data-plugin-id]");
    const panel = root?.querySelector("[data-rd-person-panel],[data-rd-repository-panel]");
    const name =
      panel?.getAttribute("data-rd-person-panel") ?? panel?.getAttribute("data-rd-repository-panel") ?? null;
    const ul = root?.querySelector("ul[data-rd-person-activity],ul[data-rd-repository-activity-list]");
    const totalRaw =
      ul?.getAttribute("data-rd-person-activity") ?? ul?.getAttribute("data-rd-repository-activity") ?? null;
    const shownRaw = ul?.getAttribute("data-rd-activity-shown") ?? null;
    const rows = [
      ...(root?.querySelectorAll(
        "ul[data-rd-person-activity] li[data-rd-activity-event],ul[data-rd-repository-activity-list] li[data-rd-activity-event]"
      ) ?? []),
    ].map((li) => (li.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48));
    const pager = root?.querySelector('[data-rd-pager="Activity"]');
    const cur = pager?.querySelector('.rd-pager-btn[aria-current="page"]')?.textContent?.trim() ?? null;
    const pages = [...(pager?.querySelectorAll(".rd-pager-btn") ?? [])]
      .map((b) => b.textContent.trim())
      .filter((t) => /^\d+$/.test(t));
    const body = (root?.textContent || "").toLowerCase();
    return {
      name,
      total: totalRaw === null ? null : Number(totalRaw),
      shown: shownRaw === null ? null : Number(shownRaw),
      rows,
      page: cur,
      pages,
      errorText: /error|failed|something went wrong|could not|unavailable/.test(body),
    };
  });

const kindAttrs = (kind) => {
  const isPerson = kind === "people";
  return {
    isPerson,
    attr: isPerson ? "data-rd-person-id" : "data-rd-repository-id",
    nameAttr: isPerson ? "data-rd-person" : "data-rd-repository",
    panel: isPerson ? "[data-rd-person-panel]" : "[data-rd-repository-panel]",
    key: keyOf(isPerson),
  };
};
const selectView = async (page, kind) => {
  await page.waitForSelector(`div[data-plugin-id] [data-rd-view-option="${kind}"]`, { timeout: 20000 });
  await page.locator(`div[data-plugin-id] [data-rd-view-option="${kind}"]`).first().click();
  await page.waitForSelector(`div[data-plugin-id] ${kindAttrs(kind).panel}`, { timeout: 15000 });
};
const clickEntity = (page, kind, id) => {
  const { attr } = kindAttrs(kind);
  return page.locator(`div[data-plugin-id] [${attr}="${id}"]`).first().click();
};
const clickPage = (page, label) =>
  page
    .locator(`div[data-plugin-id] [data-rd-pager="Activity"] .rd-pager-btn`, { hasText: new RegExp(`^${label}$`) })
    .first()
    .click();

// ── discovery: one fresh page per kind; read each entity's offset-0 response (the public oracle) ──────
async function discover(kind) {
  const { attr, nameAttr, key } = kindAttrs(kind);
  return withPage(async (page, net) => {
    await selectView(page, kind);
    await sleep(300);
    const entities = await page.evaluate(
      ({ attr, nameAttr }) =>
        [...document.querySelectorAll(`div[data-plugin-id] [${attr}]`)].map((n) => ({
          id: n.getAttribute(attr),
          name: n.getAttribute(nameAttr),
        })),
      { attr, nameAttr }
    );
    if (entities.length < 2) throw new Error(`${kind}: need >=2 entities (got ${entities.length})`);
    const subjects = [];
    for (let i = 0; i < entities.length; i += 1) {
      const prev = entities[i];
      const e = entities[(i + 1) % entities.length];
      net.responses.length = 0;
      net.hits.length = 0;
      await clickEntity(page, kind, prev.id); // force a selection change so e's own read is issued
      await sleep(180);
      await clickEntity(page, kind, e.id);
      await waitFor(
        () => net.responses.some((r) => (r.input.offset ?? 0) === 0 && r.input[key] !== undefined),
        `${kind}: read for ${e.name}`
      );
      const r = net.responses.filter((x) => (x.input.offset ?? 0) === 0 && x.input[key] !== undefined).pop();
      const total = r.total ?? 0;
      subjects.push({
        id: e.id,
        name: e.name,
        scopeKey: key,
        scopeValue: r.input[key],
        total,
        multiPage: total > PAGE_SIZE,
        expectedRows: r.items,
      });
    }
    const byTotal = [...subjects].sort((a, b) => b.total - a.total);
    const A = byTotal.find((s) => s.multiPage) ?? byTotal[0];
    const B = subjects.find((s) => s !== A);
    if (!A || !B) throw new Error(`${kind}: need two distinct subjects`);
    return { A, B };
  });
}

/** Warm a subject on a fresh page: establish it at its first page, tied to its own offset-0 response.
 *  Selection changes are forced unconditionally (click a different entity, then the subject), so it never
 *  relies on which entity the view auto-selects. Each read is allowed to settle before the next click, so
 *  the mutant's missing generation guard cannot let a late response overwrite the warm state. */
async function warm(page, net, kind, e) {
  const { attr } = kindAttrs(kind);
  await selectView(page, kind);
  // The view auto-selects a default entity and issues its read; let it land so the sequence is serialised.
  await waitFor(() => net.responses.length > 0, `warm: default read for ${e.name}`).catch(() => {});
  const entities = await page.evaluate(
    ({ attr }) => [...document.querySelectorAll(`div[data-plugin-id] [${attr}]`)].map((n) => n.getAttribute(attr)),
    { attr }
  );
  const other = entities.find((id) => id !== e.id);
  if (other) {
    net.responses.length = 0;
    await clickEntity(page, kind, other); // force a selection change (best-effort read)
    await waitFor(() => net.responses.length > 0, "warm: probe read").catch(() => {});
    await sleep(120);
  }
  net.responses.length = 0;
  await clickEntity(page, kind, e.id);
  await waitFor(
    () => net.responses.some((r) => r.input[e.scopeKey] === e.scopeValue && (r.input.offset ?? 0) === 0),
    `warm: offset-0 read for ${e.name}`
  );
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.name === e.name && eqRows(s.rows, e.expectedRows)) break;
    if (Date.now() - t0 > 12000)
      throw new Error(
        `warm settle ${e.name}: name=${JSON.stringify(s.name)} rows=${JSON.stringify(s.rows)} exp=${JSON.stringify(e.expectedRows)}`
      );
    await sleep(50);
  }
}

const checks = [];
const setupFaults = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const behavior = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    setupFaults.push({ name: label, fault: error.message });
    console.log(`SETUP-ABORT  ${label}  — ${error.message}`);
  }
};

/** Run the IR/SR/PR/SE block for one scope kind. Each check is its own fresh page/context. */
async function races(kind, A, B) {
  const { key } = kindAttrs(kind);
  const inScope = (e) => (i) => i[key] === e.scopeValue;
  const tag = `${kind} A=${A.name} B=${B.name}`;

  // ── IR: switch to B with B's read HELD; no other scope's rows/total/page may be visible ──
  await behavior(`IR [${tag}]`, async () => {
    await withPage(async (page, net) => {
      await warm(page, net, kind, A);
      net.holdMatcher = inScope(B);
      await clickEntity(page, kind, B.id);
      await waitFor(() => pendingFor(net, inScope(B)), `${tag} IR: B request parked`);
      const held = pendingFor(net, inScope(B));
      const irHeld = await state(page);
      check(
        `IR [${tag}] switching scope shows the new panel at once with NO rows/total/page of any other scope while its read is held`,
        irHeld.name === B.name &&
          irHeld.shown === 0 &&
          (irHeld.total === null || irHeld.total === 0) &&
          irHeld.page === null &&
          irHeld.pages.length === 0,
        `precond held=${held} name=${JSON.stringify(irHeld.name)} shown=${irHeld.shown} total=${irHeld.total} page=${JSON.stringify(irHeld.page)} pages=${JSON.stringify(irHeld.pages)}`
      );
      net.holdMatcher = null;
      await releaseAll(net, inScope(B));
      await waitFor(async () => (await state(page)).name === B.name, `${tag} IR: B rows land`);
      await waitFor(
        async () => eqRows((await state(page)).rows, B.expectedRows),
        `${tag} IR: B exact rows`
      );
      const irAfter = await state(page);
      check(
        `IR [${tag}] on release the new scope's exact rows/total render`,
        irAfter.total === B.total && irAfter.shown === B.expectedRows.length && eqRows(irAfter.rows, B.expectedRows),
        `total=${irAfter.total}(exp ${B.total}) shown=${irAfter.shown}(exp ${B.expectedRows.length}) rows=${JSON.stringify(irAfter.rows)}`
      );
    });
  });

  // ── SR: hold A's read, let B commit, THEN release A's obsolete response ──
  await behavior(`SR [${tag}]`, async () => {
    await withPage(async (page, net) => {
      await warm(page, net, kind, B);
      const bTarget = await state(page);
      net.holdMatcher = inScope(A);
      await clickEntity(page, kind, A.id);
      await waitFor(() => pendingFor(net, inScope(A)), `${tag} SR: A request parked`);
      const aHeld = pendingFor(net, inScope(A));
      await clickEntity(page, kind, B.id); // B's read is NOT held — it commits for real
      await waitFor(
        async () => {
          const s = await state(page);
          return s.name === B.name && eq(s.rows, bTarget.rows) && s.page === bTarget.page;
        },
        `${tag} SR: B committed`
      );
      net.holdMatcher = null;
      await releaseAll(net, inScope(A)); // the OBSOLETE A response lands now
      // Wait for the released (obsolete) response to ACTUALLY be delivered before reading the pane — a
      // fixed sleep would let a slow delivery read green and make the control nondeterministic.
      await waitFor(() => net.responses.some((r) => inScope(A)(r.input)), `${tag} SR: obsolete A response delivered`, 4000).catch(() => {});
      await nextPaint(page); // deterministic: the delivered bytes have been painted
      await settleStable(page); // and the pane has stopped changing
      const srAfter = await state(page);
      check(
        `SR [${tag}] a held read for the previous scope, released after the new scope committed, does not overwrite it`,
        srAfter.name === B.name &&
          srAfter.page === bTarget.page &&
          eq(srAfter.rows, bTarget.rows) &&
          srAfter.total === bTarget.total,
        `precond Aheld=${aHeld} name=${JSON.stringify(srAfter.name)} page=${JSON.stringify(srAfter.page)}(exp ${JSON.stringify(bTarget.page)}) rows=${JSON.stringify(srAfter.rows)} total=${srAfter.total}(exp ${bTarget.total})`
      );
    });
  });

  // The paged part needs A to have more than one page.
  if (!A.multiPage) {
    check(`PR [${tag}] subject A has a multi-page feed`, false, `A total ${A.total} (<=${PAGE_SIZE}) — the page-race subject is absent`);
    check(`SE [${tag}] subject A has a multi-page feed`, false, `A total ${A.total} (<=${PAGE_SIZE}) — the stale-error subject is absent`);
    return;
  }

  // ── PR: hold offset 5, page to it, page back to 0 (commits), THEN release offset 5 ──
  await behavior(`PR [${tag}]`, async () => {
    await withPage(async (page, net) => {
      await warm(page, net, kind, A);
      net.holdMatcher = (i) => inScope(A)(i) && i.offset === 5;
      await clickPage(page, "2");
      await waitFor(() => pendingFor(net, (i) => inScope(A)(i) && i.offset === 5), `${tag} PR: offset-5 request parked`);
      const o5Held = pendingFor(net, (i) => inScope(A)(i) && i.offset === 5);
      await clickPage(page, "1"); // offset 0, NOT held — commits for real
      await waitFor(
        async () => {
          const s = await state(page);
          return s.page === "1" && eqRows(s.rows, A.expectedRows);
        },
        `${tag} PR: offset-0 committed`
      );
      net.holdMatcher = null;
      await releaseAll(net, (i) => inScope(A)(i) && i.offset === 5); // the older offset-5 response is obsolete
      // Await the obsolete response ACTUALLY being processed (delivered), then POLL a BOUNDED window for its
      // rows to COMMIT — do NOT settle on quiescence, which can complete before the stale render lands and
      // make a genuine mutant look green. The released offset-5 response carries the STALE rows (the public
      // payload's own rows for that request); a correct guard must NEVER let them appear, and a mutant that
      // removed the guard must show them within the window (~125 ms observed), deterministically.
      await waitFor(() => net.responses.some((r) => inScope(A)(r.input) && (r.input.offset ?? 0) === 5), `${tag} PR: obsolete offset-5 response delivered`, 4000).catch(() => {});
      const staleRows =
        net.responses.find((r) => inScope(A)(r.input) && (r.input.offset ?? 0) === 5)?.items ?? null;
      let staleCommitted = false;
      {
        const t0 = Date.now();
        while (Date.now() - t0 < 6000) {
          const s = await state(page);
          if (staleRows !== null && eq(s.rows, staleRows)) {
            staleCommitted = true;
            break;
          }
          await sleep(50);
        }
      }
      const prAfter = await state(page);
      check(
        `PR [${tag}] a held newer page (offset 5), released after the older page (offset 0) committed, does not overwrite it`,
        !staleCommitted && prAfter.page === "1" && eqRows(prAfter.rows, A.expectedRows),
        `precond o5held=${o5Held} staleCommitted=${staleCommitted} page=${JSON.stringify(prAfter.page)} rows=${JSON.stringify(prAfter.rows)}`
      );
    });
  });

  // ── SE: hold offset 5 as a FAILURE, commit offset 0, then release the stale failure ──
  await behavior(`SE [${tag}]`, async () => {
    await withPage(async (page, net) => {
      await warm(page, net, kind, A);
      net.holdMatcher = (i) => inScope(A)(i) && i.offset === 5;
      await clickPage(page, "2");
      await waitFor(() => pendingFor(net, (i) => inScope(A)(i) && i.offset === 5), `${tag} SE: offset-5 request parked`);
      const o5Held = pendingFor(net, (i) => inScope(A)(i) && i.offset === 5);
      await clickPage(page, "1");
      await waitFor(
        async () => {
          const s = await state(page);
          return s.page === "1" && eqRows(s.rows, A.expectedRows);
        },
        `${tag} SE: offset-0 committed`
      );
      net.holdMatcher = null;
      await releaseAll(net, (i) => inScope(A)(i) && i.offset === 5, { fail: true }); // the stale failure lands now
      await waitFor(() => net.responses.some((r) => inScope(A)(r.input) && (r.input.offset ?? 0) === 5), `${tag} SE: stale failure delivered`, 4000).catch(() => {});
      await nextPaint(page);
      await settleStable(page);
      const seAfter = await state(page);
      check(
        `SE [${tag}] a held stale read that fails, released after the newer read committed, raises no error over it`,
        seAfter.page === "1" && eqRows(seAfter.rows, A.expectedRows) && !seAfter.errorText,
        `precond o5held=${o5Held} page=${JSON.stringify(seAfter.page)} rows=${JSON.stringify(seAfter.rows)} errorText=${seAfter.errorText}`
      );
    });
  });
}

const results = { viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, kinds: {} };
try {
  const people = await discover("people");
  results.kinds.people = {
    A: people.A.name,
    B: people.B.name,
    aTotal: people.A.total,
    bTotal: people.B.total,
    aPages: people.A.multiPage ? "multi" : "single",
  };
  await races("people", people.A, people.B);

  const repos = await discover("repositories");
  results.kinds.repositories = {
    A: repos.A.name,
    B: repos.B.name,
    aTotal: repos.A.total,
    bTotal: repos.B.total,
    aPages: repos.A.multiPage ? "multi" : "single",
  };
  await races("repositories", repos.A, repos.B);
} catch (error) {
  await browser.close();
  console.error(`served-render-races: setup fault — ${error.message}`);
  process.exit(2);
}
await browser.close();
results.checks = checks;
results.completedBehaviorChecks = checks.filter((c) => !/setup completes|setup fault/i.test(c.name)).length;
results.setupFaults = setupFaults;
const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify(results, null, 2));
console.log(`served-render-races: completedBehaviourChecks=${checks.length} setupFaults=${setupFaults.length}`);
if (setupFaults.length > 0) {
  console.log(`served-render-races: ABORTED (${setupFaults.length} setup fault(s) — established nothing about the guards)`);
  process.exit(2);
}
console.log(fails.length === 0 ? "served-render-races: PASS" : `served-render-races: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
