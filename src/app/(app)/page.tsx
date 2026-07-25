import type { Metadata } from "next";
import { Home } from "@/features/goals";

export const metadata: Metadata = {
  title: { absolute: "Keep Going — break big goals into small steps" },
  description: "Your day at a glance: the next step to take, what needs attention, and today's tasks.",
};

export default function HomePage() {
  return <Home />;
}
