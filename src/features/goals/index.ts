/**
 * Public API of the goals feature. Import goals views from here, never deep.
 *
 * The server-side loader (./load.ts) is deliberately absent: this barrel is
 * imported by client components, so pulling a `server-only` module into it
 * would break their bundle. The layout imports `@/features/goals/load` directly.
 */
export { GoalDetail } from "./components/goal-detail";
export { Dashboard } from "./components/dashboard";
export { Home } from "./components/home";
export { SectionMemory } from "./components/section-memory";
export { StoreHydration } from "./components/store-hydration";
export { GoalsStream } from "./components/goals-stream";
export { GoalBanner } from "./components/goal-banner";
export { GroupCard } from "./components/group-card";
