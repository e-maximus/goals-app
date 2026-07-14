"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type { Goal } from "./types";
import { seedGoals } from "./seed";
import {
  SyncConflictError,
  fetchState,
  normalizeApiUrl,
  pushGoals,
  readSyncSettings,
  writeSyncSettings,
} from "./sync";

const STORAGE_KEY = "goals-app:v1";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** "off" until an API address is configured; the app is fully usable in that state. */
export type SyncStatus = "off" | "syncing" | "online" | "error";

type StoreState = {
  goals: Goal[];
  hydrated: boolean;
  syncUrl: string | null;
  syncStatus: SyncStatus;
  /** The server version our local goals are based on — sent back to detect conflicts. */
  serverUpdatedAt: number | null;
  /**
   * Load goals from localStorage into the store. Client-only: localStorage is
   * unavailable during static prerender, so this must run after mount (see
   * StoreHydration) rather than in the store initializer — initializing from
   * localStorage up front would desync server and client markup and break
   * hydration. Idempotent: safe to call more than once (e.g. StrictMode).
   */
  hydrate: () => void;
  addGoal: (title: string, why?: string) => Goal;
  addGroup: (goalId: string, title: string) => void;
  renameGroup: (goalId: string, groupId: string, title: string) => void;
  addStep: (goalId: string, groupId: string, text: string) => void;
  toggleStep: (goalId: string, groupId: string, stepId: string) => void;
  deleteGoal: (goalId: string) => void;
  deleteGroup: (goalId: string, groupId: string) => void;
  deleteStep: (goalId: string, groupId: string, stepId: string) => void;
  addComment: (goalId: string, text: string) => void;
  editComment: (goalId: string, commentId: string, text: string) => void;
  deleteComment: (goalId: string, commentId: string) => void;

  /** Point the app at a goals server and adopt its state. */
  connectSync: (apiUrl: string) => Promise<void>;
  /** Go back to being a local-only app. Goals stay where they are. */
  disconnectSync: () => void;
  /** Re-read the server's goals, discarding local ones. */
  pullFromServer: () => Promise<void>;
};

export const useStore = create<StoreState>((set, get) => ({
  goals: [],
  hydrated: false,
  syncUrl: null,
  syncStatus: "off",
  serverUpdatedAt: null,

  hydrate: () => {
    if (get().hydrated) return;
    let goals: Goal[];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      goals = raw ? (JSON.parse(raw) as Goal[]) : seedGoals();
    } catch {
      goals = seedGoals();
    }
    set({ goals, hydrated: true, syncUrl: readSyncSettings()?.apiUrl ?? null });
  },

  addGoal: (title, why) => {
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      why: why?.trim() || undefined,
      groups: [],
      createdAt: Date.now(),
    };
    set((s) => ({ goals: [goal, ...s.goals] }));
    return goal;
  },

  addGroup: (goalId, title) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? { ...g, groups: [...g.groups, { id: uid(), title: title.trim(), steps: [] }] }
          : g
      ),
    })),

  renameGroup: (goalId, groupId, title) => {
    const next = title.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              groups: g.groups.map((gr) =>
                gr.id === groupId ? { ...gr, title: next } : gr
              ),
            }
          : g
      ),
    }));
  },

  addStep: (goalId, groupId, text) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              groups: g.groups.map((gr) =>
                gr.id === groupId
                  ? { ...gr, steps: [...gr.steps, { id: uid(), text: text.trim(), done: false }] }
                  : gr
              ),
            }
          : g
      ),
    })),

  toggleStep: (goalId, groupId, stepId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              groups: g.groups.map((gr) =>
                gr.id === groupId
                  ? {
                      ...gr,
                      steps: gr.steps.map((step) =>
                        step.id === stepId ? { ...step, done: !step.done } : step
                      ),
                    }
                  : gr
              ),
            }
          : g
      ),
    })),

  deleteGoal: (goalId) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== goalId) })),

  deleteGroup: (goalId, groupId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId ? { ...g, groups: g.groups.filter((gr) => gr.id !== groupId) } : g
      ),
    })),

  deleteStep: (goalId, groupId, stepId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              groups: g.groups.map((gr) =>
                gr.id === groupId
                  ? { ...gr, steps: gr.steps.filter((step) => step.id !== stepId) }
                  : gr
              ),
            }
          : g
      ),
    })),

  addComment: (goalId, text) => {
    const next = text.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              // Newest first, so the latest thought is the one you see.
              comments: [
                { id: uid(), text: next, createdAt: Date.now() },
                ...(g.comments ?? []),
              ],
            }
          : g
      ),
    }));
  },

  editComment: (goalId, commentId, text) => {
    const next = text.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              comments: (g.comments ?? []).map((c) =>
                c.id === commentId ? { ...c, text: next } : c
              ),
            }
          : g
      ),
    }));
  },

  deleteComment: (goalId, commentId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? { ...g, comments: (g.comments ?? []).filter((c) => c.id !== commentId) }
          : g
      ),
    })),

  connectSync: async (apiUrl) => {
    const url = normalizeApiUrl(apiUrl);
    writeSyncSettings({ apiUrl: url });
    set({ syncUrl: url, syncStatus: "syncing" });
    await adoptServerState(url);
  },

  disconnectSync: () => {
    writeSyncSettings(null);
    set({ syncUrl: null, syncStatus: "off", serverUpdatedAt: null });
  },

  pullFromServer: async () => {
    const url = get().syncUrl;
    if (!url) return;
    set({ syncStatus: "syncing" });
    await adoptServerState(url);
  },
}));

// ---- sync ----
//
// When no API address is configured, none of the code below does anything: the
// subscriber writes to localStorage and returns, exactly as before.

const PUSH_DEBOUNCE_MS = 500;

/** Set while we're writing server state into the store, so we don't push it straight back. */
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Reconcile with the server. A server that has never been written to gets our
 * goals; otherwise the server wins and we adopt its state — it is the shared
 * copy, and an agent may have changed it through MCP since we last looked.
 */
async function adoptServerState(apiUrl: string): Promise<void> {
  try {
    const remote = await fetchState(apiUrl);

    if (!remote.initialized) {
      const pushed = await pushGoals(apiUrl, useStore.getState().goals, null);
      useStore.setState({ serverUpdatedAt: pushed.updatedAt, syncStatus: "online" });
      toast.success("Connected", { description: "Your goals are now on the server." });
      return;
    }

    applyingRemote = true;
    useStore.setState({
      goals: remote.goals,
      serverUpdatedAt: remote.updatedAt,
      syncStatus: "online",
    });
    applyingRemote = false;

    toast.success("Connected", { description: "Loaded the goals from the server." });
  } catch {
    applyingRemote = false;
    useStore.setState({ syncStatus: "error" });
    toast.error("Couldn't reach the goals server", {
      description: "Working from this device's copy for now.",
    });
  }
}

async function pushToServer(): Promise<void> {
  const { syncUrl, goals, serverUpdatedAt } = useStore.getState();
  if (!syncUrl) return;

  try {
    const result = await pushGoals(syncUrl, goals, serverUpdatedAt);
    useStore.setState({ serverUpdatedAt: result.updatedAt, syncStatus: "online" });
  } catch (err) {
    useStore.setState({ syncStatus: "error" });

    if (err instanceof SyncConflictError) {
      toast.error("The goals changed on the server", {
        description: "Someone — or an agent — edited them elsewhere. Pull to get the latest.",
        action: {
          label: "Pull",
          onClick: () => void useStore.getState().pullFromServer(),
        },
      });
      return;
    }

    toast.error("Couldn't save to the goals server", {
      description: "Your changes are still saved on this device.",
    });
  }
}

// Persist goals to localStorage outside React, once hydrated. Runs only in the
// browser; guarded against firing before hydration so we never clobber storage
// with the initial empty array. When sync is on, this is also where a debounced
// push to the server is scheduled — localStorage stays the local cache either way.
if (typeof window !== "undefined") {
  useStore.subscribe((state, prev) => {
    if (!state.hydrated) return;
    if (state.goals === prev.goals) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.goals));
    } catch {
      /* ignore quota errors */
    }

    if (state.syncUrl && !applyingRemote) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void pushToServer(), PUSH_DEBOUNCE_MS);
    }
  });
}

/**
 * Mount once (in the root layout) to hydrate the store from localStorage after
 * the client mounts. Renders nothing. Replaces the old context Provider — the
 * store itself is global, so consumers just call `useStore`.
 *
 * If the user has configured a goals server, we reconcile with it right after
 * the local hydrate — so the page paints from the local copy immediately and
 * then catches up with whatever the server (or an agent) has.
 */
export function StoreHydration() {
  useEffect(() => {
    useStore.getState().hydrate();

    const { syncUrl } = useStore.getState();
    if (syncUrl) {
      useStore.setState({ syncStatus: "syncing" });
      void adoptServerState(syncUrl);
    }
  }, []);
  return null;
}
