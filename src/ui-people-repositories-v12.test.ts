/**
 * Source UI test — V12 People and Repositories composition (the accepted Tinted relationship views).
 *
 * The V12 pass (2026-10-13) rebuilds People and Repositories on the shared Tinted grammar the Projects and
 * Progress views already use — a named selector rail whose heading sits level with the selected-entity
 * hero, an unboxed detail opening on the hero's kicker, the shared dominant-lane-plus-aside body grid, and
 * the entity's own activity full width at the foot of the detail — while preserving every distinct scope:
 *
 *   People — direct workstream involvement stays separate from project-only affiliations; the named
 *   affiliations are visibly available (the native disclosure opens by default) with each project id kept as
 *   the exact navigable topic `EntityTag`, never relabelled as direct work; About / mapped-account honest
 *   missing states and the related repositories are preserved, and the actor-scoped activity (with its real
 *   backend pager) reads full width at the bottom, not in a permanent side rail.
 *
 *   Repositories — the nonterminal/historical work partition and its counts are untouched, the explicit
 *   people and supported-workstream relationships survive, the internal dashboard entry and the external
 *   URL stay separate links, and the **directly scoped** repository activity reads full width at the bottom,
 *   distinct from the related-workstream recency stated in the hero (no union).
 *
 * Composition and facts only — the file reads the rendered source, the way the other ui-*.test.ts files do;
 * it never asserts a frozen pixel layout. The pure partition helpers keep their own tests.
 */
import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();

/** The position of the first occurrence of `needle` at or after `from`, or -1 — never coerced. */
const at = (needle: string, from = 0): number => source.indexOf(needle, from);
/** The slice of the rail that owns `[data-rd-person-rail]` / `[data-rd-repository-rail]`, to its close. */
const railBlock = (marker: string): string => {
  const start = at(marker);
  return start < 0 ? "" : source.slice(start, at("</aside>", start));
};

describe("V12 People — the named selector rail and the selected-person hero", () => {
  test("a visible People heading + its instruction lead the rail, on the shared index-head grammar", () => {
    const rail = at('className="rd-person-rail" data-rd-person-rail-view="true"');
    expect(rail).toBeGreaterThan(-1);
    expect(at('<h2 className="rd-index-title">People</h2>')).toBeGreaterThan(rail);
    expect(source).toContain(
      '<p className="rd-meta">Choose a person · direct and project-only relationships distinguished</p>',
    );
  });

  test("the rail is the split's first column, ahead of the selected-person detail", () => {
    const rail = at('className="rd-person-rail" data-rd-person-rail-view="true"');
    const index = at('className="rd-index rd-person-index"');
    const detail = at("{selected ? (", rail);
    expect(rail).toBeLessThan(index);
    expect(index).toBeLessThan(detail);
  });

  test("a kicker names the selection, then the prominent name, then one factual involvement line", () => {
    const kicker = at('className="rd-hero-kicker" data-rd-person-kicker="true"');
    expect(kicker).toBeGreaterThan(-1);
    expect(source.slice(kicker, kicker + 120)).toContain("Selected person");
    expect(at('className="rd-row rd-detail-title-row"', kicker)).toBeGreaterThan(kicker);
    expect(source.slice(kicker, kicker + 900)).toContain('data-rd-person-counts="true"');
  });

  test("the index and its selection guard are preserved", () => {
    expect(source).toContain("data-rd-people={people.length}");
    expect(source).toContain("aria-pressed={selected?.person.id === entry.person.id}");
    expect(source).toContain("data-rd-person-recency=");
  });
});

describe("V12 People — direct involvement stays separate from the named project-only affiliations", () => {
  test("the involvement lane still partitions with the exported helper", () => {
    expect(source).toContain(
      "const { bearing: bearingProjects, projectOnly } = partitionInvolvements(",
    );
    // The lane's own marker still states the true total (both partitions together).
    expect(source).toContain("data-rd-person-topics={entry.topics.length}");
  });

  test("the project-only affiliations are named and navigable, not a count-only collapsed fold", () => {
    const aff = at('className="rd-affiliations"');
    expect(aff).toBeGreaterThan(-1);
    // The native disclosure is open by default, so every affiliation is visibly available…
    const head = source.slice(aff, aff + 220);
    expect(head).toContain("data-rd-person-affiliations={projectOnly.length}");
    expect(head).toContain('<h4 className="rd-affiliations-summary">');
    // …and each is an exact navigable topic EntityTag with its recorded status · role.
    const block = source.slice(aff, aff + 1600);
    expect(block).toContain('data-rd-involvement={involvement.topic.name}');
    expect(block).toContain("id={involvement.topic.id}");
    expect(block).toContain('type="topic"');
    // An affiliation is not relabelled as direct work: no workstream card renders in the affiliation list.
    expect(block).not.toContain("WorkstreamCard");
  });

  test("a bearing project keeps its own workstream group, distinct from the affiliation list", () => {
    const bearing = at("bearingProjects.map((involvement) => (");
    const section = source.slice(bearing, bearing + 400);
    expect(section).toContain('className="rd-project-group"');
    expect(section).toContain("data-rd-involvement={involvement.topic.name}");
    expect(source.slice(bearing, bearing + 3200)).toContain("<WorkstreamCard");
  });
});

describe("V12 People — About / related repositories kept, activity full width at the bottom", () => {
  test("the side rail keeps About and Related repositories, and no longer holds the activity", () => {
    const rail = railBlock('data-rd-person-rail="true"');
    expect(rail).not.toBe("");
    expect(rail).toContain('rd-side-title">About');
    expect(rail).toContain('rd-side-title">Related repositories');
    expect(rail).toContain("data-rd-person-repositories=");
    expect(rail).toContain("data-rd-person-notes=");
    // The activity feed is not in the rail any more.
    expect(rail).not.toContain("data-rd-person-activity");
  });

  test("the actor-scoped activity reads full width at the foot, with its honest total and real pager", () => {
    const activity = at('className="rd-person-activity"');
    expect(activity).toBeGreaterThan(-1);
    const block = source.slice(activity, activity + 1200);
    expect(block).toContain("data-rd-person-activity");
    expect(block).toContain('countAttr="data-rd-person-activity-total"');
    // The mapped-account honest missing state survives.
    expect(block).toContain('data-rd-attributable="false"');
    // The PagedActivityFeed renders the shared pager, so the real backend offset is retained.
    expect(source).toContain('className="rd-person-activity"');
  });

  test("the person detail body is the unboxed shared grid, owned by the named class", () => {
    expect(source).toContain('className="rd-detail-grid rd-person-grid" data-rd-person-split="true"');
    expect(source).toContain('[data-plugin-id="research-dashboard"] .rd-person-grid,');
    expect(source).toContain("rd-view-people .rd-topic-detail");
  });

  test("the disclosure control is preserved (the summary caret is not erased to match the mock)", () => {
    expect(source).not.toContain(".rd-view-people .rd-topic-summary::before { content: none; }");
    expect(source).not.toContain(".rd-view-repositories .rd-topic-summary::before { content: none; }");
  });
});

describe("V12 Repositories — the named rail, hero and preserved relationships", () => {
  test("a visible Repositories heading + its instruction lead the rail", () => {
    const rail = at('className="rd-repository-rail" data-rd-repository-rail-view="true"');
    expect(rail).toBeGreaterThan(-1);
    expect(at('<h2 className="rd-index-title">Repositories</h2>')).toBeGreaterThan(rail);
    expect(source).toContain(
      '<p className="rd-meta">Choose a repository · selected record shown at right</p>',
    );
  });

  test("the hero names the selection and keeps the related-activity + default-branch facts", () => {
    const kicker = at('className="rd-hero-kicker" data-rd-repository-kicker="true"');
    expect(kicker).toBeGreaterThan(-1);
    expect(source.slice(kicker, kicker + 120)).toContain("Selected repository");
    const block = source.slice(kicker, kicker + 1400);
    expect(block).toContain('data-rd-repository-last="true"');
    expect(source).toContain('data-rd-repository-recency-note="true"');
    expect(block).toContain('data-rd-repository-branch="true"');
  });

  test("the current/historical partition and its counts are preserved", () => {
    expect(source).toContain("partitionRepositoryWorkstreams(selected?.axes ?? [])");
    expect(source).toContain("data-rd-repository-current={nonterminalCount}");
    expect(source).toContain("data-rd-repository-folded={historicalCount}");
    expect(source).toContain('className="rd-detail-grid rd-repository-grid" data-rd-repository-split="true"');
  });

  test("the explicit people and supported-workstream relationships survive", () => {
    expect(source).toContain("data-rd-repository-topics={sidebarTopics.length}");
    expect(source).toContain("data-rd-repository-people={repositoryPeople.length}");
    expect(source).toContain('data-rd-repository-notes-omitted="true"');
  });

  test("the internal entry and the external URL stay separate links", () => {
    // Internal: an EntityTag (topic/repository) — the exact dashboard entry.
    expect(source).toContain('data-rd-entity-tag=');
    expect(source).toContain('type="repository"');
    // External: the repository's actual GitHub URL, its own anchor.
    expect(source).toContain('className="rd-repo-ext"');
    expect(source).toContain('data-rd-repository-url="true"');
    expect(source).toContain('rel="noopener noreferrer"');
  });
});

describe("V12 Repositories — direct activity full width, separate from related-workstream recency", () => {
  test("the directly-scoped activity reads full width at the foot, not in the side rail", () => {
    const rail = railBlock('data-rd-repository-rail="true"');
    expect(rail).not.toBe("");
    expect(rail).not.toContain("data-rd-repository-activity");
    const activity = at('className="rd-repository-activity"');
    expect(activity).toBeGreaterThan(-1);
    const block = source.slice(activity, activity + 1000);
    expect(block).toContain('countAttr="data-rd-repository-activity"');
    expect(block).toContain('dataAttr="data-rd-repository-activity-list"');
    expect(block).toContain("scope={{ repositoryId: selected.repository.id }}");
  });

  test("the direct activity sits after the related-workstream recency in the hero (no union)", () => {
    const recency = at('data-rd-repository-last="true"');
    const activity = at('className="rd-repository-activity"');
    expect(recency).toBeGreaterThan(-1);
    expect(activity).toBeGreaterThan(recency);
    // The empty text never claims the workstreams recorded nothing.
    expect(source).toContain(
      '"No directly scoped events recorded. Related workstream events may still exist."',
    );
  });
});
