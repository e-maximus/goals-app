import { getPool } from "@/server/pool";
import { resolveWebUser, rotatePat } from "@/server/users";

/**
 * Issue the current user a fresh personal access token, revoking the old one.
 * The user is resolved from the session cookie, so only the browser that owns
 * the account can rotate its token. Goals and the web session are untouched.
 */
export async function POST(request: Request) {
  const pool = await getPool();
  const { user, setCookie } = await resolveWebUser(pool, request);
  const pat = await rotatePat(pool, user.id);

  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify({ pat }), { headers });
}
