"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { useStore } from "@/lib/store";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const syncStatus = useStore((s) => s.syncStatus);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-9">
      <div className="min-w-0 truncate text-sm text-muted-foreground">{crumbs}</div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        {showShare && (
          <Button variant="outline" size="sm" onClick={onShare}>
            Share
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          aria-label="Sync settings"
          className="relative"
        >
          <Settings className="h-4 w-4" />
          {/* A dot only once sync is in play — an offline app shows nothing. */}
          {syncStatus !== "off" && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full",
                syncStatus === "online" && "bg-primary",
                syncStatus === "syncing" && "animate-pulse bg-muted-foreground",
                syncStatus === "error" && "bg-destructive"
              )}
            />
          )}
        </Button>
        <Button size="sm" onClick={onNewGoal}>
          + New Goal
        </Button>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
