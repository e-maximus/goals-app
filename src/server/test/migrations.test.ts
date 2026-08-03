import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import { migrations } from "../migrations";
import { createOwner, reset, setupPool } from "./helpers";

let pool: Pool;

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await reset(pool);
});

/**
 * Run one shipped migration's SQL by name.
 *
 * The migration itself has already run against this database by the time a test
 * starts — `setupPool` migrates, and only then does the test insert its rows. So
 * the assertion has to replay the statement over data the test controls; running
 * the real string is what keeps this honest, rather than a paraphrase of it that
 * could drift from what production executes.
 */
async function runMigration(name: string): Promise<void> {
  const migration = migrations.find((m) => m.name === name);
  assert.ok(migration, `no migration named ${name}`);
  await pool.query(migration.sql);
}

/** An account that has signed in: Clerk's identity is linked to it. */
async function createSignedInOwner(pool: Pool, id: string): Promise<string> {
  await pool.query(
    "INSERT INTO users (id, session_token, created_at, clerk_user_id) VALUES ($1, $2, $3, $4)",
    [id, `${id}-session`, Date.now(), `clerk-${id}`]
  );
  return id;
}

async function index(ownerId: string, itemId: string): Promise<void> {
  await pool.query(
    `INSERT INTO embeddings
       (owner_id, kind, item_id, title_text, body_text, content, content_hash, updated_at)
     VALUES ($1, 'goal', $2, 'Move to Barcelona', '', 'Move to Barcelona', $3, $4)`,
    [ownerId, itemId, `hash-${itemId}`, Date.now()]
  );
}

async function indexedOwners(): Promise<string[]> {
  const { rows } = await pool.query<{ owner_id: string }>(
    "SELECT DISTINCT owner_id FROM embeddings ORDER BY owner_id"
  );
  return rows.map((r) => r.owner_id);
}

describe("016_drop_anonymous_index", () => {
  it("drops index rows belonging to anonymous accounts", async () => {
    const anonymous = await createOwner(pool, "anon-1");
    await index(anonymous, "goal-1");

    await runMigration("016_drop_anonymous_index");

    assert.deepEqual(await indexedOwners(), []);
  });

  it("keeps the rows of a signed-in account", async () => {
    const signedIn = await createSignedInOwner(pool, "member-1");
    await index(signedIn, "goal-1");

    await runMigration("016_drop_anonymous_index");

    assert.deepEqual(await indexedOwners(), [signedIn]);
  });

  it("separates the two when both exist", async () => {
    const anonymous = await createOwner(pool, "anon-1");
    const signedIn = await createSignedInOwner(pool, "member-1");
    await index(anonymous, "goal-1");
    await index(signedIn, "goal-1");
    await index(signedIn, "goal-2");

    await runMigration("016_drop_anonymous_index");

    assert.deepEqual(await indexedOwners(), [signedIn]);
    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM embeddings");
    assert.equal(rows[0].n, 2);
  });

  it("is safe to run twice", async () => {
    const anonymous = await createOwner(pool, "anon-1");
    await index(anonymous, "goal-1");

    await runMigration("016_drop_anonymous_index");
    await runMigration("016_drop_anonymous_index");

    assert.deepEqual(await indexedOwners(), []);
  });
});
