import { test, expect } from "@playwright/test";

// Sync is opt-in. These tests run with no goals server around, which is exactly
// the state the public deployment is in — the app must be fully usable and must
// not claim to be connected to anything.
test.describe("Sync settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("starts disconnected, with goals kept locally", async ({ page }) => {
    await page.getByRole("button", { name: "Sync settings" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Not connected — goals stay in this browser")).toBeVisible();
  });

  test("reports an address with no goals server behind it", async ({ page }) => {
    await page.getByRole("button", { name: "Sync settings" }).click();

    const dialog = page.getByRole("dialog");
    // Port 9 is the discard protocol — reliably nothing listening.
    await dialog.getByLabel("Server address").fill("http://localhost:9");
    await dialog.getByRole("button", { name: "Test connection" }).click();

    await expect(dialog.getByText("No goals server at that address")).toBeVisible();
  });

  test("the app works normally while disconnected", async ({ page }) => {
    // The goals are seeded and editable with no server in sight.
    await page.getByRole("link", { name: /Launch my podcast/ }).click();
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();

    await page.getByLabel("Comment", { exact: true }).fill("Still offline, still works.");
    await page.getByRole("button", { name: "Post comment" }).click();

    await expect(page.getByText("Still offline, still works.")).toBeVisible();
  });
});
