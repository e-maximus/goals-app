import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import * as repo from "../repo";
import {
  ADJECTIVES,
  ANIMALS,
  createUser,
  getOrCreateUserByClerkId,
  getUserByClerkId,
  getUserByEmail,
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
  it("mints a session token and seeds the starter goal", async () => {
    const user = await createUser(pool);
    assert.ok(user.id);
    assert.ok(user.sessionToken);
    assert.notEqual(user.id, user.sessionToken);

    const state = await repo.getState(pool, user.id);
    assert.equal(state.initialized, true);
    // The onboarding seed: exactly one goal, taught through its own ungrouped
    // steps rather than demo data.
    assert.equal(state.goals.length, 1);
    assert.equal(state.goals[0]!.title, "Get to know Goals");
    assert.ok(state.goals[0]!.steps!.length >= 4, "the tour lives in ungrouped steps");
    assert.equal(state.goals[0]!.groups.length, 0);
  });

  it("mints an adjective-animal identity with a matching emoji", async () => {
    const user = await createUser(pool);
    const [adjective, ...rest] = (user.displayName ?? "").split(" ");
    const animalName = rest.join(" ");
    assert.ok(ADJECTIVES.includes(adjective!), "adjective comes from the list");
    const animal = ANIMALS.find((a) => a.name === animalName);
    assert.ok(animal, "animal comes from the list");
    assert.equal(user.avatar, animal!.avatar, "emoji follows the chosen animal");

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

describe("email fallback (a Clerk identity deleted and signed up again)", () => {
  const withCookie = (token?: string) =>
    new Request("http://localhost/api/goals", token ? { headers: { cookie: `session=${token}` } } : {});
  // Stands in for clerkEmailResolver: the real one asks Clerk and returns the
  // address only when it is verified, so a test that wants "unverified" or
  // "no email on the identity" resolves null exactly as that helper would.
  const email = (address: string | null) => async () => address;

  it("records the verified email when a Clerk identity is first linked", async () => {
    const anon = await createUser(pool);
    const resolved = await resolveWebUser(
      pool,
      withCookie(anon.sessionToken),
      "clerk_e1",
      email("Person@Example.com")
    );
    assert.equal(resolved.user.email, "person@example.com", "stored lowercased");
    assert.equal((await getUserByEmail(pool, "PERSON@EXAMPLE.COM"))?.id, anon.id, "matched case-insensitively");
  });

  it("re-links the original account over MCP instead of minting an empty one", async () => {
    // The account as it was, with real goals on it and the old Clerk id.
    const original = await createUser(pool);
    await resolveWebUser(pool, withCookie(original.sessionToken), "clerk_old", email("me@example.com"));
    await repo.createGoal(pool, original.id, "Ship the thing", "because");
    const goalsBefore = (await repo.getState(pool, original.id)).goals.length;

    // Deleted in Clerk, signed up again: same person, brand-new Clerk id, and no
    // cookie on the MCP path to fall back on.
    const viaMcp = await getOrCreateUserByClerkId(pool, "clerk_new", email("me@example.com"));

    assert.equal(viaMcp.id, original.id, "the agent lands on the account that has the goals");
    assert.equal(viaMcp.clerkUserId, "clerk_new", "the new Clerk id now owns the account");
    assert.equal((await repo.getState(pool, viaMcp.id)).goals.length, goalsBefore);
    assert.equal(await getUserByClerkId(pool, "clerk_old"), null, "the stale link is gone");
  });

  it("re-links on the web path too, ahead of the browser's cookie account", async () => {
    const original = await createUser(pool);
    await resolveWebUser(pool, withCookie(original.sessionToken), "clerk_w_old", email("web@example.com"));
    const otherBrowser = await createUser(pool);

    const resolved = await resolveWebUser(
      pool,
      withCookie(otherBrowser.sessionToken),
      "clerk_w_new",
      email("web@example.com")
    );
    assert.equal(resolved.user.id, original.id, "the email-matched account wins over the cookie one");
    assert.ok(resolved.setCookie, "and this browser is re-pointed at it");
  });

  it("mints a fresh account when no verified email is available", async () => {
    const original = await createUser(pool);
    await resolveWebUser(pool, withCookie(original.sessionToken), "clerk_v_old", email("v@example.com"));

    // An unverified address resolves null — otherwise signing up with someone
    // else's email would hand over their goals.
    const stranger = await getOrCreateUserByClerkId(pool, "clerk_stranger", email(null));
    assert.notEqual(stranger.id, original.id, "no email, no recovery — a separate account");
    assert.equal(stranger.email, null);
  });

  it("does not match a different address", async () => {
    const original = await createUser(pool);
    await resolveWebUser(pool, withCookie(original.sessionToken), "clerk_d_old", email("one@example.com"));

    const other = await getOrCreateUserByClerkId(pool, "clerk_d_new", email("two@example.com"));
    assert.notEqual(other.id, original.id);
  });

  it("prefers the Clerk id over the email when both point somewhere", async () => {
    const byClerk = await getOrCreateUserByClerkId(pool, "clerk_p1", email("p1@example.com"));
    // A second account holding a different address; the Clerk id must still win.
    await getOrCreateUserByClerkId(pool, "clerk_p2", email("p2@example.com"));

    const resolved = await getOrCreateUserByClerkId(pool, "clerk_p1", email("p2@example.com"));
    assert.equal(resolved.id, byClerk.id);
  });

  it("backfills the email onto an account linked before the column existed", async () => {
    // linkClerkUser without an email is exactly the pre-migration state.
    const anon = await createUser(pool);
    await resolveWebUser(pool, withCookie(anon.sessionToken), "clerk_b1");
    assert.equal((await getUserByClerkId(pool, "clerk_b1"))?.email, null);

    const resolved = await getOrCreateUserByClerkId(pool, "clerk_b1", email("back@example.com"));
    assert.equal(resolved.id, anon.id);
    assert.equal(resolved.email, "back@example.com", "the next deletion is now recoverable");
  });
});
