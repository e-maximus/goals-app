import { createPool, migrate, type Pool } from "./db";
import { ensureSeeded } from "./repo";

/**
 * The pool the route handlers share, migrated and seeded once.
 *
 * There is no "server start" hook, so the first caller does the setup —
 * migrate, then seed the example goals if the store is empty — and everyone
 * else awaits the same promise. It is cached on `globalThis` because a dev-mode
 * hot reload re-evaluates this module, and a fresh pool per reload would leak
 * connections until Postgres stopped accepting them.
 *
 * Kept separate from db.ts so the low-level db module doesn't depend on repo.
 */
const globalForPool = globalThis as unknown as { goalsPool?: Promise<Pool> };

export function getPool(): Promise<Pool> {
  globalForPool.goalsPool ??= (async () => {
    const pool = createPool();
    await migrate(pool);
    await ensureSeeded(pool);
    return pool;
  })();
  return globalForPool.goalsPool;
}
