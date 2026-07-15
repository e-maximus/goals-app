import { getPool } from "@/server/pool";
import { resetTestUser } from "@/server/users";

/**
 * Reset the e2e test user's store to the canonical seeded goals, and hand back
 * the session token so the fixture can drop it into the browser. This exists
 * only for the e2e suite, which needs each test to start from the same known
 * state as a known user — the way the old localStorage app got a fresh reseed
 * per browser context.
 *
 * Gated behind ENABLE_TEST_RESET so it can't be hit in a real deployment: with
 * the flag unset the route 404s, as if it weren't here.
 */
export async function POST() {
  if (process.env.ENABLE_TEST_RESET !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const pool = await getPool();
  const { sessionToken } = await resetTestUser(pool);
  return Response.json({ ok: true, sessionToken });
}
