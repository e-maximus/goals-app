import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Goal, Task } from "../domain";
import { buildChunks, chunkHash } from "../embeddings/chunks";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-move",
    title: "Move to Barcelona",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    status: "active",
    steps: [],
    groups: [],
    notes: [],
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return { id: "task-1", title: "Renew the passport", done: false, createdAt: 1, ...overrides };
}

const byId = (chunks: ReturnType<typeof buildChunks>, id: string) => {
  const found = chunks.find((c) => c.itemId === id);
  assert.ok(found, `no chunk for ${id}`);
  return found;
};

describe("buildChunks", () => {
  it("gives every goal, step, note and task a row", () => {
    const chunks = buildChunks({
      goals: [
        goal({
          steps: [{ id: "s-own", text: "Book the flights", done: false }],
          groups: [
            { id: "g-1", title: "Paperwork", steps: [{ id: "s-1", text: "Get the visa", done: false }] },
          ],
          notes: [{ id: "n-1", text: "The consulate only answers on Tuesdays", createdAt: 1 }],
        }),
      ],
      tasks: [task()],
    });

    assert.deepEqual(
      chunks.map((c) => [c.kind, c.itemId]),
      [
        ["goal", "goal-move"],
        ["step", "s-own"],
        ["step", "s-1"],
        ["note", "n-1"],
        ["task", "task-1"],
      ]
    );
  });

  it("folds the parents' titles into the embedded content", () => {
    const chunks = buildChunks({
      goals: [
        goal({
          groups: [
            {
              id: "g-1",
              title: "Paperwork",
              steps: [{ id: "s-1", text: "Get the visa", description: "NIE first", done: false }],
            },
          ],
        }),
      ],
      tasks: [],
    });

    assert.equal(
      byId(chunks, "s-1").content,
      "Goal: Move to Barcelona\nGroup: Paperwork\nStep: Get the visa\nNIE first"
    );
  });

  it("keeps the parents' titles out of the keyword fields", () => {
    // The whole point of the split: were the goal's title repeated here, every
    // step of the goal would carry the same terms and IDF would discount them
    // to nothing — while crowding out the words that tell the steps apart.
    const chunks = buildChunks({
      goals: [goal({ steps: [{ id: "s-1", text: "Get the visa", description: "NIE first", done: false }] })],
      tasks: [],
    });

    const step = byId(chunks, "s-1");
    assert.equal(step.titleText, "Get the visa");
    assert.equal(step.bodyText, "NIE first");
    assert.ok(!step.titleText.includes("Barcelona"));
    assert.ok(!step.bodyText.includes("Barcelona"));
  });

  it("omits absent optional fields instead of embedding empty lines", () => {
    const chunks = buildChunks({
      goals: [goal({ why: undefined, steps: [{ id: "s-1", text: "Book the flights", done: false }] })],
      tasks: [],
    });

    assert.equal(byId(chunks, "goal-move").content, "Goal: Move to Barcelona");
    assert.equal(byId(chunks, "s-1").content, "Goal: Move to Barcelona\nStep: Book the flights");
  });

  it("indexes completed work too", () => {
    const chunks = buildChunks({
      goals: [goal({ steps: [{ id: "s-1", text: "Get the visa", done: true }] })],
      tasks: [task({ id: "t-done", done: true })],
    });

    assert.ok(chunks.some((c) => c.itemId === "s-1"));
    assert.ok(chunks.some((c) => c.itemId === "t-done"));
  });

  it("links a task to its goal, and drops a link to a goal that is gone", () => {
    const chunks = buildChunks({
      goals: [goal()],
      tasks: [
        task({ id: "t-linked", goalId: "goal-move" }),
        task({ id: "t-orphan", goalId: "goal-deleted" }),
      ],
    });

    assert.equal(byId(chunks, "t-linked").goalId, "goal-move");
    assert.equal(byId(chunks, "t-linked").content, "Goal: Move to Barcelona\nTask: Renew the passport");
    // `goal_id` is a foreign key — claiming a goal that isn't there would fail
    // the insert for the sake of a link nothing can follow.
    assert.equal(byId(chunks, "t-orphan").goalId, null);
  });

  it("drops chunks with no words of their own", () => {
    const chunks = buildChunks({
      goals: [goal({ steps: [{ id: "s-blank", text: "   ", done: false }] })],
      tasks: [],
    });

    assert.ok(!chunks.some((c) => c.itemId === "s-blank"));
  });
});

describe("chunkHash", () => {
  it("is stable for the same content and differs for different content", () => {
    assert.equal(chunkHash("Goal: Move to Barcelona"), chunkHash("Goal: Move to Barcelona"));
    assert.notEqual(chunkHash("Goal: Move to Barcelona"), chunkHash("Goal: Move to Lisbon"));
  });

  it("changes when a parent title changes, so the child is re-embedded", () => {
    const before = buildChunks({
      goals: [goal({ steps: [{ id: "s-1", text: "Get the visa", done: false }] })],
      tasks: [],
    });
    const after = buildChunks({
      goals: [
        goal({ title: "Move to Lisbon", steps: [{ id: "s-1", text: "Get the visa", done: false }] }),
      ],
      tasks: [],
    });

    assert.notEqual(chunkHash(byId(before, "s-1").content), chunkHash(byId(after, "s-1").content));
  });
});
