"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GoalDetail } from "@/components/goal-detail";

function GoalPageInner() {
  const id = useSearchParams().get("id") ?? "";
  return <GoalDetail goalId={id} />;
}

export default function GoalPage() {
  // useSearchParams needs a Suspense boundary, or it opts the whole route into
  // client rendering.
  return (
    <Suspense>
      <GoalPageInner />
    </Suspense>
  );
}
