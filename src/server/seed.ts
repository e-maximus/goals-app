import type { Note, Goal, Step } from "@/lib/types";
import { uid } from "./domain";

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

// Each step is [text, done] or [text, done, description]. The optional third
// element fills in Step.description — extra context shown when a step is opened.
function steps(pairs: ([string, boolean] | [string, boolean, string])[]): Step[] {
  return pairs.map(([text, done, description]) => ({
    id: id("s"),
    text,
    done,
    ...(description ? { description } : {}),
  }));
}

const DAY = 1000 * 60 * 60 * 24;

// Note ids are written out rather than generated so the example data is
// identical on every fresh visit — the e2e suite relies on that.
function notes(pairs: [string, string, number][]): Note[] {
  return pairs.map(([noteId, text, daysAgo]) => ({
    id: noteId,
    text,
    createdAt: Date.now() - daysAgo * DAY,
  }));
}

/**
 * Give a seed tree a fresh set of ids, top to bottom. The canonical seed uses
 * fixed ids (`goal-podcast`, …) so the e2e suite can navigate to them, but goal
 * ids are a global primary key — every real user seeded with the same fixed ids
 * would collide. So real users are seeded through this, which remaps every id to
 * a unique one; only the single e2e test user keeps the canonical ids.
 */
export function withFreshIds(goals: Goal[]): Goal[] {
  return goals.map((goal) => ({
    ...goal,
    id: uid(),
    groups: goal.groups.map((group) => ({
      ...group,
      id: uid(),
      steps: group.steps.map((step) => ({ ...step, id: uid() })),
    })),
    notes: goal.notes?.map((note) => ({ ...note, id: uid() })),
  }));
}

// Example data mirroring the design sketches. A fresh-id copy is inserted into
// each new user's store on first visit; the canonical fixed-id copy is what the
// e2e test user gets (see users.seedForOwner / repo.resetTestUser).
export function seedGoals(): Goal[] {
  return [
    {
      id: "goal-podcast",
      title: "Launch my podcast",
      why: "Prove to myself I can ship something creative from start to finish.",
      createdAt: Date.now() - 20 * DAY,
      updatedAt: Date.now() - 1 * DAY,
      notes: notes([
        [
          "c-podcast-1",
          "Editing is taking way longer than recording. Next episode I should script tighter so there's less to cut.",
          1,
        ],
        [
          "c-podcast-2",
          "Settled on the name after two weeks of going back and forth. Not perfect, but shipping beats perfect.",
          12,
        ],
      ]),
      groups: [
        {
          id: id("g"),
          title: "Preparation",
          steps: steps([
            [
              "Pick a name",
              true,
              "Short, easy to spell, and not already taken on the main podcast directories or social handles.",
            ],
            ["Choose a platform", true],
            [
              "Buy a microphone",
              true,
              "A USB condenser mic is plenty to start — no need for an audio interface yet. Budget around $100.",
            ],
          ]),
        },
        {
          id: id("g"),
          title: "Recording Content",
          steps: steps([
            ["Write ep. 1 script", true],
            ["Record ep. 1", true],
            [
              "Edit ep. 1",
              false,
              "Cut the dead air and the worst of the ums, add the intro/outro music, and export at -16 LUFS.",
            ],
            ["Record ep. 2", false],
          ]),
        },
        {
          id: id("g"),
          title: "Promotion",
          steps: steps([
            ["Create social accounts", false],
            ["Write announcement", false],
            ["Find platforms", false],
          ]),
        },
      ],
    },
    {
      id: "goal-marathon",
      title: "Run a half marathon",
      createdAt: Date.now() - 40 * DAY,
      // Untouched long enough to demo the stale treatment on the home page.
      updatedAt: Date.now() - 20 * DAY,
      notes: notes([
        ["c-marathon-1", "The 16k long run is the one I keep putting off. It's the wall.", 3],
      ]),
      groups: [
        {
          id: id("g"),
          title: "Base building",
          steps: steps([
            ["Buy running shoes", true],
            ["Run 5k without stopping", true],
            ["Run 3x per week for a month", true],
          ]),
        },
        {
          id: id("g"),
          title: "Build endurance",
          steps: steps([
            ["Run 8k long run", true],
            ["Run 12k long run", true],
            [
              "Run 16k long run",
              false,
              "Keep it slow — conversational pace the whole way. The point is time on feet, not speed.",
            ],
          ]),
        },
        {
          id: id("g"),
          title: "Race prep",
          steps: steps([
            ["Register for the race", true],
            [
              "Plan race-day fuel",
              false,
              "Practice with gels on the long runs first — test what my stomach tolerates before race day.",
            ],
          ]),
        },
      ],
    },
    {
      id: "goal-watercolor",
      title: "Learn watercolor painting",
      createdAt: Date.now() - 2 * DAY,
      groups: [],
    },
    {
      id: "goal-books",
      title: "Read 12 books this year",
      createdAt: Date.now() - 90 * DAY,
      status: "paused",
      pausedAt: Date.now() - 16 * DAY,
      updatedAt: Date.now() - 16 * DAY,
      groups: [
        {
          id: id("g"),
          title: "First quarter",
          steps: steps([
            ["Book 1", true],
            ["Book 2", true],
            ["Book 3", true],
            ["Book 4", false],
          ]),
        },
        {
          id: id("g"),
          title: "Rest of the year",
          steps: steps([
            ["Book 5", true],
            ["Book 6", false],
            ["Book 7", false],
            ["Book 8", false],
            ["Book 9", false],
            ["Book 10", false],
            ["Book 11", false],
            ["Book 12", false],
          ]),
        },
      ],
    },
    {
      id: "goal-website",
      title: "Redesign personal website",
      createdAt: Date.now() - 60 * DAY,
      // Finished 18 days ago → "finished in 6 weeks" on the completed row.
      updatedAt: Date.now() - 18 * DAY,
      groups: [
        {
          id: id("g"),
          title: "Research",
          steps: steps([
            ["Audit current site", true],
            ["Collect references", true],
          ]),
        },
        {
          id: id("g"),
          title: "Design",
          steps: steps([
            ["Wireframe homepage", true],
            ["Design system pass", true],
          ]),
        },
        {
          id: id("g"),
          title: "Build",
          steps: steps([
            ["Build homepage", true],
            ["Build project pages", true],
          ]),
        },
        {
          id: id("g"),
          title: "Launch",
          steps: steps([
            ["QA on all devices", true],
            ["Point domain live", true],
          ]),
        },
      ],
    },
  ];
}
