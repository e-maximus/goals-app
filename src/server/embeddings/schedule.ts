import "server-only";
import { after } from "next/server";
import type { Pool } from "../db";
import { reindexQuietly } from "./reindex";

/**
 * Reindex once the response is already on its way.
 *
 * The user never waits for this. Indexing costs a `getState` and, when text
 * actually changed, one call to the embedding provider — small, but it is
 * latency on a save, and the save is what the user is waiting for. `after()`
 * runs it in the same request's lifetime without holding the response.
 *
 * Nothing here throws: the index is derived data, so a failed reindex must not
 * turn a successful save into a failed one (see reindexQuietly).
 */
export function scheduleReindex(pool: Pool, ownerId: string): void {
  try {
    after(() => reindexQuietly(pool, ownerId));
  } catch {
    // `after` throws when there is no request scope to attach to — a script, a
    // test, or any future caller that isn't a route handler. Falling through to
    // a detached run keeps the index correct there; silently skipping would make
    // search go stale with no symptom but worse results.
    void reindexQuietly(pool, ownerId);
  }
}
