"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { Settings } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/save-status";
import { fetchMe, type Me } from "@/lib/sync";

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

  const signedIn = isLoaded && isSignedIn && user;
  const name = signedIn ? (user.fullName ?? user.username ?? "Account") : me?.displayName;
  if (!name) return null;

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

export function Topbar({
  crumbs,
  onNewGoal,
}: {
  crumbs: React.ReactNode;
  /** Renders the "+ New Goal" button when provided — the dashboard only. */
  onNewGoal?: () => void;
}) {
  const saveStatus = useStore((s) => s.saveStatus);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-9">
      <div className="min-w-0 truncate text-sm text-muted-foreground">{crumbs}</div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <SaveStatus status={saveStatus} />
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/settings" />}
          aria-label="Settings"
        >
          <Settings />
        </Button>
        {onNewGoal && (
          <Button size="sm" onClick={onNewGoal}>
            + New Goal
          </Button>
        )}
        <UserChip />
      </div>
    </header>
  );
}

export function Crumbs({
  goalTitle,
}: {
  goalTitle?: string;
}) {
  if (!goalTitle) {
    return <span className="font-semibold text-foreground">My Goals</span>;
  }
  return (
    <span>
      <Link href="/" className="transition-colors hover:text-foreground">
        My Goals
      </Link>{" "}
      / <span className="font-semibold text-foreground">{goalTitle}</span>
    </span>
  );
}
