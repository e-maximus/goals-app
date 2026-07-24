/**
 * The server speaks exactly the same domain language as the web app. Rather
 * than redeclaring Goal/Group/Step/Note (and letting the two drift), we
 * re-export the app's types verbatim — `src/lib/types.ts` is the one source of
 * truth for the domain, shared by both sides of the same build.
 */
export type { Note, Goal, GoalStatus, Group, Step, Task } from "@/lib/types";
export {
  daysSinceActivity,
  isGoalStale,
  noteCount,
  goalProgress,
  goalStepCounts,
  groupProgress,
  isGoalComplete,
  goalStatus,
  isTaskDone,
  lastActivityAt,
  ungroupedSteps,
  utcMidnight,
} from "@/lib/types";

/**
 * A short id, mirroring the web app's generator (store.ts) so ids look alike
 * everywhere. Six base-36 chars (~2 billion values) keep goal URLs short while
 * leaving primary-key collisions vanishingly unlikely at this app's scale.
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}
