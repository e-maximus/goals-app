import "server-only";
import type { Pool } from "../db";
import * as repo from "../repo";
import { buildChunks } from "./chunks";
import { embedder, type Embedder } from "./model";
import { listPending, saveVectors, syncChunks } from "./repo";
import { log } from "../log";

/**
 * Bringing one user's search index up to date.
 *
 * Two passes, deliberately separate. The first writes the text — cheap, local,
 * and all three retrieval arms except the semantic one need nothing more. The
 * second fills in the vectors that pass left null, which is the only part that
 * touches the network and the only part that can fail. Splitting them means a
 * provider outage costs the semantic arm and nothing else; the index still
 * describes the right things, it just describes them without coordinates.
 *
 * Reindexing is idempotent and diffed by content hash, so calling it after every
 * write is cheap: the usual outcome is "nothing changed", one query, no network.
 */

/** Vectors filled per run. A whole store is a few hundred rows, so this is a ceiling, not a page size. */
const MAX_VECTORS_PER_RUN = 500;

export type ReindexResult = {
  chunks: number;
  inserted: number;
  updated: number;
  deleted: number;
  /** Vectors written this run. Zero when nothing was pending, or no provider. */
  embedded: number;
  /** True when there is no embedding provider — text indexed, vectors skipped. */
  textOnly: boolean;
};

/**
 * Rebuild `ownerId`'s index from their current store.
 *
 * `embed` is injectable so tests can supply a deterministic stand-in: embedding
 * over the network in CI would be slow and flaky, and would make a paid key a
 * prerequisite for running the suite.
 */
export async function reindexOwner(
  pool: Pool,
  ownerId: string,
  embed: Embedder | null = embedder()
): Promise<ReindexResult> {
  const state = await repo.getState(pool, ownerId);
  const chunks = buildChunks(state);
  const sync = await syncChunks(pool, ownerId, chunks);

  if (!embed) {
    return { chunks: chunks.length, ...sync, embedded: 0, textOnly: true };
  }

  const pending = await listPending(pool, ownerId, embed.modelName, MAX_VECTORS_PER_RUN);
  if (pending.length === 0) {
    return { chunks: chunks.length, ...sync, embedded: 0, textOnly: false };
  }

  const vectors = await embed.embed(pending.map((p) => p.content));
  const embedded = await saveVectors(
    pool,
    ownerId,
    embed.modelName,
    pending.map((p, i) => ({ ...p, embedding: vectors[i]! }))
  );

  return { chunks: chunks.length, ...sync, embedded, textOnly: false };
}

/**
 * Reindex without making the caller wait or care.
 *
 * Every write path calls this, so it must never turn a successful save into a
 * failed one: the index is derived data, and a stale index is a worse search
 * result, not lost work. Failures are logged and swallowed — the next write
 * reindexes anyway, and the backfill script (`npm run reindex`) is the manual
 * way back if writes stop coming.
 *
 * Callers in a request context should hand this to `after()` so it runs once the
 * response is already on its way.
 */
export async function reindexQuietly(pool: Pool, ownerId: string): Promise<void> {
  try {
    await reindexOwner(pool, ownerId);
  } catch (err) {
    log.error("reindex_failed", {
      userId: ownerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
