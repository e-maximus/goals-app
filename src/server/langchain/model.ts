import "server-only";
import { ChatDeepSeek } from "@langchain/deepseek";

/**
 * The chat's language model, as LangChain sees it.
 *
 * This is the LangChain counterpart of [llm.ts](../llm.ts) and reads the exact
 * same environment: one provider, one set of variables, so switching engines
 * with `CHAT_ENGINE` never means switching credentials too. Keys are server-only;
 * they must never be `NEXT_PUBLIC_`.
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
