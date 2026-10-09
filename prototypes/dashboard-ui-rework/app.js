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

/* ---------- small pieces ---------- */
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
function renderOverview() {
  const d = STATE.data;
  const c = d.provenance.counts;
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("h1", { text: "Overview" }),
    el("p", { text: "Baseline signal from the frozen export — counts, the research directions in play, and the most recent recorded work." }),
  ]));

  const stats = [["Topics", c.topics], ["Development axes", c.axes], ["Open problems", c.problems],
    ["Repositories", c.repositories], ["People", c.people], ["Recorded events", c.events]];
  wrap.appendChild(el("div", { class: "statgrid" }, stats.map(([l, n]) =>
    el("div", { class: "stat" }, [el("div", { class: "n", text: String(n) }), el("div", { class: "l", text: l })]))));

  const topicsPanel = el("section", { class: "panel" }, [el("h2", { text: "Research directions" })]);
  const tl = el("ul", { class: "select-list" });
  for (const t of d.topics) {
    tl.appendChild(el("li", {}, [el("button", {
      class: "select-row", type: "button", "data-topic": t.alias,
      onclick: () => go("topics", { topic: t.alias }),
    }, [
      el("div", { class: "axis-head" }, [
        el("span", { class: "row-title", text: t.name }),
        stateBadge(t.status),
      ]),
      el("div", { class: "row-meta", text: `${t.axes.length} development axes · ${t.activityCount} recorded activities` }),
    ])]));
  }
  topicsPanel.appendChild(tl);
  wrap.appendChild(topicsPanel);

  const act = el("section", { class: "panel" }, [el("h2", { text: "Recent activity" })]);
  const al = el("ul", { class: "activity-list" });
  for (const e of d.activity.slice(0, 8)) {
    const t = topicsByAlias()[e.topicAlias];
    al.appendChild(el("li", {}, [
      el("div", { text: e.summary || "(no summary)" }),
      el("div", { class: "small soft", text: `${t ? t.name : e.topicAlias || "—"} · ${e.sourceType || "event"} · ${(e.occurredAt || "").slice(0, 10)}` }),
    ]));
  }
  act.appendChild(al);
  wrap.appendChild(act);
  $("#view-overview").replaceChildren(wrap);
}

/* ---------- view: Topics ---------- */
function renderTopics() {
  const d = STATE.data;
  const t = STATE.topic ? topicsByAlias()[STATE.topic] : d.topics[0];
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("h1", { text: "Topics" }),
    el("p", { text: "Research directions. Pick a direction, then open an axis into Progress to follow its problems." }),
  ]));

  const left = el("section", { class: "panel" }, [el("h2", { text: `Research directions (${d.topics.length})` })]);
  const list = el("ul", { class: "select-list" });
  for (const topic of d.topics) {
    const selected = t && topic.alias === t.alias;
    const blocker = firstBlocker(topic);
    const rowBody = el("div", {
      class: "select-row", "data-topic": topic.alias, "data-selected": selected ? "true" : "false",
    }, [
      el("div", { class: "axis-head" }, [
        el("span", { class: "row-title", text: topic.name }),
        stateBadge(topic.status),
      ]),
      el("div", { class: "row-purpose" }, [clampText(topicPurpose(topic), `tp:${topic.alias}`)]),
      el("div", { class: "row-meta" }, [
        el("span", { text: `${topic.axes.length} axes · ${topic.activityCount} activities · ` }),
        ...linkChips(topic.personAliases, peopleByAlias()),
      ]),
      blocker ? el("div", { class: "row-meta" }, [el("span", { class: "soft", text: "Blocker: " }), el("span", { text: blocker })]) : null,
      el("div", { class: "links" }, [
        selected ? el("span", { class: "chip", text: "● selected" }) : navButton("Select", () => go("topics", { topic: topic.alias }), true),
        navButton("Open axis →", () => {
          const withAxis = topic.axes.find((a) => a.problemAliases.length) || topic.axes[0];
          go("progress", { axis: withAxis ? withAxis.alias : null });
        }),
      ]),
    ]);
    const row = el("li", {}, [rowBody]);
    list.appendChild(row);
  }
  left.appendChild(list);
  wrap.appendChild(left);

  // detail
  const detail = el("div", {});
  if (t) {
    detail.appendChild(el("section", { class: "panel" }, [
      el("div", { class: "axis-head" }, [el("h1", { class: "axis-title", text: t.name }), stateBadge(t.status)]),
      el("div", { class: "links" }, [
        ...linkChips(t.repositoryAliases, reposByAlias()),
        ...linkChips(t.personAliases, peopleByAlias()),
      ]),
      el("dl", { class: "kv" }, [
        el("dt", { text: "description" }),
        el("dd", {}, [t.description ? el("span", { text: t.description }) : el("span", { class: "soft", text: "No description recorded in the source." })]),
        el("dt", { text: "approved summary" }),
        el("dd", {}, [t.summary ? el("span", { text: t.summary }) : el("span", { class: "soft", text: "No approved summary recorded in the source." })]),
      ]),
    ]));

    const axesPanel = el("section", { class: "panel" }, [el("h2", { text: `Development axes (${t.axes.length})` })]);
    for (const a of t.axes) axesPanel.appendChild(axisBlock(a, { context: "topics" }));
    detail.appendChild(axesPanel);
  }
  wrap.appendChild(detail);

  $("#view-topics").replaceChildren(el("div", { class: "split" }, [left, detail]));
}

function topicPurpose(topic) {
  return topic.description || topic.summary || "";
}

function firstBlocker(topic) {
  for (const a of topic.axes) if (a.blocker) return a.blocker;
  return "";
}

function axisBlock(a, { context }) {
  const problems = a.problemAliases.map((p) => problemsByAlias()[p]).filter(Boolean);
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
    el("p", { text: "The axis frame. The selected axis shows its full purpose and reading; the problem index lists its open work; the selected problem shows its full statement and context." }),
  ]));

  // left: axis index (grouped by topic) + selected axis context (non-summarised)
  const left = el("div", {});
  const idxPanel = el("section", { class: "panel" }, [el("h2", { text: `Development axes (${d.provenance.counts.axes})` })]);
  for (const t of d.topics) {
    idxPanel.appendChild(el("div", { class: "small soft", text: t.name }));
    const ul = el("ul", { class: "select-list", style: "margin:6px 0 12px" });
    for (const a of t.axes) {
      ul.appendChild(el("li", {}, [el("button", {
        class: "select-row", type: "button", "data-axis": a.alias,
        "data-selected": axis && a.alias === axis.alias ? "true" : "false",
        onclick: () => go("progress", { axis: a.alias }),
      }, [
        el("div", { class: "axis-head" }, [el("span", { class: "row-title", text: a.title }), stateBadge(a.state)]),
        el("div", { class: "row-meta", text: `${a.problemAliases.length} open problem${a.problemAliases.length === 1 ? "" : "s"}${a.plan ? " · has plan" : ""}` }),
      ])]));
    }
    idxPanel.appendChild(ul);
  }
  left.appendChild(idxPanel);
  wrap.appendChild(el("div", { class: "split-wide" }, [
    left,
    axis ? progressMain(axis) : el("section", { class: "panel" }, [el("p", { class: "muted", text: "No axis selected." })]),
  ]));
  $("#view-progress").replaceChildren(wrap);
}

/* The selected axis's own context — full purpose and reading, never summarised. Shown at the top of
   the Progress main column so the frame the problem index sits in is always visible. */
function axisContextPanel(axis) {
  return el("section", { class: "panel axis-context", "data-selected-axis": axis.alias }, [
    el("h2", { text: "Selected axis — full context" }),
    el("div", { class: "axis-head" }, [el("h3", { class: "axis-title", text: axis.title }), stateBadge(axis.state)]),
    el("dl", { class: "kv" }, [
      el("dt", { text: "kind" }), el("dd", { text: axis.kind || "axis" }),
      el("dt", { text: "purpose" }),
      el("dd", {}, [axis.description ? el("span", { text: axis.description }) : el("span", { class: "soft", text: "No axis description recorded in the source — shown as absent, never invented." })]),
      el("dt", { text: "current reading" }),
      el("dd", {}, [axis.currentState ? el("span", { text: axis.currentState }) : el("span", { class: "soft", text: "No current reading recorded." })]),
      axis.blocker ? el("dt", { text: "blocker" }) : null,
      axis.blocker ? el("dd", { text: axis.blocker }) : null,
    ]),
    el("div", { class: "links" }, [...linkChips(axis.repositoryAliases, reposByAlias())]),
    el("div", { class: "links" }, [
      navButton("Open owning topic", () => go("topics", { topic: axis.topicAlias }), true),
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

  main.appendChild(el("section", { class: "panel" }, [
    el("h2", { text: `Problem index — ${axis.title} (${problems.length})` }),
    problems.length === 0
      ? el("div", { class: "banner", text: "No problems are attached to this axis in the source." })
      : el("ul", { class: "problist" }, problems.map((p) => el("li", {}, [el("button", {
          class: "select-row", type: "button", "data-problem": p.alias,
          "data-selected": selected && p.alias === selected.alias ? "true" : "false",
          onclick: () => go("progress", { axis: axis.alias, problem: p.alias }),
        }, [
          el("div", { class: "axis-head" }, [el("span", { class: "row-title clamp", "data-expanded": "false", text: p.statement }), stateBadge(p.state)]),
          el("div", { class: "row-meta", text: `${p.planStepTitle ? "plan step: " + p.planStepTitle : "no plan step"} · ${(p.recencyAt || "").slice(0, 10)}` }),
        ])]))),
  ]));

  // axis plan (SHARED — never attributed to a problem)
  if (axis.plan) {
    main.appendChild(el("section", { class: "panel plan" }, [
      el("div", { class: "plan-label", text: "Axis plan — shared by this axis, not owned by any single problem" }),
      el("h3", { class: "axis-title", text: axis.plan.summary || "Plan" }),
      el("ol", {}, axis.plan.steps.map((s) =>
        el("li", {}, [el("span", { text: s.title }), el("span", { class: "step-state", text: `· ${s.state} · stored position ${s.position}` })]))),
    ]));
  }

  if (selected) {
    main.appendChild(el("section", { class: "panel" }, [
      el("button", { class: "backlink", type: "button", onclick: () => go("progress", { axis: axis.alias }), text: "← Back to the axis" }),
      el("h2", { text: "Selected problem" }),
      clampText(selected.statement, `pm:${selected.alias}`, { lines: 3 }),
      el("dl", { class: "kv" }, [
        el("dt", { text: "status" }), el("dd", { text: selected.state }),
        el("dt", { text: "axis blocker" }),
        el("dd", {}, [axis.blocker ? el("span", { text: axis.blocker }) : el("span", { class: "soft", text: "No axis blocker recorded." })]),
        el("dt", { text: "work context" }),
        el("dd", {}, [el("span", { class: "small", text: `axis “${axis.title}”${selected.planStepTitle ? ` · plan step “${selected.planStepTitle}”` : " · no plan step"}` })]),
        el("dt", { text: "repositories" }),
        el("dd", {}, [selected.repositoryAliases.length ? el("span", { text: selected.repositoryAliases.map((r) => (reposByAlias()[r] || {}).fullName || r).join(", ") }) : el("span", { class: "soft", text: "None recorded." })]),
      ]),
    ]));
  } else {
    main.appendChild(el("div", { class: "banner" }, [el("strong", { text: "Select a problem" }), " to see its full statement, status and work context. Selection is view-only — nothing is written."]));
  }
  return main;
}

/* ---------- view: People ---------- */
function renderPeople() {
  const d = STATE.data;
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("h1", { text: "People" }),
    el("p", { text: "People recorded against the research state, and the axes they are attached to." }),
  ]));
  const grid = el("div", { class: "cardgrid" });
  for (const p of d.people) {
    grid.appendChild(el("section", { class: "panel" }, [
      el("h3", { text: p.displayName || p.alias }),
      el("div", { class: "small soft", text: p.githubLogin ? `@${p.githubLogin}` : "no public handle" }),
      el("div", { class: "links" }, [el("span", { class: "chip", text: `${p.axes.length} axes` }),
        el("span", { class: "chip", text: p.attributable ? "activity attributable" : "no account mapped — attribution narrow" })]),
      el("ul", { class: "small", style: "margin:10px 0 0; padding-left:18px" }, p.axes.map((a) =>
        el("li", {}, [el("button", { class: "backlink", type: "button", onclick: () => go("progress", { axis: a.alias }), text: `${a.title} — ${a.state}` })]))),
    ]));
  }
  wrap.appendChild(grid);
  $("#view-people").replaceChildren(wrap);
}

/* ---------- view: Repositories ---------- */
function renderRepositories() {
  const d = STATE.data;
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("h1", { text: "Repositories" }),
    el("p", { text: "The codebases the research state names, with their factual description, default branch and linked axes." }),
  ]));
  const grid = el("div", { class: "cardgrid" });
  for (const r of d.repositories) {
    grid.appendChild(el("section", { class: "panel" }, [
      el("h3", { text: r.fullName }),
      el("div", { class: "small soft", text: `default branch: ${r.defaultBranch || "—"}` }),
      el("p", { class: "small", text: r.description || "No description recorded." }),
      el("div", { class: "links" }, r.url ? [el("a", { class: "chip link", href: r.url, target: "_blank", rel: "noopener noreferrer", text: "Open on GitHub ↗" })] : []),
      el("div", { class: "links" }, r.axisAliases.map((a) => el("button", { class: "chip", type: "button", onclick: () => go("progress", { axis: a }), text: (axesByAlias()[a] || {}).title || a }))),
    ]));
  }
  wrap.appendChild(grid);
  $("#view-repositories").replaceChildren(wrap);
}

/* ---------- navigation ---------- */
function go(view, sel = {}) {
  if (view === "topics" && sel.topic !== undefined) STATE.topic = sel.topic;
  if (view === "progress") {
    if (sel.axis !== undefined) STATE.axis = sel.axis;
    STATE.problem = sel.problem !== undefined ? sel.problem : null;
  }
  STATE.view = view;
  const hash = ["#/" + view, STATE.view === "topics" && STATE.topic, STATE.view === "progress" && STATE.axis,
    STATE.view === "progress" && STATE.problem].filter(Boolean).join("/");
  if (location.hash !== hash) history.pushState(null, "", hash);
  render();
  const main = $("#main");
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
}

function applyHash() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  STATE.view = ["overview", "topics", "people", "repositories", "progress"].includes(parts[0]) ? parts[0] : "overview";
  STATE.topic = null; STATE.axis = null; STATE.problem = null;
  if (STATE.view === "topics" && parts[1]) STATE.topic = parts[1];
  if (STATE.view === "progress") { if (parts[1]) STATE.axis = parts[1]; if (parts[2]) STATE.problem = parts[2]; }
}

/* ---------- render dispatch ---------- */
function render() {
  for (const v of ["overview", "topics", "people", "repositories", "progress"]) {
    const sec = $("#view-" + v);
    const active = v === STATE.view;
    sec.hidden = !active;
    if (active) {
      if (v === "overview") renderOverview();
      else if (v === "topics") renderTopics();
      else if (v === "people") renderPeople();
      else if (v === "repositories") renderRepositories();
      else renderProgress();
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
  const [data, build] = await Promise.all([
    fetch("data.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("build.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  STATE.data = data;
  STATE.build = build;
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
