import { withTransaction, type Client, type Pool } from "./db";
import { uid, type Comment, type Goal, type Group, type Step } from "./domain";

export type StoreState = {
  /**
   * False until the store has been written for the first time. The web app uses
   * this to decide, on first connect, whether to adopt the server's goals or to
   * push its own up — pulling an empty store would silently wipe local work. In
   * practice a user is seeded the moment they're created, so an existing user is
   * always initialized; the flag stays for the write path's conflict logic.
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

// Every read and write below is scoped to one owner (a user id). Goals carry
// `owner_id`; groups, steps and comments reach it through their goal, so those
// queries join up to `goals` and filter there. This is what keeps one user from
// seeing or touching another's data even though ids are globally unique.

/** Bump the owner's last-write stamp and return it. */
async function touch(client: Client, ownerId: string): Promise<number> {
  const now = Date.now();
  await client.query("UPDATE users SET goals_updated_at = $2 WHERE id = $1", [ownerId, now]);
  return now;
}

/** The owner's last-write stamp, or null if they've never been written to. */
async function readUpdatedAt(client: Client | Pool, ownerId: string): Promise<number | null> {
  const { rows } = await client.query<{ goals_updated_at: number | null }>(
    "SELECT goals_updated_at FROM users WHERE id = $1",
    [ownerId]
  );
  return rows[0]?.goals_updated_at ?? null;
}

/**
 * Insert a whole goals tree (goals → groups → steps, plus comments) in order,
 * all owned by `ownerId`. Exported so user creation can seed a new owner in the
 * same transaction that inserts the user row.
 */
export async function insertGoals(client: Client, ownerId: string, goals: Goal[]): Promise<void> {
  for (const [goalIndex, goal] of goals.entries()) {
    await client.query(
      "INSERT INTO goals (id, owner_id, title, why, created_at, position) VALUES ($1, $2, $3, $4, $5, $6)",
      [goal.id, ownerId, goal.title, goal.why ?? null, goal.createdAt, goalIndex]
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

/** Assemble one owner's whole store: four flat queries, stitched together in memory. */
export async function getState(pool: Pool, ownerId: string): Promise<StoreState> {
  const updatedAt = await readUpdatedAt(pool, ownerId);

  const goalRows = await pool.query<{
    id: string;
    title: string;
    why: string | null;
    created_at: number;
  }>(
    "SELECT id, title, why, created_at FROM goals WHERE owner_id = $1 ORDER BY position, id",
    [ownerId]
  );

  const groupRows = await pool.query<{ id: string; goal_id: string; title: string }>(
    `SELECT gr.id, gr.goal_id, gr.title
       FROM groups gr JOIN goals g ON gr.goal_id = g.id
      WHERE g.owner_id = $1
      ORDER BY gr.position, gr.id`,
    [ownerId]
  );

  const stepRows = await pool.query<{
    id: string;
    group_id: string;
    text: string;
    done: boolean;
  }>(
    `SELECT s.id, s.group_id, s.text, s.done
       FROM steps s
       JOIN groups gr ON s.group_id = gr.id
       JOIN goals g ON gr.goal_id = g.id
      WHERE g.owner_id = $1
      ORDER BY s.position, s.id`,
    [ownerId]
  );

  const commentRows = await pool.query<{
    id: string;
    goal_id: string;
    text: string;
    created_at: number;
  }>(
    `SELECT c.id, c.goal_id, c.text, c.created_at
       FROM comments c JOIN goals g ON c.goal_id = g.id
      WHERE g.owner_id = $1
      ORDER BY c.created_at DESC, c.id`,
    [ownerId]
  );

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

export async function getGoal(pool: Pool, ownerId: string, goalId: string): Promise<Goal> {
  const { goals } = await getState(pool, ownerId);
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) throw new NotFoundError("Goal", goalId);
  return goal;
}

/**
 * Replace one owner's entire store with `goals` — the write path for the web
 * app's sync. Runs in one transaction, so a reader never sees a half-applied
 * state.
 *
 * `baseUpdatedAt` is the version the client believed it was editing. If the
 * server has moved on since (an MCP tool wrote in the meantime), we reject
 * rather than clobber. Pass `null` to force the write.
 */
export async function replaceAll(
  pool: Pool,
  ownerId: string,
  goals: Goal[],
  baseUpdatedAt: number | null
): Promise<StoreState> {
  return withTransaction(pool, async (client) => {
    // Lock this owner's row for the duration so a concurrent writer for the same
    // user can't slip between the version check and the rewrite. Other users are
    // unaffected — their rows aren't touched.
    const { rows } = await client.query<{ goals_updated_at: number | null }>(
      "SELECT goals_updated_at FROM users WHERE id = $1 FOR UPDATE",
      [ownerId]
    );
    if (rows.length === 0) throw new NotFoundError("User", ownerId);
    const current = rows[0]!.goals_updated_at;

    if (baseUpdatedAt !== null && current !== null && current > baseUpdatedAt) {
      throw new ConflictError(current);
    }

    await client.query("DELETE FROM goals WHERE owner_id = $1", [ownerId]);
    await insertGoals(client, ownerId, goals);

    const updatedAt = await touch(client, ownerId);
    return { initialized: true, updatedAt, goals };
  });
}

// ---- targeted mutations (what the MCP tools call) ----
//
// Each resolves the target through its owner, so a stray id from another user's
// store simply isn't found — the ownership check and the "does it exist" check
// are the same query.

async function requireGoal(client: Client, ownerId: string, goalId: string): Promise<void> {
  const { rowCount } = await client.query(
    "SELECT 1 FROM goals WHERE id = $1 AND owner_id = $2",
    [goalId, ownerId]
  );
  if (!rowCount) throw new NotFoundError("Goal", goalId);
}

export async function createGoal(
  pool: Pool,
  ownerId: string,
  title: string,
  why?: string
): Promise<Goal> {
  return withTransaction(pool, async (client) => {
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      ...(why?.trim() ? { why: why.trim() } : {}),
      createdAt: Date.now(),
      groups: [],
      comments: [],
    };
    // New goals go to the top of this owner's list, matching the app's addGoal.
    await client.query("UPDATE goals SET position = position + 1 WHERE owner_id = $1", [ownerId]);
    await client.query(
      "INSERT INTO goals (id, owner_id, title, why, created_at, position) VALUES ($1, $2, $3, $4, $5, 0)",
      [goal.id, ownerId, goal.title, goal.why ?? null, goal.createdAt]
    );
    await touch(client, ownerId);
    return goal;
  });
}

/**
 * Change a goal's title and/or its "why". Fields left undefined are untouched;
 * passing an empty `why` clears it, matching how the app treats the field.
 */
export async function updateGoal(
  pool: Pool,
  ownerId: string,
  goalId: string,
  changes: { title?: string; why?: string }
): Promise<Goal> {
  await withTransaction(pool, async (client) => {
    await requireGoal(client, ownerId, goalId);

    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (!title) throw new ValidationError("A goal needs a title");
      await client.query("UPDATE goals SET title = $2 WHERE id = $1 AND owner_id = $3", [
        goalId,
        title,
        ownerId,
      ]);
    }

    if (changes.why !== undefined) {
      await client.query("UPDATE goals SET why = $2 WHERE id = $1 AND owner_id = $3", [
        goalId,
        changes.why.trim() || null,
        ownerId,
      ]);
    }

    await touch(client, ownerId);
  });

  return getGoal(pool, ownerId, goalId);
}

export async function deleteGoal(pool: Pool, ownerId: string, goalId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query(
      "DELETE FROM goals WHERE id = $1 AND owner_id = $2",
      [goalId, ownerId]
    );
    if (!rowCount) throw new NotFoundError("Goal", goalId);
    await touch(client, ownerId);
  });
}

export async function addGroup(
  pool: Pool,
  ownerId: string,
  goalId: string,
  title: string
): Promise<Group> {
  return withTransaction(pool, async (client) => {
    await requireGoal(client, ownerId, goalId);
    const group: Group = { id: uid(), title: title.trim(), steps: [] };
    await client.query(
      `INSERT INTO groups (id, goal_id, title, position)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position) + 1, 0) FROM groups WHERE goal_id = $2))`,
      [group.id, goalId, group.title]
    );
    await touch(client, ownerId);
    return group;
  });
}

export async function renameGroup(
  pool: Pool,
  ownerId: string,
  groupId: string,
  title: string
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE groups SET title = $2
        WHERE id = $1 AND goal_id IN (SELECT id FROM goals WHERE owner_id = $3)`,
      [groupId, title.trim(), ownerId]
    );
    if (!rowCount) throw new NotFoundError("Group", groupId);
    await touch(client, ownerId);
  });
}

export async function deleteGroup(pool: Pool, ownerId: string, groupId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM groups
        WHERE id = $1 AND goal_id IN (SELECT id FROM goals WHERE owner_id = $2)`,
      [groupId, ownerId]
    );
    if (!rowCount) throw new NotFoundError("Group", groupId);
    await touch(client, ownerId);
  });
}

/** True if `groupId` belongs to `ownerId`. Used to guard step inserts. */
async function groupOwnedBy(client: Client, ownerId: string, groupId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM groups gr JOIN goals g ON gr.goal_id = g.id
      WHERE gr.id = $1 AND g.owner_id = $2`,
    [groupId, ownerId]
  );
  return Boolean(rowCount);
}

export async function addStep(
  pool: Pool,
  ownerId: string,
  groupId: string,
  text: string
): Promise<Step> {
  return withTransaction(pool, async (client) => {
    if (!(await groupOwnedBy(client, ownerId, groupId))) throw new NotFoundError("Group", groupId);

    const step: Step = { id: uid(), text: text.trim(), done: false };
    await client.query(
      `INSERT INTO steps (id, group_id, text, done, position)
       VALUES ($1, $2, $3, FALSE, (SELECT COALESCE(MAX(position) + 1, 0) FROM steps WHERE group_id = $2))`,
      [step.id, groupId, step.text]
    );
    await touch(client, ownerId);
    return step;
  });
}

// Steps reach their owner through group → goal; this fragment scopes a step id.
const OWNED_STEP = `id = $1 AND group_id IN (
  SELECT gr.id FROM groups gr JOIN goals g ON gr.goal_id = g.id WHERE g.owner_id = $2
)`;

/** Rewrite a step's text, leaving its done flag alone. */
export async function editStep(
  pool: Pool,
  ownerId: string,
  stepId: string,
  text: string
): Promise<Step> {
  const next = text.trim();
  if (!next) throw new ValidationError("A step needs some text");

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; text: string; done: boolean }>(
      `UPDATE steps SET text = $3 WHERE ${OWNED_STEP} RETURNING id, text, done`,
      [stepId, ownerId, next]
    );
    const step = rows[0];
    if (!step) throw new NotFoundError("Step", stepId);
    await touch(client, ownerId);
    return step;
  });
}

/** Flip a step's done flag, or set it explicitly. Returns the resulting state. */
export async function setStepDone(
  pool: Pool,
  ownerId: string,
  stepId: string,
  done?: boolean
): Promise<Step> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; text: string; done: boolean }>(
      `UPDATE steps SET done = COALESCE($3, NOT done) WHERE ${OWNED_STEP} RETURNING id, text, done`,
      [stepId, ownerId, done ?? null]
    );
    const step = rows[0];
    if (!step) throw new NotFoundError("Step", stepId);
    await touch(client, ownerId);
    return step;
  });
}

export async function deleteStep(pool: Pool, ownerId: string, stepId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query(`DELETE FROM steps WHERE ${OWNED_STEP}`, [
      stepId,
      ownerId,
    ]);
    if (!rowCount) throw new NotFoundError("Step", stepId);
    await touch(client, ownerId);
  });
}

export async function listComments(
  pool: Pool,
  ownerId: string,
  goalId: string
): Promise<Comment[]> {
  const goal = await getGoal(pool, ownerId, goalId);
  return goal.comments ?? [];
}

export async function addComment(
  pool: Pool,
  ownerId: string,
  goalId: string,
  text: string
): Promise<Comment> {
  return withTransaction(pool, async (client) => {
    await requireGoal(client, ownerId, goalId);
    const comment: Comment = { id: uid(), text: text.trim(), createdAt: Date.now() };
    await client.query(
      "INSERT INTO comments (id, goal_id, text, created_at) VALUES ($1, $2, $3, $4)",
      [comment.id, goalId, comment.text, comment.createdAt]
    );
    await touch(client, ownerId);
    return comment;
  });
}

// Comments reach their owner through goal; this fragment scopes a comment id.
const OWNED_COMMENT = "id = $1 AND goal_id IN (SELECT id FROM goals WHERE owner_id = $2)";

export async function editComment(
  pool: Pool,
  ownerId: string,
  commentId: string,
  text: string
): Promise<Comment> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; text: string; created_at: number }>(
      `UPDATE comments SET text = $3 WHERE ${OWNED_COMMENT} RETURNING id, text, created_at`,
      [commentId, ownerId, text.trim()]
    );
    const row = rows[0];
    if (!row) throw new NotFoundError("Comment", commentId);
    await touch(client, ownerId);
    return { id: row.id, text: row.text, createdAt: row.created_at };
  });
}

export async function deleteComment(pool: Pool, ownerId: string, commentId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rowCount } = await client.query(`DELETE FROM comments WHERE ${OWNED_COMMENT}`, [
      commentId,
      ownerId,
    ]);
    if (!rowCount) throw new NotFoundError("Comment", commentId);
    await touch(client, ownerId);
  });
}
