import "server-only";
import type { Client, Pool } from "../db";
import { chunkHash, type Chunk } from "./chunks";

/**
 * Writing the search index. This layer knows nothing about embedding providers:
 * it lands the text and lets `embedding` stay null. That is what keeps search
 * usable with no model configured at all — the BM25 and trigram arms only ever
 * needed the text — and it is why the reindex path can run on every write
 * without waiting on a network call.
 *
 * Filling in the vectors is a separate, resumable pass over whatever rows this
 * left without one.
 */

export type SyncStats = {
  /** Rows written for the first time. */
  inserted: number;
  /** Rows whose text changed — their stored vector was dropped as stale. */
  updated: number;
  /** Rows already matching by content hash: not touched, not re-embedded. */
  unchanged: number;
  /** Rows for things that no longer exist in the store. */
  deleted: number;
};

/** Postgres caps a statement at 65535 parameters; stay far below it. */
const ROWS_PER_STATEMENT = 200;

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Make the index for `ownerId` match `chunks` exactly.
 *
 * Every statement names the owner, and the incoming chunks are only ever
 * written under `ownerId` — the chunk carries no owner of its own to be trusted.
 *
 * The diff is by content hash, so the common case (a debounced whole-store PUT
 * where one step's text moved) rewrites one row and leaves the other few hundred
 * vectors intact. A row whose text did change has its `embedding` and `model`
 * cleared in the same statement: keeping the old vector would leave the index
 * quietly describing text that is no longer there, which is worse than a gap the
 * next pass fills.
 */
export async function syncChunks(
  pool: Pool,
  ownerId: string,
  chunks: Chunk[]
): Promise<SyncStats> {
  return pool.transaction(async (client) => {
    const before = await countRows(client, ownerId);
    const deleted = await deleteMissing(client, ownerId, chunks);

    let written = 0;
    for (const batch of chunked(chunks, ROWS_PER_STATEMENT)) {
      written += await upsertBatch(client, ownerId, batch);
    }

    const survived = before - deleted;
    // Anything written that wasn't already there is new; the rest were rewrites.
    const inserted = Math.max(0, chunks.length - survived);
    return {
      inserted,
      updated: written - inserted,
      unchanged: chunks.length - written,
      deleted,
    };
  });
}

async function countRows(client: Client, ownerId: string): Promise<number> {
  const { rows } = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM embeddings WHERE owner_id = $1",
    [ownerId]
  );
  return rows[0]?.count ?? 0;
}

/** Drop rows for things the store no longer has. */
async function deleteMissing(
  client: Client,
  ownerId: string,
  chunks: Chunk[]
): Promise<number> {
  if (chunks.length === 0) {
    const { rowCount } = await client.query("DELETE FROM embeddings WHERE owner_id = $1", [
      ownerId,
    ]);
    return rowCount;
  }

  const params: unknown[] = [ownerId];
  const pairs = chunks
    .map((c) => {
      params.push(c.kind, c.itemId);
      return `($${params.length - 1}, $${params.length})`;
    })
    .join(", ");

  const { rowCount } = await client.query(
    `DELETE FROM embeddings
      WHERE owner_id = $1 AND (kind, item_id) NOT IN (${pairs})`,
    params
  );
  return rowCount;
}

/** A row still waiting for a vector, with the text to embed. */
export type PendingRow = { kind: string; itemId: string; content: string };

/**
 * Rows whose vector is missing or was produced by a different model.
 *
 * Folding the model check in here is what makes switching models free: the
 * column records what embedded each row, so a new `EMBEDDING_MODEL` makes every
 * row pending without a migration, a flag, or anything to remember to run.
 * Mixing vectors from two models in one index would be worse than having none —
 * their coordinates mean different things, so the distances would be noise.
 */
export async function listPending(
  pool: Pool,
  ownerId: string,
  modelName: string,
  limit: number
): Promise<PendingRow[]> {
  const { rows } = await pool.query<{ kind: string; item_id: string; content: string }>(
    `SELECT kind, item_id, content
       FROM embeddings
      WHERE owner_id = $1
        AND (embedding IS NULL OR model IS DISTINCT FROM $2)
      ORDER BY kind, item_id
      LIMIT $3`,
    [ownerId, modelName, limit]
  );
  return rows.map((r) => ({ kind: r.kind, itemId: r.item_id, content: r.content }));
}

/**
 * Store the vectors for rows this owner still has.
 *
 * Guarded on `content_hash`: between reading a pending row and getting its
 * vector back from the provider the user may well have edited that step, and the
 * row's text — the thing the vector describes — would already have moved on.
 * Writing anyway would leave the index confidently pointing at the wrong text,
 * which is a worse failure than the gap the next pass closes.
 */
export async function saveVectors(
  pool: Pool,
  ownerId: string,
  modelName: string,
  vectors: { kind: string; itemId: string; content: string; embedding: number[] }[]
): Promise<number> {
  let saved = 0;
  for (const batch of chunked(vectors, ROWS_PER_STATEMENT)) {
    const params: unknown[] = [ownerId, modelName];
    const values = batch
      .map((v) => {
        params.push(v.kind, v.itemId, chunkHash(v.content), `[${v.embedding.join(",")}]`);
        const n = params.length;
        return `($${n - 3}, $${n - 2}, $${n - 1}, $${n}::vector)`;
      })
      .join(", ");

    const { rows } = await pool.query<{ id: string }>(
      `UPDATE embeddings AS e
          SET embedding = v.embedding, model = $2
         FROM (VALUES ${values}) AS v(kind, item_id, content_hash, embedding)
        WHERE e.owner_id = $1
          AND e.kind = v.kind
          AND e.item_id = v.item_id
          AND e.content_hash = v.content_hash
        RETURNING e.item_id AS id`,
      params
    );
    saved += rows.length;
  }
  return saved;
}

/** Upsert one batch; returns how many rows were actually written. */
async function upsertBatch(client: Client, ownerId: string, batch: Chunk[]): Promise<number> {
  const now = Date.now();
  const params: unknown[] = [ownerId, now];
  const values = batch
    .map((c) => {
      params.push(c.kind, c.itemId, c.goalId, c.titleText, c.bodyText, c.content, chunkHash(c.content));
      const n = params.length;
      return `($1, $${n - 6}, $${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n}, $2)`;
    })
    .join(", ");

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO embeddings
       (owner_id, kind, item_id, goal_id, title_text, body_text, content, content_hash, updated_at)
     VALUES ${values}
     ON CONFLICT (owner_id, kind, item_id) DO UPDATE SET
       goal_id      = EXCLUDED.goal_id,
       title_text   = EXCLUDED.title_text,
       body_text    = EXCLUDED.body_text,
       content      = EXCLUDED.content,
       content_hash = EXCLUDED.content_hash,
       updated_at   = EXCLUDED.updated_at,
       embedding    = NULL,
       model        = NULL
     WHERE embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash
     RETURNING item_id AS id`,
    params
  );
  return rows.length;
}
