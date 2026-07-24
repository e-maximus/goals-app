import "server-only";
import type { Pool } from "../db";
import * as repo from "../repo";
import { goalHref } from "@/lib/utils";
import { ungroupedSteps, type Goal, type Task } from "../domain";
import { embedder, type Embedder } from "../embeddings/model";
import { keywordArm, trigramArm, vectorArm, type Arm, type ArmHit } from "./arms";
import { fuse } from "./rrf";
import type { SearchHit, SearchKind } from "@/lib/search";
import { log } from "../log";

/**
 * Search over one user's goals, steps, notes and tasks.
 *
 * Three arms run in parallel and are fused by rank ([rrf.ts](./rrf.ts)). Then
 * the winners are hydrated from the real tables rather than served out of the
 * index: the index is derived data that a failed reindex can leave briefly
 * stale, and returning a row for a step that has since been deleted would be
 * worse than returning one result fewer. A hit that no longer resolves is
 * dropped.
 */

// The result shape is the wire format, declared once in src/lib/search.ts so the
// palette and this module cannot drift apart.
export type { SearchHit, SearchKind } from "@/lib/search";

export type SearchOptions = {
  limit?: number;
  /** Restrict to some kinds. Omitted means all of them. */
  kinds?: SearchKind[];
  /** Injectable so tests need no provider; defaults to the configured one. */
  embed?: Embedder | null;
};

const DEFAULT_LIMIT = 8;

export async function search(
  pool: Pool,
  ownerId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const embed = options.embed === undefined ? embedder() : options.embed;

  const rankings: { arm: Arm; hits: ArmHit[] }[] = [];
  const [keyword, trigram, vector] = await Promise.all([
    keywordArm(pool, ownerId, trimmed),
    trigramArm(pool, ownerId, trimmed),
    semanticArm(pool, ownerId, trimmed, embed),
  ]);
  rankings.push({ arm: "keyword", hits: keyword });
  rankings.push({ arm: "trigram", hits: trigram });
  if (vector) rankings.push({ arm: "vector", hits: vector });

  const fused = fuse(rankings);
  if (fused.length === 0) return [];

  const state = await repo.getState(pool, ownerId);
  const index = buildIndex(state.goals, state.tasks);

  const hits: SearchHit[] = [];
  for (const hit of fused) {
    const item = index.get(`${hit.kind}:${hit.itemId}`);
    if (!item) continue;
    if (options.kinds && !options.kinds.includes(item.kind)) continue;
    hits.push({ ...item, score: hit.score, arms: hit.arms });
  }
  return promoteGoals(hits).slice(0, limit);
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

/**
 * The semantic arm, or null when it cannot run. A missing provider is a normal
 * state; a provider that errors is not, but it still must not take the whole
 * search down with it — the other two arms have already answered.
 */
async function semanticArm(
  pool: Pool,
  ownerId: string,
  query: string,
  embed: Embedder | null
): Promise<ArmHit[] | null> {
  if (!embed) return null;
  try {
    const [vector] = await embed.embed([query]);
    if (!vector) return null;
    return await vectorArm(pool, ownerId, vector, embed.modelName);
  } catch (err) {
    log.error("search_vector_arm_failed", {
      userId: ownerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

type IndexedItem = Omit<SearchHit, "score" | "arms">;

/** Everything searchable, keyed the way the index rows are, for hydration. */
function buildIndex(goals: Goal[], tasks: Task[]): Map<string, IndexedItem> {
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

    const steps = [
      ...ungroupedSteps(goal),
      ...goal.groups.flatMap((group) => group.steps),
    ];
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
