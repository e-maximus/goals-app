import type { Comment, Goal, Step } from "@/lib/types";
import { uid } from "./domain";

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function steps(pairs: [string, boolean][]): Step[] {
  return pairs.map(([text, done]) => ({ id: id("s"), text, done }));
}

const DAY = 1000 * 60 * 60 * 24;

// Comment ids are written out rather than generated so the example data is
// identical on every fresh visit — the e2e suite relies on that.
function comments(pairs: [string, string, number][]): Comment[] {
  return pairs.map(([commentId, text, daysAgo]) => ({
    id: commentId,
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
    comments: goal.comments?.map((comment) => ({ ...comment, id: uid() })),
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
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20,
      comments: comments([
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
            ["Pick a name", true],
            ["Choose a platform", true],
            ["Buy a microphone", true],
          ]),
        },
        {
          id: id("g"),
          title: "Recording Content",
          steps: steps([
            ["Write ep. 1 script", true],
            ["Record ep. 1", true],
            ["Edit ep. 1", false],
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
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 40,
      comments: comments([
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
            ["Run 16k long run", false],
          ]),
        },
        {
          id: id("g"),
          title: "Race prep",
          steps: steps([
            ["Register for the race", true],
            ["Plan race-day fuel", false],
          ]),
        },
      ],
    },
    {
      id: "goal-watercolor",
      title: "Learn watercolor painting",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      groups: [],
    },
    {
      id: "goal-website",
      title: "Redesign personal website",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60,
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
