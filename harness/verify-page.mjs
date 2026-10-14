/**
 * Verifies the research-dashboard page in the real dashboard UI (not just the API):
 * logs in, opens the plugin page, reads what rendered, exercises the views, screenshots.
 *
 * Run it through `harness/read-pass.sh` (`bun run harness:read`), which supplies the dataset,
 * viewport, transcript and screenshot paths; this file is the checks themselves.
 *
 * Prerequisites:
 *   - a Nakama instance with this plugin installed (README § "Run the acceptance pass")
 *   - the dashboard web dev server for that instance (plugin pages live inside it)
 *   - playwright-core (`bun install`) and a chromium (PLAYWRIGHT_CHROMIUM, or a cached
 *     $HOME/.cache/ms-playwright build)
 *
 *   NAKAMA_DEV_EMAIL=… NAKAMA_DEV_PASSWORD=… bun harness/verify-page.mjs [--write]
 *
 * --write also creates a topic, opens its editor and records an activity through the page, so it
 * MUTATES the database — re-seed the dataset afterwards.
 * Credentials are read from the environment and never printed.
 *
 * The overview assertions are the C4 acceptance criteria: the default screen renders from ONE
 * get_overview call, the window control changes only the query, axes appear grouped under their
 * topic, and a topic carrying a blocked axis is visually distinct.
 */
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyDataset, fixHint, observedPhrase, verifyDataset } from "./dataset-identity.mjs";
import { foldTextIssues } from "./folded-axes.mjs";
import { summarizeTimeline } from "./overview-timeline.mjs";
import { DANGLING_SEPARATOR_PATTERN, SEPARATOR } from "./people-boundary.mjs";
import { pathLabel, redactEndpoint } from "./redact.mjs";
import { parseOrgSelector, selectOrgId } from "./org-selection.mjs";
import { sparseSkipReason, stepFiveSkipReason } from "./skip-reason.mjs";

// playwright-core is a devDependency of this repo, so `bun install` makes the bare specifier
// resolve; PLAYWRIGHT_CORE can point at any other install instead.
const playwrightCore = process.env.PLAYWRIGHT_CORE ?? "playwright-core";
const { chromium } = await import(playwrightCore);

const DASHBOARD = process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:3003";
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
/**
 * A string from the fixture that the page must **not** render as human steering: Fixture E puts an ordinary
 * note on the same problem as its steering claim. Kept in step with `apply-layout-fixture.mjs`'s
 * `FIXTURE_E_NOTE` by that comment — both are fixture data, and what is being checked is the page, not the
 * sentence.
 */
const FIXTURE_NOTE_PREFIX = "Fixture E evidence link:";
// A chromium must be present, but pinning one build number makes the pass fail on any machine that
// installed a different one. PLAYWRIGHT_CHROMIUM wins; otherwise take the newest cached build.
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) {
    return null;
  }
  const builds = readdirSync(root)
    .filter((name) => name.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0));
  for (const build of builds) {
    for (const relative of [
      "chrome-linux64/chrome",
      "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      if (existsSync(`${root}/${build}/${relative}`)) {
        return `${root}/${build}/${relative}`;
      }
    }
  }
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) {
  console.error(
    "No chromium found. Either set PLAYWRIGHT_CHROMIUM to a chrome/Chromium binary, or install one:\n" +
      "  bunx playwright install chromium\n" +
      "(looked for a cached build under $HOME/.cache/ms-playwright)"
  );
  process.exit(2);
}
const OUT = process.env.NAKAMA_SHOT_DIR ?? ".";
// The transcript is a committed public artifact, so a quoted screenshot path is a label, not an address:
// a shot inside the repo is written repo-relative (a reader with a clone resolves it), and a scratch shot is
// `<scratch>/<name>`. The absolute `OUT` still writes the files — only what the record prints is redacted.
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const shotLabel = (file) => pathLabel(file, REPO_ROOT);
// Viewport is a knob because the layout complaint ("crowded toolbar, unused vertical space") is a
// function of width: a capture at one size can only show that the layout suits that size.
const VIEWPORT = (() => {
  const match = (process.env.NAKAMA_VIEWPORT ?? "").match(/^(\d+)x(\d+)$/);
  return match
    ? { height: Number(match[2]), width: Number(match[1]) }
    : { height: 900, width: 1440 };
})();
const PAGE_LABEL = process.env.NAKAMA_PAGE_LABEL ?? "Research";
const WRITE = process.argv.includes("--write");

/**
 * The rail's lead, mirroring `RAIL_ACTIVITY_LEAD` in `src/ui.tsx`. The harness states it independently so
 * the page cannot define its own window into correctness: if the page silently grew the lead to fit a long
 * topic, this check would fail rather than agree. The corpus topic carries 25 events and the fixture's
 * sparse one carries none, so both sides of the comparison have a subject. §13 raised the lead to five (the
 * same value the Progress Activity column uses), so the harness states five to match.
 */
const RAIL_ACTIVITY_LEAD = 5;

const problems = [];
const skipped = [];
let passed = 0;
// A transcript is a committed public artifact, so an emitted line must not carry trailing whitespace. Several
// checks build their `detail` from rendered text via `text.slice(0, N)`; `replace(/\s+/g, " ")` collapses runs
// but leaves a trailing space when the cut lands on one. Trim at the one place a line is emitted — a
// presentation-only change: it cannot alter a check description, a condition or a verdict, only the last
// character the transcript prints.
const emitLine = (line) => console.log(line.replace(/[ \t]+$/, ""));
const check = (description, condition, detail = "") => {
  emitLine(`${condition ? "PASS" : "FAIL"}  ${description}${detail ? ` — ${detail}` : ""}`);
  if (condition) {
    passed += 1;
  } else {
    problems.push(description);
  }
};
// A check whose *subject* this corpus does not have is reported, never passed. A silently-skipped
// check that prints PASS is how a harness stops meaning anything: the demo corpus used to carry a
// blocked axis, an unmapped person and a card that hid axes, and this corpus carries none of them.
const skip = (description, reason) => {
  emitLine(`SKIP  ${description} — ${reason}`);
  skipped.push(`${description} — ${reason}`);
};
/**
 * A check whose *subject the pivot retired* is reported, never passed and never faked. `retired` keeps the
 * original condition/detail arguments in the source (so the assertion is preserved for a reader and for a
 * future re-point) but emits a SKIP with a reason — the condition is still evaluated, so a retirement can
 * never hide a thrown reference error.
 */
const retired = (description, _condition, _detail, reason) =>
  skip(description, reason || "the subject of this assertion was retired by the four-tab pivot");
const checksSoFar = () => passed + problems.length + skipped.length;
/**
 * The page's own age vocabulary, stated once and shared. A rendered age has to be the age of the timestamp
 * beside it, and the two checks that read a bare age (the Progress axis row, a repository row's second line)
 * compare against these words rather than trusting the phrase. Keeping one copy means the vocabulary cannot
 * drift between the checks that read it.
 */
const ageWords = (iso) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "unknown";
  }
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 14) {
    return "last week";
  }
  if (days < 60) {
    return `${Math.floor(days / 7)} weeks ago`;
  }
  return `${Math.floor(days / 30)} months ago`;
};
// A pass that dies mid-file must not leave a record that reads like a short successful run. The transcript
// file is written by the wrapper as this process prints, so the summary has to come from here: name the
// abort, say the record is partial, and exit with a code the wrapper refuses to record (2 — distinct from
// 1, which is a real verdict with failures in it).
const abortRecord = (error) => {
  console.log("");
  console.log(
    `ABORTED  the pass stopped after ${checksSoFar()} check(s) — this transcript is PARTIAL and is not an ` +
      "acceptance verdict. The last check printed is the last one that ran."
  );
  console.log(`ABORTED  ${String(error?.stack ?? error).split("\n").slice(0, 4).join("\n         ")}`);
  console.log("read pass: ABORTED — partial record, do not read it as a result");
  process.exit(2);
};
process.on("uncaughtException", abortRecord);
process.on("unhandledRejection", abortRecord);

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: VIEWPORT });
// ---- TEMPORARY DIAGNOSTIC (C1 double get_overview) -------------------------------------------
// Counts how many times a plugin root is inserted into the document, so "two requests" can be told
// apart from "the component mounted twice". Removed once the cause is established.
await page.addInitScript(() => {
  window.__rdMounts = 0;
  window.__rdMountTraces = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) {
          continue;
        }
        if (
          node.matches?.("div[data-plugin-id]") ||
          node.querySelector?.("div[data-plugin-id]")
        ) {
          window.__rdMounts += 1;
          window.__rdMountTraces.push(String(new Error("mount").stack).split("\n").slice(1, 5).join(" | "));
        }
      }
    }
  });
  try {
    observer.observe(document, { childList: true, subtree: true });
  } catch (error) {
    window.__rdObsError = String(error);
  }
});
const documentRequests = [];
page.on("request", (request) => {
  if (request.resourceType() === "document") {
    documentRequests.push(`${Date.now()} ${request.url()}`);
  }
});
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
const initiators = [];
cdp.on("Network.requestWillBeSent", (event) => {
  if (!/\/actions\/get_overview/.test(event.request.url)) {
    return;
  }
  const frames = event.initiator?.stack?.callFrames ?? [];
  initiators.push({
    at: event.timestamp,
    stack: frames
      .slice(0, 30)
      .map((frame) => `${frame.functionName || "(anonymous)"} @ ${(frame.url || "").split("/").pop()}:${frame.lineNumber + 1}`),
    type: event.initiator?.type,
  });
});
const consoleIssues = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleIssues.push(`${message.type()}: ${message.text().slice(0, 160)}`);
  }
});
page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));

// Every call the page makes to the plugin's own actions, in order. The overview's "one call" and
// "the window changes only the query" claims are read straight off these rather than inferred.
const actionCalls = [];
page.on("request", (request) => {
  const match = request.url().match(/\/actions\/([^/?]+)/);
  if (!match) {
    return;
  }
  let input = null;
  try {
    input = JSON.parse(request.postData() ?? "{}").input ?? null;
  } catch {
    input = null;
  }
  actionCalls.push({ at: Date.now(), input, key: match[1] });
});
const callsFor = (key) => actionCalls.filter((call) => call.key === key);

// What the host answered, per action — the page's own reading of `{ok:false}` is not evidence that the
// server said anything at all, and a silently-refused write is exactly the bug worth catching.
const actionResponses = [];
page.on("response", async (response) => {
  const match = response.url().match(/\/actions\/([^/?]+)/);
  if (!match) {
    return;
  }
  let text = "";
  try {
    text = await response.text();
  } catch {
    text = "<unreadable>";
  }
  // The identity is parsed from the FULL body and stored as a field, never recovered later from a
  // truncated one. The 300-char cut kept only this for readability and once produced a `null`
  // `result.topic.id` that read like evidence for a write-path branch; it was a truncation artifact.
  // `body` stays short for a human reading the transcript; `parsed` is the machine-readable answer.
  let parsed = null;
  try {
    const outer = JSON.parse(text);
    const inner = typeof outer?.result === "string" ? JSON.parse(outer.result) : outer?.result;
    parsed = {
      ok: inner?.ok ?? null,
      topicId: inner?.topic?.id ?? null,
      topicName: inner?.topic?.name ?? null,
      error: typeof inner?.error === "string" ? inner.error : null,
      keys: inner && typeof inner === "object" ? Object.keys(inner).slice(0, 12) : null,
    };
  } catch {
    parsed = null;
  }
  actionResponses.push({ body: text.slice(0, 300), key: match[1], parsed, status: response.status() });
});

await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
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
consoleIssues.length = 0; // pre-auth noise is not this plugin's

// ------------------------------------------------------------------ name the target organization, exactly
// The pass acts on ONE organization. It is named explicitly (`--org-id` / `--org-name`, or NAKAMA_ORG_ID /
// NAKAMA_ORG_NAME) and resolved EXACTLY against the account's own `/v1/auth/orgs` with the shared resolver
// (`org-selection.mjs`) — NEVER `orgs[0]`, which rebound the wrong organization once a multi-org account was
// involved. The corpus/fixture callers on a single-org account still fall back to their only org; a multi-org
// account with no name is REFUSED rather than guessed. The chosen org is then selected as the session's
// active org and read back from the host's own echo (`activeOrgId`) — the supported browser contract.
const ORG_SELECTOR = parseOrgSelector();
const orgList = await page.evaluate(async () =>
  (await fetch("/v1/auth/orgs", { credentials: "include" })).json()
);
const orgSelection = selectOrgId(orgList?.orgs, ORG_SELECTOR);
if (!orgSelection.ok) {
  console.log(`REFUSED  ${orgSelection.message}`);
  console.log("read pass: REFUSED — no verdict, no record");
  await browser.close();
  process.exit(3);
}
const ORG_ID = orgSelection.id;
const orgSwitch = await page.evaluate(
  async (orgId) => {
    const cookie = (name) =>
      document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? "";
    const response = await fetch("/v1/auth/active-org", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": cookie("nakama_csrf") },
      body: JSON.stringify({ orgId }),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, activeOrgId: body.activeOrgId ?? null };
  },
  ORG_ID
);
if (orgSwitch.status !== 200 || orgSwitch.activeOrgId !== ORG_ID) {
  console.error(
    `verify-page: active-org switch did not confirm the target (HTTP ${orgSwitch.status}, activeOrgId ` +
      `${JSON.stringify(orgSwitch.activeOrgId)} vs ${JSON.stringify(ORG_ID)})`
  );
  await browser.close();
  process.exit(2);
}
console.log(
  `org: ${ORG_ID} (matched by ${orgSelection.matchedBy}); session active org confirmed ${orgSwitch.activeOrgId}`
);

// ------------------------------------------------------------------ read the corpus from the API
// The checks below used to name the demo fixtures outright ("Signal Processing", "Researcher A",
// "group/signal-pipeline"), which made the harness a snapshot of one dataset: swapping the corpus
// broke it, and it could no longer answer whether the page works. The fixtures now come from the
// payload the page itself reads, so the harness holds for any corpus. What a given corpus cannot
// exercise is printed as SKIP with the reason — never as a pass.
const CORPUS = await page.evaluate(
  async ([pluginId, days, orgId]) => {
    const cookie = (name) =>
      document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? "";
    const call = async (key, input) =>
      (
        await fetch(`/v1/plugins/${pluginId}/actions/${key}`, {
          body: JSON.stringify({ input }),
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": cookie("nakama_csrf"),
            "x-org-id": orgId,
          },
          method: "POST",
        }).then((r) => r.json())
      ).result;
    const all = await call("get_overview", { activitySinceDays: days });
    const events = all.timeline.flatMap((group) => group.axes.flatMap((axis) => axis.events));
    const topic = all.topics[0] ?? null;
    // One get_topic call, for the exact counts the detail view has to render — a corpus with no notes
    // must render no notes, and one with notes must render them.
    const detail =
      topic === null
        ? null
        : await call("get_topic", { activityLimit: 100, notesLimit: 100, topicId: topic.topic.id });
    return {
      topicActivityRows: detail?.activity?.length ?? 0,
      topicNotes: detail?.counts?.notes ?? 0,
      allEvents: events.length,
      axes: (topic?.axes ?? []).map((axis) => ({
        branch: axis.branch,
        confidence: axis.stateConfidence,
        pr: axis.prNumber,
        state: axis.state,
        title: axis.title,
      })),
      axisCounts: topic?.axisCounts ?? {},
      blocked: all.blocked.length,
      blockedEntries: all.blocked.map((entry) => ({
        blocker: entry.blocker,
        title: entry.title,
        topic: entry.topicName,
      })),
      counts: all.counts,
      eventDates: [...new Set(events.map((e) => String(e.occurredAt ?? "").slice(0, 10)))].sort(),
      people: all.people.map((person) => ({
        attributable: person.attributable,
        axes: person.axes.length,
        // C6 (People composition): each topic involvement with the payload's own topic identity and the
        // axes the person owns *on that topic*. The lane's bearing/project-only partition is derived from
        // exactly this — a topic with an empty axis list is a project-only affiliation — so the checks
        // below compare against the payload rather than counting rendered cards.
        involvements: person.topics.map((entry) => ({
          axes: entry.axes.map((axis) => axis.id),
          name: entry.topic.name,
          role: entry.role,
          status: entry.topic.status,
          topicId: entry.topic.id,
        })),
        // C2: the repositories the payload's own axes name — the rail's card must be exactly this set,
        // derived rather than invented, so the check compares ids rather than trusting the rendering.
        axisRepoIds: [
          ...new Set(
            person.axes.flatMap((axis) => axis.repositories.map((repository) => repository.id))
          ),
        ],
        lastActivityAt: person.lastActivityAt ?? null,
        name: person.person.displayName,
        // C2: the person's own note. The About card renders this verbatim or says there is none.
        notes: person.person.notes ?? "",
        recent: person.recentActivity.length,
        topics: person.topics.length,
      })),
      repositories: all.repositories.map((repo) => ({
        axes: repo.axes.map((axis) => axis.title),
        fullName: repo.repository.fullName,
        topicCount: (repo.topics ?? []).length,
        // The rollup's own direct topic links: id + recorded relationship. The panel consolidates a link
        // whose project is already a work group into that group, so the check reads coverage by id across
        // both surfaces rather than the rail's now-subset count.
        topicLinks: (repo.topics ?? []).map((link) => ({
          id: link.topic.id,
          relationship: link.relationship,
        })),
      })),
      // The projection groups each topic's window events into axis buckets; an event that named its topic
      // but no axis is a legitimate **topic-level** bucket whose `axis` is `null` (store key `""`). Return
      // the raw buckets here — an imported reader cannot run inside `page.evaluate` — and let the
      // null-axis-safe reader (`summarizeTimeline`) label and count them just below.
      timeline: all.timeline.map((group) => ({
        axes: group.axes.map((bucket) => ({ axis: bucket.axis ?? null, eventCount: bucket.eventCount })),
        topic: { name: group.topic.name },
      })),
      topicAxes: all.topics.map((entry) => ({
        axes: entry.axes.map((axis) => axis.title),
        blockedAxes: entry.axes.filter((axis) => axis.state === "blocked").map((axis) => axis.title),
        hidden: Math.max(0, entry.axes.length - 3), // LEAD_AXES in the page
        topic: entry.topic.name,
      })),
      topic: topic?.topic?.name ?? "",
      topicId: topic?.topic?.id ?? "",
      topicNames: all.topics.map((entry) => entry.topic.name),
      // C3: the landing's two columns must be exactly the payload's own collections, in the payload's own
      // order, and a topic card's activity line must be the payload's own count for that topic.
      topicIds: all.topics.map((entry) => entry.topic.id),
      // The selected topic's OWN linked people (payload-derived) and each topic's own lastActivityAt.
      // A check must read these, never the org-wide first person: the ACTIVE-project pivot puts a topic
      // with no linked person beside one with a participant, and assuming `people[0]` belongs to the
      // selected topic is a cross-topic mis-scope, not a product fact.
      topicPeople: (topic?.people ?? []).map((person) => ({
        displayName: person.displayName,
        id: person.id,
      })),
      topicLastActivity: Object.fromEntries(
        all.topics.map((entry) => [entry.topic.name, entry.lastActivityAt ?? null])
      ),
      topicActivity: Object.fromEntries(
        all.topics.map((entry) => [entry.topic.id, entry.activityCount])
      ),
      repositoryIds: all.repositories.map((repo) => repo.repository.id),
    };
  },
  [PLUGIN_ID, 14, ORG_ID]
);
// The imported reader runs here, OUTSIDE the page context: it represents every bucket — the topic-level
// (null-axis) one included, labelled and counted — instead of dereferencing a null `axis.title` (finding
// F2). Keeping it outside `page.evaluate` means the module that the unit test exercises is the module the
// pass runs, not a browser-side copy of it.
CORPUS.timeline = summarizeTimeline(CORPUS.timeline);
// ------------------------------------------------------------------ dataset identity: refuse, do not guess
// A verifier must not emit an acceptance verdict for a dataset it was not pointed at. The identity is read
// from durable names, never from whatever renders first, and it distinguishes THREE things rather than two
// (reviewer ruling, C3): the corpus, the fixture, and the *write residue* a `--write` pass leaves behind
// (`ui-check <n>`) — which is neither dataset and used to be misread as a corpus marker, turning a
// contaminated fixture into "a mixed instance" and refusing every later fixture run with the wrong
// diagnosis. All of it lives in `harness/dataset-identity.mjs` so the rule is testable without a browser
// (`bun harness/test-dataset-identity.mjs`); a mismatch is refused here, before any check runs, and the run
// exits 3 — a code the wrapper refuses to record, so the committed transcript survives.
const EXPECTED_DATASET = process.env.NAKAMA_EXPECT_DATASET ?? "";
if (["corpus", "fixture"].includes(EXPECTED_DATASET)) {
  const identity = classifyDataset({
    repositoryNames: (CORPUS.repositories ?? []).map((row) => row.fullName),
    topicNames: CORPUS.topicNames ?? [],
  });
  const observed = observedPhrase(identity);
  console.log(
    `identity: expected ${EXPECTED_DATASET} · ${identity.counts.topics} topic(s) ` +
      `(${identity.counts.fixtureTopics} fixture-named, ${identity.counts.residueTopics} write residue) · ` +
      `${identity.counts.fixtureRepositories} of ${identity.counts.repositories} repository(ies) under ` +
      `fixture/ · observed ${observed}`
  );
  const verdict = verifyDataset(EXPECTED_DATASET, identity);
  if (!verdict.ok) {
    console.log(
      `FAIL  the instance holds the dataset this run asked for — requested ${EXPECTED_DATASET}, instance ` +
        `shows ${verdict.reason}`
    );
    console.log(
      `REFUSED  no verdict: the pass will not measure ${EXPECTED_DATASET} against an instance that holds ` +
        `${verdict.reason}`
    );
    console.log(`REFUSED  ${fixHint(identity)}`);
    console.log("read pass: REFUSED — no verdict, no record");
    await browser.close();
    process.exit(3);
  }
}
console.log(
  "corpus:",
  JSON.stringify({
    axes: CORPUS.axes.length,
    blocked: CORPUS.blocked,
    people: CORPUS.people.length,
    repositories: CORPUS.repositories.length,
    topic: CORPUS.topic,
    windowEvents: CORPUS.allEvents,
  })
);

actionCalls.length = 0;
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
const root = page.locator(`div[data-plugin-id="${PLUGIN_ID}"]`);
await root.waitFor({ state: "visible", timeout: 20000 });
/**
 * Click a control only if it is present. The pivot retired several controls (the Progress subview
 * switch, the per-problem choice, the problem index) that the legacy checks still reference; clicking a
 * locator that matches nothing aborts the whole pass on a 30 s actionability timeout — a lost record, not
 * a verdict. Guarded clicks let the checks report their own verdict instead.
 */
const clickIfPresent = async (locator) => {
  if ((await locator.count()) === 0) {
    return false;
  }
  await locator.first().click();
  return true;
};

const render = await page.evaluate((pluginId) => {
  const node = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
  const text = (node?.innerText ?? "").replace(/\s+/g, " ");
  return {
    // The retired Overview's always-on count row is gone: the aggregates live in the collapsed Dashboard
    // summary above the Projects landing, which reports "ready" once get_overview has answered.
    summary: node?.querySelector("[data-rd-dashboard-summary]")?.getAttribute("data-rd-dashboard-summary") ?? null,
    home: node?.querySelector("[data-rd-home]")?.getAttribute("data-rd-home") ?? null,
    homeIsButton: node?.querySelector("button[data-rd-home]") !== null,
    mounted: Boolean(node),
    // The Dashboard summary is a native `details`; read its own state and label rather than the page's
    // uppercased `innerText` (the CSS `text-transform` uppercases "Dashboard summary", so a case-sensitive
    // `innerText.includes` matched nothing — an instrument bug, not a missing disclosure).
    dashboardSummary: (() => {
      const details = node?.querySelector("[data-rd-dashboard-summary]");
      return details === null || details === undefined
        ? null
        : {
            closed: !details.hasAttribute("open"),
            label: (details.querySelector("summary")?.textContent ?? "").trim(),
          };
    })(),
    projectsView: node?.querySelector('[data-rd-view="topics"]') !== null,
    projectsHeading: (node?.querySelector('[data-rd-view-title="topics"]')?.textContent ?? "").trim(),
    pressedView:
      node
        ?.querySelector('[data-rd-view-option][aria-pressed="true"]')
        ?.getAttribute("data-rd-view-option") ?? null,
    text,
  };
}, PLUGIN_ID);
check("plugin page mounted", render.mounted);
// The pivot retires Overview: the default screen is the **Projects** view (the page's `topics` view value —
// the tab label changed, the value did not), with the collapsed Dashboard summary above its landing. The
// four tabs are peer views; there is no separate aggregation screen to open on.
check(
  "the page opens on the Projects tab, the default screen",
  render.projectsView && render.pressedView === "topics" && render.projectsHeading === "Projects",
  `projects view=${render.projectsView}; pressed view=${JSON.stringify(render.pressedView)}; heading ${JSON.stringify(render.projectsHeading)}`
);
// §13 supersedes §7's "persistent Research overview heading": the top bar is a dashboard brand, not a
// control. The `data-rd-home` marker stays, but it is static text now (never a button), so assert the
// absence of the old home affordance rather than a specific brand string the owner is still tuning.
check(
  "the shell title is static branding, not a home control (§13)",
  render.home === "current" && render.homeIsButton === false,
  `data-rd-home=${JSON.stringify(render.home)}; is a button=${render.homeIsButton}`
);
// The retired Overview's count row is replaced by the collapsed Dashboard summary. It renders on the
// default screen (Projects), so it is asserted once here — where it is guaranteed present — rather than on a
// subview: present, and reporting that the payload has loaded (not the pre-load "—" state).
check(
  "the Dashboard summary renders above the Projects landing, reporting the loaded payload",
  render.summary === "ready",
  `data-rd-dashboard-summary=${JSON.stringify(render.summary)}`
);
check(
  "the Dashboard summary is a disclosure, closed by default",
  render.dashboardSummary !== null &&
    render.dashboardSummary.closed === true &&
    /dashboard summary/i.test(render.dashboardSummary.label),
  `disclosure ${JSON.stringify(render.dashboardSummary)}`
);

// ------------------------------------------------------------------ C4: the projects shell
// Overview is retired, so the shell's one-load claim now belongs to the default **Projects** view: the
// page's own first paint must render it from one logical get_overview load.
const overviewCalls = callsFor("get_overview");
// ONE logical load. React's *development* runtime mounts passive effects twice — the dev-only StrictMode
// reconnect pass — so a dev-served bundle issues the same load twice from the same effect. That was
// established rather than assumed: identical input, an identical stack through `runWithFiberInDEV` to
// `reconnectPassiveEffects`, one plugin mount, both calls in the same millisecond. The production
// behaviour is what is asserted — exactly one load. Where the runtime is a dev build (measured from
// react-dom's own source below, not presumed) the duplicate is tolerated only in its exact form: one
// distinct input, and the transcript says which runtime it was.
const devRuntime = await page.evaluate(async () => {
  const candidates = [
    ...[...document.querySelectorAll("script")].map((node) => node.src),
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
  ].filter((url) => /react-dom/.test(url));
  if (candidates.length === 0) {
    return null;
  }
  try {
    const text = await (await fetch(candidates[0])).text();
    return text.includes("runWithFiberInDEV") || text.includes("reconnectPassiveEffects");
  } catch {
    return null;
  }
});
const overviewInputs = [...new Set(overviewCalls.map((call) => JSON.stringify(call.input)))];
check(
  "the Projects view renders from one logical get_overview load",
  overviewCalls.length >= 1 &&
    overviewInputs.length === 1 &&
    (overviewCalls.length === 1 || devRuntime === true),
  `saw ${overviewCalls.length} call(s) over ${overviewInputs.length} distinct input(s)` +
    `${overviewCalls.length > 1 ? `; react-dom is a development build: ${devRuntime}` : ""}: ` +
    `${JSON.stringify(overviewCalls.map((call) => call.input))}`
);
check(
  "a get_overview call reads other plugin actions for nothing else on first paint",
  callsFor("list_topics").length === 0,
  `list_topics calls: ${callsFor("list_topics").length}`
);

const overviewInput = overviewCalls[0]?.input ?? {};
// The pivot's window rule: Overview — the only window-scoped tab — is retired, so every view reads **all
// time**. `activitySinceDays: 0` is the all-time marker the store treats as a parameter, not stored state.
// The retired 7/14/30/All control has no subject here; its assertion is replaced, not weakened.
check(
  "every view reads all time: get_overview is sent at 0 days",
  JSON.stringify(overviewInput) === JSON.stringify({ activitySinceDays: 0 }),
  JSON.stringify(overviewInput)
);

// ------------------------------------------------------------------ C3: the Projects landing (default)
// The pivot retires the Overview landing: the default screen is **Projects**, with the collapsed Dashboard
// summary above it. Read **before anything is clicked** — this is the initial state. The retired Overview's
// two-column landing (topic cards + repository cards, their activity lines and geometry) has no subject; the
// repository set is asserted in the Repositories view, and project navigation by the index rail and the tag
// contract (C7h). Those retired checks are reported as SKIPs below, never silently passed.
const landing = await page.evaluate((pluginId) => {
  const root = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
  if (!root) {
    return null;
  }
  const summary = root.querySelector("[data-rd-dashboard-summary]");
  const stats = [...(summary?.querySelectorAll(".rd-stat") ?? [])].map((node) => ({
    label: (node.querySelector(".rd-meta")?.textContent ?? "").trim(),
    value: (node.querySelector(".rd-stat-value")?.textContent ?? "").trim(),
  }));
  return {
    pressedViews: [...root.querySelectorAll('[data-rd-view-option][aria-pressed="true"]')].map(
      (node) => node.getAttribute("data-rd-view-option")
    ),
    projects: root.querySelector('[data-rd-view="topics"]') !== null,
    stats,
    summaryReady: summary?.getAttribute("data-rd-dashboard-summary") ?? null,
    topicRows: [...root.querySelectorAll('[data-rd-view="topics"] [data-rd-index-topic]')].map((node) =>
      node.getAttribute("data-rd-index-topic")
    ),
  };
}, PLUGIN_ID);

check(
  "the Projects view is the default screen (its tab pressed), with the Dashboard summary loaded above it",
  landing !== null &&
    landing.projects === true &&
    JSON.stringify(landing.pressedViews) === JSON.stringify(["topics"]) &&
    landing.summaryReady === "ready",
  `projects=${landing?.projects}; pressed view option(s)=${JSON.stringify(landing?.pressedViews)}; summary=${landing?.summaryReady}`
);

const summaryStat = (label) => landing?.stats.find((stat) => stat.label === label)?.value ?? null;
check(
  "the Dashboard summary's figures are the payload's own counts (projects, workstreams, repositories, people)",
  summaryStat("Projects") === String(CORPUS.counts?.topics ?? -1) &&
    summaryStat("Workstreams") === String(CORPUS.counts?.axes ?? -1) &&
    summaryStat("Repositories") === String(CORPUS.counts?.repositories ?? -1) &&
    summaryStat("People") === String(CORPUS.counts?.people ?? -1),
  `summary ${JSON.stringify(landing?.stats)} vs payload counts ${JSON.stringify(CORPUS.counts)}`
);

check(
  "every project in the payload appears on the Projects landing exactly once, in the payload's own order",
  JSON.stringify(landing?.topicRows) === JSON.stringify(CORPUS.topicNames),
  `rendered ${JSON.stringify(landing?.topicRows)} vs payload ${JSON.stringify(CORPUS.topicNames)}`
);

// The retired Overview-landing checks have no subject in the four-tab contract: reported, never passed.
skip(
  "the landing shows both aggregation columns",
  "the Overview landing columns are retired (the pivot); Projects is a peer tab, not a landing"
);
skip(
  "every repository in the payload appears on the landing exactly once, in the payload's own order",
  "the Overview landing repository column is retired; the repository set is asserted in the Repositories view"
);
skip(
  "the repository cards state the omitted window count instead of printing a capped list length (D4)",
  "the Overview landing repository cards are retired; the Repositories view carries this row instead"
);
skip(
  "each topic card's activity line is the payload's own count for that topic, with no event title",
  "the Overview landing topic cards are retired; the Projects index carries per-project counts instead"
);
skip(
  "the two columns sit side by side with the topic column wider, both beginning in the first viewport",
  "the Overview landing's two-column geometry is retired by the pivot"
);

// The pass reads the Projects (Topics) view from here on. It is the default, so no navigation is needed — the
// retired Overview round-trip is gone — but the wait keeps the sections below honest if the entry view ever
// moves. The readiness rules they rely on are defined just below.
await page.waitForSelector(`div[data-plugin-id] [data-rd-view="topics"]`, { timeout: 10000 });

// ------------------------------------------------------------------ readiness, not sleeps
// Entering a view triggers its data: Topics renders its index ~300 ms after the view container appears
// (measured on this estate; action latency itself is ~40 ms), and the landing cards are replaced while a
// window change refetches. A check that reads immediately therefore reports a correct page as broken, and a
// click on a control that has not rendered aborts the whole pass on a 30 s locator timeout — a lost record,
// not a verdict. These helpers wait on the page's own DOM markers (the index row, the pane, the detail the
// checks below read), so the wait ends as soon as the page is ready and never masks a genuinely missing
// element: the assertions still run afterwards and still report what they actually found.
const waitForLandingReady = async (expectedTopics = 1) => {
  // The retired Overview landing cards are gone; what "the landing is ready" now means is that the Projects
  // index rail has rendered its rows (the default view's own marker). Kept under its old name so the call
  // sites read the same; the subject changed with the pivot.
  await page
    .waitForFunction(
      ([pluginId, count]) => {
        const root = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
        return (
          root !== null &&
          root.querySelectorAll('[data-rd-view="topics"] [data-rd-index-topic]').length >= count
        );
      },
      [PLUGIN_ID, expectedTopics],
      { timeout: 12000, polling: 50 }
    )
    .catch(() => {});
};
const waitForTopicsReady = async () => {
  await page
    .waitForFunction(
      ([pluginId, expected]) => {
        const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
        if (!scope) return false;
        const rows = scope.querySelectorAll("[data-rd-index-topic]");
        const pressed = scope.querySelector('[data-rd-index-topic][aria-pressed="true"]');
        const pane = scope.querySelector("[data-rd-detail]");
        const detail = pane?.querySelector('[data-rd-claim="summary"]') ?? null;
        return rows.length >= expected && pressed !== null && pane !== null && detail !== null;
      },
      [PLUGIN_ID, CORPUS.topicNames.length],
      { timeout: 12000, polling: 50 }
    )
    .catch(() => {});
};
const waitForRepositoriesReady = async (expectedPanel = null) => {
  await page
    .waitForFunction(
      ([pluginId, panel]) => {
        const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
        if (!scope) return false;
        const rows = scope.querySelectorAll("[data-rd-repository]");
        const shown =
          scope
            .querySelector("[data-rd-repository-panel]")
            ?.getAttribute("data-rd-repository-panel") ?? null;
        return rows.length > 0 && (panel === null || shown === panel);
      },
      [PLUGIN_ID, expectedPanel],
      { timeout: 12000, polling: 50 }
    )
    .catch(() => {});
};
await waitForTopicsReady();

const indexRows = await page.evaluate((pluginId) => {
  const nodes = document.querySelectorAll(
    `div[data-plugin-id="${pluginId}"] [data-rd-index-topic]`
  );
  return [...nodes].map((node) => ({
    count:
      node.querySelector("[data-rd-index-current]")?.getAttribute("data-rd-index-current") ?? null,
    name: node.getAttribute("data-rd-index-topic"),
    pressed: node.getAttribute("aria-pressed"),
    stale: node.getAttribute("data-rd-topic-stale"),
    text: (node.innerText ?? "").replace(/\s+/g, " "),
  }));
}, PLUGIN_ID);
check("the topic index rendered", indexRows.length > 0, `${indexRows.length} index rows`);

// Read on the Topics tab, where the window control must NOT be: §13 scopes the 7/14/30/All control to
// Overview's own heading, and removes the archived toggle. Both are asserted as absences so re-adding a
// global control fails here rather than passing quietly. The counts line is asserted on the default
// Overview screen above, where it is rendered whichever tab follows.
const header = await page.evaluate((pluginId) => {
  const node = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
  const text = (node?.innerText ?? "").replace(/\s+/g, " ");
  return {
    archivedToggle: text.includes("archived"),
    createControl: /Add topic|New topic name/.test(text),
    editControl: /Edit fields|Done editing/.test(text),
    windowButtons: node?.querySelectorAll("[data-rd-window]").length ?? 0,
  };
}, PLUGIN_ID);
check(
  "the Topics header carries no create/edit control, no global window control and no archived toggle (§13)",
  // D7 (Topics is read-first): the page offers no broad create or edit control, so this asserts their
  // absence — re-adding one fails here rather than passing quietly.
  header.windowButtons === 0 &&
    !header.createControl &&
    !header.editControl &&
    !header.archivedToggle,
  JSON.stringify(header)
);

// Each topic in the payload has one index row, and the visible detail carries its own topic's axes and
// none of another topic's. Both halves are read off the payload, so the check holds for one topic or
// twenty. (C1: this was per-card while every card carried its own axes; the detail shows one topic at a
// time, so the "own axes" half is now read from the selected detail.)
// The detail's own content — the claims, the axis rows — arrives with `get_topic`, one tick after the
// pane exists (the pane is up as soon as the overview names the selected topic). This runs above the
// `settleUntil` declaration, so it waits directly; a timeout here is not fatal, the assertions below
// report what they actually found.
await page
  .waitForFunction(
    ([pluginId, topic]) =>
      document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"] [data-rd-claim="summary"]`
      ) !== null,
    [PLUGIN_ID, CORPUS.topic],
    { timeout: 8000, polling: 50 }
  )
  .catch(() => {});
await page.waitForTimeout(50);
const detailProbe = await page.evaluate(
  ([pluginId, topic]) => {
    const pane = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    return {
      text: (pane?.innerText ?? "").replace(/\s+/g, " "),
      context: (pane?.querySelector("[data-rd-detail-context]")?.innerText ?? "").replace(
        /\s+/g,
        " "
      ),
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
// The claim is about what the detail carries, not only about what is painted. Reading the pane's
// rendered text alone cannot see inside a closed <details>, and the C1 rework folds completed/abandoned
// axes exactly that way — on a dataset that has terminal axes (the fixture does, the corpus does not)
// the old text-only reading reported the folded axes as missing from a pane that was rendering them
// correctly, and would equally have missed a leak hidden inside a fold. So the DOM is the evidence:
// every own axis must be present as a card, an axis that is not in the rendered text must be accounted
// for by the fold, the fold's stated count must match what it holds, and no other topic's axis may
// appear at all.
const detailAxes = await page.evaluate(
  ([pluginId, topic]) => {
    const pane = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    // The pivoted Projects detail renders each workstream as the shared compact card
    // (article[data-rd-work-card]) whose title is the card's own Progress link, not the retired
    // in-detail axis block (data-rd-axis-title). The fold (data-rd-folded-axes) is unchanged.
    const cards = [...(pane?.querySelectorAll("[data-rd-work-card]") ?? [])].map((node) => ({
      folded: node.closest("details[data-rd-folded-axes]") !== null,
      title: (node.querySelector(".rd-work-link")?.textContent ?? "").trim(),
    }));
    const fold = pane?.querySelector("details[data-rd-folded-axes]");
    const foldedCount = fold ? Number(fold.getAttribute("data-rd-folded-axes")) : 0;
    const foldedSummary = (fold?.querySelector("summary")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const stated = /\((\d+)\)/.exec(foldedSummary);
    return {
      cards,
      foldedCount,
      foldedStated: stated === null ? null : Number(stated[1]),
      foldedSummary,
      rendered: (pane?.innerText ?? "").replace(/\s+/g, " "),
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
const rowIssues = [];
for (const entry of CORPUS.topicAxes) {
  if (!indexRows.some((row) => row.name === entry.topic)) {
    rowIssues.push(`${entry.topic}: no index row`);
  }
}
const ownAxes = CORPUS.topicAxes.find((entry) => entry.topic === CORPUS.topic)?.axes ?? [];
for (const title of ownAxes) {
  const card = detailAxes.cards.find((entry) => entry.title === title);
  if (card === undefined) {
    rowIssues.push(`${CORPUS.topic}: own axis missing from the detail (${title})`);
  } else if (!card.folded && !detailAxes.rendered.includes(title)) {
    rowIssues.push(`${CORPUS.topic}: own axis neither rendered nor folded (${title})`);
  }
}
const foldedCards = detailAxes.cards.filter((entry) => entry.folded).length;
if (foldedCards !== detailAxes.foldedCount) {
  rowIssues.push(`the fold holds ${foldedCards} axis(es) but states ${detailAxes.foldedCount}`);
}
if (foldedCards > 0 && detailAxes.foldedStated !== foldedCards) {
  rowIssues.push(
    `the fold's summary (${JSON.stringify(detailAxes.foldedSummary)}) does not state its ${foldedCards} axis(es)`
  );
}
for (const entry of CORPUS.topicAxes) {
  if (entry.topic === CORPUS.topic) {
    continue;
  }
  for (const title of entry.axes) {
    if (detailAxes.cards.some((card) => card.title === title)) {
      rowIssues.push(`detail leaked ${entry.topic}'s axis (${title})`);
    }
  }
}
check(
  "every topic in the payload has one index row, and the visible detail carries its own topic's axes and none of another's",
  indexRows.length === CORPUS.topicNames.length && rowIssues.length === 0,
  `${indexRows.length} rows for ${CORPUS.topicNames.length} topics; ${ownAxes.length} own axis(es), ${foldedCards} folded and counted; ${rowIssues.length ? rowIssues.join("; ") : "no leaks"}`
);
const pressedRow = indexRows.find((row) => row.pressed === "true");
// The detail must carry the SELECTED topic's own participants, never the org-wide first person. The
// ACTIVE-project pivot puts a topic with no linked person beside one with a participant, and the previous
// form (CORPUS.people[0]) asserted a stranger's name against a topic that never named them — a cross-topic
// mis-scope, not a product fact.
const topicPeopleNames = (CORPUS.topicPeople ?? []).map((person) => person.displayName);
const detailCarriesOwnPeople =
  topicPeopleNames.length === 0
    ? // No linked person: the detail must not claim one — no org person's name may appear in the context.
      !CORPUS.people.some((person) => detailProbe.context.includes(person.name))
    : topicPeopleNames.some((name) => detailProbe.context.includes(name));
const nonTerminal = Object.entries(CORPUS.axisCounts)
  .filter(([state]) => state !== "completed" && state !== "abandoned")
  .reduce((sum, [, n]) => sum + n, 0);
check(
  "the selected index row states its current-axis count, and the detail carries its people",
  pressedRow !== undefined &&
    /workstream/.test(pressedRow.text) &&
    (CORPUS.topicNames.length !== 1 || Number(pressedRow.count) === nonTerminal) &&
    detailCarriesOwnPeople,
  `row "${pressedRow?.text}" (data-rd-index-current=${pressedRow?.count}; payload non-terminal ${nonTerminal}); ` +
    `topic people ${JSON.stringify(topicPeopleNames)}; detail context "${detailProbe.context.slice(0, 140)}"`
);

const recencyLabels = await page.evaluate(
  (pluginId) =>
    document.querySelectorAll(`div[data-plugin-id="${pluginId}"] .rd-topic-index [data-rd-recency]`)
      .length,
  PLUGIN_ID
);
// Zero-activity recency is an explicit empty, valid state: a topic with no recorded activity renders no
// recency marker (that silence IS its state — the component's `at=null` branch is the "never" reading, not
// a label per row). So the honest assertion is not "one label per row" but "one marker per row the payload
// says has activity" — read from each topic's own `lastActivityAt`.
const rowsWithActivity = indexRows.filter(
  (row) => (CORPUS.topicLastActivity?.[row.name] ?? null) !== null
).length;
check(
  "the index rail reports each topic's last activity, and a topic with none is an explicit empty state",
  recencyLabels === rowsWithActivity,
  `${recencyLabels} recency label(s) for ${rowsWithActivity} row(s) with recorded activity of ${indexRows.length} index row(s)`
);

if (CORPUS.blockedEntries.length > 0) {
  // This branch runs above the `settleUntil` declaration (only the fixture has a blocked axis, so the
  // corpus never reached it and the fault hid until the fixture ran), so it waits directly.
  const waitInDetail = (topic, selector, capMs = 6000) =>
    page
      .waitForFunction(
        ([pluginId, name, sel]) =>
          document.querySelector(
            `div[data-plugin-id="${pluginId}"] [data-rd-detail="${name}"] ${sel}`
          ) !== null,
        [PLUGIN_ID, topic, selector],
        { polling: 50, timeout: capMs }
      )
      .catch(() => {});
  const blockedEntry = CORPUS.blockedEntries[0];
  await root.locator(`[data-rd-index-topic="${blockedEntry.topic}"]`).click();
  // The pivot's Projects detail renders the compact workstream card (`[data-rd-work-card]`), whose state is
  // `data-rd-state`. The retired per-axis block hook (`[data-rd-axis-state]`) no longer exists there.
  await waitInDetail(blockedEntry.topic, '[data-rd-work-card][data-rd-state="blocked"]');
  const blockedCard = await page.evaluate(
    ([pluginId, topic]) => {
      const node = document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"] [data-rd-work-card][data-rd-state="blocked"]`
      );
      return {
        present: Boolean(node),
        state: node?.getAttribute("data-rd-state") ?? null,
        text: (node?.innerText ?? "").replace(/\s+/g, " "),
      };
    },
    [PLUGIN_ID, blockedEntry.topic]
  );
  // The compact Projects card carries the state, NOT the blocker's prose (the pivot removed the in-card
  // blocker line and moved the full blocker to the Progress context panel). Rather than fake the old
  // condition against a hook the pivot retired, this check is RETIRED here and its substance is asserted on
  // the current Progress surface by the additive blocked-workstream check below.
  retired(
    "the blocked axis shows its blocker text",
    blockedCard.text.includes(`Blocker: ${blockedEntry.blocker}`),
    blockedCard.text.slice(0, 200),
    "the Projects detail is the compact workstream card (data-rd-work-card) and does not restate the blocker; " +
      "the blocker's prose is asserted on the Progress context panel (data-rd-axis-blocker) by the additive check"
  );
  check(
    "a topic with a blocked axis is visually distinct",
    blockedCard.present && blockedCard.state === "blocked" && /blocked/i.test(blockedCard.text),
    `blocked work-card present ${blockedCard.present}, data-rd-state ${JSON.stringify(blockedCard.state)}, ` +
      `text "${blockedCard.text.slice(0, 80)}"`
  );
  // Back to the topic the checks below read.
  await root.locator(`[data-rd-index-topic="${CORPUS.topic}"]`).click();
  await waitInDetail(CORPUS.topic, '[data-rd-claim="summary"]');
} else {
  skip("the blocked axis shows its blocker text", "no axis in this corpus is blocked");
  skip(
    "a topic with a blocked axis is visually distinct",
    "no axis in this corpus is blocked, so the attention styling has no subject here"
  );
}

// The 7/14/30/All window control is retired by the pivot: Overview — the only window-scoped tab — is gone,
// and every view reads all time (activitySinceDays: 0). The control therefore has no subject, so its two
// checks are reported as SKIPs — never silently passed. The `settleUntil` readiness helper the rest of the
// pass uses is defined here, unchanged.
skip(
  "the window control re-issues get_overview with the new window only",
  "the 7/14/30/All window control is retired (the pivot); every view reads all time (activitySinceDays: 0)"
);
// A fixed sleep is a guess about how long a re-render takes, and it is the classic harness flake. Where the
// page's own DOM says what "ready" means, wait for that instead: the wait returns as soon as the condition
// holds (usually far sooner than the sleep it replaces) and cannot pass by luck on a slow machine. The cap is
// a bound, not the expected wait — if the condition never holds, the check below reports a real failure
// instead of the runner timing out.
const settleUntil = async (predicate, arg, capMs = 3000) => {
  await page.waitForFunction(predicate, arg, { timeout: capMs, polling: 50 }).catch(() => {});
  await page.waitForTimeout(50); // one frame, for a React commit that follows the DOM marker
};
skip(
  "the page still renders after the window change",
  "the window control is retired, so there is no window change to render after"
);
// The pass reads the Projects (Topics) view; it is already the default, but the navigation is explicit so the
// sections below read the view they describe. (The retired Overview tab that used to be the round-trip
// destination no longer exists.)
await root.locator('[data-rd-view-option="topics"]').click();
await page.waitForSelector(`div[data-plugin-id] [data-rd-view="topics"]`, { timeout: 10000 });
await waitForTopicsReady();

// C1 replaced the topic card stack with an index rail and ONE persistent detail. The assertions below are
// what that composition must be true of. The disclosure they replace (`Read topic` / `Close`), and the
// truncation notice that went with it, no longer exist to check.
const anatomy = await page.evaluate(
  ([pluginId]) => {
    const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
    const rows = [...(scope?.querySelectorAll("[data-rd-index-topic]") ?? [])];
    const panes = [...(scope?.querySelectorAll("[data-rd-detail]") ?? [])];
    const pane = panes[0] ?? null;
    const fold = pane?.querySelector("details[data-rd-folded-axes]") ?? null;
    const currentWork = pane?.querySelector("[data-rd-current-work]") ?? null;
    // textContent, not innerText: the detail's Notes title lives inside the "Notes & corrections"
    // disclosure, and a CLOSED <details> gives innerText "" for its hidden content.
    const titled = (label) =>
      [...(pane?.querySelectorAll(".rd-side-title") ?? [])].filter(
        (node) => (node.textContent ?? "").trim() === label
      ).length;
    return {
      rail: scope?.querySelector(".rd-topic-index") !== null,
      detail: scope?.querySelector(".rd-topic-detail") !== null,
      labels: rows.map((row) => row.getAttribute("data-rd-index-topic")),
      rows: rows.length,
      panes: panes.length,
      paneLabel: pane?.getAttribute("data-rd-detail") ?? null,
      pressed: rows
        .filter((row) => row.getAttribute("aria-pressed") === "true")
        .map((row) => row.getAttribute("data-rd-index-topic")),
      disclosure: [...(scope?.querySelectorAll("button") ?? [])]
        .map((button) => (button.innerText ?? "").replace(/\s+/g, " ").trim())
        .filter((label) => label === "Read topic" || label === "Close"),
      countStrip: pane?.querySelectorAll("[data-rd-detail-counts]").length ?? 0,
      foldPresent: fold !== null,
      foldOpen: fold?.hasAttribute("open") ?? null,
      currentWorkVisible: currentWork !== null && currentWork.getBoundingClientRect().height > 0,
      // The Projects detail no longer carries a side rail: its activity is its own collapsible
      // section, its Notes live in the "Notes & corrections" disclosure, and its repositories are the
      // "Supporting repositories" references. Read those subjects at their current hooks.
      sideActivity: pane?.querySelector("[data-rd-topic-activity]") !== null ? 1 : 0,
      sideNotes: titled("Notes"),
      sideRepositories:
        (pane?.querySelector(".rd-references .rd-context-label")?.textContent ?? "").trim() ===
        "Supporting repositories"
          ? 1
          : 0,
      noteInput: pane?.querySelectorAll('[aria-label="Topic note"]').length ?? 0,
      // §7 and the rail's window (C1's hierarchy pass).
      shellTitle: (scope?.querySelector(".rd-page-title")?.innerText ?? "").trim(),
      viewHeading: (scope?.querySelector("[data-rd-view-title]")?.innerText ?? "").trim(),
      viewHeadingView:
        scope?.querySelector("[data-rd-view-heading]")?.getAttribute("data-rd-view-heading") ?? null,
      activityShown: Number(
        pane?.querySelector("[data-rd-topic-activity]")?.getAttribute("data-rd-topic-activity-shown") ?? -1
      ),
      activityTotal: Number(
        pane?.querySelector("[data-rd-topic-activity]")?.getAttribute("data-rd-topic-activity") ?? -1
      ),
      activityRemainder: Number(
        pane?.querySelector("[data-rd-topic-activity-more]")?.getAttribute("data-rd-topic-activity-more") ?? -1
      ),
      activityNote: (pane?.querySelector("[data-rd-topic-activity-note]")?.innerText ?? "").trim(),
    };
  },
  [PLUGIN_ID]
);
check("the topic rail exists (.rd-topic-index)", anatomy.rail === true, `rail ${anatomy.rail}`);
check("the topic detail exists (.rd-topic-detail)", anatomy.detail === true, `detail ${anatomy.detail}`);
check(
  "exactly one topic detail pane is present",
  anatomy.panes === 1,
  `${anatomy.panes} panes for ${anatomy.rows} index rows`
);
check(
  "the detail is always present, with no interaction needed",
  anatomy.detail && anatomy.panes === 1 && anatomy.pressed.length === 1,
  `pressed index rows ${JSON.stringify(anatomy.pressed)}`
);
check(
  "the selected index row and the visible detail refer to the same topic",
  anatomy.pressed.length === 1 && anatomy.pressed[0] === anatomy.paneLabel,
  `selected row ${JSON.stringify(anatomy.pressed)}, pane ${anatomy.paneLabel}`
);
check(
  "no Read topic / Close disclosure control exists",
  anatomy.disclosure.length === 0,
  `found ${JSON.stringify(anatomy.disclosure)}`
);
check(
  "the state-count strip is gone from the topic detail",
  anatomy.countStrip === 0,
  `${anatomy.countStrip} count strip(s) in the detail`
);
check(
  "Current work is visible without a disclosure",
  anatomy.currentWorkVisible === true,
  `current-work lane visible: ${anatomy.currentWorkVisible}`
);
check(
  "the detail carries its activity list, its Notes and its supporting repositories",
  anatomy.sideActivity === 1 && anatomy.sideNotes === 1 && anatomy.sideRepositories === 1,
  `activity ${anatomy.sideActivity}, notes ${anatomy.sideNotes}, repositories ${anatomy.sideRepositories}`
);
// ------------------------------------------------------- §7 (as amended by §13): the view names itself
// §13 superseded §7's "persistent Research overview heading": the top bar now carries a dashboard brand
// (static text), while each view still names itself — and its prototype hint — above the layout. So the
// claim kept here is the view's own heading; the brand is asserted constant across the tabs in the §7
// traversal below (where every view is read) rather than pinned to a string the owner is still tuning.
check(
  "the view names itself while the shell keeps a static brand (§7 as amended by §13)",
  anatomy.viewHeading === "Projects" &&
    anatomy.viewHeadingView === "topics" &&
    anatomy.shellTitle.length > 0 &&
    anatomy.shellTitle !== anatomy.viewHeading,
  `view heading ${JSON.stringify(anatomy.viewHeading)} (${anatomy.viewHeadingView}), ` +
    `shell title ${JSON.stringify(anatomy.shellTitle)}`
);
// ------------------------------------- the rail's window: newest few events, remainder stated, not dropped
// The montage review found the rail running long enough that Notes and Related repositories — the rest of
// the topic's context — never reached the first screen: the rail read as an activity feed. It now leads
// with the newest few and states the rest, the same treatment the Progress feed uses. `total` stays the
// payload's own number, so capping what is *shown* never changes what the page says there *is* (D5).
//
// Two rules this block learned the hard way, both from the 1280x800 record:
//
//   * read the rail only AFTER its detail has landed. While the pane is up but `get_topic` has not
//     answered, the total attribute falls back to the index row's own count — 504 on the corpus topic
//     against the detail's 25 — and a check that reads then reports a composition fault where the truth is
//     a read that had not arrived. Waiting on the rail's own list (not the pane) is the same discipline the
//     note affordance below uses.
//   * a check that CLICKS must assert its control exists first. Clicking a control that is not rendered
//     does not fail the check, it aborts the whole pass on a 30s locator timeout — and an aborted run is a
//     lost record, not a verdict.
//
// On that 1280x800 record the cause of the missing detail was the instance, not the page: `SQLiteError:
// database is locked` made the action answer 500 three times, the page rendered its own error banner, and
// the rail never had data. That is why a load failure here is now ONE failure naming the banner, and the
// two interaction checks that depend on the list skip with the same reason — never an abort.
const railProbe = () =>
  page.evaluate(
    ([pluginId, topic]) => {
      const panel = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
      const pane = panel?.querySelector(`[data-rd-detail="${topic}"]`);
      const list = pane?.querySelector("[data-rd-topic-activity]");
      const banners = [...(panel?.querySelectorAll('[role="alert"], .rd-banner, .rd-error') ?? [])]
        .map((node) => (node.textContent ?? "").trim())
        .filter((text) => text.length > 0);
      // The rail's window is now a numbered backend pager (the pivot paged the topic activity rather
      // than an inline "show the rest" toggle): the list shows one page (5), the pager states the range
      // and the payload's own total, and further rows are one page-step away.
      const pager = pane?.querySelector(".rd-topic-activity-fold .rd-pager");
      const shown = Number(list?.getAttribute("data-rd-topic-activity-shown") ?? -1);
      const total = Number(list?.getAttribute("data-rd-topic-activity") ?? -1);
      return {
        banners,
        landed:
          pane !== null && list !== null && !(list.textContent ?? "").includes("Loading this topic"),
        remainder: shown >= 0 && total >= 0 ? Math.max(0, total - shown) : -1,
        note: (pager?.querySelector("[data-rd-pager-range]")?.textContent ?? "").trim(),
        pagerButtons: pager?.querySelectorAll(".rd-pager-btn").length ?? 0,
        rows: list?.querySelectorAll("li").length ?? -1,
        shown,
        total,
      };
    },
    [PLUGIN_ID, CORPUS.topic]
  );
const railLanded = await page
  .waitForFunction(
    ([pluginId, topic]) => {
      const list = document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"] [data-rd-topic-activity]`
      );
      return list !== null && !(list.textContent ?? "").includes("Loading this topic");
    },
    [PLUGIN_ID, CORPUS.topic],
    { timeout: 20000 }
  )
  .then(() => true)
  .catch(() => false);
const rail = await railProbe();
const railCause =
  rail.banners.length > 0
    ? `the page rendered ${JSON.stringify(rail.banners.join(" · "))}`
    : 'the rail still read "Loading this topic" after 20s';
const RAIL_LEAD_CHECK = "the rail leads with the newest few events and states the rest, rather than running long";
const RAIL_EXPAND_CHECK =
  "the rail's remainder is one control away, and showing it changes only what is shown";
const RAIL_COLLAPSE_CHECK = "the rail returns to its lead when the reader asks for fewer";
if (!rail.landed) {
  check(RAIL_LEAD_CHECK, false, `the topic detail never landed (${railCause})`);
  skip(RAIL_EXPAND_CHECK, `the topic detail never landed (${railCause}), so the rail has no window to read`);
  skip(RAIL_COLLAPSE_CHECK, `the topic detail never landed (${railCause}), so there is nothing to collapse`);
} else if (rail.total <= RAIL_ACTIVITY_LEAD) {
  skip(
    RAIL_LEAD_CHECK,
    `this topic carries ${rail.total} event(s), at or below the rail's lead of ` +
      `${RAIL_ACTIVITY_LEAD} — the corpus topic carries 25, so that run discriminates`
  );
  skip(RAIL_EXPAND_CHECK, `this topic carries ${rail.total} event(s) — nothing is held back to expand to`);
  skip(RAIL_COLLAPSE_CHECK, `this topic carries ${rail.total} event(s) — the rail leads with all of them`);
} else {
  check(
    RAIL_LEAD_CHECK,
    rail.shown === RAIL_ACTIVITY_LEAD &&
      rail.rows === RAIL_ACTIVITY_LEAD &&
      rail.remainder === rail.total - RAIL_ACTIVITY_LEAD &&
      /of \d+ available/.test(rail.note) &&
      rail.note.includes(String(rail.total)) &&
      rail.pagerButtons > 0,
    `${rail.shown} of ${rail.total} shown (remainder attr ${rail.remainder}, rows ${rail.rows}), ` +
      `note ${JSON.stringify(rail.note)}`
  );
  // The rest is one control away, and showing it changes nothing but what is shown: the count the rail
  // reports is still the payload's own. The control is asserted before it is clicked.
  const nextControl = root.locator(
    `[data-rd-detail="${CORPUS.topic}"] .rd-topic-activity-fold .rd-pager-switch button`,
    { hasText: "Next" }
  );
  const prevControl = root.locator(
    `[data-rd-detail="${CORPUS.topic}"] .rd-topic-activity-fold .rd-pager-switch button`,
    { hasText: "Previous" }
  );
  if ((await nextControl.count()) === 0) {
    check(
      RAIL_EXPAND_CHECK,
      false,
      `the activity list shows ${rail.shown} of ${rail.total} but offers no pager for the rest`
    );
    skip(RAIL_COLLAPSE_CHECK, "there was no pager, so there is nothing to page back from");
  } else {
    const beforeExpand = await railProbe();
    await nextControl.first().click();
    await page.waitForTimeout(400);
    const expanded = await railProbe();
    check(
      RAIL_EXPAND_CHECK,
      beforeExpand.rows === RAIL_ACTIVITY_LEAD &&
        expanded.total === beforeExpand.total &&
        expanded.note !== beforeExpand.note &&
        expanded.rows > 0,
      `${beforeExpand.rows} row(s) on "${beforeExpand.note}", ${expanded.rows} on "${expanded.note}" ` +
        `(total ${expanded.total})`
    );
    // Page back to the lead, so every later measurement and every screenshot is of the default window.
    await prevControl.first().click();
    await page.waitForTimeout(400);
    const collapsedAgain = await railProbe();
    check(
      RAIL_COLLAPSE_CHECK,
      collapsedAgain.rows === RAIL_ACTIVITY_LEAD &&
        collapsedAgain.note === beforeExpand.note,
      `${collapsedAgain.rows} row(s) back on "${collapsedAgain.note}"`
    );
  }
}
// The note affordance lives inside the detail the read action loads, so the pane being up does NOT mean
// its async detail has landed. Wait on a get_topic-only element — the note input itself — then re-probe,
// rather than asserting on a probe taken the instant the pane appeared. (This is what made the fixture
// fail and the corpus pass: same code, different read latency.)
// The affordance belongs to the selected pane, resolved exactly as the D7 check below resolves it: ONE
// scoped query, `[data-rd-detail="<topic>"]` under the plugin root. The pane is not a descendant of the
// [data-rd-view="topics"] element, so a probe assuming that reported 0 note inputs for a pane that was
// rendering the form the whole time — the sibling D7 check counted 1 in the same frame. Wait for the
// detail to land and let D7 assert it, instead of keeping a second probe that can only disagree.
await page
  .waitForFunction(
    ([pluginId, topic]) =>
      (document.querySelector(`div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`)
        ?.querySelectorAll('[aria-label="Topic note"]').length ?? 0) > 0,
    [PLUGIN_ID, CORPUS.topic],
    { polling: 100, timeout: 8000 }
  )
  .catch(() => {});

// ------------------------------------------------------------------ C1 geometry (container-relative)
// The host owns the page and its width varies (the Nakama shell consumes ~296px of a 1280 viewport),
// so every measurement is relative to the plugin container, never an absolute prototype width. What is
// asserted is the composition's *shape*: rail left of detail, tops aligned, detail the wider pane, rail
// a rail rather than a column, both panes beginning in the first viewport, and — the point of the unit —
// Current Work materially wider than the side rail, so the detail reads as the work rather than as a
// report with a sidebar.
const geometry = await page.evaluate(
  ([pluginId, topic]) => {
    const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
    if (!scope) {
      return null;
    }
    const box = (node) => {
      if (!node) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      return { h: rect.height, left: rect.left, right: rect.right, top: rect.top, w: rect.width };
    };
    const pane = scope.querySelector(`[data-rd-detail="${topic}"]`);
    return {
      container: box(scope),
      detail: box(pane),
      index: box(scope.querySelector(".rd-topic-index")),
      main: box(pane?.querySelector("[data-rd-current-work]") ?? null),
      rail: box(pane?.querySelector(".rd-side-stack") ?? null),
      sideCards: [...(pane?.querySelectorAll(".rd-side-stack .rd-side-card") ?? [])].map((card) =>
        box(card)
      ),
      viewport: { h: window.innerHeight, w: window.innerWidth },
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
if (geometry === null || geometry.index === null || geometry.detail === null) {
  skip(
    "the topic rail and the detail are laid out side by side",
    `the rail or the detail is not on the page (rail ${geometry?.index !== null}, detail ${geometry?.detail !== null})`
  );
} else {
  const g = geometry;
  const aligned = (a, b) => Math.abs(a.top - b.top) <= 2;
  const share = g.index.w / g.container.w;
  check(
    "the topic rail sits left of the detail, tops aligned, with the detail the wider pane",
    g.index.right <= g.detail.left + 1 && aligned(g.index, g.detail) && g.detail.w > g.index.w,
    `rail ${Math.round(g.index.left)}..${Math.round(g.index.right)} (w ${Math.round(g.index.w)}) | ` +
      `detail ${Math.round(g.detail.left)}..${Math.round(g.detail.right)} (w ${Math.round(g.detail.w)}); ` +
      `tops ${Math.round(g.index.top)} / ${Math.round(g.detail.top)}`
  );
  // The accepted pivot fixes the selector rail at a compact 380px, so its share of the container is a
  // function of the host width, not a fixed fraction: the rail is a rail because it is a fixed compact
  // width, left of the detail and narrower than it (measured 380px against a wider detail pane).
  check(
    "the index reads as a rail, not a column of the page (a fixed compact selector rail, narrower than the detail)",
    share >= 0.2 && g.index.w <= 420 && g.index.w < g.detail.w,
    `rail ${Math.round(g.index.w)}px of a ${Math.round(g.container.w)}px container = ${(share * 100).toFixed(1)}%; detail ${Math.round(g.detail.w)}px`
  );
  check(
    "both panes begin within the first viewport",
    g.index.top < g.viewport.h && g.detail.top < g.viewport.h,
    `rail top ${Math.round(g.index.top)}, detail top ${Math.round(g.detail.top)}, viewport ${g.viewport.h}`
  );
  if (g.main === null || g.rail === null) {
    skip(
      "inside the detail, Current Work is left of the side rail and materially wider",
      `the detail has no current-work lane or no side rail (main ${g.main !== null}, rail ${g.rail !== null})`
    );
  } else {
    check(
      "inside the detail, Current Work is left of the side rail, tops aligned",
      g.main.right <= g.rail.left + 1 && aligned(g.main, g.rail),
      `main ${Math.round(g.main.left)}..${Math.round(g.main.right)} | rail ${Math.round(g.rail.left)}..${Math.round(g.rail.right)}; ` +
        `tops ${Math.round(g.main.top)} / ${Math.round(g.rail.top)}`
    );
    check(
      "Current Work is materially wider than the side rail — the detail reads as the work, not as a report with a sidebar",
      g.main.w >= 1.25 * g.rail.w,
      `main ${Math.round(g.main.w)}px / side rail ${Math.round(g.rail.w)}px = ${(g.main.w / g.rail.w).toFixed(2)}x (needs 1.25x)`
    );
  }
  // V1 Phase-4 ruling (DECISIONS §14.10): the rail's sections are **no longer all required to begin within
  // the first viewport**. The ruled condition is: the primary and second sections stay initially
  // discoverable; later sections may continue below the fold **provided ordinary page scrolling reaches
  // them without clipping, overlap, or an unintended nested scroller**. Measured at the reference viewport
  // the run is at, on the page's own geometry — the card tops, the page scrollport, and what a real page
  // scroll exposes — never an assumption about how many fit.
  const railRule = await page.evaluate(
    ([pluginId, topic]) => {
      const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
      const pane = scope?.querySelector(`[data-rd-detail="${topic}"]`);
      const stack = pane?.querySelector(".rd-side-stack") ?? null;
      if (stack === null) return null;
      const box = (node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width };
      };
      // The scrollable ancestors between the stack and the document that CAN scroll (the host's own page
      // scrollport is the intended one; anything else that actually scrolls is an unintended nested
      // scroller), plus the document viewport scroller — the ordinary page scroll — which is what moves the
      // page in host layouts where the content is not constrained to an inner port.
      const scrollables = [];
      for (let node = stack.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const cs = getComputedStyle(node);
        if (!/auto|scroll/.test(`${cs.overflowX}${cs.overflowY}`)) continue;
        if (node.scrollHeight <= node.clientHeight + 2) continue;
        scrollables.push(node);
      }
      const doc = document.scrollingElement ?? document.documentElement;
      const docScrolls = doc.scrollHeight > doc.clientHeight + 2;
      const before = scrollables.map((node) => node.scrollTop);
      const beforeY = window.scrollY;
      const cards = [...stack.querySelectorAll(".rd-side-card")].map(box);
      // A real page scroll to the bottom, then read the last section's box. Restored afterwards so the rest
      // of the pass reads the page where it left it.
      for (const node of scrollables) node.scrollTop = node.scrollHeight;
      if (docScrolls) window.scrollTo(0, doc.scrollHeight);
      const lastCard = stack.querySelectorAll(".rd-side-card")[cards.length - 1];
      const lastAfterScroll = lastCard ? box(lastCard) : null;
      const outer = scrollables.length ? box(scrollables[0]) : docScrolls ? box(doc) : null;
      scrollables.forEach((node, i) => {
        node.scrollTop = before[i];
      });
      if (docScrolls) window.scrollTo(0, beforeY);
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        cards,
        lastAfterScroll,
        outer,
        // The nearest scrolling ancestor is the intended host scroller; `outer` is its client rect read after
        // it was scrolled to its bottom (a scroll container's own rect does not move when its content does).
        intendedScroller: scrollables[0]
          ? `${scrollables[0].tagName.toLowerCase()}.${String(scrollables[0].className).trim().split(/\s+/)[0] || "scrollport"}`
          : docScrolls
            ? "document"
            : "none",
        scrollsSomewhere: scrollables.length > 0 || docScrolls,
        nestedScrollers: scrollables.length,
      };
    },
    [PLUGIN_ID, CORPUS.topic]
  );
  if (railRule === null || railRule.cards.length < 2) {
    skip(
      "the rail's primary and second sections begin in the first viewport, and every later section is reached by ordinary page scrolling",
      `the rail renders ${railRule?.cards?.length ?? 0} side card(s), so there is no second section to require`
    );
  } else {
    const rr = railRule;
    const noOverlap = rr.cards.every((card, i) => i === 0 || card.top >= rr.cards[i - 1].bottom - 1);
    const within = rr.outer === null || rr.cards.every((card) => card.left >= rr.outer.left - 0.5 && card.right <= rr.outer.right + 0.5);
    const last = rr.cards[rr.cards.length - 1];
    // Bound reachability by what actually shows the last section: the intended host scrollport's client bottom
    // when the host constrains the page to an inner port, otherwise the window. `outer` is that port's client
    // rect; a window-only bound would accept content the port still clips. Never looser than the window.
    const reachBound = rr.outer ? Math.min(rr.viewport.h, rr.outer.bottom) : rr.viewport.h;
    const reachable =
      rr.scrollsSomewhere && rr.lastAfterScroll !== null && rr.lastAfterScroll.bottom <= reachBound + 0.5;
    check(
      "the rail's primary and second sections begin in the first viewport, and every later section is reached by ordinary page scrolling without clipping, overlap or a nested scroller",
      rr.cards[0].top < rr.viewport.h &&
        rr.cards[1].top < rr.viewport.h &&
        rr.cards.every((card) => card.w >= 120) &&
        noOverlap &&
        within &&
        reachable &&
        rr.nestedScrollers <= 1,
      `viewport ${rr.viewport.w}×${rr.viewport.h}; primary/second tops ${Math.round(rr.cards[0].top)} / ${Math.round(rr.cards[1].top)}; all tops ${rr.cards.map((card) => Math.round(card.top)).join(" / ")}; last card bottom after a full page scroll ${rr.lastAfterScroll ? Math.round(rr.lastAfterScroll.bottom) : "?"} of ${Math.round(reachBound)} (window ${rr.viewport.h}, intended scroller ${rr.intendedScroller}); sections overlap: ${!noOverlap}; the page can scroll: ${rr.scrollsSomewhere}; within the page scrollport: ${within}; min section width ${Math.round(Math.min(...rr.cards.map((card) => card.w)))}px (needs 120); nested scrolling ancestors: ${rr.nestedScrollers}`
    );
  }
}
if (anatomy.foldPresent === false) {
  skip(
    "completed/abandoned work is folded, closed initially, and opens on demand",
    `no completed or abandoned axis in this dataset (states: ${JSON.stringify([
      ...new Set(CORPUS.axes.map((axis) => axis.state)),
    ])})`
  );
} else {
  check(
    "completed/abandoned work is folded, and the fold is closed initially",
    anatomy.foldOpen === false,
    `fold open before any click: ${anatomy.foldOpen}`
  );
  await root.locator("[data-rd-detail] details[data-rd-folded-axes] summary").first().click();
  await page.waitForTimeout(300);
  const foldOpened = await page.evaluate(
    (pluginId) =>
      document
        .querySelector(`div[data-plugin-id="${pluginId}"] details[data-rd-folded-axes]`)
        ?.hasAttribute("open") ?? false,
    PLUGIN_ID
  );
  check(
    "the completed/abandoned fold opens on demand",
    foldOpened === true,
    `open after a click: ${foldOpened}`
  );
  // The fold renders each terminal workstream as the compact work card (`data-rd-work-card`), whose title
  // is its own Progress link. The retired in-detail axis block (`data-rd-axis-title`) is gone, so the old
  // reader found nothing and reported a correct fold as a FAIL (finding F3). Read the current hook and
  // compare the rendered titles to the EXACT stored terminal workstreams — not mere presence.
  const foldedRendered = await page.evaluate(
    (pluginId) =>
      [
        ...document.querySelectorAll(
          `div[data-plugin-id="${pluginId}"] details[data-rd-folded-axes] [data-rd-work-card]`
        ),
      ].map((node) => ({
        text: (node.innerText ?? "").replace(/\s+/g, " "),
        title: (node.querySelector(".rd-work-link")?.textContent ?? "").trim(),
      })),
    PLUGIN_ID
  );
  const terminalTitles = CORPUS.axes
    .filter((axis) => axis.state === "completed" || axis.state === "abandoned")
    .map((axis) => axis.title);
  const foldIssues = foldTextIssues({ rendered: foldedRendered, terminalTitles });
  check(
    "the folded axes render their own text once the fold is open",
    foldIssues.length === 0,
    foldIssues.join("; ") ||
      foldedRendered
        .map((card, index) => `folded axis ${index + 1}: ${JSON.stringify(card.title)} (${card.text.length} char(s))`)
        .join("; ")
  );
  await root.locator("[data-rd-detail] details[data-rd-folded-axes] summary").first().click();
  await page.waitForTimeout(200);
}

// Selecting another row changes the detail — and the index must keep the server's order while it does.
const otherTopic = anatomy.labels.find((label) => label !== anatomy.pressed[0]);
if (otherTopic === undefined) {
  skip("selecting another index row changes the detail", "this dataset has a single topic");
} else {
  await root.locator(`[data-rd-index-topic="${otherTopic}"]`).click();
  await settleUntil(
    ([pluginId, topic]) =>
      document.querySelector(`div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`) !== null,
    [PLUGIN_ID, otherTopic],
    6000
  );
  const switched = await page.evaluate(
    (pluginId) => {
      const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
      return {
        labels: [...(scope?.querySelectorAll("[data-rd-index-topic]") ?? [])].map((row) =>
          row.getAttribute("data-rd-index-topic")
        ),
        pane: scope?.querySelector("[data-rd-detail]")?.getAttribute("data-rd-detail") ?? null,
        pressed:
          scope
            ?.querySelector('[data-rd-index-topic][aria-pressed="true"]')
            ?.getAttribute("data-rd-index-topic") ?? null,
      };
    },
    PLUGIN_ID
  );
  check(
    "selecting another index row changes the detail",
    switched.pane === otherTopic && switched.pressed === otherTopic,
    `clicked "${otherTopic}" -> pane "${switched.pane}", pressed "${switched.pressed}"`
  );
  check(
    "changing selection does not reorder the index (server order preserved)",
    JSON.stringify(switched.labels) === JSON.stringify(anatomy.labels),
    `before ${JSON.stringify(anatomy.labels)} / after ${JSON.stringify(switched.labels)}`
  );
  // Leave the run on the topic the detail checks below read.
  await root.locator(`[data-rd-index-topic="${CORPUS.topic}"]`).click();
  await settleUntil(
    ([pluginId, topic]) =>
      document.querySelector(`div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`) !== null,
    [PLUGIN_ID, CORPUS.topic],
    6000
  );
}
// The detail's own content — the claims, the axis rows, the note form — arrives with `get_topic`, one
// tick after the pane exists (the pane is up as soon as the overview names the selected topic). Every
// check below reads that content, so wait for a marker only the loaded detail renders.
await settleUntil(
  ([pluginId, topic]) =>
    document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"] [data-rd-claim="summary"]`
    ) !== null,
  [PLUGIN_ID, CORPUS.topic],
  8000
);
const rendered = await page.evaluate(
  ([pluginId, topic]) => {
    const pane = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    const titleOf = (card) => (card.querySelector(".rd-work-link")?.textContent ?? "").trim();
    const folded = [
      ...(pane?.querySelectorAll("details[data-rd-folded-axes] [data-rd-work-card]") ?? []),
    ];
    const all = [...(pane?.querySelectorAll("[data-rd-work-card]") ?? [])];
    return {
      current: all.filter((cell) => !folded.includes(cell)).map(titleOf),
      folded: folded.map(titleOf),
      text: (pane?.innerText ?? "").replace(/\s+/g, " "),
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
const currentInPayload = CORPUS.axes
  .filter((axis) => axis.state !== "completed" && axis.state !== "abandoned")
  .map((axis) => axis.title);
const terminalInPayload = CORPUS.axes
  .filter((axis) => axis.state === "completed" || axis.state === "abandoned")
  .map((axis) => axis.title);
check(
  "Current work renders every non-terminal axis; the fold holds the terminal ones",
  currentInPayload.every((title) => rendered.current.includes(title)) &&
    terminalInPayload.every((title) => rendered.folded.includes(title)) &&
    !rendered.text.includes("axes shown"),
  `current ${JSON.stringify(rendered.current)} (payload ${JSON.stringify(currentInPayload)}), ` +
    `folded ${JSON.stringify(rendered.folded)} (payload ${JSON.stringify(terminalInPayload)})`
);
// ------------------------------------------------------------------ C5: the topic detail
// The detail IS the topic view. What matters is that a topic is fetched ONCE and what comes back is per
// axis — the invariant is one fetch per topic, not one fetch per run: C1 puts several topics one click
// apart, and moving between them must add a fetch for the topic you moved to, never a second for one you
// already have.
const detailCalls = callsFor("get_topic");
const detailIds = detailCalls.map((call) => call.input?.topicId);
// The page reads one topic on load — its initial automatic selection. That is the baseline, not a
// selection: the invariant is one read per topic the READER selects, so the baseline read is taken out
// before counting. (The previous form failed on a legitimate 3 reads / 2 topics: load read, then a click
// on that same topic, then another topic.)
// The pivot paged the topic activity (backend offset/pageSize), so a topic is now read once per page,
// not once per topic. The invariant that still holds and matters: every get_topic read targets a topic
// that exists in the index (so the reader could have selected it) — no stray read of another dataset's
// or an unknown topic. It is NOT "every read equals the corpus's first topic": C1 puts several topics
// one click apart, and moving between them legitimately adds a read for the topic moved to.
const selectedTopics = detailIds.filter((id) => id !== undefined);
const strayReads = [...new Set(selectedTopics)].filter(
  (id) => !CORPUS.topicIds.includes(id)
);
check(
  "opening a topic reads only topics the reader could select, page by page, in get_topic calls",
  selectedTopics.length > 0 && strayReads.length === 0,
  `saw ${selectedTopics.length} call(s) over ${new Set(selectedTopics).size} topic(s) ` +
    `(${JSON.stringify([...new Set(selectedTopics)])} ⊆ ${JSON.stringify(CORPUS.topicIds)}); ` +
    `stray ${JSON.stringify(strayReads)}`
);

// The C3 interaction block used to drive the retired Overview landing card actions ("Open topic" /
// "Expand activity") and prove the window survived a return to Overview. With Overview retired — its landing
// cards and its 7/14/30/All window control removed — those actions have no subject. Navigation-by-entity is
// exercised by the EntityTag contract (C7h) and the index rails, and the window rule (every view reads all
// time) is asserted at the shell. The retired checks are reported as SKIPs, never silently passed. This block
// now only re-establishes the Projects view the sections below read.
skip(
  "`Open topic` lands in the Topics tab with that topic selected",
  "the Overview landing card actions are retired (the pivot); entity navigation is covered by the tag contract (C7h)"
);
skip(
  "returning to the Overview tab carries the window with it",
  "the Overview tab and its 7/14/30/All window control are retired (the pivot); every view reads all time"
);
skip(
  "`Expand activity` lands in the Repositories view with that repository selected",
  "the Overview landing card actions are retired (the pivot); repository navigation is covered by the tag contract (C7h)"
);
skip(
  "a plain view choice after two card actions lands on the entity asked for last, not a superseded one",
  "the Overview landing card actions are retired, so a superseded target from them has no subject; the Projects index selects the asked-for project"
);
// Leave the page on the Projects view with the default topic selected — the state the sections below read.
await root.locator('[data-rd-view-option="topics"]').click();
await page.waitForSelector(`div[data-plugin-id] [data-rd-view="topics"]`, { timeout: 10000 });
await waitForTopicsReady();
const pressedRowName = await page.evaluate(
  (pluginId) =>
    document
      .querySelector(`div[data-plugin-id="${pluginId}"] [data-rd-index-topic][aria-pressed="true"]`)
      ?.getAttribute("data-rd-index-topic") ?? null,
  PLUGIN_ID
);
const firstRow = page.locator('div[data-plugin-id] [data-rd-index-topic]').first();
const firstRowName = (await firstRow.count()) > 0 ? await firstRow.getAttribute("data-rd-index-topic") : null;
if (firstRowName !== null && pressedRowName !== firstRowName) {
  await firstRow.click();
  await page.waitForSelector('div[data-plugin-id] [data-rd-detail]', { timeout: 20000 });
}


// Reading is the card's only mode, and the detail it renders has no form in it. Asserted as separate
// facts so a regression names itself: reading renders no editor, no broad edit control exists anywhere in
// the card (D7), and the narrow note affordance is inline in the read detail rather than behind a mode.
// Reading is the detail's only mode, and the detail renders no editor. Asserted as separate facts so a
// regression names itself: the pane is present, and no editor is rendered inside it. (C1 removed the
// disclosure that used to be the way in — the pane is persistent, so there is nothing to open.)
const readMode = await page.evaluate(
  ([pluginId, topic]) => {
    const pane = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    return {
      editor: Boolean(pane?.querySelector("[data-rd-topic-editor]")),
      pane: pane !== null,
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
check(
  "reading a topic does not open the editor",
  readMode.pane && readMode.editor === false,
  `pane present ${readMode.pane}, editor rendered ${readMode.editor}`
);// D7 (Topics is read-first): the card has no broad edit control at all, so there is no mode to switch
// into. Two checks pin that — the absence of a control, and the narrow affordance surviving as an inline
// part of the read detail rather than behind a mode.
const noEditControl = await page.evaluate(
  ([pluginId, topic]) => {
    const card = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    return {
      editOpen: card?.querySelectorAll("[data-rd-edit-open]").length ?? 0,
      labels: (card?.innerText ?? "").match(/Done editing|Edit fields/g)?.length ?? 0,
      editor: card?.querySelectorAll("[data-rd-topic-editor]").length ?? 0,
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
check(
  "the topic detail offers no broad edit control (D7: Topics is read-first)",
  noEditControl.editOpen === 0 && noEditControl.labels === 0 && noEditControl.editor === 0,
  `edit-open ${noEditControl.editOpen}, Edit/Done labels ${noEditControl.labels}, editors ${noEditControl.editor}`
);
// …and the narrow affordance D7 keeps is inline: the note form renders inside the read detail, so the
// capability survives without a mode to enter. Wait for the detail's own marker first — the note field is
// part of the detail the read action loads, and this check is about the page, not about timing.
await settleUntil(
  ([pluginId, topic]) =>
    Boolean(
      document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"] [aria-label="Topic note"]`
      )
    ),
  [PLUGIN_ID, CORPUS.topic],
  4000
);
const noteAffordance = await page.evaluate(
  ([pluginId, topic]) => {
    const pane = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    return {
      noteInput: pane?.querySelectorAll('[aria-label="Topic note"]').length ?? 0,
      pane: pane !== null,
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
check(
  "the narrow note affordance is part of the read detail, with no mode to enter (D7)",
  noteAffordance.noteInput === 1 && noteAffordance.pane === true,
  `note inputs ${noteAffordance.noteInput}, pane present ${noteAffordance.pane}`
);
const toolbar = await page.evaluate((pluginId) => {
  const bar = document.querySelector(
    `div[data-plugin-id="${pluginId}"] [data-rd-toolbar]`
  );
  return {
    controls:
      bar?.querySelectorAll("button, [role=switch], input").length ?? 0,
    groups: [...(bar?.querySelectorAll("[data-rd-group]") ?? [])].map((group) =>
      group.getAttribute("data-rd-group")
    ),
  };
}, PLUGIN_ID);
// §13: the window group (7/14/30/All + the archived switch) is gone from the global toolbar — the window
// control belongs to Overview's own heading and the archived toggle is removed. So the toolbar is two groups:
// views and actions, with no window group.
const wantedGroups = ["views", "actions"];
check(
  "the toolbar controls form groups rather than one strip, with no window group (§13)",
  wantedGroups.every((name) => toolbar.groups.includes(name)) &&
    toolbar.groups.length >= wantedGroups.length &&
    !toolbar.groups.includes("window"),
  `groups ${JSON.stringify(toolbar.groups)}, holding ${toolbar.controls} controls`
);

const detail = await page.evaluate(
  ([pluginId, topic]) => {
    const card = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"]`
    );
    // The pivoted Projects detail renders each workstream as the compact shared card
    // (article[data-rd-work-card]); its title is the card's own Progress link and its state is
    // data-rd-state on the card. The retired per-axis block (data-rd-axis-title …) is gone.
    const axes = [...(card?.querySelectorAll("[data-rd-work-card]") ?? [])].map((node) => ({
      folded: node.closest("details[data-rd-folded-axes]") !== null,
      renderedText: (node.innerText ?? "").replace(/\s+/g, " "),
      text: (node.textContent ?? "").replace(/\s+/g, " "),
      title: (node.querySelector(".rd-work-link")?.textContent ?? "").trim(),
      state: node.getAttribute("data-rd-state"),
    }));
    return {
      axes,
      detail: card !== null,
      // The detail's own numbers, stated as attributes by the page: the payload's note count and the
      // activity total it shows. Compared against the payload rather than counted from `li` children,
      // because an empty list still renders one muted empty-state row.
      noteCount: card?.querySelector("[data-rd-topic-notes]")?.getAttribute("data-rd-topic-notes"),
      text: (card?.innerText ?? "").replace(/\s+/g, " "),
      // The payload's own activity count, read off the container's attribute — NOT counted from `li`
      // children: an empty activity list still renders one muted empty-state <li>, so a `li` count reads
      // an empty topic as 1. This mirrors how noteCount is read.
      topicActivityTotal:
        card?.querySelector("[data-rd-topic-activity]")?.getAttribute("data-rd-topic-activity"),
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);

check(
  "the topic detail renders one block per axis",
  detail.detail && detail.axes.length === CORPUS.axes.length,
  `${detail.axes.length} axes, detail block: ${detail.detail} (payload holds ${CORPUS.axes.length})`
);
check(
  "the detail shows the topic's fields, its notes and its activity separately",
  detail.text.includes(CORPUS.topic) &&
    detail.noteCount === String(CORPUS.topicNotes) &&
    detail.topicActivityTotal === String(CORPUS.topicActivityRows),
  `topic notes in payload ${CORPUS.topicNotes} → detail marker ${detail.noteCount}; ` +
    `activity total ${detail.topicActivityTotal} (payload ${CORPUS.topicActivityRows})`
);
// The compact workstream card carries a title, its status, its task counts and one latest event — it
// does NOT carry the per-axis version, "current state" reading, confidence cluster or evidence line.
// Those subjects live in the Progress view (the workstream context panel), so the two legacy
// metadata-level assertions have no subject on this view and are reported as explicit SKIPs.
skip(
  "each axis shows full metadata with its own state and per-claim confidence",
  "the Projects detail renders the compact workstream card; the full metadata/confidence reading is the Progress view"
);
skip(
  "every axis carries an evidence line, in words",
  "the compact workstream card carries no evidence line; evidence is read in the Progress view"
);
// Every state the payload carries must reach the page *as that state* — not as a rendered label that
// drifted, and not dropped. This is what makes the seventh axis state executable coverage rather than a
// screenshot: `abandoned` is supplied only by the layout fixture (the corpus has no subject for it), and
// `usable` has no subject anywhere yet, because nothing can legitimately enter it until the transition
// writer lands (U2/U3).
check(
  "every axis the reader is meant to read is rendered, not merely present in the DOM",
  detail.axes.filter((axis) => !axis.folded).length > 0 &&
    detail.axes.filter((axis) => !axis.folded).every((axis) => axis.renderedText.length > 0),
  detail.axes
    .map((axis) => `${axis.title}: ${axis.folded ? "folded" : `${axis.renderedText.length} rendered char(s)`}`)
    .join(" | ")
);
const unrendered = CORPUS.axes.filter(
  (axis) => !detail.axes.some((rendered) => rendered.title === axis.title && rendered.state === axis.state)
);
check(
  "every axis state the payload carries reaches the page as that state",
  // Non-vacuity: a payload with no axes must not earn this tick by having nothing to render. The subject
  // absence is a different fact, and it is reported by the checks that skip for want of it.
  CORPUS.axes.length > 0 && unrendered.length === 0,
  `${CORPUS.axes.length} axes in the payload, states [${[...new Set(CORPUS.axes.map((axis) => axis.state))].join(", ")}]; ` +
    `not rendered as their own state: ${JSON.stringify(unrendered.map((axis) => `${axis.title}=${axis.state}`))}`
);
// The rule and the page agree: an axis with nothing behind it cannot show a confirmed claim, and a
// claim nobody stated gets no confidence badge at all. Both need an evidence-free axis to look at.
const bare = detail.axes.find((axis) => axis.hasEvidence === "false");
if (bare === undefined) {
  skip(
    "an axis with no evidence says so and shows no confirmed claim",
    `all ${detail.axes.length} axes in this dataset carry evidence, so nothing here shows the bare state`
  );
  skip(
    "an axis that states no progress carries no confidence for it",
    `all ${detail.axes.length} axes in this dataset carry evidence, so nothing here shows the bare state`
  );
} else {
  check(
    "an axis with no evidence says so and shows no confirmed claim",
    bare.text.includes("no evidence on record") && !bare.conf.includes("confirmed"),
    `${bare.title}: evidence ${bare.evidenceCount}, conf [${bare.conf.join(",")}]`
  );
  check(
    "an axis that states no progress carries no confidence for it",
    !bare.text.includes("no progress note") || bare.conf.length === 1,
    `${bare.title}: says "no progress note", conf [${bare.conf.join(",")}]`
  );
}

// ------------------------------------------- C1 hierarchy / per-axis detail: retired surface
// The pivoted Projects detail is the compact workstream card: a title (its Progress link), its status,
// its task counts and one latest recorded event. It deliberately does NOT carry the per-axis reading,
// description, evidence line, confidence cluster, one-click disclosure or per-axis History — those
// subjects moved to the Progress view (the workstream context panel and its activity list). The
// reading-surface assertions below therefore have no subject on this view; each is reported as an
// explicit SKIP with its reason (never silently passed). The compact card's own presence, state and
// rendered text are asserted above.
for (const [description, reason] of [
  [
    "each axis reads in the scan line, the reading and one reference line — not ten equal-weight lines",
    "the Projects detail renders the compact workstream card; the full reading surface is the Progress view",
  ],
  [
    "the material the reading does not need sits behind one disclosure per axis, not in the reading surface",
    "the per-axis disclosure (data-rd-axis-more) was retired with the compact card; nothing is hidden in Projects",
  ],
  [
    "the compressed axis row still carries the payload's own reading and detail",
    "the compact card carries no reading/description slot; the full reading is read in the Progress view",
  ],
  [
    "the axis's fuller detail is one click away, and the disclosure grows to hold it",
    "the per-axis one-click disclosure was retired with the compact card",
  ],
  [
    "a per-axis history expands inside its own axis",
    "the per-axis history disclosure was retired; a workstream's history is the Progress activity list",
  ],
  [
    "the axis's notes are kept out of its history list",
    "the per-axis notes list was retired with the compact card (a project's notes are its own Notes card)",
  ],
]) {
  skip(description, reason);
}

// The C5 shot is taken here, while the detail is on screen: the palette step below reloads the page
// and would collapse the card again, so the end-of-run screenshot always shows the overview.
//
// The host scrolls the plugin page inside a fixed-height container, so an element shot of the root
// captures only what fits the viewport — the rest of the detail, including the topic-level notes and
// activity, would be missing. For the shot alone, every ancestor is unclipped so the element reports
// its full height. This changes layout only inside the throwaway browser page.
const detailShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-detail.png`;
await root.evaluate((node) => {
  document.documentElement.style.overflow = "visible";
  document.body.style.overflow = "visible";
  for (
    let parent = node.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    parent.style.overflow = "visible";
    parent.style.height = "auto";
    parent.style.maxHeight = "none";
  }
});
await page.waitForTimeout(300);
await root.screenshot({ path: detailShot });
console.log("detail screenshot:", shotLabel(detailShot));

// ------------------------------------------------------------------ C6: the People and Repositories views
// The switcher is not a second query: the same `get_overview` payload carries all three views, so every
// check here reads the rendered page and nothing else. The identity rule the review asked to pin is the
// point of the first one — a person on several topics and axes is ONE row, with the involvement grouped
// underneath — and the panel checks that "cannot be attributed" is shown differently from "recorded
// nothing".
const viewButton = (label) => root.getByRole("button", { name: label, exact: true });

await viewButton("People").click();
await page.waitForTimeout(700);
const people = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const index = scope?.querySelector("[data-rd-people]");
  const rows = [...(index?.querySelectorAll("[data-rd-person]") ?? [])];
  const names = rows.map((row) => row.getAttribute("data-rd-person") ?? "");
  const panel = scope?.querySelector("[data-rd-person-panel]");
  return {
    attributable: panel?.querySelector("[data-rd-attributable]")?.getAttribute("data-rd-attributable") ?? "n/a",
    count: Number(index?.getAttribute("data-rd-people") ?? -1),
    duplicated: names.filter((name, position) => names.indexOf(name) !== position),
    header: (() => {
      const match = (scope?.innerText ?? "").match(/(\d+) (?:person|people)/);
      return match ? Number(match[1]) : -1;
    })(),
    involvements: [...(panel?.querySelectorAll("[data-rd-involvement]") ?? [])].map((node) => node.getAttribute("data-rd-involvement")),
    name: panel?.getAttribute("data-rd-person-panel") ?? "",
    names,
    panelActivity: [
      ...(panel?.querySelectorAll("[data-rd-person-activity]") ?? []),
    ].length,
    selected: rows.filter((row) => row.getAttribute("aria-pressed") === "true").length,
    topics: Number(panel?.querySelector("[data-rd-person-topics]")?.getAttribute("data-rd-person-topics") ?? -1),
  };
});
check(
  "the People view lists every person once — the index's own count, not one row per link",
  people.count === people.names.length &&
    people.duplicated.length === 0 &&
    people.count > 0,
  `index count ${people.count}, rendered rows ${people.names.length}, duplicated ${JSON.stringify(people.duplicated)}`
);
// C2 increment 1: an index row is identity, then what is on, then *when* — and the when is the payload's
// own number, not a second opinion about it. `unattributable` is the honest value for a person with no
// mapped account: their last activity is unknown, which is not the same fact as "none".
const personIndexRows = await page.evaluate(({ separator, danglingPattern }) => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const SEP = separator;
  return [...(scope?.querySelectorAll("[data-rd-person]") ?? [])].map((row) => {
    const context = row.querySelector("[data-rd-person-context]");
    const recency = row.querySelector("[data-rd-person-recency]");
    // The factual metadata block is the inline content the context element holds *before* the recency
    // child. The recency child is block-level, so a separator left between the two dangles at the end of
    // the involvement line instead of joining them — the V1/A4 boundary. `previousSibling` names the node
    // the source used to render there, so a regression that puts it back is caught even before it wraps.
    const factual = [...(context?.childNodes ?? [])]
      .filter((node) => node !== recency)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    const previous = recency?.previousSibling ?? null;
    return {
      context: (context?.textContent ?? "").trim(),
      danglingSeparator: new RegExp(danglingPattern).test(factual),
      factual,
      name: row.getAttribute("data-rd-person") ?? "",
      recency: recency?.getAttribute("data-rd-person-recency") ?? null,
      separatorBeforeRecency: Boolean(
        previous && previous.nodeType === 3 && previous.textContent.trim() === SEP
      ),
    };
  });
}, { separator: SEPARATOR, danglingPattern: DANGLING_SEPARATOR_PATTERN });
const expectedRecency = new Map(
  CORPUS.people.map((person) => [
    person.name,
    person.attributable ? person.lastActivityAt ?? "none" : "unattributable",
  ])
);
check(
  "every person index row carries its context, and its recency is the payload's own",
  personIndexRows.length === people.count &&
    personIndexRows.every(
      (row) =>
        row.context !== "" &&
        row.recency !== null &&
        row.recency === expectedRecency.get(row.name)
    ),
  JSON.stringify({ rows: personIndexRows, expected: [...expectedRecency] })
);
// V1/A4 boundary regression: the People index row's factual block states its counts and ends there — a
// person with several topics/axes, and no separator orphaned before the block-level recency child.
check(
  "the People index row ends its factual counts without a dangling separator before the recency",
  personIndexRows.length === people.count &&
    personIndexRows.every(
      (row) =>
        /\d+ workstreams? · \d+ projects?$/.test(row.factual) &&
        row.danglingSeparator === false &&
        row.separatorBeforeRecency === false
    ),
  JSON.stringify(
    personIndexRows.map((row) => ({
      before: row.separatorBeforeRecency,
      dangling: row.danglingSeparator,
      factual: row.factual,
    }))
  )
);
check(
  "person-first shows one person at a time, with their involvement grouped underneath",
  people.selected === 1 &&
    people.name !== "" &&
    people.topics > 0 &&
    people.topics === people.involvements.length,
  `selected ${people.selected}, panel ${people.name}, topics ${people.topics}, involvements ${JSON.stringify(people.involvements)}`
);
const selectedPerson = CORPUS.people.find((person) => person.name === people.name);
check(
  "the person panel states attribution instead of implying idleness",
  selectedPerson === undefined
    ? people.attributable === "false" || people.panelActivity >= 1
    : selectedPerson.attributable
      ? people.attributable !== "false" && people.panelActivity >= 1
      : people.attributable === "false" && people.panelActivity === 0,
  `payload attributable=${selectedPerson?.attributable}; page marker ${people.attributable}; activity lists ${people.panelActivity}`
);
console.log(
  "people:",
  people.names.join(", "),
  "| selected:",
  people.name,
  "| involved in:",
  people.involvements.join(", ")
);

// The reviewer's acceptance criterion, read off the page: the same person under several topics and axes.
// The subject is the payload's person linked to the MOST topics (>=2), picked EXPLICITLY rather than
// trusting whichever row the view auto-selected — a one-topic auto-selection would SKIP the very grouping
// this check exists to exercise.
const multiProjectPerson = [...CORPUS.people].sort((a, b) => (b.topics ?? 0) - (a.topics ?? 0))[0] ?? null;
const personName = (multiProjectPerson?.topics ?? 0) >= 2
  ? multiProjectPerson.name
  : people.name || CORPUS.people[0]?.name || "";
await root.locator(`[data-rd-person="${personName}"]`).click();
await page.waitForTimeout(500);
const researcher = await page.evaluate(
  (needle) => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const panel = scope?.querySelector("[data-rd-person-panel]");
    const lane = panel?.querySelector("[data-rd-person-lane]");
    // V1a partitions the lane: a *bearing* project is a topic group carrying at least one of the person's
    // own workstreams (the shared compact `data-rd-work-card`); a *project-only* affiliation is a compact
    // `li` inside the folded disclosure, a topic the person is named on but holds no workstream of their
    // own. BOTH keep a `data-rd-involvement` marker, so the lane's total is read across the two.
    const bearing = [...(lane?.querySelectorAll("section[data-rd-involvement]") ?? [])].map((node) => ({
      axes: [...node.querySelectorAll("[data-rd-work-card]")].map((axis) =>
        axis.getAttribute("data-rd-work-card")
      ),
      // The group intro states the recorded `status · role`, the same string the affiliation row shows.
      meta: (node.querySelector(".rd-project-intro .rd-meta")?.textContent ?? "").trim(),
      topic: node.getAttribute("data-rd-involvement"),
    }));
    const affiliations = panel?.querySelector("details[data-rd-person-affiliations]");
    return {
      affiliations: {
        count: Number(affiliations?.getAttribute("data-rd-person-affiliations") ?? 0),
        present: affiliations !== null,
        rows: [...(affiliations?.querySelectorAll("li[data-rd-involvement]") ?? [])].map((node) => ({
          meta: (node.querySelector(".rd-meta")?.textContent ?? "").trim(),
          topic: node.getAttribute("data-rd-involvement"),
          topicId:
            node.querySelector('[data-rd-entity-tag="topic"]')?.getAttribute("data-rd-entity-id") ?? "",
        })),
      },
      bearing,
      involvementTotal: lane?.querySelectorAll("[data-rd-involvement]").length ?? -1,
      name: panel?.getAttribute("data-rd-person-panel") ?? "",
      rows: scope?.querySelectorAll(`[data-rd-person="${needle}"]`).length ?? 0,
      topicsMarker: Number(
        panel?.querySelector("[data-rd-person-topics]")?.getAttribute("data-rd-person-topics") ?? -1
      ),
    };
  },
  personName
);
check(
  "one person is exactly one row in the index, and the panel is theirs",
  researcher.rows === 1 && researcher.name === personName && personName !== "",
  `rows ${researcher.rows}, panel ${researcher.name}`
);
const personPayload = CORPUS.people.find((person) => person.name === personName);
// The oracle is the payload's own involvement partition, never a rendered count: a bearing topic is an
// involvement that owns at least one axis, a project-only one owns none. A person named on many topics
// but holding a single axis therefore has exactly ONE bearing group — the check never demands a second.
const involvementWanted = personPayload?.involvements ?? [];
const bearingWanted = involvementWanted.filter((entry) => entry.axes.length > 0);
const projectOnlyWanted = involvementWanted.filter((entry) => entry.axes.length === 0);
if (personPayload !== undefined && bearingWanted.length >= 1) {
  // Each bearing group must be its own scope: the payload's own topic, in the payload's own order,
  // carrying exactly that topic's axis ids — none inherited, dropped or copied between groups — and the
  // groups' topic labels are distinct.
  const groups = researcher.bearing;
  const bearingMatch =
    groups.length === bearingWanted.length &&
    groups.every((group, index) => {
      const want = bearingWanted[index];
      return (
        group.topic === want.name &&
        [...group.axes].sort().join(",") === [...want.axes].sort().join(",")
      );
    });
  const distinctTopics = new Set(groups.map((group) => group.topic)).size === groups.length;
  const allAxisIds = groups.flatMap((group) => group.axes);
  const noSharedAxis = new Set(allAxisIds).size === allAxisIds.length;
  check(
    "one person's bearing projects each show their own axes — the payload's own topics, ids and axis ids, no axis shared between groups (no inherited scope)",
    bearingMatch &&
      distinctTopics &&
      noSharedAxis &&
      groups.every((group) => group.topic !== "" && group.axes.length >= 1),
    JSON.stringify({ groups, bearingWanted })
  );
} else {
  skip(
    "one person's bearing projects each show their own axes",
    personPayload === undefined
      ? `no payload rollup for ${personName || "the person"}`
      : `${personName} bears no workstream on any of their ${personPayload.topics} topic(s), so the lane renders no bearing group`
  );
}
if (personPayload !== undefined) {
  // The compact project-only affiliations keep every non-bearing topic — same id, same recorded
  // `status · role` — the disclosure's own count matches what it holds, and the two partitions together
  // still state the lane's true total (`data-rd-person-topics`, the payload's own topic count).
  const compact = researcher.affiliations;
  const roleOf = (entry) => `${entry.status}${entry.role ? ` · ${entry.role}` : ""}`;
  const rowsMatch =
    compact.rows.length === projectOnlyWanted.length &&
    compact.rows.every((row, index) => {
      const want = projectOnlyWanted[index];
      return row.topic === want.name && row.topicId === want.topicId && row.meta === roleOf(want);
    });
  const disclosureOk =
    projectOnlyWanted.length === 0
      ? !compact.present && compact.count === 0
      : compact.present && compact.count === projectOnlyWanted.length;
  const totalOk =
    researcher.topicsMarker === personPayload.topics &&
    researcher.bearing.length + compact.rows.length === researcher.topicsMarker &&
    researcher.involvementTotal === researcher.topicsMarker;
  check(
    "the compact project-only affiliations preserve every non-bearing topic — the payload's own ids and status · role — and the two partitions still state the lane's true total",
    rowsMatch && disclosureOk && totalOk,
    JSON.stringify({
      compact,
      involvementTotal: researcher.involvementTotal,
      projectOnlyWanted,
      topicsMarker: researcher.topicsMarker,
      totalOk,
    })
  );
}

// C2 increments 2 and 3: the inner split and its rail. Structure and dominance are asserted *relatively*
// — never a prototype's pixel widths — and every content claim is compared against the payload the page
// itself fetched. The "concise default row" check exists because the failure mode this unit is most likely
// to drift into is a person's involvement row quietly becoming a copy of the axis's own lane.
const personDetail = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const panel = scope?.querySelector("[data-rd-person-panel]");
  const lane = panel?.querySelector("[data-rd-person-lane]");
  const rail = panel?.querySelector("[data-rd-person-rail]");
  const box = (node) => {
    const rect = node?.getBoundingClientRect();
    return rect ? { height: rect.height, width: rect.width, x: rect.x, y: rect.y } : null;
  };
  const repos = rail?.querySelector("[data-rd-person-repositories]");
  const notes = rail?.querySelector("[data-rd-person-notes]");
  return {
    lane: box(lane),
    // The People involvement lane now renders the shared compact workstream card (data-rd-work-card),
    // which carries no reading surface and none of the axis lane's heavier material — exactly what this
    // check exists to keep true. `reading` reads the card's optional summary slot.
    laneRows: [...(lane?.querySelectorAll("[data-rd-work-card]") ?? [])].map((row) => ({
      evidence: row.querySelector(".rd-evidence, [data-rd-evidence-count]") !== null,
      heavier:
        row.querySelector(
          "[data-rd-history-toggle], [data-rd-correct-toggle], .rd-axis-history, .rd-correction"
        ) !== null,
      reading: row.querySelector("[data-rd-work-summary]") !== null,
    })),
    notes: {
      marker: notes?.getAttribute("data-rd-person-notes") ?? null,
      text: (notes?.textContent ?? "").trim(),
    },
    rail: box(rail),
    railCards: [...(rail?.querySelectorAll(".rd-side-title") ?? [])].map(
      (node) => node.textContent?.trim() ?? ""
    ),
    repoCount: Number(repos?.getAttribute("data-rd-person-repositories") ?? -1),
    repoIds: [
      ...(repos?.querySelectorAll('[data-rd-entity-tag="repository"]') ?? []),
    ].map((node) => node.getAttribute("data-rd-entity-id") ?? ""),
    split: panel?.querySelector("[data-rd-person-split]") !== null,
  };
});
check(
  "C2: the person detail is an inner split — lane left of a rail, lane materially wider, tops aligned",
  personDetail.split &&
    personDetail.lane !== null &&
    personDetail.rail !== null &&
    personDetail.lane.x < personDetail.rail.x &&
    personDetail.lane.width >= personDetail.rail.width * 1.25 &&
    Math.abs(personDetail.lane.y - personDetail.rail.y) <= 2,
  `lane ${JSON.stringify(personDetail.lane)} rail ${JSON.stringify(personDetail.rail)}`
);
check(
  "C2: the rail is Recent activity, About and Related repositories, in that order",
  personDetail.railCards.join(" | ") === "Recent activity | About | Related repositories",
  personDetail.railCards.join(" | ")
);
check(
  "C2: the default involvement row is the compact workstream card — no reading surface, none of the axis lane's heavier material",
  personDetail.laneRows.length > 0 &&
    personDetail.laneRows.every((row) => !row.reading && !row.heavier && !row.evidence),
  JSON.stringify(personDetail.laneRows)
);
const personAbout = CORPUS.people.find((person) => person.name === personName);
check(
  "C2: About is the person's own recorded note, verbatim — and says so when there is none",
  personAbout !== undefined &&
    personDetail.notes.marker !== null &&
    personDetail.notes.text ===
      (personAbout.notes !== ""
        ? personAbout.notes
        : "No note recorded for this person."),
  `page ${JSON.stringify(personDetail.notes)} payload notes ${JSON.stringify(personAbout?.notes)}`
);
check(
  "C2: Related repositories are the ones the payload's own axes name — derived, not invented",
  personAbout !== undefined &&
    personDetail.repoCount === personDetail.repoIds.length &&
    personDetail.repoCount === personAbout.axisRepoIds.length &&
    [...personDetail.repoIds].sort().join(",") ===
      [...personAbout.axisRepoIds].sort().join(","),
  `page ${JSON.stringify(personDetail.repoIds)} payload ${JSON.stringify(personAbout?.axisRepoIds)}`
);

// The About card has two branches and the fixture carries both: one person with a real note, one without.
// Select the other person and read it, so the "none recorded" wording is proven rather than assumed — and
// data-driven, because a dataset holding a single person can only show one branch (it skips, stating why).
const otherPerson = CORPUS.people.find((person) => person.name !== personName);
if (otherPerson !== undefined) {
  await root.locator(`[data-rd-person="${otherPerson.name}"]`).click();
  await page.waitForTimeout(400);
  const otherAbout = await page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const node = scope?.querySelector("[data-rd-person-notes]");
    return {
      panel:
        scope
          ?.querySelector("[data-rd-person-panel]")
          ?.getAttribute("data-rd-person-panel") ?? "",
      text: (node?.textContent ?? "").trim(),
    };
  });
  check(
    "C2: About's other branch — a person with no note is told so, never given prose",
    otherAbout.panel === otherPerson.name &&
      otherAbout.text ===
        (otherPerson.notes !== ""
          ? otherPerson.notes
          : "No note recorded for this person."),
    `panel ${otherAbout.panel} text ${JSON.stringify(otherAbout.text)} payload notes ${JSON.stringify(otherPerson.notes)}`
  );
} else {
  skip(
    "C2: About's other branch — a person with no note is told so, never given prose",
    "this dataset holds a single person, so the card has only one branch to read"
  );
}

const peopleShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-people.png`;
await root.screenshot({ path: peopleShot });
console.log("people screenshot:", shotLabel(peopleShot));

await viewButton("Repositories").click();
await page.waitForTimeout(700);
const repositories = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const index = scope?.querySelector("[data-rd-repositories]");
  const rows = [...(index?.querySelectorAll("[data-rd-repository]") ?? [])];
  const names = rows.map((row) => row.getAttribute("data-rd-repository") ?? "");
  const panel = scope?.querySelector("[data-rd-repository-panel]");
  return {
    axes: [...(panel?.querySelectorAll("[data-rd-work-card]") ?? [])].map((axis) => axis.getAttribute("data-rd-work-card")),
    count: Number(index?.getAttribute("data-rd-repositories") ?? -1),
    duplicated: names.filter((name, position) => names.indexOf(name) !== position),
    name: panel?.getAttribute("data-rd-repository-panel") ?? "",
    names,
    supports: Number(panel?.querySelector("[data-rd-repository-topics]")?.getAttribute("data-rd-repository-topics") ?? -1),
  };
});
check(
  "the Repositories view is repository-first: the index is the set, and one of them is selected",
  repositories.count === repositories.names.length &&
    repositories.duplicated.length === 0 &&
    repositories.name !== "" &&
    repositories.names.includes(repositories.name),
  `${repositories.count} repositories ${JSON.stringify(repositories.names)}; panel ${repositories.name}: supports ${repositories.supports}, axes ${JSON.stringify(repositories.axes)}`
);
// "What it supports and the work happening in it" is a claim about a repository that HAS links, not about
// whichever row happens to be first: a repository may legitimately support nothing yet (the fixture's bare
// one exists for exactly that, and the Repositories view renders its `empty` notices). So the subject is
// chosen by PROPERTY from the projection and selected deliberately, and a dataset without such a repository
// prints a skip instead of a red check on a state the view is right not to fabricate.
const linkedRepository = (CORPUS.repositories ?? []).find(
  (repository) => repository.topicCount > 0 && (repository.axes ?? []).length > 0
);
if (!linkedRepository) {
  skip(
    "a repository that supports work names the topics it supports and the axes happening in it",
    "no repository in this dataset links both a topic and an axis"
  );
} else {
  await root.locator(`[data-rd-repository="${linkedRepository.fullName}"]`).click();
  await page.waitForTimeout(600);
  const linked = await page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const panel = scope?.querySelector("[data-rd-repository-panel]");
    // Consolidation: a project that is already a work group is navigated by that group, so the panel's
    // project navigations are the lane's group links plus the rail's direct links — read both, by id and
    // recorded relationship, so the count claim holds after consolidation instead of reading the subset.
    const links = [...(panel?.querySelectorAll("[data-rd-project-link]") ?? [])].map((node) => ({
      id: node.getAttribute("data-rd-project-link"),
      relationship:
        node
          .querySelector("[data-rd-project-relationship]")
          ?.getAttribute("data-rd-project-relationship") ?? null,
    }));
    return {
      axes: [...(panel?.querySelectorAll("[data-rd-work-card]") ?? [])].map(
        (axis) => axis.getAttribute("data-rd-work-card")
      ),
      links,
      name: panel?.getAttribute("data-rd-repository-panel") ?? "",
    };
  });
  const linkedIds = new Set(linked.links.map((link) => link.id));
  const missingTopicLinks = (linkedRepository.topicLinks ?? []).filter(
    (link) => !linkedIds.has(link.id)
  );
  const wrongTopicRelationship = (linkedRepository.topicLinks ?? []).filter((link) => {
    const nav = linked.links.find((entry) => entry.id === link.id);
    return !nav || nav.relationship !== link.relationship;
  });
  check(
    "a repository that supports work names the topics it supports and the axes happening in it",
    linked.name === linkedRepository.fullName &&
      missingTopicLinks.length === 0 &&
      wrongTopicRelationship.length === 0 &&
      linked.axes.length === (linkedRepository.axes ?? []).length,
    `panel ${linked.name}: ${linked.links.length} project link(s) for ${linkedRepository.topicCount} ` +
      `direct link(s) (missing ${JSON.stringify(
        missingTopicLinks.map((link) => link.id)
      )}), relationship mismatches ${JSON.stringify(
        wrongTopicRelationship.map((link) => link.id)
      )}, axes ${linked.axes.length} of ${(linkedRepository.axes ?? []).length}`
  );
}

const repositoriesShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-repositories.png`;
await root.screenshot({ path: repositoriesShot });
console.log("repositories screenshot:", shotLabel(repositoriesShot));

await viewButton("Projects").click();
await page.waitForTimeout(600);
const backToTopics = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  return {
    topicRows: scope?.querySelectorAll("[data-rd-index-topic]").length ?? 0,
    // D7: the Topics view has no create form — `reconcile_topic` (the librarian) is how a topic is
    // created, so a non-zero count here would mean the broad control came back.
    createForm: scope?.querySelectorAll(".rd-newtopic").length ?? 0,
    peopleIndex: scope?.querySelectorAll("[data-rd-people]").length ?? 0,
    repositoryIndex: scope?.querySelectorAll("[data-rd-repositories]").length ?? 0,
  };
});
check(
  "switching back to Topics restores the topic view, with no residue from the other two, and no create form (D7)",
  backToTopics.topicRows > 0 &&
    backToTopics.createForm === 0 &&
    backToTopics.peopleIndex === 0 &&
    backToTopics.repositoryIndex === 0,
  `topic rows ${backToTopics.topicRows}, create form ${backToTopics.createForm}, people index ${backToTopics.peopleIndex}, repository index ${backToTopics.repositoryIndex}`
);

// ------------------------------------------------------------------ C7: the time view
// Grouped by default, filterable without a re-query, and reading the *axis* for its context — which is
// how an event recorded against an axis alone still lands in the right topic, repository and state.
await root.getByRole("button", { name: "Progress", exact: true }).click();
await page.waitForTimeout(600);
const progress = await page.evaluate(() => {
  const scope = document.querySelector(
    'div[data-plugin-id="research-dashboard"]'
  );
  const cards = [
    ...(scope?.querySelectorAll("[data-rd-progress-topic]") ?? []),
  ];
  return {
    empty: scope?.querySelectorAll("[data-rd-progress-empty]").length ?? 0,
    events: [...(scope?.querySelectorAll("[data-rd-progress-event]") ?? [])].map(
      (node) =>
        (node.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 90)
    ),
    rails: [...(scope?.querySelectorAll("[data-rd-progress-axis]") ?? [])].map(
      (node) => node.getAttribute("data-rd-progress-axis")
    ),
    summary: (
      scope?.querySelector("[data-rd-progress-summary]")?.textContent ?? ""
    )
      .replace(/\s+/g, " ")
      .trim(),
    topics: cards.map((node) => node.getAttribute("data-rd-progress-topic")),
    view: scope?.querySelector('[data-rd-view="progress"]') ? 1 : 0,
  };
});
// The two checks that stood here asserted the window-wide feed's grouping — topic cards → axis rails →
// events, with the axis-alone event landing under its own axis. That surface is retired (C4/F2), so the
// checks retire with it; what replaces them is asserted where the payload is available in full: the feed's
// absence, the count it left behind, and that exactly one activity reading remains (see the C4/F2 block below,
// beside the source-line check the composition's own rows are read by).

// The screenshot shows the composition without the retired feed — the composition is the whole page now.
const progressShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-progress.png`;
await root.screenshot({ path: progressShot });
console.log("progress screenshot:", shotLabel(progressShot));

// ---------------------------------------- C7b: the index *is* the projection, for the current window
// The axis index reads `get_progress`, so it has to equal what the store reports for the window on screen —
// and changing the window must **replace** it, never extend it. Comparing the DOM against the action's own
// answer, rather than against a remembered expectation, is what makes this a check on the client's state
// instead of on the corpus: a row carrying its previous count forward would disagree with the projection
// whatever the dataset, and so would a client that re-sorted or re-derived the rows. Run after the
// screenshot so the recorded image still shows the default window; the window is restored at the end.
const readIndex = () =>
  page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const index = scope?.querySelector('[data-rd-progress-index="true"]');
    if (!index) {
      return null;
    }
    return {
      // The pivoted Progress index row carries state, problems, open-problems and recency. It does NOT
      // carry the retired per-row activity/stale attributes (the activity count lives on the selected
      // workstream's own activity list), so those two comparisons are dropped rather than read from null.
      rows: [...index.querySelectorAll("[data-rd-index-axis]")].map((node) => ({
        id: node.getAttribute("data-rd-index-axis"),
        openProblems: Number(node.getAttribute("data-rd-index-open-problems")),
        problems: Number(node.getAttribute("data-rd-index-problems")),
        state: node.getAttribute("data-rd-index-state"),
      })),
      window: Number(index.getAttribute("data-rd-progress-index-window")),
    };
  });
const apiProgress = (days) =>
  page.evaluate(
    async ([plugin, since, orgId]) => {
      const cookie = (name) =>
        document.cookie
          .split("; ")
          .find((entry) => entry.startsWith(`${name}=`))
          ?.slice(name.length + 1) ?? "";
      const body = await fetch(`/v1/plugins/${plugin}/actions/get_progress`, {
        body: JSON.stringify({ input: { activitySinceDays: since } }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": cookie("nakama_csrf"),
          "x-org-id": orgId,
        },
        method: "POST",
      }).then((r) => r.json());
      return body.result ?? null;
    },
    [PLUGIN_ID, days, ORG_ID]
  );

// ---- C4 INCREMENT 1: the Progress index states *when*, in both subjects, and the when is the payload's -----
// The discipline C2 applied to the person index, applied here: the row carries the raw value its context line
// phrases, so the check compares the phrase's *source* against the projection the page itself read instead of
// trusting the phrase. Both subjects are read, because a reader who switches to `Problems` must get the same
// three answers (which one, what it is on, when it was last active) from a row. The switch is client-side by
// design — it issues no query — so reading it here cannot disturb the call accounting later in the pass, and
// the reader's position is put back.
const readProgressIndexRows = () =>
  page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const read = (selector, idAttr, recencyAttr) =>
      [...(scope?.querySelectorAll(selector) ?? [])].map((row) => ({
        context: (row.querySelector(".rd-meta")?.textContent ?? "").trim(),
        id: row.getAttribute(idAttr) ?? "",
        recency: row.getAttribute(recencyAttr) ?? null,
      }));
    const index = scope?.querySelector("[data-rd-progress-index]");
    return {
      axes: read("[data-rd-index-axis]", "data-rd-index-axis", "data-rd-index-recency"),
      mode: index?.getAttribute("data-rd-progress-index-mode") ?? "",
      problems: read("[data-rd-problem-index]", "data-rd-problem-index", "data-rd-problem-index-recency"),
      window: Number(index?.getAttribute("data-rd-progress-index-window") ?? 0),
    };
  });
const clickProgressSubject = (wanted) =>
  page.evaluate((mode) => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const option = scope?.querySelector(`[data-rd-progress-subview-option="${mode}"]`);
    option?.click();
    return Boolean(option);
  }, wanted);

const progressAxesSubject = await readProgressIndexRows();
const progressProblemsSubject = (await clickProgressSubject("problems"))
  ? await readProgressIndexRows()
  : { axes: [], mode: "unavailable", problems: [], window: progressAxesSubject.window };
const progressBackToAxes = (await clickProgressSubject("axes")) ? await readProgressIndexRows() : null;
const progressProjection = await apiProgress(progressAxesSubject.window);
const progressRecency = new Map([
  ...(progressProjection?.axes?.axes ?? []).map((row) => [`axis:${row.id}`, row.recencyAt ?? ""]),
  ...(progressProjection?.problems?.problems ?? []).map((row) => [`problem:${row.id}`, row.recencyAt ?? ""]),
]);
const progressRowParity = (rows, prefix) =>
  rows.map((row) => ({ ...row, expected: progressRecency.get(`${prefix}:${row.id}`) ?? null }));
const axisRowParity = progressRowParity(progressAxesSubject.axes, "axis");
const problemRowParity = progressRowParity(progressProblemsSubject.problems, "problem");
/**
 * A row states when, and the when it states is the projection's own `recencyAt`. V1/A3 made the Progress
 * axis row state the **bare age** (it shares the index-row grammar with the other three rails, whose rows
 * carry no "last activity" prefix); the age words are still the age of the timestamp the row carries, and
 * the raw `data-rd-index-recency` is still compared against the projection, so this is the same claim read
 * off the render the page actually draws rather than a phrase that no longer appears.
 */
const progressRowStatesWhen = (row) => {
  const age = row.expected ? ageWords(row.expected) : null;
  return (
    row.context !== "" &&
    age !== null &&
    row.context.endsWith(age) &&
    row.recency !== null &&
    row.recency === row.expected
  );
};
check(
  "C4: every Progress index row states when it was last active, and its recency is the payload's own",
  axisRowParity.length > 0 && axisRowParity.every(progressRowStatesWhen),
  `${axisRowParity.length} axis row(s) — ${JSON.stringify(axisRowParity.slice(0, 2))}`
);
// The pivot made Progress ONE workstream composition — the Axes/Problems subject switch and a separate
// "Problems" index were retired. A workstream's tasks are read in its own detail (the tasks list), which
// the checks below cover; the two legacy subject-switch checks have no subject here and say so.
skip(
  "C4: the Problems subject states when too — a row's recency is the payload's own",
  "the Progress index has no separate Problems subject (the pivot made Progress one workstream composition)"
);
skip(
  "C4: the subject switch stays client-side, and leaves the index back where it started",
  "the Axes/Problems subject switch was retired; there is no subview to switch"
);

/**
 * Any read action, with the same in-page credentials as `apiProgress`. Used where a section must compare the
 * DOM against the **projection the page reads** — the overview's rollups, for instance, which no other helper
 * exposes. Reads only: nothing in this pass writes through it.
 */
const apiAction = (key, input) =>
  page.evaluate(
    async ([plugin, actionKey, payload, orgId]) => {
      const cookie = (name) =>
        document.cookie
          .split("; ")
          .find((entry) => entry.startsWith(`${name}=`))
          ?.slice(name.length + 1) ?? "";
      const body = await fetch(`/v1/plugins/${plugin}/actions/${actionKey}`, {
        body: JSON.stringify({ input: payload }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": cookie("nakama_csrf"),
          "x-org-id": orgId,
        },
        method: "POST",
      }).then((r) => r.json());
      return body.result ?? null;
    },
    [PLUGIN_ID, key, input, ORG_ID]
  );
const apiIndex = async (days) => {
  // The row list is `axes.axes`: the outer object is the projection (window, threshold, rows).
  const result = await apiProgress(days);
  return result?.axes?.axes ?? null;
};
// The window control is retired by the pivot: Overview — the only window-scoped tab — is gone, so there is no
// window to change and no re-scope to test. The invariant the old loop protected survives without it: the
// Progress index must equal the **all-time** projection (activitySinceDays: 0), in the projection's own order,
// and re-entering Progress must replace it rather than extend it. The two window-specific helpers
// (`showOverview`, `setOverviewWindow`) are removed with their subject.
const showProgress = async () => {
  await root.locator('[data-rd-view-option="progress"]').click();
  // The view container, and its index shell, appear before `get_progress` answers — re-entering Progress
  // refetches, so a read taken on the container alone sees zero rows against a full projection. Wait on the
  // page's own row count attribute (or its stated-empty marker) instead.
  await page
    .waitForFunction(
      (pluginId) => {
        const index = document.querySelector(
          `div[data-plugin-id="${pluginId}"] [data-rd-progress-index]`
        );
        if (!index) return false;
        const rows = Number(index.getAttribute("data-rd-progress-index-rows") ?? -1);
        return (
          rows > 0 ||
          index.querySelector("[data-rd-progress-index-empty], [data-rd-problem-index-empty]") !== null
        );
      },
      PLUGIN_ID,
      { timeout: 12000, polling: 50 }
    )
    .catch(() => {});
};

const startWindow = (await readIndex())?.window ?? 0;
const indexMismatches = [];
const compareIndexToProjection = async (label) => {
  const dom = await readIndex();
  const projection = await apiIndex(0);
  if (!dom || !projection) {
    indexMismatches.push(`${label}: no index (${Boolean(dom)}) or no projection (${Boolean(projection)})`);
    return;
  }
  if (dom.window !== 0) {
    indexMismatches.push(`${label}: the index reports window ${dom.window}, not all time (0)`);
  }
  if (dom.rows.length !== projection.length) {
    indexMismatches.push(`${label}: ${dom.rows.length} rows on screen, ${projection.length} in the projection`);
  }
  for (const row of dom.rows) {
    const expected = projection.find((entry) => entry.id === row.id);
    if (!expected) {
      indexMismatches.push(`${label}: a row (${row.id.slice(0, 8)}) is not in the projection`);
      continue;
    }
    if (row.problems !== expected.problems) {
      indexMismatches.push(
        `${label}: "${expected.title}" shows ${row.problems} problems, the projection says ${expected.problems}`
      );
    }
    if (row.openProblems !== expected.openProblems) {
      indexMismatches.push(
        `${label}: "${expected.title}" shows ${row.openProblems} open problems, the projection says ${expected.openProblems}`
      );
    }
    if (row.state !== expected.state) {
      indexMismatches.push(`${label}: "${expected.title}" shows state ${row.state}, the projection says ${expected.state}`);
    }
  }
  // Server order is the presentation order: the page must not re-sort what the projection ordered. The
  // pivot's Progress index renders workstreams **grouped under their project heading**
  // (docs/design/dashboard-information-architecture-pivot.md: "Workstreams grouped under simple muted
  // project headings"), and the page groups by a project's FIRST appearance in the projection while
  // preserving the projection's order inside each group (`src/ui.tsx` ProgressAxisRail) — it re-sorts
  // nothing. So the expected on-screen order is the projection order STABLE-PARTITIONED by project
  // (first-seen project first). Comparing against the flat order would flag the accepted grouping itself
  // as a defect; comparing against the grouping still fails on any real re-sort (a project's rows out of
  // the projection's order, or a group that is not the projection's first-appearance order).
  const groupKey = (entry) => entry.topicId ?? entry.topicName ?? "";
  const groupOrder = [];
  const byGroup = new Map();
  for (const entry of projection) {
    const g = groupKey(entry);
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      groupOrder.push(g);
    }
    byGroup.get(g).push(entry.id);
  }
  const expectedOrder = groupOrder.flatMap((g) => byGroup.get(g)).join(",");
  const screenOrder = dom.rows.map((row) => row.id).join(",");
  if (screenOrder !== expectedOrder) {
    indexMismatches.push(`${label}: the on-screen row order differs from the projection's`);
  }
};
// Stand on Progress and assert the all-time equality (the retired loop's invariant, without the window).
await showProgress();
await compareIndexToProjection("Progress reads all time");
check(
  "the Progress index is the all-time projection — replaced on re-entry, never re-scoped by a retired window",
  indexMismatches.length === 0,
  indexMismatches.slice(0, 4).join("; ") || "matched the all-time projection"
);
await showProgress();

// ---------------------------------- C7c: the three-column composition, and selection that changes it
// Step 2 of the Progress slice: index on the left, the selected axis's Problem in the middle, its Activity
// beside it — visible at once — with the detail taken from `get_progress`, never reconstructed from the V1
// topic payload. Everything below is checked **against the projection's own answer**, so it tests the page
// rather than this dataset: the column headings are the projection's counts, the statement shown is the first
// open problem in the projection's order, and the feed is the projection's bucket for that axis.
const readTop = () =>
  page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const top = scope?.querySelector('[data-rd-progress-top="true"]');
    const index = top?.querySelector('[data-rd-progress-index="true"]') ?? null;
    const problemColumn = top?.querySelector(".rd-progress-problem") ?? null;
    const feedColumn = top?.querySelector(".rd-progress-activity") ?? null;
    const box = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect
        ? {
            h: Math.round(rect.height),
            w: Math.round(rect.width),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          }
        : null;
    };
    return {
      boxes: {
        feed: box(feedColumn),
        index: box(index),
        problem: box(problemColumn),
      },
      feed: {
        axis: feedColumn?.getAttribute("data-rd-progress-feed-axis") ?? null,
        count: Number(feedColumn?.getAttribute("data-rd-progress-feed-count") ?? -1),
        heading: (feedColumn?.querySelector("h3")?.textContent ?? "").trim(),
        note: (feedColumn?.querySelector("[data-rd-progress-feed-note]")?.textContent ?? "").trim(),
        // What the page *says* it is showing, and how many it says it is holding back (U9: the feed leads
        // with the newest events and states the remainder instead of rendering an unbounded column).
        shown: Number(
          feedColumn
            ?.querySelector("[data-rd-progress-feed]")
            ?.getAttribute("data-rd-progress-feed-shown") ?? -1
        ),
        stated: Number(
          feedColumn
            ?.querySelector("[data-rd-progress-feed-more]")
            ?.getAttribute("data-rd-progress-feed-more") ?? -1
        ),
        rows: [...(feedColumn?.querySelectorAll("[data-rd-feed-event]") ?? [])].map(
          (node) => (node.innerText ?? "").replace(/\s+/g, " ").trim()
        ),
      },
      indexRows: [...(index?.querySelectorAll("[data-rd-index-axis]") ?? [])].map((node) => ({
        active: node.getAttribute("aria-pressed") === "true",
        id: node.getAttribute("data-rd-index-axis"),
      })),
      problem: {
        axis: problemColumn?.getAttribute("data-rd-progress-problem-axis") ?? null,
        empty: (problemColumn?.querySelector("[data-rd-progress-problem-empty]")?.textContent ?? "").trim(),
        heading: (problemColumn?.querySelector("h3")?.textContent ?? "").trim(),
        open: Number(problemColumn?.getAttribute("data-rd-progress-problem-open") ?? -1),
        shown: problemColumn?.getAttribute("data-rd-progress-problem-shown") ?? "",
        statement: (
          problemColumn?.querySelector("[data-rd-problem] .rd-strong")?.textContent ?? ""
        ).trim(),
      },
    };
  });

/** What the projection says the page should be showing, for one axis.
 *
 * Deliberately defensive: a payload missing a half must make the checks that read it **fail with a reason**,
 * never throw. A release older than the activity half did exactly that — the corpus pass died inside this
 * function with a `TypeError`, reporting nothing about the page across 40-odd checks. */
const projectionFor = (result, axisId) => {
  const axis = (result?.axes?.axes ?? []).find((row) => row.id === axisId) ?? null;
  const problems = (result?.problems?.problems ?? []).filter((row) => row.axisId === axisId);
  return {
    axis,
    bucket: (result?.activity?.byAxis ?? []).find((entry) => entry.axisId === axisId) ?? null,
    open: problems.filter((row) => row.state === "open"),
    problems,
  };
};

const windowDaysNow = startWindow;
const allProgress = await apiProgress(windowDaysNow);
const top = await readTop();
const activeRow = top.indexRows.find((row) => row.active) ?? null;
const first = allProgress?.axes?.axes?.[0] ?? null;

// One payload, three halves — checked before anything compares against them, because a missing half is a
// plugin/instance fact (an older release, a refused action), not a rendering defect, and the pass should say
// so instead of failing a page check for a reason the page cannot control.
{
  const halves = [
    ["axes", allProgress?.axes?.axes],
    ["problems", allProgress?.problems?.problems],
    ["activity", allProgress?.activity?.byAxis],
  ];
  const missing = halves.filter(([, value]) => !Array.isArray(value)).map(([half]) => half);
  check(
    "the get_progress payload carries all three halves the page reads (axes, problems, activity)",
    missing.length === 0,
    missing.length === 0
      ? `3 halves · ${halves.map(([half, value]) => `${half} ${value.length}`).join(" · ")}`
      : `MISSING ${missing.join(", ")} — the instance serves a release older than this page expects; ` +
        `every check below that reads a missing half will fail`
  );
}

const selectAxis = async (axisId) => {
  await root.locator(`[data-rd-index-axis="${axisId}"]`).click();
  await page
    .waitForFunction(
      (wanted) =>
        document
          .querySelector('div[data-plugin-id="research-dashboard"] .rd-progress-problem')
          ?.getAttribute("data-rd-progress-problem-axis") === wanted,
      axisId,
      { timeout: 10000 }
    )
    .catch(() => {});
  await page.waitForTimeout(200);
};

// The projection for the axis the page opens on, used by the Activity-feed check below (that check *is* about
// the default selection, so it keys on `axes[0]` on purpose — unlike the Problem-column check).
const firstProjection = first ? projectionFor(allProgress, first.id) : null;

// Retired (C4 increment 2): this check read "the Progress top area shows the index, the Problem column and the
// Activity feed side by side". It asserted the *previous* outer composition — three sibling columns — which the
// ruling replaced with the index and ONE pane holding the Problem and its Activity as that pane's row 1. Its
// subject no longer exists, and its purpose is covered more directly and more strictly by the C4 geometry
// checks below, which measure the pane's containment, the header's place above both halves, and the Problem's
// dominance over the Activity as page geometry rather than as a class layout.

// The default selection is the projection's own first row — not a ranking the page invented.
retired(
  "the axis index opens on the projection's first row, and the detail columns follow it",
  activeRow !== null && activeRow.id === first?.id && top.problem.axis === first?.id && top.feed.axis === first?.id,
  `active ${activeRow?.id?.slice(0, 8) ?? "none"}, projection first ${first?.id?.slice(0, 8) ?? "none"}, problem column ${top.problem.axis?.slice(0, 8) ?? "none"}, feed ${top.feed.axis?.slice(0, 8) ?? "none"}`
);

// The Problem column: the projection's count in the heading, and the first *open* problem in the
// projection's order on screen. No recency ranking, no activity-count ranking, no repository ranking.
//
// The axis is the one **with** open problems, chosen from the projection — not `axes[0]`. The projection orders
// axes by recency and a fixture re-application writes them all inside one millisecond, so `axes[0]` can be an
// axis with no problems at all; keying this check on it made the check skip on a dataset that does have
// problems (see `U4-progress.md` §13). The check then puts the selection back where the page started.
const problemAxis =
  (allProgress?.axes?.axes ?? [])
    .map((axis) => ({
      axis,
      rows: (allProgress.problems?.problems ?? []).filter(
        (problem) => problem.axisId === axis.id && problem.state === "open"
      ),
    }))
    .sort((a, b) => b.rows.length - a.rows.length)[0] ?? null;
if (problemAxis && problemAxis.rows.length > 0) {
  await selectAxis(problemAxis.axis.id);
  const onAxis = await readTop();
  retired(
    "the Problem column shows the projection's first open problem, under the projection's own count",
    // §13 / reviewer: the top-left heading is the *selected* problem ("Current problem"), not the inventory
    // heading — the full open-problems list is its own section below. The count is still the projection's own,
    // read from the card's own attribute rather than from a heading string.
    /[Cc]urrent problem/.test(onAxis.problem.heading) &&
      onAxis.problem.open === problemAxis.axis.openProblems &&
      onAxis.problem.shown === problemAxis.rows[0]?.id &&
      onAxis.problem.statement === (problemAxis.rows[0]?.statement ?? "").trim(),
    `axis "${problemAxis.axis.title.slice(0, 34)}": heading "${onAxis.problem.heading}" (projection ${problemAxis.axis.openProblems}), shown ${onAxis.problem.shown?.slice(0, 8) ?? "none"} vs first open ${problemAxis.rows[0]?.id?.slice(0, 8) ?? "none"}`
  );
  if (first) {
    await selectAxis(first.id);
  }
} else {
  skip(
    "the Problem column shows the projection's first open problem, under the projection's own count",
    "no axis in this dataset has an open problem, so this pass cannot exercise the Problem column"
  );
}

// The command's own problem list moved out of this column in step 4 (it is the axis's inventory now, its own
// section below), so what is asserted here is the card: it is the projection's first open problem, under the
// projection's count, and the column no longer duplicates the list.

// The Activity feed: the projection's bucket for this axis, newest first — rendered as the page's own stated
// window, with the remainder stated rather than silently dropped. U9 capped the column (one corpus axis
// carries 43 events, ~10.8k px of column at 1280×800), so the check reads the window the page claims
// (`shown`), compares *that* against the projection's prefix, and requires the page to say how many it
// holds back. A cap that went silent — or a page that rendered fewer rows than it claimed — fails here.
{
  const bucket = firstProjection?.bucket ?? null;
  const rows = top.feed.rows;
  const expected = bucket?.events ?? [];
  const window = Math.max(0, Math.min(top.feed.shown, expected.length));
  const aligned =
    rows.length === window && expected.slice(0, window).every((event, position) => rows[position]?.includes(event.summary));
  const capStated =
    expected.length <= top.feed.shown
      ? top.feed.stated === -1 && top.feed.shown === expected.length
      : top.feed.stated === expected.length - top.feed.shown &&
        new RegExp(`^${top.feed.shown} of ${expected.length} shown`).test(top.feed.note);
  retired(
    "the Activity feed is the projection's bucket for the selected axis, newest first, capped and stating the remainder",
    top.feed.axis === first?.id &&
      top.feed.count === (bucket?.eventCount ?? 0) &&
      // §13 / reviewer: the column is labelled "Recent activity", with the authoritative total stated
      // separately (asserted above via feed.count === bucket.eventCount) rather than embedded in the heading.
      /[Rr]ecent activity/.test(top.feed.heading) &&
      (expected.length === 0 ? top.feed.rows.length === 0 : aligned && capStated),
    `feed axis ${top.feed.axis?.slice(0, 8)}, count ${top.feed.count} (projection ${bucket?.eventCount ?? 0}), heading "${top.feed.heading}" (index row ${first?.activityInWindow ?? 0}), shown ${top.feed.shown}/${expected.length} (rendered ${rows.length}), holds back ${top.feed.stated}, note "${top.feed.note}"`
  );
}

// Selection is the point of the index: picking another axis must move **both** columns to that axis's data,
// and the projection stays the judge of what the new data is.
{
  const wanted = allProgress.axes.axes.find(
    (row) => row.id !== first?.id && (projectionFor(allProgress, row.id).bucket?.events.length ?? 0) > 0
  );
  if (!wanted) {
    skip(
      "selecting another axis moves the Problem and Activity columns to that axis",
      "no other axis in this dataset has activity in the window"
    );
  } else {
    await root.locator(`[data-rd-index-axis="${wanted.id}"]`).click();
    await page.waitForFunction(
      (axisId) =>
        document
          .querySelector('div[data-plugin-id="research-dashboard"] .rd-progress-problem')
          ?.getAttribute("data-rd-progress-problem-axis") === axisId,
      wanted.id,
      { timeout: 10000 }
    ).catch(() => {});
    const moved = await readTop();
    const expected = projectionFor(allProgress, wanted.id);
    const wantedRows = moved.feed.rows;
    const wantedEvents = (expected.bucket?.events ?? []).slice(
      0,
      Math.max(0, Math.min(moved.feed.shown, (expected.bucket?.events ?? []).length))
    );
    retired(
      "selecting another axis moves the Problem and Activity columns to that axis",
      moved.problem.axis === wanted.id &&
        moved.feed.axis === wanted.id &&
        /[Cc]urrent problem/.test(moved.problem.heading) &&
        moved.feed.count === (expected.bucket?.eventCount ?? 0) &&
        (moved.problem.open === 0
          ? moved.problem.empty !== ""
          : moved.problem.shown === (expected.open[0]?.id ?? "")) &&
        wantedRows.length === wantedEvents.length &&
        wantedEvents.every((event, position) => wantedRows[position]?.includes(event.summary)),
      `selected ${wanted.id.slice(0, 8)}: problem axis ${moved.problem.axis?.slice(0, 8) ?? "none"}, feed axis ${moved.feed.axis?.slice(0, 8) ?? "none"}, shown ${moved.problem.shown?.slice(0, 8) ?? "none"} (projection ${expected.open[0]?.id?.slice(0, 8) ?? "none open"}), ${wantedRows.length} feed rows vs ${wantedEvents.length}`
    );
    // Back to the first row, so the checks after this one read the projection's default again.
    await root.locator(`[data-rd-index-axis="${first.id}"]`).click();
    await page.waitForTimeout(300);
  }
}

// ---------------------------------- C7d: the Plan section — optional, projection-driven, and unordered-proof
// Step 3: the axis's optional plan renders below the composition. Every assertion here is again against the
// projection: which steps exist, their order, their stored state. The unordered case is the one that can
// catch a client sorting what the model never ordered, so it is tested as a **discriminator** — the fixture's
// two unpositioned steps are written zulu-first, alpha-second, so the store's order and an alphabetical sort
// disagree, and the check fails if the page produces the sorted one.
const readPlan = () =>
  page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    // The CURRENT plan surface (the pivot): the axis's own plan is a `.rd-scoped-plan` disclosure labelled
    // "Workstream plan". This replaced the retired `.rd-progress-plan` / `[data-rd-plan-step]` surface; the
    // assertions below are unchanged — only the hooks they read are re-pointed to the current build.
    const section =
      [...(scope?.querySelectorAll(".rd-scoped-plan") ?? [])].find(
        (node) => (node.querySelector("summary")?.textContent ?? "").trim() === "Workstream plan"
      ) ?? null;
    const steps = [...(section?.querySelectorAll(".rd-plan-step") ?? [])].map((node) => {
      // A plan step's state is STORED (not a claim), so its badge is the `data-rd-step-state` span —
      // it carries no confidence attribute by design (the check asserts exactly that).
      const badge = node.querySelector("[data-rd-step-state]");
      const position = node.getAttribute("data-rd-scoped-plan-position");
      return {
        claimsConfidence: badge?.hasAttribute("data-rd-state-confidence") ?? null,
        position: position === null || position === "" ? "" : position,
        // The plan↔problem "shown" marker was retired by the pivot (a problem is a task card now).
        shown: Boolean(node.querySelector("[data-rd-plan-step-shown]")),
        state: (badge?.textContent ?? "").trim(),
        title: (node.querySelector(".rd-strong")?.textContent ?? "").trim(),
      };
    });
    const box = section?.getBoundingClientRect();
    return {
      axis:
        scope
          ?.querySelector("[data-rd-progress-detail-axis]")
          ?.getAttribute("data-rd-progress-detail-axis") ?? null,
      // Any wording about a plan being absent would be the empty shell the reviewer ruled out.
      mentionsMissingPlan: /no plan|missing plan|plan not/i.test(
        (scope?.innerText ?? "").replace(/\s+/g, " ")
      ),
      present: section !== null,
      steps,
      summary: (section?.querySelector("p")?.textContent ?? "").trim(),
      unordered: steps.length > 1 && steps.every((step) => step.position === ""),
      y: box ? Math.round(box.top) : null,
    };
  });
// The selectAxis helper is defined above the composition block, because the Problem-column check needs to
// choose its own subject axis and that block comes first in the file.

const planOf = (result, axisId) =>
  result.axes.axes.find((row) => row.id === axisId)?.plan ?? null;

// (1) In row 2 inside the pane, below the pair — not a fourth column beside it. Measured against the Problem
// and the Activity rather than against the whole top row: the index is a column beside the pane, so its bottom
// says nothing about where the pane's own rows begin.
{
  const planned = allProgress.axes.axes.find((row) => planOf(allProgress, row.id) !== null) ?? null;
  if (!planned) {
    skip(
      "the plan renders below the composition, from the projection",
      "no axis in this dataset carries a plan"
    );
  } else {
    await selectAxis(planned.id);
    const shown = await readPlan();
    const boxes = (await readTop()).boxes;
    const pairBottom = Math.max(
      ...[boxes.problem, boxes.feed].map((box) => (box?.y ?? 0) + (box?.h ?? 0))
    );
    const expected = planOf(allProgress, planned.id);
    const titles = expected.steps.map((step) => step.title);
    retired(
      "the plan renders in row 2, below the Problem and the Activity, from the projection",
      shown.present &&
        shown.axis === planned.id &&
        shown.y !== null &&
        shown.y >= pairBottom &&
        shown.steps.length === expected.steps.length &&
        shown.steps.every((step, position) => step.title === titles[position]) &&
        shown.summary === expected.summary.trim() &&
        shown.steps.every((step, position) => step.state === expected.steps[position].state),
      `plan at y=${shown.y} vs the pair's bottom ${pairBottom}; ${shown.steps.length} steps vs ${expected.steps.length}; titles ${JSON.stringify(shown.steps.map((s) => s.title))}`
    );
    // (2) A position is rendered only where a step claims one — here the fixture's plan claims them, so the
    // numbers come from `position` and nothing is derived.
    check(
      "step numbers come from the stored position, and a stored step state carries no invented confidence",
      shown.steps.every((step, position) => {
        const claimed = expected.steps[position].position;
        return claimed === null ? step.position === "" : step.position === String(claimed);
      }) && shown.steps.every((step) => step.claimsConfidence === false),
      `positions ${JSON.stringify(shown.steps.map((s) => s.position))} for ${JSON.stringify(expected.steps.map((s) => s.position))}; confidence attributes ${JSON.stringify(shown.steps.map((s) => s.claimsConfidence))}`
    );
  }
}

// (2b) The plan ↔ problem link, read in both directions. The projection's *first open* problem on this axis is
// the unlinked one, so the marker must be absent for it — and this check deliberately switches to the linked
// problem rather than trusting the default, which is the case that would silently pass if the marker were
// hard-wired to the first step.
{
  const linkedFor = (result, axisId) =>
    result.problems.problems.find((row) => row.axisId === axisId && row.planStepId) ?? null;
  const axisWithLink =
    allProgress.axes.axes.find((row) => planOf(allProgress, row.id) !== null && linkedFor(allProgress, row.id)) ??
    null;
  if (!axisWithLink) {
    skip(
      "the problem's step and the step's problem are marked, both ways",
      "no axis in this dataset has a plan and a problem naming one of its steps"
    );
  } else {
    const linked = linkedFor(allProgress, axisWithLink.id);
    const stepTitle = planOf(allProgress, axisWithLink.id).steps.find(
      (step) => step.id === linked.planStepId
    )?.title ?? "";
    await selectAxis(axisWithLink.id);
    const before = await readPlan();
    const alreadyShown = before.steps.some((step) => step.shown);
    if (!alreadyShown) {
      // It is listed rather than shown, so pick it. (If it is already the shown problem it is deliberately
      // absent from the list — the card is it.)
      await clickIfPresent(root.locator(`[data-rd-problem-choice="${linked.id}"]`));
      await page.waitForTimeout(300);
    }
    const after = await readPlan();
    const card = await page.evaluate(
      (id) =>
        (
          document.querySelector(
            `div[data-plugin-id="research-dashboard"] [data-rd-problem="${id}"] [data-rd-problem-facts="true"]`
          )?.textContent ?? ""
        )
          .replace(/\s+/g, " ")
          .trim(),
      linked.id
    );
    check(
      "the problem's step and the step's problem are marked, both ways",
      after.steps.filter((step) => step.shown).length === 1 &&
        after.steps.every((step, position) =>
          position ===
          planOf(allProgress, axisWithLink.id).steps.findIndex((s) => s.id === linked.planStepId)
            ? step.shown
            : !step.shown
        ) &&
        card.includes(stepTitle),
      `marked steps ${JSON.stringify(after.steps.map((s) => s.shown))} for step ${linked.planStepId?.slice(0, 8)}; card facts "${card}"`
    );
  }
}

// (3) The unordered plan: the store's order, no invented numbers, no invented confidence, and the page says
// the plan claims no order rather than letting the list read as a sequence.
{
  const unordered = allProgress.axes.axes.find((row) => {
    const plan = planOf(allProgress, row.id);
    return plan !== null && plan.steps.length > 1 && plan.steps.every((step) => step.position === null);
  }) ?? null;
  if (!unordered) {
    skip(
      "an unordered plan keeps the store's order and invents no sequence",
      "no axis in this dataset carries a multi-step plan with no positions"
    );
  } else {
    await selectAxis(unordered.id);
    const shown = await readPlan();
    // The Progress context panel's plan is read from the SCOPED `get_topic({topicId, axisId})` (src/ui.tsx
    // §`progressSelection`), NOT the flattened `get_progress` plan; the two read paths order unpositioned
    // steps differently (get_progress sorts by position then createdAt; the scoped get_topic by
    // position IS NULL, position, created_at, id). Compare the page against the surface's OWN source, so the
    // assertion is about the order the page actually renders rather than about a different read path.
    const scoped = await apiAction("get_topic", { axisId: unordered.id, topicId: unordered.topicId });
    const expected = scoped?.axis?.plan ?? null;
    const titles = (expected?.steps ?? []).map((step) => step.title);
    const sortedAlphabetically = [...titles].sort((left, right) => left.localeCompare(right));
    check(
      "an unordered plan keeps the store's order and invents no sequence",
      expected !== null &&
        shown.present &&
        shown.steps.length === titles.length &&
        shown.steps.every((step, position) => step.title === titles[position]) &&
        shown.steps.every((step) => step.position === "") &&
        shown.unordered &&
        // The check only means something if the two orders actually differ on this dataset.
        titles.join("|") !== sortedAlphabetically.join("|") &&
        shown.steps.every((step, position) => step.state === expected.steps[position].state) &&
        shown.steps.every((step) => step.claimsConfidence === false),
      `order ${JSON.stringify(shown.steps.map((s) => s.title))} vs scoped get_topic ${JSON.stringify(titles)} (alphabetical would be ${JSON.stringify(sortedAlphabetically)}); positions ${JSON.stringify(shown.steps.map((s) => s.position))}; unordered marker ${shown.unordered}`
    );
  }
}

// (3b) ADDITIVE current-surface coverage for two high-risk subjects the four-tab pivot re-homed (plan §3.1):
// the blocked-state subject (P26/P27/P31 — "the blocked axis shows its blocker text", whose old AXIS-level
// hook is retired) and the unordered-plan subject (P14) in its PARTLY-ordered form (the served seed's plan
// is 0,1,2,3,4,null, which the all-or-nothing `unordered` subject above cannot reach). Both read the
// CURRENT build's own hooks — task cards' `data-rd-task-state` and the scoped plan's
// `data-rd-scoped-plan-position` — so the substance is asserted on what ships, not on the retired hooks the
// SKIP lines name. Each is a truthfulness assertion that can LOSE (a wrong state, or an invented position).
{
  // (a) Blocked task state on the current task-card surface.
  const blockedProblem =
    (allProgress.problems.problems ?? []).find((row) => row.state === "blocked") ?? null;
  if (!blockedProblem) {
    skip(
      "a blocked task renders its own stored state on the current task-card surface (current-surface re-point of the retired blocked-axis check)",
      "no problem in this dataset has the blocked state"
    );
  } else {
    const stateById = Object.fromEntries((allProgress.problems.problems ?? []).map((p) => [p.id, p.state]));
    await selectAxis(blockedProblem.axisId);
    await page.waitForTimeout(300);
    const cards = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      return [...(scope?.querySelectorAll("[data-rd-task-card]") ?? [])].map((node) => ({
        id: node.getAttribute("data-rd-task-card"),
        state: node.getAttribute("data-rd-task-state"),
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
      }));
    });
    const card = cards.find((c) => c.id === blockedProblem.id) ?? null;
    const mismatched = cards.filter((c) => stateById[c.id] && c.state !== stateById[c.id]);
    check(
      "a blocked task renders its own stored state on the current task-card surface (current-surface re-point of the retired blocked-axis check)",
      card !== null && card.state === "blocked" && /blocked/i.test(card.text) && mismatched.length === 0,
      `blocked card ${blockedProblem.id.slice(0, 8)} state=${JSON.stringify(card?.state)} text names it=${card ? /blocked/i.test(card.text) : false}; state-mismatched card(s) ${mismatched.length}`
    );
  }

  // (b) A PARTLY-ordered plan keeps the store's order and invents no position for an unnumbered step.
  const mixedPlanAxis =
    allProgress.axes.axes.find((row) => {
      const plan = planOf(allProgress, row.id);
      return (
        plan !== null &&
        plan.steps.length > 1 &&
        plan.steps.some((step) => step.position === null) &&
        plan.steps.some((step) => step.position !== null)
      );
    }) ?? null;
  if (!mixedPlanAxis) {
    skip(
      "a partly-ordered plan keeps the store's order and invents no position for an unnumbered step (current-surface re-point)",
      "no axis in this dataset carries a plan mixing positioned and unpositioned steps"
    );
  } else {
    await selectAxis(mixedPlanAxis.id);
    await page.waitForTimeout(300);
    const shown = await readPlan();
    const expected = planOf(allProgress, mixedPlanAxis.id);
    const expectedPositions = expected.steps.map((step) =>
      step.position === null || step.position === "" ? "" : String(step.position)
    );
    check(
      "a partly-ordered plan keeps the store's order and invents no position for an unnumbered step (current-surface re-point)",
      shown.present &&
        shown.steps.length === expected.steps.length &&
        shown.steps.every(
          (step, position) =>
            step.title === expected.steps[position].title && step.position === expectedPositions[position]
        ),
      `positions ${JSON.stringify(shown.steps.map((s) => s.position))} vs stored ${JSON.stringify(expectedPositions)}`
    );
  }
}

// (3c) ADDITIVE current-surface coverage for two next-risk-batch subjects the pivot re-homed: the blocked
// WORKSTREAM's own blocker text (whose retired Projects-hook check is now a SKIP above), and a workstream
// that states NO progress (its reading must say so and carry no confidence for it). Both read the CURRENT
// Progress context panel hooks — `data-rd-axis-blocker` and `data-rd-axis-reading` — not the retired
// Projects/per-axis hooks. Each is a truthfulness assertion that can LOSE (a wrong/missing blocker text, or
// a confidence badge on a claim nobody stated).
{
  const readContextPanel = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const panel = scope?.querySelector("[data-rd-context-panel]");
      const reading = panel?.querySelector("[data-rd-axis-reading]");
      const blocker = panel?.querySelector("[data-rd-axis-blocker]");
      const blockerConf = blocker?.querySelector("[data-rd-conf]")?.getAttribute("data-rd-conf") ?? null;
      const blockerRaw = (blocker?.textContent ?? "").replace(/\s+/g, " ").trim();
      return {
        axis: panel?.getAttribute("data-rd-context-panel") ?? null,
        // The blocker paragraph carries the text plus its own confidence badge; the badge's word is stripped
        // so the comparison is against the stored prose, not against the claim's confidence.
        blocker: blockerConf ? blockerRaw.slice(0, blockerRaw.length - blockerConf.length).trim() : blockerRaw,
        blockerConfidence: blockerConf,
        reading: (reading?.textContent ?? "").replace(/\s+/g, " ").trim(),
        readingConfidence:
          reading?.querySelector("[data-rd-conf]")?.getAttribute("data-rd-conf") ?? null,
      };
    });
  // Select an axis on the Progress surface and wait for ITS context panel, not for the problem column (an
  // axis with no problems renders no problem column, so `selectAxis`' wait would time out).
  const selectAxisByPanel = async (axisId) => {
    const row = root.locator(`[data-rd-index-axis="${axisId}"]`).first();
    if ((await row.count()) === 0) return false;
    await row.click();
    await page
      .waitForFunction(
        (wanted) =>
          document
            .querySelector('div[data-plugin-id="research-dashboard"] [data-rd-context-panel]')
            ?.getAttribute("data-rd-context-panel") === wanted,
        axisId,
        { timeout: 8000 }
      )
      .catch(() => {});
    await page.waitForTimeout(200);
    return true;
  };

  // (a) A blocked workstream shows its own stored blocker text on the Progress context panel.
  const blockedAxis =
    (allProgress.axes.axes ?? []).find((row) => row.state === "blocked" && row.blocker) ?? null;
  if (!blockedAxis) {
    skip(
      "a blocked workstream renders its own stored blocker text on the Progress context panel (current-surface re-point of the retired blocked-axis check)",
      "no blocked workstream with stored blocker text in this dataset"
    );
  } else {
    await selectAxisByPanel(blockedAxis.id);
    const shown = await readContextPanel();
    check(
      "a blocked workstream renders its own stored blocker text on the Progress context panel (current-surface re-point of the retired blocked-axis check)",
      shown.axis === blockedAxis.id && shown.blocker === blockedAxis.blocker,
      `panel ${shown.axis?.slice(0, 8) ?? "none"}, blocker ${JSON.stringify(shown.blocker)} (conf ${JSON.stringify(shown.blockerConfidence)}) (wanted ${JSON.stringify(blockedAxis.blocker)})`
    );
  }

  // (b) A workstream that states no progress says so and carries no confidence for it. The flattened
  // get_progress row carries no `currentState`, so the subject is derived from the surface's own source, the
  // scoped get_topic read.
  let bareAxis = null;
  for (const row of allProgress.axes.axes ?? []) {
    const scoped = await apiAction("get_topic", { axisId: row.id, topicId: row.topicId });
    const axis = scoped?.axis ?? null;
    if (axis && !axis.currentState) {
      bareAxis = { id: row.id, title: row.title };
      break;
    }
  }
  if (!bareAxis) {
    skip(
      "an axis that states no progress carries no confidence for it (current-surface re-point)",
      "every workstream in this dataset states a current reading"
    );
  } else {
    await selectAxisByPanel(bareAxis.id);
    const shown = await readContextPanel();
    check(
      "an axis that states no progress carries no confidence for it (current-surface re-point)",
      shown.axis === bareAxis.id &&
        /no current reading recorded/i.test(shown.reading) &&
        shown.readingConfidence === null,
      `panel ${shown.axis?.slice(0, 8) ?? "none"}, reading "${shown.reading}", confidence ${JSON.stringify(shown.readingConfidence)}`
    );
  }
}

// (4) Absent plan stays absent: no shell, no warning. The axis chosen deliberately has no plan.
{
  const unplanned = allProgress.axes.axes.find((row) => planOf(allProgress, row.id) === null) ?? null;
  if (!unplanned) {
    skip(
      "an axis with no plan renders no plan section at all",
      "every axis in this dataset carries a plan"
    );
  } else {
    await selectAxis(unplanned.id);
    const shown = await readPlan();
    retired(
      "an axis with no plan renders no plan section at all",
      shown.axis === unplanned.id && !shown.present && !shown.mentionsMissingPlan,
      `plan section present ${shown.present}, page mentions a missing plan ${shown.mentionsMissingPlan}`
    );
  }
  // Back to the projection's first row for whatever follows.
  await selectAxis(first.id);
}

// ------------------------------------- C7e: the axis's problem inventory, and the cases it must not show
// Step 4: the axis's **open** problems are their own section — navigation plus compact context — while the
// middle column's card stays the detailed reading surface. Membership, order, state and counts come from the
// projection; the page only decides which already-returned problem the card shows.
{
  const readInventory = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const section = scope?.querySelector(".rd-progress-problems") ?? null;
      return {
        axis: section?.getAttribute("data-rd-progress-problems-axis") ?? null,
        count: Number(section?.getAttribute("data-rd-progress-problems") ?? -1),
        rows: [...(section?.querySelectorAll("[data-rd-problem-choice]") ?? [])].map((node) => ({
          active: node.getAttribute("aria-pressed") === "true",
          claims: node.querySelector("[data-rd-state]")?.hasAttribute("data-rd-state-confidence") ?? null,
          context: (node.querySelector("[data-rd-problem-context]")?.textContent ?? "").trim(),
          id: node.getAttribute("data-rd-problem-choice"),
          state: node.querySelector("[data-rd-state]")?.getAttribute("data-rd-state") ?? "",
          statement: (node.querySelector(".rd-strong")?.textContent ?? "").trim(),
        })),
        stated: Number(
          section?.querySelector("[data-rd-problem-list]")?.getAttribute("data-rd-problem-list") ?? -1
        ),
        text: (section?.innerText ?? "").replace(/\s+/g, " ").trim(),
      };
    });

  const openProblemsOf = (axisId) =>
    (allProgress.problems.problems ?? []).filter(
      (problem) => problem.axisId === axisId && problem.state === "open"
    );

  // (1) Every open problem of the axis is listed, in the projection's order, under the projection's count.
  //
  // The subject axis is **the one with open problems, chosen from the projection** — not `axes[0]`. The
  // projection orders axes by recency, and a fixture that writes every axis within the same millisecond leaves
  // that order tiebroken by title, so "the first axis" is not a stable subject: the pass once asserted about a
  // plan-less, problem-less axis and reported the absence as a failure. That is the same same-millisecond
  // property that made an ordering assertion flake in the action suite (see `U4-progress.md` §15).
  const inventoryAxis = (allProgress.axes.axes ?? [])
    .map((row) => ({ open: openProblemsOf(row.id).length, row }))
    .sort((a, b) => b.open - a.open)[0] ?? null;
  const inventorySubject = (inventoryAxis?.open ?? 0) > 0;
  if (inventorySubject) {
    check(
      "the fixture still carries an axis with open problems to inventory",
      true,
      `${inventoryAxis.open} open problem(s) on "${inventoryAxis.row.title}"`
    );
  } else {
    skip(
      "the fixture still carries an axis with open problems to inventory",
      "no axis in this dataset carries an open problem — the fixture's axis carries three, two of them open, " +
        "so that run " +
        "discriminates; here the inventory has no subject"
    );
  }
  const inventoryAxisId = inventoryAxis?.row?.id ?? first.id;
  await selectAxis(inventoryAxisId);
  const inventory = await readInventory();
  const expectedOpen = openProblemsOf(inventoryAxisId);
  const listed = inventory.rows.map((row) => row.id).join("|");
  const wanted = expectedOpen.map((problem) => problem.id).join("|");
  // Nothing to list is not the same as listing nothing: with no open problem on the axis the section is
  // (correctly) absent, so these three checks have no subject and say so instead of going red or, worse,
  // going green on an empty list. The fixture's axis carries three, two of them open.
  if (expectedOpen.length === 0) {
    skip(
      "the inventory lists every open problem of the axis, in the projection's order",
      "this dataset has no open problem on any axis, so there is no inventory to read"
    );
  } else {
    retired(
      "the inventory lists every open problem of the axis, in the projection's order",
      inventory.count === expectedOpen.length &&
        inventory.stated === expectedOpen.length &&
        listed === wanted,
      `${inventory.rows.length} row(s) of ${expectedOpen.length} open; count ${inventory.count}, list ${inventory.stated}; order ${listed === wanted ? "matches" : "differs"}`
    );
  }
  const statesMatch =
    expectedOpen.length === 0 ||
    inventory.rows.every((row, position) => row.state === expectedOpen[position]?.state);
  const contextsMatch =
    expectedOpen.length === 0 ||
    inventory.rows.every((row, position) => {
      const problem = expectedOpen[position];
      const repos = problem.repositories.map((repo) => repo.fullName).join(", ");
      return (
        row.context.includes(repos || "no repository") &&
        row.context.includes("last activity") &&
        Boolean(problem.planStepTitle) === row.context.includes("step: ")
      );
    });
  if (expectedOpen.length === 0) {
    skip(
      "each row carries its own state, repositories, step link and recency — compact context, nothing re-derived",
      "this dataset has no open problem on any axis, so there is no row to read the context off"
    );
  } else {
    check(
      "each row carries its own state, repositories, step link and recency — compact context, nothing re-derived",
      statesMatch && contextsMatch,
      `states ${statesMatch ? "match" : "differ"}; contexts ${contextsMatch ? "match" : "differ"}; first ${JSON.stringify(inventory.rows[0]?.context ?? "")}`
    );
  }

  // (2) The Progress detail follows the selection: the on-screen workstream is the active index row,
  // and selecting another workstream in the index moves the detail to it, with THAT workstream's task
  // cards. This is the accepted current contract — the retired problem column's per-row "choice" is gone;
  // tasks are cards under the selected workstream (`[data-rd-progress-tasks]` / `[data-rd-task-card]`),
  // and the selection that moves the detail is a workstream row in the index (`data-rd-index-axis`).
  const readDetail = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const detail = scope?.querySelector("[data-rd-progress-detail]") ?? null;
      const tasks = scope?.querySelector("[data-rd-progress-tasks]") ?? null;
      return {
        axis: detail?.getAttribute("data-rd-progress-detail-axis") ?? "",
        taskIds: [...(tasks?.querySelectorAll("[data-rd-task-card]") ?? [])].map((node) =>
          node.getAttribute("data-rd-task-card")
        ),
        taskTotal: Number(tasks?.getAttribute("data-rd-progress-tasks") ?? -1),
      };
    });
  const activeAxisId = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      return (
        scope
          ?.querySelector('[data-rd-index-axis][aria-pressed="true"]')
          ?.getAttribute("data-rd-index-axis") ?? null
      );
    });
  const selectedAxisNow = await activeAxisId();
  check(
    "exactly the workstream on screen is the active index row",
    selectedAxisNow === inventoryAxisId,
    `active ${selectedAxisNow?.slice(0, 8) ?? "none"} vs selected ${inventoryAxisId.slice(0, 8)}`
  );
  const otherAxis = (allProgress.axes.axes ?? []).find((row) => row.id !== inventoryAxisId) ?? null;
  if (otherAxis) {
    const before = await readDetail();
    await selectAxis(otherAxis.id);
    const after = await readDetail();
    const afterActive = await activeAxisId();
    check(
      "selecting a workstream in the index moves the detail to it, with that workstream's own tasks",
      after.axis === otherAxis.id && afterActive === otherAxis.id && after.axis !== before.axis,
      `detail axis ${after.axis?.slice(0, 8) ?? "none"} (wanted ${otherAxis.id.slice(0, 8)}); ` +
        `active ${afterActive?.slice(0, 8) ?? "none"}; task cards ${after.taskIds.length} of total ${after.taskTotal}; was ${before.axis?.slice(0, 8) ?? "none"}`
    );
    await selectAxis(inventoryAxisId);
  } else {
    skip(
      "selecting a workstream in the index moves the detail to it, with that workstream's own tasks",
      "this dataset has a single workstream, so there is no other selection to move to"
    );
  }

  // (2b) CURRENT-SURFACE re-point of the retired `Repository threads` assertion (plan §3.1 P39, and its
  // navigation P04/P05). The four-tab pivot removed the Problems inventory's Repository-threads section;
  // the repository-relation FUNCTIONALITY moved to the current supported projection — each task card's own
  // `Supporting repositories` tags (`[data-rd-task-card] [data-rd-entity-tag="repository"]`). This asserts
  // the substance at the CURRENT hooks (the same task-card surface the pass already reads above), so it is
  // not retired merely because the old problem surface is gone. It reads the cards the detail has ALREADY
  // rendered for the selected axis (no separate selection, so no race), and compares each card against the
  // projection's own count/order for that task id. Where no rendered card carries a repository link it says
  // so with a precise reason — never a blanket "absent".
  {
    const onAxisProblems = (allProgress.problems.problems ?? []).filter(
      (row) => row.axisId === inventoryAxisId
    );
    const byId = Object.fromEntries(onAxisProblems.map((row) => [row.id, row]));
    const renderedCards = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      return [...(scope?.querySelectorAll("[data-rd-task-card]") ?? [])].map((card) => {
        const tags = [...(card.querySelectorAll('[data-rd-entity-tag="repository"]') ?? [])];
        return {
          id: card.getAttribute("data-rd-task-card"),
          tagLabels: tags.map((n) => n.getAttribute("data-rd-tag-label")),
          tags: tags.map((n) => n.getAttribute("data-rd-entity-id")),
        };
      });
    });
    const relCards = renderedCards.filter((c) => (byId[c.id]?.repositories ?? []).length > 0);
    if (relCards.length > 0) {
      const ok = relCards.every((c) => {
        const wanted = byId[c.id].repositories.map((repo) => repo.id).join("|");
        return c.tags.join("|") === wanted;
      });
      check(
        "the repository threads are the task card's own relations, in the projection's order (current-surface re-point)",
        ok,
        relCards.map((c) => `${(byId[c.id].repositories ?? []).length} wanted -> ${c.tags.length} shown`).join("; ")
      );
    } else {
      skip(
        "the repository threads are the task card's own relations, in the projection's order (current-surface re-point)",
        `no rendered task card on the selected workstream carries a repository link (${renderedCards.length} card(s) read), so the current task-card repository surface has no subject`
      );
    }
    // The negative half — a rendered task with NOTHING behind it must show no repository shell (the pivot's
    // sparse case, plan P18/P30). The current task card renders `Supporting repositories` only when it has
    // repositories, so a 0-repository card must carry none.
    const sparseCards = renderedCards.filter(
      (c) => byId[c.id] && (byId[c.id].repositories ?? []).length === 0
    );
    if (sparseCards.length > 0) {
      check(
        "a task with no repositories renders no repository shell (current-surface sparse case)",
        sparseCards.every((c) => c.tags.length === 0),
        `${sparseCards.length} sparse card(s); tag counts ${sparseCards.map((c) => c.tags.length).join(",")}`
      );
    } else {
      skip(
        "a task with no repositories renders no repository shell (current-surface sparse case)",
        "no rendered task card on the selected workstream is repository-free, so the empty state has no subject"
      );
    }
    // The EntityTag contract on the CURRENT surface, executable: each rendered task card's repository tag
    // names its repository and, clicked, lands in the Repositories view with THAT repository selected under
    // its own label — and the traversal writes nothing. Read from the SAME rendered cards the checks above
    // read (no separate selection, so no race); click each distinct tag id once. The destination's selected
    // row is compared by its own displayed name (`data-rd-repository` carries the fullName, the tag's
    // `data-rd-tag-label` is the entity's own name), so a tag whose id is right but whose selection is wrong
    // still fails.
    if (relCards.length > 0) {
      const READ = new Set(["get_overview", "get_progress", "get_topic", "list_activity", "list_topics"]);
      const readRepositorySelection = () =>
        page.evaluate(() => {
          const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
          const view = scope?.querySelector('[data-rd-view="repositories"]') ?? null;
          const rows = [...(view?.querySelectorAll("[data-rd-repository]") ?? [])];
          return {
            count: rows.length,
            present: view !== null,
            selected: rows
              .filter((node) => node.getAttribute("aria-pressed") === "true")
              .map((node) => node.getAttribute("data-rd-repository")),
          };
        });
      const tagTargets = [];
      for (const card of relCards) {
        (card.tags ?? []).forEach((id, i) => {
          if (id && !tagTargets.some((t) => t.id === id)) {
            tagTargets.push({ id, label: card.tagLabels?.[i] ?? "" });
          }
        });
      }
      const writesBefore = actionCalls.filter((c) => !READ.has(c.key)).length;
      const landings = [];
      for (const target of tagTargets) {
        await selectAxis(inventoryAxisId);
        await root
          .locator(
            `[data-rd-task-card] [data-rd-entity-tag="repository"][data-rd-entity-id="${target.id}"]`
          )
          .first()
          .click();
        await page.waitForTimeout(300);
        landings.push({ ...target, sel: await readRepositorySelection() });
        await root.locator('[data-rd-view-option="progress"]').click();
        await page.waitForTimeout(200);
      }
      const writesAfter = actionCalls.filter((c) => !READ.has(c.key)).length;
      check(
        "each task-card repository tag lands in the Repositories view with THAT repository selected, under its own label (current-surface re-point)",
        landings.length === tagTargets.length &&
          landings.every(
            (l) => l.sel.present && l.sel.selected.length === 1 && l.sel.selected[0] === l.label && l.label !== ""
          ),
        landings
          .map((l) => `tag${l.id.slice(0, 8)} -> ${l.sel.selected[0] ?? "none"} (label ${JSON.stringify(l.label)})`)
          .join("; ")
      );
      check(
        "and the task-card repository-tag traversal wrote nothing — every action call it issued was a read",
        writesAfter === writesBefore,
        `write action(s) before ${writesBefore}, after ${writesAfter}`
      );
    }
  }

  // (3) A closed-out problem on this axis must not be listed. On the **fixture** the case exists, so the
  // check is discriminating; on a dataset that has no resolved problem it cannot be, and saying so is better
  // than a green tick on a dataset with nothing to leak — or a red one for a case the dataset never had.
  const onAxis = (allProgress.problems.problems ?? []).filter(
    (problem) => problem.axisId === inventoryAxisId
  );
  const closedOut = onAxis.filter((problem) => problem.state !== "open");
  if (closedOut.length > 0) {
    check(
      "a closed-out problem is not listed in the inventory",
      inventory.text.includes(closedOut[0].statement.slice(0, 30)) === false &&
        inventory.rows.length === expectedOpen.length,
      `${closedOut.length} closed-out of ${onAxis.length} problem(s) on the axis; ` +
        `${inventory.rows.length} row(s) for ${expectedOpen.length} open`
    );
  } else {
    skip(
      "a closed-out problem is not listed in the inventory",
      `this dataset has no resolved problem on the axis (${onAxis.length} problem(s), all open) — ` +
        `the fixture's axis carries one, so that run discriminates`
    );
  }

  // (4) An axis with no open problem: no section, and nothing alarming said about the absence — the axis
  // itself stays meaningful, which is what the reviewer's rule protects.
  const bare = allProgress.axes.axes.find((row) => row.openProblems === 0);
  if (bare) {
    await selectAxis(bare.id);
    const none = await readInventory();
    const column = await readTop();
    const scopeText = await page.evaluate(() =>
      (document.querySelector('div[data-plugin-id="research-dashboard"]')?.innerText ?? "")
        .replace(/\s+/g, " ")
        .trim()
    );
    const alarming = /missing problem|problem is missing|\berror\b|\bwarning\b|\binvalid\b/i.test(scopeText);
    check(
      "an axis with no open problem renders no inventory section, and says nothing alarming about the absence",
      none.rows.length === 0 && none.text === "" && !alarming,
      `rows ${none.rows.length}; section ${JSON.stringify(none.text.slice(0, 40))}; alarming ${alarming ? "present" : "absent"}; open problems ${bare.openProblems}`
    );
    retired(
      "the axis still renders: its title is readable and the card column follows the selection",
      scopeText.includes(bare.title) && column.problem.axis === bare.id,
      `title ${scopeText.includes(bare.title) ? "present" : "absent"}; column axis ${column.problem.axis?.slice(0, 8) ?? "none"} vs ${bare.id.slice(0, 8)}`
    );
    await selectAxis(inventoryAxisId);
  } else {
    skip(
      "the fixture still carries an axis with no open problem, so the empty case is exercised",
      "every axis in this dataset carries an open problem, so the empty case has no subject here"
    );
  }
}
  // ------------------------------- C7f: repository threads, evidence and human steering, and what each excludes
// Step 5's three supporting sections, plus the EntityTag contract's first executable instance: a repository
// tag in Progress must land in the Repositories view with that repository selected.
{
  const readSupport = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const repositorySection = scope?.querySelector(".rd-progress-repositories") ?? null;
      const evidenceSection = scope?.querySelector(".rd-progress-evidence") ?? null;
      const steeringSection = scope?.querySelector(".rd-progress-steering") ?? null;
      const claims = (selector) =>
        [...(steeringSection?.querySelectorAll(`${selector} [data-rd-steering]`) ?? [])].map(
          (node) => ({
            kind: (node.querySelector(".rd-source")?.textContent ?? "").trim(),
            meta: (node.querySelector(".rd-meta")?.textContent ?? "").trim(),
            text: (node.querySelector(".rd-steering-text")?.textContent ?? "").trim(),
          })
        );
      return {
        axisScope: claims('[data-rd-steering-scope="axis"]'),
        evidence: [...(evidenceSection?.querySelectorAll("[data-rd-evidence]") ?? [])].map(
          (node) => ({
            date: (node.querySelector(".rd-meta")?.textContent ?? "").trim(),
            id: node.getAttribute("data-rd-evidence"),
            source:
              node.querySelector("[data-rd-evidence-source]")?.getAttribute("data-rd-evidence-source") ??
              "",
            text: (node.innerText ?? "").replace(/\s+/g, " ").trim(),
          })
        ),
        evidencePresent: evidenceSection !== null,
        hasAxisScope: Boolean(steeringSection?.querySelector('[data-rd-steering-scope="axis"]')),
        hasProblemScope: Boolean(
          steeringSection?.querySelector('[data-rd-steering-scope="problem"]')
        ),
        problemScope: claims('[data-rd-steering-scope="problem"]'),
        repositories: [...(repositorySection?.querySelectorAll("[data-rd-entity-tag]") ?? [])].map(
          (node) => ({
            fullName: (node.textContent ?? "").trim(),
            id: node.getAttribute("data-rd-entity-id"),
          })
        ),
        repositoriesPresent: repositorySection !== null,
        steeringPresent: steeringSection !== null,
        steeringText: (steeringSection?.innerText ?? "").replace(/\s+/g, " ").trim(),
      };
    });

  // (1) Repository threads: the problem's own durable relations, in the projection's order, each one a tag —
  // and nothing is picked out as primary, because the model has no such thing.
  // The subject every check below needs: a problem carrying the fixture's relations. A dataset with no such
  // problem (the corpus has no problem rows at all) cannot exercise these, and the lookup that reads the
  // subject must never abort the pass — it once did exactly that, dying on `withRelations.axisId` with a
  // `TypeError` after 40-odd checks and reporting nothing about the page.
  const withRelations = (allProgress.problems.problems ?? []).find(
    (problem) => problem.repositories.length > 1
  ) ?? null;
  // The step-5 problem surface (repository threads / evidence / steering, and the problem-choice
  // inventory its negative cases select through) was retired by the four-tab pivot: `data-rd-problem-choice`,
  // `data-rd-evidence` and `data-rd-steering*` are absent from the built bundle, so this family has no
  // surface to read on the current build. The current-surface re-points of its two still-live subjects --
  // a task card's own repository relations, and the sparse no-shell case -- run in §(2b) above, so the
  // coverage moved rather than vanished. Absence is EXPLICIT in the accepted contract, not inferred from a
  // missing hook: Progress is "full workstream context, scoped plan, supporting repositories, activity and
  // visible task cards" (docs/design/dashboard-information-architecture-pivot.md) with no evidence/steering
  // section, and the retired C4 support-grid wording is recorded as an erratum (docs/ux-v2/DECISIONS.md
  // §8.3). The source is preserved below and runs unchanged on any build that still emits the surface; a
  // build that emits it (hook present) takes the branch and asserts exactly as before.
  const retiredProblemSurface = (await root.locator("[data-rd-problem-choice]").count()) === 0;
  if (withRelations && !retiredProblemSurface) {
    await selectAxis(String(withRelations.axisId));
    await clickIfPresent(root.locator(`[data-rd-problem-choice="${withRelations.id}"]`));
    await page.waitForTimeout(300);
    const support = await readSupport();
    const repositoryText = support.repositories.map((row) => row.fullName).join("|");
    const wantedRepositories = withRelations.repositories.map((row) => row.fullName).join("|");
    // The tag row renders the names and nothing else: no "primary", no rank, no extra label — a marker of that
    // kind would show up as text the repository names do not account for. Read the tag row rather than the whole
    // section: `innerText` of the section would include its heading, which is not what this is about.
    const threadText = await page.evaluate(() =>
      (
        document
          .querySelector('div[data-plugin-id="research-dashboard"] .rd-progress-repositories .rd-tags')
          ?.innerText ?? ""
      )
        .replace(/\s+/g, " ")
        .trim()
    );
    const threadOnlyNames =
      threadText === withRelations.repositories.map((row) => row.fullName).join(" ");
    check(
      "the repository threads are the problem's own relations, in the projection's order, with nothing marked primary",
      support.repositoriesPresent && repositoryText === wantedRepositories && threadOnlyNames,
      `${support.repositories.length} tag(s) of ${withRelations.repositories.length}; order ${repositoryText === wantedRepositories ? "matches" : "differs"}; section text ${JSON.stringify(threadText)}`
    );

    // (2) Evidence: the projection's records, each keeping the source it came from — a source type rendered as
    // itself, the reference and the summary intact, and the same date that orders the row.
    const evidenceOrder = support.evidence.map((row) => row.id).join("|");
    const wantedEvidence = withRelations.evidence.map((row) => row.id).join("|");
    const sourcesMatch = support.evidence.every(
      (row, position) => row.source === withRelations.evidence[position]?.sourceType
    );
    const provenanceKept = support.evidence.every((row, position) => {
      const wanted = withRelations.evidence[position];
      return (
        row.text.includes(wanted?.sourceRef ?? "\u0000") &&
        row.text.includes(wanted?.summary ?? "\u0000") &&
        row.date.includes(wanted?.occurredAt?.slice(0, 10) ?? "\u0000")
      );
    });
    check(
      "evidence is the projection's records with their provenance: source type, reference, summary and date",
      support.evidencePresent &&
        evidenceOrder === wantedEvidence &&
        sourcesMatch &&
        provenanceKept,
      `${support.evidence.length} row(s) of ${withRelations.evidence.length}; sources ${sourcesMatch ? "match" : "differ"}; provenance ${provenanceKept ? "kept" : "lost"}; first source ${support.evidence[0]?.source}`
    );

    // (3) Human steering: exactly the projection's claims, each under the scope it was aimed at, every one
    // human-authored — and the axis claim is not copied under the problem that sits beneath it.
    const wantedProblemClaims = withRelations.steering.map((claim) => claim.text);
    const wantedAxisClaims = (
      allProgress.axes.axes.find((row) => row.id === withRelations.axisId)?.steering ?? []
    ).map((claim) => claim.text);
    const shownProblemClaims = support.problemScope.map((claim) => claim.text);
    const shownAxisClaims = support.axisScope.map((claim) => claim.text);
    const allHuman = [...support.problemScope, ...support.axisScope].every((claim) =>
      claim.meta.startsWith("human") || claim.meta.includes("human")
    );
    check(
      "human steering is exactly the projection's claims, under the scope each was aimed at",
      shownProblemClaims.join("|") === wantedProblemClaims.join("|") &&
        shownAxisClaims.join("|") === wantedAxisClaims.join("|") &&
        allHuman,
      `problem scope ${shownProblemClaims.length}/${wantedProblemClaims.length}, axis scope ${shownAxisClaims.length}/${wantedAxisClaims.length}; every claim human-authored ${allHuman}`
    );
    check(
      "an axis-scoped claim stays the axis context — it is not copied under the problem",
      wantedAxisClaims.length > 0 && !shownProblemClaims.includes(wantedAxisClaims[0]),
      `axis claims ${wantedAxisClaims.length}; leaked into the problem scope ${shownProblemClaims.includes(wantedAxisClaims[0])}`
    );
    check(
      "an ordinary note on the same problem is context, not steering",
      !support.steeringText.includes(FIXTURE_NOTE_PREFIX),
      `steering section ${support.steeringText.includes(FIXTURE_NOTE_PREFIX) ? "shows" : "excludes"} the note`
    );

    // (4) The three negative cases, on one problem that has none of it — Fixture E's sparse problem is the
    // subject on purpose: no repositories, no supporting record, no steering of its own. Absence must be silent,
    // and the shell check is a heading with no rows, which is exactly what "an empty section" would be.
    const sparse = (allProgress.problems.problems ?? []).find(
      (problem) =>
        problem.state === "open" &&
        problem.repositories.length === 0 &&
        problem.evidence.length === 0 &&
        problem.steering.length === 0
    );
    if (sparse) {
      await selectAxis(String(sparse.axisId));
      // Fail rather than hang if the row is missing: the point of this block is that the section is silent, so a
      // problem the inventory does not list at all would be a different defect, not a timeout.
      const selectable = await root.locator(`[data-rd-problem-choice="${sparse.id}"]`).count();
      check(
        "the sparse problem is one the inventory can select",
        selectable === 1,
        `${selectable} row(s) for open problem ${sparse.id.slice(0, 8)}`
      );
      if (selectable === 1) {
        await clickIfPresent(root.locator(`[data-rd-problem-choice="${sparse.id}"]`));
        await page.waitForTimeout(300);
      }
      const bare = await readSupport();
      const bareAxis = (allProgress.axes.axes.find((row) => row.id === sparse.axisId)?.steering ?? [])
        .length;
      const sectionStates = await page.evaluate(() => {
        const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
        const read = (selector) => {
          const section = scope?.querySelector(selector) ?? null;
          return section
            ? { rows: section.querySelectorAll("li").length, there: true }
            : { rows: 0, there: false };
        };
        return {
          evidence: read(".rd-progress-evidence"),
          repositories: read(".rd-progress-repositories"),
          steering: read(".rd-progress-steering"),
        };
      });
      // A shell is a heading with nothing under it. Repositories and evidence must not even be present; the
      // steering section may be — the axis carries a claim — but then it must have a row, and the problem's own
      // group must be absent either way.
      const noShells =
        !sectionStates.repositories.there &&
        !sectionStates.evidence.there &&
        (!sectionStates.steering.there || sectionStates.steering.rows > 0);
      check(
        "a problem with no repositories, no evidence and no steering renders no shell for any of them",
        !bare.repositoriesPresent && !bare.evidencePresent && !bare.hasProblemScope && noShells,
        `repositories ${bare.repositoriesPresent}, evidence ${bare.evidencePresent}, problem scope ${bare.hasProblemScope}; sections ${JSON.stringify(sectionStates)}`
      );
      check(
        "and the steering section follows the data: it is absent unless the axis itself carries a claim",
        bare.steeringPresent === (bareAxis > 0),
        `section ${bare.steeringPresent} with ${bareAxis} axis-scoped claim(s)`
      );
    } else {
      check(
        "the fixture still carries a problem with no repositories, no evidence and no steering",
        false,
        "no problem with nothing behind it"
      );
    }

    // (5) The EntityTag contract, executable: both repository tags land in the Repositories view with that
    // repository selected. Both, because one tag could pass by accident while the second never fires.
    const readRepositorySelection = () =>
      page.evaluate(() => {
        const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
        const view = scope?.querySelector('[data-rd-view="repositories"]') ?? null;
        const rows = [...(view?.querySelectorAll("[data-rd-repository]") ?? [])];
        return {
          count: rows.length,
          present: view !== null,
          selected: rows
            .filter((node) => node.getAttribute("aria-pressed") === "true")
            .map((node) => node.getAttribute("data-rd-repository")),
        };
      });
    const landings = [];
    for (const [index, repository] of withRelations.repositories.entries()) {
      await selectAxis(String(withRelations.axisId));
      await clickIfPresent(root.locator(`[data-rd-problem-choice="${withRelations.id}"]`));
      await page.waitForTimeout(300);
      await root
        .locator(`[data-rd-entity-tag="repository"][data-rd-entity-id="${repository.id}"]`)
        .click();
      await page.waitForTimeout(400);
      landings.push(await readRepositorySelection());
      if (index < withRelations.repositories.length - 1) {
        await root.locator('[data-rd-view-option="progress"]').click();
        await page.waitForTimeout(300);
      }
    }
    check(
      "each repository tag lands in the Repositories view with that repository selected",
      landings.length === withRelations.repositories.length &&
        landings.every(
          (landing, index) =>
            landing.present &&
            landing.selected.length === 1 &&
            landing.selected[0] === withRelations.repositories[index].fullName
        ),
      landings
        .map((landing, index) => `${landing.selected[0] ?? "none"} (wanted ${withRelations.repositories[index]?.fullName})`)
        .join("; ")
    );
    check(
      "and the tag wrote nothing: the repository set is the same after navigating",
      landings.every((landing) => landing.count === landings[0]?.count) && landings[0]?.count > 0,
      `${landings.map((landing) => landing.count).join(" then ")} repository row(s)`
    );
    // Back to Progress, so the checks after this one read the view they describe — and on the problem that
    // carries all three sections, because the end of the pass is also what the screenshot captures.
    await root.locator('[data-rd-view-option="progress"]').click();
    await page.waitForTimeout(300);
    await selectAxis(String(withRelations.axisId));
    await clickIfPresent(root.locator(`[data-rd-problem-choice="${withRelations.id}"]`));
    await page.waitForTimeout(300);
  } else {
    // The reason selector keys off the MEASURED boolean `retiredProblemSurface` (true ⇒ the hook is absent
    // from the built bundle, i.e. the surface is retired). It used to branch on `!retiredProblemSurface`,
    // which printed the *dataset-lack* reason on a *retired* surface — a pivot removal filed as a seedable
    // gap. Both paths are executable in harness/skip-reason.test.mjs.
    const reason = stepFiveSkipReason({
      retired: retiredProblemSurface,
      problemCount: (allProgress.problems.problems ?? []).length,
    });
    const sparseReason = sparseSkipReason({ retired: retiredProblemSurface });
    for (const description of [
      "the repository threads are the problem's own relations, in the projection's order, with nothing marked primary",
      "evidence is the projection's records with their provenance: source type, reference, summary and date",
      "human steering is exactly the projection's claims, under the scope each was aimed at",
      "an axis-scoped claim stays the axis context — it is not copied under the problem",
      "an ordinary note on the same problem is context, not steering",
      "each repository tag lands in the Repositories view with that repository selected",
      "and the tag wrote nothing: the repository set is the same after navigating",
    ]) {
      skip(description, reason);
    }
    for (const description of [
      "the sparse problem is one the inventory can select",
      "a problem with no repositories, no evidence and no steering renders no shell for any of them",
      "and the steering section follows the data: it is absent unless the axis itself carries a claim",
    ]) {
      skip(description, sparseReason);
    }
  }
}

  // ------------------------------- C7g: the index's two subjects — `Axes | Problems`, and what does not change
// Step 6 inverts the projection instead of adding to it: with `Problems` selected the navigation object is the
// concrete problem, and the reading surface, the sections and the Activity feed are the ones already built —
// the feed following the problem's **parent axis** through the projection's own bucket, not through markup
// that re-decides what belongs to what. Everything is checked against the live `get_progress` answer.
//
// The two claims that make this a switch and not a second view are checked on **both** datasets: switching
// issues no action call, and the payload is identical before and after. A dataset with no problem at all (the
// corpus) still exercises those, plus the empty-index case; the four checks that need a problem row say SKIP
// with their reason there and run on the fixture.
{
  const readSubView = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const index = scope?.querySelector('[data-rd-progress-index="true"]') ?? null;
      const card = scope?.querySelector(".rd-progress-problem") ?? null;
      const feed = scope?.querySelector(".rd-progress-activity") ?? null;
      const group = scope?.querySelector("[data-rd-progress-switch]") ?? null;
      return {
        axisRows: [...(index?.querySelectorAll("[data-rd-index-axis]") ?? [])].map((node) => ({
          active: node.getAttribute("aria-pressed") === "true",
          id: node.getAttribute("data-rd-index-axis"),
        })),
        card: {
          axis: card?.getAttribute("data-rd-progress-problem-axis") ?? null,
          empty: (card?.querySelector("[data-rd-progress-problem-empty]")?.textContent ?? "").trim(),
          mode: card?.getAttribute("data-rd-progress-problem-mode") ?? null,
          shown: card?.getAttribute("data-rd-progress-problem-shown") ?? "",
          statement: (card?.querySelector("[data-rd-problem] .rd-strong")?.textContent ?? "").trim(),
        },
        feed: {
          axis: feed?.getAttribute("data-rd-progress-feed-axis") ?? null,
          count: Number(feed?.getAttribute("data-rd-progress-feed-count") ?? -1),
          parent: (feed?.querySelector("[data-rd-progress-feed-parent]")?.textContent ?? "").trim(),
        },
        indexEmpty: (index?.querySelector("[data-rd-problem-index-empty]")?.textContent ?? "").trim(),
        indexMode: index?.getAttribute("data-rd-progress-index-mode") ?? null,
        indexRows: Number(index?.getAttribute("data-rd-progress-index-rows") ?? -1),
        mode: group?.getAttribute("data-rd-progress-subview") ?? null,
        options: [...(group?.querySelectorAll("[data-rd-progress-subview-option]") ?? [])].map((node) => ({
          pressed: node.getAttribute("aria-pressed") === "true",
          value: node.getAttribute("data-rd-progress-subview-option"),
        })),
        problemRows: [...(index?.querySelectorAll("[data-rd-problem-index]") ?? [])].map((node) => ({
          active: node.getAttribute("aria-pressed") === "true",
          axis: node.getAttribute("data-rd-problem-index-axis"),
          context: (node.querySelector("[data-rd-problem-index-context]")?.textContent ?? "").trim(),
          id: node.getAttribute("data-rd-problem-index"),
          state: node.getAttribute("data-rd-problem-index-state"),
          statement: (node.querySelector(".rd-strong")?.textContent ?? "").trim(),
          topic: node.getAttribute("data-rd-problem-index-topic"),
        })),
        sections: {
          evidence: Number(
            scope
              ?.querySelector("[data-rd-progress-evidence]")
              ?.getAttribute("data-rd-progress-evidence") ?? -1
          ),
          repositories: Number(
            scope
              ?.querySelector("[data-rd-progress-repositories]")
              ?.getAttribute("data-rd-progress-repositories") ?? -1
          ),
          steering: Boolean(scope?.querySelector("[data-rd-progress-steering]")),
        },
      };
    });

  const clickSubject = async (mode) => {
    await clickIfPresent(root.locator(`[data-rd-progress-subview-option="${mode}"]`));
    await page.waitForTimeout(250);
  };

  const projectionBefore = await apiProgress(windowDaysNow);
  const callsBefore = callsFor("get_progress").length;
  const problemRowsAll = allProgress.problems.problems ?? [];

  // (1) The control, and the subject the view opens on. Both datasets.
  const opened = await readSubView();
  const subjects = opened.options.map((option) => option.value).join("|");
  const pressed = opened.options.filter((option) => option.pressed);
  retired(
    "the Progress index offers both subjects, and opens on Axes (U4 step 6)",
    subjects === "axes|problems" &&
      pressed.length === 1 &&
      pressed[0]?.value === "axes" &&
      opened.mode === "axes" &&
      opened.indexMode === "axes" &&
      opened.card.mode === "axes",
    `subjects ${subjects || "none"}; pressed ${pressed[0]?.value ?? "none"}; group mode ${opened.mode}; index mode ${opened.indexMode}; card mode ${opened.card.mode}`
  );

  if (problemRowsAll.length > 0) {
    // (2) The index *is* the projection's problem list — ids, order, state, parent axis and topic, all read
    // off the live answer rather than remembered. The context line must carry the parent axis, the topic and
    // the recency, because a problem statement alone does not say which axis it belongs to.
    await clickSubject("problems");
    const listed = await readSubView();
    const wantedIds = problemRowsAll.map((row) => row.id).join("|");
    const listedIds = listed.problemRows.map((row) => row.id).join("|");
    const fieldsMatch = listed.problemRows.every((row, index) => {
      const source = problemRowsAll[index];
      return (
        row.state === source.state &&
        row.axis === source.axisId &&
        row.topic === source.topicName &&
        row.statement === source.statement &&
        row.context.includes(source.axisTitle) &&
        row.context.includes(source.topicName) &&
        row.context.includes("last activity")
      );
    });
    retired(
      "the Problems index lists the projection's problems, in the server's order, with each row's own state, axis, topic and recency",
      listed.mode === "problems" &&
        listed.indexMode === "problems" &&
        listed.problemRows.length === problemRowsAll.length &&
        listed.indexRows === problemRowsAll.length &&
        listedIds === wantedIds &&
        fieldsMatch,
      `${listed.problemRows.length} row(s) of ${problemRowsAll.length}; order ${listedIds === wantedIds ? "matches" : "differs"}; fields ${fieldsMatch ? "match" : "differ"}; first ${JSON.stringify(listed.problemRows[0]?.context ?? "")}`
    );

    // (3) Picking a problem drives the *same* reading surface: the card shows that problem, the card's axis is
    // its parent, and the Activity column is the projection's bucket for that parent rather than a feed the
    // markup assembled. The subject is the first problem that carries relations, so the section check below
    // has something to read; failing that, the first problem in the projection's order.
    const subjectProblem =
      problemRowsAll.find(
        (row) => (row.repositories?.length ?? 0) > 0 && (row.evidence?.length ?? 0) > 0
      ) ?? problemRowsAll[0];
    const parentRow = (allProgress.axes.axes ?? []).find((row) => row.id === subjectProblem.axisId);
    await clickIfPresent(root.locator(`[data-rd-problem-index="${subjectProblem.id}"]`));
    await page.waitForTimeout(250);
    const picked = await readSubView();
    const bucket = (allProgress.activity.byAxis ?? []).find(
      (entry) => entry.axisId === subjectProblem.axisId
    );
    retired(
      "picking a problem shows it in the same reading surface, with the axis columns following its parent",
      picked.card.shown === subjectProblem.id &&
        picked.card.statement === subjectProblem.statement &&
        picked.card.axis === subjectProblem.axisId &&
        picked.feed.axis === subjectProblem.axisId &&
        picked.feed.count === (bucket?.eventCount ?? -1) &&
        picked.feed.parent === `on ${parentRow?.title ?? ""}` &&
        picked.problemRows.filter((row) => row.active).length === 1 &&
        picked.problemRows.find((row) => row.active)?.id === subjectProblem.id,
      `card ${picked.card.shown?.slice(0, 8) ?? "none"} (wanted ${subjectProblem.id.slice(0, 8)}); axis ${picked.card.axis?.slice(0, 8)}; feed ${picked.feed.axis?.slice(0, 8)} count ${picked.feed.count} (projection ${bucket?.eventCount ?? -1}); parent "${picked.feed.parent}" (axis "${parentRow?.title ?? ""}")`
    );

    // (4) Reuse, not a parallel UI: the three sections belong to the problem on screen and carry its own
    // numbers — the same fields the axes mode renders, read from the same object.
    const steeringTotal =
      (subjectProblem.steering?.length ?? 0) +
      ((allProgress.axes.axes ?? []).find((row) => row.id === subjectProblem.axisId)?.steering
        ?.length ?? 0);
    retired(
      "the repository threads, evidence and steering sections render from that same problem object",
      picked.sections.repositories === (subjectProblem.repositories?.length ?? 0) &&
        picked.sections.evidence === (subjectProblem.evidence?.length ?? 0) &&
        picked.sections.steering === steeringTotal > 0,
      `sections ${picked.sections.repositories} repo / ${picked.sections.evidence} evidence / steering ${picked.sections.steering ? "present" : "absent"}; projection ${subjectProblem.repositories?.length ?? 0} / ${subjectProblem.evidence?.length ?? 0} / ${steeringTotal > 0 ? "present" : "absent"}`
    );

    // The published capture of the inverted index, taken in exactly the state the checks above describe.
    const problemsShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-problems.png`;
    await root.screenshot({ path: problemsShot });
    console.log("problems screenshot:", shotLabel(problemsShot));

    // (5) Back to `Axes`: the index marks the **parent axis** of the problem on screen, which is the identity
    // bridge the switch preserves — not a remembered axis the reader has since left.
    await clickSubject("axes");
    const back = await readSubView();
    const activeAxisRows = back.axisRows.filter((row) => row.active);
    retired(
      "switching back to Axes marks the parent axis of the problem that was on screen",
      back.mode === "axes" &&
        activeAxisRows.length === 1 &&
        activeAxisRows[0]?.id === subjectProblem.axisId &&
        back.card.axis === subjectProblem.axisId &&
        back.card.shown === subjectProblem.id,
      `active ${activeAxisRows[0]?.id?.slice(0, 8) ?? "none"} (wanted ${subjectProblem.axisId.slice(0, 8)}); card axis ${back.card.axis?.slice(0, 8)} shown ${back.card.shown?.slice(0, 8)}`
    );
  } else {
    const reason =
      "this dataset carries no problem row at all, so the problem index has no subject here — the fixture " +
      "does, so that run discriminates";
    // The corpus *does* have a subject for the empty case, and it is the one that matters: an index that
    // renders nothing and says nothing would read as "no problems exist" while looking identical to a
    // dataset that has them and failed to load.
    await clickSubject("problems");
    const empty = await readSubView();
    check(
      "with no problem in the dataset the Problems index says so, instead of rendering an empty list",
      empty.mode === "problems" &&
        empty.problemRows.length === 0 &&
        empty.indexRows === 0 &&
        empty.indexEmpty.length > 0 &&
        empty.card.empty.length > 0,
      `rows ${empty.problemRows.length}, index empty "${empty.indexEmpty}", card empty "${empty.card.empty}"`
    );
    await clickSubject("axes");
    for (const description of [
      "the Problems index lists the projection's problems, in the server's order, with each row's own state, axis, topic and recency",
      "picking a problem shows it in the same reading surface, with the axis columns following its parent",
      "the repository threads, evidence and steering sections render from that same problem object",
      "switching back to Axes marks the parent axis of the problem that was on screen",
    ]) {
      skip(description, reason);
    }
  }

  // (6) The two claims that make this a switch rather than a second view — checked on both datasets, because
  // neither depends on a problem existing: switching issues **no** action call, and the payload the page reads
  // is byte-identical before and after, so nothing was created or mutated server-side.
  const callsAfter = callsFor("get_progress").length;
  check(
    "switching the index's subject issues no action call",
    callsAfter === callsBefore,
    `${callsAfter - callsBefore} extra get_progress call(s) across the switches`
  );
  const projectionAfter = await apiProgress(windowDaysNow);
  const identical =
    JSON.stringify(projectionAfter) === JSON.stringify(projectionBefore) &&
    projectionBefore !== null;
  check(
    "and the projection is unchanged: switching a subview writes nothing",
    identical,
    identical
      ? "the live answer is identical before and after"
      : "the live answer differs — something was written or recomputed server-side"
  );
}

  // --------------------------------- C7h: the EntityTag contract, exercised from Progress (U4 step 7)
// Step 7's consolidation turns the tag contract from a styling convention into an exercised navigation
// primitive: every entity type Progress can name is clicked **where Progress shows it**, and the destination is
// asserted — the canonical view *and* the entity actually selected there (the detail panel, the expanded card,
// the active row), never merely that a view opened. Labels are compared across the two views, because "the same
// entity reads the same" is part of the contract, and the round trip is bracketed by two claims: no write action
// was called, and the projection is identical afterwards.
//
// Every click is preceded by a return to Progress and a fresh read, so the traversal never assumes what the
// previous landing left on screen — a harness that clicks a tag it read three views ago proves nothing about
// the tag, and one that throws proves nothing at all.
//
// The two datasets can exercise different halves, and each check says which: the corpus carries topics, axes,
// repositories and people but no problem row, so the problem tag and its destination SKIP there with a reason.
{
  /**
   * Reads only. A tag is navigation, so the page may legitimately re-read (`get_topic` when a topic card
   * expands); what a tag must never do is **write**, and that is the distinction this set draws.
   */
  const READ_ACTIONS = new Set([
    "get_overview",
    "get_progress",
    "get_topic",
    "list_activity",
    "list_topics",
  ]);
  const writesSoFar = () =>
    actionCalls.filter((call) => !READ_ACTIONS.has(call.key)).length;

  const readTags = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const tagsIn = (root) =>
        [...(root?.querySelectorAll("[data-rd-entity-tag]") ?? [])].map((node) => ({
          id: node.getAttribute("data-rd-entity-id"),
          label: node.getAttribute("data-rd-tag-label"),
          type: node.getAttribute("data-rd-entity-tag"),
        }));
      const card = scope?.querySelector(".rd-progress-problem") ?? null;
      const index = scope?.querySelector('[data-rd-progress-index="true"]') ?? null;
      const switchGroup = scope?.querySelector("[data-rd-progress-switch]") ?? null;
      const activeAxisRow = index?.querySelector('[data-rd-index-axis][aria-pressed="true"]') ?? null;
      const topicCard = scope?.querySelector('[data-rd-view="topics"] [data-rd-detail]') ?? null;
      return {
        /**
         * A status badge is a claim, not a control: nothing inside a badge may be a tag, or a reader would
         * navigate where they meant to read a state.
         */
        badgesThatNavigate: scope
          ? scope.querySelectorAll(
              "[data-rd-state-confidence] [data-rd-entity-tag], [data-rd-step-state] [data-rd-entity-tag]"
            ).length
          : -1,
        context: tagsIn(scope?.querySelector("[data-rd-detail-context]")),
        /** How many feed rows the page states it is showing — the cap the tag checks compare against. */
        /**
         * The current Progress Activity column no longer emits a `data-rd-progress-feed-shown`
         * attribute (that hook was retired with the pivot; the column renders only the newest
         * `PROGRESS_PAGE_SIZE` rows of the axis bucket and pages the rest). The faithful current
         * equivalent of "what the page states it is showing" is the number of `[data-rd-feed-event]`
         * rows the DOM actually renders, which the checks compare, in order, against the projection's
         * own bucket events.
         */
        feedShown: (scope?.querySelectorAll("[data-rd-feed-event]") ?? []).length,
        feed: [...(scope?.querySelectorAll("[data-rd-feed-event]") ?? [])].map((row) => ({
          tags: tagsIn(row),
          text: (row.innerText ?? "").replace(/\s+/g, " ").trim(),
        })),
        progress: {
          activeAxis: activeAxisRow?.getAttribute("data-rd-index-axis") ?? null,
          activeAxisTitle: (activeAxisRow?.querySelector(".rd-strong")?.textContent ?? "").trim(),
          indexMode: index?.getAttribute("data-rd-progress-index-mode") ?? null,
          problemRowActive:
            index
              ?.querySelector('[data-rd-problem-index][aria-pressed="true"]')
              ?.getAttribute("data-rd-problem-index") ?? null,
          shown: card?.getAttribute("data-rd-progress-problem-shown") ?? "",
          subview: switchGroup?.getAttribute("data-rd-progress-subview") ?? null,
        },
        person: scope?.querySelector("[data-rd-person-panel]")?.getAttribute("data-rd-person-panel") ?? null,
        personId:
          scope
            ?.querySelector('[data-rd-person][aria-pressed="true"]')
            ?.getAttribute("data-rd-person-id") ?? null,
        repository:
          scope?.querySelector("[data-rd-repository-panel]")?.getAttribute("data-rd-repository-panel") ?? null,
        repositoryId:
          scope
            ?.querySelector('[data-rd-repository][aria-pressed="true"]')
            ?.getAttribute("data-rd-repository-id") ?? null,
        threads: tagsIn(scope?.querySelector(".rd-progress-repositories")),
        topic: topicCard
          ? { mode: topicCard.getAttribute("data-rd-detail-mode"), name: topicCard.getAttribute("data-rd-detail") }
          : null,
        view:
          scope
            ?.querySelector('[data-rd-view-option][aria-pressed="true"]')
            ?.getAttribute("data-rd-view-option") ?? null,
      };
    });

  const showView = async (view) => {
    await root.locator(`[data-rd-view-option="${view}"]`).click();
    await page.waitForTimeout(300);
  };
  const clickTag = async (type, id) => {
    await root
      .locator(`[data-rd-entity-tag="${type}"][data-rd-entity-id="${id}"]`)
      .first()
      .click();
    await page.waitForTimeout(400);
    return readTags();
  };
  /**
   * Back to Progress, read it, and take the tag of one type from wherever Progress shows it (the reading
   * surface's context line first, then the Activity column). Returns the tag as the page currently renders it,
   * so the click and the assertion that follows describe the same DOM.
   */
  /**
   * U9 caps the Activity column, so a tag the projection has an event for may sit outside the shown window
   * even though the page holds it. The page offers exactly one control for that, so the checks use it — the
   * reader's own click, not a back door. Every caller leaves the column as it found it; the traversal that
   * opens it widest collapses it again when it is done, so the checks that measure the default window still
   * measure the default window.
   */
  const expandFeedIfCapped = async () => {
    const cap = root.locator("[data-rd-progress-feed-more]").first();
    if ((await cap.count()) === 0) {
      return;
    }
    await cap.locator("button").first().click();
    await page
      .waitForFunction(
        () => {
          const column = document.querySelector(
            'div[data-plugin-id=\"research-dashboard\"] [data-rd-progress-feed]'
          );
          return (
            column !== null &&
            column.getAttribute("data-rd-progress-feed") ===
              column.getAttribute("data-rd-progress-feed-shown")
          );
        },
        undefined,
        { timeout: 5000 }
      )
      .catch(() => {});
  };
  const tagFromProgress = async (type) => {
    await showView("progress");
    await expandFeedIfCapped();
    const state = await readTags();
    const tag =
      state.context.find((entry) => entry.type === type) ??
      state.feed.flatMap((row) => row.tags).find((entry) => entry.type === type) ??
      null;
    return { state, tag };
  };
  /**
   * Which axis's bucket can show a given tag at all, derived from the projection rather than guessed: a tag
   * renders only where its event is, and an event belongs to one axis's bucket. Returns the axis to select and
   * the tag as it renders there — or a null subject, which every caller turns into a SKIP with a reason.
   */
  const feedTagFromProjection = async (kind) => {
    const bucket = allProgress.activity.byAxis.find((entry) =>
      entry.events.some((event) =>
        kind === "repository" ? event.repositoryId !== null : event.problemId !== null
      )
    );
    if (!bucket) {
      return { state: null, tag: null };
    }
    // The axis index only exists in the `Axes` subview, so make sure that is the one on screen.
    await showView("progress");
    if ((await readTags()).progress.subview !== "axes") {
      await clickIfPresent(root.locator('[data-rd-progress-subview-option="axes"]'));
      await page.waitForTimeout(250);
    }
    await root.locator(`[data-rd-index-axis="${bucket.axisId}"]`).click();
    await page.waitForTimeout(300);
    // The subject here is a specific event, so the cap has to come off before it can be read.
    await expandFeedIfCapped();
    const state = await readTags();
    const tag =
      state.feed.flatMap((row) => row.tags).find((entry) => entry.type === kind) ?? null;
    return { state, tag };
  };

  const baseline = {
    // Read twice, back to back. The bracket below compares the projection byte-for-byte before and after the
    // traversal; a projection that cannot be read twice identically cannot be compared at all, and that is a
    // property of the read rather than of anything the traversal did. When this bracket failed, these two
    // reads are what said which of the two was responsible.
    payload: JSON.stringify(await apiProgress(windowDaysNow)),
    payloadAgain: JSON.stringify(await apiProgress(windowDaysNow)),
    writes: writesSoFar(),
  };

  // (1) The tags a reader can see on the reading surface, and whether they carry the projection's own names.
  // The Progress view opens with NO workstream selected (its index rows are all unpressed), so the reading
  // surface names no axis and its Activity column holds no bucket. Select the axis whose projection bucket
  // actually carries events — derived from the projection, never the default "most open" row — so the
  // column's tag checks have their subject on screen.
  {
    const eventBucket = allProgress.activity.byAxis.find((bucket) => (bucket.events ?? []).length > 0) ?? null;
    if (eventBucket) {
      await showView("progress");
      if ((await readTags()).progress.subview !== "axes") {
        await clickIfPresent(root.locator('[data-rd-progress-subview-option="axes"]'));
        await page.waitForTimeout(250);
      }
      const axisRow = root.locator(`[data-rd-index-axis="${eventBucket.axisId}"]`);
      if ((await axisRow.count()) > 0) {
        await axisRow.click();
        await page.waitForTimeout(350);
      }
    }
  }
  const atProgress = (await tagFromProgress("topic")).state;
  const activeAxis =
    allProgress.axes.axes.find((row) => row.id === atProgress.progress.activeAxis) ?? null;
  if (activeAxis === null) {
    skip(
      "the reading surface names its topic and its axis as tags, with the projection's own ids and labels",
      "this dataset's projection carries no axis row, so the reading surface has no context to name"
    );
  } else {
    retired(
      "the reading surface names its topic and its axis as tags, with the projection's own ids and labels",
      atProgress.context.some(
        (tag) => tag.type === "topic" && tag.id === activeAxis.topicId && tag.label === activeAxis.topicName
      ) &&
        atProgress.context.some(
          (tag) => tag.type === "axis" && tag.id === activeAxis.id && tag.label === activeAxis.title
        ),
      `context: ${atProgress.context.map((tag) => `${tag.type}=${tag.label ?? ""}`).join(", ") || "none"}`
    );
  }

  // (2) The Activity column's tags, row by row against the events the projection says are in that bucket:
  // no tag may name something its event did not. (In the current build the Progress Activity column names
  // the TOPIC only — person/repository/axis tags render on the paged activity feeds of the People,
  // Repositories and project-detail surfaces, asserted below.)
  const feedBucket = allProgress.activity.byAxis.find((bucket) => bucket.axisId === activeAxis?.id) ?? null;
  // The rendered rows are compared, in order, against the projection's own bucket events for the window
  // the page renders (the column pages the rest); `feedRowsMatchStated` keeps a page that rendered fewer
  // rows than it holds from passing by comparing a short list against itself.
  const feedEvents = (feedBucket?.events ?? []).slice(0, Math.max(0, atProgress.feedShown));
  const feedRowsMatchStated = atProgress.feed.length === Math.max(0, atProgress.feedShown);
  const feedMismatches = [];
  for (const [position, event] of feedEvents.entries()) {
    const row = atProgress.feed[position] ?? { tags: [], text: "" };
    const carried = new Set(
      [
        event.topicId === null || event.topicId !== activeAxis?.topicId ? null : `topic:${event.topicId}`,
        event.repositoryId === null ? null : `repository:${event.repositoryId}`,
        event.person === null ? null : `person:${event.person.id}`,
        event.problemId === null ? null : `problem:${event.problemId}`,
        // The shared activity line tags the axis too, and only when the event's own axis is the one on
        // screen — the feed's rows all belong to this bucket, so that is exactly this bucket's axis.
        event.axisId === null || event.axisId !== activeAxis?.id ? null : `axis:${event.axisId}`,
      ].filter((entry) => entry !== null)
    );
    const seen = row.tags.map((tag) => `${tag.type}:${tag.id}`);
    if (seen.some((tag) => !carried.has(tag))) {
      feedMismatches.push(
        `${row.text.slice(0, 40)} carries ${seen.join("+")} beyond ${[...carried].join("+")}`
      );
    }
  }
  if (feedEvents.length === 0) {
    skip(
      "every tag in the Activity column names an entity its own event carries, and no more",
      "the axis on screen has no events in the window, so its feed renders no tags"
    );
  } else {
    check(
      "every tag in the Activity column names an entity its own event carries, and no more",
      feedMismatches.length === 0 && feedRowsMatchStated,
      feedMismatches.join("; ") ||
        `${feedEvents.length} event row(s) checked, ${atProgress.feed.length} rendered`
    );
  }

  // (3) A topic tag: the canonical view, and the topic actually selected there (its card expanded).
  const { tag: topicTag } = await tagFromProgress("topic");
  let topicLanding = topicTag === null ? null : await clickTag("topic", topicTag.id);
  if (topicTag !== null) {
    // The route switches view and selects asynchronously (entity target -> effect -> get_topic), so wait
    // on the completion condition itself rather than a sleep: Topics on screen, the intended rail row
    // pressed, and the pane for that topic rendered.
    await page
      .waitForFunction(
        ([pluginId, label]) => {
          const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
          const pane = scope?.querySelector('[data-rd-view="topics"] [data-rd-detail]');
          const pressed = scope?.querySelector('[data-rd-index-topic][aria-pressed="true"]');
          return (
            Boolean(pane) &&
            pane.getAttribute("data-rd-detail") === label &&
            pressed?.getAttribute("data-rd-index-topic") === label
          );
        },
        [PLUGIN_ID, topicTag.label],
        { polling: 50, timeout: 8000 }
      )
      .catch(() => {});
    // `clickTag` reads the landing as part of clicking, which is before the async selection has landed.
    // Now that the completion condition has been waited on, re-read it: the check is about where the tag
    // took the reader, and this is that place.
    topicLanding = await readTags();
  }
  if (topicTag === null) {
    skip(
      "a topic tag lands in Topics with that topic selected, and the label matches the card it opened",
      "the reading surface shows no topic tag — its axis carries no topic to name"
    );
  } else {
    check(
      "a topic tag lands in Topics with that topic selected, and the label matches the card it opened",
      topicLanding.view === "topics" &&
        topicLanding.topic?.mode === "disclosure" &&
        topicLanding.topic?.name === topicTag.label,
      `view ${topicLanding.view ?? "none"}, card ${topicLanding.topic?.name ?? "none"} (wanted ${topicTag.label})`
    );
  }

  // (4) A person tag on the CURRENT surface that renders one: the People panel's paged activity feed
  // (`ul[data-rd-person-activity]` rows, each an `li[data-rd-activity-event]`). The Progress Activity
  // column names the topic only, so the person-attribution contract is exercised where the page actually
  // draws a person tag: for the payload's person with the most recorded activity, every rendered row must
  // carry THAT person's tag (attribution is navigable, not only text), and clicking it must land in People
  // with that person selected.
  const peopleSubject =
    [...CORPUS.people].sort(
      (a, b) => ((b.recent ?? 0) - (a.recent ?? 0)) || ((b.topics ?? 0) - (a.topics ?? 0))
    )[0] ?? null;
  await showView("people");
  await page.waitForTimeout(400);
  let peopleFeed = null;
  if (peopleSubject !== null) {
    await root.locator(`[data-rd-person="${peopleSubject.name}"]`).first().click();
    await page.waitForTimeout(600);
    peopleFeed = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const ul = scope?.querySelector("ul[data-rd-person-activity]");
      const pressed = scope?.querySelector('[data-rd-person][aria-pressed="true"]');
      return {
        panel: scope?.querySelector("[data-rd-person-panel]")?.getAttribute("data-rd-person-panel") ?? null,
        personId: pressed?.getAttribute("data-rd-person-id") ?? null,
        rows: [...(ul?.querySelectorAll("li[data-rd-activity-event]") ?? [])].map((li) => ({
          personTags: [...li.querySelectorAll('[data-rd-entity-tag="person"]')].map((t) => ({
            id: t.getAttribute("data-rd-entity-id"),
            label: t.getAttribute("data-rd-tag-label"),
          })),
        })),
      };
    });
  }
  if (peopleSubject === null || peopleFeed === null || peopleFeed.rows.length === 0) {
    for (const description of [
      "an event with a mapped account carries that person's tag, so attribution is navigable and not only text",
      "a person tag lands in People with that person selected, and the label matches the panel it opened",
    ]) {
      skip(description, "no person in this dataset carries a mapped account with rendered activity, so no feed row shows a person tag");
    }
  } else {
    const rowsCarryPerson = peopleFeed.rows.every(
      (row) => row.personTags.length === 1 && row.personTags[0].id === peopleFeed.personId
    );
    check(
      "an event with a mapped account carries that person's tag, so attribution is navigable and not only text — People panel paged activity feed (current surface)",
      rowsCarryPerson,
      `${peopleFeed.rows.length} attributed row(s); panel ${peopleFeed.panel ?? "none"} id ${peopleFeed.personId ?? "none"}`
    );
    const firstPersonTag = peopleFeed.rows.flatMap((row) => row.personTags)[0] ?? null;
    if (firstPersonTag === null) {
      skip(
        "a person tag lands in People with that person selected, and the label matches the panel it opened",
        "the People panel's activity rows render no person tag"
      );
    } else {
      await root
        .locator(`[data-rd-entity-tag="person"][data-rd-entity-id="${firstPersonTag.id}"]`)
        .first()
        .click();
      await page.waitForTimeout(600);
      const personLanding = await page.evaluate(() => {
        const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
        return {
          person: scope?.querySelector("[data-rd-person-panel]")?.getAttribute("data-rd-person-panel") ?? null,
          personId:
            scope?.querySelector('[data-rd-person][aria-pressed="true"]')?.getAttribute("data-rd-person-id") ?? null,
          view:
            scope?.querySelector('[data-rd-view-option][aria-pressed="true"]')?.getAttribute("data-rd-view-option") ??
            null,
        };
      });
      check(
        "a person tag lands in People with that person selected, and the label matches the panel it opened — People panel paged activity feed (current surface)",
        personLanding.view === "people" &&
          personLanding.person === firstPersonTag.label &&
          personLanding.personId === firstPersonTag.id,
        `view ${personLanding.view ?? "none"}, panel ${personLanding.person ?? "none"} (wanted ${firstPersonTag.label})`
      );
    }
  }

  // (5) A repository tag on the CURRENT surface that renders one inside an activity row: the project
  // detail's collapsible Activity fold (`[data-rd-topic-activity]` rows, whose ActivityLine is given the
  // repository label). The Progress Activity column names the topic only, so the repository-navigation
  // contract is exercised where the page actually draws the tag: scan the projects, and for the first one
  // whose activity fold names a repository, click that tag and require Repositories with it selected.
  await showView("topics");
  await page.waitForTimeout(400);
  let repositoryTag = null;
  for (const name of CORPUS.topicNames ?? []) {
    const projectRow = root.locator(`[data-rd-index-topic="${name}"]`).first();
    if ((await projectRow.count()) === 0) continue;
    await projectRow.click();
    await page.waitForTimeout(500);
    const found = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const tag = scope?.querySelector('[data-rd-topic-activity] [data-rd-entity-tag="repository"]') ?? null;
      return tag
        ? { id: tag.getAttribute("data-rd-entity-id"), label: tag.getAttribute("data-rd-tag-label") }
        : null;
    });
    if (found) {
      repositoryTag = found;
      break;
    }
  }
  if (repositoryTag === null) {
    skip(
      "a repository tag in the Activity column lands in Repositories with that repository selected",
      "no project activity row in this dataset names a repository, so no repository tag renders"
    );
  } else {
    await root
      .locator(`[data-rd-entity-tag="repository"][data-rd-entity-id="${repositoryTag.id}"]`)
      .first()
      .click();
    await page.waitForTimeout(600);
    const repositoryLanding = await readTags();
    check(
      "a repository tag in the Activity column lands in Repositories with that repository selected — project-detail activity fold (current surface)",
      repositoryLanding.view === "repositories" &&
        repositoryLanding.repository === repositoryTag.label &&
        repositoryLanding.repositoryId === repositoryTag.id,
      `view ${repositoryLanding.view ?? "none"}, panel ${repositoryLanding.repository ?? "none"} (wanted ${repositoryTag.label})`
    );
  }

  // (6) A problem tag — the inversion's own entity, and the one tag that changes Progress's *subview*.
  const problemSubject = await feedTagFromProjection("problem");
  if (problemSubject.tag === null) {
    skip(
      "a problem tag lands in Progress/Problems with that problem selected",
      problemSubject.state === null
        ? "no event in this dataset's window is evidence for a problem, so no feed row renders a problem tag"
        : "the feed names a problem this dataset's projection does not carry, so no tag renders for it"
    );
  } else {
    const problemLanding = await clickTag("problem", problemSubject.tag.id);
    check(
      "a problem tag lands in Progress/Problems with that problem selected — the subview follows the entity",
      problemLanding.progress.subview === "problems" &&
        problemLanding.progress.indexMode === "problems" &&
        problemLanding.progress.shown === problemSubject.tag.id &&
        problemLanding.progress.problemRowActive === problemSubject.tag.id,
      `subview ${problemLanding.progress.subview ?? "none"}, shown ${problemLanding.progress.shown.slice(0, 8)} (wanted ${problemSubject.tag.id.slice(0, 8)})`
    );
  }

  // (7) An axis tag whose canonical home is Progress. The current Progress reading surface renders NO axis
  // tag (its feed rows name the topic only), so the axis tag is taken from the CURRENT surface that does
  // render one: the Projects project-detail workstream rows (`AxisHead` → `EntityTag type="axis"`). Clicking
  // it must land in Progress with that axis selected — asserted against the CURRENT Progress hooks
  // (`data-rd-progress-detail-axis` / the pressed index row); the retired `-subview`/`-index-mode` hooks are
  // not used.
  let axisTag = null;
  {
    await showView("topics");
    await page.waitForTimeout(400);
    for (const name of CORPUS.topicNames ?? []) {
      const row = root.locator(`[data-rd-index-topic="${name}"]`).first();
      if ((await row.count()) === 0) continue;
      await row.click();
      await page.waitForTimeout(400);
      const found = await page.evaluate(() => {
        const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
        const tag = scope?.querySelector('[data-rd-detail] [data-rd-entity-tag="axis"]') ?? null;
        return tag
          ? { id: tag.getAttribute("data-rd-entity-id"), label: tag.getAttribute("data-rd-tag-label") }
          : null;
      });
      if (found) {
        axisTag = found;
        break;
      }
    }
  }
  const axisLanding = axisTag === null ? null : await clickTag("axis", axisTag.id);
  if (axisTag === null) {
    skip(
      "an axis tag lands in Progress/Axes with that axis selected, whichever subview it was clicked from",
      "no current surface renders an axis tag — the project detail carries no workstream row to name"
    );
  } else {
    await page
      .waitForFunction(
        (wanted) =>
          document
            .querySelector('div[data-plugin-id="research-dashboard"] [data-rd-progress-detail-axis]')
            ?.getAttribute("data-rd-progress-detail-axis") === wanted,
        axisTag.id,
        { polling: 50, timeout: 8000 }
      )
      .catch(() => {});
    const axisLanded = await readTags();
    check(
      "an axis tag lands in Progress/Axes with that axis selected, whichever subview it was clicked from",
      axisLanded.view === "progress" &&
        axisLanded.progress.activeAxis === axisTag.id &&
        axisLanded.progress.activeAxisTitle === axisTag.label,
      `view ${axisLanded.view ?? "none"}, active ${axisLanded.progress.activeAxis?.slice(0, 8) ?? "none"} ` +
        `"${axisLanded.progress.activeAxisTitle ?? "none"}" (wanted ${axisTag.label})`
    );
  }

  // (8) A badge is not a control, in every view the traversal touched.
  const badges = await tagFromProgress("axis");
  check(
    "no status badge is a tag — reading a state never navigates",
    badges.state.badgesThatNavigate === 0,
    `${badges.state.badgesThatNavigate} tag(s) inside a badge`
  );

  // (9) The whole traversal, bracketed: no write was called, and the projection is byte-identical to the one
  // read before the first tag was clicked. A tag navigates and selects; if it changed anything, this is where
  // it would show. The detail names the first byte that moved, with its neighbourhood — a bracket that can
  // only say "CHANGED" cannot say whether the traversal or the read itself is responsible.
  const firstDifference = (before, after) => {
    const limit = Math.min(before.length, after.length);
    let index = 0;
    while (index < limit && before[index] === after[index]) {
      index += 1;
    }
    if (index === limit && before.length === after.length) {
      return null;
    }
    const from = Math.max(0, index - 60);
    return (
      `${index === limit ? `length (${before.length} vs ${after.length} bytes)` : `byte ${index}`}: ` +
      `${JSON.stringify(before.slice(from, index + 90))} -> ${JSON.stringify(after.slice(from, index + 90))}`
    );
  };
  const after = JSON.stringify(await apiProgress(windowDaysNow));
  const stableRead = baseline.payload === baseline.payloadAgain;
  const difference = firstDifference(baseline.payload, after);
  check(
    "the tag traversal wrote nothing: no write action was called and the projection is unchanged",
    writesSoFar() === baseline.writes && difference === null,
    `writes ${baseline.writes} -> ${writesSoFar()}; ` +
      (difference === null
        ? `projection identical (the two baseline reads ${stableRead ? "agreed" : "already disagreed"})`
        : `projection changed at ${difference}; the two baseline reads ` +
          (stableRead
            ? "agreed, so the traversal or another writer moved it"
            : "ALREADY differed, so the projection is not stable across two calls"))
  );
}

  // ------------------------------------------------ C8: no bare state, one vocabulary for the evidence
// A state is a claim, and the record often holds only an inference. Every rendered state must carry
// its confidence, and one that is not confirmed must say so where it is read — otherwise the temporal
// view launders an inference into a fact.
// Read on the view that renders every axis with its own claim. The tag traversal above ends wherever its last
// tag led, and the Progress index is the one surface that lists all axes — so the check navigates there rather
// than inheriting whatever the traversal left mounted. That also makes it independent of the traversal's
// ordering, which it previously was not: it could pass or fail on where an unrelated check happened to leave
// the page.
await root.locator('[data-rd-view-option="progress"]').click();
await page
  .waitForSelector('div[data-plugin-id] [data-rd-view="progress"] [data-rd-progress-index]', {
    timeout: 10000,
  })
  .catch(() => {});
await clickIfPresent(root.locator('[data-rd-progress-subview-option="axes"]'));
await page.waitForTimeout(200);
const stateClaims = await page.evaluate(() => {
  const panel = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const all = [...panel.querySelectorAll(".rd-state")];
  const withClaim = all.filter((el) => el.hasAttribute("data-rd-state-confidence"));
  const notConfirmed = withClaim.filter(
    (el) => el.getAttribute("data-rd-state-confidence") !== "confirmed"
  );
  return {
    all: all.length,
    bareQualified: notConfirmed.filter(
      (el) => !/·\s*(inferred|uncertain)/i.test(el.innerText ?? "")
    ).length,
    notConfirmed: notConfirmed.length,
    notConfirmedSample: notConfirmed
      .slice(0, 2)
      .map((el) => (el.innerText ?? "").replace(/\s+/g, " ").trim()),
    qualified: withClaim.length,
  };
});
check(
  "every rendered state carries its claim, and one that is not confirmed says so (C8)",
  stateClaims.all > 0 &&
    stateClaims.all === stateClaims.qualified &&
    stateClaims.bareQualified === 0,
  `states ${stateClaims.all}, carrying a claim ${stateClaims.qualified}, not confirmed ${stateClaims.notConfirmed} but unqualified ${stateClaims.bareQualified}; sample ${JSON.stringify(stateClaims.notConfirmedSample)}`
);
// The check above passes trivially on a corpus of confirmed states only. This one pins the half that
// matters: that the corpus's own inferred states actually reach the view as unconfirmed.
const inferredInCorpus = CORPUS.axes.filter((axis) => axis.confidence !== "confirmed");
if (inferredInCorpus.length > 0) {
  check(
    "the corpus's inferred states reach the view as unconfirmed, not laundered into facts (C8)",
    stateClaims.notConfirmed >= 1,
    `${inferredInCorpus.length} of ${CORPUS.axes.length} axes are unconfirmed in the payload (${inferredInCorpus.map((axis) => `${axis.title}=${axis.confidence}`).join(", ")}); the view rendered ${stateClaims.notConfirmed} unconfirmed states`
  );
} else {
  skip(
    "the corpus's inferred states reach the view as unconfirmed, not laundered into facts (C8)",
    "every axis in this corpus is confirmed, so no inference can be laundered"
  );
}

// The evidence line belongs to the expanded detail card, so its wording is asserted where that card is
// open — in the write pass, on the fixture axis that has nothing behind it yet.

// ---- C4/F2: the duplicate window-wide feed is retired; the composition is the one reading -----------------
// Progress carried a second, unbounded grouping of the same window below the composition — topic cards →
// axis rails → their events, plus four filters. The ruling retired it: the page keeps one dominant reading of
// the selected subject, and (§13 / reviewer) the authoritative total now lives in the Activity column rather
// than in a window-wide bottom summary, which is removed outright.
// These checks prove the duplicate is *gone* rather than moved, and that the surviving reading's count is the
// projection's own number rather than a client recount (asserted against the bucket above and the column's own
// total attribute).
const retiredFeed = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const count = (selector) => scope?.querySelectorAll(selector).length ?? 0;
  return {
    empty: count("[data-rd-progress-empty]"),
    eventLists: count("[data-rd-progress-events]"),
    eventRows: count("[data-rd-progress-event]"),
    feedEmpty: count("[data-rd-progress-feed-empty]"),
    feeds: count("[data-rd-progress-feed]"),
    filters: count("[data-rd-progress-filters]"),
    rails: count("[data-rd-progress-axis]"),
    summary: (scope?.querySelector("[data-rd-progress-summary]")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    topicCards: count("[data-rd-progress-topic]"),
    window: Number(
      scope
        ?.querySelector("[data-rd-progress-index]")
        ?.getAttribute("data-rd-progress-index-window") ?? -1
    ),
  };
});
check(
  "C4: the retired window-wide feed is gone — not moved, and with nothing of it left behind",
  retiredFeed.topicCards === 0 &&
    retiredFeed.rails === 0 &&
    retiredFeed.eventLists === 0 &&
    retiredFeed.eventRows === 0 &&
    retiredFeed.empty === 0 &&
    retiredFeed.filters === 0,
  JSON.stringify(retiredFeed)
);
check(
  "C4: Progress shows exactly one activity reading — the composition's own scoped one",
  retiredFeed.feeds === 1 || retiredFeed.feedEmpty === 1,
  `feed lists ${retiredFeed.feeds}, empty state ${retiredFeed.feedEmpty}`
);
// §13 / reviewer ruling: Progress reads all time, and the former bottom window-wide summary is dropped
// entirely — the Activity reading is relabelled "Recent activity", its authoritative total is stated in the
// column (secondary to the newest rows), and the total-vs-shown invariant is asserted where the rail is read
// (the feed count === the projection's own `eventCount`, with the remainder stated). So the bottom summary is
// asserted *absent* rather than compared: re-introducing a second window-wide reading must fail here, and the
// all-time scope is pinned so a window can never leak into Progress.
const progressScope = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  return {
    summaryPresent: scope?.querySelector("[data-rd-progress-summary]") !== null,
    window: Number(
      scope
        ?.querySelector("[data-rd-progress-index]")
        ?.getAttribute("data-rd-progress-index-window") ?? -1
    ),
  };
});
check(
  "C4: Progress is at the all-time scope, and the retired window-wide bottom summary is gone",
  progressScope.window === 0 && progressScope.summaryPresent === false,
  `index window ${progressScope.window}; bottom summary present: ${progressScope.summaryPresent}`
);

// The composition's own order, asserted rather than assumed: the top row first, then Plan beside Open
// problems, then the three-card support band. Measured as positions on the page, because "below" is the
// claim — a selector existing says nothing about where it sits. The plan is optional by construction (an
// axis with no plan renders nothing), so its clause is stated conditionally rather than skipped.
const progressOrder = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const top = (selector) => {
    const node = scope?.querySelector(selector);
    return node ? Math.round(node.getBoundingClientRect().top) : null;
  };
  return {
    band: top("[data-rd-progress-band]"),
    plan: top("[data-rd-progress-plan]"),
    problems: top("[data-rd-progress-problems]"),
    topRow: top("[data-rd-progress-top]"),
  };
});
// Each of these sections is conditional by construction: a plan renders only where the axis has one, the Open
// problems list only where the axis has open problems, and the support band's cards only where the selected
// problem has repositories, evidence or steering. The corpus holds no problem at all, so requiring the Open
// problems section would fail on correct behaviour — the order is asserted over the sections that *do* render,
// with the top row always required, and the detail names which ones those were.
const middleTop =
  [progressOrder.plan, progressOrder.problems]
    .filter((value) => value !== null)
    .sort((left, right) => left - right)[0] ?? null;
const orderedPositions = [progressOrder.topRow, middleTop, progressOrder.band].filter(
  (value) => value !== null
);
check(
  "C4: the composition reads top row → Plan/Open problems → the support band, in the order that holds",
  progressOrder.topRow !== null &&
    orderedPositions.every(
      (value, index) => index === 0 || orderedPositions[index - 1] <= value
    ),
  `${JSON.stringify(progressOrder)}; sections present: ${
    [
      progressOrder.topRow !== null ? "top row" : null,
      middleTop !== null ? "Plan/Open problems" : null,
      progressOrder.band !== null ? "support band" : null,
    ]
      .filter(Boolean)
      .join(" → ") || "none"
  }`
);

// ---------------------------------- C4 increment 2: the pane's own structure
// The ruling on F2's follow-up: Progress must nest the way the prototype nests it — the index, then ONE pane
// holding the selected subject's header and three grouped rows — rather than the index, the Problem and the
// Activity standing as three sibling columns with every lower section as an independent full-width band. These
// checks measure that structure itself: containment, order and relative width, read from the page's geometry
// rather than from the class names, so a re-nesting that got the classes right and the layout wrong still fails.
// Every clause about an optional section is conditional, because a subject short of material must collapse
// honestly; the two that need two or three sections at once say so in the skip when the subject lacks them.
// The composition is proved on a subject that has something to compose. An axis with no problem, no plan and no
// support material renders the pane's empty state, and geometry checks run against it would measure nothing —
// which is exactly how the previous Progress montage proved the wrong thing. Walk the index, count the optional
// sections each axis renders, and leave the page on the one that renders the most: the same rule the fidelity
// capture uses, measured from the DOM, so the checks and the montage cannot disagree about the subject.
const SUPPORT_MARKERS = [
  "[data-rd-progress-plan]",
  "[data-rd-progress-problems]",
  "[data-rd-progress-repositories]",
  "[data-rd-progress-evidence]",
  "[data-rd-progress-steering]",
];
const selectRichestAxis = async () => {
  const axisIds = await page.evaluate(() =>
    [...document.querySelectorAll('div[data-plugin-id="research-dashboard"] [data-rd-index-axis]')].map(
      (node) => node.getAttribute("data-rd-index-axis")
    )
  );
  let richest = { count: -1, id: null };
  for (const id of axisIds) {
    await root.locator(`[data-rd-index-axis="${id}"]`).click();
    await page
      .waitForFunction(
        (axisId) =>
          document
            .querySelector('div[data-plugin-id="research-dashboard"] [data-rd-progress-detail]')
            ?.getAttribute("data-rd-progress-detail-axis") === axisId,
        id,
        { timeout: 10000 }
      )
      .catch(() => {});
    const count = await page.evaluate(
      (markers) =>
        markers.filter(
          (marker) =>
            document.querySelector(`div[data-plugin-id="research-dashboard"] ${marker}`) !== null
        ).length,
      SUPPORT_MARKERS
    );
    if (count > richest.count) {
      richest = { count, id };
    }
  }
  if (richest.id !== null) {
    await root.locator(`[data-rd-index-axis="${richest.id}"]`).click();
    await page
      .waitForFunction(
        (axisId) =>
          document
            .querySelector('div[data-plugin-id="research-dashboard"] [data-rd-progress-detail]')
            ?.getAttribute("data-rd-progress-detail-axis") === axisId,
        richest.id,
        { timeout: 10000 }
      )
      .catch(() => {});
  }
  return richest;
};
// The pane is measured with the Axes index showing: the header names the *axis*, and the row it is compared
// against is the axis index's selected row — neither of which exists while the index is listing problems. The
// pass's earlier checks switch modes, so this is asserted rather than assumed.
await clickIfPresent(root.locator('[data-rd-progress-subview-option="axes"]'));
await page.waitForTimeout(200);
const richestAxis = await selectRichestAxis();
console.log(
  `C4 geometry: measured on the richest axis in this dataset — ${richestAxis.count} optional section(s)`
);

const paneGeometry = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const rect = (selector) => {
    const node = scope?.querySelector(selector) ?? null;
    if (node === null) {
      return null;
    }
    const box = node.getBoundingClientRect();
    return {
      bottom: Math.round(box.bottom),
      left: Math.round(box.left),
      top: Math.round(box.top),
      width: Math.round(box.width),
    };
  };
  const pane = scope?.querySelector("[data-rd-progress-detail]") ?? null;
  const inPane = (selector) => {
    const node = scope?.querySelector(selector) ?? null;
    return node !== null && pane !== null && pane.contains(node);
  };
  // Three states per section, so a section that exists *outside* the pane cannot pass as absent: the check
  // requires every section that rendered to have rendered inside the pane. The two halves of row 1 are addressed
  // by their class and the grouped sections by their own markers — those are the two things the pane must hold.
  const SECTIONS = [
    ".rd-progress-problem",
    ".rd-progress-activity",
    "[data-rd-progress-plan]",
    "[data-rd-progress-problems]",
    "[data-rd-progress-repositories]",
    "[data-rd-progress-evidence]",
    "[data-rd-progress-steering]",
  ];
  const placement = SECTIONS.map((selector) => {
    const anywhere = scope?.querySelector(selector) ?? null;
    if (anywhere === null) {
      return { selector, state: "absent" };
    }
    return {
      selector,
      state: pane !== null && pane.querySelector(selector) !== null ? "in-pane" : "OUTSIDE",
    };
  });
  return {
    activity: rect(".rd-progress-activity"),
    band: rect("[data-rd-progress-band]"),
    bandMembers: ["[data-rd-progress-repositories]", "[data-rd-progress-evidence]", "[data-rd-progress-steering]"]
      .map((selector) => rect(selector))
      .filter((box) => box !== null),
    detailTitle:
      scope?.querySelector("[data-rd-progress-detail-title]")?.textContent?.trim() ?? "",
    evidence: rect("[data-rd-progress-evidence]"),
    head: rect("[data-rd-progress-detail] .rd-detail-head"),
    index: rect(".rd-progress-index"),
    pane: rect("[data-rd-progress-detail]"),
    placement,
    plan: rect("[data-rd-progress-plan]"),
    problem: rect(".rd-progress-problem"),
    problems: rect("[data-rd-progress-problems]"),
    renderedSections: SECTIONS.filter((selector) => scope?.querySelector(selector) !== null),
    repositories: rect("[data-rd-progress-repositories]"),
    row: rect("[data-rd-progress-row]"),
    selectedRowTitle:
      scope
        ?.querySelector('[data-rd-index-axis][aria-pressed="true"] .rd-strong')
        ?.textContent?.trim() ?? "",
    steering: rect("[data-rd-progress-steering]"),
  };
});
retired(
  "C4: everything right of the index sits inside ONE detail pane, and the index is left of it",
  paneGeometry.pane !== null &&
    paneGeometry.index !== null &&
    paneGeometry.index.left + paneGeometry.index.width <= paneGeometry.pane.left + 1 &&
    paneGeometry.placement.filter((entry) => entry.state === "in-pane").length >= 2 &&
    paneGeometry.placement.every((entry) => entry.state !== "OUTSIDE"),
  `index ${JSON.stringify(paneGeometry.index)}, pane ${JSON.stringify(paneGeometry.pane)}; ${
    paneGeometry.placement.map((entry) => `${entry.selector}=${entry.state}`).join(" · ")
  }`
);
retired(
  "C4: the pane is the selected axis — its header names it, above both the Problem and the Activity",
  paneGeometry.head !== null &&
    paneGeometry.detailTitle !== "" &&
    paneGeometry.detailTitle === paneGeometry.selectedRowTitle &&
    paneGeometry.problem !== null &&
    paneGeometry.activity !== null &&
    paneGeometry.head.bottom <= paneGeometry.problem.top + 1 &&
    paneGeometry.head.bottom <= paneGeometry.activity.top + 1,
  `header "${paneGeometry.detailTitle}" ${JSON.stringify(paneGeometry.head)}; the selected index row reads "${paneGeometry.selectedRowTitle}"; problem top ${paneGeometry.problem?.top ?? "absent"}, activity top ${paneGeometry.activity?.top ?? "absent"}`
);
retired(
  "C4: the Problem is the main lane — left of the Activity and at least 1.25× its width",
  paneGeometry.problem !== null &&
    paneGeometry.activity !== null &&
    paneGeometry.problem.left < paneGeometry.activity.left &&
    paneGeometry.problem.width >= paneGeometry.activity.width * 1.25,
  `problem ${paneGeometry.problem?.width ?? 0}px at x=${paneGeometry.problem?.left ?? 0}, activity ${paneGeometry.activity?.width ?? 0}px at x=${paneGeometry.activity?.left ?? 0} — ratio ${(
    (paneGeometry.problem?.width ?? 0) / Math.max(1, paneGeometry.activity?.width ?? 1)
  ).toFixed(2)}×`
);
if (paneGeometry.plan === null || paneGeometry.problems === null) {
  skip(
    "C4: Plan and Open problems share row 2, as two columns of one group",
    `this subject renders ${paneGeometry.plan === null ? "no plan" : "no open-problems list"} — the row collapses to what exists`
  );
} else {
  check(
    "C4: Plan and Open problems share row 2, as two columns of one group",
    paneGeometry.row !== null &&
      Math.abs(paneGeometry.plan.top - paneGeometry.problems.top) <= 2 &&
      paneGeometry.plan.left !== paneGeometry.problems.left &&
      paneGeometry.row.top <= Math.min(paneGeometry.plan.top, paneGeometry.problems.top) &&
      paneGeometry.row.bottom >= Math.max(paneGeometry.plan.bottom, paneGeometry.problems.bottom),
    `row ${JSON.stringify(paneGeometry.row)}; plan ${JSON.stringify(paneGeometry.plan)}; problems ${JSON.stringify(paneGeometry.problems)}`
  );
}
// V1 Phase-4 ruling (DECISIONS §14.10): the support band is **container-responsive**, not three columns at
// every width. Three columns are required when at least 720 px is available; at 480–719 px two columns with
// the third wrapping below is permitted; below 480 px one column is permitted — with Repository threads →
// Evidence → Human steering order preserved, and no clipping, overlap, or unintended nested scroller. The
// measured 634 px fixture case is therefore acceptable. The rule is read from the band's OWN container width
// (never the viewport), and the layout is read from where the cards actually render.
const bandRule = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const band = scope?.querySelector("[data-rd-progress-band]") ?? null;
  if (band === null) return null;
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width };
  };
  const cards = ["[data-rd-progress-repositories]", "[data-rd-progress-evidence]", "[data-rd-progress-steering]"]
    .map((selector) => band.querySelector(selector))
    .filter((node) => node !== null)
    .map((node) => ({
      kind: node.hasAttribute("data-rd-progress-repositories")
        ? "repositories"
        : node.hasAttribute("data-rd-progress-evidence")
          ? "evidence"
          : "steering",
      ...box(node),
    }));
  // The scrollable ancestors that CAN scroll (the host's own inner scrollport is the intended one; more than
  // one is an unintended nested scroller), plus the document viewport scroller — the ordinary page scroll —
  // which moves the page in host layouts where the content is not constrained to an inner port. The nearest
  // such ancestor is the **intended** scroller. When the host constrains the page to an inner port, the band
  // is only genuinely reachable if its bottom lands inside that port's own client rect, not merely inside the
  // window: the port's bottom sits above the window's, so a window-only bound would accept content the port
  // still clips. The intended scroller is identified structurally as the nearest scrolling ancestor — the host
  // exposes no stable selector for it, so naming it is not attempted; the check reports which element it was.
  const scrollables = [];
  for (let node = band.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (!/auto|scroll/.test(`${cs.overflowX}${cs.overflowY}`)) continue;
    if (node.scrollHeight <= node.clientHeight + 2) continue;
    scrollables.push(node);
  }
  const intended = scrollables[0] ?? null;
  const doc = document.scrollingElement ?? document.documentElement;
  const docScrolls = doc.scrollHeight > doc.clientHeight + 2;
  const before = scrollables.map((node) => node.scrollTop);
  const beforeY = window.scrollY;
  for (const node of scrollables) node.scrollTop = node.scrollHeight;
  if (docScrolls) window.scrollTo(0, doc.scrollHeight);
  // The bottom of what actually shows the band: the intended port's client bottom when the host uses one,
  // otherwise the window. Never looser than the window.
  const viewportBottom = intended ? Math.min(window.innerHeight, box(intended).bottom) : window.innerHeight;
  const reachable = box(band).bottom <= viewportBottom + 0.5;
  scrollables.forEach((node, i) => {
    node.scrollTop = before[i];
  });
  if (docScrolls) window.scrollTo(0, beforeY);
  return {
    bandW: box(band).w,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    cards,
    reachable,
    intendedScroller: intended
      ? `${intended.tagName.toLowerCase()}.${String(intended.className).trim().split(/\s+/)[0] || "scrollport"}`
      : "document",
    viewportBottom,
    scrollsSomewhere: scrollables.length > 0 || docScrolls,
    nestedScrollers: scrollables.length,
  };
});
if (bandRule === null || bandRule.cards.length === 0) {
  skip(
    "C4: the support band is container-responsive — three columns at ≥720px, two at 480–719px, one below, in Repository threads → Evidence → Human steering order",
    "this subject renders no support band"
  );
} else {
  const c = bandRule.bandW;
  const n = bandRule.cards.length;
  const tops = [...new Set(bandRule.cards.map((card) => Math.round(card.top)))].sort((a, b) => a - b);
  const rows = tops.map((top) =>
    bandRule.cards.filter((card) => Math.round(card.top) === top).sort((a, b) => a.left - b.left)
  );
  const firstRow = rows[0].length;
  const expectedCols = c >= 720 ? Math.min(n, 3) : c >= 480 ? Math.min(n, 2) : 1;
  const order = [...bandRule.cards]
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((card) => card.kind);
  const expectedOrder = ["repositories", "evidence", "steering"].filter((kind) => order.includes(kind));
  const rowOverlap = rows.some((row) => row.some((card, i) => i > 0 && card.left < row[i - 1].right - 0.5));
  const colOverlap = rows.some(
    (row, i) => i > 0 && Math.min(...row.map((card) => card.top)) < Math.max(...rows[i - 1].map((card) => card.bottom)) - 1
  );
  const within = bandRule.cards.every((card) => card.left >= 0 && card.right <= bandRule.viewport.w + 0.5);
  const minWidth = Math.round(Math.min(...bandRule.cards.map((card) => card.w)));
  check(
    "C4: the support band is container-responsive — three columns at ≥720px, two at 480–719px, one below, in Repository threads → Evidence → Human steering order",
    firstRow === expectedCols &&
      JSON.stringify(order) === JSON.stringify(expectedOrder) &&
      !rowOverlap &&
      !colOverlap &&
      minWidth >= 200 &&
      within &&
      bandRule.reachable &&
      bandRule.scrollsSomewhere &&
      bandRule.nestedScrollers <= 1,
    `band container ${Math.round(c)}px with ${n} card(s); first row ${firstRow} column(s), the ruled layout expects ${expectedCols}; order ${order.join(" → ")}; row overlap ${rowOverlap}; column overlap ${colOverlap}; min card width ${minWidth}px (needs 200); within the page ${within}; band bottom reachable by a full page scroll ${bandRule.reachable} (bound ${Math.round(bandRule.viewportBottom)} = min(window ${bandRule.viewport.h}, intended scroller ${bandRule.intendedScroller})); the page can scroll: ${bandRule.scrollsSomewhere}; nested scrolling ancestors: ${bandRule.nestedScrollers}`
  );
}

// The Progress detail (and therefore its activity list) only renders once a workstream is selected; the
// pivot made the view selection-driven. Select the richest axis so the source-line assertion has a subject.
await root.getByRole("button", { name: "Progress", exact: true }).click();
await root.locator("[data-rd-index-axis]").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
// Select the axis whose projection bucket actually carries events (derived from the projection, never the
// richest-marker heuristic — a richer axis with no events would give this check no subject). The traversal
// above may leave a lingering tag target, so this selects deterministically from the projection.
{
  const eventBucket = (allProgress.activity?.byAxis ?? []).find((bucket) => (bucket.events ?? []).length > 0);
  if (eventBucket) {
    const row = root.locator(`[data-rd-index-axis="${eventBucket.axisId}"]`).first();
    if ((await row.count()) > 0) {
      await row.click();
      await page
        .waitForFunction(
          (axisId) =>
            document
              .querySelector('div[data-plugin-id="research-dashboard"] [data-rd-progress-detail]')
              ?.getAttribute("data-rd-progress-detail-axis") === axisId,
          eventBucket.axisId,
          { timeout: 8000 }
        )
        .catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}
const eventSources = await page.evaluate(() => {
  const panel = document.querySelector('div[data-plugin-id="research-dashboard"]');
  return [...panel.querySelectorAll("[data-rd-feed-event] .rd-meta, [data-rd-activity-event] .rd-meta")]
    .map((el) => (el.innerText ?? "").replace(/\s+/g, " ").trim())
    // The date is not a source; the source line is the one that names where the event came from.
    .filter((line) => !/^\d{4}-\d{2}-\d{2}$/.test(line));
});
const REPORTED_SOURCES =
  /^(manual note|agent review|experiment|commit|issue|PR|document|group chat)/;
check(
  "a recorded event names its source the way it is reported, not the way the menu offers it (C8)",
  eventSources.length > 0 && eventSources.every((line) => REPORTED_SOURCES.test(line)),
  `sample ${JSON.stringify(eventSources.slice(0, 2))}`
);

// Two checks stood here: one asserting the repository filter kept only the axes that name that repository,
// one that a person filter matching nothing attributable said so. Both controls retired with the feed they
// filtered (C4/F2 — the composition is selection-driven, and the toolbar's window control is the only control
// it needs), so the checks retire with them rather than being rewritten against a control that no longer
// exists. Nothing a reader relied on disappears: the index still carries every axis's topic and counts, and
// the selected axis's own `Activity` box states its total and how much of it is shown.

// Back to the topics view, with the filters gone with their view.
await root.getByRole("button", { name: "Projects", exact: true }).click();
await page.waitForTimeout(500);
const afterProgress = await page.evaluate(() => {
  const scope = document.querySelector(
    'div[data-plugin-id="research-dashboard"]'
  );
  return {
    topicRows: scope?.querySelectorAll("[data-rd-index-topic]").length ?? 0,
    progress: scope?.querySelectorAll('[data-rd-view="progress"]').length ?? 0,
  };
});
check(
  "leaving the Progress view restores the topic view with no residue",
  afterProgress.topicRows > 0 && afterProgress.progress === 0,
  `topic rows ${afterProgress.topicRows}, progress views ${afterProgress.progress}`
);

// Navigation route in v0.4.31: plugin pages are NOT in the sidebar — AppSidebar renders only
// SIDEBAR_PAGE_IDS items, and the docs' "sidebar Plugins group" does not match this build. The
// command palette carries a "Plugins" group (CommandPalette.tsx), which is how members reach the
// page. Assert that route, then the page itself.
await page.goto(DASHBOARD, { waitUntil: "networkidle" });
await page.keyboard.press("Control+k");
const paletteEntry = page.getByRole("option", { name: new RegExp(PAGE_LABEL) }).first();
let paletteReachable = true;
try {
  await paletteEntry.waitFor({ state: "visible", timeout: 8000 });
} catch {
  paletteReachable = false;
}
check(
  "command palette lists the plugin page",
  paletteReachable,
  paletteReachable ? "" : "no matching option"
);
if (paletteReachable) {
  // The navigation shot: the palette scrolled to the plugin entry — the only route to a plugin page
  // in v0.4.31 (no sidebar entry). `waitFor({state:"visible"})` above only proves the option exists in
  // the DOM; the palette's list scrolls, so the entry has to be brought into view before the shot or
  // the image shows a palette with no plugin row in it.
  await paletteEntry.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const paletteShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-palette.png`;
  await page.screenshot({ path: paletteShot });
  console.log("palette screenshot:", shotLabel(paletteShot));
  await paletteEntry.click();
  await page.waitForURL(new RegExp(`/plugins/${PLUGIN_ID}`), { timeout: 8000 }).catch(() => {});
  check(
    "palette entry navigates to the page",
    page.url().includes(`/plugins/${PLUGIN_ID}`),
    redactEndpoint(page.url())
  );
}

// ---------------------------------- U9: the density rules the polish is held to
// The density pass itself is judged by the reviewer, not by this file. What a harness can hold is the part
// that is a fact about the page: that no boxed block nests inside another boxed block (the "pale box on pale
// box" complaint), that the exceptional colour is reserved for the exceptional state, and that no view grows
// without bound. All three are expressed in a way that holds at any width — the budget is in **screens**, so
// the 1280×800 reference is the shape of the claim, not a magic number baked into the check.
{
  // Mount the page deliberately first: the palette checks just above may have left the router mid-navigation,
  // and a density measurement of a page that is not there measures nothing. `scope === null` is then a
  // SKIP with a reason rather than a crash (the pass's abort contract exists for real faults, not for a
  // subject that is missing on a view).
  await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
  await root.waitFor({ state: "visible", timeout: 20000 });
  const visual = await page.evaluate((pluginId) => {
    const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
    if (scope === null) {
      return { exceptional: "", nested: [], offenders: [], scopeMissing: true };
    }
    const isBoxedBlock = (el) => {
      const s = getComputedStyle(el);
      const bordered =
        parseFloat(s.borderTopWidth) > 0 &&
        parseFloat(s.borderRightWidth) > 0 &&
        parseFloat(s.borderBottomWidth) > 0 &&
        parseFloat(s.borderLeftWidth) > 0;
      const padded = parseFloat(s.paddingTop) >= 6 && parseFloat(s.paddingLeft) >= 6;
      const holdsABlock = [...el.children].some((child) =>
        ["DIV", "SECTION", "UL", "ARTICLE"].includes(child.tagName)
      );
      return bordered && parseFloat(s.borderRadius) > 0 && padded && holdsABlock;
    };
    const nested = [];
    const walk = (el, host) => {
      for (const child of el.children) {
        const boxed = isBoxedBlock(child);
        if (boxed && host !== null) {
          nested.push(`${host} > ${child.className.toString().split(" ")[0] || child.tagName}`);
        }
        walk(child, boxed ? child.className.toString().split(" ")[0] || child.tagName : host);
      }
    };
    walk(scope, null);

    // The exceptional colour, read off whatever the theme resolves rather than a literal: the one element
    // entitled to it is a blocked state badge (or a refusal banner). Anything else rendering in that colour
    // is the over-colouring the polish removed — a count, "no evidence", an uncertain confidence.
    const entitled = scope?.querySelector(".rd-state[data-rd-state=\"blocked\"]") ?? null;
    const exceptional = entitled === null ? "" : getComputedStyle(entitled).color;
    const normalize = (value) => value.replace(/\s+/g, "").toLowerCase();
    const offenders = [];
    if (exceptional !== "") {
      const allowed = [
        ".rd-state[data-rd-state=blocked]",
        ".rd-error",
        ".rd-conflict",
        ".rd-topic-index [data-rd-topic-stale=true]",
        ".rd-axis[data-rd-axis-state=blocked]",
        ".rd-axis-detail[data-rd-axis-state=blocked]",
      ].join(",");
      for (const el of scope.querySelectorAll("*")) {
        const s = getComputedStyle(el);
        const painted = [s.color, s.borderTopColor, s.borderLeftColor].map(normalize);
        if (!painted.includes(normalize(exceptional))) {
          continue;
        }
        if (el.closest(allowed) === null) {
          offenders.push(
            `${el.tagName.toLowerCase()}.${el.className.toString().split(" ")[0] || "?"} :: ${(el.textContent ?? "").trim().slice(0, 28)}`
          );
        }
      }
    }
    return { exceptional, nested, offenders };
  }, PLUGIN_ID);

  // A refusal banner is allowed to be a box inside a box: it is transient, it must not be missed, and it is
  // the one thing on the page whose whole job is to be noticed. The four-tab pivot names a second sanctioned
  // composition: the Projects detail panel carries the **shared workstream cards** inside it (pivot spec,
  // "Projects ... concise workstream cards" / "Progress ... visible task cards"; the same card bodies are
  // shared by People and Repositories). That panel-with-cards surface is the accepted render, so the pair
  // `rd-panel/rd-topic-detail > rd-work-card` is sanctioned. Every OTHER nested box is the pale-on-pale
  // pattern the U9 polish removed and is still caught.
  const SANCTIONED_NESTING = /^(?:rd-conflict|rd-error|rd-(?:panel|topic-detail) > rd-work-card)$/;
  const unjustified = visual.nested.filter((entry) => !SANCTIONED_NESTING.test(entry));
  if (visual.scopeMissing === true) {
    for (const description of [
      "one surface per level: no boxed block nests inside another, except a refusal banner",
      "the exceptional colour is used only for the exceptional state",
      "tags stay chips when they wrap: one height per cluster, one line each",
    ]) {
      skip(description, "the plugin page did not mount for this check, so there is nothing to measure");
    }
  } else {
  check(
    "one surface per level: no boxed block nests inside another, except a refusal banner",
    unjustified.length === 0,
    unjustified.slice(0, 3).join("; ") ||
      `${visual.nested.length} nested box(es) on this view, all refusal banners`
  );

  /**
   * Tags stay chips when they wrap. A cluster is a wrapping row of pills whose label is an entity's own
   * name, so the failure to catch is a long name changing the *shape* of its neighbours — or a chip growing
   * into two lines and taking the row's rhythm with it. Every cluster is measured in whatever view it is
   * on, so this holds wherever tags are read.
   */
  const tagShape = await page.evaluate((pluginId) => {
    const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
    const clusters = [...scope.querySelectorAll(".rd-tags")];
    const bad = [];
    for (const cluster of clusters) {
      const chips = [...cluster.querySelectorAll(".rd-tag")];
      if (typeof window !== "undefined") {
        window.__rdChipDiag = JSON.stringify(
            chips.map((chip) => ({
              box: Math.round(chip.getBoundingClientRect().height),
              children: [...chip.children].map((child) => ({
                box: Math.round(child.getBoundingClientRect().height),
                cls: child.className?.toString().split(" ")[0],
                display: getComputedStyle(child).display,
              })),
              cls: chip.className?.toString(),
              display: getComputedStyle(chip).display,
              parent: chip.parentElement?.className?.toString(),
              rects: chip.getClientRects().length,
              text: (chip.textContent ?? "").trim().slice(0, 30),
              visibility: getComputedStyle(chip).visibility,
              w: Math.round(chip.getBoundingClientRect().width),
            })),
            null,
            1
        );
        window.__rdChipCluster = `${cluster.className?.toString()} ${Math.round(
          cluster.getBoundingClientRect().height
        )}px`;
      }
      if (chips.length === 0) {
        continue;
      }
      const heights = chips.map((chip) => Math.round(chip.getBoundingClientRect().height));
      const shortest = Math.min(...heights);
      const tallest = Math.max(...heights);
      if (tallest - shortest > 1) {
        bad.push(`${chips.length} chip(s) with heights ${shortest}..${tallest}: ${(chips[0]?.textContent ?? "").trim().slice(0, 24)}`);
      } else if (tallest > 32) {
        bad.push(`chip ${tallest}px tall (one line is the shape): ${(chips[0]?.textContent ?? "").trim().slice(0, 24)}`);
      }
    }
    return { bad: bad.slice(0, 3), clusters: clusters.length };
  }, PLUGIN_ID);
  if (tagShape.clusters === 0) {
    skip(
      "tags stay chips when they wrap: one height per cluster, one line each",
      "this view renders no tag cluster, so there is no chip shape to measure"
    );
  } else {
    check(
      "tags stay chips when they wrap: one height per cluster, one line each",
      tagShape.bad.length === 0,
      tagShape.bad.join("; ") || `${tagShape.clusters} cluster(s), every chip one line`
    );
  }

  if (visual.exceptional === "") {
    skip(
      "the exceptional colour is used only for the exceptional state",
      "no blocked state badge is on this view, so the theme's exceptional colour cannot be read off one"
    );
  } else {
    check(
      "the exceptional colour is used only for the exceptional state",
      visual.offenders.length === 0,
      visual.offenders.slice(0, 3).join("; ") ||
        `nothing else renders in ${visual.exceptional}`
    );
  }
  }
}

// The density reference, measured the way the U9 acceptance states it: at 1280×800 the glance shows what
// matters and no view runs away with the scroll. The budget is in screens so it means the same thing at
// either recorded viewport.
{
  // The five peer tabs the toolbar actually offers (`VIEW_OPTIONS`); §13 makes Overview a real tab, so it is
  // measured too. The top-bar brand is static text, not a destination, so it is not named as a view.
  const views = ["Projects", "Progress", "People", "Repositories"];
  const heights = {};
  for (const view of views) {
    await root.getByRole("button", { name: view, exact: true }).click();
    await page.waitForTimeout(700);
    heights[view] = await page.evaluate((pluginId) => {
      const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
      return scope === null ? -1 : scope.scrollHeight;
    }, PLUGIN_ID);
  }
  const screens = (px) => Math.round((px / VIEWPORT.height) * 10) / 10;
  const worst = Object.entries(heights).sort((a, b) => b[1] - a[1])[0] ?? ["none", -1];
  check(
    "no view runs away with the scroll at the reference size (budget: eight screens of content)",
    worst[1] > 0 && worst[1] <= 8 * VIEWPORT.height,
    Object.entries(heights)
      .map(([view, px]) => `${view} ${screens(px)} screen(s)`)
      .join(", ")
  );

  // The acceptance's own words: the primary question **and** the latest activity, without pathological
  // scrolling. Measured where they actually are — the first screen.
  await root.getByRole("button", { name: "Progress", exact: true }).click();
  await root.locator("[data-rd-index-axis]").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  // The detail pane (and its newest activity row) only renders once a workstream is selected.
  await selectRichestAxis();
  await page.waitForTimeout(400);
  const glance = await page.evaluate((pluginId) => {
    const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
    // The pivot retired the Problem column; the Progress reading's own frame is the detail pane.
    const reading = scope?.querySelector("[data-rd-progress-detail]")?.getBoundingClientRect() ?? null;
    const newest =
      scope
        ?.querySelector(".rd-progress-activity [data-rd-feed-event]")
        ?.getBoundingClientRect() ?? null;
    return {
      readingTop: reading === null ? null : Math.round(reading.top),
      newestBottom: newest === null ? null : Math.round(newest.bottom),
    };
  }, PLUGIN_ID);
  check(
    "the Progress glance — the detail pane and the newest Activity row — is inside the first screen",
    glance.readingTop !== null &&
      glance.newestBottom !== null &&
      glance.readingTop < VIEWPORT.height &&
      glance.newestBottom <= VIEWPORT.height,
    `detail pane top ${glance.readingTop}px, newest activity row bottom ${glance.newestBottom}px, screen ${VIEWPORT.height}px`
  );
  // Leave the page where the rest of the run expects it.
  await root.getByRole("button", { name: "Projects", exact: true }).click();
  await page.waitForTimeout(400);
}

if (WRITE) {
  // Scope every interaction to the plugin's own root: the dashboard chrome has buttons and inputs
  // whose accessible names overlap ("… Activity" titles in the sidebar), and strict mode rejects
  // ambiguous locators.
  //
  // D7: the page offers no broad create or edit control — topics are created and structured through the
  // librarian (`reconcile_topic`, covered by the store/action tests), so this pass no longer drives a
  // create form, a topic-field editor or a page-side activity recorder. What the page still writes is a
  // **topic note** and an **axis correction**; those two are exercised below. The absence is asserted
  // first, so re-adding a control fails here rather than quietly widening the surface again.
  const noControl = await page.evaluate((pluginId) => {
    const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
    const text = (scope?.innerText ?? "").replace(/\s+/g, " ");
    return {
      createControl: /Add topic|New topic name/.test(text),
      editControl: /Edit fields|Done editing/.test(text),
      editors: scope?.querySelectorAll("[data-rd-topic-editor]").length ?? 0,
            activityRecorder: scope?.querySelectorAll('[aria-label="Activity"]').length ?? 0,
      // C1 keeps the narrow writes and always renders them (the detail is persistent), so what is
      // asserted is that they are folded away by default — not that they are gone.
      writes: scope?.querySelectorAll("details[data-rd-write]").length ?? 0,
      openWrites: scope?.querySelectorAll("details[data-rd-write][open]").length ?? 0,
      noteField: scope?.querySelectorAll('[aria-label="Topic note"]').length ?? 0,
    };
  }, PLUGIN_ID);
  check(
    "the page offers no broad create or edit control (D7: Topics is read-first)",
    !noControl.createControl && !noControl.editControl && noControl.editors === 0,
    JSON.stringify(noControl)
  );
  check(
    "the narrow writes survive the composition, collapsed by default",
    noControl.noteField === 1 &&
      noControl.activityRecorder === 1 &&
      noControl.writes >= 1 &&
      noControl.openWrites === 0,
    `note field ${noControl.noteField}, activity recorder ${noControl.activityRecorder}, ` +
      `collapsed disclosures ${noControl.writes}, open ${noControl.openWrites}`
  );
  // A topic to drive the page's surviving writes on. It is created through the action below, the way the
  // librarian would, not from the page.
  const name = `ui-check ${Date.now().toString().slice(-5)}`;
  const card = root.locator(`[data-rd-detail="${name}"]`);

  // ------------------------------------------------------------------ C5 + D8: correcting from the detail
  // A manager's correction, in the place the review asked for it: the expanded detail, with the
  // rationale that goes with it. Fixture first — the page has no "add axis" control (C8 owns the full
  // editing pass), so the axis is made through the plugin's own action and then corrected by hand.
  const auth = await page.evaluate(async () => {
    const cookie = (name) =>
      document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? "";
    return { csrf: cookie("nakama_csrf"), orgId: ORG_ID };
  });
  const callAction = (key, input) =>
    page.evaluate(
      async ([actionKey, actionInput, csrf, orgId]) => {
        const response = await fetch(
          `/v1/plugins/research-dashboard/actions/${actionKey}`,
          {
            body: JSON.stringify({ input: actionInput }),
            credentials: "include",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": csrf,
              "x-org-id": orgId,
            },
            method: "POST",
          }
        );
        return { body: await response.json().catch(() => null), status: response.status };
      },
      [key, input, auth.csrf, auth.orgId]
    );

  const axisTitle = `Correct me ${Date.now().toString().slice(-5)}`;
  const fixture = await callAction("reconcile_topic", {
    axes: [{ state: "draft", stateConfidence: "inferred", title: axisTitle }],
    topicName: name,
  });
  const axisId = fixture.body?.result?.axes?.[0]?.id ?? "";
  const topicId = fixture.body?.result?.topic?.id ?? "";
  check(
    "an axis to correct exists",
    Boolean(axisId) && Boolean(topicId),
    `status ${fixture.status}`
  );

  // Reload so the fixture axis is in the detail, then open it the way a reader would — the page's only
  // way in is the read disclosure (D7), and the note affordance lives inside that detail.
  await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
  await root.waitFor({ state: "visible", timeout: 20000 });
  // A reload opens the shell on its landing now (C3), not on Topics — so the view this section writes from has
  // to be chosen rather than assumed. Before the landing default it was simply there, and the row click below
  // aborted on a 30s locator timeout against a page that had no index at all.
  await root.locator('[data-rd-view-option="topics"]').click();
  await page.waitForSelector(`div[data-plugin-id] [data-rd-view="topics"]`, { timeout: 10000 });
  // The detail is persistent, but this fixture topic is not the server's first: select its rail row.
  await root.locator(`[data-rd-index-topic="${name}"]`).click();
  // Confirm the click actually selected the row before asserting anything about its pane: without this
  // the pass typed into a pane that was still the default selection.
  await root
    .locator(`[data-rd-index-topic="${name}"][aria-pressed="true"]`)
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  await settleUntil(
    ([pluginId, topic]) =>
      document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-detail="${topic}"] [data-rd-claim="summary"]`
      ) !== null,
    [PLUGIN_ID, name],
    6000
  );
  // C1 keeps the narrow writes — the topic note and the axis correction — but folds them away by
  // default. Driving the page means opening what the page folded, not asserting the fold away: this is
  // the one place the pass writes, so it opens the write disclosures the way a reader does and then
  // asserts the field is actually writable. (The earlier abort here was a 30s locator timeout on a
  // hidden input: the field was in the DOM and inside a closed fold.)
  for (const summary of await root
    .locator(`[data-rd-detail="${name}"] details[data-rd-write]:not([open]) summary`)
    .all()) {
    await summary.click().catch(() => {});
  }
  // Same resolution as the pass's own affordance checks: the plugin root, not a pane-name path.
  const noteField = root.locator('[aria-label="Topic note"]').first();
  const noteFieldVisible = await noteField
    .waitFor({ state: "visible", timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  check(
    "the folded write affordances open and the note field becomes writable in the detail",
    noteFieldVisible,
    `note field visible under [data-rd-detail="${name}"]: ${noteFieldVisible}`
  );

  // The narrow write the page kept (D7), end to end: the note field is inline in the read detail and its
  // write lands in the list that detail already renders.
  const pageNoteText = `ui verification note ${Date.now().toString().slice(-5)}`;
  await noteField.fill(pageNoteText);
  await card.getByRole("button", { name: "Add note / correction", exact: true }).click();
  await page.waitForTimeout(1500);
  const noteLanded = await page.evaluate(
    (needle) =>
      (document.querySelector(`div[data-plugin-id="research-dashboard"]`)?.innerText ?? "").includes(needle),
    pageNoteText
  );
  check("a topic note written from the read detail renders in the Notes card", noteLanded, pageNoteText);
  const axisCard = root.locator(`[data-rd-detail="${name}"] [data-rd-axis-title="${axisTitle}"]`);
  const beforeCorrection = await axisCard
    .locator("[data-rd-has-evidence]")
    .getAttribute("data-rd-has-evidence");
  check(
    "the fixture axis starts with nothing behind it",
    beforeCorrection === "false",
    `has-evidence: ${beforeCorrection}`
  );
  // C8: and it says so in the same words everywhere, rather than leaving the reader to infer it from an
  // empty space. This is the claim-side of the same rule the state badge follows.
  const withoutEvidenceText = (await axisCard.innerText()).replace(/\s+/g, " ");
  check(
    'an axis with nothing behind it says "no evidence on record" (C8)',
    withoutEvidenceText.includes("no evidence on record"),
    `axis text: ${withoutEvidenceText.slice(0, 160)}`
  );

  // The Correct control also sits inside the axis's closed `<details>`; open it before clicking, the same
  // prerequisite the read pass's History check needed.
  await expandAxisDisclosure(axisCard);
  await axisCard.getByRole("button", { name: "Correct", exact: true }).click();
  await page.waitForTimeout(400);
  const noteText = "parked on purpose while the two papers are submitted";
  await axisCard.getByLabel("Axis state", { exact: true }).click();
  await page.getByRole("option", { name: "Parked", exact: true }).click();
  await axisCard.getByLabel("State confidence", { exact: true }).click();
  await page.getByRole("option", { name: "Confirmed", exact: true }).click();
  await axisCard.getByLabel("Note on this correction").fill(noteText);

  // A second writer moves the axis on between the read and the save. The page read version N, so its
  // write must be refused rather than silently overwriting the other change.
  const bumped = await callAction("reconcile_topic", {
    axes: [{ description: "bumped by the harness", id: axisId }],
    topicId,
  });
  check("a concurrent writer bumped the axis", bumped.status === 200, `status ${bumped.status}`);

  const reconcileCallsBefore = callsFor("reconcile_topic").length;
  await axisCard.getByRole("button", { name: "Save correction", exact: true }).click();
  await page.waitForTimeout(1500);
  const saveCalls = callsFor("reconcile_topic").slice(reconcileCallsBefore);
  const lastSaveInput = JSON.stringify(saveCalls.at(-1)?.input ?? null).slice(0, 240);
  const saveResponse = actionResponses
    .filter((entry) => entry.key === "reconcile_topic")
    .at(-1);
  const stale = await page.evaluate(
    ([topic, title]) => {
      const axis = document.querySelector(
        `div[data-plugin-id="research-dashboard"] [data-rd-detail="${topic}"] [data-rd-axis-title="${title}"]`
      );
      const banner = axis?.querySelector("[data-rd-conflict]");
      const page_ = document.querySelector('div[data-plugin-id="research-dashboard"]');
      return {
        axisBanner: banner ? (banner.innerText ?? "").replace(/\s+/g, " ") : "",
        banners: document.querySelectorAll("[data-rd-conflict]").length,
        evidence: axis
          ?.querySelector("[data-rd-has-evidence]")
          ?.getAttribute("data-rd-has-evidence"),
        notes: axis?.querySelector("[data-rd-axis-notes]")?.innerText ?? "",
        pageBanners: page_?.querySelectorAll("[data-rd-conflict]").length ?? 0,
        pageError: (page_?.querySelector(".rd-error")?.innerText ?? "").replace(
          /\s+/g,
          " "
        ),
      };
    },
    [name, axisTitle]
  );
  const keptNote = await axisCard
    .getByLabel("Note on this correction")
    .inputValue();
  check(
    "a stale correction is refused inside that axis, and keeps what was typed",
    stale.axisBanner.includes("This development axis changed since you opened it") &&
      stale.pageBanners === 1 &&
      keptNote === noteText,
    `banner: ${stale.axisBanner.slice(0, 60)}; on page: ${stale.pageBanners}; note kept: ${keptNote === noteText}; page error: ${stale.pageError.slice(0, 60)}; saves: ${saveCalls.length}; response: ${saveResponse?.status} ${(saveResponse?.body ?? '').slice(0,200)}`
  );
  check(
    "the refused correction wrote nothing: no note, no evidence",
    stale.evidence === "false" && !stale.notes.includes(noteText),
    `evidence ${stale.evidence}, notes: ${stale.notes.replace(/\s+/g, " ").slice(0, 60)}`
  );

  await axisCard.getByRole("button", { name: "Reload this topic", exact: true }).click();
  await page.waitForTimeout(1500);
  const afterReload = {
    note: await axisCard.getByLabel("Note on this correction").inputValue(),
    state: (
      await axisCard.getByLabel("Axis state", { exact: true }).innerText()
    ).trim(),
  };
  check(
    "the reload re-reads the axis and carries the rationale across",
    afterReload.note === noteText && afterReload.state === "Draft",
    `note kept: ${afterReload.note === noteText}, state select re-read: ${afterReload.state}`
  );

  // The claims are re-judged against the refreshed axis, then saved again — and now they land, with
  // the note arriving in the same call so the `confirmed` claim has something behind it.
  await axisCard.getByLabel("Axis state", { exact: true }).click();
  await page.getByRole("option", { name: "Parked", exact: true }).click();
  await axisCard.getByLabel("State confidence", { exact: true }).click();
  await page.getByRole("option", { name: "Confirmed", exact: true }).click();
  await axisCard.getByRole("button", { name: "Save correction", exact: true }).click();
  await page.waitForTimeout(1800);
  // The notes live under the axis's own history, so read them the way a person would: expand it — the
  // reload above may have remounted the axis and closed its disclosure again.
  await expandAxisDisclosure(axisCard);
  await axisCard.getByRole("button", { name: /^History \(/ }).click();
  await page.waitForTimeout(500);
  const corrected = await page.evaluate(
    ([topic, title]) => {
      const axis = document.querySelector(
        `div[data-plugin-id="research-dashboard"] [data-rd-detail="${topic}"] [data-rd-axis-title="${title}"]`
      );
      return {
        evidence: axis?.querySelector("[data-rd-has-evidence]")?.getAttribute("data-rd-has-evidence"),
        noteText: (axis?.querySelector("[data-rd-axis-notes]")?.innerText ?? "").replace(/\s+/g, " "),
        state: axis?.getAttribute("data-rd-axis-state"),
        text: (axis?.innerText ?? "").replace(/\s+/g, " "),
      };
    },
    [name, axisTitle]
  );
  check(
    "the correction lands with its note, and the note is what backs the claim",
    corrected.state === "parked" &&
      corrected.evidence === "true" &&
      corrected.noteText.includes(noteText) &&
      !corrected.text.includes("no evidence on record"),
    `state ${corrected.state}, evidence ${corrected.evidence}, note kept: ${corrected.noteText.includes(noteText)}`
  );

  // Behaviour 1 of the conflict contract (a topic-level refusal reports at topic level, never inside an
  // axis, and keeps the typed rationale) had exactly one page-side entry point: the topic-field editor's
  // save, which D7 removed — the page has no revision-guarded topic-scoped write any more. The contract
  // behaviour itself is unchanged and stays covered by the store/action tests (H2), so this pass retires
  // the page check rather than re-pointing it at a write the page no longer offers. The topic-level
  // banner stays in the UI: it is the refusal surface for any topic-scoped write the page does make
  // (the note path), and the read pass asserts the axis-level half of the contract stays axis-scoped.
}

  // --------------------------------- C9: one grammar across the four views (U4 step 7, second half)
// The propagation pass gives the four views the primitives Progress proved, without redesigning what each
// view is *for*. This section asserts the grammar, not the product: every state travels through the one
// badge, every age through the one recency label (whose words must be the age of the timestamp it carries),
// every selected entity through the one header, every named entity through the one tag — and a tag clicked
// in People, Repositories and Topics lands on that entity with the label the destination uses. The traversal
// is bracketed by the two claims a navigation primitive needs: no write action, and an identical projection.
{
  const GRAMMAR_READS = new Set([
    "get_overview",
    "get_progress",
    "get_topic",
    "list_activity",
    "list_topics",
  ]);
  const grammarWrites = () =>
    actionCalls.filter((call) => !GRAMMAR_READS.has(call.key)).length;
  const grammarBaseline = {
    payload: JSON.stringify(await apiProgress(windowDaysNow)),
    writes: grammarWrites(),
  };
  const overviewProjection = await apiAction("get_overview", {
    activitySinceDays: windowDaysNow,
  });

  const showView = async (view) => {
    await root.locator(`[data-rd-view-option="${view}"]`).click();
    await page.waitForTimeout(350);
  };
  const readGrammar = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const tagsIn = (node) =>
        [...(node?.querySelectorAll("[data-rd-entity-tag]") ?? [])].map((n) => ({
          id: n.getAttribute("data-rd-entity-id"),
          label: n.getAttribute("data-rd-tag-label"),
          type: n.getAttribute("data-rd-entity-tag"),
        }));
      // The state-carrying rows of the pivoted surface: each compact workstream card carries its state
      // and its one StateBadge (`data-rd-state-confidence`). The retired axis-state/scan-axis hooks are gone.
      const rows = [
        ...(scope?.querySelectorAll("[data-rd-work-card][data-rd-state]") ?? []),
      ];
      const headers = [
        ...(scope?.querySelectorAll("[data-rd-detail-header]") ?? []),
      ];
      const notices = [...(scope?.querySelectorAll("[data-rd-notice]") ?? [])];
      return {
        badgeCount: scope?.querySelectorAll("[data-rd-state-confidence]").length ?? -1,
        headers: headers.map((n) => ({
          context: tagsIn(n.querySelector("[data-rd-detail-context]")),
          tags: tagsIn(n).length,
          title: (n.textContent ?? "").trim().slice(0, 80),
        })),
        notices: notices.map((n) => ({
          kind: n.getAttribute("data-rd-notice"),
          tags: tagsIn(n).length,
        })),
        recency: [...(scope?.querySelectorAll("[data-rd-recency]") ?? [])].map((n) => ({
          at: n.getAttribute("data-rd-recency") ?? "",
          text: (n.textContent ?? "").trim(),
        })),
        rowCount: rows.length,
        // §7 (as amended by §13): the top bar carries a static dashboard brand, and it must read the same in
        // every view the traversal visits — the brand is not a per-view heading. Read here so its constancy is
        // a measured property, not an assumption.
        shellTitle: (scope?.querySelector(".rd-page-title")?.textContent ?? "").trim(),
        tags: tagsIn(scope),
        unbadged: rows.filter((row) => !row.querySelector("[data-rd-state-confidence]"))
          .length,
        view:
          scope
            ?.querySelector('[data-rd-view-option][aria-pressed="true"]')
            ?.getAttribute("data-rd-view-option") ?? null,
        viewHeading: (scope?.querySelector("[data-rd-view-title]")?.textContent ?? "").trim(),
        viewHeadingView:
          scope
            ?.querySelector("[data-rd-view-heading]")
            ?.getAttribute("data-rd-view-heading") ?? null,
      };
    });
  /** The page's own age vocabulary: the words have to be the age of the timestamp beside them. */
  const ageOf = ageWords;

  const snapshots = {};
  for (const view of ["topics", "people", "repositories", "progress"]) {
    await showView(view);
    snapshots[view] = await readGrammar();
  }

  // (0) §7 as amended by §13: the top bar carries a static dashboard brand, and every view names itself.
  // Read from the same traversal the rest of this section uses, so the heading cannot be true only on the
  // view the pass happens to open with, and the heading's own marker has to agree with the view it names.
  const VIEW_NAMES = {
    people: "People",
    progress: "Progress",
    repositories: "Repositories",
    topics: "Projects",
  };
  const unnamed = Object.entries(snapshots).filter(
    ([view, snap]) => snap.viewHeading !== VIEW_NAMES[view] || snap.viewHeadingView !== view
  );
  check(
    "every view names itself (§7), in all four views",
    unnamed.length === 0,
    unnamed.length === 0
      ? Object.entries(snapshots)
          .map(([view, snap]) => `${view} → ${JSON.stringify(snap.viewHeading)}`)
          .join(", ")
      : unnamed
          .map(
            ([view, snap]) =>
              `${view}: heading ${JSON.stringify(snap.viewHeading)} (marker ${snap.viewHeadingView})`
          )
          .join(" | ")
  );
  // §13 superseded §7's persistent "Research overview" heading: the brand is static text and reads the same
  // in every tab (it is not the view name). Asserted across the traversal so a per-view brand would fail.
  const brands = Object.entries(snapshots).map(([view, snap]) => ({ brand: snap.shellTitle, view }));
  const brandMismatch = brands.filter(
    (entry) => entry.brand.length === 0 || entry.brand !== brands[0].brand
  );
  check(
    "the top bar carries one static brand across every view (§7 as amended by §13)",
    brands.length > 0 && brandMismatch.length === 0,
    brandMismatch.length === 0
      ? `brand ${JSON.stringify(brands[0]?.brand)} constant across ${brands.length} views`
      : brandMismatch.map((entry) => `${entry.view}: ${JSON.stringify(entry.brand)}`).join(" | ")
  );

  // (1) The state claim always travels with its badge, wherever a state row is rendered.
  const badgedViews = ["topics", "people", "repositories"].filter(
    (view) => snapshots[view].rowCount > 0
  );
  check(
    "every state row in every view renders its claim through the one badge",
    badgedViews.length > 0 &&
      badgedViews.every((view) => snapshots[view].unbadged === 0),
    badgedViews
      .map(
        (view) =>
          `${view}: ${snapshots[view].rowCount} row(s), ${snapshots[view].unbadged} without a claim`
      )
      .join("; ") || "no view rendered a state row"
  );

  // (2) The age is the age of the timestamp it carries — the component's whole rule.
  const labels = Object.entries(snapshots).flatMap(([view, snap]) =>
    snap.recency.map((entry) => ({ ...entry, view }))
  );
  const wrongAges = labels.filter((entry) => !entry.text.endsWith(ageOf(entry.at)));
  const recencyViews = [
    ...new Set(labels.map((entry) => entry.view)),
  ].sort();
  if (labels.length === 0) {
    skip(
      "every recency label's words are the age of the timestamp it carries",
      "no view rendered a dated entity, so there is no recency label to check"
    );
  } else {
    check(
      "every recency label's words are the age of the timestamp it carries, in all four views",
      wrongAges.length === 0,
      `${labels.length} label(s) across ${recencyViews.join(", ")}; ` +
        (wrongAges.length === 0
          ? "each matches its own timestamp"
          : wrongAges
              .map(
                (entry) =>
                  `${entry.view} "${entry.at.slice(0, 10)}" shows "${entry.text}"`
              )
              .join("; "))
    );
  }

  // (3) A notice names which exceptional state it is, and a notice is never a navigation. The kinds a
  // dataset should render are derived from its own projection, so a dataset that has the state but no notice
  // fails, while a dataset that genuinely lacks the state skips with that reason rather than passing.
  const notices = Object.entries(snapshots).flatMap(([view, snap]) =>
    snap.notices.map((entry) => ({ ...entry, view }))
  );
  const badNotices = notices.filter(
    (entry) =>
      !["empty", "filtered", "truncated"].includes(entry.kind) || entry.tags > 0
  );
  const kindsShown = new Set(notices.map((entry) => entry.kind));
  const bareRepository = (overviewProjection?.repositories ?? []).find(
    (repository) =>
      (repository.topics ?? []).length === 0 && (repository.axes ?? []).length === 0
  );
  const wanted = [];
  if (bareRepository) wanted.push("empty");
  // C1 removed the truncation notice along with the card stack, so no subject can raise that state any
  // more: an axis is either in the current-work lane or inside the completed/abandoned fold, and both are
  // in the DOM. The probe that used to detect it is gone rather than left reporting an empty array.
  const missing = wanted.filter((kind) => !kindsShown.has(kind));
  if (wanted.length === 0) {
    skip(
      "an exceptional state says which one it is, and never navigates",
      "this dataset renders no exceptional-state subject (no bare repository), " +
        `${notices.length} notice(s) seen: ${[...kindsShown].join(", ") || "none"}`
    );
  } else {
    check(
      "an exceptional state says which one it is, and never navigates",
      badNotices.length === 0 && missing.length === 0,
      `${notices.length} notice(s) across the four views: ` +
        notices.map((entry) => `${entry.view}/${entry.kind}`).join(", ") +
        (missing.length === 0
          ? ` — every kind this dataset has a subject for is rendered (${wanted.join(", ")})`
          : ` — MISSING ${missing.join(", ")}`)
    );
  }

  // (4) The projects a view navigates to are the topics *its own projection* names — same ids, same names.
  const peopleProjection = overviewProjection?.people ?? [];
  // The People view has to be on screen to read *which* person's panel is showing: the snapshot above was
  // taken while it was, but the loop has since moved on, and a view that is not mounted has no DOM.
  await showView("people");
  const selectedPersonId = await page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    return (
      scope
        ?.querySelector('[data-rd-person][aria-pressed="true"]')
        ?.getAttribute("data-rd-person-id") ?? null
    );
  });
  const person = peopleProjection.find((entry) => entry.person.id === selectedPersonId) ?? null;
  if (person === null || person.topics.length === 0) {
    skip(
      "a person's project navigations are the topics their own rollup links them to",
      "no person with a topic link is on screen, so the lane has no project navigation to check"
    );
  } else {
    // V1a composition: a *bearing* project (one the person holds a workstream on) reads as a heading + an
    // Open-project action whose intro carries `data-rd-project-link`/`data-rd-project-name`; a
    // *project-only* affiliation reads as a compact topic tag. Both are project navigations, so coverage is
    // read from the navigation markers the lane renders — not from `data-rd-entity-tag`, which only the
    // affiliations carry any more and so could never cover a bearing project.
    const navigations = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const lane = scope?.querySelector("[data-rd-person-lane]");
      const bearing = [...(lane?.querySelectorAll("section[data-rd-involvement]") ?? [])].map(
        (node) => ({
          id: node.querySelector("[data-rd-project-link]")?.getAttribute("data-rd-project-link") ?? null,
          label:
            node.querySelector("[data-rd-project-name]")?.getAttribute("data-rd-project-name") ??
            (node.querySelector(".rd-project-heading")?.textContent ?? "").trim(),
        })
      );
      const affiliations = [
        ...(lane?.querySelectorAll('details[data-rd-person-affiliations] [data-rd-entity-tag="topic"]') ??
          []),
      ].map((node) => ({
        id: node.getAttribute("data-rd-entity-id"),
        label: node.getAttribute("data-rd-tag-label"),
      }));
      return [...bearing, ...affiliations];
    });
    const wanted = person.topics.map((involvement) => involvement.topic);
    const covered = wanted.every((topic) =>
      navigations.some((nav) => nav.id === topic.id && nav.label === topic.name)
    );
    const foreign = navigations.filter(
      (nav) => !wanted.some((topic) => topic.id === nav.id)
    );
    check(
      "a person's project navigations are the topics their own rollup links them to, ids and names alike",
      covered && foreign.length === 0,
      `${navigations.length} project navigation(s) covering ${wanted.length} link(s); ` +
        (foreign.length === 0
          ? "every navigation names a linked topic"
          : `foreign: ${foreign.map((nav) => nav.label).join(", ")}`)
    );
  }

  const repositoryProjection = overviewProjection?.repositories ?? [];
  // Choose the subject by PROPERTY and select it, rather than trusting whichever row the view happens to
  // show first: a repository with no topic link is a legitimate first row (the fixture's bare one), and a
  // check whose subject is absent must skip — never crash on a projection entry it cannot find.
  const repositoryWithTopics = repositoryProjection.find(
    (entry) => (entry.topics ?? []).length > 0
  );
  if (!repositoryWithTopics) {
    skip(
      "a repository's project navigations carry its rollup's direct links, ids and recorded relationships alike",
      "no repository in this dataset links a topic, so no panel has a project navigation to check"
    );
  } else {
    await showView("repositories");
    await root
      .locator(`[data-rd-repository="${repositoryWithTopics.repository.fullName}"]`)
      .click();
    await page.waitForTimeout(600);
    // V1b composition: the lane's work groups navigate their parent project through the intro's
    // `data-rd-project-link`, carrying the *recorded* relationship (`data-rd-project-relationship`) only
    // where the repository is filed directly under it; the rail's "Other project links" card navigates the
    // direct links no work group represents. Both are project navigations, so coverage is read from them —
    // not from `data-rd-entity-tag`, which only the consolidated rail subset carries any more. An axis's
    // parent project the repository is not filed under is a legitimate navigation with *no* relationship;
    // asserting one for it would be exactly the fabricated direct link this check must forbid.
    const navigations = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const panel = scope?.querySelector("[data-rd-repository-panel]");
      const navLink = (node) => ({
        id: node.getAttribute("data-rd-project-link"),
        relationship:
          node
            .querySelector("[data-rd-project-relationship]")
            ?.getAttribute("data-rd-project-relationship") ?? null,
      });
      const group = [
        ...(panel?.querySelectorAll("[data-rd-repository-lane] [data-rd-project-link]") ?? []),
      ].map(navLink);
      const rail = [
        ...(panel?.querySelectorAll("[data-rd-repository-topics] [data-rd-project-link]") ?? []),
      ].map(navLink);
      return { group, rail };
    });
    const navs = [...navigations.group, ...navigations.rail];
    const wanted = repositoryWithTopics.topics.map((link) => ({
      id: link.topic.id,
      relationship: link.relationship,
    }));
    const missing = wanted.filter((link) => !navs.some((nav) => nav.id === link.id));
    const wrongRelationship = wanted.filter((link) => {
      const nav = navs.find((entry) => entry.id === link.id);
      return !nav || nav.relationship !== link.relationship;
    });
    const fabricated = navs.filter(
      (nav) => !wanted.some((link) => link.id === nav.id) && nav.relationship !== null
    );
    check(
      "a repository's project navigations carry its rollup's direct links, ids and recorded relationships alike, and never fabricate one for an axis-parent project",
      missing.length === 0 && wrongRelationship.length === 0 && fabricated.length === 0,
      `${navigations.group.length} work-group link(s) + ${navigations.rail.length} rail link(s) for ${wanted.length} projected link(s) in ${repositoryWithTopics.repository.fullName}; ` +
        (missing.length === 0 && wrongRelationship.length === 0 && fabricated.length === 0
          ? "every direct link navigates with its recorded relationship, and no axis-parent project invents one"
          : `missing ${JSON.stringify(missing.map((link) => link.id))}, ` +
            `relationship mismatches ${JSON.stringify(wrongRelationship.map((link) => link.id))}, ` +
            `fabricated ${JSON.stringify(fabricated.map((nav) => nav.id))}`)
    );
  }

  // (5) A project navigation clicked in a view lands on that entity, selected, under the destination's own
  // name. In People the lane navigates a project two ways — a bearing group's Open-project action (its intro
  // carries `data-rd-project-link`/`data-rd-project-name`) or a project-only affiliation's compact topic tag
  // — and either is a real navigation, so the check exercises whichever the lane renders instead of skipping
  // because the tag form happens to be absent.
  await showView("people");
  const peopleNav = await page.evaluate(() => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const lane = scope?.querySelector("[data-rd-person-lane]");
    // Prefer the compact tag: it is the exact control the retired check clicked.
    const tag = lane?.querySelector('[data-rd-entity-tag="topic"][data-rd-entity-id]');
    if (tag) {
      return {
        id: tag.getAttribute("data-rd-entity-id"),
        label: tag.getAttribute("data-rd-tag-label"),
        via: "tag",
      };
    }
    const intro = lane?.querySelector("[data-rd-project-link]");
    const id = intro?.getAttribute("data-rd-project-link") ?? null;
    if (!id) return null;
    const group = intro?.closest("section[data-rd-involvement]");
    return {
      id,
      label:
        group?.querySelector("[data-rd-project-name]")?.getAttribute("data-rd-project-name") ??
        (group?.querySelector(".rd-project-heading")?.textContent ?? "").trim(),
      via: "group",
    };
  });
  if (peopleNav === null || peopleNav.id === null || !peopleNav.label) {
    skip(
      "a project navigation clicked in People lands in Topics with that topic open",
      "the selected person's lane renders no project navigation, so this view has no subject for it"
    );
  } else {
    const peopleNavKind =
      peopleNav.via === "tag" ? "a project-only topic tag" : "a bearing group's Open-project action";
    if (peopleNav.via === "tag") {
      await root
        .locator(`[data-rd-entity-tag="topic"][data-rd-entity-id="${peopleNav.id}"]`)
        .first()
        .click();
    } else {
      await root
        .locator(`[data-rd-project-link="${peopleNav.id}"] button`)
        .first()
        .click();
    }
    // The route switches view and selects asynchronously (entity target -> effect -> get_topic), so wait
    // on the completion condition rather than a sleep: on Topics, this topic's rail row pressed, its pane
    // up. No arbitrary delay, and nothing read until the page is actually where the navigation sent it.
    await page
      .waitForFunction(
        ([pluginId, label]) => {
          const scope = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
          const pane = scope?.querySelector('[data-rd-view="topics"] [data-rd-detail]');
          const pressed = scope?.querySelector('[data-rd-index-topic][aria-pressed="true"]');
          return (
            pane?.getAttribute("data-rd-detail") === label &&
            pressed?.getAttribute("data-rd-index-topic") === label
          );
        },
        [PLUGIN_ID, peopleNav.label],
        { polling: 50, timeout: 8000 }
      )
      .catch(() => {});
    const landed = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const pane = scope?.querySelector('[data-rd-view="topics"] [data-rd-detail]');
      return {
        // The pane's own name. `data-rd-topic` was the retired card's attribute, and reading it here
        // reported "opened none" for a topic that was open the whole time.
        name: pane?.getAttribute("data-rd-detail") ?? null,
        view:
          scope
            ?.querySelector('[data-rd-view-option][aria-pressed="true"]')
            ?.getAttribute("data-rd-view-option") ?? null,
      };
    });
    check(
      "a project navigation clicked in People lands in Topics with that topic open, under the same name",
      landed.view === "topics" && landed.name === peopleNav.label,
      `${peopleNavKind} — view ${landed.view ?? "none"}, opened "${landed.name ?? "none"}" (wanted "${
        peopleNav.label
      }")`
    );
  }

  await showView("repositories");
  // Selecting a view resets it to the projection's first row, and that row may be a repository that names no
  // axis (the fixture's bare one exists for exactly that case). Choose a repository that HAS axes — by
  // property, from the projection — then read its panel's tags.
  const repositoryWithAxes = repositoryProjection.find(
    (entry) => (entry.axes ?? []).length > 0
  );
  if (repositoryWithAxes) {
    await root
      .locator(`[data-rd-repository="${repositoryWithAxes.repository.fullName}"]`)
      .click();
    await page.waitForTimeout(500);
  }
  const repositoryAxisTag = (
    await readGrammar()
  ).tags.find((tag) => tag.type === "axis");
  if (repositoryAxisTag === undefined) {
    skip(
      "an axis tag clicked in Repositories lands in Progress/Axes with that axis selected",
      "no repository panel on screen names an axis, so this view has no subject for it"
    );
  } else {
    await root
      .locator(
        `[data-rd-entity-tag="axis"][data-rd-entity-id="${repositoryAxisTag.id}"]`
      )
      .first()
      .click();
    await page.waitForTimeout(400);
    // The Progress subview hooks (`data-rd-progress-index-mode` / `-subview`) were retired by the pivot; the
    // current Progress surface selects an axis on the detail container (`data-rd-progress-detail-axis`) and
    // marks its index row `aria-pressed`. Wait for that selection rather than a fixed sleep.
    await page
      .waitForFunction(
        (wanted) => {
          const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
          const detail = scope?.querySelector("[data-rd-progress-detail-axis]");
          return detail?.getAttribute("data-rd-progress-detail-axis") === wanted;
        },
        repositoryAxisTag.id,
        { polling: 50, timeout: 8000 }
      )
      .catch(() => {});
    const landed = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const detail = scope?.querySelector("[data-rd-progress-detail-axis]");
      const index = scope?.querySelector('[data-rd-progress-index="true"]');
      return {
        activeAxis: detail?.getAttribute("data-rd-progress-detail-axis") ?? null,
        indexActiveAxis:
          index
            ?.querySelector('[data-rd-index-axis][aria-pressed="true"]')
            ?.getAttribute("data-rd-index-axis") ?? null,
        view:
          scope
            ?.querySelector('[data-rd-view-option][aria-pressed="true"]')
            ?.getAttribute("data-rd-view-option") ?? null,
      };
    });
    check(
      "an axis tag clicked in Repositories lands in Progress/Axes with that axis selected",
      landed.view === "progress" && landed.activeAxis === repositoryAxisTag.id,
      `view ${landed.view ?? "none"}, detail axis ${landed.activeAxis?.slice(0, 8) ?? "none"}, ` +
        `index active ${landed.indexActiveAxis?.slice(0, 8) ?? "none"} (wanted ${repositoryAxisTag.id.slice(0, 8)})`
    );
  }

  await showView("topics");
  const topicRepositoryTag = (
    await readGrammar()
  ).tags.find((tag) => tag.type === "repository");
  if (topicRepositoryTag === undefined) {
    skip(
      "a repository tag clicked in Topics lands in Repositories with that repository selected",
      "no topic card names a repository, so the default view has no subject for it"
    );
  } else {
    await root
      .locator(
        `[data-rd-entity-tag="repository"][data-rd-entity-id="${topicRepositoryTag.id}"]`
      )
      .first()
      .click();
    await page.waitForTimeout(400);
    const landed = await page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      return {
        panel:
          scope
            ?.querySelector("[data-rd-repository-panel]")
            ?.getAttribute("data-rd-repository-panel") ?? null,
        view:
          scope
            ?.querySelector('[data-rd-view-option][aria-pressed="true"]')
            ?.getAttribute("data-rd-view-option") ?? null,
      };
    });
    check(
      "a repository tag clicked in Topics lands in Repositories with that repository selected",
      landed.view === "repositories" && landed.panel === topicRepositoryTag.label,
      `view ${landed.view ?? "none"}, panel "${landed.panel ?? "none"}" (wanted "${
        topicRepositoryTag.label
      }")`
    );
  }

  // (6) The whole traversal wrote nothing, and left the projection byte-identical.
  const grammarAfter = JSON.stringify(await apiProgress(windowDaysNow));
  const grammarWritesAfter = grammarWrites();
  check(
    "the grammar traversal wrote nothing: no write action, and the projection is unchanged",
    grammarWritesAfter === grammarBaseline.writes &&
      grammarAfter === grammarBaseline.payload,
    `writes ${grammarBaseline.writes} -> ${grammarWritesAfter}; payload ${
      grammarAfter === grammarBaseline.payload ? "identical" : "CHANGED"
    }`
  );

  // Put the Activity column back to the window the page opens with: the traversal above expanded it to reach
  // a tag the U9 cap was holding back, and the density checks further down measure the default window.
  {
    const cap = root.locator("[data-rd-progress-feed-more]").first();
    const expanded = await page.evaluate(() => {
      const column = document.querySelector('div[data-plugin-id="research-dashboard"] [data-rd-progress-feed]');
      return (
        column !== null &&
        column.getAttribute("data-rd-progress-feed") ===
          column.getAttribute("data-rd-progress-feed-shown")
      );
    });
    if (expanded && (await cap.count()) > 0) {
      await cap.locator("button").first().click();
      await page.waitForTimeout(300);
    }
  }

  // Leave the page where the pass found it — the default view is what the final screenshot shows.
  await showView("topics");
}

// ------------------------ C5: the Repositories view — the index row, the dominant lane, the bounded rail
// The convergence this section measures is a *composition* claim, so every check reads the page against the
// projection rather than against the prototype's prose: the row's age is the row's own timestamp, the row's
// second line is the rollup's own counts, the lane is the rollup's own current/terminal partition, the rail's
// window is the page's stated lead (`RAIL_ACTIVITY_LEAD`, re-declared here so the page cannot widen its own
// window into correctness), and the people card is derived from the people rollup or absent. Two things the
// prototype shows are deliberately NOT here, and both are asserted as absent-with-a-marker: a repository-level
// Notes card (the rollup carries no such note) and a `Stale` tag (the store's `stale` is a recency rule the
// repository rollup does not carry — inventing a second definition of one word is worse than the absence).
//
// The click discipline is the one the topic rail's block learned: assert the control exists BEFORE clicking
// it, because clicking a control that is not rendered aborts the whole pass on a 30s locator timeout, and an
// aborted run is a lost record rather than a verdict.
{
  // The pass's read set, mirrored: a read is not a write, and the point of one check below is that this view
  // is composition only.
  const C5_READS = new Set([
    "get_overview",
    "get_progress",
    "get_topic",
    "list_activity",
    "list_topics",
  ]);
  const c5Writes = () => actionCalls.filter((call) => !C5_READS.has(call.key)).length;
  const TERMINAL = new Set(["completed", "abandoned"]);
  const c5Current = (entry) => (entry.axes ?? []).filter((axis) => !TERMINAL.has(axis.state));
  const c5Terminal = (entry) => (entry.axes ?? []).filter((axis) => TERMINAL.has(axis.state));
  const c5Count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // The row's second line, as the page writes it, from the projection's own numbers. The wording mirrors
  // `supportsLine` in `src/ui.tsx` exactly: the workstream half states the repository's own total (the same
  // total the panel header carries), and the projects half counts the rollup's *direct* topic links — a
  // project an axis names without the repository being filed under it is navigable but is not a direct link.
  const c5SupportsLine = (entry) => {
    const workstreams =
      (entry.axes ?? []).length === 0
        ? "no workstreams"
        : c5Count((entry.axes ?? []).length, "workstream", "workstreams");
    const topics =
      (entry.topics ?? []).length === 0
        ? "no direct project link"
        : `supports ${c5Count((entry.topics ?? []).length, "project", "projects")}`;
    return `${topics} · ${workstreams}`;
  };

  const c5ShowRepositories = async () => {
    await root.locator('[data-rd-view-option="repositories"]').click();
    await page.waitForTimeout(350);
  };
  const c5Select = async (fullName) => {
    await root.locator(`[data-rd-repository="${fullName}"]`).click();
    await page.waitForTimeout(500);
  };
  const readC5 = () =>
    page.evaluate(() => {
      const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
      const pane = scope?.querySelector('[data-rd-view="repositories"]');
      const index = pane?.querySelector("[data-rd-repositories]");
      const panel = pane?.querySelector("[data-rd-repository-panel]");
      const lane = panel?.querySelector("[data-rd-repository-lane]");
      const rail = panel?.querySelector(".rd-side-stack");
      const fold = lane?.querySelector("[data-rd-repository-folded]");
      const supports = panel?.querySelector("[data-rd-repository-topics]");
      const people = panel?.querySelector("[data-rd-repository-people]");
      const activity = panel?.querySelector("[data-rd-repository-activity]");
      // A project navigation: `data-rd-project-link` marks it with the project's id, and its recorded
      // relationship rides on `data-rd-project-relationship`. Groups carry it in the lane; direct links
      // carry it in the rail. Reading both is how the check stays a coverage claim after consolidation.
      const navLink = (node) => ({
        id: node.getAttribute("data-rd-project-link"),
        relationship:
          node
            .querySelector("[data-rd-project-relationship]")
            ?.getAttribute("data-rd-project-relationship") ?? null,
      });
      const tagsIn = (node) =>
        [...(node?.querySelectorAll("[data-rd-entity-tag]") ?? [])].map((n) => ({
          id: n.getAttribute("data-rd-entity-id"),
          label: n.getAttribute("data-rd-tag-label"),
          type: n.getAttribute("data-rd-entity-tag"),
        }));
      const axisRows = (node) =>
        [...(node?.querySelectorAll("[data-rd-work-card]") ?? [])].map((n) => ({
          state: n.getAttribute("data-rd-state"),
          title: (n.querySelector(".rd-work-link")?.textContent ?? "").trim(),
        }));
      // The lane's OWN rows: everything it holds that the fold does not. This is what makes "the lane holds
      // the current axes" a check rather than a guess about which list a row came from.
      const foldedTitles = new Set(
        [...(fold?.querySelectorAll("[data-rd-work-card]") ?? [])].map((n) =>
          (n.querySelector(".rd-work-link")?.textContent ?? "").trim()
        )
      );
      const inLane = axisRows(lane).filter((row) => !foldedTitles.has(row.title));
      const box = (node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      };
      return {
        activity: {
          // The repository rail is a backend-paged list (PagedActivityFeed, `list_activity` offset/pageSize):
          // its own `<ul data-rd-activity-shown data-rd-repository-activity>` states the page's row count and
          // the payload's own total; the pager (`.rd-pager`) states the range and offers the next page.
          hasMore: (panel?.querySelectorAll(".rd-pager button").length ?? 0) > 0,
          note: (panel?.querySelector("[data-rd-pager-range]")?.textContent ?? "").trim(),
          rows: [...(activity?.querySelectorAll("[data-rd-activity-event]") ?? [])].map((n) => ({
            date: n.querySelector("[data-rd-event-date]")?.getAttribute("data-rd-event-date") ?? null,
            summary: (n.querySelector(".rd-strong")?.textContent ?? "").trim(),
          })),
          shown: Number(activity?.getAttribute("data-rd-activity-shown") ?? -1),
          total: Number(activity?.getAttribute("data-rd-repository-activity") ?? -1),
        },
        axesAttributes: [...(panel?.querySelectorAll("[data-rd-repository-axes]") ?? [])].map((n) =>
          Number(n.getAttribute("data-rd-repository-axes"))
        ),
        fold: fold
          ? {
              count: Number(fold.getAttribute("data-rd-repository-folded") ?? -1),
              rows: axisRows(fold),
              summary: (fold.querySelector("summary")?.textContent ?? "").trim(),
            }
          : null,
        hint: (
          pane?.querySelector('[data-rd-view-heading="repositories"] .rd-meta')?.textContent ?? ""
        ).trim(),
        lane: {
          box: box(lane),
          count: Number(lane?.getAttribute("data-rd-repository-current") ?? -1),
          rows: inLane,
        },
        // Every project navigation inside the lane (each work group's heading/Open-project action, in both
        // the lane and the fold). Each carries its own id and recorded relationship.
        groupLinks: [...(lane?.querySelectorAll("[data-rd-project-link]") ?? [])].map(navLink),
        notesOmitted: panel?.querySelector("[data-rd-repository-notes-omitted]") !== null,
        panelName: panel?.getAttribute("data-rd-repository-panel") ?? null,
        people: people
          ? {
              count: Number(people.getAttribute("data-rd-repository-people") ?? -1),
              partial: (people.querySelector("[data-rd-notice]")?.textContent ?? "").trim(),
              tags: tagsIn(people),
            }
          : null,
        railBox: box(rail),
        rows: [...(index?.querySelectorAll("[data-rd-repository]") ?? [])].map((row) => ({
          id: row.getAttribute("data-rd-repository-id"),
          // The row's own second line, by its own handle: the age label is a `.rd-meta` too, and reading
          // "the first .rd-meta in the row" read the age as if it were the counts.
          meta: (
            row.querySelector("[data-rd-repository-line]")?.textContent ?? ""
          ).trim(),
          name: row.getAttribute("data-rd-repository"),
          pressed: row.getAttribute("aria-pressed") === "true",
          recency: row.querySelector("[data-rd-recency]")?.getAttribute("data-rd-recency") ?? null,
          recencyText: (row.querySelector("[data-rd-recency]")?.textContent ?? "").trim(),
        })),
        sideTitles: [...(panel?.querySelectorAll(".rd-side-title") ?? [])].map((n) =>
          (n.textContent ?? "").trim()
        ),
        supports: {
          count: Number(supports?.getAttribute("data-rd-repository-topics") ?? -1),
          inRail: rail?.contains(supports) ?? false,
          // The rail's direct project links — the ones no work group represents (the consolidated subset).
          links: [...(supports?.querySelectorAll("[data-rd-project-link]") ?? [])].map(navLink),
          tags: tagsIn(supports),
        },
      };
    });

  const c5Overview = await apiAction("get_overview", { activitySinceDays: windowDaysNow });
  const c5Repositories = c5Overview?.repositories ?? [];
  const c5People = c5Overview?.people ?? [];
  const c5PeopleTruncated = c5Overview?.peopleTruncated === true;
  await c5ShowRepositories();

  // (1) The index row: the projection's own order, its own timestamp, its own counts.
  const indexRead = await readC5();
  const orderMismatch = indexRead.rows.findIndex(
    (row, i) =>
      row.name !== c5Repositories[i]?.repository.fullName ||
      row.id !== c5Repositories[i]?.repository.id
  );
  check(
    "the repositories index lists the projection's repositories, in the projection's own order",
    indexRead.rows.length === c5Repositories.length && orderMismatch === -1,
    `${indexRead.rows.length} row(s) for ${c5Repositories.length} repository(ies)` +
      (orderMismatch === -1 ? "" : `; first difference at row ${orderMismatch}`)
  );
  const repoNames = indexRead.rows.map((row) => row.name);
  const repoNamesSorted = [...repoNames].sort((a, b) => a.localeCompare(b));
  check(
    "the repositories index is ordered by name, not by recency",
    repoNames.length > 0 && JSON.stringify(repoNames) === JSON.stringify(repoNamesSorted),
    `order ${JSON.stringify(repoNames)} — name-sorted ${JSON.stringify(repoNamesSorted)}`
  );
  const datedRows = c5Repositories.filter((entry) => entry.lastActivityAt !== null).length;
  const ageMismatch = indexRead.rows.filter((row, i) => {
    const entry = c5Repositories[i];
    if (!entry) return false;
    return entry.lastActivityAt === null
      ? row.recency !== null || row.recencyText !== "never"
      : row.recency !== entry.lastActivityAt;
  });
  check(
    "every repository row states the age of its own last activity, from its own timestamp",
    ageMismatch.length === 0,
    ageMismatch.length === 0
      ? `${datedRows} dated row(s), ${indexRead.rows.length - datedRows} said "never"`
      : `${ageMismatch.length} row(s) disagree with the projection: ${ageMismatch
          .slice(0, 2)
          .map((row) => `${row.name} "${row.recency ?? row.recencyText}"`)
          .join(", ")}`
  );
  // V1/A4 moved the row's age onto this same line (the shared index-row grammar: title on its own line,
  // then the quiet counts and the age). The counts half is still the rollup's own; the age half is the age of
  // the row's own timestamp, verified separately just above. So the expected line is both halves together.
  const c5LineFor = (entry) =>
    `${c5SupportsLine(entry)} · ${
      entry?.lastActivityAt ? ageWords(entry.lastActivityAt) : "never"
    }`;
  const lineMismatch = indexRead.rows
    .map((row, i) => ({ expected: c5LineFor(c5Repositories[i] ?? {}), row }))
    .filter((entry) => entry.expected !== entry.row.meta);
  check(
    "every repository row's second line is the rollup's own workstream total and its direct project links",
    lineMismatch.length === 0,
    lineMismatch.length === 0
      ? indexRead.rows.map((row) => row.meta).join(" | ")
      : `${lineMismatch[0].row.name}: "${lineMismatch[0].row.meta}" — wanted "${lineMismatch[0].expected}"`
  );
  // The zero-case branch is only visible where the dataset has a repository with no direct project link and
  // no nonterminal axis — the fixture's bare repository exists for exactly this. Reported with its reason,
  // never silently passed.
  const quietRepository = c5Repositories.find(
    (entry) => c5Current(entry).length === 0 && (entry.topics ?? []).length === 0
  );
  if (!quietRepository) {
    skip(
      "a repository with no direct project link states its own workstream total, even when only stopped work remains",
      "this dataset has no repository with neither a topic link nor a nonterminal axis"
    );
  } else {
    const quietRow = indexRead.rows.find((row) => row.id === quietRepository.repository.id);
    check(
      "a repository with no direct project link states its own workstream total, even when only stopped work remains",
      quietRow?.meta === c5LineFor(quietRepository),
      `${quietRepository.repository.fullName}: "${quietRow?.meta ?? "no row"}"`
    );
  }

  // (2) The dominant lane: current work beside a rail, holding the rollup's own current axes.
  const laneSubject =
    [...c5Repositories]
      .filter((entry) => c5Current(entry).length > 0)
      .sort((a, b) => (b.axes ?? []).length - (a.axes ?? []).length)[0] ?? null;
  if (!laneSubject) {
    skip(
      "the repository's current work is the dominant lane: wider than the rail, beside it, not stacked under it",
      "no repository in this dataset has a current axis, so there is no lane to measure"
    );
  } else {
    await c5Select(laneSubject.repository.fullName);
    const laneRead = await readC5();
    const wantsCurrent = c5Current(laneSubject)
      .map((axis) => axis.title)
      .sort();
    const laneTitles = laneRead.lane.rows.map((row) => row.title).sort();
    const terminalInLane = laneRead.lane.rows.filter((row) => TERMINAL.has(row.state));
    check(
      "the repository's current work is the dominant lane: at least 1.25x the rail, beside it, not stacked under it",
      laneRead.lane.box !== null &&
        laneRead.railBox !== null &&
        laneRead.lane.box.width >= laneRead.railBox.width * 1.25 &&
        laneRead.lane.box.left < laneRead.railBox.left &&
        Math.abs(laneRead.lane.box.top - laneRead.railBox.top) < 40,
      laneRead.lane.box && laneRead.railBox
        ? `lane ${Math.round(laneRead.lane.box.width)}px at x=${Math.round(
            laneRead.lane.box.left
          )}, rail ${Math.round(laneRead.railBox.width)}px at x=${Math.round(
            laneRead.railBox.left
          )} (${(laneRead.lane.box.width / laneRead.railBox.width).toFixed(2)}x), tops ${Math.round(
            laneRead.lane.box.top
          )}/${Math.round(laneRead.railBox.top)}`
        : "lane or rail missing from the panel"
    );
    check(
      "the lane holds exactly the rollup's current axes, states that count, and holds no stopped work",
      laneRead.lane.count === wantsCurrent.length &&
        laneTitles.length === wantsCurrent.length &&
        laneTitles.every((title, i) => title === wantsCurrent[i]) &&
        terminalInLane.length === 0,
      `lane states ${laneRead.lane.count}, holds ${laneTitles.length} ` +
        `(${laneTitles.join(", ")}) — projection's current: ${wantsCurrent.join(", ")}` +
        (terminalInLane.length === 0
          ? ""
          : `; terminal states in the lane: ${terminalInLane.map((row) => row.state).join(", ")}`)
    );
    const wantsFolded = c5Terminal(laneSubject)
      .map((axis) => axis.title)
      .sort();
    if (wantsFolded.length === 0) {
      check(
        "a repository with no stopped work renders no fold, rather than an empty disclosure",
        laneRead.fold === null,
        laneRead.fold === null
          ? "no fold, as the projection implies"
          : `fold present with ${laneRead.fold.count} row(s)`
      );
    } else {
      const shownFolded = (laneRead.fold?.rows ?? []).map((row) => row.title).sort();
      check(
        "stopped work is folded with its own count, and the fold holds exactly the rollup's terminal axes",
        laneRead.fold !== null &&
          laneRead.fold.count === wantsFolded.length &&
          shownFolded.length === wantsFolded.length &&
          shownFolded.every((title, i) => title === wantsFolded[i]) &&
          laneRead.fold.summary.includes(String(wantsFolded.length)),
        laneRead.fold
          ? `fold states ${laneRead.fold.count}, holds ${shownFolded.length} (${shownFolded.join(
              ", "
            )}) — summary ${JSON.stringify(laneRead.fold.summary)}`
          : `no fold, but the projection has ${wantsFolded.length} terminal axis(es)`
      );
      // The fold is a disclosure of the split, not a place where work goes missing: the payload's own total
      // still has to be on the page.
      check(
        "the split does not lose the repository's own axis count",
        laneRead.axesAttributes.includes((laneSubject.axes ?? []).length),
        `counts on the page ${JSON.stringify(laneRead.axesAttributes)}, projection ${
          (laneSubject.axes ?? []).length
        }`
      );
    }
    // Consolidation: a project a work group already names and navigates is not repeated as a rail link, so
    // the rail holds only the *direct* links no group represents. The claim is therefore coverage without
    // duplication across both surfaces: every topic link the rollup records is navigated exactly once — as
    // a work-group link in the lane or a rail link — and carries the relationship the projection records.
    // Reading `data-rd-project-link` in the lane (groups) plus in the rail (direct links) is what makes the
    // assertion hold after consolidation rather than shrink to the rail subset.
    const projectedLinks = (laneSubject.topics ?? []).map((link) => ({
      id: link.topic.id,
      relationship: link.relationship,
    }));
    const navLinks = [...laneRead.groupLinks, ...laneRead.supports.links];
    const navIds = navLinks.map((link) => link.id);
    const missingLinks = projectedLinks.filter((link) => !navIds.includes(link.id));
    const duplicateNav = navIds.filter((id, index) => navIds.indexOf(id) !== index);
    const wrongRelationship = projectedLinks.filter((link) => {
      const nav = navLinks.find((entry) => entry.id === link.id);
      return !nav || nav.relationship !== link.relationship;
    });
    check(
      "every topic link the rollup records is navigated exactly once — as a work-group link or a rail link — with its recorded relationship",
      missingLinks.length === 0 &&
        duplicateNav.length === 0 &&
        wrongRelationship.length === 0 &&
        (laneRead.supports.links.length === 0 || laneRead.supports.inRail),
      `${laneRead.groupLinks.length} work-group link(s) + ${laneRead.supports.links.length} rail link(s) ` +
        `for ${projectedLinks.length} projected link(s); missing ${JSON.stringify(
          missingLinks.map((link) => link.id)
        )}, duplicated ${JSON.stringify(duplicateNav)}, relationship mismatches ${JSON.stringify(
          wrongRelationship.map((link) => link.id)
        )}; supports.count ${laneRead.supports.count}, ${
          laneRead.supports.inRail ? "rail in place" : "no rail card"
        }`
    );
    // D5: the people card is *derived* from the people rollup's axes, or it is absent — never a
    // prototype-shaped empty card, and never a person this rollup does not link here.
    const wantedPeople = c5People
      .filter((entry) =>
        (entry.axes ?? []).some((axis) =>
          (axis.repositories ?? []).some((link) => link.id === laneSubject.repository.id)
        )
      )
      .map((entry) => entry.person);
    const peopleTags = (laneRead.people?.tags ?? []).filter((tag) => tag.type === "person");
    const peopleCondition =
      wantedPeople.length > 0
        ? laneRead.people !== null &&
          peopleTags.length === wantedPeople.length &&
          wantedPeople.every((person) =>
            peopleTags.some((tag) => tag.id === person.id && tag.label === person.displayName)
          )
        : // Nothing links this repository: the card collapses. Unless the people rollup is truncated, in
          // which case a labelled partial card is the honest rendering (D5) and absence is also allowed.
          laneRead.people === null ||
          (c5PeopleTruncated && (laneRead.people.partial ?? "").length > 0);
    check(
      "the people shown on a repository are derived from the people rollup's axes, and only those",
      peopleCondition,
      wantedPeople.length > 0
        ? `${peopleTags.length} tag(s) for ${wantedPeople.length} derived person(s): ${peopleTags
            .map((tag) => tag.label)
            .join(", ")}`
        : laneRead.people === null
          ? "no person links this repository, and no People card is rendered"
          : `no person links this repository, but a People card is rendered with ${
              peopleTags.length
            } tag(s)${c5PeopleTruncated ? ` (people rollup truncated; says "${laneRead.people.partial}")` : ""}`
    );
    check(
      "the prototype's Notes card is omitted, and the omission is marked rather than left silent",
      laneRead.notesOmitted && !laneRead.sideTitles.includes("Notes"),
      `marker ${laneRead.notesOmitted ? "present" : "MISSING"}; rail titles: ${laneRead.sideTitles.join(
        ", "
      )}`
    );
  }

  // (3) The rail is a backend-paged window: the page's own rows and the payload's own total are stated, the
  // page is newest-first, and any remainder is one pager request away. The old in-memory lead slice + "Show
  // all N" reveal was replaced by this paging (README: PagedActivityFeed), so the assertions follow the page.
  const railSubject =
    [...c5Repositories]
      .filter((entry) => (entry.recentActivity ?? []).length > 0)
      .sort((a, b) => b.recentActivity.length - a.recentActivity.length)[0] ?? null;
  if (!railSubject) {
    skip(
      "the repository rail lists the newest activity and states how many of how many",
      "no repository in this dataset has events in the window"
    );
  } else {
    await c5Select(railSubject.repository.fullName);
    const railBefore = (await readC5()).activity;
    check(
      "the repository rail lists the newest activity and states how many of how many",
      railBefore.total >= railBefore.shown &&
        railBefore.shown > 0 &&
        railBefore.rows.length === railBefore.shown &&
        railBefore.rows.every((row, i) => row.date === railSubject.recentActivity[i]?.occurredAt),
      `total ${railBefore.total}/${railSubject.recentActivity.length}, shown ${railBefore.shown}, ` +
        `${railBefore.rows.length} row(s) on screen, range ${JSON.stringify(railBefore.note)}`
    );
    // The rest, if any, is one page away. The control is asserted before it is clicked.
    const moreControl = root.locator('[data-rd-repository-panel] .rd-pager button', { hasText: /^Next$/ });
    const writesBeforeExpand = c5Writes();
    if (railBefore.shown >= railBefore.total || (await moreControl.count()) === 0) {
      skip(
        "the rail's remainder is one page away, and paging changes only what is shown",
        `the whole activity (${railBefore.total}) fits one page (${railBefore.shown}) — there is no remainder`
      );
      skip(
        "paging the rail's window is composition only — no write action fires",
        "there was no page control, so there is nothing to page"
      );
    } else {
      await moreControl.first().click();
      await page.waitForTimeout(900);
      const railAll = (await readC5()).activity;
      check(
        "the rail's remainder is one page away, and paging changes only what is shown",
        railAll.total === railBefore.total &&
          railAll.rows.length > 0 &&
          railAll.rows[0]?.date !== railBefore.rows[0]?.date &&
          c5Writes() === writesBeforeExpand,
        `page 1 first row ${JSON.stringify(railBefore.rows[0]?.date)} -> page 2 first row ${JSON.stringify(railAll.rows[0]?.date)} (total ${railAll.total}); non-read action calls ${writesBeforeExpand} -> ${c5Writes()}`
      );
      skip(
        "paging the rail's window is composition only — no write action fires",
        "the no-write property is asserted inside the paging check above (the page request is a list_activity read)"
      );
    }
  }
  const quietRail = c5Repositories.find((entry) => {
    const events = (entry.recentActivity ?? []).length;
    return events > 0 && events <= RAIL_ACTIVITY_LEAD;
  });
  if (!quietRail) {
    skip(
      "a repository whose whole activity fits the lead states no remainder",
      `every repository here has either no events or more than ${RAIL_ACTIVITY_LEAD}, so the case is absent`
    );
  } else {
    await c5Select(quietRail.repository.fullName);
    const quietRead = (await readC5()).activity;
    check(
      "a repository whose whole activity fits the lead states no remainder",
      quietRead.hasMore === false &&
        quietRead.shown === quietRead.total &&
        quietRead.total === quietRail.recentActivity.length,
      `${quietRead.shown} of ${quietRead.total} shown, page buttons ${quietRead.hasMore}, range ${JSON.stringify(quietRead.note)}`
    );
  }

  // Leave the pass where the C9 traversal left it: the default view is what the final screenshot shows.
  await root.locator('[data-rd-view-option="topics"]').click();
  await page.waitForTimeout(350);
}

const screenshot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}.png`;
// An element shot rather than `fullPage`: the host scrolls the plugin page inside its own container,
// so a document-level screenshot captures whichever slice is scrolled into view and silently drops
// the header. Capturing the plugin root always yields the whole page, top first.
await root.evaluate((node) => node.scrollIntoView({ block: "start" }));
await page.waitForTimeout(400);
await root.screenshot({ path: screenshot });
console.log("screenshot:", shotLabel(screenshot));
console.log(
  "console issues after login:",
  JSON.stringify(
    consoleIssues
      .filter(
        (issue) =>
          !issue.includes("unsupported MIME type") &&
          !issue.includes("Service worker registration")
      )
      .slice(0, 8)
  )
);

await browser.close();
console.log(
  `\n${WRITE ? "write" : "read"} pass: ${problems.length === 0 ? "all checks passed" : `${problems.length} FAILED`}` +
    `; ${skipped.length} skipped for want of a subject in this corpus`
);
if (skipped.length > 0) {
  console.log("skipped (each with its reason):");
  for (const entry of skipped) {
    console.log(`  - ${entry}`);
  }
}
if (problems.length > 0) {
  console.error(`failed checks: ${problems.join("; ")}`);
  process.exit(1);
}
