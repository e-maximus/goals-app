import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { keywordArm } from "../search/arms";
import { Bm25Retriever, buildRetrievers } from "../search/langchain/bm25-retriever";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The LangChain adapter over the BM25 arm.
 *
 * There is no new ranking here to test — the SQL is already covered in
 * search.test.ts. What these assert is that the wrapper is *transparent*: same
 * rows, same order, same scores as calling the arm directly. A retriever that
 * quietly reorders or drops results would be worse than no retriever at all,
 * because the fused search it feeds would look plausible while being wrong.
 */

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

/** Persist goals and build the text index over them. No embedder: BM25 needs none. */
async function indexed(ownerId: string, goals: Goal[]) {
  await repo.replaceAll(pool, ownerId, goals, null, []);
  await reindexOwner(pool, ownerId, null);
}

const corpus = [
  goal({ id: "g-1", title: "Move to Barcelona", why: "Live by the sea" }),
  goal({ id: "g-2", title: "Learn Spanish", why: "Speak it in Barcelona" }),
  goal({ id: "g-3", title: "Move house paperwork", why: "Move before the deadline" }),
  goal({ id: "g-4", title: "Fix the bike", why: "The brakes are gone" }),
];

describe("Bm25Retriever", () => {
  it("returns the arm's ranking unchanged", async () => {
    await indexed(owner, corpus);

    const expected = await keywordArm(pool, owner, "move to Barcelona");
    const docs = await buildRetrievers(pool, owner).bm25.invoke("move to Barcelona");

    assert.ok(expected.length > 1, "the fixture should produce more than one hit");
    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      expected.map((h) => h.itemId)
    );
    assert.deepEqual(
      docs.map((d) => d.metadata.score),
      expected.map((h) => h.score)
    );
  });

  it("carries the arm, kind and rank in metadata, and no text in pageContent", async () => {
    await indexed(owner, corpus);

    const docs = await buildRetrievers(pool, owner).bm25.invoke("Barcelona");

    assert.ok(docs.length > 0);
    docs.forEach((doc, index) => {
      assert.equal(doc.pageContent, "");
      assert.equal(doc.metadata.arm, "keyword");
      assert.equal(doc.metadata.rank, index);
      assert.equal(typeof doc.metadata.kind, "string");
      assert.equal(typeof doc.metadata.itemId, "string");
    });
  });

  it("honours its limit", async () => {
    await indexed(owner, corpus);

    const docs = await new Bm25Retriever({ pool, ownerId: owner, limit: 2 }).invoke("move");

    assert.equal(docs.length, 2);
  });

  it("never reaches another owner's rows", async () => {
    // Ids are globally unique but not private: a query that filtered on a bare
    // row id would cross accounts. The owner is bound to the retriever, so this
    // is the assertion that the binding actually reaches the SQL.
    const other = await createOwner(pool, "owner-2");
    await indexed(owner, [goal({ id: "mine", title: "Move to Barcelona" })]);
    await indexed(other, [goal({ id: "theirs", title: "Move to Barcelona" })]);

    const docs = await buildRetrievers(pool, owner).bm25.invoke("Barcelona");

    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      ["mine"]
    );
  });

  it("returns nothing rather than throwing when the corpus is empty", async () => {
    const docs = await buildRetrievers(pool, owner).bm25.invoke("Barcelona");

    assert.deepEqual(docs, []);
  });
});
