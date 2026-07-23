import "server-only";
import { Prisma } from "@prisma/client";
import { withTransaction, type Client, type Pool } from "./db";
import { uid } from "./domain";
import { NotFoundError } from "./repo";

/**
 * Persistence for the AI chat's history. Threads and messages live in Postgres,
 * one set per user. Like the rest of the repo layer, every function is scoped to
 * a single `ownerId` and takes `(pool, ownerId, ...)`; `chat_threads` and
 * `chat_messages` both carry `owner_id` on the row, so every query filters on it
 * directly — never on a bare id — and one user can't reach another's chats.
 */

export type ChatThread = {
  id: string;
  title: string | null;
  /** A rolling summary of the turns already folded out of the live context. */
  summary: string | null;
  /** created_at (epoch ms) up to which `summary` covers; null if none folded yet. */
  summaryThroughCreatedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type StoredChatMessage = {
  id: string;
  role: string;
  /** AI SDK UIMessage parts (text, tool calls and results), stored verbatim. */
  parts: unknown;
  createdAt: number;
};

/** A message to append; `id` is optional (generated if absent). */
export type NewChatMessage = { id?: string; role: string; parts: unknown };

const ms = (v: bigint | number): number => Number(v);

function toThread(row: {
  id: string;
  title: string | null;
  summary: string | null;
  summary_through_created_at: bigint | number | null;
  created_at: bigint | number;
  updated_at: bigint | number;
}): ChatThread {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    summaryThroughCreatedAt:
      row.summary_through_created_at != null ? ms(row.summary_through_created_at) : null,
    createdAt: ms(row.created_at),
    updatedAt: ms(row.updated_at),
  };
}

function toMessage(row: {
  id: string;
  role: string;
  parts: Prisma.JsonValue;
  created_at: bigint | number;
}): StoredChatMessage {
  return {
    id: row.id,
    role: row.role,
    parts: row.parts,
    createdAt: ms(row.created_at),
  };
}

/**
 * The user's active thread — the most recently touched one — creating a fresh
 * empty thread if they have none yet. The UI shows a single thread; the schema
 * allows more, so this is deliberately "the latest", not "the only".
 */
export async function getOrCreateActiveThread(pool: Pool, ownerId: string): Promise<ChatThread> {
  const existing = await pool.db.chatThread.findFirst({
    where: { owner_id: ownerId },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
  });
  if (existing) return toThread(existing);

  return withTransaction(pool, async (client) => {
    const now = Date.now();
    const row = await client.db.chatThread.create({
      data: {
        id: uid(),
        owner_id: ownerId,
        title: null,
        summary: null,
        summary_through_created_at: null,
        created_at: BigInt(now),
        updated_at: BigInt(now),
      },
    });
    return toThread(row);
  });
}

/** Every message in a thread, oldest first — what the UI renders in full. */
export async function listMessages(
  pool: Pool,
  ownerId: string,
  threadId: string
): Promise<StoredChatMessage[]> {
  const rows = await pool.db.chatMessage.findMany({
    where: { thread_id: threadId, owner_id: ownerId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  return rows.map(toMessage);
}

/** Confirm a thread is this owner's; throws NotFoundError otherwise. */
async function requireThread(client: Client, ownerId: string, threadId: string): Promise<void> {
  const thread = await client.db.chatThread.findFirst({
    where: { id: threadId, owner_id: ownerId },
    select: { id: true },
  });
  if (!thread) throw new NotFoundError("chat thread", threadId);
}

/**
 * Append messages to a thread and bump its `updated_at`. Called once per turn
 * with the whole completed turn (user message + assistant message with its tool
 * parts), so a thread only ever gains complete turns — an aborted stream writes
 * nothing. created_at is assigned monotonically within the batch so order is
 * preserved even when several land in the same millisecond.
 */
export async function appendMessages(
  pool: Pool,
  ownerId: string,
  threadId: string,
  messages: NewChatMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  await withTransaction(pool, async (client) => {
    await requireThread(client, ownerId, threadId);
    const base = Date.now();
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      await client.db.chatMessage.create({
        data: {
          id: m.id || uid(),
          thread_id: threadId,
          owner_id: ownerId,
          role: m.role,
          parts: m.parts as Prisma.InputJsonValue,
          created_at: BigInt(base + i),
        },
      });
    }
    await client.db.chatThread.updateMany({
      where: { id: threadId, owner_id: ownerId },
      data: { updated_at: BigInt(base + messages.length) },
    });
  });
}

/** Set a thread's title (from its first user message). No-op if not the owner's. */
export async function setThreadTitle(
  pool: Pool,
  ownerId: string,
  threadId: string,
  title: string
): Promise<void> {
  await pool.db.chatThread.updateMany({
    where: { id: threadId, owner_id: ownerId },
    data: { title },
  });
}

/**
 * Advance the rolling summary: store the new summary text and the created_at up
 * to which it covers. The request builds model context from this summary plus
 * the messages after `throughCreatedAt`. Done in one write, so a failure leaves
 * the pointer where it was and the next request just carries a longer tail.
 */
export async function updateSummary(
  pool: Pool,
  ownerId: string,
  threadId: string,
  summary: string,
  throughCreatedAt: number
): Promise<void> {
  await pool.db.chatThread.updateMany({
    where: { id: threadId, owner_id: ownerId },
    data: { summary, summary_through_created_at: BigInt(throughCreatedAt) },
  });
}
