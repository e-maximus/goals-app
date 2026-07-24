import "server-only";
import { z } from "zod";
import type { Pool } from "./db";
import { goalProgress, goalStatus, goalStepCounts, lastActivityAt, type Goal } from "./domain";
import { goalHref } from "@/lib/utils";
import * as repo from "./repo";

/**
 * The neutral tool registry: one description of every goals/tasks operation an
 * agent can perform, independent of transport. Both the MCP server
 * ([mcp.ts](./mcp.ts)) and the in-app AI chat build their tool surfaces from this
 * array, so there is a single vocabulary and a single place to add a capability.
 *
 * A handler receives its validated args plus a {@link ToolContext} carrying the
 * pool and the authenticated `ownerId` — every call is scoped to one user, so an
 * agent can never reach across accounts. Handlers return a plain JSON-able value;
 * each adapter wraps it in whatever shape its transport needs.
 */
export type ToolContext = {
  pool: Pool;
  ownerId: string;
  /**
   * Called after a tool that changed the store. The transports pass the search
   * reindexer here rather than the registry reaching for it, so the registry
   * keeps no opinion about request lifecycles — and a test can call a tool
   * without a background job starting behind it.
   */
  onMutation?: () => void;
};

export type ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  /** A plain object map of Zod validators (not a wrapped `z.object(...)`). */
  inputSchema: Shape;
  /** Mirrors MCP's `destructiveHint` — an irreversible delete. */
  destructive?: boolean;
  /** Changes the store, so the search index needs rebuilding after it. */
  mutates?: boolean;
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
};

/** Preserve each tool's arg types through the heterogeneous array. */
function defineTool<Shape extends z.ZodRawShape>(def: ToolDef<Shape>): ToolDef {
  return def as unknown as ToolDef;
}

/**
 * Run a tool and, if it changed anything, tell the context so.
 *
 * Every transport goes through here rather than calling `handler` directly, so
 * "a write happened" is observed in one place instead of being re-derived by
 * each adapter — which is how one of them would eventually forget.
 */
export async function runTool(
  def: ToolDef,
  args: unknown,
  ctx: ToolContext
): Promise<unknown> {
  const result = await def.handler(args as never, ctx);
  if (def.mutates) ctx.onMutation?.();
  return result;
}

/** A goal without its groups/notes bodies — enough to pick one to act on. */
function summarize(goal: Goal) {
  const { done, total } = goalStepCounts(goal);
  return {
    id: goal.id,
    url: goalHref(goal),
    title: goal.title,
    why: goal.why,
    status: goalStatus(goal),
    progressPct: goalProgress(goal),
    steps: { done, total },
    groups: goal.groups.length,
    notes: goal.notes?.length ?? 0,
    updatedAt: lastActivityAt(goal),
    ...(goal.pausedAt ? { pausedAt: goal.pausedAt } : {}),
    ...(goal.dueDate ? { dueDate: goal.dueDate } : {}),
  };
}

/** Shared shape and docs for the optional due-date inputs below. */
const dueDateInput = z
  .number()
  .optional()
  .describe("Optional deadline: epoch ms of UTC midnight of the due day");
const dueDateChange = z
  .number()
  .nullable()
  .optional()
  .describe("New deadline (epoch ms of UTC midnight); pass null to clear it");

export const tools: ToolDef[] = [
  // ---- reading ----
  defineTool({
    name: "list_goals",
    title: "List goals",
    description: "Every goal with its progress, step counts and note count.",
    inputSchema: {},
    handler: async (_args, { pool, ownerId }) => {
      const { goals } = await repo.getState(pool, ownerId);
      return goals.map(summarize);
    },
  }),
  defineTool({
    name: "get_goal",
    title: "Get a goal",
    description: "One goal in full: its groups, their steps, and its notes.",
    inputSchema: { goalId: z.string().describe("The goal's id, from list_goals") },
    handler: async (args, { pool, ownerId }) => {
      const goal = await repo.getGoal(pool, ownerId, args.goalId);
      return { ...goal, url: goalHref(goal) };
    },
  }),

  // ---- goals ----
  defineTool({
    name: "create_goal",
    mutates: true,
    title: "Create a goal",
    description: "Add a new goal. It starts with no groups and no notes.",
    inputSchema: {
      title: z.string().min(1).describe("What the user wants to achieve"),
      why: z.string().optional().describe("Why it matters to them — optional but motivating"),
      dueDate: dueDateInput,
    },
    handler: async (args, { pool, ownerId }) => {
      const goal = await repo.createGoal(pool, ownerId, args.title, args.why, args.dueDate);
      return { ...goal, url: goalHref(goal) };
    },
  }),
  defineTool({
    name: "update_goal",
    mutates: true,
    title: "Update a goal",
    description:
      "Change a goal's title, its 'why', or both. Anything you leave out stays as it is; " +
      "pass an empty `why` to clear it. Use this rather than deleting and recreating — " +
      "deleting a goal takes its groups, steps and notes with it.",
    inputSchema: {
      goalId: z.string(),
      title: z.string().min(1).optional().describe("The new title, if it should change"),
      why: z.string().optional().describe("The new reason; pass an empty string to clear it"),
      dueDate: dueDateChange,
    },
    handler: async (args, { pool, ownerId }) => {
      const { goalId, title, why, dueDate } = args;
      if (title === undefined && why === undefined && dueDate === undefined) {
        throw new Error("Nothing to update — pass a title, a why, a dueDate, or several.");
      }
      const goal = await repo.updateGoal(pool, ownerId, goalId, { title, why, dueDate });
      return { ...goal, url: goalHref(goal) };
    },
  }),
  defineTool({
    name: "delete_goal",
    mutates: true,
    title: "Delete a goal",
    description: "Remove a goal and everything under it. This cannot be undone.",
    inputSchema: { goalId: z.string() },
    destructive: true,
    handler: async (args, { pool, ownerId }) => {
      await repo.deleteGoal(pool, ownerId, args.goalId);
      return { deleted: args.goalId };
    },
  }),
  defineTool({
    name: "set_goal_status",
    mutates: true,
    title: "Pause or resume a goal",
    description:
      "Set a goal's status: 'paused' shelves it without losing progress, 'active' resumes " +
      "it. Completion is not a status — it's derived from the steps being done.",
    inputSchema: {
      goalId: z.string(),
      status: z.enum(["active", "paused"]).describe("'paused' to shelve, 'active' to resume"),
    },
    handler: (args, { pool, ownerId }) =>
      repo.setGoalStatus(pool, ownerId, args.goalId, args.status),
  }),

  // ---- groups ----
  defineTool({
    name: "add_group",
    mutates: true,
    title: "Add a group",
    description: "Add a group of steps to a goal, e.g. 'Recording' or 'Promotion'.",
    inputSchema: { goalId: z.string(), title: z.string().min(1), dueDate: dueDateInput },
    handler: (args, { pool, ownerId }) =>
      repo.addGroup(pool, ownerId, args.goalId, args.title, args.dueDate),
  }),
  defineTool({
    name: "rename_group",
    mutates: true,
    title: "Rename a group",
    description: "Change a group's title and/or its due date.",
    inputSchema: { groupId: z.string(), title: z.string().min(1), dueDate: dueDateChange },
    handler: async (args, { pool, ownerId }) => {
      await repo.renameGroup(pool, ownerId, args.groupId, args.title, args.dueDate);
      return { groupId: args.groupId, title: args.title };
    },
  }),
  defineTool({
    name: "delete_group",
    mutates: true,
    title: "Delete a group",
    description: "Remove a group and its steps.",
    inputSchema: { groupId: z.string() },
    destructive: true,
    handler: async (args, { pool, ownerId }) => {
      await repo.deleteGroup(pool, ownerId, args.groupId);
      return { deleted: args.groupId };
    },
  }),

  // ---- steps ----
  defineTool({
    name: "add_step",
    mutates: true,
    title: "Add steps",
    description:
      "Add one or more steps in a single call — pass a one-element array to add just one. " +
      "Each step goes to a group (`groupId`) or directly to a goal (`goalId`) for a step " +
      "outside any group — pass exactly one per step. Keep each title small — one " +
      "sitting's worth of work. `description` is an optional longer note beneath it. The " +
      "whole batch is applied together: if any step is invalid, none are added.",
    inputSchema: {
      steps: z
        .array(
          z.object({
            goalId: z.string().optional().describe("The goal to add an ungrouped step to"),
            groupId: z.string().optional().describe("The group to add the step to"),
            text: z.string().min(1).describe("The step's title"),
            description: z
              .string()
              .optional()
              .describe("An optional longer note — details, links, context"),
            dueDate: dueDateInput,
          })
        )
        .min(1)
        .describe("The steps to add, in order"),
    },
    handler: (args, { pool, ownerId }) =>
      repo.addSteps(
        pool,
        ownerId,
        args.steps.map((s) => ({
          target: { goalId: s.goalId, groupId: s.groupId },
          text: s.text,
          description: s.description,
          dueDate: s.dueDate,
        }))
      ),
  }),
  defineTool({
    name: "edit_step",
    mutates: true,
    title: "Edit a step",
    description:
      "Change a step's title and/or its description. Anything you leave out stays as it is; " +
      "pass an empty `description` to clear it. Its done/not-done state is left alone.",
    inputSchema: {
      stepId: z.string(),
      text: z.string().min(1).optional().describe("The new title, if it should change"),
      description: z.string().optional().describe("The new note; pass an empty string to clear it"),
      dueDate: dueDateChange,
    },
    handler: (args, { pool, ownerId }) => {
      const { stepId, text, description, dueDate } = args;
      if (text === undefined && description === undefined && dueDate === undefined) {
        throw new Error("Nothing to update — pass a title, a description, a dueDate, or several.");
      }
      return repo.editStep(pool, ownerId, stepId, { text, description, dueDate });
    },
  }),
  defineTool({
    name: "toggle_step",
    mutates: true,
    title: "Toggle a step",
    description: "Mark a step done or not done. Omit `done` to flip whatever it is now.",
    inputSchema: {
      stepId: z.string(),
      done: z.boolean().optional().describe("Set explicitly, or omit to toggle"),
    },
    handler: (args, { pool, ownerId }) => repo.setStepDone(pool, ownerId, args.stepId, args.done),
  }),
  defineTool({
    name: "delete_step",
    mutates: true,
    title: "Delete steps",
    description:
      "Remove one or more steps — pass a one-element array to delete just one. The whole " +
      "batch is applied together: if any id is unknown, none are deleted.",
    inputSchema: { stepIds: z.array(z.string()).min(1).describe("The ids of the steps to remove") },
    destructive: true,
    handler: async (args, { pool, ownerId }) => {
      await repo.deleteSteps(pool, ownerId, args.stepIds);
      return { deleted: args.stepIds };
    },
  }),

  // ---- notes ----
  defineTool({
    name: "list_notes",
    title: "List a goal's notes",
    description:
      "The goal's notes feed, newest first. This is where the user thinks out loud " +
      "about the goal — read it before giving advice.",
    inputSchema: { goalId: z.string() },
    handler: (args, { pool, ownerId }) => repo.listNotes(pool, ownerId, args.goalId),
  }),
  defineTool({
    name: "add_note",
    mutates: true,
    title: "Add notes",
    description:
      "Leave one or more notes on goals — an observation, a thought, a next step. Pass a " +
      "one-element array to add just one. Each note optionally ties to one step of its goal " +
      "with `stepId` (from get_goal); leave it out for a note about the goal as a whole. The " +
      "whole batch is applied together: if any note is invalid, none are added.",
    inputSchema: {
      notes: z
        .array(
          z.object({
            goalId: z.string(),
            text: z.string().min(1),
            stepId: z
              .string()
              .optional()
              .describe("A step id under this goal to link the note to"),
          })
        )
        .min(1)
        .describe("The notes to add, in order"),
    },
    handler: (args, { pool, ownerId }) => repo.addNotes(pool, ownerId, args.notes),
  }),
  defineTool({
    name: "edit_note",
    mutates: true,
    title: "Edit a note",
    description:
      "Change a note's text and/or the step it's linked to. Anything you leave out stays as " +
      "it is; pass an empty `stepId` to unlink it from its step.",
    inputSchema: {
      noteId: z.string(),
      text: z.string().min(1).optional().describe("The new text, if it should change"),
      stepId: z
        .string()
        .optional()
        .describe("A step id under this goal to link to; pass an empty string to unlink"),
    },
    handler: (args, { pool, ownerId }) => {
      const { noteId, text, stepId } = args;
      if (text === undefined && stepId === undefined) {
        throw new Error("Nothing to update — pass text, a stepId, or both.");
      }
      return repo.editNote(pool, ownerId, noteId, { text, stepId });
    },
  }),
  defineTool({
    name: "delete_note",
    mutates: true,
    title: "Delete notes",
    description:
      "Remove one or more notes from goals' feeds — pass a one-element array to delete just " +
      "one. The whole batch is applied together: if any id is unknown, none are deleted.",
    inputSchema: { noteIds: z.array(z.string()).min(1).describe("The ids of the notes to remove") },
    destructive: true,
    handler: async (args, { pool, ownerId }) => {
      await repo.deleteNotes(pool, ownerId, args.noteIds);
      return { deleted: args.noteIds };
    },
  }),

  // ---- tasks ----
  defineTool({
    name: "list_tasks",
    title: "List tasks",
    description:
      "The user's whole task list — one-off to-dos and daily habits, separate from the " +
      "goals' steps. A daily task's `completedOn` is the UTC midnight of the day it was " +
      "last checked off: it counts as done only if that is today. `goalId` optionally " +
      "links a task to a goal without affecting the goal's progress.",
    inputSchema: {},
    handler: (_args, { pool, ownerId }) => repo.listTasks(pool, ownerId),
  }),
  defineTool({
    name: "create_task",
    mutates: true,
    title: "Create a task",
    description:
      "Add a task: a one-off to-do (optionally with a due date) or a daily habit " +
      "(`daily: true` — it resets each day). Optionally link it to a goal with `goalId`.",
    inputSchema: {
      title: z.string().min(1).describe("What needs doing"),
      description: z
        .string()
        .optional()
        .describe("An optional longer note — details, links, context"),
      goalId: z.string().optional().describe("A goal to tie the task to (from list_goals)"),
      daily: z.boolean().optional().describe("True for a habit that repeats every day"),
      dueDate: dueDateInput,
    },
    handler: (args, { pool, ownerId }) =>
      repo.createTask(pool, ownerId, args.title, {
        description: args.description,
        goalId: args.goalId,
        daily: args.daily,
        dueDate: args.dueDate,
      }),
  }),
  defineTool({
    name: "update_task",
    mutates: true,
    title: "Update a task",
    description:
      "Change a task's title, description, goal link, daily flag or due date. Anything you " +
      "leave out stays as it is; pass an empty `description` to clear it, an empty `goalId` " +
      "to unlink it from its goal. Changing `daily` resets the task's completion. Its done " +
      "state is otherwise left alone — use set_task_done for that.",
    inputSchema: {
      taskId: z.string(),
      title: z.string().min(1).optional().describe("The new title, if it should change"),
      description: z.string().optional().describe("The new note; pass an empty string to clear it"),
      goalId: z.string().optional().describe("A goal to link to; pass an empty string to unlink"),
      daily: z.boolean().optional().describe("Switch between a daily habit and a one-off to-do"),
      dueDate: dueDateChange,
    },
    handler: (args, { pool, ownerId }) => {
      const { taskId, title, description, goalId, daily, dueDate } = args;
      if (
        title === undefined &&
        description === undefined &&
        goalId === undefined &&
        daily === undefined &&
        dueDate === undefined
      ) {
        throw new Error("Nothing to update — pass at least one field.");
      }
      return repo.updateTask(pool, ownerId, taskId, {
        title,
        description,
        goalId,
        daily,
        dueDate,
      });
    },
  }),
  defineTool({
    name: "set_task_done",
    mutates: true,
    title: "Complete a task",
    description:
      "Mark a task done or not done. Omit `done` to flip whatever it is now. For a daily " +
      "task 'done' means done today — it resets by itself tomorrow.",
    inputSchema: {
      taskId: z.string(),
      done: z.boolean().optional().describe("Set explicitly, or omit to toggle"),
    },
    handler: (args, { pool, ownerId }) => repo.setTaskDone(pool, ownerId, args.taskId, args.done),
  }),
  defineTool({
    name: "delete_task",
    mutates: true,
    title: "Delete a task",
    description: "Remove a task from the list. This cannot be undone.",
    inputSchema: { taskId: z.string() },
    destructive: true,
    handler: async (args, { pool, ownerId }) => {
      await repo.deleteTask(pool, ownerId, args.taskId);
      return { deleted: args.taskId };
    },
  }),
];
