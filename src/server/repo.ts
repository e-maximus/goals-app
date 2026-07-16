import { withTransaction, type Client, type Pool } from "./db";
import { uid, type Note, type Goal, type GoalStatus, type Group, type Step } from "./domain";

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

/** Shape a step row into a domain Step, omitting an absent description. */
function toStep(row: { id: string; text: string; description: string | null; done: boolean }): Step {
  return {
    id: row.id,
    text: row.text,
    ...(row.description ? { description: row.description } : {}),
    done: row.done,
  };
}

// Every read and write below is scoped to one owner (a user id). Goals carry
// `owner_id`; groups, steps and notes reach it through their goal, so those
// queries join up to `goals` and filter there. This is what keeps one user from
// seeing or touching another's data even though ids are globally unique.

/** Bump the owner's last-write stamp and return it. */
async function touch(client: Client, ownerId: string): Promise<number> {
  const now = Date.now();
  await client.query("UPDATE users SET goals_updated_at = $2 WHERE id = $1", [ownerId, now]);
  return now;
}

/**
 * Bump one goal's last-activity stamp. Called by the targeted mutations below
 * (the web app's whole-store PUT instead persists the client's own stamps —
 * see insertGoals). `goalId` is already ownership-checked by every caller.
 */
async function touchGoal(client: Client, goalId: string): Promise<void> {
  await client.query("UPDATE goals SET updated_at = $2 WHERE id = $1", [goalId, Date.now()]);
}

/** Resolve a group's goal, scoped to the owner; null if not theirs. */
async function goalIdOfGroup(
  client: Client,
  ownerId: string,
  groupId: string
): Promise<string | null> {
  const { rows } = await client.query<{ goal_id: string }>(
    `SELECT gr.goal_id FROM groups gr JOIN goals g ON gr.goal_id = g.id
      WHERE gr.id = $1 AND g.owner_id = $2`,
    [groupId, ownerId]
  );
  return rows[0]?.goal_id ?? null;
}

/** Resolve a step's goal, scoped to the owner; null if not theirs. */
async function goalIdOfStep(
  client: Client,
  ownerId: string,
  stepId: string
): Promise<string | null> {
  const { rows } = await client.query<{ goal_id: string }>(
    `SELECT gr.goal_id FROM steps s
       JOIN groups gr ON s.group_id = gr.id
       JOIN goals g ON gr.goal_id = g.id
      WHERE s.id = $1 AND g.owner_id = $2`,
    [stepId, ownerId]
  );
  return rows[0]?.goal_id ?? null;
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
 * Insert a whole goals tree (goals → groups → steps, plus notes) in order,
 * all owned by `ownerId`. Exported so user creation can seed a new owner in the
 * same transaction that inserts the user row.
 */
export async function insertGoals(client: Client, ownerId: string, goals: Goal[]): Promise<void> {
  for (const [goalIndex, goal] of goals.entries()) {
    await client.query(
      `INSERT INTO goals (id, owner_id, title, why, created_at, updated_at, status, paused_at, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        goal.id,
        ownerId,
        goal.title,
        goal.why ?? null,
        goal.createdAt,
        // Client-owned: the web app bumps only the goal it mutated, so stamps
        // survive the whole-store rewrite. Absent on legacy payloads.
        goal.updatedAt ?? goal.createdAt,
        goal.status ?? "active",
        goal.pausedAt ?? null,
        goalIndex,
      ]
    );

    // The step ids this goal actually has, so a note's `stepId` that points at a
    // since-deleted step is stored as NULL rather than tripping the foreign key.
    const stepIds = new Set<string>();

    for (const [groupIndex, group] of goal.groups.entries()) {
      await client.query(
        "INSERT INTO groups (id, goal_id, title, position) VALUES ($1, $2, $3, $4)",
        [group.id, goal.id, group.title, groupIndex]
      );

      for (const [stepIndex, step] of group.steps.entries()) {
        stepIds.add(step.id);
        await client.query(
          "INSERT INTO steps (id, group_id, text, description, done, position) VALUES ($1, $2, $3, $4, $5, $6)",
          [step.id, group.id, step.text, step.description ?? null, step.done, stepIndex]
        );
      }
    }

    for (const note of goal.notes ?? []) {
      const stepId = note.stepId && stepIds.has(note.stepId) ? note.stepId : null;
      await client.query(
        "INSERT INTO notes (id, goal_id, text, created_at, step_id) VALUES ($1, $2, $3, $4, $5)",
        [note.id, goal.id, note.text, note.createdAt, stepId]
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
    updated_at: number;
    status: GoalStatus;
    paused_at: number | null;
  }>(
    `SELECT id, title, why, created_at, updated_at, status, paused_at
       FROM goals WHERE owner_id = $1 ORDER BY position, id`,
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
    description: string | null;
    done: boolean;
  }>(
    `SELECT s.id, s.group_id, s.text, s.description, s.done
       FROM steps s
       JOIN groups gr ON s.group_id = gr.id
       JOIN goals g ON gr.goal_id = g.id
      WHERE g.owner_id = $1
      ORDER BY s.position, s.id`,
    [ownerId]
  );

  const noteRows = await pool.query<{
    id: string;
    goal_id: string;
    text: string;
    created_at: number;
    step_id: string | null;
  }>(
    `SELECT n.id, n.goal_id, n.text, n.created_at, n.step_id
       FROM notes n JOIN goals g ON n.goal_id = g.id
      WHERE g.owner_id = $1
      ORDER BY n.created_at DESC, n.id`,
    [ownerId]
  );

  const stepsByGroup = new Map<string, Step[]>();
  for (const s of stepRows.rows) {
    const list = stepsByGroup.get(s.group_id) ?? [];
    list.push(toStep(s));
    stepsByGroup.set(s.group_id, list);
  }

  const groupsByGoal = new Map<string, Group[]>();
  for (const g of groupRows.rows) {
    const list = groupsByGoal.get(g.goal_id) ?? [];
    list.push({ id: g.id, title: g.title, steps: stepsByGroup.get(g.id) ?? [] });
    groupsByGoal.set(g.goal_id, list);
  }

  const notesByGoal = new Map<string, Note[]>();
  for (const n of noteRows.rows) {
    const list = notesByGoal.get(n.goal_id) ?? [];
    list.push({
      id: n.id,
      text: n.text,
      createdAt: n.created_at,
      ...(n.step_id ? { stepId: n.step_id } : {}),
    });
    notesByGoal.set(n.goal_id, list);
  }

  const goals: Goal[] = goalRows.rows.map((g) => ({
    id: g.id,
    title: g.title,
    ...(g.why ? { why: g.why } : {}),
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    status: g.status,
    ...(g.paused_at ? { pausedAt: g.paused_at } : {}),
    groups: groupsByGoal.get(g.id) ?? [],
    notes: notesByGoal.get(g.id) ?? [],
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
    const now = Date.now();
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      ...(why?.trim() ? { why: why.trim() } : {}),
      createdAt: now,
      updatedAt: now,
      status: "active",
      groups: [],
      notes: [],
    };
    // New goals go to the top of this owner's list, matching the app's addGoal.
    await client.query("UPDATE goals SET position = position + 1 WHERE owner_id = $1", [ownerId]);
    await client.query(
      `INSERT INTO goals (id, owner_id, title, why, created_at, updated_at, status, position)
       VALUES ($1, $2, $3, $4, $5, $5, 'active', 0)`,
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

    await touchGoal(client, goalId);
    await touch(client, ownerId);
  });

  return getGoal(pool, ownerId, goalId);
}

/**
 * Pause or resume a goal. Pausing records when; resuming clears it. Either
 * transition counts as activity, so the goal's `updated_at` moves too.
 */
export async function setGoalStatus(
  pool: Pool,
  ownerId: string,
  goalId: string,
  status: GoalStatus
): Promise<Goal> {
  await withTransaction(pool, async (client) => {
    const now = Date.now();
    const { rowCount } = await client.query(
      "UPDATE goals SET status = $3, paused_at = $4, updated_at = $5 WHERE id = $1 AND owner_id = $2",
      [goalId, ownerId, status, status === "paused" ? now : null, now]
    );
    if (!rowCount) throw new NotFoundError("Goal", goalId);
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
    await touchGoal(client, goalId);
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
    const goalId = await goalIdOfGroup(client, ownerId, groupId);
    if (!goalId) throw new NotFoundError("Group", groupId);
    await client.query("UPDATE groups SET title = $2 WHERE id = $1", [groupId, title.trim()]);
    await touchGoal(client, goalId);
    await touch(client, ownerId);
  });
}

export async function deleteGroup(pool: Pool, ownerId: string, groupId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ goal_id: string }>(
      `DELETE FROM groups
        WHERE id = $1 AND goal_id IN (SELECT id FROM goals WHERE owner_id = $2)
        RETURNING goal_id`,
      [groupId, ownerId]
    );
    if (!rows[0]) throw new NotFoundError("Group", groupId);
    await touchGoal(client, rows[0].goal_id);
    await touch(client, ownerId);
  });
}

export async function addStep(
  pool: Pool,
  ownerId: string,
  groupId: string,
  text: string,
  description?: string
): Promise<Step> {
  return withTransaction(pool, async (client) => {
    const goalId = await goalIdOfGroup(client, ownerId, groupId);
    if (!goalId) throw new NotFoundError("Group", groupId);

    const desc = description?.trim() || null;
    const step: Step = { id: uid(), text: text.trim(), ...(desc ? { description: desc } : {}), done: false };
    await client.query(
      `INSERT INTO steps (id, group_id, text, description, done, position)
       VALUES ($1, $2, $3, $4, FALSE, (SELECT COALESCE(MAX(position) + 1, 0) FROM steps WHERE group_id = $2))`,
      [step.id, groupId, step.text, desc]
    );
    await touchGoal(client, goalId);
    await touch(client, ownerId);
    return step;
  });
}

// Steps reach their owner through group → goal; this fragment scopes a step id.
const OWNED_STEP = `id = $1 AND group_id IN (
  SELECT gr.id FROM groups gr JOIN goals g ON gr.goal_id = g.id WHERE g.owner_id = $2
)`;

const STEP_COLS = "id, text, description, done";

/**
 * Edit a step's title and/or description, leaving its done flag alone. Fields
 * left undefined are untouched; passing an empty `description` clears it,
 * mirroring how updateGoal treats a goal's `why`.
 */
export async function editStep(
  pool: Pool,
  ownerId: string,
  stepId: string,
  changes: { text?: string; description?: string }
): Promise<Step> {
  return withTransaction(pool, async (client) => {
    const goalId = await goalIdOfStep(client, ownerId, stepId);
    if (!goalId) throw new NotFoundError("Step", stepId);

    if (changes.text !== undefined) {
      const next = changes.text.trim();
      if (!next) throw new ValidationError("A step needs some text");
      await client.query(`UPDATE steps SET text = $3 WHERE ${OWNED_STEP}`, [stepId, ownerId, next]);
    }

    if (changes.description !== undefined) {
      await client.query(`UPDATE steps SET description = $3 WHERE ${OWNED_STEP}`, [
        stepId,
        ownerId,
        changes.description.trim() || null,
      ]);
    }

    const { rows } = await client.query<{
      id: string;
      text: string;
      description: string | null;
      done: boolean;
    }>(`SELECT ${STEP_COLS} FROM steps WHERE ${OWNED_STEP}`, [stepId, ownerId]);
    await touchGoal(client, goalId);
    await touch(client, ownerId);
    return toStep(rows[0]!);
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
    const { rows } = await client.query<{
      id: string;
      text: string;
      description: string | null;
      done: boolean;
    }>(
      `UPDATE steps SET done = COALESCE($3, NOT done) WHERE ${OWNED_STEP} RETURNING ${STEP_COLS}`,
      [stepId, ownerId, done ?? null]
    );
    const step = rows[0];
    if (!step) throw new NotFoundError("Step", stepId);
    const goalId = await goalIdOfStep(client, ownerId, stepId);
    if (goalId) await touchGoal(client, goalId);
    await touch(client, ownerId);
    return toStep(step);
  });
}

export async function deleteStep(pool: Pool, ownerId: string, stepId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const goalId = await goalIdOfStep(client, ownerId, stepId);
    if (!goalId) throw new NotFoundError("Step", stepId);
    await client.query(`DELETE FROM steps WHERE ${OWNED_STEP}`, [stepId, ownerId]);
    await touchGoal(client, goalId);
    await touch(client, ownerId);
  });
}

export async function listNotes(
  pool: Pool,
  ownerId: string,
  goalId: string
): Promise<Note[]> {
  const goal = await getGoal(pool, ownerId, goalId);
  return goal.notes ?? [];
}

/** True if `stepId` is a step under `goalId`, owned by `ownerId`. */
async function stepInGoal(
  client: Client,
  ownerId: string,
  goalId: string,
  stepId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM steps s
       JOIN groups gr ON s.group_id = gr.id
       JOIN goals g ON gr.goal_id = g.id
      WHERE s.id = $1 AND gr.goal_id = $2 AND g.owner_id = $3`,
    [stepId, goalId, ownerId]
  );
  return Boolean(rowCount);
}

/** Shape a note row into a domain Note, omitting an absent step link. */
function toNote(row: { id: string; text: string; created_at: number; step_id: string | null }): Note {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    ...(row.step_id ? { stepId: row.step_id } : {}),
  };
}

export async function addNote(
  pool: Pool,
  ownerId: string,
  goalId: string,
  text: string,
  stepId?: string
): Promise<Note> {
  return withTransaction(pool, async (client) => {
    await requireGoal(client, ownerId, goalId);
    if (stepId && !(await stepInGoal(client, ownerId, goalId, stepId))) {
      throw new ValidationError("That step isn't part of this goal");
    }
    const linkedStep = stepId || null;
    const note = toNote({ id: uid(), text: text.trim(), created_at: Date.now(), step_id: linkedStep });
    await client.query(
      "INSERT INTO notes (id, goal_id, text, created_at, step_id) VALUES ($1, $2, $3, $4, $5)",
      [note.id, goalId, note.text, note.createdAt, linkedStep]
    );
    await touchGoal(client, goalId);
    await touch(client, ownerId);
    return note;
  });
}

// Notes reach their owner through goal; this fragment scopes a note id.
const OWNED_NOTE = "id = $1 AND goal_id IN (SELECT id FROM goals WHERE owner_id = $2)";

/**
 * Edit a note's text and/or its linked step. Fields left undefined are
 * untouched; passing an empty `stepId` unlinks the note from any step.
 */
export async function editNote(
  pool: Pool,
  ownerId: string,
  noteId: string,
  changes: { text?: string; stepId?: string }
): Promise<Note> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{
      id: string;
      goal_id: string;
      text: string;
      created_at: number;
      step_id: string | null;
    }>(`SELECT id, goal_id, text, created_at, step_id FROM notes WHERE ${OWNED_NOTE}`, [
      noteId,
      ownerId,
    ]);
    const row = rows[0];
    if (!row) throw new NotFoundError("Note", noteId);

    if (changes.text !== undefined) {
      const next = changes.text.trim();
      if (!next) throw new ValidationError("A note needs some text");
      await client.query(`UPDATE notes SET text = $3 WHERE ${OWNED_NOTE}`, [noteId, ownerId, next]);
    }

    if (changes.stepId !== undefined) {
      let linkedStep: string | null = null;
      if (changes.stepId) {
        if (!(await stepInGoal(client, ownerId, row.goal_id, changes.stepId))) {
          throw new ValidationError("That step isn't part of this goal");
        }
        linkedStep = changes.stepId;
      }
      await client.query(`UPDATE notes SET step_id = $3 WHERE ${OWNED_NOTE}`, [
        noteId,
        ownerId,
        linkedStep,
      ]);
    }

    const { rows: updated } = await client.query<{
      id: string;
      text: string;
      created_at: number;
      step_id: string | null;
    }>(`SELECT id, text, created_at, step_id FROM notes WHERE ${OWNED_NOTE}`, [noteId, ownerId]);
    await touchGoal(client, row.goal_id);
    await touch(client, ownerId);
    return toNote(updated[0]!);
  });
}

export async function deleteNote(pool: Pool, ownerId: string, noteId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ goal_id: string }>(
      `DELETE FROM notes WHERE ${OWNED_NOTE} RETURNING goal_id`,
      [noteId, ownerId]
    );
    if (!rows[0]) throw new NotFoundError("Note", noteId);
    await touchGoal(client, rows[0].goal_id);
    await touch(client, ownerId);
  });
}
