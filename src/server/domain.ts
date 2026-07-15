/**
 * The server speaks exactly the same domain language as the web app. Rather
 * than redeclaring Goal/Group/Step/Comment (and letting the two drift), we
 * re-export the app's types verbatim — `src/lib/types.ts` is the one source of
 * truth for the domain, shared by both sides of the same build.
 */
export type { Comment, Goal, Group, Step } from "@/lib/types";
export {
  commentCount,
  goalProgress,
  goalStepCounts,
  groupProgress,
  isGoalComplete,
} from "@/lib/types";

/** Mirrors the id shape the web app generates, so ids look alike everywhere. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
