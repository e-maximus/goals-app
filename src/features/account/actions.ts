"use server";

import { currentUserForAction } from "@/server/current-user";
import type { Me } from "./types";

/**
 * Settle the account after Clerk sign-in.
 *
 * Signing in happens in a modal, not a navigation, so the proxy — where a
 * session is normally established — doesn't get a chance to link the Clerk
 * identity to this account. Without this, a user who signed in and then only
 * *read* their goals would stay unlinked until their next page load, and the
 * durable, MCP-authorized account that signing in is supposed to buy them
 * wouldn't exist yet. A Server Action can write the cookie, so the same
 * resolution the proxy does runs here instead, exactly once per sign-in.
 */
export async function syncIdentity(): Promise<Me> {
  const { user } = await currentUserForAction();
  return {
    userId: user.id,
    clerkUserId: user.clerkUserId,
    displayName: user.displayName,
    avatar: user.avatar,
  };
}
