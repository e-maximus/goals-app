import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { SearchHit } from "../domain";
import type { Embedder } from "../embeddings/model";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { search } from "../search/search";
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
];

for (const implementation of implementations) {
  describe(`search quality (${implementation.name})`, () => {
    it("meets the bar on every case", async () => {
      const results = [];
      for (const testCase of searchCases) {
        results.push({ testCase, hits: await implementation.run(testCase.query) });
      }

      const report = scoreCases(results);

      // Printed, not just asserted: the thresholds below are a floor, and the
      // actual numbers are what tells you whether a change to retrieval helped
      // or merely stayed above the floor.
      console.log(
        `[${implementation.name}] recall ${report.recall.toFixed(3)} MRR ${report.mrr.toFixed(3)}`
      );

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
