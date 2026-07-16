import { test, expect } from "./fixtures";

test.describe("Creating a goal", () => {
  test("creates a goal from the dialog and opens its detail page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Goal" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("New goal")).toBeVisible();

    await dialog.getByLabel("Goal name").fill("Learn to juggle");
    await dialog.getByLabel("Why it matters (optional)").fill("For fun at parties");
    await dialog.getByRole("button", { name: "Create goal" }).click();

    // A new goal has no steps, so it lands on the detail page in its empty state.
    await expect(page).toHaveURL(/\/goal\//);
    await expect(page.getByRole("heading", { name: "Learn to juggle", level: 1 })).toBeVisible();
    await expect(page.getByText("For fun at parties")).toBeVisible();
    await expect(page.getByText("No steps yet")).toBeVisible();
  });

  test("the detail page has no New Goal button — it lives on the dashboard", async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Goal" })).toHaveCount(0);
  });

  test("disables the submit button until a title is entered", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ New Goal" }).click();

    const create = page.getByRole("button", { name: "Create goal" });
    await expect(create).toBeDisabled();

    await page.getByLabel("Goal name").fill("Something");
    await expect(create).toBeEnabled();
  });

  test("the new goal appears back on the dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ New Goal" }).click();
    await page.getByLabel("Goal name").fill("Learn to juggle");
    await page.getByRole("button", { name: "Create goal" }).click();

    await expect(page.getByRole("heading", { name: "Learn to juggle" })).toBeVisible();

    await page.getByRole("link", { name: "My Goals" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Learn to juggle/ })).toBeVisible();
  });
});
