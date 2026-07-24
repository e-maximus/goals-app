import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, type EmbeddingModel } from "ai";

/**
 * The embedding model, built from env — the same shape as the chat's
 * ([llm.ts](../llm.ts)), so the provider or model can change without a code
 * change.
 *
 * Named by role rather than provider (`EMBEDDING_*`, not `OPENAI_*`) because the
 * app already talks to two: the chat is on DeepSeek, which has no embeddings
 * API, and this is on OpenAI. `EMBEDDING_BASE_URL` points it at any
 * OpenAI-compatible endpoint.
 *
 * Unlike the chat, a missing key is **not** an error. Search has three arms and
 * only one of them needs a model: with no key the index still fills with text
 * and BM25 + trigram still answer. So this module reports absence instead of
 * throwing, and callers degrade rather than fail.
 */

/** Must match the `vector(N)` column in migration 015. */
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 768);

const DEFAULT_MODEL = "text-embedding-3-small";

/** How many texts go in one request. Comfortably inside provider batch limits. */
const BATCH_SIZE = 96;

/**
 * The configured model's name, or null when no provider is configured. It is
 * stored on every row it embeds, so changing it marks the old rows stale and the
 * next reindex refills them — no separate invalidation to remember.
 */
export function embeddingModelName(): string | null {
  if (!process.env.EMBEDDING_API_KEY) return null;
  return process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
}

/** Whether the semantic arm of search can run at all. */
export function isEmbeddingConfigured(): boolean {
  return embeddingModelName() !== null;
}

/** The OpenAI-compatible path lives under /v1; append it if the base url omits it. */
function normalizeBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

let cached: EmbeddingModel | null = null;

function model(): EmbeddingModel {
  if (cached) return cached;
  const name = embeddingModelName();
  if (!name) throw new Error("EMBEDDING_API_KEY is not set — no embedding provider configured.");
  const openai = createOpenAI({
    apiKey: process.env.EMBEDDING_API_KEY!,
    ...(process.env.EMBEDDING_BASE_URL
      ? { baseURL: normalizeBaseUrl(process.env.EMBEDDING_BASE_URL) }
      : {}),
  });
  cached = openai.textEmbeddingModel(name);
  return cached;
}

/**
 * How the rest of the server asks for vectors. The reindex path takes this as a
 * parameter so tests can hand it a deterministic stand-in — embedding a few
 * hundred strings over the network in CI would be slow, flaky, and would make a
 * paid key a prerequisite for running the suite.
 */
export type Embedder = {
  /** The name recorded alongside every vector it produces. */
  readonly modelName: string;
  embed(texts: string[]): Promise<number[][]>;
};

/** The real, configured embedder, or null when there is no provider. */
export function embedder(): Embedder | null {
  const modelName = embeddingModelName();
  if (!modelName) return null;
  return {
    modelName,
    async embed(texts: string[]): Promise<number[][]> {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const { embeddings } = await embedMany({
          model: model(),
          values: texts.slice(i, i + BATCH_SIZE),
          providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
        });
        out.push(...embeddings);
      }
      return out;
    },
  };
}
