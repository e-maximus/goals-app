import "server-only";
import { createAgent } from "langchain";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { ClientTool } from "@langchain/core/tools";

/**
 * Builds the chat's LangChain agent.
 *
 * Kept apart from [engine.ts](./engine.ts) — which owns the HTTP stream — so the
 * agent can be built with a fake model in a test and exercised without a key or
 * a network. The model and tools are parameters for that reason and no other;
 * production always passes the model from [model.ts](./model.ts) and the tools
 * from [tools.ts](./tools.ts).
 */
export type ChatAgentOptions = {
  model: LanguageModelLike;
  /** The system prompt, already carrying the thread's rolling summary. */
  system: string;
  /** The owner-bound goals/tasks tools; empty for a chat that can only talk. */
  tools?: ClientTool[];
};

export function buildChatAgent({ model, system, tools = [] }: ChatAgentOptions) {
  return createAgent({
    model,
    tools,
    systemPrompt: system,
  });
}
