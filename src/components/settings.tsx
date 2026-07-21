"use client";

import { useCallback, useEffect, useState } from "react";
import { Show, SignInButton, SignOutButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Check, Copy, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { PageShell, Crumbs } from "@/components/page-shell";
import { fetchMe, type Me } from "@/lib/sync";
import { LoadingState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // The MCP endpoint is same-origin; resolve it on the client so it's correct
  // wherever the app is deployed. Read once at mount — it never changes, and the
  // origin-dependent UI only renders after the load below, so there's no SSR
  // markup to mismatch.
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  // Clerk sign-in state. Signing in can switch which account /api/me resolves to
  // (the linked one), so we re-fetch identity whenever it changes.
  const { isLoaded: authLoaded, isSignedIn } = useUser();

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

  // Load on mount, and reload once Clerk resolves / the sign-in state flips, so
  // the account and MCP token reflect the identity the server now sees.
  useEffect(() => {
    if (!authLoaded) return;
    loadMe();
  }, [authLoaded, isSignedIn, loadMe]);

  // Clerk failing to initialize (missing publishable key, blocked script) leaves
  // `isLoaded` false forever, and the effect above never fires — without a
  // deadline the page would sit on the loader indefinitely. Give up after a
  // while and surface the error state. Guard against a stale timer overwriting
  // a load that succeeded in the meantime (e.g. after a manual retry).
  useEffect(() => {
    if (authLoaded) return;
    const timer = setTimeout(
      () => setStatus((s) => (s === "loading" ? "error" : s)),
      8_000
    );
    return () => clearTimeout(timer);
  }, [authLoaded]);

  return (
    <PageShell crumbs={<Crumbs page="Settings" root={null} />} width="sm">
      <div className="space-y-6">
        {status === "loading" ? (
          <LoadingState />
        ) : status === "error" ? (
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
            {me.clerkUserId === null && <TemporarySessionWarning />}
            <AccountCard me={me} />
            <StableAuthCard />
            <McpCard endpoint={`${origin}/api/mcp`} />
          </>
        ) : null}
      </div>
    </PageShell>
  );
}

/**
 * The honest warning an anonymous visitor needs: their whole account hangs off
 * a browser cookie. Shown above everything else so it can't be missed; the
 * fix (signing in) is one card below.
 */
function TemporarySessionWarning() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning/60 bg-warning/10 px-5 py-4">
      <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Temporary session</p>
        <p className="text-[13px] text-muted-foreground">
          Your user ID and session live in this browser&apos;s cookie. If the cookie is cleared —
          private mode ends, browser data is wiped, or you switch devices — this account and all
          its goals are gone for good. Create an account below to keep them.
        </p>
      </div>
    </div>
  );
}

function AccountCard({ me }: { me: Me }) {
  const linked = me.clerkUserId !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {me.avatar && (
            <span aria-hidden className="text-base">
              {me.avatar}
            </span>
          )}
          Account
        </CardTitle>
        <CardDescription>
          {linked
            ? "This account is linked to your sign-in, so it follows you across browsers and devices."
            : `You're using this app anonymously as ${me.displayName ?? "a guest"} — this browser is your account, and your goals are private to it.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <FieldLabel>User ID</FieldLabel>
        <CopyRow value={me.userId} />
      </CardContent>
    </Card>
  );
}

/**
 * The optional upgrade: link a Clerk identity to this account. Signed out, it
 * pitches the benefit and offers sign in / sign up. Signed in, it confirms the
 * link and hands over the Clerk user button (manage account, sign out).
 */
function StableAuthCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Sign in
        </CardTitle>
        <CardDescription>
          Sign in to give this account a durable identity. It keeps your goals if this browser&apos;s
          cookie is cleared, lets you pick them up on another device, and unlocks features that need
          a real account — MCP access, and AI chat soon.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Show when="signed-out">
          <div className="flex flex-wrap items-center gap-2">
            <SignInButton mode="modal">
              <Button size="sm">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm" variant="outline">
                Create account
              </Button>
            </SignUpButton>
          </div>
        </Show>
        <Show when="signed-in">
          <div className="flex flex-wrap items-center gap-3">
            <UserButton />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              You&apos;re signed in. This account is now yours to keep.
            </p>
            <SignOutButton>
              <Button size="sm" variant="outline">
                Sign out
              </Button>
            </SignOutButton>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}

function McpCard({ endpoint }: { endpoint: string }) {
  const cliSnippet = `claude mcp add --transport http goals ${endpoint}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP access</CardTitle>
        <CardDescription>
          Connect an agent (Claude Desktop, Claude Code, Cursor…) to read and edit these goals.
          Access is authorized with your sign-in over OAuth — there&apos;s no token to copy or leak.
        </CardDescription>
      </CardHeader>

      {/* MCP is authorized only via Clerk sign-in: the OAuth flow needs a real
          identity, so there's nothing to set up while signed out. */}
      <Show when="signed-out">
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5">
            <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Sign in above to enable MCP access.
              </p>
              <SignInButton mode="modal">
                <Button size="sm" variant="outline">
                  Sign in to enable
                </Button>
              </SignInButton>
            </div>
          </div>
        </CardContent>
      </Show>

      <Show when="signed-in">
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <FieldLabel>Endpoint</FieldLabel>
            <CopyRow value={endpoint} />
          </div>

          <div className="space-y-2">
            <FieldLabel>Add to Claude Code</FieldLabel>
            <CopyRow value={cliSnippet} mono />
          </div>

          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Adding the endpoint in an MCP client (or pasting it as a connector in the Claude app)
            opens a sign-in prompt — approve it once and the client stays connected. Revoke access
            anytime by signing the app out from your account.
          </p>
        </CardContent>
      </Show>
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
