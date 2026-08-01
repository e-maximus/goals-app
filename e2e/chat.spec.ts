import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "./fixtures";

/**
 * The assistant drawer.
 *
 * The assistant requires a signed-in account — the server enforces `isSignedIn`
 * with a 403 and the UI hides the button for anonymous visitors. The happy path
 * (a signed-in account keeps the button and can open the drawer) runs on every
 * CI run as the server-linked e2e user; the streaming coverage (open, send,
 * stream a reply) requires a real Clerk sign-in and is gated on
 * `E2E_CLERK_AUTH`, which CI does not set.
 *
 * The model call is faked at the network boundary so the suite stays
 * deterministic and needs no API key: POST /api/chat is fulfilled with a canned
 * UI-message stream (the exact event shape the AI SDK emits), while GET
 * /api/chat (loading thread history) passes through to the real endpoint.
 */
const REPLY = "Here is your plan.";

const stream =
  [
    `data: ${JSON.stringify({ type: "start", messageId: "assistant-mock" })}`,
    `data: ${JSON.stringify({ type: "start-step" })}`,
    `data: ${JSON.stringify({ type: "text-start", id: "t0" })}`,
    `data: ${JSON.stringify({ type: "text-delta", id: "t0", delta: REPLY })}`,
    `data: ${JSON.stringify({ type: "text-end", id: "t0" })}`,
    `data: ${JSON.stringify({ type: "finish-step" })}`,
    `data: ${JSON.stringify({ type: "finish" })}`,
    "data: [DONE]",
  ].join("\n\n") + "\n\n";

const SESSION_COOKIE = "session";

test.describe("AI chat, signed out", () => {
  test("an anonymous visitor gets no Assistant button and the page still works", async ({
    page,
    context,
  }) => {
    // Only the app's session cookie: Clerk's testing-token cookies must survive
    // or the browser hangs on the dev-browser handshake.
    await context.clearCookies({ name: SESSION_COOKIE });
    await page.goto("/goals");

    // The page itself still works — a fresh visitor gets their own seeded copy.
    await expect(page.getByRole("main").getByRole("link").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Assistant" })).toHaveCount(0);
  });
});

/**
 * The e2e user is linked on the server (see resetTestUser), so the fixture's
 * session cookie resolves to a signed-in account without any Clerk credentials —
 * the same way search.spec.ts covers its signed-in half. That keeps the happy
 * path of the gate on every CI run: the button is visible for a signed-in
 * account and the drawer opens, while the anonymous visitor above gets neither.
 */
test.describe("AI chat, signed in (e2e user)", () => {
  test("a signed-in account keeps the Assistant button and can open the drawer", async ({
    page,
  }) => {
    await page.goto("/goals");

    // The gate's positive side: the same server-resolved identity that hides
    // the button anonymously renders it here, correct on the first paint.
    const trigger = page.getByRole("button", { name: "Assistant" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Ask it to plan or update your goals")).toBeVisible();
    await expect(dialog.getByLabel("Message the assistant")).toBeVisible();
  });
});

const enabled = process.env.E2E_CLERK_AUTH === "1";
const email = process.env.E2E_CLERK_EMAIL ?? "";
const password = process.env.E2E_CLERK_PASSWORD ?? "";

test.describe("AI chat, signed in", () => {
  test.skip(
    !enabled || !email || !password,
    "set E2E_CLERK_AUTH + E2E_CLERK_EMAIL + E2E_CLERK_PASSWORD"
  );

  test("opens the assistant and streams a reply", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "x-vercel-ai-ui-message-stream": "v1" },
        body: stream,
      });
    });

    await setupClerkTestingToken({ page });
    await page.goto("/goals");
    await clerk.signIn({
      page,
      signInParams: { strategy: "password", identifier: email, password },
    });
    await page.reload();

    await page.getByRole("button", { name: "Assistant" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Ask it to plan or update your goals")).toBeVisible();

    const composer = dialog.getByLabel("Message the assistant");
    await composer.fill("Make me a plan");
    await composer.press("Enter");

    await expect(dialog.getByText("Make me a plan")).toBeVisible();
    await expect(dialog.getByText(REPLY)).toBeVisible();
    // The composer clears and is usable again after the reply.
    await expect(composer).toHaveValue("");
    await expect(composer).toBeEnabled();
  });

  test("the assistant trigger lives in the header", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/goals");
    await clerk.signIn({
      page,
      signInParams: { strategy: "password", identifier: email, password },
    });
    await page.reload();

    await expect(page.getByRole("button", { name: "Assistant" })).toBeVisible();
  });
});
