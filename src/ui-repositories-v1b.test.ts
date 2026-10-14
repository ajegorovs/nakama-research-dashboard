/**
 * Source UI test — V1b (Repositories composition) and the shared WorkstreamCard context.
 *
 * Two facts the repository panel's composition turns on, exercised through the exported pure helpers the
 * panel calls — no DOM:
 *
 * 1. The repository's workstreams are **partitioned by the one terminal predicate and grouped by parent
 *    project**: the nonterminal work reads in the dominant lane, the historical (completed/abandoned) work
 *    folds, both keep the projection's own order, and together the two partitions are the original list
 *    exactly once — so the fold can never drop, duplicate or reorder a workstream, and the lane's count and
 *    the fold's count are the true partitions.
 * 2. The shared WorkstreamCard's `context` prop is the only thing that changes between callers: the default
 *    (`{ view: "general" }`, Projects/People) shows every supporting repository, while the repository
 *    context (`{ view: "repository", repositoryId }`) suppresses *only* the panel's own subject's name.
 */
import { describe, expect, test } from "bun:test";
import {
  GENERAL_WORKSTREAM_CARD_CONTEXT,
  partitionRepositoryWorkstreams,
  visibleWorkstreamRepositories,
} from "./ui";

/** A workstream with only the two fields the partition reads; `state`/`topicId` are the whole contract. */
const axis = (id: string, topicId: string, state: string) => ({
  id,
  state,
  topicId,
});

describe("V1b repository workstream partition", () => {
  test("nonterminal and historical split through the one terminal predicate, grouped by project", () => {
    const axes = [
      axis("a1", "p1", "active"),
      axis("a2", "p2", "blocked"),
      axis("a3", "p1", "completed"),
      axis("a4", "p1", "parked"),
      axis("a5", "p2", "abandoned"),
    ];
    const { groups, historicalCount, nonterminalCount } =
      partitionRepositoryWorkstreams(axes);
    // Groups keep first-appearance order; a1 (active) and a3 (completed) share p1, then p2's axes.
    expect(groups.map((group) => group.topicId)).toEqual(["p1", "p2"]);
    expect(groups[0].nonterminal.map((entry) => entry.id)).toEqual(["a1", "a4"]);
    expect(groups[0].historical.map((entry) => entry.id)).toEqual(["a3"]);
    expect(groups[1].nonterminal.map((entry) => entry.id)).toEqual(["a2"]);
    expect(groups[1].historical.map((entry) => entry.id)).toEqual(["a5"]);
    // parked and draft are NOT terminal: the heading says nonterminal, not "current".
    expect(nonterminalCount).toBe(3);
    expect(historicalCount).toBe(2);
  });

  test("the partitions are disjoint and their union is the original list, in order", () => {
    const axes = [
      axis("x", "p", "draft"),
      axis("y", "p", "completed"),
      axis("z", "q", "abandoned"),
      axis("w", "q", "active"),
    ];
    const { groups, historicalCount, nonterminalCount } =
      partitionRepositoryWorkstreams(axes);
    const lane = groups.flatMap((group) => group.nonterminal);
    const historical = groups.flatMap((group) => group.historical);
    expect(nonterminalCount + historicalCount).toBe(axes.length);
    expect(new Set([...lane, ...historical]).size).toBe(axes.length);
    expect([...lane, ...historical].map((entry) => entry.id).sort()).toEqual(
      ["w", "x", "y", "z"],
    );
    expect(historical.every((entry) => entry.state !== "active")).toBe(true);
  });

  test("an empty list partitions to no groups and two zero counts", () => {
    const { groups, historicalCount, nonterminalCount } =
      partitionRepositoryWorkstreams([]);
    expect(groups).toEqual([]);
    expect(nonterminalCount).toBe(0);
    expect(historicalCount).toBe(0);
  });

  test("a repository with only nonterminal work yields no historical group", () => {
    const { groups, historicalCount } = partitionRepositoryWorkstreams([
      axis("n1", "p", "active"),
      axis("n2", "p", "parked"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].historical).toEqual([]);
    expect(historicalCount).toBe(0);
  });
});

describe("WorkstreamCard context", () => {
  const repositories = [
    { fullName: "org/subject", id: "r-subject" },
    { fullName: "org/other", id: "r-other" },
  ];

  test("the default context is general and shows every supporting repository", () => {
    expect(GENERAL_WORKSTREAM_CARD_CONTEXT).toEqual({ view: "general" });
    expect(
      visibleWorkstreamRepositories(repositories, GENERAL_WORKSTREAM_CARD_CONTEXT).map(
        (repository) => repository.id,
      ),
    ).toEqual(["r-subject", "r-other"]);
  });

  test("the repository context suppresses only its own subject, preserving every other repository's metadata in order", () => {
    // The card's real shape: `{ fullName, id, url? }`. The subject is first, several *other* repositories
    // follow in the projection's own order — one without a url (the optional field is optional) — and the
    // suppression must drop exactly the subject, keeping every other row's name, id and url untouched.
    const rich = [
      { fullName: "org/subject", id: "r-subject", url: "https://example.invalid/org/subject" },
      { fullName: "org/other", id: "r-other", url: "https://example.invalid/org/other" },
      { fullName: "org/third", id: "r-third", url: "https://example.invalid/org/third" },
      { fullName: "org/fourth", id: "r-fourth" },
    ];
    const shown = visibleWorkstreamRepositories(rich, {
      repositoryId: "r-subject",
      view: "repository",
    });
    // r-other survives, alongside every other repository, in the projection's own order.
    expect(shown.map((repository) => repository.id)).toEqual([
      "r-other",
      "r-third",
      "r-fourth",
    ]);
    // Full metadata is retained, as the same objects — no name or url dropped, rebuilt or reordered.
    expect(shown).toEqual([rich[1], rich[2], rich[3]]);
    expect(shown[0].fullName).toBe("org/other");
    expect(shown[0].url).toBe("https://example.invalid/org/other");
    // Only the one subject is removed: the count drops by exactly one, and nothing else filters out.
    expect(shown).toHaveLength(rich.length - 1);
    expect(shown.some((repository) => repository.id === "r-subject")).toBe(false);
  });

  test("a repository context whose id matches nothing keeps every repository", () => {
    const shown = visibleWorkstreamRepositories(repositories, {
      repositoryId: "r-absent",
      view: "repository",
    });
    expect(shown).toEqual(repositories);
  });
});
