import { cn } from "@/lib/utils";

/** How wide the content column gets — each screen picks the one that fits it. */
const widths = {
  sm: "max-w-2xl", // Settings and the static pages: prose
  md: "max-w-3xl", // Tasks: a single list
  lg: "max-w-5xl", // Dashboard: the goal grid
  xl: "max-w-6xl", // Goal detail: groups side by side
} as const;

/**
 * The centered content column every page sits in. The header around it belongs
 * to the layout ({@link AppFrame}) rather than to each page, so it isn't torn
 * down and rebuilt on every navigation — a page only chooses how wide its
 * content should be.
 */
export function PageShell({
  width = "lg",
  children,
}: {
  width?: keyof typeof widths;
  children: React.ReactNode;
}) {
  return (
    <main className={cn("mx-auto flex w-full flex-1 flex-col px-5 py-8 sm:px-10", widths[width])}>
      {children}
    </main>
  );
}
