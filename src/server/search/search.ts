import "server-only";
import type { Pool } from "../db";
import * as repo from "../repo";
import { embedder, type Embedder } from "../embeddings/model";
import { buildRetrievers } from "./retrievers";
import { fuseArms } from "./fusion";
import { buildIndex, promoteGoals } from "./hydrate";
import type { SearchHit, SearchKind } from "../domain";

/**
 * Search over one user's goals, steps, notes and tasks.
 *
 * Three arms ([retrievers.ts](./retrievers.ts)) run in parallel and are fused by
 * rank ([fusion.ts](./fusion.ts)); the winners are then hydrated from the live
 * tables ([hydrate.ts](./hydrate.ts)) rather than served out of the index.
 *
 * Everything here is built **per request** and owner-bound at construction — a
 * retriever's only input is the query string, so there is nowhere to pass an
 * owner later, and a module-scoped instance would answer every later request as
 * the first request's user.
 */

// The result shape is the wire format, declared once in src/lib/types.ts so the
// palette and this module cannot drift apart.
export type { SearchHit, SearchKind } from "../domain";
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

  const fused = await fuseArms(buildRetrievers(pool, ownerId, embed), trimmed);
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
