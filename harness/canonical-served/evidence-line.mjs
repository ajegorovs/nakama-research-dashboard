#!/usr/bin/env bun
/**
 * evidence-line.mjs — the served READ-ONLY probe for requirements #17 and #18, on the current surface.
 *
 * Requirement #17 asked that "every axis carries an evidence line, in words"; the four-tab pivot moved
 * that line off the retired compact Projects card and onto the **Progress view's workstream context
 * panel**. Requirement #18 asked that "an axis with no evidence says so and shows no confirmed claim".
 * This probe asserts both, read-only, on the served page, against the projection's OWN recorded evidence:
 *
 *   1. an EVIDENCE-BEARING workstream renders the evidence line with the projection's own record count and
 *      the projection's own labels — not a count invented from activity, progress or state confidence;
 *   2. a workstream that STATED A READING but recorded NO evidence says so in words ("no evidence on
 *      record") while its reading is still present — evidence-absence is asserted independently of the
 *      no-progress condition (a separate workstream covers that); and
 *   3. an evidence-free workstream shows NO `confirmed` confidence badge — the invariants the store's
 *      `assertClaimsAreBacked` rule enforces (a `confirmed` claim may only be persisted with evidence).
 *
 * `--negative-control` blanks the evidence line in the DOM and REQUIRES the #17 assertion to go red — a
 * suite that cannot see a removed evidence line proves nothing by passing.
 *
 * REGRESSION (default-confirmed, no evidence): an axis that names NO state keeps the column's own
 * `confirmed` default with no evidence (the rule refuses an ASSERTED confirmed claim, not the unasserted
 * default), so the evidence line says "no evidence on record — a 'confirmed' reading needs evidence" and
 * the state badge still reads `confirmed`, with no downgrade. The probe asserts this against the public
 * seed's own subject, so the evidence-free checks are NOT a blanket "an evidence-free axis shows no
 * confirmed badge" (that blanket would be false).
 *
 * The target organization is supplied EXPLICITLY (`--org-id` / `--org-name`, or `NAKAMA_ORG_ID` /
 * `NAKAMA_ORG_NAME`), resolved EXACTLY against `/v1/auth/orgs` with the shared resolver (never `orgs[0]`),
 * and the session's active org is set by `POST /v1/auth/active-org` and read back (`activeOrgId`).
 *
 *   NAKAMA_ORG_ID=<id> NAKAMA_VIEWPORT=1440x900 bun harness/canonical-served/evidence-line.mjs
 *   NAKAMA_ORG_ID=<id> NAKAMA_VIEWPORT=1280x800 bun harness/canonical-served/evidence-line.mjs --negative-control
 *
 * Read-only: only `get_overview` / `get_progress` / `get_topic` reads. Exit 0 when every check passes
 * (and the negative control goes red when asked); exit 1 on a failed assertion; exit 2 on a fault.
 */
import { existsSync, readdirSync } from "node:fs";

import { parseOrgSelector, selectOrgId } from "../org-selection.mjs";

const NAIVE = process.argv.includes("--negative-control");
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root)
    .filter((n) => n.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0)))
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"])
      if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) { console.error("evidence-line: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
// The target organization is named explicitly (never `orgs[0]`): a flag wins over its env variable.
const SELECTOR = parseOrgSelector();
if (!SELECTOR.orgId && !SELECTOR.orgName) {
  console.error("evidence-line: name the target organization explicitly with --org-id (or --org-name, or NAKAMA_ORG_ID / NAKAMA_ORG_NAME); refusing to guess");
  process.exit(2);
}
// Optional: capture the native Progress panels to `--shots <dir>` (or NAKAMA_SHOT_DIR). Screenshots go
// where the caller says — never into the public repo unless the caller points them there.
const shotsArg = process.argv.indexOf("--shots");
const SHOT_DIR = shotsArg !== -1 ? process.argv[shotsArg + 1] : process.env.NAKAMA_SHOT_DIR ?? "";
const shoot = async (name) => {
  if (!SHOT_DIR) return;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}-${VIEWPORT[0]}x${VIEWPORT[1]}.png`, fullPage: true });
};
const READ_SET = new Set(["get_overview", "get_progress", "get_topic", "list_activity", "list_topics"]);
const actionCalls = [];
const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
page.on("request", (req) => { const m = req.url().match(/\/actions\/([^/?]+)/); if (m) actionCalls.push(m[1]); });
await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
const status = await page.evaluate(
  async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status,
  [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]
);
if (status !== 200) { console.error(`evidence-line: login failed (${status})`); process.exit(2); }
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });

// Resolve the target organization EXACTLY (the shared resolver refuses a foreign/ambiguous selector), then
// select it as the session's active org and read the host's own echo back — the supported browser contract.
const orgList = await page.evaluate(async () => (await fetch("/v1/auth/orgs", { credentials: "include" })).json());
const selection = selectOrgId(orgList?.orgs, SELECTOR);
if (!selection.ok) { console.error(`evidence-line: ${selection.message}`); process.exit(2); }
const TARGET_ORG = selection.id;
const switched = await page.evaluate(async (orgId) => {
  const cookie = (n) => document.cookie.split("; ").find((e) => e.startsWith(`${n}=`))?.slice(n.length + 1) ?? "";
  const res = await fetch("/v1/auth/active-org", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-csrf-token": cookie("nakama_csrf") }, body: JSON.stringify({ orgId }) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, activeOrgId: body.activeOrgId ?? null };
}, TARGET_ORG);
if (switched.status !== 200 || switched.activeOrgId !== TARGET_ORG) {
  console.error(`evidence-line: active-org switch did not confirm the target (HTTP ${switched.status}, activeOrgId ${JSON.stringify(switched.activeOrgId)} vs ${JSON.stringify(TARGET_ORG)})`);
  process.exit(2);
}
console.log(`evidence-line: target organization ${TARGET_ORG} (matched by ${selection.matchedBy}); session active org confirmed ${switched.activeOrgId}`);

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writes = () => actionCalls.filter((k) => !READ_SET.has(k)).length;

// Read the projection for EVERY workstream through the page's own session: the Progress index gives the
// axis ids, and the scoped `get_topic { axisId }` gives each axis's own recorded evidence, current reading
// and confidence. Pick the three subjects the requirements need — evidenced, stated-but-evidence-free, and
// bare (neither reading nor evidence) — from the projection itself, never from a name.
const projection = await page.evaluate(async ({ pluginId, orgId }) => {
  const cookie = (n) => document.cookie.split("; ").find((e) => e.startsWith(`${n}=`))?.slice(n.length + 1) ?? "";
  const call = async (key, input) =>
    (await fetch(`/v1/plugins/${pluginId}/actions/${key}`, {
      body: JSON.stringify({ input }),
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": cookie("nakama_csrf"), "x-org-id": orgId },
      method: "POST",
    }).then((r) => r.json())).result;
  const progress = await call("get_progress", { activitySinceDays: 0 });
  const rows = progress?.axes?.axes ?? [];
  const evidenced = [];
  const statedNoEvidence = [];
  const bareNoEvidence = [];
  const supportedConfirmed = [];
  const defaultConfirmed = [];
  for (const row of rows) {
    const scoped = await call("get_topic", { topicId: row.topicId, axisId: row.id });
    const axis = scoped?.axis;
    if (!axis) continue;
    const ev = (axis.evidence ?? []).map((item) => ({ kind: item.kind, label: item.label }));
    const entry = { axisId: row.id, title: axis.title ?? row.title, topicId: row.topicId, evidence: ev, currentState: axis.currentState ?? "", stateConfidence: axis.stateConfidence ?? null, currentStateConfidence: axis.currentStateConfidence ?? null };
    if (ev.length > 0 && axis.stateConfidence === "confirmed") supportedConfirmed.push(entry);
    // A state nobody asserted keeps the column's `confirmed` default with no evidence: the regression
    // subject (ev 0, no currentState, stateConfidence still `confirmed`).
    if (ev.length === 0 && (axis.currentState ?? "").length === 0 && axis.stateConfidence === "confirmed") defaultConfirmed.push(entry);
    if (ev.length > 0) evidenced.push(entry);
    else if ((axis.currentState ?? "").length > 0) statedNoEvidence.push(entry);
    else bareNoEvidence.push(entry);
  }
  return { evidenced, statedNoEvidence, bareNoEvidence, supportedConfirmed, defaultConfirmed, axesCount: rows.length };
}, { pluginId: PLUGIN_ID, orgId: TARGET_ORG });

const pick = (list) => list.sort((a, b) => b.evidence.length - a.evidence.length)[0] ?? null;
const evidencedSubject = pick(projection.evidenced);
const statedSubject = projection.statedNoEvidence[0] ?? null;
const bareSubject = projection.bareNoEvidence[0] ?? null;
const confirmedSubject = projection.supportedConfirmed[0] ?? null;
const defaultConfirmedSubject = projection.defaultConfirmed[0] ?? null;

// Drive the served page: the Progress view, select a workstream by its index row, read its context panel.
// The evidence disclosure moved OUT of the context panel into a sibling `<details>` of the selected detail
// OWNER (`[data-rd-progress-detail], which carries data-rd-progress-detail-axis`), so: identity, the current
// reading and the claim/state confidences come from the context panel, while the evidence marker is read
// from the owner. The evidence body is hidden while the fold is closed, so its text is read via `textContent`
// (which includes hidden descendants), never `innerText` — the absent case's explicit no-evidence sentence
// must remain visible to the assertion.
const readPanel = () =>
  page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const panel = scope?.querySelector("[data-rd-context-panel]");
    const owner = scope?.querySelector("[data-rd-progress-detail]");
    const line = owner?.querySelector("[data-rd-axis-evidence]");
    const reading = panel?.querySelector("[data-rd-axis-reading]");
    return {
      axis: panel?.getAttribute("data-rd-context-panel") ?? null,
      detailAxis: owner?.getAttribute("data-rd-progress-detail-axis") ?? null,
      confs: [...(panel?.querySelectorAll("[data-rd-conf]") ?? [])].map((n) => n.getAttribute("data-rd-conf")),
      evidenceCount: line ? Number(line.getAttribute("data-rd-axis-evidence")) : null,
      evidenceText: (line?.textContent ?? "").replace(/\s+/g, " ").trim(),
      hasEvidence: line?.getAttribute("data-rd-has-evidence") ?? null,
      linePresent: line !== null && line !== undefined,
      readingText: (reading?.textContent ?? "").replace(/\s+/g, " ").trim(),
      // The state badge carries the state's own confidence as an attribute (`data-rd-state-confidence`);
      // a `confirmed` state renders no suffix, so it is read here, not from a `.rd-conf` badge. The
      // reading/blocker claim confidences are the `[data-rd-conf]` badges.
      stateConf: panel?.querySelector("[data-rd-state]")?.getAttribute("data-rd-state-confidence") ?? null,
      stateName: panel?.querySelector("[data-rd-state]")?.getAttribute("data-rd-state") ?? null,
    };
  });
const confirmedBadges = (p) => [...p.confs, p.stateConf].filter((c) => c !== null && c !== undefined);
const selectAxis = async (axisId) => {
  await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="progress"]', { timeout: 20000 });
  await page.locator('div[data-plugin-id] [data-rd-view-option="progress"]').first().click();
  const row = page.locator(`div[data-plugin-id] [data-rd-index-axis="${axisId}"]`).first();
  if ((await row.count()) === 0) return false;
  await row.click();
  await page
    .waitForFunction(
      (wanted) => document.querySelector('div[data-plugin-id="research-dashboard"] [data-rd-context-panel]')?.getAttribute("data-rd-context-panel") === wanted,
      axisId,
      { timeout: 8000 }
    )
    .catch(() => {});
  await sleep(400);
  return true;
};

try {
  // (1) #17 — an evidence-bearing workstream renders the projection's OWN evidence, in words.
  if (!evidencedSubject) {
    check("an evidence-bearing workstream is present in this dataset (the #17 subject is real, not vacuous)", false, `${projection.axesCount} workstream(s); none carries recorded evidence`);
  } else {
    const selected = await selectAxis(evidencedSubject.axisId);
    const shown = await readPanel();
    await shoot("progress-evidence-present");
    // The selected workstream's Recent activity feed is the migrated #24 history presentation; capture it
    // beside the evidence line so the record shows both on the same surface.
    await shoot("progress-recent-activity");
    const labelsShown = evidencedSubject.evidence.slice(0, 3).some((item) => shown.evidenceText.includes(item.label));
    const countMatches = shown.evidenceCount === evidencedSubject.evidence.length;
    check(
      "an evidence-bearing workstream renders an evidence line with the projection's own record count",
      selected && shown.hasEvidence === "true" && countMatches,
      `panel ${shown.axis?.slice(0, 8) ?? "none"}; rendered count ${shown.evidenceCount} vs projection ${evidencedSubject.evidence.length}; has-evidence ${shown.hasEvidence}`
    );
    check(
      "the evidence line names the projection's own recorded evidence, in words (not a generic label)",
      labelsShown,
      `line "${shown.evidenceText.slice(0, 120)}" vs projection ${JSON.stringify(evidencedSubject.evidence.map((e) => e.label))}`
    );

    // (1b) the negative control: blank the line in the DOM and REQUIRE the count assertion to go red.
    if (NAIVE) {
      await page.evaluate(() => {
        const line = document.querySelector('div[data-plugin-id="research-dashboard"] [data-rd-axis-evidence]');
        if (line) { line.removeAttribute("data-rd-axis-evidence"); line.textContent = ""; }
      });
      const blanked = await readPanel();
      const wouldFail = !(blanked.hasEvidence === "true" && blanked.evidenceCount === evidencedSubject.evidence.length);
      check(
        "NEGATIVE CONTROL: a DOM-blanked evidence line makes the #17 assertion go red (the check can lose)",
        wouldFail,
        `blanked count ${blanked.evidenceCount}, has-evidence ${blanked.hasEvidence}, text "${blanked.evidenceText}"`
      );
      await page.reload({ waitUntil: "networkidle" });
      await sleep(600);
    }
  }

  // (2) #18a — a workstream that STATED A READING but recorded NO evidence says so, keeps the reading, and
  // shows no confirmed claim. This asserts absence-of-evidence independently of absence-of-progress.
  if (!statedSubject) {
    check("a stated-reading, evidence-free workstream is present (the #18 independence subject is real)", false, `${projection.axesCount} workstream(s); none states a reading without evidence`);
  } else {
    const selected = await selectAxis(statedSubject.axisId);
    const shown = await readPanel();
    await shoot("progress-evidence-absent");
    check(
      "an evidence-free workstream that states a reading says \"no evidence on record\"",
      selected && shown.hasEvidence === "false" && /no evidence on record/i.test(shown.evidenceText),
      `panel ${shown.axis?.slice(0, 8) ?? "none"}; has-evidence ${shown.hasEvidence}; line "${shown.evidenceText.slice(0, 90)}"`
    );
    check(
      "that workstream still shows its stated reading (evidence absence is independent of progress)",
      shown.readingText.length > 0 && !/no current reading recorded/i.test(shown.readingText),
      `reading "${shown.readingText.slice(0, 90)}"`
    );
    check(
      "an evidence-free workstream shows no confirmed ASSERTED reading/blocker claim (the state badge is scored separately)",
      !shown.confs.includes("confirmed"),
      `claim badges [${shown.confs.join(",")}]`
    );
  }

  // (2b) REGRESSION — a state nobody asserted keeps the column's `confirmed` default with no evidence. The
  // evidence line must still say there is none, in the confirmed-READING wording, the state badge must keep
  // reading `confirmed` (no downgrade), and the line must not promote it to an independent, "verified"
  // research claim. This is why the evidence-free checks above score the ASSERTED claim badges, not the
  // state badge: an evidence-free axis CAN read `confirmed` (nobody claimed it).
  if (!defaultConfirmedSubject) {
    check("a default-confirmed, no-evidence workstream is present in this dataset (the regression subject is real)", false, `${projection.axesCount} workstream(s); none carries an unasserted confirmed default with no evidence`);
  } else {
    const selected = await selectAxis(defaultConfirmedSubject.axisId);
    const shown = await readPanel();
    await shoot("progress-default-confirmed-no-evidence");
    check(
      "an unasserted `confirmed` default with no evidence says \"no evidence on record\" in the confirmed-READING wording",
      selected && shown.hasEvidence === "false" && /no evidence on record/i.test(shown.evidenceText) && /'confirmed' reading needs evidence/i.test(shown.evidenceText),
      `panel ${shown.axis?.slice(0, 8) ?? "none"}; has-evidence ${shown.hasEvidence}; line "${shown.evidenceText.slice(0, 110)}"`
    );
    check(
      "the unasserted `confirmed` default is not downgraded — the state badge still reads `confirmed`",
      shown.stateConf === "confirmed",
      `state ${shown.stateName}/${shown.stateConf}`
    );
    check(
      "no confirmed claim is asserted and no independent \"verified\" research claim is rendered",
      !shown.confs.includes("confirmed") && !/verified|independently/i.test(`${shown.evidenceText} ${shown.readingText}`),
      `claim badges [${shown.confs.join(",")}]; reading "${shown.readingText.slice(0, 70)}"`
    );
  }

  // (3) #18b — a bare workstream (no reading, no evidence) states the no-progress reading AND no evidence,
  // with no confirmed claim.
  if (!bareSubject) {
    check("a bare (no reading, no evidence) workstream is present (the #18b subject is real)", false, `${projection.axesCount} workstream(s); none is bare`);
  } else {
    const selected = await selectAxis(bareSubject.axisId);
    const shown = await readPanel();
    check(
      "a bare workstream says it has no current reading and no evidence",
      selected && shown.hasEvidence === "false" && /no evidence on record/i.test(shown.evidenceText) && /no current reading recorded/i.test(shown.readingText),
      `has-evidence ${shown.hasEvidence}; reading "${shown.readingText.slice(0, 70)}"; line "${shown.evidenceText.slice(0, 70)}"`
    );
    check("a bare workstream shows no confirmed ASSERTED reading/blocker claim", !shown.confs.includes("confirmed"), `claim badges [${shown.confs.join(",")}]`);
  }

  // (4) NEGATIVE CONTROL for #18's "no confirmed claim" half: a claim that IS backed (a branch) may read
  // `confirmed`, and the page shows it. This proves the "no confirmed" assertions above can DISTINGUISH —
  // they are not passing merely because a confidence badge never renders.
  if (!confirmedSubject) {
    check("a supported (evidence-backed) confirmed claim is present in this dataset (the #18 negative control is real)", false, `${projection.axesCount} workstream(s); none carries a confirmed state with evidence`);
  } else {
    const selected = await selectAxis(confirmedSubject.axisId);
    const shown = await readPanel();
    check(
      "NEGATIVE CONTROL: a supported (evidence-backed) confirmed claim is rendered confirmed (the no-confirmed check can distinguish)",
      selected && shown.hasEvidence === "true" && confirmedBadges(shown).includes("confirmed"),
      `panel ${shown.axis?.slice(0, 8) ?? "none"}; evidence ${shown.evidenceCount}; state ${shown.stateName}/${shown.stateConf}; badges [${confirmedBadges(shown).join(",")}]`
    );
  }
} catch (error) {
  await browser.close();
  console.error(`evidence-line: fault — ${error.message}`);
  process.exit(2);
}
await browser.close();
check("the whole traversal was read-only", writes() === 0, `write action(s): ${writes()}`);

const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ probe: "evidence-line", label: "current-surface #17/#18", negativeControl: NAIVE, targetOrg: TARGET_ORG, viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, projection: { evidenced: projection.evidenced.length, statedNoEvidence: projection.statedNoEvidence.length, bareNoEvidence: projection.bareNoEvidence.length, supportedConfirmed: projection.supportedConfirmed.length, defaultConfirmed: projection.defaultConfirmed.length }, checks }, null, 2));
console.log(fails.length === 0 ? "evidence-line: PASS" : `evidence-line: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
