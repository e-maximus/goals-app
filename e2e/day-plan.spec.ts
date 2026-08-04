import { test, expect, type Page } from "./fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wait for the store's debounced whole-store save to land. */
function saved(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"] && r.ok()
  );
}

/** Capture a task from /tasks. The seeded store has no tasks, so the first
 *  one is created from the empty state's button. */
async function addTask(page: Page, title: string, options: { daily?: boolean } = {}) {
  await page.goto("/tasks");
  // The empty state offers the first one; every task after that comes from the
  // list's own button. Match either, so the helper doesn't race the hydration.
  await page.getByRole("button", { name: /Create your first task|New Task/ }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task").fill(title);
  if (options.daily) await dialog.getByRole("checkbox", { name: /Daily/ }).check();
  const write = saved(page);
  await dialog.getByRole("button", { name: "Add task" }).click();
  await write;
}

/** Pick `titles` in the picker's Everything tab and commit the day. */
async function planDay(page: Page, titles: string[]) {
  await page.goto("/today");
  await page.getByRole("tab", { name: /^Everything/ }).click();
  for (const title of titles) {
    await page.getByRole("button", { name: `Add ${title} to today` }).click();
  }
  const write = saved(page);
  await page.getByRole("button", { name: "Start the day" }).click();
  await write;
}

test.describe("The day plan", () => {
  test("opens the picker on a day that hasn't been planned", async ({ page }) => {
    await page.goto("/today");

    await expect(page.getByRole("heading", { name: /^Plan / })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the day" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for today" })).toBeVisible();
    await expect(page.getByText("0 chosen")).toBeVisible();
  });

  test("commits exactly what was picked", async ({ page }) => {
    await addTask(page, "Renew the domain");
    await addTask(page, "Send the invoice");
    await addTask(page, "Read the docs");

    await page.goto("/today");
    await page.getByRole("tab", { name: /^Everything/ }).click();
    await page.getByRole("button", { name: "Add Renew the domain to today" }).click();
    await page.getByRole("button", { name: "Add Send the invoice to today" }).click();
    await expect(page.getByText("2 chosen")).toBeVisible();

    const write = saved(page);
    await page.getByRole("button", { name: "Start the day" }).click();
    await write;

    // The ritual collapses to the list — exactly the two chosen, and not the
    // third, which is still a perfectly good task on /tasks.
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(main.getByText("Renew the domain")).toBeVisible();
    await expect(main.getByText("Send the invoice")).toBeVisible();
    await expect(main.getByText("Read the docs")).toHaveCount(0);
    await expect(main.getByText("0 of 2 done.")).toBeVisible();
  });

  test("skipping falls back to today's list and doesn't ask again", async ({ page }) => {
    await addTask(page, "Morning run", { daily: true });

    await page.goto("/today");
    const write = saved(page);
    await page.getByRole("button", { name: "Skip for today" }).click();
    await write;

    await expect(page.getByText("No plan today.")).toBeVisible();
    // The fallback is what the app showed before plans existed: the dailies.
    await expect(page.getByRole("main").getByText("Morning run")).toBeVisible();

    await page.reload();
    await expect(page.getByText("No plan today.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the day" })).toHaveCount(0);
  });

  test("a planned task stays in the day once it's checked off", async ({ page }) => {
    await addTask(page, "Call the landlord");
    await planDay(page, ["Call the landlord"]);

    const main = page.getByRole("main");
    await expect(main.getByText("0 of 1 done.")).toBeVisible();

    await main.getByRole("button", { name: "Mark task complete" }).click();
    await expect(main.getByText("Call the landlord")).toBeVisible();
    await expect(main.getByText("1 of 1 done.")).toBeVisible();
  });

  test("re-opening the picker starts from what was committed", async ({ page }) => {
    await addTask(page, "Draft the write-up");
    await planDay(page, ["Draft the write-up"]);

    await page.getByRole("button", { name: "Adjust today" }).click();
    await expect(page.getByText("1 chosen")).toBeVisible();

    const write = saved(page);
    await page.getByRole("button", { name: "Remove Draft the write-up from today" }).click();
    await page.getByRole("button", { name: "Start the day" }).click();
    await write;

    // Taken back out, the plan is empty — which is a decision, not an oversight.
    await expect(page.getByText("No plan today.")).toBeVisible();
  });

  test("an unfinished plan does not roll over into the next day", async ({ page }) => {
    await addTask(page, "Fix the boiler");
    await planDay(page, ["Fix the boiler"]);
    await expect(page.getByRole("main").getByText("0 of 1 done.")).toBeVisible();

    // Tomorrow, from the browser's point of view. Only `Date.now` moves — the
    // stored plan is untouched, which is exactly the situation being tested.
    await page.clock.setFixedTime(new Date(Date.now() + DAY_MS));
    await page.reload();

    // A new day is unplanned, so the ritual asks again — and asks with an empty
    // plan. Yesterday did not reschedule itself.
    await expect(page.getByRole("heading", { name: /^Plan / })).toBeVisible();
    await expect(page.getByText("0 chosen")).toBeVisible();

    // It is offered, once, as something to pick up again — never automatically.
    await expect(page.getByText("Left from yesterday")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Fix the boiler to today" })).toBeVisible();
  });

  test("reaches the day from the main nav", async ({ page }) => {
    await page.goto("/goals");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" })
    ).toHaveAttribute("aria-current", "page");
  });
});
