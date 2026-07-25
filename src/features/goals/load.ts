import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { currentUserReadonly } from "@/server/current-user";
import * as repo from "@/server/repo";
import { log } from "@/server/log";
import type { ServerState } from "@/lib/types";

/**
 * Load the current user's whole store on the server, for an RSC initial render
 * (the `(app)` layout awaits this and hands it to the store). This is where the
 * goals are fetched — server-side, at request time — instead of a client
 * round-trip.
 *
 * `cache()` scopes the result to the request, so the layout and the goal page's
 * `generateMetadata` share one query instead of each running their own.
 *
 * Read-only by necessity: a Server Component can't set the session cookie, so
 * nothing here mints or links an account — the proxy already settled that
 * before this render began (see server/bootstrap.ts). Null means the store
 * couldn't be loaded (no session on this request, or the database was
 * unreachable), and the client falls back to its own load, which surfaces a
 * retry rather than an error page.
 */
export const loadInitialState = cache(async (): Promise<ServerState | null> => {
  try {
    const current = await currentUserReadonly();
    if (!current) return null;
    return await repo.getState(current.pool, current.user.id);
  } catch (err) {
    // Next signals things like "this route can't be static" by throwing; those
    // are control flow, not failures, and must not be swallowed here.
    unstable_rethrow(err);
    log.error("initial_state_load_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});
