import "server-only";
import { after } from "next/server";
import type { Pool } from "../db";
import { isSignedIn, type User } from "../users";
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
 *
 * It takes the whole {@link User} rather than an owner id so the "signed-in
 * only" rule lives here, at the single choke point every write path goes
 * through, instead of being re-remembered at each call site. An anonymous
 * account indexes nothing: search is a signed-in feature, so its index would be
 * a derived copy of that user's writing — and, with a provider configured, a
 * paid API call — that nothing ever reads. Signing in later needs no backfill:
 * the first write after linking indexes the whole store, because the index is
 * diffed by content hash rather than appended to.
 */
export function scheduleReindex(pool: Pool, user: User): void {
  if (!isSignedIn(user)) return;
  try {
    after(() => reindexQuietly(pool, user.id));
  } catch {
    // `after` throws when there is no request scope to attach to — a script, a
    // test, or any future caller that isn't a route handler. Falling through to
    // a detached run keeps the index correct there; silently skipping would make
    // search go stale with no symptom but worse results.
    void reindexQuietly(pool, user.id);
  }
}
