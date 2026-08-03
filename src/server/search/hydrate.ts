import "server-only";
import { goalHref } from "@/lib/utils";
import { ungroupedSteps, type Goal, type SearchHit, type Task } from "../domain";

/**
 * Turning fused hits back into results.
 *
 * The winners are rebuilt from the real tables rather than served out of the
 * search index: the index is derived data that a failed reindex can leave
 * briefly stale, and returning a row for a step that has since been deleted
 * would be worse than returning one result fewer. A hit that no longer resolves
 * is dropped.
 *
 * This is domain logic, not retrieval — which is why it sits outside the
 * retrievers and is shared by whatever fuses them.
 */

export type IndexedItem = Omit<SearchHit, "score" | "arms">;

/** Everything searchable, keyed the way the index rows are, for hydration. */
export function buildIndex(goals: Goal[], tasks: Task[]): Map<string, IndexedItem> {
  const index = new Map<string, IndexedItem>();

  for (const goal of goals) {
    const ref = { id: goal.id, title: goal.title, url: goalHref(goal) };
    index.set(`goal:${goal.id}`, {
      kind: "goal",
      id: goal.id,
      title: goal.title,
      ...(goal.why ? { detail: goal.why } : {}),
      goal: ref,
    });

    const steps = [...ungroupedSteps(goal), ...goal.groups.flatMap((group) => group.steps)];
    for (const step of steps) {
      index.set(`step:${step.id}`, {
        kind: "step",
        id: step.id,
        title: step.text,
        ...(step.description ? { detail: step.description } : {}),
        goal: ref,
        done: step.done,
      });
    }

    for (const note of goal.notes ?? []) {
      index.set(`note:${note.id}`, {
        kind: "note",
        id: note.id,
        title: note.text,
        goal: ref,
      });
    }
  }

  const goalRefs = new Map(
    goals.map((g) => [g.id, { id: g.id, title: g.title, url: goalHref(g) }])
  );
  for (const task of tasks) {
    index.set(`task:${task.id}`, {
      kind: "task",
      id: task.id,
      title: task.title,
      ...(task.description ? { detail: task.description } : {}),
      goal: (task.goalId && goalRefs.get(task.goalId)) || null,
      done: task.done,
    });
  }

  return index;
}

/**
 * Lift a goal above its own steps and notes.
 *
 * Two things conspire against the parent. Its indexed text is short — a title
 * and a why — while every step under it carries that title *plus* its own words,
 * so on the vector arm a child is reliably the denser match for anything
 * resembling the goal's name. And in this app a step or note has no page of its
 * own: clicking one navigates to its goal. So the pre-fix behaviour was three
 * steps of one goal stacked above the goal itself, every one of them going to
 * the same place.
 *
 * The rule is narrow twice over. A goal moves only within its own family, never
 * past another goal's results. And it moves only if a keyword or trigram arm
 * found it — those match on the item's own words alone, so this fires when the
 * user typed something the goal itself says, and not when the goal merely drifted
 * into range on the vector arm. That distinction is the whole difference between
 * "podcast", where the goal is the answer, and "microphone", where the step that
 * actually mentions one is.
 */
export function promoteGoals(hits: SearchHit[]): SearchHit[] {
  const matchedOwnWords = (hit: SearchHit) =>
    hit.arms.includes("keyword") || hit.arms.includes("trigram");

  const bestRankPerGoal = new Map<string, number>();
  hits.forEach((hit, rank) => {
    const goalId = hit.goal?.id;
    if (!goalId) return;
    if (!bestRankPerGoal.has(goalId)) bestRankPerGoal.set(goalId, rank);
  });

  return hits
    .map((hit, rank) => ({
      hit,
      rank:
        hit.kind === "goal" && matchedOwnWords(hit)
          ? (bestRankPerGoal.get(hit.id) ?? rank)
          : rank,
      original: rank,
    }))
    // A promoted goal now shares a rank with the child it was promoted to, so
    // the goal has to win that tie — otherwise it lands just below the child and
    // nothing has moved. The original rank keeps everything else stable.
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(b.hit.kind === "goal" && matchedOwnWords(b.hit)) -
          Number(a.hit.kind === "goal" && matchedOwnWords(a.hit)) ||
        a.original - b.original
    )
    .map((entry) => entry.hit);
}
