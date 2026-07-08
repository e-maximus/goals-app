"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GoalDetail } from "@/components/goal-detail";

function GoalPageInner() {
  const id = useSearchParams().get("id") ?? "";
  return <GoalDetail goalId={id} />;
}

export default function GoalPage() {
  // useSearchParams requires a Suspense boundary under static export.
  return (
    <Suspense>
      <GoalPageInner />
    </Suspense>
  );
}
