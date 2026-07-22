import { test, expect } from "./fixtures";

// The Home page is the app's landing at "/": a Focus Hero (greeting, quick
// actions, the next step to pick up, and an at-a-glance pulse) plus a "Get more
// out of it" grid (About, how it works, an MCP teaser, a tips card). The fixture
// resets the store to the seeded goals for the anonymous e2e user ("Shiny Fox"),
// so the live sections have content.
test.describe("Home", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("lifts the header with a shadow once the page is scrolled", async ({ page }) => {
    const header = page.locator("header").first();
    // Wait for the loaded overview, so the page is tall enough to scroll.
    await expect(page.getByRole("heading", { level: 1, name: /Keep going/ })).toBeVisible();
    // Flush at the top: solid, no lifted treatment.
    await expect(header).not.toHaveAttribute("data-scrolled", "true");

    await page.evaluate(() => window.scrollTo(0, 200));
    await expect(header).toHaveAttribute("data-scrolled", "true");

    // Back at the very top, it settles flat again.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).not.toHaveAttribute("data-scrolled", "true");
  });

  test("greets the account and marks the Home nav link active", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /Keep going/ })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("shows a pulse of at-a-glance counts", async ({ page }) => {
    await expect(page.getByText("steps done")).toBeVisible();
    await expect(page.getByText(/active goals?/)).toBeVisible();
  });

  test("surfaces the next step and completes it in place", async ({ page }) => {
    await expect(page.getByText("Pick up where you left off")).toBeVisible();
    // The seeded podcast goal's first unchecked step is the next actionable one.
    await expect(page.getByText(/Next:.*Edit ep\. 1/)).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    // Checking it off advances the highlighted step without leaving Home.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Next:.*Record ep\. 2/)).toBeVisible();
  });

  test("opens the new-goal dialog from the hero", async ({ page }) => {
    await page.getByRole("button", { name: "New goal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("pages through the tips card", async ({ page }) => {
    await expect(page.getByText("Tip of the day")).toBeVisible();
    await expect(page.getByText("If you can’t start, it’s still too big")).toBeVisible();

    await page.getByRole("button", { name: "Go to tip 2" }).click();
    await expect(page.getByRole("button", { name: "Go to tip 2" })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  test("teases MCP and links to Settings for the setup", async ({ page }) => {
    await expect(page.getByText("Bring your assistant")).toBeVisible();
    await page.getByRole("link", { name: /Set it up in Settings/ }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("navigates to the goals dashboard from the nav", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Goals" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole("link", { name: /Launch my podcast/ })).toBeVisible();
  });

  test("shows a short About section linking to the full page", async ({ page }) => {
    await expect(page.getByText("About Keep Going")).toBeVisible();
    await page.getByRole("link", { name: /Read the full story/ }).click();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("keeps About in the persistent nav and marks it active there", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "About" })
    ).toHaveAttribute("aria-current", "page");
  });
});
