import type { Metadata } from "next";
import { GoalDetail } from "@/features/goals";
import { loadInitialState } from "@/features/goals/load";
import { findGoalByParam } from "@/lib/utils";

/**
 * A single goal. The view itself is client-side — it reads the goal out of the
 * store, which stays live as steps are checked off — but the route around it is
 * a Server Component, so the param is awaited here (Next.js 16) instead of read
 * with a hook, and the page can title itself after the goal.
 *
 * The title comes from the same request-cached load the layout already did, so
 * naming the tab costs no extra query.
 */
export async function generateMetadata(props: PageProps<"/goal/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const state = await loadInitialState();
  const goal = state ? findGoalByParam(state.goals, id) : undefined;
  if (!goal) return { title: "Goal" };
  return {
    title: goal.title,
    description: goal.why || `Your progress on "${goal.title}", one step at a time.`,
  };
}

export default async function GoalPage(props: PageProps<"/goal/[id]">) {
  const { id } = await props.params;
  return <GoalDetail goalId={id} />;
}
