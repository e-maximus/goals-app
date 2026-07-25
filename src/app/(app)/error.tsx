"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Error boundary for the app surface. It sits below the root one so a failure
 * inside Home, Goals or Tasks doesn't take the whole shell with it — the header
 * stays, and the way back to the goals is one click away.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for local debugging; production logs live server-side.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-24 text-center">
      <p className="text-5xl" aria-hidden>
        🧭
      </p>
      <h1 className="text-2xl font-bold tracking-tight">This screen lost its footing.</h1>
      <p className="max-w-sm text-muted-foreground">
        Your goals are safe on the server — nothing was lost. Try this screen again, or head back
        to your goals.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/goals" className={buttonVariants({ variant: "outline" })}>
          My Goals
        </Link>
      </div>
    </main>
  );
}
