"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/save-status";

export function Topbar({
  crumbs,
  onNewGoal,
  onShare = () => {},
  showShare = false,
}: {
  crumbs: React.ReactNode;
  onNewGoal: () => void;
  onShare?: () => void;
  showShare?: boolean;
}) {
  const saveStatus = useStore((s) => s.saveStatus);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-9">
      <div className="min-w-0 truncate text-sm text-muted-foreground">{crumbs}</div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <SaveStatus status={saveStatus} />
        {showShare && (
          <Button variant="outline" size="sm" onClick={onShare}>
            Share
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/settings" />}
          aria-label="Settings"
        >
          <Settings />
        </Button>
        <Button size="sm" onClick={onNewGoal}>
          + New Goal
        </Button>
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
