import "server-only";
import { Prisma } from "@prisma/client";
import { withTransaction, type Client, type Pool } from "./db";
import {
  isTaskDone,
  uid,
  utcMidnight,
  type Note,
  type Goal,
  type GoalStatus,
  type Group,
  type Step,
  type Task,
} from "./domain";

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
  tasks: Task[];
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

// BIGINT columns are epoch-millisecond timestamps the app treats as plain
// `number` (well within Number's safe range). Prisma's model-API hands them back
// as JS `bigint`, so the row shapers below coerce at the boundary — the same job
// the raw path's `fromDb` does for `client.query`.
const ms = (v: bigint | number): number => Number(v);

/** Shape a step row into a domain Step, omitting absent optional fields. */
function toStep(row: {
  id: string;
  text: string;
  description: string | null;
  done: boolean;
  due_date: bigint | number | null;
}): Step {
  return {
    id: row.id,
    text: row.text,
    ...(row.description ? { description: row.description } : {}),
    done: row.done,
    ...(row.due_date ? { dueDate: ms(row.due_date) } : {}),
  };
}

/** Shape a task row into a domain Task, omitting absent optional fields. */
function toTask(row: {
  id: string;
  goal_id: string | null;
  title: string;
  description: string | null;
  daily: boolean;
  due_date: bigint | number | null;
  done: boolean;
  completed_on: bigint | number | null;
  created_at: bigint | number;
}): Task {
  return {
    id: row.id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    ...(row.goal_id ? { goalId: row.goal_id } : {}),
    ...(row.daily ? { daily: true } : {}),
    ...(row.due_date ? { dueDate: ms(row.due_date) } : {}),
    done: row.done,
    ...(row.completed_on ? { completedOn: ms(row.completed_on) } : {}),
    createdAt: ms(row.created_at),
  };
}

/** Shape a note row into a domain Note, omitting an absent step link. */
function toNote(row: {
  id: string;
  text: string;
  created_at: bigint | number;
  step_id: string | null;
}): Note {
  return {
    id: row.id,
    text: row.text,
    createdAt: ms(row.created_at),
    ...(row.step_id ? { stepId: row.step_id } : {}),
  };
}

// Every read and write below is scoped to one owner (a user id). Goals and tasks
// carry `owner_id`; groups, steps and notes reach it through their goal, so those
// queries scope on the relation (`where: { goal: { owner_id } }`) rather than a
// bare row id. This is what keeps one user from seeing or touching another's data
// even though ids are globally unique.

/** A step reaches its owner through its parent — the group's goal, or the goal
 *  itself for an ungrouped step. This where-fragment scopes a step id to an owner. */
function ownedStep(ownerId: string, stepId: string): Prisma.StepWhereInput {
  return {
    id: stepId,
    OR: [{ goal: { owner_id: ownerId } }, { group: { goal: { owner_id: ownerId } } }],
  };
}

/** Notes reach their owner through their goal; this scopes a note id to an owner. */
function ownedNote(ownerId: string, noteId: string): Prisma.NoteWhereInput {
  return { id: noteId, goal: { owner_id: ownerId } };
}

/** Bump the owner's last-write stamp and return it. */
async function touch(client: Client, ownerId: string): Promise<number> {
  const now = Date.now();
  await client.db.user.updateMany({ where: { id: ownerId }, data: { goals_updated_at: BigInt(now) } });
  return now;
}

/**
 * Bump one goal's last-activity stamp. Called by the targeted mutations below
 * (the web app's whole-store PUT instead persists the client's own stamps —
 * see insertGoals). `goalId` is already ownership-checked by every caller.
 */
async function touchGoal(client: Client, goalId: string): Promise<void> {
  await client.db.goal.updateMany({ where: { id: goalId }, data: { updated_at: BigInt(Date.now()) } });
}

/** Resolve a group's goal, scoped to the owner; null if not theirs. */
async function goalIdOfGroup(
  client: Client,
  ownerId: string,
  groupId: string
): Promise<string | null> {
  const group = await client.db.group.findFirst({
    where: { id: groupId, goal: { owner_id: ownerId } },
    select: { goal_id: true },
  });
  return group?.goal_id ?? null;
}

/**
 * Resolve a step's goal, scoped to the owner; null if not theirs. A step's
 * parent is either its group's goal or — for an ungrouped step — the goal
 * itself, hence the two branches.
 */
async function goalIdOfStep(
  client: Client,
  ownerId: string,
  stepId: string
): Promise<string | null> {
  const step = await client.db.step.findFirst({
    where: ownedStep(ownerId, stepId),
    select: { goal_id: true, group: { select: { goal_id: true } } },
  });
  if (!step) return null;
  return step.goal_id ?? step.group?.goal_id ?? null;
}

/** The owner's last-write stamp, or null if they've never been written to. */
async function readUpdatedAt(client: Client | Pool, ownerId: string): Promise<number | null> {
  const user = await client.db.user.findUnique({
    where: { id: ownerId },
    select: { goals_updated_at: true },
  });
  return user?.goals_updated_at != null ? ms(user.goals_updated_at) : null;
}

/**
 * Insert a whole goals tree (goals → groups → steps, plus notes) in order,
 * all owned by `ownerId`. Exported so user creation can seed a new owner in the
 * same transaction that inserts the user row.
 *
 * Flattened into one `createMany` per table (goals, then groups, then steps,
 * then notes) — FK order is satisfied because the whole tree lands inside the
 * caller's transaction.
 */
export async function insertGoals(client: Client, ownerId: string, goals: Goal[]): Promise<void> {
  const goalRows: Prisma.GoalCreateManyInput[] = [];
  const groupRows: Prisma.GroupCreateManyInput[] = [];
  const stepRows: Prisma.StepCreateManyInput[] = [];
  const noteRows: Prisma.NoteCreateManyInput[] = [];

  for (const [goalIndex, goal] of goals.entries()) {
    goalRows.push({
      id: goal.id,
      owner_id: ownerId,
      title: goal.title,
      why: goal.why ?? null,
      created_at: BigInt(goal.createdAt),
      // Client-owned: the web app bumps only the goal it mutated, so stamps
      // survive the whole-store rewrite. Absent on legacy payloads.
      updated_at: BigInt(goal.updatedAt ?? goal.createdAt),
      status: goal.status ?? "active",
      paused_at: goal.pausedAt != null ? BigInt(goal.pausedAt) : null,
      due_date: goal.dueDate != null ? BigInt(goal.dueDate) : null,
      position: goalIndex,
    });

    // The step ids this goal actually has, so a note's `stepId` that points at a
    // since-deleted step is stored as NULL rather than tripping the foreign key.
    const stepIds = new Set<string>();

    // The goal's own steps, outside any group: goal_id set, group_id NULL.
    (goal.steps ?? []).forEach((step, stepIndex) => {
      stepIds.add(step.id);
      stepRows.push({
        id: step.id,
        goal_id: goal.id,
        text: step.text,
        description: step.description ?? null,
        done: step.done,
        due_date: step.dueDate != null ? BigInt(step.dueDate) : null,
        position: stepIndex,
      });
    });

    goal.groups.forEach((group, groupIndex) => {
      groupRows.push({
        id: group.id,
        goal_id: goal.id,
        title: group.title,
        due_date: group.dueDate != null ? BigInt(group.dueDate) : null,
        position: groupIndex,
      });

      group.steps.forEach((step, stepIndex) => {
        stepIds.add(step.id);
        stepRows.push({
          id: step.id,
          group_id: group.id,
          text: step.text,
          description: step.description ?? null,
          done: step.done,
          due_date: step.dueDate != null ? BigInt(step.dueDate) : null,
          position: stepIndex,
        });
      });
    });

    for (const note of goal.notes ?? []) {
      const stepId = note.stepId && stepIds.has(note.stepId) ? note.stepId : null;
      noteRows.push({
        id: note.id,
        goal_id: goal.id,
        text: note.text,
        created_at: BigInt(note.createdAt),
        step_id: stepId,
      });
    }
  }

  if (goalRows.length) await client.db.goal.createMany({ data: goalRows });
  if (groupRows.length) await client.db.group.createMany({ data: groupRows });
  if (stepRows.length) await client.db.step.createMany({ data: stepRows });
  if (noteRows.length) await client.db.note.createMany({ data: noteRows });
}

/**
 * Insert an owner's task list in order. A task's `goalId` must land on one of
 * the owner's goals; anything else (a since-deleted goal, someone else's id) is
 * stored as NULL rather than tripping the foreign key — mirroring how notes
 * treat a stale `stepId`.
 */
async function insertTasks(client: Client, ownerId: string, tasks: Task[]): Promise<void> {
  const goals = await client.db.goal.findMany({ where: { owner_id: ownerId }, select: { id: true } });
  const goalIds = new Set(goals.map((g) => g.id));

  const rows: Prisma.TaskCreateManyInput[] = tasks.map((task, index) => ({
    id: task.id,
    owner_id: ownerId,
    goal_id: task.goalId && goalIds.has(task.goalId) ? task.goalId : null,
    title: task.title,
    description: task.description ?? null,
    daily: task.daily ?? false,
    due_date: task.dueDate != null ? BigInt(task.dueDate) : null,
    done: task.done,
    completed_on: task.completedOn != null ? BigInt(task.completedOn) : null,
    created_at: BigInt(task.createdAt),
    position: index,
  }));

  if (rows.length) await client.db.task.createMany({ data: rows });
}

/** One owner's tasks, in their arranged order. */
async function readTasks(client: Client | Pool, ownerId: string): Promise<Task[]> {
  const rows = await client.db.task.findMany({
    where: { owner_id: ownerId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  return rows.map(toTask);
}

/** Assemble one owner's whole store: five flat queries, stitched together in memory. */
export async function getState(pool: Pool, ownerId: string): Promise<StoreState> {
  const updatedAt = await readUpdatedAt(pool, ownerId);

  const goalRows = await pool.db.goal.findMany({
    where: { owner_id: ownerId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

  const groupRows = await pool.db.group.findMany({
    where: { goal: { owner_id: ownerId } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

  // A step hangs off a group or directly off a goal (ungrouped); either way its
  // owner is reached through that parent.
  const stepRows = await pool.db.step.findMany({
    where: { OR: [{ goal: { owner_id: ownerId } }, { group: { goal: { owner_id: ownerId } } }] },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

  const noteRows = await pool.db.note.findMany({
    where: { goal: { owner_id: ownerId } },
    orderBy: [{ created_at: "desc" }, { id: "asc" }],
  });

  const stepsByGroup = new Map<string, Step[]>();
  const stepsByGoal = new Map<string, Step[]>();
  for (const s of stepRows) {
    if (s.group_id) {
      const list = stepsByGroup.get(s.group_id) ?? [];
      list.push(toStep(s));
      stepsByGroup.set(s.group_id, list);
    } else if (s.goal_id) {
      const list = stepsByGoal.get(s.goal_id) ?? [];
      list.push(toStep(s));
      stepsByGoal.set(s.goal_id, list);
    }
  }

  const groupsByGoal = new Map<string, Group[]>();
  for (const g of groupRows) {
    const list = groupsByGoal.get(g.goal_id) ?? [];
    list.push({
      id: g.id,
      title: g.title,
      steps: stepsByGroup.get(g.id) ?? [],
      ...(g.due_date ? { dueDate: ms(g.due_date) } : {}),
    });
    groupsByGoal.set(g.goal_id, list);
  }

  const notesByGoal = new Map<string, Note[]>();
  for (const n of noteRows) {
    const list = notesByGoal.get(n.goal_id) ?? [];
    list.push(toNote(n));
    notesByGoal.set(n.goal_id, list);
  }

  const tasks = await readTasks(pool, ownerId);

  const goals: Goal[] = goalRows.map((g) => ({
    id: g.id,
    title: g.title,
    ...(g.why ? { why: g.why } : {}),
    createdAt: ms(g.created_at),
    updatedAt: ms(g.updated_at),
    status: g.status as GoalStatus,
    ...(g.paused_at ? { pausedAt: ms(g.paused_at) } : {}),
    ...(g.due_date ? { dueDate: ms(g.due_date) } : {}),
    steps: stepsByGoal.get(g.id) ?? [],
    groups: groupsByGoal.get(g.id) ?? [],
    notes: notesByGoal.get(g.id) ?? [],
  }));

  return { initialized: updatedAt !== null, updatedAt: updatedAt ?? 0, goals, tasks };
}

export async function getGoal(pool: Pool, ownerId: string, goalId: string): Promise<Goal> {
  const { goals } = await getState(pool, ownerId);
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) throw new NotFoundError("Goal", goalId);
  return goal;
}

/**
 * Replace one owner's entire store with `goals` (and `tasks`) — the write path
 * for the web app's sync. Runs in one transaction, so a reader never sees a
 * half-applied state.
 *
 * `tasks` left undefined leaves the tasks table alone — a client from before
 * tasks existed can still save its goals without silently wiping them. (The
 * goals rewrite would null the tasks' goal links via ON DELETE SET NULL, so the
 * kept tasks are re-pointed at the re-inserted goals afterwards.)
 *
 * `baseUpdatedAt` is the version the client believed it was editing. If the
 * server has moved on since (an MCP tool wrote in the meantime), we reject
 * rather than clobber. Pass `null` to force the write.
 */
export async function replaceAll(
  pool: Pool,
  ownerId: string,
  goals: Goal[],
  baseUpdatedAt: number | null,
  tasks?: Task[]
): Promise<StoreState> {
  return withTransaction(pool, async (client) => {
    // Lock this owner's row for the duration so a concurrent writer for the same
    // user can't slip between the version check and the rewrite. `FOR UPDATE` has
    // no model-API equivalent, so this one stays raw. Other users are unaffected.
    const { rows } = await client.query<{ goals_updated_at: number | null }>(
      "SELECT goals_updated_at FROM users WHERE id = $1 FOR UPDATE",
      [ownerId]
    );
    if (rows.length === 0) throw new NotFoundError("User", ownerId);
    const current = rows[0]!.goals_updated_at;

    if (baseUpdatedAt !== null && current !== null && current > baseUpdatedAt) {
      throw new ConflictError(current);
    }

    // A legacy save keeps the stored tasks; snapshot them before the goals
    // rewrite severs their goal links.
    const keptTasks = tasks === undefined ? await readTasks(client, ownerId) : undefined;

    await client.db.goal.deleteMany({ where: { owner_id: ownerId } });
    await insertGoals(client, ownerId, goals);

    await client.db.task.deleteMany({ where: { owner_id: ownerId } });
    const nextTasks = tasks ?? keptTasks ?? [];
    await insertTasks(client, ownerId, nextTasks);

    const updatedAt = await touch(client, ownerId);
    return { initialized: true, updatedAt, goals, tasks: await readTasks(client, ownerId) };
  });
}

// ---- targeted mutations (what the MCP tools call) ----
//
// Each resolves the target through its owner, so a stray id from another user's
// store simply isn't found — the ownership check and the "does it exist" check
// are the same query.

async function requireGoal(client: Client, ownerId: string, goalId: string): Promise<void> {
  const count = await client.db.goal.count({ where: { id: goalId, owner_id: ownerId } });
  if (!count) throw new NotFoundError("Goal", goalId);
}

export async function createGoal(
  pool: Pool,
  ownerId: string,
  title: string,
  why?: string,
  dueDate?: number
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
      ...(dueDate ? { dueDate } : {}),
      steps: [],
      groups: [],
      notes: [],
    };
    // New goals go to the top of this owner's list, matching the app's addGoal.
    await client.db.goal.updateMany({
      where: { owner_id: ownerId },
      data: { position: { increment: 1 } },
    });
    await client.db.goal.create({
      data: {
        id: goal.id,
        owner_id: ownerId,
        title: goal.title,
        why: goal.why ?? null,
        created_at: BigInt(now),
        updated_at: BigInt(now),
        status: "active",
        due_date: goal.dueDate != null ? BigInt(goal.dueDate) : null,
        position: 0,
      },
    });
    await touch(client, ownerId);
    return goal;
  });
}

/**
 * Change a goal's title, its "why", and/or its due date. Fields left undefined
 * are untouched; passing an empty `why` clears it, and a null `dueDate` clears
 * the deadline, matching how the app treats the fields.
 */
export async function updateGoal(
  pool: Pool,
  ownerId: string,
  goalId: string,
  changes: { title?: string; why?: string; dueDate?: number | null }
): Promise<Goal> {
  await withTransaction(pool, async (client) => {
    await requireGoal(client, ownerId, goalId);

    const data: Prisma.GoalUpdateManyMutationInput = {};
    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (!title) throw new ValidationError("A goal needs a title");
      data.title = title;
    }
    if (changes.why !== undefined) data.why = changes.why.trim() || null;
    if (changes.dueDate !== undefined) {
      data.due_date = changes.dueDate === null ? null : BigInt(changes.dueDate);
    }
    if (Object.keys(data).length > 0) {
      await client.db.goal.updateMany({ where: { id: goalId, owner_id: ownerId }, data });
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
    const { count } = await client.db.goal.updateMany({
      where: { id: goalId, owner_id: ownerId },
      data: {
        status,
        paused_at: status === "paused" ? BigInt(now) : null,
        updated_at: BigInt(now),
      },
    });
    if (!count) throw new NotFoundError("Goal", goalId);
    await touch(client, ownerId);
  });

  return getGoal(pool, ownerId, goalId);
}

export async function deleteGoal(pool: Pool, ownerId: string, goalId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { count } = await client.db.goal.deleteMany({ where: { id: goalId, owner_id: ownerId } });
    if (!count) throw new NotFoundError("Goal", goalId);
    await touch(client, ownerId);
  });
}

export async function addGroup(
  pool: Pool,
  ownerId: string,
  goalId: string,
  title: string,
  dueDate?: number
): Promise<Group> {
  return withTransaction(pool, async (client) => {
    await requireGoal(client, ownerId, goalId);
    const group: Group = { id: uid(), title: title.trim(), steps: [], ...(dueDate ? { dueDate } : {}) };
    const { _max } = await client.db.group.aggregate({
      where: { goal_id: goalId },
      _max: { position: true },
    });
    await client.db.group.create({
      data: {
        id: group.id,
        goal_id: goalId,
        title: group.title,
        due_date: group.dueDate != null ? BigInt(group.dueDate) : null,
        position: (_max.position ?? -1) + 1,
      },
    });
    await touchGoal(client, goalId);
    await touch(client, ownerId);
    return group;
  });
}

/**
 * Change a group's title and/or due date. A null `dueDate` clears the
 * deadline; leaving it undefined keeps whatever is there.
 */
export async function renameGroup(
  pool: Pool,
  ownerId: string,
  groupId: string,
  title: string,
  dueDate?: number | null
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const goalId = await goalIdOfGroup(client, ownerId, groupId);
    if (!goalId) throw new NotFoundError("Group", groupId);
    const data: Prisma.GroupUpdateManyMutationInput = { title: title.trim() };
    if (dueDate !== undefined) data.due_date = dueDate === null ? null : BigInt(dueDate);
    await client.db.group.updateMany({ where: { id: groupId, goal: { owner_id: ownerId } }, data });
    await touchGoal(client, goalId);
    await touch(client, ownerId);
  });
}

export async function deleteGroup(pool: Pool, ownerId: string, groupId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const group = await client.db.group.findFirst({
      where: { id: groupId, goal: { owner_id: ownerId } },
      select: { goal_id: true },
    });
    if (!group) throw new NotFoundError("Group", groupId);
    await client.db.group.deleteMany({ where: { id: groupId, goal: { owner_id: ownerId } } });
    await touchGoal(client, group.goal_id);
    await touch(client, ownerId);
  });
}

/**
 * Add a step under exactly one parent: a group (`target.groupId`) or directly
 * on a goal (`target.goalId`) for an ungrouped step.
 */
/** One step to add: its parent (exactly one of goalId/groupId) plus its fields. */
export type StepSpec = {
  target: { goalId?: string; groupId?: string };
  text: string;
  description?: string;
  dueDate?: number;
};

/**
 * Add one or more steps in a single transaction. Each spec goes to a group or
 * a goal (exactly one). All specs are validated up front, so a bad target
 * rolls back the whole batch — the store never lands half-written. Each
 * affected goal (and the owner) is stamped once, not once per step. Returns the
 * created steps in the order given.
 */
export async function addSteps(pool: Pool, ownerId: string, specs: StepSpec[]): Promise<Step[]> {
  for (const { target } of specs) {
    if (Boolean(target.goalId) === Boolean(target.groupId)) {
      throw new ValidationError("A step needs exactly one parent — pass a goalId or a groupId");
    }
  }
  return withTransaction(pool, async (client) => {
    const created: Step[] = [];
    const goalIds = new Set<string>();
    for (const { target, text, description, dueDate } of specs) {
      let goalId: string;
      if (target.groupId) {
        const resolved = await goalIdOfGroup(client, ownerId, target.groupId);
        if (!resolved) throw new NotFoundError("Group", target.groupId);
        goalId = resolved;
      } else {
        await requireGoal(client, ownerId, target.goalId!);
        goalId = target.goalId!;
      }

      const desc = description?.trim() || null;
      const step: Step = {
        id: uid(),
        text: text.trim(),
        ...(desc ? { description: desc } : {}),
        done: false,
        ...(dueDate ? { dueDate } : {}),
      };
      // Position is next-in-parent: max within the group, or within the goal
      // for an ungrouped step. Re-read per step so earlier inserts in this same
      // batch are counted.
      const scope: Prisma.StepWhereInput = target.groupId
        ? { group_id: target.groupId }
        : { goal_id: goalId };
      const { _max } = await client.db.step.aggregate({ where: scope, _max: { position: true } });
      await client.db.step.create({
        data: {
          id: step.id,
          ...(target.groupId ? { group_id: target.groupId } : { goal_id: goalId }),
          text: step.text,
          description: desc,
          done: false,
          due_date: step.dueDate != null ? BigInt(step.dueDate) : null,
          position: (_max.position ?? -1) + 1,
        },
      });
      goalIds.add(goalId);
      created.push(step);
    }
    for (const goalId of goalIds) await touchGoal(client, goalId);
    await touch(client, ownerId);
    return created;
  });
}

/** Add a single step — a thin wrapper over {@link addSteps}. */
export async function addStep(
  pool: Pool,
  ownerId: string,
  target: { goalId?: string; groupId?: string },
  text: string,
  description?: string,
  dueDate?: number
): Promise<Step> {
  const [step] = await addSteps(pool, ownerId, [{ target, text, description, dueDate }]);
  return step!;
}

/**
 * Edit a step's title, description and/or due date, leaving its done flag
 * alone. Fields left undefined are untouched; an empty `description` clears
 * it, and a null `dueDate` clears the deadline.
 */
export async function editStep(
  pool: Pool,
  ownerId: string,
  stepId: string,
  changes: { text?: string; description?: string; dueDate?: number | null }
): Promise<Step> {
  return withTransaction(pool, async (client) => {
    const goalId = await goalIdOfStep(client, ownerId, stepId);
    if (!goalId) throw new NotFoundError("Step", stepId);

    const data: Prisma.StepUpdateManyMutationInput = {};
    if (changes.text !== undefined) {
      const next = changes.text.trim();
      if (!next) throw new ValidationError("A step needs some text");
      data.text = next;
    }
    if (changes.description !== undefined) data.description = changes.description.trim() || null;
    if (changes.dueDate !== undefined) {
      data.due_date = changes.dueDate === null ? null : BigInt(changes.dueDate);
    }
    if (Object.keys(data).length > 0) {
      await client.db.step.updateMany({ where: ownedStep(ownerId, stepId), data });
    }

    const step = await client.db.step.findFirst({
      where: ownedStep(ownerId, stepId),
      select: { id: true, text: true, description: true, done: true, due_date: true },
    });
    await touchGoal(client, goalId);
    await touch(client, ownerId);
    return toStep(step!);
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
    const s = await client.db.step.findFirst({
      where: ownedStep(ownerId, stepId),
      select: {
        id: true,
        text: true,
        description: true,
        done: true,
        due_date: true,
        goal_id: true,
        group: { select: { goal_id: true } },
      },
    });
    if (!s) throw new NotFoundError("Step", stepId);

    const next = done ?? !s.done;
    await client.db.step.updateMany({ where: ownedStep(ownerId, stepId), data: { done: next } });

    const goalId = s.goal_id ?? s.group?.goal_id ?? null;
    if (goalId) await touchGoal(client, goalId);
    await touch(client, ownerId);
    return toStep({ ...s, done: next });
  });
}

/**
 * Delete one or more steps in a single transaction. Every id is resolved to an
 * owned step first, so an unknown id rolls the whole batch back rather than
 * deleting some and failing partway. Each affected goal (and the owner) is
 * stamped once.
 */
export async function deleteSteps(pool: Pool, ownerId: string, stepIds: string[]): Promise<void> {
  await withTransaction(pool, async (client) => {
    const goalIds = new Set<string>();
    for (const stepId of stepIds) {
      const goalId = await goalIdOfStep(client, ownerId, stepId);
      if (!goalId) throw new NotFoundError("Step", stepId);
      await client.db.step.deleteMany({ where: ownedStep(ownerId, stepId) });
      goalIds.add(goalId);
    }
    for (const goalId of goalIds) await touchGoal(client, goalId);
    await touch(client, ownerId);
  });
}

/** Delete a single step — a thin wrapper over {@link deleteSteps}. */
export async function deleteStep(pool: Pool, ownerId: string, stepId: string): Promise<void> {
  await deleteSteps(pool, ownerId, [stepId]);
}

export async function listNotes(pool: Pool, ownerId: string, goalId: string): Promise<Note[]> {
  const goal = await getGoal(pool, ownerId, goalId);
  return goal.notes ?? [];
}

/** True if `stepId` is a step under `goalId` (grouped or not), owned by `ownerId`. */
async function stepInGoal(
  client: Client,
  ownerId: string,
  goalId: string,
  stepId: string
): Promise<boolean> {
  const count = await client.db.step.count({
    where: {
      id: stepId,
      OR: [
        { goal: { id: goalId, owner_id: ownerId } },
        { group: { goal: { id: goalId, owner_id: ownerId } } },
      ],
    },
  });
  return count > 0;
}

/** One note to add: the goal it belongs to, its text, and an optional linked step. */
export type NoteSpec = { goalId: string; text: string; stepId?: string };

/**
 * Add one or more notes in a single transaction. Each note's goal and optional
 * linked step are validated as we go, so a bad goal or step rolls the whole
 * batch back. Each affected goal (and the owner) is stamped once. Returns the
 * created notes in the order given.
 */
export async function addNotes(pool: Pool, ownerId: string, specs: NoteSpec[]): Promise<Note[]> {
  return withTransaction(pool, async (client) => {
    const created: Note[] = [];
    const goalIds = new Set<string>();
    for (const { goalId, text, stepId } of specs) {
      await requireGoal(client, ownerId, goalId);
      if (stepId && !(await stepInGoal(client, ownerId, goalId, stepId))) {
        throw new ValidationError("That step isn't part of this goal");
      }
      const linkedStep = stepId || null;
      const now = Date.now();
      const note = toNote({ id: uid(), text: text.trim(), created_at: now, step_id: linkedStep });
      await client.db.note.create({
        data: { id: note.id, goal_id: goalId, text: note.text, created_at: BigInt(now), step_id: linkedStep },
      });
      goalIds.add(goalId);
      created.push(note);
    }
    for (const goalId of goalIds) await touchGoal(client, goalId);
    await touch(client, ownerId);
    return created;
  });
}

/** Add a single note — a thin wrapper over {@link addNotes}. */
export async function addNote(
  pool: Pool,
  ownerId: string,
  goalId: string,
  text: string,
  stepId?: string
): Promise<Note> {
  const [note] = await addNotes(pool, ownerId, [{ goalId, text, stepId }]);
  return note!;
}

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
    const row = await client.db.note.findFirst({
      where: ownedNote(ownerId, noteId),
      select: { id: true, goal_id: true, text: true, created_at: true, step_id: true },
    });
    if (!row) throw new NotFoundError("Note", noteId);

    if (changes.text !== undefined) {
      const next = changes.text.trim();
      if (!next) throw new ValidationError("A note needs some text");
      await client.db.note.updateMany({ where: ownedNote(ownerId, noteId), data: { text: next } });
    }

    if (changes.stepId !== undefined) {
      let linkedStep: string | null = null;
      if (changes.stepId) {
        if (!(await stepInGoal(client, ownerId, row.goal_id, changes.stepId))) {
          throw new ValidationError("That step isn't part of this goal");
        }
        linkedStep = changes.stepId;
      }
      // `step_id` backs the `step` relation, so Prisma excludes it from
      // updateMany's data — set it with an owner-scoped raw UPDATE.
      await client.query(
        "UPDATE notes SET step_id = $3 WHERE id = $1 AND goal_id IN (SELECT id FROM goals WHERE owner_id = $2)",
        [noteId, ownerId, linkedStep]
      );
    }

    const updated = await client.db.note.findFirst({
      where: ownedNote(ownerId, noteId),
      select: { id: true, text: true, created_at: true, step_id: true },
    });
    await touchGoal(client, row.goal_id);
    await touch(client, ownerId);
    return toNote(updated!);
  });
}

/**
 * Delete one or more notes in a single transaction. Every id is resolved to an
 * owned note first, so an unknown id rolls the whole batch back. Each affected
 * goal (and the owner) is stamped once.
 */
export async function deleteNotes(pool: Pool, ownerId: string, noteIds: string[]): Promise<void> {
  await withTransaction(pool, async (client) => {
    const goalIds = new Set<string>();
    for (const noteId of noteIds) {
      const row = await client.db.note.findFirst({
        where: ownedNote(ownerId, noteId),
        select: { goal_id: true },
      });
      if (!row) throw new NotFoundError("Note", noteId);
      await client.db.note.deleteMany({ where: ownedNote(ownerId, noteId) });
      goalIds.add(row.goal_id);
    }
    for (const goalId of goalIds) await touchGoal(client, goalId);
    await touch(client, ownerId);
  });
}

/** Delete a single note — a thin wrapper over {@link deleteNotes}. */
export async function deleteNote(pool: Pool, ownerId: string, noteId: string): Promise<void> {
  await deleteNotes(pool, ownerId, [noteId]);
}

// ---- tasks ----
//
// Tasks are owned directly (owner_id on the row), so scoping is a plain WHERE.
// Task mutations bump the owner's store stamp — the web app's whole-store PUT
// carries tasks too, so an agent's task edit must trip the same conflict check.

export async function listTasks(pool: Pool, ownerId: string): Promise<Task[]> {
  return readTasks(pool, ownerId);
}

export async function createTask(
  pool: Pool,
  ownerId: string,
  title: string,
  options: { description?: string; goalId?: string; daily?: boolean; dueDate?: number } = {}
): Promise<Task> {
  return withTransaction(pool, async (client) => {
    if (options.goalId) await requireGoal(client, ownerId, options.goalId);
    const desc = options.description?.trim() || undefined;
    const now = Date.now();
    const task: Task = {
      id: uid(),
      title: title.trim(),
      ...(desc ? { description: desc } : {}),
      ...(options.goalId ? { goalId: options.goalId } : {}),
      ...(options.daily ? { daily: true } : {}),
      ...(options.dueDate ? { dueDate: options.dueDate } : {}),
      done: false,
      createdAt: now,
    };
    // New tasks go to the top of the list, matching the app's addTask.
    await client.db.task.updateMany({
      where: { owner_id: ownerId },
      data: { position: { increment: 1 } },
    });
    await client.db.task.create({
      data: {
        id: task.id,
        owner_id: ownerId,
        goal_id: task.goalId ?? null,
        title: task.title,
        description: desc ?? null,
        daily: task.daily ?? false,
        due_date: task.dueDate != null ? BigInt(task.dueDate) : null,
        done: false,
        created_at: BigInt(now),
        position: 0,
      },
    });
    await touch(client, ownerId);
    return task;
  });
}

/**
 * Edit a task's title, description, goal link, daily flag and/or due date.
 * Fields left undefined are untouched; an empty `description` clears it, an
 * empty `goalId` unlinks it from its goal, and a null `dueDate` clears the
 * deadline. Its done state is left alone — use setTaskDone for that.
 */
export async function updateTask(
  pool: Pool,
  ownerId: string,
  taskId: string,
  changes: {
    title?: string;
    description?: string;
    goalId?: string;
    daily?: boolean;
    dueDate?: number | null;
  }
): Promise<Task> {
  return withTransaction(pool, async (client) => {
    const count = await client.db.task.count({ where: { id: taskId, owner_id: ownerId } });
    if (!count) throw new NotFoundError("Task", taskId);

    const data: Prisma.TaskUpdateManyMutationInput = {};
    if (changes.title !== undefined) {
      const next = changes.title.trim();
      if (!next) throw new ValidationError("A task needs a title");
      data.title = next;
    }
    if (changes.description !== undefined) data.description = changes.description.trim() || null;
    if (changes.daily !== undefined) {
      // Switching kind resets the completion state — a fresh daily starts
      // undone today, and a fresh one-off starts unchecked.
      data.daily = changes.daily;
      data.done = false;
      data.completed_on = null;
    }
    if (changes.dueDate !== undefined) {
      data.due_date = changes.dueDate === null ? null : BigInt(changes.dueDate);
    }
    if (Object.keys(data).length > 0) {
      await client.db.task.updateMany({ where: { id: taskId, owner_id: ownerId }, data });
    }

    if (changes.goalId !== undefined) {
      let linkedGoal: string | null = null;
      if (changes.goalId) {
        await requireGoal(client, ownerId, changes.goalId);
        linkedGoal = changes.goalId;
      }
      // `goal_id` backs the `goal` relation, so Prisma excludes it from
      // updateMany's data — set it with an owner-scoped raw UPDATE.
      await client.query("UPDATE tasks SET goal_id = $3 WHERE id = $1 AND owner_id = $2", [
        taskId,
        ownerId,
        linkedGoal,
      ]);
    }

    const row = await client.db.task.findFirst({ where: { id: taskId, owner_id: ownerId } });
    await touch(client, ownerId);
    return toTask(row!);
  });
}

/**
 * Mark a task done or not done, or flip it when `done` is omitted. For a daily
 * task "done" means done *today* — completing stamps today's UTC midnight, and
 * the stamp expiring overnight is what resets it for tomorrow.
 */
export async function setTaskDone(
  pool: Pool,
  ownerId: string,
  taskId: string,
  done?: boolean
): Promise<Task> {
  return withTransaction(pool, async (client) => {
    const row = await client.db.task.findFirst({ where: { id: taskId, owner_id: ownerId } });
    if (!row) throw new NotFoundError("Task", taskId);

    const task = toTask(row);
    const next = done ?? !isTaskDone(task);
    if (task.daily) {
      await client.db.task.updateMany({
        where: { id: taskId, owner_id: ownerId },
        data: { completed_on: next ? BigInt(utcMidnight()) : null },
      });
    } else {
      await client.db.task.updateMany({
        where: { id: taskId, owner_id: ownerId },
        data: { done: next },
      });
    }

    const updated = await client.db.task.findFirst({ where: { id: taskId, owner_id: ownerId } });
    await touch(client, ownerId);
    return toTask(updated!);
  });
}

export async function deleteTask(pool: Pool, ownerId: string, taskId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const { count } = await client.db.task.deleteMany({ where: { id: taskId, owner_id: ownerId } });
    if (!count) throw new NotFoundError("Task", taskId);
    await touch(client, ownerId);
  });
}
