import "server-only";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import type { SearchArm } from "../domain";
import type { FusedHit } from "./fusion";
import { docKey } from "./documents";
import { log } from "../log";

/**
 * Asking the same question several ways.
 *
 * One phrasing reaches only the rows that share its words or its meaning. "What
 * was I planning about the move?" and "переезд" retrieve different things from
 * the same corpus, and the user typed only one of them. Expansion writes the
 * others and fuses what each finds.
 *
 * ## Why not `MultiQueryRetriever`
 *
 * It is the obvious fit and it does not survive contact with this search. It
 * merges its variants with `_uniqueUnion` — a deduplicated *set*, in no
 * particular order — and ranking is the whole value here; a union of three
 * variants' top-30 is ninety rows in arbitrary order. It also invokes its inner
 * retriever once per variant, which would give the ensemble's own runs a parent
 * and so break how [fusion.ts](./fusion.ts) tells an arm's run from the
 * ensemble's, silently losing arm provenance.
 *
 * So the variants are generated here and the *fused rankings* are fused again by
 * the same rank formula. A row that several phrasings agree on rises, which is
 * the same argument RRF makes about arms, one level up.
 *
 * ## Cost
 *
 * A model call before any SQL runs, on top of the reranker's call after it. That
 * is two round trips per search, which is why this is for the agent and never
 * for the palette.
 */

/** How many alternative phrasings to ask for. */
const VARIANTS = 3;

/** The rank-smoothing constant, matching the arm fusion's. */
const RRF_C = 60;

const variantsSchema = z.object({
  queries: z
    .array(z.string())
    .describe("Alternative phrasings of the search query, in the same language as the original"),
});

const SYSTEM = [
  "You rewrite search queries for a personal goal-tracking app holding goals, steps, notes and tasks.",
  `Given one query, write up to ${VARIANTS} alternative phrasings that would retrieve the same thing.`,
  "Vary the wording and the level of detail: a synonym, a noun form, a fuller sentence.",
  "Stay in the language of the original query. Do not answer the query or add new topics.",
].join(" ");

/**
 * The original query plus its rewrites. The original always comes first and is
 * never dropped: it is the only phrasing the user actually chose.
 */
export async function expandQuery(model: BaseChatModel, query: string): Promise<string[]> {
  try {
    const answer = await model
      .withStructuredOutput(variantsSchema)
      .invoke([
        { role: "system", content: SYSTEM },
        { role: "user", content: query },
      ]);

    const seen = new Set([query.toLowerCase()]);
    const variants: string[] = [];
    for (const candidate of answer.queries) {
      const trimmed = candidate.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      variants.push(trimmed);
      if (variants.length === VARIANTS) break;
    }
    return [query, ...variants];
  } catch (err) {
    // Expansion is an improvement, not a prerequisite. Without it the search is
    // exactly the one the palette runs.
    log.error("search_expand_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [query];
  }
}

/**
 * Fuse the per-variant rankings into one.
 *
 * Same formula as the arm fusion — `1 / (rank + c)`, summed — because it is the
 * same argument: the variants' scores are not comparable (each is a fusion over
 * a different query), but their orderings are. Variants are weighted equally;
 * the original is not privileged, because a rewrite that retrieves better is
 * exactly what this is for.
 *
 * A row's arms are the union of the arms that found it under any phrasing, so
 * `promoteGoals` and the client still see how it was matched.
 */
export function fuseVariants(rankings: FusedHit[][]): FusedHit[] {
  const merged = new Map<string, FusedHit>();

  for (const ranking of rankings) {
    ranking.forEach((hit, rank) => {
      const key = docKey(hit.kind, hit.itemId);
      const existing = merged.get(key);
      const contribution = 1 / (rank + 1 + RRF_C);
      if (existing) {
        existing.score += contribution;
        for (const arm of hit.arms) {
          if (!existing.arms.includes(arm)) existing.arms.push(arm);
        }
      } else {
        merged.set(key, { ...hit, score: contribution, arms: [...hit.arms] });
      }
    });
  }

  // Arms are reported in a fixed order rather than first-seen: they reach the
  // client, and which variant happened to find a row first is noise.
  const order: SearchArm[] = ["keyword", "trigram", "vector"];
  for (const hit of merged.values()) {
    hit.arms.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  return [...merged.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.arms.length - a.arms.length ||
      docKey(a.kind, a.itemId).localeCompare(docKey(b.kind, b.itemId))
  );
}
