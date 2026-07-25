/**
 * The current user's identity, as the topbar chip, the home greeting and the
 * Settings page need it. `clerkUserId` is the linked Clerk identity, or null
 * while the account is purely anonymous; `displayName`/`avatar` are the
 * generated animal identity every account carries.
 *
 * The session token is deliberately absent — it's httpOnly and never meant to
 * leave the cookie. MCP is authorized via Clerk OAuth, so there is no token for
 * the user to copy either.
 */
export type Me = {
  userId: string;
  clerkUserId: string | null;
  displayName: string | null;
  avatar: string | null;
};
