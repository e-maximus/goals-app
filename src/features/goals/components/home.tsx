"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useMe } from "@/features/account";
import { daysSinceActivity, isGoalStale, type Goal } from "@/lib/types";
import { PageShell } from "@/components/layout/page-shell";
import { LoadError } from "@/components/load-error";
import { LoadingState, SectionLabel } from "@/components/ui-bits";
import { FocusHero } from "./home-hero";
import { LearnGrid } from "./home-learn";
import { goalHref } from "@/lib/utils";

/**
 * Home: the day at a glance — a greeting, the one next step worth taking, the
 * goals that have gone quiet, and the ways to get more out of the app. The hero
 * and the learn grid are their own modules; what's left here is the page.
 */

/** The name for a personal greeting: the Clerk profile when signed in, otherwise
 *  the account's generated animal identity (resolved on the server, so it's
 *  there on first paint). An unknown identity is fine — the greeting just falls
 *  back to a generic line. Mirrors the topbar's UserChip resolution. */
function useGreetingName(): string | null {
  const { isSignedIn, user } = useUser();
  const me = useMe();
  if (isSignedIn && user) {
    return user.firstName ?? user.fullName ?? user.username ?? me?.displayName ?? null;
  }
  return me?.displayName ?? null;
}

export function Home() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const loadStatus = useStore((s) => s.loadStatus);
  const greetingName = useGreetingName();

  return (
    <PageShell width="lg">
      {loadStatus === "loading" ? (
        <LoadingState label="Loading your overview…" />
      ) : loadStatus === "error" ? (
        <LoadError />
      ) : (
        <div className="space-y-8">
          <FocusHero name={greetingName} goals={goals} tasks={tasks} />
          <Attention goals={goals} />
          <LearnGrid />
        </div>
      )}
    </PageShell>
  );
}

/** Active goals gone quiet for STALE_AFTER_DAYS+ — a gentle nudge, not a scold.
 *  Hidden entirely when nothing is stale. */
function Attention({ goals }: { goals: Goal[] }) {
  const stale = goals.filter((g) => isGoalStale(g));
  if (stale.length === 0) return null;

  return (
    <section>
      <SectionLabel>Needs attention</SectionLabel>
      <div className="flex flex-col gap-2.5">
        {stale.map((g) => (
          <Link
            key={g.id}
            href={goalHref(g)}
            className="flex items-center justify-between gap-4 rounded-xl border border-warning/60 bg-warning/10 px-5 py-3 transition-colors hover:border-warning"
          >
            <span className="min-w-0 truncate text-sm font-medium">{g.title}</span>
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {daysSinceActivity(g)} days quiet
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

