---
name: ui-variants
description: Design a UI change as three browsable HTML mockups published as Artifacts, before any app code is written. Use when the user asks for a design, a mockup, options for how a screen should look, "how would this look", "покажи варианты", "сделай дизайн" — for a new screen, a reworked screen, or a new feature's surface.
---

You design a change to this app's interface and hand back **three different
takes on it** as real, clickable pages. You are the designer in this step, not
the implementer: no `src/` file changes, no migrations, no Server Actions.

The output is HTML mockups, not app code, because the point is to compare shapes
before committing to one. A mockup that renders in a browser gets a real
reaction; a paragraph describing a layout does not.

## What you produce

Three Artifacts, one per variant, plus a short comparison in chat.

Each variant is a **self-contained static HTML page** showing the screen(s) the
change touches, styled with this app's real design tokens so it reads as this
product and not as a generic wireframe.

## The rules that make this useful

1. **Three concepts, not three skins.** The variants must differ in *structure
   or interaction model* — where the thing lives, what the primary gesture is,
   what the screen is organized by. Three versions of the same layout with
   different spacing is a failed run. Before writing any HTML, name the three
   organizing ideas in one line each and check they genuinely disagree.
2. **UI first.** API shape, Server Actions, SSE, persistence — out of scope
   unless the layout is impossible without a specific data field. When a variant
   *does* demand something new from the model (a field, a new query), state it in
   one line on the page under "Costs", and move on.
3. **Realistic content.** Fill mockups with plausible goals, tasks and dates from
   this user's actual domain — never `Lorem ipsum`, never `Task 1 / Task 2`.
   Include the awkward states, not just the happy one: empty, one item, many
   items, overdue, everything done. A layout that only looks good with exactly
   four items is a layout that will fail on contact.
4. **Static, but honest about interaction.** No frameworks — plain HTML and
   inline CSS (Artifacts block every external request). A little vanilla JS for a
   toggle, a tab or a drag affordance is welcome when the *idea* of the variant
   is an interaction; otherwise show state by rendering the states side by side.
5. **Both themes.** The token file below defines light and dark; wire
   `prefers-color-scheme` and `:root[data-theme]` as the Artifact tool requires.
6. **English.** Every committed and user-facing string, mockup copy included
   (AGENTS.md). Explain and compare in the language the user is writing in.

## The run

1. **Read the domain first.** For anything touching goals, steps, tasks or
   progress, read [src/lib/types.ts](../../../src/lib/types.ts) — it is the
   single source of truth for what exists and what is derived. Then read the
   view closest to the change (usually under [src/features/](../../../src/features/))
   so the mockup inherits real component anatomy. `references/app-ui.md` is the
   condensed map.
2. **Name the three ideas.** One line each, plus what each is betting on. If the
   user gave a direction, one variant follows it closely and the other two argue
   with it.
3. **Build each page** from `references/kit.html` — copy its `<style>` block
   verbatim so all three variants share tokens and primitives, then write only
   the layout that differs. Shared chrome (topbar, nav) comes from the kit too:
   the variants must be comparable, which means everything *except* the idea
   under test looks identical across the three.
4. **Every page carries its own argument.** A fixed block at the top of each
   mockup, before the UI itself:
   - **The idea** — one sentence.
   - **Best when** — the user this shape serves.
   - **Costs** — what it gives up, and anything new it demands from the data
     model.
5. **Publish.** Load the `artifact-design` skill first (required before any
   Artifact call), write the files into the scratchpad directory, then publish
   each with the `Artifact` tool.
6. **Report.** In chat: the three ideas in a table (idea / bet / cost), the three
   links, and **your recommendation with a reason**. Do not present three options
   neutrally and make the user do the deciding work alone — you looked at the
   code, you have an opinion, give it. Then ask which one to build.

## Standardized naming

Keep this identical on every run so a returning user can find last week's set.

| Thing            | Form                                              | Example                              |
| ---------------- | ------------------------------------------------- | ------------------------------------ |
| Scratchpad file  | `<feature>-v<n>-<slug>.html`                       | `day-plan-v2-two-column.html`        |
| Artifact `<title>` | `<Feature> · Variant <n> — <Name>`               | `Day Plan · Variant 2 — Two Column`   |
| `description`    | The idea, one sentence                             | `Today's plan and its sources side by side.` |
| `favicon`        | **The same emoji on all three** of a set           | `🗓️`                                  |

One emoji per *feature*, not per variant — the set reads as one investigation in
the tab bar. Iterating on a variant means editing that file and republishing it
to the same URL; a genuinely new fourth idea gets a new file and a new link.
