import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Pool } from "./db";
import { goalProgress, goalStatus, goalStepCounts, lastActivityAt, type Goal } from "./domain";
import * as repo from "./repo";

/** Every tool answers with JSON text — agents parse it, humans can read it. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** A goal without its groups/notes bodies — enough to pick one to act on. */
function summarize(goal: Goal) {
  const { done, total } = goalStepCounts(goal);
  return {
    id: goal.id,
    title: goal.title,
    why: goal.why,
    status: goalStatus(goal),
    progressPct: goalProgress(goal),
    steps: { done, total },
    groups: goal.groups.length,
    notes: goal.notes?.length ?? 0,
    updatedAt: lastActivityAt(goal),
    ...(goal.pausedAt ? { pausedAt: goal.pausedAt } : {}),
  };
}

/**
 * Build the MCP surface over one user's goals store. `ownerId` is the user the
 * request authenticated as (see the /api/mcp route); every tool operates only
 * on their goals, so an agent can never reach across accounts. The tool names
 * deliberately match the web app's store actions, so there's one vocabulary
 * rather than two.
 */
export function createMcpServer(pool: Pool, ownerId: string): McpServer {
  const server = new McpServer(
    { name: "goals-app", version: "1.0.0" },
    {
      instructions:
        "Read and manage the user's goals. A goal breaks down into groups of steps, " +
        "and carries a notes feed where the user records thinking about the goal as " +
        "a whole — what's working, what's stuck. Read the notes before advising on a " +
        "goal; they hold the context the structure doesn't.",
    }
  );

  // ---- reading ----

  server.registerTool(
    "list_goals",
    {
      title: "List goals",
      description: "Every goal with its progress, step counts and note count.",
      inputSchema: {},
    },
    async () => {
      const { goals } = await repo.getState(pool, ownerId);
      return json(goals.map(summarize));
    }
  );

  server.registerTool(
    "get_goal",
    {
      title: "Get a goal",
      description: "One goal in full: its groups, their steps, and its notes.",
      inputSchema: { goalId: z.string().describe("The goal's id, from list_goals") },
    },
    async ({ goalId }) => json(await repo.getGoal(pool, ownerId, goalId))
  );

  // ---- goals ----

  server.registerTool(
    "create_goal",
    {
      title: "Create a goal",
      description: "Add a new goal. It starts with no groups and no notes.",
      inputSchema: {
        title: z.string().min(1).describe("What the user wants to achieve"),
        why: z.string().optional().describe("Why it matters to them — optional but motivating"),
      },
    },
    async ({ title, why }) => json(await repo.createGoal(pool, ownerId, title, why))
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update a goal",
      description:
        "Change a goal's title, its 'why', or both. Anything you leave out stays as it is; " +
        "pass an empty `why` to clear it. Use this rather than deleting and recreating — " +
        "deleting a goal takes its groups, steps and notes with it.",
      inputSchema: {
        goalId: z.string(),
        title: z.string().min(1).optional().describe("The new title, if it should change"),
        why: z.string().optional().describe("The new reason; pass an empty string to clear it"),
      },
    },
    async ({ goalId, title, why }) => {
      if (title === undefined && why === undefined) {
        throw new Error("Nothing to update — pass a title, a why, or both.");
      }
      return json(await repo.updateGoal(pool, ownerId, goalId, { title, why }));
    }
  );

  server.registerTool(
    "delete_goal",
    {
      title: "Delete a goal",
      description: "Remove a goal and everything under it. This cannot be undone.",
      inputSchema: { goalId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ goalId }) => {
      await repo.deleteGoal(pool, ownerId, goalId);
      return json({ deleted: goalId });
    }
  );

  server.registerTool(
    "set_goal_status",
    {
      title: "Pause or resume a goal",
      description:
        "Set a goal's status: 'paused' shelves it without losing progress, 'active' resumes " +
        "it. Completion is not a status — it's derived from the steps being done.",
      inputSchema: {
        goalId: z.string(),
        status: z.enum(["active", "paused"]).describe("'paused' to shelve, 'active' to resume"),
      },
    },
    async ({ goalId, status }) => json(await repo.setGoalStatus(pool, ownerId, goalId, status))
  );

  // ---- groups ----

  server.registerTool(
    "add_group",
    {
      title: "Add a group",
      description: "Add a group of steps to a goal, e.g. 'Recording' or 'Promotion'.",
      inputSchema: { goalId: z.string(), title: z.string().min(1) },
    },
    async ({ goalId, title }) => json(await repo.addGroup(pool, ownerId, goalId, title))
  );

  server.registerTool(
    "rename_group",
    {
      title: "Rename a group",
      description: "Change a group's title.",
      inputSchema: { groupId: z.string(), title: z.string().min(1) },
    },
    async ({ groupId, title }) => {
      await repo.renameGroup(pool, ownerId, groupId, title);
      return json({ groupId, title });
    }
  );

  server.registerTool(
    "delete_group",
    {
      title: "Delete a group",
      description: "Remove a group and its steps.",
      inputSchema: { groupId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ groupId }) => {
      await repo.deleteGroup(pool, ownerId, groupId);
      return json({ deleted: groupId });
    }
  );

  // ---- steps ----

  server.registerTool(
    "add_step",
    {
      title: "Add a step",
      description:
        "Add a step to a group. Keep the title small — one sitting's worth of work. " +
        "`description` is an optional longer note beneath it.",
      inputSchema: {
        groupId: z.string(),
        text: z.string().min(1).describe("The step's title"),
        description: z.string().optional().describe("An optional longer note — details, links, context"),
      },
    },
    async ({ groupId, text, description }) =>
      json(await repo.addStep(pool, ownerId, groupId, text, description))
  );

  server.registerTool(
    "edit_step",
    {
      title: "Edit a step",
      description:
        "Change a step's title and/or its description. Anything you leave out stays as it is; " +
        "pass an empty `description` to clear it. Its done/not-done state is left alone.",
      inputSchema: {
        stepId: z.string(),
        text: z.string().min(1).optional().describe("The new title, if it should change"),
        description: z
          .string()
          .optional()
          .describe("The new note; pass an empty string to clear it"),
      },
    },
    async ({ stepId, text, description }) => {
      if (text === undefined && description === undefined) {
        throw new Error("Nothing to update — pass a title, a description, or both.");
      }
      return json(await repo.editStep(pool, ownerId, stepId, { text, description }));
    }
  );

  server.registerTool(
    "toggle_step",
    {
      title: "Toggle a step",
      description: "Mark a step done or not done. Omit `done` to flip whatever it is now.",
      inputSchema: {
        stepId: z.string(),
        done: z.boolean().optional().describe("Set explicitly, or omit to toggle"),
      },
    },
    async ({ stepId, done }) => json(await repo.setStepDone(pool, ownerId, stepId, done))
  );

  server.registerTool(
    "delete_step",
    {
      title: "Delete a step",
      description: "Remove a step from its group.",
      inputSchema: { stepId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ stepId }) => {
      await repo.deleteStep(pool, ownerId, stepId);
      return json({ deleted: stepId });
    }
  );

  // ---- notes ----

  server.registerTool(
    "list_notes",
    {
      title: "List a goal's notes",
      description:
        "The goal's notes feed, newest first. This is where the user thinks out loud " +
        "about the goal — read it before giving advice.",
      inputSchema: { goalId: z.string() },
    },
    async ({ goalId }) => json(await repo.listNotes(pool, ownerId, goalId))
  );

  server.registerTool(
    "add_note",
    {
      title: "Add a note",
      description:
        "Leave a note on a goal — an observation, a thought, a next step. Optionally tie it " +
        "to one step of the goal with `stepId` (from get_goal); leave it out for a note about " +
        "the goal as a whole.",
      inputSchema: {
        goalId: z.string(),
        text: z.string().min(1),
        stepId: z.string().optional().describe("A step id under this goal to link the note to"),
      },
    },
    async ({ goalId, text, stepId }) => json(await repo.addNote(pool, ownerId, goalId, text, stepId))
  );

  server.registerTool(
    "edit_note",
    {
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
    },
    async ({ noteId, text, stepId }) => {
      if (text === undefined && stepId === undefined) {
        throw new Error("Nothing to update — pass text, a stepId, or both.");
      }
      return json(await repo.editNote(pool, ownerId, noteId, { text, stepId }));
    }
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete a note",
      description: "Remove a note from a goal's feed.",
      inputSchema: { noteId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ noteId }) => {
      await repo.deleteNote(pool, ownerId, noteId);
      return json({ deleted: noteId });
    }
  );

  // A single read to pull the whole picture into context.
  server.registerResource(
    "goals",
    "goals://all",
    {
      title: "All goals",
      description: "The complete goals store: every goal, group, step and note.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await repo.getState(pool, ownerId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(state.goals, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
