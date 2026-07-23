"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowRight, Bot, Check, Plus } from "lucide-react";
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
import { NewGoalDialog } from "./new-goal-dialog";
import { TaskDialog } from "@/features/tasks";
import { cn, goalHref } from "@/lib/utils";

/** General advice for the "Tip of the day" card — deliberately more than a
 *  slogan each. Swipeable, so all three stay reachable. */
const TIPS = [
  {
    title: "If you can’t start, it’s still too big",
    body: 'Keep splitting the next step until it’s something you could finish in one sitting — today, not "someday." The smaller the step, the harder it is to talk yourself out of it.',
  },
  {
    title: "Momentum beats motivation",
    body: "You won’t always feel like it, and waiting until you do is how goals stall. Do one small step anyway and check it off — finishing one makes the next easier to start.",
  },
  {
    title: "Pause, don’t abandon",
    body: "When a goal isn’t your focus right now, pause it instead of letting it sink to the bottom. It keeps your progress and steps intact, ready the moment you come back.",
  },
];

/** The name for a personal greeting: the Clerk profile when signed in, otherwise
 *  the account's generated animal identity. Failure is fine — the greeting just
 *  falls back to a generic line. Mirrors the topbar's UserChip resolution. */
function useGreetingName(): string | null {
  const { isSignedIn, user } = useUser();
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
    <PageShell crumbs={<Crumbs root="Home" />} width="lg">
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

/** A friendly, data-aware line under the greeting. */
function heroSubtitle(active: number, stepsDone: number, hasNext: boolean): string {
  if (active === 0) {
    return goalsExistLine(stepsDone);
  }
  const goalPart = `${active} goal${active === 1 ? "" : "s"} in motion`;
  const stepPart = stepsDone > 0 ? ` and ${stepsDone} step${stepsDone === 1 ? "" : "s"} already behind you` : "";
  const tail = hasNext ? ". The next one is small — let’s take it." : ".";
  return `${goalPart}${stepPart}${tail}`;
}

function goalsExistLine(stepsDone: number): string {
  return stepsDone > 0
    ? "Nothing active right now — pick a goal back up whenever you’re ready."
    : "Everything starts with a small step.";
}

/** The hero: greeting, quick actions, the day's next step, and an at-a-glance
 *  pulse — all in one card, the way the redesign leads with it. */
function FocusHero({ name, goals, tasks }: { name: string | null; goals: Goal[]; tasks: Task[] }) {
  const router = useRouter();
  const addGoal = useStore((s) => s.addGoal);
  const addTask = useStore((s) => s.addTask);
  const [goalOpen, setGoalOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const active = goals.filter((g) => !isGoalComplete(g) && goalStatus(g) === "active").length;
  const completed = goals.filter(isGoalComplete).length;
  const stepsDone = goals.reduce((n, g) => n + goalStepCounts(g).done, 0);
  const today = todayTasks(tasks).length;

  const candidate = goals
    .filter((g) => !isGoalComplete(g) && goalStatus(g) === "active")
    .map((g) => ({ goal: g, next: nextStep(g) }))
    .find((c) => c.next !== null);
  const hasGoals = goals.length > 0;

  const tiles: { label: string; value: number }[] = [
    { label: active === 1 ? "active goal" : "active goals", value: active },
    { label: "steps done", value: stepsDone },
    { label: "tasks today", value: today },
    { label: "completed", value: completed },
  ];

  return (
    <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start gap-4 px-6 pb-5 pt-6 sm:px-7">
        <span className="text-3xl leading-none" aria-hidden>
          👣
        </span>
        <div className="min-w-[15rem] flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {name ? `Keep going, ${name}.` : "Keep going."}
          </h1>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
            {heroSubtitle(active, stepsDone, Boolean(candidate?.next))}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setGoalOpen(true)}>
            <Plus data-icon="inline-start" /> New goal
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
            <Plus data-icon="inline-start" /> Add a task
          </Button>
        </div>
      </div>

      {candidate?.next ? (
        <ResumeBanner goal={candidate.goal} next={candidate.next} />
      ) : !hasGoals ? (
        <FirstGoalPrompt onNewGoal={() => setGoalOpen(true)} />
      ) : null}

      {hasGoals && (
        <div className="mt-5 grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {tiles.map((t, i) => (
            <div
              key={t.label}
              className={cn(
                "px-5 py-4",
                i % 2 === 0 && "border-r border-border",
                i < 2 && "border-b border-border sm:border-b-0",
                i === 2 && "sm:border-r sm:border-border"
              )}
            >
              <div className="text-[22px] font-bold tabular-nums leading-none">{t.value}</div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <NewGoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        onCreate={(title, why) => router.push(goalHref(addGoal(title, why)))}
      />
      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title="New task"
        description="A one-off to-do or a daily habit — optionally tied to one of your goals."
        submitLabel="Add task"
        goals={goals}
        onSubmit={(title, values) => addTask(title, values)}
      />
    </section>
  );
}

/** "Pick up where you left off" — the single most relevant next step across
 *  every active goal, checkable in place. */
function ResumeBanner({
  goal,
  next,
}: {
  goal: Goal;
  next: NonNullable<ReturnType<typeof nextStep>>;
}) {
  const toggleStep = useStore((s) => s.toggleStep);

  return (
    <div className="mx-6 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4.5 py-4 ring-1 ring-primary/15 sm:mx-7">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">
          Pick up where you left off
        </div>
        <Link href={goalHref(goal)} className="mt-0.5 block text-sm font-semibold hover:underline">
          {goal.title}
        </Link>
        <div className="mt-px truncate text-[13px] text-muted-foreground">
          Next: <span className="font-medium text-foreground">{next.step.text}</span>
          {next.group ? ` · ${next.group.title}` : ""}
        </div>
      </div>
      <Button
        size="sm"
        className="flex-shrink-0"
        onClick={() => toggleStep(goal.id, next.group?.id ?? null, next.step.id)}
      >
        Done <Check data-icon="inline-end" />
      </Button>
    </div>
  );
}

/** Shown inside the hero when the account has no goals yet. */
function FirstGoalPrompt({ onNewGoal }: { onNewGoal: () => void }) {
  return (
    <div className="mx-6 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4.5 py-4 ring-1 ring-primary/15 sm:mx-7">
      <div className="min-w-0">
        <div className="text-sm font-semibold">No goals yet</div>
        <div className="mt-px text-[13px] text-muted-foreground">
          Start with one small thing you want to move toward.
        </div>
      </div>
      <Button size="sm" className="flex-shrink-0" onClick={onNewGoal}>
        Create your first goal <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
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

/** "Get more out of it" — the learn/explore grid: what the app is, how it
 *  works, connecting an assistant, and a rotating tip. */
function LearnGrid() {
  return (
    <section>
      <SectionLabel>Get more out of it</SectionLabel>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <AboutCard />
          <HowItWorksCard />
        </div>
        <div className="flex flex-col gap-4">
          <AssistantCard />
          <TipCard />
        </div>
      </div>
    </section>
  );
}

function LearnCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl bg-card p-5 ring-1 ring-foreground/10", className)}>
      {children}
    </div>
  );
}

function AboutCard() {
  return (
    <LearnCard>
      <h3 className="text-[15px] font-semibold">About Keep Going</h3>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        A small, personal tool built on one belief: big goals stall because they’re too big to
        start. Break them into steps small enough to actually take, and progress stops being a
        someday and starts being today.
      </p>
      <Link
        href="/about"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground transition-colors hover:text-primary"
      >
        Read the full story <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </LearnCard>
  );
}

function HowItWorksCard() {
  const items = [
    {
      label: "Goals",
      href: "/goals",
      body: "hold the big things. Split each into groups and steps until the next one is easy to just do — progress counts itself as you check off.",
    },
    {
      label: "Tasks",
      href: "/tasks",
      body: "are the one-offs and daily habits beside them — the small stuff you don’t want to forget, never counted toward a goal.",
    },
  ];
  return (
    <LearnCard>
      <h3 className="text-[15px] font-semibold">How it works</h3>
      {items.map((item, i) => (
        <div key={item.label} className="flex items-start gap-2.5">
          <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md bg-secondary text-[12px] font-bold text-secondary-foreground">
            {i + 1}
          </span>
          <p className="text-[13px] leading-snug text-muted-foreground">
            <Link href={item.href} className="font-semibold text-foreground hover:underline">
              {item.label}
            </Link>{" "}
            {item.body}
          </p>
        </div>
      ))}
    </LearnCard>
  );
}

/** A teaser for the MCP feature — the real setup lives on Settings, so this
 *  just points there rather than repeating the endpoint and command. */
function AssistantCard() {
  return (
    <LearnCard>
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h3 className="text-[15px] font-semibold">Bring your assistant</h3>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Connect Claude, Cursor, or any MCP client and let it work your goals with you — break one
        down, tick off steps, jot a note, all from a chat. It’s your account, authorized over
        sign-in, no token to leak.
      </p>
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground transition-colors hover:text-primary"
      >
        Set it up in Settings <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </LearnCard>
  );
}

/** A swipeable "Tip of the day" card — native scroll-snap, no dependency.
 *  Touch swipes on mobile; the dots drive it on the desktop. */
function TipCard() {
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
    <LearnCard className="bg-secondary ring-primary/20">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">
        Tip of the day
      </div>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TIPS.map((tip) => (
          <div key={tip.title} className="flex w-full flex-shrink-0 snap-center flex-col gap-1.5">
            <h3 className="text-[15px] font-semibold">{tip.title}</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{tip.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {TIPS.map((tip, i) => (
          <button
            key={tip.title}
            type="button"
            aria-label={`Go to tip ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => go(i)}
            className={cn(
              "h-[7px] rounded-full transition-all",
              i === index ? "w-[18px] bg-primary" : "w-[7px] bg-muted-foreground/30 hover:bg-muted-foreground/50"
            )}
          />
        ))}
      </div>
    </LearnCard>
  );
}
