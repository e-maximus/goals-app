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
  const { isSignedIn } = useUser();

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
  // MCP token reflect the identity the server now sees. Deliberately NOT gated
  // on Clerk finishing loading: if clerk-js never initializes (missing/
  // misconfigured publishable key, blocked script) its `isLoaded` stays false
  // forever, and the page must still show the account rather than hang blank.
  useEffect(() => {
    loadMe();
  }, [isSignedIn, loadMe]);

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
            ? "You're signed in — sign in with the same email on any browser or device to get back to these goals."
            : `You're using this app anonymously as ${me.displayName ?? "a guest"} — your account lives only in this browser's cookie, and your goals are tied to it.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AccountNameFields me={me} />
        <div className="space-y-2">
          <FieldLabel>User ID</FieldLabel>
          <CopyRow value={me.userId} />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * First and last name for the account. Where they come from — and whether they
 * can be changed — depends on how the account was authenticated:
 *
 * - **Anonymous** (no Clerk identity, or Clerk not yet resolved): there's no
 *   profile to edit, so the fields mirror the generated animal identity
 *   (e.g. "Curious Lynx" → Curious / Lynx), read-only.
 * - **Signed in via email**: the name is ours to set, so the fields are editable
 *   and write back to Clerk.
 * - **Signed in via Google/GitHub**: the name is owned by that provider, shown
 *   read-only.
 */
function AccountNameFields({ me }: { me: Me }) {
  const { isLoaded, isSignedIn, user } = useUser();

  // Mirror the topbar's gate: only trust Clerk's profile once it has resolved a
  // signed-in user. Until then (or when anonymous) fall back to the animal name.
  if (!(isLoaded && isSignedIn && user)) {
    const [first, last] = splitName(me.displayName);
    return (
      <NameFieldGrid
        first={first}
        last={last}
        hint="Sign in to set your own name."
      />
    );
  }

  return <ClerkNameFields user={user} />;
}

/** The signed-in variant: editable for email accounts, locked for OAuth ones. */
function ClerkNameFields({ user }: { user: ClerkUser }) {
  // An OAuth account (Google/GitHub) carries an external account; a plain email
  // sign-up has none. The provider owns the name in that case, so we lock it.
  const oauthProvider = oauthProviderLabel(user);

  const [first, setFirst] = useState(user.firstName ?? "");
  const [last, setLast] = useState(user.lastName ?? "");
  const [saving, setSaving] = useState(false);

  if (oauthProvider) {
    return (
      <NameFieldGrid
        first={user.firstName ?? ""}
        last={user.lastName ?? ""}
        hint={`Managed by your ${oauthProvider} sign-in.`}
      />
    );
  }

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
    <div className="space-y-3">
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
      <Button size="sm" onClick={save} disabled={!dirty || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/** Read-only first/last name pair, with a lock hint explaining why. */
function NameFieldGrid({ first, last, hint }: { first: string; last: string; hint: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel>First name</FieldLabel>
          <Input value={first} disabled readOnly aria-label="First name" />
        </div>
        <div className="space-y-2">
          <FieldLabel>Last name</FieldLabel>
          <Input value={last} disabled readOnly aria-label="Last name" />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />
        {hint}
      </p>
    </div>
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

/**
 * Split a generated animal identity ("Curious Lynx") into first / last name.
 * The first word is the first name, everything after it the last name; a
 * missing name yields empty fields.
 */
function splitName(displayName: string | null): [string, string] {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  const [first, ...rest] = parts;
  return [first, rest.join(" ")];
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
