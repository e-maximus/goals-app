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
    // What the repo defaults an incoming goal to when the client sends neither
    // (getState always reports both, so the round-trip assertions see them).
    updatedAt: 1_700_000_000_000,
    status: "active",
    // getState always reports the ungrouped-steps list, so round-trip
    // assertions need it present even when empty.
    steps: [],
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
    notes: [{ id: "c-1", text: "Editing takes longer than recording.", createdAt: 1_700_000_100_000 }],
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
    const a = sampleGoal({ id: "a", title: "A", groups: [], notes: [] });
    const b = sampleGoal({ id: "b", title: "B", groups: [], notes: [] });
    await repo.replaceAll(pool, owner, [a, b], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals.map((g) => g.id), ["a", "b"]);

    await repo.replaceAll(pool, owner, [b, a], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals.map((g) => g.id), ["b", "a"]);
  });

  it("drops a goal's groups, steps and notes when the goal is deleted", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
    await repo.deleteGoal(pool, owner, "goal-podcast");

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM steps");
    assert.equal(rows[0].n, 0);
    const notes = await pool.query("SELECT COUNT(*)::int AS n FROM notes");
    assert.equal(notes.rows[0].n, 0);
  });
});

describe("status and activity", () => {
  it("defaults a legacy-shaped goal to active, with updatedAt = createdAt", async () => {
    const legacy = sampleGoal({ groups: [], notes: [] });
    // A payload from a tab predating these fields carries neither.
    delete legacy.status;
    delete legacy.updatedAt;
    await repo.replaceAll(pool, owner, [legacy], null);

    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.equal(goal.status, "active");
    assert.equal(goal.updatedAt, goal.createdAt);
    assert.equal(goal.pausedAt, undefined);
  });

  it("round-trips an explicit status, updatedAt and pausedAt verbatim", async () => {
    const paused = sampleGoal({
      groups: [],
      notes: [],
      status: "paused",
      updatedAt: 1_700_000_500_000,
      pausedAt: 1_700_000_500_000,
    });
    await repo.replaceAll(pool, owner, [paused], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals, [paused]);
  });

  it("pauses and resumes a goal via setGoalStatus", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
    const before = Date.now();

    const pausedGoal = await repo.setGoalStatus(pool, owner, "goal-podcast", "paused");
    assert.equal(pausedGoal.status, "paused");
    assert.ok(pausedGoal.pausedAt! >= before);
    assert.ok(pausedGoal.updatedAt! >= before);

    const resumed = await repo.setGoalStatus(pool, owner, "goal-podcast", "active");
    assert.equal(resumed.status, "active");
    assert.equal(resumed.pausedAt, undefined);
  });

  it("refuses to set status on a goal that isn't there", async () => {
    await assert.rejects(
      () => repo.setGoalStatus(pool, owner, "nope", "paused"),
      (err: unknown) => err instanceof repo.NotFoundError
    );
  });

  it("bumps only the mutated goal's updatedAt on targeted mutations", async () => {
    const a = sampleGoal();
    const b = sampleGoal({ id: "goal-other", title: "Other", groups: [], notes: [] });
    await repo.replaceAll(pool, owner, [a, b], null);

    const stampsOf = async () =>
      new Map((await repo.getState(pool, owner)).goals.map((g) => [g.id, g.updatedAt!]));

    let previous = await stampsOf();
    const mutations: [string, () => Promise<unknown>][] = [
      ["updateGoal", () => repo.updateGoal(pool, owner, "goal-podcast", { title: "Renamed" })],
      ["addGroup", () => repo.addGroup(pool, owner, "goal-podcast", "New group")],
      ["renameGroup", () => repo.renameGroup(pool, owner, "g-1", "Renamed group")],
      ["addStep", () => repo.addStep(pool, owner, { groupId: "g-1" }, "New step")],
      ["setStepDone", () => repo.setStepDone(pool, owner, "s-2", true)],
      ["editStep", () => repo.editStep(pool, owner, "s-2", { text: "Edited step" })],
      ["deleteStep", () => repo.deleteStep(pool, owner, "s-2")],
      ["addNote", () => repo.addNote(pool, owner, "goal-podcast", "A note")],
      ["deleteNote", () => repo.deleteNote(pool, owner, "c-1")],
    ];

    for (const [name, mutate] of mutations) {
      await new Promise((r) => setTimeout(r, 2));
      await mutate();
      const current = await stampsOf();
      assert.ok(
        current.get("goal-podcast")! > previous.get("goal-podcast")!,
        `${name} should bump the mutated goal's updatedAt`
      );
      assert.equal(
        current.get("goal-other"),
        previous.get("goal-other"),
        `${name} must not touch the other goal's updatedAt`
      );
      previous = current;
    }
  });
});

describe("ungrouped steps", () => {
  it("round-trips a goal with steps directly on it", async () => {
    const goal = sampleGoal({
      groups: [],
      notes: [],
      steps: [
        { id: "u-1", text: "First", done: true },
        { id: "u-2", text: "Second", done: false, description: "With detail" },
      ],
    });
    await repo.replaceAll(pool, owner, [goal], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals, [goal]);
  });

  it("adds an ungrouped step via addStep({ goalId })", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ groups: [], notes: [], steps: [] })], null);

    const step = await repo.addStep(pool, owner, { goalId: "goal-podcast" }, "Do the thing");
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.deepEqual(goal.steps!.map((s) => s.id), [step.id]);
    assert.equal(goal.groups.length, 0);
  });

  it("rejects addStep with both parents, or neither", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
    await assert.rejects(
      () => repo.addStep(pool, owner, { goalId: "goal-podcast", groupId: "g-1" }, "x"),
      (err: unknown) => err instanceof repo.ValidationError
    );
    await assert.rejects(
      () => repo.addStep(pool, owner, {}, "x"),
      (err: unknown) => err instanceof repo.ValidationError
    );
  });

  it("edits, toggles and deletes an ungrouped step", async () => {
    await repo.replaceAll(
      pool,
      owner,
      [sampleGoal({ groups: [], notes: [], steps: [{ id: "u-1", text: "Loose end", done: false }] })],
      null
    );

    const toggled = await repo.setStepDone(pool, owner, "u-1");
    assert.equal(toggled.done, true);

    const edited = await repo.editStep(pool, owner, "u-1", { text: "Tied up" });
    assert.equal(edited.text, "Tied up");
    assert.equal(edited.done, true);

    await repo.deleteStep(pool, owner, "u-1");
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.deepEqual(goal.steps, []);
  });

  it("links a note to an ungrouped step", async () => {
    await repo.replaceAll(
      pool,
      owner,
      [sampleGoal({ groups: [], notes: [], steps: [{ id: "u-1", text: "Loose end", done: false }] })],
      null
    );

    const note = await repo.addNote(pool, owner, "goal-podcast", "About that", "u-1");
    assert.equal(note.stepId, "u-1");
  });

  it("won't let one owner touch another's ungrouped step", async () => {
    const other = await createOwner(pool, "owner-2");
    await repo.replaceAll(
      pool,
      owner,
      [sampleGoal({ groups: [], notes: [], steps: [{ id: "u-1", text: "Mine", done: false }] })],
      null
    );

    await assert.rejects(() => repo.setStepDone(pool, other, "u-1"));
    await assert.rejects(() => repo.editStep(pool, other, "u-1", { text: "x" }));
    await assert.rejects(() => repo.deleteStep(pool, other, "u-1"));
  });

  // A goal whose one group holds a single step, so batch positions read cleanly.
  function batchGoal(): Goal {
    return sampleGoal({
      notes: [],
      steps: [],
      groups: [{ id: "g-1", title: "Preparation", steps: [{ id: "s-1", text: "Pick a name", done: true }] }],
    });
  }

  it("addSteps adds a batch in order, numbering positions per parent", async () => {
    await repo.replaceAll(pool, owner, [batchGoal()], null);

    const created = await repo.addSteps(pool, owner, [
      { target: { groupId: "g-1" }, text: "Second in group" },
      { target: { goalId: "goal-podcast" }, text: "Ungrouped one" },
      { target: { groupId: "g-1" }, text: "Third in group" },
    ]);
    assert.deepEqual(created.map((s) => s.text), [
      "Second in group",
      "Ungrouped one",
      "Third in group",
    ]);

    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    // The seeded group step keeps its slot; the two new group steps append after it.
    assert.deepEqual(goal.groups[0]!.steps.map((s) => s.text), [
      "Pick a name",
      "Second in group",
      "Third in group",
    ]);
    assert.deepEqual(goal.steps!.map((s) => s.text), ["Ungrouped one"]);
  });

  it("addSteps rolls the whole batch back if any step is invalid", async () => {
    await repo.replaceAll(pool, owner, [batchGoal()], null);

    await assert.rejects(
      () =>
        repo.addSteps(pool, owner, [
          { target: { groupId: "g-1" }, text: "Would be fine" },
          { target: {}, text: "No parent" },
        ]),
      (err: unknown) => err instanceof repo.ValidationError
    );

    // Nothing was written — the group still holds only its seeded step.
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.deepEqual(goal.groups[0]!.steps.map((s) => s.text), ["Pick a name"]);
  });

  it("deleteSteps removes a batch, and rolls back if any id is unknown", async () => {
    await repo.replaceAll(pool, owner, [batchGoal()], null);
    const [a, b] = await repo.addSteps(pool, owner, [
      { target: { groupId: "g-1" }, text: "One" },
      { target: { groupId: "g-1" }, text: "Two" },
    ]);

    // An unknown id in the batch aborts the whole delete.
    await assert.rejects(
      () => repo.deleteSteps(pool, owner, [a!.id, "no-such-step"]),
      (err: unknown) => err instanceof repo.NotFoundError
    );
    let goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.deepEqual(goal.groups[0]!.steps.map((s) => s.text), ["Pick a name", "One", "Two"]);

    await repo.deleteSteps(pool, owner, [a!.id, b!.id]);
    goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.deepEqual(goal.groups[0]!.steps.map((s) => s.text), ["Pick a name"]);
  });

  it("addNotes and deleteNotes handle a batch atomically", async () => {
    await repo.replaceAll(pool, owner, [batchGoal()], null);

    const created = await repo.addNotes(pool, owner, [
      { goalId: "goal-podcast", text: "Alpha" },
      { goalId: "goal-podcast", text: "Beta", stepId: "s-1" },
    ]);
    assert.deepEqual(created.map((n) => n.text), ["Alpha", "Beta"]);
    assert.equal(created[1]!.stepId, "s-1");

    // A bad step link in the batch adds nothing.
    await assert.rejects(
      () =>
        repo.addNotes(pool, owner, [
          { goalId: "goal-podcast", text: "Gamma" },
          { goalId: "goal-podcast", text: "Bad", stepId: "no-such-step" },
        ]),
      (err: unknown) => err instanceof repo.ValidationError
    );
    assert.equal((await repo.listNotes(pool, owner, "goal-podcast")).length, 2);

    await repo.deleteNotes(pool, owner, created.map((n) => n.id));
    assert.deepEqual(await repo.listNotes(pool, owner, "goal-podcast"), []);
  });
});

describe("due dates", () => {
  const DUE = Date.UTC(2026, 7, 1); // Aug 1, 2026

  it("round-trips due dates on the goal, a group and a step", async () => {
    const goal = sampleGoal({
      notes: [],
      dueDate: DUE,
      groups: [
        {
          id: "g-1",
          title: "Preparation",
          dueDate: DUE,
          steps: [{ id: "s-1", text: "Pick a name", done: false, dueDate: DUE }],
        },
      ],
    });
    await repo.replaceAll(pool, owner, [goal], null);
    assert.deepEqual((await repo.getState(pool, owner)).goals, [goal]);
  });

  it("sets and clears a due date through the targeted mutations", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ notes: [] })], null);

    const withDue = await repo.updateGoal(pool, owner, "goal-podcast", { dueDate: DUE });
    assert.equal(withDue.dueDate, DUE);
    const cleared = await repo.updateGoal(pool, owner, "goal-podcast", { dueDate: null });
    assert.equal(cleared.dueDate, undefined);

    const stepDue = await repo.editStep(pool, owner, "s-2", { dueDate: DUE });
    assert.equal(stepDue.dueDate, DUE);
    const stepCleared = await repo.editStep(pool, owner, "s-2", { dueDate: null });
    assert.equal(stepCleared.dueDate, undefined);

    await repo.renameGroup(pool, owner, "g-1", "Preparation", DUE);
    let goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.equal(goal.groups[0]!.dueDate, DUE);
    await repo.renameGroup(pool, owner, "g-1", "Preparation", null);
    goal = await repo.getGoal(pool, owner, "goal-podcast");
    assert.equal(goal.groups[0]!.dueDate, undefined);
  });

  it("carries a due date through createGoal, addGroup and addStep", async () => {
    const goal = await repo.createGoal(pool, owner, "Ship it", undefined, DUE);
    assert.equal(goal.dueDate, DUE);

    const group = await repo.addGroup(pool, owner, goal.id, "Phase 1", DUE);
    assert.equal(group.dueDate, DUE);

    const step = await repo.addStep(pool, owner, { goalId: goal.id }, "First move", undefined, DUE);
    assert.equal(step.dueDate, DUE);

    const stored = await repo.getGoal(pool, owner, goal.id);
    assert.equal(stored.dueDate, DUE);
    assert.equal(stored.groups[0]!.dueDate, DUE);
    assert.equal(stored.steps![0]!.dueDate, DUE);
  });
});

describe("concurrent writes", () => {
  it("rejects a push built on a stale read", async () => {
    const first = await repo.replaceAll(pool, owner, [sampleGoal()], null);

    // Something else writes — say, an MCP tool adding a note.
    await repo.addNote(pool, owner, "goal-podcast", "Written by an agent");

    // The browser, still holding the older state, tries to push over it.
    await assert.rejects(
      () => repo.replaceAll(pool, owner, [sampleGoal()], first.updatedAt),
      (err: unknown) => err instanceof repo.ConflictError
    );

    // ...and the agent's note survived.
    const notes = await repo.listNotes(pool, owner, "goal-podcast");
    assert.equal(notes.length, 2);
  });

  it("allows a push that is up to date with the server", async () => {
    const first = await repo.replaceAll(pool, owner, [sampleGoal()], null);
    const second = await repo.replaceAll(pool, owner, [sampleGoal({ title: "Renamed" })], first.updatedAt);
    assert.equal(second.goals[0]!.title, "Renamed");
  });
});

describe("notes", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ notes: [] })], null);
  });

  it("adds, edits and deletes a note", async () => {
    const added = await repo.addNote(pool, owner, "goal-podcast", "  Booked the studio.  ");
    assert.equal(added.text, "Booked the studio.");

    const edited = await repo.editNote(pool, owner, added.id, { text: "Booked the studio for Friday." });
    assert.equal(edited.text, "Booked the studio for Friday.");
    assert.equal(edited.id, added.id);

    await repo.deleteNote(pool, owner, added.id);
    assert.deepEqual(await repo.listNotes(pool, owner, "goal-podcast"), []);
  });

  it("returns notes newest first", async () => {
    const older = await repo.addNote(pool, owner, "goal-podcast", "First thought");
    await new Promise((r) => setTimeout(r, 2));
    const newer = await repo.addNote(pool, owner, "goal-podcast", "Second thought");

    const notes = await repo.listNotes(pool, owner, "goal-podcast");
    assert.deepEqual(notes.map((n) => n.id), [newer.id, older.id]);
  });

  it("refuses to add a note to a goal that does not exist", async () => {
    await assert.rejects(
      () => repo.addNote(pool, owner, "nope", "hello"),
      (err: unknown) => err instanceof repo.NotFoundError
    );
  });

  it("links a note to a step, and can unlink it", async () => {
    // sampleGoal has a step s-1 under g-1.
    await repo.replaceAll(pool, owner, [sampleGoal({ notes: [] })], null);

    const linked = await repo.addNote(pool, owner, "goal-podcast", "About the name", "s-1");
    assert.equal(linked.stepId, "s-1");

    const reloaded = (await repo.listNotes(pool, owner, "goal-podcast"))[0]!;
    assert.equal(reloaded.stepId, "s-1");

    // An empty stepId unlinks it, leaving the text alone.
    const unlinked = await repo.editNote(pool, owner, linked.id, { stepId: "" });
    assert.equal(unlinked.stepId, undefined);
    assert.equal(unlinked.text, "About the name");
  });

  it("rejects a note linked to a step from another goal", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ notes: [] })], null);
    await assert.rejects(
      () => repo.addNote(pool, owner, "goal-podcast", "bad link", "no-such-step"),
      (err: unknown) => err instanceof repo.ValidationError
    );
  });

  it("unlinks a note when its linked step is deleted, keeping the note", async () => {
    await repo.replaceAll(pool, owner, [sampleGoal({ notes: [] })], null);
    const linked = await repo.addNote(pool, owner, "goal-podcast", "About the name", "s-1");

    await repo.deleteStep(pool, owner, "s-1");

    const note = (await repo.listNotes(pool, owner, "goal-podcast")).find((n) => n.id === linked.id)!;
    assert.equal(note.text, "About the name");
    assert.equal(note.stepId, undefined);
  });
});

describe("editing a goal", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
  });

  it("renames a goal without disturbing its groups, steps or notes", async () => {
    const updated = await repo.updateGoal(pool, owner, "goal-podcast", { title: "Launch the show" });

    assert.equal(updated.title, "Launch the show");
    assert.equal(updated.why, "Ship something creative");
    assert.equal(updated.groups[0]!.steps.length, 2);
    assert.equal(updated.notes!.length, 1);
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
    await repo.replaceAll(pool, owner, [sampleGoal({ groups: [], notes: [] })], null);
  });

  it("adds a group with a step and toggles it", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, { groupId: group.id }, "Record ep. 1");
    assert.equal(step.done, false);

    const toggled = await repo.setStepDone(pool, owner, step.id);
    assert.equal(toggled.done, true);

    // An explicit value wins over a flip.
    const forced = await repo.setStepDone(pool, owner, step.id, true);
    assert.equal(forced.done, true);
  });

  it("rewrites a step's text without touching whether it is done", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, { groupId: group.id }, "Record ep 1");
    await repo.setStepDone(pool, owner, step.id, true);

    const edited = await repo.editStep(pool, owner, step.id, { text: "Record episode 1" });
    assert.equal(edited.text, "Record episode 1");
    assert.equal(edited.done, true);
  });

  it("carries a step's description through add, read and edit", async () => {
    const group = await repo.addGroup(pool, owner, "goal-podcast", "Recording");
    const step = await repo.addStep(pool, owner, { groupId: group.id }, "Record ep 1", "  In the home studio  ");
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
    const step = await repo.addStep(pool, owner, { groupId: group.id }, "Record ep 1");

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
      [sampleGoal({ id: "mine", title: "Mine", groups: [], notes: [] })],
      null
    );
    await repo.replaceAll(
      pool,
      other,
      [sampleGoal({ id: "theirs", title: "Theirs", groups: [], notes: [] })],
      null
    );

    assert.deepEqual((await repo.getState(pool, owner)).goals.map((g) => g.id), ["mine"]);
    assert.deepEqual((await repo.getState(pool, other)).goals.map((g) => g.id), ["theirs"]);
  });

  it("won't let one owner touch another's goal, group, step or note", async () => {
    const other = await createOwner(pool, "owner-2");
    await repo.replaceAll(pool, owner, [sampleGoal()], null);
    const goal = await repo.getGoal(pool, owner, "goal-podcast");
    const groupId = goal.groups[0]!.id;
    const stepId = goal.groups[0]!.steps[0]!.id;
    const noteId = goal.notes![0]!.id;

    // Every cross-owner write is a NotFound, as if the target didn't exist.
    await assert.rejects(() => repo.updateGoal(pool, other, "goal-podcast", { title: "x" }));
    await assert.rejects(() => repo.deleteGoal(pool, other, "goal-podcast"));
    await assert.rejects(() => repo.renameGroup(pool, other, groupId, "x"));
    await assert.rejects(() => repo.addStep(pool, other, { groupId }, "x"));
    await assert.rejects(() => repo.editStep(pool, other, stepId, { text: "x" }));
    await assert.rejects(() => repo.deleteStep(pool, other, stepId));
    await assert.rejects(() => repo.editNote(pool, other, noteId, { text: "x" }));
    await assert.rejects(() => repo.deleteNote(pool, other, noteId));

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
      [sampleGoal({ id: "theirs", groups: [], notes: [] })],
      null
    );

    // My store's version is unchanged by the other user's write.
    assert.equal((await repo.getState(pool, owner)).updatedAt, mine.updatedAt);
  });
});
