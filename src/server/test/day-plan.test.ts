import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal, Task } from "../domain";
import { utcMidnight } from "../domain";
import * as repo from "../repo";
import { buildAgenda } from "../agenda";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The day plan: `plannedFor` on a task (the day the user chose to do it) and
 * `dayPlannedOn` on the user (the last day they settled a plan for). Both are
 * new columns on existing tables, so what matters here is that they survive the
 * whole-store rewrite and that a client which has never heard of them can still
 * save without wiping them.
 */

const DAY = 24 * 60 * 60 * 1000;

let pool: Pool;
let owner: string;

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await reset(pool);
  owner = await createOwner(pool);
});

function sampleGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    title: "Ship the thing",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    status: "active",
    steps: [],
    groups: [],
    notes: [],
    ...overrides,
  };
}

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    title: "Call the landlord",
    done: false,
    createdAt: 1_700_000_200_000,
    ...overrides,
  };
}

describe("the day plan through the whole-store write", () => {
  it("round-trips plannedFor and dayPlannedOn", async () => {
    const today = utcMidnight();
    await repo.replaceAll(
      pool,
      owner,
      [sampleGoal()],
      null,
      [
        sampleTask({ id: "t-planned", plannedFor: today }),
        sampleTask({ id: "t-loose", title: "Someday" }),
      ],
      today
    );

    const state = await repo.getState(pool, owner);
    assert.equal(state.dayPlannedOn, today);
    assert.equal(state.tasks.find((t) => t.id === "t-planned")?.plannedFor, today);
    // Absent rather than null: an unplanned task simply has no plan.
    assert.equal("plannedFor" in state.tasks.find((t) => t.id === "t-loose")!, false);
  });

  it("returns the settled day on the save's own result, not just on a re-read", async () => {
    const today = utcMidnight();
    const saved = await repo.replaceAll(pool, owner, [], null, [], today);
    assert.equal(saved.dayPlannedOn, today);
  });

  it("keeps a task planned for a day that has passed — nothing rolls over", async () => {
    const yesterday = utcMidnight() - DAY;
    await repo.replaceAll(pool, owner, [], null, [sampleTask({ plannedFor: yesterday })], yesterday);

    const state = await repo.getState(pool, owner);
    assert.equal(state.tasks[0]!.plannedFor, yesterday);
  });

  it("leaves the stored day alone when a save omits it", async () => {
    const today = utcMidnight();
    await repo.replaceAll(pool, owner, [], null, [], today);

    // A tab opened before the day plan existed: goals and tasks, no marker.
    await repo.replaceAll(pool, owner, [sampleGoal()], null, [sampleTask()]);

    const state = await repo.getState(pool, owner);
    assert.equal(state.dayPlannedOn, today);
  });

  it("reads as never planned for a user who has never planned", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null, []);
    const state = await repo.getState(pool, owner);
    assert.equal(state.dayPlannedOn, undefined);
  });

  it("keeps each owner's plan to itself", async () => {
    const other = await createOwner(pool, "owner-2");
    const today = utcMidnight();

    await repo.replaceAll(pool, owner, [], null, [sampleTask({ plannedFor: today })], today);
    await repo.replaceAll(pool, other, [], null, [sampleTask({ id: "t-other" })]);

    const theirs = await repo.getState(pool, other);
    assert.equal(theirs.dayPlannedOn, undefined);
    assert.equal(theirs.tasks.length, 1);
    assert.equal(theirs.tasks[0]!.plannedFor, undefined);
  });
});

describe("the day plan through the targeted (MCP) writers", () => {
  it("creates a task straight into a day", async () => {
    const today = utcMidnight();
    const task = await repo.createTask(pool, owner, "Renew the domain", { plannedFor: today });
    assert.equal(task.plannedFor, today);

    const [stored] = await repo.listTasks(pool, owner);
    assert.equal(stored!.plannedFor, today);
  });

  it("moves a task to another day and unplans it again", async () => {
    const today = utcMidnight();
    const task = await repo.createTask(pool, owner, "Send the invoice");

    const planned = await repo.updateTask(pool, owner, task.id, { plannedFor: today });
    assert.equal(planned.plannedFor, today);

    const moved = await repo.updateTask(pool, owner, task.id, { plannedFor: today + DAY });
    assert.equal(moved.plannedFor, today + DAY);

    const unplanned = await repo.updateTask(pool, owner, task.id, { plannedFor: null });
    assert.equal(unplanned.plannedFor, undefined);
  });

  it("leaves the plan alone when another field is edited", async () => {
    const today = utcMidnight();
    const task = await repo.createTask(pool, owner, "Draft the write-up", { plannedFor: today });
    const renamed = await repo.updateTask(pool, owner, task.id, { title: "Draft the post" });
    assert.equal(renamed.plannedFor, today);
  });

  it("won't plan another owner's task", async () => {
    const other = await createOwner(pool, "owner-2");
    const task = await repo.createTask(pool, other, "Theirs");
    await assert.rejects(
      () => repo.updateTask(pool, owner, task.id, { plannedFor: utcMidnight() }),
      repo.NotFoundError
    );
  });
});

describe("the agenda reports the plan", () => {
  const NOW = Date.UTC(2026, 5, 15, 10, 0, 0);
  const TODAY = Date.UTC(2026, 5, 15);

  const task = (overrides: Partial<Task> = {}): Task => ({
    id: "t-1",
    title: "A task",
    done: false,
    createdAt: NOW - DAY,
    ...overrides,
  });

  it("lists what the user chose, deadline or not", async () => {
    const agenda = buildAgenda(
      [],
      [task({ id: "t-chosen", plannedFor: TODAY }), task({ id: "t-other" })],
      NOW,
      7,
      TODAY
    );
    assert.equal(agenda.plan.settled, true);
    assert.deepEqual(
      agenda.plan.items.map((i) => i.id),
      ["t-chosen"]
    );
  });

  it("reports no plan on a day the user hasn't settled", async () => {
    const agenda = buildAgenda([], [task({ plannedFor: TODAY })], NOW, 7, undefined);
    assert.equal(agenda.plan.settled, false);
    assert.deepEqual(agenda.plan.items, []);
  });

  it("doesn't carry yesterday's plan into today", async () => {
    const agenda = buildAgenda([], [task({ plannedFor: TODAY - DAY })], NOW, 7, TODAY);
    assert.deepEqual(agenda.plan.items, []);
  });
});
