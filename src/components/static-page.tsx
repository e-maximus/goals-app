import { PageShell } from "@/components/page-shell";

/**
 * The static pages (About, Privacy, Terms): the shared app frame with a narrow
 * prose column.
 */
export function StaticPage({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="sm">
      <div className="space-y-6">{children}</div>
    </PageShell>
  );
}
