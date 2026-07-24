import "server-only";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/server/pool";
import * as repo from "@/server/repo";
import { clerkEmailResolver } from "@/server/clerk-email";
import { resolveWebUserReadonly, SESSION_COOKIE } from "@/server/users";
import type { ServerState } from "@/lib/sync";

/**
 * Load the current user's whole store on the server, for an RSC initial render
 * (the `(app)` layout awaits this and hands it to the store). This is where the
 * goals are fetched now — server-side, at request time — instead of a client
 * `useEffect` round-trip.
 *
 * Read-only by necessity: a Server Component can't set the session cookie, so a
 * brand-new visitor (no cookie yet) can't be minted here. That case returns
 * null and the client falls back to its cookie-setting load on mount.
 */
export async function loadInitialState(): Promise<ServerState | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const { userId: clerkUserId } = await auth();
  const pool = await getPool();
  const user = await resolveWebUserReadonly(pool, token, clerkUserId, clerkEmailResolver(clerkUserId));
  if (!user) return null;
  return repo.getState(pool, user.id);
}
