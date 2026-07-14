import { createPool, migrate, type Pool } from "../src/db.js";

/**
 * These tests run against a real Postgres rather than a fake — the whole point
 * of the repo layer is its SQL and its transactions, and a fake would only
 * assert that the mock was called.
 *
 *   docker compose up -d db     # locally
 *
 * CI provides the same thing as a service container.
 *
 * The suites share one database and truncate it between tests, so the files
 * must run one at a time — see `--test-concurrency=1` in the test script.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://goals:goals@localhost:5432/goals_test";

export async function setupPool(): Promise<Pool> {
  const pool = createPool(TEST_DATABASE_URL);
  await migrate(pool);
  return pool;
}

/** Wipe every table between tests. Cascades take care of the child rows. */
export async function reset(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE goals, meta RESTART IDENTITY CASCADE");
}
