import { test, expect } from "./fixtures";

// The Home page is the app's landing at "/": a personal overview (greeting,
// pulse, the next step to continue) plus evergreen guidance (a tips slider, an
// MCP teaser, a short primer). The fixture resets the store to the seeded goals
// for the anonymous e2e user ("Shiny Fox"), so the live sections have content.
test.describe("Home", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("greets the account and marks the Home nav link active", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /Keep going/ })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("shows a pulse of at-a-glance counts", async ({ page }) => {
    await expect(page.getByText("Your pulse")).toBeVisible();
    await expect(page.getByText("steps done")).toBeVisible();
    await expect(page.getByText("active goals")).toBeVisible();
  });

  test("surfaces the next step and completes it in place", async ({ page }) => {
    const section = page.locator("section").filter({ hasText: "Continue" });
    // The seeded podcast goal's first unchecked step is the next actionable one.
    await expect(section.getByText(/Next:.*Edit ep\. 1/)).toBeVisible();

    await section.getByRole("button", { name: "Done" }).click();
    // Checking it off advances the highlighted step without leaving Home.
    await expect(page).toHaveURL(/\/$/);
    await expect(section.getByText(/Next:.*Record ep\. 2/)).toBeVisible();
  });

  test("pages through the tips slider", async ({ page }) => {
    await expect(page.getByText("Not sure how to reach your first goal?")).toBeVisible();
    await expect(page.getByText("Break it down until the next step is tiny")).toBeVisible();

    await page.getByRole("button", { name: "Next tip" }).click();
    await expect(page.getByRole("button", { name: "Go to tip 2" })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  test("teases MCP and links to Settings for the setup", async ({ page }) => {
    await expect(page.getByText("Connect your assistant")).toBeVisible();
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
