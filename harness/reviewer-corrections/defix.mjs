// Re-introduce the four defects in src/ui.tsx (for the "before" run), or restore the fixed source.
//
//   bun harness/reviewer-corrections/defix.mjs before   # re-introduce the defects (saves the fixed copy first)
//   bun harness/reviewer-corrections/defix.mjs after    # restore the fixed copy, byte-exact
//
// `before` saves a byte-exact copy of the current ui.tsx under fixed-src/ (if absent) before editing, so
// `after` always restores exactly what this run started from.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "../..");
const UI = path.join(REPO, "src", "ui.tsx");
const FIXED = path.join(import.meta.dir, "fixed-src", "ui.tsx");
const mode = process.argv[2];

if (mode === "after") {
  copyFileSync(FIXED, UI);
  console.log("restored fixed ui.tsx");
} else {
  mkdirSync(path.dirname(FIXED), { recursive: true });
  if (!existsSync(FIXED)) {
    copyFileSync(UI, FIXED);
    console.log("saved fixed copy to fixed-src/ui.tsx");
  }
  let s = readFileSync(UI, "utf8");
  const before = s;
  // R1 — off-by-one numbering.
  s = s.replace("`${step.position}.`", "`${step.position + 1}.`");
  // R2 — open includes blocked.
  s = s.split('(task) => task.state === "open"').join('(task) => task.state !== "resolved"');
  // R3 — no identity-safe offset reset.
  s = s.replace(
    `      if (scopeRef.current !== scopeKey) {\n        scopeRef.current = scopeKey;\n        setPage(null);\n        if (offset !== 0) {\n          setOffset(0);\n          return;\n        }\n      }\n`,
    ""
  );
  // R4 — guards disabled.
  s = s.replace("const stale = () => workstreamSeq.current !== seq;", "const stale = () => false;");
  s = s.replace("const stale = () => detailSeq.current !== seq;", "const stale = () => false;");
  // R3-key — remove the stable feed key that forces a remount on identity change (the R3b immediate-render
  // guarantee), leaving the identity-safe offset reset above in place so the key's own contribution is
  // isolated. Both `PagedActivityFeed` usages are anchored by their unique emptyText so the unrelated
  // `key={entry.person.id}` on a list <li> is left alone.
  s = s.replace(
    /(emptyText="No attributable activity recorded yet\."\s*\n\s*)key=\{entry\.person\.id\}\n/,
    "$1"
  );
  s = s.replace(
    /(emptyText="No repository-scoped events in this snapshot\."\s*\n\s*)key=\{selected\.repository\.id\}\n/,
    "$1"
  );
  if (s === before) throw new Error("defix: no replacement matched — source has drifted");
  writeFileSync(UI, s);
  console.log("re-introduced the four defects in ui.tsx (and removed the stable feed key)");
}
