"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home" },
  { href: "/today", label: "Today" },
  { href: "/goals", label: "My Goals" },
  { href: "/tasks", label: "Tasks" },
  { href: "/about", label: "About" },
] as const;

/** Whether `href` is the section the current path belongs to. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/goals") return pathname === "/goals" || pathname.startsWith("/goal/");
  return pathname === href;
}

/**
 * The primary site navigation — persistent on every page, rendered as plain
 * links rather than a segmented control. The active link is derived from the
 * current path, so no page has to declare which section it belongs to.
 */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
      {ITEMS.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm transition-colors sm:px-2.5",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The wordmark, home on every page. The footprints echo the app icon — the
 * mark is "one step at a time".
 */
export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Keep Going — home"
      className="flex flex-shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
    >
      <span aria-hidden className="text-lg leading-none">
        👣
      </span>
      <span className="hidden text-sm font-semibold text-foreground sm:block">Keep Going</span>
    </Link>
  );
}
