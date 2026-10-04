#!/usr/bin/env bun
/**
 * test-people-boundary.mjs — the People index row's separator-boundary rule, asserted without a browser.
 *
 *   bun harness/test-people-boundary.mjs
 *
 * The rule decides whether a row's factual block ends on a dangling ` · ` (V1/A4). It is the same predicate
 * `verify-page.mjs` applies to every served People row, imported here rather than copied, so a regression in
 * the pattern — in particular the double-escape (`\\\\s`, a *literal* backslash plus `s*`, which silently
 * stops detecting a real dangling separator while the page check keeps reporting a clean page) — fails a
 * runnable check instead of only showing up as a weakened served verdict.
 *
 * Cases: a trailing separator with and without trailing whitespace, the real `1 axis · 1 topic ·` line and
 * its spaced form, a clean count line, a many-count clean line, an interior separator, the exceptional-state
 * wording, and a literal backslash (which must NOT be read as the whitespace the pattern means).
 */
import {
  DANGLING_SEPARATOR_PATTERN,
  SEPARATOR,
  hasDanglingSeparator,
} from "./people-boundary.mjs";

let passed = 0;
const failures = [];
function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label} — ${detail || "condition was false"}`);
    console.log(`  FAIL  ${label}\n        ${detail || "condition was false"}`);
  }
}

console.log("people boundary — the dangling-separator rule, as cases");

check("the separator is the middle dot (U+00B7)", SEPARATOR === "\u00b7", JSON.stringify(SEPARATOR));

// The escaping guard: the pattern must compile to a single-backslash `\s` (whitespace), never a double one.
const compiled = new RegExp(DANGLING_SEPARATOR_PATTERN);
check(
  "the pattern compiles to `\\s` — the whitespace class",
  compiled.source === `[${SEPARATOR}]\\s*$`,
  compiled.source
);
check(
  "the compiled pattern carries no literal-backslash `\\s`",
  !/\\\\s/.test(compiled.source) && compiled.source.includes(`]\\s`),
  compiled.source
);

const CASES = [
  ["a trailing separator dangles", `${SEPARATOR}`, true],
  ["a trailing separator with trailing spaces dangles", `${SEPARATOR}   `, true],
  ["a trailing separator with a trailing tab dangles", `${SEPARATOR}\t`, true],
  ["the real dangling line `1 axis · 1 topic ·` is caught", `1 axis ${SEPARATOR} 1 topic ${SEPARATOR}`, true],
  [
    "the real dangling line with trailing spaces is caught",
    `1 axis ${SEPARATOR} 1 topic ${SEPARATOR}   `,
    true,
  ],
  ["a clean count line is not dangling", `1 axis ${SEPARATOR} 1 topic`, false],
  [
    "a many-count clean line is not dangling",
    `2 active ${SEPARATOR} 1 blocked ${SEPARATOR} 4 axes ${SEPARATOR} 2 topics`,
    false,
  ],
  [
    "an interior separator is not dangling",
    `2 active ${SEPARATOR} 1 blocked ${SEPARATOR} 4 axes`,
    false,
  ],
  ["the exceptional wording `no account mapped` is not dangling", "no account mapped", false],
  ["the exceptional wording `nothing attributed yet` is not dangling", "nothing attributed yet", false],
  ["an empty block is not dangling", "", false],
  ["a literal backslash at the end is not whitespace", "1 topic \\", false],
  ["a literal backslash-s at the end is not whitespace", "1 topic \\s", false],
];
for (const [label, input, expected] of CASES) {
  check(`${label} → ${expected}`, hasDanglingSeparator(input) === expected, JSON.stringify(input));
}

// The specific regression the double-escape would hide: with the correct pattern a separator-only end is
// caught; under `[·]\\s*$` (a literal backslash) it would not be, and this case would go red.
check(
  "the double-escape regression is caught (a separator-only end is detected)",
  hasDanglingSeparator(`1 axis ${SEPARATOR} 1 topic ${SEPARATOR}`) === true &&
    !new RegExp(`[${SEPARATOR}]\\\\s*$`).test(`1 axis ${SEPARATOR} 1 topic ${SEPARATOR}`),
  "a correctly-escaped pattern detects the dangling separator; the double-escaped one does not"
);

console.log("");
if (failures.length > 0) {
  console.log(`people-boundary: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log(`people-boundary: all ${passed} checks passed`);
