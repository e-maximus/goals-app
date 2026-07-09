import { test, expect } from "@playwright/test";

test.describe("Importing a goal", () => {
  test("imports a valid goal JSON and shows it on the dashboard", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Import" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Import goal")).toBeVisible();

    const validJson = JSON.stringify({
      title: "Imported Goal",
      why: "Restored from backup",
      groups: [
        {
          title: "Phase 1",
          steps: [
            { text: "Research", done: false },
            { text: "Plan", done: true },
          ],
        },
        {
          title: "Phase 2",
          steps: [{ text: "Execute", done: false }],
        },
      ],
    });

    await dialog.getByPlaceholder("Paste goal JSON here…").fill(validJson);
    await dialog.getByRole("button", { name: "Import" }).click();

    // Dialog should close after successful import
    await expect(dialog).not.toBeVisible();

    // The new goal should appear at the top
    await expect(page.getByRole("link", { name: /Imported Goal/ })).toBeVisible();
  });

  test("shows an error for invalid JSON", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Import" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Missing title
    const invalidJson = JSON.stringify({ groups: [] });

    await dialog.getByPlaceholder("Paste goal JSON here…").fill(invalidJson);
    await dialog.getByRole("button", { name: "Import" }).click();

    await expect(dialog.getByText("Invalid JSON. Check format and required fields.")).toBeVisible();
    // Dialog should still be open
    await expect(dialog).toBeVisible();
  });
});
