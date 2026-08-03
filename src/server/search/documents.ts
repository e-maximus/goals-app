import "server-only";
import type { DocumentInterface } from "@langchain/core/documents";
import type { SearchArm } from "../domain";

/**
 * What a retrieved document *is* in this search, and why it is not text.
 *
 * `EnsembleRetriever` keys its rank fusion on `pageContent`: that string is a
 * document's identity as far as the fusion is concerned. Two documents sharing
 * one are the same document to it. So `pageContent` carries `kind:id` here —
 * an empty string would collapse every result into a single key, and the item's
 * own text would merge two rows that happen to share wording.
 *
 * Carrying the real text instead was the other option and is worse: search
 * hydrates its winners from the live tables ([hydrate.ts](./hydrate.ts)) because
 * the index is derived data that a failed reindex can leave briefly stale. A
 * second, staler copy of the text riding along would only invite someone to
 * render it.
 */

/** The identity of an indexed row, and the fusion key. */
export function docKey(kind: string, itemId: string): string {
  return `${kind}:${itemId}`;
}

export function parseDocKey(key: string): { kind: string; itemId: string } {
  const separator = key.indexOf(":");
  return { kind: key.slice(0, separator), itemId: key.slice(separator + 1) };
}

/** Which arm produced a document. Set by each retriever, read by the fusion. */
export function armOf(document: DocumentInterface): SearchArm | undefined {
  const arm = document.metadata?.arm;
  return typeof arm === "string" ? (arm as SearchArm) : undefined;
}
