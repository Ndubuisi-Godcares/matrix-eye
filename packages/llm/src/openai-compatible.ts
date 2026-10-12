/**
 * LlmProvider for any server implementing POST {baseUrl}/chat/completions.
 *
 * Works unchanged with:
 *   Ollama     baseUrl http://localhost:11434/v1
 *   vLLM       baseUrl http://host:8000/v1
 *   LM Studio  baseUrl http://localhost:1234/v1
 *   hosted open-weight providers and OpenAI itself
 *
 * The base URL comes from trusted operator configuration, not from end users, so it is not
 * subject to the crawler's SSRF restrictions (localhost is a normal and intended value).
 */
import { EagleError } from "@eagles-eye/core";
import type { LlmProvider, LlmRequest, LlmResult } from "./provider";
import { ReasoningFilter, stripReasoning } from "./reasoning";

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Whole-request timeout. Local models on CPU can be slow, so the default is generous. */
  timeoutMs?: number;
}

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  private readonly endpoint: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.name = `openai-compatible:${options.model}`;
  }

  private async post(request: LlmRequest, stream: boolean): Promise<Response> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 120_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.1,
          stream,
        }),
      });
    } catch (err) {
      throw new EagleError("llm_failed", `Could not reach the language model at ${this.endpoint}: ${(err as Error).message}`, { cause: err });
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new EagleError("llm_failed", `Language model returned HTTP ${response.status}: ${detail}`);
    }
    return response;
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    const response = await this.post(request, false);
    const data = (await response.json()) as CompletionResponse;
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new EagleError("llm_failed", "Language model response had no message content");
    return {
      text: stripReasoning(text),
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0 } : undefined,
    };
  }

  /** Parses the server-sent-events stream ("data: {...}" lines ending with "data: [DONE]"). */
  async *stream(request: LlmRequest): AsyncIterable<string> {
    const response = await this.post(request, true);
    const reader = response.body?.getReader();
    if (!reader) throw new EagleError("llm_failed", "Language model returned no stream");
    const decoder = new TextDecoder();
    const filter = new ReasoningFilter(); // hides <think> blocks even when split across fragments
    let pending = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      // Events are separated by newlines; keep the trailing partial line for the next read.
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          const rest = filter.flush();
          if (rest) yield rest;
          return;
        }
        try {
          const delta = (JSON.parse(payload) as StreamChunk).choices?.[0]?.delta?.content;
          const visible = delta ? filter.push(delta) : "";
          if (visible) yield visible;
        } catch {
          // Ignore malformed keep-alive or partial lines rather than failing the whole answer.
        }
      }
    }
  }
}
