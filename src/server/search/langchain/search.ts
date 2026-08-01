import "server-only";
import type { Pool } from "../../db";
import * as repo from "../../repo";
import type { SearchHit } from "../../domain";
import { embedder } from "../../embeddings/model";
import { ARM_LIMIT } from "../arms";
import { buildIndex, promoteGoals } from "../hydrate";
import { buildRetrievers } from "./retrievers";
import { fuseWithEnsemble } from "./fusion";
import type { SearchOptions } from "../search";

/**
 * Search, assembled from LangChain parts.
 *
 * Same contract as [search.ts](../search.ts) — same options, same `SearchHit[]`
 * — so the two can be run against the same cases and compared. What differs is
 * only the middle: the arms are retrievers and the fusion is an
 * `EnsembleRetriever` ([fusion.ts](./fusion.ts)).
 *
 * What does *not* differ, deliberately: hydration and goal promotion
 * ([hydrate.ts](../hydrate.ts)) are shared. They are domain rules about this
 * app's data, not retrieval, and duplicating them would make the comparison
 * measure the wrong thing.
 */

const DEFAULT_LIMIT = 8;

export async function searchViaLangchain(
  pool: Pool,
  ownerId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const embed = options.embed === undefined ? embedder() : options.embed;

  const built = buildRetrievers(pool, ownerId, embed, ARM_LIMIT);
  const fused = await fuseWithEnsemble(built, trimmed);
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
