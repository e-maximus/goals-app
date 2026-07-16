import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/server/pool";
import { resolveWebUser } from "@/server/users";

/**
 * The current user's identity for the Settings screen: their id and whether a
 * Clerk identity is linked to the account. Resolves (and, on a first visit,
 * creates) the user from the session cookie + any signed-in Clerk identity, just
 * like /api/goals.
 *
 * The session token is deliberately not returned — it's httpOnly and never meant
 * to leave the cookie. MCP is authorized via Clerk OAuth now, so there's no
 * token for the user to copy here.
 */
export async function GET(request: Request) {
  const { userId: clerkUserId } = await auth();
  const pool = await getPool();
  const { user, setCookie } = await resolveWebUser(pool, request, clerkUserId);

  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(
    JSON.stringify({ userId: user.id, clerkUserId: user.clerkUserId }),
    { headers }
  );
}
