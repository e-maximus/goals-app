import { test as base, expect } from "@playwright/test";

/**
 * Goals are per-user and live in Postgres, so a test can't rely on a fresh
 * browser context to reset the world the way the old localStorage app did.
 * Instead, an automatic fixture resets a fixed e2e test user to the canonical
 * seeded goals before each test, then drops that user's session cookie into the
 * browser — so every test runs as the same known user with the same known
 * starting state, and can navigate straight to `/goal?id=goal-podcast`.
 *
 * Because the store is shared, the suite runs serially (see playwright.config).
 * The reset hits an env-gated test-only endpoint; see /api/test/reset.
 *
 * Import `test` and `expect` from here rather than from "@playwright/test".
 */

// Must match SESSION_COOKIE in src/server/users.ts.
const SESSION_COOKIE = "session";

export const test = base.extend<{ seededStore: void }>({
  seededStore: [
    async ({ request, context, baseURL }, use) => {
      const res = await request.post("/api/test/reset");
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
