/**
 * Public API of the account feature.
 *
 * The server-side identity loader is deliberately *not* exported here: this
 * barrel is imported by client components, and pulling a `server-only` module
 * into it would break their bundle. Layouts import `@/features/account/load`
 * directly instead.
 */
export { Settings } from "./components/settings";
export { ShareDialog } from "./components/share-dialog";
export { MeProvider, useMe } from "./components/me-provider";
export type { Me } from "./types";
