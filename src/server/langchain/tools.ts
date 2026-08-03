import "server-only";
import { tool } from "@langchain/core/tools";
import type { ClientTool } from "@langchain/core/tools";
import { z } from "zod";
import { runTool, tools as registry, type ToolContext } from "../tools";

/**
 * The shared tool registry ([tools.ts](../tools.ts)), adapted for LangChain.
 *
 * This is the LangChain counterpart of the MCP adapter in [mcp.ts](../mcp.ts) and
 * of `buildChatTools` in [chat-agent.ts](../chat-agent.ts): one vocabulary of
 * goals/tasks operations, three transports. Adding a capability stays a one-file
 * change in the registry.
 *
 * Two things matter here and are easy to get wrong:
 *
 * - Every call goes through `runTool`, never `def.handler`. `runTool` is what
 *   observes "a write happened" and fires `onMutation` — the search reindexer.
 *   Calling the handler directly would work, silently, until someone noticed
 *   search had gone stale.
 * - The result is stringified. A LangChain tool's return value becomes the
 *   `ToolMessage` content sent back to the model, and the registry returns plain
 *   objects; JSON is how the model reads them, and it matches what the MCP
 *   surface already sends.
 */
export function buildLangChainTools(ctx: ToolContext): ClientTool[] {
  return registry.map((def) =>
    tool(async (args: unknown) => JSON.stringify(await runTool(def, args, ctx)), {
      name: def.name,
      description: def.description,
      schema: z.object(def.inputSchema),
    })
  );
}
