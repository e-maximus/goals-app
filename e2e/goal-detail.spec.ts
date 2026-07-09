import { test, expect } from "@playwright/test";

// These tests build a goal up from scratch on the seeded (but empty) "Learn
// watercolor painting" goal, so each interaction starts from a known state.
test.describe("Goal detail — groups and steps", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal?id=goal-watercolor");
    await expect(page.getByRole("heading", { name: "Learn watercolor painting", level: 1 })).toBeVisible();
  });

  test("adds a group to a goal", async ({ page }) => {
    await expect(page.getByText("No groups yet")).toBeVisible();

    await page.getByRole("button", { name: "+ Add first group" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Fundamentals");
    await dialog.getByRole("button", { name: "Add group" }).click();

    await expect(page.getByRole("heading", { name: "Fundamentals", level: 3 })).toBeVisible();
    await expect(page.getByText("Groups · 1")).toBeVisible();
  });

  test("adds a step to a group and tracks progress", async ({ page }) => {
    await page.getByRole("button", { name: "+ Add first group" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Fundamentals");
    await dialog.getByRole("button", { name: "Add group" }).click();

    const group = page.locator("div.group\\/card").filter({ hasText: "Fundamentals" });
    await group.getByRole("button", { name: "Add step" }).click();

    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Buy brushes");
    await dialog.getByRole("button", { name: "Add step" }).click();

    await expect(page.getByText("Buy brushes")).toBeVisible();

    // The group starts at 0% until a step is marked done.
    await page.getByRole("button", { name: "Mark step complete" }).click();
    await expect(page.getByRole("button", { name: "Mark step incomplete" })).toBeVisible();
  });
});

// The podcast goal ships with steps already, so it's a good fixture for toggling
// and deletion.
test.describe("Goal detail — toggling and deleting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal?id=goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("toggles a completed step back to incomplete", async ({ page }) => {
    const step = page.getByText("Pick a name");
    await expect(step).toBeVisible();

    // Seeded as done → line-through. The row's toggle button says "incomplete".
    const row = page.locator("div.group\\/step").filter({ hasText: "Pick a name" });
    await row.getByRole("button", { name: "Mark step incomplete" }).click();
    await expect(row.getByRole("button", { name: "Mark step complete" })).toBeVisible();
  });

  test("deletes a step", async ({ page }) => {
    const row = page.locator("div.group\\/step").filter({ hasText: "Buy a microphone" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Delete step" }).click({ force: true });
    await expect(page.getByText("Buy a microphone")).toHaveCount(0);
  });

  test("deletes a group", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Promotion", level: 3 })).toBeVisible();

    const card = page.locator("div.group\\/card").filter({ hasText: "Promotion" });
    await card.getByRole("button", { name: "Delete group" }).click({ force: true });

    await expect(page.getByRole("heading", { name: "Promotion", level: 3 })).toHaveCount(0);
  });

  test("deletes the whole goal and returns to the dashboard", async ({ page }) => {
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toHaveCount(0);
  });
});
