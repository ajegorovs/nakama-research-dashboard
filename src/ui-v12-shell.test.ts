/**
 * Source UI test — V12 shared visual grammar (shell + shared primitives).
 *
 * V12's owning pass (2026-10-13) turns the accepted Tinted prototype's shared grammar into the plugin's own
 * rules: one tinted top bar with no second heading row, a ~315px unboxed index rail, squared semantic state
 * tags (never pills) with a distinct confidence qualifier, underlined entity links, flat editorial work rows
 * and one left-date-gutter activity row, and an unboxed pager. The composition and facts are pinned by
 * reading the rendered source, the same way the other ui-*.test.ts files do — no DOM.
 *
 * Scope: this file asserts the V12 shell/primitives grammar only. It never asserts a frozen view.
 */
import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();

describe("V12 shell — one tinted top bar, no second heading row", () => {
  test("the index basis is the accepted ~315px target, not the earlier 380px port", () => {
    expect(source).toContain("--rd-index-basis: 19.6875rem;");
    expect(source).not.toContain("--rd-index-basis: 23.75rem;");
  });

  test("the top bar is the theme-aware Tinted surface", () => {
    expect(source).toContain("--rd-nav-surface:");
    expect(source).toContain("background: var(--rd-nav-surface);");
    // Theme-aware derivation is present (color-mix from the host's own tokens).
    expect(source).toContain("color-mix(in oklab, var(--foreground");
  });

  test("the active tab is a filled surface, not the retired underline-only edge", () => {
    expect(source).toContain("background: var(--rd-nav-active);");
    expect(source).toContain("border-bottom-color: var(--rd-nav-active-edge);");
  });

  test("the redundant view-heading row is visually hidden, not removed", () => {
    const rule = source.indexOf('.rd-view-heading {\n  border: 0;');
    expect(rule).toBeGreaterThan(-1);
    expect(source.slice(rule, rule + 140)).toContain("clip-path: inset(50%);");
    // The heading markup (and its data hooks) survives for assistive hierarchy.
    expect(source).toContain("data-rd-view-heading={view}");
    expect(source).toContain("data-rd-view-title={view}");
  });
});

describe("V12 primitives — semantics of tags, links and rows", () => {
  test("flat index scrollports reserve clearance for the outward keyboard indicator", () => {
    const rule = source.indexOf('[data-plugin-id="research-dashboard"] .rd-index {');
    const block = source.slice(rule, source.indexOf("\n}", rule));
    expect(block).toContain("padding: 6px;");
    expect(source).toContain("scroll-margin-block: 6px;");
    expect(source).toContain(":focus-visible:focus-visible");
  });
  test("state tags are squared semantic fills; unmatched states stay neutral", () => {
    expect(source).toContain('.rd-state[data-rd-state="active"]');
    expect(source).toContain('.rd-step-state[data-rd-step-state="active"]');
    expect(source).toContain("background: #deefe8;");
    expect(source).toContain("background: #e9edf2;");
  });

  test("the blocked count is no longer a red pill", () => {
    expect(source).not.toContain("#fdecec");
    expect(source).not.toContain("rd-blocked-pill,\n[data-plugin-id");
  });

  test("entity tags are underlined links, not framed chips", () => {
    const rule = source.indexOf('[data-plugin-id="research-dashboard"] .rd-tag {');
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 320);
    expect(block).toContain("text-decoration: underline;");
    expect(block).toContain("border: 0;");
  });

  test("the confidence qualifier is distinct from the squared state tag", () => {
    const rule = source.indexOf('[data-plugin-id="research-dashboard"] .rd-conf {');
    expect(rule).toBeGreaterThan(-1);
    expect(source.slice(rule, rule + 320)).toContain("text-decoration: underline dotted;");
  });

  test("workstream cards are flat editorial rows with title-adjacent state", () => {
    const rule = source.indexOf('[data-plugin-id="research-dashboard"] .rd-work-card {');
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 320);
    expect(block).toContain("border-bottom: var(--rd-edge);");
    expect(block).not.toContain("border-left: var(--rd-tech-edge)");
    // The state sits beside the title.
    expect(source).toContain("justify-content: flex-start;");
  });

  test("the shared activity row keeps a left date gutter and its hooks", () => {
    expect(source).toContain('className="rd-activity-row"');
    expect(source).toContain('className="rd-activity-date"');
    expect(source).toContain('className="rd-activity-body"');
    // The event tags cluster and its marker survive the restructure.
    expect(source).toContain('className="rd-cluster rd-tags" data-rd-event-tags="true"');
  });

  test("the pager is unboxed but keeps its controls and totals", () => {
    const rule = source.indexOf('[data-plugin-id="research-dashboard"] .rd-pager-switch {');
    expect(rule).toBeGreaterThan(-1);
    const block = source.slice(rule, rule + 160);
    expect(block).not.toContain("border");
    expect(block).not.toContain("background");
    // Handlers and totals are untouched.
    expect(source).toContain('data-rd-pager-range={`${from}-${to}`}');
    expect(source).toContain('aria-current={index === page ? "page" : undefined}');
  });
});
