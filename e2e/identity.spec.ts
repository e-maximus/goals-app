import { test, expect } from "./fixtures";

/**
 * The account's generated identity ("Shiny Fox" for the e2e user) is resolved
 * on the server and handed to every view that shows it, rather than each one
 * fetching it. These tests pin the two properties that buys: it is present in
 * the very first HTML the browser gets, and the topbar, the home greeting and
 * the Settings card can't disagree about it.
 */
test.describe("Identity", () => {
  test("is server-rendered into the first response, not fetched after paint", async ({ page }) => {
    const response = await page.goto("/");
    const html = await response!.text();
    expect(html).toContain("Shiny Fox");
  });

  test("is the same in the topbar, the greeting and Settings", async ({ page }) => {
    await page.goto("/");
    const chip = page.getByRole("link", { name: "Account" });
    await expect(chip).toContainText("Shiny Fox");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Shiny Fox");

    await page.goto("/settings");
    await expect(page.getByRole("main").getByText("Shiny Fox")).toBeVisible();
    await expect(page.getByText("Temporary identity")).toBeVisible();
  });
});

/**
 * Every route names itself. The goal page titles itself after the goal, which
 * takes a server render of the route (its metadata is generated from the same
 * store load the layout does).
 */
test.describe("Page titles", () => {
  test("each section carries its own title", async ({ page }) => {
    await page.goto("/goals");
    await expect(page).toHaveTitle("My Goals — Keep Going");

    await page.goto("/tasks");
    await expect(page).toHaveTitle("Tasks — Keep Going");

    await page.goto("/settings");
    await expect(page).toHaveTitle("Settings — Keep Going");
  });

  test("a goal page is titled after the goal", async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page).toHaveTitle(/— Keep Going$/);
    const title = await page.title();
    expect(title).not.toContain("Goal — Keep Going");
    // The same name the heading shows.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      title.replace(" — Keep Going", "")
    );
  });
});
