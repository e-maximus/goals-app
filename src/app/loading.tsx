/**
 * Route-level loading fallback, shown via Suspense while a segment resolves.
 * A quiet, layout-stable placeholder rather than a spinner.
 */
export default function Loading() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center px-5 py-24"
      aria-busy
    >
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </main>
  );
}
