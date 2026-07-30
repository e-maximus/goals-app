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
});
