import { AppFrame } from "@/components/layout/app-frame";
import { loadMe } from "@/features/account/load";
import { ChatDrawer } from "@/features/chat";
import { GoalsStream, StoreHydration } from "@/features/goals";
import { loadInitialState } from "@/features/goals/load";

/**
 * Layout for the app surface (Home, Goals, a goal, Tasks, Settings).
 *
 * This is where the store's data is fetched — on the server, at request time —
 * and handed to the client store via {@link StoreHydration}, instead of a
 * client round-trip. Reading cookies here makes these routes dynamic, which is
 * correct: they're per-user.
 *
 * The goals and the identity behind the header are independent, so both are
 * started at once rather than stacking two round trips to Postgres. Both
 * loaders are request-cached, so {@link AppFrame} reuses the identity this
 * already awaited.
 *
 * {@link GoalsStream} sits beside the hydration for the same reason: one event
 * stream per tab, mounted where the store is seeded, rather than one per view.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [initialData] = await Promise.all([loadInitialState(), loadMe()]);
  return (
    <AppFrame>
      <StoreHydration initialData={initialData} />
      <GoalsStream />
      {children}
      <ChatDrawer />
    </AppFrame>
  );
}
