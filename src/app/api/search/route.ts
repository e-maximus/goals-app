import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getPool } from "@/server/pool";
import { search } from "@/server/search/search";
import { resolveWebUser } from "@/server/users";
import { logRequest } from "@/server/log";

/**
 * Search the current user's goals, steps, notes and tasks.
 *
 * POST rather than GET because the query is user text that has no business in a
 * URL — it lands in access logs, browser history and referrers, and these are
 * someone's private notes. There is nothing to cache here either: the index
 * changes on every write.
 *
 * Scoped to the session's user (and their linked Clerk identity when signed in),
 * exactly as /api/goals is. The owner is never taken from the request body.
 */
const bodySchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(25).optional(),
  kinds: z.array(z.enum(["goal", "step", "note", "task"])).nonempty().optional(),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const res = Response.json({ error: "Invalid search request" }, { status: 400 });
      logRequest(request, res.status, startedAt);
      return res;
    }

    const { userId: clerkUserId } = await auth();
    const pool = await getPool();
    const { user } = await resolveWebUser(pool, request, clerkUserId);
    userId = user.id;

    const { query, limit, kinds } = parsed.data;
    const hits = await search(pool, user.id, query, { limit, kinds });

    const res = Response.json({ hits });
    // The query itself is deliberately not logged — it is the user's private
    // text. The result count is enough to tell a broken search from a quiet one.
    logRequest(request, res.status, startedAt, { userId, hits: hits.length });
    return res;
  } catch (err) {
    const res = Response.json({ error: "Internal server error" }, { status: 500 });
    logRequest(request, res.status, startedAt, {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return res;
  }
}
