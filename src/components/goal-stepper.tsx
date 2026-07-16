"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { groupProgress, ungroupedSteps, type Goal, type Group, type Step } from "@/lib/types";
import { GroupCardConnected, UngroupedStepsCard } from "@/components/group-card";
import { DueBadge } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

type StageState = "done" | "current" | "todo";

/**
 * A node on the rail: either a single ungrouped step, or a whole group of
 * steps. Ungrouped steps come first, matching the list view and `nextStep`.
 */
type StageNode =
  | { kind: "step"; id: string; step: Step }
  | { kind: "group"; id: string; group: Group };

function nodeState(node: StageNode, activeGroupId: string | null, nextStepId: string | null): StageState {
  if (node.kind === "step") {
    if (node.step.done) return "done";
    return node.step.id === nextStepId ? "current" : "todo";
  }
  const { done, total } = groupProgress(node.group);
  if (total > 0 && done === total) return "done";
  return node.group.id === activeGroupId ? "current" : "todo";
}

/**
 * The timeline view of a goal: every stage — each ungrouped step, then each
 * group — as sequential nodes on a horizontal rail (it scrolls sideways when
 * crowded). A group node is distinguished by its step counter ("2 of 6");
 * a step node is a single step, so it carries none. Clicking a stage shows its
 * steps in a panel below — the same store-connected cards the list view uses,
 * so every step mutation has exactly one implementation.
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
  /** Highlighted inside the panel when the selected stage holds it. */
  nextStepId: string | null;
}) {
  const ungrouped = ungroupedSteps(goal);
  const nodes: StageNode[] = [
    ...ungrouped.map((step): StageNode => ({ kind: "step", id: step.id, step })),
    ...goal.groups.map((group): StageNode => ({ kind: "group", id: group.id, group })),
  ];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Follow the goal if the selected stage was deleted out from under us; by
  // default open the stage holding the next actionable step.
  const selected =
    nodes.find((n) => n.id === selectedId) ??
    nodes.find((n) => n.id === activeGroupId) ??
    nodes.find((n) => n.id === nextStepId) ??
    nodes[0];

  const crowded = nodes.length >= 5;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div
          className="grid auto-cols-[minmax(6.5rem,1fr)] grid-flow-col"
          role="tablist"
          aria-label="Stages"
        >
          {nodes.map((node, i) => {
            const state = nodeState(node, activeGroupId, nextStepId);
            const isSelected = selected?.id === node.id;
            const counts = node.kind === "group" ? groupProgress(node.group) : null;
            const complete = state === "done";
            const title = node.kind === "group" ? node.group.title : node.step.text;
            const dueDate = node.kind === "group" ? node.group.dueDate : node.step.dueDate;
            // The connector into this node fills once the previous stage is done.
            const prevDone =
              i > 0 && nodeState(nodes[i - 1]!, activeGroupId, nextStepId) === "done";

            return (
              <div key={node.id} className="relative">
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
                  onClick={() => setSelectedId(node.id)}
                  className="relative mx-auto flex w-full flex-col items-center gap-1.5 px-2 text-center"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center text-xs font-bold transition-colors",
                      // A group stage is a rounded square, a single step a circle.
                      node.kind === "group" ? "rounded-lg" : "rounded-full",
                      state === "done" && "bg-primary text-primary-foreground",
                      state === "current" && "border-2 border-primary bg-card text-primary",
                      state === "todo" &&
                        "border-[1.5px] border-border-strong bg-card text-muted-foreground"
                    )}
                  >
                    {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    title={title}
                    className={cn(
                      "max-w-full truncate text-[13px]",
                      crowded && "max-w-24",
                      isSelected ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {title}
                  </span>
                  {counts && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {counts.done} of {counts.total}
                    </span>
                  )}
                  <DueBadge dueDate={dueDate} done={complete} />
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

      {selected &&
        (selected.kind === "group" ? (
          <GroupCardConnected
            key={selected.id}
            goalId={goal.id}
            group={selected.group}
            nextStepId={selected.id === activeGroupId ? nextStepId : null}
          />
        ) : (
          <UngroupedStepsCard
            goalId={goal.id}
            steps={ungrouped}
            nextStepId={ungrouped.some((s) => s.id === nextStepId) ? nextStepId : null}
          />
        ))}
    </div>
  );
}
