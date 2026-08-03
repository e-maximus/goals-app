import "server-only";
import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import type { Pool } from "../db";
import type { SearchArm } from "../domain";
import type { Embedder } from "../embeddings/model";
import { docKey } from "./documents";
import { ARM_LIMIT, GoalsVectorStore } from "./store";
import { log } from "../log";

/**
 * The three ways this app looks something up, as LangChain retrievers.
 *
 * Each answers the same question — "which of this owner's chunks match?" — badly
 * on its own and well in company:
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
 * **The ranking stays in SQL.** Nothing LangChain ships computes BM25 against one
 * owner's corpus: its own `BM25Retriever` scores an in-memory array of
 * documents, which would mean holding the corpus in the heap and scoring every
 * row on every query, against a GIN-backed index and a real IDF. What the
 * framework contributes is the plumbing between the arms — parallel invocation,
 * weighted fusion, and a callback surface that makes each arm's contribution
 * visible in a trace.
 *
 * **Every arm filters on `owner_id`** — including the corpus statistics, which
 * would otherwise compute IDF over other people's text. The owner is a
 * constructor argument because a retriever's only input is the query string,
 * which makes these per-request objects: a module-scoped instance would pin the
 * first request's owner onto every later one.
 */

export type ArmRetrieverInput = BaseRetrieverInput & {
  pool: Pool;
  ownerId: string;
  limit?: number;
};

/** A retriever that knows which arm it is, so the fusion can attribute its hits. */
export abstract class ArmRetriever extends BaseRetriever {
  abstract readonly arm: SearchArm;
  protected readonly pool: Pool;
  protected readonly ownerId: string;
  protected readonly limit: number;

  constructor(fields: ArmRetrieverInput) {
    super(fields);
    this.pool = fields.pool;
    this.ownerId = fields.ownerId;
    this.limit = fields.limit ?? ARM_LIMIT;
  }

  protected toDocuments(rows: { kind: string; item_id: string; score: number }[]): Document[] {
    return rows.map(
      (row) =>
        new Document({
          pageContent: docKey(row.kind, row.item_id),
          metadata: {
            arm: this.arm,
            kind: row.kind,
            itemId: row.item_id,
            score: Number(row.score),
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
export class KeywordRetriever extends ArmRetriever {
  static lc_name() {
    return "KeywordRetriever";
  }
  lc_namespace = ["goals", "search", "keyword"];
  readonly arm = "keyword" as const;

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const { rows } = await this.pool.query<{ kind: string; item_id: string; score: number }>(
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
    return this.toDocuments(rows);
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
  lc_namespace = ["goals", "search", "trigram"];
  readonly arm = "trigram" as const;

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const { rows } = await this.pool.query<{ kind: string; item_id: string; score: number }>(
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
    return this.toDocuments(rows);
  }
}

/**
 * The semantic arm: the vector store's own retriever, wrapped so a provider
 * outage costs one arm rather than the whole search.
 *
 * A missing provider is a normal state and is handled by not building this arm
 * at all (see {@link buildRetrievers}). A provider that *errors* is not normal,
 * but the other two arms have already answered by then, and returning their
 * results beats returning a stack trace.
 */
export class VectorRetriever extends ArmRetriever {
  static lc_name() {
    return "VectorRetriever";
  }
  lc_namespace = ["goals", "search", "vector"];
  readonly arm = "vector" as const;

  private readonly store: GoalsVectorStore;

  constructor(fields: ArmRetrieverInput & { embedder: Embedder }) {
    super(fields);
    this.store = new GoalsVectorStore(fields.embedder.embeddings, {
      pool: fields.pool,
      ownerId: fields.ownerId,
      modelName: fields.embedder.modelName,
    });
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    try {
      const scored = await this.store.similaritySearchVectorWithScore(
        await this.store.embeddings.embedQuery(query),
        this.limit
      );
      return scored.map(([document, score]) => {
        document.metadata.score = score;
        return document;
      });
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
 * How much each arm's opinion counts.
 *
 * Equal by default, with one exception. `word_similarity` saturates at 1.0 for
 * anything containing the query verbatim, so on an ordinary spelled-correctly
 * query the trigram arm ranks every exact match identically and its *order*
 * among them is close to meaningless. Weighted equally, that noise was enough to
 * tie a goal against one of its own steps and let the tie decide.
 *
 * At half weight the arm still rescues a query only it can answer — a typo,
 * where it is the sole voice — but stops overruling the arms that actually
 * discriminate when they have something to say.
 */
const ARM_WEIGHT: Record<SearchArm, number> = {
  keyword: 1,
  vector: 1,
  trigram: 0.5,
};

export type BuiltRetrievers = {
  retrievers: ArmRetriever[];
  weights: number[];
};

/**
 * Build the arms for one request.
 *
 * Retrievers and weights come back together and absence is decided once, because
 * `EnsembleRetriever` demands one weight per retriever and throws on a mismatch.
 * With no embedding provider the vector arm must therefore not be built at all
 * rather than built and skipped.
 */
export function buildRetrievers(
  pool: Pool,
  ownerId: string,
  embedder: Embedder | null,
  limit = ARM_LIMIT
): BuiltRetrievers {
  const retrievers: ArmRetriever[] = [
    new KeywordRetriever({ pool, ownerId, limit }),
    new TrigramRetriever({ pool, ownerId, limit }),
  ];
  if (embedder) retrievers.push(new VectorRetriever({ pool, ownerId, limit, embedder }));

  return { retrievers, weights: retrievers.map((r) => ARM_WEIGHT[r.arm]) };
}
