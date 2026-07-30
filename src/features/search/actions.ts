"use server";

import { currentUserForAction } from "@/server/current-user";
import { search } from "@/server/search/search";
import type { SearchHit } from "@/lib/types";
import { searchInputSchema } from "./schemas";

/**
 * Search the current user's goals, steps, notes and tasks.
 *
 * A Server Action rather than a route handler: the palette is a client
 * component in this app, and the app talks to its own server through actions
 * (see AGENTS.md — `src/app/api/` is for non-browser clients only). It also
 * keeps the query out of URLs and access logs, which matters here: these are
 * someone's private notes.
 *
 * The owner comes from the session, never from the caller.
 */
export async function searchGoals(input: unknown): Promise<SearchHit[]> {
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid search request");

  const { pool, user } = await currentUserForAction();
  const { query, limit, kinds } = parsed.data;
  return search(pool, user.id, query, { limit, kinds });
}
