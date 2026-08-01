import "server-only";
import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import type { Pool } from "../../db";
import { ARM_LIMIT, keywordArm } from "../arms";

/**
 * The BM25 arm, dressed as a LangChain retriever.
 *
 * This is an adapter and nothing more: the ranking still comes from
 * [arms.ts](../arms.ts), which computes BM25 in SQL with per-owner term
 * statistics. LangChain has no equivalent to borrow — its `BM25Retriever` scores
 * an in-memory array of documents, so it would hold the corpus in the heap and
 * score every row on every query. Wrapping the SQL keeps the disk-backed index
 * and the real IDF, and costs one class.
 *
 * Nothing in the app's search path uses this yet. It exists so the fused search
 * in [search.ts](../search.ts) can be rebuilt on LangChain piece by piece, with
 * each piece checked against the implementation it replaces.
 *
 * ## Why the owner is a constructor argument
 *
 * A retriever's only input is the query string — the interface has nowhere to put
 * an owner, and `_getRelevantDocuments` must not invent one. So the owner is
 * bound when the retriever is built, which means **a retriever is per-request**,
 * like the request-scoped values it is built from. Hoisting one to module scope
 * would pin the first request's owner onto every later one, which is the exact
 * cross-account read the repo's `owner_id` discipline exists to prevent.
 */
export type Bm25RetrieverArgs = BaseRetrieverInput & {
  pool: Pool;
  /** Whose corpus to search. Bound here, never taken from the query. */
  ownerId: string;
  /** Rows to retrieve. Defaults to the same width the fused search uses. */
  limit?: number;
};

export class Bm25Retriever extends BaseRetriever {
  static lc_name() {
    return "Bm25Retriever";
  }

  lc_namespace = ["goals", "retrievers", "bm25"];

  private readonly pool: Pool;
  private readonly ownerId: string;
  private readonly limit: number;

  constructor(args: Bm25RetrieverArgs) {
    super(args);
    this.pool = args.pool;
    this.ownerId = args.ownerId;
    this.limit = args.limit ?? ARM_LIMIT;
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const hits = await keywordArm(this.pool, this.ownerId, query, this.limit);

    // `pageContent` is deliberately empty. A hit is an *identity* — a kind and an
    // id — because search.ts hydrates winners from the real tables rather than
    // serving the index's copy of the text, so a row deleted since the last
    // reindex drops out instead of being shown. Filling pageContent here would
    // put a second, staler copy of the text in play and invite someone to render
    // it. The score and the position survive in metadata: the retriever
    // interface returns an order, not scores, and the fusion downstream needs the
    // rank anyway.
    return hits.map(
      (hit, index) =>
        new Document({
          pageContent: "",
          metadata: {
            arm: "keyword",
            kind: hit.kind,
            itemId: hit.itemId,
            score: hit.score,
            rank: index,
          },
        })
    );
  }
}

/**
 * Build the retrievers for one request, bound to one owner.
 *
 * A factory rather than an exported instance, for the reason in the class doc:
 * the owner is part of the retriever, so it cannot outlive the request that
 * resolved it. Only BM25 for now; the trigram and vector arms join it here when
 * they are wrapped too.
 */
export function buildRetrievers(pool: Pool, ownerId: string): { bm25: Bm25Retriever } {
  return { bm25: new Bm25Retriever({ pool, ownerId }) };
}
