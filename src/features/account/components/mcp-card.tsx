"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyRow, FieldLabel } from "./settings-bits";

/**
 * How an agent connects to these goals. There's no token to show: MCP is
 * authorized over OAuth through the user's sign-in, so the endpoint URL is the
 * whole setup.
 */
export function McpCard({ endpoint }: { endpoint: string }) {
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
              <p className="text-sm text-muted-foreground">Sign in above to enable MCP access.</p>
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
