import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Playwright global setup.
 *
 * The app is wrapped in ClerkProvider and runs clerkMiddleware, so even the
 * anonymous suite loads through Clerk: on a development instance a real browser
 * is bounced through a dev-browser handshake before any page renders. clerkSetup()
 * obtains a Testing Token (using CLERK_SECRET_KEY / the publishable key from the
 * environment) that setupClerkTestingToken() then uses to wave the browser past
 * that handshake and Clerk's bot protection — see e2e/fixtures.ts and
 * settings-auth.spec.ts.
 *
 * Only runs when Clerk is configured (always in CI and in a real deploy). With no
 * keys it's a no-op, so a bare local run has no dependency on Clerk at setup time.
 */
export default async function globalSetup() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return;
  await clerkSetup();
}
