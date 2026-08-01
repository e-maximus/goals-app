import "server-only";
import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import type { Pool } from "../../db";
import type { Embedder } from "../../embeddings/model";
import { log } from "../../log";
import type { SearchArm as Arm } from "../../domain";

export type { SearchArm as Arm } from "../../domain";

/** One row as an arm ranks it, before fusion. */
export type ArmHit = { kind: string; itemId: string; score: number };

/** Rows each arm considers before fusion. Wider than the final result on purpose. */
export const ARM_LIMIT = 30;

/**
 * The three arms, dressed as LangChain retrievers.
 *
 * Each answers the same question — "which of this owner's chunks match?" —
 * badly on its own and well in company:
 *
 * - **keyword (BM25)** nails the exact word. Asked for "Barcelona", it finds
 *   Barcelona and ranks the row that says it most, in the shortest text, where
 *   the word is rarest across the corpus.
 * - **vector** finds the row that means the same thing in different words, and
 *   is the only arm that can answer a question phrased nothing like the note
 *   that answers it.
 * - **trigram** catches what the other two drop on the floor: a typo, and the
 *   Russian morphology the 'simple' text-search config does not stem, so
 *   "переезду" and "переезд" stay different words to BM25.
 *
 * The ranking is SQL, not LangChain. There is nothing to borrow for the first
 * two arms: its own `BM25Retriever` scores an in-memory array of documents, so
 * adopting it would mean holding the corpus in the heap and scoring every row on
 * every query, and no retriever it ships computes IDF against one owner's
 * corpus at all. The retriever is the interface; the query underneath is ours.
 *
 * All three filter on `owner_id` — including the corpus statistics, which would
 * otherwise be computed over other people's text.
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
 * [hydrate.ts](../hydrate.ts)), so a row deleted since the last reindex drops out
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

/** BM25's usual constants: term-frequency saturation and length normalisation. */
const K1 = 1.2;
const B = 0.75;
/** How much a hit in the item's own heading outweighs one in its body. */
const TITLE_BOOST = 1.6;

/**
 * BM25, computed per owner at query time.
 *
 * Postgres ranks full text with `ts_rank`, which counts term frequency and
 * weights but has no IDF: "переезд" (in five of the user's goals) and
 * "Барселона" (in one) would count the same, and the rare word is the one the
 * user meant. So the score is assembled here instead.
 *
 * Computing document frequency at query time rather than materialising it is
 * what keeps this simple. In a corpus of millions you cache `df`; here it is a
 * few hundred rows behind a GIN index, and the corpus changes on every write —
 * a stored `df` would need invalidating from every mutation path, to save
 * microseconds.
 *
 * Deviation worth knowing: document length is `length(tsv)`, the count of
 * *distinct* lexemes rather than total tokens. It is what Postgres gives cheaply,
 * and it normalises long rows against short ones the same way.
 */
export class Bm25Retriever extends ArmRetriever {
  static lc_name() {
    return "Bm25Retriever";
  }
  readonly arm = "keyword" as const;

  protected async hits(query: string): Promise<ArmHit[]> {
    const { rows } = await this.pool.query<Row>(
      `WITH q AS (
         SELECT DISTINCT lexeme FROM unnest(to_tsvector('simple', $2))
       ),
       corpus AS (
         SELECT count(*)::float8 AS n, avg(length(tsv))::float8 AS avglen
           FROM embeddings WHERE owner_id = $1
       ),
       postings AS (
         SELECT e.kind, e.item_id, l.lexeme,
                coalesce(array_length(l.positions, 1), 0)::float8 AS tf,
                length(e.tsv)::float8 AS len,
                -- The item's own heading counts for more than its body.
                CASE WHEN 'A' = ANY(l.weights) THEN $5::float8 ELSE 1.0 END AS boost
           FROM embeddings e
           JOIN q ON true
           JOIN LATERAL unnest(e.tsv) l ON l.lexeme = q.lexeme
          WHERE e.owner_id = $1
       ),
       df AS (SELECT lexeme, count(*)::float8 AS df FROM postings GROUP BY lexeme)
       SELECT p.kind, p.item_id,
              sum(
                -- IDF, smoothed: stays positive when a term is in nearly every row.
                ln(1 + (c.n - d.df + 0.5) / (d.df + 0.5))
                -- Saturating term frequency, normalised by document length.
                * (p.tf * ($3::float8 + 1))
                / (p.tf + $3::float8 * (1 - $4::float8 + $4::float8 * p.len / nullif(c.avglen, 0)))
                * p.boost
              ) AS score
         FROM postings p
         JOIN df d ON d.lexeme = p.lexeme
        CROSS JOIN corpus c
        GROUP BY p.kind, p.item_id
        ORDER BY score DESC
        LIMIT $6`,
      [this.ownerId, query, K1, B, TITLE_BOOST, this.limit]
    );
    return rows.map(toHit);
  }
}

/** Below this a trigram match is coincidence rather than a typo. */
const TRIGRAM_THRESHOLD = 0.4;

/**
 * Fuzzy match on the raw text.
 *
 * `word_similarity` compares the query against the best-matching *run of words*
 * in the row, rather than the row as a whole — without it a three-word query
 * would score near zero against a long note that contains it verbatim.
 */
export class TrigramRetriever extends ArmRetriever {
  static lc_name() {
    return "TrigramRetriever";
  }
  readonly arm = "trigram" as const;

  protected async hits(query: string): Promise<ArmHit[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT kind, item_id, word_similarity($2, search_text) AS score
         FROM embeddings
        WHERE owner_id = $1
          AND word_similarity($2, search_text) >= $3
        -- word_similarity saturates at 1.0 for anything containing the query
        -- verbatim, so on an exact match it stops discriminating and every such
        -- row ties. Shorter text carries the same match with less around it — the
        -- intuition BM25 spends a whole term on — and item_id makes the order
        -- reproducible rather than whatever the plan happened to emit.
        ORDER BY score DESC, length(search_text) ASC, item_id ASC
        LIMIT $4`,
      [this.ownerId, query, TRIGRAM_THRESHOLD, this.limit]
    );
    return rows.map(toHit);
  }
}

export type VectorRetrieverArgs = ArmRetrieverArgs & { embed: Embedder };

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
const VECTOR_THRESHOLD = 0.3;

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
      const { rows } = await this.pool.query<Row>(
        `SELECT kind, item_id, 1 - (embedding <=> $2::vector) AS score
           FROM embeddings
          WHERE owner_id = $1
            AND embedding IS NOT NULL
            -- Never compare across models: their coordinates mean different
            -- things, so a leftover vector from the previous model is noise,
            -- not a weak hit.
            AND model = $3
            AND 1 - (embedding <=> $2::vector) >= $4
          ORDER BY embedding <=> $2::vector
          LIMIT $5`,
        [this.ownerId, `[${vector.join(",")}]`, this.embed.modelName, VECTOR_THRESHOLD, this.limit]
      );
      return rows.map(toHit);
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

type Row = { kind: string; item_id: string; score: number };

function toHit(row: Row): ArmHit {
  return { kind: row.kind, itemId: row.item_id, score: Number(row.score) };
}
