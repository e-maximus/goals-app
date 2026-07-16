import { test, expect } from "./fixtures";

// These tests build a goal up from scratch on the seeded (but empty) "Learn
// watercolor painting" goal, so each interaction starts from a known state.
test.describe("Goal detail — groups and steps", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-watercolor");
    await expect(page.getByRole("heading", { name: "Learn watercolor painting", level: 1 })).toBeVisible();
  });

  test("adds a group to a goal", async ({ page }) => {
    await expect(page.getByText("No steps yet")).toBeVisible();

    await page.getByRole("button", { name: "+ Add group" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Fundamentals");
    await dialog.getByRole("button", { name: "Add group" }).click();

    await expect(page.getByRole("heading", { name: "Fundamentals", level: 3 })).toBeVisible();
    await expect(page.getByText('Steps', { exact: true })).toBeVisible();
  });

  test("adds a step to a group and tracks progress", async ({ page }) => {
    await page.getByRole("button", { name: "+ Add group" }).click();
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

  test("adds a step with a description and edits it", async ({ page }) => {
    await page.getByRole("button", { name: "+ Add group" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Fundamentals");
    await dialog.getByRole("button", { name: "Add group" }).click();

    const group = page.locator("div.group\\/card").filter({ hasText: "Fundamentals" });
    await group.getByRole("button", { name: "Add step" }).click();

    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Buy brushes");
    await dialog.getByLabel("Description (optional)").fill("Round sizes 6 and 10");

    // The store saves on a debounce; wait for that PUT so it can't land mid-edit
    // and race the dialog we open next.
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/goals") && r.request().method() === "PUT"
    );
    await dialog.getByRole("button", { name: "Add step" }).click();
    await saved;

    // Both the title and its description are shown on the card. Scope to the
    // step row so we don't also match the (animating-out) dialog textarea.
    const row = page.locator("div.group\\/step").filter({ hasText: "Buy brushes" });
    await expect(row.getByText("Buy brushes")).toBeVisible();
    await expect(row.getByText("Round sizes 6 and 10")).toBeVisible();

    // The edit dialog is prefilled with both fields, and edits persist.
    await row.getByRole("button", { name: "Edit step" }).click({ force: true });
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Step")).toHaveValue("Buy brushes");
    await expect(dialog.getByLabel("Description (optional)")).toHaveValue("Round sizes 6 and 10");
    await dialog.getByLabel("Description (optional)").fill("Round sizes 6, 10 and 14");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(row.getByText("Round sizes 6, 10 and 14")).toBeVisible();
  });
});

// The podcast goal ships with steps already, so it's a good fixture for the
// hybrid layout: only the active group (the one holding the next unchecked
// step — "Recording Content") starts expanded.
test.describe("Goal detail — hybrid layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("expands only the active group and highlights the next step", async ({ page }) => {
    // The active group's steps are visible; a completed group's are folded away.
    await expect(page.getByText("Edit ep. 1")).toBeVisible();
    await expect(page.getByText("Pick a name")).toHaveCount(0);

    // The first unchecked step carries the "next" badge.
    const row = page.locator("div.group\\/step").filter({ hasText: "Edit ep. 1" });
    await expect(row.getByText("next")).toBeVisible();
  });

  test("expands and collapses a group from its header", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Preparation" }).click();
    await expect(page.getByText("Pick a name")).toBeVisible();

    await page.getByRole("button", { name: "Collapse Preparation" }).click();
    await expect(page.getByText("Pick a name")).toHaveCount(0);
  });

  test("renders completed steps without a strikethrough", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Preparation" }).click();

    const done = page
      .locator("div.group\\/step")
      .filter({ hasText: "Pick a name" })
      .locator("div")
      .filter({ hasText: "Pick a name" })
      .first();
    await expect(done).toHaveCSS("text-decoration-line", "none");
  });
});

// The timeline (stepper) view is an opt-in alternative for sequential goals.
test.describe("Goal detail — timeline view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("shows the groups as stages and opens the clicked one", async ({ page }) => {
    await page.getByRole("button", { name: "Timeline" }).click();

    // One stage per group, with the completed stage counting its steps.
    await expect(page.getByRole("tab", { name: /Preparation/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Recording Content/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Promotion/ })).toBeVisible();

    // The active group's panel opens by default, next step highlighted.
    await expect(page.getByText("Edit ep. 1")).toBeVisible();

    // Clicking another stage swaps the panel to its steps.
    await page.getByRole("tab", { name: /Promotion/ }).click();
    await expect(page.getByText("Create social accounts")).toBeVisible();
    await expect(page.getByText("Edit ep. 1")).toHaveCount(0);
  });

  test("completing a step in the panel updates its stage counter", async ({ page }) => {
    await page.getByRole("button", { name: "Timeline" }).click();

    const stage = page.getByRole("tab", { name: /Promotion/ });
    await expect(stage.getByText("0 of 3")).toBeVisible();

    await stage.click();
    const row = page.locator("div.group\\/step").filter({ hasText: "Create social accounts" });
    await row.getByRole("button", { name: "Mark step complete" }).click();

    await expect(stage.getByText("1 of 3")).toBeVisible();
  });

  test("the view choice sticks across a reload", async ({ page }) => {
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByRole("tab", { name: /Preparation/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Preparation/ })).toBeVisible();
  });
});

// The podcast goal ships with steps already, so it's a good fixture for toggling
// and deletion. Steps in completed groups sit behind a collapsed header now, so
// these tests expand "Preparation" before touching its steps.
test.describe("Goal detail — toggling and deleting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("toggles a completed step back to incomplete", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Preparation" }).click();
    const step = page.getByText("Pick a name");
    await expect(step).toBeVisible();

    // Seeded as done. The row's toggle button says "incomplete".
    const row = page.locator("div.group\\/step").filter({ hasText: "Pick a name" });
    await row.getByRole("button", { name: "Mark step incomplete" }).click();
    await expect(row.getByRole("button", { name: "Mark step complete" })).toBeVisible();
  });

  test("deletes a step", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Preparation" }).click();
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
    await page.getByRole("button", { name: "Expand Preparation" }).click();
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
    await page.getByRole("button", { name: "Goal options" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

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
    // ("Pick a name" sits in the collapsed Preparation group, so assert on the
    // active group's step instead.)
    await expect(body.getByRole("heading", { name: "Promotion", level: 3 })).toBeVisible();
    await expect(body.getByText("Edit ep. 1")).toBeVisible();
  });

  test("deletes the whole goal and returns to the dashboard", async ({ page }) => {
    await page.getByRole("button", { name: "Goal options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toHaveCount(0);
  });
});

// Groups and steps can be reordered with the Move up / Move down items in
// their options menus.
test.describe("Goal detail — reordering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("moves a group up via the options menu", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 3 })).toHaveText([
      "Preparation",
      "Recording Content",
      "Promotion",
    ]);

    const card = page.locator("div.group\\/card").filter({ hasText: "Promotion" });
    await card.getByRole("button", { name: "Group options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Move up" }).click();

    await expect(page.getByRole("heading", { level: 3 })).toHaveText([
      "Preparation",
      "Promotion",
      "Recording Content",
    ]);
  });

  test("moves a step down via its options menu", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Preparation" }).click();
    const card = page.locator("div.group\\/card").filter({ hasText: "Preparation" });
    await expect(card.locator("div.group\\/step").first()).toContainText("Pick a name");

    const row = card.locator("div.group\\/step").filter({ hasText: "Pick a name" });
    await row.getByRole("button", { name: "Step options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Move down" }).click();

    await expect(card.locator("div.group\\/step").first()).toContainText("Choose a platform");
    await expect(card.locator("div.group\\/step").nth(1)).toContainText("Pick a name");
  });
});

// A goal can hold steps directly, without any group — the hybrid model. The
// empty watercolor goal is the fixture: build ungrouped steps on it via the UI.
test.describe("Goal detail — ungrouped steps", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-watercolor");
    await expect(
      page.getByRole("heading", { name: "Learn watercolor painting", level: 1 })
    ).toBeVisible();
  });

  test("adds a step directly to the goal from the empty state", async ({ page }) => {
    await expect(page.getByText("No steps yet")).toBeVisible();

    await page.getByRole("button", { name: "+ Add step" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Buy a starter set");
    await dialog.getByRole("button", { name: "Add step" }).click();

    // The step lands in the goal's own card, with no group created.
    const row = page.locator("div.group\\/step").filter({ hasText: "Buy a starter set" });
    await expect(row).toBeVisible();
    await expect(row.getByText("next")).toBeVisible();

    // It toggles like any other step.
    await row.getByRole("button", { name: "Mark step complete" }).click();
    await expect(row.getByRole("button", { name: "Mark step incomplete" })).toBeVisible();
  });

  test("ungrouped steps and groups coexist, ungrouped first", async ({ page }) => {
    // One ungrouped step…
    await page.getByRole("button", { name: "+ Add step" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Loose step");
    await dialog.getByRole("button", { name: "Add step" }).click();
    await expect(page.getByText("Loose step")).toBeVisible();

    // …then a group with its own step.
    await page.getByRole("button", { name: "Add group" }).last().click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Fundamentals");
    await dialog.getByRole("button", { name: "Add group" }).click();

    // The new group starts collapsed — the next step is the ungrouped one.
    await page.getByRole("button", { name: "Expand Fundamentals" }).click();
    const group = page.locator("div.group\\/card").filter({ hasText: "Fundamentals" });
    await group.getByRole("button", { name: "Add step" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Grouped step");
    await dialog.getByRole("button", { name: "Add step" }).click();

    // Both are on the page; the ungrouped one is the next actionable step.
    await expect(page.getByText("Grouped step")).toBeVisible();
    const looseRow = page.locator("div.group\\/step").filter({ hasText: "Loose step" });
    await expect(looseRow.getByText("next")).toBeVisible();
  });

  test("ungrouped steps appear as their own stages on the timeline", async ({ page }) => {
    // One ungrouped step and one group with a step, built through the UI.
    await page.getByRole("button", { name: "+ Add step" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Loose step");
    await dialog.getByRole("button", { name: "Add step" }).click();
    await expect(page.getByText("Loose step")).toBeVisible();

    await page.getByRole("button", { name: "Add group" }).last().click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Fundamentals");
    await dialog.getByRole("button", { name: "Add group" }).click();
    await page.getByRole("button", { name: "Expand Fundamentals" }).click();
    const group = page.locator("div.group\\/card").filter({ hasText: "Fundamentals" });
    await group.getByRole("button", { name: "Add step" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Step").fill("Grouped step");
    await dialog.getByRole("button", { name: "Add step" }).click();
    await expect(page.getByText("Grouped step")).toBeVisible();

    await page.getByRole("button", { name: "Timeline" }).click();

    // The ungrouped step is its own stage; the group stage carries a counter.
    await expect(page.getByRole("tab", { name: /Loose step/ })).toBeVisible();
    const groupTab = page.getByRole("tab", { name: /Fundamentals/ });
    await expect(groupTab.getByText("0 of 1")).toBeVisible();

    // The ungrouped stage is the next step, so its panel opens by default.
    const looseRow = page.locator("div.group\\/step").filter({ hasText: "Loose step" });
    await expect(looseRow.getByText("next")).toBeVisible();

    // Clicking the group stage swaps the panel to its steps.
    await groupTab.click();
    await expect(page.locator("div.group\\/step").filter({ hasText: "Grouped step" })).toBeVisible();
  });
});

// Deadlines: set on the goal via the edit dialog, shown as a badge here and on
// the dashboard card.
test.describe("Goal detail — deadlines", () => {
  test("sets a goal due date and sees the badge on detail and dashboard", async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Goal options" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Due date" }).click();
    // Pick any selectable day from the calendar popup.
    await page.getByRole("grid").getByRole("button", { name: /15/ }).first().click();
    await dialog.getByRole("button", { name: "Save goal" }).click();

    const banner = page.getByRole("main");
    await expect(banner.getByText(/due /)).toBeVisible();

    // The dashboard card carries the same badge.
    await page.getByRole("link", { name: "My Goals" }).click();
    const card = page.locator("div.group\\/goal").filter({ hasText: "Launch my podcast" });
    await expect(card.getByText(/due /)).toBeVisible();
  });
});

// Regression test for issue #8 — the "Goal complete" banner must read
// naturally when there is exactly one step, not always plural.
test.describe("Goal detail — completion banner singular/plural", () => {
  test("uses the singular copy when a single step is completed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ New Goal" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Goal name").fill("Singular banner test");
    await dialog.getByRole("button", { name: "Create goal" }).click();
    await expect(page).toHaveURL(/\/goal\//);
    await expect(page.getByText("No steps yet")).toBeVisible();

    // Add exactly one group
    await page.getByRole("button", { name: "+ Add group" }).click();
    let d = page.getByRole("dialog");
    await d.getByLabel("Group name").fill("Only group");
    await d.getByRole("button", { name: "Add group" }).click();
    await expect(page.getByText('Steps', { exact: true })).toBeVisible();

    // Add exactly one step inside that group
    const group = page.locator("div.group\\/card").filter({ hasText: "Only group" });
    await group.getByRole("button", { name: "Add step" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel("Step").fill("Only step");
    await d.getByRole("button", { name: "Add step" }).click();

    // Mark the step complete — this should trigger the "Goal complete" banner
    await page.getByRole("button", { name: "Mark step complete" }).click();
    await expect(page.getByRole("button", { name: "Mark step incomplete" })).toBeVisible();

    // The banner must use the singular copy for a single step.
    await expect(page.getByText("The only step is done. Nice work.")).toBeVisible();
  });
});
