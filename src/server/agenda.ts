import "server-only";
import { goalHref } from "@/lib/utils";
import {
  daysSinceActivity,
  goalStatus,
  isGoalComplete,
  isGoalStale,
  isTaskDone,
  ungroupedSteps,
  utcMidnight,
  type Goal,
  type Task,
} from "./domain";

/**
 * "What should I do today?" — which is not a search question.
 *
 * It is tempting to route everything through the new search, but the user asking
 * this isn't looking for something *similar to* anything. They are asking about
 * state: what is overdue, what is due, what has gone quiet. That is a filter over
 * dates and statuses, and answering it with cosine distance would return
 * whatever happens to contain the words "today" and "do" — plausible-looking and
 * wrong.
 *
 * So this is deliberately dumb: no embeddings, no ranking, no model. It reads the
 * store and sorts it by deadline.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type AgendaItem = {
  kind: "goal" | "group" | "step" | "task";
  id: string;
  title: string;
  /** The goal it belongs to, with a link. Null for a task not tied to one. */
  goal: { id: string; title: string; url: string } | null;
  /** Epoch ms of UTC midnight of the due day. Absent for a daily habit. */
  dueDate?: number;
  /** A task that recurs every day rather than having a deadline. */
  daily?: boolean;
};

export type StaleGoal = {
  id: string;
  title: string;
  url: string;
  daysSinceActivity: number;
};

export type Agenda = {
  /** Deadlines that have fully passed, oldest first — the ones actually hurting. */
  overdue: AgendaItem[];
  /** Due today, plus every daily habit not yet ticked off. */
  today: AgendaItem[];
  /** Due within `horizonDays`, soonest first. */
  upcoming: AgendaItem[];
  /** Active, unfinished, and untouched for a fortnight. */
  stale: StaleGoal[];
  /** Counts, so an agent can say "and 6 others" without being handed all of them. */
  counts: { activeGoals: number; pausedGoals: number; openTasks: number };
};

/** How far ahead `upcoming` looks by default. */
export const DEFAULT_HORIZON_DAYS = 7;

/**
 * Build the agenda from a store.
 *
 * Paused goals contribute nothing — pausing is the user saying "not now", and a
 * paused goal whose steps kept appearing in today's list would make the button
 * meaningless. Completed work is excluded for the same reason: a deadline you
 * have already met is not a deadline.
 */
export function buildAgenda(
  goals: Goal[],
  tasks: Task[],
  now: number = Date.now(),
  horizonDays: number = DEFAULT_HORIZON_DAYS
): Agenda {
  const today = utcMidnight(now);
  const horizon = today + horizonDays * DAY_MS;

  const overdue: AgendaItem[] = [];
  const dueToday: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];
  const stale: StaleGoal[] = [];
  let activeGoals = 0;
  let pausedGoals = 0;

  const file = (item: AgendaItem) => {
    if (item.daily) {
      dueToday.push(item);
      return;
    }
    if (item.dueDate === undefined) return;
    // A deadline is missed only once its day has fully passed — due dates are
    // UTC midnights, so "overdue" starts the day after.
    if (item.dueDate < today) overdue.push(item);
    else if (item.dueDate === today) dueToday.push(item);
    else if (item.dueDate <= horizon) upcoming.push(item);
  };

  for (const goal of goals) {
    if (goalStatus(goal) === "paused") {
      pausedGoals++;
      continue;
    }
    activeGoals++;

    const ref = { id: goal.id, title: goal.title, url: goalHref(goal) };
    const complete = isGoalComplete(goal);

    if (!complete) {
      file({ kind: "goal", id: goal.id, title: goal.title, goal: ref, dueDate: goal.dueDate });
      if (isGoalStale(goal, now)) {
        stale.push({ ...ref, daysSinceActivity: daysSinceActivity(goal, now) });
      }
    }

    for (const group of goal.groups) {
      if (group.steps.length > 0 && group.steps.every((s) => s.done)) continue;
      file({ kind: "group", id: group.id, title: group.title, goal: ref, dueDate: group.dueDate });
    }

    const steps = [...ungroupedSteps(goal), ...goal.groups.flatMap((g) => g.steps)];
    for (const step of steps) {
      if (step.done) continue;
      file({ kind: "step", id: step.id, title: step.text, goal: ref, dueDate: step.dueDate });
    }
  }

  const goalRefs = new Map(goals.map((g) => [g.id, { id: g.id, title: g.title, url: goalHref(g) }]));
  let openTasks = 0;
  for (const task of tasks) {
    if (isTaskDone(task, now)) continue;
    openTasks++;
    file({
      kind: "task",
      id: task.id,
      title: task.title,
      goal: (task.goalId && goalRefs.get(task.goalId)) || null,
      dueDate: task.dueDate,
      ...(task.daily ? { daily: true } : {}),
    });
  }

  const bySoonest = (a: AgendaItem, b: AgendaItem) => (a.dueDate ?? 0) - (b.dueDate ?? 0);
  overdue.sort(bySoonest);
  upcoming.sort(bySoonest);
  stale.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  return {
    overdue,
    today: dueToday,
    upcoming,
    stale,
    counts: { activeGoals, pausedGoals, openTasks },
  };
}
