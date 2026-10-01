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

// playwright-core is a devDependency of this repo, so `bun install` makes the bare specifier
// resolve; PLAYWRIGHT_CORE can point at any other install instead.
const playwrightCore = process.env.PLAYWRIGHT_CORE ?? "playwright-core";
const { chromium } = await import(playwrightCore);

const DASHBOARD = process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:3003";
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
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

const problems = [];
const skipped = [];
const check = (description, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}${detail ? ` — ${detail}` : ""}`);
  if (!condition) {
    problems.push(description);
  }
};
// A check whose *subject* this corpus does not have is reported, never passed. A silently-skipped
// check that prints PASS is how a harness stops meaning anything: the demo corpus used to carry a
// blocked axis, an unmapped person and a card that hid axes, and this corpus carries none of them.
const skip = (description, reason) => {
  console.log(`SKIP  ${description} — ${reason}`);
  skipped.push(`${description} — ${reason}`);
};

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: VIEWPORT });
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
  actionCalls.push({ input, key: match[1] });
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
  let body = "";
  try {
    body = (await response.text()).slice(0, 300);
  } catch {
    body = "<unreadable>";
  }
  actionResponses.push({ body, key: match[1], status: response.status() });
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

// ------------------------------------------------------------------ read the corpus from the API
// The checks below used to name the demo fixtures outright ("Signal Processing", "Researcher A",
// "group/signal-pipeline"), which made the harness a snapshot of one dataset: swapping the corpus
// broke it, and it could no longer answer whether the page works. The fixtures now come from the
// payload the page itself reads, so the harness holds for any corpus. What a given corpus cannot
// exercise is printed as SKIP with the reason — never as a pass.
const CORPUS = await page.evaluate(
  async ([pluginId, days]) => {
    const cookie = (name) =>
      document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? "";
    const orgs = await fetch("/v1/auth/orgs", { credentials: "include" }).then((r) => r.json());
    const orgId = orgs.orgs?.[0]?.id ?? "";
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
        name: person.person.displayName,
        recent: person.recentActivity.length,
        topics: person.topics.length,
      })),
      repositories: all.repositories.map((repo) => ({
        axes: repo.axes.map((axis) => axis.title),
        fullName: repo.repository.fullName,
      })),
      timeline: all.timeline.map((group) => ({
        axes: group.axes.map((axis) => axis.axis.title),
        topic: group.topic.name,
      })),
      topicAxes: all.topics.map((entry) => ({
        axes: entry.axes.map((axis) => axis.title),
        blockedAxes: entry.axes.filter((axis) => axis.state === "blocked").map((axis) => axis.title),
        hidden: Math.max(0, entry.axes.length - 3), // LEAD_AXES in the page
        topic: entry.topic.name,
      })),
      topic: topic?.topic?.name ?? "",
      topicNames: all.topics.map((entry) => entry.topic.name),
    };
  },
  [PLUGIN_ID, 14]
);
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

const render = await page.evaluate((pluginId) => {
  const node = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
  const text = (node?.innerText ?? "").replace(/\s+/g, " ");
  return {
    heading: text.includes("Research overview"),
    mounted: Boolean(node),
    text,
  };
}, PLUGIN_ID);
check("plugin page mounted", render.mounted);
check("overview renders as the default screen", render.heading);

// ------------------------------------------------------------------ C4: the overview shell
const overviewCalls = callsFor("get_overview");
check(
  "the overview renders from one get_overview call",
  overviewCalls.length === 1,
  `saw ${overviewCalls.length}: ${JSON.stringify(overviewCalls.map((c) => c.input))}`
);
check(
  "a get_overview call reads other plugin actions for nothing else on first paint",
  callsFor("list_topics").length === 0,
  `list_topics calls: ${callsFor("list_topics").length}`
);

const overviewInput = overviewCalls[0]?.input ?? {};
check(
  "the default window is 14 days and is sent as a query parameter",
  JSON.stringify(overviewInput) === JSON.stringify({ activitySinceDays: 14 }),
  JSON.stringify(overviewInput)
);

const cards = await page.evaluate((pluginId) => {
  const nodes = document.querySelectorAll(
    `div[data-plugin-id="${pluginId}"] [data-rd-topic]`
  );
  return [...nodes].map((node) => ({
    blocked: node.getAttribute("data-rd-blocked"),
    borderLeft: getComputedStyle(node).borderLeftWidth,
    borderColor: getComputedStyle(node).borderLeftColor,
    name: node.getAttribute("data-rd-topic"),
    text: (node.innerText ?? "").replace(/\s+/g, " "),
  }));
}, PLUGIN_ID);
check("topic cards rendered", cards.length > 0, `${cards.length} cards`);

const header = await page.evaluate((pluginId) => {
  const node = document.querySelector(`div[data-plugin-id="${pluginId}"]`);
  const text = (node?.innerText ?? "").replace(/\s+/g, " ");
  return {
    addTopic: text.includes("Add topic"),
    archivedToggle: text.includes("archived"),
    countsLine: /\d+ topics? · \d+ axes · \d+ (?:person|people) · \d+ repositor(?:y|ies)/.test(text),
    headerText: text.slice(0, 200),
    windowButtons: node?.querySelectorAll("[data-rd-window]").length ?? 0,
  };
}, PLUGIN_ID);
check(
  "the header carries the title, window control, archived toggle and count line",
  header.windowButtons === 4 &&
    header.addTopic &&
    header.archivedToggle &&
    header.countsLine,
  JSON.stringify(header)
);
// …and the count line reads as English in the singular too: "1 repository", never "1 repositories".
const oneRepo = header.headerText.match(/\d+ repositor(?:y|ies)/)?.[0] ?? "";
check(
  "the count line reads correctly when the count is one",
  !oneRepo.startsWith("1 ") || oneRepo === "1 repository",
  oneRepo
);

// Axes are grouped under their topic: each card carries the axes it leads with, and none of another
// topic's. Both halves are read off the payload, so the check holds for one topic or twenty.
const cardIssues = [];
for (const entry of CORPUS.topicAxes) {
  const card = cards.find((candidate) => candidate.name === entry.topic);
  if (!card) {
    cardIssues.push(`${entry.topic}: no card`);
    continue;
  }
  for (const title of entry.axes.slice(0, 3)) {
    if (!card.text.includes(title)) {
      cardIssues.push(`${entry.topic}: own axis missing (${title})`);
    }
  }
  for (const other of CORPUS.topicAxes) {
    if (other.topic === entry.topic) {
      continue;
    }
    for (const title of other.axes) {
      if (card.text.includes(title)) {
        cardIssues.push(`${entry.topic}: leaked (${title})`);
      }
    }
  }
}
check(
  "every topic in the payload has one card, carrying its own axes and none of another topic's",
  cards.length === CORPUS.topicNames.length && cardIssues.length === 0,
  `${cards.length} cards for ${CORPUS.topicNames.length} topics; ${cardIssues.length ? cardIssues.join("; ") : "no leaks"}`
);

const firstCard = cards.find((card) => card.name === CORPUS.topic);
const firstPerson = CORPUS.people[0];
const statePhrases = Object.entries(CORPUS.axisCounts)
  .filter(([, count]) => count > 0)
  .map(([state, count]) => `${count} ${state}`);
// The card that carries this person, which is not necessarily the first card: with more than one topic
// the payload's first person and the first card are different subjects, and assuming they overlap
// fails a dataset whose people sit on different topics. The count clause is pattern-based for the same
// reason — per-topic counts differ from whole-payload counts once there is more than one topic.
const peopleCard = cards.find((card) => card.text.includes(firstPerson?.name ?? "\u0000"));
const countPattern = /\b\d+\s+(?:active|draft|blocked|parked|completed|abandoned)\b/;
check(
  "a topic card leads with people and its state counts",
  firstPerson !== undefined &&
    Boolean(peopleCard?.text.includes(firstPerson.name)) &&
    countPattern.test(peopleCard?.text ?? ""),
  `${firstPerson?.name ?? "no people"} on ${peopleCard?.name ?? "no card"}; ` +
    `payload states ${JSON.stringify(statePhrases)}; card counts ${JSON.stringify(
      (peopleCard?.text.match(/\b\d+\s+(?:active|draft|blocked|parked|completed|abandoned)\b/g) ?? []).slice(0, 6)
    )}`
);

if (CORPUS.blockedEntries.length > 0) {
  const blockedEntry = CORPUS.blockedEntries[0];
  const blockedCard = cards.find((card) => card.name === blockedEntry.topic);
  const cleanCard = cards.find((card) => card.name !== blockedEntry.topic);
  check(
    "the blocked axis shows its blocker text",
    Boolean(blockedCard?.text.includes(`Blocker: ${blockedEntry.blocker}`)),
    blockedCard?.text.slice(0, 200)
  );
  check(
    "a topic with a blocked axis is visually distinct",
    blockedCard?.blocked === "true" &&
      blockedCard?.borderLeft === "3px" &&
      (cleanCard === undefined || cleanCard.blocked === "false"),
    `${blockedEntry.topic}: ${blockedCard?.blocked}/${blockedCard?.borderLeft} ${blockedCard?.borderColor}; ${cleanCard?.name ?? "no second card"}: ${cleanCard?.blocked ?? "n/a"}`
  );
} else {
  skip("the blocked axis shows its blocker text", "no axis in this corpus is blocked");
  skip(
    "a topic with a blocked axis is visually distinct",
    "no axis in this corpus is blocked, so the attention styling has no subject here"
  );
}

check(
  "each topic card reports its recent-activity summary",
  Boolean(firstCard?.text.includes("Recent:")) && Boolean(firstCard?.text.includes("last activity")),
  firstCard?.text.match(/Recent:[^·]*·[^A-Z]*/)?.[0] ?? ""
);

// The window control changes the query and nothing else.
const sevenDayRequest = page.waitForRequest(
  (request) =>
    request.url().includes("/actions/get_overview") &&
    (request.postData() ?? "").includes('"activitySinceDays":7'),
  { timeout: 10000 }
);
await root.getByRole("button", { name: "7 days", exact: true }).click();
const seen = await sevenDayRequest.catch(() => null);
let windowInput = null;
try {
  windowInput = JSON.parse(seen?.postData() ?? "{}").input;
} catch {
  windowInput = null;
}
check(
  "the window control re-issues get_overview with the new window only",
  JSON.stringify(windowInput) === JSON.stringify({ activitySinceDays: 7 }),
  JSON.stringify(windowInput)
);
await page.waitForTimeout(800);
const refreshed = await page.evaluate(
  (pluginId) =>
    (document.querySelector(`div[data-plugin-id="${pluginId}"]`)?.innerText ?? "").includes(
      "Research overview"
    ),
  PLUGIN_ID
);
check("the page still renders after the window change", refreshed);

// Opening a card's detail. A card leads with LEAD_AXES (3) axes; a topic holding more states how much it
// is not showing rather than offering a second way to see it, and `Read topic` is the only topic-level
// disclosure control. One control, one piece of state — the C5 checks below read what it opens.
const leadEntry = CORPUS.topicAxes.find((entry) => entry.topic === CORPUS.topic) ?? {
  axes: [],
  hidden: 0,
};
const detailCard = root.locator(`[data-rd-topic="${CORPUS.topic}"]`);
const collapsed = await page.evaluate(
  ([pluginId, topic]) => {
    const node = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-topic="${topic}"]`
    );
    const note = node?.querySelector("[data-rd-hidden-axes]");
    return {
      axisRows: node?.querySelectorAll("[data-rd-axis-state]").length ?? 0,
      buttons: [...(node?.querySelectorAll("button") ?? [])]
        .map((button) => (button.innerText ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
      hiddenCount: note?.getAttribute("data-rd-hidden-axes") ?? null,
      note: (note?.innerText ?? "").replace(/\s+/g, " ").trim(),
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
const disclosureNames = ["Read topic", "Close"];
const secondExpanders = collapsed.buttons.filter((label) =>
  /^(All \d+ axes|Show fewer axes)$/.test(label)
);
check(
  "the topic card offers one disclosure control, not two",
  collapsed.buttons.filter((label) => disclosureNames.includes(label)).length === 1 &&
    secondExpanders.length === 0,
  `card buttons ${JSON.stringify(collapsed.buttons)}`
);
if (leadEntry.hidden > 0) {
  check(
    "a card that hides axes states it rather than offering a second way in",
    collapsed.hiddenCount === String(leadEntry.hidden) &&
      collapsed.note ===
        `${leadEntry.axes.length - leadEntry.hidden} of ${leadEntry.axes.length} axes shown · ${leadEntry.hidden} more` &&
      collapsed.axisRows === leadEntry.axes.length - leadEntry.hidden,
    `note "${collapsed.note}" (data-rd-hidden-axes=${collapsed.hiddenCount}), ${collapsed.axisRows} rows for ` +
      `${leadEntry.axes.length} axes, ${leadEntry.hidden} hidden`
  );
} else {
  skip(
    "a card that hides axes states it rather than offering a second way in",
    `the topic leads with all ${leadEntry.axes.length} axes (LEAD_AXES is 3), so none are hidden`
  );
}

// The read route into the detail — the only route there is. Opening a topic to read it must not be the
// same action as entering edit mode; the write pass below drives `Edit fields` instead.
await detailCard.getByRole("button", { name: "Read topic", exact: true }).click();
await page.waitForTimeout(1500);
const expanded = await page.evaluate(
  ([pluginId, topic]) => {
    const node = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-topic="${topic}"]`
    );
    return {
      axes: node?.querySelectorAll("[data-rd-axis-state]").length ?? 0,
      text: (node?.innerText ?? "").replace(/\s+/g, " "),
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);
check(
  "reading a card shows every axis it holds",
  expanded.axes === leadEntry.axes.length && !expanded.text.includes("axes shown"),
  `${expanded.axes} axis rows for ${leadEntry.axes.length} axes`
);

// ------------------------------------------------------------------ C5: the topic detail
// The expanded card IS the detail view. The C4 checks above proved the *collapsed* card adds no reads;
// these prove opening one is still a single `get_topic` call, and that what comes back is per axis.
const detailCalls = callsFor("get_topic");
check(
  "opening a topic reads it once, in one get_topic call",
  detailCalls.length === 1,
  `saw ${detailCalls.length}: ${JSON.stringify(detailCalls.map((c) => c.input))}`
);

// Read mode and edit mode are two modes, not one screen with a form somewhere in it. Asserted as three
// separate facts so a regression names itself: reading renders no editor, `Edit fields` is what brings
// the form in, and finishing an edit returns to reading with the card still open (rather than collapsing
// it, which is what it used to do).
const modeOf = () =>
  page.evaluate(
    ([pluginId, topic]) => {
      const card = document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-topic="${topic}"]`
      );
      return {
        editor: Boolean(card?.querySelector("[data-rd-topic-editor]")),
        mode: card?.getAttribute("data-rd-mode") ?? null,
      };
    },
    [PLUGIN_ID, CORPUS.topic]
  );
const readMode = await modeOf();
check(
  "reading a topic does not open the editor",
  readMode.mode === "read" && readMode.editor === false,
  `mode ${readMode.mode}, editor rendered ${readMode.editor}`
);
await detailCard.getByRole("button", { name: "Edit fields", exact: true }).click();
await page.waitForTimeout(1400);
const editMode = await modeOf();
check(
  "the form appears only from Edit fields",
  editMode.mode === "edit" && editMode.editor === true,
  `mode ${editMode.mode}, editor rendered ${editMode.editor}`
);
await detailCard.getByRole("button", { name: "Done editing", exact: true }).click();
await page.waitForTimeout(1400);
const afterEdit = await modeOf();
check(
  "finishing an edit returns to reading, with the card still open",
  afterEdit.mode === "read" && afterEdit.editor === false,
  `mode ${afterEdit.mode}, editor rendered ${afterEdit.editor}`
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
const wantedGroups = ["views", "window", "actions"];
check(
  "the toolbar controls form groups rather than one strip",
  wantedGroups.every((name) => toolbar.groups.includes(name)) &&
    toolbar.groups.length >= wantedGroups.length,
  `groups ${JSON.stringify(toolbar.groups)}, holding ${toolbar.controls} controls`
);

const detail = await page.evaluate(
  ([pluginId, topic]) => {
    const card = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-topic="${topic}"]`
    );
    const axes = [...(card?.querySelectorAll("[data-rd-axis-title]") ?? [])].map(
      (node) => ({
        evidenceCount: node
          .querySelector("[data-rd-evidence-count]")
          ?.getAttribute("data-rd-evidence-count"),
        hasEvidence: node
          .querySelector("[data-rd-has-evidence]")
          ?.getAttribute("data-rd-has-evidence"),
        text: (node.innerText ?? "").replace(/\s+/g, " "),
        conf: [...node.querySelectorAll("[data-rd-conf]")].map((badge) =>
          badge.getAttribute("data-rd-conf")
        ),
        title: node.getAttribute("data-rd-axis-title"),
        version: node.getAttribute("data-rd-axis-version"),
        state: node.getAttribute("data-rd-axis-state"),
      })
    );
    return {
      axes,
      detail: Boolean(card?.querySelector("[data-rd-detail]")),
      noteRows: card?.querySelectorAll("[data-rd-topic-notes] li").length ?? 0,
      text: (card?.innerText ?? "").replace(/\s+/g, " "),
      topicActivityRows:
        card?.querySelectorAll("[data-rd-topic-activity] li").length ?? 0,
    };
  },
  [PLUGIN_ID, CORPUS.topic]
);

check(
  "the expanded card renders the topic detail, one block per axis",
  detail.detail && detail.axes.length === CORPUS.axes.length,
  `${detail.axes.length} axes, detail block: ${detail.detail} (payload holds ${CORPUS.axes.length})`
);
check(
  "the detail shows the topic's fields, its notes and its activity separately",
  detail.text.includes(CORPUS.topic) &&
    (CORPUS.topicNotes === 0 ? detail.noteRows === 0 : detail.noteRows >= 1) &&
    (CORPUS.topicActivityRows === 0 ? detail.topicActivityRows === 0 : detail.topicActivityRows >= 1),
  `topic notes in payload ${CORPUS.topicNotes} → rendered ${detail.noteRows}; activity rows ${detail.topicActivityRows}`
);
check(
  "each axis shows full metadata with its own state and per-claim confidence",
  detail.axes.every(
    (axis) =>
      /v\d+/.test(axis.text) &&
      axis.text.includes("current state") &&
      axis.conf.length >= 1
  ),
  detail.axes
    .map((axis) => `${axis.title}: conf=[${axis.conf.join(",")}]`)
    .join(" | ")
);
check(
  "every axis carries an evidence line, in words",
  detail.axes.every(
    (axis) =>
      axis.evidenceCount !== null &&
      (axis.hasEvidence === "true"
        ? axis.text.includes("evidence: ")
        : axis.text.includes("no evidence on record"))
  ),
  detail.axes
    .map((axis) => `${axis.title}: ${axis.evidenceCount}`)
    .join(", ")
);
// Every state the payload carries must reach the page *as that state* — not as a rendered label that
// drifted, and not dropped. This is what makes the seventh axis state executable coverage rather than a
// screenshot: `abandoned` is supplied only by the layout fixture (the corpus has no subject for it), and
// `usable` has no subject anywhere yet, because nothing can legitimately enter it until the transition
// writer lands (U2/U3).
const unrendered = CORPUS.axes.filter(
  (axis) => !detail.axes.some((rendered) => rendered.title === axis.title && rendered.state === axis.state)
);
check(
  "every axis state the payload carries reaches the page as that state",
  unrendered.length === 0,
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

// Per-axis history expands *inside the axis* — never one merged log for the whole topic. Which axis
// is chosen comes from the page (the first one carrying notes), and the note/ history separation is
// probed with that axis's own note text rather than a fixture string.
const historyAxisTitle = await page.evaluate(
  ([pluginId, topic]) => {
    const card = document.querySelector(
      `div[data-plugin-id="${pluginId}"] [data-rd-topic="${topic}"]`
    );
    const axes = [...(card?.querySelectorAll("[data-rd-axis-title]") ?? [])];
    const withNotes = axes.find(
      (node) => (node.querySelector("[data-rd-axis-notes] li") ?? null) !== null
    );
    return (withNotes ?? axes[0])?.getAttribute("data-rd-axis-title") ?? "";
  },
  [PLUGIN_ID, CORPUS.topic]
);
if (historyAxisTitle === "") {
  skip("a per-axis history expands inside its own axis", "no axis block rendered");
} else {
  const historyCard = root.locator(
    `[data-rd-topic="${CORPUS.topic}"] [data-rd-axis-title="${historyAxisTitle}"]`
  );
  await historyCard.getByRole("button", { name: /^History \(/ }).click();
  await page.waitForTimeout(500);
  const history = await page.evaluate(
    ([pluginId, topic, title]) => {
      const axis = document.querySelector(
        `div[data-plugin-id="${pluginId}"] [data-rd-topic="${topic}"] [data-rd-axis-title="${title}"]`
      );
      const list = axis?.querySelector("[data-rd-history]");
      const notes = axis?.querySelector("[data-rd-axis-notes]");
      return {
        historyRows: list?.querySelectorAll("li").length ?? 0,
        historyText: (list?.innerText ?? "").replace(/\s+/g, " "),
        noteRows: notes?.querySelectorAll("li").length ?? 0,
        noteText: (notes?.innerText ?? "").replace(/\s+/g, " "),
      };
    },
    [PLUGIN_ID, CORPUS.topic, historyAxisTitle]
  );
  check(
    "a per-axis history expands inside its own axis",
    history.historyRows >= 1,
    `${history.historyRows} rows for ${historyAxisTitle}`
  );
  const noteProbe = history.noteText.split(" ").slice(0, 8).join(" ").trim();
  if (history.noteRows === 0 || noteProbe.length < 12) {
    skip(
      "the axis's notes are kept out of its history list",
      `${historyAxisTitle} carries no notes to compare against`
    );
  } else {
    check(
      "the axis's notes are kept out of its history list",
      !history.historyText.includes(noteProbe),
      `history ${history.historyRows} rows, notes ${history.noteRows} rows, probe ${JSON.stringify(noteProbe)}`
    );
  }
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
console.log("detail screenshot:", detailShot);

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
  "the People view lists every person once — the header's count, not one row per link",
  people.count === people.names.length &&
    people.count === people.header &&
    people.duplicated.length === 0 &&
    people.count > 0,
  `index ${people.count}, header ${people.header}, duplicated ${JSON.stringify(people.duplicated)}`
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
const personName = people.name || CORPUS.people[0]?.name || "";
await root.locator(`[data-rd-person="${personName}"]`).click();
await page.waitForTimeout(500);
const researcher = await page.evaluate(
  (needle) => {
    const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
    const panel = scope?.querySelector("[data-rd-person-panel]");
    return {
      involvement: [...(panel?.querySelectorAll("[data-rd-involvement]") ?? [])].map((node) => ({
        axes: [...node.querySelectorAll("[data-rd-scan-axis]")].map((axis) =>
          axis.getAttribute("data-rd-scan-axis")
        ),
        topic: node.getAttribute("data-rd-involvement"),
      })),
      name: panel?.getAttribute("data-rd-person-panel") ?? "",
      rows: scope?.querySelectorAll(`[data-rd-person="${needle}"]`).length ?? 0,
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
if (personPayload !== undefined && personPayload.topics >= 2) {
  check(
    "one person on several topics shows each topic with its own axes underneath",
    researcher.involvement.length >= 2,
    JSON.stringify(researcher.involvement)
  );
} else {
  skip(
    "one person on several topics shows each topic with its own axes underneath",
    `this corpus links ${personName || "the person"} to ${personPayload?.topics ?? 1} topic(s), so the grouping has one entry`
  );
}

const peopleShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-people.png`;
await root.screenshot({ path: peopleShot });
console.log("people screenshot:", peopleShot);

await viewButton("Repositories").click();
await page.waitForTimeout(700);
const repositories = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  const index = scope?.querySelector("[data-rd-repositories]");
  const rows = [...(index?.querySelectorAll("[data-rd-repository]") ?? [])];
  const names = rows.map((row) => row.getAttribute("data-rd-repository") ?? "");
  const panel = scope?.querySelector("[data-rd-repository-panel]");
  return {
    axes: [...(panel?.querySelectorAll("[data-rd-scan-axis]") ?? [])].map((axis) => axis.getAttribute("data-rd-scan-axis")),
    count: Number(index?.getAttribute("data-rd-repositories") ?? -1),
    duplicated: names.filter((name, position) => names.indexOf(name) !== position),
    name: panel?.getAttribute("data-rd-repository-panel") ?? "",
    names,
    supports: Number(panel?.querySelector("[data-rd-repository-topics]")?.getAttribute("data-rd-repository-topics") ?? -1),
  };
});
check(
  "the Repositories view is repository-first: what it supports and the work happening in it",
  repositories.count === repositories.names.length &&
    repositories.duplicated.length === 0 &&
    repositories.name !== "" &&
    repositories.supports >= 1 &&
    repositories.axes.length >= 1,
  `${repositories.count} repositories ${JSON.stringify(repositories.names)}; panel ${repositories.name}: supports ${repositories.supports}, axes ${JSON.stringify(repositories.axes)}`
);

const repositoriesShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-repositories.png`;
await root.screenshot({ path: repositoriesShot });
console.log("repositories screenshot:", repositoriesShot);

await viewButton("Topics").click();
await page.waitForTimeout(600);
const backToTopics = await page.evaluate(() => {
  const scope = document.querySelector('div[data-plugin-id="research-dashboard"]');
  return {
    cards: scope?.querySelectorAll("[data-rd-topic]").length ?? 0,
    form: scope?.querySelectorAll(".rd-newtopic").length ?? 0,
    peopleIndex: scope?.querySelectorAll("[data-rd-people]").length ?? 0,
    repositoryIndex: scope?.querySelectorAll("[data-rd-repositories]").length ?? 0,
  };
});
check(
  "switching back to Topics restores the topic view, with no residue from the other two",
  backToTopics.cards > 0 &&
    backToTopics.form === 1 &&
    backToTopics.peopleIndex === 0 &&
    backToTopics.repositoryIndex === 0,
  `cards ${backToTopics.cards}, form ${backToTopics.form}, people index ${backToTopics.peopleIndex}, repository index ${backToTopics.repositoryIndex}`
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
check(
  "the Progress view groups the window by topic → axis instead of one flat log",
  progress.view === 1 &&
    progress.topics.length > 0 &&
    progress.rails.length >= progress.topics.length &&
    progress.events.length > 0,
  `summary "${progress.summary}"; topics ${JSON.stringify(progress.topics)}; rails ${JSON.stringify(progress.rails)}`
);
// The rails are the payload's own axis titles, and the date probe is a date the payload actually
// carries (this corpus's newest event is 2026-09-28) rather than a fixture date.
const expectedRails = CORPUS.timeline.flatMap((group) => group.axes);
const railMatches = expectedRails.filter((title) => progress.rails.includes(title));
const newestEventDate = CORPUS.eventDates.at(-1) ?? "";
check(
  "an event recorded against an axis alone still lands under the right topic and its own axis",
  railMatches.length > 0 &&
    newestEventDate !== "" &&
    progress.events.some((line) => line.includes(newestEventDate)),
  `rails matched ${railMatches.length}/${expectedRails.length}; looked for a ${newestEventDate} event; events ${JSON.stringify(progress.events.slice(0, 3))}`
);

// The grouped view is the one worth showing: newest topic first, each axis keeping its own events.
const progressShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-progress.png`;
await root.screenshot({ path: progressShot });
console.log("progress screenshot:", progressShot);

// ------------------------------------------------ C8: no bare state, one vocabulary for the evidence
// A state is a claim, and the record often holds only an inference. Every rendered state must carry
// its confidence, and one that is not confirmed must say so where it is read — otherwise the temporal
// view launders an inference into a fact.
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

const eventSources = await page.evaluate(() => {
  const panel = document.querySelector('div[data-plugin-id="research-dashboard"]');
  return [...panel.querySelectorAll("[data-rd-progress-events] li .rd-meta")]
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

// The context filters read the axis, so a repository filter keeps the axes that name that repository.
const filterRepo = CORPUS.repositories[0]?.fullName ?? "";
const repoAxes = CORPUS.repositories[0]?.axes ?? [];
if (filterRepo === "") {
  skip(
    "filtering by a repository keeps only the axes that name it, and says it is filtered",
    "the corpus records no repository"
  );
} else {
  await root.getByLabel("Filter by repository").click();
  await page.getByRole("option", { name: filterRepo, exact: true }).click();
  await page.waitForTimeout(400);
  const byRepository = await page.evaluate(() => {
    const scope = document.querySelector(
      'div[data-plugin-id="research-dashboard"]'
    );
    return {
      rails: [...(scope?.querySelectorAll("[data-rd-progress-axis]") ?? [])].map(
        (node) => node.getAttribute("data-rd-progress-axis")
      ),
      summary: (
        scope?.querySelector("[data-rd-progress-summary]")?.textContent ?? ""
      )
        .replace(/\s+/g, " ")
        .trim(),
      topics: [
        ...(scope?.querySelectorAll("[data-rd-progress-topic]") ?? []),
      ].map((node) => node.getAttribute("data-rd-progress-topic")),
    };
  });
  // How many rails survive depends on which axes have events in the window; that any rail survives,
  // that every rail names this repository, and that the summary admits it is filtered, do not.
  const strayRails = byRepository.rails.filter((rail) => !repoAxes.includes(rail));
  check(
    "filtering by a repository keeps only the axes that name it, and says it is filtered",
    byRepository.topics.length === 1 &&
      byRepository.topics[0] === CORPUS.topic &&
      byRepository.rails.length >= 1 &&
      strayRails.length === 0 &&
      byRepository.summary.includes("(filtered)"),
    `topics ${JSON.stringify(byRepository.topics)}; rails ${JSON.stringify(byRepository.rails)} (stray ${JSON.stringify(strayRails)} of ${JSON.stringify(repoAxes)}); summary "${byRepository.summary}"`
  );
}

// A person filter with nothing attributable says so instead of showing everything. This corpus maps
// its only person to an account, so the unattributable case has no subject here — reported, not passed.
const unmappedPerson = CORPUS.people.find((person) => !person.attributable);
if (unmappedPerson === undefined) {
  skip(
    "a person filter that matches nothing attributable says so, and shows no unrelated events",
    "every person in this corpus maps to a platform account, so the unattributable case has no subject"
  );
} else {
  await root.getByLabel("Filter by person").click();
  await page.getByRole("option", { name: unmappedPerson.name, exact: true }).click();
  await page.waitForTimeout(400);
  const byPerson = await page.evaluate(() => {
    const scope = document.querySelector(
      'div[data-plugin-id="research-dashboard"]'
    );
    return {
      empty:
        (scope?.querySelector("[data-rd-progress-empty]")?.innerText ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80),
      events: [
        ...(scope?.querySelectorAll("[data-rd-progress-event]") ?? []),
      ].length,
    };
  });
  check(
    "a person filter that matches nothing attributable says so, and shows no unrelated events",
    byPerson.events === 0 && byPerson.empty.length > 0,
    `events ${byPerson.events}; empty card "${byPerson.empty}"`
  );
}

// Back to the topics view, with the filters gone with their view.
await root.getByRole("button", { name: "Topics", exact: true }).click();
await page.waitForTimeout(500);
const afterProgress = await page.evaluate(() => {
  const scope = document.querySelector(
    'div[data-plugin-id="research-dashboard"]'
  );
  return {
    cards: scope?.querySelectorAll("[data-rd-topic]").length ?? 0,
    progress: scope?.querySelectorAll('[data-rd-view="progress"]').length ?? 0,
  };
});
check(
  "leaving the Progress view restores the topic view with no residue",
  afterProgress.cards > 0 && afterProgress.progress === 0,
  `cards ${afterProgress.cards}, progress views ${afterProgress.progress}`
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
  console.log("palette screenshot:", paletteShot);
  await paletteEntry.click();
  await page.waitForURL(new RegExp(`/plugins/${PLUGIN_ID}`), { timeout: 8000 }).catch(() => {});
  check("palette entry navigates to the page", page.url().includes(`/plugins/${PLUGIN_ID}`), page.url());
}

if (WRITE) {
  // Scope every interaction to the plugin's own root: the dashboard chrome has buttons and inputs
  // whose accessible names overlap ("… Activity" titles in the sidebar), and strict mode rejects
  // ambiguous locators.
  const name = `ui-check ${Date.now().toString().slice(-5)}`;
  await root.getByLabel("New topic name").fill(name);
  await root.getByRole("button", { name: "Add topic", exact: true }).click();
  await page.waitForTimeout(1500);
  const listed = await page.evaluate(
    (needle) =>
      (document.querySelector(`div[data-plugin-id="research-dashboard"]`)?.innerText ?? "").includes(needle),
    name
  );
  check("create a topic through the page (reconcile_topic)", listed, name);

  // Creating a topic opens its editor directly (you just made it — you probably want to fill it in),
  // so exercise the toggle rather than assuming a collapsed card.
  const card = root.locator(`[data-rd-topic="${name}"]`);
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(500);
  const collapsed = await card.getByLabel("Activity", { exact: true }).count();
  await card.getByRole("button", { name: "Edit fields", exact: true }).click();
  await page.waitForTimeout(500);
  const reopened = await card.getByLabel("Activity", { exact: true }).count();
  check(
    "the card's editor opens and closes from the overview",
    collapsed === 0 && reopened === 1,
    `collapsed: ${collapsed}, reopened: ${reopened}`
  );

  await card.getByLabel("Activity", { exact: true }).fill("ui verification event");
  await card.getByRole("button", { name: "Record activity", exact: true }).click();
  await page.waitForTimeout(1500);
  const activity = await page.evaluate(
    (needle) =>
      (document.querySelector(`div[data-plugin-id="research-dashboard"]`)?.innerText ?? "").includes(needle),
    "ui verification event"
  );
  check("record_activity through the page", activity);

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
    const orgs = await fetch("/v1/auth/orgs", { credentials: "include" }).then((response) =>
      response.json()
    );
    return { csrf: cookie("nakama_csrf"), orgId: orgs.orgs?.[0]?.id ?? "" };
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

  // Reload so the fixture axis is in the detail, then open it the way a reader would.
  await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
  await root.waitFor({ state: "visible", timeout: 20000 });
  await root
    .locator(`[data-rd-topic="${name}"]`)
    .getByRole("button", { name: "Edit fields", exact: true })
    .click();
  await page.waitForTimeout(1500);
  const axisCard = root.locator(`[data-rd-topic="${name}"] [data-rd-axis-title="${axisTitle}"]`);
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
        `div[data-plugin-id="research-dashboard"] [data-rd-topic="${topic}"] [data-rd-axis-title="${title}"]`
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
  // The notes live under the axis's own history, so read them the way a person would: expand it.
  await axisCard.getByRole("button", { name: /^History \(/ }).click();
  await page.waitForTimeout(500);
  const corrected = await page.evaluate(
    ([topic, title]) => {
      const axis = document.querySelector(
        `div[data-plugin-id="research-dashboard"] [data-rd-topic="${topic}"] [data-rd-axis-title="${title}"]`
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

  // Behaviour 1 of the conflict contract: a topic-level refusal reports at topic level, never inside an
  // axis, keeps the typed rationale, and does not fall through to the ordinary error line.
  // The topic editor is already open from the activity check above; reopen it only if it is not.
  if ((await card.getByLabel("Note on this change").count()) === 0) {
    await card.getByRole("button", { name: "Edit fields", exact: true }).click();
    await page.waitForTimeout(600);
  }
  const topicNote = "reordered the axes after the group call";
  await card.getByLabel("Note on this change").fill(topicNote);
  const topicBumped = await callAction("reconcile_topic", {
    topic: { summary: "bumped by the harness" },
    topicId,
  });
  check(
    "a concurrent writer bumped the topic",
    topicBumped.status === 200,
    `status ${topicBumped.status}`
  );
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1500);
  const topicConflict = await page.evaluate(() => {
    const scope = document.querySelector(
      'div[data-plugin-id="research-dashboard"]'
    );
    const banner = scope?.querySelector("[data-rd-conflict]");
    return {
      banner: banner ? (banner.innerText ?? "").replace(/\s+/g, " ") : "",
      banners: scope ? scope.querySelectorAll("[data-rd-conflict]").length : -1,
      error: (scope?.querySelector(".rd-error")?.innerText ?? "").trim(),
    };
  });
  const topicNoteKept = await page.getByLabel("Note on this change").inputValue();
  check(
    "a stale topic save reports at topic level (not inside an axis) and keeps the note",
    topicConflict.banners === 1 &&
      !topicConflict.banner.includes("This development axis changed") &&
      topicConflict.banner.includes("conflict:") &&
      topicConflict.error === "" &&
      topicNoteKept === topicNote,
    `banners: ${topicConflict.banners}; text: ${topicConflict.banner.slice(0, 90)}; error: ${topicConflict.error.slice(0, 50)}; note kept: ${topicNoteKept === topicNote}`
  );
}

const screenshot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}.png`;
// An element shot rather than `fullPage`: the host scrolls the plugin page inside its own container,
// so a document-level screenshot captures whichever slice is scrolled into view and silently drops
// the header. Capturing the plugin root always yields the whole page, top first.
await root.evaluate((node) => node.scrollIntoView({ block: "start" }));
await page.waitForTimeout(400);
await root.screenshot({ path: screenshot });
console.log("screenshot:", screenshot);
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
