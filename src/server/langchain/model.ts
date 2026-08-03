import "server-only";
import { ChatDeepSeek } from "@langchain/deepseek";

/**
 * The chat's language model.
 *
 * The provider is DeepSeek (an OpenAI-compatible API), configured entirely by
 * environment variables so the model or endpoint can change without a code
 * change — mirroring how the rest of the server reads `DATABASE_URL` at the
 * point of use ([db.ts](../db.ts)). Keys are server-only; they must never be
 * `NEXT_PUBLIC_`.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — the AI chat needs it to reach the model.`);
  return value;
}

/** The OpenAI-compatible chat path lives under /v1; append it if the base url omits it. */
function normalizeBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

let cached: ChatDeepSeek | null = null;

/** The configured chat model, built once and reused. */
export function chatModel(): ChatDeepSeek {
  if (cached) return cached;
  cached = new ChatDeepSeek({
    apiKey: required("DEEPSEEK_API_KEY"),
    model: required("DEEPSEEK_MODEL"),
    configuration: {
      baseURL: normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"),
    },
  });
  return cached;
}
