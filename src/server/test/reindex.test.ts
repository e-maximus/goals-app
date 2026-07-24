import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { buildChunks } from "../embeddings/chunks";
import { listPending, saveVectors, syncChunks } from "../embeddings/repo";
import { reindexOwner } from "../embeddings/reindex";
import { EMBEDDING_DIMENSIONS, type Embedder } from "../embeddings/model";
import { runTool, tools, type ToolContext } from "../tools";
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

/**
 * A stand-in for the provider: same text in, same vector out, no network.
 *
 * Real embeddings would make the suite slow, flaky and dependent on a paid key,
 * and would test OpenAI rather than our pipeline. What this pipeline owes us is
 * that the right texts get sent, exactly once each, and the vectors come back to
 * the right rows — all of which a deterministic stub proves better than the real
 * thing, because it can also count the calls.
 */
function fakeEmbedder(modelName = "fake-model") {
  const embedded: string[][] = [];
  const embedder: Embedder = {
    modelName,
    async embed(texts) {
      embedded.push(texts);
      return texts.map((text) => {
        const seed = createHash("sha256").update(text).digest();
        return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => seed[i % seed.length]! / 255);
      });
    },
  };
  return {
    embedder,
    /** Every batch of texts sent, in order. */
    batches: embedded,
    get sent() {
      return embedded.flat();
    },
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-move",
    title: "Move to Barcelona",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    status: "active",
    steps: [{ id: "s-1", text: "Get the visa", done: false }],
    groups: [],
    notes: [],
    ...overrides,
  };
}

async function store(ownerId: string, goals: Goal[]) {
  await repo.replaceAll(pool, ownerId, goals, null, []);
}

async function vectorState(ownerId: string) {
  const { rows } = await pool.query<{ item_id: string; model: string | null; has: boolean }>(
    `SELECT item_id, model, embedding IS NOT NULL AS has
       FROM embeddings WHERE owner_id = $1 ORDER BY item_id`,
    [ownerId]
  );
  return rows;
}

describe("reindexOwner", () => {
  it("indexes the text and fills every vector on a first run", async () => {
    await store(owner, [goal()]);
    const fake = fakeEmbedder();

    const result = await reindexOwner(pool, owner, fake.embedder);

    assert.equal(result.chunks, 2);
    assert.equal(result.inserted, 2);
    assert.equal(result.embedded, 2);
    assert.equal(result.textOnly, false);
    assert.ok((await vectorState(owner)).every((r) => r.has && r.model === "fake-model"));
    // The embedded text is the one carrying the parent's title, not the bare step.
    assert.ok(fake.sent.some((t) => t.includes("Goal: Move to Barcelona\nStep: Get the visa")));
  });

  it("embeds nothing on a second run when nothing changed", async () => {
    await store(owner, [goal()]);
    const first = fakeEmbedder();
    await reindexOwner(pool, owner, first.embedder);

    const second = fakeEmbedder();
    const result = await reindexOwner(pool, owner, second.embedder);

    // The whole point of the content-hash diff: a debounced whole-store PUT that
    // changed nothing must not cost a single embedding call.
    assert.equal(result.embedded, 0);
    assert.deepEqual(second.batches, []);
  });

  it("re-embeds only the chunk whose text moved", async () => {
    await store(owner, [goal()]);
    await reindexOwner(pool, owner, fakeEmbedder().embedder);

    await store(owner, [goal({ steps: [{ id: "s-1", text: "Get the visa and the NIE", done: false }] })]);
    const fake = fakeEmbedder();
    const result = await reindexOwner(pool, owner, fake.embedder);

    assert.equal(result.embedded, 1);
    assert.equal(fake.sent.length, 1);
    assert.ok(fake.sent[0]!.includes("Get the visa and the NIE"));
  });

  it("indexes text and skips vectors when no provider is configured", async () => {
    await store(owner, [goal()]);

    const result = await reindexOwner(pool, owner, null);

    // This is a supported state, not a broken one: BM25 and trigram search need
    // no model, so the app works with EMBEDDING_API_KEY unset.
    assert.equal(result.textOnly, true);
    assert.equal(result.embedded, 0);
    assert.equal(result.chunks, 2);
    const rows = await vectorState(owner);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => !r.has));
  });

  it("picks up rows a run without a provider left empty", async () => {
    await store(owner, [goal()]);
    await reindexOwner(pool, owner, null);

    const result = await reindexOwner(pool, owner, fakeEmbedder().embedder);

    assert.equal(result.embedded, 2);
    assert.ok((await vectorState(owner)).every((r) => r.has));
  });

  it("refills everything when the model changes", async () => {
    await store(owner, [goal()]);
    await reindexOwner(pool, owner, fakeEmbedder("model-a").embedder);

    const fake = fakeEmbedder("model-b");
    const result = await reindexOwner(pool, owner, fake.embedder);

    // Vectors from two models can't be compared — their coordinates mean
    // different things — so a model switch has to invalidate the lot. The `model`
    // column is what makes that automatic, with nothing to remember to run.
    assert.equal(result.embedded, 2);
    assert.ok((await vectorState(owner)).every((r) => r.model === "model-b"));
  });

  it("keeps one owner's reindex out of another's rows", async () => {
    const other = await createOwner(pool, "owner-2");
    await store(owner, [goal()]);
    await store(other, [goal({ id: "goal-2", steps: [{ id: "s-2", text: "Get the visa", done: false }] })]);

    await reindexOwner(pool, owner, fakeEmbedder().embedder);

    assert.equal((await vectorState(owner)).length, 2);
    assert.equal((await vectorState(other)).length, 0);
  });
});

describe("saveVectors", () => {
  it("drops a vector whose text changed while it was being embedded", async () => {
    await store(owner, [goal()]);
    await syncChunks(pool, owner, buildChunks(await repo.getState(pool, owner)));

    const pending = await listPending(pool, owner, "fake-model", 100);
    const step = pending.find((p) => p.itemId === "s-1")!;

    // The user edits that step while the provider is still answering.
    await store(owner, [goal({ steps: [{ id: "s-1", text: "Get the NIE instead", done: false }] })]);
    await syncChunks(pool, owner, buildChunks(await repo.getState(pool, owner)));

    const saved = await saveVectors(pool, owner, "fake-model", [
      { ...step, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.5) },
    ]);

    // Writing it would leave the index confidently describing text that is no
    // longer there — worse than the gap the next pass closes.
    assert.equal(saved, 0);
    const rows = await vectorState(owner);
    assert.equal(rows.find((r) => r.item_id === "s-1")!.has, false);
  });
});

describe("runTool", () => {
  const find = (name: string) => tools.find((t) => t.name === name)!;

  async function callWith(name: string, args: unknown) {
    let mutations = 0;
    const ctx: ToolContext = { pool, ownerId: owner, onMutation: () => void mutations++ };
    await runTool(find(name), args, ctx);
    return mutations;
  }

  it("signals a mutation for a write tool", async () => {
    assert.equal(await callWith("create_goal", { title: "Move to Barcelona" }), 1);
  });

  it("stays quiet for a read tool", async () => {
    assert.equal(await callWith("list_goals", {}), 0);
  });

  it("marks every tool that touches the store", () => {
    // A write tool missing `mutates` would silently stop reindexing, and the
    // only symptom would be search quietly going stale. Names are the contract.
    const reads = new Set(["list_goals", "get_goal", "list_notes", "list_tasks", "search_goals", "get_agenda"]);
    for (const tool of tools) {
      assert.equal(
        tool.mutates ?? false,
        !reads.has(tool.name),
        `${tool.name}: mutates flag does not match whether it is a read`
      );
    }
  });
});
