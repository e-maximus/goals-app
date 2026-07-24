import { auth } from "@clerk/nextjs/server";
import {
  convertToModelMessages,
  generateId,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getPool } from "@/server/pool";
import { clerkEmailResolver } from "@/server/clerk-email";
import { resolveWebUser } from "@/server/users";
import {
  appendMessages,
  getOrCreateActiveThread,
  listMessages,
  setThreadTitle,
} from "@/server/chat-repo";
import {
  buildChatTools,
  buildSystemPrompt,
  maintainSummary,
  MAX_STEPS,
  sanitize,
  selectContext,
  toUiMessage,
} from "@/server/chat-agent";
import { chatModel } from "@/server/llm";
import { logRequest } from "@/server/log";

/**
 * The AI chat endpoint. GET seeds the client with the active thread's persisted
 * messages; POST runs the agent (DeepSeek via the AI SDK) over that thread and
 * streams the reply back, persisting the completed turn.
 *
 * The owner is resolved from the session exactly like
 * [api/goals](../goals/route.ts) — a first-time visitor is minted and handed a
 * cookie, so the same session-cookie user the store uses drives the chat. The
 * model never sees an owner id; every tool is bound to it server-side. The chat
 * is surfaced as a signed-in feature in the UI (`<Show when="signed-in">`), which
 * is the product boundary; the endpoint itself follows the app's cookie model.
 */

const NEW_USER_HEADER = { "content-type": "application/json" };

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const { userId: clerkUserId } = await auth();
    const pool = await getPool();
    const { user, setCookie } = await resolveWebUser(pool, request, clerkUserId, clerkEmailResolver(clerkUserId));
    const thread = await getOrCreateActiveThread(pool, user.id);
    const messages = await listMessages(pool, user.id, thread.id);
    const headers = new Headers(NEW_USER_HEADER);
    if (setCookie) headers.append("set-cookie", setCookie);
    const res = new Response(
      JSON.stringify({
        threadId: thread.id,
        messages: messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
      }),
      { headers }
    );
    logRequest(request, res.status, startedAt, { userId: user.id });
    return res;
  } catch (err) {
    return serverError(request, startedAt, err);
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const { userId: clerkUserId } = await auth();
    const pool = await getPool();
    const { user } = await resolveWebUser(pool, request, clerkUserId, clerkEmailResolver(clerkUserId));
    const ownerId = user.id;

    const body = (await request.json()) as { messages?: UIMessage[] };
    const incoming = body.messages ?? [];
    const userMessage = incoming[incoming.length - 1];
    if (!userMessage || userMessage.role !== "user") {
      return Response.json({ error: "Expected a trailing user message." }, { status: 400 });
    }

    // Build model context from the DB — the rolling summary plus the recent
    // turns — not from what the client sent, so cost stays bounded and history
    // can't be tampered with. Only the new user message comes from the request.
    const thread = await getOrCreateActiveThread(pool, ownerId);
    const stored = await listMessages(pool, ownerId, thread.id);
    const context = sanitize(
      selectContext(stored, thread.summaryThroughCreatedAt).map(toUiMessage)
    );
    const conversation: UIMessage[] = [...context, userMessage];

    const result = streamText({
      model: chatModel(),
      system: buildSystemPrompt(thread.summary),
      messages: await convertToModelMessages(conversation),
      tools: buildChatTools({ pool, ownerId }),
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: request.signal,
    });

    logRequest(request, 200, startedAt, { userId: ownerId });

    return result.toUIMessageStreamResponse({
      originalMessages: [userMessage],
      // Forward the model's reasoning parts to the client (off by default). Only
      // a reasoning-capable DEEPSEEK_MODEL emits them; for others this is a no-op.
      sendReasoning: true,
      // Give the assistant message a stable id — without this the SDK leaves it
      // empty, and two turns would collide on the messages table's primary key.
      generateMessageId: generateId,
      onEnd: async ({ responseMessage, isAborted }) => {
        // Only completed turns hit the DB — an aborted stream leaves the thread
        // valid, with no half-written tool call. Best-effort: a persistence
        // failure is logged, never surfaced to the user mid-stream.
        if (isAborted) return;
        try {
          await appendMessages(pool, ownerId, thread.id, [
            { id: userMessage.id, role: "user", parts: userMessage.parts },
            { id: responseMessage.id, role: responseMessage.role, parts: responseMessage.parts },
          ]);
          if (!thread.title) {
            const title = firstText(userMessage);
            if (title) await setThreadTitle(pool, ownerId, thread.id, title.slice(0, 80));
          }
          const all = await listMessages(pool, ownerId, thread.id);
          await maintainSummary(
            pool,
            ownerId,
            thread.id,
            all,
            thread.summary,
            thread.summaryThroughCreatedAt
          );
        } catch (err) {
          console.error("chat persistence failed", err);
        }
      },
    });
  } catch (err) {
    return serverError(request, startedAt, err);
  }
}

/** The first text part of a user message, for a thread title. */
function firstText(message: UIMessage): string | null {
  for (const part of message.parts ?? []) {
    const p = part as { type?: string; text?: string };
    if (p.type === "text" && p.text?.trim()) return p.text.trim();
  }
  return null;
}

function serverError(request: Request, startedAt: number, err: unknown): Response {
  logRequest(request, 500, startedAt, {
    error: err instanceof Error ? err.message : String(err),
  });
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
