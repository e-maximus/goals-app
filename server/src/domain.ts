/**
 * The server speaks exactly the same domain language as the web app. Rather
 * than redeclaring Goal/Group/Step/Comment (and letting the two drift), we
 * re-export the app's types verbatim. `src/lib/types.ts` is dependency-free, so
 * it compiles into the server build untouched.
 */
export type { Comment, Goal, Group, Step } from "../../src/lib/types.js";
export {
  commentCount,
  goalProgress,
  goalStepCounts,
  groupProgress,
  isGoalComplete,
} from "../../src/lib/types.js";

/** Mirrors the id shape the web app generates, so ids look alike everywhere. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
