"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { checkHealth, normalizeApiUrl } from "@/lib/sync";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Probe = { state: "idle" | "checking" | "reachable" | "unreachable" };

/**
 * Point the app at a goals server, or disconnect from one.
 *
 * Sync is entirely opt-in. With no server configured the app is offline-only,
 * exactly as it has always been — goals live in this browser and nowhere else.
 * With a server configured, the goals become shared state that an agent can
 * also read and write over MCP.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const syncUrl = useStore((s) => s.syncUrl);
  const syncStatus = useStore((s) => s.syncStatus);
  const connectSync = useStore((s) => s.connectSync);
  const disconnectSync = useStore((s) => s.disconnectSync);

  const [value, setValue] = useState(syncUrl ?? "http://localhost:8787");
  const [probe, setProbe] = useState<Probe>({ state: "idle" });

  // Reset the field whenever the dialog opens, matching PromptDialog's pattern.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(syncUrl ?? "http://localhost:8787");
      setProbe({ state: "idle" });
    }
  }

  const test = async () => {
    setProbe({ state: "checking" });
    const ok = await checkHealth(value);
    setProbe({ state: ok ? "reachable" : "unreachable" });
  };

  const connect = async () => {
    await connectSync(value);
    onOpenChange(false);
  };

  const disconnect = () => {
    disconnectSync();
    onOpenChange(false);
  };

  const trimmed = normalizeApiUrl(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync settings</DialogTitle>
          <DialogDescription>
            Connect to a goals server to share your goals with an assistant over MCP. Leave
            this empty and the app keeps everything in this browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-url">Server address</Label>
            <Input
              id="api-url"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setProbe({ state: "idle" });
              }}
              placeholder="http://localhost:8787"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              The address the server prints on start-up — <code>docker compose up</code>{" "}
              serves it on port 8787.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={test}
              disabled={!trimmed || probe.state === "checking"}
            >
              {probe.state === "checking" ? "Testing…" : "Test connection"}
            </Button>

            {probe.state === "reachable" && (
              <span className="text-[13px] font-semibold text-primary">Server reachable</span>
            )}
            {probe.state === "unreachable" && (
              <span className="text-[13px] font-semibold text-destructive">
                No goals server at that address
              </span>
            )}
          </div>

          <StatusRow status={syncStatus} syncUrl={syncUrl} />
        </div>

        <DialogFooter>
          {syncUrl && (
            <Button type="button" variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          )}
          <Button type="button" onClick={connect} disabled={!trimmed}>
            {syncUrl ? "Save" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusRow({
  status,
  syncUrl,
}: {
  status: "off" | "syncing" | "online" | "error";
  syncUrl: string | null;
}) {
  const label = {
    off: "Not connected — goals stay in this browser",
    syncing: "Syncing…",
    online: "Connected",
    error: "Connection problem — working from this device's copy",
  }[status];

  const dot = {
    off: "bg-muted-foreground/40",
    syncing: "bg-muted-foreground animate-pulse",
    online: "bg-primary",
    error: "bg-destructive",
  }[status];

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", dot)} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{label}</div>
        {syncUrl && status !== "off" && (
          <div className="truncate text-xs text-muted-foreground">{syncUrl}</div>
        )}
      </div>
    </div>
  );
}
