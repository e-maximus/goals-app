import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
 * Run every SQL file in `migrations/` exactly once, in filename order, each in
 * its own transaction. Applied names are recorded in `schema_migrations`, so a
 * restart is a no-op and a new file is picked up automatically.
 */
export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    ran.push(file);
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
