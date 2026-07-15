import { test, expect } from "./fixtures";

// The dashboard shows the seeded example goals on a fresh visit (empty
// localStorage), split into "In progress" and "Completed" sections.
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
});
