import "server-only";
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { Pool } from "../db";
import { docKey } from "./documents";

/**
 * The `embeddings` table, as a LangChain vector store.
 *
 * This is a thin read-only view rather than a store that owns its schema, and
 * that is deliberate. `PGVectorStore` from the community package wants to create
 * and manage its own table; ours already exists and carries things it knows
 * nothing about — `owner_id`, the `model` a vector came from, the `tsv` and
 * `search_text` columns the other two arms search, and a content hash the
 * reindex diffs against. Adopting a foreign schema would mean giving up the
 * incremental reindex, which is the expensive part.
 *
 * So writes are not implemented (see {@link addVectors}). What this class is for
 * is the read: `similaritySearchVectorWithScore` is the semantic arm, and having
 * it behind the standard interface is what lets `asRetriever()` produce that arm
 * with no custom retriever to maintain.
 *
 * **Owner-bound at construction.** The interface's only inputs are a query and a
 * `k`, so there is nowhere to pass an owner at call time — meaning an instance
 * must never outlive a request. Same rule, and the same reason, as the chat's
 * checkpointer.
 */

/** Rows the arm considers before fusion. Wider than the final result on purpose. */
export const ARM_LIMIT = 30;

/**
 * Below this a vector hit is the nearest row rather than a relevant one.
 *
 * A cosine search always has a nearest neighbour, so without a floor this arm
 * answers *every* query with a full page of results and "nothing matches" becomes
 * unreachable — which is exactly what happened: a search for "xylophone repair"
 * came back with somebody's podcast notes.
 *
 * Measured on the seeded store with text-embedding-3-small: queries about
 * nothing in the corpus peak around 0.13–0.16, real matches sit at 0.40 and up.
 * The gap is wide, so the exact cut matters little; it is placed nearer the noise
 * so a weak-but-real match still gets through.
 */
export const VECTOR_THRESHOLD = 0.3;

export type GoalsVectorStoreArgs = {
  pool: Pool;
  ownerId: string;
  /** Vectors are only ever compared against their own model's rows. */
  modelName: string;
};

export class GoalsVectorStore extends VectorStore {
  private readonly pool: Pool;
  private readonly ownerId: string;
  private readonly modelName: string;

  constructor(embeddings: EmbeddingsInterface, args: GoalsVectorStoreArgs) {
    super(embeddings, args);
    this.pool = args.pool;
    this.ownerId = args.ownerId;
    this.modelName = args.modelName;
  }

  _vectorstoreType(): string {
    return "goals-embeddings";
  }

  /**
   * Cosine similarity against one owner's rows, thresholded.
   *
   * Rows without a vector simply don't match — that is the whole degradation
   * story when no provider is configured, or while a reindex is still catching
   * up. Rows embedded by a different model are excluded rather than compared:
   * their coordinates mean different things, so a leftover vector from the
   * previous model is noise, not a weak hit.
   */
  async similaritySearchVectorWithScore(
    query: number[],
    k: number
  ): Promise<[Document, number][]> {
    const { rows } = await this.pool.query<{ kind: string; item_id: string; score: number }>(
      `SELECT kind, item_id, 1 - (embedding <=> $2::vector) AS score
         FROM embeddings
        WHERE owner_id = $1
          AND embedding IS NOT NULL
          AND model = $3
          AND 1 - (embedding <=> $2::vector) >= $4
        ORDER BY embedding <=> $2::vector
        LIMIT $5`,
      [this.ownerId, `[${query.join(",")}]`, this.modelName, VECTOR_THRESHOLD, k]
    );

    return rows.map((row) => [
      new Document({
        // Identity, not text — see documents.ts for why that matters to fusion.
        pageContent: docKey(row.kind, row.item_id),
        metadata: { arm: "vector", kind: row.kind, itemId: row.item_id },
      }),
      Number(row.score),
    ]);
  }

  /**
   * Not supported, on purpose.
   *
   * The index is written by one path only ([reindex.ts](../embeddings/reindex.ts)),
   * which diffs by content hash, embeds just what moved, and refuses to save a
   * vector whose text changed while the provider was answering. A write through
   * this interface would know none of that and would quietly desynchronise the
   * index from the store.
   */
  async addVectors(): Promise<void> {
    throw new Error(
      "GoalsVectorStore is read-only — the index is written by reindexOwner, which diffs by content hash."
    );
  }

  async addDocuments(): Promise<void> {
    return this.addVectors();
  }
}
