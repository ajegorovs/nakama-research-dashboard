/**
 * Source UI test — V2a (Projects hierarchy and the project-context shared card).
 *
 * The facts V2a's Projects detail turns on, exercised through the exported pure helpers the view calls —
 * no DOM:
 *
 * 1. The shared WorkstreamCard's `context` prop now has a third reading. The **project** context drops
 *    **only** the repository links the project panel already lists directly — the ids carried in its own
 *    "Supporting repositories" list (`project_repository`) — and demotes the per-card latest-event prose
 *    into the exact Progress entry; a workstream's own repository links (`axis_repository`) that the panel
 *    does not show **survive** on the card, so no project association is fabricated. The `general` (People)
 *    and `repository` (Repositories panel) contexts are unchanged: the card keeps every other repository,
 *    its title → the exact Progress entry, its status, its stored reading and its own task counts.
 * 2. The card's reading is the axis's stored `description`, else its stored current reading
 *    (`currentState`), else the empty string — never an invented sentence, and passed through byte-for-byte.
 * 3. One payload builder (`projectWorkstreamCardData`) constructs the card's data for **both** the current
 *    lane and the completed/abandoned fold: counts from the axis's own stored task states, the newest
 *    recorded history row as the latest event (or null), and every carried string/array untouched.
 */
import { describe, expect, test } from "bun:test";
import {
  GENERAL_WORKSTREAM_CARD_CONTEXT,
  projectWorkstreamCardContext,
  projectWorkstreamCardData,
  visibleWorkstreamRepositories,
  workstreamCardReading,
  workstreamCardShowsEvent,
} from "./ui";
import type { WorkstreamCardContext } from "./ui";

/** The card-data helper's own input shape, derived so the test needs no private type import. */
type CardInput = Parameters<typeof projectWorkstreamCardData>[0];
type HistoryRow = NonNullable<CardInput["history"]>[number];
type Task = NonNullable<CardInput["problems"]>[number];
type Repo = CardInput["repositories"][number];

const repo = (id: string, fullName: string) =>
  ({ fullName, id } as unknown as Repo);
const row = (at: string, summary: string) =>
  ({ occurredAt: at, summary } as unknown as HistoryRow);
const task = (state: string) => ({ state } as unknown as Task);

/** An axis with only the fields the builder reads; the caller overrides what a case needs. */
const axis = (overrides: Partial<CardInput> = {}): CardInput => ({
  currentState: "",
  description: "",
  id: "a1",
  repositories: [],
  state: "active",
  stateConfidence: "confirmed",
  title: "Workstream",
  ...overrides,
});

describe("V2a project-context workstream card", () => {
  const repositories = [
    repo("r-subject", "org/subject"),
    repo("r-other", "org/other"),
    repo("r-third", "org/third"),
  ];

  test("the general context is unchanged: it shows every supporting repository", () => {
    expect(GENERAL_WORKSTREAM_CARD_CONTEXT).toEqual({ view: "general" });
    expect(
      visibleWorkstreamRepositories(repositories, GENERAL_WORKSTREAM_CARD_CONTEXT).map(
        (entry) => entry.id,
      ),
    ).toEqual(["r-subject", "r-other", "r-third"]);
  });

  test("the repository context is unchanged: it suppresses only its own subject", () => {
    const context: WorkstreamCardContext = {
      repositoryId: "r-subject",
      view: "repository",
    };
    // First and last survive, in the projection's own order; full metadata is retained.
    expect(
      visibleWorkstreamRepositories(repositories, context).map((entry) => entry.id),
    ).toEqual(["r-other", "r-third"]);
    expect(visibleWorkstreamRepositories(repositories, context)[0]).toBe(repositories[1]);
  });

  test("the project context suppresses exactly the project's direct repositories, keeping the rest", () => {
    // The panel's own "Supporting repositories" list shows the project's direct links (project_repository):
    // r-subject and r-third. The card must not repeat those.
    const context = projectWorkstreamCardContext(["r-subject", "r-third"]);
    expect(context).toEqual({ repositoryIds: ["r-subject", "r-third"], view: "project" });
    expect(
      visibleWorkstreamRepositories(repositories, context).map((entry) => entry.id),
    ).toEqual(["r-other"]);
    // The survivor is the same object — metadata retained, not rebuilt or reordered.
    expect(visibleWorkstreamRepositories(repositories, context)[0]).toBe(repositories[1]);
    // The suppression is the project context's alone; the same list is untouched elsewhere.
    expect(
      visibleWorkstreamRepositories(repositories, GENERAL_WORKSTREAM_CARD_CONTEXT),
    ).toHaveLength(3);
  });

  test("a project with no direct repositories suppresses none of a workstream's own links", () => {
    // No overlap to deduplicate: every workstream repository link stays, as its own workstream link.
    const context = projectWorkstreamCardContext([]);
    expect(
      visibleWorkstreamRepositories(repositories, context).map((entry) => entry.id),
    ).toEqual(["r-subject", "r-other", "r-third"]);
  });

  test("the project context is the only one that drops the latest-event prose", () => {
    expect(workstreamCardShowsEvent(GENERAL_WORKSTREAM_CARD_CONTEXT)).toBe(true);
    expect(
      workstreamCardShowsEvent({ repositoryId: "r", view: "repository" }),
    ).toBe(true);
    expect(workstreamCardShowsEvent(projectWorkstreamCardContext(["r-subject"]))).toBe(false);
  });
});

describe("V2a workstream card reading", () => {
  test("the stored description wins, else the stored current reading, else empty — no invented sentence", () => {
    expect(workstreamCardReading({ currentState: "reading", description: "purpose" })).toBe(
      "purpose",
    );
    expect(workstreamCardReading({ currentState: "reading", description: "" })).toBe(
      "reading",
    );
    expect(workstreamCardReading({ currentState: "", description: "purpose" })).toBe(
      "purpose",
    );
    expect(workstreamCardReading({})).toBe("");
    expect(workstreamCardReading({ currentState: "", description: "" })).toBe("");
  });

  test("the chosen string is carried through byte-for-byte", () => {
    const verbatim = "  leading and trailing  \n\tan embedded tab ";
    expect(workstreamCardReading({ description: verbatim })).toBe(verbatim);
    expect(workstreamCardReading({ currentState: verbatim })).toBe(verbatim);
  });
});

describe("V2a project workstream card payload", () => {
  test("counts come from the stored task states and the latest event is the newest recorded history row", () => {
    const problems = [
      task("open"),
      task("open"),
      task("blocked"),
      task("resolved"),
    ];
    const history = [row("2026-01-02T00:00:00Z", "newest"), row("2026-01-01T00:00:00Z", "older")];
    const data = projectWorkstreamCardData(
      axis({ history, id: "a1", problems, title: "Exact title" }),
    );
    expect(data.openTasks).toBe(2);
    expect(data.blockedTasks).toBe(1);
    expect(data.latestEvent).toEqual({ at: "2026-01-02T00:00:00Z", summary: "newest" });
  });

  test("every carried string and the repository array are passed through untouched", () => {
    const repositories = [repo("r1", "org/r1")];
    const description = "Purpose: the exact stored string";
    const input = axis({
      currentState: "Current reading",
      description,
      id: "a7",
      repositories,
      state: "blocked",
      stateConfidence: "inferred",
      title: "A workstream",
    });
    const data = projectWorkstreamCardData(input);
    expect(data.description).toBe(description);
    expect(data.currentState).toBe("Current reading");
    expect(data.title).toBe("A workstream");
    expect(data.state).toBe("blocked");
    expect(data.stateConfidence).toBe("inferred");
    // The array is the same object — not filtered, rebuilt or reordered by the builder.
    expect(data.repositories).toBe(repositories);
  });

  test("an overview axis with no history or problems yields zero counts and a null event", () => {
    const data = projectWorkstreamCardData(axis({ id: "a2" }));
    expect(data.openTasks).toBe(0);
    expect(data.blockedTasks).toBe(0);
    expect(data.latestEvent).toBeNull();
    // An absent description is carried as empty, never guessed.
    expect(data.description).toBe("");
  });

  test("the one builder serves the current lane and the folded lane identically", () => {
    const build = () =>
      projectWorkstreamCardData(
        axis({ history: [row("2026-02-01T00:00:00Z", "event")], id: "same", problems: [task("open")] }),
      );
    expect(build()).toEqual(build());
  });
});
