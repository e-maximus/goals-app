export type Step = {
  id: string;
  text: string;
  // A step's title is `text`; `description` is an optional longer note beneath
  // it. Optional so steps written before descriptions existed still parse — read
  // it as `step.description ?? ""` in inputs and guard rendering on its presence.
  description?: string;
  done: boolean;
};

export type Group = {
  id: string;
  title: string;
  steps: Step[];
};

export type Note = {
  id: string;
  text: string;
  createdAt: number;
  // Optionally ties the note to one step (a "sub-goal") within the same goal.
  // Optional so notes written before this, or notes about the goal as a whole,
  // still parse. Cleared to undefined if the step it pointed at is deleted.
  stepId?: string;
};

export type Goal = {
  id: string;
  title: string;
  why?: string;
  groups: Group[];
  createdAt: number;
  // Optional so payloads written before notes existed still parse. Read it
  // as `goal.notes ?? []` everywhere rather than bumping the storage key.
  notes?: Note[];
};

// ---- derived progress helpers ----

export function groupProgress(group: Group): { done: number; total: number; pct: number | null } {
  const total = group.steps.length;
  const done = group.steps.filter((s) => s.done).length;
  return { done, total, pct: total === 0 ? null : Math.round((done / total) * 100) };
}

export function goalStepCounts(goal: Goal): { done: number; total: number } {
  return goal.groups.reduce(
    (acc, g) => {
      acc.total += g.steps.length;
      acc.done += g.steps.filter((s) => s.done).length;
      return acc;
    },
    { done: 0, total: 0 }
  );
}

export function goalProgress(goal: Goal): number {
  const { done, total } = goalStepCounts(goal);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function isGoalComplete(goal: Goal): boolean {
  const { total } = goalStepCounts(goal);
  return total > 0 && goalProgress(goal) === 100;
}

export function noteCount(goal: Goal): number {
  return goal.notes?.length ?? 0;
}
