import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { buildChunks, type Chunk } from "../embeddings/chunks";
import { syncChunks } from "../embeddings/repo";
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

/** Persist the goals so the index's `goal_id` foreign key has something to point at. */
async function store(ownerId: string, goals: Goal[]) {
  await repo.replaceAll(pool, ownerId, goals, null, []);
  return buildChunks({ goals, tasks: [] });
}

type Row = {
  kind: string;
  item_id: string;
  owner_id: string;
  title_text: string;
  content: string;
  content_hash: string;
  updated_at: number;
  has_embedding: boolean;
};

async function rows(ownerId: string): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT kind, item_id, owner_id, title_text, content, content_hash, updated_at,
            embedding IS NOT NULL AS has_embedding
       FROM embeddings WHERE owner_id = $1 ORDER BY kind, item_id`,
    [ownerId]
  );
  return rows;
}

describe("syncChunks", () => {
  it("writes a row per chunk, with no vector yet", async () => {
    const chunks = await store(owner, [goal()]);
    const stats = await syncChunks(pool, owner, chunks);

    assert.equal(stats.inserted, chunks.length);
    assert.equal(stats.updated, 0);
    assert.equal(stats.deleted, 0);

    const written = await rows(owner);
    assert.equal(written.length, chunks.length);
    // The text lands without an embedding provider being involved at all — this
    // is what lets BM25 and trigram search work with no model configured.
    assert.ok(written.every((r) => !r.has_embedding));
  });

  it("is a no-op the second time nothing has changed", async () => {
    const chunks = await store(owner, [goal()]);
    await syncChunks(pool, owner, chunks);
    const first = await rows(owner);

    const stats = await syncChunks(pool, owner, chunks);

    assert.equal(stats.unchanged, chunks.length);
    assert.equal(stats.inserted, 0);
    assert.equal(stats.updated, 0);
    // Untouched, not rewritten with the same values: `updated_at` is the tell.
    assert.deepEqual(await rows(owner), first);
  });

  it("rewrites only the chunk whose text moved", async () => {
    const chunks = await store(owner, [goal()]);
    await syncChunks(pool, owner, chunks);
    const before = await rows(owner);

    const edited = await store(owner, [
      goal({ steps: [{ id: "s-1", text: "Get the visa and the NIE", done: false }] }),
    ]);
    const stats = await syncChunks(pool, owner, edited);

    assert.equal(stats.updated, 1);
    assert.equal(stats.inserted, 0);
    assert.equal(stats.unchanged, edited.length - 1);

    const after = await rows(owner);
    const step = after.find((r) => r.item_id === "s-1")!;
    const goalRow = after.find((r) => r.kind === "goal")!;
    assert.equal(step.title_text, "Get the visa and the NIE");
    assert.equal(goalRow.updated_at, before.find((r) => r.kind === "goal")!.updated_at);
  });

  it("drops the stale vector when the text it described changed", async () => {
    const chunks = await store(owner, [goal()]);
    await syncChunks(pool, owner, chunks);
    await pool.query(
      `UPDATE embeddings SET embedding = $2::vector, model = 'test-model'
        WHERE owner_id = $1`,
      [owner, `[${Array(768).fill(0.1).join(",")}]`]
    );
    assert.ok((await rows(owner)).every((r) => r.has_embedding));

    const edited = await store(owner, [
      goal({ steps: [{ id: "s-1", text: "Get the visa and the NIE", done: false }] }),
    ]);
    await syncChunks(pool, owner, edited);

    const after = await rows(owner);
    // Keeping the old vector would leave the index describing text that is no
    // longer there — a wrong answer, where a gap is only a missing one.
    assert.equal(after.find((r) => r.item_id === "s-1")!.has_embedding, false);
    assert.equal(after.find((r) => r.kind === "goal")!.has_embedding, true);
  });

  it("removes rows for things that no longer exist", async () => {
    const chunks = await store(owner, [
      goal(),
      goal({ id: "goal-podcast", title: "Launch my podcast", steps: [] }),
    ]);
    await syncChunks(pool, owner, chunks);
    assert.equal((await rows(owner)).length, chunks.length);

    const remaining = await store(owner, [goal()]);
    const stats = await syncChunks(pool, owner, remaining);

    assert.equal(stats.deleted, 1);
    assert.ok(!(await rows(owner)).some((r) => r.item_id === "goal-podcast"));
  });

  it("clears the index when the store is emptied", async () => {
    await syncChunks(pool, owner, await store(owner, [goal()]));
    const stats = await syncChunks(pool, owner, []);

    assert.ok(stats.deleted > 0);
    assert.equal((await rows(owner)).length, 0);
  });

  it("survives the whole-store rewrite instead of being cascaded away", async () => {
    // replaceAll deletes and re-inserts every goal. If the index hung off a
    // foreign key it would be emptied here, and the next sync would re-embed
    // the whole corpus rather than the one row that moved.
    const chunks = await store(owner, [goal()]);
    await syncChunks(pool, owner, chunks);

    await store(owner, [goal()]);

    assert.equal((await rows(owner)).length, chunks.length);
    assert.equal((await syncChunks(pool, owner, chunks)).unchanged, chunks.length);
  });

  it("drops a deleted goal's chunks on the next sync", async () => {
    await syncChunks(pool, owner, await store(owner, [goal()]));
    await repo.deleteGoal(pool, owner, "goal-move");

    const stats = await syncChunks(pool, owner, buildChunks({ goals: [], tasks: [] }));

    assert.ok(stats.deleted > 0);
    assert.equal((await rows(owner)).length, 0);
  });

  it("keeps two owners' indexes apart, even with identical text", async () => {
    const other = await createOwner(pool, "owner-2");
    await syncChunks(pool, owner, await store(owner, [goal()]));
    // Ids are globally unique, so the second owner's rows need their own —
    // the text is what's identical here, which is the point.
    await syncChunks(
      pool,
      other,
      await store(other, [
        goal({ id: "goal-move-2", steps: [{ id: "s-2", text: "Get the visa", done: false }] }),
      ])
    );

    const mine = await rows(owner);
    const theirs = await rows(other);
    assert.ok(mine.length > 0 && theirs.length > 0);
    assert.ok(mine.every((r) => r.owner_id === owner));
    assert.ok(theirs.every((r) => r.owner_id === other));

    // One owner emptying their store must not touch the other's rows.
    await syncChunks(pool, owner, []);
    assert.equal((await rows(owner)).length, 0);
    assert.deepEqual(await rows(other), theirs);
  });

  it("weights the item's own title above its body", async () => {
    const chunks: Chunk[] = await store(owner, [
      goal({ why: "So I can finally live by the sea", steps: [] }),
    ]);
    await syncChunks(pool, owner, chunks);

    const { rows } = await pool.query<{ tsv: string; search_text: string }>(
      "SELECT tsv::text AS tsv, search_text FROM embeddings WHERE owner_id = $1 AND kind = 'goal'",
      [owner]
    );
    assert.match(rows[0].tsv, /'barcelona':\d+A/);
    assert.match(rows[0].tsv, /'sea':\d+B/);
    // The trigram arm searches the same words, unweighted.
    assert.ok(rows[0].search_text.includes("Barcelona"));
    assert.ok(rows[0].search_text.includes("sea"));
  });
});
