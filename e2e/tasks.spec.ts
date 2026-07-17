import { test, expect } from "./fixtures";

test.describe("Tasks", () => {
  test("navigates between Goals and Tasks via the topbar tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Tasks" }).click();

    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByText("My Tasks")).toBeVisible();

    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Goals" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("creates a one-off task and checks it off", async ({ page }) => {
    await page.goto("/tasks");

    await page.getByRole("button", { name: "+ Create your first task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task").fill("Answer the editor");
    await dialog.getByLabel("Description (optional)").fill("Draft is in the shared doc");
    await dialog.getByRole("button", { name: "Add task" }).click();

    const main = page.getByRole("main");
    await expect(main.getByText("To-dos · 1")).toBeVisible();
    await expect(main.getByText("Answer the editor")).toBeVisible();
    await expect(main.getByText("Draft is in the shared doc")).toBeVisible();

    await page.getByRole("button", { name: "Mark task complete" }).click();
    await expect(page.getByText("Done · 1")).toBeVisible();
  });

  test("creates a daily task, completes it for today", async ({ page }) => {
    await page.goto("/tasks");

    await page.getByRole("button", { name: "+ Create your first task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task").fill("Morning pages");
    await dialog.getByRole("checkbox", { name: /Daily/ }).check();
    // A daily task recurs, so the deadline field disappears.
    await expect(dialog.getByText("Due date (optional)")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Add task" }).click();

    await expect(page.getByText("Daily · 0/1 today")).toBeVisible();
    await page.getByRole("button", { name: "Mark task complete" }).click();
    await expect(page.getByText("Daily · 1/1 today")).toBeVisible();
  });

  test("links a task to a goal and sees it on the goal page and the dashboard", async ({ page }) => {
    await page.goto("/tasks");

    await page.getByRole("button", { name: "+ Create your first task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task").fill("Order foam panels");
    await dialog.getByLabel("Linked goal (optional)").selectOption({ label: "Launch my podcast" });
    await dialog.getByRole("checkbox", { name: /Daily/ }).check();
    // The store pushes on a debounce; the test reloads the page below, so wait
    // for the save to land rather than racing it.
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/goals") && r.request().method() === "PUT" && r.ok()
    );
    await dialog.getByRole("button", { name: "Add task" }).click();
    await saved;

    // The row carries a chip linking to the goal.
    await page.getByRole("link", { name: "Launch my podcast" }).click();
    await expect(page).toHaveURL(/\/goal\/goal-podcast$/);

    // The goal page lists the task, without repeating the goal chip.
    await expect(page.getByText("Order foam panels")).toBeVisible();

    // A daily task also surfaces in the dashboard's Today block.
    await page.goto("/");
    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.getByText("Order foam panels")).toBeVisible();
  });

  test("adds a task from the goal page, locked to that goal", async ({ page }) => {
    await page.goto("/goal/goal-podcast");

    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    // The link is a given here, so there's no goal select.
    await expect(dialog.getByLabel("Linked goal (optional)")).toHaveCount(0);
    await dialog.getByLabel("Task").fill("Email the guest");
    await dialog.getByRole("button", { name: "Add task" }).click();

    await expect(page.getByText("Email the guest")).toBeVisible();
  });

  test("edits a task from its menu", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("button", { name: "+ Create your first task" }).click();
    await page.getByRole("dialog").getByLabel("Task").fill("Old title");
    await page.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Old title")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task").fill("New title");
    await dialog.getByRole("button", { name: "Save task" }).click();

    await expect(page.getByText("New title")).toBeVisible();
    await expect(page.getByText("Old title")).toHaveCount(0);
  });

  test("deletes a task from its menu", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("button", { name: "+ Create your first task" }).click();
    await page.getByRole("dialog").getByLabel("Task").fill("Short-lived");
    await page.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Short-lived")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("menuitem", { name: "Delete task" }).click();

    await expect(page.getByText("No tasks yet")).toBeVisible();
  });
});
