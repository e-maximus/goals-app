import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { DocumentInterface } from "@langchain/core/documents";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { ListwiseReranker, rerankHits } from "../search/rerank";
import { search } from "../search/search";
import { ScriptedChatModel } from "./scripted-model";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The reranker is the reason the arms are behind a framework interface at all,
 * so what it owes us is narrow and worth stating: it may reorder, and it may not
 * invent, duplicate or lose a result. A model is free to answer badly; it is not
 * free to corrupt the list.
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

function goal(id: string, title: string, why?: string): Goal {
  return {
    id,
    title,
    ...(why ? { why } : {}),
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    status: "active",
    steps: [],
    groups: [],
    notes: [],
  };
}

/** A compressor that returns a fixed order, standing in for the model's answer. */
class ScriptedReranker extends BaseDocumentCompressor {
  constructor(private readonly order: number[]) {
    super();
  }
  async compressDocuments(documents: DocumentInterface[]): Promise<DocumentInterface[]> {
    return this.order.filter((i) => i < documents.length).map((i) => documents[i]!);
  }
}

const hit = (kind: string, id: string, title: string) => ({
  kind: kind as "goal",
  id,
  title,
  goal: { id: "g", title: "G", url: "/goal/g" },
  score: 0,
  arms: ["keyword" as const],
});

describe("rerankHits", () => {
  const hits = [hit("goal", "a", "Alpha"), hit("goal", "b", "Beta"), hit("goal", "c", "Gamma")];

  it("puts the hits in the order the compressor returned", async () => {
    const ordered = await rerankHits(new ScriptedReranker([2, 0, 1]), "q", hits);

    assert.deepEqual(
      ordered.map((h) => h.id),
      ["c", "a", "b"]
    );
  });

  it("keeps a hit the compressor dropped, at the end", async () => {
    // A model that ignores a candidate must not delete it: three arms may have
    // agreed on it, and one bad completion should not cost the user a result.
    const ordered = await rerankHits(new ScriptedReranker([1]), "q", hits);

    assert.deepEqual(
      ordered.map((h) => h.id),
      ["b", "a", "c"]
    );
  });

  it("leaves scores alone", async () => {
    const scored = hits.map((h, i) => ({ ...h, score: i / 10 }));
    const ordered = await rerankHits(new ScriptedReranker([2, 1, 0]), "q", scored);

    // The score is the fusion's number. A reranked list is ordered by the
    // model's judgement instead, and overwriting the score with a rank would
    // tell the client something it does not mean.
    assert.deepEqual(
      ordered.map((h) => h.score),
      [0.2, 0.1, 0]
    );
  });
});

describe("ListwiseReranker", () => {
  /**
   * `withStructuredOutput` binds a tool and reads the ranking out of the call's
   * arguments, so the script has to answer with a tool call rather than text.
   */
  const model = (ranking: unknown) =>
    new ScriptedChatModel([{ toolCalls: [{ name: "extract", args: { ranking } }] }]);

  const documents = (...texts: string[]) =>
    texts.map((text, i) => ({ pageContent: text, metadata: { key: `goal:${i}` } }));

  it("reorders by the indexes the model returned", async () => {
    const reranker = new ListwiseReranker(model([2, 0]));

    const out = await reranker.compressDocuments(documents("a", "b", "c"), "q");

    assert.deepEqual(
      out.map((d) => d.pageContent),
      ["c", "a", "b"]
    );
  });

  it("ignores an index the model made up", async () => {
    // Guarding its arithmetic, not its judgement: an out-of-range index would
    // otherwise throw or, worse, land `undefined` in the results.
    const reranker = new ListwiseReranker(model([99, -1, 1.5, 1]));

    const out = await reranker.compressDocuments(documents("a", "b"), "q");

    assert.deepEqual(
      out.map((d) => d.pageContent),
      ["b", "a"]
    );
  });

  it("ignores a repeated index rather than duplicating a result", async () => {
    const reranker = new ListwiseReranker(model([1, 1, 0]));

    const out = await reranker.compressDocuments(documents("a", "b"), "q");

    assert.deepEqual(
      out.map((d) => d.pageContent),
      ["b", "a"]
    );
  });

  it("returns the fused order when the model fails", async () => {
    const broken = new (class extends ScriptedChatModel {
      withStructuredOutput(): never {
        throw new Error("model is down");
      }
    })([]);

    const out = await new ListwiseReranker(broken).compressDocuments(documents("a", "b"), "q");

    // The arms have already answered. An outage costs the reordering, not the
    // search.
    assert.deepEqual(
      out.map((d) => d.pageContent),
      ["a", "b"]
    );
  });
});

describe("search with rerank", () => {
  it("returns the reranked order, still promoting goals last", async () => {
    await repo.replaceAll(
      pool,
      owner,
      [
        goal("g-1", "Move to Barcelona", "Live by the sea"),
        goal("g-2", "Barcelona apartment hunt", "Find a flat"),
      ],
      null,
      []
    );
    await reindexOwner(pool, owner, null);

    const reversed = new (class extends BaseDocumentCompressor {
      async compressDocuments(documents: DocumentInterface[]) {
        return [...documents].reverse();
      }
    })();

    const before = await search(pool, owner, "Barcelona", { embed: null });
    const after = await search(pool, owner, "Barcelona", { embed: null, rerank: reversed });

    assert.deepEqual(
      after.map((h) => h.id),
      before.map((h) => h.id).reverse()
    );
  });

  it("does not rerank by default", async () => {
    // The ⌘K palette searches as the user types; a model call per keystroke is
    // not a trade worth making. Only the agent's tool opts in.
    await repo.replaceAll(
      pool,
      owner,
      [goal("g-1", "Move to Barcelona"), goal("g-2", "Barcelona flat hunt")],
      null,
      []
    );
    await reindexOwner(pool, owner, null);

    let called = false;
    const spy = new (class extends BaseDocumentCompressor {
      async compressDocuments(documents: DocumentInterface[]) {
        called = true;
        return documents;
      }
    })();

    await search(pool, owner, "Barcelona", { embed: null });
    assert.equal(called, false);

    await search(pool, owner, "Barcelona", { embed: null, rerank: spy });
    assert.equal(called, true);
  });
});
