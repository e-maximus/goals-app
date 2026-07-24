/**
 * The search wire format, shared by both sides of the build.
 *
 * The server produces these ([src/server/search/search.ts](../server/search/search.ts))
 * and the palette consumes them, so they live here rather than in either — the
 * same arrangement the domain types and `sync.ts` already use. The server module
 * is `server-only` and could not be imported from a client component anyway.
 */

export type SearchKind = "goal" | "step" | "note" | "task";

/** Which retrieval arm found a hit. Useful for debugging a surprising ranking. */
export type SearchArm = "keyword" | "vector" | "trigram";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  /** The item's own headline — a goal's title, a step's text, a note's text. */
  title: string;
  /** Supporting text, when the item has any: a why, a description. */
  detail?: string;
  /** The goal this sits under, with a link, or null for an unlinked task. */
  goal: { id: string; title: string; url: string } | null;
  done?: boolean;
  score: number;
  arms: SearchArm[];
};

export type SearchResponse = { hits: SearchHit[] };

/** How long to sit on keystrokes before asking the server. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Run a search. `signal` lets a newer keystroke cancel the request it replaced —
 * without it, results can arrive out of order and the older, wrong ones win.
 */
export async function fetchSearch(
  query: string,
  signal?: AbortSignal
): Promise<SearchHit[]> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const body = (await res.json()) as SearchResponse;
  return body.hits;
}
