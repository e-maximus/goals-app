import { test, expect } from "./fixtures";

// The e2e user is anonymous (cookie session, no Clerk sign-in). MCP is authorized
// only via Clerk OAuth, so an anonymous visitor sees the account id and the
// "stable authentication" upsell, but the MCP endpoint/setup stays hidden until
// they sign in. The signed-in MCP flow is covered separately in
// settings-auth.spec.ts, which needs Clerk test credentials.
test.describe("settings (anonymous)", () => {
  test("shows the account id and the sign-in upsell, MCP gated", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("User ID")).toBeVisible();
    await expect(page.getByText("Stable authentication")).toBeVisible();

    // The MCP section is present but locked behind sign-in.
    await expect(page.getByText("MCP access", { exact: true })).toBeVisible();
    await expect(page.getByText("Sign in above to enable MCP access.")).toBeVisible();
  });

  test("hides the MCP endpoint until signed in", async ({ page }) => {
    await page.goto("/settings");

    // The signed-in MCP setup (the endpoint) isn't reachable while anonymous.
    await expect(page.getByText(/\/api\/mcp$/)).toHaveCount(0);
  });
});
