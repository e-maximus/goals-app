import { describe, expect, it } from "vitest";
import { findGoalByParam, goalHref, slugify } from "../utils";

/**
 * A goal's URL carries its id and a cosmetic slug (`/goal/<id>-<title-slug>`).
 * Resolving that param back to a goal is done in two places now — the detail
 * view against the client store, and the route's `generateMetadata` against the
 * server-loaded one — so the rule lives in one function, tested here.
 */
describe("goal path resolution", () => {
  const goals = [
    { id: "abc123", title: "Record a podcast" },
    { id: "abc123x", title: "Record a second podcast" },
    { id: "zzz999", title: "Учить испанский" },
  ];

  it("round-trips a goal through its own href", () => {
    for (const goal of goals) {
      const param = goalHref(goal).replace("/goal/", "");
      expect(findGoalByParam(goals, param)).toBe(goal);
    }
  });

  it("resolves a bare id, as old links and deep links carry", () => {
    expect(findGoalByParam(goals, "abc123")).toBe(goals[0]);
  });

  it("prefers the longest id when one is a prefix of another", () => {
    expect(findGoalByParam(goals, "abc123x-record-a-second-podcast")).toBe(goals[1]);
  });

  it("ignores a stale slug — the id is what resolves", () => {
    expect(findGoalByParam(goals, "abc123-some-old-title")).toBe(goals[0]);
  });

  it("returns undefined for an unknown id", () => {
    expect(findGoalByParam(goals, "nope-nope")).toBeUndefined();
  });

  it("falls back to the bare id when a title has nothing to slug", () => {
    expect(slugify("🙂🙂")).toBe("");
    expect(goalHref({ id: "abc123", title: "🙂🙂" })).toBe("/goal/abc123");
  });
});
