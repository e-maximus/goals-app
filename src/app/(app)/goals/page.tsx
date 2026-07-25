import type { Metadata } from "next";
import { Dashboard } from "@/features/goals";

export const metadata: Metadata = {
  title: "My Goals",
  description: "Every goal you're working on, with its progress and what comes next.",
};

export default function GoalsPage() {
  return <Dashboard />;
}
