import { expect, test } from "bun:test";
const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();
test("task numbering follows backend page offset with legacy offset fallback", () => {
  expect(source).toContain("const taskStart = taskPage?.offset ?? taskOffset;");
  expect(source).toContain("data-rd-task-ordinal={taskStart + index + 1}");
  expect(source).toContain('String(taskStart + index + 1).padStart(2, "0")');
});
test("optional plan is bounded intrinsic width; reading receives remaining space", () => {
  expect(source).toContain('grid-template-columns: minmax(0, 1fr) fit-content(34%);');
  expect(source).toContain('.rd-progress-columns:has(> [data-rd-progress-col="plan"])');
  expect(source).toContain('@media (min-width: 1001px)');
});
