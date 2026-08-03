import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import * as repo from "../repo";
import { reindexOwner } from "../embeddings/reindex";
import { expandQuery, fuseVariants } from "../search/expand";
import { search } from "../search/search";
import { ScriptedChatModel } from "./scripted-model";
import { corpusGoals, corpusTasks, lexicalEmbedder, scoreCases, searchCases } from "./search-cases";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * Query expansion: what it must do, and proof it does not cost anything.
 *
 * The second claim is the one worth testing. Expansion is an extra model call
 * before any SQL runs, so if it does not move the quality bar it is pure latency
 * and should not ship — and a rewrite that retrieves *worse* is a real risk,
 * since a bad variant contributes a ranking just like a good one.
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
});

/** A model that answers with a fixed set of rewrites, via structured output. */
const expander = (...queries: string[]) =>
  new ScriptedChatModel([{ toolCalls: [{ name: "extract", args: { queries } }] }]);

describe("expandQuery", () => {
  it("keeps the original first and appends the rewrites", async () => {
    const queries = await expandQuery(expander("relocation", "moving abroad"), "move");

    // The original is the only phrasing the user actually chose, so it is never
    // dropped and never reordered behind a guess.
    assert.deepEqual(queries, ["move", "relocation", "moving abroad"]);
  });

  it("drops a rewrite that repeats the original or another rewrite", async () => {
    const queries = await expandQuery(expander("Move", "relocation", "relocation", ""), "move");

    assert.deepEqual(queries, ["move", "relocation"]);
  });

  it("caps the number of rewrites", async () => {
    const queries = await expandQuery(expander("a", "b", "c", "d", "e"), "q");

    assert.equal(queries.length, 4);
  });

  it("falls back to the original query when the model fails", async () => {
    const broken = new (class extends ScriptedChatModel {
      withStructuredOutput(): never {
        throw new Error("model is down");
      }
    })([]);

    // Expansion is an improvement, not a prerequisite: without it the search is
    // exactly the one the palette runs.
    assert.deepEqual(await expandQuery(broken, "переезд"), ["переезд"]);
  });
});

describe("fuseVariants", () => {
  const hit = (itemId: string, arms: ("keyword" | "vector" | "trigram")[] = ["keyword"]) => ({
    kind: "goal",
    itemId,
    score: 0.1,
    arms,
  });

  it("lifts a row several phrasings agree on", async () => {
    const fused = fuseVariants([
      [hit("only-original"), hit("agreed")],
      [hit("agreed")],
      [hit("agreed")],
    ]);

    assert.equal(fused[0]!.itemId, "agreed");
  });

  it("unions the arms rather than keeping only the first variant's", () => {
    const fused = fuseVariants([[hit("a", ["keyword"])], [hit("a", ["vector", "keyword"])]]);

    // `arms` drives goal promotion and reaches the client, so it has to describe
    // every way the row was matched — and in a fixed order, since which variant
    // found it first is noise.
    assert.deepEqual(fused[0]!.arms, ["keyword", "vector"]);
  });

  it("is a total order, so identical inputs rank identically", () => {
    const once = fuseVariants([[hit("b"), hit("a")]]);
    const twice = fuseVariants([[hit("b"), hit("a")]]);

    assert.deepEqual(
      once.map((h) => h.itemId),
      twice.map((h) => h.itemId)
    );
  });
});

describe("search with expansion", () => {
  beforeEach(async () => {
    await repo.replaceAll(pool, owner, corpusGoals, null, corpusTasks);
    await reindexOwner(pool, owner, embedder);
  });

  it("finds through a rewrite what the original phrasing missed", async () => {
    // "жильё" appears nowhere in the corpus; the flat-hunting step says
    // "квартиру". No arm can bridge that on the original wording alone —
    // BM25 and trigram share no characters, and the lexical stand-in embedder
    // scores on word overlap. The rewrite is what reaches it.
    const bare = await search(pool, owner, "жильё", { embed: embedder });
    assert.ok(!bare.some((h) => h.id === "s-flat"));

    const expanded = await search(pool, owner, "жильё", {
      embed: embedder,
      expand: expander("квартиру"),
    });

    assert.ok(expanded.some((h) => h.id === "s-flat"));
  });

  it("does not expand by default", async () => {
    const model = expander("квартиру");

    await search(pool, owner, "жильё", { embed: embedder });

    assert.equal(model.calls, 0);
  });

  it("holds the quality bar", async () => {
    // The bar's cases are already answerable on their original wording, so the
    // number to watch is that expansion does not *lose* anything: a bad rewrite
    // contributes a ranking exactly like a good one, and could push a right
    // answer down. Every case is expanded with a plausible-but-useless rewrite,
    // which is the worst realistic case.
    const results = [];
    for (const testCase of searchCases) {
      results.push({
        testCase,
        hits: await search(pool, owner, testCase.query, {
          embed: embedder,
          expand: expander(`${testCase.query} подробнее`),
        }),
      });
    }

    const report = scoreCases(results);
    console.log(`[expanded] recall ${report.recall.toFixed(3)} MRR ${report.mrr.toFixed(3)}`);

    assert.deepEqual(report.failures, []);
    assert.equal(report.recall, 1);
    assert.ok(report.mrr >= 0.8, `MRR regressed to ${report.mrr.toFixed(3)}`);
  });
});
