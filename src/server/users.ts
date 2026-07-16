import { randomBytes } from "node:crypto";
import { withTransaction, type Pool } from "./db";
import { uid } from "./domain";
import { insertGoals } from "./repo";
import { seedGoals, withFreshIds } from "./seed";

/**
 * Identity for the app. A user is an id plus the keys that resolve to it:
 *
 * - `sessionToken` rides in an httpOnly cookie and is how the web app is
 *   recognised across requests. It's never shown in the UI.
 * - `clerkUserId` is the linked Clerk identity, set when the user signs in. It's
 *   what authorizes the **MCP** endpoint: an agent authenticates with a Clerk
 *   OAuth token, and we resolve that identity back to this account.
 *
 * Neither key is the identity — `id` is, and it's what goals hang off — so the
 * session can be reissued and the Clerk link is a durable second key on top.
 *
 * There is no password and no login required for the web app: a first-time
 * visitor is simply created, seeded with the example goals, and handed a session
 * cookie.
 *
 * Signing in with Clerk is **optional** and additive for the web app. When it
 * happens we stamp the Clerk user id onto this same account (`clerkUserId`),
 * which makes the account recoverable beyond the cookie — sign in on another
 * browser and we resolve back to it (see resolveWebUser) — and unlocks MCP,
 * which is Clerk-authorized only.
 *
 * `pat` is a legacy opaque token still minted and stored per user, but no longer
 * an auth credential anywhere; MCP moved to Clerk OAuth. The column is kept so
 * the write path is unchanged; drop it in a later migration.
 */
export type User = {
  id: string;
  sessionToken: string;
  pat: string;
  /** The linked Clerk identity, or null while the account is purely anonymous. */
  clerkUserId: string | null;
};

/** A URL-safe, unguessable token. 32 bytes of randomness, base64url encoded. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

type UserRow = {
  id: string;
  session_token: string;
  pat: string;
  clerk_user_id: string | null;
};

const USER_COLS = "id, session_token, pat, clerk_user_id";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    sessionToken: row.session_token,
    pat: row.pat,
    clerkUserId: row.clerk_user_id,
  };
}

/**
 * Create a brand-new user and seed them their own copy of the example goals,
 * all in one transaction. The seed is given fresh ids because goal ids are a
 * global primary key (see seed.withFreshIds).
 */
export async function createUser(pool: Pool): Promise<User> {
  return withTransaction(pool, async (client) => {
    const now = Date.now();
    const user: User = { id: uid(), sessionToken: newToken(), pat: newToken(), clerkUserId: null };
    await client.query(
      `INSERT INTO users (id, session_token, pat, goals_updated_at, created_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [user.id, user.sessionToken, user.pat, now]
    );
    await insertGoals(client, user.id, withFreshIds(seedGoals()));
    return user;
  });
}

export async function getUserBySession(pool: Pool, sessionToken: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE session_token = $1`,
    [sessionToken]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/** Resolve the account a Clerk identity has been linked to, or null if none yet. */
export async function getUserByClerkId(pool: Pool, clerkUserId: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * Link a Clerk identity to an existing account. Idempotent for the same pair;
 * throws if this Clerk identity is already claimed by a *different* account
 * (the UNIQUE constraint), which resolveWebUser avoids by checking first.
 */
export async function linkClerkUser(pool: Pool, userId: string, clerkUserId: string): Promise<void> {
  await pool.query("UPDATE users SET clerk_user_id = $2 WHERE id = $1", [userId, clerkUserId]);
}

/**
 * Resolve the account for a signed-in Clerk identity on a *cookieless* request —
 * the MCP endpoint, where auth is an OAuth token and there is no web session to
 * fall back on. If this Clerk id has used the web app before, it's already
 * linked (typically to the anonymous account it signed in on), so we return that
 * one and the agent sees the same goals as the browser. Otherwise this is a
 * Clerk identity we've never seen against the app, so mint a fresh seeded
 * account and link it. Anonymous cookie merging happens on the web side
 * (resolveWebUser); here there's no cookie to merge.
 */
export async function getOrCreateUserByClerkId(pool: Pool, clerkUserId: string): Promise<User> {
  const existing = await getUserByClerkId(pool, clerkUserId);
  if (existing) return existing;
  const user = await createUser(pool);
  await linkClerkUser(pool, user.id, clerkUserId);
  return { ...user, clerkUserId };
}

// ---- HTTP layer: cookie and bearer parsing ----

export const SESSION_COOKIE = "session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Pull a named cookie out of a request's Cookie header. */
function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * Serialize the session Set-Cookie. httpOnly so page scripts can't read the
 * session token (the PAT, not this, is what the UI exposes for MCP), Lax so it
 * still rides top-level navigations, Secure in production where we're on https.
 */
export function sessionSetCookie(token: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ONE_YEAR_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

/**
 * Resolve the web user for a request, creating one on first visit. Returns the
 * user plus, when the browser should adopt a (new or switched) session, the
 * Set-Cookie value the route must send back.
 *
 * `clerkUserId` is the signed-in Clerk identity for this request, or null when
 * the visitor is anonymous. It layers on top of the cookie session:
 *
 * - **Anonymous** (no Clerk): resolve the cookie account, or mint one. Unchanged.
 * - **Signed in, Clerk already linked to an account**: that account is the
 *   stable one — return it, and re-point the cookie at it so this browser tracks
 *   it going forward (this is what makes the account follow you across devices).
 * - **Signed in, Clerk not linked yet**: claim the current cookie account (or a
 *   fresh one) by stamping the Clerk id onto it. The common "used it anonymously,
 *   then signed in" flow lands here and keeps the goals already in this browser.
 */
export async function resolveWebUser(
  pool: Pool,
  request: Request,
  clerkUserId: string | null
): Promise<{ user: User; setCookie: string | null }> {
  const token = readCookie(request, SESSION_COOKIE);
  const cookieUser = token ? await getUserBySession(pool, token) : null;

  if (clerkUserId) {
    const linked = await getUserByClerkId(pool, clerkUserId);
    if (linked) {
      // Stable account for this Clerk identity. Adopt it here; refresh the cookie
      // when this browser was on a different (or no) account.
      const setCookie =
        cookieUser?.id === linked.id ? null : sessionSetCookie(linked.sessionToken);
      return { user: linked, setCookie };
    }

    // First time we've seen this Clerk identity: claim the current account.
    const base = cookieUser ?? (await createUser(pool));
    await linkClerkUser(pool, base.id, clerkUserId);
    const setCookie = cookieUser ? null : sessionSetCookie(base.sessionToken);
    return { user: { ...base, clerkUserId }, setCookie };
  }

  if (cookieUser) return { user: cookieUser, setCookie: null };
  const user = await createUser(pool);
  return { user, setCookie: sessionSetCookie(user.sessionToken) };
}

// ---- e2e test user ----
//
// The e2e suite needs a deterministic user with the canonical fixed-id seed so
// it can navigate straight to `/goal/goal-podcast`. These are only ever used
// through the env-gated /api/test/reset route.

const TEST_USER = {
  id: "e2e-user",
  sessionToken: "e2e-session-token",
  pat: "e2e-pat-token",
};

/**
 * Ensure the e2e test user exists and reset their store to the canonical seed
 * (fixed ids, unlike real users). Returns the session token the fixture drops
 * into the browser so every test runs as this user.
 */
export async function resetTestUser(pool: Pool): Promise<{ sessionToken: string }> {
  await withTransaction(pool, async (client) => {
    const now = Date.now();
    await client.query(
      `INSERT INTO users (id, session_token, pat, goals_updated_at, created_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (id) DO UPDATE SET goals_updated_at = $4`,
      [TEST_USER.id, TEST_USER.sessionToken, TEST_USER.pat, now]
    );
    await client.query("DELETE FROM goals WHERE owner_id = $1", [TEST_USER.id]);
    await insertGoals(client, TEST_USER.id, seedGoals());
  });
  return { sessionToken: TEST_USER.sessionToken };
}
