"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { Goal } from "./types";
import { seedGoals } from "./seed";

const STORAGE_KEY = "goals-app:v1";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

type StoreState = {
  goals: Goal[];
  hydrated: boolean;
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
};

export const useStore = create<StoreState>((set, get) => ({
  goals: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    let goals: Goal[];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      goals = raw ? (JSON.parse(raw) as Goal[]) : seedGoals();
    } catch {
      goals = seedGoals();
    }
    set({ goals, hydrated: true });
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
}));

// Persist goals to localStorage outside React, once hydrated. Runs only in the
// browser; guarded against firing before hydration so we never clobber storage
// with the initial empty array.
if (typeof window !== "undefined") {
  useStore.subscribe((state, prev) => {
    if (!state.hydrated) return;
    if (state.goals === prev.goals) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.goals));
    } catch {
      /* ignore quota errors */
    }
  });
}

/**
 * Mount once (in the root layout) to hydrate the store from localStorage after
 * the client mounts. Renders nothing. Replaces the old context Provider — the
 * store itself is global, so consumers just call `useStore`.
 */
export function StoreHydration() {
  useEffect(() => {
    useStore.getState().hydrate();
  }, []);
  return null;
}
