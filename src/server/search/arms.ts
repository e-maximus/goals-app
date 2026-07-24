import "server-only";
import type { Pool } from "../db";

/**
 * The three ways this app looks something up. Each answers the same question —
 * "which of this owner's chunks match?" — badly on its own and well in company:
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
 * Every arm returns its own ranking; fusing them is [rrf.ts](./rrf.ts)'s job.
 * All three filter on `owner_id` — including the corpus statistics, which would
 * otherwise be computed over other people's text.
 */

export type Arm = "keyword" | "vector" | "trigram";

export type ArmHit = { kind: string; itemId: string; score: number };

/** Rows each arm considers before fusion. Wider than the final result on purpose. */
export const ARM_LIMIT = 30;

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
export async function keywordArm(
  pool: Pool,
  ownerId: string,
  query: string,
  limit = ARM_LIMIT
): Promise<ArmHit[]> {
  const { rows } = await pool.query<{ kind: string; item_id: string; score: number }>(
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
    [ownerId, query, K1, B, TITLE_BOOST, limit]
  );
  return rows.map(toHit);
}

/** BM25's usual constants: term-frequency saturation and length normalisation. */
const K1 = 1.2;
const B = 0.75;
/** How much a hit in the item's own heading outweighs one in its body. */
const TITLE_BOOST = 1.6;

/**
 * Cosine similarity against the query's embedding.
 *
 * Rows without a vector simply don't match — that is the whole degradation story
 * when no provider is configured, or while a reindex is still catching up.
 */
export async function vectorArm(
  pool: Pool,
  ownerId: string,
  queryEmbedding: number[],
  modelName: string,
  limit = ARM_LIMIT
): Promise<ArmHit[]> {
  const { rows } = await pool.query<{ kind: string; item_id: string; score: number }>(
    `SELECT kind, item_id, 1 - (embedding <=> $2::vector) AS score
       FROM embeddings
      WHERE owner_id = $1
        AND embedding IS NOT NULL
        -- Never compare across models: their coordinates mean different things,
        -- so a leftover vector from the previous model is noise, not a weak hit.
        AND model = $3
      ORDER BY embedding <=> $2::vector
      LIMIT $4`,
    [ownerId, `[${queryEmbedding.join(",")}]`, modelName, limit]
  );
  return rows.map(toHit);
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
export async function trigramArm(
  pool: Pool,
  ownerId: string,
  query: string,
  limit = ARM_LIMIT
): Promise<ArmHit[]> {
  const { rows } = await pool.query<{ kind: string; item_id: string; score: number }>(
    `SELECT kind, item_id, word_similarity($2, search_text) AS score
       FROM embeddings
      WHERE owner_id = $1
        AND word_similarity($2, search_text) >= $3
      ORDER BY score DESC
      LIMIT $4`,
    [ownerId, query, TRIGRAM_THRESHOLD, limit]
  );
  return rows.map(toHit);
}

function toHit(row: { kind: string; item_id: string; score: number }): ArmHit {
  return { kind: row.kind, itemId: row.item_id, score: Number(row.score) };
}
