import "server-only";
import { convertToModelMessages, generateId, stepCountIs, streamText } from "ai";
import { buildChatTools, MAX_STEPS } from "./chat-agent";
import type { ChatEngine } from "./chat-engine";
import { chatModel } from "./llm";

/**
 * The original engine: the Vercel AI SDK driving DeepSeek directly. Lifted out
 * of the route unchanged when the LangChain engine was added beside it, so the
 * two can be compared — and switched between — without either one growing
 * conditionals. See [chat-engine.ts](./chat-engine.ts).
 */
export const aiSdkEngine: ChatEngine = async ({
  system,
  conversation,
  userMessage,
  toolContext,
  signal,
  onEnd,
}) => {
  const result = streamText({
    model: chatModel(),
    system,
    messages: await convertToModelMessages(conversation),
    tools: buildChatTools(toolContext),
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: signal,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: [userMessage],
    // Forward the model's reasoning parts to the client (off by default). Only
    // a reasoning-capable DEEPSEEK_MODEL emits them; for others this is a no-op.
    sendReasoning: true,
    // Give the assistant message a stable id — without this the SDK leaves it
    // empty, and two turns would collide on the messages table's primary key.
    generateMessageId: generateId,
    onEnd: ({ responseMessage, isAborted }) => onEnd({ responseMessage, isAborted }),
  });
};
