import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { reset, setupPool } from "./helpers";

let pool: Pool;

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await reset(pool);
});

function sampleGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-podcast",
    title: "Launch my podcast",
    why: "Ship something creative",
    createdAt: 1_700_000_000_000,
    groups: [
      {
        id: "g-1",
        title: "Preparation",
        steps: [
          { id: "s-1", text: "Pick a name", done: true },
          { id: "s-2", text: "Buy a microphone", done: false },
        ],
      },
    ],
    comments: [{ id: "c-1", text: "Editing takes longer than recording.", createdAt: 1_700_000_100_000 }],
    ...overrides,
  };
}

describe("store state", () => {
  it("reports an untouched store as uninitialized", async () => {
    const state = await repo.getState(pool);
    assert.equal(state.initialized, false);
    assert.deepEqual(state.goals, []);
  });

  it("round-trips a goal through replaceAll, preserving order and nesting", async () => {
    await repo.replaceAll(pool, [sampleGoal()], null);

    const state = await repo.getState(pool);
    assert.equal(state.initialized, true);
    assert.ok(state.updatedAt > 0);
    assert.deepEqual(state.goals, [sampleGoal()]);
  });

  it("keeps goal order across a rewrite", async () => {
    const a = sampleGoal({ id: "a", title: "A", groups: [], comments: [] });
    const b = sampleGoal({ id: "b", title: "B", groups: [], comments: [] });
    await repo.replaceAll(pool, [a, b], null);
    assert.deepEqual((await repo.getState(pool)).goals.map((g) => g.id), ["a", "b"]);

    await repo.replaceAll(pool, [b, a], null);
    assert.deepEqual((await repo.getState(pool)).goals.map((g) => g.id), ["b", "a"]);
  });

  it("drops a goal's groups, steps and comments when the goal is deleted", async () => {
    await repo.replaceAll(pool, [sampleGoal()], null);
    await repo.deleteGoal(pool, "goal-podcast");

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM steps");
    assert.equal(rows[0].n, 0);
    const comments = await pool.query("SELECT COUNT(*)::int AS n FROM comments");
    assert.equal(comments.rows[0].n, 0);
  });
});

describe("concurrent writes", () => {
  it("rejects a push built on a stale read", async () => {
    const first = await repo.replaceAll(pool, [sampleGoal()], null);

    // Something else writes — say, an MCP tool adding a comment.
    await repo.addComment(pool, "goal-podcast", "Written by an agent");

    // The browser, still holding the older state, tries to push over it.
    await assert.rejects(
      () => repo.replaceAll(pool, [sampleGoal()], first.updatedAt),
      (err: unknown) => err instanceof repo.ConflictError
    );

    // ...and the agent's comment survived.
    const comments = await repo.listComments(pool, "goal-podcast");
    assert.equal(comments.length, 2);
  });

  it("allows a push that is up to date with the server", async () => {
    const first = await repo.replaceAll(pool, [sampleGoal()], null);
    const second = await repo.replaceAll(pool, [sampleGoal({ title: "Renamed" })], first.updatedAt);
    assert.equal(second.goals[0]!.title, "Renamed");
  });
});

describe("comments", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, [sampleGoal({ comments: [] })], null);
  });

  it("adds, edits and deletes a comment", async () => {
    const added = await repo.addComment(pool, "goal-podcast", "  Booked the studio.  ");
    assert.equal(added.text, "Booked the studio.");

    const edited = await repo.editComment(pool, added.id, "Booked the studio for Friday.");
    assert.equal(edited.text, "Booked the studio for Friday.");
    assert.equal(edited.id, added.id);

    await repo.deleteComment(pool, added.id);
    assert.deepEqual(await repo.listComments(pool, "goal-podcast"), []);
  });

  it("returns comments newest first", async () => {
    const older = await repo.addComment(pool, "goal-podcast", "First thought");
    await new Promise((r) => setTimeout(r, 2));
    const newer = await repo.addComment(pool, "goal-podcast", "Second thought");

    const comments = await repo.listComments(pool, "goal-podcast");
    assert.deepEqual(comments.map((c) => c.id), [newer.id, older.id]);
  });

  it("refuses to comment on a goal that does not exist", async () => {
    await assert.rejects(
      () => repo.addComment(pool, "nope", "hello"),
      (err: unknown) => err instanceof repo.NotFoundError
    );
  });
});

describe("editing a goal", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, [sampleGoal()], null);
  });

  it("renames a goal without disturbing its groups, steps or comments", async () => {
    const updated = await repo.updateGoal(pool, "goal-podcast", { title: "Launch the show" });

    assert.equal(updated.title, "Launch the show");
    assert.equal(updated.why, "Ship something creative");
    assert.equal(updated.groups[0]!.steps.length, 2);
    assert.equal(updated.comments!.length, 1);
  });

  it("changes only the field it is given", async () => {
    const updated = await repo.updateGoal(pool, "goal-podcast", { why: "Because it's fun" });

    assert.equal(updated.title, "Launch my podcast"); // untouched
    assert.equal(updated.why, "Because it's fun");
  });

  it("clears the why when given an empty one", async () => {
    const updated = await repo.updateGoal(pool, "goal-podcast", { why: "" });
    assert.equal(updated.why, undefined);
  });

  it("refuses to leave a goal without a title", async () => {
    await assert.rejects(
      () => repo.updateGoal(pool, "goal-podcast", { title: "   " }),
      (err: unknown) => err instanceof repo.ValidationError
    );

    // The original title survived the rejected write.
    const goal = await repo.getGoal(pool, "goal-podcast");
    assert.equal(goal.title, "Launch my podcast");
  });
});

describe("groups and steps", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, [sampleGoal({ groups: [], comments: [] })], null);
  });

  it("adds a group with a step and toggles it", async () => {
    const group = await repo.addGroup(pool, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, group.id, "Record ep. 1");
    assert.equal(step.done, false);

    const toggled = await repo.setStepDone(pool, step.id);
    assert.equal(toggled.done, true);

    // An explicit value wins over a flip.
    const forced = await repo.setStepDone(pool, step.id, true);
    assert.equal(forced.done, true);
  });

  it("rewrites a step's text without touching whether it is done", async () => {
    const group = await repo.addGroup(pool, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, group.id, "Record ep 1");
    await repo.setStepDone(pool, step.id, true);

    const edited = await repo.editStep(pool, step.id, "Record episode 1");
    assert.equal(edited.text, "Record episode 1");
    assert.equal(edited.done, true);
  });

  it("refuses to blank out a step", async () => {
    const group = await repo.addGroup(pool, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, group.id, "Record ep 1");

    await assert.rejects(
      () => repo.editStep(pool, step.id, "  "),
      (err: unknown) => err instanceof repo.ValidationError
    );
  });

  it("appends new groups after existing ones", async () => {
    await repo.addGroup(pool, "goal-podcast", "First");
    await repo.addGroup(pool, "goal-podcast", "Second");

    const goal = await repo.getGoal(pool, "goal-podcast");
    assert.deepEqual(goal.groups.map((g) => g.title), ["First", "Second"]);
  });
});
