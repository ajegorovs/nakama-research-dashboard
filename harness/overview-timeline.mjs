/**
 * overview-timeline.mjs — the null-axis bucket reader for `get_overview.timeline`.
 *
 * The store's `recentProgress` groups each topic's window events into axis buckets. An event that names a
 * topic but NO axis is a legitimate **topic-level** bucket whose `axis` is `null` (store key `""`) — the
 * store sorts it *after* the axis buckets rather than dropping it. The projection reader must therefore
 * represent that bucket (label it, keep its own event count) instead of dereferencing `bucket.axis.title`
 * on a null axis (which throws and aborts the whole pass — exit 2) and instead of dropping the bucket's
 * activity. Factored out of `verify-page.mjs` so the topic-level case and the axis case are both executable
 * in a unit test, without a browser or a served instance.
 */

/** The label a bucket with no axis carries. It is real work at the topic level, not a missing value. */
export const TOPIC_LEVEL_AXIS_LABEL = "(topic-level)";

/**
 * Map one timeline group's axis buckets to a null-safe shape. Never throws on `axis === null`, never drops
 * a bucket, and always carries the bucket's own event count.
 */
export function timelineBuckets(group) {
  return (group?.axes ?? []).map((bucket) => {
    const axis = bucket?.axis ?? null;
    const title = axis && typeof axis.title === "string" && axis.title.length > 0 ? axis.title : null;
    return {
      axis: title,
      events: Number(bucket?.eventCount ?? bucket?.events?.length ?? 0),
      label: title ?? TOPIC_LEVEL_AXIS_LABEL,
    };
  });
}

/**
 * Map the whole `get_overview.timeline` projection. Every bucket is kept (topic-level included), and each
 * group carries the sum of its buckets' events so capped activity is never silently dropped.
 */
export function summarizeTimeline(groups) {
  return (groups ?? []).map((group) => {
    const axes = timelineBuckets(group);
    return {
      axes,
      eventCount: axes.reduce((total, bucket) => total + bucket.events, 0),
      topic: group?.topic?.name ?? "",
    };
  });
}
