"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Settings } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/save-status";
import { fetchMe, type Me } from "@/lib/sync";
import { cn } from "@/lib/utils";

// The identity is per-session, not per-render — fetch it once and share the
// promise across every Topbar mount (each page renders its own).
let mePromise: Promise<Me> | null = null;
function getMe(): Promise<Me> {
  mePromise ??= fetchMe().catch((err) => {
    mePromise = null; // let a later mount retry
    throw err;
  });
  return mePromise;
}

/**
 * Who you are, at a glance: the Clerk profile (name + picture) when signed in,
 * otherwise the account's generated animal identity (emoji + name). Links to
 * Settings, where the anonymous identity can be upgraded to a real account.
 */
function UserChip() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [me, setMe] = useState<Me | null>(null);
  // Clerk failing to initialize (missing key, blocked script) leaves `isLoaded`
  // false forever. Give it a deadline so the chip falls back to the account's own
  // identity rather than pulsing for the rest of the session.
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe().then(
      (m) => {
        if (!cancelled) setMe(m);
      },
      () => {} // no identity chip is fine; Settings still works
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 8_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  // Clerk resolves the session client-side, a beat after /api/me answers. Until
  // it has, we don't know *which* identity to show — rendering the anonymous one
  // meanwhile would flash a stranger's name at a signed-in user and then swap it.
  // Hold a same-sized placeholder instead, so the chip settles in place.
  const signedIn = isLoaded && isSignedIn && user;
  const name = signedIn ? (user.fullName ?? user.username ?? "Account") : me?.displayName;
  if ((!isLoaded && !authTimedOut) || !name) return <UserChipSkeleton />;

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

/**
 * The primary site navigation — persistent on every page, rendered as plain
 * links rather than a segmented control. The active link is derived from the
 * current path, so no page has to declare which section it belongs to.
 */
function NavLinks() {
  const pathname = usePathname();
  const items: { href: string; label: string; active: boolean }[] = [
    { href: "/", label: "Home", active: pathname === "/" },
    {
      href: "/goals",
      label: "My Goals",
      active: pathname === "/goals" || pathname.startsWith("/goal/"),
    },
    { href: "/tasks", label: "Tasks", active: pathname === "/tasks" },
    { href: "/about", label: "About", active: pathname === "/about" },
  ];
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "rounded-md px-2 py-1.5 text-sm transition-colors sm:px-2.5",
            it.active
              ? "font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:text-foreground"
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The wordmark, home on every page. The footprints echo the app icon — the
 * mark is "one step at a time".
 */
function Brand() {
  return (
    <Link
      href="/"
      aria-label="Keep Going — home"
      className="flex flex-shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
    >
      <span aria-hidden className="text-lg leading-none">
        👣
      </span>
      <span className="hidden text-sm font-semibold text-foreground sm:block">Keep Going</span>
    </Link>
  );
}

export function Topbar() {
  const saveStatus = useStore((s) => s.saveStatus);

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-5 sm:px-9">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <Brand />
        <span aria-hidden className="h-5 w-px flex-shrink-0 bg-border" />
        <NavLinks />
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <SaveStatus status={saveStatus} />
        <UserChip />
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/settings" />}
          aria-label="Settings"
        >
          <Settings />
        </Button>
      </div>
    </header>
  );
}

export function Crumbs({
  page,
  root = "My Goals",
}: {
  /** The second segment — a goal title, "Settings", "About"… */
  page?: string;
  /**
   * The top-level label the page hangs under — "My Goals" on goal pages,
   * "My Tasks" on /tasks. Pass `null` for a standalone page (About, Settings…)
   * that belongs to no section, so the crumb is just its own name.
   */
  root?: string | null;
}) {
  if (!page) {
    return <span className="font-semibold text-foreground">{root}</span>;
  }
  if (root === null) {
    return <span className="font-semibold text-foreground">{page}</span>;
  }
  return (
    <span>
      <Link href="/goals" className="transition-colors hover:text-foreground">
        {root}
      </Link>{" "}
      / <span className="font-semibold text-foreground">{page}</span>
    </span>
  );
}
