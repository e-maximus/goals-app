"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Show, SignInButton } from "@clerk/nextjs";
import { Settings, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useChatUi } from "@/lib/chat-ui";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/save-status";
import { SearchButton } from "@/features/search";
import { useMe } from "@/features/account";
import { Brand, NavLinks } from "./nav-links";
import { UserChip } from "./user-chip";
import { cn } from "@/lib/utils";

/**
 * True once the page has scrolled off the very top. Drives the header's
 * "lifted" treatment — a stronger border and a soft drop shadow that only
 * appear once content slides beneath it.
 */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll(); // honour an initial scroll position (e.g. a restored one)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

/**
 * The app header. Rendered by the layouts, not by each page, so it survives
 * navigation intact — the scroll treatment and the identity chip don't
 * remount and re-resolve every time you change section.
 */
export function Topbar() {
  const saveStatus = useStore((s) => s.saveStatus);
  const setChatOpen = useChatUi((s) => s.setOpen);
  const scrolled = useScrolled();
  // Search is signed-in only, and the server is what decides that (see
  // server/users.ts). Reading the identity it already resolved — rather than
  // Clerk's <Show>, which renders nothing until the browser has settled its own
  // session — means the button is right in the very first paint instead of
  // popping in a moment later.
  const signedIn = useMe()?.clerkUserId != null;

  return (
    <header
      data-scrolled={scrolled ? "true" : undefined}
      style={
        scrolled ? { boxShadow: "0 8px 22px -14px oklch(0.22 0.06 150 / 0.5)" } : undefined
      }
      className={cn(
        "fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b bg-background px-5 transition-[border-color,box-shadow] duration-200 sm:px-9",
        scrolled ? "border-border-strong" : "border-border"
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <Brand />
        <span aria-hidden className="h-5 w-px flex-shrink-0 bg-border" />
        <NavLinks />
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        {signedIn && <SearchButton />}
        <SaveStatus status={saveStatus} />
        <UserChip />
        {/* Only when definitively signed out — Show renders nothing while Clerk
            is still resolving, so a signed-in user never flashes a Sign in CTA. */}
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button size="sm">Sign in</Button>
          </SignInButton>
        </Show>
        {signedIn && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setChatOpen(true)}
            aria-label="Assistant"
          >
            <Sparkles />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/settings" />}
          aria-label="Settings"
        >
          <Settings />
        </Button>
      </div>
    </header>
  );
}
