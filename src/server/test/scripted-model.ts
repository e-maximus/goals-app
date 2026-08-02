import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { Runnable } from "@langchain/core/runnables";

/**
 * A chat model that replays a script, one entry per invocation.
 *
 * The fakes shipped with LangChain don't fit an agent loop: `fakeModel()` only
 * implements `_generate`, so nothing streams and the adapter produces an empty
 * message, and `FakeStreamingChatModel` replays the *same* chunks every time, so
 * a turn that calls a tool calls it again forever. This one advances through a
 * script — "call this tool", then "here is the answer" — which is the shape of
 * every agent turn worth testing.
 *
 * It streams token by token, because the AI SDK adapter builds text parts from
 * `AIMessageChunk`s and silently drops a whole message.
 */
export type ScriptedTurn =
  | { text: string }
  | { toolCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> };

export class ScriptedChatModel extends BaseChatModel {
  private readonly script: ScriptedTurn[];
  /** How many times the model has been invoked — also the script cursor. */
  calls = 0;

  constructor(script: ScriptedTurn[]) {
    super({});
    this.script = script;
  }

  _llmType(): string {
    return "scripted";
  }

  _combineLLMOutput() {
    return [];
  }

  /** Accept bound tools so an agent can use this model; the script ignores them. */
  bindTools(tools: unknown[]): Runnable<BaseLanguageModelInput, AIMessageChunk> {
    return this.withConfig({ tools } as Record<string, unknown>) as unknown as Runnable<
      BaseLanguageModelInput,
      AIMessageChunk
    >;
  }

  /** The turn to play now; the last entry repeats if the script runs out. */
  private next(): ScriptedTurn {
    const turn = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;
    return turn ?? { text: "" };
  }

  async *_streamResponseChunks(
    _messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const turn = this.next();

    if ("toolCalls" in turn) {
      const chunk = new ChatGenerationChunk({
        text: "",
        message: new AIMessageChunk({
          content: "",
          tool_calls: turn.toolCalls.map((call, i) => ({
            name: call.name,
            args: call.args,
            id: call.id ?? `call-${i}`,
            type: "tool_call" as const,
          })),
        }),
      });
      yield chunk;
      await runManager?.handleLLMNewToken("", undefined, undefined, undefined, undefined, {
        chunk,
      });
      return;
    }

    for (const token of turn.text.split(/(?=\s)/)) {
      if (options.signal?.aborted) return;
      const chunk = new ChatGenerationChunk({
        text: token,
        message: new AIMessageChunk({ content: token }),
      });
      yield chunk;
      await runManager?.handleLLMNewToken(token, undefined, undefined, undefined, undefined, {
        chunk,
      });
    }
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    let merged: AIMessageChunk | undefined;
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
      // Every chunk this model yields carries an AIMessageChunk; `concat` is
      // typed against the base class, so narrow it back.
      const message = chunk.message as AIMessageChunk;
      merged = merged ? (merged.concat(message) as AIMessageChunk) : message;
    }
    return {
      generations: [
        {
          text: typeof merged?.content === "string" ? merged.content : "",
          message: merged ?? new AIMessageChunk({ content: "" }),
        },
      ],
    };
  }
}

/** Build a model that plays `script`, one entry per model call. */
export function scriptedModel(script: ScriptedTurn[]): ScriptedChatModel {
  return new ScriptedChatModel(script);
}
