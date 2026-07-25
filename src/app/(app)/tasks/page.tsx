import type { Metadata } from "next";
import { TasksView } from "@/features/tasks";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Your standalone to-dos: daily habits and one-off tasks, alongside your goals.",
};

export default function TasksPage() {
  return <TasksView />;
}
