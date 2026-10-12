/**
 * Removes a model's private "thinking" from its reply.
 *
 * Reasoning-style models (Qwen3, DeepSeek-R1 and others) write their working inside
 * <think>...</think> before the real answer. That text is not for visitors, it would break citation
 * and figure validation, and it can quote page text out of context. Providers differ in whether they
 * strip it themselves, so we do it here regardless.
 */

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;

/** Remove complete thinking blocks, plus an unterminated one (a reply cut off mid-thought). */
export function stripReasoning(text: string): string {
  return text.replace(THINK_BLOCK, "").replace(/<think>[\s\S]*$/i, "").trim();
}

/**
 * Streaming version: feed fragments in, get only the visible text out. A tag can be split across
 * fragments ("<th" + "ink>"), so a short tail is held back until it can be classified.
 */
export class ReasoningFilter {
  private pending = "";
  private inThought = false;

  push(fragment: string): string {
    this.pending += fragment;
    let visible = "";

    for (;;) {
      if (this.inThought) {
        const end = this.pending.indexOf("</think>");
        if (end === -1) {
          // Keep only a tail that could be the start of "</think>"; discard the rest of the thought.
          this.pending = this.pending.slice(Math.max(0, this.pending.length - "</think>".length + 1));
          return visible;
        }
        this.pending = this.pending.slice(end + "</think>".length);
        this.inThought = false;
        continue;
      }
      const start = this.pending.indexOf("<think>");
      if (start === -1) {
        // Hold back a tail that might be the beginning of "<think>".
        const hold = partialTagLength(this.pending, "<think>");
        visible += this.pending.slice(0, this.pending.length - hold);
        this.pending = this.pending.slice(this.pending.length - hold);
        return visible;
      }
      visible += this.pending.slice(0, start);
      this.pending = this.pending.slice(start + "<think>".length);
      this.inThought = true;
    }
  }

  /** Call when the stream ends to release any held-back text (never inside an unterminated thought). */
  flush(): string {
    const rest = this.inThought ? "" : this.pending;
    this.pending = "";
    return rest;
  }
}

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialTagLength(text: string, tag: string): number {
  for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
    if (tag.startsWith(text.slice(text.length - len))) return len;
  }
  return 0;
}
