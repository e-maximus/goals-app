"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Cookie, ShieldCheck, Smartphone, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyIdButton, GuestBadge, Pill } from "./settings-bits";
import type { Me } from "../types";

/**
 * The guest pitch: a signed-out visitor's whole account hangs off a browser
 * cookie. Leads the page so the fix (signing in) is the first thing seen, and
 * spells out honestly what a temporary account can and can't do.
 */
export function GuestHero() {
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
export function GuestIdentityStrip({ me }: { me: Me }) {
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
