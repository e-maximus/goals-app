"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Goal } from "./types";
import { seedGoals } from "./seed";

const STORAGE_KEY = "goals-app:v1";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

type StoreValue = {
  goals: Goal[];
  hydrated: boolean;
  getGoal: (id: string) => Goal | undefined;
  addGoal: (title: string, why?: string) => Goal;
  addGroup: (goalId: string, title: string) => void;
  addStep: (goalId: string, groupId: string, text: string) => void;
  toggleStep: (goalId: string, groupId: string, stepId: string) => void;
  deleteGoal: (goalId: string) => void;
  deleteGroup: (goalId: string, groupId: string) => void;
  deleteStep: (goalId: string, groupId: string, stepId: string) => void;
  importGoal: (json: string) => Goal | null;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount. This intentionally sets state in an effect:
  // hydrating from a client-only store after mount is the sanctioned use of an
  // effect (syncing React with an external system). A lazy useState initializer
  // can't be used here — localStorage is unavailable during static prerender, so
  // initializing from it would desync server and client and break hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setGoals(JSON.parse(raw) as Goal[]);
      } else {
        setGoals(seedGoals());
      }
    } catch {
      setGoals(seedGoals());
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist on change (after hydration so we don't clobber storage with []).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
    } catch {
      /* ignore quota errors */
    }
  }, [goals, hydrated]);

  const getGoal = useCallback(
    (id: string) => goals.find((g) => g.id === id),
    [goals]
  );

  const addGoal = useCallback((title: string, why?: string) => {
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      why: why?.trim() || undefined,
      groups: [],
      createdAt: Date.now(),
    };
    setGoals((prev) => [goal, ...prev]);
    return goal;
  }, []);

  const addGroup = useCallback((goalId: string, title: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, groups: [...g.groups, { id: uid(), title: title.trim(), steps: [] }] }
          : g
      )
    );
  }, []);

  const addStep = useCallback((goalId: string, groupId: string, text: string) => {
    setGoals((prev) =>
      prev.map((g) =>
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
      )
    );
  }, []);

  const toggleStep = useCallback((goalId: string, groupId: string, stepId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              groups: g.groups.map((gr) =>
                gr.id === groupId
                  ? {
                      ...gr,
                      steps: gr.steps.map((s) =>
                        s.id === stepId ? { ...s, done: !s.done } : s
                      ),
                    }
                  : gr
              ),
            }
          : g
      )
    );
  }, []);

  const deleteGoal = useCallback((goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
  }, []);

  const deleteGroup = useCallback((goalId: string, groupId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, groups: g.groups.filter((gr) => gr.id !== groupId) } : g
      )
    );
  }, []);

  const deleteStep = useCallback((goalId: string, groupId: string, stepId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              groups: g.groups.map((gr) =>
                gr.id === groupId
                  ? { ...gr, steps: gr.steps.filter((s) => s.id !== stepId) }
                  : gr
              ),
            }
          : g
      )
    );
  }, []);

  const importGoal = useCallback((json: string): Goal | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;

    if (typeof obj.title !== "string" || obj.title.trim() === "") return null;
    if (!Array.isArray(obj.groups)) return null;

    // Validate each group and its steps, building fresh IDs.
    for (const g of obj.groups) {
      if (typeof g !== "object" || g === null) return null;
      const group = g as Record<string, unknown>;
      if (typeof group.title !== "string") return null;
      if (!Array.isArray(group.steps)) return null;

      for (const s of group.steps) {
        if (typeof s !== "object" || s === null) return null;
        const step = s as Record<string, unknown>;
        if (typeof step.text !== "string") return null;
        if (typeof step.done !== "boolean") return null;
      }
    }

    // Build the new goal with fresh IDs.
    const newGoal: Goal = {
      id: uid(),
      title: (obj.title as string).trim(),
      why:
        typeof obj.why === "string" && obj.why.trim()
          ? (obj.why as string).trim()
          : undefined,
      groups: obj.groups.map((g: unknown) => {
        const group = g as Record<string, unknown>;
        return {
          id: uid(),
          title: group.title as string,
          steps: (group.steps as unknown[]).map((s: unknown) => {
            const step = s as Record<string, unknown>;
            return {
              id: uid(),
              text: step.text as string,
              done: step.done as boolean,
            };
          }),
        };
      }),
      createdAt: Date.now(),
    };

    setGoals((prev) => [newGoal, ...prev]);
    return newGoal;
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      goals,
      hydrated,
      getGoal,
      addGoal,
      addGroup,
      addStep,
      toggleStep,
      deleteGoal,
      deleteGroup,
      deleteStep,
      importGoal,
    }),
    [goals, hydrated, getGoal, addGoal, addGroup, addStep, toggleStep, deleteGoal, deleteGroup, deleteStep, importGoal]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
