"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/ui-bits";
import { useAuthSettled } from "@/hooks/use-auth-settled";
import { SignedInAccountCard } from "./account-card";
import { GuestHero, GuestIdentityStrip } from "./guest-cards";
import { McpCard } from "./mcp-card";
import { useMe } from "./me-provider";

/**
 * The account screen: who you are, and how an agent reaches these goals.
 *
 * The identity arrives from the server render (see MeProvider) rather than a
 * fetch on mount, so the only thing this page still waits for is Clerk telling
 * us whether the visitor is signed in — which decides *which* identity to show.
 */
export function Settings() {
  const { isLoaded, isSignedIn, user } = useUser();
  const authSettled = useAuthSettled(isLoaded);
  const me = useMe();
  // The MCP endpoint is same-origin; resolve it on the client so it's correct
  // wherever the app is deployed. Read once at mount — it never changes, and
  // the origin-dependent UI only renders below the auth gate, so there's no SSR
  // markup to mismatch.
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  const signedIn = Boolean(isLoaded && isSignedIn && user);

  return (
    <PageShell width="sm">
      <div className="space-y-6">
        {!authSettled ? (
          <LoadingState />
        ) : (
          <>
            {signedIn && user ? (
              <>
                {me ? <SignedInAccountCard user={user} me={me} /> : <IdentityUnavailable />}
              </>
            ) : (
              <>
                <GuestHero />
                {me ? <GuestIdentityStrip me={me} /> : <IdentityUnavailable />}
              </>
            )}
            <McpCard endpoint={`${origin}/api/mcp`} />
          </>
        )}
      </div>
    </PageShell>
  );
}

/**
 * Shown when the server couldn't resolve the account behind this page — a
 * database blip, or a request that arrived with no session. Everything else on
 * the page still works, so this states the gap rather than replacing the page
 * with an error.
 */
function IdentityUnavailable() {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-sm font-semibold">Account details unavailable</p>
        <p className="text-[13px] text-muted-foreground">
          We couldn&apos;t load your account just now. Reload the page to try again — your goals
          are unaffected.
        </p>
      </CardContent>
    </Card>
  );
}
