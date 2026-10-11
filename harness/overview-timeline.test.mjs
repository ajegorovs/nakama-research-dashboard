/**
 * overview-timeline.test.mjs — the executable check for the null-axis bucket reader (finding F2).
 *
 * `bun test harness/overview-timeline.test.mjs`
 *
 * The defect: `verify-page.mjs`'s projection reader dereferenced `bucket.axis.title` for every timeline
 * bucket, and an event recorded with a topic but no axis is a legitimate topic-level bucket whose `axis`
 * is `null` — the reader threw and aborted the whole pass (exit 2). The negative case here IS the defect:
 * the old reader must throw, and the fixed reader must NOT, must keep the bucket, and must label it.
 * A "fix" that merely dropped the null bucket would pass a presence-only test but fails the count check.
 */
import { describe, expect, test } from "bun:test";
import { TOPIC_LEVEL_AXIS_LABEL, summarizeTimeline, timelineBuckets } from "./overview-timeline.mjs";

/** The reader exactly as it was before the fix — the aborting shape. */
const retiredReader = (groups) => groups.map((g) => g.axes.map((a) => a.axis.title));

const realAxis = (title) => ({ axis: { id: title, title }, eventCount: 1, events: [{}] });
const topicLevelBucket = (events) => ({ axis: null, eventCount: events, events: Array(events).fill({}) });

describe("null-axis overview timeline reader", () => {
  test("positive: a real axis bucket keeps its own title and event count", () => {
    const groups = [{ axes: [realAxis("Workstream One")], topic: { name: "T" } }];
    const [group] = summarizeTimeline(groups);
    expect(group.axes).toEqual([{ axis: "Workstream One", events: 1, label: "Workstream One" }]);
    expect(group.eventCount).toBe(1);
  });

  test("positive: a topic-level (null-axis) bucket is represented and labelled, not dropped", () => {
    const groups = [
      { axes: [realAxis("Workstream One"), topicLevelBucket(2)], topic: { name: "T" } },
    ];
    const [group] = summarizeTimeline(groups);
    // Both buckets survive; the null one is labelled and keeps its count.
    expect(group.axes.length).toBe(2);
    const topicLevel = group.axes.find((b) => b.axis === null);
    expect(topicLevel).toBeDefined();
    expect(topicLevel.label).toBe(TOPIC_LEVEL_AXIS_LABEL);
    expect(topicLevel.events).toBe(2);
    // 1 + 2 — the topic-level activity is counted, never dropped.
    expect(group.eventCount).toBe(3);
  });

  test("negative (the defect): the retired reader throws on a null axis; the fixed one does not", () => {
    const groups = [{ axes: [topicLevelBucket(1)], topic: { name: "T" } }];
    expect(() => retiredReader(groups)).toThrow(); // the abort the pass used to hit (exit 2)
    expect(() => summarizeTimeline(groups)).not.toThrow();
    expect(() => timelineBuckets(groups[0])).not.toThrow();
  });

  test("negative: dropping the null bucket would lose its activity (a false green)", () => {
    const withNull = summarizeTimeline([
      { axes: [realAxis("A"), topicLevelBucket(4)], topic: { name: "T" } },
    ]);
    const dropped = summarizeTimeline([{ axes: [realAxis("A")], topic: { name: "T" } }]);
    // A reader that silently filtered the null bucket would report these equal; they are not.
    expect(withNull[0].eventCount).toBe(5);
    expect(dropped[0].eventCount).toBe(1);
    expect(withNull[0].axes.length).not.toBe(dropped[0].axes.length);
  });

  test("edge: an empty timeline maps to an empty array (no throw)", () => {
    expect(summarizeTimeline([])).toEqual([]);
    expect(summarizeTimeline(undefined)).toEqual([]);
  });
});
