import "server-only";
import { randomBytes } from "node:crypto";
import { withTransaction, type Pool } from "./db";
import { uid } from "./domain";
import { insertGoals } from "./repo";
import { seedGoals, starterGoals, withFreshIds } from "./seed";

/**
 * The friendly face an anonymous account wears in the topbar. Rather than a
 * fixed set of pairings, a name is composed at creation from a random adjective
 * and a random animal (e.g. "Swift Lynx"), with the emoji taken from the chosen
 * animal. Name and avatar are minted together and stored on the row; a signed-in
 * user is shown their Clerk profile instead, but every account has one.
 */
export const ADJECTIVES: readonly string[] = [
  "Shiny",
  "Bright",
  "Quiet",
  "Swift",
  "Calm",
  "Bold",
  "Sunny",
  "Brave",
  "Gentle",
  "Curious",
  "Steady",
  "Merry",
  "Wise",
  "Clever",
  "Nimble",
  "Cheery",
  "Mighty",
  "Humble",
];

export const ANIMALS: readonly { name: string; avatar: string }[] = [
  { name: "Fox", avatar: "🦊" },
  { name: "Capybara", avatar: "🦫" },
  { name: "Owl", avatar: "🦉" },
  { name: "Otter", avatar: "🦦" },
  { name: "Panda", avatar: "🐼" },
  { name: "Tiger", avatar: "🐯" },
  { name: "Koala", avatar: "🐨" },
  { name: "Penguin", avatar: "🐧" },
  { name: "Whale", avatar: "🐋" },
  { name: "Lynx", avatar: "🐱" },
  { name: "Tortoise", avatar: "🐢" },
  { name: "Dolphin", avatar: "🐬" },
  { name: "Badger", avatar: "🦡" },
  { name: "Raven", avatar: "🐦" },
  { name: "Hedgehog", avatar: "🦔" },
  { name: "Rabbit", avatar: "🐰" },
];

/** Compose a fresh identity: a random adjective and animal, the emoji following
 *  the animal. */
export function randomIdentity(): { name: string; avatar: string } {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
  return { name: `${adjective} ${animal.name}`, avatar: animal.avatar };
}

/**
 * Identity for the app. A user is an id plus the keys that resolve to it:
 *
 * - `sessionToken` rides in an httpOnly cookie and is how the web app is
 *   recognised across requests. It's never shown in the UI.
 * - `clerkUserId` is the linked Clerk identity, set when the user signs in. It's
 *   what authorizes the **MCP** endpoint: an agent authenticates with a Clerk
 *   OAuth token, and we resolve that identity back to this account.
 * - `email` is the verified primary address of that Clerk identity, kept as a
 *   *recovery* key behind it. A Clerk user that is deleted and signed up again
 *   comes back with a new `clerkUserId`, which would orphan this account; the
 *   email matches it back. Never written unverified — see server/clerk-email.ts.
 *
 * Neither key is the identity — `id` is, and it's what goals hang off — so the
 * session can be reissued and the Clerk link is a durable second key on top.
 * (There used to be a third: `pat`, a personal access token pasted into an MCP
 * client. MCP is Clerk-authorized now, and the column is gone — see migration
 * 013_drop_pat.)
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
 */
export type User = {
  id: string;
  sessionToken: string;
  /** The linked Clerk identity, or null while the account is purely anonymous. */
  clerkUserId: string | null;
  /** Verified primary email of the linked Clerk identity; null until linked. */
  email: string | null;
  /** Generated adjective-animal name, e.g. "Shiny Fox". */
  displayName: string | null;
  /** Emoji matching the display name, e.g. "🦊". */
  avatar: string | null;
};

/** A URL-safe, unguessable token. 32 bytes of randomness, base64url encoded. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

type UserRow = {
  id: string;
  session_token: string;
  clerk_user_id: string | null;
  email: string | null;
  display_name: string | null;
  avatar: string | null;
};

const USER_COLS = "id, session_token, clerk_user_id, email, display_name, avatar";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    sessionToken: row.session_token,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar,
  };
}

/**
 * How a caller supplies the signed-in identity's verified email — lazily,
 * because it costs a Clerk API round trip. It is awaited only on the paths that
 * actually need it: a `clerk_user_id` miss (where it's the recovery key) and the
 * first link (where it's recorded for later). Optional throughout, so a caller
 * without Clerk on hand — the server tests, which run against a real Postgres —
 * simply omits it and the fallback stays inert.
 */
export type EmailResolver = () => Promise<string | null>;

/** Normalize before it's ever stored or matched, so case can't split an identity. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function resolveEmail(fetchEmail?: EmailResolver): Promise<string | null> {
  const email = await fetchEmail?.();
  return email ? normalizeEmail(email) : null;
}

/**
 * Create a brand-new user — with a generated animal identity — and seed them
 * the starter goal, all in one transaction. The seed is given fresh ids
 * because goal ids are a global primary key (see seed.withFreshIds).
 */
export async function createUser(pool: Pool): Promise<User> {
  return withTransaction(pool, async (client) => {
    const now = Date.now();
    const identity = randomIdentity();
    const user: User = {
      id: uid(),
      sessionToken: newToken(),
      clerkUserId: null,
      email: null,
      displayName: identity.name,
      avatar: identity.avatar,
    };
    await client.query(
      `INSERT INTO users (id, session_token, goals_updated_at, created_at, display_name, avatar)
       VALUES ($1, $2, $3, $3, $4, $5)`,
      [user.id, user.sessionToken, now, user.displayName, user.avatar]
    );
    await insertGoals(client, user.id, withFreshIds(starterGoals()));
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
 * Resolve the account holding this verified email, or null. The recovery key
 * behind getUserByClerkId — consulted only when that one misses.
 */
export async function getUserByEmail(pool: Pool, email: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE email = $1`, [
    normalizeEmail(email),
  ]);
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * Record the verified email on an account, so a future Clerk id can find it.
 * Best-effort by design: if another account already holds the address this
 * no-ops rather than violating the UNIQUE constraint and failing the request the
 * user actually made. Losing a recovery key is recoverable; a 500 on every load
 * is not — and the caller has already resolved a real account by then.
 */
export async function setUserEmail(pool: Pool, userId: string, email: string): Promise<void> {
  await pool.query(
    `UPDATE users SET email = $2
      WHERE id = $1
        AND NOT EXISTS (SELECT 1 FROM users other WHERE other.email = $2 AND other.id <> $1)`,
    [userId, normalizeEmail(email)]
  );
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
 * Attach the Clerk identity *and* its verified email to an account in one step —
 * the shape every resolve path wants once it has picked the account. The email
 * is only touched when one was resolved, so a caller without Clerk on hand can't
 * blank out an address already on the row.
 */
async function claimAccount(
  pool: Pool,
  userId: string,
  clerkUserId: string,
  email: string | null
): Promise<void> {
  await linkClerkUser(pool, userId, clerkUserId);
  if (email) await setUserEmail(pool, userId, email);
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
export async function getOrCreateUserByClerkId(
  pool: Pool,
  clerkUserId: string,
  fetchEmail?: EmailResolver
): Promise<User> {
  const existing = await getUserByClerkId(pool, clerkUserId);
  if (existing) {
    // Backfill the recovery key for accounts linked before it existed, so the
    // *next* Clerk deletion is recoverable. One round trip, once per account.
    if (!existing.email) {
      const email = await resolveEmail(fetchEmail);
      if (email) {
        await setUserEmail(pool, existing.id, email);
        return { ...existing, email };
      }
    }
    return existing;
  }

  // No account for this Clerk id. Before minting one, check whether this is a
  // known identity wearing a new Clerk id — the deleted-and-signed-up-again case.
  const email = await resolveEmail(fetchEmail);
  if (email) {
    const byEmail = await getUserByEmail(pool, email);
    if (byEmail) {
      await linkClerkUser(pool, byEmail.id, clerkUserId);
      return { ...byEmail, clerkUserId };
    }
  }

  const user = await createUser(pool);
  await claimAccount(pool, user.id, clerkUserId, email);
  return { ...user, clerkUserId, email };
}

/**
 * Resolve the user for an RSC initial render — read-only, with none of
 * resolveWebUser's side effects. A Server Component can't mint an account (it
 * can't set the session cookie), so this only *looks up* an existing user: the
 * Clerk-linked account when signed in, else the session-cookie account, else
 * null (a brand-new visitor, whom the client's first load will mint).
 */
export async function resolveWebUserReadonly(
  pool: Pool,
  sessionToken: string | undefined,
  clerkUserId: string | null,
  fetchEmail?: EmailResolver
): Promise<User | null> {
  if (clerkUserId) {
    const linked = await getUserByClerkId(pool, clerkUserId);
    if (linked) return linked;
    // Same recovery as resolveWebUser, minus the re-link: this path may not
    // write. Returning the matched account still renders the right goals, and
    // the first mutating request re-links it for good.
    const email = await resolveEmail(fetchEmail);
    if (email) {
      const byEmail = await getUserByEmail(pool, email);
      if (byEmail) return byEmail;
    }
  }
  if (sessionToken) return getUserBySession(pool, sessionToken);
  return null;
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
 * session token — nothing in the UI ever exposes it — Lax so it
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
 * - **Signed in, Clerk id unknown but the verified email matches an account**:
 *   the same person under a new Clerk id (deleted in Clerk, signed up again).
 *   Re-link that account and adopt it — ahead of the cookie account, because the
 *   email-matched one is the durable identity while a cookie is per-browser.
 * - **Signed in, Clerk not linked yet**: claim the current cookie account (or a
 *   fresh one) by stamping the Clerk id onto it. The common "used it anonymously,
 *   then signed in" flow lands here and keeps the goals already in this browser.
 */
export async function resolveWebUser(
  pool: Pool,
  request: Request,
  clerkUserId: string | null,
  fetchEmail?: EmailResolver
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
      if (!linked.email) {
        const email = await resolveEmail(fetchEmail);
        if (email) {
          await setUserEmail(pool, linked.id, email);
          return { user: { ...linked, email }, setCookie };
        }
      }
      return { user: linked, setCookie };
    }

    const email = await resolveEmail(fetchEmail);
    if (email) {
      const byEmail = await getUserByEmail(pool, email);
      if (byEmail) {
        await linkClerkUser(pool, byEmail.id, clerkUserId);
        const setCookie =
          cookieUser?.id === byEmail.id ? null : sessionSetCookie(byEmail.sessionToken);
        return { user: { ...byEmail, clerkUserId }, setCookie };
      }
    }

    // First time we've seen this Clerk identity: claim the current account.
    const base = cookieUser ?? (await createUser(pool));
    await claimAccount(pool, base.id, clerkUserId, email);
    const setCookie = cookieUser ? null : sessionSetCookie(base.sessionToken);
    return { user: { ...base, clerkUserId, email: email ?? base.email }, setCookie };
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
      `INSERT INTO users (id, session_token, goals_updated_at, created_at, display_name, avatar)
       VALUES ($1, $2, $3, $3, 'Shiny Fox', '🦊')
       ON CONFLICT (id) DO UPDATE SET goals_updated_at = $3, display_name = 'Shiny Fox', avatar = '🦊'`,
      [TEST_USER.id, TEST_USER.sessionToken, now]
    );
    await client.query("DELETE FROM goals WHERE owner_id = $1", [TEST_USER.id]);
    await client.query("DELETE FROM tasks WHERE owner_id = $1", [TEST_USER.id]);
    // The canonical seed's ids are global PKs, and the server test suite plants
    // the same fixture ids (goal-podcast, …) under its own throwaway owners in
    // the same test database. Clear any strays so the re-seed can't collide.
    // Positional placeholders (rather than `= ANY($1)`) keep this a plain
    // scalar-parameter query, which the Prisma raw interface binds directly.
    const seedIds = seedGoals().map((g) => g.id);
    const placeholders = seedIds.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(`DELETE FROM goals WHERE id IN (${placeholders})`, seedIds);
    await insertGoals(client, TEST_USER.id, seedGoals());
  });
  return { sessionToken: TEST_USER.sessionToken };
}
