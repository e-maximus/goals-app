import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal, Task } from "../domain";
import { utcMidnight } from "../domain";
import * as repo from "../repo";
import { createOwner, reset, setupPool } from "./helpers";

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
    id: "goal-podcast",
    title: "Launch my podcast",
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
    id: "task-1",
    title: "Answer the editor",
    done: false,
    createdAt: 1_700_000_200_000,
    ...overrides,
  };
}

describe("tasks in the whole-store write", () => {
  it("round-trips tasks through replaceAll, preserving order and fields", async () => {
    const tasks = [
      sampleTask({
        id: "t-1",
        description: "Draft is in the shared doc",
        goalId: "goal-podcast",
        dueDate: 1_700_100_000_000,
      }),
      sampleTask({ id: "t-2", title: "Morning pages", daily: true, completedOn: 1_700_006_400_000 }),
    ];
    await repo.replaceAll(pool, owner, [sampleGoal()], null, tasks);

    const state = await repo.getState(pool, owner);
    assert.deepEqual(state.tasks, tasks);
  });

  it("keeps stored tasks when a legacy save sends no tasks field", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null, [
      sampleTask({ goalId: "goal-podcast" }),
    ]);

    // A tab from before tasks existed rewrites the goals without the field.
    await repo.replaceAll(pool, owner, [sampleGoal({ title: "Renamed" })], null);

    const state = await repo.getState(pool, owner);
    assert.equal(state.goals[0]!.title, "Renamed");
    // The task survived, still pointing at the re-inserted goal.
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0]!.goalId, "goal-podcast");
  });

  it("stores a task pointing at an unknown goal as unlinked", async () => {
    await repo.replaceAll(pool, owner, [], null, [sampleTask({ goalId: "not-a-goal" })]);
    const state = await repo.getState(pool, owner);
    assert.equal(state.tasks[0]!.goalId, undefined);
  });
});

describe("targeted task mutations", () => {
  it("creates a task at the top of the list", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null, [sampleTask({ id: "t-old" })]);
    const created = await repo.createTask(pool, owner, "New task", { goalId: "goal-podcast" });

    const tasks = await repo.listTasks(pool, owner);
    assert.deepEqual(tasks.map((t) => t.id), [created.id, "t-old"]);
    assert.equal(created.goalId, "goal-podcast");
  });

  it("rejects creating a task linked to a goal that isn't there", async () => {
    await assert.rejects(
      () => repo.createTask(pool, owner, "Task", { goalId: "nope" }),
      repo.NotFoundError
    );
  });

  it("edits fields independently and unlinks with an empty goalId", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null, [
      sampleTask({ goalId: "goal-podcast", description: "Old note" }),
    ]);

    const updated = await repo.updateTask(pool, owner, "task-1", {
      title: "Renamed",
      description: "",
      goalId: "",
    });
    assert.equal(updated.title, "Renamed");
    assert.equal(updated.description, undefined);
    assert.equal(updated.goalId, undefined);
  });

  it("switching a task to daily resets its completion", async () => {
    await repo.replaceAll(pool, owner, [], null, [sampleTask({ done: true })]);
    const updated = await repo.updateTask(pool, owner, "task-1", { daily: true });
    assert.equal(updated.daily, true);
    assert.equal(updated.done, false);
    assert.equal(updated.completedOn, undefined);
  });

  it("toggles a one-off task's done flag", async () => {
    await repo.replaceAll(pool, owner, [], null, [sampleTask()]);
    assert.equal((await repo.setTaskDone(pool, owner, "task-1")).done, true);
    assert.equal((await repo.setTaskDone(pool, owner, "task-1")).done, false);
  });

  it("completes a daily task by stamping today, and toggling clears it", async () => {
    await repo.replaceAll(pool, owner, [], null, [sampleTask({ daily: true })]);

    const completed = await repo.setTaskDone(pool, owner, "task-1", true);
    assert.equal(completed.done, false);
    assert.equal(completed.completedOn, utcMidnight());

    const cleared = await repo.setTaskDone(pool, owner, "task-1");
    assert.equal(cleared.completedOn, undefined);
  });

  it("a daily task completed yesterday reads as not done, and toggling re-completes it", async () => {
    const yesterday = utcMidnight() - 86_400_000;
    await repo.replaceAll(pool, owner, [], null, [
      sampleTask({ daily: true, completedOn: yesterday }),
    ]);

    // The stale stamp means "not done today" — so a bare toggle completes.
    const completed = await repo.setTaskDone(pool, owner, "task-1");
    assert.equal(completed.completedOn, utcMidnight());
  });

  it("deletes a task", async () => {
    await repo.replaceAll(pool, owner, [], null, [sampleTask()]);
    await repo.deleteTask(pool, owner, "task-1");
    assert.deepEqual(await repo.listTasks(pool, owner), []);
  });

  it("deleting a goal unlinks its tasks rather than deleting them", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null, [
      sampleTask({ goalId: "goal-podcast" }),
    ]);
    await repo.deleteGoal(pool, owner, "goal-podcast");

    const tasks = await repo.listTasks(pool, owner);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]!.goalId, undefined);
  });

  it("a task mutation bumps the store stamp, conflicting a stale whole-store write", async () => {
    const first = await repo.replaceAll(pool, owner, [], null, [sampleTask()]);
    await repo.setTaskDone(pool, owner, "task-1", true);

    await assert.rejects(
      () => repo.replaceAll(pool, owner, [], first.updatedAt, [sampleTask()]),
      repo.ConflictError
    );
  });

  it("scopes every task read and write to its owner", async () => {
    const other = await createOwner(pool, "owner-2");
    await repo.replaceAll(pool, owner, [], null, [sampleTask()]);

    assert.deepEqual(await repo.listTasks(pool, other), []);
    await assert.rejects(() => repo.setTaskDone(pool, other, "task-1"), repo.NotFoundError);
    await assert.rejects(() => repo.deleteTask(pool, other, "task-1"), repo.NotFoundError);
    await assert.rejects(
      () => repo.updateTask(pool, other, "task-1", { title: "Stolen" }),
      repo.NotFoundError
    );
  });
});
