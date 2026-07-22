"use client";

/**
 * Renders the REAL, shipped `GroupCard` driven by local state instead of the
 * store — no copy, so the design lab can never drift from production. The kebab
 * placement exploration is done: variant D (options menu floating in the card
 * corner, percentage badge flush right, Rename + Delete) is now folded into
 * `src/components/group-card.tsx`, and this simply exercises it across states.
 */

import { useState } from "react";
import { GroupCard } from "@/features/goals";
import type { Group } from "@/lib/types";

export type DemoStep = { id: string; text: string; done: boolean };

export type GroupCardVariantProps = {
  title: string;
  steps: DemoStep[];
  /** Highlight the first undone step with the "next" badge + Done button. */
  highlightNext?: boolean;
  /** Render the collapsible variant, starting folded. */
  collapsible?: boolean;
};

let counter = 0;
const nextId = () => `sb-lab-step-${counter++}`;

export function GroupCardLive({ title, steps, highlightNext, collapsible }: GroupCardVariantProps) {
  const [group, setGroup] = useState<Group>({
    id: "sb-lab-group",
    title,
    steps: steps.map((s) => ({ ...s })),
  });
  const [collapsed, setCollapsed] = useState(Boolean(collapsible));

  return (
    <div className="w-72">
      <GroupCard
        group={group}
        collapsible={collapsible}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        nextStepId={highlightNext ? group.steps.find((s) => !s.done)?.id ?? null : null}
        onToggleStep={(stepId) =>
          setGroup((g) => ({
            ...g,
            steps: g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)),
          }))
        }
        onAddStep={(text) =>
          setGroup((g) => ({ ...g, steps: [...g.steps, { id: nextId(), text, done: false }] }))
        }
        onEditStep={(stepId, text) =>
          setGroup((g) => ({
            ...g,
            steps: g.steps.map((s) => (s.id === stepId ? { ...s, text } : s)),
          }))
        }
        onDeleteStep={(stepId) =>
          setGroup((g) => ({ ...g, steps: g.steps.filter((s) => s.id !== stepId) }))
        }
        onRenameGroup={(newTitle) => setGroup((g) => ({ ...g, title: newTitle }))}
        onDeleteGroup={() => {
          /* no-op in the design lab */
        }}
      />
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
