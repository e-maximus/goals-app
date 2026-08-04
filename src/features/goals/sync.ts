"use client";

import type { Goal, ServerState, Task } from "@/lib/types";
import { loadState, saveState } from "./actions";

/**
 * The client half of talking to the goals server — a thin wrapper over the two
 * Server Actions in ./actions.ts, giving the store a plain promise API and
 * turning the save action's discriminated result back into a typed error.
 *
 * It lives in the feature rather than in `src/lib` because it depends on the
 * feature's actions; `lib` sits *below* features and must not reach up into
 * them. The types it moves are shared, and live in src/lib/types.ts.
 */

/** The server moved on since the state we based this write on. */
export class SyncConflictError extends Error {
  constructor(readonly serverUpdatedAt: number) {
    super("The goals changed on the server since this page loaded");
    this.name = "SyncConflictError";
  }
}

export function fetchState(): Promise<ServerState> {
  return loadState();
}

export async function pushState(
  goals: Goal[],
  tasks: Task[],
  baseUpdatedAt: number | null,
  dayPlannedOn: number | undefined
): Promise<ServerState> {
  const result = await saveState({ goals, tasks, baseUpdatedAt, dayPlannedOn });
  if (!result.ok) throw new SyncConflictError(result.serverUpdatedAt);
  return result.state;
}
