/**
 * folded-axes.mjs — the folded-workstream reader and its check (finding F3).
 *
 * The pivoted Projects detail renders a completed/abandoned workstream as the shared compact card
 * (`article[data-rd-work-card]`, title in `.rd-work-link`), inside the fold `details[data-rd-folded-axes]`.
 * The retired in-detail axis block (`[data-rd-axis-title]`) no longer exists on this build, so a check that
 * reads the retired hook finds no node and reports a fold that is rendering correctly as a defect. The
 * reader here reads the current hook; the check compares the rendered titles to the **exact stored terminal
 * workstreams** — not mere presence — so a fold that renders the wrong card still fails.
 *
 * Factored out of `verify-page.mjs` so both the current-hook path and the retired-hook regression are
 * executable in a unit test, without a browser.
 */

/** The current hook the fold's workstreams render under (the compact work card). */
export const FOLDED_WORK_CARD_SELECTOR = "details[data-rd-folded-axes] [data-rd-work-card]";

/** The retired in-detail axis block hook. Named so a regression back to it is visible, not silent. */
export const RETIRED_AXIS_TITLE_SELECTOR = "details[data-rd-folded-axes] [data-rd-axis-title]";

/**
 * Pure: the check for a rendered fold. Returns `[]` when the fold renders every stored terminal workstream
 * with its own text; otherwise the named defects.
 *
 * @param {{ rendered: Array<{ title: string, text: string }>, terminalTitles: string[] }} input
 *   `rendered` — the fold's cards as `{ title, text }` (title from `.rd-work-link`, text from the card).
 *   `terminalTitles` — the exact stored titles of the completed/abandoned workstreams in the payload.
 */
export function foldTextIssues({ rendered, terminalTitles }) {
  const issues = [];
  if (!Array.isArray(rendered) || rendered.length === 0) {
    issues.push("no folded workstream card rendered in this dataset");
    return issues;
  }
  for (const { title, text } of rendered) {
    if (!text) {
      issues.push(`folded workstream ${JSON.stringify(title)} renders no text`);
    }
  }
  for (const title of terminalTitles ?? []) {
    if (!rendered.some((card) => card.title === title)) {
      issues.push(`terminal workstream ${JSON.stringify(title)} is not rendered in the fold`);
    }
  }
  return issues;
}
