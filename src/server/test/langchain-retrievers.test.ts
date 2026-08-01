import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import type { Embedder } from "../embeddings/model";
import { keywordArm, trigramArm } from "../search/arms";
import {
  Bm25Retriever,
  TrigramRetriever,
  VectorRetriever,
  buildRetrievers,
  docKey,
  parseDocKey,
} from "../search/langchain/retrievers";
import { lexicalEmbedder } from "./search-cases";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The LangChain adapters over the three arms.
 *
 * There is no new ranking to test — the SQL is covered in search.test.ts. What
 * these assert is that the wrappers are *transparent*: same rows, same order,
 * same scores as calling the arm directly. A retriever that quietly reordered or
 * dropped results would be worse than no retriever at all, because the fused
 * search it feeds would look plausible while being wrong.
 */

let pool: Pool;
let owner: string;

const embedder = lexicalEmbedder();

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

async function indexed(ownerId: string, goals: Goal[], embed: Embedder | null = null) {
  await repo.replaceAll(pool, ownerId, goals, null, []);
  await reindexOwner(pool, ownerId, embed);
}

const corpus = [
  goal({ id: "g-1", title: "Move to Barcelona", why: "Live by the sea" }),
  goal({ id: "g-2", title: "Learn Spanish", why: "Speak it in Barcelona" }),
  goal({ id: "g-3", title: "Move house paperwork", why: "Move before the deadline" }),
  goal({ id: "g-4", title: "Fix the bike", why: "The brakes are gone" }),
];

describe("docKey", () => {
  it("round-trips a kind and an id", () => {
    assert.deepEqual(parseDocKey(docKey("step", "s-1")), { kind: "step", itemId: "s-1" });
  });

  it("survives an id containing the separator", () => {
    // Ids are opaque; nothing forbids a colon in one, and a naive split would
    // silently truncate it — which would then collide two results into one
    // during fusion, since the ensemble keys on this string.
    assert.deepEqual(parseDocKey(docKey("note", "n:1:2")), { kind: "note", itemId: "n:1:2" });
  });
});

describe("Bm25Retriever", () => {
  it("returns the arm's ranking unchanged", async () => {
    await indexed(owner, corpus);

    const expected = await keywordArm(pool, owner, "move to Barcelona");
    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("move to Barcelona");

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

  it("puts the result's identity in pageContent, not its text", async () => {
    // The ensemble's rank fusion groups by pageContent, so it must be the
    // identity of the row. Text there would collide two items that happen to
    // share wording.
    await indexed(owner, corpus);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("move");

    assert.ok(docs.length > 1);
    docs.forEach((doc) => {
      assert.equal(doc.pageContent, docKey(doc.metadata.kind, doc.metadata.itemId));
    });
    assert.equal(new Set(docs.map((d) => d.pageContent)).size, docs.length);
  });

  it("carries the arm, kind and rank in metadata", async () => {
    await indexed(owner, corpus);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.ok(docs.length > 0);
    docs.forEach((doc, index) => {
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

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      ["mine"]
    );
  });

  it("returns nothing rather than throwing when the corpus is empty", async () => {
    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.deepEqual(docs, []);
  });
});

describe("TrigramRetriever", () => {
  it("returns the arm's ranking unchanged", async () => {
    await indexed(owner, corpus);

    const expected = await trigramArm(pool, owner, "Barcelna");
    const docs = await new TrigramRetriever({ pool, ownerId: owner }).invoke("Barcelna");

    assert.ok(expected.length > 0, "the typo should still match");
    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      expected.map((h) => h.itemId)
    );
    assert.equal(docs[0]!.metadata.arm, "trigram");
  });

  it("never reaches another owner's rows", async () => {
    const other = await createOwner(pool, "owner-2");
    await indexed(owner, [goal({ id: "mine", title: "Move to Barcelona" })]);
    await indexed(other, [goal({ id: "theirs", title: "Move to Barcelona" })]);

    const docs = await new TrigramRetriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      ["mine"]
    );
  });
});

describe("VectorRetriever", () => {
  it("retrieves rows embedded with the same model", async () => {
    await indexed(owner, corpus, embedder);

    const docs = await new VectorRetriever({ pool, ownerId: owner, embed: embedder }).invoke(
      "Barcelona"
    );

    assert.ok(docs.length > 0);
    assert.equal(docs[0]!.metadata.arm, "vector");
  });

  it("returns nothing, and does not throw, when the provider errors", async () => {
    // The other two arms have already answered by then; a broken provider must
    // cost recall, not the whole search.
    await indexed(owner, corpus, embedder);
    const broken: Embedder = {
      modelName: embedder.modelName,
      async embed() {
        throw new Error("provider is down");
      },
    };

    const docs = await new VectorRetriever({ pool, ownerId: owner, embed: broken }).invoke(
      "Barcelona"
    );

    assert.deepEqual(docs, []);
  });

  it("never reaches another owner's rows", async () => {
    const other = await createOwner(pool, "owner-2");
    await indexed(owner, [goal({ id: "mine", title: "Move to Barcelona" })], embedder);
    await indexed(other, [goal({ id: "theirs", title: "Move to Barcelona" })], embedder);

    const docs = await new VectorRetriever({ pool, ownerId: owner, embed: embedder }).invoke(
      "Barcelona"
    );

    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      ["mine"]
    );
  });
});

describe("buildRetrievers", () => {
  it("returns weights positionally aligned with the retrievers", () => {
    const { retrievers, weights } = buildRetrievers(pool, owner, embedder);

    assert.equal(retrievers.length, weights.length);
    assert.deepEqual(
      retrievers.map((r) => r.arm),
      ["keyword", "trigram", "vector"]
    );
    assert.deepEqual(weights, [1, 0.5, 1]);
  });

  it("omits the vector arm — and its weight — with no embedder", () => {
    // The ensemble throws when the two arrays differ in length, so dropping one
    // without the other is the bug this guards.
    const { retrievers, weights } = buildRetrievers(pool, owner, null);

    assert.deepEqual(
      retrievers.map((r) => r.arm),
      ["keyword", "trigram"]
    );
    assert.deepEqual(weights, [1, 0.5]);
  });
});
