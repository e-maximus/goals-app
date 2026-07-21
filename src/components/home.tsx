"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { fetchMe, type Me } from "@/lib/sync";
import {
  daysSinceActivity,
  goalStatus,
  goalStepCounts,
  isGoalComplete,
  isGoalStale,
  nextStep,
  todayTasks,
  type Goal,
  type Task,
} from "@/lib/types";
import { PageShell, Crumbs } from "@/components/page-shell";
import { LoadError } from "@/components/load-error";
import { LoadingState, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** General advice for the slider — deliberately more than a slogan each. */
const TIPS = [
  {
    title: "Break it down until the next step is tiny",
    body: 'A goal you can’t start is a goal that’s still too big. Keep splitting it into groups and steps until the very next thing is something you could finish in one sitting — today, not "someday." The smaller the step, the harder it is to talk yourself out of it.',
  },
  {
    title: "Momentum beats motivation",
    body: "You won’t always feel like it, and waiting until you do is how goals stall. Do one small step anyway and check it off. Watching the progress bar move is its own reward — and finishing one step makes the next one easier to start.",
  },
  {
    title: "Pause, don’t abandon",
    body: "Life gets in the way, and that’s fine. When a goal isn’t your focus right now, pause it instead of letting it sink to the bottom of the list. It keeps all your progress and steps intact, out of the way, ready the moment you come back to it.",
  },
];

/** The current account's identity, for a personal greeting. Failure is fine —
 *  the greeting just falls back to a generic line. */
function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMe().then(
      (m) => {
        if (!cancelled) setMe(m);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}

export function Home() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const loadStatus = useStore((s) => s.loadStatus);
  const me = useMe();

  return (
    <PageShell crumbs={<Crumbs root="Home" />} width="lg">
      {loadStatus === "loading" ? (
        <LoadingState label="Loading your overview…" />
      ) : loadStatus === "error" ? (
        <LoadError />
      ) : (
        <div className="space-y-10">
          <Hero name={me?.displayName ?? null} hasGoals={goals.length > 0} />
          <AboutSection />
          <HowToUse />
          <ConnectAgent />
          <Tips />
          {goals.length > 0 && (
            <>
              <Pulse goals={goals} tasks={tasks} />
              <Continue goals={goals} />
              <Attention goals={goals} />
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}

function Hero({ name, hasGoals }: { name: string | null; hasGoals: boolean }) {
  return (
    <section className="pt-2 text-center">
      <p className="text-4xl" aria-hidden>
        👣
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        {name ? `Keep going, ${name}.` : "Keep going."}
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Everything starts with a small step.
      </p>
      {!hasGoals && (
        <Link
          href="/goals"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Create your first goal <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

/** A row of at-a-glance counts, all derived from the store. */
function Pulse({ goals, tasks }: { goals: Goal[]; tasks: Task[] }) {
  const active = goals.filter((g) => !isGoalComplete(g) && goalStatus(g) === "active").length;
  const completed = goals.filter(isGoalComplete).length;
  const stepsDone = goals.reduce((n, g) => n + goalStepCounts(g).done, 0);
  const today = todayTasks(tasks).length;

  const tiles: { label: string; value: number }[] = [
    { label: active === 1 ? "active goal" : "active goals", value: active },
    { label: "steps done", value: stepsDone },
    { label: "tasks today", value: today },
    { label: "completed", value: completed },
  ];

  return (
    <section>
      <SectionLabel>Your pulse</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
            <div className="text-2xl font-bold tabular-nums">{t.value}</div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">{t.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The single most relevant next step across every active goal, checkable in
 *  place — the same "one step" nudge the dashboard makes, distilled to one line. */
function Continue({ goals }: { goals: Goal[] }) {
  const toggleStep = useStore((s) => s.toggleStep);

  const candidate = goals
    .filter((g) => !isGoalComplete(g) && goalStatus(g) === "active")
    .map((g) => ({ goal: g, next: nextStep(g) }))
    .find((c) => c.next !== null);

  if (!candidate || !candidate.next) return null;
  const { goal, next } = candidate;

  return (
    <section>
      <SectionLabel>Continue</SectionLabel>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="min-w-0">
          <Link href={`/goal/${goal.id}`} className="text-sm font-semibold hover:underline">
            {goal.title}
          </Link>
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
            Next: <span className="font-medium text-foreground">{next.step.text}</span>
            {next.group ? ` · ${next.group.title}` : ""}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-shrink-0"
          onClick={() => toggleStep(goal.id, next.group?.id ?? null, next.step.id)}
        >
          Done <Check data-icon="inline-end" />
        </Button>
      </div>
    </section>
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
            href={`/goal/${g.id}`}
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

/** A swipeable slider of general advice — native scroll-snap, no dependency.
 *  Touch swipes on mobile; arrows and dots drive it on the desktop. */
function Tips() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(TIPS.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <section aria-label="Not sure how to reach your first goal?">
      <SectionLabel>Not sure how to reach your first goal?</SectionLabel>
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TIPS.map((tip) => (
            <div key={tip.title} className="w-full flex-shrink-0 snap-center px-0.5">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{tip.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-muted-foreground">
                  {tip.body}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label="Previous tip"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="absolute left-1 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:opacity-0 sm:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next tip"
          onClick={() => go(index + 1)}
          disabled={index === TIPS.length - 1}
          className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:opacity-0 sm:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex justify-center gap-2">
        {TIPS.map((tip, i) => (
          <button
            key={tip.title}
            type="button"
            aria-label={`Go to tip ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => go(i)}
            className={cn(
              "h-2 rounded-full transition-all",
              i === index ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
            )}
          />
        ))}
      </div>
    </section>
  );
}

/** A teaser for the MCP feature — the real setup lives on Settings, so this just
 *  points there rather than repeating the endpoint and command. */
function ConnectAgent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          Connect your assistant
        </CardTitle>
        <CardDescription>
          Let an AI agent read and update your goals with you over MCP — break a goal down, check
          off steps, jot a note, all from your assistant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
        >
          Set it up in Settings <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

/** A short "About" note with a link to the full story on /about. */
function AboutSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About Keep Going</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Keep Going is a personal, non-commercial project — a small tool I built for my own use. The
          idea is simple: keep moving toward what matters to you and reach your big goals sooner by
          breaking them into steps small enough to actually take, one at a time.
        </p>
        <Link
          href="/about"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
        >
          Read the full story <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

/** A compact primer that earns Home its place without duplicating the About page. */
function HowToUse() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How to use it</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          <Link href="/goals" className="font-medium text-foreground hover:underline">
            Goals
          </Link>{" "}
          are the big things you&apos;re working toward. Break each one into groups and steps until
          the next step is small enough to just do — progress is counted for you as you check them
          off, and notes keep the thinking that the checklist can&apos;t.
        </p>
        <p>
          <Link href="/tasks" className="font-medium text-foreground hover:underline">
            Tasks
          </Link>{" "}
          are one-off to-dos and daily habits that live beside your goals. They never count toward a
          goal&apos;s progress — they&apos;re just the small stuff you don&apos;t want to forget.
        </p>
      </CardContent>
    </Card>
  );
}
