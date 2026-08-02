import "server-only";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import type { ChatEngine, Completer, TurnInput } from "../chat-engine";
import { buildChatAgent } from "./agent";
import { chatModel } from "./model";
import { buildLangChainTools } from "./tools";

/**
 * The LangChain engine: the same chat, driven by a LangChain agent instead of
 * the AI SDK's `streamText`. Selected with `CHAT_ENGINE=langchain` — see
 * [chat-engine.ts](../chat-engine.ts) for why both exist at once.
 *
 * The browser still speaks the AI SDK's UI message stream. `@ai-sdk/langchain`
 * translates the agent's LangGraph stream into that protocol, and
 * `createUIMessageStream` assembles the finished assistant message for us, in
 * exactly the `parts` shape the messages table already stores. That is what
 * keeps this a server-side change: the drawer, the stored history and the e2e
 * suite are all untouched.
 *
 * The stream is merged into the writer rather than returned directly because we
 * need `onEnd` — persistence hangs off it, and only `createUIMessageStream`
 * offers it.
 */

/** An agent as {@link buildChatAgent} returns it — only its stream is used here. */
type StreamableAgent = { stream: ReturnType<typeof buildChatAgent>["stream"] };

/**
 * Run one turn through an already-built agent and translate it into a UI
 * message stream. Split from {@link langchainEngine} so a test can drive the
 * whole translation with a fake model, without an HTTP response around it.
 */
export function streamTurn(
  agent: StreamableAgent,
  { conversation, userMessage, signal, onEnd }: Omit<TurnInput, "system" | "toolContext">
): ReadableStream<UIMessageChunk> {
  return createUIMessageStream({
    originalMessages: [userMessage],
    // Match the AI SDK engine: a stable assistant id, or two turns collide on
    // the messages table's primary key.
    generateId,
    execute: async ({ writer }) => {
      const agentStream = await agent.stream(
        { messages: await toBaseMessages(conversation as UIMessage[]) },
        { streamMode: ["values", "messages", "tools"], signal }
      );
      writer.merge(toUIMessageStream(agentStream));
    },
    onEnd: ({ responseMessage, isAborted }) =>
      // `createUIMessageStream` only reports an abort it caused itself. Ours
      // comes from the request signal and stops the agent from the inside, so
      // the stream simply ends early and looks complete — and the route would
      // persist a truncated turn. Consult the signal directly.
      onEnd({ responseMessage, isAborted: isAborted || signal.aborted }),
  });
}

export const langchainEngine: ChatEngine = async ({ system, toolContext, ...turn }) => {
  const agent = buildChatAgent({
    model: chatModel(),
    system,
    tools: buildLangChainTools(toolContext),
  });
  return createUIMessageStreamResponse({ stream: streamTurn(agent, turn) });
};

/** One-shot completion on LangChain — see `Completer` in chat-engine.ts. */
export const langchainCompleter: Completer = async (prompt) => {
  const reply = await chatModel().invoke(prompt);
  return reply.text;
};
