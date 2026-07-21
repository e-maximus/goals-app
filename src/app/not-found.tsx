import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-24 text-center">
      <p className="text-5xl" aria-hidden>
        🏔️
      </p>
      <h1 className="text-3xl font-bold tracking-tight">This page gave up.</h1>
      <p className="max-w-sm text-muted-foreground">
        You don&apos;t have to. The page you&apos;re looking for doesn&apos;t exist — your
        goals are still where you left them.
      </p>
      <Link href="/goals" className={cn(buttonVariants(), "mt-2")}>
        Back to My Goals
      </Link>
    </main>
  );
}
