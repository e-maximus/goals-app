import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { log } from "./log";
import type { EmailResolver } from "./users";

/**
 * The one place the app asks Clerk for an identity's email address.
 *
 * It backs the account-recovery fallback in server/users.ts: `clerk_user_id` is
 * the primary key into an account, and when it misses — a Clerk user deleted and
 * signed up again comes back with a new id — the verified email matches the
 * original account instead of orphaning it.
 *
 * **Only a verified address is ever returned.** An unverified one would mean
 * anyone who signs up with someone else's email inherits their goals, so an
 * address still awaiting verification is treated as no address at all.
 *
 * Takes `string | null` so the web routes — where the visitor may be anonymous —
 * can hand it their `auth()` result unguarded; no identity means no resolver and
 * the callee's optional parameter simply goes unfilled.
 */
export function clerkEmailResolver(clerkUserId: string | null): EmailResolver | undefined {
  if (!clerkUserId) return undefined;
  return async () => {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(clerkUserId);
      const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
      if (!primary || primary.verification?.status !== "verified") return null;
      return primary.emailAddress;
    } catch (err) {
      // Never fail the user's request over a recovery key. Worst case the
      // fallback stays inert and behaves exactly as it did before it existed.
      log.error("clerk_email_lookup_failed", {
        clerkUserId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };
}
