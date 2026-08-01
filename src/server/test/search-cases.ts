import { createHash } from "node:crypto";
import type { Goal, Note, Step, Task } from "../domain";
import { EMBEDDING_DIMENSIONS, type Embedder } from "../embeddings/model";
import type { SearchHit } from "../domain";

/**
 * The search quality bar, as a fixture plus a list of cases.
 *
 * This exists to make a change to retrieval *measurable*. The unit tests around
 * it assert mechanics — that BM25 outranks by IDF, that a title beats a body —
 * on two or three rows at a time. They cannot tell you whether the search got
 * better or worse overall, which is the only question worth asking when the
 * fusion or an arm is replaced.
 *
 * It is deliberately shared rather than inlined in one test file: the same cases
 * must run against every implementation, so a migration is a comparison and not
 * a leap of faith.
 *
 * ## The embedder, and what these cases can and cannot prove
 *
 * A test cannot call a real embedding provider — no key in CI, and a network
 * call would make the bar flap. {@link lexicalEmbedder} stands in: it hashes
 * tokens into dimensions and normalises, so cosine similarity tracks *word
 * overlap*.
 *
 * That is enough to exercise everything structural: the arm runs, the threshold
 * cuts, fusion weighs three rankings, a goal gets promoted over its steps. It is
 * **not** enough to prove real semantics — a paraphrase sharing no words with
 * the text that answers it scores zero here, where a real model would find it.
 * So there are no paraphrase cases below. Judging that needs the real provider
 * and a human, and it is not what a regression bar is for.
 */

const T0 = 1_700_000_000_000;

function step(id: string, text: string, description?: string): Step {
  return { id, text, done: false, ...(description ? { description } : {}) };
}

function note(id: string, text: string): Note {
  return { id, text, createdAt: T0 };
}

function goal(id: string, title: string, why: string, extra: Partial<Goal> = {}): Goal {
  return {
    id,
    title,
    why,
    createdAt: T0,
    updatedAt: T0,
    status: "active",
    steps: [],
    groups: [],
    notes: [],
    ...extra,
  };
}

/**
 * A corpus with the shape real stores have: a few goals sharing vocabulary, one
 * rare word that only appears once, long notes next to short titles, and words
 * that only differ by inflection.
 */
export const corpusGoals: Goal[] = [
  goal("g-move", "Переезд в Барселону", "Жить у моря и работать оттуда", {
    steps: [
      step("s-visa", "Собрать документы на визу", "Справка о доходах и страховка"),
      step("s-flat", "Найти квартиру", "Район Грасия или Побленоу"),
      step("s-gym", "Отменить абонемент в спортзал"),
    ],
    notes: [
      note("n-move-1", "По переезду главный риск — сроки визы, всё остальное решаемо"),
      note("n-move-2", "Смотрел квартиры онлайн, цены выросли процентов на двадцать"),
    ],
  }),
  goal("g-spanish", "Выучить испанский", "Чтобы говорить в Барселоне без запинок", {
    steps: [
      step("s-tutor", "Найти преподавателя"),
      step("s-podcast", "Слушать подкасты каждый день", "По тридцать минут утром"),
    ],
    notes: [note("n-spanish-1", "Грамматика идёт тяжелее, чем словарь")],
  }),
  goal("g-house", "Переезд офиса", "Съехать со старого этажа до конца квартала", {
    steps: [step("s-boxes", "Заказать коробки"), step("s-movers", "Нанять грузчиков")],
  }),
  goal("g-podcast", "Запустить подкаст", "Рассказывать про инженерные решения", {
    steps: [
      step("s-mic", "Купить микрофон", "Хороший динамический, чтобы не ловить эхо"),
      step("s-guests", "Позвать первых гостей"),
    ],
    notes: [
      note(
        "n-podcast-1",
        "Записал пилотный выпуск, звук плохой — нужен нормальный микрофон и обработка"
      ),
    ],
  }),
  goal("g-bike", "Починить велосипед", "Ездить на работу летом", {
    steps: [step("s-brakes", "Поменять тормозные колодки"), step("s-chain", "Смазать цепь")],
  }),
  goal("g-xylophone", "Научиться играть на ксилофоне", "Просто ради удовольствия", {
    steps: [step("s-lessons", "Найти учителя")],
  }),
  goal("g-budget", "Пересобрать бюджет", "Понять, сколько стоит переезд", {
    steps: [step("s-pricing", "Посчитать ценообразование подписки")],
    notes: [note("n-budget-1", "Написал заметку про ценообразование: подписка выгоднее разовой")],
  }),
  goal("g-health", "Вернуться к бегу", "Три раза в неделю", {
    steps: [step("s-shoes", "Купить кроссовки")],
  }),
];

export const corpusTasks: Task[] = [
  { id: "t-insurance", title: "Оформить страховку", goalId: "g-move", done: false, createdAt: T0 },
  { id: "t-call", title: "Позвонить в банк про ипотеку", done: false, createdAt: T0 },
  { id: "t-water", title: "Пить воду", daily: true, done: false, createdAt: T0 },
];

/**
 * One expectation about a query's results.
 *
 * `expectFirst` is used only where the right answer is genuinely unambiguous;
 * elsewhere `expectContains` states what must be found without over-fitting the
 * bar to today's exact ordering.
 */
export type SearchCase = {
  name: string;
  query: string;
  /** Must come back at rank 0. */
  expectFirst?: string;
  /** Must appear anywhere in the results. */
  expectContains?: string[];
  /** Must not appear at all. */
  expectAbsent?: string[];
  /** Ranked ids for MRR; defaults to `expectFirst` when omitted. */
  relevant?: string[];
};

export const searchCases: SearchCase[] = [
  {
    name: "exact rare word beats the common one",
    query: "Барселона",
    expectContains: ["g-move"],
    expectAbsent: ["g-bike", "g-xylophone"],
    relevant: ["g-move"],
  },
  {
    name: "russian morphology: 'переезд' finds the note that says 'переезду'",
    query: "переезду",
    expectContains: ["n-move-1"],
    relevant: ["n-move-1"],
  },
  {
    name: "typo still finds its row",
    query: "барселна",
    expectContains: ["g-move"],
    relevant: ["g-move"],
  },
  {
    name: "a goal wins over its own steps when the query is its own words",
    query: "подкаст",
    expectFirst: "g-podcast",
    relevant: ["g-podcast"],
  },
  {
    name: "the step wins when it is the one that mentions the thing",
    query: "микрофон",
    expectContains: ["s-mic", "n-podcast-1"],
    expectAbsent: ["g-move"],
    relevant: ["s-mic"],
  },
  {
    name: "a parent's title does not leak into a child's keyword score",
    query: "коробки",
    expectFirst: "s-boxes",
    relevant: ["s-boxes"],
  },
  {
    name: "notes are searchable",
    query: "ценообразование",
    expectContains: ["n-budget-1", "s-pricing"],
    relevant: ["n-budget-1"],
  },
  {
    name: "tasks are searchable",
    query: "страховку",
    expectContains: ["t-insurance"],
    relevant: ["t-insurance"],
  },
  {
    name: "an unlinked task is searchable too",
    query: "ипотеке",
    expectContains: ["t-call"],
    relevant: ["t-call"],
  },
  {
    name: "a two-word query prefers the row carrying both",
    query: "тормозные колодки",
    expectFirst: "s-brakes",
    relevant: ["s-brakes"],
  },
  {
    name: "a shared word does not drown the goal that is about it",
    query: "переезд офиса",
    expectContains: ["g-house"],
    relevant: ["g-house", "g-move"],
  },
  {
    name: "nothing in the corpus returns nothing",
    query: "квантовая хромодинамика",
    expectAbsent: [
      "g-move",
      "g-spanish",
      "g-house",
      "g-podcast",
      "g-bike",
      "g-xylophone",
      "g-budget",
      "g-health",
    ],
    relevant: [],
  },
  {
    name: "a step's description is indexed",
    query: "Грасия",
    expectContains: ["s-flat"],
    relevant: ["s-flat"],
  },
  {
    name: "a goal's why is indexed",
    query: "у моря",
    expectContains: ["g-move"],
    relevant: ["g-move"],
  },
];

/** Rank of the first relevant hit, or -1. */
function firstRelevantRank(hits: SearchHit[], relevant: string[]): number {
  return hits.findIndex((hit) => relevant.includes(hit.id));
}

export type QualityReport = {
  /** Share of cases whose relevant ids were all retrieved. */
  recall: number;
  /** Mean reciprocal rank over the cases that expect anything. */
  mrr: number;
  failures: string[];
};

/**
 * Score one implementation against the cases.
 *
 * Returns rather than asserts, so a caller can compare two implementations and
 * report the difference instead of failing on the first divergence.
 */
export function scoreCases(
  results: { testCase: SearchCase; hits: SearchHit[] }[]
): QualityReport {
  const failures: string[] = [];
  let retrieved = 0;
  let scored = 0;
  let reciprocalSum = 0;

  for (const { testCase, hits } of results) {
    const ids = hits.map((hit) => hit.id);

    for (const id of testCase.expectContains ?? []) {
      if (!ids.includes(id)) failures.push(`${testCase.name}: missing ${id} (got ${ids.join()})`);
    }
    for (const id of testCase.expectAbsent ?? []) {
      if (ids.includes(id)) failures.push(`${testCase.name}: unexpected ${id}`);
    }
    if (testCase.expectFirst && ids[0] !== testCase.expectFirst) {
      failures.push(`${testCase.name}: expected ${testCase.expectFirst} first, got ${ids[0]}`);
    }

    const relevant = testCase.relevant ?? (testCase.expectFirst ? [testCase.expectFirst] : []);
    if (relevant.length === 0) continue;
    scored += 1;
    if (relevant.every((id) => ids.includes(id))) retrieved += 1;
    const rank = firstRelevantRank(hits, relevant);
    if (rank >= 0) reciprocalSum += 1 / (rank + 1);
  }

  return {
    recall: scored === 0 ? 1 : retrieved / scored,
    mrr: scored === 0 ? 1 : reciprocalSum / scored,
    failures,
  };
}

/**
 * A deterministic stand-in for the embedding provider whose cosine similarity
 * tracks word overlap — see the note at the top of this file for what that does
 * and does not buy.
 */
export function lexicalEmbedder(modelName = "lexical-test-model"): Embedder {
  return {
    modelName,
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
        const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
        for (const token of tokens) {
          // Prefix folding, so an inflected form still lands near its stem:
          // "переезд" and "переезду" share their first six characters and so
          // share a dimension.
          const stem = token.slice(0, 6);
          const digest = createHash("sha256").update(stem).digest();
          const dimension = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
          vector[dimension] += 1;
        }
        const norm = Math.hypot(...vector);
        return norm === 0 ? vector : vector.map((value) => value / norm);
      });
    },
  };
}
