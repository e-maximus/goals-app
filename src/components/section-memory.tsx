"use client";

import { useSectionMemory } from "@/hooks/use-section-memory";

/**
 * Remembers the last main section visited and, once per session, resumes to it
 * from Home. Renders nothing — mounted once in the root layout so it spans every
 * page. See {@link useSectionMemory}.
 */
export function SectionMemory() {
  useSectionMemory();
  return null;
}
