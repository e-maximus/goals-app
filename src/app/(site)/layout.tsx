import { AppFrame } from "@/components/layout/app-frame";

/**
 * Layout for the public pages (About, Privacy, Terms).
 *
 * They render the same header as the app, so they resolve the identity behind
 * it — which makes them dynamic, like every other page here. They used to be
 * statically rendered, but only in the strict sense: the header on them still
 * fetched the identity from the browser on every visit. Rendering it on the
 * server costs one session lookup and buys a chip that is correct on first
 * paint, and is why these pages carry no database access of their own.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
