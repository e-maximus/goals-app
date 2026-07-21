import { test, expect } from "./fixtures";

// The podcast goal ships with two seeded notes, so it exercises the feed,
// editing and deletion against a known starting state.
test.describe("Goal notes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal/goal-podcast");
    await expect(page.getByRole("heading", { name: "Launch my podcast", level: 1 })).toBeVisible();
  });

  test("shows the seeded notes and their count", async ({ page }) => {
    await expect(page.getByText("Notes · 2")).toBeVisible();
    await expect(page.getByText(/Editing is taking way longer/)).toBeVisible();
  });

  test("adds a note", async ({ page }) => {
    // The composer is hidden until "Add note" reveals it.
    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByLabel("Note", { exact: true }).fill("Booked the studio for Friday.");
    await page.getByRole("button", { name: "Add note" }).click();

    await expect(page.getByText("Booked the studio for Friday.")).toBeVisible();
    await expect(page.getByText("Notes · 3")).toBeVisible();

    // The composer stays open but clears, so the next thought starts from empty.
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("");
  });

  test("keeps an added note after a reload", async ({ page }) => {
    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByLabel("Note", { exact: true }).fill("Persisted thought.");

    // Writes are pushed to the server on a short debounce, so wait for that PUT
    // to land before reloading — otherwise the reload can race the save and pull
    // a copy from before the note existed. In the app the header's "Saving…"
    // indicator is the user-facing version of this wait.
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/goals") && r.request().method() === "PUT" && r.ok()
    );
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Persisted thought.")).toBeVisible();
    await saved;

    await page.reload();
    await expect(page.getByText("Persisted thought.")).toBeVisible();
    await expect(page.getByText("Notes · 3")).toBeVisible();
  });

  test("links a note to a sub-goal and shows it on the card", async ({ page }) => {
    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByLabel("Note", { exact: true }).fill("Leaning toward a two-word name.");
    await page.getByLabel("Link to a sub-goal").selectOption({ label: "Pick a name" });
    await page.getByRole("button", { name: "Add note" }).click();

    const note = page
      .locator("div.group\\/note")
      .filter({ hasText: "Leaning toward a two-word name." });
    await expect(note).toContainText("Pick a name");
  });

  test("edits a note via the options menu", async ({ page }) => {
    const target = page
      .locator("div.group\\/note")
      .filter({ hasText: "Settled on the name" });
    await target.getByRole("button", { name: "Note options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Note", { exact: true })).toHaveValue(/Settled on the name/);
    await dialog.getByLabel("Note", { exact: true }).fill("Renamed the show. Final answer.");
    await dialog.getByRole("button", { name: "Save" }).click();

    // Scoped to the feed: the closing dialog still holds the text in its
    // textarea for a beat, so an unscoped match would be ambiguous.
    const feed = page.getByRole("main");
    await expect(feed.getByText("Renamed the show. Final answer.")).toBeVisible();
    await expect(feed.getByText(/Settled on the name/)).toHaveCount(0);
    // Editing must not change the count.
    await expect(page.getByText("Notes · 2")).toBeVisible();
  });

  test("deletes a note via the options menu", async ({ page }) => {
    const target = page
      .locator("div.group\\/note")
      .filter({ hasText: "Settled on the name" });
    await target.getByRole("button", { name: "Note options" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Delete note" }).click();

    await expect(page.getByText(/Settled on the name/)).toHaveCount(0);
    await expect(page.getByText("Notes · 1")).toBeVisible();
  });

  test("cannot add an empty note", async ({ page }) => {
    await page.getByRole("button", { name: "Add note" }).click();
    // The composer's submit button stays disabled until there's real text.
    const submit = page.getByRole("button", { name: "Add note" });
    await expect(submit).toBeDisabled();

    // Whitespace alone doesn't count as a note either.
    await page.getByLabel("Note", { exact: true }).fill("   ");
    await expect(submit).toBeDisabled();
  });
});

// The watercolor goal is seeded with no groups and no notes — the empty state.
test.describe("Goal notes — empty state", () => {
  test("shows the empty state and adds the first note", async ({ page }) => {
    await page.goto("/goal/goal-watercolor");
    await expect(page.getByRole("heading", { name: "Learn watercolor painting", level: 1 })).toBeVisible();

    await expect(page.getByText("Notes · 0")).toBeVisible();
    await expect(page.getByText("No notes yet")).toBeVisible();

    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByLabel("Note", { exact: true }).fill("Bought a cheap starter set to see if it sticks.");
    await page.getByRole("button", { name: "Add note" }).click();

    await expect(page.getByText("No notes yet")).toHaveCount(0);
    await expect(page.getByText("Bought a cheap starter set to see if it sticks.")).toBeVisible();
  });
});

// The dashboard row summarises notes alongside groups and steps.
test.describe("Dashboard — note count", () => {
  test("shows the note count in the goal meta line", async ({ page }) => {
    await page.goto("/goals");

    // The meta line sits on the card, next to the stretched title link.
    const row = page.locator("div.group\\/goal").filter({ hasText: "Launch my podcast" });
    await expect(row).toContainText("2 notes");

    // A goal with no notes doesn't show a notes segment at all.
    const watercolor = page
      .locator("div.group\\/goal")
      .filter({ hasText: "Learn watercolor painting" });
    await expect(watercolor).not.toContainText("note");
  });
});
