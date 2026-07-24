import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Pool } from "./db";
import * as repo from "./repo";
import { runTool, tools } from "./tools";

/** Every tool answers with JSON text — agents parse it, humans can read it. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Build the MCP surface over one user's goals store. `ownerId` is the user the
 * request authenticated as (see the /api/mcp route); every tool operates only
 * on their goals, so an agent can never reach across accounts. The tools come
 * from the shared registry ([tools.ts](./tools.ts)) — the same set the in-app
 * AI chat uses — so there's one vocabulary rather than two.
 */
export function createMcpServer(
  pool: Pool,
  ownerId: string,
  /**
   * Called after any tool that changed the store — the route passes the search
   * reindexer. It is a parameter rather than something this module reaches for
   * because reindexing is scheduled against the request's lifetime, which only
   * the route knows it has: constructing a server outside one (a test, a script)
   * must not drag a background job along with it.
   */
  onMutation?: () => void
): McpServer {
  const server = new McpServer(
    { name: "goals-app", version: "1.0.0" },
    {
      instructions:
        "Read and manage the user's goals. A goal breaks down into steps — either " +
        "directly on the goal, or organized into groups — and carries a notes feed " +
        "where the user records thinking about the goal as a whole — what's working, " +
        "what's stuck. Read the notes before advising on a goal; they hold the " +
        "context the structure doesn't. Goals, groups and steps can each carry an " +
        "optional due date. Alongside the goals lives a flat task list — one-off " +
        "to-dos and daily habits, optionally linked to a goal but never counted in " +
        "its progress (see list_tasks).",
    }
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.destructive ? { annotations: { destructiveHint: true } } : {}),
      },
      // The MCP SDK validates args against inputSchema before calling us, so the
      // handler receives the shape it declared.
      async (args) => json(await runTool(tool, args, { pool, ownerId, onMutation }))
    );
  }

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
