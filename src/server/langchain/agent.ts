import "server-only";
import { createAgent } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ClientTool } from "@langchain/core/tools";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { chatMiddleware } from "./middleware";

/**
 * Builds the chat's LangChain agent.
 *
 * Kept apart from [engine.ts](./engine.ts) — which owns the HTTP stream — so the
 * agent can be built with a fake model in a test and exercised without a key or
 * a network. The model, tools and checkpointer are parameters for that reason
 * and no other; production always passes the model from [model.ts](./model.ts),
 * the tools from [tools.ts](./tools.ts) and an owner-bound saver from
 * [checkpointer.ts](./checkpointer.ts).
 */
export type ChatAgentOptions = {
  model: BaseChatModel;
  /** The system prompt, already carrying the thread's rolling summary. */
  system: string;
  /** The owner-bound goals/tasks tools; empty for a chat that can only talk. */
  tools?: ClientTool[];
  /**
   * Where the thread's state lives between turns. Without one the agent starts
   * from whatever messages it is handed, and summarization has nothing to keep
   * a summary in, so it is left out of the stack.
   */
  checkpointer?: BaseCheckpointSaver;
};

export function buildChatAgent({ model, system, tools = [], checkpointer }: ChatAgentOptions) {
  return createAgent({
    model,
    tools,
    systemPrompt: system,
    middleware: chatMiddleware({ model: checkpointer ? model : undefined }),
    ...(checkpointer ? { checkpointer } : {}),
  });
}
