"use client";

import type { Goal } from "./types";

/**
 * Optional sync against the goals server (see server/ and docker-compose.yml).
 *
 * The app stays a static export with no build-time backend: the API address is
 * something the user types into Settings, and it lives in localStorage next to
 * the goals. With no address configured — which includes the public GitHub Pages
 * deployment — none of this code runs and the app is exactly the offline,
 * localStorage-only app it has always been.
 */

const SYNC_KEY = "goals-app:sync";

export type SyncSettings = { apiUrl: string };

export type ServerState = {
  /**
   * False when the server has never been written to. On first connect the app
   * pushes its local goals up rather than pulling — adopting an empty store
   * would silently throw away whatever the user already has.
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

/** Trim the trailing slash so `${apiUrl}/api/goals` never doubles up. */
export function normalizeApiUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function readSyncSettings(): SyncSettings | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    return parsed.apiUrl ? { apiUrl: parsed.apiUrl } : null;
  } catch {
    return null;
  }
}

export function writeSyncSettings(settings: SyncSettings | null): void {
  try {
    if (settings) localStorage.setItem(SYNC_KEY, JSON.stringify(settings));
    else localStorage.removeItem(SYNC_KEY);
  } catch {
    /* ignore quota errors */
  }
}

/** Is there a server at this address, and is it ours? */
export async function checkHealth(apiUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${normalizeApiUrl(apiUrl)}/api/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; service?: string };
    return body.ok === true && body.service === "goals-app";
  } catch {
    return false;
  }
}

export async function fetchState(apiUrl: string): Promise<ServerState> {
  const res = await fetch(`${normalizeApiUrl(apiUrl)}/api/goals`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as ServerState;
}

export async function pushGoals(
  apiUrl: string,
  goals: Goal[],
  baseUpdatedAt: number | null
): Promise<ServerState> {
  const res = await fetch(`${normalizeApiUrl(apiUrl)}/api/goals`, {
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
