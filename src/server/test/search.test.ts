import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal, Task } from "../domain";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { EMBEDDING_DIMENSIONS, type Embedder } from "../embeddings/model";
import { keywordArm, trigramArm } from "../search/arms";
import { fuse } from "../search/rrf";
import { search } from "../search/search";
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

describe("keyword arm (BM25)", () => {
  it("ranks the rare term above the common one", async () => {
    // "move" is in every goal; "Barcelona" is in one. Without IDF both terms
    // count the same and the most "move"-heavy row wins — which is not what the
    // user asked for. This is the test ts_rank could not pass.
    await indexed([
      goal({ id: "g-1", title: "Move to Barcelona", why: "Live by the sea" }),
      goal({ id: "g-2", title: "Move the sofa", why: "Move it out of the hallway, then move it back" }),
      goal({ id: "g-3", title: "Move house paperwork", why: "Move everything before the move deadline" }),
      goal({ id: "g-4", title: "Move the gym sessions", why: "Move them to the morning" }),
    ]);

    const hits = await keywordArm(pool, owner, "move to Barcelona");

    assert.equal(hits[0]!.itemId, "g-1");
  });

  it("ranks a hit in the item's own title above one in its body", async () => {
    await indexed([
      goal({ id: "g-title", title: "Visa paperwork" }),
      goal({ id: "g-body", title: "Relocation", why: "Sort out the visa at some point" }),
    ]);

    const hits = await keywordArm(pool, owner, "visa");

    assert.equal(hits[0]!.itemId, "g-title");
  });

  it("does not let a parent's title leak into a child's keyword score", async () => {
    // The step says nothing about Barcelona; only its goal does. The step's
    // embedded text carries the goal title for the vector arm's benefit, and
    // this proves that text never reached the keyword index.
    await indexed([
      goal({
        id: "g-1",
        title: "Move to Barcelona",
        steps: [{ id: "s-1", text: "Cancel the gym membership", done: false }],
      }),
    ]);

    const hits = await keywordArm(pool, owner, "Barcelona");

    assert.deepEqual(
      hits.map((h) => h.itemId),
      ["g-1"]
    );
  });

  it("finds nothing for a query with no shared words", async () => {
    await indexed([goal({ title: "Move to Barcelona" })]);
    assert.deepEqual(await keywordArm(pool, owner, "kitchen renovation"), []);
  });
});

describe("trigram arm", () => {
  it("still finds the row when the query is misspelled", async () => {
    await indexed([goal({ id: "g-1", title: "Move to Barcelona" })]);

    // BM25 sees "barcelna" as simply a different word; this is the arm that
    // covers typos — and the same mechanism covers Russian morphology, which
    // the 'simple' config does not stem.
    assert.deepEqual(await keywordArm(pool, owner, "Barcelna"), []);
    const hits = await trigramArm(pool, owner, "Barcelna");
    assert.equal(hits[0]!.itemId, "g-1");
  });
});

describe("fuse", () => {
  it("puts a row several arms agree on above one only a single arm loves", () => {
    const fused = fuse([
      {
        arm: "keyword",
        hits: [
          { kind: "goal", itemId: "loved-by-one", score: 99 },
          { kind: "goal", itemId: "agreed", score: 1 },
        ],
      },
      { arm: "vector", hits: [{ kind: "goal", itemId: "agreed", score: 0.4 }] },
      { arm: "trigram", hits: [{ kind: "goal", itemId: "agreed", score: 0.5 }] },
    ]);

    // Note the scores are wildly different scales — 99 vs 0.4 — and RRF ignores
    // them entirely, which is the point: only the orderings are comparable.
    assert.equal(fused[0]!.itemId, "agreed");
    assert.deepEqual(fused[0]!.arms, ["keyword", "vector", "trigram"]);
  });

  it("works with an arm missing entirely", () => {
    const fused = fuse([
      { arm: "keyword", hits: [{ kind: "goal", itemId: "a", score: 2 }] },
      { arm: "trigram", hits: [] },
    ]);
    assert.deepEqual(
      fused.map((h) => h.itemId),
      ["a"]
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

  it("computes term statistics per owner, not across the whole table", async () => {
    // IDF is a corpus statistic. Computed over the whole table, another user's
    // goals would change how rare a word looks here — leaking their content into
    // this owner's ranking, and quietly making their own scores wrong.
    const other = await createOwner(pool, "owner-2");
    await repo.replaceAll(
      pool,
      other,
      Array.from({ length: 8 }, (_, i) =>
        goal({ id: `t-${i}`, title: `Barcelona plan ${i}`, why: "Barcelona Barcelona" })
      ),
      null,
      []
    );
    await reindexOwner(pool, other, null);

    await indexed([
      goal({ id: "g-rare", title: "Barcelona" }),
      goal({ id: "g-common", title: "Weekly review", why: "Review the week" }),
    ]);

    const hits = await keywordArm(pool, owner, "Barcelona");

    assert.deepEqual(
      hits.map((h) => h.itemId),
      ["g-rare"]
    );
  });
});
