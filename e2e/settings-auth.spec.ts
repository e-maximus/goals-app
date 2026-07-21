import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "./fixtures";

/**
 * The signed-in half of Settings: once a Clerk identity is linked, the MCP
 * section unlocks (the endpoint and Claude Code snippet). MCP is Clerk
 * OAuth-authorized, so there's no token to reveal or rotate. This mirrors
 * settings.spec.ts, which covers the anonymous *gated* state.
 *
 * Opt-in, because it needs a real Clerk sign-in against your dev instance:
 *
 *   E2E_CLERK_AUTH=1 \
 *   E2E_CLERK_EMAIL="e2e+clerk_test@example.com" \
 *   E2E_CLERK_PASSWORD="…" \
 *   npm run test:e2e settings-auth.spec.ts
 *
 * The email should be a Clerk *test* address (a `+clerk_test` subaddress) with a
 * password, created once in your Clerk app (Dashboard, or `clerk users create`).
 * With the vars unset the whole file skips, so the default suite never depends on
 * Clerk credentials. global-setup.ts fetches the Testing Token when enabled.
 */
const enabled = process.env.E2E_CLERK_AUTH === "1";
const email = process.env.E2E_CLERK_EMAIL ?? "";
const password = process.env.E2E_CLERK_PASSWORD ?? "";

test.describe("settings (signed in with Clerk)", () => {
  test.skip(!enabled || !email || !password, "set E2E_CLERK_AUTH + E2E_CLERK_EMAIL + E2E_CLERK_PASSWORD");

  test("unlocks the MCP endpoint once signed in", async ({ page }) => {
    await setupClerkTestingToken({ page });

    // The app must be loaded before Clerk's client is available to sign in.
    await page.goto("/settings");
    await clerk.signIn({
      page,
      signInParams: { strategy: "password", identifier: email, password },
    });
    await page.reload();

    // The gated placeholder is gone; the real MCP setup (the endpoint) is visible.
    await expect(page.getByText(/\/api\/mcp$/)).toBeVisible();

    // The account now reports itself as linked rather than anonymous.
    await expect(
      page.getByText("This account is linked to your sign-in", { exact: false })
    ).toBeVisible();
  });

  test("lets an email account edit their first and last name", async ({ page }) => {
    await setupClerkTestingToken({ page });

    await page.goto("/settings");
    await clerk.signIn({
      page,
      signInParams: { strategy: "password", identifier: email, password },
    });
    await page.reload();

    // An email account (no OAuth provider) owns its name: the fields are editable.
    const first = page.getByLabel("First name");
    const last = page.getByLabel("Last name");
    await expect(first).toBeEnabled({ timeout: 15_000 });
    await expect(last).toBeEnabled();

    // Save is idle until something changes, then commits the update to Clerk.
    const save = page.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();

    const stamp = String(Date.now()).slice(-6);
    await first.fill("E2E");
    await last.fill(`Tester ${stamp}`);
    await save.click();

    await expect(page.getByText("Name updated")).toBeVisible();
    await expect(save).toBeDisabled();
  });

  test("signs out from the account card", async ({ page }) => {
    await setupClerkTestingToken({ page });

    await page.goto("/settings");
    await clerk.signIn({
      page,
      signInParams: { strategy: "password", identifier: email, password },
    });
    await page.reload();

    await page.getByRole("button", { name: "Sign out" }).click();

    // Back to the anonymous state: sign in is offered again and MCP re-gates.
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText("Sign in above to enable MCP access")).toBeVisible();
  });
});
