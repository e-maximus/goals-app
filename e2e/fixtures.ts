import { test as base, expect } from "@playwright/test";

/**
 * The goals now live in Postgres, shared by every test, so a test can't rely on
 * a fresh browser context to reset the world the way the old localStorage app
 * did. Instead, an automatic fixture resets the store to the seeded example
 * goals before each test — giving every test the same known starting state.
 *
 * Because the store is shared, the suite runs serially (see playwright.config).
 * The reset hits an env-gated test-only endpoint; see /api/test/reset.
 *
 * Import `test` and `expect` from here rather than from "@playwright/test".
 */
export const test = base.extend<{ seededStore: void }>({
  seededStore: [
    async ({ request }, use) => {
      const res = await request.post("/api/test/reset");
      expect(res.ok(), "failed to reset the store before the test").toBeTruthy();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
