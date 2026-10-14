/**
 * Source UI test — V12 iteration 2 visual corrections V-01..V-10 (bounded convergence, 2026-10-13).
 *
 * Pins the presentation-policy corrections the design owner authorized after the Iteration 1 review,
 * reading the rendered source the same way the other ui-*.test.ts files do — no DOM. These are the
 * *relationships* the corrections asked for (a valid plan border, a compact shared type scale, an absent
 * legacy summary, a responsive affiliation grid, …), not a frozen pixel layout. Behaviour, data scopes
 * and every existing hook are asserted elsewhere and are untouched here.
 *
 * The one superseded policy this revision changes (the tinted nav mix, V-01) is updated narrowly in
 * ui-progress-v2b.test.ts with a recorded-rule-revision note; this file asserts the new relationships.
 */
import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();
const at = (needle: string, from = 0): number => source.indexOf(needle, from);

describe("V12 iteration 2 — V-01/V-08 theme-aware Tinted surfaces", () => {
  test("the nav surface mixes a blue accent into the card (theme-aware), not a neutral grey", () => {
    expect(source).toContain(
      "--rd-nav-surface: color-mix(in oklab, #6f97ba 12%, var(--card, #ffffff));",
    );
    // The base stays var(--card) so a dark host card yields a dark bar; the ink stays host-derived.
    expect(source).toContain(
      "--rd-nav-ink: color-mix(in oklab, var(--foreground, #253e55) 88%, var(--card, #ffffff));",
    );
    // The accepted literal fallback is retained for a browser without color-mix.
    expect(source).toContain("--rd-nav-surface: #edf3f8;");
  });

  test("the selected selector fill and the Refresh glyph reuse the shared surface", () => {
    // Selection is a surface layer, not focus — the same token the nav's current tab uses.
    const selected = source.slice(
      at('[data-plugin-id="research-dashboard"] .rd-index-item[aria-pressed="true"] {'),
    );
    expect(selected.slice(0, 180)).toContain("background: var(--rd-nav-active);");
    // A compact, accessible (aria-hidden, text-labelled) refresh glyph; the reload handler is unchanged.
    expect(source).toContain('className="rd-refresh-glyph"');
    expect(source).toContain('aria-hidden="true" className="rd-refresh-glyph"');
    expect(source).toContain("void reloadCurrent();");
  });
});

describe("V12 iteration 2 — V-02/V-06 compact shared type and row rhythm", () => {
  test("the shared reader scale is the compact 13/11/11 steps", () => {
    expect(source).toContain("--rd-body: 13px;");
    expect(source).toContain("--rd-meta: 11px;");
    expect(source).toContain("--rd-label: 11px;");
    expect(source).not.toContain("--rd-body: 14px;");
  });

  test("the work card and task rows take the tighter vertical padding", () => {
    const card = source.slice(at('[data-plugin-id="research-dashboard"] .rd-work-card {'));
    expect(card.slice(0, 520)).toContain("padding: 8px 0 10px;");
    // Anchor on the task card's own ordinal grid so an earlier .rd-task-card rule can't satisfy this.
    const task = source.slice(at("grid-template-columns: 3.25rem minmax(0, 1fr);"));
    expect(task.slice(0, 400)).toContain("padding: 10px 0;");
  });
});

describe("V12 iteration 2 — V-03 the legacy Dashboard summary is removed (owner decision)", () => {
  test("no DashboardSummary component, render call, hook or dedicated styling survives", () => {
    expect(source).not.toContain("DashboardSummary");
    expect(source).not.toContain("rd-dashboard-summary");
    expect(source).not.toContain("data-rd-dashboard-summary");
    expect(source).not.toContain("rd-stat-grid");
  });

  test("the backend aggregates are preserved: get_overview still feeds every other view", () => {
    expect(source).toContain('call<{ ok?: boolean } & Overview>("get_overview", scope)');
    // People/Repositories still consume the same overview payload.
    expect(source).toContain("overview?.people ?? []");
    expect(source).toContain("overview?.repositories ?? []");
  });
});

describe("V12 iteration 2 — V-04 a valid plan-position border and a subtle sequence connector", () => {
  test("the circle takes the edge token directly (the old double 'px solid' value was invalid)", () => {
    const rule = source.slice(at('[data-plugin-id="research-dashboard"] .rd-plan-position {'));
    expect(rule.slice(0, 200)).toContain("border: var(--rd-edge);");
    expect(source).not.toContain("border: 1px solid var(--rd-edge)");
  });

  test("a hairline connects consecutive steps; the last step draws none; stored 0 is unchanged", () => {
    expect(source).toContain(
      '[data-plugin-id="research-dashboard"] .rd-plan-step:not(:last-child)::before {',
    );
    // The stored literal still renders as stored, an absent position draws no numeral.
    expect(source).toContain("step.position === null ? null : (");
    expect(source).toContain('<span className="rd-plan-position">{step.position}</span>');
  });
});

describe("V12 iteration 2 — V-05 shared activity date cell and heading wording", () => {
  test("the visible date is a human date, not the raw backend slice, with UTC framing kept", () => {
    expect(source).not.toContain("{at.slice(0, 10)}");
    expect(source).toContain("function eventDayParts(at: string)");
    expect(source).toContain('`${dayRaw} ${RD_MONTHS_SHORT[month - 1]} ${year}`');
    // The weekday is derived from the same stored UTC date portion (no local reinterpretation).
    expect(source).toContain('`${day}T00:00:00Z`');
    // The full stored timestamp still travels to the DOM attribute.
    expect(source).toContain('data-rd-event-date={at}');
  });

  test("the shared left date gutter draws the short weekday above the exact date", () => {
    expect(source).toContain('className="rd-event-weekday"');
    expect(source).toContain('[data-plugin-id="research-dashboard"] .rd-event-weekday {');
  });

  test("the Projects activity heading uses the shared 'Recent activity' wording", () => {
    expect(source).toContain('<h4 className="rd-section-heading">{progressActivitySummary(topicActivityTotal)}</h4>');
    expect(source).not.toContain("<summary>Activity ({topicActivityTotal})</summary>");
  });
});

describe("V12 iteration 2 — V-07/V-09/V-10 People grid, label spacing and muted aside", () => {
  test("the affiliation list becomes two columns at desktop width, one column when narrow", () => {
    expect(source).toContain(
      '@media (min-width: 720px) {\n  [data-plugin-id="research-dashboard"] .rd-affiliation-list {\n    grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
  });

  test("the shared context label is a heading, so the empty Purpose no longer runs into it", () => {
    const rule = source.slice(at('[data-plugin-id="research-dashboard"] .rd-context-label {'));
    expect(rule.slice(0, 900)).toContain("display: block; margin-bottom: 2px;");
  });

  test("the support aside keeps a rule but takes the muted hairline, not the heavy slate bar", () => {
    const block = source
      .slice(at('[data-plugin-id="research-dashboard"] .rd-side-stack {'))
      .slice(0, 700);
    expect(block).toContain("border-left: var(--rd-edge);");
    // The 2px slate technical bar is gone from this aside (it may still delimit a problem card elsewhere).
    expect(block).not.toContain("var(--rd-tech-edge)");
  });
});
