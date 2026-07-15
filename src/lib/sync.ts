"use client";

import type { Goal } from "./types";

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
};

/** The server moved on since the state we based this write on. */
export class SyncConflictError extends Error {
  constructor(readonly serverUpdatedAt: number) {
    super("The goals changed on the server since this page loaded");
    this.name = "SyncConflictError";
  }
}

export async function fetchState(): Promise<ServerState> {
  const res = await fetch("/api/goals");
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as ServerState;
}

/** The current user's identity, for the Settings screen. */
export type Me = { userId: string; pat: string };

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/me");
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as Me;
}

/** Reissue the MCP personal access token, returning the new one. */
export async function rotateToken(): Promise<string> {
  const res = await fetch("/api/me/rotate-token", { method: "POST" });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return ((await res.json()) as { pat: string }).pat;
}

export async function pushGoals(
  goals: Goal[],
  baseUpdatedAt: number | null
): Promise<ServerState> {
  const res = await fetch("/api/goals", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goals, baseUpdatedAt }),
  });

  if (res.status === 409) {
    const body = (await res.json()) as { serverUpdatedAt?: number };
    throw new SyncConflictError(body.serverUpdatedAt ?? 0);
  }
  if (!res.ok) throw new Error(`Server responded ${res.status}`);

  return (await res.json()) as ServerState;
}
