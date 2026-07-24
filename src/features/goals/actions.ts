"use server";

import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/server/pool";
import * as repo from "@/server/repo";
import { clerkEmailResolver } from "@/server/clerk-email";
import { resolveWebUser, SESSION_COOKIE } from "@/server/users";
import type { Goal, Task } from "@/lib/types";
import type { ServerState, SaveResult } from "@/lib/sync";
import { saveInputSchema } from "./schemas";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Resolve the current web user from the session cookie (and a linked Clerk
 * identity when signed in), minting one on first visit. A Server Action can
 * both read and write cookies, so when a (new or switched) session should be
 * adopted we set it here — the same "GET doubles as sign-me-in" behaviour the
 * REST route had.
 */
async function currentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  // resolveWebUser reads the session cookie off a Request; hand it one carrying
  // just that cookie rather than reaching for the raw incoming request.
  const request = new Request("http://internal", {
    headers: token ? { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } : {},
  });
  const { userId: clerkUserId } = await auth();
  const pool = await getPool();
  const { user, setCookie } = await resolveWebUser(pool, request, clerkUserId, clerkEmailResolver(clerkUserId));
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
 * Persist the whole store (the web app's coarse write path). Returns a
 * discriminated result rather than throwing on conflict: a thrown error loses
 * its type across the Server Action boundary, so the stale-write case ({ ok:
 * false }) is data the client can act on — it reloads and retries.
 */
export async function saveState(input: unknown): Promise<SaveResult> {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid goals payload");

  const { goals, tasks, baseUpdatedAt } = parsed.data;
  const { pool, user } = await currentUser();
  try {
    const state = await repo.replaceAll(
      pool,
      user.id,
      goals as Goal[],
      baseUpdatedAt ?? null,
      tasks as Task[] | undefined
    );
    return { ok: true, state: state as ServerState };
  } catch (err) {
    if (err instanceof repo.ConflictError) {
      return { ok: false, serverUpdatedAt: err.serverUpdatedAt };
    }
    throw err;
  }
}
