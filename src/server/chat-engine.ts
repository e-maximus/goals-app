import "server-only";
import type { UIMessage } from "ai";
import type { ToolContext } from "./tools";

/**
 * The seam the chat's model stack plugs into.
 *
 * The chat is being moved from the Vercel AI SDK to LangChain, and the two
 * stacks live side by side while that happens: `CHAT_ENGINE` picks one per
 * deployment, so a regression is one environment variable away from a rollback
 * rather than a revert. Everything *around* the model — resolving the owner,
 * validating the request, building context from the database, persisting the
 * finished turn — is the route's job and is shared by both engines; an engine
 * only turns a prepared turn into a streaming response.
 *
 * Both engines speak the same wire protocol to the browser (the AI SDK's UI
 * message stream), which is what lets the client, the stored message format and
 * the e2e suite stay untouched across the move.
 */

/** Everything an engine needs to run one turn. */
export type TurnInput = {
  /** The system prompt, already carrying the thread's rolling summary. */
  system: string;
  /** The chat thread this turn belongs to — also the graph's state key. */
  threadId: string;
  /** Live context from the database plus the new user message, oldest first. */
  conversation: UIMessage[];
  /** The new user message — the engine echoes its id back for persistence. */
  userMessage: UIMessage;
  /** Owner-bound context every tool call runs under. */
  toolContext: ToolContext;
  /** Aborted when the client goes away mid-stream. */
  signal: AbortSignal;
  /**
   * Called once the stream has ended. `isAborted` means the client hung up: the
   * turn is incomplete and must not be persisted.
   */
  onEnd: (event: { responseMessage: UIMessage; isAborted: boolean }) => Promise<void>;
};

export type ChatEngine = (input: TurnInput) => Promise<Response>;

/**
 * A one-shot, non-streaming completion. The rolling summary needs this and
 * nothing else, and it belongs to the engine: a deployment running on LangChain
 * should not still be reaching for the AI SDK to fold its history.
 */
export type Completer = (prompt: string) => Promise<string>;

export type ChatEngineName = "ai-sdk" | "langchain";

/**
 * Which engine this deployment runs. Defaults to the AI SDK — the LangChain
 * stack opts in explicitly until it has caught up feature for feature.
 */
export function chatEngineName(): ChatEngineName {
  return process.env.CHAT_ENGINE === "langchain" ? "langchain" : "ai-sdk";
}

/**
 * The engine's one-shot completer, resolved lazily.
 *
 * Imported through `await import` rather than at module load so that picking one
 * engine never constructs the other's model — which would demand its
 * credentials, at import time, on a deployment that doesn't use it.
 */
export async function completer(): Promise<Completer> {
  if (chatEngineName() === "langchain") {
    const { langchainCompleter } = await import("./langchain/engine");
    return langchainCompleter;
  }
  const { aiSdkCompleter } = await import("./chat-engine-ai-sdk");
  return aiSdkCompleter;
}
