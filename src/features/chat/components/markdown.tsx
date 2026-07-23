import { useMemo } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Renders assistant markdown — the model replies in GFM (headings, lists,
 * tables, bold), so a plain `whitespace-pre-wrap` would leak the raw syntax.
 * Elements are styled inline rather than via `@tailwindcss/typography` to keep
 * the sizing tight for a chat bubble and avoid adding the plugin. Tables scroll
 * inside their own container so a wide one never widens the bubble.
 *
 * Links the assistant points at our own pages (`/goal/<id>`, `/goals`,
 * `/tasks`) navigate client-side via next/link and fire `onNavigate` so the
 * caller can close the chat drawer; anything else opens in a new tab.
 */
const baseComponents: Components = {
  p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0 whitespace-pre-wrap">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="[&>p]:my-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
  code: ({ className, children }) => {
    const inline = !className;
    return inline ? (
      <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
        {children}
      </code>
    ) : (
      <code className={cn("font-mono text-[0.85em]", className)}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-1 overflow-x-auto rounded bg-black/10 p-2 dark:bg-white/10">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-1 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
};

export function Markdown({ children, onNavigate }: { children: string; onNavigate?: () => void }) {
  const components = useMemo<Components>(
    () => ({
      ...baseComponents,
      a: ({ children, href }) => {
        const internal = typeof href === "string" && href.startsWith("/");
        if (internal) {
          return (
            <Link href={href} onClick={onNavigate} className="underline underline-offset-2">
              {children}
            </Link>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {children}
          </a>
        );
      },
    }),
    [onNavigate],
  );
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
