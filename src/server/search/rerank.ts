import "server-only";
import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { Document, type DocumentInterface } from "@langchain/core/documents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import type { SearchHit } from "../domain";
import { docKey } from "./documents";
import { log } from "../log";

/**
 * Reranking the fused candidates with the chat model.
 *
 * Fusion decides on *agreement between arms*, which is a good prior and a blunt
 * one: it knows that three arms found a row, and nothing about whether the row
 * answers the question. A reranker reads the candidates against the query and
 * says which actually do. That is the one retrieval step a language model is
 * plainly better at than SQL, and it is why the arms are behind a framework
 * interface at all — the whole reordering slots in without a caller changing.
 *
 * ## Listwise, not pointwise
 *
 * The model sees all candidates at once and returns an order, rather than
 * scoring each in its own call. One request instead of thirty, and the
 * comparison it is being asked to make — "which of these is most relevant" — is
 * the comparison it actually performs. Pointwise scores from separate calls are
 * not calibrated against each other and would need a second pass to combine.
 *
 * ## Where its text comes from
 *
 * A retrieved document here carries `kind:id`, not text — the fusion keys on
 * `pageContent` and real text there would merge two rows that share wording
 * ([documents.ts](./documents.ts)). So the reranker runs *after* hydration and
 * reads the live title and detail, which is also the fresher copy: the index can
 * be briefly stale after a failed reindex, and reranking on stale text would
 * reorder by something the user can no longer see.
 *
 * That is why this is a `BaseDocumentCompressor` used directly rather than a
 * `ContextualCompressionRetriever` wrapped around the ensemble: the text it
 * needs does not exist at the retriever layer, by design. The compressor
 * interface is still the right one — it is a query plus documents in, a shorter
 * and better-ordered list out — and being a Runnable means the rerank shows up
 * as its own span in a trace next to the arms.
 *
 * ## What it must never do
 *
 * Invent, drop, or merge results. The model returns *positions*, never content,
 * and anything it fails to mention keeps its fused order behind the rows it did
 * rank. A model that returns nonsense costs the reordering, not the search.
 */

/** How many fused candidates go to the model. Beyond this the prompt is mostly noise. */
const RERANK_CANDIDATES = 20;

/** One line per candidate: the model answers with these indexes, in order. */
const rankingSchema = z.object({
  ranking: z
    .array(z.number().int())
    .describe("Candidate indexes, most relevant first. Omit the irrelevant ones."),
});

const SYSTEM = [
  "You rank search results for a personal goal-tracking app.",
  "You are given a user's query and numbered candidates — goals, steps, notes and tasks.",
  "Return the indexes of the candidates that genuinely answer the query, most relevant first.",
  "Omit candidates that do not answer it. Never invent an index.",
  "Prefer the item that is specifically about the query over the one that merely mentions it.",
].join(" ");

export class ListwiseReranker extends BaseDocumentCompressor {
  constructor(private readonly model: BaseChatModel) {
    super();
  }

  async compressDocuments(
    documents: DocumentInterface[],
    query: string
  ): Promise<DocumentInterface[]> {
    if (documents.length <= 1) return documents;

    const candidates = documents.slice(0, RERANK_CANDIDATES);
    const listing = candidates
      .map((document, index) => `${index}. ${document.pageContent}`)
      .join("\n");

    let ranking: number[];
    try {
      const answer = await this.model
        .withStructuredOutput(rankingSchema)
        .invoke([
          { role: "system", content: SYSTEM },
          { role: "user", content: `Query: ${query}\n\nCandidates:\n${listing}` },
        ]);
      ranking = answer.ranking;
    } catch (err) {
      // The arms have already answered by now. An outage costs the reordering.
      log.error("search_rerank_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return documents;
    }

    const seen = new Set<number>();
    const ranked: DocumentInterface[] = [];
    for (const index of ranking) {
      // Guarding the model's arithmetic, not its judgement: an out-of-range or
      // repeated index would otherwise duplicate or drop a real result.
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length) continue;
      if (seen.has(index)) continue;
      seen.add(index);
      ranked.push(candidates[index]!);
    }

    // Everything the model did not mention keeps its fused order, behind what it
    // did. Dropping them outright would make one bad completion lose results
    // that three arms agreed on.
    const rest = documents.filter((_, index) => index >= candidates.length || !seen.has(index));
    return [...ranked, ...rest];
  }
}

/**
 * Rerank hydrated hits, and put them back in hit order.
 *
 * The hits go in as documents carrying their own text so the model has something
 * to read, and come back matched by key. Scores are left alone: they are the
 * fusion's, and a reranked list is ordered by the model's judgement rather than
 * by them — overwriting them with a rank would tell the client something the
 * number does not mean.
 */
export async function rerankHits(
  reranker: BaseDocumentCompressor,
  query: string,
  hits: SearchHit[]
): Promise<SearchHit[]> {
  if (hits.length <= 1) return hits;

  const documents = hits.map(
    (hit) =>
      new Document({
        pageContent: [hit.title, hit.detail].filter(Boolean).join(" — "),
        metadata: { key: docKey(hit.kind, hit.id) },
      })
  );

  const compressed = await reranker.compressDocuments(documents, query);
  const byKey = new Map(hits.map((hit) => [docKey(hit.kind, hit.id), hit]));

  const ordered: SearchHit[] = [];
  for (const document of compressed) {
    const key = document.metadata?.key as string | undefined;
    const hit = key ? byKey.get(key) : undefined;
    if (!hit) continue;
    byKey.delete(key!);
    ordered.push(hit);
  }
  // Anything the compressor dropped entirely still belongs to the user; it goes
  // back at the end rather than vanishing.
  for (const hit of hits) {
    const key = docKey(hit.kind, hit.id);
    if (byKey.has(key)) ordered.push(hit);
  }
  return ordered;
}
