/**
 * Redaction for anything a **public** artifact may quote.
 *
 * Why this exists: the acceptance records are committed to a public repository, and two emitters wrote live
 * endpoints into them — `read-pass.sh` wrote the dashboard origin into every transcript header, and the palette
 * check wrote the live page URL into a PASS line. The fidelity tooling was already parameterized
 * (`--url-label <box>.<tailnet>.ts.net:3003`); these two were not, so the tailnet address leaked back into
 * committed records. One definition, both callers, plus `test-redact.mjs` which scans the committed records for
 * anything this module would have redacted — so a future pass cannot reintroduce it silently.
 *
 * The rule is about **identity, not about every host**:
 *
 *   - a **loopback** host identifies nobody and is kept verbatim (it is also the useful diagnostic when a record
 *     is read months later);
 *   - a **literal address** (any non-loopback IPv4/IPv6), a **private DNS suffix** (`.ts.net`, `.local`,
 *     `.internal`, `.lan`, `.home`) or **this machine's own hostname** is identity → replaced with
 *     `<box>.<tailnet>.ts.net`, keeping scheme, port and path so the record still says what was reached;
 *   - a **public host** (a GitHub remote, an upstream doc link) is not identity and is left alone — over-redacting
 *     would damage the evidence a record carries.
 *
 * A second class is handled here for the same reason: **a filesystem path an artifact quotes**. A transcript
 * writes the screenshot path it produced, and read against `read-pass.sh`'s committed shot directory that path
 * is absolute — `/home/<user>/…/docs/screenshots/x.png` — so it carries the local username and the machine's
 * directory layout. The rule is the same shape: a path **inside the repository** becomes repo-relative (it
 * addresses the same file from a clone, so the linkage a reviewer wants survives and no identity does); a path
 * **outside** it becomes `<scratch>/<name>`, keeping the basename for linkage and hiding where the work ran.
 */

import { hostname } from "node:os";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

export const PLACEHOLDER_HOST = "<box>.<tailnet>.ts.net";

/** Loopback only: `localhost`, any `127.x.x.x`, `[::1]`. */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/**
 * Private DNS suffixes. `.home` is deliberately **not** here: it collides with ordinary code — `process.env.HOME`,
 * `landing.home` — and a rule that flags those teaches its reader to ignore it.
 */
const PRIVATE_SUFFIXES = [".ts.net", ".local", ".internal", ".lan"];
/** Hostnames this project uses *as examples* in its own prose: made up, and belonging to nobody. */
const EXAMPLE_HOSTS = new Set([
  "nakama.local",
  "example.com",
  "example.net",
  "example.org",
  "example.invalid",
  "localhost.localdomain",
]);

/** This machine's hostname is identity — never a literal in the source, so a rename cannot break the rule. */
export const MACHINE_HOSTNAME = hostname().toLowerCase();

/**
 * An absolute home path with a **concrete** user segment — `/home/<name>/`, `/Users/<name>/`, `C:\Users\<name>\`.
 * The segment must be a real name: a placeholder is written `<user>` (angle brackets), which the character class
 * cannot match, so `docs` examples do not trip the guard.
 */
const HOME_PATH = /(?:\/home|\/Users|\\Users)[/\\]([A-Za-z0-9._-]+)[/\\]/g;
/**
 * Documented placeholder user segments — the same narrowing decision as `EXAMPLE_HOSTS`. `/home/user/…` is the
 * canonical made-up path in a README and identifies nobody; a guard that flags it teaches its reader to switch
 * it off. `.home` is absent from this module's suffixes for the same reason, so both narrowing decisions are
 * asserted in `test-redact.mjs` rather than left to be rediscovered.
 */
const PLACEHOLDER_USERS = new Set(["user", "you", "username", "name", "example", "me", "someone"]);

/**
 * Would printing this host tell a public reader where the work happens?
 *
 * @param {string} host
 * @returns {boolean}
 */
export function isIdentifyingHost(host) {
  const value = String(host ?? "").toLowerCase();
  if (!value || LOOPBACK.test(value)) return false;
  if (EXAMPLE_HOSTS.has(value) || value.endsWith(".example")) return false;
  if (IPV4.test(value)) return true; // any non-loopback address literal: tailnet, LAN, public
  if (value.includes(":")) return true; // an IPv6 literal that is not `::1`
  if (PRIVATE_SUFFIXES.some((suffix) => value.endsWith(suffix))) return true;
  return value === MACHINE_HOSTNAME;
}

const splitUrl = (url) => {
  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([\s\S]*)$/i.exec(String(url ?? ""));
  if (!match) return null;
  const [, scheme, authority, rest] = match;
  const at = authority.lastIndexOf("@");
  const userinfo = at >= 0 ? authority.slice(0, at) : "";
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const bracketed = hostPort.startsWith("[");
  const host = bracketed ? hostPort.slice(0, hostPort.indexOf("]") + 1) : hostPort.split(":")[0];
  const port = bracketed ? hostPort.slice(hostPort.indexOf("]") + 1) : hostPort.slice(host.length);
  return { scheme, userinfo, host, port, rest };
};

/**
 * Redact one URL's host. Idempotent; a no-op for a non-URL, a loopback URL, or a URL whose host is not identity.
 *
 * @param {string} url
 * @returns {string}
 */
export function redactEndpoint(url) {
  const text = String(url ?? "");
  const parts = splitUrl(text);
  if (!parts) return text;
  const { scheme, userinfo, host, port, rest } = parts;
  const bare = host.startsWith("[") ? host.slice(1, -1) : host;
  if (!isIdentifyingHost(bare)) return text;
  return `${scheme}${userinfo}${PLACEHOLDER_HOST}${port}${rest}`;
}

/**
 * A public label for a filesystem path an artifact may quote.
 *
 * A path inside `repoRoot` becomes repo-relative, so a reader with a clone resolves the same file; a path
 * outside it becomes `<scratch>/<basename>` — linkage to the artifact (its name) is kept, the machine it ran on
 * is not.
 *
 * @param {string} file
 * @param {string} repoRoot
 * @returns {string}
 */
export function pathLabel(file, repoRoot) {
  const text = String(file ?? "");
  if (!text) return text;
  const target = resolve(text);
  const root = resolve(String(repoRoot ?? ""));
  const rel = relative(root, target);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel.split(sep).join("/");
  }
  return `<scratch>/${basename(target)}`;
}

/** HTML-escaped placeholders are the same placeholder: decode before judging, so a caption is not an offence. */
const decodeEntities = (text) =>
  String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Absolute URLs, stopping at anything that cannot be part of one. */
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`()<>\[\]]+/gi;
/** Every dotted token — an address literal, or a hostname, with or without a scheme. */
const DOTTED_TOKEN = /\b(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\b/gi;

/**
 * Everything inside `text` that a public artifact must not carry. Both forms — an absolute URL and a bare
 * hostname in prose — are judged by the same `isIdentifyingHost`, so the two cannot disagree, and placeholders
 * are skipped by construction (the raw form contains angle brackets; the HTML-escaped form decodes to it).
 *
 * @param {string} text
 * @returns {string[]} the offending strings, de-duplicated, in first-seen order
 */
export function unredactedEndpoints(text) {
  const source = decodeEntities(text);
  const found = new Set();
  for (const match of source.matchAll(URL_LIKE)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    if (redactEndpoint(url) !== url) found.add(url);
  }
  for (const match of source.matchAll(DOTTED_TOKEN)) {
    if (isIdentifyingHost(match[0])) found.add(match[0]);
  }
  if (MACHINE_HOSTNAME && source.toLowerCase().includes(MACHINE_HOSTNAME)) found.add(MACHINE_HOSTNAME);
  return [...found];
}

/**
 * Everything inside `text` that names a home directory with a **concrete** user — the path class of leak, the
 * sibling of `unredactedEndpoints`. Judged by the same placeholder narrowing: `/home/<user>/` (angle brackets)
 * and `/home/user/…` identify nobody and are not offences; `/home/devuser/…` and `/Users/devuser/…` are a machine.
 * The fixtures use a made-up name that is **not** a placeholder, so both sides of the narrowing are exercised.
 *
 * @param {string} text
 * @returns {string[]} the offending paths, de-duplicated, in first-seen order
 */
export function unredactedHomePaths(text) {
  const found = new Set();
  for (const match of decodeEntities(text).matchAll(HOME_PATH)) {
    if (!PLACEHOLDER_USERS.has(match[1].toLowerCase())) found.add(match[0]);
  }
  return [...found];
}
