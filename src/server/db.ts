import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma, createPrisma } from "@/lib/db";
import { migrations } from "./migrations";

/**
 * The repo layer is raw SQL and transactions (its scoping and locking lean on
 * SQL features an ORM query builder can't express). So rather than rewrite it,
 * this module runs that SQL *through Prisma*: Prisma owns the connection and the
 * client singleton, and this thin adapter preserves the `{ rows, rowCount }`
 * shape the repo speaks. Prisma's Postgres raw interface uses the same `$1`
 * placeholders as before, so the queries are unchanged.
 */

type Executor = PrismaClient | Prisma.TransactionClient;

export type QueryResult<T> = { rows: T[]; rowCount: number };

/** A statement runner — either the pool itself or a client inside a transaction. */
export interface Client {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Pool extends Client {
  transaction<T>(fn: (client: Client) => Promise<T>): Promise<T>;
  /** Close the underlying connections (mirrors pg's `pool.end()`). */
  end(): Promise<void>;
}

/**
 * Postgres BIGINT comes back from Prisma raw queries as a JS `BigInt`, but our
 * bigints are epoch-millisecond timestamps the app treats as plain `number`
 * (well within Number's safe range). Convert them back at the boundary, deeply,
 * so callers see the same shapes the pg driver used to hand them.
 */
function fromDb(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(fromDb);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromDb(v);
    return out;
  }
  return value;
}

// A statement returns rows when it's a SELECT/CTE or carries a RETURNING clause;
// otherwise it's a write and we want the affected-row count. Prisma splits these
// across two entry points ($queryRaw vs $executeRaw), so route each accordingly.
const RETURNS_ROWS = /^\s*(select|with)\b/i;
const HAS_RETURNING = /\breturning\b/i;

async function runQuery<T>(
  exec: Executor,
  sql: string,
  params: unknown[]
): Promise<QueryResult<T>> {
  if (RETURNS_ROWS.test(sql) || HAS_RETURNING.test(sql)) {
    const raw = await exec.$queryRawUnsafe<T[]>(sql, ...params);
    const rows = raw.map(fromDb) as T[];
    return { rows, rowCount: rows.length };
  }
  const rowCount = await exec.$executeRawUnsafe(sql, ...params);
  return { rows: [], rowCount };
}

function makeClient(exec: Executor): Client {
  return { query: (sql, params = []) => runQuery(exec, sql, params) };
}

class PrismaPool implements Pool {
  constructor(private readonly client: PrismaClient) {}

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return runQuery<T>(this.client, sql, params);
  }

  transaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    return this.client.$transaction((tx) => fn(makeClient(tx)));
  }

  end(): Promise<void> {
    return this.client.$disconnect();
  }
}

/**
 * A pool bound to `connectionString`. The default (the app's own database) reuses
 * the shared Prisma singleton; a different URL — the test suite's `goals_test` —
 * gets its own client pointed at that database.
 */
export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the server needs a Postgres connection string.");
  }
  const client =
    connectionString === process.env.DATABASE_URL ? defaultPrisma : createPrisma(connectionString);
  return new PrismaPool(client);
}

/**
 * Split a migration's SQL (several statements in one string) into individual
 * statements: Prisma's raw interface runs one statement per call, unlike the pg
 * driver's multi-statement query. Line comments are stripped first; the SQL here
 * has no `;` or `--` inside string literals, so this stays a simple split.
 */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => {
      const comment = line.indexOf("--");
      return comment >= 0 ? line.slice(0, comment) : line;
    })
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
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
    await pool.transaction(async (client) => {
      for (const statement of statements(sql)) await client.query(statement);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    ran.push(name);
  }

  return ran;
}

/** Run `fn` inside a transaction, committing on success and rolling back on throw. */
export function withTransaction<T>(pool: Pool, fn: (client: Client) => Promise<T>): Promise<T> {
  return pool.transaction(fn);
}
