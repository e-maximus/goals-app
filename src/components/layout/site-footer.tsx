import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

/** The one-line footer under every page: the legal links and the running version. */
export function SiteFooter() {
  return (
    <footer className="mt-auto flex items-center justify-center gap-3 py-2 text-center text-xs text-muted-foreground">
      <Link href="/about" className="transition-colors hover:text-foreground">
        About
      </Link>
      <span aria-hidden>·</span>
      <Link href="/privacy" className="transition-colors hover:text-foreground">
        Privacy
      </Link>
      <span aria-hidden>·</span>
      <Link href="/terms" className="transition-colors hover:text-foreground">
        Terms
      </Link>
      <span aria-hidden>·</span>
      <span>v{APP_VERSION}</span>
    </footer>
  );
}
