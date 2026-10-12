/**
 * Source UI test — V1a (People composition) involvement partition.
 *
 * The one fact the People lane's composition turns on: a person's topic involvements are **partitioned, not
 * reordered**. Projects that carry at least one of the person's own workstreams read first; the
 * project-only affiliations follow; each partition keeps the projection's own order; and the two partitions
 * together are the original list exactly once — so the lane can never drop, duplicate or reorder an
 * affiliation, and its `data-rd-person-topics` total stays the true count rather than the bearing subset.
 *
 * The decision is exercised through the exported `partitionInvolvements` — the same function the
 * `PersonPanel` lane calls — so a regression fails here without a DOM.
 */
import { describe, expect, test } from "bun:test";
import { partitionInvolvements } from "./ui";

type Involvements = Parameters<typeof partitionInvolvements>[0];
type Involvement = Involvements[number];

/** A topic involvement with `axes` of its own; only the fields the partition reads are meaningful. */
const involvement = (id: string, axes: number): Involvement => ({
  topic: { id, name: id, status: "active" },
  role: "author",
  axes: Array.from({ length: axes }, (_, index) => ({
    id: `${id}-axis-${index}`,
  })) as Involvement["axes"],
});

describe("V1a people involvement partition", () => {
  test("bearing projects read first, preserving each partition's own order", () => {
    const topics = [
      involvement("p1", 2),
      involvement("p2", 0),
      involvement("p3", 1),
      involvement("p4", 0),
    ];
    const { bearing, projectOnly } = partitionInvolvements(topics);
    expect(bearing.map((entry) => entry.topic.id)).toEqual(["p1", "p3"]);
    expect(projectOnly.map((entry) => entry.topic.id)).toEqual(["p2", "p4"]);
  });

  test("the partitions are disjoint and their union is the original list, in order", () => {
    const topics = [
      involvement("a", 1),
      involvement("b", 0),
      involvement("c", 0),
      involvement("d", 3),
    ];
    const { bearing, projectOnly } = partitionInvolvements(topics);
    // Together, exactly once — the lane's total never shrinks to the bearing subset.
    expect(bearing.length + projectOnly.length).toBe(topics.length);
    expect(new Set([...bearing, ...projectOnly]).size).toBe(topics.length);
    // Every bearing project bears a workstream; every project-only one carries none.
    expect(bearing.every((entry) => entry.axes.length > 0)).toBe(true);
    expect(projectOnly.every((entry) => entry.axes.length === 0)).toBe(true);
  });

  test("an empty involvement list partitions to two empties", () => {
    const { bearing, projectOnly } = partitionInvolvements([]);
    expect(bearing).toEqual([]);
    expect(projectOnly).toEqual([]);
  });

  test("a person with only bearing projects yields no project-only affiliation", () => {
    const { bearing, projectOnly } = partitionInvolvements([
      involvement("x", 1),
      involvement("y", 2),
    ]);
    expect(bearing.length).toBe(2);
    expect(projectOnly).toEqual([]);
  });
});
