import { withTransaction, type Client, type Pool } from "./db";
import { uid, type Comment, type Goal, type Group, type Step } from "./domain";
import { seedGoals } from "./seed";

export type StoreState = {
  /**
   * False until the store has been written for the first time. The web app uses
   * this to decide, on first connect, whether to adopt the server's goals or to
   * push its own up — pulling an empty store would silently wipe local work.
   */
  initialized: boolean;
  updatedAt: number;
  goals: Goal[];
};

/** Raised when a write targets something that isn't there. Mapped to 404 / an MCP error. */
export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} "${id}" not found`);
    this.name = "NotFoundError";
  }
}

/** Raised when a write is well-formed but asks for something nonsensical. Mapped to 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Raised when a PUT is based on a state older than what the server already has. */
export class ConflictError extends Error {
  constructor(readonly serverUpdatedAt: number) {
    super("The server has a newer version of the goals");
    this.name = "ConflictError";
  }
}

async function touch(client: Client): Promise<number> {
  const now = Date.now();
  await client.query(
    `INSERT INTO meta (only_row, updated_at) VALUES (TRUE, $1)
     ON CONFLICT (only_row) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
    [now]
  );
  return now;
}

async function readUpdatedAt(client: Client | Pool): Promise<number | null> {
  const { rows } = await client.query<{ updated_at: number }>("SELECT updated_at FROM meta");
  return rows[0]?.updated_at ?? null;
}

/** Assemble the whole store: three flat queries, stitched together in memory. */
/**
 * Seed the example goals if the store has never been written to. Runs once at
 * startup (see getPool). The lock + re-check make a concurrent first request
 * safe: whoever gets the lock second sees `initialized` and does nothing, so the
 * examples can't be inserted twice.
 */
export async function ensureSeeded(pool: Pool): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query("LOCK TABLE goals IN EXCLUSIVE MODE");
    if ((await readUpdatedAt(client)) !== null) return;

    await insertGoals(client, seedGoals());
    await touch(client);
  });
}

/**
 * Wipe the store back to the seeded example goals. For end-to-end tests, which
 * need each test to start from the same known state; never call this in
 * production (the test route that does is env-gated).
 */
export async function resetToSeed(pool: Pool): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query("LOCK TABLE goals IN EXCLUSIVE MODE");
    await client.query("TRUNCATE goals, meta RESTART IDENTITY CASCADE");
    await insertGoals(client, seedGoals());
    await touch(client);
  });
}

/** Insert a whole goals tree (goals → groups → steps, plus comments) in order. */
async function insertGoals(client: Client, goals: Goal[]): Promise<void> {
  for (const [goalIndex, goal] of goals.entries()) {
    await client.query(
      "INSERT INTO goals (id, title, why, created_at, position) VALUES ($1, $2, $3, $4, $5)",
      [goal.id, goal.title, goal.why ?? null, goal.createdAt, goalIndex]
    );

    for (const [groupIndex, group] of goal.groups.entries()) {
      await client.query(
        "INSERT INTO groups (id, goal_id, title, position) VALUES ($1, $2, $3, $4)",
        [group.id, goal.id, group.title, groupIndex]
      );

      for (const [stepIndex, step] of group.steps.entries()) {
        await client.query(
          "INSERT INTO steps (id, group_id, text, done, position) VALUES ($1, $2, $3, $4, $5)",
          [step.id, group.id, step.text, step.done, stepIndex]
        );
      }
    }

    for (const comment of goal.comments ?? []) {
      await client.query(
        "INSERT INTO comments (id, goal_id, text, created_at) VALUES ($1, $2, $3, $4)",
        [comment.id, goal.id, comment.text, comment.createdAt]
      );
    }
  }
}

export async function getState(pool: Pool): Promise<StoreState> {
  const updatedAt = await readUpdatedAt(pool);

  const goalRows = await pool.query<{
    id: string;
    title: string;
    why: string | null;
    created_at: number;
  }>("SELECT id, title, why, created_at FROM goals ORDER BY position, id");

  const groupRows = await pool.query<{ id: string; goal_id: string; title: string }>(
    "SELECT id, goal_id, title FROM groups ORDER BY position, id"
  );

  const stepRows = await pool.query<{
    id: string;
    group_id: string;
    text: string;
    done: boolean;
  }>("SELECT id, group_id, text, done FROM steps ORDER BY position, id");

  const commentRows = await pool.query<{
    id: string;
    goal_id: string;
    text: string;
    created_at: number;
  }>("SELECT id, goal_id, text, created_at FROM comments ORDER BY created_at DESC, id");

  const stepsByGroup = new Map<string, Step[]>();
  for (const s of stepRows.rows) {
    const list = stepsByGroup.get(s.group_id) ?? [];
    list.push({ id: s.id, text: s.text, done: s.done });
    stepsByGroup.set(s.group_id, list);
  }

  const groupsByGoal = new Map<string, Group[]>();
  for (const g of groupRows.rows) {
    const list = groupsByGoal.get(g.goal_id) ?? [];
    list.push({ id: g.id, title: g.title, steps: stepsByGroup.get(g.id) ?? [] });
    groupsByGoal.set(g.goal_id, list);
  }

  const commentsByGoal = new Map<string, Comment[]>();
  for (const c of commentRows.rows) {
    const list = commentsByGoal.get(c.goal_id) ?? [];
    list.push({ id: c.id, text: c.text, createdAt: c.created_at });
    commentsByGoal.set(c.goal_id, list);
  }

  const goals: Goal[] = goalRows.rows.map((g) => ({
    id: g.id,
    title: g.title,
    ...(g.why ? { why: g.why } : {}),
    createdAt: g.created_at,
    groups: groupsByGoal.get(g.id) ?? [],
    comments: commentsByGoal.get(g.id) ?? [],
  }));

  return { initialized: updatedAt !== null, updatedAt: updatedAt ?? 0, goals };
}

export async function getGoal(pool: Pool, goalId: string): Promise<Goal> {
  const { goals } = await getState(pool);
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) throw new NotFoundError("Goal", goalId);
  return goal;
}

/**
 * Replace the entire store with `goals` — the write path for the web app's
 * sync. Runs in one transaction, so a reader never sees a half-applied state.
 *
 * `baseUpdatedAt` is the version the client believed it was editing. If the
 * server has moved on since (an MCP tool wrote in the meantime), we reject
 * rather than clobber. Pass `null` to force the write.
 */
export async function replaceAll(
  pool: Pool,
  goals: Goal[],
  baseUpdatedAt: number | null
): Promise<StoreState> {
  return withTransaction(pool, async (client) => {
    // Lock the store for the duration so a concurrent writer can't slip between
    // the version check and the rewrite.
    await client.query("LOCK TABLE goals IN EXCLUSIVE MODE");

    const current = await readUpdatedAt(client);
    if (baseUpdatedAt !== null && current !== null && current > baseUpdatedAt) {
      throw new ConflictError(current);
    }

    await client.query("DELETE FROM goals");
    await insertGoals(client, goals);

    const updatedAt = await touch(client);
    return { initialized: true, updatedAt, goals };
  });
}

// ---- targeted mutations (what the MCP tools call) ----

async function requireGoal(client: Client, goalId: string): Promise<void> {
  const { rowCount } = await client.query("SELECT 1 FROM goals WHERE id = $1", [goalId]);
  if (!rowCount) throw new NotFoundError("Goal", goalId);
}

export async function createGoal(pool: Pool, title: string, why?: string): Promise<Goal> {
  return withTransaction(pool, async (client) => {
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      ...(why?.trim() ? { why: why.trim() } : {}),
      createdAt: Date.now(),
      groups: [],
      comments: [],
    };
    // New goals go to the top of the list, matching the app's addGoal.
    await client.query("UPDATE goals SET position = position + 1");
    await client.query(
      "INSERT INTO goals (id, title, why, created_at, position) VALUES ($1, $2, $3, $4, 0)",
      [goal.id, goal.title, goal.why ?? null, goal.createdAt]
    );
    await touch(client);
    return goal;
  });
}

/**
 * Change a goal's title and/or its "why". Fields left undefined are untouched;
 * passing an empty `why` clears it, matching how the app treats the field.
 */
export async function updateGoal(
  pool: Pool,
  goalId: string,
  changes: { title?: string; why?: string }
): Promise<Goal> {
  await withTransaction(pool, async (client) => {
    await requireGoal(client, goalId);

    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (!title) throw new ValidationError("A goal needs a title");
      await client.query("UPDATE goals SET title = $2 WHERE id = $1", [goalId, title]);
    }

    if (changes.why !== undefined) {
      await client.query("UPDATE goals SET why = $2 WHERE id = $1", [
        goalId,
        changes.why.trim() || null,
      ]);
    }

    await touch(client);
  });

  return getGoal(pool, goalId);
}

export async function deleteGoal(pool: Pool, goalId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("DELETE FROM goals WHERE id = $1", [goalId]);
    if (!rowCount) throw new NotFoundError("Goal", goalId);
    await touch(client);
  });
}

export async function addGroup(pool: Pool, goalId: string, title: string): Promise<Group> {
  return withTransaction(pool, async (client) => {
    await requireGoal(client, goalId);
    const group: Group = { id: uid(), title: title.trim(), steps: [] };
    await client.query(
      `INSERT INTO groups (id, goal_id, title, position)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position) + 1, 0) FROM groups WHERE goal_id = $2))`,
      [group.id, goalId, group.title]
    );
    await touch(client);
    return group;
  });
}

export async function renameGroup(pool: Pool, groupId: string, title: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("UPDATE groups SET title = $2 WHERE id = $1", [
      groupId,
      title.trim(),
    ]);
    if (!rowCount) throw new NotFoundError("Group", groupId);
    await touch(client);
  });
}

export async function deleteGroup(pool: Pool, groupId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("DELETE FROM groups WHERE id = $1", [groupId]);
    if (!rowCount) throw new NotFoundError("Group", groupId);
    await touch(client);
  });
}

export async function addStep(pool: Pool, groupId: string, text: string): Promise<Step> {
  return withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM groups WHERE id = $1", [groupId]);
    if (!rowCount) throw new NotFoundError("Group", groupId);

    const step: Step = { id: uid(), text: text.trim(), done: false };
    await client.query(
      `INSERT INTO steps (id, group_id, text, done, position)
       VALUES ($1, $2, $3, FALSE, (SELECT COALESCE(MAX(position) + 1, 0) FROM steps WHERE group_id = $2))`,
      [step.id, groupId, step.text]
    );
    await touch(client);
    return step;
  });
}

/** Rewrite a step's text, leaving its done flag alone. */
export async function editStep(pool: Pool, stepId: string, text: string): Promise<Step> {
  const next = text.trim();
  if (!next) throw new ValidationError("A step needs some text");

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; text: string; done: boolean }>(
      "UPDATE steps SET text = $2 WHERE id = $1 RETURNING id, text, done",
      [stepId, next]
    );
    const step = rows[0];
    if (!step) throw new NotFoundError("Step", stepId);
    await touch(client);
    return step;
  });
}

/** Flip a step's done flag, or set it explicitly. Returns the resulting state. */
export async function setStepDone(pool: Pool, stepId: string, done?: boolean): Promise<Step> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; text: string; done: boolean }>(
      "UPDATE steps SET done = COALESCE($2, NOT done) WHERE id = $1 RETURNING id, text, done",
      [stepId, done ?? null]
    );
    const step = rows[0];
    if (!step) throw new NotFoundError("Step", stepId);
    await touch(client);
    return step;
  });
}

export async function deleteStep(pool: Pool, stepId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("DELETE FROM steps WHERE id = $1", [stepId]);
    if (!rowCount) throw new NotFoundError("Step", stepId);
    await touch(client);
  });
}

export async function listComments(pool: Pool, goalId: string): Promise<Comment[]> {
  const goal = await getGoal(pool, goalId);
  return goal.comments ?? [];
}

export async function addComment(pool: Pool, goalId: string, text: string): Promise<Comment> {
  return withTransaction(pool, async (client) => {
    await requireGoal(client, goalId);
    const comment: Comment = { id: uid(), text: text.trim(), createdAt: Date.now() };
    await client.query(
      "INSERT INTO comments (id, goal_id, text, created_at) VALUES ($1, $2, $3, $4)",
      [comment.id, goalId, comment.text, comment.createdAt]
    );
    await touch(client);
    return comment;
  });
}

export async function editComment(pool: Pool, commentId: string, text: string): Promise<Comment> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; text: string; created_at: number }>(
      "UPDATE comments SET text = $2 WHERE id = $1 RETURNING id, text, created_at",
      [commentId, text.trim()]
    );
    const row = rows[0];
    if (!row) throw new NotFoundError("Comment", commentId);
    await touch(client);
    return { id: row.id, text: row.text, createdAt: row.created_at };
  });
}

export async function deleteComment(pool: Pool, commentId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query("DELETE FROM comments WHERE id = $1", [commentId]);
    if (!rowCount) throw new NotFoundError("Comment", commentId);
    await touch(client);
  });
}
