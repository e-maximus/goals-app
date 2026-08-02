import "server-only";
import { createAgent } from "langchain";
import type { LanguageModelLike } from "@langchain/core/language_models/base";

/**
 * Builds the chat's LangChain agent.
 *
 * Kept apart from [engine.ts](./engine.ts) — which owns the HTTP stream — so the
 * agent can be built with a fake model in a test and exercised without a key or
 * a network. The model is a parameter for that reason and no other; production
 * always passes the one from [model.ts](./model.ts).
 */
export type ChatAgentOptions = {
  model: LanguageModelLike;
  /** The system prompt, already carrying the thread's rolling summary. */
  system: string;
};

export function buildChatAgent({ model, system }: ChatAgentOptions) {
  return createAgent({
    model,
    // Phase 0 deliberately runs with no tools: this proves the model, the stream
    // translation and the persistence path before the goals/tasks registry is
    // wired in.
    tools: [],
    systemPrompt: system,
  });
}
