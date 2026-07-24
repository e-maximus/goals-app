import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Goal, Task } from "../domain";
import { buildAgenda } from "../agenda";

const DAY = 24 * 60 * 60 * 1000;
/** A fixed "now", mid-morning, so UTC-midnight arithmetic is unambiguous. */
const NOW = Date.UTC(2026, 5, 15, 10, 0, 0);
const TODAY = Date.UTC(2026, 5, 15);

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g-1",
    title: "A goal",
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    status: "active",
    steps: [],
    groups: [],
    notes: [],
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t-1", title: "A task", done: false, createdAt: NOW - DAY, ...overrides };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("buildAgenda", () => {
  it("sorts deadlines into overdue, today and upcoming", async () => {
    const agenda = buildAgenda(
      [
        goal({
          id: "g-1",
          steps: [
            { id: "s-late", text: "Late", done: false, dueDate: TODAY - 3 * DAY },
            { id: "s-today", text: "Today", done: false, dueDate: TODAY },
            { id: "s-soon", text: "Soon", done: false, dueDate: TODAY + 2 * DAY },
            { id: "s-far", text: "Far", done: false, dueDate: TODAY + 60 * DAY },
            { id: "s-undated", text: "Undated", done: false },
          ],
        }),
      ],
      [],
      NOW
    );

    assert.deepEqual(ids(agenda.overdue), ["s-late"]);
    assert.deepEqual(ids(agenda.today), ["s-today"]);
    assert.deepEqual(ids(agenda.upcoming), ["s-soon"]);
    // Beyond the horizon and undated items are not "nothing to do" — they are
    // just not today's problem, and listing them would bury what is.
    assert.ok(!ids(agenda.upcoming).includes("s-far"));
    assert.ok([...agenda.overdue, ...agenda.today, ...agenda.upcoming].every((i) => i.id !== "s-undated"));
  });

  it("counts a deadline as missed only once its day has fully passed", async () => {
    // Due dates are UTC midnights, so a step due today is due, not late, all day.
    const agenda = buildAgenda(
      [goal({ steps: [{ id: "s-1", text: "Due today", done: false, dueDate: TODAY }] })],
      [],
      TODAY + 23 * 60 * 60 * 1000
    );

    assert.deepEqual(ids(agenda.today), ["s-1"]);
    assert.deepEqual(agenda.overdue, []);
  });

  it("leaves paused goals out entirely", async () => {
    const agenda = buildAgenda(
      [
        goal({
          id: "g-paused",
          status: "paused",
          dueDate: TODAY - DAY,
          steps: [{ id: "s-1", text: "Still dated", done: false, dueDate: TODAY }],
        }),
      ],
      [],
      NOW
    );

    // Pausing is the user saying "not now". A paused goal whose steps kept
    // showing up in today's list would make the button meaningless.
    assert.deepEqual(agenda.overdue, []);
    assert.deepEqual(agenda.today, []);
    assert.equal(agenda.counts.pausedGoals, 1);
    assert.equal(agenda.counts.activeGoals, 0);
  });

  it("leaves finished work out", async () => {
    const agenda = buildAgenda(
      [
        goal({
          id: "g-done",
          dueDate: TODAY - DAY,
          steps: [{ id: "s-done", text: "Done", done: true, dueDate: TODAY - DAY }],
        }),
      ],
      [task({ id: "t-done", done: true, dueDate: TODAY - DAY })],
      NOW
    );

    // A deadline you have already met is not a deadline.
    assert.deepEqual(agenda.overdue, []);
    assert.equal(agenda.counts.openTasks, 0);
  });

  it("puts every unticked daily habit in today, dated or not", async () => {
    const agenda = buildAgenda(
      [],
      [
        task({ id: "t-daily", title: "Morning pages", daily: true }),
        task({ id: "t-daily-done", title: "Stretch", daily: true, completedOn: TODAY }),
        task({ id: "t-daily-stale", title: "Read", daily: true, completedOn: TODAY - DAY }),
      ],
      NOW
    );

    // Yesterday's completion has expired — that is what makes a habit recur.
    assert.deepEqual(ids(agenda.today).sort(), ["t-daily", "t-daily-stale"]);
  });

  it("flags active goals that have gone quiet, worst first", async () => {
    const agenda = buildAgenda(
      [
        goal({ id: "g-quiet", updatedAt: NOW - 30 * DAY, steps: [{ id: "s", text: "x", done: false }] }),
        goal({ id: "g-quieter", updatedAt: NOW - 90 * DAY, steps: [{ id: "s2", text: "y", done: false }] }),
        goal({ id: "g-fresh", updatedAt: NOW - DAY, steps: [{ id: "s3", text: "z", done: false }] }),
      ],
      [],
      NOW
    );

    assert.deepEqual(ids(agenda.stale), ["g-quieter", "g-quiet"]);
    assert.equal(agenda.stale[0]!.daysSinceActivity, 90);
  });

  it("skips a group whose steps are all done", async () => {
    const agenda = buildAgenda(
      [
        goal({
          groups: [
            {
              id: "gr-done",
              title: "Finished",
              dueDate: TODAY,
              steps: [{ id: "s-1", text: "x", done: true }],
            },
            {
              id: "gr-open",
              title: "Open",
              dueDate: TODAY,
              steps: [{ id: "s-2", text: "y", done: false }],
            },
          ],
        }),
      ],
      [],
      NOW
    );

    assert.deepEqual(
      agenda.today.filter((i) => i.kind === "group").map((i) => i.id),
      ["gr-open"]
    );
  });

  it("carries the goal and a link on every item", async () => {
    const agenda = buildAgenda(
      [
        goal({
          id: "g-1",
          title: "Move to Barcelona",
          steps: [{ id: "s-1", text: "Get the visa", done: false, dueDate: TODAY }],
        }),
      ],
      [task({ id: "t-loose", dueDate: TODAY })],
      NOW
    );

    const step = agenda.today.find((i) => i.id === "s-1")!;
    assert.deepEqual(step.goal, {
      id: "g-1",
      title: "Move to Barcelona",
      url: "/goal/g-1-move-to-barcelona",
    });
    // A task need not belong to a goal.
    assert.equal(agenda.today.find((i) => i.id === "t-loose")!.goal, null);
  });

  it("honours a wider horizon", async () => {
    const goals = [goal({ steps: [{ id: "s-1", text: "x", done: false, dueDate: TODAY + 20 * DAY }] })];

    assert.deepEqual(buildAgenda(goals, [], NOW).upcoming, []);
    assert.deepEqual(ids(buildAgenda(goals, [], NOW, 30).upcoming), ["s-1"]);
  });
});
