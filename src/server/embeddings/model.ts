import "server-only";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { Embeddings } from "@langchain/core/embeddings";

/**
 * The embedding model, built from env — the same shape as the chat's
 * ([model.ts](../langchain/model.ts)), so the provider or model can change
 * without a code change.
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
 *
 * The provider is LangChain's `Embeddings` — the same interface the retrievers
 * and the vector store speak, so a model reaches them without an adapter. Its
 * two methods are exactly this app's two call sites: `embedDocuments` for the
 * reindex, `embedQuery` for a search. Batching belongs to the provider
 * (`batchSize` below) rather than to a loop here.
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

/**
 * A model paired with the name recorded alongside every vector it produces.
 *
 * The name cannot come from the `Embeddings` interface — it has no such member,
 * and a test stand-in has no provider model to name — but the index depends on
 * it: vectors are compared only against their own model, because coordinates
 * from two models mean different things. So the pair travels together, and the
 * reindex path takes one as a parameter so tests can hand over a deterministic
 * stand-in instead of a paid key.
 */
export type Embedder = {
  readonly modelName: string;
  readonly embeddings: Embeddings;
};

let cached: Embedder | null = null;

/** The real, configured embedder, or null when there is no provider. */
export function embedder(): Embedder | null {
  const modelName = embeddingModelName();
  if (!modelName) return null;
  if (cached?.modelName === modelName) return cached;
  cached = {
    modelName,
    embeddings: new OpenAIEmbeddings({
      apiKey: process.env.EMBEDDING_API_KEY!,
      model: modelName,
      dimensions: EMBEDDING_DIMENSIONS,
      batchSize: BATCH_SIZE,
      ...(process.env.EMBEDDING_BASE_URL
        ? { configuration: { baseURL: normalizeBaseUrl(process.env.EMBEDDING_BASE_URL) } }
        : {}),
    }),
  };
  return cached;
}
