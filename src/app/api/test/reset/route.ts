import { getPool } from "@/server/pool";
import { resetToSeed } from "@/server/repo";

/**
 * Reset the store to the seeded example goals. This exists only for the e2e
 * suite, which needs each test to start from the same known state — the way the
 * old localStorage app got a fresh reseed per browser context.
 *
 * Gated behind ENABLE_TEST_RESET so it can't be hit in a real deployment: with
 * the flag unset the route 404s, as if it weren't here.
 */
export async function POST() {
  if (process.env.ENABLE_TEST_RESET !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const pool = await getPool();
  await resetToSeed(pool);
  return Response.json({ ok: true });
}
