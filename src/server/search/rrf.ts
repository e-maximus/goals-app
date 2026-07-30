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
const ARM_WEIGHT: Record<Arm, number> = {
  keyword: 1,
  vector: 1,
  trigram: 0.5,
};

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
      const contribution = ARM_WEIGHT[arm] / (K + index + 1);
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

  // The last comparison is not cosmetic: without a total order, two rows on an
  // identical score swap places between otherwise identical requests, and the
  // result the user gets depends on the query plan.
  return [...merged.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.arms.length - a.arms.length ||
      `${a.kind}:${a.itemId}`.localeCompare(`${b.kind}:${b.itemId}`)
  );
}
