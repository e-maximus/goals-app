import { z } from "zod";
import type { SearchKind } from "@/lib/types";

/**
 * The search action's input. Nothing here identifies the user: the owner is
 * resolved inside the action from the session, never taken from the client.
 */
export const searchInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(25).optional(),
  kinds: z.array(z.enum(["goal", "step", "note", "task"])).nonempty().optional(),
});

// The kinds a caller may ask for are exactly the kinds a hit can be — assert it
// here so adding a SearchKind can't silently leave this schema behind.
type SchemaKind = NonNullable<z.infer<typeof searchInputSchema>["kinds"]>[number];
const _kindsMatch: SchemaKind extends SearchKind ? (SearchKind extends SchemaKind ? true : never) : never =
  true;
void _kindsMatch;
