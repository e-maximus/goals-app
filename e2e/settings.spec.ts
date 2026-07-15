import { test, expect } from "./fixtures";

test.describe("settings", () => {
  test("shows the account id and MCP connection details", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("User ID")).toBeVisible();
    await expect(page.getByText("MCP access")).toBeVisible();

    // The endpoint is same-origin and points at /api/mcp.
    await expect(page.getByText(/\/api\/mcp$/)).toBeVisible();
  });

  test("reveals the MCP token on demand", async ({ page }) => {
    await page.goto("/settings");

    // Hidden by default: shown as dots, not the real token.
    const reveal = page.getByRole("button", { name: "Show token" });
    await expect(reveal).toBeVisible();
    await expect(page.getByText("••••", { exact: false })).toBeVisible();

    await reveal.click();
    await expect(page.getByRole("button", { name: "Hide token" })).toBeVisible();
  });

  test("rotates the token after confirmation", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("button", { name: "Rotate token" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Rotate MCP token?")).toBeVisible();
    await dialog.getByRole("button", { name: "Rotate token" }).click();

    await expect(page.getByText("New MCP token issued")).toBeVisible();
  });
});
