"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type { Goal } from "./types";
import { SyncConflictError, fetchState, pushGoals } from "./sync";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * Where the goals load stands. The store no longer keeps a local copy — the
 * goals live on the server, so until the first fetch lands there is nothing to
 * show, and a failed fetch is a real error state rather than a fallback to
 * whatever was in this browser.
 */
export type LoadStatus = "loading" | "ready" | "error";

/** Whether the last change has made it to the server. Drives the header dot. */
export type SaveStatus = "saved" | "saving" | "error";

type StoreState = {
  goals: Goal[];
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  /** The server version our goals are based on — sent back to detect conflicts. */
  serverUpdatedAt: number | null;

  /** Load the goals from the server. Called once on mount; safe to call again to retry. */
  load: () => Promise<void>;

  addGoal: (title: string, why?: string) => Goal;
  updateGoal: (goalId: string, title: string, why?: string) => void;
  addGroup: (goalId: string, title: string) => void;
  renameGroup: (goalId: string, groupId: string, title: string) => void;
  addStep: (goalId: string, groupId: string, text: string) => void;
  editStep: (goalId: string, groupId: string, stepId: string, text: string) => void;
  toggleStep: (goalId: string, groupId: string, stepId: string) => void;
  deleteGoal: (goalId: string) => void;
  deleteGroup: (goalId: string, groupId: string) => void;
  deleteStep: (goalId: string, groupId: string, stepId: string) => void;
  addComment: (goalId: string, text: string) => void;
  editComment: (goalId: string, commentId: string, text: string) => void;
  deleteComment: (goalId: string, commentId: string) => void;
};

export const useStore = create<StoreState>((set) => ({
  goals: [],
  loadStatus: "loading",
  saveStatus: "saved",
  serverUpdatedAt: null,

  load: async () => {
    set({ loadStatus: "loading" });
    try {
      const state = await fetchState();
      // Applying server data — flag it so the persistence subscriber doesn't
      // immediately echo the just-loaded goals back to the server as a "save".
      applyingRemote = true;
      set({ goals: state.goals, serverUpdatedAt: state.updatedAt, loadStatus: "ready" });
      applyingRemote = false;
    } catch {
      set({ loadStatus: "error" });
    }
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

  updateGoal: (goalId, title, why) => {
    const next = title.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        // An empty `why` clears it, matching addGoal's treatment of the field.
        g.id === goalId ? { ...g, title: next, why: why?.trim() || undefined } : g
      ),
    }));
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

  editStep: (goalId, groupId, stepId, text) => {
    const next = text.trim();
    if (!next) return;
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
                        step.id === stepId ? { ...step, text: next } : step
                      ),
                    }
                  : gr
              ),
            }
          : g
      ),
    }));
  },

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
}));

// ---- persistence ----
//
// The store is optimistic: a mutation updates the goals in place, and a
// debounced push writes the whole store to the server. The server is the source
// of truth — if it moved on under us (an agent editing over MCP), the push comes
// back a conflict and we reload rather than clobber the newer copy.

const PUSH_DEBOUNCE_MS = 500;

/** Set while we're applying a server response, so the subscriber doesn't push it back. */
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

async function pushToServer(): Promise<void> {
  const { goals, serverUpdatedAt } = useStore.getState();
  useStore.setState({ saveStatus: "saving" });

  try {
    const result = await pushGoals(goals, serverUpdatedAt);
    useStore.setState({ serverUpdatedAt: result.updatedAt, saveStatus: "saved" });
  } catch (err) {
    useStore.setState({ saveStatus: "error" });

    if (err instanceof SyncConflictError) {
      toast.error("The goals changed on the server", {
        description: "Someone — or an agent — edited them elsewhere. Reloading the latest.",
      });
      // The server wins: reload and drop the local edit that raced it.
      applyingRemote = true;
      try {
        const state = await fetchState();
        useStore.setState({
          goals: state.goals,
          serverUpdatedAt: state.updatedAt,
          saveStatus: "saved",
        });
      } catch {
        useStore.setState({ saveStatus: "error" });
      } finally {
        applyingRemote = false;
      }
      return;
    }

    toast.error("Couldn't save your changes", {
      description: "We'll keep trying as you edit. Check your connection.",
    });
  }
}

// Push goal changes to the server, debounced. Runs only in the browser, only
// after the first load, and never for changes we ourselves applied from a server
// response (load or conflict reload).
if (typeof window !== "undefined") {
  useStore.subscribe((state, prev) => {
    if (state.loadStatus !== "ready") return;
    if (state.goals === prev.goals) return;
    if (applyingRemote) return;

    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void pushToServer(), PUSH_DEBOUNCE_MS);
  });
}

/**
 * Mount once (in the root layout) to load the goals after the client mounts.
 * Renders nothing. The store is global, so consumers just call `useStore`.
 *
 * The load runs on the client rather than during render because the goals come
 * from the server at request time — there is nothing to prerender into the
 * static markup, and fetching in an effect keeps server and client markup in
 * sync on first paint.
 */
export function StoreHydration() {
  useEffect(() => {
    void useStore.getState().load();
  }, []);
  return null;
}
