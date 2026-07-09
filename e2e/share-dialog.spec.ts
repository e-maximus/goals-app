import { test, expect } from "@playwright/test";

test.describe("Share dialog mode toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal?id=goal-podcast");
    await expect(
      page.getByRole("heading", { name: "Launch my podcast", level: 1 })
    ).toBeVisible();
  });

  test("defaults to Text mode with a human-readable outline", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Text button should be active (default variant) and JSON should be outline
    await expect(dialog.getByRole("button", { name: "Text" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "JSON" })).toBeVisible();

    // The textarea content should contain human-readable markers, not JSON keys
    const textarea = dialog.locator("textarea");
    const text = await textarea.inputValue();
    expect(text).toContain("Launch my podcast");
    expect(text).toContain("[x] Pick a name");
    expect(text).toContain("[ ] Edit ep. 1");
    expect(text).not.toContain('"id"');
  });

  test("toggles to JSON mode and back to Text", async ({ page }) => {
    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const textarea = dialog.locator("textarea");

    // Switch to JSON
    await dialog.getByRole("button", { name: "JSON" }).click();
    let text = await textarea.inputValue();
    expect(text.startsWith("{")).toBe(true);
    // Validate it's parseable JSON
    expect(() => JSON.parse(text)).not.toThrow();

    // Switch back to Text (use native click to bypass viewport check inside dialog)
    await dialog.getByRole("button", { name: "Text" }).evaluate((el) => {
      (el as HTMLElement).click();
    });
    text = await textarea.inputValue();
    expect(text).toContain("[x] Pick a name");
    expect(text).not.toContain('"id"');
  });
});
