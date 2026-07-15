import { test, expect } from "./fixtures";

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

  test("deletes a group via the options menu", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Promotion", level: 3 })).toBeVisible();

    const card = page.locator("div.group\\/card").filter({ hasText: "Promotion" });
    await card.getByRole("button", { name: "Group options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Delete group" }).click();

    await expect(page.getByRole("heading", { name: "Promotion", level: 3 })).toHaveCount(0);
  });

  test("renames a group via the options menu", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Promotion", level: 3 })).toBeVisible();

    const card = page.locator("div.group\\/card").filter({ hasText: "Promotion" });
    await card.getByRole("button", { name: "Group options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Rename" }).click();

    // The dialog is prefilled with the current name.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Group name")).toHaveValue("Promotion");
    await dialog.getByLabel("Group name").fill("Marketing");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: "Marketing", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Promotion", level: 3 })).toHaveCount(0);
  });

  test("edits a step's text without unticking it", async ({ page }) => {
    const row = page.locator("div.group\\/step").filter({ hasText: "Pick a name" });
    // Seeded as done.
    await expect(row.getByRole("button", { name: "Mark step incomplete" })).toBeVisible();

    await row.getByRole("button", { name: "Edit step" }).click({ force: true });
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Step")).toHaveValue("Pick a name");
    await dialog.getByLabel("Step").fill("Pick a name for the show");
    await dialog.getByRole("button", { name: "Save" }).click();

    const edited = page.locator("div.group\\/step").filter({ hasText: "Pick a name for the show" });
    await expect(edited).toBeVisible();
    // Editing the text must not change whether the step is done.
    await expect(edited.getByRole("button", { name: "Mark step incomplete" })).toBeVisible();
  });

  test("renames the goal and changes why it matters", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Goal name")).toHaveValue("Launch my podcast");
    await dialog.getByLabel("Goal name").fill("Launch the show");
    await dialog.getByLabel("Why it matters (optional)").fill("Because I keep not finishing things");
    await dialog.getByRole("button", { name: "Save goal" }).click();

    // Scoped to the page body: the closing dialog still holds the same text in
    // its fields for a beat, so an unscoped match would be ambiguous.
    const body = page.getByRole("main");
    await expect(body.getByRole("heading", { name: "Launch the show", level: 1 })).toBeVisible();
    await expect(body.getByText("Because I keep not finishing things")).toBeVisible();

    // The goal kept its groups and steps — this is not a delete-and-recreate.
    await expect(body.getByRole("heading", { name: "Promotion", level: 3 })).toBeVisible();
    await expect(body.getByText("Pick a name")).toBeVisible();
  });

  test("deletes the whole goal and returns to the dashboard", async ({ page }) => {
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toHaveCount(0);
  });
});

// Regression test for issue #8 — the "Goal complete" banner must use singular
// "group" / "step" when there is exactly one of each, not always plural.
test.describe("Goal detail — completion banner singular/plural", () => {
  test("shows singular 'group' and 'step' when one group with one step is completed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ New Goal" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Goal name").fill("Singular banner test");
    await dialog.getByRole("button", { name: "Create goal" }).click();
    await expect(page).toHaveURL(/\/goal\?id=/);
    await expect(page.getByText("No groups yet")).toBeVisible();

    // Add exactly one group
    await page.getByRole("button", { name: "+ Add first group" }).click();
    let d = page.getByRole("dialog");
    await d.getByLabel("Group name").fill("Only group");
    await d.getByRole("button", { name: "Add group" }).click();
    await expect(page.getByText("Groups · 1")).toBeVisible();

    // Add exactly one step inside that group
    const group = page.locator("div.group\\/card").filter({ hasText: "Only group" });
    await group.getByRole("button", { name: "Add step" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel("Step").fill("Only step");
    await d.getByRole("button", { name: "Add step" }).click();

    // Mark the step complete — this should trigger the "Goal complete" banner
    await page.getByRole("button", { name: "Mark step complete" }).click();
    await expect(page.getByRole("button", { name: "Mark step incomplete" })).toBeVisible();

    // The banner must use singular forms: "1 group" and "1 step"
    await expect(page.getByText("All 1 group and 1 step are done. Nice work.")).toBeVisible();
  });
});
