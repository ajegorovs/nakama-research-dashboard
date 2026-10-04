/**
 * people-boundary.mjs — the People index row's separator boundary, as a rule that can be unit-tested.
 *
 * The V1/A4 grammar: an index row states identity, then what is on, then *when*. The "when" (the recency
 * child) is block-level, so no inter-block ` · ` separator may sit between the involvement line and it — a
 * literal separator left there orphans at the end of the involvement line. `verify-page.mjs` used to carry
 * the predicate inline inside a browser `page.evaluate`, where the only way to exercise it was against a
 * served instance, and where a double-escaped pattern (`\\\\s`, which at runtime is the *literal* two
 * characters `\` + `s`) would silently stop detecting a real dangling separator while the check kept
 * reporting a clean page. The rule lives here now, `verify-page.mjs` and `test-people-boundary.mjs` both
 * import it, so the page verdict and the unit regression judge with one pattern rather than two copies that
 * can drift.
 *
 * `DANGLING_SEPARATOR_PATTERN` is a **string**, not a `RegExp`, because a string is what crosses the
 * `page.evaluate` boundary into the browser: the page rebuilds `new RegExp(DANGLING_SEPARATOR_PATTERN)`,
 * so the bytes the browser matches with are exactly the bytes the unit test asserts.
 */

/** The inter-block separator the grammar uses (`MIDDLE DOT`, U+00B7). */
export const SEPARATOR = "\u00b7";

/**
 * A factual block that ends on the separator, optionally followed by whitespace, carries a **dangling**
 * separator: the count line stopped without a following fact, which is exactly the orphaning the boundary
 * forbids. In this source the `\\s` is the two characters `\` `\` + `s`, so the template literal evaluates
 * to `[·]\s*$` — one backslash before `s`, the whitespace class. It must NOT be written as `\\\\s`, which
 * would evaluate to `[·]\\s*$` and match a literal backslash rather than whitespace.
 */
export const DANGLING_SEPARATOR_PATTERN = `[${SEPARATOR}]\\s*$`;

/** True when `factual` ends on a dangling separator (with optional trailing whitespace). */
export const hasDanglingSeparator = (factual) => new RegExp(DANGLING_SEPARATOR_PATTERN).test(factual);
