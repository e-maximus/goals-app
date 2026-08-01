import { test, expect } from "./fixtures";

// Basic happy-path smoke test for the app's core loop: reset to the seeded
// store, render the dashboard, and open a goal's detail page. This guards the
// main user-facing surface end to end (browser -> dev server -> Postgres ->
// server-rendered store) after cleanup changes that touch no runtime code, like
// removing the temporary debug probes (check-embed.mjs / check-ext.mjs).
test.describe("App happy path", () => {
  test("loads the seeded goals and opens a goal's detail page", async ({ page }) => {
    await page.goto("/goals");

    // The fixture resets the store to the canonical seeded goals before each test.
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Run a half marathon/ })).toBeVisible();

    await page.getByRole("link", { name: /Launch my podcast/ }).click();
    await expect(page).toHaveURL(/\/goal\/goal-podcast-launch-my-podcast$/);
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });
});
