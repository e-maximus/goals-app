const DAY = 24 * 60 * 60 * 1000;

/** Floor a timestamp to local midnight, so day labels compare calendar days. */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * The relative label for a note's timestamp. "Today" and "Yesterday" are about
 * calendar days, not elapsed 24-hour spans, so both timestamps are floored to
 * local midnight before the diff. `now` is a parameter so boundary cases are
 * testable without faking the clock.
 */
export function formatWhen(createdAt: number, now: number = Date.now()): string {
  // Round, not floor: across a DST transition two local midnights are 23h or
  // 25h apart, and rounding still counts that as one day.
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(createdAt)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
