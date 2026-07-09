import { test, expect } from "@playwright/test";

test.describe("Application version", () => {
  test("displays current version at the bottom of the page", async ({ page }) => {
    await page.goto("/");

    // Matches "Current version of application v0.1.1" — no hardcoded number so test stays green on bumps.
    await expect(page.getByText(/^Current version of application v\d+\.\d+\.\d+$/)).toBeVisible();
  });
});
