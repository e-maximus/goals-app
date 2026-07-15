import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import * as repo from "../repo";
import {
  bearerUser,
  createUser,
  getUserByPat,
  getUserBySession,
  rotatePat,
} from "../users";
import { reset, setupPool } from "./helpers";

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

describe("createUser", () => {
  it("mints two distinct tokens and seeds the example goals", async () => {
    const user = await createUser(pool);
    assert.ok(user.id);
    assert.ok(user.sessionToken);
    assert.ok(user.pat);
    assert.notEqual(user.sessionToken, user.pat);

    const state = await repo.getState(pool, user.id);
    assert.equal(state.initialized, true);
    assert.ok(state.goals.length > 0, "a new user starts with seeded example goals");
  });

  it("gives two users different goal ids, so seeds don't collide", async () => {
    const a = await createUser(pool);
    const b = await createUser(pool);
    const aIds = (await repo.getState(pool, a.id)).goals.map((g) => g.id);
    const bIds = (await repo.getState(pool, b.id)).goals.map((g) => g.id);
    assert.equal(aIds.some((id) => bIds.includes(id)), false);
  });
});

describe("lookups", () => {
  it("finds a user by session token and by pat", async () => {
    const user = await createUser(pool);
    assert.equal((await getUserBySession(pool, user.sessionToken))?.id, user.id);
    assert.equal((await getUserByPat(pool, user.pat))?.id, user.id);
    assert.equal(await getUserBySession(pool, "nope"), null);
    assert.equal(await getUserByPat(pool, "nope"), null);
  });
});

describe("rotatePat", () => {
  it("issues a new token, invalidates the old one, and keeps goals", async () => {
    const user = await createUser(pool);
    const before = (await repo.getState(pool, user.id)).goals.length;

    const next = await rotatePat(pool, user.id);
    assert.notEqual(next, user.pat);
    assert.equal(await getUserByPat(pool, user.pat), null, "old token no longer resolves");
    assert.equal((await getUserByPat(pool, next))?.id, user.id);

    const after = (await repo.getState(pool, user.id)).goals.length;
    assert.equal(after, before, "rotating the token leaves goals untouched");
  });
});

describe("bearerUser", () => {
  const req = (auth?: string) =>
    new Request("http://localhost/api/mcp", auth ? { headers: { authorization: auth } } : {});

  it("resolves a valid Bearer token to its user", async () => {
    const user = await createUser(pool);
    assert.equal((await bearerUser(pool, req(`Bearer ${user.pat}`)))?.id, user.id);
  });

  it("returns null for a missing, malformed or unknown token", async () => {
    assert.equal(await bearerUser(pool, req()), null);
    assert.equal(await bearerUser(pool, req("Basic abc")), null);
    assert.equal(await bearerUser(pool, req("Bearer nope")), null);
  });
});
