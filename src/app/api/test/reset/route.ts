import { getPool } from "@/server/pool";
import { resetTestUser } from "@/server/users";
import { reindexOwner } from "@/server/embeddings/reindex";

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
  const { id, sessionToken } = await resetTestUser(pool);
  // Awaited, not scheduled: a test that searches straight after the reset must
  // not race the index. Text only (`null` embedder) whether or not a provider is
  // configured — the e2e suite asserts on the keyword and trigram arms, and
  // re-embedding the whole seed on every single test would be slow everywhere
  // and would make results depend on whose machine it ran on.
  await reindexOwner(pool, id, null);
  // …and drop any vectors a previous run left behind. playwright.config.ts
  // starts the server without an embedding provider, but `reuseExistingServer`
  // means a dev server you already had running — with your key — can serve the
  // suite instead. The seed's text never changes, so the content-hash diff would
  // rightly keep those old embeddings alive forever.
  await pool.query("UPDATE embeddings SET embedding = NULL, model = NULL WHERE owner_id = $1", [id]);
  return Response.json({ ok: true, sessionToken });
}
