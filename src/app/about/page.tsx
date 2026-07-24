import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, ListTodo, NotebookPen, Target } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About — Keep Going",
  description: "Why Keep Going exists: big goals become doable when you break them into steps.",
};

const STEPS = [
  {
    title: "Write the goal down",
    body: "As big and as vague as it really is. “Learn the guitar” counts. Naming it is what turns a wish into something you can work on.",
  },
  {
    title: "Break it until it’s easy",
    body: "Split the goal into groups, and groups into steps. Keep splitting until the next step is something you could finish today, without preparing for it.",
  },
  {
    title: "Take one step",
    body: "Check it off. Progress is computed for you — the bar moves, and the goal stops feeling like a wall and starts feeling like a staircase.",
  },
  {
    title: "Come back tomorrow",
    body: "That’s the whole method. Not intensity, not a system to maintain — just the next small step, often enough that it adds up.",
  },
];

const PIECES = [
  {
    icon: Target,
    title: "Goals, groups, steps",
    body: "The core. A goal holds groups, a group holds steps, and everything you check off rolls up into one honest progress number. Add a due date where a deadline actually helps.",
  },
  {
    icon: ListTodo,
    title: "Tasks",
    body: "The flat list beside your goals — one-off to-dos and daily habits. They can point at a goal for context, but they never inflate its progress. Doing the dishes isn’t progress on a marathon.",
  },
  {
    icon: NotebookPen,
    title: "Notes",
    body: "A feed per goal for the thinking the structure can’t hold: what’s working, what stalled, why you changed the plan. Future you will want to know.",
  },
  {
    icon: Bot,
    title: "An assistant, if you want one",
    body: "Connect Claude, Cursor, or any MCP client and it can read and edit your goals with you — break one down, tick off steps, leave a note. Authorized through sign-in, no token to paste or leak.",
  },
];

export default function AboutPage() {
  return (
    <PageShell width="lg">
      <div className="space-y-16 pb-10">
        {/* Hero — a statement, not a headline */}
        <section className="pt-6">
          <p className="text-4xl leading-none" aria-hidden>
            🏔️
          </p>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Big goals don’t fail because you’re lazy. They fail because they stay big.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Keep Going is a small tool built around one idea: break a goal down until the next
            step is something you can actually do — then do it, check it off, and let the
            progress take care of itself.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button nativeButton={false} render={<Link href="/goals" />}>
              Start a goal <ArrowRight data-icon="inline-end" />
            </Button>
            <span className="text-sm text-muted-foreground">
              No sign-up needed — you get your own space on the first visit.
            </span>
          </div>
        </section>

        {/* The story */}
        <section className="grid gap-8 border-t border-border pt-10 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Why this exists
          </h2>
          <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              “Run a marathon.” “Change careers.” “Finally learn to draw.” None of those are
              things you can do today, so today you do nothing — and tomorrow the goal is exactly
              where you left it. The problem was never willpower. It’s that the goal was never
              turned into a next action.
            </p>
            <p>
              <span className="font-medium text-foreground">Keep Going</span> does one thing:
              it makes you break the goal apart. Groups, then steps, then smaller steps, until
              what’s in front of you is boring enough to just start. Check it off and the bar
              moves — which is the point.{" "}
              <span className="font-medium text-foreground">Momentum beats motivation.</span>
            </p>
            <p>
              It started as a personal project, built for its author’s own goals — not a startup,
              not a product with a plan behind it. It turned out useful, so it stayed online for
              anyone who wants it.
            </p>
          </div>
        </section>

        {/* How it works — four beats */}
        <section className="grid gap-8 border-t border-border pt-10 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
            How it works
          </h2>
          <ol className="max-w-2xl space-y-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-secondary text-[13px] font-bold text-secondary-foreground"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* What's inside */}
        <section className="grid gap-8 border-t border-border pt-10 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
            What’s inside
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PIECES.map((p) => (
              <div key={p.title} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <p.icon className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The honest part */}
        <section className="grid gap-8 border-t border-border pt-10 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
            The honest part
          </h2>
          <dl className="max-w-2xl space-y-5 text-[15px] leading-relaxed">
            <div>
              <dt className="font-semibold">It’s free, and there’s nothing to upgrade to.</dt>
              <dd className="mt-1 text-muted-foreground">
                Not free-for-now: there is no paid tier waiting, no trial that runs out, nothing
                to buy. It isn’t run for profit — it’s run because its author uses it.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Your goals are yours.</dt>
              <dd className="mt-1 text-muted-foreground">
                Every account is its own private space — goals are never shared with other users
                and never shown to anyone else. Start anonymously, and create a real account later
                if you want them on more than one device.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">It’s offered as is.</dt>
              <dd className="mt-1 text-muted-foreground">
                A one-person project with no uptime promise and no support desk. It’s looked
                after, but plan accordingly — and see the{" "}
                <Link href="/privacy" className="font-medium text-foreground hover:underline">
                  privacy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="font-medium text-foreground hover:underline">
                  terms
                </Link>{" "}
                pages for the details.
              </dd>
            </div>
          </dl>
        </section>

        {/* Close */}
        <section className="rounded-2xl bg-card px-6 py-8 text-center ring-1 ring-foreground/10 sm:px-10">
          <CheckCircle2 className="mx-auto h-5 w-5 text-primary" aria-hidden />
          <p className="mx-auto mt-4 max-w-xl text-balance text-xl font-semibold leading-snug">
            One step today is enough. Keep going — and it will work out.
          </p>
          <Button className="mt-6" nativeButton={false} render={<Link href="/goals" />}>
            Break down your first goal <ArrowRight data-icon="inline-end" />
          </Button>
        </section>
      </div>
    </PageShell>
  );
}
