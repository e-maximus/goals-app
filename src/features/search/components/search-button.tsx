"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "./search-dialog";

/**
 * The topbar's search affordance, and the ⌘K / Ctrl-K shortcut that opens the
 * same dialog.
 *
 * The button exists because a shortcut nobody knows about is not a feature; the
 * shortcut exists because anyone who uses search twice will want it. The hint is
 * rendered only from `sm` up — on a touch device it is noise.
 */
export function SearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      // Browsers bind ⌘K to the address bar; the page wants it more.
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="gap-2 text-muted-foreground"
      >
        <Search />
        <kbd
          aria-hidden
          className="hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline"
        >
          ⌘K
        </kbd>
      </Button>
      <SearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
