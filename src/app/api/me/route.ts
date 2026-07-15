import { getPool } from "@/server/pool";
import { resolveWebUser } from "@/server/users";

/**
 * The current user's identity for the Settings screen: their id and the
 * personal access token to paste into an MCP client. Resolves (and, on a first
 * visit, creates) the user from the session cookie, just like /api/goals.
 *
 * The session token is deliberately not returned — it's httpOnly and never
 * meant to leave the cookie. The PAT is the credential the user manages.
 */
export async function GET(request: Request) {
  const pool = await getPool();
  const { user, setCookie } = await resolveWebUser(pool, request);

  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify({ userId: user.id, pat: user.pat }), { headers });
}
