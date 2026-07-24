import "server-only";
import type { Arm, ArmHit } from "./arms";

/**
 * Reciprocal Rank Fusion: merge the arms' rankings by position, not by score.
 *
 * The arms' scores are not comparable and never will be — BM25 is an unbounded
 * sum over query terms, cosine similarity sits in [-1, 1], trigram similarity in
 * [0, 1]. Normalising them against each other would mean inventing an exchange
 * rate that changes with every query. Ranks avoid the question: what each arm
 * asserts is an *order*, and that is all RRF uses.
 *
 * The result is that agreement wins. A row every arm puts near the top beats one
 * that a single arm loves and the others have never heard of — which is exactly
 * the behaviour we want from a hybrid search, and the reason a typo'd query
 * still finds its row even though only one arm could see it.
 */

/**
 * The rank-smoothing constant from the original paper. It flattens the top of
 * each list, so being 1st rather than 3rd in one arm matters less than appearing
 * in several — without it a single arm's top hit could not be outvoted.
 */
const K = 60;

export type FusedHit = {
  kind: string;
  itemId: string;
  score: number;
  /** Which arms found this row. Kept for debugging and for explaining a result. */
  arms: Arm[];
};

/**
 * Fuse each arm's ranking. Arms that found nothing (or could not run — no
 * embedding provider, say) simply contribute nothing; the rest still work.
 */
export function fuse(rankings: { arm: Arm; hits: ArmHit[] }[]): FusedHit[] {
  const merged = new Map<string, FusedHit>();

  for (const { arm, hits } of rankings) {
    hits.forEach((hit, index) => {
      const key = `${hit.kind}:${hit.itemId}`;
      const existing = merged.get(key);
      const contribution = 1 / (K + index + 1);
      if (existing) {
        existing.score += contribution;
        existing.arms.push(arm);
      } else {
        merged.set(key, {
          kind: hit.kind,
          itemId: hit.itemId,
          score: contribution,
          arms: [arm],
        });
      }
    });
  }

  return [...merged.values()].sort(
    (a, b) => b.score - a.score || b.arms.length - a.arms.length
  );
}
