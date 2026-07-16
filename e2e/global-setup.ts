import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Playwright global setup for the optional Clerk-authenticated tests.
 *
 * The normal suite runs entirely anonymously (cookie session) and needs none of
 * this, so we only reach out to Clerk when E2E_CLERK_AUTH=1 — otherwise this is
 * a no-op and the suite has no dependency on Clerk credentials at setup time.
 *
 * When enabled, clerkSetup() obtains a Testing Token (using CLERK_SECRET_KEY /
 * the publishable key from the environment) so setupClerkTestingToken() can wave
 * the browser past Clerk's bot protection during sign-in. See settings-auth.spec.ts.
 */
export default async function globalSetup() {
  if (process.env.E2E_CLERK_AUTH !== "1") return;
  await clerkSetup();
}
