import { type UIMessage } from "ai";
import { currentUserForRequest } from "@/server/current-user";
import { errorResponse, jsonResponse } from "@/server/http";
import { approvalPartSchema, chatRequestSchema } from "@/features/chat/schemas";
import { scheduleReindex } from "@/server/embeddings/schedule";
import {
  appendMessages,
  getOrCreateActiveThread,
  listMessages,
  setThreadTitle,
} from "@/server/chat-repo";
import {
  buildSystemPrompt,
  maintainSummary,
  sanitize,
  selectContext,
  toUiMessage,
} from "@/server/chat-agent";
import { chatEngineName, type ToolApproval } from "@/server/chat-engine";
import { aiSdkEngine } from "@/server/chat-engine-ai-sdk";
import { langchainEngine } from "@/server/langchain/engine";
import { logRequest } from "@/server/log";
import { isSignedIn } from "@/server/users";

/**
 * The AI chat endpoint. GET seeds the client with the active thread's persisted
 * messages; POST runs the agent over that thread and streams the reply back,
 * persisting the completed turn.
 *
 * The model stack behind POST is pluggable — the AI SDK or LangChain, chosen by
 * `CHAT_ENGINE` ([chat-engine.ts](../../../server/chat-engine.ts)). Everything
 * that is not the model call lives here and is shared by both: resolving the
 * owner, validating the request, rebuilding context from the database, and
 * persisting the turn once the stream ends.
 *
 * The owner is resolved from the session cookie the page navigation settled
 * (see server/current-user.ts), so the chat runs as the same user the store
 * does. The model never sees an owner id; every tool is bound to it
 * server-side.
 *
 * The assistant requires a signed-in account: the server enforces `isSignedIn`
 * with a 403, and the UI hides the button based on the same server-resolved
 * identity (see server/users.ts). This is the same predicate search uses — an
 * anonymous account costs no model calls and stores no chat history its cookie
 * can't recover.
 */

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const { pool, user, setCookie } = await currentUserForRequest(request);
    if (!isSignedIn(user)) {
      const res = jsonResponse(
        { error: "The assistant requires a signed-in account." },
        { status: 403, setCookie }
      );
      logRequest(request, res.status, startedAt, { userId: user.id });
      return res;
    }
    const thread = await getOrCreateActiveThread(pool, user.id);
    const messages = await listMessages(pool, user.id, thread.id);
    const res = jsonResponse(
      {
        threadId: thread.id,
        messages: messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
      },
      { setCookie }
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
    const { pool, user, setCookie } = await currentUserForRequest(request);
    if (!isSignedIn(user)) {
      const res = jsonResponse(
        { error: "The assistant requires a signed-in account." },
        { status: 403, setCookie }
      );
      logRequest(request, res.status, startedAt, { userId: user.id });
      return res;
    }
    const ownerId = user.id;

    // Never trust the client's transcript: only the trailing user message is
    // taken from the request, and only after it has been validated.
    const parsed = chatRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Malformed chat request." }, { status: 400 });
    }
    const incoming = parsed.data.messages;
    const last = incoming[incoming.length - 1];
    if (!last) {
      return Response.json({ error: "Expected a message." }, { status: 400 });
    }

    // Two kinds of request arrive here. Usually it is a new user message. But
    // when the agent paused on a destructive tool, the client answers by
    // sending back the assistant message it is already showing, with the
    // approval filled in — there is no new user message in that case, and the
    // run resumes rather than starting.
    const approvals = readApprovals(last);
    if (!approvals && last.role !== "user") {
      return Response.json({ error: "Expected a trailing user message." }, { status: 400 });
    }
    // The parts are passed through as the AI SDK sent them; the schema checked
    // the envelope, and the SDK owns the shape of a part.
    const userMessage = last as UIMessage;

    // Build model context from the DB — the rolling summary plus the recent
    // turns — not from what the client sent, so cost stays bounded and history
    // can't be tampered with. Only the new user message comes from the request.
    const thread = await getOrCreateActiveThread(pool, ownerId);
    const stored = await listMessages(pool, ownerId, thread.id);
    const context = sanitize(
      selectContext(stored, thread.summaryThroughCreatedAt).map(toUiMessage)
    );
    const conversation: UIMessage[] = [...context, userMessage];

    const onLangChain = chatEngineName() === "langchain";
    const engine = onLangChain ? langchainEngine : aiSdkEngine;
    const response = await engine({
      system: buildSystemPrompt(thread.summary),
      threadId: thread.id,
      conversation,
      userMessage,
      ...(approvals ? { approvals } : {}),
      toolContext: { pool, ownerId, onMutation: () => scheduleReindex(pool, user) },
      signal: request.signal,
      onEnd: async ({ responseMessage, isAborted }) => {
        // Only completed turns hit the DB — an aborted stream leaves the thread
        // valid, with no half-written tool call. Best-effort: a persistence
        // failure is logged, never surfaced to the user mid-stream.
        if (isAborted) return;
        try {
          // Resuming has no new user message — `userMessage` is the assistant
          // message the client sent back with the approval on it, and the turn
          // that produced it was already stored when the agent paused.
          await appendMessages(pool, ownerId, thread.id, [
            ...(approvals
              ? []
              : [{ id: userMessage.id, role: "user", parts: userMessage.parts }]),
            { id: responseMessage.id, role: responseMessage.role, parts: responseMessage.parts },
          ]);
          if (!thread.title && !approvals) {
            const title = firstText(userMessage);
            if (title) await setThreadTitle(pool, ownerId, thread.id, title.slice(0, 80));
          }
          // On LangChain the agent keeps its own history in graph state and
          // `summarizationMiddleware` folds it, so running this too would pay
          // for a second summary that nothing reads. The AI SDK engine has no
          // state of its own and still needs it.
          if (!onLangChain) {
            const all = await listMessages(pool, ownerId, thread.id);
            await maintainSummary(
              pool,
              ownerId,
              thread.id,
              all,
              thread.summary,
              thread.summaryThroughCreatedAt
            );
          }
        } catch (err) {
          console.error("chat persistence failed", err);
        }
      },
    });

    logRequest(request, 200, startedAt, { userId: ownerId });
    return response;
  } catch (err) {
    return serverError(request, startedAt, err);
  }
}

/**
 * The user's answers to a paused turn, if this request is one.
 *
 * Returns undefined for an ordinary message, which is what tells the rest of
 * the handler to start a turn rather than resume one. The order is the order
 * the parts appear in, which is the order the agent asked for them.
 */
function readApprovals(message: { role: string; parts: unknown[] }): ToolApproval[] | undefined {
  if (message.role !== "assistant") return undefined;
  const answered = message.parts
    .map((part) => approvalPartSchema.safeParse(part))
    .filter((result) => result.success)
    .map((result) => result.data.approval);
  if (answered.length === 0) return undefined;
  return answered.map(({ approved, reason }) => ({ approved, reason }));
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
  const res = errorResponse(err);
  logRequest(request, res.status, startedAt, {
    ...(res.status >= 500 ? { error: err instanceof Error ? err.message : String(err) } : {}),
  });
  return res;
}
