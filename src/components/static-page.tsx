import { PageShell, Crumbs } from "@/components/page-shell";

/**
 * The static pages (About, Privacy, Terms): the shared app frame with a narrow
 * prose column.
 */
export function StaticPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <PageShell crumbs={<Crumbs page={title} root={null} />} width="sm">
      <div className="space-y-6">{children}</div>
    </PageShell>
  );
}
