"use client";

import type { Goal, Task } from "./types";
import { saveState } from "@/features/goals/actions";

/**
 * The client half of talking to the goals server. The API is same-origin now
 * (the app and the server are one deployment), so these just hit `/api/goals`.
 */

export type ServerState = {
  /**
   * False when the server has never been written to. The server seeds the
   * example goals on first run, so in practice the app always sees an
   * initialized store — the flag is kept for the write path's conflict logic.
   */
  initialized: boolean;
  updatedAt: number;
  goals: Goal[];
  tasks: Task[];
};

/** The server moved on since the state we based this write on. */
export class SyncConflictError extends Error {
  constructor(readonly serverUpdatedAt: number) {
    super("The goals changed on the server since this page loaded");
    this.name = "SyncConflictError";
  }
}

/**
 * The result of a save Server Action. A conflict comes back as data ({ ok:
 * false }) rather than a thrown error — errors lose their type crossing the
 * Server Action boundary, so `pushState` turns this into a `SyncConflictError`
 * on the client side instead.
 */
export type SaveResult =
  | { ok: true; state: ServerState }
  | { ok: false; serverUpdatedAt: number };

export async function fetchState(): Promise<ServerState> {
  const res = await fetch("/api/goals");
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as ServerState;
}

/**
 * The current user's identity, for the Settings screen and the topbar chip.
 * `clerkUserId` is the linked Clerk identity, or null while the account is
 * purely anonymous; `displayName`/`avatar` are the generated animal identity.
 */
export type Me = {
  userId: string;
  clerkUserId: string | null;
  displayName: string | null;
  avatar: string | null;
};

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/me");
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as Me;
}

export async function pushState(
  goals: Goal[],
  tasks: Task[],
  baseUpdatedAt: number | null
): Promise<ServerState> {
  const result = await saveState({ goals, tasks, baseUpdatedAt });
  if (!result.ok) throw new SyncConflictError(result.serverUpdatedAt);
  return result.state;
}
