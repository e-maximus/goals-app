"use client";

import { useEffect, useState } from "react";

/** How long we wait for Clerk before deciding it isn't coming. */
const AUTH_DEADLINE_MS = 8_000;

/**
 * Whether Clerk has settled — either it loaded, or it has had long enough that
 * we stop waiting.
 *
 * Clerk failing to initialize (a missing key, a blocked script) leaves
 * `isLoaded` false forever, and anything gated on it would pulse a skeleton for
 * the rest of the session. The deadline lets those views fall back to the
 * account's own identity instead. Shared by the topbar chip and the Settings
 * page, which both had their own copy of this timer.
 */
export function useAuthSettled(isLoaded: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setTimedOut(true), AUTH_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  return isLoaded || timedOut;
}
