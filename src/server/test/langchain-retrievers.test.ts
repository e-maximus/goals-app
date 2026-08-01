import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import type { Embedder } from "../embeddings/model";
import { fuseWithEnsemble } from "../search/langchain/fusion";
import {
  ArmRetriever,
  Bm25Retriever,
  TrigramRetriever,
  VectorRetriever,
  buildRetrievers,
  docKey,
  parseDocKey,
  type Arm,
  type ArmHit,
} from "../search/langchain/retrievers";
import { lexicalEmbedder } from "./search-cases";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The three retrievers and the ensemble that fuses them.
 *
 * Two kinds of assertion live here. The ranking ones — IDF beats term frequency,
 * a title beats a body, a parent's title never reaches a child — are about the
 * SQL each retriever carries, and they are the reason the SQL is there at all
 * rather than a stock LangChain retriever. The rest are about the seams the
 * framework introduces: the identity a document is keyed by, the owner bound
 * into a retriever, and everything the ensemble drops on the way out.
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
  it("ranks the rare term above the common one", async () => {
    // "move" is in every goal; "Barcelona" is in one. Without IDF both terms
    // count the same and the most "move"-heavy row wins — which is not what the
    // user asked for. This is the test ts_rank could not pass, and the reason
    // LangChain's own BM25Retriever is not what sits here.
    await indexed(owner, [
      goal({ id: "g-1", title: "Move to Barcelona", why: "Live by the sea" }),
      goal({
        id: "g-2",
        title: "Move the sofa",
        why: "Move it out of the hallway, then move it back",
      }),
      goal({
        id: "g-3",
        title: "Move house paperwork",
        why: "Move everything before the move deadline",
      }),
      goal({ id: "g-4", title: "Move the gym sessions", why: "Move them to the morning" }),
    ]);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("move to Barcelona");

    assert.equal(docs[0]!.metadata.itemId, "g-1");
  });

  it("ranks a hit in the item's own title above one in its body", async () => {
    await indexed(owner, [
      goal({ id: "g-title", title: "Visa paperwork" }),
      goal({ id: "g-body", title: "Relocation", why: "Sort out the visa at some point" }),
    ]);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("visa");

    assert.equal(docs[0]!.metadata.itemId, "g-title");
  });

  it("does not let a parent's title leak into a child's keyword score", async () => {
    // The step says nothing about Barcelona; only its goal does. The step's
    // embedded text carries the goal title for the vector arm's benefit, and
    // this proves that text never reached the keyword index.
    await indexed(owner, [
      goal({
        id: "g-1",
        title: "Move to Barcelona",
        steps: [{ id: "s-1", text: "Cancel the gym membership", done: false }],
      }),
    ]);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      ["g-1"]
    );
  });

  it("finds nothing for a query with no shared words", async () => {
    await indexed(owner, [goal({ title: "Move to Barcelona" })]);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("kitchen renovation");

    assert.deepEqual(docs, []);
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

  it("computes term statistics per owner, not across the whole table", async () => {
    // IDF is a corpus statistic. Computed over the whole table, another user's
    // goals would change how rare a word looks here — leaking their content into
    // this owner's ranking, and quietly making their own scores wrong.
    const other = await createOwner(pool, "owner-2");
    await indexed(
      other,
      Array.from({ length: 8 }, (_, i) =>
        goal({ id: `t-${i}`, title: `Barcelona plan ${i}`, why: "Barcelona Barcelona" })
      )
    );
    await indexed(owner, [
      goal({ id: "g-rare", title: "Barcelona" }),
      goal({ id: "g-common", title: "Weekly review", why: "Review the week" }),
    ]);

    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.deepEqual(
      docs.map((d) => d.metadata.itemId),
      ["g-rare"]
    );
  });

  it("returns nothing rather than throwing when the corpus is empty", async () => {
    const docs = await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelona");

    assert.deepEqual(docs, []);
  });
});

describe("TrigramRetriever", () => {
  it("still finds the row when the query is misspelled", async () => {
    await indexed(owner, [goal({ id: "g-1", title: "Move to Barcelona" })]);

    // BM25 sees "barcelna" as simply a different word; this is the arm that
    // covers typos — and the same mechanism covers Russian morphology, which
    // the 'simple' config does not stem.
    assert.deepEqual(await new Bm25Retriever({ pool, ownerId: owner }).invoke("Barcelna"), []);

    const docs = await new TrigramRetriever({ pool, ownerId: owner }).invoke("Barcelna");

    assert.equal(docs[0]!.metadata.itemId, "g-1");
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

/**
 * A retriever with a ranking dictated by the test.
 *
 * Fusion is about how orderings combine, and driving three real arms into a
 * chosen disagreement means fighting IDF, length normalisation and a similarity
 * threshold at once — a fixture that would break for reasons having nothing to
 * do with the fusion. The arms have their own tests above; these stubs let this
 * block assert only what the ensemble does with what it is given.
 */
class StubRetriever extends ArmRetriever {
  readonly arm: Arm;
  private readonly stub: ArmHit[];

  constructor(pool: Pool, ownerId: string, arm: Arm, itemIds: string[]) {
    super({ pool, ownerId });
    this.arm = arm;
    this.stub = itemIds.map((itemId, index) => ({
      kind: "goal",
      itemId,
      // Wildly different scales on purpose: RRF must ignore these entirely.
      score: arm === "keyword" ? 99 - index : 1 / (index + 1),
    }));
  }

  protected async hits(): Promise<ArmHit[]> {
    return this.stub;
  }
}

describe("fuseWithEnsemble", () => {
  it("puts a row several arms agree on above one only a single arm loves", async () => {
    const fused = await fuseWithEnsemble(
      {
        retrievers: [
          new StubRetriever(pool, owner, "keyword", ["loved-by-one", "agreed"]),
          new StubRetriever(pool, owner, "trigram", ["agreed"]),
          new StubRetriever(pool, owner, "vector", ["agreed"]),
        ],
        weights: [1, 0.5, 1],
      },
      "anything"
    );

    assert.equal(fused[0]!.itemId, "agreed");
    assert.deepEqual(fused[0]!.arms, ["keyword", "trigram", "vector"]);
  });

  it("breaks a tie the same way every time", async () => {
    // Two rows on an identical score: without a total order they swap between
    // otherwise identical requests and the result depends on the query plan.
    const build = () => ({
      retrievers: [new StubRetriever(pool, owner, "keyword", ["b-row", "a-row"])],
      weights: [1],
    });
    const tie = {
      retrievers: [
        new StubRetriever(pool, owner, "keyword", ["b-row"]),
        new StubRetriever(pool, owner, "trigram", ["a-row"]),
      ],
      weights: [1, 1],
    };

    assert.deepEqual(
      (await fuseWithEnsemble(build(), "q")).map((h) => h.itemId),
      ["b-row", "a-row"]
    );
    // Same score, same arm count — only the id can decide, and it must decide
    // the same way on every call.
    const first = await fuseWithEnsemble(tie, "q");
    assert.deepEqual(
      first.map((h) => h.itemId),
      ["a-row", "b-row"]
    );
  });

  it("scores by weighted rank, not by what the arms reported", async () => {
    const fused = await fuseWithEnsemble(
      {
        retrievers: [
          new StubRetriever(pool, owner, "keyword", ["first", "second"]),
          new StubRetriever(pool, owner, "trigram", ["first"]),
        ],
        weights: [1, 0.5],
      },
      "q"
    );

    // The keyword arm reported 99 and 98; the fused scores are weight/(rank + 60).
    assert.equal(fused[0]!.score.toFixed(6), (1 / 61 + 0.5 / 61).toFixed(6));
    assert.equal(fused[1]!.score.toFixed(6), (1 / 62).toFixed(6));
  });

  it("names every arm that found a row, in a stable order", async () => {
    // The arms run in parallel, so the order their callbacks fire in varies
    // between requests. `arms` reaches the client, so it must not.
    await indexed(owner, [goal({ id: "g-1", title: "Barcelona" })], embedder);

    const first = await fuseWithEnsemble(buildRetrievers(pool, owner, embedder), "Barcelona");
    const second = await fuseWithEnsemble(buildRetrievers(pool, owner, embedder), "Barcelona");

    assert.deepEqual(first[0]!.arms, second[0]!.arms);
    assert.deepEqual(first[0]!.arms, ["keyword", "trigram", "vector"]);
  });

  it("works with an arm missing entirely", async () => {
    await indexed(owner, corpus);

    const fused = await fuseWithEnsemble(buildRetrievers(pool, owner, null), "Barcelona");

    assert.ok(fused.some((hit) => hit.itemId === "g-1"));
    assert.ok(fused.every((hit) => !hit.arms.includes("vector")));
  });

  it("returns nothing when no arm found anything", async () => {
    await indexed(owner, corpus);

    const fused = await fuseWithEnsemble(buildRetrievers(pool, owner, null), "квантовая");

    assert.deepEqual(fused, []);
  });
});
