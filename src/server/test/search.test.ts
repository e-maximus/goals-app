import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal, Task } from "../domain";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { EMBEDDING_DIMENSIONS, type Embedder } from "../embeddings/model";
import { promoteGoals, search } from "../search/search";
import type { SearchHit } from "@/lib/types";
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

/** Deterministic stand-in for the provider — see reindex.test.ts. */
function fakeEmbedder(modelName = "fake-model"): Embedder {
  return {
    modelName,
    async embed(texts) {
      return texts.map((text) => {
        const seed = createHash("sha256").update(text).digest();
        return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => seed[i % seed.length]! / 255);
      });
    },
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g-1",
    title: "A goal",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    status: "active",
    steps: [],
    groups: [],
    notes: [],
    ...overrides,
  };
}

/** Persist goals/tasks and build the index over them. Text only unless `embed`. */
async function indexed(goals: Goal[], tasks: Task[] = [], embed: Embedder | null = null) {
  await repo.replaceAll(pool, owner, goals, null, tasks);
  await reindexOwner(pool, owner, embed);
}

const titles = (hits: { title: string }[]) => hits.map((h) => h.title);

describe("promoteGoals", () => {
  const hit = (over: Partial<SearchHit> & Pick<SearchHit, "kind" | "id">): SearchHit => ({
    title: over.id,
    goal: { id: "g-1", title: "Launch my podcast", url: "/goal/g-1" },
    score: 0,
    arms: ["keyword"],
    ...over,
  });

  it("lifts a goal above its own steps when its own words matched", () => {
    // Every one of these navigates to the same page, so stacking the steps above
    // the goal was three ways of saying the same thing before the answer.
    const promoted = promoteGoals([
      hit({ kind: "step", id: "s-1" }),
      hit({ kind: "step", id: "s-2" }),
      hit({ kind: "goal", id: "g-1" }),
    ]);

    assert.deepEqual(
      promoted.map((h) => h.id),
      ["g-1", "s-1", "s-2"]
    );
  });

  it("leaves the goal alone when only the vector arm found it", () => {
    // "microphone": the step says it, the goal only drifted into range. The
    // specific answer is the right one.
    const promoted = promoteGoals([
      hit({ kind: "step", id: "s-mic", arms: ["keyword", "vector"] }),
      hit({ kind: "goal", id: "g-1", arms: ["vector"] }),
    ]);

    assert.deepEqual(
      promoted.map((h) => h.id),
      ["s-mic", "g-1"]
    );
  });

  it("never moves a goal past another goal's results", () => {
    const other = { id: "g-2", title: "Run a half marathon", url: "/goal/g-2" };
    const promoted = promoteGoals([
      hit({ kind: "goal", id: "g-2", goal: other }),
      hit({ kind: "step", id: "s-2", goal: other }),
      hit({ kind: "step", id: "s-1" }),
      hit({ kind: "goal", id: "g-1" }),
    ]);

    assert.deepEqual(
      promoted.map((h) => h.id),
      ["g-2", "s-2", "g-1", "s-1"]
    );
  });
});

describe("search", () => {
  it("returns hydrated hits with their goal and a link", async () => {
    await indexed([
      goal({
        id: "g-1",
        title: "Move to Barcelona",
        steps: [{ id: "s-1", text: "Get the visa", description: "NIE first", done: true }],
      }),
    ]);

    const hits = await search(pool, owner, "visa", { embed: null });

    assert.equal(hits.length, 1);
    assert.deepEqual(
      { ...hits[0], score: 0, arms: [] },
      {
        kind: "step",
        id: "s-1",
        title: "Get the visa",
        detail: "NIE first",
        goal: { id: "g-1", title: "Move to Barcelona", url: "/goal/g-1-move-to-barcelona" },
        done: true,
        score: 0,
        arms: [],
      }
    );
  });

  it("works with no embedding provider at all", async () => {
    await indexed([goal({ id: "g-1", title: "Move to Barcelona" })]);

    const hits = await search(pool, owner, "Barcelona", { embed: null });

    // The whole degradation story: two arms out of three, and search still works.
    assert.deepEqual(titles(hits), ["Move to Barcelona"]);
    assert.ok(!hits[0]!.arms.includes("vector"));
  });

  it("uses the semantic arm when a provider is configured", async () => {
    const embed = fakeEmbedder();
    await indexed([goal({ id: "g-1", title: "Move to Barcelona" })], [], embed);

    const hits = await search(pool, owner, "Barcelona", { embed });

    assert.ok(hits[0]!.arms.includes("vector"));
  });

  it("survives the embedding provider failing", async () => {
    await indexed([goal({ id: "g-1", title: "Move to Barcelona" })]);
    const broken: Embedder = {
      modelName: "fake-model",
      embed: async () => {
        throw new Error("provider is down");
      },
    };

    const hits = await search(pool, owner, "Barcelona", { embed: broken });

    // An outage costs the semantic arm, not the feature.
    assert.deepEqual(titles(hits), ["Move to Barcelona"]);
    assert.ok(!hits[0]!.arms.includes("vector"));
  });

  it("drops a hit whose item is gone from the store", async () => {
    await indexed([
      goal({ id: "g-1", title: "Move to Barcelona" }),
      goal({ id: "g-2", title: "Barcelona apartment hunt" }),
    ]);
    // Delete without reindexing, so the index still carries the stale row.
    await repo.deleteGoal(pool, owner, "g-2");

    const hits = await search(pool, owner, "Barcelona", { embed: null });

    // Hydrating from the real tables is what makes a briefly stale index safe.
    assert.deepEqual(titles(hits), ["Move to Barcelona"]);
  });

  it("filters by kind and honours the limit", async () => {
    await indexed([
      goal({
        id: "g-1",
        title: "Barcelona",
        steps: [{ id: "s-1", text: "Barcelona flights", done: false }],
        notes: [{ id: "n-1", text: "Barcelona is expensive in August", createdAt: 1 }],
      }),
    ]);

    const notes = await search(pool, owner, "Barcelona", { embed: null, kinds: ["note"] });
    assert.deepEqual(
      notes.map((h) => h.kind),
      ["note"]
    );

    const capped = await search(pool, owner, "Barcelona", { embed: null, limit: 2 });
    assert.equal(capped.length, 2);
  });

  it("returns nothing for a blank query", async () => {
    await indexed([goal({ title: "Move to Barcelona" })]);
    assert.deepEqual(await search(pool, owner, "   ", { embed: null }), []);
  });

  it("never returns another owner's rows, even for identical text", async () => {
    const other = await createOwner(pool, "owner-2");
    await indexed([goal({ id: "g-mine", title: "Move to Barcelona" })]);
    await repo.replaceAll(pool, other, [goal({ id: "g-theirs", title: "Move to Barcelona" })], null, []);
    await reindexOwner(pool, other, null);

    const mine = await search(pool, owner, "Barcelona", { embed: null });

    assert.deepEqual(
      mine.map((h) => h.id),
      ["g-mine"]
    );
  });
});
