"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary. Client component per the App Router contract —
 * it catches render/runtime errors thrown below it and offers a reset.
 */
export default function Error({
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
        ⛰️
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Something slipped.</h1>
      <p className="max-w-sm text-muted-foreground">
        We hit an unexpected error loading this page. Your goals are safe on the server —
        try again.
      </p>
      <Button className="mt-2" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
