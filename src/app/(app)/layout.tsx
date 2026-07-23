import { StoreHydration } from "@/components/store-hydration";
import { ChatDrawer } from "@/features/chat";
import { loadInitialState } from "@/features/goals/load";

/**
 * Layout for the signed-in app surface (Home, Goals, a goal, Tasks, Settings).
 *
 * This is where the store's data is fetched now — on the server, at request
 * time (`loadInitialState`) — and handed to the client store via
 * {@link StoreHydration}, instead of a client `useEffect` round-trip. Reading
 * cookies here makes these routes dynamic, which is correct: they're per-user.
 *
 * The static pages (About/Privacy/Terms) and the auth pages sit outside this
 * group, so they stay static and never touch the database.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const initialData = await loadInitialState();
  return (
    <>
      <StoreHydration initialData={initialData} />
      {children}
      <ChatDrawer />
    </>
  );
}
