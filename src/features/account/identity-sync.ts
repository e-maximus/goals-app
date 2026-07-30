/**
 * When a client-side identity sync is warranted.
 *
 * Pulled out of {@link MeProvider} as a plain function because the cost of
 * getting it wrong is invisible in the component: syncing calls
 * `router.refresh()`, which re-runs the whole server tree — both loaders and a
 * fresh store hydration — and reads to the user as the page reloading under
 * them. Clerk re-reads its session whenever a backgrounded tab comes back, so
 * "`isSignedIn` changed" is far too broad a trigger; it has to be a sign-in the
 * server doesn't already know about.
 */
export function shouldSyncIdentity({
  previousSignedIn,
  isSignedIn,
  linked,
}: {
  /** The last settled reading, or null if this is the first one. */
  previousSignedIn: boolean | null;
  /** What Clerk says now. */
  isSignedIn: boolean;
  /** Whether the server already resolved a Clerk identity for this account. */
  linked: boolean;
}): boolean {
  // The first settled reading describes the render we already have.
  if (previousSignedIn === null) return false;
  // Only signed-out → signed-in. A sign-out hard-navigates through
  // /api/auth/sign-out to drop the app's own cookie, so it reloads regardless.
  if (previousSignedIn || !isSignedIn) return false;
  // A page navigation links the identity in the proxy (src/server/bootstrap.ts).
  // If that already happened, there is nothing left for the action to settle.
  return !linked;
}
