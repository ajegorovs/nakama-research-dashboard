import {expect,test} from 'bun:test';
const source=await Bun.file(new URL('./ui.tsx',import.meta.url)).text();
test('owner: selected entity panels are static headers, not disclosures',()=>{
 expect((source.match(/data-rd-detail-mode="static"/g)||[]).length).toBe(3);
 expect(source).not.toContain('data-rd-detail-mode="disclosure"');
 expect(source).toContain('<header className="rd-topic-summary">');
});
test('owner: workstream plan static, task plans retain existing disclosure behavior',()=>{
 expect(source).toContain('collapsible={false}\n                        label="Workstream plan"');
 expect(source).toContain('const PlanContainer = collapsible ? "details" : "section";');
 expect(source).toContain('<ScopedPlan label="Task plan" plan={task.plan} />');
});
test('owner: centered task ordinals, section rules and pipe facts',()=>{
 expect(source).toContain('align-self: center; line-height: 1.1; padding-top: 0;');
 expect(source).toContain('.rd-progress-tasks > .rd-section-head {\n  border-bottom: var(--rd-edge);');
 expect(source).toContain('.join(" | ")');
 expect(source).toContain('.rd-progress-index .rd-project-heading::after { content: none; }');
});
test('owner: shared header row grows with wrapped titles; one boundary and text-only expansion',()=>{
 expect(source).toContain('grid-template-rows: subgrid;');
 expect(source).toContain('grid-column: 2; grid-row: 1 / span 2;');
 expect(source).toContain('container-type: normal;');
 expect(source).toContain('.rd-progress-columns {\n  border-top: 0;');
 expect(source).toContain('data-rd-progress-content="true"');
 expect(source).toContain('{expanded ? "Show less" : "Show full text"}');
});
test('owner: prose excerpts, larger rail headings, bold identities and shared static activity',()=>{
 expect(source).toContain('function TextExcerpt(');
 expect(source).toContain('<TextExcerpt text={selectedDetails.topic.summary}');
 expect(source).toContain('<div className="rd-claim rd-description"');
 expect(source).not.toContain('<details className="rd-claim rd-description"');
 expect(source).not.toContain('data-rd-topic-status="true"');
 expect(source).toContain('font-size: 32px; font-weight: 740;');
 expect((source.match(/<CardTitle className="rd-hero-title">/g)||[]).length).toBe(3);
 expect(source).toContain('.rd-topic-summary-meta > :not(:first-child)::before');
 expect(source).toContain('<h4 className="rd-section-heading">{progressActivitySummary(topicActivityTotal)}</h4>');
 expect(source).toContain('<h4 className="rd-section-heading">{progressActivitySummary(total)}</h4>');
});
