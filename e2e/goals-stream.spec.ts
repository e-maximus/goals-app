import { test, expect, type Page } from "./fixtures";

/** Put a tab into the background (or bring it back) as the browser would. */
async function setVisibility(page: Page, state: "visible" | "hidden"): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/**
 * The goals stream: an edit made somewhere else reaches an open tab without a
 * reload. Two pages in one browser context share the session cookie, so they are
 * two tabs of the same user — the same situation as the AI chat or an agent over
 * MCP writing behind the tab's back.
 */
test.describe("Live goal updates", () => {
  test("an edit in another tab appears without a reload", async ({ page, context }) => {
    await page.goto("/goals");
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();

    const other = await context.newPage();
    await other.goto("/goals");
    await other.getByRole("main").getByRole("button", { name: "+ New Goal" }).click();
    await other.getByLabel("Goal name").fill("Learn to juggle");
    await other.getByRole("button", { name: "Create goal" }).click();
    await expect(other.getByRole("heading", { name: "Learn to juggle", level: 1 })).toBeVisible();

    // The first tab was never navigated or reloaded — this can only arrive over
    // the stream (the write is debounced, then announced, then reconciled).
    await expect(page.getByRole("link", { name: /Learn to juggle/ })).toBeVisible({
      timeout: 8_000,
    });

    await other.close();
  });

  test("catches up on what it missed while it was in the background", async ({ page, context }) => {
    await page.goto("/goals");
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();

    // A headless browser reports every page as visible however the tabs are
    // ordered, so the backgrounding is driven the way the browser would: force
    // `visibilityState` and fire the event our hook listens for.
    await setVisibility(page, "hidden");

    const other = await context.newPage();
    await other.goto("/goals");

    await other.getByRole("main").getByRole("button", { name: "+ New Goal" }).click();
    await other.getByLabel("Goal name").fill("Learn to juggle");
    await other.getByRole("button", { name: "Create goal" }).click();
    await expect(other.getByRole("heading", { name: "Learn to juggle", level: 1 })).toBeVisible();

    // Coming back reopens the stream, and reconnecting resyncs — the event
    // itself was delivered to nobody.
    await setVisibility(page, "visible");
    await expect(page.getByRole("link", { name: /Learn to juggle/ })).toBeVisible({
      timeout: 8_000,
    });

    await other.close();
  });

  test("coming back to an unchanged store doesn't refetch it", async ({ page }) => {
    // The counterpart to the test above, and the reason the stream announces its
    // stamp on connect. Every return to the tab reopens the stream; when nothing
    // happened meanwhile, that must cost nothing. It used to cost a full store
    // reload, which re-rendered the page under whoever had just come back to it.
    const streamOpened = page.waitForRequest("**/api/goals/stream");
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
    await streamOpened;

    // Server Actions are how this page talks to the server at all, so any of
    // them firing here — loadState above all — is the refetch we're ruling out.
    const actions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) {
        actions.push(request.url());
      }
    });

    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");

    // Asserting an absence, so there is nothing to wait *for*: sit out the
    // store's reconcile debounce and its minimum reload interval (300ms + 2s),
    // which is the window any reload would have landed in.
    await page.waitForTimeout(3_500);
    expect(actions).toEqual([]);

    // …and the page is still live, not merely quiet: the goal is on screen and
    // the stream is open again.
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });
});
