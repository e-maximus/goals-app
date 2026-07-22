import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GoalBanner } from "@/features/goals";

const meta = {
  title: "Design Lab/GoalBanner",
  component: GoalBanner,
  parameters: { layout: "padded" },
  args: {
    title: "Redesign personal website",
    pct: 88,
  },
  argTypes: {
    pct: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
} satisfies Meta<typeof GoalBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};

export const WithWhy: Story = {
  args: {
    why: "My portfolio is my first impression — it should feel current.",
    pct: 60,
  },
};

export const JustStarted: Story = {
  args: { pct: 0 },
};

export const Complete: Story = {
  args: { pct: 100 },
};
