import "server-only";
import { EnsembleRetriever } from "@langchain/classic/retrievers/ensemble";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { DocumentInterface } from "@langchain/core/documents";
import { parseDocKey, type Arm, type BuiltRetrievers } from "./retrievers";

/**
 * Fusing the arms with LangChain's `EnsembleRetriever`.
 *
 * The ensemble does the part worth reusing: it invokes the retrievers in
 * parallel and merges their rankings with weighted Reciprocal Rank Fusion,
 * `weight / (rank + c)` summed per document, with `c = 60` — the same constant
 * and the same formula the hand-written fusion used.
 *
 * Three things it does not do, which have to be put back:
 *
 * 1. **Provenance.** It returns a flat `Document[]` and never says which
 *    retriever found what, but a hit carries the arms that found it all the way
 *    to the client (`SearchHit.arms`), and `promoteGoals` decides on it. So a
 *    callback handler listens to the child retriever runs and records their
 *    rankings — the same mechanism tracing is built on.
 * 2. **Scores.** The fused score stays inside `_weightedReciprocalRank` and never
 *    reaches the output. It is recomputed here from the captured rankings, with
 *    the ensemble's own constant, so the number on the wire is the real fusion
 *    score rather than a proxy for it.
 * 3. **A total order.** Its sort compares scores and nothing else, so two rows on
 *    an identical score can swap places between otherwise identical requests and
 *    the result the user sees depends on the query plan. The comparator below
 *    restores the tie-break the hand-written fusion had.
 */

/** The ensemble's rank-smoothing constant. Matches its default, and the old `K`. */
const RRF_C = 60;

export type FusedHit = {
  kind: string;
  itemId: string;
  score: number;
  arms: Arm[];
};

/**
 * Records what each child retriever returned during one ensemble run.
 *
 * The ensemble runs its children through `runManager.getChild()`, so their runs
 * carry a parent; the ensemble's own end event does not. That is the only thing
 * separating the two here — filtering on `parentRunId` keeps the ensemble's own
 * output (the merged list) out of the per-arm tally.
 */
class ArmRankingCollector extends BaseCallbackHandler {
  name = "ArmRankingCollector";

  /** arm -> the document keys it returned, in its own order. */
  readonly rankings = new Map<Arm, string[]>();

  handleRetrieverEnd(
    documents: DocumentInterface[],
    _runId: string,
    parentRunId?: string
  ): void {
    if (!parentRunId) return;
    const arm = documents[0]?.metadata.arm as Arm | undefined;
    // An arm that found nothing has nothing to attribute, and no way to name
    // itself from an empty list. It contributes nothing to the fusion either.
    if (!arm) return;
    this.rankings.set(
      arm,
      documents.map((document) => document.pageContent)
    );
  }
}

/**
 * Run the ensemble and return the fused ranking, with provenance and scores.
 *
 * Order comes from the ensemble; this only makes it total, so a tie cannot
 * depend on the order Postgres happened to emit rows in.
 */
export async function fuseWithEnsemble(
  built: BuiltRetrievers,
  query: string
): Promise<FusedHit[]> {
  const ensemble = new EnsembleRetriever({
    retrievers: built.retrievers,
    weights: built.weights,
    c: RRF_C,
  });

  const collector = new ArmRankingCollector();
  const documents = await ensemble.invoke(query, { callbacks: [collector] });

  const armsByKey = new Map<string, Arm[]>();
  const scoreByKey = new Map<string, number>();
  // Walked in the retrievers' own order, not the order their callbacks fired:
  // the arms run in parallel, so completion order varies between requests and
  // would make `arms` — which reaches the client — differ run to run. This also
  // pairs each arm with its weight by position, the way the ensemble does.
  built.retrievers.forEach((retriever, index) => {
    const keys = collector.rankings.get(retriever.arm) ?? [];
    const weight = built.weights[index] ?? 1;
    keys.forEach((key, rank) => {
      armsByKey.set(key, [...(armsByKey.get(key) ?? []), retriever.arm]);
      scoreByKey.set(key, (scoreByKey.get(key) ?? 0) + weight / (rank + 1 + RRF_C));
    });
  });

  return documents
    .map((document) => {
      const key = document.pageContent;
      const { kind, itemId } = parseDocKey(key);
      return {
        kind,
        itemId,
        score: scoreByKey.get(key) ?? 0,
        arms: armsByKey.get(key) ?? [],
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.arms.length - a.arms.length ||
        `${a.kind}:${a.itemId}`.localeCompare(`${b.kind}:${b.itemId}`)
    );
}
