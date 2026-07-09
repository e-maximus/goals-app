import { test, expect } from "@playwright/test";

test.describe("Version footer", () => {
  test("displays current version at the bottom of the page", async ({ page }) => {
    await page.goto("/");

    // Matches semver like v0.1.1 — no hardcoded number so test stays green on bumps.
    await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  });
});
