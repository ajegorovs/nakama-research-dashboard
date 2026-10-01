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
      rows: [...index.querySelectorAll("[data-rd-index-axis]")].map((node) => ({
        activity: Number(node.getAttribute("data-rd-index-activity")),
        id: node.getAttribute("data-rd-index-axis"),
        problems: Number(node.getAttribute("data-rd-index-problems")),
        stale: node.getAttribute("data-rd-index-stale") === "true",
        state: node.getAttribute("data-rd-index-state"),
      })),
      window: Number(index.getAttribute("data-rd-progress-index-window")),
    };
  });
const apiProgress = (days) =>
  page.evaluate(
    async ([plugin, since]) => {
      const cookie = (name) =>
        document.cookie
          .split("; ")
          .find((entry) => entry.startsWith(`${name}=`))
          ?.slice(name.length + 1) ?? "";
      const orgs = await fetch("/v1/auth/orgs", { credentials: "include" }).then((r) => r.json());
      const body = await fetch(`/v1/plugins/${plugin}/actions/get_progress`, {
        body: JSON.stringify({ input: { activitySinceDays: since } }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": cookie("nakama_csrf"),
          "x-org-id": orgs.orgs?.[0]?.id ?? "",
        },
        method: "POST",
      }).then((r) => r.json());
      return body.result ?? null;
    },
    [PLUGIN_ID, days]
  );
const apiIndex = async (days) => {
  // The row list is `axes.axes`: the outer object is the projection (window, threshold, rows).
  const result = await apiProgress(days);
  return result?.axes?.axes ?? null;
};
const setWindow = async (days) => {
  await root.locator(`[data-rd-window="${days}"]`).click();
  // Returns false instead of throwing: an index that never appears would otherwise abort the whole pass with
  // a TimeoutError, which says nothing about the page. A missing element is a failure of *this* check.
  try {
    await page.waitForFunction(
      (wanted) =>
        document
          .querySelector('[data-rd-progress-index="true"]')
          ?.getAttribute("data-rd-progress-index-window") === String(wanted),
      days,
      { timeout: 10000 }
    );
    return true;
  } catch {
    return false;
  }
};

const startWindow = (await readIndex())?.window ?? 7;
const indexMismatches = [];
for (const days of [30, 7]) {
  if (!(await setWindow(days))) {
    indexMismatches.push(`${days}d: the index never reported the new window — element missing, or the client kept the old result`);
    continue;
  }
  const dom = await readIndex();
  const projection = await apiIndex(days);
  if (!dom || !projection) {
    indexMismatches.push(`${days}d: no index (${Boolean(dom)}) or no projection (${Boolean(projection)})`);
    continue;
  }
  if (dom.window !== days) {
    indexMismatches.push(`${days}d: the index reports window ${dom.window}`);
  }
  if (dom.rows.length !== projection.length) {
    indexMismatches.push(`${days}d: ${dom.rows.length} rows on screen, ${projection.length} in the projection`);
  }
  for (const row of dom.rows) {
    const expected = projection.find((entry) => entry.id === row.id);
    if (!expected) {
      indexMismatches.push(`${days}d: a row (${row.id.slice(0, 8)}) is not in the projection`);
      continue;
    }
    if (row.activity !== expected.activityInWindow) {
      indexMismatches.push(
        `${days}d: "${expected.title}" shows ${row.activity} events, the projection says ${expected.activityInWindow}`
      );
    }
    if (row.problems !== expected.problems) {
      indexMismatches.push(
        `${days}d: "${expected.title}" shows ${row.problems} problems, the projection says ${expected.problems}`
      );
    }
    if (row.state !== expected.state) {
      indexMismatches.push(`${days}d: "${expected.title}" shows state ${row.state}, the projection says ${expected.state}`);
    }
    if (row.stale !== expected.stale) {
      indexMismatches.push(`${days}d: "${expected.title}" shows stale=${row.stale}, the projection says ${expected.stale}`);
    }
  }
  // Server order is the presentation order: the page must not re-sort what the projection ordered.
  const screenOrder = dom.rows.map((row) => row.id).join(",");
  const projectionOrder = projection.map((entry) => entry.id).join(",");
  if (screenOrder !== projectionOrder) {
    indexMismatches.push(`${days}d: the on-screen row order differs from the projection's`);
  }
}
check(
  "the Progress index is the projection for the current window — replaced on change, not extended",
  indexMismatches.length === 0,
  indexMismatches.slice(0, 4).join("; ") || `matched the projection at 30 and 7 days (${startWindow}d restored)`
);
await setWindow(startWindow);

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

// The composition itself: three regions on one row, in the contract's order, each with a real box.
{
  const { index: boxIndex, problem: boxProblem, feed: boxFeed } = top.boxes;
  const placed = [boxIndex, boxProblem, boxFeed].every(Boolean);
  const oneRow =
    placed &&
    Math.abs(boxIndex.y - boxProblem.y) < 48 &&
    Math.abs(boxProblem.y - boxFeed.y) < 48 &&
    boxIndex.x < boxProblem.x &&
    boxProblem.x < boxFeed.x;
  check(
    "the Progress top area shows the index, the Problem column and the Activity feed side by side",
    oneRow && boxProblem.w > 0 && boxFeed.w > 0 && boxIndex.w > 0,
    `index ${JSON.stringify(boxIndex)}, problem ${JSON.stringify(boxProblem)}, feed ${JSON.stringify(boxFeed)}`
  );
}

// The default selection is the projection's own first row — not a ranking the page invented.
check(
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
  check(
    "the Problem column shows the projection's first open problem, under the projection's own count",
    onAxis.problem.heading === `Open problems (${problemAxis.axis.openProblems})` &&
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

// The Activity feed: the projection's bucket for this axis, same count, same rows, same order.
{
  const bucket = firstProjection?.bucket ?? null;
  const rows = top.feed.rows;
  const expected = bucket?.events ?? [];
  const aligned =
    rows.length === expected.length &&
    expected.every((event, position) => rows[position]?.includes(event.summary));
  check(
    "the Activity feed is the projection's bucket for the selected axis, in the projection's order",
    top.feed.axis === first?.id &&
      top.feed.count === (bucket?.eventCount ?? 0) &&
      top.feed.heading === `Activity (${first?.activityInWindow ?? 0})` &&
      (expected.length === 0 ? top.feed.rows.length === 0 : aligned),
    `feed axis ${top.feed.axis?.slice(0, 8)}, count ${top.feed.count} (projection ${bucket?.eventCount ?? 0}), heading "${top.feed.heading}" (index row ${first?.activityInWindow ?? 0}), ${rows.length} rows vs ${expected.length} in the projection`
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
    const wantedEvents = expected.bucket?.events ?? [];
    check(
      "selecting another axis moves the Problem and Activity columns to that axis",
      moved.problem.axis === wanted.id &&
        moved.feed.axis === wanted.id &&
        moved.problem.heading === `Open problems (${expected.axis?.openProblems ?? -1})` &&
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
    const section = scope?.querySelector(".rd-progress-plan") ?? null;
    const steps = [...(section?.querySelectorAll("[data-rd-plan-step]") ?? [])].map((node) => {
      const badge = node.querySelector("[data-rd-step-state]");
      return {
        claimsConfidence: badge?.hasAttribute("data-rd-state-confidence") ?? null,
        position: node.getAttribute("data-rd-plan-step-position"),
        shown: Boolean(node.querySelector("[data-rd-plan-step-shown]")),
        state: (badge?.textContent ?? "").trim(),
        title: (node.querySelector(".rd-strong")?.textContent ?? "").trim(),
      };
    });
    const box = section?.getBoundingClientRect();
    return {
      axis:
        scope
          ?.querySelector(".rd-progress-problem")
          ?.getAttribute("data-rd-progress-problem-axis") ?? null,
      // Any wording about a plan being absent would be the empty shell the reviewer ruled out.
      mentionsMissingPlan: /no plan|missing plan|plan not/i.test(
        (scope?.innerText ?? "").replace(/\s+/g, " ")
      ),
      present: section !== null,
      steps,
      summary: (section?.querySelector("p")?.textContent ?? "").trim(),
      unordered: Boolean(section?.querySelector('[data-rd-progress-plan-unordered="true"]')),
      y: box ? Math.round(box.top) : null,
    };
  });
// The selectAxis helper is defined above the composition block, because the Problem-column check needs to
// choose its own subject axis and that block comes first in the file.

const planOf = (result, axisId) =>
  result.axes.axes.find((row) => row.id === axisId)?.plan ?? null;

// (1) Below the composition, not a fourth column — and still on one row above it.
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
    const rowBottom = Math.max(
      ...[boxes.index, boxes.problem, boxes.feed].map((box) => (box?.y ?? 0) + (box?.h ?? 0))
    );
    const expected = planOf(allProgress, planned.id);
    const titles = expected.steps.map((step) => step.title);
    check(
      "the plan renders below the top row, from the projection, with no fourth column",
      shown.present &&
        shown.axis === planned.id &&
        shown.y !== null &&
        shown.y >= rowBottom &&
        shown.steps.length === expected.steps.length &&
        shown.steps.every((step, position) => step.title === titles[position]) &&
        shown.summary === expected.summary.trim() &&
        shown.steps.every((step, position) => step.state === expected.steps[position].state),
      `plan at y=${shown.y} vs row bottom ${rowBottom}; ${shown.steps.length} steps vs ${expected.steps.length}; titles ${JSON.stringify(shown.steps.map((s) => s.title))}`
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
      await root.locator(`[data-rd-problem-choice="${linked.id}"]`).click();
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
    const expected = planOf(allProgress, unordered.id);
    const titles = expected.steps.map((step) => step.title);
    const sortedAlphabetically = [...titles].sort((left, right) => left.localeCompare(right));
    check(
      "an unordered plan keeps the store's order and invents no sequence",
      shown.present &&
        shown.steps.length === titles.length &&
        shown.steps.every((step, position) => step.title === titles[position]) &&
        shown.steps.every((step) => step.position === "") &&
        shown.unordered &&
        // The check only means something if the two orders actually differ on this dataset.
        titles.join("|") !== sortedAlphabetically.join("|") &&
        shown.steps.every((step, position) => step.state === expected.steps[position].state) &&
        shown.steps.every((step) => step.claimsConfidence === false),
      `order ${JSON.stringify(shown.steps.map((s) => s.title))} vs projection ${JSON.stringify(titles)} (alphabetical would be ${JSON.stringify(sortedAlphabetically)}); positions ${JSON.stringify(shown.steps.map((s) => s.position))}; unordered marker ${shown.unordered}`
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
    check(
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
    check(
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

  // (2) Exactly one row is active — the one the card is showing — and picking another moves the card.
  const shownBefore = (await readTop()).problem.shown;
  const activeRows = inventory.rows.filter((row) => row.active);
  if (expectedOpen.length === 0) {
    skip(
      "exactly the problem on screen is the active row",
      "this dataset has no open problem on any axis, so no row can be the active one"
    );
  } else {
    check(
      "exactly the problem on screen is the active row",
      activeRows.length === 1 && activeRows[0]?.id === shownBefore,
      `active ${activeRows.length} (${activeRows[0]?.id?.slice(0, 8) ?? "none"}), card ${shownBefore?.slice(0, 8) ?? "none"}`
    );
  }
  if (expectedOpen.length > 1) {
    const other = expectedOpen.find((problem) => problem.id !== shownBefore);
    await root.locator(`[data-rd-problem-choice="${other.id}"]`).click();
    await page.waitForTimeout(300);
    const moved = await readInventory();
    const topAfter = await readTop();
    const movedActive = moved.rows.filter((row) => row.active);
    check(
      "selecting a row in the inventory moves the card, and the active row with it",
      topAfter.problem.shown === other.id && movedActive.length === 1 && movedActive[0]?.id === other.id,
      `card ${topAfter.problem.shown?.slice(0, 8)} (wanted ${other.id.slice(0, 8)}); active ${movedActive.length}`
    );
    await root.locator(`[data-rd-problem-choice="${shownBefore}"]`).click();
    await page.waitForTimeout(200);
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
    check(
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
  if (withRelations) {
    await selectAxis(String(withRelations.axisId));
    await root.locator(`[data-rd-problem-choice="${withRelations.id}"]`).click();
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
        await root.locator(`[data-rd-problem-choice="${sparse.id}"]`).click();
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
      await root.locator(`[data-rd-problem-choice="${withRelations.id}"]`).click();
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
    await root.locator(`[data-rd-problem-choice="${withRelations.id}"]`).click();
    await page.waitForTimeout(300);
  } else {
    const reason =
      "this dataset carries no problem with more than one repository, so the step-5 sections have no " +
      `subject here (${(allProgress.problems.problems ?? []).length} problem row(s) in the payload) — the ` +
      "fixture's axis carries one, so that run discriminates";
    const sparseReason =
      "this dataset carries no problem with nothing behind it (no repositories, no evidence, no " +
      "steering), so the negative cases have no subject — the fixture's sparse problem does, so that " +
      "run discriminates";
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
    await root.locator(`[data-rd-progress-subview-option="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const projectionBefore = await apiProgress(windowDaysNow);
  const callsBefore = callsFor("get_progress").length;
  const problemRowsAll = allProgress.problems.problems ?? [];

  // (1) The control, and the subject the view opens on. Both datasets.
  const opened = await readSubView();
  const subjects = opened.options.map((option) => option.value).join("|");
  const pressed = opened.options.filter((option) => option.pressed);
  check(
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
    check(
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
    await root.locator(`[data-rd-problem-index="${subjectProblem.id}"]`).click();
    await page.waitForTimeout(250);
    const picked = await readSubView();
    const bucket = (allProgress.activity.byAxis ?? []).find(
      (entry) => entry.axisId === subjectProblem.axisId
    );
    check(
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
    check(
      "the repository threads, evidence and steering sections render from that same problem object",
      picked.sections.repositories === (subjectProblem.repositories?.length ?? 0) &&
        picked.sections.evidence === (subjectProblem.evidence?.length ?? 0) &&
        picked.sections.steering === steeringTotal > 0,
      `sections ${picked.sections.repositories} repo / ${picked.sections.evidence} evidence / steering ${picked.sections.steering ? "present" : "absent"}; projection ${subjectProblem.repositories?.length ?? 0} / ${subjectProblem.evidence?.length ?? 0} / ${steeringTotal > 0 ? "present" : "absent"}`
    );

    // The published capture of the inverted index, taken in exactly the state the checks above describe.
    const problemsShot = `${OUT}/research-dashboard-${WRITE ? "write" : "read"}-problems.png`;
    await root.screenshot({ path: problemsShot });
    console.log("problems screenshot:", problemsShot);

    // (5) Back to `Axes`: the index marks the **parent axis** of the problem on screen, which is the identity
    // bridge the switch preserves — not a remembered axis the reader has since left.
    await clickSubject("axes");
    const back = await readSubView();
    const activeAxisRows = back.axisRows.filter((row) => row.active);
    check(
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
      const topicCard =
        scope?.querySelector('[data-rd-view="topics"] .rd-topic-card[data-rd-mode="read"]') ??
        null;
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
        context: tagsIn(scope?.querySelector("[data-rd-progress-context]")),
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
          ? { mode: topicCard.getAttribute("data-rd-mode"), name: topicCard.getAttribute("data-rd-topic") }
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
  const tagFromProgress = async (type) => {
    await showView("progress");
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
      await root.locator('[data-rd-progress-subview-option="axes"]').click();
      await page.waitForTimeout(250);
    }
    await root.locator(`[data-rd-index-axis="${bucket.axisId}"]`).click();
    await page.waitForTimeout(300);
    const state = await readTags();
    const tag =
      state.feed.flatMap((row) => row.tags).find((entry) => entry.type === kind) ?? null;
    return { state, tag };
  };

  const baseline = {
    payload: JSON.stringify(await apiProgress(windowDaysNow)),
    writes: writesSoFar(),
  };

  // (1) The tags a reader can see on the reading surface, and whether they carry the projection's own names.
  const atProgress = (await tagFromProgress("topic")).state;
  const activeAxis =
    allProgress.axes.axes.find((row) => row.id === atProgress.progress.activeAxis) ?? null;
  if (activeAxis === null) {
    skip(
      "the reading surface names its topic and its axis as tags, with the projection's own ids and labels",
      "this dataset's projection carries no axis row, so the reading surface has no context to name"
    );
  } else {
    check(
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

  // (2) The Activity column's tags, row by row against the events the projection says are in that bucket: no
  // tag may name something its event did not, and an attributed event must carry its person as a tag.
  const feedBucket = allProgress.activity.byAxis.find((bucket) => bucket.axisId === activeAxis?.id) ?? null;
  const feedEvents = feedBucket?.events ?? [];
  const feedMismatches = [];
  const unattributed = [];
  for (const [position, event] of feedEvents.entries()) {
    const row = atProgress.feed[position] ?? { tags: [], text: "" };
    const carried = new Set(
      [
        event.topicId === null || event.topicId !== activeAxis?.topicId ? null : `topic:${event.topicId}`,
        event.repositoryId === null ? null : `repository:${event.repositoryId}`,
        event.person === null ? null : `person:${event.person.id}`,
        event.problemId === null ? null : `problem:${event.problemId}`,
      ].filter((entry) => entry !== null)
    );
    const seen = row.tags.map((tag) => `${tag.type}:${tag.id}`);
    if (seen.some((tag) => !carried.has(tag))) {
      feedMismatches.push(
        `${row.text.slice(0, 40)} carries ${seen.join("+")} beyond ${[...carried].join("+")}`
      );
    }
    if (event.person !== null && !seen.includes(`person:${event.person.id}`)) {
      unattributed.push(event.person.displayName);
    }
  }
  if (feedEvents.length === 0) {
    for (const description of [
      "every tag in the Activity column names an entity its own event carries, and no more",
      "an event with a mapped account carries that person's tag, so attribution is navigable and not only text",
    ]) {
      skip(description, "the axis on screen has no events in the window, so its feed renders no tags");
    }
  } else {
    check(
      "every tag in the Activity column names an entity its own event carries, and no more",
      feedMismatches.length === 0,
      feedMismatches.join("; ") || `${feedEvents.length} event row(s) checked`
    );
    if (unattributed.length === 0 && feedEvents.every((event) => event.person === null)) {
      skip(
        "an event with a mapped account carries that person's tag, so attribution is navigable and not only text",
        "no event in this axis's window is attributed to an account, so there is no person tag to check"
      );
    } else {
      check(
        "an event with a mapped account carries that person's tag, so attribution is navigable and not only text",
        unattributed.length === 0,
        unattributed.length === 0
          ? `${feedEvents.filter((event) => event.person !== null).length} attributed event(s) checked`
          : `missing on: ${unattributed.join(", ")}`
      );
    }
  }

  // (3) A topic tag: the canonical view, and the topic actually selected there (its card expanded).
  const { tag: topicTag } = await tagFromProgress("topic");
  const topicLanding = topicTag === null ? null : await clickTag("topic", topicTag.id);
  if (topicTag === null) {
    skip(
      "a topic tag lands in Topics with that topic selected, and the label matches the card it opened",
      "the reading surface shows no topic tag — its axis carries no topic to name"
    );
  } else {
    check(
      "a topic tag lands in Topics with that topic selected, and the label matches the card it opened",
      topicLanding.view === "topics" &&
        topicLanding.topic?.mode === "read" &&
        topicLanding.topic?.name === topicTag.label,
      `view ${topicLanding.view ?? "none"}, card ${topicLanding.topic?.name ?? "none"} (wanted ${topicTag.label})`
    );
  }

  // (4) A person tag: the same claim for People, whose "selected" state is its panel.
  const { tag: personTag } = await tagFromProgress("person");
  const personLanding = personTag === null ? null : await clickTag("person", personTag.id);
  if (personTag === null) {
    skip(
      "a person tag lands in People with that person selected, and the label matches the panel it opened",
      "no event on the axis on screen is attributed to a mapped account, so the feed shows no person tag"
    );
  } else {
    check(
      "a person tag lands in People with that person selected, and the label matches the panel it opened",
      personLanding.view === "people" &&
        personLanding.person === personTag.label &&
        personLanding.personId === personTag.id,
      `view ${personLanding.view ?? "none"}, panel ${personLanding.person ?? "none"} (wanted ${personTag.label})`
    );
  }

  // (5) A repository tag, from the Activity column this time (step 5 proved the threads section's). The axis
  // whose bucket can show one is derived from the projection, so the check looks where the tag must be rather
  // than where the previous landing happened to leave the page.
  const repositorySubject = await feedTagFromProjection("repository");
  if (repositorySubject.tag === null) {
    skip(
      "a repository tag in the Activity column lands in Repositories with that repository selected",
      repositorySubject.state === null
        ? "no event in this dataset's window names a repository, so no feed row renders a repository tag"
        : "the feed names a repository this dataset's rollup does not carry, so no tag renders for it"
    );
  } else {
    const repositoryLanding = await clickTag("repository", repositorySubject.tag.id);
    check(
      "a repository tag in the Activity column lands in Repositories with that repository selected",
      repositoryLanding.view === "repositories" &&
        repositoryLanding.repository === repositorySubject.tag.label &&
        repositoryLanding.repositoryId === repositorySubject.tag.id,
      `view ${repositoryLanding.view ?? "none"}, panel ${repositoryLanding.repository ?? "none"} (wanted ${repositorySubject.tag.label})`
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

  // (7) An axis tag *from the subview the problem tag just left*: the tag names the axis on screen, so
  // clicking it is the one traversal that changes the subject and the subview at once. A dataset with no
  // problem never reaches `Problems`, and the same rule is asserted from `Axes`.
  const beforeAxis = (await tagFromProgress("axis")).state;
  const axisTag = beforeAxis.context.find((entry) => entry.type === "axis") ?? null;
  const axisLanding = axisTag === null ? null : await clickTag("axis", axisTag.id);
  if (axisTag === null) {
    skip(
      "an axis tag lands in Progress/Axes with that axis selected, whichever subview it was clicked from",
      "the reading surface shows no axis tag — this dataset's projection carries no axis row to name"
    );
  } else {
    check(
      "an axis tag lands in Progress/Axes with that axis selected, whichever subview it was clicked from",
      axisLanding.view === "progress" &&
        axisLanding.progress.subview === "axes" &&
        axisLanding.progress.indexMode === "axes" &&
        axisLanding.progress.activeAxis === axisTag.id &&
        axisLanding.progress.activeAxisTitle === axisTag.label,
      `from ${beforeAxis.progress.subview ?? "?"}: subview ${axisLanding.progress.subview ?? "none"}, active ${axisLanding.progress.activeAxisTitle ?? "none"} (wanted ${axisTag.label})`
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
  // it would show.
  const after = JSON.stringify(await apiProgress(windowDaysNow));
  check(
    "the tag traversal wrote nothing: no write action was called and the projection is unchanged",
    writesSoFar() === baseline.writes && after === baseline.payload,
    `writes ${baseline.writes} -> ${writesSoFar()}; payload ${after === baseline.payload ? "identical" : "CHANGED"}`
  );
}

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
  //
  // The topics are derived from the projection, not from the page's default selection (`CORPUS.topic`) —
  // that is a *default selection*, and on an instance whose first card is another dataset's topic it is the
  // wrong expectation, which is how this check failed while the filter itself worked. Deriving is also
  // strictly stronger: it asserts the rendered topics are exactly the topics the surviving rails belong to.
  //
  // The axis row's topic field is `topicName` (the projection has no `topic` on a row), and a field name the
  // row does not have yields `null` for every rail rather than an error — the expectation collapses to an
  // empty list and the check goes red on *every* dataset, which is how it read until the corpus re-run.
  const topicOfAxis = (title) =>
    allProgress.axes.axes.find((row) => row.title === title)?.topicName ?? null;
  const expectedTopics = [...new Set(byRepository.rails.map(topicOfAxis).filter(Boolean))];
  const strayTopics = byRepository.topics.filter((topic) => !expectedTopics.includes(topic));
  const strayRails = byRepository.rails.filter((rail) => !repoAxes.includes(rail));
  check(
    "filtering by a repository keeps only the axes that name it, and says it is filtered",
    byRepository.rails.length >= 1 &&
      strayRails.length === 0 &&
      byRepository.topics.length === expectedTopics.length &&
      strayTopics.length === 0 &&
      byRepository.summary.includes("(filtered)"),
    `topics ${JSON.stringify(byRepository.topics)} (expected ${JSON.stringify(expectedTopics)}); ` +
      `rails ${JSON.stringify(byRepository.rails)} (stray ${JSON.stringify(strayRails)} of ${JSON.stringify(repoAxes)}); ` +
      `summary "${byRepository.summary}"`
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
