import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./ui.tsx", import.meta.url), "utf8");
describe("owner-approved UI closeout", () => {
  test("Progress defaults only after its index loads and preserves explicit selections", () => {
    expect(source).toContain('view !== "progress" || progressSelection || !visibleProgress');
    expect(source).toContain('entityTarget?.type === "axis" || entityTarget?.type === "problem"');
    expect(source).toContain('visibleProgress.axes.axes.find((row) => row.id && row.topicId)');
    expect(source).toContain('selectWorkstream(first.topicId, first.id)');
  });
  test("the portable People preview uses the public personActorId filter", () => {
    const preview = readFileSync(new URL("../harness/preview/preview-main.tsx", import.meta.url), "utf8");
    expect(preview).toContain('typeof bag.personActorId === "string" ? bag.personActorId');
    expect(preview).not.toContain("bag.actorId");
  });
  test("stored plan-step status follows its title inside the same text flow", () => {
    expect(source).toContain('<span className="rd-strong">{step.title}{" "}<StateBadge kind="stored" state={step.state} /></span>');
    expect(source).toContain('.rd-plan-step .rd-row { align-items: baseline; justify-content: flex-start; }');
    expect(source).toContain('step.position === null');
    expect(source).toContain('statusPlacement === "right" ? <StateBadge');
    expect(source).toContain('label="Workstream plan"\n                        statusPlacement="right"');
    expect(source).toContain('data-rd-plan-status={statusPlacement}');
  });
  test("People related repositories use one grid row per exact navigation link", () => {
    expect(source).toContain('className="rd-cluster rd-tags rd-person-repository-list"');
    const rule = source.slice(source.indexOf('.rd-person-repository-list {')).split('}')[0];
    expect(rule).toContain('display: grid');
    expect(rule).toContain('grid-template-columns: minmax(0, 1fr)');
    const start = source.indexOf('data-rd-person-repositories={');
    const region = source.slice(start, source.indexOf('</section>', start));
    expect(region).toContain('id={repository.id}');
    expect(region).toContain('label={repository.fullName}');
    expect(region).toContain('onOpen={onOpenEntity}');
  });
});
