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
    // The content waits for clerk-js from Clerk's CDN before loading the
    // identity, which can take longer than the default expect timeout.
    await expect(page.getByText("User ID")).toBeVisible({ timeout: 15_000 });
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

  test("shows a loader, then an error, when Clerk fails to initialize", async ({ page }) => {
    // The page waits for Clerk before loading the identity. Block clerk-js so
    // it never initializes — the page must show a loader instead of staying
    // blank, and give up with the error state once the deadline passes. Block
    // only the external Clerk host: a broader pattern would also catch the
    // app's own @clerk/nextjs chunk and break hydration entirely.
    await page.route(/clerk\.accounts\.dev/, (route) => route.abort());
    await page.goto("/settings");

    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByText("Couldn't load your settings")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
