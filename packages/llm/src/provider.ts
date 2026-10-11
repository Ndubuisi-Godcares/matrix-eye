/**
 * The language-model contract used by the engine.
 *
 * Keeping this interface tiny is what makes "hosted or self-hosted" a configuration choice:
 * Ollama, vLLM, LM Studio, a hosted open-weight API and (later) our own fine-tuned model all
 * speak the OpenAI chat-completions protocol, so one implementation covers them all.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  /** Low values keep answers faithful to the supplied evidence. */
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmResult {
  text: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmProvider {
  /** Human-readable identifier for logs and analytics, e.g. "openai-compatible:qwen2.5:7b". */
  readonly name: string;
  /** Generate a complete reply. */
  complete(request: LlmRequest): Promise<LlmResult>;
  /** Generate a reply incrementally. Yields text fragments as they arrive. */
  stream(request: LlmRequest): AsyncIterable<string>;
}
