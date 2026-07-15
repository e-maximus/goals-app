import { test, expect } from "./fixtures";

// The dashboard shows the seeded example goals (the fixture resets the store to
// them before each test), split into "In progress" and "Completed" sections.
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the seeded goals", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Run a half marathon/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Learn watercolor painting/ })).toBeVisible();
  });

  test("groups goals into in-progress and completed sections", async ({ page }) => {
    // Three of the four seeded goals are unfinished; the website redesign is done.
    await expect(page.getByText("In progress · 3")).toBeVisible();
    await expect(page.getByText("Completed · 1")).toBeVisible();

    const completed = page.getByRole("link", { name: /Redesign personal website/ });
    await expect(completed).toBeVisible();
    await expect(completed.getByText("Done")).toBeVisible();
  });

  test("navigates to a goal's detail page", async ({ page }) => {
    await page.getByRole("link", { name: /Launch my podcast/ }).click();

    await expect(page).toHaveURL(/\/goal\?id=goal-podcast/);
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("just loading the page writes nothing back to the server", async ({ page }) => {
    // Loading fills the store from the server; that must not be echoed back as a
    // save. Watch for the write (PUT /api/goals) — none should fire, and the
    // "Saving…" indicator should never appear when we've made no edits.
    const writes: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PUT" && req.url().includes("/api/goals")) {
        writes.push(req.url());
      }
    });

    await page.goto("/");
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();
    // Past the 500ms push debounce, so a spurious save would have fired by now.
    await expect(page.getByText("Saving…")).toHaveCount(0);
    await page.waitForTimeout(700);

    expect(writes, "loading the page should not write to the server").toEqual([]);
  });
});
