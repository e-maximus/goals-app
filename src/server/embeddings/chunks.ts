import "server-only";
import { createHash } from "node:crypto";
import { ungroupedSteps, type Goal, type Step, type Task } from "../domain";

/**
 * Turning a user's store into the rows of the search index.
 *
 * There is no chunking in the usual RAG sense — no sliding windows, no token
 * budget. The domain is already chunked: a goal, a step, a note and a task are
 * each one short, self-contained thing, and splitting them further would only
 * separate a sentence from its own heading.
 *
 * What does need care is context. "Buy tickets" is a fine step and a useless
 * embedding: on its own it sits near every other errand in vector space. So each
 * chunk gets its parents' titles folded into `content`, which is the text that
 * gets embedded.
 *
 * The keyword arms deliberately do NOT see that context — see `titleText` /
 * `bodyText` below, and the migration's note on why.
 */

export type ChunkKind = "goal" | "step" | "note" | "task";

export type Chunk = {
  kind: ChunkKind;
  itemId: string;
  /** The goal this chunk hangs off, or null for a task not linked to one. */
  goalId: string | null;
  /**
   * The item's own words, split into the part that should rank higher (its
   * heading) and the rest. No parent titles here: repeating the goal's name in
   * every one of its steps puts the same terms in every row, which is exactly
   * what IDF then discounts to zero — so it buys nothing and crowds out the
   * words that actually tell two chunks apart.
   */
  titleText: string;
  bodyText: string;
  /**
   * What gets embedded: the item plus its parents' titles. The redundancy that
   * hurts the keyword arms is what makes the vector arm work.
   */
  content: string;
};

/** Drop the parts that are absent or blank, then join what's left. */
function lines(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join("\n");
}

/**
 * The change key for a chunk. Reindexing compares this against the stored hash
 * and re-embeds only what moved, which is what keeps the whole-store `PUT` from
 * costing a full re-embed on every keystroke-debounced write.
 *
 * It hashes `content`, so renaming a goal does invalidate every step under it —
 * correct, since their embedded text really did change, and the cost is a few
 * hundred short strings at $0.02/1M tokens.
 */
export function chunkHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Every searchable row for one user's store, in a stable order.
 *
 * Completed goals, checked steps and finished tasks are all included: "what did
 * I write about the move?" is asked about finished work at least as often as
 * about live work.
 */
export function buildChunks(state: { goals: Goal[]; tasks: Task[] }): Chunk[] {
  const chunks: Chunk[] = [];

  for (const goal of state.goals) {
    chunks.push({
      kind: "goal",
      itemId: goal.id,
      goalId: goal.id,
      titleText: goal.title,
      bodyText: goal.why ?? "",
      content: lines(`Goal: ${goal.title}`, goal.why && `Why: ${goal.why}`),
    });

    // Steps living directly on the goal, then the grouped ones — the order the
    // app renders them in.
    const steps: { step: Step; group?: string }[] = [
      ...ungroupedSteps(goal).map((step) => ({ step })),
      ...goal.groups.flatMap((group) => group.steps.map((step) => ({ step, group: group.title }))),
    ];

    for (const { step, group } of steps) {
      chunks.push({
        kind: "step",
        itemId: step.id,
        goalId: goal.id,
        titleText: step.text,
        bodyText: step.description ?? "",
        content: lines(
          `Goal: ${goal.title}`,
          group && `Group: ${group}`,
          `Step: ${step.text}`,
          step.description
        ),
      });
    }

    for (const note of goal.notes ?? []) {
      // A note has no heading to separate out — all of it is its own words, so
      // it all goes in `titleText`. Weighting within a single-field document is
      // a no-op, and BM25's length normalisation keeps long notes from winning
      // on bulk alone.
      chunks.push({
        kind: "note",
        itemId: note.id,
        goalId: goal.id,
        titleText: note.text,
        bodyText: "",
        content: lines(`Goal: ${goal.title}`, `Note: ${note.text}`),
      });
    }
  }

  const goalTitles = new Map(state.goals.map((g) => [g.id, g.title]));

  for (const task of state.tasks) {
    const goalTitle = task.goalId ? goalTitles.get(task.goalId) : undefined;
    chunks.push({
      kind: "task",
      itemId: task.id,
      // Only claim the link when the goal is really there: `goal_id` is a
      // foreign key, and a task pointing at a deleted goal would fail the insert.
      goalId: goalTitle === undefined ? null : task.goalId!,
      titleText: task.title,
      bodyText: task.description ?? "",
      content: lines(
        goalTitle && `Goal: ${goalTitle}`,
        `Task: ${task.title}`,
        task.description
      ),
    });
  }

  // A chunk with no words of its own can never be retrieved and would only add
  // a row to every corpus-wide count, skewing IDF. Drop it.
  return chunks.filter((c) => c.titleText.trim() || c.bodyText.trim());
}
