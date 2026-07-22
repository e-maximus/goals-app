import "server-only";
import { createPool, migrate, type Pool } from "./db";

/**
 * The pool the route handlers share, migrated once.
 *
 * There is no "server start" hook, so the first caller runs the migrations and
 * everyone else awaits the same promise. It is cached on `globalThis` because a
 * dev-mode hot reload re-evaluates this module, and a fresh pool per reload
 * would leak connections until Postgres stopped accepting them.
 *
 * Seeding is no longer done here: goals are per-user, so the example goals are
 * seeded per user the moment that user is created (see users.createUser).
 *
 * Kept separate from db.ts so the low-level db module doesn't depend on repo.
 */
const globalForPool = globalThis as unknown as { goalsPool?: Promise<Pool> };

export function getPool(): Promise<Pool> {
  globalForPool.goalsPool ??= (async () => {
    const pool = createPool();
    await migrate(pool);
    return pool;
  })();
  return globalForPool.goalsPool;
}
