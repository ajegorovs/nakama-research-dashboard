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
 */

import { hostname } from "node:os";

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
