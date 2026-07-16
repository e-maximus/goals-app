"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type { Goal, GoalStatus, Step } from "./types";
import { SyncConflictError, fetchState, pushGoals } from "./sync";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * Stamp a goal as just-touched. Applied by every mutating action to the one
 * goal it changed — and only that one — so per-goal activity survives the
 * whole-store PUT (the server persists these stamps verbatim).
 */
function touched(goal: Goal): Goal {
  return { ...goal, updatedAt: Date.now() };
}

/**
 * Apply `fn` to the step list a target lives in: the goal's own ungrouped
 * steps when `groupId` is null, or the named group's steps otherwise.
 */
function withSteps(goal: Goal, groupId: string | null, fn: (steps: Step[]) => Step[]): Goal {
  if (groupId === null) return { ...goal, steps: fn(goal.steps ?? []) };
  return {
    ...goal,
    groups: goal.groups.map((gr) => (gr.id === groupId ? { ...gr, steps: fn(gr.steps) } : gr)),
  };
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

  addGoal: (title: string, why?: string, dueDate?: number) => Goal;
  updateGoal: (goalId: string, title: string, why?: string, dueDate?: number) => void;
  /** Pause or resume a goal. Pausing records when; resuming clears it. */
  setGoalStatus: (goalId: string, status: GoalStatus) => void;
  addGroup: (goalId: string, title: string, dueDate?: number) => void;
  renameGroup: (goalId: string, groupId: string, title: string, dueDate?: number) => void;
  // Step actions take `groupId: null` for a step living directly on the goal.
  addStep: (
    goalId: string,
    groupId: string | null,
    text: string,
    description?: string,
    dueDate?: number
  ) => void;
  editStep: (
    goalId: string,
    groupId: string | null,
    stepId: string,
    text: string,
    description?: string,
    dueDate?: number
  ) => void;
  toggleStep: (goalId: string, groupId: string | null, stepId: string) => void;
  deleteGoal: (goalId: string) => void;
  deleteGroup: (goalId: string, groupId: string) => void;
  deleteStep: (goalId: string, groupId: string | null, stepId: string) => void;
  addNote: (goalId: string, text: string, stepId?: string) => void;
  editNote: (goalId: string, noteId: string, text: string, stepId?: string) => void;
  deleteNote: (goalId: string, noteId: string) => void;
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
      // A goal created before this load resolved isn't on the server yet (and the
      // subscriber ignores mutations made while loading, so no push was queued for
      // it). Keep such local-only goals ahead of the server's rather than letting
      // the load clobber them, and persist them below.
      let localOnly: Goal[] = [];
      set((s) => {
        const serverIds = new Set(state.goals.map((g) => g.id));
        localOnly = s.goals.filter((g) => !serverIds.has(g.id));
        return {
          goals: [...localOnly, ...state.goals],
          serverUpdatedAt: state.updatedAt,
          loadStatus: "ready",
        };
      });
      applyingRemote = false;
      if (localOnly.length > 0) void pushToServer();
    } catch {
      set({ loadStatus: "error" });
    }
  },

  addGoal: (title, why, dueDate) => {
    const now = Date.now();
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      why: why?.trim() || undefined,
      dueDate,
      steps: [],
      groups: [],
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    set((s) => ({ goals: [goal, ...s.goals] }));
    return goal;
  },

  updateGoal: (goalId, title, why, dueDate) => {
    const next = title.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        // An empty `why` clears it (matching addGoal); an absent dueDate clears
        // the deadline — the edit dialog always submits the full picture.
        g.id === goalId ? touched({ ...g, title: next, why: why?.trim() || undefined, dueDate }) : g
      ),
    }));
  },

  setGoalStatus: (goalId, status) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              status,
              // Present only while paused; cleared on resume (see Goal.pausedAt).
              pausedAt: status === "paused" ? Date.now() : undefined,
            })
          : g
      ),
    })),

  addGroup: (goalId, title, dueDate) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              groups: [
                ...g.groups,
                { id: uid(), title: title.trim(), steps: [], ...(dueDate ? { dueDate } : {}) },
              ],
            })
          : g
      ),
    })),

  renameGroup: (goalId, groupId, title, dueDate) => {
    const next = title.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              groups: g.groups.map((gr) =>
                // The dialog always submits the full picture, so an absent
                // dueDate clears the deadline.
                gr.id === groupId ? { ...gr, title: next, dueDate } : gr
              ),
            })
          : g
      ),
    }));
  },

  addStep: (goalId, groupId, text, description, dueDate) => {
    const desc = description?.trim() || undefined;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(
              withSteps(g, groupId, (steps) => [
                ...steps,
                {
                  id: uid(),
                  text: text.trim(),
                  ...(desc ? { description: desc } : {}),
                  done: false,
                  ...(dueDate ? { dueDate } : {}),
                },
              ])
            )
          : g
      ),
    }));
  },

  editStep: (goalId, groupId, stepId, text, description, dueDate) => {
    const next = text.trim();
    if (!next) return;
    // An empty description clears it, matching addStep's treatment of the
    // field; likewise an absent dueDate clears the deadline.
    const desc = description?.trim() || undefined;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(
              withSteps(g, groupId, (steps) =>
                steps.map((step) =>
                  step.id === stepId ? { ...step, text: next, description: desc, dueDate } : step
                )
              )
            )
          : g
      ),
    }));
  },

  toggleStep: (goalId, groupId, stepId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(
              withSteps(g, groupId, (steps) =>
                steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step))
              )
            )
          : g
      ),
    })),

  deleteGoal: (goalId) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== goalId) })),

  deleteGroup: (goalId, groupId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId ? touched({ ...g, groups: g.groups.filter((gr) => gr.id !== groupId) }) : g
      ),
    })),

  deleteStep: (goalId, groupId, stepId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(withSteps(g, groupId, (steps) => steps.filter((step) => step.id !== stepId)))
          : g
      ),
    })),

  addNote: (goalId, text, stepId) => {
    const next = text.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              // Newest first, so the latest thought is the one you see.
              notes: [
                { id: uid(), text: next, createdAt: Date.now(), ...(stepId ? { stepId } : {}) },
                ...(g.notes ?? []),
              ],
            })
          : g
      ),
    }));
  },

  editNote: (goalId, noteId, text, stepId) => {
    const next = text.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              notes: (g.notes ?? []).map((n) =>
                // An empty/absent stepId unlinks the note from any step.
                n.id === noteId ? { ...n, text: next, stepId: stepId || undefined } : n
              ),
            })
          : g
      ),
    }));
  },

  deleteNote: (goalId, noteId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({ ...g, notes: (g.notes ?? []).filter((n) => n.id !== noteId) })
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
