import { test, expect } from "./fixtures";

// The podcast goal ships with two seeded comments, so it exercises the feed,
// editing and deletion against a known starting state.
test.describe("Goal comments", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("shows the seeded comments and their count", async ({ page }) => {
    await expect(page.getByText("Comments · 2")).toBeVisible();
    await expect(page.getByText(/Editing is taking way longer/)).toBeVisible();
  });

  test("posts a comment", async ({ page }) => {
    await page.getByLabel("Comment", { exact: true }).fill("Booked the studio for Friday.");
    await page.getByRole("button", { name: "Post comment" }).click();

    await expect(page.getByText("Booked the studio for Friday.")).toBeVisible();
    await expect(page.getByText("Comments · 3")).toBeVisible();

    // The composer clears so the next thought starts from empty.
    await expect(page.getByLabel("Comment", { exact: true })).toHaveValue("");
  });

  test("keeps a posted comment after a reload", async ({ page }) => {
    await page.getByLabel("Comment", { exact: true }).fill("Persisted thought.");

    // Writes are pushed to the server on a short debounce, so wait for that PUT
    // to land before reloading — otherwise the reload can race the save and pull
    // a copy from before the comment existed. In the app the header's "Saving…"
    // indicator is the user-facing version of this wait.
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/goals") && r.request().method() === "PUT" && r.ok()
    );
    await page.getByRole("button", { name: "Post comment" }).click();
    await expect(page.getByText("Persisted thought.")).toBeVisible();
    await saved;

    await page.reload();
    await expect(page.getByText("Persisted thought.")).toBeVisible();
    await expect(page.getByText("Comments · 3")).toBeVisible();
  });

  test("edits a comment via the options menu", async ({ page }) => {
    const target = page
      .locator("div.group\\/comment")
      .filter({ hasText: "Settled on the name" });
    await target.getByRole("button", { name: "Comment options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Comment", { exact: true })).toHaveValue(/Settled on the name/);
    await dialog.getByLabel("Comment", { exact: true }).fill("Renamed the show. Final answer.");
    await dialog.getByRole("button", { name: "Save" }).click();

    // Scoped to the feed: the closing dialog still holds the text in its
    // textarea for a beat, so an unscoped match would be ambiguous.
    const feed = page.getByRole("main");
    await expect(feed.getByText("Renamed the show. Final answer.")).toBeVisible();
    await expect(feed.getByText(/Settled on the name/)).toHaveCount(0);
    // Editing must not change the count.
    await expect(page.getByText("Comments · 2")).toBeVisible();
  });

  test("deletes a comment via the options menu", async ({ page }) => {
    const target = page
      .locator("div.group\\/comment")
      .filter({ hasText: "Settled on the name" });
    await target.getByRole("button", { name: "Comment options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Delete comment" }).click();

    await expect(page.getByText(/Settled on the name/)).toHaveCount(0);
    await expect(page.getByText("Comments · 1")).toBeVisible();
  });

  test("cannot post an empty comment", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Post comment" })).toBeDisabled();

    // Whitespace alone doesn't count as a comment either.
    await page.getByLabel("Comment", { exact: true }).fill("   ");
    await expect(page.getByRole("button", { name: "Post comment" })).toBeDisabled();
  });
});

// The watercolor goal is seeded with no groups and no comments — the empty state.
test.describe("Goal comments — empty state", () => {
  test("shows the empty state and posts the first comment", async ({ page }) => {
    await page.goto("/goal/goal-watercolor");
    await expect(page.getByRole("heading", { name: "Learn watercolor painting", level: 1 })).toBeVisible();

    await expect(page.getByText("Comments · 0")).toBeVisible();
    await expect(page.getByText("No comments yet")).toBeVisible();

    await page.getByLabel("Comment", { exact: true }).fill("Bought a cheap starter set to see if it sticks.");
    await page.getByRole("button", { name: "Post comment" }).click();

    await expect(page.getByText("No comments yet")).toHaveCount(0);
    await expect(page.getByText("Bought a cheap starter set to see if it sticks.")).toBeVisible();
  });
});

// The dashboard row summarises comments alongside groups and steps.
test.describe("Dashboard — comment count", () => {
  test("shows the comment count in the goal meta line", async ({ page }) => {
    await page.goto("/");

    const row = page.getByRole("link", { name: /Launch my podcast/ });
    await expect(row).toContainText("2 comments");

    // A goal with no comments doesn't show a comments segment at all.
    const watercolor = page.getByRole("link", { name: /Learn watercolor painting/ });
    await expect(watercolor).not.toContainText("comment");
  });
});
