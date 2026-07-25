"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { SectionLabel } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

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

/** "Get more out of it" — the learn/explore grid: what the app is, how it
 *  works, connecting an assistant, and a rotating tip. */
export function LearnGrid() {
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
