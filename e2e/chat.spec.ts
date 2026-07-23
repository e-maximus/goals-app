import { test, expect } from "./fixtures";

/**
 * The assistant drawer. The model call is faked at the network boundary so the
 * suite stays deterministic and needs no API key: POST /api/chat is fulfilled
 * with a canned UI-message stream (the exact event shape the AI SDK emits),
 * while GET /api/chat (loading thread history) passes through to the real
 * endpoint. This covers the drawer UI — open, send, stream a reply, re-enable —
 * end to end. The real model-driven tool→mutation→reload path is exercised by
 * the server suite and manual runs, not here.
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

test.describe("AI chat", () => {
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

    await page.goto("/goals");

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
    await page.goto("/goals");
    await expect(page.getByRole("button", { name: "Assistant" })).toBeVisible();
  });
});
