import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "./pool";
import { clerkEmailResolver } from "./clerk-email";
import { log } from "./log";
import { resolveWebUser, SESSION_COOKIE, sessionSetCookie } from "./users";

/**
 * App initialization — the one thing that has to happen *before* anything
 * renders, run from the proxy ({@link src/proxy.ts}) on every page navigation.
 *
 * This is the **only** place a session is written. Everything downstream — the
 * RSC loaders, the Server Actions, the chat route — resolves the user read-only
 * from the cookie this settled (see server/current-user.ts), so a visitor's
 * identity is decided exactly once per page and is identical everywhere on it.
 * Two things happen here:
 *
 *  - **Minting.** A fresh visitor arrives with no session cookie and the page
 *    then fans out into several requests. If each minted its own account, the
 *    visitor would get a *different* random animal identity in every place (the
 *    topbar showing one name, the settings card another) and their goals would
 *    land on yet another account. Minting up front settles one session first.
 *  - **Linking.** Signing in with Clerk stamps that identity onto the account
 *    (or adopts the one already linked to it, re-pointing the cookie). That used
 *    to be a side effect of `GET /api/me`, which meant a user who signed in and
 *    then only *read* their goals was never linked at all — and so never got the
 *    durable, MCP-authorized account signing in is supposed to buy them.
 *
 * The resulting cookie is forwarded onto *this* request, so the RSC render that
 * follows already resolves the settled user, and set on the response so the
 * browser keeps it.
 *
 * `getClerkUserId` is resolved lazily — a Clerk round trip we only pay once the
 * cheap request checks have decided this request needs resolving at all.
 */
export async function establishSession(
  req: NextRequest,
  getClerkUserId: () => Promise<string | null>
): Promise<NextResponse> {
  // Only a real page navigation (an HTML document request) settles a session.
  // API/prefetch/asset requests skip this and simply inherit the cookie the
  // navigation already established — which keeps cookieless-by-design endpoints
  // (MCP over Bearer, the OAuth .well-known metadata, health) from ever minting
  // a throwaway account.
  const wantsHtml = req.headers.get("accept")?.includes("text/html") ?? false;
  if (!wantsHtml) return NextResponse.next();

  const clerkUserId = await getClerkUserId();
  // The common case by far: a returning anonymous visitor whose cookie already
  // resolves. Nothing to settle, so skip the database entirely.
  if (!clerkUserId && req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  try {
    const pool = await getPool();
    const { user, setCookie } = await resolveWebUser(
      pool,
      req,
      clerkUserId,
      clerkEmailResolver(clerkUserId)
    );
    if (!setCookie) return NextResponse.next();

    const res = NextResponse.next({
      request: { headers: withSessionCookie(req.headers, user.sessionToken) },
    });
    res.headers.append("set-cookie", sessionSetCookie(user.sessionToken));
    return res;
  } catch (err) {
    // Never turn a database blip into a blank page: fall through and let the
    // render handle it (the store shows its load-error state with a retry).
    log.error("session_bootstrap_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.next();
  }
}

/**
 * The request's cookies with the session cookie replaced by `token`, leaving
 * every other cookie (Clerk's, notably) in place. Replacing rather than
 * appending matters on the sign-in path, where the browser still carries the
 * *previous* account's cookie and a duplicate would be read first.
 */
function withSessionCookie(headers: Headers, token: string): Headers {
  const next = new Headers(headers);
  const others = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE}=`));
  next.set("cookie", [...others, `${SESSION_COOKIE}=${encodeURIComponent(token)}`].join("; "));
  return next;
}
