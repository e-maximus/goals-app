export type Step = {
  id: string;
  text: string;
  // A step's title is `text`; `description` is an optional longer note beneath
  // it. Optional so steps written before descriptions existed still parse — read
  // it as `step.description ?? ""` in inputs and guard rendering on its presence.
  description?: string;
  done: boolean;
  // Optional deadline: epoch ms of UTC midnight of the due day. Absent = none.
  dueDate?: number;
};

export type Group = {
  id: string;
  title: string;
  steps: Step[];
  // Optional deadline for the whole group (see Step.dueDate for the format).
  dueDate?: number;
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

// A goal's lifecycle status. "Completed" is not a status — it stays derived
// from the steps (see isGoalComplete); pausing is the only explicit transition.
export type GoalStatus = "active" | "paused";

export type Goal = {
  id: string;
  title: string;
  why?: string;
  groups: Group[];
  createdAt: number;
  // Optional so payloads written before notes existed still parse. Read it
  // as `goal.notes ?? []` everywhere rather than bumping the storage key.
  notes?: Note[];
  // Lifecycle status. Optional so payloads written before statuses existed
  // still parse — read it via `goalStatus(goal)`, which defaults to "active".
  status?: GoalStatus;
  // Last-activity stamp (epoch ms), bumped on every mutation that touches this
  // goal. Optional for the same reason; read it via `lastActivityAt(goal)`,
  // which falls back to `createdAt`.
  updatedAt?: number;
  // When the goal was paused (epoch ms). Present only while status is
  // "paused"; cleared on resume. Kept separate from `updatedAt` because
  // pausing itself counts as activity.
  pausedAt?: number;
  // Steps living directly on the goal, outside any group — a simple goal
  // doesn't need groups at all. Optional so payloads written before this
  // existed still parse; read it via `ungroupedSteps(goal)`.
  steps?: Step[];
  // Optional deadline for the whole goal (see Step.dueDate for the format).
  dueDate?: number;
};

/** The goal's own steps, outside any group. Renders above the groups. */
export function ungroupedSteps(goal: Goal): Step[] {
  return goal.steps ?? [];
}

// ---- derived progress helpers ----

export function groupProgress(group: Group): { done: number; total: number; pct: number | null } {
  const total = group.steps.length;
  const done = group.steps.filter((s) => s.done).length;
  return { done, total, pct: total === 0 ? null : Math.round((done / total) * 100) };
}

export function goalStepCounts(goal: Goal): { done: number; total: number } {
  const own = ungroupedSteps(goal);
  return goal.groups.reduce(
    (acc, g) => {
      acc.total += g.steps.length;
      acc.done += g.steps.filter((s) => s.done).length;
      return acc;
    },
    { done: own.filter((s) => s.done).length, total: own.length }
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

// ---- status & activity helpers ----

const DAY_MS = 24 * 60 * 60 * 1000;

/** After this many days without activity an active goal is considered stale. */
export const STALE_AFTER_DAYS = 14;

export function goalStatus(goal: Goal): GoalStatus {
  return goal.status ?? "active";
}

export function lastActivityAt(goal: Goal): number {
  return goal.updatedAt ?? goal.createdAt;
}

export function daysSinceActivity(goal: Goal, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - lastActivityAt(goal)) / DAY_MS));
}

/** An active, unfinished goal nobody has touched in STALE_AFTER_DAYS days. */
export function isGoalStale(goal: Goal, now: number = Date.now()): boolean {
  return (
    goalStatus(goal) === "active" &&
    !isGoalComplete(goal) &&
    daysSinceActivity(goal, now) >= STALE_AFTER_DAYS
  );
}

/**
 * The next actionable step: the first unchecked ungrouped step (they render
 * above the groups), else the first unchecked step of the first group that
 * still has one. Simple and deterministic — the same rule drives the home
 * card, the hybrid detail highlight, and the stepper's "current" stage.
 * `group` is null when the step lives directly on the goal.
 */
export function nextStep(goal: Goal): { group: Group | null; step: Step } | null {
  const own = ungroupedSteps(goal).find((s) => !s.done);
  if (own) return { group: null, step: own };
  for (const group of goal.groups) {
    const step = group.steps.find((s) => !s.done);
    if (step) return { group, step };
  }
  return null;
}

/**
 * How long a completed goal took, in coarse human units. The last mutation of
 * a completed goal is almost always the final step-toggle, so
 * `lastActivityAt − createdAt` is an honest "finished in ~X". (A note added
 * after completion inflates it slightly — accepted.)
 */
export function completedIn(goal: Goal): string {
  const ms = Math.max(0, lastActivityAt(goal) - goal.createdAt);
  const days = Math.round(ms / DAY_MS);
  if (days < 2) return "in a day";
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 10) return `in ${weeks} weeks`;
  const months = Math.round(days / 30);
  return `in ${months} months`;
}

// ---- deadlines ----

/** "Jun 30", with the year appended when it isn't the current one. */
export function formatDueDate(dueDate: number, now: number = Date.now()): string {
  const due = new Date(dueDate);
  const sameYear = due.getUTCFullYear() === new Date(now).getUTCFullYear();
  return due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/**
 * True once the due day has fully passed and the work isn't done. Due dates
 * are UTC midnights, so "overdue" starts the day after the deadline.
 */
export function isOverdue(dueDate: number | undefined, done: boolean, now: number = Date.now()): boolean {
  if (dueDate === undefined || done) return false;
  return now >= dueDate + DAY_MS;
}

// ---- tasks ----

/**
 * A standalone to-do, living next to the goals rather than inside one. A task
 * may optionally point at a goal (`goalId`) but never participates in that
 * goal's progress — progress stays derived from steps alone.
 */
export type Task = {
  id: string;
  title: string;
  // Optional longer note beneath the title, mirroring Step.description.
  description?: string;
  // Optionally ties the task to one goal. Cleared to undefined if the goal it
  // pointed at is deleted.
  goalId?: string;
  // A daily task recurs: completing it counts for today only and it resets the
  // next day. Done-ness is derived — see isTaskDone. Optional so payloads
  // written before this existed still parse; absent means one-off.
  daily?: boolean;
  // Optional deadline (see Step.dueDate for the format). Meaningful for
  // one-off tasks; daily tasks ignore it.
  dueDate?: number;
  // Completion of a one-off task. For daily tasks this stays false and
  // `completedOn` carries the state instead.
  done: boolean;
  // For daily tasks: UTC midnight (epoch ms) of the day it was last completed.
  // "Done today" means completedOn === today; any older value reads as not
  // done, which is what makes the reset automatic.
  completedOn?: number;
  createdAt: number;
};

/** Epoch ms of UTC midnight of the day `now` falls on, in UTC. */
export function utcMidnight(now: number = Date.now()): number {
  return now - (now % DAY_MS);
}

/**
 * Whether a task counts as done right now. A one-off task is done when checked
 * off; a daily task is done only if it was completed today — yesterday's
 * completion has expired.
 */
export function isTaskDone(task: Task, now: number = Date.now()): boolean {
  if (task.daily) return task.completedOn === utcMidnight(now);
  return task.done;
}

/** True for an unfinished one-off task whose due day has fully passed. */
export function isTaskOverdue(task: Task, now: number = Date.now()): boolean {
  if (task.daily) return false;
  return isOverdue(task.dueDate, task.done, now);
}

/**
 * The tasks worth surfacing on the home dashboard: every daily task, plus
 * one-off tasks that are due today or overdue. Undone first, dailies before
 * dated ones, each subgroup keeping the store's order.
 */
export function todayTasks(tasks: Task[], now: number = Date.now()): Task[] {
  const today = utcMidnight(now);
  const relevant = tasks.filter(
    (t) => t.daily || (!t.done && t.dueDate !== undefined && t.dueDate <= today)
  );
  const rank = (t: Task) => (isTaskDone(t, now) ? 2 : t.daily ? 0 : 1);
  return relevant.map((t, i) => [t, i] as const)
    .sort(([a, ai], [b, bi]) => rank(a) - rank(b) || ai - bi)
    .map(([t]) => t);
}
