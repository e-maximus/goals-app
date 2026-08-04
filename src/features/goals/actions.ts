"use server";

import { currentUserForAction } from "@/server/current-user";
import * as repo from "@/server/repo";
import { scheduleReindex } from "@/server/embeddings/schedule";
import type { SaveResult, ServerState } from "@/lib/types";
import { saveInputSchema } from "./schemas";

/**
 * The whole read/write surface between the client store and the server. There
 * used to be a REST route (`GET /api/goals`) beside these for reading; two
 * transports for one store meant two sets of error handling and two places to
 * keep the owner scoping right, so reading is an action now too.
 *
 * The initial render doesn't come through here at all — the `(app)` layout
 * loads the store server-side (see ./load.ts). {@link loadState} is the
 * *re*-load: the conflict path, and the reload after the AI chat's agent edited
 * the goals behind the client's back.
 */

/** Re-read the current user's whole store. */
export async function loadState(): Promise<ServerState> {
  const { pool, user } = await currentUserForAction();
  return repo.getState(pool, user.id);
}

/**
 * Persist the whole store (the web app's coarse write path). Returns a
 * discriminated result rather than throwing on conflict: a thrown error loses
 * its type across the Server Action boundary, so the stale-write case ({ ok:
 * false }) is data the client can act on — it reloads and retries.
 */
export async function saveState(input: unknown): Promise<SaveResult> {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid goals payload");

  // No casts: the schemas are asserted to match the domain types (./schemas.ts),
  // so a validated payload *is* a Goal[] / Task[].
  const { goals, tasks, baseUpdatedAt, dayPlannedOn } = parsed.data;
  const { pool, user } = await currentUserForAction();
  try {
    const state = await repo.replaceAll(
      pool,
      user.id,
      goals,
      baseUpdatedAt ?? null,
      tasks,
      dayPlannedOn
    );
    // The web app's write path, so this is where most reindexing is triggered
    // from. It runs after the action has answered — the user is waiting on the
    // save, not on the index.
    scheduleReindex(pool, user);
    return { ok: true, state };
  } catch (err) {
    if (err instanceof repo.ConflictError) {
      return { ok: false, serverUpdatedAt: err.serverUpdatedAt };
    }
    throw err;
  }
}
