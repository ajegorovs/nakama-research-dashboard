/**
 * Source UI test — V2 correction (selection-scoped disclosure defaults, readable full descriptions).
 *
 * Two narrow corrections, pinned by reading the rendered source the same way `actions.test.ts` and the
 * V2a/V2b tests do — no DOM:
 *
 * 1. **Selection-boundary keys.** The Progress selected body is a `React.Fragment` keyed by `axis.id`, so
 *    a *different* workstream remounts the body and every native disclosure inside it (Purpose, evidence,
 *    activity, the workstream plan) returns to its default — while same-axis pagination keeps the same key
 *    and never re-closes a disclosure the reader opened. The Projects detail panel is keyed by the selected
 *    topic id, so the nested **Description** disclosure reads collapsed again for a different project. The
 *    keys are the only structural change; the controlled correction/draft handlers are untouched.
 *
 * 2. **Readable full descriptions.** The stored multi-paragraph project description is shown verbatim, so a
 *    local rule gives its body `white-space: pre-wrap` and `overflow-wrap: anywhere` — scoped to the
 *    Description body, with no change to the host's other paragraphs.
 */
import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();

/** The position of the first occurrence of `needle` in the source, or -1 — never coerced. */
const at = (needle: string): number => source.indexOf(needle);

describe("V2 correction — Progress selection-boundary key", () => {
  test("the selected body is a React.Fragment keyed by the axis id", () => {
    const open = at("<React.Fragment key={axis.id}>");
    expect(open).toBeGreaterThan(-1);
    // Opened after the `selection && axis` guard, and before the context panel it wraps.
    expect(open).toBeGreaterThan(at("{selection && axis ? ("));
    expect(open).toBeLessThan(at("data-rd-context-panel={axis.id}"));
  });

  test("the keyed fragment wraps the whole selected body, through the correction form", () => {
    const close = at("</React.Fragment>");
    expect(close).toBeGreaterThan(-1);
    // The body's last elements (the retained correction form and maintenance) sit inside the fragment.
    expect(at('data-rd-progress-maintenance="true"')).toBeGreaterThan(-1);
    expect(at("<WorkstreamCorrection")).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(at("<WorkstreamCorrection"));
  });

  test("the selected body opens with the keyed fragment, not a bare shorthand", () => {
    // Between the `selection && axis` guard and the context panel it wraps, the only opening
    // fragment is the keyed one — the unkeyed shorthand that used to sit there is gone.
    const between = source.slice(
      at("{selection && axis ? ("),
      at("data-rd-context-panel={axis.id}"),
    );
    expect(between).toContain("<React.Fragment key={axis.id}>");
    expect(between).not.toContain("<>");
  });
});

describe("V2 correction — Projects selection-boundary key", () => {
  test("the project detail panel is keyed by the selected topic id", () => {
    const panel = at('className="rd-panel rd-topic-detail"');
    expect(panel).toBeGreaterThan(-1);
    const key = at("key={selectedEntry.topic.id}");
    expect(key).toBeGreaterThan(panel);
    // The key sits on the panel, after its `data-rd-detail` identity and its `open`.
    expect(key).toBeGreaterThan(at("data-rd-detail={selectedEntry.topic.name}"));
  });

  test("the Description disclosure is inside the keyed panel, so it resets collapsed", () => {
    expect(at("key={selectedEntry.topic.id}")).toBeLessThan(
      at('data-rd-description-field="true"'),
    );
    // Still collapsed by default: the Description <details> carries no `open`.
    const description = at('className="rd-claim rd-description"');
    expect(description).toBeGreaterThan(-1);
    expect(source.slice(description, description + 120)).not.toContain("open");
  });

  test("the full stored description is still rendered verbatim — the correction changes no string", () => {
    expect(source).toContain("{selectedDetails.topic.description || (");
    expect(source).toContain("No description recorded.");
    // The summary label is untouched.
    expect(source).toContain('<summary className="rd-context-label">Description</summary>');
  });
});

describe("V2 correction — readable full description paragraphs", () => {
  test("a local rule gives the Description body pre-wrap and overflow-wrap", () => {
    const rule = at('[data-plugin-id="research-dashboard"] .rd-description [data-rd-claim="description"]');
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 200);
    expect(block).toContain("white-space: pre-wrap;");
    expect(block).toContain("overflow-wrap: anywhere;");
  });

  test("the pre-wrap is scoped to the Description body, not a global paragraph change", () => {
    // No blanket `p { white-space: pre-wrap }` or `[data-rd-claim] { white-space: pre-wrap }`.
    expect(source).not.toMatch(/\.rd-claim\s*\{[^}]*white-space:\s*pre-wrap/);
    expect(source).not.toMatch(/(^|\n)\s*p\s*\{[^}]*white-space:\s*pre-wrap/);
  });
});
