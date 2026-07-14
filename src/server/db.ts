import pg from "pg";
import { migrations } from "./migrations";

// Postgres returns BIGINT as a string by default (it can exceed Number's safe
// range). Our bigints are epoch-millisecond timestamps, which are nowhere near
// that limit, and the app's `createdAt` is a plain number — so parse them back.
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

export type Pool = pg.Pool;
export type Client = pg.PoolClient;

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the server needs a Postgres connection string.");
  }
  return new pg.Pool({ connectionString });
}

/**
 * Apply every migration exactly once, in order, each in its own transaction.
 * Applied names are recorded in `schema_migrations`, so a restart is a no-op and
 * a newly appended migration is picked up automatically.
 */
export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const ran: string[] = [];

  for (const { name, sql } of migrations) {
    if (applied.has(name)) continue;
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    ran.push(name);
  }

  return ran;
}

/** Run `fn` inside a transaction, committing on success and rolling back on throw. */
export async function withTransaction<T>(pool: Pool, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The pool the route handlers share.
 *
 * There is no "server start" hook to migrate from, so the first caller runs the
 * migrations and everyone else awaits the same promise. It is cached on
 * `globalThis` because a dev-mode hot reload re-evaluates this module, and a
 * fresh pool per reload would leak connections until Postgres stopped accepting
 * them.
 */
const globalForDb = globalThis as unknown as { goalsPool?: Promise<Pool> };

export function getPool(): Promise<Pool> {
  globalForDb.goalsPool ??= (async () => {
    const pool = createPool();
    await migrate(pool);
    return pool;
  })();
  return globalForDb.goalsPool;
}
