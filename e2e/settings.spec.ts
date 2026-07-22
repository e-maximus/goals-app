import { test, expect } from "./fixtures";

// The e2e user is anonymous (cookie session, no Clerk sign-in). MCP is authorized
// only via Clerk OAuth, so an anonymous visitor sees the sign-in hero, their
// temporary generated identity, and a gated MCP section — the endpoint stays
// hidden until they sign in. The signed-in flow is covered separately in
// settings-auth.spec.ts, which needs Clerk test credentials.
test.describe("settings (anonymous)", () => {
  test("shows the sign-in hero and gates MCP", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    // The content waits for clerk-js from Clerk's CDN before loading the
    // identity, which can take longer than the default expect timeout.
    await expect(page.getByText("Save your goals — sign in")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/lives only in this browser's cookie/)).toBeVisible();

    // The MCP section is present but locked behind sign-in.
    await expect(page.getByText("MCP access", { exact: true })).toBeVisible();
    await expect(page.getByText("Sign in above to enable MCP access.")).toBeVisible();
  });

  test("shows the generated identity with a Guest badge and a copyable id", async ({ page }) => {
    await page.goto("/settings");

    // The e2e user's generated identity is "Shiny Fox", shown in the guest strip.
    await expect(page.getByText("Shiny Fox").first()).toBeVisible({ timeout: 15_000 });
    // Marked as a temporary, cookie-scoped identity, with a copy control.
    await expect(page.getByText("Temporary identity", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy ID" })).toBeVisible();

    // Anonymous: there are no editable name fields — signing in creates them.
    await expect(page.getByLabel("First name")).toHaveCount(0);
  });

  test("explains the account is temporary and offers sign in", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText(/lives only in this browser's cookie/)).toBeVisible({
      timeout: 15_000,
    });
    // The hero offers both paths to a durable account.
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("shows the generated identity chip in the topbar", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();

    const chip = page.getByRole("link", { name: "Account" });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Shiny Fox");
    await expect(chip).toContainText("Guest");

    // The chip is a shortcut to Settings.
    await chip.click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("hides the MCP endpoint until signed in", async ({ page }) => {
    await page.goto("/settings");

    // The signed-in MCP setup (the endpoint) isn't reachable while anonymous.
    await expect(page.getByText(/\/api\/mcp$/)).toHaveCount(0);
  });

  test("still renders the account when Clerk fails to initialize", async ({ page }) => {
    // Simulate a deploy where clerk-js never initializes (missing/misconfigured
    // publishable key, blocked script): loading the identity does not depend on
    // Clerk, so after a short deadline the page must fall back to the guest view
    // rather than hang blank or fall into an error. Block only the external Clerk
    // host — a broader pattern would also catch the app's own @clerk/nextjs chunk
    // and break hydration entirely.
    await page.route(/clerk\.accounts\.dev/, (route) => route.abort());
    await page.goto("/settings");

    await expect(page.getByText("Save your goals — sign in")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Shiny Fox").first()).toBeVisible();
  });
});
