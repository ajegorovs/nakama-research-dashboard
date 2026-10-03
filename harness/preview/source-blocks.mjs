/**
 * source-blocks.mjs — read a piece of a sibling harness file instead of restating it.
 *
 * The preview must not carry a second copy of a dataset: it reads the same source the instance is seeded
 * from (`harness/replay-corpus.mjs`, `harness/apply-layout-fixture.mjs`), so the two cannot drift when
 * either is edited. This is the shared scanner for that read — a brace/bracket/quote/comment-aware
 * slicer, so a bracket inside a string, a template literal or a comment cannot end the block early.
 */

/**
 * Slice a balanced `{…}` or `[…]` block out of `text`.
 *
 * `marker` locates the start; if `opening` is omitted the first `{` or `[` after the marker opens the
 * block, and its own kind selects the closer. Template-literal interpolations (`${…}`) are tracked, so a
 * brace inside one is not mistaken for the block's end.
 */
export function sliceBalanced(text, marker, opening = null) {
  const from = text.indexOf(marker);
  if (from === -1) {
    throw new Error(`source-blocks: '${marker}' not found`);
  }
  let i;
  let open = opening;
  if (open) {
    i = text.indexOf(open, from + marker.length);
    if (i === -1) {
      throw new Error(`source-blocks: '${open}' not found after '${marker}'`);
    }
  } else {
    i = from + marker.length;
    while (i < text.length && text[i] !== "{" && text[i] !== "[") i++;
    if (i >= text.length) {
      throw new Error(`source-blocks: no '{' or '[' after '${marker}'`);
    }
    open = text[i];
  }
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  /** Depths at which an open template interpolation (`${…}`) must hand control back to the template. */
  const interpolations = [];
  /** "" (code) | "'" | '"' | "`" */
  let mode = "";
  let out = "";
  for (; i < text.length; i++) {
    const ch = text[i];
    if (mode === "`") {
      out += ch;
      if (ch === "\\") {
        out += text[++i] ?? "";
        continue;
      }
      if (ch === "`") {
        mode = "";
        continue;
      }
      if (ch === "$" && text[i + 1] === "{") {
        out += "{";
        i++;
        interpolations.push(depth);
        mode = "";
      }
      continue;
    }
    if (mode === "'" || mode === '"') {
      out += ch;
      if (ch === "\\") {
        out += text[++i] ?? "";
        continue;
      }
      if (ch === mode) mode = "";
      continue;
    }
    // Code mode.
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      mode = ch;
      out += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      if (interpolations.length > 0 && depth === interpolations[interpolations.length - 1]) {
        // The `}` that closes a `${…}` — hand control back to the template literal.
        interpolations.pop();
        mode = "`";
        out += ch;
        continue;
      }
      depth--;
      if (depth === 0) {
        out += ch;
        return out;
      }
    }
    out += ch;
  }
  throw new Error(`source-blocks: unterminated block at '${marker}'`);
}
