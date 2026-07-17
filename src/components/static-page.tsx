import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Shared frame for the static pages (About, Privacy, Terms): the same
 * breadcrumb header the app screens use, and a narrow centered column.
 */
export function StaticPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center border-b border-border px-5 sm:px-9">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          My Goals
        </Link>
        <span className="mx-3 text-muted-foreground">/</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-5 py-8 sm:px-10">
        {children}
      </main>
    </div>
  );
}
