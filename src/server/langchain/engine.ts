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
import { OwnerScopedCheckpointer } from "./checkpointer";
import { chatModel } from "./model";
import { traceConfig, type TraceContext } from "./tracing";
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
export type StreamTurnOptions = {
  /**
   * True when the graph already holds this thread's history, so only the new
   * user message needs sending. False (or absent) hands over the whole
   * conversation — which is both the no-checkpointer case and the first turn of
   * a thread that predates the checkpointer, whose history lives only in
   * `chat_messages`.
   */
  seeded?: boolean;
  /**
   * Who and what this turn is, for the trace. Omitted in tests, where a run
   * with no owner attached is exactly what we want.
   */
  trace?: TraceContext;
};

export function streamTurn(
  agent: StreamableAgent,
  { threadId, conversation, userMessage, signal, onEnd }: Omit<TurnInput, "system" | "toolContext">,
  { seeded = false, trace }: StreamTurnOptions = {}
): ReadableStream<UIMessageChunk> {
  return createUIMessageStream({
    originalMessages: [userMessage],
    // Match the AI SDK engine: a stable assistant id, or two turns collide on
    // the messages table's primary key.
    generateId,
    execute: async ({ writer }) => {
      const outgoing = seeded ? [userMessage] : (conversation as UIMessage[]);
      const agentStream = await agent.stream(
        { messages: await toBaseMessages(outgoing) },
        {
          ...(trace ? traceConfig(trace) : {}),
          streamMode: ["values", "messages", "tools"],
          signal,
          configurable: { thread_id: threadId, checkpoint_ns: "" },
        }
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
  // Bound to the request's owner, so there is no call here that could name a
  // different one — see checkpointer.ts.
  const checkpointer = new OwnerScopedCheckpointer(toolContext.pool, toolContext.ownerId);

  // A thread that already has graph state only needs the new message; one that
  // doesn't — a fresh thread, or an older one whose history lives only in
  // `chat_messages` — is handed its conversation so the agent starts informed.
  const existing = await checkpointer.getTuple({
    configurable: { thread_id: turn.threadId, checkpoint_ns: "" },
  });

  const agent = buildChatAgent({
    model: chatModel(),
    system,
    tools: buildLangChainTools(toolContext),
    checkpointer,
  });

  return createUIMessageStreamResponse({
    stream: streamTurn(agent, turn, {
      seeded: existing !== undefined,
      trace: { ownerId: toolContext.ownerId, threadId: turn.threadId, engine: "langchain" },
    }),
  });
};

/** One-shot completion on LangChain — see `Completer` in chat-engine.ts. */
export const langchainCompleter: Completer = async (prompt) => {
  const reply = await chatModel().invoke(prompt);
  return reply.text;
};
