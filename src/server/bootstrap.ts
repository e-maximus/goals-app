import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "./pool";
import { createUser, SESSION_COOKIE, sessionSetCookie } from "./users";

/**
 * App initialization — the one thing that has to happen *before* anything
 * renders, run from the proxy ({@link src/proxy.ts}) on every request.
 *
 * Its job: make sure a first-time anonymous visitor has **exactly one** session
 * minted before the page fans out. A fresh visitor arrives with no session
 * cookie, and the page then fires several requests at once — the RSC store load
 * (`/api/goals`) and the identity chip on the topbar, home and settings
 * (`/api/me`). If each minted its own account, the visitor would get a
 * *different* random animal identity in every place (the topbar showing one
 * name, the settings card another) and their goals would land on yet another
 * account. Minting here, on the initial HTML navigation, settles a single
 * session first: the cookie is forwarded onto this very request (so the RSC
 * render and any handler already resolve the new user) and set on the response
 * (so the browser keeps it). Every later request in the page then resolves the
 * same account, so the identity is generated exactly once and is identical
 * everywhere.
 *
 * `isSignedIn` is resolved lazily — a Clerk round trip we only pay once the
 * cheap request checks have already decided a mint might be needed.
 */
export async function bootstrapSession(
  req: NextRequest,
  isSignedIn: () => Promise<boolean>
): Promise<NextResponse> {
  // Only mint on a real page navigation (an HTML document request) for a visitor
  // who has no session yet. API/prefetch/asset requests skip this and simply
  // inherit the cookie the navigation already established — which keeps
  // cookieless-by-design endpoints (MCP over Bearer, the OAuth .well-known
  // metadata, health) from ever minting a throwaway account.
  const wantsHtml = req.headers.get("accept")?.includes("text/html") ?? false;
  if (!wantsHtml || req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  // A signed-in visitor without a cookie (new device, cleared cookie) resolves
  // to their durable Clerk-linked account in the handlers — minting an anonymous
  // one here would just leak an orphan account, so leave it to them.
  if (await isSignedIn()) return NextResponse.next();

  const pool = await getPool();
  const user = await createUser(pool);
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(user.sessionToken)}`;

  // Forward the new cookie on *this* request so the RSC render (loadInitialState)
  // and any handler downstream already see the session, merging it alongside any
  // cookies already present (e.g. Clerk's) rather than clobbering them.
  const requestHeaders = new Headers(req.headers);
  const existing = req.headers.get("cookie");
  requestHeaders.set("cookie", existing ? `${existing}; ${cookie}` : cookie);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.append("set-cookie", sessionSetCookie(user.sessionToken));
  return res;
}
