import { randomBytes } from "node:crypto";
import { withTransaction, type Pool } from "./db";
import { uid } from "./domain";
import { insertGoals } from "./repo";
import { seedGoals, withFreshIds } from "./seed";

/**
 * Identity for the app. A user is just an id and two opaque tokens:
 *
 * - `sessionToken` rides in an httpOnly cookie and is how the web app is
 *   recognised across requests. It's never shown in the UI.
 * - `pat` is a personal access token the user copies into an MCP client and
 *   sends as `Authorization: Bearer <pat>`. It's shown in Settings.
 *
 * Neither token is the identity — `id` is, and it's what goals hang off — so
 * either can be rotated (see rotatePat) without the user losing anything.
 *
 * There is no password and no login: a first-time visitor is simply created,
 * seeded with the example goals, and handed a session cookie.
 */
export type User = {
  id: string;
  sessionToken: string;
  pat: string;
};

/** A URL-safe, unguessable token. 32 bytes of randomness, base64url encoded. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

type UserRow = { id: string; session_token: string; pat: string };

function toUser(row: UserRow): User {
  return { id: row.id, sessionToken: row.session_token, pat: row.pat };
}

/**
 * Create a brand-new user and seed them their own copy of the example goals,
 * all in one transaction. The seed is given fresh ids because goal ids are a
 * global primary key (see seed.withFreshIds).
 */
export async function createUser(pool: Pool): Promise<User> {
  return withTransaction(pool, async (client) => {
    const now = Date.now();
    const user: User = { id: uid(), sessionToken: newToken(), pat: newToken() };
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
    "SELECT id, session_token, pat FROM users WHERE session_token = $1",
    [sessionToken]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserByPat(pool: Pool, pat: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    "SELECT id, session_token, pat FROM users WHERE pat = $1",
    [pat]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * Issue the user a new personal access token, invalidating the old one. The
 * session and, crucially, the goals are untouched — only the MCP credential
 * changes. This is the "my token leaked" escape hatch.
 */
export async function rotatePat(pool: Pool, userId: string): Promise<string> {
  const pat = newToken();
  const { rowCount } = await pool.query("UPDATE users SET pat = $2 WHERE id = $1", [userId, pat]);
  if (!rowCount) throw new Error(`No such user: ${userId}`);
  return pat;
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
 * Resolve the web user from the session cookie, creating one on first visit.
 * Returns the user plus, when a new one was minted, the Set-Cookie value the
 * route must send back so the browser is recognised next time.
 */
export async function resolveWebUser(
  pool: Pool,
  request: Request
): Promise<{ user: User; setCookie: string | null }> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const existing = await getUserBySession(pool, token);
    if (existing) return { user: existing, setCookie: null };
  }
  const user = await createUser(pool);
  return { user, setCookie: sessionSetCookie(user.sessionToken) };
}

/** Resolve the MCP user from the Bearer token, or null if absent/unknown. */
export async function bearerUser(pool: Pool, request: Request): Promise<User | null> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return getUserByPat(pool, match[1]!.trim());
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
