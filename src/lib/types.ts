export type Step = {
  id: string;
  text: string;
  done: boolean;
};

export type Group = {
  id: string;
  title: string;
  steps: Step[];
};

export type Comment = {
  id: string;
  text: string;
  createdAt: number;
};

export type Goal = {
  id: string;
  title: string;
  why?: string;
  groups: Group[];
  createdAt: number;
  // Optional so payloads written before comments existed still parse. Read it
  // as `goal.comments ?? []` everywhere rather than bumping the storage key.
  comments?: Comment[];
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

export function commentCount(goal: Goal): number {
  return goal.comments?.length ?? 0;
}
