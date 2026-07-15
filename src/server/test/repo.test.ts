import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
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
    const state = await repo.getState(pool, owner);
    assert.equal(state.initialized, false);
    assert.deepEqual(state.goals, []);
  });

  it("round-trips a goal through replaceAll, preserving order and nesting", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);

    const state = await repo.getState(pool, owner);
    assert.equal(state.initialized, true);
    assert.ok(state.updatedAt > 0);
    assert.deepEqual(state.goals, [sampleGoal()]);
  });

  it("keeps goal order across a rewrite", async () => {
    const a = sampleGoal({ id: "a", title: "A", groups: [], comments: [] });
    const b = sampleGoal({ id: "b", title: "B", groups: [], comments: [] });
    await repo.replaceAll(pool, owner, [a, b], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals.map((g) => g.id), ["a", "b"]);

    await repo.replaceAll(pool, owner, [b, a], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals.map((g) => g.id), ["b", "a"]);
  });

  it("drops a goal's groups, steps and comments when the goal is deleted", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
    await repo.deleteGoal(pool, owner, "goal-podcast");

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM steps");
    assert.equal(rows[0].n, 0);
    const comments = await pool.query("SELECT COUNT(*)::int AS n FROM comments");
    assert.equal(comments.rows[0].n, 0);
  });
});

describe("concurrent writes", () => {
  it("rejects a push built on a stale read", async () => {
    const first = await repo.replaceAll(pool, owner, [sampleGoal()], null);

    // Something else writes — say, an MCP tool adding a comment.
    await repo.addComment(pool, owner, "goal-podcast", "Written by an agent");

    // The browser, still holding the older state, tries to push over it.
    await assert.rejects(
      () => repo.replaceAll(pool, owner, [sampleGoal()], first.updatedAt),
      (err: unknown) => err instanceof repo.ConflictError
    );

    // ...and the agent's comment survived.
    const comments = await repo.listComments(pool, owner, "goal-podcast");
    assert.equal(comments.length, 2);
  });

  it("allows a push that is up to date with the server", async () => {
    const first = await repo.replaceAll(pool, owner, [sampleGoal()], null);
    const second = await repo.replaceAll(pool, owner, [sampleGoal({ title: "Renamed" })], first.updatedAt);
    assert.equal(second.goals[0]!.title, "Renamed");
  });
});

describe("comments", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ comments: [] })], null);
  });

  it("adds, edits and deletes a comment", async () => {
    const added = await repo.addComment(pool, owner, "goal-podcast", "  Booked the studio.  ");
    assert.equal(added.text, "Booked the studio.");

    const edited = await repo.editComment(pool, owner, added.id, "Booked the studio for Friday.");
    assert.equal(edited.text, "Booked the studio for Friday.");
    assert.equal(edited.id, added.id);

    await repo.deleteComment(pool, owner, added.id);
    assert.deepEqual(await repo.listComments(pool, owner, "goal-podcast"), []);
  });

  it("returns comments newest first", async () => {
    const older = await repo.addComment(pool, owner, "goal-podcast", "First thought");
    await new Promise((r) => setTimeout(r, 2));
    const newer = await repo.addComment(pool, owner, "goal-podcast", "Second thought");

    const comments = await repo.listComments(pool, owner, "goal-podcast");
    assert.deepEqual(comments.map((c) => c.id), [newer.id, older.id]);
  });

  it("refuses to comment on a goal that does not exist", async () => {
    await assert.rejects(
      () => repo.addComment(pool, owner, "nope", "hello"),
      (err: unknown) => err instanceof repo.NotFoundError
    );
  });
});

describe("editing a goal", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
  });

  it("renames a goal without disturbing its groups, steps or comments", async () => {
    const updated = await repo.updateGoal(pool, owner, "goal-podcast", { title: "Launch the show" });

    assert.equal(updated.title, "Launch the show");
    assert.equal(updated.why, "Ship something creative");
    assert.equal(updated.groups[0]!.steps.length, 2);
    assert.equal(updated.comments!.length, 1);
  });

  it("changes only the field it is given", async () => {
    const updated = await repo.updateGoal(pool, owner, "goal-podcast", { why: "Because it's fun" });

    assert.equal(updated.title, "Launch my podcast"); // untouched
    assert.equal(updated.why, "Because it's fun");
  });

  it("clears the why when given an empty one", async () => {
    const updated = await repo.updateGoal(pool, owner, "goal-podcast", { why: "" });
    assert.equal(updated.why, undefined);
  });

  it("refuses to leave a goal without a title", async () => {
    await assert.rejects(
      () => repo.updateGoal(pool, owner, "goal-podcast", { title: "   " }),
      (err: unknown) => err instanceof repo.ValidationError
    );

    // The original title survived the rejected write.
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.equal(goal.title, "Launch my podcast");
  });
});

describe("groups and steps", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ groups: [], comments: [] })], null);
  });

  it("adds a group with a step and toggles it", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, group.id, "Record ep. 1");
    assert.equal(step.done, false);

    const toggled = await repo.setStepDone(pool, owner, step.id);
    assert.equal(toggled.done, true);

    // An explicit value wins over a flip.
    const forced = await repo.setStepDone(pool, owner, step.id, true);
    assert.equal(forced.done, true);
  });

  it("rewrites a step's text without touching whether it is done", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, group.id, "Record ep 1");
    await repo.setStepDone(pool, owner, step.id, true);

    const edited = await repo.editStep(pool, owner, step.id, { text: "Record episode 1" });
    assert.equal(edited.text, "Record episode 1");
    assert.equal(edited.done, true);
  });

  it("carries a step's description through add, read and edit", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, group.id, "Record ep 1", "  In the home studio  ");
    assert.equal(step.description, "In the home studio");

    // It survives a reload from the database.
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.equal(goal.groups[0]!.steps[0]!.description, "In the home studio");

    // Editing only the title leaves the description alone…
    const titled = await repo.editStep(pool, owner, step.id, { text: "Record episode 1" });
    assert.equal(titled.description, "In the home studio");

    // …and an empty description clears it.
    const cleared = await repo.editStep(pool, owner, step.id, { description: "" });
    assert.equal(cleared.description, undefined);
    assert.equal(cleared.text, "Record episode 1");
  });

  it("refuses to blank out a step's title", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, group.id, "Record ep 1");

    await assert.rejects(
      () => repo.editStep(pool, owner, step.id, { text: "  " }),
      (err: unknown) => err instanceof repo.ValidationError
    );
  });

  it("appends new groups after existing ones", async () => {
    await repo.addGroup(pool, owner, "goal-podcast", "First");
    await repo.addGroup(pool, owner, "goal-podcast", "Second");

    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.deepEqual(goal.groups.map((g) => g.title), ["First", "Second"]);
  });
});

describe("per-user isolation", () => {
  it("keeps each owner's goals separate", async () => {
    const other = await createOwner(pool, "owner-2");
    // Distinct ids top to bottom: nested ids are global PKs too (real seeds get
    // fresh ids via seed.withFreshIds); here the two goals carry no nested rows.
    await repo.replaceAll(
      pool,
      owner,
      [sampleGoal({ id: "mine", title: "Mine", groups: [], comments: [] })],
      null
    );
    await repo.replaceAll(
      pool,
      other,
      [sampleGoal({ id: "theirs", title: "Theirs", groups: [], comments: [] })],
      null
    );

    assert.deepEqual((await repo.getState(pool, owner)).goals.map((g) => g.id), ["mine"]);
    assert.deepEqual((await repo.getState(pool, other)).goals.map((g) => g.id), ["theirs"]);
  });

  it("won't let one owner touch another's goal, group, step or comment", async () => {
    const other = await createOwner(pool, "owner-2");
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    const groupId = goal.groups[0]!.id;
    const stepId = goal.groups[0]!.steps[0]!.id;
    const commentId = goal.comments![0]!.id;

    // Every cross-owner write is a NotFound, as if the target didn't exist.
    await assert.rejects(() => repo.updateGoal(pool, other, "goal-podcast", { title: "x" }));
    await assert.rejects(() => repo.deleteGoal(pool, other, "goal-podcast"));
    await assert.rejects(() => repo.renameGroup(pool, other, groupId, "x"));
    await assert.rejects(() => repo.addStep(pool, other, groupId, "x"));
    await assert.rejects(() => repo.editStep(pool, other, stepId, { text: "x" }));
    await assert.rejects(() => repo.deleteStep(pool, other, stepId));
    await assert.rejects(() => repo.editComment(pool, other, commentId, "x"));
    await assert.rejects(() => repo.deleteComment(pool, other, commentId));

    // ...and the original is untouched.
    const after = await repo.getGoal(pool, owner, "goal-podcast");
    assert.equal(after.title, "Launch my podcast");
    assert.equal(after.groups[0]!.steps.length, 2);
  });

  it("does not bump another owner's updatedAt on a write", async () => {
    const other = await createOwner(pool, "owner-2");
    const mine = await repo.replaceAll(pool, owner, [sampleGoal()], null);

    await repo.replaceAll(
      pool,
      other,
      [sampleGoal({ id: "theirs", groups: [], comments: [] })],
      null
    );

    // My store's version is unchanged by the other user's write.
    assert.equal((await repo.getState(pool, owner)).updatedAt, mine.updatedAt);
  });
});
