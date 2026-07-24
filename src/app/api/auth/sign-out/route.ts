import { sessionClearCookie } from "@/server/users";

/**
 * Land here right after Clerk sign-out to drop the app's own session cookie.
 * Clerk only ends the Clerk session; the httpOnly session cookie is a separate
 * key that would otherwise keep resolving this browser to the account it just
 * signed out of — so a logged-out visitor would still see the signed-in user's
 * goals under a guest name. Clearing it detaches the browser: the next request
 * mints a fresh anonymous guest with the starter goals, while the signed-in
 * account (and its goals) stays put and comes back on the next sign-in.
 *
 * An httpOnly cookie can't be cleared from client JS, so sign-out hard-navigates
 * here and we clear it via Set-Cookie, then redirect home.
 */
export function GET(request: Request) {
  const home = new URL("/", request.url);
  const headers = new Headers({ location: home.toString() });
  headers.append("set-cookie", sessionClearCookie());
  return new Response(null, { status: 303, headers });
}
