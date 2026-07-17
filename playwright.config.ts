import { defineConfig, devices } from "@playwright/test";

// E2E config. Tests drive the app through the Next.js dev server, which talks to
// a real Postgres. The goals are shared server-side rather than per-browser, so
// an automatic fixture resets the store to the seeded goals before each test
// (see e2e/fixtures.ts) and the suite runs serially — no two tests may race on
// the one database.
// Overridable so parallel checkouts (e.g. agent worktrees) can run the suite
// side by side without fighting over one port.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

// A database dedicated to the tests, kept apart from the dev `goals` database so
// a test run never wipes real work. Matches the CI Postgres service.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://goals:goals@localhost:5432/goals_test";

export default defineConfig({
  testDir: "./e2e",
  // No-op unless E2E_CLERK_AUTH=1, when it fetches a Clerk Testing Token for the
  // opt-in signed-in tests (see e2e/global-setup.ts, e2e/settings-auth.spec.ts).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI, // fail CI if a test is left `.only`
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start the app before the tests and reuse a running dev server locally. The
  // env gives it the test database and unlocks the reset endpoint the fixture
  // calls — both scoped to this run, never set in a real deployment.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DATABASE_URL: TEST_DATABASE_URL,
      ENABLE_TEST_RESET: "1",
    },
  },
});
