import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { SearchHit } from "../domain";
import type { Embedder } from "../embeddings/model";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { search } from "../search/search";
import { searchViaLangchain } from "../search/langchain/search";
import {
  corpusGoals,
  corpusTasks,
  lexicalEmbedder,
  scoreCases,
  searchCases,
} from "./search-cases";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The quality bar, run against every search implementation there is.
 *
 * Adding an implementation here is the point: the two must answer the same
 * corpus the same way, and a divergence should be a failing test rather than
 * something noticed in the UI weeks later.
 */

let pool: Pool;
let owner: string;

const embedder = lexicalEmbedder();

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await reset(pool);
  owner = await createOwner(pool);
  await repo.replaceAll(pool, owner, corpusGoals, null, corpusTasks);
  await reindexOwner(pool, owner, embedder);
});

type Implementation = {
  name: string;
  run: (query: string, embed?: Embedder | null) => Promise<SearchHit[]>;
};

const implementations: Implementation[] = [
  {
    name: "sql",
    run: (query, embed = embedder) => search(pool, owner, query, { embed }),
  },
  {
    name: "langchain",
    run: (query, embed = embedder) => searchViaLangchain(pool, owner, query, { embed }),
  },
];

for (const implementation of implementations) {
  describe(`search quality (${implementation.name})`, () => {
    it("meets the bar on every case", async () => {
      const results = [];
      for (const testCase of searchCases) {
        results.push({ testCase, hits: await implementation.run(testCase.query) });
      }

      const report = scoreCases(results);

      assert.deepEqual(report.failures, []);
      // Held at 1.0 deliberately. These are not hard cases — they are the
      // behaviours the search already has, written down so that replacing an arm
      // or the fusion cannot quietly drop one. A regression here means something
      // that used to be found is not, which is never an acceptable trade.
      assert.equal(report.recall, 1);
      assert.ok(report.mrr >= 0.8, `MRR regressed to ${report.mrr.toFixed(3)}`);
    });

    it("is stable across identical calls", async () => {
      // Ties are broken to a total order on purpose; without that, two rows on
      // the same score swap places between requests and the result depends on
      // the query plan.
      const once = await implementation.run("переезд");
      const twice = await implementation.run("переезд");

      assert.deepEqual(
        once.map((hit) => hit.id),
        twice.map((hit) => hit.id)
      );
    });

    it("answers without an embedding provider", async () => {
      // The vector arm is the only one that needs a key. Losing it must cost
      // recall on paraphrases, not the whole search.
      const hits = await implementation.run("Барселона", null);

      assert.ok(hits.some((hit) => hit.id === "g-move"));
    });
  });
}

describe("search implementations agree", () => {
  // The bar above proves each implementation is good enough on its own. This
  // proves they are the *same* — which is the question that matters while one
  // replaces the other, because a difference the cases happen not to cover is
  // exactly the kind that ships unnoticed.
  it("returns identical results for every case", async () => {
    const divergences: string[] = [];

    for (const testCase of searchCases) {
      const sql = await search(pool, owner, testCase.query, { embed: embedder });
      const langchain = await searchViaLangchain(pool, owner, testCase.query, { embed: embedder });

      const shape = (hits: Awaited<ReturnType<typeof search>>) =>
        hits.map((hit) => `${hit.kind}:${hit.id}[${[...hit.arms].sort().join("+")}]`);
      if (shape(sql).join(" ") !== shape(langchain).join(" ")) {
        divergences.push(
          `${testCase.query}\n    sql: ${shape(sql).join(", ")}\n    lc:  ${shape(langchain).join(", ")}`
        );
      }
    }

    assert.deepEqual(divergences, []);
  });

  it("agrees with no embedding provider either", async () => {
    // Losing the vector arm changes the number of rankings fused, and the
    // ensemble pairs weights to retrievers by position — the arithmetic most
    // likely to drift between the two.
    for (const query of ["переезд", "Барселона", "микрофон"]) {
      const sql = await search(pool, owner, query, { embed: null });
      const langchain = await searchViaLangchain(pool, owner, query, { embed: null });

      assert.deepEqual(
        langchain.map((hit) => hit.id),
        sql.map((hit) => hit.id),
        `diverged on "${query}"`
      );
    }
  });
});
