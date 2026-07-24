"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, ListChecks, NotebookPen, CheckSquare, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchSearch, SEARCH_DEBOUNCE_MS, type SearchHit, type SearchKind } from "@/lib/search";
import { cn } from "@/lib/utils";

/**
 * The search palette.
 *
 * Everything it finds lives on a goal page, so every result navigates to one —
 * there is no search-results page to land on, and inventing one would be a
 * second place to maintain the same list.
 *
 * Keyboard-first: the list is driven with the arrows and Enter without leaving
 * the input, which is the whole reason to reach for ⌘K rather than clicking
 * through the nav.
 */

const KIND_ICON: Record<SearchKind, typeof Flag> = {
  goal: Flag,
  step: ListChecks,
  note: NotebookPen,
  task: CheckSquare,
};

const KIND_LABEL: Record<SearchKind, string> = {
  goal: "Goal",
  step: "Step",
  note: "Note",
  task: "Task",
};

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The results, plus the query they answer. Keeping them together is what lets
  // "still searching" be derived rather than tracked: if the answer on hand is
  // for an older query, we are between keystroke and response.
  const [results, setResults] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const trimmed = query.trim();
  const hits = results?.query === trimmed ? results.hits : [];
  const failed = failedFor === trimmed && trimmed !== "";
  const loading = trimmed !== "" && results?.query !== trimmed && !failed;

  // Start clean each time it opens: a palette holding last week's query is a
  // small surprise every single time.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setResults(null);
      setFailedFor(null);
      setActive(0);
    }
  }

  useEffect(() => {
    if (!trimmed) return;

    // One in-flight request at a time. Without the abort a slow early keystroke
    // can land after a fast later one and overwrite the right results with
    // stale ones.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchSearch(trimmed, controller.signal).then(
        (found) => {
          setResults({ query: trimmed, hits: found });
          setActive(0);
        },
        () => {
          if (controller.signal.aborted) return;
          setFailedFor(trimmed);
        }
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const go = (hit: SearchHit) => {
    onOpenChange(false);
    // A task has no page of its own; the task list is where it lives.
    router.push(hit.kind === "task" ? "/tasks" : (hit.goal?.url ?? "/goals"));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search your goals, steps, notes and tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b px-4">
          <Search aria-hidden className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search goals, steps, notes and tasks…"
            aria-label="Search"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="search-results"
            aria-activedescendant={hits[active] ? `search-hit-${active}` : undefined}
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-[min(60vh,26rem)] overflow-y-auto">
          {hits.length > 0 ? (
            <ul id="search-results" ref={listRef} role="listbox" aria-label="Search results" className="p-1.5">
              {hits.map((hit, index) => {
                const Icon = KIND_ICON[hit.kind];
                return (
                  <li key={`${hit.kind}:${hit.id}`}>
                    <button
                      type="button"
                      id={`search-hit-${index}`}
                      role="option"
                      aria-selected={index === active}
                      data-active={index === active ? "true" : undefined}
                      onClick={() => go(hit)}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                        index === active ? "bg-muted" : "hover:bg-muted/60"
                      )}
                    >
                      <Icon
                        aria-hidden
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm font-medium",
                            hit.done && "text-muted-foreground line-through"
                          )}
                        >
                          {hit.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {KIND_LABEL[hit.kind]}
                          {hit.goal && hit.kind !== "goal" ? ` · ${hit.goal.title}` : ""}
                          {hit.detail ? ` · ${hit.detail}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty query={query} loading={loading} failed={failed} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The four states with no list: idle, searching, failed, and genuinely nothing. */
function Empty({ query, loading, failed }: { query: string; loading: boolean; failed: boolean }) {
  const message = !query.trim()
    ? "Search across your goals, steps, notes and tasks."
    : loading
      ? "Searching…"
      : failed
        ? "Search is unavailable right now. Try again in a moment."
        : `Nothing matches “${query.trim()}”.`;

  return (
    <p
      className="px-4 py-10 text-center text-sm text-muted-foreground"
      role={failed ? "alert" : undefined}
      data-testid="search-empty"
    >
      {message}
    </p>
  );
}
