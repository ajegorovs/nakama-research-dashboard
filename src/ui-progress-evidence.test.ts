/**
 * Source UI test — Progress **Supporting evidence**: the paged, independent section over the backend's
 * additive `evidencePage`.
 *
 * The backend pins the page's contract (`evidence-page.test.ts`): a complete SQL-paged union of branch,
 * PR, activities and notes with an authoritative `total`, a stable per-record `id`, the raw date, author
 * id/category, activity summaries and a note's full text; URLs only from real stored data. This file pins
 * the UI half of the same contract without a DOM, the way `ui-progress-v2b.test.ts` reads the rendered
 * source:
 *
 *   - the record type **mirrors** the store's `AxisEvidenceRecord` field set, so the view reads every
 *     field the page carries and the two cannot drift;
 *   - `evidenceRecordParts` resolves each record truthfully: a PR named "Open pull request", a branch
 *     "Open branch" only with a real URL (else its stored name), an activity's real summary with a single
 *     source reference/type token, a note's full text, a link only for an actual HTTP(S) `sourceUrl`, the
 *     recorded category+id as the author (never a name), the stored date — and empty fields (omitted, not
 *     faked) for the structural branch/PR;
 *   - `progressEvidenceSummary` states the **authoritative total** when a page was answered and the count
 *     *shown* for the legacy capped fallback — never a count derived from returned rows;
 *   - the wiring: one request carries `taskOffset` **and** `evidenceOffset`/`evidencePageSize` (no third
 *     duplicate read), the completed page commits under the same generation guard as its siblings, the
 *     shared pager is `label="Evidence"`, and every `loadWorkstream` call propagates the evidence offset.
 */
import { describe, expect, test } from "bun:test";
import { evidenceRecordParts, progressEvidenceSummary } from "./ui";

const source = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();
/** The source with all runs of whitespace collapsed, so an assertion is on tokens, not indentation. */
const flat = source.replace(/\s+/g, " ");

const at = (needle: string, from = 0): number => source.indexOf(needle, from);

/** The legacy `AxisEvidence` fields every record carries; the extra keys come from the page. */
const base = {
  at: "",
  by: "",
  label: "",
  sourceRef: "",
  sourceType: null as string | null,
  sourceUrl: "",
};

describe("Supporting evidence — the record type mirrors the backend", () => {
  test("AxisEvidenceRecord lists the page's own identity and text fields", () => {
    const start = at("type AxisEvidenceRecord = AxisEvidence & {");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("};", start));
    for (const field of ["id:", "recordId:", "summary:", "authorId:"]) {
      expect(block).toContain(field);
    }
  });

  test("the legacy AxisEvidence field set is preserved untouched", () => {
    const start = at("type AxisEvidence = {");
    const block = source.slice(start, source.indexOf("};", start));
    for (const field of [
      "kind:",
      "label:",
      "sourceType:",
      "sourceRef:",
      "sourceUrl:",
      "by:",
      "at:",
    ]) {
      expect(block).toContain(field);
    }
  });
});

describe("Supporting evidence — evidenceRecordParts", () => {
  test("a PR is named for what it opens and keeps its stored label as provenance", () => {
    const parts = evidenceRecordParts({
      ...base,
      at: "",
      authorId: "",
      kind: "pull_request",
      label: "PR #42",
      recordId: null,
      sourceUrl: "https://github.com/acme/evidence/pull/42",
      summary: "",
    });
    expect(parts.name).toBe("Open pull request");
    expect(parts.provenance).toBe("PR #42");
    expect(parts.href).toBe("https://github.com/acme/evidence/pull/42");
    // A structural row has no stored text, author or date — those are empty, never invented.
    expect(parts.body).toBe("");
    expect(parts.author).toBe("");
    expect(parts.date).toBe("");
  });

  test("a branch is 'Open branch' only with a real URL, else its stored name", () => {
    const linked = evidenceRecordParts({
      ...base,
      kind: "branch",
      label: "feature/url",
      sourceUrl: "https://github.com/acme/one/tree/feature/url",
    });
    expect(linked.name).toBe("Open branch");
    expect(linked.provenance).toBe("feature/url");
    expect(linked.href).toBe("https://github.com/acme/one/tree/feature/url");

    const bare = evidenceRecordParts({
      ...base,
      kind: "branch",
      label: "feature/url",
      sourceUrl: "",
    });
    // No destination → the branch is plain text, not an "Open" link that goes nowhere.
    expect(bare.name).toBe("feature/url");
    expect(bare.provenance).toBe("");
    expect(bare.href).toBeNull();
  });

  test("an activity shows its real summary and one source reference/type token", () => {
    const parts = evidenceRecordParts({
      ...base,
      at: "2024-03-06T00:00:00.000Z",
      authorId: "user-6",
      by: "human",
      kind: "activity",
      label: "commit abc6",
      recordId: "act-6",
      sourceRef: "abc6",
      sourceType: "github_commit",
      summary: "activity 6",
    });
    expect(parts.body).toBe("activity 6");
    // The derived label already names the source ref and type; it is the ONE provenance token, so the
    // ref is not repeated in a second tail.
    expect(parts.provenance).toBe("commit abc6");
    expect(parts.provenance).not.toContain("abc6 ·");
    // The author is the recorded category and id — never a mapped person's name.
    expect(parts.author).toBe("human · user-6");
    expect(parts.date).toBe("2024-03-06T00:00:00.000Z");
  });

  test("a note keeps its full text and carries no generic 'note' tail", () => {
    const text = "x".repeat(1500);
    const parts = evidenceRecordParts({
      ...base,
      at: "2024-02-06T00:00:00.000Z",
      authorId: "alice",
      by: "human",
      kind: "annotation",
      label: "note",
      recordId: "note-6",
      summary: text,
    });
    // The full note text travels whole; the excerpt renders the clamp, never the model.
    expect(parts.body).toBe(text);
    expect(parts.body.length).toBe(1500);
    expect(parts.provenance).toBe("");
    expect(parts.author).toBe("human · alice");
  });

  test("only an actual HTTP(S) stored URL becomes a link", () => {
    const url = (sourceUrl: string) =>
      evidenceRecordParts({ ...base, kind: "activity", sourceUrl, summary: "x" }).href;
    expect(url("https://github.com/acme/x")).toBe("https://github.com/acme/x");
    expect(url("http://x.example/a")).toBe("http://x.example/a");
    expect(url("gitlab.example.com/group/project")).toBeNull();
    expect(url("ftp://x.example/a")).toBeNull();
    expect(url("javascript:alert(1)")).toBeNull();
    expect(url("")).toBeNull();
  });

  test("an author with no recorded id does not fabricate a person", () => {
    const parts = evidenceRecordParts({
      ...base,
      authorId: "",
      by: "agent",
      kind: "activity",
      label: "commit abc",
      summary: "did a thing",
    });
    expect(parts.author).toBe("agent");
  });
});

describe("Supporting evidence — the heading", () => {
  test("states the authoritative total when paged, the count shown otherwise", () => {
    // 6 returned rows over a total of 7 → the heading still says 7: it is independent of the page length.
    expect(progressEvidenceSummary({ count: 6, total: 7 })).toBe(
      "Supporting evidence (7)",
    );
    expect(progressEvidenceSummary({ count: 5, total: 5 })).toBe(
      "Supporting evidence (5)",
    );
    expect(progressEvidenceSummary({ count: 0, total: 0 })).toBe(
      "Supporting evidence",
    );
    // The legacy capped `axis.evidence` fallback has no total, so its count is labelled as *shown*.
    expect(progressEvidenceSummary({ count: 12 })).toBe(
      "Supporting evidence (12 shown)",
    );
    expect(progressEvidenceSummary({ count: 0 })).toBe("Supporting evidence");
  });
});

describe("Supporting evidence — the section wiring", () => {
  const evidenceBlock = (() => {
    const start = at('className="rd-progress-evidence"');
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("</section>", start));
  })();

  test("the heading is a static section heading, and the page marks are reported honestly", () => {
    expect(evidenceBlock).toContain('className="rd-section-heading"');
    expect(evidenceBlock).toContain("progressEvidenceSummary({");
    expect(evidenceBlock).toContain("total: evidencePage ? evidencePage.total : null");
    expect(evidenceBlock).toContain(
      'data-rd-progress-evidence-page={evidencePage ? "true" : "false"}',
    );
    expect(evidenceBlock).toContain(
      'data-rd-progress-evidence-total={evidencePage ? evidencePage.total : ""}',
    );
    // The legacy capped-line hooks survive.
    expect(evidenceBlock).toContain("data-rd-axis-evidence={evidence.length}");
    expect(evidenceBlock).toContain("data-rd-progress-evidence={evidence.length}");
  });

  test("each row keeps the ref/url/no-url hooks and adds a stable id hook", () => {
    expect(evidenceBlock).toContain("data-rd-evidence-ref={ref}");
    expect(evidenceBlock).toContain("data-rd-evidence-url={ref}");
    expect(evidenceBlock).toContain(
      'data-rd-evidence-no-url={parts.href ? undefined : "true"}',
    );
    expect(evidenceBlock).toContain("data-rd-evidence-id={id}");
    expect(evidenceBlock).toContain("data-rd-evidence-kind={item.kind}");
    // The stored row id travels too, so a recorded item keeps its full note identity for traversal.
    expect(evidenceBlock).toContain(
      'data-rd-evidence-record-id={record.recordId ?? ""}',
    );
  });

  test("records render meaningfully: a real link, the stored date and the shared excerpt", () => {
    expect(evidenceBlock).toContain("href={parts.href}");
    expect(evidenceBlock).toContain('rel="noopener noreferrer"');
    expect(evidenceBlock).toContain('target="_blank"');
    expect(evidenceBlock).toContain("<EventDate at={parts.date} />");
    expect(evidenceBlock).toContain("<TextExcerpt text={parts.body} />");
    // The retired duplicate tail (label shown, then the ref again) is gone.
    expect(evidenceBlock).not.toContain("{item.sourceRef || item.sourceType}");
  });

  test("the pager is the shared one, labelled Evidence, over the backend total", () => {
    expect(evidenceBlock).toContain('<Pager');
    expect(evidenceBlock).toContain('label="Evidence"');
    expect(evidenceBlock).toContain("pageSize={evidencePage.limit}");
    expect(evidenceBlock).toContain("total={evidencePage.total}");
    expect(evidenceBlock).toContain("onOffset={onEvidenceOffset}");
  });
});

describe("Supporting evidence — the independent offset wiring", () => {
  test("the task request carries both offsets, so evidence needs no third read", () => {
    expect(flat).toContain(
      "evidenceOffset: nextEvidenceOffset, evidencePageSize: PROGRESS_PAGE_SIZE, offset: nextTaskOffset",
    );
    // The evidence page rides on the task response and commits under the same generation guard.
    expect(flat).toContain("setWorkstreamEvidence(taskResult?.evidencePage ?? null);");
  });

  test("the evidence offset has its own state and the page its own holder", () => {
    expect(flat).toContain(
      "const [evidenceOffset, setEvidenceOffset] = React.useState(0);",
    );
    expect(flat).toContain(
      "const [workstreamEvidence, setWorkstreamEvidence] = React.useState<",
    );
    expect(flat).toContain("nextEvidenceOffset: number");
  });

  test("selecting a workstream resets all three offsets and clears the old evidence", () => {
    const start = at("function selectWorkstream(");
    const block = source.slice(start, start + 900);
    expect(block).toContain("setTaskOffset(0);");
    expect(block).toContain("setActivityOffset(0);");
    expect(block).toContain("setEvidenceOffset(0);");
    expect(block).toContain("setWorkstreamEvidence(null);");
    expect(block).toContain("loadWorkstream(next, 0, 0, 0)");
  });

  test("EVERY loadWorkstream call propagates the evidence offset", () => {
    // One definition plus seven call sites (refresh/reload, selection, direct task navigation, both
    // page handlers, the correction re-read, and the evidence handler).
    expect((flat.match(/loadWorkstream\(/g) ?? []).length).toBe(8);
    for (const call of [
      "loadWorkstream( progressSelection, taskOffset, activityOffset, evidenceOffset )",
      "loadWorkstream( progressSelection, next, activityOffset, evidenceOffset )",
      "loadWorkstream( progressSelection, taskOffset, next, evidenceOffset )",
      "loadWorkstream( progressSelection, taskOffset, activityOffset, next )",
      "loadWorkstream(next, 0, 0, 0)",
    ]) {
      expect(flat).toContain(call);
    }
    // No three-argument call survives anywhere.
    expect(source).not.toContain(
      "loadWorkstream(progressSelection, taskOffset, activityOffset)",
    );
    expect(source).not.toContain(
      "loadWorkstream(progressSelection, next, activityOffset)",
    );
    expect(source).not.toContain(
      "loadWorkstream(progressSelection, taskOffset, next)",
    );
  });

  test("the evidence handler requests its own page without touching tasks or activity", () => {
    const start = at("onEvidenceOffset={(next) => {");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, start + 600);
    expect(block).toContain("setEvidenceOffset(next);");
    expect(block).toContain("loadWorkstream(");
    expect(flat).toContain(
      "loadWorkstream( progressSelection, taskOffset, activityOffset, next )",
    );
    // The evidence page is passed to the view beside the task/activity pages.
    expect(flat).toContain("evidenceOffset={evidenceOffset}");
    expect(flat).toContain("evidencePage={workstreamEvidence}");
    expect(flat).toContain("onEvidenceOffset={");
  });
});
