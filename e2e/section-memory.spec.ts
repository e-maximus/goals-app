import { test, expect } from "./fixtures";

// The wordmark still always points Home; this is the one-time "resume where you
// left off" redirect, which fires only on the first Home open of a session.
test.describe("Section memory — resume last section", () => {
  test("redirects Home to the last section on the first open of a session", async ({ page }) => {
    // Visit Tasks so it's remembered as the last section (in localStorage).
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/tasks$/);

    // Simulate a fresh session: drop the once-per-session flag but keep the
    // cross-session memory, then open Home.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/");

    // The first Home open of the new session resumes to Tasks.
    await expect(page).toHaveURL(/\/tasks$/);
  });

  test("does not redirect again later in the same session", async ({ page }) => {
    // First open is Tasks — that consumes the session's one resume, and lands
    // off Home so nothing is redirected.
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/tasks$/);

    // Going Home later in the same session stays on Home.
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /Keep going/ })).toBeVisible();
  });

  test("stays on Home for a fresh visitor with nothing remembered", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /Keep going/ })).toBeVisible();
  });
});
