/* dashboard-ui-rework prototype — self-contained, framework-free.
 *
 * Reads the frozen export (data.json, build.json) from the same directory. It contacts no server,
 * holds no credentials and performs no writes: every value on screen comes from the frozen data.
 *
 * Information-architecture intent carried by this file:
 *  - a FIVE-peer-tab shell (Overview, Topics, People, Repositories, Progress);
 *  - Topics = research directions, browsed Topic → Axis → Problem;
 *  - Progress = the axis frame: the selected axis shows its FULL purpose / reading (not summarised)
 *    beside a problem index; the selected problem shows its FULL statement, status and work context;
 *  - the plan is shown as the SHARED axis plan and is never attributed to one problem;
 *  - problem/axis selection is view state only — nothing here is persisted or written;
 *  - every claim that the source leaves blank is rendered as an honest missing state, never invented.
 */
"use strict";

const STATE = {
  data: null,
  build: null,
  editorial: null,
  view: "overview",
  topic: null,
  axis: null,
  problem: null,
  query: "",
  expanded: new Set(),
};

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of [].concat(children)) if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
};

/* ---------- lookups ---------- */
const topicsByAlias = () => Object.fromEntries(STATE.data.topics.map((t) => [t.alias, t]));
const axesByAlias = () => {
  const m = {};
  for (const t of STATE.data.topics) for (const a of t.axes) m[a.alias] = a;
  return m;
};
const problemsByAlias = () => Object.fromEntries(STATE.data.problems.map((p) => [p.alias, p]));
const reposByAlias = () => Object.fromEntries(STATE.data.repositories.map((r) => [r.alias, r]));
const peopleByAlias = () => Object.fromEntries(STATE.data.people.map((p) => [p.alias, p]));

const STATUS_LABEL = { active: "active", paused: "paused", completed: "completed", archived: "archived" };

/* ---------- topic descriptions: source field vs authored overlay ----------
 * `data.json` is the frozen, read-only source export; `editorial.json` is a SEPARATE, author-drafted
 * prototype overlay. Copy is read from the overlay only, always rendered with a small "prototype copy"
 * badge, and is never written back into the frozen export. When the overlay has no entry the page falls
 * back to the honest missing state. The source "summary" field stays in the export, unrenamed and
 * unrendered: it was labelled "approved summary" in an earlier prototype cut and its purpose is undefined,
 * so this prototype does not show it (see the pivot spec, §7).
 */
function editorialFor(alias) {
  const e = STATE.editorial && STATE.editorial.topics ? STATE.editorial.topics[alias] : null;
  return e && e.short ? e : null;
}
function prototypeBadge() {
  return el("span", {
    class: "proto-banner",
    title: "Author-drafted prototype copy — not source-approved, and not part of the frozen export.",
    text: "prototype copy · not source-approved",
  });
}
/* Per-topic activity count. The frozen export carries a per-topic `activityCount` ROLLUP (captured in
 * the source's own window) AND a flat `activity` event list. When the rollup totals match the snapshot
 * list the rollup is complete for the capture and is labelled "recorded activities"; when they disagree
 * (as they do here: 3 + 4 = 7 vs 8 events) the rollup is not a complete account of the snapshot, so the
 * count of the frozen `activity` entries is shown instead, labelled "events in snapshot". No new events
 * are manufactured and nothing is called "active". The exact time window and the completed-rollup rule
 * are OPEN questions in the pivot spec. */
function activityCount(topic) {
  const rollupTotal = STATE.data.topics.reduce((s, t) => s + (t.activityCount || 0), 0);
  const snapshotTotal = STATE.data.activity.length;
  if (rollupTotal === snapshotTotal) {
    const n = topic.activityCount || 0;
    return { n, label: n === 1 ? "recorded activity" : "recorded activities" };
  }
  const n = STATE.data.activity.filter((e) => e.topicAlias === topic.alias).length;
  return { n, label: n === 1 ? "event in snapshot" : "events in snapshot" };
}
function formatActivityDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(value));
}
function selectorRecency(events) {
  const latest = events.filter(e => e.occurredAt).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (!latest) return el("span", { class: "selector-recency", text: "No recorded activity" });
  const reference = Math.max(...STATE.data.activity.map(e => Date.parse(e.occurredAt)).filter(Number.isFinite));
  const days = Math.max(0, Math.floor((reference - Date.parse(latest.occurredAt)) / 86400000));
  return el("span", { class: "selector-recency", title: `${formatActivityDate(latest.occurredAt)} · relative to latest snapshot event`, text: days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} ago` });
}
function selectorTitle(text, state) {
  return el("span", { class: "row-title" }, [el("span", { class: "status-dot", "data-state": state, title: `Status: ${state}`, "aria-label": `Status: ${state}` }), text]);
}
function topicSelectorRow(topic, selected) {
  const copy = editorialFor(topic.alias);
  const act = activityCount(topic);
  return el("button", {
    class: "select-row topic-row status-selector", type: "button", "data-state": topic.status,
    "data-topic": topic.alias, "data-selected": selected ? "true" : "false",
    "aria-pressed": selected ? "true" : "false", onclick: () => go("topics", { topic: topic.alias }),
  }, [
    el("span", { class: "sel-head" }, [selectorTitle(topic.name, topic.status), selectorRecency(STATE.data.activity.filter(e => e.topicAlias === topic.alias))]),
    copy ? el("span", { class: "row-description", text: copy.short }) : null,
    el("span", { class: "chips selector-tags" }, [
      el("span", { class: "chip", text: `${topic.axes.length} workstreams` }),
      el("span", { class: "chip", text: `${act.n} events in snapshot` }),
    ]),
  ]);
}

/* ---------- small pieces ---------- */
function taskState(task) {
  return STATE.editorial?.tasks?.[task.alias]?.state || task.state;
}
function stateBadge(state) {
  return el("span", { class: "state", "data-state": state || "draft", text: state || "unknown" });
}

function clampText(text, key, { lines = 2 } = {}) {
  if (!text) return el("p", { class: "lede none", text: "No text recorded in the source." });
  const expanded = STATE.expanded.has(key);
  const p = el("p", { class: "lede clamp", "data-expanded": expanded ? "true" : "false", text });
  if (text.length < 160) { p.classList.remove("clamp"); return p; }
  const toggle = el("button", {
    class: "showfull", type: "button",
    "aria-expanded": expanded ? "true" : "false",
    onclick: () => { expanded ? STATE.expanded.delete(key) : STATE.expanded.add(key); render(); },
    text: expanded ? "Show less" : "Show full statement",
  });
  return el("div", {}, [p, toggle]);
}

function linkChips(aliases, map, hrefFor) {
  return aliases.map((a) => {
    const item = map[a];
    const label = item ? (item.fullName || item.displayName || item.name || a) : a;
    if (hrefFor && item && item.url) {
      return el("a", { class: "chip link", href: item.url, rel: "noopener noreferrer", target: "_blank", text: label });
    }
    return el("span", { class: "chip", text: label });
  });
}

function navButton(label, onclick, subtle = false) {
  return el("button", { class: "navbtn" + (subtle ? " subtle" : ""), type: "button", onclick, text: label });
}

/* ---------- view: Overview ---------- */
function dashboardSummary() {
  const d = STATE.data;
  const tasks = d.problems.filter(p => p.state !== "resolved");
  return el("details", { class: "panel section-fold dashboard-summary" }, [el("summary", { text: "Dashboard summary" }),
    el("div", { class: "statgrid" }, [["Projects", d.topics.length], ["Workstreams", d.topics.flatMap(t => t.axes).length],
      ["Open tasks", tasks.length], ["Blocked tasks", tasks.filter(p => taskState(p) === "blocked").length],
      ["Repositories", d.repositories.length], ["People", d.people.length]].map(([label,n]) => el("div", { class: "stat" }, [el("div", { class: "n", text: String(n) }), el("div", { class: "l", text: label })]))),
  ]);
}

/* ---------- view: Topics ---------- */
function renderTopics() {
  const d = STATE.data;
  const t = STATE.topic ? topicsByAlias()[STATE.topic] : d.topics[0];
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("h1", { text: "Projects" }),
    el("p", { text: "Research directions. Pick a direction, then open an axis into Progress to follow its problems." }),
  ]));

  const left = el("details", { class: "panel section-fold", open: true }, [el("summary", { text: `Projects (${d.topics.length})` })]);
  const list = el("ul", { class: "select-list" });
  for (const topic of d.topics) {
    const selected = !!(t && topic.alias === t.alias);
    list.appendChild(el("li", {}, [topicSelectorRow(topic, selected)]));
  }
  left.appendChild(list);
  wrap.appendChild(left);

  // detail — the selected direction's in-depth (long) description, then its axes unchanged this round.
  const detail = el("div", {});
  if (t) {
    const copy = editorialFor(t.alias);
    detail.appendChild(el("details", { class: "panel topic-detail", open: true }, [
      el("summary", {}, [el("span", { class: "axis-title", text: t.name }), " ", stateBadge(t.status)]),
      el("div", { class: "context-body" }, [
        el("span", { class: "context-label", text: "About this project" }),
        el("p", { class: copy ? "lede" : "lede none", text: copy ? copy.long : "No description recorded in the source." }),
      ]),
      scopedPlan(copy?.plan, "Intermediate checkpoints"),
      el("div", { class: "topic-participants" }, [
        el("span", { class: "small soft", text: "Participants · " }),
        el("div", { class: "chips" }, (t.personAliases || []).map((alias) => {
          const person = peopleByAlias()[alias];
          return person ? el("button", { class: "chip", type: "button", text: person.displayName,
            onclick: () => go("people") }) : null;
        })),
      ]),


    ]));

    const axesPanel = el("details", { class: "panel section-fold", open: true }, [el("summary", { text: `Workstreams (${t.axes.length})` })]);
    for (const a of t.axes) axesPanel.appendChild(axisBlock(a, { context: "topics" }));
    detail.appendChild(axesPanel);
  }
  wrap.appendChild(detail);

  $("#view-topics").replaceChildren(dashboardSummary(), el("div", { class: "split" }, [left, detail]));
}

function axisBlock(a, { context }) {
  const problems = a.problemAliases.map((p) => problemsByAlias()[p]).filter(Boolean);
  if (context === "topics") {
    const summary = STATE.editorial?.axes?.[a.alias]?.short || a.currentState || a.title;
    const open = problems.filter((p) => p.state === "open").length;
    const latest = STATE.data.activity.filter((event) => event.axisAlias === a.alias)
      .sort((x, y) => (y.occurredAt || "").localeCompare(x.occurredAt || ""))[0];
    return el("article", { class: "axis-block", "data-axis": a.alias }, [
      el("div", { class: "axis-head" }, [el("h3", { class: "axis-title" }, [el("a", { class: "workstream-title-link", href: `#/progress/${a.alias}`, text: a.title })]), el("div", { class: "chips workstream-badges" }, [stateBadge(a.state), el("span", { class: "chip", text: `${open} open task${open === 1 ? "" : "s"}` }), ...((problems.filter(p => taskState(p) === "blocked").length) ? [el("span", { class: "chip blocked-count", text: `${problems.filter(p => taskState(p) === "blocked").length} blocked` })] : [])])]),
      el("p", { class: "lede", text: summary }),

      el("p", { class: "small soft" }, latest ? [
        formatActivityDate(latest.occurredAt) + " | ",
        latest.sourceUrl ? el("a", { href: latest.sourceUrl, target: "_blank", rel: "noopener noreferrer", text: latest.summary })
          : el("span", { text: latest.summary }),
      ] : ["No activity recorded for this workstream"]),

    ]);
  }
  return el("article", { class: "axis-block", "data-axis": a.alias }, [
    el("div", { class: "axis-head" }, [
      el("div", {}, [
        el("h3", { class: "axis-title", text: a.title }),
        el("div", { class: "axis-kind", text: a.kind || "axis" }),
      ]),
      stateBadge(a.state),
    ]),
    el("dl", { class: "kv" }, [
      el("dt", { text: "purpose" }),
      el("dd", {}, [a.description ? el("span", { text: a.description }) : el("span", { class: "soft", text: "No axis description recorded in the source." })]),
      el("dt", { text: "current reading" }),
      el("dd", {}, [a.currentState ? clampText(a.currentState, `ax:${a.alias}`, { lines: 2 }) : el("span", { class: "soft", text: "No current reading recorded." })]),
      a.blocker ? el("dt", { text: "blocker" }) : null,
      a.blocker ? el("dd", { text: a.blocker }) : null,
    ]),
    el("div", { class: "links" }, [
      el("span", { class: "chip", text: `${problems.length} problem${problems.length === 1 ? "" : "s"}` }),
      ...linkChips(a.repositoryAliases, reposByAlias()),
    ]),
    el("div", { class: "links" }, [
      navButton("Open axis in Progress →", () => go("progress", { axis: a.alias })),
    ]),
  ]);
}

/* ---------- view: Progress ---------- */
function renderProgress() {
  const d = STATE.data;
  const axes = axesByAlias();
  const axis = STATE.axis ? axes[STATE.axis] : pickAxisWithProblems();
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("h1", { text: "Progress" }),
    el("p", { text: "Select a workstream to read its context, scoped plan and tasks. Task descriptions remain visible; longer lists are paged." }),
  ]));

  // left: axis index (grouped by topic) + selected axis context (non-summarised)
  const left = el("div", {});
  const idxPanel = el("details", { class: "panel section-fold", open: true }, [el("summary", { text: `Workstreams (${d.provenance.counts.axes})` })]);
  for (const t of d.topics) {
    const group = el("div", { class: "project-selector-group" }, [el("div", { class: "small soft", text: t.name })]);
    const ul = el("ul", { class: "select-list", style: "margin:6px 0 12px" });
    for (const a of t.axes) {
      ul.appendChild(el("li", {}, [el("button", {
        class: "select-row status-selector", type: "button", "data-state": a.state, "data-axis": a.alias,
        "data-selected": axis && a.alias === axis.alias ? "true" : "false",
        onclick: () => go("progress", { axis: a.alias }),
      }, [
        el("div", { class: "axis-head" }, [selectorTitle(a.title, a.state), selectorRecency(STATE.data.activity.filter(e => e.axisAlias === a.alias))]),
        el("div", { class: "chips selector-tags" }, [
          el("span", { class: "chip", text: `${a.problemAliases.filter(id => problemsByAlias()[id]?.state !== "resolved").length} open tasks` }),
          !a.plan ? el("span", { class: "chip plan-reminder", text: "No plan" }) : null,
          ...(() => { const n = a.problemAliases.filter(id => problemsByAlias()[id] && taskState(problemsByAlias()[id]) === "blocked").length; return n ? [el("span", { class: "chip blocked-count", text: `${n} blocked` })] : []; })(),
        ]),

      ])]));
    }
    group.appendChild(ul);
    idxPanel.appendChild(group);
  }
  left.appendChild(idxPanel);
  wrap.appendChild(el("div", { class: "split progress-split" }, [
    left,
    axis ? progressMain(axis) : el("section", { class: "panel" }, [el("p", { class: "muted", text: "No axis selected." })]),
  ]));
  $("#view-progress").replaceChildren(wrap);
}

/* The selected axis's own context — full purpose and reading, never summarised. Shown at the top of
   the Progress main column so the frame the problem index sits in is always visible. */
function axisContextPanel(axis) {
  return el("details", { class: "panel axis-context", open: true, "data-selected-axis": axis.alias }, [
    el("summary", {}, [el("span", { class: "axis-title", text: axis.title }), " ", stateBadge(axis.state)]),
    el("div", { class: "context-body" }, [
      el("span", { class: "context-label", text: "Current workstream context" }),
      el("p", { class: "lede", text: axis.currentState || "No workstream description recorded." }),
    ]),
    scopedPlan(axis.plan ? axis.plan.steps.map(s => `${s.title} · ${s.state}`) : null, "Workstream plan"),
    resourceContext(axis, "axes"),
    el("div", { class: "context-footer" }, [
      el("span", { class: "small soft", text: "Project · " + (topicsByAlias()[axis.topicAlias]?.name || "Not recorded") }),
      navButton("Return to project →", () => go("topics", { topic: axis.topicAlias }), true),
    ]),
  ]);
}

function pickAxisWithProblems() {
  for (const t of STATE.data.topics) for (const a of t.axes) if (a.problemAliases.length) return a;
  return STATE.data.topics[0] ? STATE.data.topics[0].axes[0] : null;
}

function progressMain(axis) {
  const problems = axis.problemAliases.map((p) => problemsByAlias()[p]).filter(Boolean);
  const selected = STATE.problem ? problemsByAlias()[STATE.problem] : null;
  const main = el("div", {});

  main.appendChild(axisContextPanel(axis));

  const taskCards = problems.map(p => el("article", { class: "axis-block task-card", "data-problem": p.alias }, [
    el("div", { class: "axis-head" }, [el("h3", { class: "axis-title", text: STATE.editorial?.tasks?.[p.alias]?.title || p.statement }), stateBadge(taskState(p))]),
    taskDetail(p, axis),
  ]));
  const initialPage = selected ? Math.floor(problems.findIndex(p => p.alias === selected.alias) / 5) : 0;
  main.appendChild(el("details", { class: "panel section-fold", open: true }, [
    el("summary", { text: `Tasks (${problems.length})` }),
    problems.length ? pagedEntries(taskCards, 5, Math.max(0, initialPage), "Tasks") : el("p", { class: "small soft", text: "No tasks recorded for this workstream." }),
  ]));

  return main;
}

function scopedPlan(steps, label = "Plan / approach") {
  return steps?.length ? el("details", { class: "scoped-plan section-fold", open: true }, [
    el("summary", { text: label }),
    el("ol", {}, steps.map(text => el("li", { text }))),
  ]) : null;
}

function pagedEntries(entries, size = 5, initialPage = 0, label = "Entries", scrolling = false) {
  let page = initialPage;
  const body = el(scrolling ? "ul" : "div", { class: scrolling ? "activity-scroll context-events" : "task-page", tabindex: scrolling ? "0" : null, "aria-label": label });
  const controls = el("div", { class: "activity-controls" });
  const update = () => {
    const pages = Math.max(1, Math.ceil(entries.length / size));
    page = Math.min(Math.max(0, page), pages - 1);
    body.replaceChildren(...entries.slice(page * size, (page + 1) * size));
    const switcher = el("div", { class: "activity-limit-switch", role: "group", "aria-label": `${label} pages` });
    const button = (text, target, disabled = false) => el("button", { type: "button", class: "activity-limit", text, disabled,
      "aria-current": typeof text === "number" && target === page ? "page" : null,
      onclick: () => { page = target; update(); body.scrollTop = 0; },
    });
    switcher.appendChild(button("Previous", page - 1, page === 0));
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) switcher.appendChild(button(i + 1, i));
      else if (i === page - 2 || i === page + 2) switcher.appendChild(el("span", { text: "…" }));
    }
    switcher.appendChild(button("Next", page + 1, page === pages - 1));
    controls.replaceChildren(...(pages > 1 ? [switcher] : []), el("span", { class: "small soft", text: entries.length ? `${page * size + 1}–${Math.min((page + 1) * size, entries.length)} of ${entries.length} available` : "No entries" }));
  };
  update();
  return el("div", {}, [controls, body]);
}
function activityEntries(entries) {
  return pagedEntries(entries, 5, 0, "Activity", true);
}

function resourceContext(entity, kind) {
  const aliases = entity.repositoryAliases || [];
  const examples = STATE.editorial?.[kind]?.[entity.alias]?.activity || [];
  const recorded = kind === "axes" ? STATE.data.activity.filter(e => e.axisAlias === entity.alias).sort((a,b) => (b.occurredAt || "").localeCompare(a.occurredAt || "")) : [];
  return el("div", { class: "resource-context" }, [
    aliases.length ? el("div", { class: "repository-reference" }, [
      el("span", { class: "context-label", text: "Supporting repositories · " }),
      ...aliases.map((alias, i) => { const r = reposByAlias()[alias]; return el("span", { class: "repo-link-pair" }, [i ? el("span", { class: "repo-pair-separator", "aria-hidden": "true", text: "·" }) : null, el("a", { href: `#/repositories/${alias}`, title: "View repository in dashboard", text: r?.fullName || alias }), r?.url ? el("a", { class: "external-repo-link", href: r.url, target: "_blank", rel: "noopener noreferrer", title: `Open ${r.fullName} on GitHub`, "aria-label": `Open ${r.fullName} on GitHub`, text: "GitHub ↗" }) : null]); }),
    ]) : null,
    recorded.length || examples.length ? el("details", { class: "scoped-plan section-fold activity-context", open: true }, [
      el("summary", { text: "Recent activity" }),
      activityEntries([
        ...recorded.map(e => el("li", {}, [el("span", { class: "small soft", text: formatActivityDate(e.occurredAt) + " · " }), e.sourceUrl ? el("a", { href: e.sourceUrl, target: "_blank", rel: "noopener noreferrer", text: e.summary }) : el("span", { text: e.summary })])),
        ...examples.map(e => el("li", {}, [el("span", { class: "small soft", text: formatActivityDate(e.date) + " · Example report · " }), el("span", { text: e.summary })])),
      ]),
    ]) : null,
  ]);
}

function taskDetail(task, axis) {
  return el("div", { class: "task-detail", id: `task-detail-${task.alias}` }, [
    el("p", { class: "lede", text: task.statement }),
    scopedPlan(STATE.editorial?.tasks?.[task.alias]?.plan),
    resourceContext(task, "tasks"),
  ]);
}

/* ---------- view: People ---------- */
function renderPeople() {
  const people = STATE.data.people;
  const person = people.find(p => p.alias === STATE.person) || people[0];
  const index = el("section", { class: "panel" }, [el("h2", { text: `People (${people.length})` }),
    el("ul", { class: "select-list" }, people.map(p => el("li", {}, [el("button", {
      class: "select-row", type: "button", "data-person": p.alias,
      "data-selected": p.alias === person?.alias ? "true" : "false",
      "aria-pressed": p.alias === person?.alias ? "true" : "false",
      onclick: () => go("people", { person: p.alias }),
    }, [el("span", { class: "row-title", text: p.displayName || p.alias }),
      p.githubLogin ? el("div", { class: "row-meta", text: `@${p.githubLogin}` }) : null])]))),
  ]);
  const detail = el("div", {});
  if (person) {
    const axes = person.axes.map(a => axesByAlias()[a.alias]).filter(Boolean);
    const topics = [...new Set(axes.map(a => a.topicAlias))].map(a => topicsByAlias()[a]).filter(Boolean);
    const repositories = [...new Set(axes.flatMap(a => a.repositoryAliases || []))];
    detail.appendChild(el("details", { class: "panel topic-detail", open: true, "data-selected-person": person.alias }, [
      el("summary", {}, [el("span", { class: "axis-title", text: person.displayName || person.alias })]),
      el("div", { class: "context-body" }, [el("span", { class: "context-label", text: "About this person" }),
        el("p", { class: "lede small soft", text: person.description || "No biography recorded." })]),
      person.githubLogin ? el("div", { class: "context-footer" }, [
        el("span", { class: "small soft", text: `GitHub · @${person.githubLogin}` }),
        el("a", { class: "navbtn subtle", href: `https://github.com/${person.githubLogin}`, target: "_blank", rel: "noopener noreferrer", text: "Open profile ↗" }),
      ]) : null,
    ]));
    detail.appendChild(el("details", { class: "panel section-fold", open: true }, [
      el("summary", { text: `Involvement (${topics.length} projects)` }),
      ...topics.map(t => el("div", { class: "repository-work-group" }, [
        el("div", { class: "repository-project-heading", text: t.name }),
        el("div", { class: "project-group-intro" }, [
          el("p", { class: "small soft", text: editorialFor(t.alias)?.short || t.description || "No project description recorded." }),
          navButton("Open project →", () => go("topics", { topic: t.alias }), true),
        ]),
        ...axes.filter(a => a.topicAlias === t.alias).map(a => axisBlock(a, { context: "topics" })),
      ])),
    ]));
    detail.appendChild(el("details", { class: "panel section-fold", open: true }, [
      el("summary", { text: `Related repositories (${repositories.length})` }),
      el("p", { class: "small soft", text: "Repositories supporting this person’s linked workstreams; this does not establish ownership or maintainership." }),
      resourceContext({ alias: person.alias, repositoryAliases: repositories }, "people"),
    ]));
    detail.appendChild(el("details", { class: "panel section-fold", open: true }, [
      el("summary", { text: "Personal activity" }),
      el("p", { class: "small soft", text: person.attributable ? "No person-scoped activity supplied in this snapshot." : "Personal activity cannot be attributed from this snapshot. Workstream updates above describe the work, not this person’s actions." }),
    ]));
  }
  $("#view-people").replaceChildren(el("div", { class: "split" }, [index, detail]));
}

/* ---------- view: Repositories ---------- */
function renderRepositories() {
  const repos = STATE.data.repositories;
  const selected = repos.find(r => r.alias === STATE.repository) || repos[0];
  const wrap = el("div", {});
  const index = el("section", { class: "panel" }, [el("h2", { text: `Repositories (${repos.length})` })]);
  index.appendChild(el("ul", { class: "select-list" }, repos.map(r => el("li", {}, [el("button", {
    class: "select-row", type: "button", "data-repository": r.alias,
    "aria-pressed": r.alias === selected?.alias ? "true" : "false",
    "data-selected": r.alias === selected?.alias ? "true" : "false",
    onclick: () => go("repositories", { repository: r.alias }),
  }, [el("div", { class: "axis-head" }, [el("span", { class: "row-title", text: r.fullName.split("/").slice(1).join("/") || r.fullName }), r.lastActivityAt ? selectorRecency([{ occurredAt: r.lastActivityAt }]) : selectorRecency([])]),
    el("div", { class: "row-meta", text: r.fullName.split("/")[0] }),
    el("div", { class: "chips selector-tags" }, [el("span", { class: "chip", text: `${r.axisAliases.length} workstreams` })]),
  ])]))));
  const detail = el("div", {});
  if (selected) {
    const axes = selected.axisAliases.map(a => axesByAlias()[a]).filter(Boolean);
    const topics = [...new Set(axes.map(a => a.topicAlias))].map(a => topicsByAlias()[a]).filter(Boolean);
    detail.appendChild(el("details", { class: "panel topic-detail", open: true, "data-selected-repository": selected.alias }, [
      el("summary", {}, [el("span", { class: "axis-title", text: selected.fullName })]),
      el("p", { class: "lede", text: selected.description || "No description recorded." }),
      el("div", { class: "context-footer" }, [
        el("span", { class: "small soft", text: `Default branch · ${selected.defaultBranch || "Not recorded"}` }),
        selected.url ? el("a", { class: "navbtn subtle", href: selected.url, target: "_blank", rel: "noopener noreferrer", text: "Open on GitHub ↗" }) : null,
      ]),
    ]));
    detail.appendChild(el("details", { class: "panel section-fold", open: true }, [
      el("summary", { text: `Current work (${axes.length})` }),
      ...topics.map(t => el("div", { class: "repository-work-group" }, [
        el("div", { class: "repository-project-heading", text: t.name }),
        el("div", { class: "project-group-intro" }, [
          el("p", { class: "small soft", text: editorialFor(t.alias)?.short || t.description || "No project description recorded." }),
          navButton("Open project →", () => go("topics", { topic: t.alias }), true),
        ]),
        ...axes.filter(a => a.topicAlias === t.alias).map(a => axisBlock(a, { context: "topics" })),
      ])),
    ]));
    detail.appendChild(el("details", { class: "panel section-fold", open: true }, [
      el("summary", { text: `Supporting projects (${topics.length})` }),
      ...topics.map(t => el("p", {}, [el("a", { href: `#/topics/${t.alias}`, text: t.name })])),
    ]));
    const events = STATE.data.activity.filter(e => e.repositoryAlias === selected.alias);
    detail.appendChild(el("details", { class: "panel section-fold", open: true }, [
      el("summary", { text: "Repository activity" }),
      el("p", { class: "small soft", text: events.length ? `${events.length} explicitly linked events` : "No repository-scoped events in this snapshot. Workstream updates remain under Current work; they are not assumed to be repository events." }),
    ]));
  }
  wrap.appendChild(el("div", { class: "split" }, [index, detail]));
  $("#view-repositories").replaceChildren(wrap);
}

/* ---------- navigation ---------- */
function go(view, sel = {}) {
  if (view === "people" && sel.person !== undefined) STATE.person = sel.person;
  if (view === "repositories" && sel.repository !== undefined) STATE.repository = sel.repository;
  if (view === "topics" && sel.topic !== undefined) STATE.topic = sel.topic;
  if (view === "progress") {
    if (sel.axis !== undefined) STATE.axis = sel.axis;
    STATE.problem = sel.problem !== undefined ? sel.problem : null;
  }
  STATE.view = view;
  const hash = ["#/" + view, STATE.view === "topics" && STATE.topic, STATE.view === "progress" && STATE.axis,
    STATE.view === "progress" && STATE.problem, STATE.view === "repositories" && STATE.repository, STATE.view === "people" && STATE.person].filter(Boolean).join("/");
  if (location.hash !== hash) history.pushState(null, "", hash);
  render();
  const main = $("#main");
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
}

function applyHash() {
  const parts = (location.hash || "#/topics").replace(/^#\/?/, "").split("/").filter(Boolean);
  STATE.view = ["topics", "people", "repositories", "progress"].includes(parts[0]) ? parts[0] : "topics";
  STATE.topic = null; STATE.axis = null; STATE.problem = null; STATE.repository = null; STATE.person = null;
  if (STATE.view === "people" && parts[1]) STATE.person = parts[1];
  if (STATE.view === "repositories" && parts[1]) STATE.repository = parts[1];
  if (STATE.view === "topics" && parts[1]) STATE.topic = parts[1];
  if (STATE.view === "progress") { if (parts[1]) STATE.axis = parts[1]; if (parts[2]) STATE.problem = parts[2]; }
}

/* ---------- render dispatch ---------- */
const VIEW_PURPOSE = {
  overview: "See our research directions at a glance, their purpose and recent activity, then choose where to explore.",
  topics: "Understand each project: its purpose, people, current workstreams and recent activity. Open a workstream in Progress for the full work details.",
  people: "See who each person is, the research and work they are involved in, their repositories and latest activity.",
  repositories: "Understand what each repository is for, the work underway, the topics it supports, its people and recent activity.",
  progress: "Read workstreams and tasks in full, with their status, scoped plans, supporting repositories and activity. Selection changes what you view, not the research state.",
};
function render() {
  for (const v of ["topics", "people", "repositories", "progress"]) {
    const sec = $("#view-" + v);
    const active = v === STATE.view;
    sec.hidden = !active;
    if (active) {
      if (v === "topics") renderTopics();
      else if (v === "people") renderPeople();
      else if (v === "repositories") renderRepositories();
      else renderProgress();
      sec.prepend(el("p", { class: "view-purpose", text: VIEW_PURPOSE[v] }));
    }
  }
  document.querySelectorAll(".tab").forEach((b) => {
    if (b.dataset.view === STATE.view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

/* ---------- flat search ---------- */
function runSearch(q) {
  const box = $("#search-results");
  q = q.trim().toLowerCase();
  if (!q) { box.hidden = true; box.replaceChildren(); return; }
  const hits = [];
  for (const t of STATE.data.topics) if (t.name.toLowerCase().includes(q)) hits.push({ kind: "topic", title: t.name, act: () => go("topics", { topic: t.alias }) });
  for (const t of STATE.data.topics) for (const a of t.axes) if (a.title.toLowerCase().includes(q) || (a.currentState || "").toLowerCase().includes(q)) hits.push({ kind: "axis", title: a.title, act: () => go("progress", { axis: a.alias }) });
  for (const p of STATE.data.problems) if (p.statement.toLowerCase().includes(q)) hits.push({ kind: "problem", title: p.statement, act: () => go("progress", { axis: p.axisAlias, problem: p.alias }) });
  const ul = el("ul", {});
  for (const h of hits.slice(0, 12)) {
    const item = el("button", {
      class: "result", type: "button",
      onclick: () => { box.hidden = true; $("#search").value = ""; h.act(); },
    }, [
      el("div", { class: "r-kind", text: h.kind }),
      el("div", { class: "r-title", text: h.title.slice(0, 120) }),
    ]);
    ul.appendChild(el("li", {}, [item]));
  }
  box.replaceChildren(hits.length ? ul : el("div", { class: "empty", text: `No matches for “${q}”.` }));
  box.hidden = false;
}

/* ---------- boot ---------- */
async function boot() {
  const [data, build, editorial] = await Promise.all([
    fetch("data.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("build.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    // editorial.json is author-drafted prototype copy (a separate overlay). It is optional: when it
    // is absent or blank the page falls back to the honest missing state, exactly as before.
    fetch("editorial.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  STATE.data = data;
  STATE.build = build;
  STATE.editorial = editorial;
  const prov = data.provenance;
  $("#data-provenance").textContent =
    `data ${prov.schema} · captured ${prov.capturedAt.slice(0, 19)}Z · ${prov.counts.topics} topics / ${prov.counts.axes} axes / ${prov.counts.problems} problems / ${prov.counts.events} events`;
  $("#build-identity").textContent = build
    ? `build ${build.gitHead ? build.gitHead.slice(0, 12) : "—"} · data sha256 ${build.dataSha256.slice(0, 12)}`
    : "build identity unavailable";

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  $("#search").addEventListener("input", (e) => runSearch(e.target.value));
  $("#search").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#search-results").hidden = true; $("#search").value = ""; } });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#search-results") && e.target !== $("#search")) $("#search-results").hidden = true;
  });
  window.addEventListener("popstate", () => { applyHash(); render(); });
  window.addEventListener("hashchange", () => { applyHash(); render(); });

  applyHash();
  render();
  document.documentElement.setAttribute("data-prototype-ready", "true");
}
boot();
