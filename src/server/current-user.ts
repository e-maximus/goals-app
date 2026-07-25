import "server-only";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getPool } from "./pool";
import { clerkEmailResolver } from "./clerk-email";
import { resolveWebUser, resolveWebUserReadonly, SESSION_COOKIE, type User } from "./users";
import type { Pool } from "./db";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * The one place the app answers "who is this request?".
 *
 * Every caller used to repeat the same four steps — `auth()`, `getPool()`,
 * `clerkEmailResolver()`, `resolveWebUser()` — in a route handler, a Server
 * Action and an RSC loader alike. Since the whole data model is scoped by
 * `owner_id`, four copies of the identity logic were four chances for them to
 * drift apart. They live here now, in three shapes matching the three places
 * Next.js lets you read a session from.
 */

export type CurrentUser = { pool: Pool; user: User };

/**
 * Read-only resolution from the request's cookies — for Server Components and
 * anything else that may not write. Returns null for a visitor with no session
 * at all, which after {@link import("./bootstrap").establishSession} means a
 * request that never went through a page navigation.
 */
export async function currentUserReadonly(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const { userId: clerkUserId } = await auth();
  const pool = await getPool();
  const user = await resolveWebUserReadonly(
    pool,
    token,
    clerkUserId,
    clerkEmailResolver(clerkUserId)
  );
  return user ? { pool, user } : null;
}

/**
 * Resolution for a Server Action: reads the session cookie, mints an account
 * when there isn't one, and writes the cookie back itself — an action may do
 * both, so callers never have to thread a `Set-Cookie` around.
 */
export async function currentUserForAction(): Promise<CurrentUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  // resolveWebUser reads the session cookie off a Request; hand it one carrying
  // just that cookie rather than reaching for the raw incoming request.
  const request = new Request("http://internal", {
    headers: token ? { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } : {},
  });
  const { pool, user, setCookie } = await currentUserForRequest(request);
  if (setCookie) {
    cookieStore.set(SESSION_COOKIE, user.sessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: ONE_YEAR_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return { pool, user };
}

/**
 * Resolution for a route handler, which has the `Request` in hand and answers
 * with a `Response`: minting is allowed, and `setCookie` is the header the
 * handler must send back when the browser should adopt a new session.
 */
export async function currentUserForRequest(
  request: Request
): Promise<CurrentUser & { setCookie: string | null }> {
  const { userId: clerkUserId } = await auth();
  const pool = await getPool();
  const { user, setCookie } = await resolveWebUser(
    pool,
    request,
    clerkUserId,
    clerkEmailResolver(clerkUserId)
  );
  return { pool, user, setCookie };
}
