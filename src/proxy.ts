import { clerkMiddleware } from "@clerk/nextjs/server";
import { bootstrapSession } from "@/server/bootstrap";

/**
 * Clerk auth is **optional** here. A visitor with no account still gets a cookie
 * session (see src/server/users.ts) and can create and edit goals — that path is
 * unchanged. Signing in with Clerk instead *links a stable identity* to that
 * account so it survives a cleared cookie or a new device, and unlocks the
 * features that need a durable account (MCP today, AI chat later).
 *
 * This middleware only *populates* auth for the route handlers to read via
 * `auth()`; it never calls `auth.protect()`. No route is gated at the edge.
 *
 * The one bit of work it does before anything renders is app initialization:
 * {@link bootstrapSession} mints the anonymous session up front so a first-time
 * visitor resolves to a *single* account — and a single generated identity —
 * everywhere on the page, instead of minting a different one per request.
 */
export default clerkMiddleware(async (auth, req) =>
  bootstrapSession(req, async () => (await auth()).userId != null)
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
