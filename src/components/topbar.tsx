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

/**
 * The Goals | Tasks switcher, shown on the two top-level pages. Detail pages
 * keep the breadcrumb alone — the tabs only make sense at the top level.
 */
function NavTabs({ active }: { active: "goals" | "tasks" }) {
  const tab = (value: "goals" | "tasks", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === value ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1 text-sm font-semibold transition-colors",
        active === value
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Sections" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {tab("goals", "/", "Goals")}
      {tab("tasks", "/tasks", "Tasks")}
    </nav>
  );
}

export function Topbar({ crumbs, tab }: { crumbs: React.ReactNode; tab?: "goals" | "tasks" }) {
  const saveStatus = useStore((s) => s.saveStatus);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-5 sm:px-9">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0 truncate text-sm text-muted-foreground">{crumbs}</div>
        {tab && <NavTabs active={tab} />}
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
  goalTitle,
  root = "My Goals",
}: {
  goalTitle?: string;
  /** The top-level label — "My Goals" on goal pages, "My Tasks" on /tasks. */
  root?: string;
}) {
  if (!goalTitle) {
    return <span className="font-semibold text-foreground">{root}</span>;
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
