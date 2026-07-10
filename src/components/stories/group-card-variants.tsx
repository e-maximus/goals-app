"use client";

/**
 * Design-lab variants of the GroupCard.
 *
 * These are PRESENTATIONAL copies — pure props, no store — used only in
 * Storybook to compare visual directions. Once we pick a winner we fold the
 * chosen look back into the real `src/components/group-card.tsx`.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Plus, Circle } from "lucide-react";

export type DemoStep = { id: string; text: string; done: boolean };

export type GroupCardVariantProps = {
  title: string;
  steps: DemoStep[];
};

function useSteps(initial: DemoStep[]) {
  const [steps, setSteps] = useState(initial);
  const toggle = (id: string) =>
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, done: !st.done } : st)));
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const pct = total === 0 ? null : Math.round((done / total) * 100);
  return { steps, toggle, total, done, pct };
}

/*
 * Variant A ("Current") is NOT reimplemented here — it renders the real
 * `GroupCard` via `GroupCardLive` in ./live.tsx, so the reference can never
 * drift from what ships. The components below are new DESIGN PROPOSALS that
 * don't exist in the app yet.
 */

/* ------------------------------------------------------------------ */
/* Variant B — Minimal (flat, borderless, airy)                        */
/* ------------------------------------------------------------------ */

export function GroupCardMinimal({ title, steps: initial }: GroupCardVariantProps) {
  const { steps, toggle, done, total, pct } = useSteps(initial);

  return (
    <div className="flex h-full w-72 flex-col gap-3 rounded-2xl bg-card/40 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-base font-semibold tracking-tight">{title}</h3>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>

      <div className="h-px w-full bg-border" />

      <div className="flex flex-1 flex-col">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => toggle(step.id)}
            className="flex items-center gap-3 py-2 text-left"
          >
            <span
              className={cn(
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                step.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-strong"
              )}
            >
              {step.done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
            <span
              className={cn(
                "text-sm text-foreground/90 transition-colors",
                step.done && "text-muted-foreground/70 line-through"
              )}
            >
              {step.text}
            </span>
          </button>
        ))}
      </div>

      <button className="flex items-center gap-2 pt-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary">
        <Plus className="h-3.5 w-3.5" />
        Add step
      </button>

      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — Accent header (colored band, bold, app-like)            */
/* ------------------------------------------------------------------ */

export function GroupCardAccent({ title, steps: initial }: GroupCardVariantProps) {
  const { steps, toggle, pct } = useSteps(initial);
  const complete = pct === 100;

  return (
    <div className="flex h-full w-72 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div
        className={cn(
          "flex flex-col gap-2.5 px-4 py-3.5 transition-colors",
          complete ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-bold">{title}</h3>
          <span className="text-lg font-black tabular-nums">{pct === null ? "—" : `${pct}%`}</span>
        </div>
        <div
          className={cn(
            "h-1.5 overflow-hidden rounded-full",
            complete ? "bg-primary-foreground/25" : "bg-primary/15"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              complete ? "bg-primary-foreground" : "bg-primary"
            )}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/60"
          >
            <button
              onClick={() => toggle(step.id)}
              className={cn(
                "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                step.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-strong hover:border-primary"
              )}
              aria-label={step.done ? "Mark step incomplete" : "Mark step complete"}
            >
              {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </button>
            <span
              className={cn(
                "flex-1 text-[13.5px]",
                step.done && "text-muted-foreground line-through decoration-border-strong"
              )}
            >
              {step.text}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-shrink-0 px-2.5 pb-3 pt-0.5">
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/60 px-2 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Add step
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant D — Compact (dense, ring progress, small footprint)         */
/* ------------------------------------------------------------------ */

function ProgressRing({ pct, size = 34 }: { pct: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="stroke-primary transition-all duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums">
        {pct}
      </span>
    </div>
  );
}

export function GroupCardCompact({ title, steps: initial }: GroupCardVariantProps) {
  const { steps, toggle, pct } = useSteps(initial);

  return (
    <div className="flex h-full w-64 flex-col rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2.5">
        <ProgressRing pct={pct ?? 0} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold">{title}</h3>
      </div>

      <div className="flex flex-1 flex-col">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => toggle(step.id)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/60"
          >
            {step.done ? (
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" strokeWidth={3} />
            ) : (
              <Circle className="h-3.5 w-3.5 flex-shrink-0 text-border-strong" strokeWidth={2} />
            )}
            <span
              className={cn(
                "text-[13px] leading-tight",
                step.done && "text-muted-foreground line-through"
              )}
            >
              {step.text}
            </span>
          </button>
        ))}
      </div>

      <button className="mt-1.5 flex items-center gap-1.5 px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary">
        <Plus className="h-3 w-3" />
        Add step
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared demo data                                                    */
/* ------------------------------------------------------------------ */

export const demoSteps: DemoStep[] = [
  { id: "1", text: "Audit current site", done: true },
  { id: "2", text: "Collect references", done: true },
  { id: "3", text: "Draft new IA", done: false },
];
