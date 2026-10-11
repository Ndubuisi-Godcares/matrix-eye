/**
 * A deterministic LlmProvider for tests and offline demos: it replays pre-written replies
 * (or computes one from the request) so engine behaviour can be tested without a model.
 */
import type { LlmProvider, LlmRequest, LlmResult } from "./provider";

export type ScriptedReply = string | ((request: LlmRequest) => string);

export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";
  /** Every request received, in order, so tests can assert on prompts. */
  readonly requests: LlmRequest[] = [];
  private index = 0;

  /** Replies are used in order; the last one repeats if the script runs out. */
  constructor(private readonly replies: ScriptedReply[]) {
    if (replies.length === 0) throw new Error("ScriptedProvider needs at least one reply");
  }

  private next(request: LlmRequest): string {
    this.requests.push(request);
    const reply = this.replies[Math.min(this.index++, this.replies.length - 1)] as ScriptedReply;
    return typeof reply === "function" ? reply(request) : reply;
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    return { text: this.next(request) };
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
    // Emit word by word to mimic incremental delivery.
    for (const word of this.next(request).split(/(?<=\s)/)) yield word;
  }
}
