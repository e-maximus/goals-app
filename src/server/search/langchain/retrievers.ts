import "server-only";
import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import type { Pool } from "../../db";
import type { Embedder } from "../../embeddings/model";
import { log } from "../../log";
import { ARM_LIMIT, keywordArm, trigramArm, vectorArm, type Arm, type ArmHit } from "../arms";

/**
 * The three arms, dressed as LangChain retrievers.
 *
 * These are adapters. The ranking still comes from the SQL in
 * [arms.ts](../arms.ts) — BM25 with per-owner term statistics, trigram word
 * similarity, cosine distance — because LangChain has nothing to borrow for the
 * first two: its own `BM25Retriever` scores an in-memory array of documents, so
 * adopting it would mean holding the corpus in the heap and scoring every row on
 * every query. Wrapping the SQL keeps the index and the real IDF, and costs one
 * class each.
 *
 * ## Why the owner is a constructor argument
 *
 * A retriever's only input is the query string — the interface has nowhere to
 * put an owner, and `_getRelevantDocuments` must not invent one. So the owner is
 * bound when the retriever is built, which makes **a retriever per-request**,
 * like the request-scoped values it is built from. Hoisting one to module scope
 * would pin the first request's owner onto every later one, which is the exact
 * cross-account read the repo's `owner_id` discipline exists to prevent.
 *
 * ## Why `pageContent` is an id and not text
 *
 * `EnsembleRetriever` keys its rank fusion on `pageContent` — that string *is*
 * the identity of a result as far as the fusion is concerned, and two documents
 * sharing one are the same document. Our results are identified by kind and id,
 * so that is what goes in, via {@link docKey}.
 *
 * It is deliberately not the item's text. Search hydrates its winners from the
 * real tables rather than serving the index's copy (see
 * [search.ts](../search.ts)), so a row deleted since the last reindex drops out
 * instead of being rendered. Putting text here would place a second, staler copy
 * in play and invite someone to render it — and it would also make two items
 * that happen to share wording collide into one during fusion.
 */

/** The identity of a result, and the key the ensemble's fusion groups by. */
export function docKey(kind: string, itemId: string): string {
  return `${kind}:${itemId}`;
}

/** Read back what {@link docKey} wrote. */
export function parseDocKey(key: string): { kind: string; itemId: string } {
  const separator = key.indexOf(":");
  return { kind: key.slice(0, separator), itemId: key.slice(separator + 1) };
}

export type ArmRetrieverArgs = BaseRetrieverInput & {
  pool: Pool;
  /** Whose corpus to search. Bound here, never taken from the query. */
  ownerId: string;
  /** Rows to retrieve. Defaults to the same width the fused search uses. */
  limit?: number;
};

/** Shared plumbing: run an arm, wrap its hits, keep its order. */
export abstract class ArmRetriever extends BaseRetriever {
  lc_namespace = ["goals", "retrievers"];

  protected readonly pool: Pool;
  protected readonly ownerId: string;
  protected readonly limit: number;

  /** Which arm this is, as the wire type names it. Travels in metadata. */
  abstract readonly arm: Arm;

  constructor(args: ArmRetrieverArgs) {
    super(args);
    this.pool = args.pool;
    this.ownerId = args.ownerId;
    this.limit = args.limit ?? ARM_LIMIT;
  }

  protected abstract hits(query: string): Promise<ArmHit[]>;

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const hits = await this.hits(query);
    return hits.map(
      (hit, index) =>
        new Document({
          pageContent: docKey(hit.kind, hit.itemId),
          metadata: {
            arm: this.arm,
            kind: hit.kind,
            itemId: hit.itemId,
            score: hit.score,
            rank: index,
          },
        })
    );
  }
}

export class Bm25Retriever extends ArmRetriever {
  static lc_name() {
    return "Bm25Retriever";
  }
  readonly arm = "keyword" as const;

  protected hits(query: string) {
    return keywordArm(this.pool, this.ownerId, query, this.limit);
  }
}

export class TrigramRetriever extends ArmRetriever {
  static lc_name() {
    return "TrigramRetriever";
  }
  readonly arm = "trigram" as const;

  protected hits(query: string) {
    return trigramArm(this.pool, this.ownerId, query, this.limit);
  }
}

export type VectorRetrieverArgs = ArmRetrieverArgs & { embed: Embedder };

/**
 * The semantic arm.
 *
 * The embedder is required here rather than nullable: with no provider
 * configured this retriever must not be built at all, because the ensemble
 * demands one weight per retriever and would throw on a mismatch. Absence is
 * decided once, in {@link buildRetrievers}.
 *
 * A provider that *errors* is a different case from one that is absent, and it
 * still must not take the whole search down — the other two arms have already
 * answered. So a failure is logged and returns nothing.
 */
export class VectorRetriever extends ArmRetriever {
  static lc_name() {
    return "VectorRetriever";
  }
  readonly arm = "vector" as const;

  private readonly embed: Embedder;

  constructor(args: VectorRetrieverArgs) {
    super(args);
    this.embed = args.embed;
  }

  protected async hits(query: string): Promise<ArmHit[]> {
    try {
      const [vector] = await this.embed.embed([query]);
      if (!vector) return [];
      return await vectorArm(this.pool, this.ownerId, vector, this.embed.modelName, this.limit);
    } catch (err) {
      log.error("search_vector_arm_failed", {
        userId: this.ownerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}

/**
 * How much each arm's opinion counts, carried over from the hand-written fusion.
 *
 * Equal, with one exception. `word_similarity` saturates at 1.0 for anything
 * containing the query verbatim, so on an ordinary spelled-correctly query the
 * trigram arm ranks every exact match identically and its *order* among them is
 * close to meaningless. Weighted equally, that noise was enough to tie a goal
 * against one of its own steps and let the tie decide.
 */
const ARM_WEIGHT: Record<Arm, number> = {
  keyword: 1,
  vector: 1,
  trigram: 0.5,
};

export type BuiltRetrievers = {
  retrievers: ArmRetriever[];
  /** Positionally aligned with `retrievers`, as the ensemble requires. */
  weights: number[];
};

/**
 * Build the retrievers for one request, bound to one owner.
 *
 * A factory rather than exported instances, for the reason in the module doc:
 * the owner is part of a retriever, so it cannot outlive the request that
 * resolved it.
 *
 * With no embedder the vector retriever is simply absent — and so is its weight,
 * which is why the two are returned together. `EnsembleRetriever` throws when
 * the arrays differ in length, so building them apart is how that bug happens.
 */
export function buildRetrievers(
  pool: Pool,
  ownerId: string,
  embed: Embedder | null,
  limit = ARM_LIMIT
): BuiltRetrievers {
  const retrievers: ArmRetriever[] = [
    new Bm25Retriever({ pool, ownerId, limit }),
    new TrigramRetriever({ pool, ownerId, limit }),
  ];
  if (embed) retrievers.push(new VectorRetriever({ pool, ownerId, limit, embed }));

  return { retrievers, weights: retrievers.map((retriever) => ARM_WEIGHT[retriever.arm]) };
}
