"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { fetchMe, rotateToken } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
type Me = { userId: string; pat: string };

export function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // The MCP endpoint is same-origin; resolve it on the client so it's correct
  // wherever the app is deployed. Read once at mount — it never changes, and the
  // origin-dependent UI only renders after the load below, so there's no SSR
  // markup to mismatch.
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  // Fetch identity, settling state from the promise's callbacks — the state is
  // updated in response to an external system resolving, not synchronously.
  const loadMe = useCallback(() => {
    fetchMe().then(
      (m) => {
        setMe(m);
        setStatus("ready");
      },
      () => setStatus("error")
    );
  }, []);

  const retry = () => {
    setStatus("loading");
    loadMe();
  };

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center border-b border-border px-5 sm:px-9">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          My Goals
        </Link>
        <span className="mx-3 text-muted-foreground">/</span>
        <span className="text-sm font-semibold text-foreground">Settings</span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-5 py-8 sm:px-10">
        {status === "loading" ? null : status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <h2 className="text-xl font-bold">Couldn&apos;t load your settings</h2>
            <p className="text-sm text-muted-foreground">
              The server didn&apos;t respond. Check your connection and try again.
            </p>
            <Button variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : me ? (
          <>
            <AccountCard userId={me.userId} />
            <McpCard endpoint={`${origin}/api/mcp`} token={me.pat} onRotated={(pat) => setMe({ ...me, pat })} />
          </>
        ) : null}
      </main>
    </div>
  );
}

function AccountCard({ userId }: { userId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          You&apos;re signed in anonymously — this browser is your account. Your goals are private
          to it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <FieldLabel>User ID</FieldLabel>
        <CopyRow value={userId} />
      </CardContent>
    </Card>
  );
}

function McpCard({
  endpoint,
  token,
  onRotated,
}: {
  endpoint: string;
  token: string;
  onRotated: (pat: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  const cliSnippet = `claude mcp add --transport http goals ${endpoint} --header "Authorization: Bearer ${token}"`;

  const rotate = async () => {
    setRotating(true);
    try {
      const pat = await rotateToken();
      onRotated(pat);
      setRevealed(true);
      toast.success("New MCP token issued", {
        description: "The old token no longer works. Update your MCP clients.",
      });
    } catch {
      toast.error("Couldn't rotate the token", { description: "Please try again." });
    } finally {
      setRotating(false);
      setConfirmOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP access</CardTitle>
        <CardDescription>
          Connect an agent (Claude Code, Claude Desktop, Cursor…) to read and edit these goals.
          The token authenticates as you — treat it like a password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <FieldLabel>Endpoint</FieldLabel>
          <CopyRow value={endpoint} />
        </div>

        <div className="space-y-2">
          <FieldLabel>Token</FieldLabel>
          <CopyRow
            value={token}
            masked={!revealed}
            trailing={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? "Hide token" : "Show token"}
              >
                {revealed ? <EyeOff /> : <Eye />}
              </Button>
            }
          />
        </div>

        <div className="space-y-2">
          <FieldLabel>Add to Claude Code</FieldLabel>
          <CopyRow value={cliSnippet} mono />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Leaked the token? Rotate it — your goals stay, old token stops working.
          </p>
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            <RefreshCw />
            Rotate token
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rotate MCP token?</DialogTitle>
            <DialogDescription>
              A new token will be issued and the current one will stop working immediately. Any MCP
              client using the old token will need to be updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={rotating}>
              Cancel
            </Button>
            <Button onClick={rotate} disabled={rotating}>
              {rotating ? "Rotating…" : "Rotate token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{children}</p>
  );
}

/** A read-only value with a copy button, and optional masking / trailing control. */
function CopyRow({
  value,
  masked = false,
  mono = false,
  trailing,
}: {
  value: string;
  masked?: boolean;
  mono?: boolean;
  trailing?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }, [value]);

  const display = masked ? "•".repeat(Math.min(value.length, 44)) : value;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <code className={`min-w-0 flex-1 truncate text-xs ${mono ? "font-mono" : ""}`}>{display}</code>
      {trailing}
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy">
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
