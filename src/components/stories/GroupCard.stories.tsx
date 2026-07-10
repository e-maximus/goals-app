import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  GroupCardMinimal,
  GroupCardAccent,
  GroupCardCompact,
  demoSteps,
  type DemoStep,
  type GroupCardVariantProps,
} from "./group-card-variants";
import { GroupCardLive } from "./live";

const inProgress: DemoStep[] = demoSteps;
const complete: DemoStep[] = demoSteps.map((s) => ({ ...s, done: true }));
const empty: DemoStep[] = [];
const many: DemoStep[] = [
  { id: "1", text: "Audit current site", done: true },
  { id: "2", text: "Collect references", done: true },
  { id: "3", text: "Draft new information architecture", done: true },
  { id: "4", text: "Sketch homepage wireframe", done: false },
  { id: "5", text: "Pick a type scale", done: false },
  { id: "6", text: "Ship the first pass", done: false },
];

// Variant A is the REAL shipped GroupCard (via GroupCardLive); B/C/D are new
// design proposals that don't exist in the app yet.
const variants: {
  key: string;
  name: string;
  Component: (p: GroupCardVariantProps) => React.ReactNode;
}[] = [
  { key: "A", name: "Current (real component)", Component: GroupCardLive },
  { key: "B", name: "Minimal", Component: GroupCardMinimal },
  { key: "C", name: "Accent header", Component: GroupCardAccent },
  { key: "D", name: "Compact", Component: GroupCardCompact },
];

const meta = {
  title: "Design Lab/GroupCard",
  component: GroupCardLive,
  parameters: { layout: "padded" },
  args: { title: "Research", steps: inProgress },
} satisfies Meta<typeof GroupCardLive>;

export default meta;
type Story = StoryObj<typeof meta>;

/* --- Side-by-side comparison of all four directions --- */
export const AllVariants: Story = {
  name: "★ Compare all variants",
  render: (args) => (
    <div className="flex flex-wrap items-start gap-8">
      {variants.map(({ key, name, Component }) => (
        <div key={key} className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {key} · {name}
          </div>
          <Component title={args.title} steps={args.steps} />
        </div>
      ))}
    </div>
  ),
};

/* --- Each variant on its own, across states --- */

function StateRow({
  Component,
}: {
  Component: (p: GroupCardVariantProps) => React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">In progress</div>
        <Component title="Research" steps={inProgress} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">Complete</div>
        <Component title="Launch" steps={complete} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">Many steps</div>
        <Component title="Design" steps={many} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">Empty</div>
        <Component title="Ideas" steps={empty} />
      </div>
    </div>
  );
}

export const A_Current: Story = {
  name: "A · Current (real component)",
  render: () => <StateRow Component={GroupCardLive} />,
};

export const B_Minimal: Story = {
  name: "B · Minimal",
  render: () => <StateRow Component={GroupCardMinimal} />,
};

export const C_Accent: Story = {
  name: "C · Accent header",
  render: () => <StateRow Component={GroupCardAccent} />,
};

export const D_Compact: Story = {
  name: "D · Compact",
  render: () => <StateRow Component={GroupCardCompact} />,
};
