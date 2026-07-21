import { Topbar, Crumbs } from "@/components/topbar";
import { cn } from "@/lib/utils";

/** How wide the content column gets — each screen picks the one that fits it. */
const widths = {
  sm: "max-w-2xl", // Settings and the static pages: prose
  md: "max-w-3xl", // Tasks: a single list
  lg: "max-w-5xl", // Dashboard: the goal grid
  xl: "max-w-6xl", // Goal detail: groups side by side
} as const;

/**
 * The frame every page shares: the fixed Topbar pinned to the top of the
 * viewport, and a centered content column below it. The breadcrumb sits just
 * under the header line, above the page content; the header itself is identical
 * on every page.
 */
export function PageShell({
  crumbs,
  width = "lg",
  children,
}: {
  crumbs?: React.ReactNode;
  width?: keyof typeof widths;
  children: React.ReactNode;
}) {
  return (
    // The Topbar is out of flow, so the shell reserves its height with pt-16.
    <div className="flex flex-1 flex-col pt-16">
      <Topbar />
      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col px-5 py-8 sm:px-10",
          widths[width],
        )}
      >
        {crumbs && (
          <div className="mb-6 min-w-0 truncate text-sm text-muted-foreground">{crumbs}</div>
        )}
        {children}
      </main>
    </div>
  );
}

export { Crumbs };
