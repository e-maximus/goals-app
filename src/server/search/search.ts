import "server-only";
import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { Pool } from "../db";
import * as repo from "../repo";
import { embedder, type Embedder } from "../embeddings/model";
import { buildRetrievers } from "./retrievers";
import { fuseArms } from "./fusion";
import { buildIndex, promoteGoals } from "./hydrate";
import { ListwiseReranker, rerankHits } from "./rerank";
import { chatModel } from "../langchain/model";
import type { SearchHit, SearchKind } from "../domain";
import { log } from "../log";

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
 *
 * ## Two callers, two budgets
 *
 * The ⌘K palette searches as the user types and has a latency budget in the tens
 * of milliseconds; the agent searches once, inside a turn the user already
 * expects to take seconds. So the model-in-the-loop steps — reranking
 * ([rerank.ts](./rerank.ts)) — are **off by default** and switched on by the
 * `search_goals` tool. Same index, same arms, same fusion; the agent just pays
 * for a better ordering.
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
  /**
   * Reorder the candidates with the chat model before returning them. Costs a
   * model call, so it is for the agent rather than the palette. Pass a compressor
   * to use a specific one; `true` builds the configured model's.
   */
  rerank?: boolean | BaseDocumentCompressor;
};

const DEFAULT_LIMIT = 8;

/**
 * How many hydrated hits the reranker may reorder.
 *
 * Wider than the limit on purpose: reranking is only useful if it can promote
 * something the fusion put below the cut, and pointless if it only reorders what
 * was going to be returned anyway.
 */
const RERANK_POOL = 20;

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

  const reranked = await maybeRerank(trimmed, hits, options.rerank);

  // Promotion runs last and gets the final word. It is not a relevance rule —
  // it is about where a result navigates to, and a step has no page of its own —
  // so a reranker reordering by relevance must not undo it.
  return promoteGoals(reranked).slice(0, limit);
}

async function maybeRerank(
  query: string,
  hits: SearchHit[],
  rerank: SearchOptions["rerank"]
): Promise<SearchHit[]> {
  if (!rerank || hits.length <= 1) return hits;

  let reranker: BaseDocumentCompressor;
  if (rerank === true) {
    try {
      reranker = new ListwiseReranker(chatModel());
    } catch (err) {
      // No model configured is a normal state for a self-hosted instance, and
      // the fused ordering is a perfectly good answer without one.
      log.error("search_rerank_unavailable", {
        error: err instanceof Error ? err.message : String(err),
      });
      return hits;
    }
  } else {
    reranker = rerank;
  }

  const pool = hits.slice(0, RERANK_POOL);
  const ordered = await rerankHits(reranker, query, pool);
  return [...ordered, ...hits.slice(RERANK_POOL)];
}
