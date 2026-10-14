/**
 * Source UI test — V12 Projects composition (the accepted Tinted Projects reader).
 *
 * The V12 Projects pass (2026-10-13) rebuilds the Projects landing on the accepted Tinted grammar,
 * reusing the Progress hero/index/section vocabulary rather than inventing a third one:
 *
 * 1. A **named selector rail** on the left ("Projects" + its one-line instruction), whose heading sits
 *    level with the selected-project **hero** beside it — the same `.rd-index-head` grammar Progress uses.
 * 2. The selected project's **hero**: a kicker naming the selection, the prominent title, and one
 *    factual metadata line (stored status, the workstream count from the payload, the recorded recency).
 * 3. A **flat, full-width workstream inventory**: rows touch (the hairline is the row's own border) with
 *    a subtle alternating fill — no card frames, no 18px lane gap — while every fact the shared card
 *    carried survives.
 * 4. The Projects detail is **unboxed** (scoped to this view so People/Repositories are untouched).
 * 5. A navigational work title underlines at the owning `.rd-work-link` rule, not on hover only.
 *
 * Everything the composition preserves is asserted too: the selection-boundary key and its hooks, the
 * description disclosure, participants, supporting repositories, the project plan, the current/historical
 * work partition, and the project-scoped activity pager with its real total. Facts and controls only —
 * this file never asserts a frozen layout beyond the named rules.
 */
import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();

/** The position of the first occurrence of `needle` in the source, or -1 — never coerced. */
const at = (needle: string): number => source.indexOf(needle);

describe("V12 Projects — the named selector rail", () => {
  test("a visible Projects heading + its instruction lead the rail, on the shared index-head grammar", () => {
    const rail = at('className="rd-topic-rail" data-rd-topic-rail="true"');
    expect(rail).toBeGreaterThan(-1);
    const head = at('<h2 className="rd-index-title">Projects</h2>');
    expect(head).toBeGreaterThan(rail);
    expect(source).toContain(
      '<p className="rd-meta">Choose a project · selected record shown at right</p>',
    );
  });

  test("the rail is the split's first column, ahead of the selected-project detail", () => {
    const rail = at('className="rd-topic-rail" data-rd-topic-rail="true"');
    const index = at('className="rd-index rd-topic-index"');
    const detail = at("{selectedEntry ? (");
    expect(rail).toBeLessThan(index);
    expect(index).toBeLessThan(detail);
  });

  test("the index itself is unchanged: hook, order and its own counts survive", () => {
    expect(source).toContain("data-rd-topic-index={topics.length}");
    expect(source).toContain("data-rd-index-topic={entry.topic.name}");
    expect(source).toContain('countLabel(currentCount, "workstream", "workstreams")');
  });
});

describe("V12 Projects — the selected-project hero", () => {
  test("a kicker names the selection, then the prominent title, then one factual metadata line", () => {
    const kicker = at('className="rd-hero-kicker" data-rd-topic-kicker="true"');
    expect(kicker).toBeGreaterThan(-1);
    expect(source.slice(kicker, kicker + 120)).toContain("Selected project");
    // The title is still the shared card title; the metadata is the workstream count + stored recency.
    expect(
      source.indexOf('className="rd-row rd-detail-title-row"', kicker),
    ).toBeGreaterThan(kicker);
    const meta = at('data-rd-topic-workstreams="true"');
    expect(meta).toBeGreaterThan(kicker);
    expect(source).not.toContain('data-rd-topic-status="true"');
  });

  test("the workstream count is the payload's own, not a fabricated number", () => {
    const meta = at('data-rd-topic-workstreams="true"');
    const block = source.slice(meta, meta + 220);
    expect(block).toContain("currentAxes.length + foldedAxes.length");
    expect(block).toContain('countLabel(');
  });
});

describe("V12 Projects — the selection reset and preserved hooks", () => {
  test("the detail panel is still keyed by the selected topic id, after its data-rd-detail identity", () => {
    const panel = at('className="rd-panel rd-topic-detail"');
    expect(panel).toBeGreaterThan(-1);
    const key = at("key={selectedEntry.topic.id}");
    expect(key).toBeGreaterThan(panel);
    expect(key).toBeGreaterThan(at("data-rd-detail={selectedEntry.topic.name}"));
  });

  test("every scoped field the composition reads is still rendered (nothing dropped)", () => {
    expect(source).toContain('data-rd-description-field="true"');
    expect(source).toContain('data-rd-detail-context="true"');
    expect(source).toContain('className="rd-references"');
    expect(source).toContain('label="Project plan"');
    expect(source).toContain("data-rd-current-work={currentAxes.length}");
    expect(source).toContain("data-rd-folded-axes={foldedAxes.length}");
  });

  test("the write controls, notes and evidence access are preserved", () => {
    expect(source).toContain('data-rd-topic-controls="true"');
    expect(source).toContain("data-rd-topic-notes={selectedDetails.notes.length}");
    expect(source).toContain('data-rd-write="activity"');
    // Loading/error guards on the detail still gate on the selected project read.
    expect(source).toContain('className="rd-muted">Loading this project…');
  });

  test("the project-scoped activity is paged with its own true total, never a union of repository events", () => {
    const items = at("const topicActivityItems = topicActivityPage?.items ?? [];");
    expect(items).toBeGreaterThan(-1);
    expect(source).toContain("const topicActivityTotal = topicActivityPage?.total ?? 0;");
    const fold = at('data-rd-topic-activity-fold="true"');
    // The pager below the scoped feed carries the honest total (the feed itself stays project-scoped).
    expect(at("total={topicActivityTotal}")).toBeGreaterThan(fold);
    // The legacy topic-wide `activity` array is never re-sliced into this project's feed.
    expect(source).not.toContain("selectedDetails.activity.slice");
  });
});

describe("V12 Projects — the flat full-width inventory", () => {
  test("the lane gap is removed so the flat rows read as an index, not spaced cards", () => {
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-view-topics .rd-current-work > .rd-axes { gap: 0; }',
    );
  });

  test("rows carry a thin divider and a subtle alternating fill, with no card frame", () => {
    const odd = at(
      '[data-plugin-id="research-dashboard"] .rd-view-topics .rd-current-work .rd-axes > li:nth-child(odd)',
    );
    expect(odd).toBeGreaterThan(-1);
    expect(source.slice(odd, odd + 200)).toContain("--muted, rgba(127, 127, 127, 0.04)");
    const card = at(
      '[data-plugin-id="research-dashboard"] .rd-view-topics .rd-current-work .rd-work-card',
    );
    expect(card).toBeGreaterThan(-1);
    expect(source.slice(card, card + 120)).toContain("border-bottom: 0;");
  });

  test("the Workstreams heading sits on the shared section grammar with the scope note beside it", () => {
    const section = at('className="rd-current-work" data-rd-current-work={currentAxes.length}');
    const block = source.slice(section, section + 420);
    expect(block).toContain('className="rd-section-head"');
    expect(block).toContain('className="rd-section"');
    expect(block).toContain("Workstreams (${currentAxes.length})");
    expect(block).toContain("Recorded work, not estimated progress");
  });

  test("the detail surface is unboxed, scoped to the Projects view alone", () => {
    const rule = at(
      '[data-plugin-id="research-dashboard"] .rd-view-topics .rd-topic-detail {',
    );
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 180);
    expect(block).toContain("background: none;");
    expect(block).toContain("border: 0;");
  });
});

describe("V12 Projects — navigational title links", () => {
  test("a work title underlines at the owning .rd-work-link rule, not on hover only", () => {
    const rule = at('[data-plugin-id="research-dashboard"] .rd-work-link {');
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 220);
    expect(block).toContain("text-decoration: underline;");
    // The retired hover-only spelling is gone.
    expect(source).not.toContain(".rd-work-link { color: inherit; text-decoration: none; }");
  });
});
