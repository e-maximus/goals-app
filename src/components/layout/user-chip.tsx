"use client";

import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { useMe } from "@/features/account";
import { useAuthSettled } from "@/hooks/use-auth-settled";

/**
 * Who you are, at a glance: the Clerk profile (name + picture) when signed in,
 * otherwise the account's generated animal identity (emoji + name). Links to
 * Settings, where the anonymous identity can be upgraded to a real account.
 *
 * The animal identity comes from the server render (see MeProvider), so it is
 * there on first paint — only the Clerk half resolves client-side.
 */
export function UserChip() {
  const { isLoaded, isSignedIn, user } = useUser();
  const me = useMe();
  const authSettled = useAuthSettled(isLoaded);

  // Clerk resolves the session client-side, a beat after the page renders.
  // Until it has, we don't know *which* identity to show — rendering the
  // anonymous one meanwhile would flash a stranger's name at a signed-in user
  // and then swap it. Hold a same-sized placeholder instead.
  const signedIn = isLoaded && isSignedIn && user;
  const name = signedIn ? (user.fullName ?? user.username ?? "Account") : me?.displayName;
  if (!authSettled || !name) return <UserChipSkeleton />;

  return (
    <Link
      href="/settings"
      aria-label="Account"
      className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-muted"
    >
      {signedIn && user.imageUrl ? (
        <Image
          src={user.imageUrl}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 rounded-full"
          unoptimized
        />
      ) : (
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-base"
        >
          {me?.avatar ?? "🙂"}
        </span>
      )}
      <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{name}</span>
      {!signedIn && (
        <span className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground sm:inline">
          Guest
        </span>
      )}
    </Link>
  );
}

/** The chip's footprint while the identity is still resolving. */
function UserChipSkeleton() {
  return (
    <div
      aria-hidden
      className="flex animate-pulse items-center gap-2 py-1 pl-1 pr-3"
      data-testid="user-chip-loading"
    >
      <span className="h-7 w-7 rounded-full bg-muted" />
      <span className="hidden h-3.5 w-24 rounded bg-muted sm:block" />
    </div>
  );
}
