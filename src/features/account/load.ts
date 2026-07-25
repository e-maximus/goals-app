import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { currentUserReadonly } from "@/server/current-user";
import { log } from "@/server/log";
import type { Me } from "./types";

/**
 * Resolve the current identity on the server, for the layouts to hand down.
 *
 * This replaces a `GET /api/me` that three separate client components used to
 * fetch from an effect — the topbar chip, the home greeting and the Settings
 * page — each with its own loading state, and the topbar with a module-level
 * promise cache to stop them tripling the request. The identity is known before
 * the page renders, so it is simply passed down; `cache()` keeps the three
 * consumers on one query per request.
 *
 * Null means no session on this request or a database that didn't answer. The
 * UI treats it as "identity unknown" and shows the neutral chip rather than
 * failing the page — nothing here is worth a blank screen.
 */
export const loadMe = cache(async (): Promise<Me | null> => {
  try {
    const current = await currentUserReadonly();
    if (!current) return null;
    const { user } = current;
    return {
      userId: user.id,
      clerkUserId: user.clerkUserId,
      displayName: user.displayName,
      avatar: user.avatar,
    };
  } catch (err) {
    // Next signals things like "this route can't be static" by throwing; those
    // are control flow, not failures, and must not be swallowed here.
    unstable_rethrow(err);
    log.error("identity_load_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});
