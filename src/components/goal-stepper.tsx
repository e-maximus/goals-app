"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { groupProgress, type Goal } from "@/lib/types";
import { GroupCardConnected } from "@/components/group-card";
import { DueBadge } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

type StageState = "done" | "current" | "todo";

function stageState(goal: Goal, groupId: string, activeGroupId: string | null): StageState {
  const group = goal.groups.find((g) => g.id === groupId)!;
  const { done, total } = groupProgress(group);
  if (total > 0 && done === total) return "done";
  if (groupId === activeGroupId) return "current";
  return "todo";
}

/**
 * The timeline view of a goal: groups as sequential stages on a horizontal
 * rail. Clicking a stage shows its steps in a panel below — the panel is the
 * same store-connected group card the list view uses, so every step mutation
 * has exactly one implementation.
 *
 * Layout: an equal-column grid keeps the nodes evenly distributed no matter
 * how wide each label is. The connector into a node is drawn inside its own
 * column, absolutely positioned from the previous column's center to this
 * one's — so it always spans node-center to node-center.
 */
export function GoalStepper({
  goal,
  activeGroupId,
  nextStepId,
}: {
  goal: Goal;
  /** The group holding the next actionable step — rendered as "current". */
  activeGroupId: string | null;
  /** Highlighted inside the panel when the selected group is the active one. */
  nextStepId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Follow the goal if the selected group was deleted out from under us.
  const selected =
    goal.groups.find((g) => g.id === selectedId) ??
    goal.groups.find((g) => g.id === activeGroupId) ??
    goal.groups[0];

  const crowded = goal.groups.length >= 5;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div
          className="grid auto-cols-[minmax(6.5rem,1fr)] grid-flow-col"
          role="tablist"
          aria-label="Stages"
        >
          {goal.groups.map((group, i) => {
            const state = stageState(goal, group.id, activeGroupId);
            const { done, total } = groupProgress(group);
            const complete = total > 0 && done === total;
            const isSelected = selected?.id === group.id;
            // The connector into this node fills once the previous stage is done.
            const prevDone =
              i > 0 && stageState(goal, goal.groups[i - 1]!.id, activeGroupId) === "done";

            return (
              <div key={group.id} className="relative">
                {i > 0 && (
                  <div
                    className={cn(
                      "absolute left-[calc(-50%+22px)] right-[calc(50%+22px)] top-[13px] h-0.5 rounded-full",
                      prevDone ? "bg-primary" : "bg-border-strong"
                    )}
                    aria-hidden
                  />
                )}
                <button
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(group.id)}
                  className="relative mx-auto flex w-full flex-col items-center gap-1.5 px-2 text-center"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                      state === "done" && "bg-primary text-primary-foreground",
                      state === "current" && "border-2 border-primary bg-card text-primary",
                      state === "todo" &&
                        "border-[1.5px] border-border-strong bg-card text-muted-foreground"
                    )}
                  >
                    {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    title={group.title}
                    className={cn(
                      "max-w-full truncate text-[13px]",
                      crowded && "max-w-24",
                      isSelected ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {group.title}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {done} of {total}
                  </span>
                  <DueBadge dueDate={group.dueDate} done={complete} />
                  <span
                    className={cn(
                      "h-0.5 w-8 rounded-full",
                      isSelected ? "bg-primary" : "bg-transparent"
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <GroupCardConnected
          key={selected.id}
          goalId={goal.id}
          group={selected}
          nextStepId={selected.id === activeGroupId ? nextStepId : null}
        />
      )}
    </div>
  );
}
