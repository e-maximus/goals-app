import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Pool } from "./db.js";
import { goalProgress, goalStepCounts, type Goal } from "./domain.js";
import * as repo from "./repo.js";

/** Every tool answers with JSON text — agents parse it, humans can read it. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** A goal without its groups/comments bodies — enough to pick one to act on. */
function summarize(goal: Goal) {
  const { done, total } = goalStepCounts(goal);
  return {
    id: goal.id,
    title: goal.title,
    why: goal.why,
    progressPct: goalProgress(goal),
    steps: { done, total },
    groups: goal.groups.length,
    comments: goal.comments?.length ?? 0,
  };
}

/**
 * Build the MCP surface over the goals store. The tool names deliberately match
 * the web app's store actions, so there's one vocabulary rather than two.
 */
export function createMcpServer(pool: Pool): McpServer {
  const server = new McpServer(
    { name: "goals-app", version: "1.0.0" },
    {
      instructions:
        "Read and manage the user's goals. A goal breaks down into groups of steps, " +
        "and carries a comment feed where the user records thinking about the goal as " +
        "a whole — what's working, what's stuck. Read the comments before advising on a " +
        "goal; they hold the context the structure doesn't.",
    }
  );

  // ---- reading ----

  server.registerTool(
    "list_goals",
    {
      title: "List goals",
      description: "Every goal with its progress, step counts and comment count.",
      inputSchema: {},
    },
    async () => {
      const { goals } = await repo.getState(pool);
      return json(goals.map(summarize));
    }
  );

  server.registerTool(
    "get_goal",
    {
      title: "Get a goal",
      description: "One goal in full: its groups, their steps, and its comments.",
      inputSchema: { goalId: z.string().describe("The goal's id, from list_goals") },
    },
    async ({ goalId }) => json(await repo.getGoal(pool, goalId))
  );

  // ---- goals ----

  server.registerTool(
    "create_goal",
    {
      title: "Create a goal",
      description: "Add a new goal. It starts with no groups and no comments.",
      inputSchema: {
        title: z.string().min(1).describe("What the user wants to achieve"),
        why: z.string().optional().describe("Why it matters to them — optional but motivating"),
      },
    },
    async ({ title, why }) => json(await repo.createGoal(pool, title, why))
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
      await repo.deleteGoal(pool, goalId);
      return json({ deleted: goalId });
    }
  );

  // ---- groups ----

  server.registerTool(
    "add_group",
    {
      title: "Add a group",
      description: "Add a group of steps to a goal, e.g. 'Recording' or 'Promotion'.",
      inputSchema: { goalId: z.string(), title: z.string().min(1) },
    },
    async ({ goalId, title }) => json(await repo.addGroup(pool, goalId, title))
  );

  server.registerTool(
    "rename_group",
    {
      title: "Rename a group",
      description: "Change a group's title.",
      inputSchema: { groupId: z.string(), title: z.string().min(1) },
    },
    async ({ groupId, title }) => {
      await repo.renameGroup(pool, groupId, title);
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
      await repo.deleteGroup(pool, groupId);
      return json({ deleted: groupId });
    }
  );

  // ---- steps ----

  server.registerTool(
    "add_step",
    {
      title: "Add a step",
      description: "Add a step to a group. Keep it small — one sitting's worth of work.",
      inputSchema: { groupId: z.string(), text: z.string().min(1) },
    },
    async ({ groupId, text }) => json(await repo.addStep(pool, groupId, text))
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
    async ({ stepId, done }) => json(await repo.setStepDone(pool, stepId, done))
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
      await repo.deleteStep(pool, stepId);
      return json({ deleted: stepId });
    }
  );

  // ---- comments ----

  server.registerTool(
    "list_comments",
    {
      title: "List a goal's comments",
      description:
        "The goal's comment feed, newest first. This is where the user thinks out loud " +
        "about the goal — read it before giving advice.",
      inputSchema: { goalId: z.string() },
    },
    async ({ goalId }) => json(await repo.listComments(pool, goalId))
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add a comment",
      description: "Leave a comment on a goal — an observation, a note, a next thought.",
      inputSchema: { goalId: z.string(), text: z.string().min(1) },
    },
    async ({ goalId, text }) => json(await repo.addComment(pool, goalId, text))
  );

  server.registerTool(
    "edit_comment",
    {
      title: "Edit a comment",
      description: "Rewrite an existing comment's text.",
      inputSchema: { commentId: z.string(), text: z.string().min(1) },
    },
    async ({ commentId, text }) => json(await repo.editComment(pool, commentId, text))
  );

  server.registerTool(
    "delete_comment",
    {
      title: "Delete a comment",
      description: "Remove a comment from a goal's feed.",
      inputSchema: { commentId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ commentId }) => {
      await repo.deleteComment(pool, commentId);
      return json({ deleted: commentId });
    }
  );

  // A single read to pull the whole picture into context.
  server.registerResource(
    "goals",
    "goals://all",
    {
      title: "All goals",
      description: "The complete goals store: every goal, group, step and comment.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await repo.getState(pool);
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
