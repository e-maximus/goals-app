"use client";

import { useState } from "react";

export type GoalView = "list" | "timeline";

const keyFor = (goalId: string) => `goals-app:view:${goalId}`;

/** The stored preference for a goal, defaulting to the list. */
function readStored(goalId: string): GoalView {
  // On the server there is no storage; the view isn't rendered until the
  // client-side store load resolves anyway, so "list" never reaches the DOM.
  if (typeof window === "undefined") return "list";
  try {
    return window.localStorage.getItem(keyFor(goalId)) === "timeline" ? "timeline" : "list";
  } catch {
    // Storage unavailable (private mode, blocked) — stay on the default.
    return "list";
  }
}

/**
 * Per-goal detail view preference: the default list of groups, or the stepper
 * timeline. This is a device-level *view* preference, not domain data — it
 * lives in localStorage rather than on the Goal, so flipping it never triggers
 * a save, never bumps the goal's activity, and never syncs across devices with
 * different screens. State is keyed by goal id so navigating to another goal
 * re-reads that goal's stored choice.
 */
export function useGoalView(goalId: string): [GoalView, (view: GoalView) => void] {
  const [chosen, setChosen] = useState<{ goalId: string; view: GoalView } | null>(null);
  const view = chosen?.goalId === goalId ? chosen.view : readStored(goalId);

  const set = (next: GoalView) => {
    setChosen({ goalId, view: next });
    try {
      window.localStorage.setItem(keyFor(goalId), next);
    } catch {
      // Best effort — the toggle still works for this visit.
    }
  };

  return [view, set];
}
