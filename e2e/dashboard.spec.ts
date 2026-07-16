import { test, expect } from "./fixtures";

// The dashboard shows the seeded example goals (the fixture resets the store to
// them before each test), split into "In progress", "Paused" and "Completed"
// sections.
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the seeded goals", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Run a half marathon/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Learn watercolor painting/ })).toBeVisible();
  });

  test("groups goals into in-progress, paused and completed sections", async ({ page }) => {
    // Podcast, marathon and watercolor are underway; the reading goal is
    // paused; the website redesign is done.
    await expect(page.getByText("In progress · 3")).toBeVisible();
    await expect(page.getByText("Paused · 1")).toBeVisible();
    await expect(page.getByText("Completed · 1")).toBeVisible();

    // Completed goals collapse to a single line with a small reward, not a "Done" pill.
    await expect(page.getByRole("link", { name: /Redesign personal website/ })).toBeVisible();
    await expect(page.getByText(/8 steps · finished in/)).toBeVisible();
  });

  test("shows step counts instead of a bare percentage", async ({ page }) => {
    await expect(page.getByText("5 of 10 steps")).toBeVisible(); // podcast
  });

  test("completes the next step straight from the goal card", async ({ page }) => {
    const card = page.locator("div.group\\/goal").filter({ hasText: "Launch my podcast" });

    // The next actionable step is the first unchecked one of the active group.
    await expect(card.getByText(/Next:.*Edit ep\. 1/)).toBeVisible();

    await card.getByRole("button", { name: "Done" }).click();

    // No navigation — the line just advances to the following step.
    await expect(page).toHaveURL(/\/$/);
    await expect(card.getByText(/Next:.*Record ep\. 2/)).toBeVisible();
    await expect(card.getByText("6 of 10 steps")).toBeVisible();
  });

  test("flags a stale goal and lets the user pause it", async ({ page }) => {
    const card = page.locator("div.group\\/goal").filter({ hasText: "Run a half marathon" });

    await expect(card.getByText("20 days without activity")).toBeVisible();
    await card.getByRole("button", { name: "Pause" }).click();

    // The goal moves out of the in-progress list into the paused section.
    await expect(page.getByText("In progress · 2")).toBeVisible();
    await expect(page.getByText("Paused · 2")).toBeVisible();
  });

  test("resumes a paused goal", async ({ page }) => {
    await expect(page.getByText(/4 of 12 · paused/)).toBeVisible();

    await page.getByRole("button", { name: "Resume" }).click();

    await expect(page.getByText("In progress · 4")).toBeVisible();
    await expect(page.getByText("Paused · 1")).toHaveCount(0);
  });

  test("nudges an empty goal toward its first steps", async ({ page }) => {
    const card = page.locator("div.group\\/goal").filter({ hasText: "Learn watercolor painting" });

    await expect(card.getByText("No steps yet — break this goal down to get moving")).toBeVisible();
    await card.getByRole("button", { name: "Break it down" }).click();

    await expect(page).toHaveURL(/\/goal\/goal-watercolor/);
  });

  test("navigates to a goal's detail page", async ({ page }) => {
    await page.getByRole("link", { name: /Launch my podcast/ }).click();

    await expect(page).toHaveURL(/\/goal\/goal-podcast/);
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
