import { describe, expect, it } from "vitest";
import { formatWhen } from "../notes-time";

/**
 * The "Today" / "Yesterday" labels on notes compare calendar days, not elapsed
 * 24-hour spans. All timestamps are built with the local-time `Date` constructor
 * so the cases hold regardless of the machine's timezone.
 */
describe("formatWhen", () => {
  it("labels a note written today as Today", () => {
    const created = new Date(2025, 6, 31, 23, 30).getTime();
    const now = new Date(2025, 6, 31, 23, 45).getTime();
    expect(formatWhen(created, now)).toBe("Today");
  });

  it("labels a late-evening note as Yesterday the next morning", () => {
    // The issue's repro: Jul 31 23:30 written, Aug 1 00:30 viewed — under 2
    // hours apart, but a calendar day has turned over.
    const created = new Date(2025, 6, 31, 23, 30).getTime();
    const now = new Date(2025, 7, 1, 0, 30).getTime();
    expect(formatWhen(created, now)).toBe("Yesterday");
  });

  it("labels a two-day-old note with its date", () => {
    // The issue's repro: Jul 30 22:00 written, Aug 1 00:30 viewed — about a day
    // and a half elapsed, but two calendar days have turned over.
    const created = new Date(2025, 6, 30, 22, 0).getTime();
    const now = new Date(2025, 7, 1, 0, 30).getTime();
    expect(formatWhen(created, now)).toBe("Jul 30");
  });

  it("labels a note written yesterday afternoon as Yesterday", () => {
    const created = new Date(2025, 6, 31, 14, 0).getTime();
    const now = new Date(2025, 7, 1, 9, 0).getTime();
    expect(formatWhen(created, now)).toBe("Yesterday");
  });
});
