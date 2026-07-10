import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GroupCardLive, demoSteps, type DemoStep } from "./group-card-variants";

const inProgress: DemoStep[] = demoSteps;
const complete: DemoStep[] = demoSteps.map((s) => ({ ...s, done: true }));
const empty: DemoStep[] = [];

const meta = {
  title: "Design Lab/GroupCard",
  component: GroupCardLive,
  parameters: { layout: "padded" },
  args: { title: "Research", steps: inProgress },
} satisfies Meta<typeof GroupCardLive>;

export default meta;
type Story = StoryObj<typeof meta>;

// The real, shipped GroupCard. Hover a card to reveal the ⋮ options menu in the
// corner (Rename / Delete); the percentage badge sits flush against the right
// edge. Rename actually works.
export const States: Story = {
  name: "Across states",
  render: () => (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">In progress</div>
        <GroupCardLive title="Research" steps={inProgress} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">Complete</div>
        <GroupCardLive title="Launch" steps={complete} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">Empty</div>
        <GroupCardLive title="Ideas" steps={empty} />
      </div>
    </div>
  ),
};
