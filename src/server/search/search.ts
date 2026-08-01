import "server-only";
import type { Pool } from "../db";
import * as repo from "../repo";
import { embedder, type Embedder } from "../embeddings/model";
import { keywordArm, trigramArm, vectorArm, type Arm, type ArmHit } from "./arms";
import { fuse } from "./rrf";
import { buildIndex, promoteGoals } from "./hydrate";
import type { SearchHit, SearchKind } from "../domain";
import { log } from "../log";

/**
 * Search over one user's goals, steps, notes and tasks.
 *
 * Three arms run in parallel and are fused by rank ([rrf.ts](./rrf.ts)). Then
 * the winners are hydrated from the real tables rather than served out of the
 * index: the index is derived data that a failed reindex can leave briefly
 * stale, and returning a row for a step that has since been deleted would be
 * worse than returning one result fewer. A hit that no longer resolves is
 * dropped.
 */

// The result shape is the wire format, declared once in src/lib/types.ts so the
// palette and this module cannot drift apart.
export type { SearchHit, SearchKind } from "../domain";
// Re-exported so callers and tests keep one import site for the search surface.
export { promoteGoals } from "./hydrate";

export type SearchOptions = {
  limit?: number;
  /** Restrict to some kinds. Omitted means all of them. */
  kinds?: SearchKind[];
  /** Injectable so tests need no provider; defaults to the configured one. */
  embed?: Embedder | null;
};

const DEFAULT_LIMIT = 8;

export async function search(
  pool: Pool,
  ownerId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const embed = options.embed === undefined ? embedder() : options.embed;

  const rankings: { arm: Arm; hits: ArmHit[] }[] = [];
  const [keyword, trigram, vector] = await Promise.all([
    keywordArm(pool, ownerId, trimmed),
    trigramArm(pool, ownerId, trimmed),
    semanticArm(pool, ownerId, trimmed, embed),
  ]);
  rankings.push({ arm: "keyword", hits: keyword });
  rankings.push({ arm: "trigram", hits: trigram });
  if (vector) rankings.push({ arm: "vector", hits: vector });

  const fused = fuse(rankings);
  if (fused.length === 0) return [];

  const state = await repo.getState(pool, ownerId);
  const index = buildIndex(state.goals, state.tasks);

  const hits: SearchHit[] = [];
  for (const hit of fused) {
    const item = index.get(`${hit.kind}:${hit.itemId}`);
    if (!item) continue;
    if (options.kinds && !options.kinds.includes(item.kind)) continue;
    hits.push({ ...item, score: hit.score, arms: hit.arms });
  }
  return promoteGoals(hits).slice(0, limit);
}

/**
 * The semantic arm, or null when it cannot run. A missing provider is a normal
 * state; a provider that errors is not, but it still must not take the whole
 * search down with it — the other two arms have already answered.
 */
async function semanticArm(
  pool: Pool,
  ownerId: string,
  query: string,
  embed: Embedder | null
): Promise<ArmHit[] | null> {
  if (!embed) return null;
  try {
    const [vector] = await embed.embed([query]);
    if (!vector) return null;
    return await vectorArm(pool, ownerId, vector, embed.modelName);
  } catch (err) {
    log.error("search_vector_arm_failed", {
      userId: ownerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
