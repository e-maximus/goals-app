import { test, expect } from "./fixtures";

/**
 * The search palette, over the canonical seeded store.
 *
 * The e2e environment has no embedding provider, so these exercise the keyword
 * and trigram arms only — which is the point: search has to work without one,
 * and this is the suite that proves it on every CI run.
 */

const open = async (page: import("@playwright/test").Page) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "Search" }).click();
  return page.getByRole("dialog", { name: "Search" });
};

test.describe("Search", () => {
  test("finds a goal and opens it", async ({ page }) => {
    const dialog = await open(page);

    await dialog.getByRole("combobox", { name: "Search" }).fill("podcast");
    // The goal itself outranks its own steps, which also mention it — the option
    // list is ordered, so the top hit is the assertion worth making.
    const hit = dialog.getByRole("option").first();
    await expect(hit).toContainText("Launch my podcast");
    await expect(hit).toContainText("Goal");

    await hit.click();
    await expect(page).toHaveURL(/\/goal\/goal-podcast/);
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("finds a step by its own words and lands on its goal", async ({ page }) => {
    const dialog = await open(page);

    await dialog.getByRole("combobox", { name: "Search" }).fill("Pick a name");
    const hit = dialog.getByRole("option").first();
    await expect(hit).toContainText("Pick a name");
    // A step names the goal it belongs to, so a bare step title isn't orphaned.
    await expect(hit).toContainText("Launch my podcast");

    await hit.click();
    await expect(page).toHaveURL(/\/goal\/goal-podcast/);
  });

  test("survives a typo", async ({ page }) => {
    const dialog = await open(page);

    // No exact word matches this — only the trigram arm can answer.
    await dialog.getByRole("combobox", { name: "Search" }).fill("podcst");
    await expect(dialog.getByRole("option").first()).toContainText("Launch my podcast");
  });

  test("moves through results with the keyboard and opens with Enter", async ({ page }) => {
    const dialog = await open(page);
    const input = dialog.getByRole("combobox", { name: "Search" });

    await input.fill("podcast");
    await expect(dialog.getByRole("option").first()).toBeVisible();

    await input.press("ArrowDown");
    await expect(dialog.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowUp");
    await expect(dialog.getByRole("option").first()).toHaveAttribute("aria-selected", "true");

    await input.press("Enter");
    await expect(page).toHaveURL(/\/goal\//);
  });

  test("says so when nothing matches", async ({ page }) => {
    const dialog = await open(page);

    await dialog.getByRole("combobox", { name: "Search" }).fill("xylophone repair");
    await expect(dialog.getByTestId("search-empty")).toContainText("Nothing matches");
  });

  test("opens with the keyboard shortcut", async ({ page }) => {
    // Open and close once first. The shortcut is bound in an effect, so pressing
    // it before hydration lands on nothing — and the button rendering on the
    // server means its mere presence does not prove the page is listening yet.
    const dialog = await open(page);
    await expect(dialog.getByRole("combobox", { name: "Search" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");

    await expect(
      page.getByRole("dialog", { name: "Search" }).getByRole("combobox", { name: "Search" })
    ).toBeFocused();
  });

  test("indexes a goal created moments earlier", async ({ page }) => {
    // Longer than the suite default: this one waits on a real round trip —
    // create, debounced save, reindex, search — not just a render.
    test.setTimeout(45_000);
    // Reindexing runs after the write, so this is the end-to-end proof that the
    // whole pipeline — save, reindex, search — closes in the time it takes a
    // user to type their next thought.
    await page.goto("/goals");
    await page.getByRole("main").getByRole("button", { name: "+ New Goal" }).click();
    const create = page.getByRole("dialog");
    await create.getByLabel("Goal name").fill("Restore the pinball machine");
    await create.getByRole("button", { name: "Create goal" }).click();
    await expect(page).toHaveURL(/\/goal\//);

    // The palette asks the server once per query and does not poll, so retype
    // until the answer changes: the index is filled after the response goes out,
    // and this test is about that closing — not about how fast it closes.
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(async () => {
      // Not `getByRole("dialog")` unqualified: the New goal dialog is still
      // mounted on this page and would win the locator.
      if ((await dialog.count()) === 0) {
        await page.getByRole("button", { name: "Search" }).click();
      }
      const input = dialog.getByRole("combobox", { name: "Search" });
      await input.fill("");
      await input.fill("pinball");
      await expect(dialog.getByRole("option").first()).toContainText(
        "Restore the pinball machine",
        { timeout: 3_000 }
      );
    }).toPass({ timeout: 30_000 });
  });
});
