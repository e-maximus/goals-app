import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/server/pool";
import * as repo from "@/server/repo";
import { resolveWebUser } from "@/server/users";
import { logRequest } from "@/server/log";

/**
 * The read surface for the web app's store. Deliberately coarse: the app owns
 * the whole store client-side, so it pulls all of it here. Writes go through the
 * `saveState` Server Action (src/features/goals/actions.ts); the fine-grained
 * operations live on the MCP side, where an agent acts one edit at a time.
 *
 * Scoped to the current user, resolved from the session cookie (and a linked
 * Clerk identity when signed in — see resolveWebUser). A first-time visitor is
 * created here and handed a cookie, so GET doubles as "sign me in".
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const { userId: clerkUserId } = await auth();
    const pool = await getPool();
    const { user, setCookie } = await resolveWebUser(pool, request, clerkUserId);
    userId = user.id;
    const res = json(await repo.getState(pool, user.id), setCookie);
    logRequest(request, res.status, startedAt, { userId });
    return res;
  } catch (err) {
    return toErrorResponse(err, request, startedAt, userId);
  }
}

/** JSON response that also sets the session cookie when a new user was minted. */
function json(body: unknown, setCookie: string | null): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { headers });
}

/** The repo's domain errors, mapped onto status codes. Anything else is a 500. */
function toErrorResponse(
  err: unknown,
  request: Request,
  startedAt: number,
  userId?: string
): Response {
  const res = errorResponse(err);
  logRequest(request, res.status, startedAt, {
    userId,
    ...(res.status >= 500 ? { error: err instanceof Error ? err.message : String(err) } : {}),
  });
  return res;
}

function errorResponse(err: unknown): Response {
  if (err instanceof repo.NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof repo.ValidationError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
