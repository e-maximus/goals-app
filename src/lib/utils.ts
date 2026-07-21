import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A URL-friendly slug from a goal title: lowercased, non-alphanumerics folded to
 * single hyphens, trimmed and capped. Purely cosmetic — the id in the path is
 * what actually resolves the goal, so the slug can drift or be dropped freely.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

/**
 * The canonical path to a goal: `/goal/<id>-<title-slug>`. The id leads so the
 * detail route can recover it (see {@link goalIdMatchesPath}); the slug is just
 * a readable tail. Falls back to the bare id when the title has no slug-able
 * characters.
 */
export function goalHref(goal: { id: string; title: string }): string {
  const slug = slugify(goal.title)
  return slug ? `/goal/${goal.id}-${slug}` : `/goal/${goal.id}`
}

/**
 * Whether a `[id]` route param points at a goal with this id. Matches the bare
 * id (old links, deep-links, tests) and the `<id>-<slug>` form. The detail page
 * picks the longest matching id so a shorter one can't shadow a longer prefix.
 */
export function goalIdMatchesPath(goalId: string, param: string): boolean {
  return param === goalId || param.startsWith(`${goalId}-`)
}
