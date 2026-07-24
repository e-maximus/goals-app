import { PageShell } from "@/components/page-shell";

/**
 * The legal pages (Privacy, Terms): the shared app frame with a narrow prose
 * column. About sits on the wider column the rest of the app uses.
 */
export function StaticPage({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="sm">
      <div className="space-y-6">{children}</div>
    </PageShell>
  );
}
