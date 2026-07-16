import { test as base, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Goals are per-user and live in Postgres, so a test can't rely on a fresh
 * browser context to reset the world the way the old localStorage app did.
 * Instead, an automatic fixture resets a fixed e2e test user to the canonical
 * seeded goals before each test, then drops that user's session cookie into the
 * browser — so every test runs as the same known user with the same known
 * starting state, and can navigate straight to `/goal/goal-podcast`.
 *
 * Because the store is shared, the suite runs serially (see playwright.config).
 * The reset hits an env-gated test-only endpoint; see /api/test/reset.
 *
 * Import `test` and `expect` from here rather than from "@playwright/test".
 */

// Must match SESSION_COOKIE in src/server/users.ts.
const SESSION_COOKIE = "session";

// The app is wrapped in ClerkProvider and runs clerkMiddleware. On a Clerk
// *development* instance, a real browser is bounced through a dev-browser
// handshake before any page renders — which would hang the anonymous suite.
// A Clerk Testing Token waves the browser straight past it. Only meaningful
// when Clerk keys are configured (they always are in CI and in a real deploy);
// harmless to skip otherwise. global-setup.ts fetches the token.
const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const test = base.extend<{ seededStore: void }>({
  seededStore: [
    async ({ page, context, baseURL }, use) => {
      if (clerkConfigured) await setupClerkTestingToken({ page });

      // Use page.request, not the standalone `request` fixture: it shares the
      // browser context, so the Clerk Testing Token applied above waves this
      // call past the dev-browser handshake too.
      const res = await page.request.post("/api/test/reset");
      expect(res.ok(), "failed to reset the store before the test").toBeTruthy();
      const { sessionToken } = (await res.json()) as { sessionToken: string };

      await context.addCookies([
        { name: SESSION_COOKIE, value: sessionToken, url: baseURL ?? "http://localhost:3000" },
      ]);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
