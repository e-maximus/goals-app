import "server-only";
import type { Pool } from "../db";
import * as repo from "../repo";
import { embedder, type Embedder } from "../embeddings/model";
import type { SearchHit, SearchKind } from "../domain";
import { buildIndex, promoteGoals } from "./hydrate";
import { ARM_LIMIT, buildRetrievers } from "./langchain/retrievers";
import { fuseWithEnsemble } from "./langchain/fusion";

/**
 * Search over one user's goals, steps, notes and tasks.
 *
 * Three arms run in parallel and are fused by rank: they are LangChain
 * retrievers ([langchain/retrievers.ts](./langchain/retrievers.ts)) merged by an
 * `EnsembleRetriever` ([langchain/fusion.ts](./langchain/fusion.ts)). The
 * rankings themselves are still SQL — LangChain has nothing that computes BM25
 * against one owner's corpus — so what the framework contributes is the
 * plumbing: parallel invocation, weighted RRF, and a callback surface that makes
 * each arm's contribution observable.
 *
 * Then the winners are hydrated from the real tables rather than served out of
 * the index ([hydrate.ts](./hydrate.ts)): the index is derived data that a
 * failed reindex can leave briefly stale, and returning a row for a step that
 * has since been deleted would be worse than returning one result fewer. A hit
 * that no longer resolves is dropped.
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

  // Built per request because the owner is bound into each retriever — see the
  // note in retrievers.ts on why that is not a module-level singleton.
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
