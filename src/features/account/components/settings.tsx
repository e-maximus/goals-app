"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Show,
  SignInButton,
  SignOutButton,
  SignUpButton,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import { toast } from "sonner";
import {
  Check,
  Cloud,
  Cookie,
  Copy,
  Lock,
  ShieldCheck,
  Smartphone,
  Terminal,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { fetchMe, type Me } from "@/lib/sync";
import { LoadingState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** The signed-in Clerk user, as `useUser()` exposes it once resolved. */
type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;

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
  const { isLoaded, isSignedIn, user } = useUser();

  // Clerk failing to initialize (missing key, blocked script) leaves `isLoaded`
  // false forever. Give it a deadline so the page falls back to the guest view
  // rather than showing the loader for the rest of the session.
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 8_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

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

  // Load on mount, and reload when the sign-in state flips, so the account and
  // MCP token reflect the identity the server now sees.
  useEffect(() => {
    loadMe();
  }, [isSignedIn, loadMe]);

  const signedIn = Boolean(isLoaded && isSignedIn && user);
  const authResolved = isLoaded || authTimedOut;

  return (
    <PageShell width="sm">
      <div className="space-y-6">
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <h2 className="text-xl font-bold">Couldn&apos;t load your settings</h2>
            <p className="text-sm text-muted-foreground">
              The server didn&apos;t respond. Check your connection and try again.
            </p>
            <Button variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : status === "loading" || !authResolved ? (
          <LoadingState />
        ) : me ? (
          <>
            {signedIn && user ? (
              <SignedInAccountCard user={user} me={me} />
            ) : (
              <>
                <GuestHero />
                <GuestIdentityStrip me={me} />
              </>
            )}
            <McpCard endpoint={`${origin}/api/mcp`} />
          </>
        ) : null}
      </div>
    </PageShell>
  );
}

/**
 * The guest pitch: a signed-out visitor's whole account hangs off a browser
 * cookie. Leads the page so the fix (signing in) is the first thing seen, and
 * spells out honestly what a temporary account can and can't do.
 */
function GuestHero() {
  return (
    <Card className="bg-secondary/40 ring-primary/15">
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-medium tracking-tight">
              Save your goals — sign in
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Right now this account lives only in this browser&apos;s cookie. Sign in to make it
              durable, reach it from any device, and unlock MCP access and AI chat.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SignInButton mode="modal">
            <Button size="sm">Sign in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" variant="outline">
              Create account
            </Button>
          </SignUpButton>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill icon={Smartphone}>Any device</Pill>
          <Pill icon={Cookie}>Survives cleared cookies</Pill>
          <Pill icon={Terminal}>MCP + AI chat</Pill>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The guest's identity, shown for what it is: a generated animal name pinned to
 * a temporary, cookie-scoped id. The id is copyable so it can be quoted in a
 * bug report, but there's nothing to edit until they sign in.
 */
function GuestIdentityStrip({ me }: { me: Me }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-secondary text-xl"
        >
          {me.avatar ?? "🙂"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{me.displayName ?? "Guest"}</span>
            <GuestBadge />
          </div>
          <p className="truncate text-[13px] text-muted-foreground">
            Temporary identity · <code className="font-mono text-xs">{me.userId}</code>
          </p>
        </div>
        <CopyIdButton value={me.userId} />
      </CardContent>
    </Card>
  );
}

/**
 * The signed-in account, all in one card: who you are, that it's saved, your
 * name (editable for email accounts, provider-owned for OAuth), your user id,
 * and the account actions.
 */
function SignedInAccountCard({ user, me }: { user: ClerkUser; me: Me }) {
  const { openUserProfile } = useClerk();
  // An OAuth account (Google/GitHub) carries an external account and owns the
  // name; a plain email sign-up has none, so the name is ours to edit.
  const oauthProvider = oauthProviderLabel(user);
  const editable = !oauthProvider;

  const [first, setFirst] = useState(user.firstName ?? "");
  const [last, setLast] = useState(user.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = first !== (user.firstName ?? "") || last !== (user.lastName ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await user.update({ firstName: first.trim(), lastName: last.trim() });
      toast.success("Name updated");
    } catch {
      toast.error("Couldn't update your name");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-4">
          <AccountAvatar user={user} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg font-medium tracking-tight">You&apos;re signed in</h2>
              {oauthProvider ? (
                <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-semibold text-background">
                  via {oauthProvider}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary-foreground">
                  <Check className="h-2.5 w-2.5" aria-hidden />
                  Saved
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {oauthProvider
                ? `Your goals are tied to your ${oauthProvider} account. Sign in with ${oauthProvider} on any device to pick them up right where you left off.`
                : "This account is yours to keep — sign in with the same email on any browser or device to pick these goals up right where you left off."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill icon={Smartphone}>Synced to any device</Pill>
          <Pill icon={Cloud}>Backed up</Pill>
          <Pill icon={Terminal}>MCP enabled</Pill>
        </div>

        <Divider />

        {editable ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>First name</FieldLabel>
              <Input
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                aria-label="First name"
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Last name</FieldLabel>
              <Input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                aria-label="Last name"
                autoComplete="family-name"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>First name</FieldLabel>
                <Input value={user.firstName ?? ""} disabled readOnly aria-label="First name" />
              </div>
              <div className="space-y-2">
                <FieldLabel>Last name</FieldLabel>
                <Input value={user.lastName ?? ""} disabled readOnly aria-label="Last name" />
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              Managed by your {oauthProvider} sign-in.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <FieldLabel>User ID</FieldLabel>
          <CopyRow value={me.userId} mono />
        </div>

        <Divider />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
            Manage account
          </Button>
          <span className="flex-1" />
          <SignOutButton>
            <Button variant="outline" size="sm">
              Sign out
            </Button>
          </SignOutButton>
          {editable && (
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The signed-in avatar: the Clerk profile picture, or a fallback glyph. */
function AccountAvatar({ user }: { user: ClerkUser }) {
  if (user.imageUrl) {
    return (
      <Image
        src={user.imageUrl}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 flex-none rounded-full"
        unoptimized
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[oklch(0.5_0.19_280)] text-white"
    >
      <User className="h-6 w-6" />
    </span>
  );
}

/**
 * The human label for the OAuth provider a signed-in user came in through, or
 * null for a plain email account (no external account to speak of).
 */
function oauthProviderLabel(user: ClerkUser): string | null {
  const provider = user.externalAccounts[0]?.provider;
  if (!provider) return null;
  // Clerk provider slugs look like "google" / "github" (older ones "oauth_*").
  const slug = provider.replace(/^oauth_/, "");
  const labels: Record<string, string> = { google: "Google", github: "GitHub" };
  return labels[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
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

/** A small green-tinted benefit pill with a leading icon. */
function Pill({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-primary/15">
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}

/** The amber "Guest" chip that marks a temporary, cookie-scoped identity. */
function GuestBadge() {
  return (
    <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-warning-foreground">
      Guest
    </span>
  );
}

function Divider() {
  return <div className="h-px bg-border" />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{children}</p>
  );
}

/** A standalone copy button for the guest id: copies, then flips to a check. */
function CopyIdButton({ value }: { value: string }) {
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
  return (
    <Button variant="outline" size="sm" onClick={copy} className="flex-none">
      {copied ? <Check /> : <Copy />}
      Copy ID
    </Button>
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
