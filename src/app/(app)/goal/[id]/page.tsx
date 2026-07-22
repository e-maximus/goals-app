"use client";

import { useParams } from "next/navigation";
import { GoalDetail } from "@/features/goals";

export default function GoalPage() {
  const { id } = useParams<{ id: string }>();
  return <GoalDetail goalId={id ?? ""} />;
}
