#!/usr/bin/env node
/**
 * The redaction rule, asserted — plus the guard that keeps it true of the committed records.
 *
 * Two kinds of assertion:
 *   1. the rule's unit cases — a tailnet address, a MagicDNS name, a LAN address, loopback with and without a
 *      port, a path/query preserved, a **public** host left alone, and the placeholder itself (raw and HTML-escaped
 *      as the montage captions carry it);
 *   2. **the tree guard:** every committed text file in this public repository — not only `docs/` — is scanned for
 *      anything the rule would have redacted. That is what makes "the next pass cannot reintroduce it" checkable
 *      rather than hoped for: a pass that writes a live endpoint into a transcript, a caption, a `src/` default or
 *      a script fails this suite.
 *
 * The fixtures deliberately use addresses that are **not this host's** (a different tailnet-range IP, a different
 * MagicDNS name): a test that reproduced the real one would be the leak it guards against. The guard's own
 * patterns are ranges, suffixes and `os.hostname()` — never a literal address of this machine.
 *
 * Run: `bun harness/test-redact.mjs` (or `bun run harness:records`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { redactEndpoint, unredactedEndpoints, PLACEHOLDER_HOST } from "./redact.mjs";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

let failures = 0;
const check = (description, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${description}` +
      (ok ? "" : `\n        got: ${JSON.stringify(actual)}\n   wanted: ${JSON.stringify(expected)}`)
  );
};

// --- 1. the rule -------------------------------------------------------------------------------------------
const REDACT = [
  ["a tailnet address", "http://100.101.102.103:3003", `http://${PLACEHOLDER_HOST}:3003`],
  ["a MagicDNS name", "http://peer-1.example-tailnet.ts.net:3003", `http://${PLACEHOLDER_HOST}:3003`],
  ["a LAN address", "http://192.168.50.20:3000", `http://${PLACEHOLDER_HOST}:3000`],
  ["a private `.local` name", "http://nas.local:8080", `http://${PLACEHOLDER_HOST}:8080`],
  [
    "a path and query are kept",
    "http://100.101.102.103:3003/plugins/research-dashboard?x=1",
    `http://${PLACEHOLDER_HOST}:3003/plugins/research-dashboard?x=1`,
  ],
  ["a bare scheme-less host is untouched", "100.101.102.103:3003", "100.101.102.103:3003"],
  ["loopback with a port is kept", "http://127.0.0.1:3005", "http://127.0.0.1:3005"],
  ["localhost is kept", "http://localhost:4399/plugins/x", "http://localhost:4399/plugins/x"],
  ["IPv6 loopback is kept", "http://[::1]:3003", "http://[::1]:3003"],
  ["the placeholder is idempotent", `http://${PLACEHOLDER_HOST}:3003`, `http://${PLACEHOLDER_HOST}:3003`],
  [
    "a public host is left alone",
    "https://github.com/ajegorovs/nakama-research-dashboard.git",
    "https://github.com/ajegorovs/nakama-research-dashboard.git",
  ],
  ["text without a URL is untouched", "no endpoint here", "no endpoint here"],
];
for (const [description, input, expected] of REDACT) check(`redact: ${description}`, redactEndpoint(input), expected);

const DETECT = [
  ["an absolute tailnet URL", "see http://100.101.102.103:3003/plugins/x for the page"],
  ["a bare MagicDNS name", "the box is peer-1.example-tailnet.ts.net today"],
  ["a bare tailnet literal", "it answered on 100.101.102.103"],
  ["a LAN URL", "captured from http://192.168.50.20:3000/plugins/research-dashboard"],
];
for (const [description, input] of DETECT) {
  check(`detect: ${description}`, unredactedEndpoints(input).length > 0, true);
}
check(
  "detect: loopback, the raw placeholder and a public URL are not offences",
  unredactedEndpoints(
    `# dashboard: http://127.0.0.1:3005 · http://${PLACEHOLDER_HOST}:3003/plugins/research-dashboard · ` +
      "https://github.com/ajegorovs/nakama-research-dashboard.git"
  ),
  []
);
check(
  "detect: the HTML-escaped placeholder in a montage caption is not an offence",
  unredactedEndpoints("<span>http://&lt;box&gt;.&lt;tailnet&gt;.ts.net:3003</span>"),
  []
);
check(
  "detect: ordinary code and documented examples are not offences",
  unredactedEndpoints(
    "process.env.HOME · landing.home · openedTopic.home · NAKAMA_EMAIL=admin@nakama.local · " +
      "https://example.com/x · version 0.2.0+dev"
  ),
  []
);

// --- 2. the record guard -----------------------------------------------------------------------------------
// The whole **public tree**, not just `docs/`: the reviewer's ask is that no committed artifact carries a live
// endpoint, and a hardcoded address in `src/` or the harness would be the same leak. Two files are excluded by
// path, and only these: the rule itself and this suite, which necessarily name the address ranges and carry
// deliberately fake fixtures. Binary artifacts (the screenshots and montages) cannot be scanned for text — they
// are page captures of the plugin's own UI, which renders no browser chrome and therefore no address bar.
const SKIP_PATHS = new Set(["harness/redact.mjs", "harness/test-redact.mjs"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".hermes", "vendor"]);
const SCAN_EXTENSIONS = new Set([".txt", ".md", ".html", ".json", ".jsonl", ".sh", ".mjs", ".ts", ".tsx", ".js"]);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(REPO).filter((path) => {
  const rel = relative(REPO, path);
  const dot = rel.lastIndexOf(".");
  return !SKIP_PATHS.has(rel) && dot > 0 && SCAN_EXTENSIONS.has(rel.slice(dot).toLowerCase());
});
const offences = [];
for (const path of files) {
  const found = unredactedEndpoints(readFileSync(path, "utf8"));
  if (found.length) offences.push(`${relative(REPO, path)}: ${found.slice(0, 4).join(", ")}`);
}
if (offences.length) failures += 1;
const inDocs = files.filter((path) => relative(REPO, path).startsWith("docs/")).length;
console.log(
  `${offences.length ? "FAIL" : "PASS"}  the committed tree carries no live endpoint — ` +
    `${files.length} text file(s) scanned (${inDocs} under docs/), ` +
    `${SKIP_PATHS.size} excluded by path` +
    (offences.length ? `\n        ${offences.join("\n        ")}` : "")
);

// --- 3. the transcript emitter's trailing-space rule -------------------------------------------------------
// A generated PASS/FAIL/SKIP line is printed from one place in `verify-page.mjs` (`emitLine`), and a detail built
// from rendered text (`text.slice(0, N)`) can end on a space, leaving a trailing blank a reviewer has to flag.
// The emitter trims it; this asserts the committed **canonical read records** the read pass writes — by its own
// naming convention — carry none. The write-pass records are a stated boundary, not an exemption: they are
// regenerated only by a write run, which mutates the fixture, so they are outside this read-record guard.
const READ_RECORDS = [
  "docs/corpus/verify-read.txt",
  "docs/corpus/verify-read-1280x800.txt",
  "docs/layout-fixtures/verify-fixture-read-1440x900.txt",
  "docs/layout-fixtures/verify-fixture-read-1280x800.txt",
];
const trailing = [];
for (const rel of READ_RECORDS) {
  readFileSync(join(REPO, rel), "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (/[ \t]+$/.test(line)) trailing.push(`${rel}:${index + 1}`);
    });
}
check("the canonical read records carry no trailing whitespace", trailing, []);

console.log(`\nredaction: ${failures === 0 ? "all checks passed" : `${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
