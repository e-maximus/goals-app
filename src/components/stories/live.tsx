"use client";

/**
 * Renders the REAL, shipped `GroupCard` (the presentational one) driven by local
 * state instead of the store — no copy, so the "Current" reference can never
 * drift from production. This is exactly what a store-connected wrapper does,
 * minus the store.
 */

import { useState } from "react";
import { GroupCard } from "@/components/group-card";
import type { Group } from "@/lib/types";
import type { DemoStep } from "./group-card-variants";

let counter = 0;
const nextId = () => `sb-step-${counter++}`;

export function GroupCardLive({ title, steps }: { title: string; steps: DemoStep[] }) {
  const [group, setGroup] = useState<Group>({
    id: "sb-group",
    title,
    steps: steps.map((s) => ({ ...s })),
  });

  return (
    <div className="w-72">
      <GroupCard
        group={group}
        onToggleStep={(stepId) =>
          setGroup((g) => ({
            ...g,
            steps: g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)),
          }))
        }
        onAddStep={(text) =>
          setGroup((g) => ({
            ...g,
            steps: [...g.steps, { id: nextId(), text, done: false }],
          }))
        }
        onDeleteStep={(stepId) =>
          setGroup((g) => ({ ...g, steps: g.steps.filter((s) => s.id !== stepId) }))
        }
        onDeleteGroup={() => {
          /* no-op in the design lab */
        }}
      />
    </div>
  );
}
