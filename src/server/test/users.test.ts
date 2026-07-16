import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import * as repo from "../repo";
import {
  IDENTITIES,
  createUser,
  getOrCreateUserByClerkId,
  getUserByClerkId,
  getUserBySession,
  resolveWebUser,
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
  it("mints two distinct tokens and seeds the starter goal", async () => {
    const user = await createUser(pool);
    assert.ok(user.id);
    assert.ok(user.sessionToken);
    assert.ok(user.pat);
    assert.notEqual(user.sessionToken, user.pat);

    const state = await repo.getState(pool, user.id);
    assert.equal(state.initialized, true);
    // The onboarding seed: exactly one goal, taught through its own ungrouped
    // steps rather than demo data.
    assert.equal(state.goals.length, 1);
    assert.equal(state.goals[0]!.title, "Get to know Goals");
    assert.ok(state.goals[0]!.steps!.length >= 4, "the tour lives in ungrouped steps");
    assert.equal(state.goals[0]!.groups.length, 0);
  });

  it("mints an animal identity from the fixed list", async () => {
    const user = await createUser(pool);
    const identity = IDENTITIES.find((i) => i.name === user.displayName);
    assert.ok(identity, "display name comes from the identity list");
    assert.equal(user.avatar, identity!.avatar);

    // The identity survives a lookup round-trip.
    const fetched = await getUserBySession(pool, user.sessionToken);
    assert.equal(fetched?.displayName, user.displayName);
    assert.equal(fetched?.avatar, user.avatar);
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
  it("finds a user by session token", async () => {
    const user = await createUser(pool);
    assert.equal((await getUserBySession(pool, user.sessionToken))?.id, user.id);
    assert.equal(await getUserBySession(pool, "nope"), null);
  });
});

describe("resolveWebUser + Clerk linking", () => {
  const withCookie = (token?: string) =>
    new Request("http://localhost/api/goals", token ? { headers: { cookie: `session=${token}` } } : {});

  it("mints an anonymous account on first anonymous visit, then resolves it by cookie", async () => {
    const first = await resolveWebUser(pool, withCookie(), null);
    assert.ok(first.setCookie, "a fresh account hands back a Set-Cookie");
    assert.equal(first.user.clerkUserId, null);

    const again = await resolveWebUser(pool, withCookie(first.user.sessionToken), null);
    assert.equal(again.user.id, first.user.id, "same cookie resolves the same account");
    assert.equal(again.setCookie, null, "no new cookie for a returning visitor");
  });

  it("claims the current anonymous account when its owner signs in with Clerk", async () => {
    const anon = await createUser(pool);
    const goalsBefore = (await repo.getState(pool, anon.id)).goals.length;

    const resolved = await resolveWebUser(pool, withCookie(anon.sessionToken), "clerk_abc");
    assert.equal(resolved.user.id, anon.id, "the anonymous account is claimed, not replaced");
    assert.equal(resolved.user.clerkUserId, "clerk_abc");
    assert.equal((await getUserByClerkId(pool, "clerk_abc"))?.id, anon.id);

    const goalsAfter = (await repo.getState(pool, anon.id)).goals.length;
    assert.equal(goalsAfter, goalsBefore, "signing in keeps the goals already in this account");
  });

  it("follows the linked account when the same Clerk identity signs in from a new browser", async () => {
    const original = await createUser(pool);
    await resolveWebUser(pool, withCookie(original.sessionToken), "clerk_xyz");

    // A different browser: no cookie (or a stranger's), but the same Clerk id.
    const fromElsewhere = await resolveWebUser(pool, withCookie(), "clerk_xyz");
    assert.equal(fromElsewhere.user.id, original.id, "resolves back to the stable account");
    assert.ok(fromElsewhere.setCookie, "re-points this browser's cookie at the account");
  });
});

describe("getOrCreateUserByClerkId (MCP, cookieless)", () => {
  const withCookie = (token?: string) =>
    new Request("http://localhost/api/goals", token ? { headers: { cookie: `session=${token}` } } : {});

  it("returns the account a Clerk identity is already linked to", async () => {
    const anon = await createUser(pool);
    await resolveWebUser(pool, withCookie(anon.sessionToken), "clerk_mcp");

    const resolved = await getOrCreateUserByClerkId(pool, "clerk_mcp");
    assert.equal(resolved.id, anon.id, "MCP resolves to the same account as the web session");
    assert.equal(resolved.clerkUserId, "clerk_mcp");
  });

  it("mints and links a seeded account for a Clerk identity new to the app", async () => {
    const resolved = await getOrCreateUserByClerkId(pool, "clerk_fresh");
    assert.equal(resolved.clerkUserId, "clerk_fresh");
    assert.equal((await getUserByClerkId(pool, "clerk_fresh"))?.id, resolved.id);
    assert.ok((await repo.getState(pool, resolved.id)).goals.length > 0, "seeded with example goals");
  });

  it("is idempotent — a second call resolves the same account", async () => {
    const first = await getOrCreateUserByClerkId(pool, "clerk_twice");
    const second = await getOrCreateUserByClerkId(pool, "clerk_twice");
    assert.equal(second.id, first.id);
  });
});
