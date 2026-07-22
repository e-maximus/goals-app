import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * The Prisma client singleton (per the standards' `src/lib/db.ts` convention).
 *
 * Cached on `globalThis` so a dev-mode hot reload — which re-evaluates modules —
 * reuses one client rather than opening a fresh connection pool each time until
 * Postgres refuses new connections.
 *
 * The server layer ([src/server/db.ts](../server/db.ts)) wraps this in the small
 * pool/transaction API the repo speaks; `createPrisma` lets that layer point a
 * separate client at another database (the test suite's `goals_test`).
 */
const globalForPrisma = globalThis as unknown as { goalsPrisma?: PrismaClient };

export const prisma: PrismaClient = (globalForPrisma.goalsPrisma ??= new PrismaClient());

/** A Prisma client bound to a specific database URL (used by the test harness). */
export function createPrisma(url: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: url });
}
