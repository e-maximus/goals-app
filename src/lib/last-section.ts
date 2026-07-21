"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// The last main section the user visited, kept in localStorage so it survives
// across sessions. A separate sessionStorage flag records that this session's
// one-time "resume" has already been handled.
const LAST_SECTION_KEY = "keepgoing:last-section";
const RESUMED_FLAG = "keepgoing:resumed";

/** The primary sections worth remembering and resuming to. */
const SECTIONS = ["/", "/goals", "/tasks"] as const;
type Section = (typeof SECTIONS)[number];

/** Which section a path belongs to, or null for pages outside the three. */
function sectionFor(pathname: string): Section | null {
  if (pathname === "/") return "/";
  if (pathname === "/goals" || pathname.startsWith("/goal/")) return "/goals";
  if (pathname === "/tasks") return "/tasks";
  return null;
}

function isSection(value: string | null): value is Section {
  return value !== null && (SECTIONS as readonly string[]).includes(value);
}

function safeGet(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: "local" | "session", key: string, value: string): void {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // Storage unavailable (private mode, blocked) — best effort only.
  }
}

/**
 * Mounted once (in the root layout), this does two things across the whole app:
 *
 *  1. Remembers the last of Home / My Goals / Tasks the user is on, in
 *     localStorage. Standalone pages (Settings, About, legal) aren't sections,
 *     so they leave the memory untouched.
 *  2. On the *first* open of a session that lands on Home, resumes the user to
 *     that remembered section by redirecting there once. A sessionStorage flag
 *     makes it fire at most once per session — never again after any navigation,
 *     and never when the session started somewhere other than Home.
 *
 * Effects run top-to-bottom, so the resume check reads the stored value before
 * the recorder can overwrite it with the current path.
 */
export function useSectionMemory(): void {
  const pathname = usePathname();
  const router = useRouter();
  const handledResume = useRef(false);

  // (2) One-time resume, before the recorder below runs on this first render.
  useEffect(() => {
    if (handledResume.current) return;
    handledResume.current = true;

    const alreadyResumed = safeGet("session", RESUMED_FLAG) !== null;
    safeSet("session", RESUMED_FLAG, "1");
    if (alreadyResumed || pathname !== "/") return;

    const last = safeGet("local", LAST_SECTION_KEY);
    if (isSection(last) && last !== "/") router.replace(last);
  }, [pathname, router]);

  // (1) Record the current section on every navigation.
  useEffect(() => {
    const section = sectionFor(pathname);
    if (section) safeSet("local", LAST_SECTION_KEY, section);
  }, [pathname]);
}
