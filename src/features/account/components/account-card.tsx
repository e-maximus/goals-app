"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useClerk, useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Check, Cloud, Lock, Smartphone, Terminal, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CopyRow, Divider, FieldLabel, Pill } from "./settings-bits";
import type { Me } from "../types";

/** The signed-in Clerk user, as `useUser()` exposes it once resolved. */
export type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;

/**
 * The signed-in account, all in one card: who you are, that it's saved, your
 * name (editable for email accounts, provider-owned for OAuth), your user id,
 * and the account actions.
 */
export function SignedInAccountCard({ user, me }: { user: ClerkUser; me: Me }) {
  const { openUserProfile, signOut } = useClerk();
  // End the Clerk session, then hard-navigate to the route that drops our own
  // session cookie. That detaches this browser so it becomes a fresh guest —
  // otherwise the cookie would keep resolving the signed-out account's goals.
  // The cookie is httpOnly, so it can only be cleared server-side via that route.
  const handleSignOut = useCallback(
    () => signOut(() => window.location.assign("/api/auth/sign-out")),
    [signOut]
  );
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
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
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
