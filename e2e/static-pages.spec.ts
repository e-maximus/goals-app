import { test, expect } from "./fixtures";

test.describe("Static pages", () => {
  test("the topbar wordmark leads home from a deep page", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("banner").getByRole("link", { name: "Keep Going — home" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("the footer links to About, Privacy, and Terms", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "About" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
  });

  test("the About page tells the story and links back via the nav", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Keep going.", level: 1 })).toBeVisible();
    await expect(page.getByText("Why this exists")).toBeVisible();
    // The page content itself carries no "My Goals" link — only the persistent nav does.
    await expect(page.getByRole("main").getByRole("link", { name: "My Goals" })).toHaveCount(0);
    // The persistent nav is how you get back to the goals.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Goals" }).click();
    await expect(page).toHaveURL(/\/goals$/, { timeout: 15_000 });
  });

  test("the Privacy Policy page renders", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
    await expect(page.getByText("The short version")).toBeVisible();
  });

  test("the Terms of Use page renders", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use", level: 1 })).toBeVisible();
    await expect(page.getByText("Fair use")).toBeVisible();
  });

  test("an unknown URL shows the branded 404 with a way home", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { name: "This page gave up." })).toBeVisible();
    await page.getByRole("link", { name: "Back to My Goals" }).click();
    await expect(page).toHaveURL(/\/goals$/);
  });
});
