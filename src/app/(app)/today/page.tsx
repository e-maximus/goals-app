import type { Metadata } from "next";
import { DayView } from "@/features/day";

export const metadata: Metadata = {
  title: "Today",
  description: "Plan the day once, then get on with it — the handful of things you chose this morning.",
};

export default function TodayPage() {
  return <DayView />;
}
